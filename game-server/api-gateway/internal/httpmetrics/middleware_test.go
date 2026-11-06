package httpmetrics

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"go.opentelemetry.io/otel/trace"
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

func TestMiddleware_LatencyCarriesTraceExemplar(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Middleware())
	router.GET("/api/exemplar", func(c *gin.Context) { c.Status(http.StatusOK) })

	traceID := trace.TraceID{0xde, 0xad}
	ctx := trace.ContextWithSpanContext(context.Background(), trace.NewSpanContext(trace.SpanContextConfig{
		TraceID: traceID, SpanID: trace.SpanID{1}, TraceFlags: trace.FlagsSampled,
	}))
	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/exemplar", nil).WithContext(ctx))

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range families {
		if f.GetName() != "http_request_duration_seconds" {
			continue
		}
		for _, m := range f.GetMetric() {
			for _, b := range m.GetHistogram().GetBucket() {
				for _, l := range b.GetExemplar().GetLabel() {
					if l.GetName() == "trace_id" && l.GetValue() == traceID.String() {
						return
					}
				}
			}
		}
	}
	t.Fatalf("no http_request_duration_seconds bucket carries exemplar trace_id=%s", traceID)
}
