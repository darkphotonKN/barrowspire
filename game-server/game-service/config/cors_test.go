package config

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestOriginAllowed(t *testing.T) {
	allowed := []string{"http://localhost:3938", "https://barrowspire.example"}

	tests := []struct {
		name        string
		environment string
		origin      string
		want        bool
	}{
		{"listed origin in development", "development", "http://localhost:3938", true},
		{"listed origin in production", "production", "https://barrowspire.example", true},
		{"worktree client port in development", "development", "http://localhost:3951", true},
		{"worktree client port in production", "production", "http://localhost:3951", false},
		{"loopback ipv4 in development", "development", "http://127.0.0.1:3951", true},
		{"loopback ipv6 in development", "development", "http://[::1]:3951", true},
		{"lan address in development", "development", "http://192.168.1.20:3951", false},
		{"remote host in development", "development", "http://evil.example", false},
		{"remote host in production", "production", "http://evil.example", false},
		{"non http scheme in development", "development", "file://localhost", false},
		{"empty origin", "development", "", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := originAllowed(tc.environment, allowed, tc.origin); got != tc.want {
				t.Errorf("originAllowed(%q, %q) = %v, want %v", tc.environment, tc.origin, got, tc.want)
			}
		})
	}
}

// Guards the reported failure end to end: a WebSocket handshake from a dev client on an
// unlisted loopback port must reach the route rather than being aborted with a bodyless 403.
func TestGameCORSWebSocketHandshake(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name        string
		environment string
		origin      string
		wantStatus  int
	}{
		{"listed origin", "development", "http://localhost:3938", http.StatusOK},
		{"unlisted loopback port in development", "development", "http://localhost:3951", http.StatusOK},
		{"unlisted loopback port in production", "production", "http://localhost:3951", http.StatusForbidden},
		{"no origin header", "development", "", http.StatusOK},
		{"foreign origin in development", "development", "http://evil.example", http.StatusForbidden},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.Use(GameCORS(tc.environment, []string{"http://localhost:3938"}))
			router.GET("/game/ws", func(c *gin.Context) { c.Status(http.StatusOK) })

			req := httptest.NewRequest(http.MethodGet, "/game/ws", nil)
			req.Header.Set("Connection", "Upgrade")
			req.Header.Set("Upgrade", "websocket")
			req.Header.Set("Sec-WebSocket-Version", "13")
			req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

func TestAllowedOrigins(t *testing.T) {
	tests := []struct {
		name string
		env  string
		want []string
	}{
		{"unset falls back to the dev client", "", []string{"http://localhost:3938"}},
		{"single origin", "https://barrowspire.example", []string{"https://barrowspire.example"}},
		{"comma separated with whitespace", " http://a.example , http://b.example ", []string{"http://a.example", "http://b.example"}},
		{"empty entries are dropped", "http://a.example,,", []string{"http://a.example"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("GAME_ALLOWED_ORIGINS", tc.env)

			got := AllowedOrigins()
			if len(got) != len(tc.want) {
				t.Fatalf("AllowedOrigins() = %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("AllowedOrigins()[%d] = %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}
