package activity

import (
	"context"
	"fmt"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
)

// ExceptionActivities are the two activities escalate-and-park runs around a
// step (FS-NXP1W Req 10): raise when the step parks, resolve when it finally
// succeeds. Kept apart from Activities because they serve every step rather
// than being one.
type ExceptionActivities struct {
	raise   RaiseSettlementException
	resolve ResolveSettlementException
}

type RaiseSettlementException interface {
	Handle(ctx context.Context, cmd usecase.RaiseSettlementExceptionCommand) (uuid.UUID, error)
}

type ResolveSettlementException interface {
	Handle(ctx context.Context, cmd usecase.ResolveSettlementExceptionCommand) error
}

func NewExceptionActivities(raise RaiseSettlementException, resolve ResolveSettlementException) *ExceptionActivities {
	return &ExceptionActivities{
		raise:   raise,
		resolve: resolve,
	}
}

func (a *ExceptionActivities) Register(r activityRegistry) {
	r.RegisterActivityWithOptions(a.RaiseSettlementException, activity.RegisterOptions{Name: marketplaceactivity.RaiseSettlementExceptionActivityName})
	r.RegisterActivityWithOptions(a.ResolveSettlementException, activity.RegisterOptions{Name: marketplaceactivity.ResolveSettlementExceptionActivityName})
}

// RaiseSettlementException records why a settlement parked and publishes
// settlement.failed. It has no non-retryable set: it runs under UncappedOptions
// (§Req 36) because it is how every other step reports exhaustion, so it has
// nothing to escalate to and must keep trying until it lands.
func (a *ExceptionActivities) RaiseSettlementException(ctx context.Context, in marketplaceactivity.RaiseSettlementExceptionInput) (marketplaceactivity.RaiseSettlementExceptionOutput, error) {
	id, err := a.raise.Handle(ctx, usecase.RaiseSettlementExceptionCommand{
		ListingID:  in.ListingID,
		WorkflowID: in.WorkflowID,
		Step:       in.Step,
		Reason:     in.Reason,
	})
	if err != nil {
		return marketplaceactivity.RaiseSettlementExceptionOutput{}, fmt.Errorf("raise settlement exception activity workflow %s step %s: %w", in.WorkflowID, in.Step, err)
	}

	return marketplaceactivity.RaiseSettlementExceptionOutput{ExceptionID: id}, nil
}

// ResolveSettlementException closes the exception once its step has succeeded.
func (a *ExceptionActivities) ResolveSettlementException(ctx context.Context, in marketplaceactivity.ResolveSettlementExceptionInput) error {
	err := a.resolve.Handle(ctx, usecase.ResolveSettlementExceptionCommand{ExceptionID: in.ExceptionID})
	if err != nil {
		return classifyResolveSettlementExceptionErr(in.ExceptionID, err)
	}

	return nil
}

// resolveSettlementExceptionImpossible is the type the workflow matches on. The
// step it closes has already succeeded, so the workflow should log it and carry
// on rather than park the settlement over bookkeeping.
const resolveSettlementExceptionImpossible = "ResolveSettlementExceptionImpossible"

var resolveSettlementExceptionNonRetryable = []error{
	// the ID came from RaiseSettlementException, so a missing row cannot appear
	// by waiting
	commonerr.ErrNotFound,
}

func classifyResolveSettlementExceptionErr(exceptionID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("resolve settlement exception activity exception id %v: %w", exceptionID, err)

	if isAnyOf(err, resolveSettlementExceptionNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			wrapped.Error(),                      // message
			resolveSettlementExceptionImpossible, // type, the workflow matches on this
			err,                                  // cause
		)
	}

	return wrapped // plain error, Temporal retries
}
