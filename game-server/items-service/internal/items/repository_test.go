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

	var rarityID uuid.UUID
	if err := db.GetContext(ctx, &rarityID, `SELECT id FROM item_rarities ORDER BY sort_order LIMIT 1`); err != nil {
		t.Fatalf("rarity: %v", err)
	}
	weaponID, templateID, owner := uuid.New(), uuid.New(), uuid.New()
	listedID, availableID := uuid.New(), uuid.New()
	t.Cleanup(func() {
		db.ExecContext(ctx, `DELETE FROM item_instances WHERE owner_member_id = $1`, owner)
		db.ExecContext(ctx, `DELETE FROM item_templates WHERE id = $1`, templateID)
		db.ExecContext(ctx, `DELETE FROM weapons WHERE id = $1`, weaponID)
	})

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

	repo := NewRepository(db)
	seed := func(id uuid.UUID) *ItemInstance {
		return &ItemInstance{
			ID: id, TemplateID: templateID, OwnerMemberID: owner, Source: "extracted",
			ItemType: "weapon", Name: "Test Blade", RarityID: &rarityID, Status: "AVAILABLE",
		}
	}
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	// One instance per call: a multi-row batch trips a placeholder-count bug in
	// BatchUpsertItemInstances (19 columns, colsPerRow = 18) that is outside this test.
	for _, id := range []uuid.UUID{listedID, availableID} {
		if err := repo.BatchUpsertItemInstances(ctx, tx, []*ItemInstance{seed(id)}); err != nil {
			tx.Rollback()
			t.Fatalf("seed: %v", err)
		}
	}
	now := time.Now()
	// The same reservation create-listing performs.
	if _, err := repo.ReserveItemTx(ctx, tx, owner, listedID, now, now); err != nil {
		tx.Rollback()
		t.Fatalf("reserve: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	items, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	got := map[uuid.UUID]string{}
	for _, it := range items {
		got[it.ID] = it.Status
	}
	want := map[uuid.UUID]string{listedID: "LISTED", availableID: "AVAILABLE"}
	for id, status := range want {
		if got[id] != status {
			t.Errorf("instance %s status = %q, want %q", id, got[id], status)
		}
	}
}
