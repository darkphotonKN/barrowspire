package items

import (
	"context"
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
