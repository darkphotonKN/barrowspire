package withdrawlisting

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

// Starter implements usecase.ListingWithdrawalStarter. It is the only code that
// knows the workflow ID format, so every start for one listing dedups against the
// same run.
type Starter struct {
	client client.Client
}

func NewStarter(c client.Client) *Starter {
	return &Starter{client: c}
}

// WorkflowID is keyed by listing: a listing is withdrawn once.
func WorkflowID(listingID uuid.UUID) string {
	return "withdraw-listing-" + listingID.String()
}

func (s *Starter) StartListingWithdrawal(ctx context.Context, listingID, itemID uuid.UUID, bidIDs []uuid.UUID) error {
	// Start, never wait: the run carries the return and the releases from here.
	_, err := s.client.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:                    WorkflowID(listingID),
		TaskQueue:             bstemporal.QueueMarketplace.String(),
		WorkflowIDReusePolicy: enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
	}, WorkflowName, Input{ListingID: listingID, ItemID: itemID, BidIDs: bidIDs})

	// A running duplicate already returns no error (SDK default); a closed one is
	// rejected by REJECT_DUPLICATE. Both mean "this withdrawal is being or has been
	// carried out".
	var already *serviceerror.WorkflowExecutionAlreadyStarted
	if errors.As(err, &already) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("start withdraw listing listing id %s: %w", listingID, err)
	}
	return nil
}
