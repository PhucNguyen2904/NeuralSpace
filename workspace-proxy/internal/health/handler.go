package health

import (
	"encoding/json"
	"net/http"
	"time"
)

type Handler struct {
	startedAt time.Time
}

func NewHandler() *Handler {
	return &Handler{startedAt: time.Now()}
}

func (h *Handler) Liveness(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
	})
}

func (h *Handler) Readiness(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "ready",
		"uptime_sec":  int(time.Since(h.startedAt).Seconds()),
		"started_at":  h.startedAt.UTC().Format(time.RFC3339),
	})
}

func writeJSON(w http.ResponseWriter, code int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}
