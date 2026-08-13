package interceptor_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/interceptor"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// call runs the interceptor around a handler that returns err.
func call(err error) error {
	intercept := interceptor.Status(quietLogger())
	_, got := intercept(
		context.Background(),
		nil,
		&grpc.UnaryServerInfo{FullMethod: "/test.Service/Method"},
		func(ctx context.Context, req any) (any, error) { return nil, err },
	)
	return got
}

// A service that returns a bare Go error sends codes.Unknown over the wire, and
// the gateway's seam correctly maps anything unrecognised to 500. That is how a
// wrong password became an INTERNAL_ERROR: the information needed to answer 401
// existed, and was thrown away at this boundary.
func TestStatus_MapsSentinelsToCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want codes.Code
	}{
		{"unauthorized", commonconstants.ErrUnauthorized, codes.Unauthenticated},
		{"not found", commonconstants.ErrNotFound, codes.NotFound},
		{"duplicate", commonconstants.ErrDuplicateResource, codes.AlreadyExists},
		{"invalid input", commonconstants.ErrInvalidInput, codes.InvalidArgument},
		{"constraint violation", commonconstants.ErrConstraintViolation, codes.InvalidArgument},
		{"unparseable uuid", commonconstants.ErrUUIDCouldNotBeParsed, codes.InvalidArgument},
		{"forbidden", commonconstants.ErrForbidden, codes.PermissionDenied},
		{"transient", commonconstants.ErrTransient, codes.Unavailable},
		{"unrecognised", errors.New("something else entirely"), codes.Internal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, status.Code(call(tt.err)))
		})
	}
}

// Sentinels arrive wrapped in context by WrapDBErr and by the service layer, so
// matching must use errors.Is rather than equality.
func TestStatus_MatchesWrappedSentinels(t *testing.T) {
	wrapped := fmt.Errorf("could not find member with provided email: %w", commonconstants.ErrNotFound)

	assert.Equal(t, codes.NotFound, status.Code(call(wrapped)))
}

// The wrapped message names a repo, an operation, sometimes a column. The
// gateway refuses to publish downstream prose anyway, but this boundary must not
// hand it over in the first place.
func TestStatus_NeverPutsTheRawErrorOnTheWire(t *testing.T) {
	raw := "could not find member with provided email: sql: no rows in result set"
	err := call(fmt.Errorf("%s: %w", raw, commonconstants.ErrNotFound))

	assert.NotContains(t, status.Convert(err).Message(), "sql:")
	assert.NotContains(t, status.Convert(err).Message(), "no rows")
}

// A handler that already chose a status knows better than this mapper does.
func TestStatus_LeavesAnExplicitStatusAlone(t *testing.T) {
	err := call(status.Error(codes.ResourceExhausted, "rate limited"))

	assert.Equal(t, codes.ResourceExhausted, status.Code(err))
	assert.Equal(t, "rate limited", status.Convert(err).Message())
}

func TestStatus_PassesSuccessThrough(t *testing.T) {
	assert.NoError(t, call(nil))
}
