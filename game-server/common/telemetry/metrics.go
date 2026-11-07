package telemetry

import (
	"log/slog"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

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
