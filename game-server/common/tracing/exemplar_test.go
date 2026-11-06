package tracing

import (
	"context"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"go.opentelemetry.io/otel/trace"
)

func TestExemplar(t *testing.T) {
	traceID := trace.TraceID{0xab, 0xcd}
	withSpan := func(flags trace.TraceFlags) context.Context {
		return trace.ContextWithSpanContext(context.Background(), trace.NewSpanContext(trace.SpanContextConfig{
			TraceID: traceID, SpanID: trace.SpanID{1}, TraceFlags: flags,
		}))
	}

	tests := []struct {
		name string
		ctx  context.Context
		want prometheus.Labels
	}{
		{name: "sampled span carries its trace id", ctx: withSpan(trace.FlagsSampled), want: prometheus.Labels{"trace_id": traceID.String()}},
		{name: "unsampled span has no exemplar", ctx: withSpan(0), want: nil},
		{name: "no span has no exemplar", ctx: context.Background(), want: nil},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, Exemplar(tc.ctx))
		})
	}
}
