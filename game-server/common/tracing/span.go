package tracing

import (
	"database/sql"
	"errors"

	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// EndSpan ends span, marking it failed when err is a real failure. The
// generated repository decorators (gowrap/repository.tmpl) call it on every
// method's way out.
//
// A miss is an answer, not a failure: login looks up an unknown email, a
// lookup finds no row. Recording those as errors would paint ordinary traces
// red, so they end the span with its status left unset.
func EndSpan(span trace.Span, err error) {
	if err != nil && !isExpected(err) {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	span.End()
}

func isExpected(err error) bool {
	return errors.Is(err, commonconstants.ErrNotFound) ||
		errors.Is(err, apperr.ErrNotFound) ||
		errors.Is(err, sql.ErrNoRows)
}
