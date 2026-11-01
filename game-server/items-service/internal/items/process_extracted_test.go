package items

import (
	"bytes"
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// extractionRepo stubs what an extraction's settlement reaches for and records
// every call in order. The embedded interface is nil: anything else the
// service reaches for panics the test.
type extractionRepo struct {
	Repository
	insertErr  error
	loadoutErr error
	releaseErr error

	// stale are the brought-in instance ids the run fence skips: no longer
	// IN_RUN under the event's run id
	stale map[uuid.UUID]bool
	// runOwners are the owners of instances still IN_RUN under the run
	runOwners []uuid.UUID

	inserted []*ItemInstance
	applied  []*ItemInstance
	loadouts []*UpsertPlayerLoadoutRequest
	locked   []uuid.UUID
	released []uuid.UUID
	fenceRun []uuid.UUID
	calls    []string
}

func (r *extractionRepo) LockAccountTx(_ context.Context, _ *sqlx.Tx, member uuid.UUID) error {
	r.calls = append(r.calls, "lock")
	r.locked = append(r.locked, member)
	return nil
}

func (r *extractionRepo) RunItemOwnersTx(_ context.Context, _ *sqlx.Tx, runID uuid.UUID) ([]uuid.UUID, error) {
	r.calls = append(r.calls, "owners")
	return r.runOwners, nil
}

func (r *extractionRepo) InsertItemInstancesTx(_ context.Context, _ *sqlx.Tx, items []*ItemInstance) error {
	r.calls = append(r.calls, "insert")
	r.inserted = append(r.inserted, items...)
	return r.insertErr
}

func (r *extractionRepo) ApplyRunItemsTx(_ context.Context, _ *sqlx.Tx, member, runID uuid.UUID, items []*ItemInstance) ([]uuid.UUID, error) {
	r.calls = append(r.calls, "apply")
	r.fenceRun = append(r.fenceRun, runID)
	var ids []uuid.UUID
	for _, item := range items {
		if item.OwnerMemberID != member || r.stale[item.ID] {
			continue
		}
		r.applied = append(r.applied, item)
		ids = append(ids, item.ID)
	}
	return ids, nil
}

func (r *extractionRepo) UpsertPlayerLoadoutTx(_ context.Context, _ *sqlx.Tx, req *UpsertPlayerLoadoutRequest) error {
	r.calls = append(r.calls, "loadout")
	r.loadouts = append(r.loadouts, req)
	return r.loadoutErr
}

func (r *extractionRepo) ReleaseRunTx(_ context.Context, _ *sqlx.Tx, runID uuid.UUID) (int64, error) {
	r.calls = append(r.calls, "release")
	r.released = append(r.released, runID)
	return 0, r.releaseErr
}

// stored counts the rows written: finds inserted and brought-in items applied.
func (r *extractionRepo) stored() int { return len(r.inserted) + len(r.applied) }

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
		SessionId: uuid.NewString(),
		EventId:   uuid.NewString(),
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
			repo:    &extractionRepo{insertErr: commonconstants.ErrConstraintViolation},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrConstraintViolation,
			stored:  1,
		},
		{
			name:    "a transient store failure stays transient",
			repo:    &extractionRepo{insertErr: commonconstants.ErrTransient},
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
			name:    "a release failure fails the batch",
			repo:    &extractionRepo{releaseErr: commonconstants.ErrLockUnavailable},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrLockUnavailable,
			stored:  1,
		},
		{
			name: "a malformed run id fails the event before anything is written",
			repo: &extractionRepo{},
			event: func() *pb.ItemsExtractedEvent {
				e := extractedEvent(potion())
				e.SessionId = "not-a-uuid"
				return e
			}(),
			wantErr: commonconstants.ErrUUIDCouldNotBeParsed,
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
			if tt.repo.stored() != tt.stored {
				t.Errorf("stored %d rows, want %d", tt.repo.stored(), tt.stored)
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
	if repo.stored() != 2 {
		t.Fatalf("stored %d rows, want the 2 satchel items", repo.stored())
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
			if repo.stored() != 2 {
				t.Errorf("stored %d items, want the worn sword and the satchel potion", repo.stored())
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

// orderedRepo notes what had happened before settlement's first statement,
// the first account lock.
type orderedRepo struct {
	*extractionRepo
	before func()
	called bool
}

func (r *orderedRepo) LockAccountTx(ctx context.Context, tx *sqlx.Tx, member uuid.UUID) error {
	if !r.called {
		r.called = true
		r.before()
	}
	return r.extractionRepo.LockAccountTx(ctx, tx, member)
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
			if len(repo.calls) != 0 {
				t.Fatalf("settlement calls %v, want none", repo.calls)
			}
		})
	}
}

// broughtIn is an item the delver carried into the run: it has an instance id.
func broughtIn(name, itemType string) *pb.Item {
	return &pb.Item{InstanceId: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: itemType, Name: name}
}

func instanceID(item *pb.Item) uuid.UUID { return uuid.MustParse(item.GetInstanceId()) }

// FS-18Z5F R26-R29: under the run id the event carries, a find is inserted, a
// brought-in item is applied through the run fence (a bag item back to the
// bag, a worn one keeping its location), the loadout is written, and then
// everything still IN_RUN under the run is released, a member absent from the
// event included.
func TestProcessItemsExtracted_SettlesTheRun(t *testing.T) {
	runA, absent := uuid.New(), uuid.New()
	sword, scroll, find := broughtIn("Barrow Blade", "weapon"), broughtIn("Scroll", "consumable"), potion()
	event := extractedEvent(find, scroll)
	event.SessionId = runA.String()
	event.PlayerItems[0].Equipment = &pb.Equipment{Weapon: sword}
	repo := &extractionRepo{runOwners: []uuid.UUID{absent}}
	svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}

	if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(repo.inserted) != 1 || repo.inserted[0].Name != find.Name {
		t.Errorf("inserted %v, want only the find", repo.inserted)
	}
	applied := map[uuid.UUID]*ItemInstance{}
	for _, item := range repo.applied {
		applied[item.ID] = item
	}
	if len(applied) != 2 || applied[instanceID(sword)] == nil || applied[instanceID(scroll)] == nil {
		t.Fatalf("applied %v, want the sword and the scroll", repo.applied)
	}
	if got := applied[instanceID(scroll)].Location; got != LocationBag {
		t.Errorf("bag scroll location = %q, want %q", got, LocationBag)
	}
	if got := applied[instanceID(sword)].Location; got != "" {
		t.Errorf("worn sword location = %q, want none (kept as stored)", got)
	}
	for _, run := range repo.fenceRun {
		if run != runA {
			t.Errorf("fenced under %v, want the event's run %v", run, runA)
		}
	}
	if len(repo.loadouts) != 1 || repo.loadouts[0].WeaponInstanceID == nil || *repo.loadouts[0].WeaponInstanceID != instanceID(sword) {
		t.Errorf("loadouts %v, want one wearing the sword", repo.loadouts)
	}
	if len(repo.released) != 1 || repo.released[0] != runA {
		t.Errorf("released %v, want run A once", repo.released)
	}
	if last := repo.calls[len(repo.calls)-1]; last != "release" {
		t.Errorf("calls = %v, want the release last", repo.calls)
	}
}

// FS-18Z5F R27, R28: a brought-in item the run no longer owns (re-tagged by a
// later checkout) is skipped, so the member's loadout is stale and left as
// stored; their finds are still inserted and the run still released.
func TestProcessItemsExtracted_FenceSkip_KeepsTheStoredLoadout(t *testing.T) {
	sword, find := broughtIn("Barrow Blade", "weapon"), potion()
	event := extractedEvent(find)
	event.PlayerItems[0].Equipment = &pb.Equipment{Weapon: sword}
	repo := &extractionRepo{stale: map[uuid.UUID]bool{instanceID(sword): true}}
	svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}

	if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(repo.applied) != 0 {
		t.Errorf("applied %v, want the stale sword skipped", repo.applied)
	}
	if len(repo.inserted) != 1 {
		t.Errorf("inserted %d, want the find", len(repo.inserted))
	}
	if len(repo.loadouts) != 0 {
		t.Errorf("wrote the loadout %v, want it left as stored", repo.loadouts)
	}
	if len(repo.released) != 1 {
		t.Errorf("released %v, want the run released", repo.released)
	}
}

// Settlement takes the account lock of every member it may write, the event's
// members and the owners of instances still IN_RUN under the run, once each,
// in member-id order, before any write: checkouts and loadout writes take the
// same lock first, so the two serialize instead of deadlocking.
func TestProcessItemsExtracted_LocksEveryAccountOnceInOrderBeforeWriting(t *testing.T) {
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	slices.SortFunc(ids, func(a, b uuid.UUID) int { return bytes.Compare(a[:], b[:]) })
	first, second, third := ids[0], ids[1], ids[2]

	event := extractedEvent(potion())
	event.PlayerItems[0].MemberId = third.String()
	event.PlayerItems = append(event.PlayerItems, &pb.PlayerItems{MemberId: first.String(), Inventory: []*pb.Item{potion()}})
	repo := &extractionRepo{runOwners: []uuid.UUID{second, first}}
	svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}

	if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !slices.Equal(repo.locked, ids) {
		t.Errorf("locked %v, want %v", repo.locked, ids)
	}
	if got := strings.Join(repo.calls[:4], ","); got != "owners,lock,lock,lock" {
		t.Errorf("calls = %v, want the run's owners read and every lock taken before any write", repo.calls)
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

// settlementFixture settles extraction events against a migrated items DB.
type settlementFixture struct {
	ctx context.Context
	db  *sqlx.DB
	svc *service
}

func (f settlementFixture) settle(t *testing.T, runID uuid.UUID, players ...*pb.PlayerItems) {
	t.Helper()
	event := &pb.ItemsExtractedEvent{SessionId: runID.String(), EventId: uuid.NewString(), PlayerItems: players}
	if err := f.svc.ProcessItemsExtracted(f.ctx, uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
		t.Fatalf("settle run %s: %v", runID, err)
	}
}

// carried is a seeded instance as an extraction carries it back out.
func (f settlementFixture) carried(t *testing.T, id uuid.UUID) *pb.Item {
	t.Helper()
	item := f.find(t, id)
	item.InstanceId = id.String()
	return item
}

// find is an item found in the run, on the template of seeded instance like.
func (f settlementFixture) find(t *testing.T, like uuid.UUID) *pb.Item {
	t.Helper()
	var template uuid.UUID
	if err := f.db.GetContext(f.ctx, &template, `SELECT template_id FROM item_instances WHERE id = $1`, like); err != nil {
		t.Fatalf("template of %s: %v", like, err)
	}
	return &pb.Item{TemplateId: template.String(), ItemType: "weapon", Name: "Test Blade", AttackPower: 6, CriticalRate: 0.08, WeaponType: "sword"}
}

// cleanUpAfter deletes whatever settlement wrote for owners. Registered after
// the seeds, so it runs before their cleanups delete the templates.
func (f settlementFixture) cleanUpAfter(t *testing.T, owners ...uuid.UUID) {
	t.Cleanup(func() {
		_, _ = f.db.ExecContext(f.ctx, `DELETE FROM item_instances WHERE owner_member_id = ANY($1)`, pq.Array(owners))
		_, _ = f.db.ExecContext(f.ctx, `DELETE FROM player_loadouts WHERE member_id = ANY($1)`, pq.Array(owners))
	})
}

func (f settlementFixture) wornWeapon(t *testing.T, member uuid.UUID) *uuid.UUID {
	t.Helper()
	var weapon *uuid.UUID
	if err := f.db.GetContext(f.ctx, &weapon, `SELECT weapon_instance_id FROM player_loadouts WHERE member_id = $1`, member); err != nil {
		t.Fatalf("loadout of %s: %v", member, err)
	}
	return weapon
}

func (f settlementFixture) owned(t *testing.T, member uuid.UUID) int {
	t.Helper()
	var n int
	if err := f.db.GetContext(f.ctx, &n, `SELECT COUNT(*) FROM item_instances WHERE owner_member_id = $1`, member); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

// expectHome checks id came home: AVAILABLE, no run id, kept at location.
func expectHome(t *testing.T, ctx context.Context, db *sqlx.DB, id uuid.UUID, location string) {
	t.Helper()
	s := runStateOf(t, ctx, db, id)
	_, at := locationOf(t, ctx, db, id)
	if s.Status != itemStatusAvailable || s.RunID != nil || at != location {
		t.Errorf("%s = %+v at %s, want AVAILABLE, no run id, at %s", id, s, at, location)
	}
}

// Opt-in and committed like TestCheckOutRunGear_AgainstTheSchema. Settlement's
// fence and release against a real schema (FS-18Z5F R26-R31).
func TestProcessItemsExtracted_AgainstTheSchema(t *testing.T) {
	ctx, db := catalogueDB(t)
	f := settlementFixture{ctx: ctx, db: db, svc: NewService(NewRepository(db), db, nil, nil, &fakeInbox{})}

	t.Run("a find goes to the bag; brought-in items come home; the loadout is written", func(t *testing.T) {
		member, runA := uuid.New(), uuid.New()
		sword := seedInRun(t, ctx, db, member, LocationStash, runA) // legacy worn: stash location
		wear(t, ctx, db, member, sword)
		dagger := seedInRun(t, ctx, db, member, LocationStash, runA) // unequipped in the run
		f.cleanUpAfter(t, member)

		f.settle(t, runA, &pb.PlayerItems{
			MemberId:  member.String(),
			Equipment: &pb.Equipment{Weapon: f.carried(t, sword)},
			Inventory: []*pb.Item{f.carried(t, dagger), f.find(t, sword)},
		})

		expectHome(t, ctx, db, sword, LocationStash) // worn: keeps its location
		expectHome(t, ctx, db, dagger, LocationBag)  // carried out in the bag
		if got := f.owned(t, member); got != 3 {
			t.Fatalf("member owns %d instances, want the sword, the dagger and the find", got)
		}
		var find struct {
			Status   string     `db:"status"`
			Location string     `db:"location"`
			RunID    *uuid.UUID `db:"run_id"`
		}
		if err := db.GetContext(ctx, &find,
			`SELECT status, location, run_id FROM item_instances WHERE owner_member_id = $1 AND id <> ALL($2)`,
			member, pq.Array([]uuid.UUID{sword, dagger})); err != nil {
			t.Fatalf("read find: %v", err)
		}
		if find.Status != itemStatusAvailable || find.Location != LocationBag || find.RunID != nil {
			t.Errorf("find = %+v, want AVAILABLE in the bag, no run id", find)
		}
		if weapon := f.wornWeapon(t, member); weapon == nil || *weapon != sword {
			t.Errorf("weapon = %v, want the sword", weapon)
		}
	})

	t.Run("an item re-tagged by a later run is skipped and the stored loadout kept", func(t *testing.T) {
		member, runA, runB := uuid.New(), uuid.New(), uuid.New()
		sword := seedInRun(t, ctx, db, member, LocationBag, runB)
		wear(t, ctx, db, member, sword)
		f.cleanUpAfter(t, member)
		before := runStateOf(t, ctx, db, sword)

		// run A's late settlement: the sword unequipped, a find in the bag
		f.settle(t, runA, &pb.PlayerItems{
			MemberId:  member.String(),
			Equipment: &pb.Equipment{},
			Inventory: []*pb.Item{f.carried(t, sword), f.find(t, sword)},
		})

		if now := runStateOf(t, ctx, db, sword); !now.same(before) {
			t.Errorf("sword = %+v, want untouched %+v (IN_RUN under run B)", now, before)
		}
		if weapon := f.wornWeapon(t, member); weapon == nil || *weapon != sword {
			t.Errorf("weapon = %v, want the stored loadout's sword", weapon)
		}
		if got := f.owned(t, member); got != 2 {
			t.Errorf("member owns %d instances, want the sword and the find", got)
		}
	})

	t.Run("a member absent from the event is released, location unchanged", func(t *testing.T) {
		member, absent, runA := uuid.New(), uuid.New(), uuid.New()
		ring := seedInRun(t, ctx, db, absent, LocationStash, runA)
		potion := seedInRun(t, ctx, db, absent, LocationBag, runA)
		elsewhere := seedInRun(t, ctx, db, absent, LocationBag, uuid.New())
		f.cleanUpAfter(t, member, absent)

		f.settle(t, runA, &pb.PlayerItems{MemberId: member.String(), Equipment: &pb.Equipment{}})

		expectHome(t, ctx, db, ring, LocationStash)
		expectHome(t, ctx, db, potion, LocationBag)
		if s := runStateOf(t, ctx, db, elsewhere); s.Status != itemStatusInRun {
			t.Errorf("another run's item = %+v, want still IN_RUN", s)
		}
		var left int
		if err := db.GetContext(ctx, &left, `SELECT COUNT(*) FROM item_instances WHERE run_id = $1`, runA); err != nil {
			t.Fatalf("count: %v", err)
		}
		if left != 0 {
			t.Errorf("%d instances still carry run A's id", left)
		}
	})

	t.Run("a field visit's id settles like a run's", func(t *testing.T) {
		member, visit := uuid.New(), uuid.New()
		potion := seedInRun(t, ctx, db, member, LocationBag, visit)
		f.cleanUpAfter(t, member)

		f.settle(t, visit, &pb.PlayerItems{MemberId: member.String(), Equipment: &pb.Equipment{}, Inventory: []*pb.Item{f.carried(t, potion)}})

		expectHome(t, ctx, db, potion, LocationBag)
	})

	t.Run("re-settling a settled run writes nothing", func(t *testing.T) {
		member, runA := uuid.New(), uuid.New()
		sword := seedInRun(t, ctx, db, member, LocationBag, runA)
		wear(t, ctx, db, member, sword)
		f.cleanUpAfter(t, member)
		extraction := &pb.PlayerItems{MemberId: member.String(), Equipment: &pb.Equipment{Weapon: f.carried(t, sword)}}
		f.settle(t, runA, extraction)

		itemBefore := runStateOf(t, ctx, db, sword)
		var loadoutBefore, loadoutAfter time.Time
		if err := db.GetContext(ctx, &loadoutBefore, `SELECT updated_at FROM player_loadouts WHERE member_id = $1`, member); err != nil {
			t.Fatalf("loadout: %v", err)
		}

		f.settle(t, runA, extraction)

		if now := runStateOf(t, ctx, db, sword); !now.same(itemBefore) {
			t.Errorf("sword = %+v, want unchanged %+v", now, itemBefore)
		}
		if err := db.GetContext(ctx, &loadoutAfter, `SELECT updated_at FROM player_loadouts WHERE member_id = $1`, member); err != nil {
			t.Fatalf("loadout: %v", err)
		}
		if !loadoutAfter.Equal(loadoutBefore) {
			t.Errorf("loadout rewritten at %v, want left as at %v", loadoutAfter, loadoutBefore)
		}
	})
}

// consumingRepo records the consumed-item deletes a settlement makes, in the
// call order extractionRepo keeps, so the delete's place can be shown.
type consumingRepo struct {
	*extractionRepo
	deleteErr error
	deleted   []consumedDelete
}

type consumedDelete struct {
	memberID, runID uuid.UUID
	ids             []uuid.UUID
	tx              *sqlx.Tx
}

func (r *consumingRepo) DeleteConsumedItemInstancesTx(_ context.Context, tx *sqlx.Tx, memberID, runID uuid.UUID, ids []uuid.UUID) (int64, error) {
	r.calls = append(r.calls, "consumed")
	r.deleted = append(r.deleted, consumedDelete{memberID, runID, ids, tx})
	return int64(len(ids)), r.deleteErr
}

// A drunk potion is reported as a consumed item; settlement deletes exactly
// those instances, fenced by the run, in the event's transaction: after every
// member is stored and before the run is released, loadout known or not
// (FS-P9G8R R17-R19; FS-18Z5F *Merge overlap*).
func TestProcessItemsExtracted_ConsumedItems_DeletedBeforeRelease(t *testing.T) {
	tests := []struct {
		name           string
		loadoutUnknown bool
		secondMember   bool
		wantCalls      string
	}{
		{name: "loadout known", wantCalls: "owners,lock,insert,apply,loadout,consumed,release"},
		{name: "loadout unknown", loadoutUnknown: true, wantCalls: "owners,lock,insert,apply,consumed,release"},
		{name: "after every member is stored", secondMember: true, wantCalls: "owners,lock,lock,insert,apply,loadout,insert,apply,loadout,consumed,release"},
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
			if tt.secondMember {
				event.PlayerItems = append(event.PlayerItems, &pb.PlayerItems{
					MemberId: uuid.NewString(), Equipment: &pb.Equipment{}, Inventory: []*pb.Item{potion()},
				})
			}
			member := uuid.MustParse(event.PlayerItems[0].MemberId)
			runID := uuid.MustParse(event.SessionId)

			if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(repo.deleted) != 1 {
				t.Fatalf("deleted %d times, want once", len(repo.deleted))
			}
			got := repo.deleted[0]
			if got.memberID != member || got.runID != runID || got.tx != tx {
				t.Fatalf("deleted for %s under run %s in tx %p, want %s under %s in the event's tx", got.memberID, got.runID, got.tx, member, runID)
			}
			if len(got.ids) != 2 || got.ids[0] != drunk1 || got.ids[1] != drunk2 {
				t.Fatalf("deleted %v, want [%s %s]", got.ids, drunk1, drunk2)
			}
			if calls := strings.Join(repo.calls, ","); calls != tt.wantCalls {
				t.Fatalf("calls %q, want %q", calls, tt.wantCalls)
			}
		})
	}
}

// An event with nothing consumed, including one from a producer that predates
// the field, settles exactly as before: no delete is made (FS-P9G8R R20).
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
		})
	}
}

// The delete shares the event's fate: a malformed consumed id fails the event
// before anything is written, a failed delete fails it before the release, a
// release failing after the delete fails the transaction holding it, and a
// redelivered event deletes nothing more (FS-P9G8R R17, R20, R21; FS-BVM9H).
func TestProcessItemsExtracted_ConsumedItems_Failures(t *testing.T) {
	drunk := uuid.NewString()
	withConsumed := func(ids ...string) *pb.ItemsExtractedEvent {
		event := extractedEvent(potion())
		event.PlayerItems[0].ConsumedItemIds = ids
		return event
	}

	tests := []struct {
		name        string
		repo        *consumingRepo
		inbox       *fakeInbox
		event       *pb.ItemsExtractedEvent
		wantErr     error
		wantDeletes int
		wantCalls   string
	}{
		{
			name:    "a consumed id that is not a UUID fails the event before any write",
			repo:    &consumingRepo{extractionRepo: &extractionRepo{}},
			inbox:   &fakeInbox{},
			event:   withConsumed(drunk, "not-a-uuid"),
			wantErr: commonconstants.ErrUUIDCouldNotBeParsed,
		},
		{
			name:        "a failed delete fails the event before the release",
			repo:        &consumingRepo{extractionRepo: &extractionRepo{}, deleteErr: commonconstants.ErrTransient},
			inbox:       &fakeInbox{},
			event:       withConsumed(drunk),
			wantErr:     commonconstants.ErrTransient,
			wantDeletes: 1,
			wantCalls:   "owners,lock,insert,apply,loadout,consumed",
		},
		{
			name:        "a failed release fails the transaction holding the delete",
			repo:        &consumingRepo{extractionRepo: &extractionRepo{releaseErr: commonconstants.ErrLockUnavailable}},
			inbox:       &fakeInbox{},
			event:       withConsumed(drunk),
			wantErr:     commonconstants.ErrLockUnavailable,
			wantDeletes: 1,
			wantCalls:   "owners,lock,insert,apply,loadout,consumed,release",
		},
		{
			name:    "a redelivered event deletes nothing",
			repo:    &consumingRepo{extractionRepo: &extractionRepo{}},
			inbox:   &fakeInbox{duplicate: true},
			event:   withConsumed(drunk),
			wantErr: commonconstants.ErrAlreadyProcessed,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &service{repo: tt.repo, withTx: runInline, inbox: tt.inbox}

			err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, tt.event)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if len(tt.repo.deleted) != tt.wantDeletes {
				t.Fatalf("deleted %d times, want %d", len(tt.repo.deleted), tt.wantDeletes)
			}
			if calls := strings.Join(tt.repo.calls, ","); calls != tt.wantCalls {
				t.Fatalf("calls %q, want %q", calls, tt.wantCalls)
			}
		})
	}
}
