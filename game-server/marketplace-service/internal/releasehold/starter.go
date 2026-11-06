package releasehold

// initiates the release hold workflow

import (
	"context"
	"errors"
	"fmt"
	"time"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
)

// Starter implements usecase.HoldReleaseStarter and usecase.HoldReleaseAwaiter. It is
// the only code that knows the workflow ID format, so every caller that releases the
// same bid's hold dedups against the same run.
type Starter struct {
	client client.Client
}

func NewStarter(c client.Client) *Starter {
	return &Starter{client: c}
}

// WorkflowID is keyed by bid, not listing: a hold belongs to one bid, and a listing
// carries many.
func WorkflowID(bidID uuid.UUID) string {
	return "release-hold-" + bidID.String()
}

func (s *Starter) StartReleaseHold(ctx context.Context, listingID, bidID uuid.UUID) error {
	// Start, never wait: the returned run handle is deliberately ignored. The bidder
	// should not wait on wallet, and the run carries the release from here.
	// ReleaseHoldAndWait is the one exception (ADR-0049).
	_, err := s.start(ctx, listingID, bidID)

	// A running duplicate already returns no error (SDK default); a closed one is
	// rejected by REJECT_DUPLICATE. Both mean "this hold is being or has been released".
	var already *serviceerror.WorkflowExecutionAlreadyStarted
	if errors.As(err, &already) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("start release hold bid id %s: %w", bidID, err)
	}
	return nil
}

// ReleaseHoldAndWait starts the release as StartReleaseHold does, then waits up to
// maxWait for it to finish (ADR-0049). Waiting only watches the run: when maxWait
// runs out the run is not cancelled, it keeps retrying until the gold is back, and
// the caller hears usecase.ErrHoldReleasePending.
func (s *Starter) ReleaseHoldAndWait(ctx context.Context, listingID, bidID uuid.UUID, maxWait time.Duration) error {
	run, err := s.start(ctx, listingID, bidID)

	var already *serviceerror.WorkflowExecutionAlreadyStarted
	switch {
	case errors.As(err, &already):
		// started before, maybe already finished: wait on that run, the latest under
		// the bid's workflow ID
		run = s.client.GetWorkflow(ctx, WorkflowID(bidID), "")
	case err != nil:
		return fmt.Errorf("start release hold bid id %s: %w", bidID, err)
	}

	waitCtx, cancel := context.WithTimeout(ctx, maxWait)
	defer cancel()

	if err := run.Get(waitCtx, nil); err != nil {
		// the wait ran out, not the run: it is still releasing
		if waitCtx.Err() != nil {
			return fmt.Errorf("await release hold bid id %s: %w: %w", bidID, usecase.ErrHoldReleasePending, err)
		}
		return fmt.Errorf("release hold bid id %s failed: %w", bidID, err)
	}

	return nil
}

func (s *Starter) start(ctx context.Context, listingID, bidID uuid.UUID) (client.WorkflowRun, error) {
	return s.client.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:                    WorkflowID(bidID),
		TaskQueue:             string(bstemporal.QueueMarketplace),
		WorkflowIDReusePolicy: enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
	}, WorkflowName, Input{ListingID: listingID, BidID: bidID})
}
