package proxy

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"workspace-proxy/internal/config"
	"workspace-proxy/internal/store"
)

type ProxyHandler struct {
	cfg      *config.Config
	store    *store.WorkspaceStore
	log      *slog.Logger
	transport *http.Transport
	upgrader websocket.Upgrader

	requestsTotal     *prometheus.CounterVec
	activeConnections prometheus.Gauge
	requestDuration   *prometheus.HistogramVec
	wsActive          prometheus.Gauge

	wg sync.WaitGroup
}

func NewProxyHandler(cfg *config.Config, st *store.WorkspaceStore, log *slog.Logger, transport *http.Transport) *ProxyHandler {
	return &ProxyHandler{
		cfg:       cfg,
		store:     st,
		log:       log,
		transport: transport,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  32 * 1024,
			WriteBufferSize: 32 * 1024,
			CheckOrigin:     func(_ *http.Request) bool { return true },
		},
		requestsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "proxy_requests_total",
			Help: "Total requests processed by proxy.",
		}, []string{"workspace_id", "status_code"}),
		activeConnections: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "proxy_active_connections",
			Help: "Current active proxied HTTP/WS requests.",
		}),
		requestDuration: promauto.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "proxy_request_duration_seconds",
			Help:    "Request duration.",
			Buckets: prometheus.DefBuckets,
		}, []string{"workspace_id"}),
		wsActive: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "proxy_ws_connections_active",
			Help: "Current active websocket proxy sessions.",
		}),
	}
}

func (h *ProxyHandler) RegisterRoutes(r *mux.Router) {
	r.PathPrefix("/ws/{workspace_id}").HandlerFunc(h.HandleWSOrHTTP)
	r.PathPrefix("/lab/{workspace_id}").HandlerFunc(h.HandleWSOrHTTP)
}

func (h *ProxyHandler) WaitForDrain(ctx context.Context) error {
	done := make(chan struct{})
	go func() {
		h.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *ProxyHandler) HandleWSOrHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	vars := mux.Vars(r)
	workspaceID := vars["workspace_id"]
	if workspaceID == "" {
		http.Error(w, "missing workspace id", http.StatusBadRequest)
		return
	}

	h.activeConnections.Inc()
	h.wg.Add(1)
	defer func() {
		h.activeConnections.Dec()
		h.requestDuration.WithLabelValues(workspaceID).Observe(time.Since(start).Seconds())
		h.wg.Done()
	}()

	if websocket.IsWebSocketUpgrade(r) {
		if err := h.authorizeWebsocket(w, r, workspaceID); err != nil {
			h.observe(workspaceID, http.StatusUnauthorized)
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		if err := h.proxyWebSocket(w, r, workspaceID); err != nil {
			h.observe(workspaceID, http.StatusBadGateway)
			h.log.Error("ws proxy failed", "workspace_id", workspaceID, "error", err)
			return
		}
		h.observe(workspaceID, http.StatusSwitchingProtocols)
		return
	}

	if err := h.authorizeHTTP(r, workspaceID); err != nil {
		h.observe(workspaceID, http.StatusUnauthorized)
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	if err := h.proxyHTTP(w, r, workspaceID); err != nil {
		h.observe(workspaceID, http.StatusBadGateway)
		http.Error(w, "proxy failed", http.StatusBadGateway)
		return
	}
}

func (h *ProxyHandler) proxyHTTP(w http.ResponseWriter, r *http.Request, workspaceID string) error {
	targetAddr, err := h.store.GetPodAddress(r.Context(), workspaceID)
	if err != nil {
		return err
	}
	if targetAddr == "" {
		http.Error(w, "workspace not running", http.StatusNotFound)
		h.observe(workspaceID, http.StatusNotFound)
		return nil
	}

	target, err := backendURL(targetAddr)
	if err != nil {
		return err
	}
	origQuery := r.URL.RawQuery
	proxy := &httputil.ReverseProxy{
		Transport:     h.transport,
		FlushInterval: -1,
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.Host = target.Host
			req.URL.Path = stripWorkspacePrefix(req.URL.Path, workspaceID)
			req.URL.RawQuery = origQuery
			addForwardHeaders(req, workspaceID)
		},
		ErrorHandler: func(rw http.ResponseWriter, _ *http.Request, e error) {
			h.log.Error("reverse proxy error", "workspace_id", workspaceID, "error", e)
			http.Error(rw, "upstream unavailable", http.StatusBadGateway)
		},
	}

	rec := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
	proxy.ServeHTTP(rec, r)
	h.observe(workspaceID, rec.statusCode)
	return nil
}

func (h *ProxyHandler) proxyWebSocket(w http.ResponseWriter, r *http.Request, workspaceID string) error {
	targetAddr, err := h.store.GetPodAddress(r.Context(), workspaceID)
	if err != nil {
		return err
	}
	if targetAddr == "" {
		return errors.New("workspace not running")
	}

	clientConn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return fmt.Errorf("upgrade client ws: %w", err)
	}
	defer clientConn.Close()

	wsTargetURL := &url.URL{
		Scheme:   "ws",
		Host:     targetAddr,
		Path:     stripWorkspacePrefix(r.URL.Path, workspaceID),
		RawQuery: r.URL.RawQuery,
	}

	dialer := websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 10 * time.Second,
		NetDialContext: (&net.Dialer{
			Timeout: h.cfg.DialTimeout,
		}).DialContext,
	}

	header := http.Header{}
	header.Set("X-Workspace-ID", workspaceID)
	if ip := clientIP(r); ip != "" {
		header.Set("X-Forwarded-For", ip)
	}
	backendConn, resp, err := dialer.Dial(wsTargetURL.String(), header)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("dial backend ws failed: status=%d err=%w", resp.StatusCode, err)
		}
		return fmt.Errorf("dial backend ws failed: %w", err)
	}
	defer backendConn.Close()

	h.wsActive.Inc()
	defer h.wsActive.Dec()

	if err := h.pipeWebsocket(clientConn, backendConn); err != nil {
		return err
	}
	return nil
}

func (h *ProxyHandler) pipeWebsocket(clientConn, backendConn *websocket.Conn) error {
	const (
		pingInterval = 30 * time.Second
		pongWait     = 60 * time.Second
	)
	_ = clientConn.SetReadDeadline(time.Now().Add(pongWait))
	_ = backendConn.SetReadDeadline(time.Now().Add(pongWait))
	clientConn.SetPongHandler(func(string) error { return clientConn.SetReadDeadline(time.Now().Add(pongWait)) })
	backendConn.SetPongHandler(func(string) error { return backendConn.SetReadDeadline(time.Now().Add(pongWait)) })

	errCh := make(chan error, 2)

	forward := func(dst, src *websocket.Conn) {
		for {
			msgType, msg, err := src.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := dst.WriteMessage(msgType, msg); err != nil {
				errCh <- err
				return
			}
		}
	}
	go forward(backendConn, clientConn)
	go forward(clientConn, backendConn)

	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case err := <-errCh:
			return err
		case <-ticker.C:
			deadline := time.Now().Add(10 * time.Second)
			if err := clientConn.WriteControl(websocket.PingMessage, []byte("ping"), deadline); err != nil {
				return err
			}
			if err := backendConn.WriteControl(websocket.PingMessage, []byte("ping"), deadline); err != nil {
				return err
			}
		}
	}
}

func (h *ProxyHandler) authorizeWebsocket(w http.ResponseWriter, r *http.Request, workspaceID string) error {
	token := r.URL.Query().Get("token")
	if token != "" {
		ok, err := h.store.ValidateAndConsumeWSToken(r.Context(), workspaceID, token)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("invalid token")
		}

		cookieValue, err := signWorkspaceCookie(h.cfg.JWTSecret, workspaceID, 7*24*time.Hour)
		if err != nil {
			return fmt.Errorf("sign cookie: %w", err)
		}
		http.SetCookie(w, &http.Cookie{
			Name:     workspaceCookieName(workspaceID),
			Value:    cookieValue,
			Path:     "/",
			HttpOnly: true,
			Secure:   h.cfg.CookieSecure,
			SameSite: http.SameSiteLaxMode,
			Expires:  time.Now().Add(7 * 24 * time.Hour),
		})
		return nil
	}
	return h.authorizeHTTP(r, workspaceID)
}

func (h *ProxyHandler) authorizeHTTP(r *http.Request, workspaceID string) error {
	c, err := r.Cookie(workspaceCookieName(workspaceID))
	if err != nil {
		return errors.New("missing session cookie")
	}
	ok, err := verifyWorkspaceCookie(h.cfg.JWTSecret, workspaceID, c.Value)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("invalid session cookie")
	}
	return nil
}

func (h *ProxyHandler) observe(workspaceID string, statusCode int) {
	h.requestsTotal.WithLabelValues(workspaceID, fmt.Sprintf("%d", statusCode)).Inc()
}

type statusRecorder struct {
	http.ResponseWriter
	statusCode int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.statusCode = code
	s.ResponseWriter.WriteHeader(code)
}

func workspaceCookieName(workspaceID string) string {
	return "ws_session_" + workspaceID
}

func signWorkspaceCookie(secret, workspaceID string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": workspaceID,
		"iat": now.Unix(),
		"exp": now.Add(ttl).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

func verifyWorkspaceCookie(secret, workspaceID, rawToken string) (bool, error) {
	token, err := jwt.Parse(rawToken, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return false, err
	}
	if !token.Valid {
		return false, nil
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return false, errors.New("invalid claims")
	}
	sub, _ := claims["sub"].(string)
	return strings.TrimSpace(sub) == workspaceID, nil
}
