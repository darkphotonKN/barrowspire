package telemetry

import (
	"log/slog"
	"net/http"
	"regexp"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// The default registry ships a Go collector registered in client_golang's own
// init. It is swapped here for one that also exports the scheduler latency
// histogram (go_sched_latencies_seconds): how long runnable goroutines waited
// for a thread. WithGoCollectorRuntimeMetrics appends to the default rules, so
// every go_* series the default collector exports is still there.
//
// init, not a call in ServeMetrics, because items and stats serve the default
// registry through promhttp.Handler() and never call ServeMetrics.
func init() {
	prometheus.Unregister(collectors.NewGoCollector())
	prometheus.MustRegister(collectors.NewGoCollector(
		collectors.WithGoCollectorRuntimeMetrics(collectors.GoRuntimeMetricsRule{
			Matcher: regexp.MustCompile(`^/sched/latencies:seconds$`),
		}),
	))
}

// LatencyBuckets are the request-latency histogram bounds every service shares,
// gRPC and HTTP alike, so one service's p99 reads against another's. The
// default buckets jump from 250ms to 500ms to 1s; these keep resolution through
// that band, where a slow route actually sits.
var LatencyBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 2, 5}

// MetricsHandler serves the default registry, in OpenMetrics when the scraper
// asks for it. Exemplars (trace_id on histogram buckets) only exist in the
// OpenMetrics format; the classic text format drops them.
func MetricsHandler() http.Handler {
	return promhttp.InstrumentMetricHandler(prometheus.DefaultRegisterer,
		promhttp.HandlerFor(prometheus.DefaultGatherer, promhttp.HandlerOpts{EnableOpenMetrics: true}))
}

// ServeMetrics serves the default Prometheus registry on its own port, off the
// public API router, so an Ingress in front of the API never exposes it. A
// failed listen is logged, not fatal: losing metrics must not take down the
// service.
func ServeMetrics(port string) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", MetricsHandler())

	go func() {
		slog.Info("metrics server started", "port", port)
		if err := http.ListenAndServe(":"+port, mux); err != nil {
			slog.Error("metrics server stopped", "port", port, "err", err)
		}
	}()
}
