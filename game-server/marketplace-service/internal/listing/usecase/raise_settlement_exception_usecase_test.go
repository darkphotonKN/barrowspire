package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

// stubRaiser plays the repository: it hands eventFn an ID and a created flag the
// test chooses, and keeps whatever event eventFn decides to publish.
type stubRaiser struct {
	id      uuid.UUID
	created bool
	err     error

	gotListingID                   uuid.UUID
	gotWorkflowID, gotStep, gotWhy string
	event                          *commonoutbox.OutboxParams
	eventErr                       error
}

func (s *stubRaiser) Raise(
	ctx context.Context,
	listingID uuid.UUID, workflowID, step, reason string,
	eventFn func(id uuid.UUID, created bool) (*commonoutbox.OutboxParams, error),
) (uuid.UUID, error) {
	s.gotListingID, s.gotWorkflowID, s.gotStep, s.gotWhy = listingID, workflowID, step, reason
	if s.err != nil {
		return uuid.Nil, s.err
	}

	s.event, s.eventErr = eventFn(s.id, s.created)
	if s.eventErr != nil {
		return uuid.Nil, s.eventErr
	}
	return s.id, nil
}

func raiseCommand() RaiseSettlementExceptionCommand {
	return RaiseSettlementExceptionCommand{
		ListingID:  uuid.New(),
		WorkflowID: "settlement-" + uuid.NewString(),
		Step:       "TransferItem",
		Reason:     "items-service unavailable for 30m",
	}
}

// A new exception is recorded with settlement.failed alongside it, describing the
// same exception.
func TestRaiseSettlementExceptionUC_NewException_QueuesSettlementFailed(t *testing.T) {
	repo := &stubRaiser{id: uuid.New(), created: true}
	cmd := raiseCommand()

	id, err := NewRaiseSettlementExceptionUC(repo).Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.Equal(t, repo.id, id)
	assert.Equal(t, cmd.ListingID, repo.gotListingID)
	assert.Equal(t, cmd.WorkflowID, repo.gotWorkflowID)
	assert.Equal(t, cmd.Step, repo.gotStep)
	assert.Equal(t, cmd.Reason, repo.gotWhy)

	require.NotNil(t, repo.event, "a new exception is announced")
	assert.Equal(t, commonconstants.MarketplaceEventsExchange, repo.event.Exchange)
	assert.Equal(t, commonconstants.SettlementFailed, repo.event.RoutingKey)

	var evt events.SettlementFailedEvent
	require.NoError(t, proto.Unmarshal(repo.event.Payload, &evt))
	assert.Equal(t, repo.id.String(), evt.ExceptionId)
	assert.Equal(t, cmd.ListingID.String(), evt.ListingId)
	assert.Equal(t, cmd.WorkflowID, evt.WorkflowId)
	assert.Equal(t, cmd.Step, evt.Step)
	assert.Equal(t, cmd.Reason, evt.Reason)
	assert.NotNil(t, evt.OccurredAt)
}

// A later lap of the park loop finds the exception already open: same ID, and no
// second alert for the same incident.
func TestRaiseSettlementExceptionUC_AlreadyOpen_QueuesNothing(t *testing.T) {
	repo := &stubRaiser{id: uuid.New(), created: false}

	id, err := NewRaiseSettlementExceptionUC(repo).Handle(context.Background(), raiseCommand())

	require.NoError(t, err)
	assert.Equal(t, repo.id, id)
	assert.Nil(t, repo.event)
}

func TestRaiseSettlementExceptionUC_RepositoryFailure_PassesThrough(t *testing.T) {
	dbDown := errors.New("connection refused")
	repo := &stubRaiser{err: dbDown}

	id, err := NewRaiseSettlementExceptionUC(repo).Handle(context.Background(), raiseCommand())

	assert.ErrorIs(t, err, dbDown)
	assert.Equal(t, uuid.Nil, id)
}
