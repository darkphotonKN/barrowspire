package settlement

// initiates the settlement saga flow

import (
	"context"
	"errors"
	"fmt"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"

	"github.com/google/uuid"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// Starter implements usecase.SettlementStarter. It is the only code that knows
// the workflow ID format, so every trigger dedups against the same run.
type Starter struct {
	client client.Client
}

func NewStarter(c client.Client) *Starter {
	return &Starter{client: c}
}

func WorkflowID(listingID uuid.UUID) string {
	return "settlement-" + listingID.String()
}

func (s *Starter) StartSettlement(ctx context.Context, listingID uuid.UUID, trigger usecase.TriggerKind) error {
	// Start, never wait: the returned run handle is deliberately ignored.
	_, err := s.client.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:                    WorkflowID(listingID),
		TaskQueue:             string(bstemporal.QueueMarketplace),
		WorkflowIDReusePolicy: enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
	}, WorkflowName, Input{ListingID: listingID, Trigger: trigger})

	// A running duplicate already returns no error (SDK default); a closed one
	// is rejected by REJECT_DUPLICATE. Both mean "this listing is settling or settled".
	var already *serviceerror.WorkflowExecutionAlreadyStarted
	if errors.As(err, &already) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("start settlement %s: %w", listingID, err)
	}
	return nil
}
