package httpmetrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	commontracing "github.com/darkphotonKN/barrowspire-server/common/tracing"
)

var (
	requests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "HTTP requests by method, matched route and status.",
	}, []string{"method", "route", "status"})
	duration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request latency by method and matched route.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "route"})
)

// Middleware records RED metrics per route. It labels by the matched route
// template (/api/items/:id), never the raw path, so ids cannot blow up the
// series count. Requests that match no route share one "unmatched" label.
// Latency observations carry the request's trace_id as an exemplar, so a slow
// bucket on the dashboard links to a trace that shows why.
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		method := c.Request.Method

		requests.WithLabelValues(method, route, strconv.Itoa(c.Writer.Status())).Inc()
		observe(duration.WithLabelValues(method, route), time.Since(start).Seconds(), commontracing.Exemplar(c.Request.Context()))
	}
}

// observe records v with exemplar when there is one. Histograms always
// implement ExemplarObserver; the plain Observe is only for a nil exemplar.
func observe(o prometheus.Observer, v float64, exemplar prometheus.Labels) {
	if eo, ok := o.(prometheus.ExemplarObserver); ok && exemplar != nil {
		eo.ObserveWithExemplar(v, exemplar)
		return
	}
	o.Observe(v)
}
