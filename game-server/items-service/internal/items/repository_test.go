package items

import (
	"context"
	"os"
	"testing"

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
