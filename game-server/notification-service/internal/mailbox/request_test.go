package mailbox

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	eventspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// The letter request (FS-1GZGD R12, R55, A7.2): a mail.letter.requested event
// stores one system letter through the admin send's rules, deduplicated by the
// inbox in the same transaction.

// fakeInbox is processed_events with the transaction's say: a mark made in a
// transaction that rolls back is forgotten.
type fakeInbox struct {
	processed map[uuid.UUID]string
	pending   map[uuid.UUID]string
}

func (f *fakeInbox) MarkEventProcessed(_ context.Context, _ *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error) {
	if _, seen := f.processed[eventID]; seen {
		return false, nil
	}
	if _, seen := f.pending[eventID]; seen {
		return false, nil
	}
	f.pending[eventID] = eventType
	return true, nil
}

// newRequestService is a service whose transaction commits or rolls back the
// inbox marks made in it, and says when it committed.
func newRequestService(repo *fakeRepo, items *fakeItems) (*service, *fakeArrivals, *fakeInbox) {
	committed := false
	arrivals := &fakeArrivals{committedSoFar: &committed}
	inbox := &fakeInbox{processed: map[uuid.UUID]string{}, pending: map[uuid.UUID]string{}}
	svc := newTestService(repo, items)
	svc.arrivals = arrivals
	svc.inbox = inbox
	svc.withTx = func(_ context.Context, fn func(tx *sqlx.Tx) error) error {
		committed = false
		err := fn(nil)
		if err == nil {
			for id, typ := range inbox.pending {
				inbox.processed[id] = typ
			}
			committed = true
		}
		inbox.pending = map[uuid.UUID]string{}
		return err
	}
	return svc, arrivals, inbox
}

func letterRequest(member uuid.UUID, enclosures ...*eventspb.LetterRequestedEnclosure) *eventspb.LetterRequested {
	return &eventspb.LetterRequested{
		EventId:    uuid.NewString(),
		Recipient:  &eventspb.LetterRequested_MemberId{MemberId: member.String()},
		Title:      "A Debt Repaid",
		Body:       "The Wardens return what the barrow took.",
		Enclosures: enclosures,
		Source:     "test.compensation",
	}
}

func TestProcessLetterRequested_StoresOneSystemLetterRecordingItsSource(t *testing.T) {
	repo := &fakeRepo{}
	svc, arrivals, inbox := newRequestService(repo, &fakeItems{})
	member := uuid.New()
	evt := letterRequest(member)

	err := svc.ProcessLetterRequested(context.Background(), evt)

	require.NoError(t, err)
	require.Len(t, repo.inserted, 1)
	require.Len(t, repo.inserted[0], 1)
	letter := repo.inserted[0][0]
	assert.Equal(t, SenderSystem, letter.Sender)
	assert.Equal(t, SentBy{Source: "test.compensation"}, letter.SentBy, "the source, and no member id")
	assert.Equal(t, &member, letter.MemberID)
	assert.Equal(t, "A Debt Repaid", letter.Title)
	assert.Equal(t, now.Add(defaultLetterExpiry), letter.ExpiresAt)
	assert.Equal(t, commonconstants.MailLetterRequestedEvent, inbox.processed[uuid.MustParse(evt.EventId)])
	assert.Equal(t, [][]Letter{repo.inserted[0]}, arrivals.batches)
	assert.Equal(t, []bool{true}, arrivals.afterCommit, "announced after the commit")
}

func TestProcessLetterRequested_RedeliveryStoresNothingAndPublishesNothing(t *testing.T) {
	repo := &fakeRepo{}
	svc, arrivals, _ := newRequestService(repo, &fakeItems{})
	evt := letterRequest(uuid.New())

	require.NoError(t, svc.ProcessLetterRequested(context.Background(), evt))
	err := svc.ProcessLetterRequested(context.Background(), evt)

	assert.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed, "the consumer acks a duplicate")
	assert.Len(t, repo.inserted, 1, "one letter however often the event arrives")
	assert.Len(t, arrivals.batches, 1, "one announcement")
}

// captureLogs routes slog to a buffer for the test.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func templateEnclosure(id string, quantity int32) *eventspb.LetterRequestedEnclosure {
	return &eventspb.LetterRequestedEnclosure{Kind: &eventspb.LetterRequestedEnclosure_Template{
		Template: &eventspb.LetterRequestedTemplate{TemplateId: id, Quantity: quantity},
	}}
}

func copyEnclosure(id string, quantity int32) *eventspb.LetterRequestedEnclosure {
	return &eventspb.LetterRequestedEnclosure{Kind: &eventspb.LetterRequestedEnclosure_Copy{
		Copy: &eventspb.LetterRequestedCopy{InstanceId: id, Quantity: quantity},
	}}
}

func goldEnclosure(amount int64) *eventspb.LetterRequestedEnclosure {
	return &eventspb.LetterRequestedEnclosure{Kind: &eventspb.LetterRequestedEnclosure_Gold{Gold: amount}}
}

// R12, R55: a request that breaks the letter rules is logged at error, marked
// processed and acked (nil), never requeued; nothing is stored or announced.
func TestProcessLetterRequested_InvalidRequestIsMarkedProcessedAndStoresNothing(t *testing.T) {
	unknownTemplate, unknownInstance := uuid.New(), uuid.New()
	tests := []struct {
		name   string
		mutate func(evt *eventspb.LetterRequested)
	}{
		{"missing source", func(e *eventspb.LetterRequested) { e.Source = "" }},
		{"blank source", func(e *eventspb.LetterRequested) { e.Source = "   " }},
		{"65-character source", func(e *eventspb.LetterRequested) { e.Source = strings.Repeat("s", 65) }},
		{"no recipient", func(e *eventspb.LetterRequested) { e.Recipient = nil }},
		{"member id not a uuid", func(e *eventspb.LetterRequested) {
			e.Recipient = &eventspb.LetterRequested_MemberId{MemberId: "wren"}
		}},
		{"all members false", func(e *eventspb.LetterRequested) {
			e.Recipient = &eventspb.LetterRequested_AllMembers{AllMembers: false}
		}},
		{"empty title", func(e *eventspb.LetterRequested) { e.Title = " " }},
		{"61-character title", func(e *eventspb.LetterRequested) { e.Title = strings.Repeat("t", 61) }},
		{"2001-character body", func(e *eventspb.LetterRequested) { e.Body = strings.Repeat("b", 2001) }},
		{"past expiry", func(e *eventspb.LetterRequested) { e.ExpiresAt = timestamppb.New(now.Add(-time.Minute)) }},
		{"enclosure of no kind", func(e *eventspb.LetterRequested) {
			e.Enclosures = []*eventspb.LetterRequestedEnclosure{{}}
		}},
		{"template id not a uuid", func(e *eventspb.LetterRequested) {
			e.Enclosures = []*eventspb.LetterRequestedEnclosure{templateEnclosure("potion", 1)}
		}},
		{"quantity 0", func(e *eventspb.LetterRequested) {
			e.Enclosures = []*eventspb.LetterRequestedEnclosure{templateEnclosure(uuid.NewString(), 0)}
		}},
		{"gold 0", func(e *eventspb.LetterRequested) {
			e.Enclosures = []*eventspb.LetterRequestedEnclosure{goldEnclosure(0)}
		}},
		{"unknown template", func(e *eventspb.LetterRequested) {
			e.Enclosures = []*eventspb.LetterRequestedEnclosure{templateEnclosure(unknownTemplate.String(), 1)}
		}},
		{"unknown instance", func(e *eventspb.LetterRequested) {
			e.Enclosures = []*eventspb.LetterRequestedEnclosure{copyEnclosure(unknownInstance.String(), 1)}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			repo := &fakeRepo{}
			items := &fakeItems{
				unknownTemplates: map[uuid.UUID]bool{unknownTemplate: true},
				unknownInstances: map[uuid.UUID]bool{unknownInstance: true},
			}
			svc, arrivals, inbox := newRequestService(repo, items)
			evt := letterRequest(uuid.New())
			tt.mutate(evt)

			err := svc.ProcessLetterRequested(context.Background(), evt)

			require.NoError(t, err, "acked, never requeued")
			assert.Contains(t, inbox.processed, uuid.MustParse(evt.EventId), "marked processed")
			assert.Empty(t, repo.inserted, "nothing stored")
			assert.Empty(t, arrivals.batches, "nothing announced")
			assert.Contains(t, logs.String(), "level=ERROR")
			assert.Contains(t, logs.String(), evt.EventId)
		})
	}
}

// A6: the event has no list form, so the only recipients are one member and
// every member; a broadcast stores one letter addressed to all.
func TestProcessLetterRequested_BroadcastStoresOneLetterForEveryMember(t *testing.T) {
	repo := &fakeRepo{}
	svc, arrivals, _ := newRequestService(repo, &fakeItems{})
	evt := letterRequest(uuid.New())
	evt.Recipient = &eventspb.LetterRequested_AllMembers{AllMembers: true}

	require.NoError(t, svc.ProcessLetterRequested(context.Background(), evt))

	require.Len(t, repo.inserted, 1)
	require.Len(t, repo.inserted[0], 1)
	assert.Nil(t, repo.inserted[0][0].MemberID)
	assert.Equal(t, []*uuid.UUID{nil}, membersOf(arrivals.batches[0]))
}

// A1, A2: enclosures resolve to snapshots through the send path; a copy
// stores the source instance's snapshot, a template a fresh one, gold as is.
func TestProcessLetterRequested_EnclosuresAreStoredAsSnapshots(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc, _, _ := newRequestService(repo, items)
	instance, template := uuid.New(), uuid.New()
	evt := letterRequest(uuid.New(), copyEnclosure(instance.String(), 1), templateEnclosure(template.String(), 3), goldEnclosure(250))

	require.NoError(t, svc.ProcessLetterRequested(context.Background(), evt))

	assert.Equal(t, 1, items.calls, "one resolve for the request")
	assert.Equal(t, []uuid.UUID{instance}, items.instances)
	require.Len(t, repo.inserted, 1)
	got := repo.inserted[0][0].Enclosures
	require.Len(t, got, 3)
	assert.Equal(t, unique, got[0].Item, "the copy is the source's snapshot")
	assert.Equal(t, int32(1), got[0].Quantity)
	assert.Equal(t, template, got[1].Item.TemplateID)
	assert.Equal(t, int32(3), got[1].Quantity)
	assert.Equal(t, Enclosure{Kind: EnclosureGold, Gold: 250}, got[2])
}

func TestProcessLetterRequested_GivenExpiryAndTrimmedSourceAreStored(t *testing.T) {
	repo := &fakeRepo{}
	svc, _, _ := newRequestService(repo, &fakeItems{})
	expiry := now.Add(72 * time.Hour)
	evt := letterRequest(uuid.New())
	evt.ExpiresAt = timestamppb.New(expiry)
	evt.Source = "  " + strings.Repeat("s", 64) + " "

	require.NoError(t, svc.ProcessLetterRequested(context.Background(), evt))

	require.Len(t, repo.inserted, 1)
	assert.True(t, expiry.Equal(repo.inserted[0][0].ExpiresAt))
	assert.Equal(t, SentBySource(strings.Repeat("s", 64)), repo.inserted[0][0].SentBy.Source, "64 characters after trimming")
}

// Edge state "items-service down at send": not marked processed, so the
// consumer requeues it and a later delivery stores it.
func TestProcessLetterRequested_ItemsDownIsTransientAndMarksNothing(t *testing.T) {
	repo := &fakeRepo{}
	items := &fakeItems{err: ErrItemsUnavailable}
	svc, arrivals, inbox := newRequestService(repo, items)
	evt := letterRequest(uuid.New(), templateEnclosure(uuid.NewString(), 1))

	err := svc.ProcessLetterRequested(context.Background(), evt)

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Empty(t, inbox.processed, "rolled back: not marked processed")
	assert.Empty(t, repo.inserted)
	assert.Empty(t, arrivals.batches)

	// items back: the redelivery stores it once
	items.err = nil
	require.NoError(t, svc.ProcessLetterRequested(context.Background(), evt))
	assert.Len(t, repo.inserted, 1)
	assert.Len(t, arrivals.batches, 1)
}

// Without a usable event id the inbox cannot dedupe: a permanent error the
// consumer dead-letters, before any work.
func TestProcessLetterRequested_EventIDNotAUUIDIsPermanentAndTouchesNothing(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc, arrivals, inbox := newRequestService(repo, items)
	evt := letterRequest(uuid.New(), templateEnclosure(uuid.NewString(), 1))
	evt.EventId = "not-a-uuid"

	err := svc.ProcessLetterRequested(context.Background(), evt)

	require.Error(t, err)
	assert.False(t, errors.Is(err, commonconstants.ErrTransient), "dead-lettered, not retried")
	assert.Empty(t, inbox.processed)
	assert.Zero(t, items.calls)
	assert.Empty(t, repo.inserted)
	assert.Empty(t, arrivals.batches)
}

// A failed insert rolls the inbox mark back with it, and announces nothing.
func TestProcessLetterRequested_StoreFailureRollsBackTheMark(t *testing.T) {
	repo := &fakeRepo{insertErr: errors.New("connection reset")}
	svc, arrivals, inbox := newRequestService(repo, &fakeItems{})
	evt := letterRequest(uuid.New())

	err := svc.ProcessLetterRequested(context.Background(), evt)

	require.Error(t, err)
	assert.ErrorIs(t, err, commonconstants.ErrTransient, "a store blip is retried, never dead-lettered at once")
	assert.Empty(t, inbox.processed)
	assert.Empty(t, arrivals.batches)
}

// The database failing around the letter (no transaction to begin, the commit
// lost) is a blip like items down: retried, not dead-lettered.
func TestProcessLetterRequested_TransactionFailureIsTransient(t *testing.T) {
	repo := &fakeRepo{}
	svc, arrivals, inbox := newRequestService(repo, &fakeItems{})
	svc.withTx = func(context.Context, func(tx *sqlx.Tx) error) error {
		return errors.New("begin transaction: connection refused")
	}

	err := svc.ProcessLetterRequested(context.Background(), letterRequest(uuid.New()))

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.NotErrorIs(t, err, commonconstants.ErrAlreadyProcessed)
	assert.Empty(t, inbox.processed)
	assert.Empty(t, arrivals.batches)
}
