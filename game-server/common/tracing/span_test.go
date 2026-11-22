package tracing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestEndSpan(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus codes.Code
		wantEvents int
	}{
		{"success", nil, codes.Unset, 0},
		{"not found is an answer", fmt.Errorf("get member: %w", commonconstants.ErrNotFound), codes.Unset, 0},
		{"apperr not found is an answer", apperr.ErrNotFound, codes.Unset, 0},
		{"no rows is an answer", sql.ErrNoRows, codes.Unset, 0},
		{"real failure", errors.New("connection refused"), codes.Error, 1},
		{"duplicate is a failure", commonconstants.ErrDuplicateResource, codes.Error, 1},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := tracetest.NewSpanRecorder()
			tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(rec))
			_, span := tp.Tracer("test").Start(context.Background(), "op")

			EndSpan(span, tc.err)

			ended := rec.Ended()
			if len(ended) != 1 {
				t.Fatalf("ended spans = %d, want 1", len(ended))
			}
			if got := ended[0].Status().Code; got != tc.wantStatus {
				t.Errorf("status = %v, want %v", got, tc.wantStatus)
			}
			if got := len(ended[0].Events()); got != tc.wantEvents {
				t.Errorf("events = %d, want %d", got, tc.wantEvents)
			}
		})
	}
}
