package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"workspace-proxy/internal/config"
	"workspace-proxy/internal/health"
	"workspace-proxy/internal/proxy"
	"workspace-proxy/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "error", err)
		os.Exit(1)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
		PoolSize: 100,
	})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		logger.Error("redis ping failed", "error", err)
		os.Exit(1)
	}

	wsStore := store.NewWorkspaceStore(rdb)
	transport := buildTransport(cfg)
	proxyHandler := proxy.NewProxyHandler(cfg, wsStore, logger, transport)
	healthHandler := health.NewHandler()

	router := mux.NewRouter()
	router.Use(proxy.RecoverMiddleware(logger))
	router.Use(proxy.RequestIDMiddleware)
	router.Use(proxy.LoggingMiddleware(logger))
	router.Use(proxy.ActivityMiddleware(wsStore, logger))
	router.Handle("/metrics", promhttp.Handler()).Methods(http.MethodGet)
	router.HandleFunc("/health/live", healthHandler.Liveness).Methods(http.MethodGet)
	router.HandleFunc("/health/ready", healthHandler.Readiness).Methods(http.MethodGet)
	proxyHandler.RegisterRoutes(router)

	server := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("proxy service started", "addr", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	logger.Info("shutdown requested")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("http shutdown failed", "error", err)
	}
	if err := proxyHandler.WaitForDrain(shutdownCtx); err != nil {
		logger.Warn("connection drain incomplete", "error", err)
	}
	if err := wsStore.Close(); err != nil {
		logger.Warn("redis close failed", "error", err)
	}
	logger.Info("shutdown completed")
}

func buildTransport(cfg *config.Config) *http.Transport {
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: cfg.DialTimeout, KeepAlive: 30 * time.Second}).DialContext,
		MaxIdleConns:          200,
		MaxIdleConnsPerHost:   100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: cfg.ResponseHdrTimeout,
		ForceAttemptHTTP2:     false,
	}
}
