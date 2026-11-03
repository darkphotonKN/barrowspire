package commonhelpers

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"go.opentelemetry.io/otel/trace"
)

func TestSetupLogger_DebugOnlyInDevelopment(t *testing.T) {
	prev := slog.Default()
	t.Cleanup(func() { slog.SetDefault(prev) })

	tests := []struct {
		environment string
		wantDebug   bool
	}{
		{"development", true},
		{"DEVELOPMENT", true},
		{"production", false},
		{"PRODUCTION", false},
		{"", false},
		{"prod", false},
	}

	for _, tt := range tests {
		t.Run(tt.environment, func(t *testing.T) {
			SetupLogger(tt.environment)

			assert.Equal(t, tt.wantDebug, slog.Default().Enabled(context.Background(), slog.LevelDebug))
			assert.True(t, slog.Default().Enabled(context.Background(), slog.LevelInfo))
		})
	}
}

func TestTraceHandler_AddsTraceIDsOnlyWhenContextHasSpan(t *testing.T) {
	sc := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    trace.TraceID{1},
		SpanID:     trace.SpanID{2},
		TraceFlags: trace.FlagsSampled,
	})

	tests := []struct {
		name    string
		ctx     context.Context
		wantIDs bool
	}{
		{"context with a span", trace.ContextWithSpanContext(context.Background(), sc), true},
		{"context without a span", context.Background(), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := slog.New(traceHandler{slog.NewTextHandler(&buf, nil)})
			logger.InfoContext(tt.ctx, "hello")

			got := strings.Contains(buf.String(), "trace_id="+sc.TraceID().String()) &&
				strings.Contains(buf.String(), "span_id="+sc.SpanID().String())
			if got != tt.wantIDs {
				t.Fatalf("trace ids present = %v, want %v; line: %s", got, tt.wantIDs, buf.String())
			}
		})
	}
}
