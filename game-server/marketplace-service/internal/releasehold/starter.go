package releasehold

// initiates the release hold workflow

import (
	"context"
	"errors"
	"fmt"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"

	"github.com/google/uuid"
)

// Starter implements usecase.HoldReleaseStarter. It is the only code that knows the
// workflow ID format, so every caller that releases the same bid's hold dedups
// against the same run.
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
	_, err := s.client.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:                    WorkflowID(bidID),
		TaskQueue:             string(bstemporal.QueueMarketplace),
		WorkflowIDReusePolicy: enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
	}, WorkflowName, Input{ListingID: listingID, BidID: bidID})

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
