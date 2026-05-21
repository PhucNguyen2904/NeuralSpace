package proxy

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	"workspace-proxy/internal/store"
)

type ctxKey string

const requestIDKey ctxKey = "request_id"

func RequestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := uuid.NewString()
		ctx := context.WithValue(r.Context(), requestIDKey, reqID)
		r = r.WithContext(ctx)
		w.Header().Set("X-Request-ID", reqID)
		next.ServeHTTP(w, r)
	})
}

func LoggingMiddleware(logger *slog.Logger) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			vars := mux.Vars(r)
			wsID := vars["workspace_id"]
			rec := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
			next.ServeHTTP(rec, r)
			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"workspace_id", wsID,
				"status_code", rec.statusCode,
				"latency_ms", time.Since(start).Milliseconds(),
			)
		})
	}
}

func RecoverMiddleware(logger *slog.Logger) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("panic recovered", "panic", rec, "path", r.URL.Path)
					http.Error(w, "internal server error", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

func ActivityMiddleware(st *store.WorkspaceStore, logger *slog.Logger) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)
			wsID := mux.Vars(r)["workspace_id"]
			if wsID == "" {
				return
			}
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				if err := st.RecordActivity(ctx, wsID); err != nil {
					logger.Warn("record activity failed", "workspace_id", wsID, "error", err)
				}
			}()
		})
	}
}

func clientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
