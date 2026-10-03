package items

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
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

func seedItemInstance(t *testing.T, ctx context.Context, db *sqlx.DB, itemID, owner uuid.UUID, status string, updatedAt time.Time) {
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
		`INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, required_level) VALUES ($1, 'Test Blade', $2, 'weapon', $3, 1)`,
		templateID, rarityID, weaponID); err != nil {
		t.Fatalf("template: %v", err)
	}
	t.Cleanup(func() {
		// children first: instance -> template -> weapon
		db.ExecContext(ctx, `DELETE FROM item_instances WHERE id = $1`, itemID)
		db.ExecContext(ctx, `DELETE FROM item_templates WHERE id = $1`, templateID)
		db.ExecContext(ctx, `DELETE FROM weapons WHERE id = $1`, weaponID)
	})
	if _, err := db.ExecContext(ctx,
		`INSERT INTO item_instances (id, template_id, owner_member_id, source, item_type, name, rarity_id, attack_power, critical_rate, weapon_type, status, updated_at)
		 VALUES ($1, $2, $3, 'extracted', 'weapon', 'Test Blade', $4, 6, 0.08, 'sword', $5, $6)`,
		itemID, templateID, owner, rarityID, status, updatedAt); err != nil {
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
