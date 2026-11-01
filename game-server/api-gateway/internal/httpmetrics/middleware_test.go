package httpmetrics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestMiddleware_LabelsByRouteTemplate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Middleware())
	router.GET("/api/items/:id", func(c *gin.Context) { c.Status(http.StatusTeapot) })

	tests := []struct {
		name   string
		path   string
		route  string
		status string
	}{
		{"matched route uses the template, not the id", "/api/items/abc-123", "/api/items/:id", "418"},
		{"no route match shares one label", "/nope/xyz", "unmatched", "404"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := testutil.ToFloat64(requests.WithLabelValues("GET", tt.route, tt.status))
			router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, tt.path, nil))
			if got := testutil.ToFloat64(requests.WithLabelValues("GET", tt.route, tt.status)) - before; got != 1 {
				t.Fatalf("http_requests_total{route=%q,status=%q} grew by %v, want 1", tt.route, tt.status, got)
			}
		})
	}
}
