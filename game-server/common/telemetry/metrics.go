package telemetry

import (
	"log/slog"
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// ServeMetrics serves the default Prometheus registry on its own port, off the
// public API router, so an Ingress in front of the API never exposes it. A
// failed listen is logged, not fatal: losing metrics must not take down the
// service.
func ServeMetrics(port string) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	go func() {
		slog.Info("metrics server started", "port", port)
		if err := http.ListenAndServe(":"+port, mux); err != nil {
			slog.Error("metrics server stopped", "port", port, "err", err)
		}
	}()
}
