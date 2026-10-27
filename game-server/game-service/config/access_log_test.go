package config

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// The client connects with its bearer token in the query string, because a
// browser WebSocket cannot set headers. The access log must still never carry
// it: anyone who can read stdout could otherwise act as that member.
func TestAccessLogger_NeverWritesTheBearerToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name      string
		target    string
		wantInLog []string
	}{
		{"game websocket connect", "/game/ws?token=secret&name=Wren", []string{"/game/ws", "name=Wren"}},
		{"token as the only param", "/game/ws?token=secret", []string{"/game/ws"}},
		{"token on any other path", "/api/items?token=secret", []string{"/api/items"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logged bytes.Buffer
			router := gin.New()
			router.Use(AccessLogger(&logged))
			router.GET("/game/ws", func(c *gin.Context) { c.Status(http.StatusOK) })
			router.GET("/api/items", func(c *gin.Context) { c.Status(http.StatusOK) })

			router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, tt.target, nil))

			assert.NotContains(t, logged.String(), "secret")
			for _, want := range tt.wantInLog {
				assert.Contains(t, logged.String(), want, "the request is still logged")
			}
		})
	}
}

// Only the token's value is replaced: every other parameter keeps its place
// and its encoding, so the logged target is the one the client sent.
func TestAccessLogger_RedactsOnlyTheTokenValue(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name   string
		target string
		want   string
	}{
		{"order and encoding kept", "/game/ws?zone=b%2Fc&token=secret&name=Wren", `"/game/ws?zone=b%2Fc&token=REDACTED&name=Wren"`},
		{"an escaped token name", "/game/ws?tok%65n=secret&a=1", `"/game/ws?tok%65n=REDACTED&a=1"`},
		{"every token", "/game/ws?token=secret&token=secret", `"/game/ws?token=REDACTED&token=REDACTED"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logged bytes.Buffer
			router := gin.New()
			router.Use(AccessLogger(&logged))
			router.GET("/game/ws", func(c *gin.Context) { c.Status(http.StatusOK) })

			router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, tt.target, nil))

			assert.NotContains(t, logged.String(), "secret")
			assert.Contains(t, logged.String(), tt.want)
		})
	}
}

// A path with no query is logged as it is.
func TestAccessLogger_LogsAPlainPathUnchanged(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var logged bytes.Buffer
	router := gin.New()
	router.Use(AccessLogger(&logged))
	router.GET("/api/items", func(c *gin.Context) { c.Status(http.StatusOK) })

	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/items", nil))

	assert.Contains(t, logged.String(), `"/api/items"`)
	assert.Contains(t, logged.String(), "200")
}

// The readiness probe hits the health check every few seconds, so it is not
// logged; a failing probe still shows in kubectl describe pod.
func TestAccessLogger_SkipsTheHealthCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name   string
		status int
	}{
		{"healthy", http.StatusOK},
		{"unhealthy", http.StatusServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logged bytes.Buffer
			router := gin.New()
			router.Use(AccessLogger(&logged))
			router.GET("/api/health", func(c *gin.Context) { c.Status(tt.status) })

			router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/health", nil))

			assert.Empty(t, logged.String())
		})
	}
}
