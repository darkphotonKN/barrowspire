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

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// Opt-in: runs only with ITEMS_TEST_DSN pointing at a migrated items DB.
// Everything happens in one transaction that is rolled back.
func TestBatchUpsertItemInstances_Executes(t *testing.T) {
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

	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback()

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
	}

	repo := NewRepository(db)
	if err := repo.BatchUpsertItemInstances(ctx, tx, []*ItemInstance{item}); err != nil {
		t.Fatalf("batch upsert: %v", err)
	}
	// second call exercises the ON CONFLICT branch
	if err := repo.BatchUpsertItemInstances(ctx, tx, []*ItemInstance{item}); err != nil {
		t.Fatalf("batch upsert (conflict): %v", err)
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
	}{
		{name: "frozen for this listing moves to the buyer, unfreezes and is recorded", status: "PENDING_SETTLEMENT", owner: seller, listing: thisListing,
			wantTransferred: true, wantStatus: "AVAILABLE", wantOwner: buyer, wantListing: noListing},
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
			}
			if err := db.GetContext(ctx, &row, `SELECT status, owner_member_id, listing_id FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
			}
			if row.Status != tt.wantStatus {
				t.Errorf("status = %q, want %q", row.Status, tt.wantStatus)
			}
			if row.Owner != tt.wantOwner {
				t.Errorf("owner = %v, want %v", row.Owner, tt.wantOwner)
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
			}
			if err := db.GetContext(ctx, &row, `SELECT status, owner_member_id, listing_id, updated_at FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
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
	if _, err := db.ExecContext(ctx,
		`INSERT INTO item_instances (id, template_id, owner_member_id, source, item_type, name, rarity_id, attack_power, critical_rate, weapon_type, status, updated_at, listing_id)
		 VALUES ($1, $2, $3, 'extracted', 'weapon', 'Test Blade', $4, 6, 0.08, 'sword', $5, $6, $7)`,
		itemID, templateID, owner, rarityID, status, updatedAt, listingID); err != nil {
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
			}
			if err := db.GetContext(ctx, &row, `SELECT status, listing_id FROM item_instances WHERE id = $1`, itemID); err != nil {
				t.Fatalf("read back: %v", err)
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
	upsert := func(t *testing.T, items ...*ItemInstance) {
		t.Helper()
		tx, err := db.BeginTxx(ctx, nil)
		if err != nil {
			t.Fatalf("begin: %v", err)
		}
		if err := repo.BatchUpsertItemInstances(ctx, tx, items); err != nil {
			_ = tx.Rollback()
			t.Fatalf("batch upsert: %v", err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatalf("commit: %v", err)
		}
	}

	t.Run("extracted rows keep their own level, required level and affixes", func(t *testing.T) {
		// two new rows in one batch, one with no required level of its own
		// (stored NULL, reads the template's)
		upsert(t, instance(rolledID, 9, 6, rolled), instance(freshID, 4, 0, nil))

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
		upsert(t, instance(rolledID, 9, 6, rolled))
		readAll(t, rolledID, facts{itemLevel: 9, requiredLevel: 6, affixes: rolled})
	})

	// the roll is fixed once (R20): an event that does not carry it back, an
	// older producer's zero values, never resets it (I-4R9M9-15)
	t.Run("re-extracting without the roll keeps the stored one", func(t *testing.T) {
		upsert(t, instance(rolledID, 0, 0, nil), instance(legacyID, 0, 0, nil))
		readAll(t, rolledID, facts{itemLevel: 9, requiredLevel: 6, affixes: rolled})
		readAll(t, legacyID, facts{itemLevel: 1, requiredLevel: 2, affixes: Affixes{}})
	})
}

// Every row's placeholders must line up with its arguments; a column count
// that drifts from the argument list breaks any batch of more than one item.
func TestBatchUpsertQuery_PlaceholdersMatchArgs(t *testing.T) {
	items := []*ItemInstance{{ItemLevel: 9, RequiredLevel: 6}, {}, {}}

	query, args := batchUpsertQuery(items)

	if want := 3 * len(batchUpsertColumns); len(args) != want {
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

	row := len(batchUpsertColumns)
	ilvl, required := args[row-3], args[row-1]
	if ilvl != 9 || required.(*int) == nil || *required.(*int) != 6 {
		t.Errorf("first row ilvl, required = %v, %v, want 9, 6", ilvl, required)
	}
	// second row: no level given stores 1, no own requirement stores NULL
	if args[2*row-3] != 1 || args[2*row-1].(*int) != nil {
		t.Errorf("second row ilvl, required = %v, %v, want 1, NULL", args[2*row-3], args[2*row-1])
	}
}
