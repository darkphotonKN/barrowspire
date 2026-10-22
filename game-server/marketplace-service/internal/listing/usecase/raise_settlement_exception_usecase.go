package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// RaiseSettlementExceptionUC records why a settlement parked and queues
// settlement.failed for publishing (FS-NXP1W Req 10.1, ADR-0018). The record and
// its alert share one transaction, which the repository owns.
type RaiseSettlementExceptionUC struct {
	repo SettlementExceptionRaiser
}

// SettlementExceptionRaiser records an OPEN exception and, in the same
// transaction, writes the event eventFn returns to the outbox (nil: no event).
// eventFn sees the exception's ID and whether this raise created it.
type SettlementExceptionRaiser interface {
	Raise(
		ctx context.Context,
		listingID uuid.UUID, workflowID, step, reason string,
		eventFn func(id uuid.UUID, created bool) (*commonoutbox.OutboxParams, error),
	) (uuid.UUID, error)
}

func NewRaiseSettlementExceptionUC(repo SettlementExceptionRaiser) *RaiseSettlementExceptionUC {
	return &RaiseSettlementExceptionUC{
		repo: repo,
	}
}

// RaiseSettlementExceptionCommand is what the RaiseSettlementException activity
// hands its use case (FS-NXP1W Req 10.1): record the exception and write
// settlement.failed to the outbox, in one transaction.
//
// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type RaiseSettlementExceptionCommand struct {
	ListingID  uuid.UUID
	WorkflowID string
	Step       string
	Reason     string
}

func (uc *RaiseSettlementExceptionUC) Handle(ctx context.Context, cmd RaiseSettlementExceptionCommand) (uuid.UUID, error) {
	// taken before the transaction: the closure below runs under it and must not
	// do I/O, and the alert should say when the step parked, not when it committed
	occurredAt := time.Now()

	id, err := uc.repo.Raise(ctx, cmd.ListingID, cmd.WorkflowID, cmd.Step, cmd.Reason,
		func(id uuid.UUID, created bool) (*commonoutbox.OutboxParams, error) {
			// One alert per incident. A later lap of the park loop, or a retried
			// raise, finds the exception already open: the operator was told when
			// it opened, and the open row still shows it is unresolved.
			if !created {
				return nil, nil
			}

			payload, err := proto.Marshal(&events.SettlementFailedEvent{
				ExceptionId: id.String(),
				ListingId:   cmd.ListingID.String(),
				WorkflowId:  cmd.WorkflowID,
				Step:        cmd.Step,
				Reason:      cmd.Reason,
				OccurredAt:  timestamppb.New(occurredAt),
			})
			if err != nil {
				return nil, fmt.Errorf("marshal settlement failed event: %w", err)
			}

			return &commonoutbox.OutboxParams{
				Exchange:   commonconstants.MarketplaceEventsExchange,
				RoutingKey: commonconstants.SettlementFailed,
				Payload:    payload,
			}, nil
		})
	if err != nil {
		return uuid.Nil, fmt.Errorf("raise settlement exception usecase handle workflow %s step %s: %w", cmd.WorkflowID, cmd.Step, err)
	}

	return id, nil
}
