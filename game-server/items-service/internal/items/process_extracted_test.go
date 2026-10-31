package items

import (
	"context"
	"errors"
	"strings"
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

// consumingRepo records the consumed-item deletes an extraction makes, and
// the order of every write, so the delete can be shown to come last.
type consumingRepo struct {
	*extractionRepo
	deleteErr error
	deleted   []consumedDelete
	writes    []string
}

type consumedDelete struct {
	memberID uuid.UUID
	ids      []uuid.UUID
	tx       *sqlx.Tx
}

func (r *consumingRepo) BatchUpsertItemInstances(ctx context.Context, tx *sqlx.Tx, items []*ItemInstance) error {
	r.writes = append(r.writes, "items")
	return r.extractionRepo.BatchUpsertItemInstances(ctx, tx, items)
}

func (r *consumingRepo) UpsertPlayerLoadoutTx(ctx context.Context, tx *sqlx.Tx, req *UpsertPlayerLoadoutRequest) error {
	r.writes = append(r.writes, "loadout")
	return r.extractionRepo.UpsertPlayerLoadoutTx(ctx, tx, req)
}

func (r *consumingRepo) DeleteConsumedItemInstancesTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID, ids []uuid.UUID) (int64, error) {
	r.writes = append(r.writes, "consumed")
	r.deleted = append(r.deleted, consumedDelete{memberID, ids, tx})
	return int64(len(ids)), r.deleteErr
}

// A drunk potion is reported as a consumed item; the member's extraction
// deletes exactly those instances, in the event's transaction, as the
// member's last write: after the items and the loadout, or after the items
// alone when the loadout was unknown (FS-P9G8R R17-R19).
func TestProcessItemsExtracted_ConsumedItems_DeletedLast(t *testing.T) {
	tests := []struct {
		name           string
		loadoutUnknown bool
		wantWrites     []string
	}{
		{name: "loadout known: after the item and loadout upserts", wantWrites: []string{"items", "loadout", "consumed"}},
		{name: "loadout unknown: still deleted, after the item upsert", loadoutUnknown: true, wantWrites: []string{"items", "consumed"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tx := &sqlx.Tx{}
			repo := &consumingRepo{extractionRepo: &extractionRepo{}}
			svc := &service{repo: repo, inbox: &fakeInbox{}, withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
				return fn(tx)
			}}
			drunk1, drunk2 := uuid.New(), uuid.New()
			event := extractedEvent(potion())
			event.PlayerItems[0].LoadoutUnknown = tt.loadoutUnknown
			event.PlayerItems[0].ConsumedItemIds = []string{drunk1.String(), drunk2.String()}
			member := uuid.MustParse(event.PlayerItems[0].MemberId)

			if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(repo.deleted) != 1 {
				t.Fatalf("deleted %d times, want once", len(repo.deleted))
			}
			got := repo.deleted[0]
			if got.memberID != member || got.tx != tx {
				t.Fatalf("deleted for %s in tx %p, want %s in the event's tx", got.memberID, got.tx, member)
			}
			if len(got.ids) != 2 || got.ids[0] != drunk1 || got.ids[1] != drunk2 {
				t.Fatalf("deleted %v, want [%s %s]", got.ids, drunk1, drunk2)
			}
			if strings.Join(repo.writes, ",") != strings.Join(tt.wantWrites, ",") {
				t.Fatalf("writes %v, want %v", repo.writes, tt.wantWrites)
			}
		})
	}
}

// An event with nothing consumed, including one from a producer that predates
// the field, applies exactly as before: no delete is made (FS-P9G8R R20).
func TestProcessItemsExtracted_NothingConsumed_NoDelete(t *testing.T) {
	tests := []struct {
		name     string
		consumed []string
	}{
		{name: "field absent", consumed: nil},
		{name: "empty list", consumed: []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &consumingRepo{extractionRepo: &extractionRepo{}}
			svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}
			event := extractedEvent(potion())
			event.PlayerItems[0].ConsumedItemIds = tt.consumed

			if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(repo.deleted) != 0 {
				t.Fatalf("deleted %d times, want no delete", len(repo.deleted))
			}
			if strings.Join(repo.writes, ",") != "items,loadout" {
				t.Fatalf("writes %v, want the items and the loadout only", repo.writes)
			}
		})
	}
}

// failingSecondUpsertRepo fails the item upsert of the second member, after the
// first member's delete has run.
type failingSecondUpsertRepo struct {
	*consumingRepo
	upserts int
}

func (r *failingSecondUpsertRepo) BatchUpsertItemInstances(ctx context.Context, tx *sqlx.Tx, items []*ItemInstance) error {
	r.upserts++
	if r.upserts == 2 {
		r.writes = append(r.writes, "items")
		return commonconstants.ErrLockUnavailable
	}
	return r.consumingRepo.BatchUpsertItemInstances(ctx, tx, items)
}

// The delete shares the event's fate: a malformed consumed id fails the event
// before anything is written, a failed delete fails it, a write failing after
// the delete fails the transaction so the delete rolls back with it, and a
// redelivered event deletes nothing more (FS-P9G8R R17, R20, R21; FS-BVM9H).
func TestProcessItemsExtracted_ConsumedItems_Failures(t *testing.T) {
	drunk := uuid.NewString()
	twoMembers := func() *pb.ItemsExtractedEvent {
		event := extractedEvent(potion())
		event.PlayerItems[0].ConsumedItemIds = []string{drunk}
		event.PlayerItems = append(event.PlayerItems, &pb.PlayerItems{
			MemberId: uuid.NewString(), Equipment: &pb.Equipment{}, Inventory: []*pb.Item{potion()},
		})
		return event
	}
	withConsumed := func(ids ...string) *pb.ItemsExtractedEvent {
		event := extractedEvent(potion())
		event.PlayerItems[0].ConsumedItemIds = ids
		return event
	}

	tests := []struct {
		name        string
		repo        func() (Repository, *consumingRepo)
		inbox       *fakeInbox
		event       *pb.ItemsExtractedEvent
		wantErr     error
		wantDeletes int
		wantWrites  string
	}{
		{
			name: "a consumed id that is not a UUID fails the event before any write",
			repo: func() (Repository, *consumingRepo) {
				r := &consumingRepo{extractionRepo: &extractionRepo{}}
				return r, r
			},
			inbox:   &fakeInbox{},
			event:   withConsumed(drunk, "not-a-uuid"),
			wantErr: commonconstants.ErrUUIDCouldNotBeParsed,
		},
		{
			name: "a failed delete fails the event",
			repo: func() (Repository, *consumingRepo) {
				r := &consumingRepo{extractionRepo: &extractionRepo{}, deleteErr: commonconstants.ErrTransient}
				return r, r
			},
			inbox:       &fakeInbox{},
			event:       withConsumed(drunk),
			wantErr:     commonconstants.ErrTransient,
			wantDeletes: 1,
			wantWrites:  "items,loadout,consumed",
		},
		{
			name: "a later member's failed write fails the transaction holding the delete",
			repo: func() (Repository, *consumingRepo) {
				r := &failingSecondUpsertRepo{consumingRepo: &consumingRepo{extractionRepo: &extractionRepo{}}}
				return r, r.consumingRepo
			},
			inbox:       &fakeInbox{},
			event:       twoMembers(),
			wantErr:     commonconstants.ErrLockUnavailable,
			wantDeletes: 1,
			wantWrites:  "items,loadout,consumed,items",
		},
		{
			name: "a redelivered event deletes nothing",
			repo: func() (Repository, *consumingRepo) {
				r := &consumingRepo{extractionRepo: &extractionRepo{}}
				return r, r
			},
			inbox:   &fakeInbox{duplicate: true},
			event:   withConsumed(drunk),
			wantErr: commonconstants.ErrAlreadyProcessed,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo, recorded := tt.repo()
			svc := &service{repo: repo, withTx: runInline, inbox: tt.inbox}

			err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, tt.event)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if len(recorded.deleted) != tt.wantDeletes {
				t.Fatalf("deleted %d times, want %d", len(recorded.deleted), tt.wantDeletes)
			}
			if got := strings.Join(recorded.writes, ","); got != tt.wantWrites {
				t.Fatalf("writes %q, want %q", got, tt.wantWrites)
			}
		})
	}
}
