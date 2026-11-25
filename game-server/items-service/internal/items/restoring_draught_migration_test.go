package items

import (
	"testing"

	"github.com/google/uuid"
)

// Opt-in. FS-9JV5K §Change: The Restoring Draught D1: migration 033 adds the
// Restoring Draught, a `normal` consumable template with no healing and no mana
// that stacks to 20 as the antidote does, beside whatever the catalogue holds;
// its down removes it with its instances and leaves the antidote, and the up
// runs again after. The whole chain runs in a scratch schema inside one
// rolled-back transaction, so the shared test schema is not touched.
func TestMigration000033_AddsTheRestoringDraught(t *testing.T) {
	ctx, db := catalogueDB(t)
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `CREATE SCHEMA items_mig33_test; SET LOCAL search_path TO items_mig33_test, public`); err != nil {
		t.Fatal(err)
	}
	runMigrations(t, ctx, tx, migrationFiles(t, "up", 1, 32))
	runMigrations(t, ctx, tx, migrationFiles(t, "up", 33, 33))

	type draughtRow struct {
		ID            uuid.UUID `db:"id"`
		Rarity        string    `db:"rarity_code"`
		ItemType      string    `db:"item_type"`
		RequiredLevel int       `db:"required_level"`
		MinItemLevel  int       `db:"min_item_level"`
		Healing       int       `db:"healing_amount"`
		Mana          int       `db:"mana_amount"`
		Stack         int       `db:"max_stack_size"`
	}
	readTemplate := func(name string) []draughtRow {
		t.Helper()
		var rows []draughtRow
		if err := tx.SelectContext(ctx, &rows, `
			SELECT t.id, r.rarity_code, t.item_type, t.required_level, t.min_item_level,
			       c.healing_amount, c.mana_amount, c.max_stack_size
			  FROM item_templates t
			  JOIN item_rarities r ON r.id = t.rarity_id
			  JOIN consumables c ON t.item_type = 'consumable' AND c.id = t.item_id
			 WHERE t.item_name = $1`, name); err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		return rows
	}

	rows := readTemplate("Restoring Draught")
	if len(rows) != 1 {
		t.Fatalf("%d Restoring Draught templates, want 1", len(rows))
	}
	got := rows[0]
	want := draughtRow{ID: got.ID, Rarity: "normal", ItemType: "consumable", RequiredLevel: 1, MinItemLevel: 1, Healing: 0, Mana: 0, Stack: 20}
	if got != want {
		t.Errorf("restoring draught = %+v, want %+v", got, want)
	}

	instance := uuid.New()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO item_instances (id, template_id, owner_member_id, source, item_type, name, status, location)
		VALUES ($1, $2, $3, 'extracted', 'consumable', 'Restoring Draught', 'AVAILABLE', 'STASH')`,
		instance, got.ID, uuid.New()); err != nil {
		t.Fatalf("seed a draught instance: %v", err)
	}

	runMigrations(t, ctx, tx, migrationFiles(t, "down", 33, 33))

	if rows := readTemplate("Restoring Draught"); len(rows) != 0 {
		t.Errorf("down left %d Restoring Draught templates", len(rows))
	}
	if rows := readTemplate("Antidote"); len(rows) != 1 {
		t.Errorf("down of 033 left %d antidote templates, want 1", len(rows))
	}
	var left int
	if err := tx.GetContext(ctx, &left, `SELECT COUNT(*) FROM consumables WHERE id NOT IN (SELECT item_id FROM item_templates WHERE item_type = 'consumable')`); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Errorf("down left %d consumable rows with no template", left)
	}
	if err := tx.GetContext(ctx, &left, `SELECT COUNT(*) FROM item_instances WHERE id = $1`, instance); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Errorf("down left the draught instance")
	}

	runMigrations(t, ctx, tx, migrationFiles(t, "up", 33, 33))
	if rows := readTemplate("Restoring Draught"); len(rows) != 1 {
		t.Errorf("up after down: %d Restoring Draught templates, want 1", len(rows))
	}
}
