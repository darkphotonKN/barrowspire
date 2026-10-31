package items

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// checkoutRepo stubs what a checkout reaches for, in a transaction run inline,
// and records the order the calls come in. The embedded interface is nil:
// anything else the service reaches for panics the test.
type checkoutRepo struct {
	Repository
	loadout    *Loadout
	checkedOut []*ItemInstance
	err        error

	calls     []string
	lockedFor uuid.UUID
	runID     uuid.UUID
}

func (r *checkoutRepo) LockAccountTx(_ context.Context, _ *sqlx.Tx, member uuid.UUID) error {
	r.calls = append(r.calls, "lock")
	r.lockedFor = member
	return nil
}

func (r *checkoutRepo) LoadoutTx(context.Context, *sqlx.Tx, uuid.UUID) (*Loadout, error) {
	r.calls = append(r.calls, "loadout")
	return r.loadout, nil
}

func (r *checkoutRepo) CheckOutRunGearTx(_ context.Context, _ *sqlx.Tx, _, runID uuid.UUID) ([]*ItemInstance, error) {
	r.calls = append(r.calls, "checkout")
	r.runID = runID
	return r.checkedOut, r.err
}

func inRun(name string) *ItemInstance {
	return &ItemInstance{ID: uuid.New(), Name: name, Status: itemStatusInRun}
}

// FS-18Z5F R7, R11: under the account lock, the loadout is read and the gear
// checked out under the run id; worn instances come back in their slots and
// the rest as the bag, in the order the checkout gives them.
func TestServiceCheckOutRunGear_SeatsWornInSlotsAndTheRestInTheBag(t *testing.T) {
	member, runID := uuid.New(), uuid.New()
	sword, ring, potion, scroll := inRun("Sword"), inRun("Ring"), inRun("Potion"), inRun("Scroll")
	listedHelm := uuid.New() // worn, but stayed home: the checkout did not return it
	repo := &checkoutRepo{
		loadout:    &Loadout{MemberId: &member, WeaponId: &sword.ID, Ring2Id: &ring.ID, HeadId: &listedHelm},
		checkedOut: []*ItemInstance{potion, sword, scroll, ring},
	}
	svc := &service{repo: repo, withTx: runInline}

	got, err := svc.CheckOutRunGear(context.Background(), member, &CheckOutRunGearRequest{MemberID: member, RunID: runID})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got.Loadout.Weapon != sword || got.Loadout.Ring2 != ring {
		t.Errorf("weapon, ring_2 = %v, %v; want the sword and the ring", got.Loadout.Weapon, got.Loadout.Ring2)
	}
	if got.Loadout.Head != nil {
		t.Errorf("head = %v, want an empty slot for the item that stayed home", got.Loadout.Head)
	}
	if len(got.Bag) != 2 || got.Bag[0] != potion || got.Bag[1] != scroll {
		t.Errorf("bag = %v, want [potion scroll]", got.Bag)
	}
	if strings.Join(repo.calls, ",") != "lock,loadout,checkout" {
		t.Errorf("calls = %v, want lock, loadout, checkout", repo.calls)
	}
	if repo.lockedFor != member || repo.runID != runID {
		t.Errorf("locked %v under run %v, want %v under %v", repo.lockedFor, repo.runID, member, runID)
	}
}

// FS-18Z5F R6, R11: another member's gear is refused before the repository is
// reached; a member with no loadout row checks out an empty loadout and their
// bag; a store failure is an error, never an empty checkout.
func TestServiceCheckOutRunGear_Refusals(t *testing.T) {
	member := uuid.New()
	potion := inRun("Potion")
	dbDown := errors.New("connection refused")

	tests := []struct {
		name      string
		caller    uuid.UUID
		repo      *checkoutRepo
		wantErr   error
		wantBag   int
		wantCalls string
	}{
		{name: "another member's gear is refused and nothing is touched", caller: uuid.New(),
			repo: &checkoutRepo{}, wantErr: commonconstants.ErrForbidden},
		{name: "no loadout row checks out an empty loadout and the bag", caller: member,
			repo: &checkoutRepo{loadout: &Loadout{}, checkedOut: []*ItemInstance{potion}}, wantBag: 1,
			wantCalls: "lock,loadout,checkout"},
		{name: "a store failure is returned", caller: member,
			repo: &checkoutRepo{loadout: &Loadout{}, err: dbDown}, wantErr: dbDown,
			wantCalls: "lock,loadout,checkout"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &service{repo: tt.repo, withTx: runInline}

			got, err := svc.CheckOutRunGear(context.Background(), tt.caller, &CheckOutRunGearRequest{MemberID: member, RunID: uuid.New()})

			if strings.Join(tt.repo.calls, ",") != tt.wantCalls {
				t.Errorf("calls = %v, want %q", tt.repo.calls, tt.wantCalls)
			}
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) || got != nil {
					t.Fatalf("got %v, %v; want nothing and %v", got, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if *got.Loadout != (LoadoutWithItems{}) || len(got.Bag) != tt.wantBag {
				t.Errorf("loadout, bag = %+v, %v; want empty slots and %d bag items", got.Loadout, got.Bag, tt.wantBag)
			}
		})
	}
}

// fakeCheckoutService serves CheckOutRunGear only and records whether it was
// called; any other call panics on the nil embedded interface.
type fakeCheckoutService struct {
	Service
	gear   *RunGear
	err    error
	called bool
	got    *CheckOutRunGearRequest
}

func (f *fakeCheckoutService) CheckOutRunGear(_ context.Context, _ uuid.UUID, req *CheckOutRunGearRequest) (*RunGear, error) {
	f.called, f.got = true, req
	return f.gear, f.err
}

// FS-18Z5F §API surface: malformed or missing ids are InvalidArgument and reach
// nothing; a store that is down is Unavailable; anything else is Internal.
func TestHandler_CheckOutRunGear_Errors(t *testing.T) {
	member := uuid.New()
	ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: member})
	tests := []struct {
		name       string
		req        *pb.CheckOutRunGearRequest
		err        error
		wantCode   codes.Code
		wantCalled bool
	}{
		{name: "malformed member id", req: &pb.CheckOutRunGearRequest{MemberId: "nope", RunId: uuid.NewString()}, wantCode: codes.InvalidArgument},
		{name: "missing run id", req: &pb.CheckOutRunGearRequest{MemberId: member.String()}, wantCode: codes.InvalidArgument},
		{name: "malformed run id", req: &pb.CheckOutRunGearRequest{MemberId: member.String(), RunId: "nope"}, wantCode: codes.InvalidArgument},
		{name: "nil run id", req: &pb.CheckOutRunGearRequest{MemberId: member.String(), RunId: uuid.Nil.String()}, wantCode: codes.InvalidArgument},
		{name: "store down", req: &pb.CheckOutRunGearRequest{MemberId: member.String(), RunId: uuid.NewString()},
			err: fmt.Errorf("check out: %w", commonconstants.ErrTransient), wantCode: codes.Unavailable, wantCalled: true},
		{name: "anything else", req: &pb.CheckOutRunGearRequest{MemberId: member.String(), RunId: uuid.NewString()},
			err: errors.New("boom"), wantCode: codes.Internal, wantCalled: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeCheckoutService{err: tt.err}

			_, err := NewHandler(svc, nil).CheckOutRunGear(ctx, tt.req)

			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
			}
			if svc.called != tt.wantCalled {
				t.Errorf("service called = %v, want %v", svc.called, tt.wantCalled)
			}
		})
	}
}

// FS-18Z5F R5, R11: the worn instances go out in their slots, an empty slot
// absent, and the bag as a list, each carrying its IN_RUN status.
func TestHandler_CheckOutRunGear_MapsTheGear(t *testing.T) {
	member, runID := uuid.New(), uuid.New()
	sword, potion, scroll := inRun("Sword"), inRun("Potion"), inRun("Scroll")
	svc := &fakeCheckoutService{gear: &RunGear{
		Loadout: &LoadoutWithItems{Weapon: sword},
		Bag:     []*ItemInstance{potion, scroll},
	}}
	ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: member})

	res, err := NewHandler(svc, nil).CheckOutRunGear(ctx, &pb.CheckOutRunGearRequest{MemberId: member.String(), RunId: runID.String()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if svc.got.MemberID != member || svc.got.RunID != runID {
		t.Errorf("service got %+v, want member %v and run %v", svc.got, member, runID)
	}
	weapon := res.GetLoadout().GetWeapon()
	if weapon.GetId() != sword.ID.String() || weapon.GetStatus() != itemStatusInRun {
		t.Errorf("weapon = %v, want the sword IN_RUN", weapon)
	}
	if res.GetLoadout().GetHead() != nil {
		t.Errorf("head = %v, want absent", res.GetLoadout().GetHead())
	}
	bag := res.GetBag()
	if len(bag) != 2 || bag[0].GetId() != potion.ID.String() || bag[1].GetId() != scroll.ID.String() {
		t.Errorf("bag = %v, want [potion scroll]", bag)
	}
}

// seedInRun seeds an instance for owner kept at location, already IN_RUN
// under runID.
func seedInRun(t *testing.T, ctx context.Context, db *sqlx.DB, owner uuid.UUID, location string, runID uuid.UUID) uuid.UUID {
	t.Helper()
	id := seedAt(t, ctx, db, owner, "AVAILABLE", location)
	if _, err := db.ExecContext(ctx, `UPDATE item_instances SET status = 'IN_RUN', run_id = $2 WHERE id = $1`, id, runID); err != nil {
		t.Fatalf("seed in run: %v", err)
	}
	return id
}

// runState is an instance's status, run fence and last write.
type runState struct {
	Status    string     `db:"status"`
	RunID     *uuid.UUID `db:"run_id"`
	UpdatedAt time.Time  `db:"updated_at"`
}

func runStateOf(t *testing.T, ctx context.Context, db *sqlx.DB, id uuid.UUID) runState {
	t.Helper()
	var s runState
	if err := db.GetContext(ctx, &s, `SELECT status, run_id, updated_at FROM item_instances WHERE id = $1`, id); err != nil {
		t.Fatalf("read back %s: %v", id, err)
	}
	return s
}

func (s runState) inRun(runID uuid.UUID) bool {
	return s.Status == itemStatusInRun && s.RunID != nil && *s.RunID == runID
}

// same compares by value: RunID is a pointer, so == would compare addresses.
func (s runState) same(o runState) bool {
	sameRun := (s.RunID == nil) == (o.RunID == nil) && (s.RunID == nil || *s.RunID == *o.RunID)
	return s.Status == o.Status && sameRun && s.UpdatedAt.Equal(o.UpdatedAt)
}

func bagIDs(gear *RunGear) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(gear.Bag))
	for _, item := range gear.Bag {
		ids = append(ids, item.ID)
	}
	return ids
}

// Opt-in: runs only with ITEMS_TEST_DSN pointing at a migrated items DB. The
// run fence's constraint: an instance is IN_RUN exactly when it carries a run
// id (FS-18Z5F R2).
func TestItemInstances_InRunIffRunID(t *testing.T) {
	ctx, db := catalogueDB(t)
	id := seedAt(t, ctx, db, uuid.New(), "AVAILABLE", LocationBag)

	checkViolation := func(t *testing.T, err error) {
		t.Helper()
		var pqErr *pq.Error
		if !errors.As(err, &pqErr) || pqErr.Code != "23514" {
			t.Errorf("err = %v, want a check violation", err)
		}
	}
	t.Run("IN_RUN without a run id is refused", func(t *testing.T) {
		_, err := db.ExecContext(ctx, `UPDATE item_instances SET status = 'IN_RUN' WHERE id = $1`, id)
		checkViolation(t, err)
	})
	t.Run("a run id on an AVAILABLE item is refused", func(t *testing.T) {
		_, err := db.ExecContext(ctx, `UPDATE item_instances SET run_id = $2 WHERE id = $1`, id, uuid.New())
		checkViolation(t, err)
	})
	t.Run("IN_RUN with a run id is accepted", func(t *testing.T) {
		if _, err := db.ExecContext(ctx, `UPDATE item_instances SET status = 'IN_RUN', run_id = $2 WHERE id = $1`, id, uuid.New()); err != nil {
			t.Errorf("err = %v, want none", err)
		}
	})
}

// Opt-in and committed like TestMoveItemInstance_AgainstTheSchema. The
// checkout's conditional writes against a real schema (FS-18Z5F R7-R11).
func TestCheckOutRunGear_AgainstTheSchema(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	checkOut := func(t *testing.T, member, runID uuid.UUID) *RunGear {
		t.Helper()
		gear, err := svc.CheckOutRunGear(ctx, member, &CheckOutRunGearRequest{MemberID: member, RunID: runID})
		if err != nil {
			t.Fatalf("checkout: %v", err)
		}
		return gear
	}

	t.Run("worn and bag items go in; stash, listed and settling stay home", func(t *testing.T) {
		owner, runA := uuid.New(), uuid.New()
		sword := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash) // legacy worn: stash location
		wear(t, ctx, db, owner, sword)
		potion := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		stashed := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		listed := seedAt(t, ctx, db, owner, "LISTED", LocationBag)
		settling := seedAt(t, ctx, db, owner, "PENDING_SETTLEMENT", LocationBag)
		someoneElses := seedAt(t, ctx, db, uuid.New(), "AVAILABLE", LocationBag)

		gear := checkOut(t, owner, runA)

		if gear.Loadout.Weapon == nil || gear.Loadout.Weapon.ID != sword || gear.Loadout.Weapon.Status != itemStatusInRun {
			t.Errorf("weapon = %+v, want the sword IN_RUN", gear.Loadout.Weapon)
		}
		if ids := bagIDs(gear); len(ids) != 1 || ids[0] != potion || gear.Bag[0].Status != itemStatusInRun {
			t.Errorf("bag = %v, want only the potion, IN_RUN", ids)
		}
		for _, id := range []uuid.UUID{sword, potion} {
			if s := runStateOf(t, ctx, db, id); !s.inRun(runA) {
				t.Errorf("%s = %+v, want IN_RUN under run A", id, s)
			}
		}
		for id, want := range map[uuid.UUID]string{stashed: "AVAILABLE", listed: "LISTED", settling: "PENDING_SETTLEMENT", someoneElses: "AVAILABLE"} {
			if s := runStateOf(t, ctx, db, id); s.Status != want || s.RunID != nil {
				t.Errorf("%s = %+v, want untouched %s", id, s, want)
			}
		}

		// the owner's list reads IN_RUN rows as they are (R4)
		items, err := NewRepository(db).ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for _, item := range items {
			if (item.ID == sword || item.ID == potion) && item.Status != itemStatusInRun {
				t.Errorf("listed %s status = %q, want IN_RUN", item.Name, item.Status)
			}
		}
	})

	t.Run("a listed worn item is an empty slot and stays listed", func(t *testing.T) {
		owner := uuid.New()
		sword := seedAt(t, ctx, db, owner, "LISTED", LocationBag)
		wear(t, ctx, db, owner, sword)

		gear := checkOut(t, owner, uuid.New())

		if gear.Loadout.Weapon != nil || len(gear.Bag) != 0 {
			t.Errorf("weapon, bag = %+v, %v; want nothing", gear.Loadout.Weapon, bagIDs(gear))
		}
		if s := runStateOf(t, ctx, db, sword); s.Status != "LISTED" || s.RunID != nil {
			t.Errorf("sword = %+v, want still LISTED", s)
		}
	})

	t.Run("run B re-tags what run A left IN_RUN and returns the worn and bag ones", func(t *testing.T) {
		owner, runA, runB := uuid.New(), uuid.New(), uuid.New()
		sword := seedInRun(t, ctx, db, owner, LocationStash, runA)
		wear(t, ctx, db, owner, sword)
		potion := seedInRun(t, ctx, db, owner, LocationBag, runA)
		stashedOrphan := seedInRun(t, ctx, db, owner, LocationStash, runA)

		gear := checkOut(t, owner, runB)

		if gear.Loadout.Weapon == nil || gear.Loadout.Weapon.ID != sword {
			t.Errorf("weapon = %+v, want the sword", gear.Loadout.Weapon)
		}
		if ids := bagIDs(gear); len(ids) != 1 || ids[0] != potion {
			t.Errorf("bag = %v, want the potion", ids)
		}
		for _, id := range []uuid.UUID{sword, potion, stashedOrphan} {
			if s := runStateOf(t, ctx, db, id); !s.inRun(runB) {
				t.Errorf("%s = %+v, want re-tagged to run B", id, s)
			}
		}
	})

	// updated_at is stamped by the item_instances BEFORE UPDATE trigger
	// (migration 000005), like every other status write; this pins that the
	// checkout and the reclaim both move it.
	t.Run("the checkout and the reclaim stamp updated_at", func(t *testing.T) {
		owner, runA, runB := uuid.New(), uuid.New(), uuid.New()
		potion := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		orphan := seedInRun(t, ctx, db, owner, LocationStash, runA)
		seeded := map[uuid.UUID]runState{potion: runStateOf(t, ctx, db, potion), orphan: runStateOf(t, ctx, db, orphan)}

		checkOut(t, owner, runB)

		for id, was := range seeded {
			if now := runStateOf(t, ctx, db, id); !now.UpdatedAt.After(was.UpdatedAt) {
				t.Errorf("%s updated_at = %v, want after %v", id, now.UpdatedAt, was.UpdatedAt)
			}
		}
	})

	t.Run("a repeat checkout under the same run returns the same set and writes nothing", func(t *testing.T) {
		owner, runA := uuid.New(), uuid.New()
		sword := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		wear(t, ctx, db, owner, sword)
		potion := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)

		first := checkOut(t, owner, runA)
		before := map[uuid.UUID]runState{sword: runStateOf(t, ctx, db, sword), potion: runStateOf(t, ctx, db, potion)}
		again := checkOut(t, owner, runA)

		if again.Loadout.Weapon == nil || again.Loadout.Weapon.ID != first.Loadout.Weapon.ID {
			t.Errorf("weapon = %+v, want %v again", again.Loadout.Weapon, first.Loadout.Weapon.ID)
		}
		if ids := bagIDs(again); len(ids) != 1 || ids[0] != potion {
			t.Errorf("bag = %v, want the potion again", ids)
		}
		for id, was := range before {
			if now := runStateOf(t, ctx, db, id); !now.same(was) {
				t.Errorf("%s = %+v, want unchanged %+v", id, now, was)
			}
		}
	})

	t.Run("another member's checkout is refused and writes nothing", func(t *testing.T) {
		owner := uuid.New()
		potion := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)

		_, err := svc.CheckOutRunGear(ctx, uuid.New(), &CheckOutRunGearRequest{MemberID: owner, RunID: uuid.New()})

		if !errors.Is(err, commonconstants.ErrForbidden) {
			t.Fatalf("err = %v, want forbidden", err)
		}
		if s := runStateOf(t, ctx, db, potion); s.Status != "AVAILABLE" || s.RunID != nil {
			t.Errorf("potion = %+v, want untouched", s)
		}
	})

	t.Run("no loadout row checks out an empty loadout and a bag over 30 in full", func(t *testing.T) {
		owner := uuid.New()
		for range BagCapacity + 3 {
			seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		}

		gear := checkOut(t, owner, uuid.New())

		if *gear.Loadout != (LoadoutWithItems{}) {
			t.Errorf("loadout = %+v, want empty", gear.Loadout)
		}
		if len(gear.Bag) != BagCapacity+3 {
			t.Errorf("bag = %d items, want %d", len(gear.Bag), BagCapacity+3)
		}
	})
}

// listingRepo reserves the item for a listing, committed on its own
// connection, after the checkout has read the loadout and before it writes:
// a listing never takes the account lock, so this is the race it can win.
type listingRepo struct {
	*repository
	db     *sqlx.DB
	seller uuid.UUID
	itemID uuid.UUID
}

func (r *listingRepo) LoadoutTx(ctx context.Context, tx *sqlx.Tx, member uuid.UUID) (*Loadout, error) {
	err := commonutils.ExecTx(ctx, r.db, nil, func(listing *sqlx.Tx) error {
		_, err := r.ReserveItemTx(ctx, listing, r.seller, r.itemID, uuid.New(), time.Now(), time.Now())
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("reserve mid-checkout: %w", err)
	}
	return r.repository.LoadoutTx(ctx, tx, member)
}

// Opt-in and committed. A listing and a checkout racing for one item: whichever
// writes first wins and the other misses, so the item is never both listed and
// in the run (FS-18Z5F §Edge States "Concurrent list and checkout").
func TestCheckOutRunGear_RacingAListing(t *testing.T) {
	ctx, db := catalogueDB(t)

	t.Run("the listing wins: the item stays home", func(t *testing.T) {
		owner := uuid.New()
		sword := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		wear(t, ctx, db, owner, sword)
		repo := &listingRepo{repository: NewRepository(db), db: db, seller: owner, itemID: sword}

		gear, err := NewService(repo, db, nil, nil, nil).CheckOutRunGear(ctx, owner, &CheckOutRunGearRequest{MemberID: owner, RunID: uuid.New()})
		if err != nil {
			t.Fatalf("checkout: %v", err)
		}

		if gear.Loadout.Weapon != nil {
			t.Errorf("weapon = %+v, want an empty slot", gear.Loadout.Weapon)
		}
		if s := runStateOf(t, ctx, db, sword); s.Status != "LISTED" || s.RunID != nil {
			t.Errorf("sword = %+v, want LISTED", s)
		}
	})

	t.Run("the checkout wins: the listing is refused", func(t *testing.T) {
		owner := uuid.New()
		sword := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		repo := NewRepository(db)
		if _, err := NewService(repo, db, nil, nil, nil).CheckOutRunGear(ctx, owner, &CheckOutRunGearRequest{MemberID: owner, RunID: uuid.New()}); err != nil {
			t.Fatalf("checkout: %v", err)
		}

		err := commonutils.ExecTx(ctx, db, nil, func(tx *sqlx.Tx) error {
			_, err := repo.ReserveItemTx(ctx, tx, owner, sword, uuid.New(), time.Now(), time.Now())
			return err
		})

		if !errors.Is(err, ErrItemNotReservable) {
			t.Errorf("reserve = %v, want ErrItemNotReservable", err)
		}
	})
}

// Opt-in and committed. The checkout takes the member's account lock, so it
// waits for a move or loadout write holding it (FS-18Z5F R7, FS-VPD8Y R11).
func TestCheckOutRunGear_WaitsForTheAccountLock(t *testing.T) {
	ctx, db := catalogueDB(t)
	repo := NewRepository(db)
	owner := uuid.New()
	potion := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)

	holder, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = holder.Rollback() }()
	if err := repo.LockAccountTx(ctx, holder, owner); err != nil {
		t.Fatalf("lock: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		_, err := NewService(repo, db, nil, nil, nil).CheckOutRunGear(ctx, owner, &CheckOutRunGearRequest{MemberID: owner, RunID: uuid.New()})
		done <- err
	}()

	select {
	case err := <-done:
		t.Fatalf("checkout finished under someone else's account lock: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	if s := runStateOf(t, ctx, db, potion); s.Status != "AVAILABLE" {
		t.Errorf("potion = %+v before the lock is released, want AVAILABLE", s)
	}

	if err := holder.Commit(); err != nil {
		t.Fatalf("release: %v", err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("checkout: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("checkout still waiting after the lock was released")
	}
	if s := runStateOf(t, ctx, db, potion); s.Status != itemStatusInRun {
		t.Errorf("potion = %+v, want IN_RUN", s)
	}
}
