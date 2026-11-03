package commonhelpers

import (
	"context"
	"log/slog"
	"os"
	"strings"

	"go.opentelemetry.io/otel/trace"
)

func SetupLogger(environment string) {
	// debug is opt-in, so a typo or missing ENVIRONMENT never turns it on in prod
	level := slog.LevelInfo
	if strings.EqualFold(environment, "development") {
		level = slog.LevelDebug
	}

	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	})

	slog.SetDefault(slog.New(traceHandler{handler}))

	slog.Info("intialized logger.", "default level", level, "environment", environment)
}

// traceHandler adds trace_id and span_id to records logged with a context that
// carries a span (slog.InfoContext and friends), so a log line links to its
// trace in Tempo. Plain slog.Info has no context and is left as is.
type traceHandler struct {
	slog.Handler
}

func (h traceHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
		)
	}
	return h.Handler.Handle(ctx, r)
}

func (h traceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return traceHandler{h.Handler.WithAttrs(attrs)}
}

func (h traceHandler) WithGroup(name string) slog.Handler {
	return traceHandler{h.Handler.WithGroup(name)}
}
