package activity

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubRaiseException struct {
	id     uuid.UUID
	err    error
	calls  int
	gotCmd usecase.RaiseSettlementExceptionCommand
}

func (s *stubRaiseException) Handle(ctx context.Context, cmd usecase.RaiseSettlementExceptionCommand) (uuid.UUID, error) {
	s.calls++
	s.gotCmd = cmd
	return s.id, s.err
}

type stubResolveException struct {
	err    error
	calls  int
	gotCmd usecase.ResolveSettlementExceptionCommand
}

func (s *stubResolveException) Handle(ctx context.Context, cmd usecase.ResolveSettlementExceptionCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

func newExceptionEnv(raise RaiseSettlementException, resolve ResolveSettlementException) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewExceptionActivities(raise, resolve).Register(env)
	return env
}

func TestRaiseSettlementExceptionActivity_RecordsTheStepAndReturnsTheID(t *testing.T) {
	uc := &stubRaiseException{id: uuid.New()}
	in := marketplaceactivity.RaiseSettlementExceptionInput{
		ListingID:  uuid.New(),
		WorkflowID: "settlement-" + uuid.NewString(),
		Step:       "TransferItem",
		Reason:     "items-service unavailable for 30m",
	}

	val, err := newExceptionEnv(uc, nil).ExecuteActivity(marketplaceactivity.RaiseSettlementExceptionActivityName, in)
	require.NoError(t, err)

	var out marketplaceactivity.RaiseSettlementExceptionOutput
	require.NoError(t, val.Get(&out))

	require.Equal(t, 1, uc.calls)
	assert.Equal(t, usecase.RaiseSettlementExceptionCommand{
		ListingID:  in.ListingID,
		WorkflowID: in.WorkflowID,
		Step:       in.Step,
		Reason:     in.Reason,
	}, uc.gotCmd)
	assert.Equal(t, uc.id, out.ExceptionID)
}

// Raise reports every other step's exhaustion and has nothing to escalate to
// (§Req 36), so no failure of its own may stop its retries.
func TestRaiseSettlementExceptionActivity_EveryFailureIsRetryable(t *testing.T) {
	for _, cause := range []error{
		errors.New("dial tcp: connection refused"),
		commonerr.ErrNotFound,
		commonerr.ErrAlreadyExists,
	} {
		t.Run(cause.Error(), func(t *testing.T) {
			uc := &stubRaiseException{err: cause}

			_, err := newExceptionEnv(uc, nil).ExecuteActivity(marketplaceactivity.RaiseSettlementExceptionActivityName,
				marketplaceactivity.RaiseSettlementExceptionInput{ListingID: uuid.New(), WorkflowID: "w", Step: "s", Reason: "r"})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.False(t, appErr.NonRetryable())
		})
	}
}

func TestResolveSettlementExceptionActivity_ResolvesTheException(t *testing.T) {
	uc := &stubResolveException{}
	in := marketplaceactivity.ResolveSettlementExceptionInput{ExceptionID: uuid.New()}

	_, err := newExceptionEnv(nil, uc).ExecuteActivity(marketplaceactivity.ResolveSettlementExceptionActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.ExceptionID, uc.gotCmd.ExceptionID)
}

func TestResolveSettlementExceptionActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"the exception does not exist", commonerr.ErrNotFound, true},
		{"marketplace database is down", errors.New("dial tcp: connection refused"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubResolveException{err: fmt.Errorf("resolve settlement exception usecase handle: %w", tt.err)}

			_, err := newExceptionEnv(nil, uc).ExecuteActivity(marketplaceactivity.ResolveSettlementExceptionActivityName,
				marketplaceactivity.ResolveSettlementExceptionInput{ExceptionID: uuid.New()})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
			if tt.wantImpossible {
				assert.Equal(t, resolveSettlementExceptionImpossible, appErr.Type())
			}
		})
	}
}
