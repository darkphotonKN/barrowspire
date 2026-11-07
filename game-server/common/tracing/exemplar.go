package tracing

import (
	"context"

	"github.com/prometheus/client_golang/prometheus"
	"go.opentelemetry.io/otel/trace"
)

// Exemplar labels a metric observation with the sampled trace it came from, or
// nil when there is none: an exemplar pointing at a trace Tempo never received
// would be a dead link.
func Exemplar(ctx context.Context) prometheus.Labels {
	sc := trace.SpanContextFromContext(ctx)
	if !sc.IsSampled() {
		return nil
	}
	return prometheus.Labels{"trace_id": sc.TraceID().String()}
}
