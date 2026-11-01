package items

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// Opt-in: runs only with ITEMS_TEST_DSN pointing at a migrated items DB.
// Everything happens in one transaction that is rolled back. A find is
// inserted in the bag (FS-VPD8Y R9, FS-18Z5F R27), and the insert never
// writes an existing row: there is no conflict path left for a row the run
// fence skipped.
func TestInsertItemInstancesTx_Executes(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer func() { _ = db.Close() }()

	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	var rarityID uuid.UUID
	if err := tx.GetContext(ctx, &rarityID, `SELECT id FROM item_rarities ORDER BY sort_order LIMIT 1`); err != nil {
		t.Fatalf("rarity: %v", err)
	}
	weaponID, templateID := uuid.New(), uuid.New()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO weapons (id, rarity_id, attack_power, critical_rate, weapon_type) VALUES ($1, $2, 6, 0.08, 'sword')`,
		weaponID, rarityID); err != nil {
		t.Fatalf("weapon: %v", err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, required_level) VALUES ($1, 'Test Blade', $2, 'weapon', $3, 1)`,
		templateID, rarityID, weaponID); err != nil {
		t.Fatalf("template: %v", err)
	}

	attack, crit, wtype := 6, 0.08, "sword"
	item := &ItemInstance{
		ID: uuid.New(), TemplateID: templateID, OwnerMemberID: uuid.New(), Source: "extracted",
		ItemType: "weapon", Name: "Test Blade", RarityID: &rarityID,
		AttackPower: &attack, CriticalRate: &crit, WeaponType: &wtype, Status: "AVAILABLE",
		Location: LocationStash,
	}

	repo := NewRepository(db)
	if err := repo.InsertItemInstancesTx(ctx, tx, []*ItemInstance{item}); err != nil {
		t.Fatalf("insert: %v", err)
	}
	var row struct {
		Location string     `db:"location"`
		RunID    *uuid.UUID `db:"run_id"`
	}
	if err := tx.GetContext(ctx, &row, `SELECT location, run_id FROM item_instances WHERE id = $1`, item.ID); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if row.Location != LocationBag || row.RunID != nil {
		t.Errorf("find = %+v, want the bag and no run id", row)
	}

	if _, err := tx.ExecContext(ctx, `SAVEPOINT again`); err != nil {
		t.Fatalf("savepoint: %v", err)
	}
	if err := repo.InsertItemInstancesTx(ctx, tx, []*ItemInstance{item}); !errors.Is(err, commonconstants.ErrDuplicateResource) {
		t.Errorf("re-insert = %v, want a duplicate, never a write over the stored row", err)
	}
}

// Opt-in like the test above, but committed: FreezeItem runs on the pool, not a
// caller's tx, so seeded rows are deleted on cleanup. FreezeItem is settlement step 0b: one conditional
// write, LISTED -> PENDING_SETTLEMENT, guarded on both status and owner.
func TestFreezeItem(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	seller, stranger := uuid.New(), uuid.New()
	earlier := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name       string
		status     string
		owner      uuid.UUID
		caller     uuid.UUID
		skipSeed   bool
		wantFrozen bool
		wantStatus string
		// an already-frozen item must come back untouched, updated_at included
		wantUpdatedAtKept bool
	}{
		{name: "listed item owned by seller freezes", status: "LISTED", owner: seller, caller: seller, wantFrozen: true, wantStatus: "PENDING_SETTLEMENT"},
		{name: "already frozen for seller is success and changes nothing", status: "PENDING_SETTLEMENT", owner: seller, caller: seller, wantFrozen: true, wantStatus: "PENDING_SETTLEMENT", wantUpdatedAtKept: true},
		{name: "listed item owned by someone else is refused", status: "LISTED", owner: stranger, caller: seller, wantStatus: "LISTED"},
		{name: "frozen item owned by someone else is refused", status: "PENDING_SETTLEMENT", owner: stranger, caller: seller, wantStatus: "PENDING_SETTLEMENT"},
		{name: "available item was unlisted, refused", status: "AVAILABLE", owner: seller, caller: seller, wantStatus: "AVAILABLE"},
		{name: "missing item is refused", caller: seller, skipSeed: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			itemID := uuid.New()
			if !tt.skipSeed {
				seedItemInstance(t, ctx, db, itemID, tt.owner, tt.status, earlier)
			}

			frozen, err := NewRepository(db).FreezeItem(ctx, itemID, tt.caller)
			if err != nil {
				t.Fatalf("freeze: %v", err)
			}
			if frozen != tt.wantFrozen {
				t.Errorf("frozen = %v, want %v", frozen, tt.wantFrozen)
			}
			if tt.skipSeed {
				return
			}

			var row struct {
				Status    string    `db:"status"`
				UpdatedAt time.Time `db:"updated_at"`
			}
			if err := db.GetContext(ctx, &row, `SELECT status, updated_at FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
			}
			if row.Status != tt.wantStatus {
				t.Errorf("status = %q, want %q", row.Status, tt.wantStatus)
			}
			if tt.wantUpdatedAtKept && !row.UpdatedAt.Equal(earlier) {
				t.Errorf("updated_at = %v, want untouched %v", row.UpdatedAt, earlier)
			}
		})
	}
}

// Opt-in and committed like TestFreezeItem. TransferItem is settlement step 4
// (FS-NXP1W Req 31): PENDING_SETTLEMENT for this listing -> the buyer's,
// AVAILABLE, listing_id cleared, recorded in item_transfers in the same
// transaction. Already applied is that record, not the item's current state, so
// it holds whatever the buyer has done with the item since (crash point #11).
// A purchase lands in the buyer's stash (FS-VPD8Y R7); every seed starts in the
// bag, so a refusal or an already-applied retry reads bag.
func TestTransferItem(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	seller, buyer, nextOwner := uuid.New(), uuid.New(), uuid.New()
	earlier := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	const (
		thisListing  = "this"
		otherListing = "other"
		noListing    = ""
	)

	tests := []struct {
		name    string
		status  string
		owner   uuid.UUID
		listing string
		// recorded: an earlier attempt already transferred for this listing
		recorded        bool
		skipSeed        bool
		wantTransferred bool
		wantStatus      string
		wantOwner       uuid.UUID
		wantListing     string
		// wantStash: the transfer itself happened in this call
		wantStash bool
	}{
		{name: "frozen for this listing moves to the buyer's stash, unfreezes and is recorded", status: "PENDING_SETTLEMENT", owner: seller, listing: thisListing,
			wantTransferred: true, wantStatus: "AVAILABLE", wantOwner: buyer, wantListing: noListing, wantStash: true},
		{name: "already transferred is success and changes nothing", status: "AVAILABLE", owner: buyer, listing: noListing, recorded: true,
			wantTransferred: true, wantStatus: "AVAILABLE", wantOwner: buyer, wantListing: noListing},
		{name: "already transferred and relisted by the buyer is still success", status: "LISTED", owner: buyer, listing: otherListing, recorded: true,
			wantTransferred: true, wantStatus: "LISTED", wantOwner: buyer, wantListing: otherListing},
		{name: "already transferred and frozen by the buyer's own sale is success and left alone", status: "PENDING_SETTLEMENT", owner: buyer, listing: otherListing, recorded: true,
			wantTransferred: true, wantStatus: "PENDING_SETTLEMENT", wantOwner: buyer, wantListing: otherListing},
		{name: "already transferred and sold on to someone else is still success", status: "AVAILABLE", owner: nextOwner, listing: noListing, recorded: true,
			wantTransferred: true, wantStatus: "AVAILABLE", wantOwner: nextOwner, wantListing: noListing},
		{name: "frozen for another listing is refused, left alone and not recorded", status: "PENDING_SETTLEMENT", owner: seller, listing: otherListing,
			wantStatus: "PENDING_SETTLEMENT", wantOwner: seller, wantListing: otherListing},
		{name: "listed but never frozen is refused and not recorded", status: "LISTED", owner: seller, listing: thisListing,
			wantStatus: "LISTED", wantOwner: seller, wantListing: thisListing},
		{name: "missing item is refused and not recorded", skipSeed: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			itemID, listingID, otherListingID := uuid.New(), uuid.New(), uuid.New()
			listingFor := map[string]*uuid.UUID{thisListing: &listingID, otherListing: &otherListingID, noListing: nil}
			t.Cleanup(func() {
				db.ExecContext(ctx, `DELETE FROM item_transfers WHERE listing_id = $1`, listingID)
			})

			if !tt.skipSeed {
				seedItemInstance(t, ctx, db, itemID, tt.owner, tt.status, earlier)
				if _, err := db.ExecContext(ctx, `UPDATE item_instances SET listing_id = $2 WHERE id = $1`, itemID, listingFor[tt.listing]); err != nil {
					t.Fatalf("seed listing_id: %v", err)
				}
			}
			if tt.recorded {
				if _, err := db.ExecContext(ctx,
					`INSERT INTO item_transfers (listing_id, item_id, buyer_member_id) VALUES ($1, $2, $3)`,
					listingID, itemID, buyer); err != nil {
					t.Fatalf("seed transfer record: %v", err)
				}
			}

			transferred, err := NewRepository(db).TransferItem(ctx, itemID, buyer, listingID)
			if err != nil {
				t.Fatalf("transfer: %v", err)
			}
			if transferred != tt.wantTransferred {
				t.Errorf("transferred = %v, want %v", transferred, tt.wantTransferred)
			}

			// the record exists exactly when the transfer happened: a refusal rolls
			// it back with the write it would have described
			var record struct {
				ItemID uuid.UUID `db:"item_id"`
				Buyer  uuid.UUID `db:"buyer_member_id"`
			}
			err = db.GetContext(ctx, &record, `SELECT item_id, buyer_member_id FROM item_transfers WHERE listing_id = $1`, listingID)
			switch {
			case tt.wantTransferred && err != nil:
				t.Errorf("transfer record: %v, want one for the listing", err)
			case tt.wantTransferred && (record.ItemID != itemID || record.Buyer != buyer):
				t.Errorf("transfer record = (item %v, buyer %v), want (%v, %v)", record.ItemID, record.Buyer, itemID, buyer)
			case !tt.wantTransferred && !errors.Is(err, sql.ErrNoRows):
				t.Errorf("transfer record lookup = %v, want none for a refused transfer", err)
			}

			if tt.skipSeed {
				return
			}

			var row struct {
				Status    string     `db:"status"`
				Owner     uuid.UUID  `db:"owner_member_id"`
				ListingID *uuid.UUID `db:"listing_id"`
				Location  string     `db:"location"`
			}
			if err := db.GetContext(ctx, &row, `SELECT status, owner_member_id, listing_id, location FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
			}
			if row.Status != tt.wantStatus {
				t.Errorf("status = %q, want %q", row.Status, tt.wantStatus)
			}
			if row.Owner != tt.wantOwner {
				t.Errorf("owner = %v, want %v", row.Owner, tt.wantOwner)
			}
			wantLocation := LocationBag
			if tt.wantStash {
				wantLocation = LocationStash
			}
			if row.Location != wantLocation {
				t.Errorf("location = %q, want %q", row.Location, wantLocation)
			}
			want := listingFor[tt.wantListing]
			switch {
			case want == nil && row.ListingID != nil:
				t.Errorf("listing_id = %v, want NULL", *row.ListingID)
			case want != nil && (row.ListingID == nil || *row.ListingID != *want):
				t.Errorf("listing_id = %v, want %v", row.ListingID, *want)
			}
		})
	}
}

// Opt-in and committed like TestFreezeItem. UnfreezeItem is items' share of the
// pre-pivot rollback (FS-NXP1W Req 12): the item goes back to its seller,
// AVAILABLE, listing_id cleared — but only while it is still this listing's
// (Req 24a). It is retried without a cap, so every outcome is success; a row it
// does not match is already applied or no longer this settlement's to touch.
func TestUnfreezeItem(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	seller, stranger := uuid.New(), uuid.New()
	earlier := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	const (
		thisListing  = "this"
		otherListing = "other"
		noListing    = ""
	)

	tests := []struct {
		name        string
		status      string
		owner       uuid.UUID
		listing     string
		skipSeed    bool
		wantStatus  string
		wantListing string
		// a row the rollback does not match must come back untouched, updated_at included
		wantUpdatedAtKept bool
		// still reserved for this listing yet unmatched is an invariant breach: it
		// stays frozen with nothing else to free it, so it has to leave a trace
		wantWarn bool
	}{
		{name: "frozen for this listing goes back to the seller", status: "PENDING_SETTLEMENT", owner: seller, listing: thisListing,
			wantStatus: "AVAILABLE", wantListing: noListing},
		{name: "listed for this listing but never frozen goes back too", status: "LISTED", owner: seller, listing: thisListing,
			wantStatus: "AVAILABLE", wantListing: noListing},
		{name: "already back with the seller is success and changes nothing", status: "AVAILABLE", owner: seller, listing: noListing,
			wantStatus: "AVAILABLE", wantListing: noListing, wantUpdatedAtKept: true},
		{name: "relisted under another listing is left alone", status: "LISTED", owner: seller, listing: otherListing,
			wantStatus: "LISTED", wantListing: otherListing, wantUpdatedAtKept: true},
		{name: "frozen for another listing is left alone", status: "PENDING_SETTLEMENT", owner: seller, listing: otherListing,
			wantStatus: "PENDING_SETTLEMENT", wantListing: otherListing, wantUpdatedAtKept: true},
		{name: "owned by someone else is left alone, and warned about", status: "PENDING_SETTLEMENT", owner: stranger, listing: thisListing,
			wantStatus: "PENDING_SETTLEMENT", wantListing: thisListing, wantUpdatedAtKept: true, wantWarn: true},
		{name: "missing item is nothing to do", skipSeed: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			itemID, listingID, otherListingID := uuid.New(), uuid.New(), uuid.New()
			listingFor := map[string]*uuid.UUID{thisListing: &listingID, otherListing: &otherListingID, noListing: nil}

			if !tt.skipSeed {
				// listing_id at INSERT: updated_at is trigger-stamped on any UPDATE,
				// so seeding it afterwards would hide whether the rollback touched the row
				seedItemInstanceForListing(t, ctx, db, itemID, tt.owner, tt.status, earlier, listingFor[tt.listing])
			}

			var logs bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
			t.Cleanup(func() { slog.SetDefault(prev) })

			if err := NewRepository(db).UnfreezeItem(ctx, itemID, seller, listingID); err != nil {
				t.Fatalf("unfreeze: %v", err)
			}
			if warned := strings.Contains(logs.String(), "level=WARN"); warned != tt.wantWarn {
				t.Errorf("warned = %v, want %v; logs: %s", warned, tt.wantWarn, logs.String())
			}
			if tt.skipSeed {
				return
			}

			var row struct {
				Status    string     `db:"status"`
				Owner     uuid.UUID  `db:"owner_member_id"`
				ListingID *uuid.UUID `db:"listing_id"`
				UpdatedAt time.Time  `db:"updated_at"`
				Location  string     `db:"location"`
			}
			if err := db.GetContext(ctx, &row, `SELECT status, owner_member_id, listing_id, updated_at, location FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
			}
			if row.Location != LocationBag {
				t.Errorf("location = %q, want %q: a rollback keeps where the item was (FS-VPD8Y R8)", row.Location, LocationBag)
			}
			if row.Status != tt.wantStatus {
				t.Errorf("status = %q, want %q", row.Status, tt.wantStatus)
			}
			if row.Owner != tt.owner {
				t.Errorf("owner = %v, want %v: the rollback never changes hands", row.Owner, tt.owner)
			}
			want := listingFor[tt.wantListing]
			switch {
			case want == nil && row.ListingID != nil:
				t.Errorf("listing_id = %v, want NULL", *row.ListingID)
			case want != nil && (row.ListingID == nil || *row.ListingID != *want):
				t.Errorf("listing_id = %v, want %v", row.ListingID, *want)
			}
			if tt.wantUpdatedAtKept && !row.UpdatedAt.Equal(earlier) {
				t.Errorf("updated_at = %v, want untouched %v", row.UpdatedAt, earlier)
			}
		})
	}
}

func seedItemInstance(t *testing.T, ctx context.Context, db *sqlx.DB, itemID, owner uuid.UUID, status string, updatedAt time.Time) {
	t.Helper()
	seedItemInstanceAtLevel(t, ctx, db, itemID, owner, status, updatedAt, 1)
}

// seedItemInstanceAtLevel seeds an instance whose template requires level.
func seedItemInstanceAtLevel(t *testing.T, ctx context.Context, db *sqlx.DB, itemID, owner uuid.UUID, status string, updatedAt time.Time, level int) {
	t.Helper()
	seedItem(t, ctx, db, itemID, owner, status, updatedAt, level, nil)
}

// seedItemInstanceForListing seeds an instance already reserved for listingID
// (nil for none), written in the INSERT so updated_at stays as given.
func seedItemInstanceForListing(t *testing.T, ctx context.Context, db *sqlx.DB, itemID, owner uuid.UUID, status string, updatedAt time.Time, listingID *uuid.UUID) {
	t.Helper()
	seedItem(t, ctx, db, itemID, owner, status, updatedAt, 1, listingID)
}

func seedItem(t *testing.T, ctx context.Context, db *sqlx.DB, itemID, owner uuid.UUID, status string, updatedAt time.Time, level int, listingID *uuid.UUID) {
	t.Helper()

	var rarityID uuid.UUID
	if err := db.GetContext(ctx, &rarityID, `SELECT id FROM item_rarities ORDER BY sort_order LIMIT 1`); err != nil {
		t.Fatalf("rarity: %v", err)
	}
	weaponID, templateID := uuid.New(), uuid.New()
	if _, err := db.ExecContext(ctx,
		`INSERT INTO weapons (id, rarity_id, attack_power, critical_rate, weapon_type) VALUES ($1, $2, 6, 0.08, 'sword')`,
		weaponID, rarityID); err != nil {
		t.Fatalf("weapon: %v", err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, required_level) VALUES ($1, 'Test Blade', $2, 'weapon', $3, $4)`,
		templateID, rarityID, weaponID, level); err != nil {
		t.Fatalf("template: %v", err)
	}
	t.Cleanup(func() {
		// children first: instance -> template -> weapon
		db.ExecContext(ctx, `DELETE FROM item_instances WHERE id = $1`, itemID)
		db.ExecContext(ctx, `DELETE FROM item_templates WHERE id = $1`, templateID)
		db.ExecContext(ctx, `DELETE FROM weapons WHERE id = $1`, weaponID)
	})
	// seeded in the bag, not the column's STASH default, so a write that moves
	// it to the stash (a transfer, FS-VPD8Y R7) is visible, and so is one that
	// must leave it alone (R8)
	if _, err := db.ExecContext(ctx,
		`INSERT INTO item_instances (id, template_id, owner_member_id, source, item_type, name, rarity_id, attack_power, critical_rate, weapon_type, status, updated_at, listing_id, location)
		 VALUES ($1, $2, $3, 'extracted', 'weapon', 'Test Blade', $4, 6, 0.08, 'sword', $5, $6, $7, $8)`,
		itemID, templateID, owner, rarityID, status, updatedAt, listingID, LocationBag); err != nil {
		t.Fatalf("item instance: %v", err)
	}
}

// Opt-in: runs only with ITEMS_TEST_DSN. ListItemInstances reads through the
// pool rather than a transaction, so the seed is committed and deleted in
// cleanup instead of rolled back.
func TestListItemInstances_ReturnsStatus(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	owner := uuid.New()
	listedID, availableID, frozenID := uuid.New(), uuid.New(), uuid.New()
	earlier := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	seedItemInstance(t, ctx, db, listedID, owner, "LISTED", earlier)
	seedItemInstance(t, ctx, db, availableID, owner, "AVAILABLE", earlier)
	seedItemInstance(t, ctx, db, frozenID, owner, "PENDING_SETTLEMENT", earlier)

	items, err := NewRepository(db).ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	got := map[uuid.UUID]string{}
	for _, it := range items {
		got[it.ID] = it.Status
	}
	want := map[uuid.UUID]string{listedID: "LISTED", availableID: "AVAILABLE", frozenID: "PENDING_SETTLEMENT"}
	for id, status := range want {
		if got[id] != status {
			t.Errorf("instance %s status = %q, want %q", id, got[id], status)
		}
	}
}

// Opt-in like TestListItemInstances_ReturnsStatus. Both instance reads carry
// where the owner keeps each item (FS-VPD8Y R14).
func TestItemInstanceReads_CarryLocation(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	owner := uuid.New()
	bagID, stashID := uuid.New(), uuid.New()
	earlier := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	seedItemInstance(t, ctx, db, bagID, owner, "AVAILABLE", earlier)
	seedItemInstance(t, ctx, db, stashID, owner, "LISTED", earlier)
	if _, err := db.ExecContext(ctx, `UPDATE item_instances SET location = $2 WHERE id = $1`, stashID, LocationStash); err != nil {
		t.Fatalf("seed stash location: %v", err)
	}
	want := map[uuid.UUID]string{bagID: LocationBag, stashID: LocationStash}

	repo := NewRepository(db)
	items, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	got := map[uuid.UUID]string{}
	for _, it := range items {
		got[it.ID] = it.Location
	}
	for id, location := range want {
		if got[id] != location {
			t.Errorf("ListItemInstances: instance %s location = %q, want %q", id, got[id], location)
		}
		item, err := repo.GetItemInstanceByID(ctx, id)
		if err != nil || item == nil {
			t.Fatalf("GetItemInstanceByID(%s) = %v, %v", id, item, err)
		}
		if item.Location != location {
			t.Errorf("GetItemInstanceByID: instance %s location = %q, want %q", id, item.Location, location)
		}
	}
}

// Opt-in and committed like TestFreezeItem. A listing that ends unsold or is
// cancelled gives the item back where it was (FS-VPD8Y R8): seeded in the bag,
// it reads bag again once AVAILABLE.
func TestListingRelease_KeepsLocation(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	tests := []struct {
		name    string
		release func(r *repository, itemID, listingID uuid.UUID) error
	}{
		{name: "returned unsold", release: func(r *repository, itemID, listingID uuid.UUID) error {
			return r.ReturnItem(ctx, itemID, listingID)
		}},
		{name: "reservation cancelled", release: func(r *repository, itemID, _ uuid.UUID) error {
			_, err := r.CancelReservation(ctx, itemID)
			return err
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			itemID, listingID := uuid.New(), uuid.New()
			seedItemInstanceForListing(t, ctx, db, itemID, uuid.New(), "LISTED", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), &listingID)

			if err := tt.release(NewRepository(db), itemID, listingID); err != nil {
				t.Fatalf("release: %v", err)
			}

			var row struct {
				Status   string `db:"status"`
				Location string `db:"location"`
			}
			if err := db.GetContext(ctx, &row, `SELECT status, location FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
			}
			if row.Status != "AVAILABLE" || row.Location != LocationBag {
				t.Errorf("status, location = %q, %q, want AVAILABLE, %q", row.Status, row.Location, LocationBag)
			}
		})
	}
}

// Opt-in like TestFreezeItem. ReserveItemTx is AVAILABLE -> LISTED and stamps the
// listing ID the service minted (FS-NXP1W Req 24a); a refused reserve leaves the
// row's listing_id untouched.
func TestReserveItemTx_SetsListingID(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	seller, stranger := uuid.New(), uuid.New()
	earlier := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name          string
		status        string
		owner         uuid.UUID
		wantReserved  bool
		wantStatus    string
		wantListingID bool
	}{
		{name: "available item owned by seller is listed with the minted id", status: "AVAILABLE", owner: seller, wantReserved: true, wantStatus: "LISTED", wantListingID: true},
		{name: "already listed item is refused and keeps no new id", status: "LISTED", owner: seller, wantStatus: "LISTED"},
		{name: "available item owned by someone else is refused", status: "AVAILABLE", owner: stranger, wantStatus: "AVAILABLE"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			itemID, listingID := uuid.New(), uuid.New()
			seedItemInstance(t, ctx, db, itemID, tt.owner, tt.status, earlier)

			tx, err := db.BeginTxx(ctx, nil)
			if err != nil {
				t.Fatalf("begin: %v", err)
			}
			now := time.Now()
			item, err := NewRepository(db).ReserveItemTx(ctx, tx, seller, itemID, listingID, now, now)
			if tt.wantReserved {
				if err != nil {
					tx.Rollback()
					t.Fatalf("reserve: %v", err)
				}
				if item.ListingID == nil || *item.ListingID != listingID {
					t.Errorf("returned ListingID = %v, want %v", item.ListingID, listingID)
				}
			} else if !errors.Is(err, ErrItemNotReservable) {
				tx.Rollback()
				t.Fatalf("err = %v, want ErrItemNotReservable", err)
			}
			if err := tx.Commit(); err != nil {
				t.Fatalf("commit: %v", err)
			}

			var row struct {
				Status    string     `db:"status"`
				ListingID *uuid.UUID `db:"listing_id"`
				Location  string     `db:"location"`
			}
			if err := db.GetContext(ctx, &row, `SELECT status, listing_id, location FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
			}
			if row.Location != LocationBag {
				t.Errorf("location = %q, want %q: listing keeps where the item is (FS-VPD8Y R8)", row.Location, LocationBag)
			}
			if row.Status != tt.wantStatus {
				t.Errorf("status = %q, want %q", row.Status, tt.wantStatus)
			}
			switch {
			case tt.wantListingID && (row.ListingID == nil || *row.ListingID != listingID):
				t.Errorf("listing_id = %v, want %v", row.ListingID, listingID)
			case !tt.wantListingID && row.ListingID != nil:
				t.Errorf("listing_id = %v, want NULL", *row.ListingID)
			}
		})
	}
}

// Opt-in like TestListItemInstances_ReturnsStatus. An instance reports its
// template's required level on both instance reads (FS-BDA7X Req 30).
func TestItemInstances_CarryTemplateRequiredLevel(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer func() { _ = db.Close() }()

	owner, itemID := uuid.New(), uuid.New()
	seedItemInstanceAtLevel(t, ctx, db, itemID, owner, "AVAILABLE", time.Now(), 7)
	repo := NewRepository(db)

	items, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 || items[0].RequiredLevel != 7 {
		t.Fatalf("ListItemInstances = %+v, want one instance at required level 7", items)
	}

	item, err := repo.GetItemInstanceByID(ctx, itemID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if item == nil || item.RequiredLevel != 7 {
		t.Fatalf("GetItemInstanceByID = %+v, want required level 7", item)
	}
}

// Opt-in like TestItemInstances_CarryTemplateRequiredLevel; committed and
// cleaned up because the instance reads go through the pool. FS-4R9M9 R48-52:
// a legacy row reads ilvl 1, no affixes and its template's required level; an
// extracted row keeps its own and every read returns them identically; a
// re-extraction with the same affixes leaves them unchanged.
func TestItemInstances_LevelAffixesAndRequiredLevel(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer func() { _ = db.Close() }()

	owner, legacyID, rolledID, freshID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	seedItemInstanceAtLevel(t, ctx, db, legacyID, owner, "AVAILABLE", time.Now(), 2)
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM item_instances WHERE id = ANY($1)`, pq.Array([]uuid.UUID{rolledID, freshID}))
	})
	repo := NewRepository(db)

	type facts struct {
		itemLevel, requiredLevel int
		affixes                  Affixes
	}
	check := func(t *testing.T, where string, gotLevel, gotRequired int, gotAffixes Affixes, want facts) {
		t.Helper()
		if gotLevel != want.itemLevel || gotRequired != want.requiredLevel || len(gotAffixes) != len(want.affixes) {
			t.Fatalf("%s: ilvl %d, required %d, affixes %+v; want %+v", where, gotLevel, gotRequired, gotAffixes, want)
		}
		for i := range want.affixes {
			if gotAffixes[i] != want.affixes[i] {
				t.Errorf("%s: affix[%d] = %+v, want %+v", where, i, gotAffixes[i], want.affixes[i])
			}
		}
	}
	readAll := func(t *testing.T, id uuid.UUID, want facts) {
		t.Helper()
		items, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		var listed *ItemInstance
		for _, it := range items {
			if it.ID == id {
				listed = it
			}
		}
		if listed == nil {
			t.Fatalf("ListItemInstances: %s missing", id)
		}
		check(t, "ListItemInstances", listed.ItemLevel, listed.RequiredLevel, listed.Affixes, want)

		byID, err := repo.GetItemInstanceByID(ctx, id)
		if err != nil || byID == nil {
			t.Fatalf("get: %v %v", byID, err)
		}
		check(t, "GetItemInstanceByID", byID.ItemLevel, byID.RequiredLevel, byID.Affixes, want)

		summaries, err := repo.GetItemSummaries(ctx, []uuid.UUID{id})
		if err != nil || len(summaries) != 1 {
			t.Fatalf("summaries: %v %v", summaries, err)
		}
		check(t, "GetItemSummaries", summaries[0].ItemLevel, summaries[0].RequiredLevel, summaries[0].Affixes, want)
	}

	t.Run("legacy row reads defaults and its template's required level", func(t *testing.T) {
		readAll(t, legacyID, facts{itemLevel: 1, requiredLevel: 2, affixes: Affixes{}})
	})

	var templateID uuid.UUID
	if err := db.GetContext(ctx, &templateID, `SELECT template_id FROM item_instances WHERE id = $1`, legacyID); err != nil {
		t.Fatalf("template id: %v", err)
	}
	attack, crit, wtype := 6, 0.08, "sword"
	instance := func(id uuid.UUID, ilvl, required int, affixes Affixes) *ItemInstance {
		return &ItemInstance{
			ID: id, TemplateID: templateID, OwnerMemberID: owner, Source: "extracted", Status: "AVAILABLE",
			ItemType: "weapon", Name: "Test Blade", AttackPower: &attack, CriticalRate: &crit, WeaponType: &wtype,
			ItemLevel: ilvl, RequiredLevel: required, Affixes: affixes,
		}
	}
	rolled := Affixes{{Stat: "strength", Tier: 2, Value: 3}, {Stat: "crit_chance", Tier: 1, Value: 1}}
	inTx := func(t *testing.T, fn func(tx *sqlx.Tx) error) {
		t.Helper()
		if err := commonutils.ExecTx(ctx, db, nil, fn); err != nil {
			t.Fatal(err)
		}
	}
	insert := func(t *testing.T, items ...*ItemInstance) {
		t.Helper()
		inTx(t, func(tx *sqlx.Tx) error { return repo.InsertItemInstancesTx(ctx, tx, items) })
	}
	// reextract checks the items out into a run and brings them back out
	// through the run fence (FS-18Z5F R27)
	reextract := func(t *testing.T, items ...*ItemInstance) {
		t.Helper()
		runID := uuid.New()
		inTx(t, func(tx *sqlx.Tx) error {
			for _, item := range items {
				if _, err := tx.ExecContext(ctx, `UPDATE item_instances SET status = 'IN_RUN', run_id = $2 WHERE id = $1`, item.ID, runID); err != nil {
					return fmt.Errorf("check out: %w", err)
				}
			}
			applied, err := repo.ApplyRunItemsTx(ctx, tx, owner, runID, items)
			if err != nil {
				return err
			}
			if len(applied) != len(items) {
				return fmt.Errorf("applied %d of %d", len(applied), len(items))
			}
			return nil
		})
	}

	t.Run("extracted rows keep their own level, required level and affixes", func(t *testing.T) {
		// two new rows in one batch, one with no required level of its own
		// (stored NULL, reads the template's)
		insert(t, instance(rolledID, 9, 6, rolled), instance(freshID, 4, 0, nil))

		readAll(t, rolledID, facts{itemLevel: 9, requiredLevel: 6, affixes: rolled})
		readAll(t, freshID, facts{itemLevel: 4, requiredLevel: 2, affixes: Affixes{}})

		var own *int
		if err := db.GetContext(ctx, &own, `SELECT required_level FROM item_instances WHERE id = $1`, freshID); err != nil {
			t.Fatalf("raw required level: %v", err)
		}
		if own != nil {
			t.Errorf("stored required_level = %d, want NULL", *own)
		}
	})

	t.Run("re-extracting a loadout item with its affixes leaves them unchanged", func(t *testing.T) {
		reextract(t, instance(rolledID, 9, 6, rolled))
		readAll(t, rolledID, facts{itemLevel: 9, requiredLevel: 6, affixes: rolled})
	})

	// the roll is fixed once (R20): an event that does not carry it back, an
	// older producer's zero values, never resets it (I-4R9M9-15)
	t.Run("re-extracting without the roll keeps the stored one", func(t *testing.T) {
		reextract(t, instance(rolledID, 0, 0, nil), instance(legacyID, 0, 0, nil))
		readAll(t, rolledID, facts{itemLevel: 9, requiredLevel: 6, affixes: rolled})
		readAll(t, legacyID, facts{itemLevel: 1, requiredLevel: 2, affixes: Affixes{}})
	})
}

// Every row's placeholders must line up with its arguments; a column count
// that drifts from the argument list breaks any batch of more than one item.
func TestInsertItemsQuery_PlaceholdersMatchArgs(t *testing.T) {
	items := []*ItemInstance{{ItemLevel: 9, RequiredLevel: 6}, {}, {}}

	query, args := insertItemsQuery(items)

	if want := 3 * len(insertItemColumns); len(args) != want {
		t.Fatalf("len(args) = %d, want %d", len(args), want)
	}
	if !strings.Contains(query, fmt.Sprintf("$%d)", len(args))) || strings.Contains(query, fmt.Sprintf("$%d", len(args)+1)) {
		t.Errorf("highest placeholder is not $%d:\n%s", len(args), query)
	}
	for _, item := range items {
		if item.ID == uuid.Nil {
			t.Errorf("an item without an id must be given one")
		}
	}

	row := len(insertItemColumns)
	ilvl, required := args[row-3], args[row-1]
	if ilvl != 9 || required.(*int) == nil || *required.(*int) != 6 {
		t.Errorf("first row ilvl, required = %v, %v, want 9, 6", ilvl, required)
	}
	// second row: no level given stores 1, no own requirement stores NULL
	if args[2*row-3] != 1 || args[2*row-1].(*int) != nil {
		t.Errorf("second row ilvl, required = %v, %v, want 1, NULL", args[2*row-3], args[2*row-1])
	}
}

// A foreign-key violation keeps its SQLSTATE through the repo boundary, so the
// consumer can tell a reference that is not there yet from a malformed event,
// while still reading as a constraint violation to every other caller.
func TestWrapDBErr_ForeignKeyViolationKeepsSQLState(t *testing.T) {
	got := wrapDBErr("insert item instances (tx)", &pq.Error{Code: "23503"})

	if !errors.Is(got, commonconstants.ErrConstraintViolation) {
		t.Fatalf("%v is not a constraint violation", got)
	}
	var pqErr *pq.Error
	if !errors.As(got, &pqErr) || pqErr.Code != "23503" {
		t.Fatalf("%v lost its SQLSTATE 23503", got)
	}
	if o := classify(got); o.disposition != retryBounded {
		t.Fatalf("classified as %v, want %v", o.disposition, retryBounded)
	}
}

// Every other constraint violation is still only the sentinel, and rejected.
func TestWrapDBErr_OtherConstraintViolationIsRejected(t *testing.T) {
	got := wrapDBErr("insert item instances (tx)", &pq.Error{Code: "23502"})

	if !errors.Is(got, commonconstants.ErrConstraintViolation) {
		t.Fatalf("%v is not a constraint violation", got)
	}
	if o := classify(got); o.disposition != reject {
		t.Fatalf("classified as %v, want %v", o.disposition, reject)
	}
}

// seedAt seeds an instance for owner with status, kept at location.
func seedAt(t *testing.T, ctx context.Context, db *sqlx.DB, owner uuid.UUID, status, location string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	seedItemInstance(t, ctx, db, id, owner, status, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	if _, err := db.ExecContext(ctx, `UPDATE item_instances SET location = $2 WHERE id = $1`, id, location); err != nil {
		t.Fatalf("seed location: %v", err)
	}
	return id
}

// wear puts id in owner's weapon slot.
func wear(t *testing.T, ctx context.Context, db *sqlx.DB, owner, id uuid.UUID) {
	t.Helper()
	if _, err := db.ExecContext(ctx, `INSERT INTO player_loadouts (member_id, weapon_instance_id) VALUES ($1, $2)`, owner, id); err != nil {
		t.Fatalf("wear: %v", err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM player_loadouts WHERE member_id = $1`, owner) })
}

func locationOf(t *testing.T, ctx context.Context, db *sqlx.DB, id uuid.UUID) (status, location string) {
	t.Helper()
	var row struct {
		Status   string `db:"status"`
		Location string `db:"location"`
	}
	if err := db.GetContext(ctx, &row, `SELECT status, location FROM item_instances WHERE id = $1`, id); err != nil {
		t.Fatalf("read back %s: %v", id, err)
	}
	return row.Status, row.Location
}

// Opt-in and committed like TestFreezeItem. The move's SQL against a real
// schema: the next list reads where it went (and back), a worn item is worn,
// a foreign item reads as absent, counts exclude worn items and include listed
// ones, and the write refuses anything not AVAILABLE (FS-VPD8Y R4, R10, R12).
func TestMoveItemInstance_AgainstTheSchema(t *testing.T) {
	ctx, db := catalogueDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, db, nil, nil, nil)

	t.Run("moves to the stash and back, and the list reads it", func(t *testing.T) {
		owner := uuid.New()
		id := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)

		for _, to := range []string{LocationStash, LocationBag} {
			got, err := svc.MoveItemInstance(ctx, owner, &MoveItemInstanceRequest{ItemInstanceID: id, Location: to})
			if err != nil || got != to {
				t.Fatalf("move to %s = %q, %v", to, got, err)
			}
			items, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
			if err != nil || len(items) != 1 || items[0].Location != to {
				t.Fatalf("list after move to %s = %+v, %v", to, items, err)
			}
		}
	})

	t.Run("placement reads worn, and nothing for someone else's item", func(t *testing.T) {
		owner := uuid.New()
		worn := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		wear(t, ctx, db, owner, worn)

		err := commonutils.ExecTx(ctx, db, nil, func(tx *sqlx.Tx) error {
			p, err := repo.ItemPlacementTx(ctx, tx, owner, worn)
			if err != nil || p == nil || !p.Worn {
				t.Errorf("own worn item placement = %+v, %v; want worn", p, err)
			}
			p, err = repo.ItemPlacementTx(ctx, tx, uuid.New(), worn)
			if err != nil || p != nil {
				t.Errorf("foreign placement = %+v, %v; want nil, nil", p, err)
			}
			return nil
		})
		if err != nil {
			t.Fatalf("tx: %v", err)
		}
	})

	t.Run("counts exclude worn and include listed", func(t *testing.T) {
		owner := uuid.New()
		seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		seedAt(t, ctx, db, owner, "LISTED", LocationBag)
		seedAt(t, ctx, db, owner, "PENDING_SETTLEMENT", LocationBag)
		wear(t, ctx, db, owner, seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag))
		seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		seedAt(t, ctx, db, uuid.New(), "AVAILABLE", LocationBag) // someone else's

		err := commonutils.ExecTx(ctx, db, nil, func(tx *sqlx.Tx) error {
			if n, err := repo.CountUnwornAtTx(ctx, tx, owner, LocationBag); err != nil || n != 3 {
				t.Errorf("bag count = %d, %v; want 3", n, err)
			}
			if n, err := repo.CountUnwornAtTx(ctx, tx, owner, LocationStash); err != nil || n != 1 {
				t.Errorf("stash count = %d, %v; want 1", n, err)
			}
			return nil
		})
		if err != nil {
			t.Fatalf("tx: %v", err)
		}
	})

	t.Run("the write refuses anything not available, and someone else's", func(t *testing.T) {
		owner := uuid.New()
		for _, status := range []string{"LISTED", "PENDING_SETTLEMENT", "AVAILABLE"} {
			id := seedAt(t, ctx, db, owner, status, LocationBag)
			who := owner
			if status == "AVAILABLE" {
				who = uuid.New()
			}
			err := commonutils.ExecTx(ctx, db, nil, func(tx *sqlx.Tx) error {
				moved, err := repo.MoveItemInstanceTx(ctx, tx, who, id, LocationStash)
				if err != nil || moved {
					t.Errorf("%s by %v: moved = %v, %v; want false", status, who, moved, err)
				}
				return nil
			})
			if err != nil {
				t.Fatalf("tx: %v", err)
			}
			if _, loc := locationOf(t, ctx, db, id); loc != LocationBag {
				t.Errorf("%s location = %q, want it left in the bag", status, loc)
			}
		}
	})
}

// Opt-in and committed. Two concurrent moves into a bag at 29 leave it at 30:
// the account lock serialises them, so the second counts 30 and is refused
// (FS-VPD8Y R11).
func TestMoveItemInstance_ConcurrentMovesIntoABagAt29(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)

	owner := uuid.New()
	for range BagCapacity - 1 {
		seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
	}
	stashed := []uuid.UUID{
		seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash),
		seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash),
	}

	errs := make(chan error, len(stashed))
	start := make(chan struct{})
	for _, id := range stashed {
		go func() {
			<-start
			_, err := svc.MoveItemInstance(ctx, owner, &MoveItemInstanceRequest{ItemInstanceID: id, Location: LocationBag})
			errs <- err
		}()
	}
	close(start)

	var ok, full int
	for range stashed {
		err := <-errs
		var refusal *errcode.Refusal
		switch {
		case err == nil:
			ok++
		case errors.As(err, &refusal) && refusal.Code == errcode.BagFull:
			full++
		default:
			t.Errorf("unexpected error: %v", err)
		}
	}
	if ok != 1 || full != 1 {
		t.Errorf("moved %d, refused BAG_FULL %d; want 1 and 1", ok, full)
	}

	var bag int
	if err := db.GetContext(ctx, &bag, `SELECT COUNT(*) FROM item_instances WHERE owner_member_id = $1 AND location = 'BAG'`, owner); err != nil {
		t.Fatalf("count: %v", err)
	}
	if bag != BagCapacity {
		t.Errorf("bag = %d, want %d", bag, BagCapacity)
	}
}

// reservingRepo reserves the item for a listing, committed on its own
// connection, after the move has read the item as AVAILABLE and before it
// writes: the race a listing can win, since listing never takes the account
// lock.
type reservingRepo struct {
	*repository
	db     *sqlx.DB
	seller uuid.UUID
	itemID uuid.UUID
}

func (r *reservingRepo) CountUnwornAtTx(ctx context.Context, tx *sqlx.Tx, member uuid.UUID, location string) (int, error) {
	err := commonutils.ExecTx(ctx, r.db, nil, func(listing *sqlx.Tx) error {
		_, err := r.ReserveItemTx(ctx, listing, r.seller, r.itemID, uuid.New(), time.Now(), time.Now())
		return err
	})
	if err != nil {
		return 0, fmt.Errorf("reserve mid-move: %w", err)
	}
	return r.repository.CountUnwornAtTx(ctx, tx, member, location)
}

// Opt-in and committed. A move racing a listing never leaves a LISTED item
// with a changed location: the listing wins, the move answers
// ITEM_NOT_AVAILABLE (FS-VPD8Y R10, §Edge States).
func TestMoveItemInstance_LosingARaceToAListing(t *testing.T) {
	ctx, db := catalogueDB(t)

	owner := uuid.New()
	id := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
	repo := &reservingRepo{repository: NewRepository(db), db: db, seller: owner, itemID: id}

	_, err := NewService(repo, db, nil, nil, nil).MoveItemInstance(ctx, owner, &MoveItemInstanceRequest{ItemInstanceID: id, Location: LocationStash})

	var refusal *errcode.Refusal
	if !errors.As(err, &refusal) || refusal.Code != errcode.ItemNotAvailable {
		t.Fatalf("err = %v, want ITEM_NOT_AVAILABLE", err)
	}
	if status, loc := locationOf(t, ctx, db, id); status != "LISTED" || loc != LocationBag {
		t.Errorf("status, location = %q, %q; want LISTED, %q", status, loc, LocationBag)
	}
}

// bagOf counts owner's unworn bag items, as a loadout write counts them.
func bagOf(t *testing.T, ctx context.Context, db *sqlx.DB, owner uuid.UUID) int {
	t.Helper()
	var n int
	err := commonutils.ExecTx(ctx, db, nil, func(tx *sqlx.Tx) error {
		var err error
		n, err = NewRepository(db).CountUnwornAtTx(ctx, tx, owner, LocationBag)
		return err
	})
	if err != nil {
		t.Fatalf("count bag: %v", err)
	}
	return n
}

// weaponOf reads the instance in owner's weapon slot, nil when empty.
func weaponOf(t *testing.T, ctx context.Context, db *sqlx.DB, owner uuid.UUID) *uuid.UUID {
	t.Helper()
	loadout, err := NewRepository(db).GetLoadout(ctx, &GetLoadoutRequest{MemberId: owner})
	if err != nil {
		t.Fatalf("read loadout: %v", err)
	}
	return loadout.WeaponId
}

// Opt-in and committed like TestMoveItemInstance_AgainstTheSchema. A loadout
// write against a real schema: unequip and swap send the slot's instance to
// the bag; a write that would grow a bag at or over 30 is refused and changes
// nothing; a bag-item swap at 30 leaves 30 and an equip into an empty slot at
// 30 leaves 29; a bag over 30 keeps every item (FS-VPD8Y R16-R18, R5).
func TestUpdateLoadout_AgainstTheSchema(t *testing.T) {
	ctx, db := catalogueDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, db, nil, nil, nil)

	// account seeds an owner with bag unworn bag items and one stashed item
	// worn in the weapon slot (wear removes the loadout row first on cleanup).
	account := func(t *testing.T, bag int) (owner, worn uuid.UUID, bagItems []uuid.UUID) {
		t.Helper()
		owner = uuid.New()
		for range bag {
			bagItems = append(bagItems, seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag))
		}
		worn = seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		wear(t, ctx, db, owner, worn)
		return owner, worn, bagItems
	}
	update := func(owner uuid.UUID, equip *uuid.UUID) error {
		return svc.UpdateLoadout(ctx, owner, &UpdateLoadoutRequest{MemberId: owner, Slot: "weapon", ItemInstanceId: equip})
	}
	wantBagFull := func(t *testing.T, err error) {
		t.Helper()
		var refusal *errcode.Refusal
		if !errors.As(err, &refusal) || refusal.Code != errcode.BagFull {
			t.Fatalf("err = %v, want BAG_FULL", err)
		}
	}

	t.Run("unequip sends the item to the bag and the next list shows it", func(t *testing.T) {
		owner, worn, _ := account(t, 0)

		if err := update(owner, nil); err != nil {
			t.Fatalf("unequip: %v", err)
		}
		if got := weaponOf(t, ctx, db, owner); got != nil {
			t.Errorf("weapon slot = %v, want empty", *got)
		}
		items, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
		if err != nil || len(items) != 1 || items[0].ID != worn || items[0].Location != LocationBag {
			t.Fatalf("list after unequip = %+v, %v; want the item in the bag", items, err)
		}
	})

	t.Run("a swap sends the displaced item to the bag", func(t *testing.T) {
		owner, worn, _ := account(t, 0)
		stashed := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)

		if err := update(owner, &stashed); err != nil {
			t.Fatalf("swap: %v", err)
		}
		if got := weaponOf(t, ctx, db, owner); got == nil || *got != stashed {
			t.Errorf("weapon slot = %v, want %v", got, stashed)
		}
		if _, loc := locationOf(t, ctx, db, worn); loc != LocationBag {
			t.Errorf("displaced location = %q, want %q", loc, LocationBag)
		}
	})

	t.Run("unequip into a bag of 30 is refused and changes nothing", func(t *testing.T) {
		owner, worn, _ := account(t, BagCapacity)

		wantBagFull(t, update(owner, nil))
		if got := weaponOf(t, ctx, db, owner); got == nil || *got != worn {
			t.Errorf("weapon slot = %v, want still %v", got, worn)
		}
		if _, loc := locationOf(t, ctx, db, worn); loc != LocationStash {
			t.Errorf("worn item location = %q, want unchanged %q", loc, LocationStash)
		}
		if n := bagOf(t, ctx, db, owner); n != BagCapacity {
			t.Errorf("bag = %d, want %d", n, BagCapacity)
		}
	})

	t.Run("a bag-item swap at 30 succeeds and leaves 30", func(t *testing.T) {
		owner, worn, bag := account(t, BagCapacity)

		if err := update(owner, &bag[0]); err != nil {
			t.Fatalf("swap: %v", err)
		}
		if _, loc := locationOf(t, ctx, db, worn); loc != LocationBag {
			t.Errorf("displaced location = %q, want %q", loc, LocationBag)
		}
		if n := bagOf(t, ctx, db, owner); n != BagCapacity {
			t.Errorf("bag = %d, want %d", n, BagCapacity)
		}
	})

	t.Run("an equip into an empty slot at 30 leaves 29", func(t *testing.T) {
		owner := uuid.New()
		var bag []uuid.UUID
		for range BagCapacity {
			bag = append(bag, seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag))
		}
		// registered after the seeds, so it runs before their deletes
		t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM player_loadouts WHERE member_id = $1`, owner) })

		if err := update(owner, &bag[0]); err != nil {
			t.Fatalf("equip: %v", err)
		}
		if n := bagOf(t, ctx, db, owner); n != BagCapacity-1 {
			t.Errorf("bag = %d, want %d", n, BagCapacity-1)
		}
	})

	t.Run("a bag over 30 keeps every item", func(t *testing.T) {
		owner, worn, _ := account(t, BagCapacity+3)

		wantBagFull(t, update(owner, nil))
		if n := bagOf(t, ctx, db, owner); n != BagCapacity+3 {
			t.Errorf("bag = %d, want %d", n, BagCapacity+3)
		}
		items, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
		if err != nil || len(items) != BagCapacity+4 {
			t.Fatalf("list = %d items, %v; want %d", len(items), err, BagCapacity+4)
		}
		if got := weaponOf(t, ctx, db, owner); got == nil || *got != worn {
			t.Errorf("weapon slot = %v, want still %v", got, worn)
		}
	})
}

// Opt-in and committed like TestUpdateLoadout_AgainstTheSchema. Equipping an
// instance in a run, listed or pending settlement is refused with
// ITEM_NOT_AVAILABLE and changes neither the slot nor the instance; clearing a
// slot is not checked (FS-18Z5F R32).
func TestUpdateLoadout_RefusesAnItemNotAvailable_AgainstTheSchema(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	update := func(owner uuid.UUID, equip *uuid.UUID) error {
		return svc.UpdateLoadout(ctx, owner, &UpdateLoadoutRequest{MemberId: owner, Slot: "weapon", ItemInstanceId: equip})
	}

	seeds := map[string]func(owner uuid.UUID) uuid.UUID{
		"in a run": func(owner uuid.UUID) uuid.UUID { return seedInRun(t, ctx, db, owner, LocationBag, uuid.New()) },
		"listed":   func(owner uuid.UUID) uuid.UUID { return seedAt(t, ctx, db, owner, "LISTED", LocationBag) },
		"pending settlement": func(owner uuid.UUID) uuid.UUID {
			return seedAt(t, ctx, db, owner, "PENDING_SETTLEMENT", LocationBag)
		},
	}
	for name, seed := range seeds {
		t.Run(name+" is refused and changes nothing", func(t *testing.T) {
			owner := uuid.New()
			worn := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
			wear(t, ctx, db, owner, worn)
			item := seed(owner)
			before := runStateOf(t, ctx, db, item)

			err := update(owner, &item)

			var refusal *errcode.Refusal
			if !errors.As(err, &refusal) || refusal.Code != errcode.ItemNotAvailable {
				t.Fatalf("err = %v, want ITEM_NOT_AVAILABLE", err)
			}
			if got := weaponOf(t, ctx, db, owner); got == nil || *got != worn {
				t.Errorf("weapon slot = %v, want still %v", got, worn)
			}
			if _, loc := locationOf(t, ctx, db, worn); loc != LocationStash {
				t.Errorf("worn item location = %q, want unchanged %q", loc, LocationStash)
			}
			if after := runStateOf(t, ctx, db, item); !after.same(before) {
				t.Errorf("item = %+v, want unchanged %+v", after, before)
			}
		})
	}

	t.Run("clearing a slot that holds an item in a run is not refused", func(t *testing.T) {
		owner := uuid.New()
		worn := seedInRun(t, ctx, db, owner, LocationBag, uuid.New())
		wear(t, ctx, db, owner, worn)

		if err := update(owner, nil); err != nil {
			t.Fatalf("unequip: %v", err)
		}
		if got := weaponOf(t, ctx, db, owner); got != nil {
			t.Errorf("weapon slot = %v, want empty", *got)
		}
	})
}

// lockProbeRepo, once the equip has read the instance, tries to reserve it for
// a listing on its own connection with a short lock timeout: the listing never
// takes the account lock, so only the row lock can hold it off.
type lockProbeRepo struct {
	*repository
	db         *sqlx.DB
	owner      uuid.UUID
	itemID     uuid.UUID
	reserveErr error
}

func (r *lockProbeRepo) UpsertLoadoutSlotTx(ctx context.Context, tx *sqlx.Tx, req *UpdateLoadoutRequest) error {
	r.reserveErr = commonutils.ExecTx(ctx, r.db, nil, func(listing *sqlx.Tx) error {
		if _, err := listing.ExecContext(ctx, `SET LOCAL lock_timeout = '200ms'`); err != nil {
			return err
		}
		_, err := r.ReserveItemTx(ctx, listing, r.owner, r.itemID, uuid.New(), time.Now(), time.Now())
		return err
	})
	return r.repository.UpsertLoadoutSlotTx(ctx, tx, req)
}

// Opt-in and committed. The equip holds the instance's row from its status
// read to its commit, so a listing racing it waits rather than reserving an
// item that is being worn (FS-18Z5F R32, §Edge States "Concurrent equip and
// checkout").
func TestUpdateLoadout_HoldsTheEquippedRow(t *testing.T) {
	ctx, db := catalogueDB(t)

	owner := uuid.New()
	item := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM player_loadouts WHERE member_id = $1`, owner) })
	repo := &lockProbeRepo{repository: NewRepository(db), db: db, owner: owner, itemID: item}

	err := NewService(repo, db, nil, nil, nil).UpdateLoadout(ctx, owner,
		&UpdateLoadoutRequest{MemberId: owner, Slot: "weapon", ItemInstanceId: &item})
	if err != nil {
		t.Fatalf("equip: %v", err)
	}

	var pqErr *pq.Error
	if !errors.As(repo.reserveErr, &pqErr) || pqErr.Code != "55P03" {
		t.Errorf("reserve during the equip = %v, want a lock timeout (55P03)", repo.reserveErr)
	}
	if got := weaponOf(t, ctx, db, owner); got == nil || *got != item {
		t.Errorf("weapon slot = %v, want %v", got, item)
	}
	if status, _ := locationOf(t, ctx, db, item); status != "AVAILABLE" {
		t.Errorf("status = %q, want AVAILABLE", status)
	}
}

// Opt-in and committed. Every marketplace write on an item needs it AVAILABLE,
// LISTED or PENDING_SETTLEMENT, so each one leaves an IN_RUN item exactly as it
// was, even when the item still carries the listing id of a listing cancelled
// before the run (FS-18Z5F R34).
func TestMarketplaceWrites_LeaveAnInRunItemAlone(t *testing.T) {
	ctx, db := catalogueDB(t)
	repo := NewRepository(db)

	writes := []struct {
		name string
		// write reports an error when the marketplace write claims success
		write func(owner, item, listing uuid.UUID) error
	}{
		{"ReserveItem", func(owner, item, _ uuid.UUID) error {
			err := commonutils.ExecTx(ctx, db, nil, func(tx *sqlx.Tx) error {
				_, err := repo.ReserveItemTx(ctx, tx, owner, item, uuid.New(), time.Now(), time.Now())
				return err
			})
			if !errors.Is(err, ErrItemNotReservable) {
				return fmt.Errorf("reserve = %v, want ErrItemNotReservable", err)
			}
			return nil
		}},
		{"CancelReservation", func(_, item, _ uuid.UUID) error {
			if ok, err := repo.CancelReservation(ctx, item); ok || err != nil {
				return fmt.Errorf("cancel = %v, %v; want false, nil", ok, err)
			}
			return nil
		}},
		{"FreezeItem", func(owner, item, _ uuid.UUID) error {
			if ok, err := repo.FreezeItem(ctx, item, owner); ok || err != nil {
				return fmt.Errorf("freeze = %v, %v; want false, nil", ok, err)
			}
			return nil
		}},
		{"ReturnItem", func(_, item, listing uuid.UUID) error {
			// zero rows on an item still carrying the listing id reads as corrupted
			if err := repo.ReturnItem(ctx, item, listing); !errors.Is(err, ErrItemCorrupted) {
				return fmt.Errorf("return = %v, want ErrItemCorrupted", err)
			}
			return nil
		}},
		{"UnfreezeItem", func(owner, item, listing uuid.UUID) error {
			// zero rows is success by design: the rollback must end
			return repo.UnfreezeItem(ctx, item, owner, listing)
		}},
		{"TransferItem", func(_, item, listing uuid.UUID) error {
			if ok, err := repo.TransferItem(ctx, item, uuid.New(), listing); ok || err != nil {
				return fmt.Errorf("transfer = %v, %v; want false, nil", ok, err)
			}
			return nil
		}},
	}

	for _, w := range writes {
		t.Run(w.name, func(t *testing.T) {
			owner, listing, run := uuid.New(), uuid.New(), uuid.New()
			item := uuid.New()
			seedItemInstanceForListing(t, ctx, db, item, owner, "AVAILABLE", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), &listing)
			if _, err := db.ExecContext(ctx, `UPDATE item_instances SET status = 'IN_RUN', run_id = $2 WHERE id = $1`, item, run); err != nil {
				t.Fatalf("seed in run: %v", err)
			}
			t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM item_transfers WHERE listing_id = $1`, listing) })
			before := runStateOf(t, ctx, db, item)

			if err := w.write(owner, item, listing); err != nil {
				t.Error(err)
			}

			if after := runStateOf(t, ctx, db, item); !after.same(before) || !after.inRun(run) {
				t.Errorf("item = %+v, want unchanged %+v", after, before)
			}
			var transfers int
			if err := db.GetContext(ctx, &transfers, `SELECT COUNT(*) FROM item_transfers WHERE listing_id = $1`, listing); err != nil || transfers != 0 {
				t.Errorf("transfer records = %d, %v; want none", transfers, err)
			}
		})
	}
}
