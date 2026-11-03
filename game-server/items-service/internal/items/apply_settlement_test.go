package items

import (
	"context"
	"errors"
	"fmt"
	"testing"

	pbevents "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

// seenInbox is an inbox that remembers: an event id it has marked is not new
// again, whichever path marked it.
type seenInbox struct {
	seen map[uuid.UUID]bool
}

func (i *seenInbox) MarkEventProcessed(_ context.Context, _ *sqlx.Tx, eventID uuid.UUID, _ string) (bool, error) {
	if i.seen[eventID] {
		return false, nil
	}
	i.seen[eventID] = true
	return true, nil
}

// FS-GV8WN R11: ApplySettlement settles through the consumer's own path, so
// a repeat call and the async copy arriving after it each apply nothing and
// still succeed. The call carries no identity: game-service makes it, not a
// player.
func TestHandler_ApplySettlement_AppliesOnceAcrossBothPaths(t *testing.T) {
	repo := &consumingRepo{extractionRepo: &extractionRepo{}}
	svc := &service{repo: repo, withTx: runInline, inbox: &seenInbox{seen: map[uuid.UUID]bool{}}}
	h := NewHandler(svc, nil)
	drunk := uuid.New()
	event := extractedEvent(potion())
	event.PlayerItems[0].ConsumedItemIds = []string{drunk.String()}
	runID := uuid.MustParse(event.SessionId)
	eventID := uuid.New()
	req := &pb.ApplySettlementRequest{EventId: eventID.String(), Event: event}

	if _, err := h.ApplySettlement(context.Background(), req); err != nil {
		t.Fatalf("first call: %v", err)
	}
	if repo.stored() != 1 || len(repo.deleted) != 1 || repo.deleted[0].ids[0] != drunk || len(repo.released) != 1 || repo.released[0] != runID {
		t.Fatalf("stored %d, deleted %v, released %v; want the find stored, the potion deleted, run %s released", repo.stored(), repo.deleted, repo.released, runID)
	}
	calls := len(repo.calls)

	if _, err := h.ApplySettlement(context.Background(), req); err != nil {
		t.Fatalf("repeat call: %v, want success", err)
	}

	body, err := proto.Marshal(event)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	c := &Consumer{service: svc}
	got := c.handleItemsExtracted(context.Background(), amqp.Delivery{MessageId: eventID.String(), Body: body})
	if got.disposition != ack {
		t.Fatalf("async copy disposition = %v, want ack", got.disposition)
	}

	if len(repo.calls) != calls {
		t.Fatalf("calls after the first apply %v, want none", repo.calls[calls:])
	}
}

// fakeSettlementService serves ApplySettlement only and records what it was
// handed; any other call panics on the nil embedded interface.
type fakeSettlementService struct {
	Service
	err     error
	called  bool
	eventID uuid.UUID
	event   *pbevents.ItemsExtractedEvent
}

func (f *fakeSettlementService) ApplySettlement(_ context.Context, eventID uuid.UUID, req *pbevents.ItemsExtractedEvent) error {
	f.called, f.eventID, f.event = true, eventID, req
	return f.err
}

// The service is handed the caller's event id and the event itself.
func TestHandler_ApplySettlement_KeysOnTheCallersEventID(t *testing.T) {
	svc := &fakeSettlementService{}
	eventID := uuid.New()
	event := extractedEvent(potion())

	if _, err := NewHandler(svc, nil).ApplySettlement(context.Background(), &pb.ApplySettlementRequest{EventId: eventID.String(), Event: event}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if svc.eventID != eventID || svc.event != event {
		t.Fatalf("processed %s/%p, want %s/%p", svc.eventID, svc.event, eventID, event)
	}
}

// ApplySettlement marks the event under the items.extracted event type the
// consumer marks under, so either path finds the other's mark.
func TestService_ApplySettlement_MarksAsItemsExtracted(t *testing.T) {
	inbox := &fakeInbox{}
	svc := &service{repo: &extractionRepo{}, withTx: runInline, inbox: inbox}
	eventID := uuid.New()

	if err := svc.ApplySettlement(context.Background(), eventID, extractedEvent(potion())); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(inbox.marked) != 1 || inbox.marked[0].eventID != eventID || inbox.marked[0].eventType != commonconstants.ItemsExtracted {
		t.Fatalf("marked %+v, want one mark of %s as %q", inbox.marked, eventID, commonconstants.ItemsExtracted)
	}
}

// FS-GV8WN R11, FS-22WKC seam: a malformed id reaches nothing and a malformed
// payload is refused, both InvalidArgument; what the consumer would retry (a
// store that is down, a reference not there yet, a held account lock) is
// Unavailable; an already applied event is success; anything else is
// Internal.
func TestHandler_ApplySettlement_Errors(t *testing.T) {
	event := extractedEvent(potion())
	tests := []struct {
		name       string
		eventID    string
		err        error
		wantCode   codes.Code
		wantCalled bool
	}{
		{name: "missing event id", eventID: "", wantCode: codes.InvalidArgument},
		{name: "malformed event id", eventID: "nope", wantCode: codes.InvalidArgument},
		{name: "nil event id", eventID: uuid.Nil.String(), wantCode: codes.InvalidArgument},
		{name: "malformed payload", eventID: uuid.NewString(),
			err: fmt.Errorf("store items extracted: %w", commonconstants.ErrUUIDCouldNotBeParsed), wantCode: codes.InvalidArgument, wantCalled: true},
		{name: "payload breaks a constraint", eventID: uuid.NewString(),
			err: fmt.Errorf("store items extracted: %w", commonconstants.ErrConstraintViolation), wantCode: codes.InvalidArgument, wantCalled: true},
		{name: "store down", eventID: uuid.NewString(),
			err: fmt.Errorf("transaction: %w", commonconstants.ErrTransient), wantCode: codes.Unavailable, wantCalled: true},
		{name: "reference not there yet: foreign key", eventID: uuid.NewString(),
			err: fmt.Errorf("store items extracted: %w", wrapDBErr("insert item instances", &pq.Error{Code: foreignKeyViolation})), wantCode: codes.Unavailable, wantCalled: true},
		{name: "reference not there yet: not found", eventID: uuid.NewString(),
			err: fmt.Errorf("store items extracted: %w", commonconstants.ErrNotFound), wantCode: codes.Unavailable, wantCalled: true},
		{name: "account lock held", eventID: uuid.NewString(),
			err: fmt.Errorf("lock account: %w", commonconstants.ErrLockUnavailable), wantCode: codes.Unavailable, wantCalled: true},
		{name: "already applied", eventID: uuid.NewString(),
			err: commonconstants.ErrAlreadyProcessed, wantCode: codes.OK, wantCalled: true},
		{name: "anything else", eventID: uuid.NewString(),
			err: errors.New("boom"), wantCode: codes.Internal, wantCalled: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeSettlementService{err: tt.err}

			_, err := NewHandler(svc, nil).ApplySettlement(context.Background(), &pb.ApplySettlementRequest{EventId: tt.eventID, Event: event})

			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
			}
			if svc.called != tt.wantCalled {
				t.Errorf("service called = %v, want %v", svc.called, tt.wantCalled)
			}
		})
	}
}
