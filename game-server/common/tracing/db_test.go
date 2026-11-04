package tracing

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"go.opentelemetry.io/otel/trace"
)

func TestWithinTrace(t *testing.T) {
	inTrace := trace.ContextWithSpanContext(context.Background(), trace.NewSpanContext(trace.SpanContextConfig{
		TraceID: trace.TraceID{1},
		SpanID:  trace.SpanID{1},
	}))

	tests := []struct {
		name string
		ctx  context.Context
		want bool
	}{
		{name: "query inside a request trace is kept", ctx: inTrace, want: true},
		{name: "query on a bare context is dropped", ctx: context.Background(), want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, withinTrace(tc.ctx, "", "SELECT 1", nil))
		})
	}
}
