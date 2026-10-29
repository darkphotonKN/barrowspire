package items

import (
	"context"
	"errors"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// extractionRepo stubs the two writes an extraction makes. The embedded
// interface is nil: anything else the service reaches for panics the test.
type extractionRepo struct {
	Repository
	upsertErr  error
	loadoutErr error
	upserted   []*ItemInstance
	loadouts   []*UpsertPlayerLoadoutRequest
}

func (r *extractionRepo) BatchUpsertItemInstances(ctx context.Context, tx *sqlx.Tx, items []*ItemInstance) error {
	r.upserted = append(r.upserted, items...)
	return r.upsertErr
}

func (r *extractionRepo) UpsertPlayerLoadoutTx(ctx context.Context, tx *sqlx.Tx, req *UpsertPlayerLoadoutRequest) error {
	r.loadouts = append(r.loadouts, req)
	return r.loadoutErr
}

// fakeInbox records the marks a service makes and reports each new event as
// new, or every event as already seen when duplicate is set.
type fakeInbox struct {
	duplicate bool
	err       error
	marked    []inboxMark
}

type inboxMark struct {
	eventID   uuid.UUID
	eventType string
	tx        *sqlx.Tx
}

func (f *fakeInbox) MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error) {
	f.marked = append(f.marked, inboxMark{eventID, eventType, tx})
	if f.err != nil {
		return false, f.err
	}
	return !f.duplicate, nil
}

// runInline runs the transaction body without a database.
func runInline(ctx context.Context, fn func(tx *sqlx.Tx) error) error { return fn(nil) }

func extractedEvent(items ...*pb.Item) *pb.ItemsExtractedEvent {
	return &pb.ItemsExtractedEvent{
		EventId: uuid.NewString(),
		PlayerItems: []*pb.PlayerItems{{
			MemberId:  uuid.NewString(),
			Equipment: &pb.Equipment{},
			Inventory: items,
		}},
	}
}

func potion() *pb.Item {
	return &pb.Item{TemplateId: uuid.NewString(), ItemType: "consumable", Name: "Lesser Heal Potion", HealingAmount: 10}
}

// A batch that fails to store is returned, so the consumer requeues or
// dead-letters the event instead of acking lost loot; a per-item skip is not a
// failure (FS-4R9M9 R49, R50).
func TestProcessItemsExtracted_Outcome(t *testing.T) {
	commitFailed := errors.New("connection reset")

	tests := []struct {
		name    string
		repo    *extractionRepo
		withTx  func(ctx context.Context, fn func(tx *sqlx.Tx) error) error
		event   *pb.ItemsExtractedEvent
		wantErr error
		stored  int
	}{
		{
			name:   "stored",
			repo:   &extractionRepo{},
			event:  extractedEvent(potion()),
			stored: 1,
		},
		{
			name: "an item without a template is skipped, the rest stored",
			repo: &extractionRepo{},
			event: extractedEvent(potion(),
				&pb.Item{ItemType: "weapon", Name: "Nameless"}),
			stored: 1,
		},
		{
			name:    "a row the store refuses fails the batch",
			repo:    &extractionRepo{upsertErr: commonconstants.ErrConstraintViolation},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrConstraintViolation,
			stored:  1,
		},
		{
			name:    "a transient store failure stays transient",
			repo:    &extractionRepo{upsertErr: commonconstants.ErrTransient},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrTransient,
			stored:  1,
		},
		{
			name:    "a loadout write failure fails the batch",
			repo:    &extractionRepo{loadoutErr: commonconstants.ErrLockUnavailable},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrLockUnavailable,
			stored:  1,
		},
		{
			name: "the transaction failing around a good batch is transient",
			repo: &extractionRepo{},
			withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
				if err := fn(nil); err != nil {
					return err
				}
				return commitFailed
			},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrTransient,
			stored:  1,
		},
		{
			name: "the transaction failing to begin is transient",
			repo: &extractionRepo{},
			withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
				return commitFailed
			},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrTransient,
		},
		{
			name: "a malformed member id fails the event",
			repo: &extractionRepo{},
			event: &pb.ItemsExtractedEvent{PlayerItems: []*pb.PlayerItems{{
				MemberId: "not-a-uuid", Equipment: &pb.Equipment{}, Inventory: []*pb.Item{potion()},
			}}},
			wantErr: commonconstants.ErrUUIDCouldNotBeParsed,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withTx := tt.withTx
			if withTx == nil {
				withTx = runInline
			}
			svc := &service{repo: tt.repo, withTx: withTx, inbox: &fakeInbox{}}

			err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, tt.event)

			switch {
			case tt.wantErr == nil && err != nil:
				t.Fatalf("unexpected error: %v", err)
			case tt.wantErr != nil && !errors.Is(err, tt.wantErr):
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if len(tt.repo.upserted) != tt.stored {
				t.Errorf("stored %d rows, want %d", len(tt.repo.upserted), tt.stored)
			}
		})
	}
}

// A player with no equipment extracts their satchel: nil equipment means no
// equipped items, never a panic inside the transaction (FS-4R9M9 R49, R50).
func TestProcessItemsExtracted_NilEquipment_StoresSatchel(t *testing.T) {
	repo := &extractionRepo{}
	svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}
	event := extractedEvent(potion(), potion())
	event.PlayerItems[0].Equipment = nil

	if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.upserted) != 2 {
		t.Fatalf("stored %d rows, want the 2 satchel items", len(repo.upserted))
	}
}

// A delver seated without their stored loadout (it could not be read) brought
// none of it in, so their extraction says nothing about it: what they leave
// with is stored, and the stored loadout is left as it was instead of being
// overwritten with empty slots. A delver whose loadout was read has it
// replaced by what they wear out.
func TestProcessItemsExtracted_LoadoutUnknown_LeavesTheStoredLoadoutAlone(t *testing.T) {
	foundSword := &pb.Item{TemplateId: uuid.NewString(), ItemType: "weapon", Name: "Barrow Blade", AttackPower: 7}

	tests := []struct {
		name           string
		loadoutUnknown bool
		wantLoadouts   int
	}{
		{name: "loadout read at seating: replaced by what is worn out", loadoutUnknown: false, wantLoadouts: 1},
		{name: "loadout unknown at seating: stored loadout untouched", loadoutUnknown: true, wantLoadouts: 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &extractionRepo{}
			svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}
			event := extractedEvent(potion())
			event.PlayerItems[0].Equipment = &pb.Equipment{Weapon: foundSword}
			event.PlayerItems[0].LoadoutUnknown = tt.loadoutUnknown

			if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(repo.upserted) != 2 {
				t.Errorf("stored %d items, want the worn sword and the satchel potion", len(repo.upserted))
			}
			if len(repo.loadouts) != tt.wantLoadouts {
				t.Fatalf("wrote the stored loadout %d times, want %d", len(repo.loadouts), tt.wantLoadouts)
			}
		})
	}
}

// The inbox mark is the first statement of the event's transaction, keyed on
// the event id and type the consumer hands over, so it commits or rolls back
// with the loot (FS-BVM9H Req 3, 6, 7).
func TestProcessItemsExtracted_MarksInboxInTheSameTx(t *testing.T) {
	tx := &sqlx.Tx{}
	var marksBeforeWrite int
	inbox := &fakeInbox{}
	repo := &orderedRepo{extractionRepo: &extractionRepo{}, before: func() { marksBeforeWrite = len(inbox.marked) }}
	svc := &service{repo: repo, inbox: inbox, withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
		return fn(tx)
	}}
	eventID := uuid.New()

	if err := svc.ProcessItemsExtracted(context.Background(), eventID, commonconstants.ItemsExtracted, extractedEvent(potion())); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(inbox.marked) != 1 {
		t.Fatalf("marked %d times, want once", len(inbox.marked))
	}
	got := inbox.marked[0]
	if got.eventID != eventID || got.eventType != commonconstants.ItemsExtracted || got.tx != tx {
		t.Fatalf("marked %+v, want %s/%s in the event's tx", got, eventID, commonconstants.ItemsExtracted)
	}
	if marksBeforeWrite != 1 {
		t.Fatalf("the loot was written before the inbox mark")
	}
}

// orderedRepo notes what had happened before the first loot write.
type orderedRepo struct {
	*extractionRepo
	before func()
	called bool
}

func (r *orderedRepo) BatchUpsertItemInstances(ctx context.Context, tx *sqlx.Tx, items []*ItemInstance) error {
	if !r.called {
		r.called = true
		r.before()
	}
	return r.extractionRepo.BatchUpsertItemInstances(ctx, tx, items)
}

// A duplicate event writes nothing and says so; an inbox that cannot be
// written fails the event so it is retried, with nothing stored
// (FS-BVM9H Req 10).
func TestProcessItemsExtracted_Inbox(t *testing.T) {
	tests := []struct {
		name    string
		inbox   *fakeInbox
		wantErr error
	}{
		{"already processed writes nothing", &fakeInbox{duplicate: true}, commonconstants.ErrAlreadyProcessed},
		{"inbox write fails", &fakeInbox{err: commonconstants.ErrTransient}, commonconstants.ErrTransient},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &extractionRepo{}
			svc := &service{repo: repo, withTx: runInline, inbox: tt.inbox}

			err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, extractedEvent(potion()))

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if len(repo.upserted) != 0 {
				t.Fatalf("stored %d rows, want none", len(repo.upserted))
			}
		})
	}
}

// Nil equipment maps to no equipped items and an empty loadout for the member.
func TestMapProtoEquipmentToItemInstances_NilEquipment(t *testing.T) {
	member := uuid.New()

	instances, loadout, err := (&service{}).MapProtoEquipmentToItemInstances(member, nil)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 0 {
		t.Fatalf("mapped %d equipped items from nil equipment", len(instances))
	}
	if loadout == nil || loadout.MemberID != member || loadout.WeaponInstanceID != nil || loadout.ChestInstanceID != nil {
		t.Fatalf("loadout %+v, want an empty loadout for %s", loadout, member)
	}
}
