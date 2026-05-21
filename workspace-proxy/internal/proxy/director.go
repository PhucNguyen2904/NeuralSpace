package proxy

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func backendURL(addr string) (*url.URL, error) {
	u, err := url.Parse(fmt.Sprintf("http://%s", addr))
	if err != nil {
		return nil, fmt.Errorf("parse backend url: %w", err)
	}
	return u, nil
}

func stripWorkspacePrefix(path, workspaceID string) string {
	wsPrefix := "/ws/" + workspaceID
	labPrefix := "/lab/" + workspaceID

	switch {
	case strings.HasPrefix(path, wsPrefix):
		path = strings.TrimPrefix(path, wsPrefix)
	case strings.HasPrefix(path, labPrefix):
		path = strings.TrimPrefix(path, labPrefix)
	}
	if path == "" {
		return "/"
	}
	if !strings.HasPrefix(path, "/") {
		return "/" + path
	}
	return path
}

func addForwardHeaders(r *http.Request, workspaceID string) {
	r.Header.Set("X-Workspace-ID", workspaceID)
	if ip := clientIP(r); ip != "" {
		prior := r.Header.Get("X-Forwarded-For")
		if prior == "" {
			r.Header.Set("X-Forwarded-For", ip)
		} else {
			r.Header.Set("X-Forwarded-For", prior+", "+ip)
		}
	}
}
