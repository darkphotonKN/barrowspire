package telemetry

import (
	"log/slog"
	"net/http"
	"net/http/pprof"
)

// ServePprof serves /debug/pprof/ on addr (e.g. 127.0.0.1:6060) on its own mux.
// An empty addr leaves it off, so production stays closed by default.
func ServePprof(addr string) {
	if addr == "" {
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)

	go func() {
		slog.Info("pprof server started", "addr", addr)
		if err := http.ListenAndServe(addr, mux); err != nil {
			slog.Error("pprof server stopped", "addr", addr, "err", err)
		}
	}()
}
