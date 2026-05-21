package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr           string
	RedisAddr          string
	RedisPassword      string
	RedisDB            int
	JWTSecret          string
	CookieSecure       bool
	ShutdownTimeout    time.Duration
	DialTimeout        time.Duration
	ResponseHdrTimeout time.Duration
}

func Load() (*Config, error) {
	redisDB, err := getenvInt("REDIS_DB", 0)
	if err != nil {
		return nil, fmt.Errorf("invalid REDIS_DB: %w", err)
	}
	cfg := &Config{
		HTTPAddr:           getenv("HTTP_ADDR", ":8080"),
		RedisAddr:          getenv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:      os.Getenv("REDIS_PASSWORD"),
		RedisDB:            redisDB,
		JWTSecret:          getenv("JWT_SECRET", ""),
		CookieSecure:       getenvBool("COOKIE_SECURE", false),
		ShutdownTimeout:    30 * time.Second,
		DialTimeout:        5 * time.Second,
		ResponseHdrTimeout: 30 * time.Second,
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func getenvInt(key string, fallback int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	return strconv.Atoi(v)
}

func getenvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
