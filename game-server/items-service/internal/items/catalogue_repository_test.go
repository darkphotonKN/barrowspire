package items

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

// catalogueDB opens ITEMS_TEST_DSN (a migrated items DB) or skips. The reads
// under test go through the pool, so seeds are committed and cleaned up.
func catalogueDB(t *testing.T) (context.Context, *sqlx.DB) {
	t.Helper()
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return ctx, db
}

func rarityID(t *testing.T, ctx context.Context, db *sqlx.DB, code string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := db.GetContext(ctx, &id, `SELECT id FROM item_rarities WHERE rarity_code = $1`, code); err != nil {
		t.Fatalf("rarity %s: %v", code, err)
	}
	return id
}

// seedRingTemplate inserts a ring row and its template; a non-empty
// effectCode also makes it a unique with one fixed affix.
func seedRingTemplate(t *testing.T, ctx context.Context, db *sqlx.DB, name, rarity string, minItemLevel, requiredLevel int, effectCode, effectText string) uuid.UUID {
	t.Helper()
	rarityID := rarityID(t, ctx, db, rarity)
	ringID, templateID := uuid.New(), uuid.New()
	if _, err := db.ExecContext(ctx,
		`INSERT INTO rings (id, rarity_id, description) VALUES ($1, $2, 'A plain band.')`, ringID, rarityID); err != nil {
		t.Fatalf("ring: %v", err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, required_level, min_item_level)
		 VALUES ($1, $2, $3, 'ring', $4, $5, $6)`,
		templateID, name, rarityID, ringID, requiredLevel, minItemLevel); err != nil {
		t.Fatalf("ring template: %v", err)
	}
	if effectCode != "" {
		if _, err := db.ExecContext(ctx,
			`INSERT INTO unique_items (template_id, effect_code, effect_text, fixed_affixes)
			 VALUES ($1, $2, $3, '[{"stat":"intelligence","min":2,"max":4}]')`,
			templateID, effectCode, effectText); err != nil {
			t.Fatalf("unique row: %v", err)
		}
	}
	t.Cleanup(func() {
		// children first: instances -> unique row -> template -> ring
		_, _ = db.ExecContext(ctx, `DELETE FROM item_instances WHERE template_id = $1`, templateID)
		_, _ = db.ExecContext(ctx, `DELETE FROM unique_items WHERE template_id = $1`, templateID)
		_, _ = db.ExecContext(ctx, `DELETE FROM item_templates WHERE id = $1`, templateID)
		_, _ = db.ExecContext(ctx, `DELETE FROM rings WHERE id = $1`, ringID)
	})
	return templateID
}

// FS-4R9M9 R7: Fabled weighs 0.005 and no random (non-unique) instance is
// Fabled any more.
func TestCatalogueMigration_FabledReweightedAndRelabelled(t *testing.T) {
	ctx, db := catalogueDB(t)

	var weight float64
	if err := db.GetContext(ctx, &weight, `SELECT drop_rate_multiplier FROM item_rarities WHERE rarity_code = 'fabled'`); err != nil {
		t.Fatalf("fabled weight: %v", err)
	}
	if weight != 0.005 {
		t.Errorf("fabled drop_rate_multiplier = %v, want 0.005", weight)
	}

	var randomFabled int
	if err := db.GetContext(ctx, &randomFabled, `
		SELECT COUNT(*) FROM item_instances AS ii
		JOIN item_rarities AS r ON r.id = ii.rarity_id
		LEFT JOIN unique_items AS u ON u.template_id = ii.template_id
		WHERE r.rarity_code = 'fabled' AND u.template_id IS NULL`); err != nil {
		t.Fatalf("count fabled: %v", err)
	}
	if randomFabled != 0 {
		t.Errorf("%d non-unique instances are still fabled, want 0", randomFabled)
	}
}

// FS-4R9M9 R5, R6, R8: ListItemTemplateAggregates returns a ring base (no
// stats) and a unique with its unique row, each with min ilvl and required level.
func TestListItemTemplateAggregates_RingsAndUniques(t *testing.T) {
	ctx, db := catalogueDB(t)
	ringID := seedRingTemplate(t, ctx, db, "Test Silver Band", "normal", 8, 1, "", "")
	uniqueID := seedRingTemplate(t, ctx, db, "Test Lantern", "fabled", 10, 9, "pierce", "Your projectiles pierce one extra target.")

	templates, err := NewRepository(db).ListItemTemplateAggregates(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	byID := map[uuid.UUID]*ItemTemplateAggregate{}
	for _, tpl := range templates {
		byID[tpl.ID] = tpl
	}

	ring := byID[ringID]
	if ring == nil {
		t.Fatalf("ring template %s missing", ringID)
	}
	if ring.ItemType != "ring" || ring.MinItemLevel != 8 || ring.RequiredLevel != 1 {
		t.Errorf("ring = type %q min ilvl %d req %d, want ring 8 1", ring.ItemType, ring.MinItemLevel, ring.RequiredLevel)
	}
	if ring.Description == nil || *ring.Description != "A plain band." {
		t.Errorf("ring description = %v, want the ring row's", ring.Description)
	}
	if ring.AttackPower != nil || ring.DefenseRating != nil || ring.UniqueEffectCode != nil || ring.UniqueFixedAffixes != nil {
		t.Errorf("a base ring has no stats and no unique, got %+v", ring)
	}

	unique := byID[uniqueID]
	if unique == nil {
		t.Fatalf("unique template %s missing", uniqueID)
	}
	if unique.MinItemLevel != 10 || unique.RequiredLevel != 9 {
		t.Errorf("unique min ilvl %d req %d, want 10 9", unique.MinItemLevel, unique.RequiredLevel)
	}
	if unique.UniqueEffectCode == nil || *unique.UniqueEffectCode != "pierce" ||
		unique.UniqueEffectText == nil || *unique.UniqueEffectText != "Your projectiles pierce one extra target." {
		t.Errorf("unique effect = %v / %v, want pierce and its text", unique.UniqueEffectCode, unique.UniqueEffectText)
	}
	if len(unique.UniqueFixedAffixes) != 1 || unique.UniqueFixedAffixes[0] != (AffixRange{Stat: "intelligence", Min: 2, Max: 4}) {
		t.Errorf("fixed affixes = %+v, want intelligence 2-4", unique.UniqueFixedAffixes)
	}
}

// FS-4R9M9 R5, R51, R52: a ring instance stores with null weapon/armor
// columns; an instance of a unique reports its effect code and text on the
// instance reads and its text only on the summary; a non-unique reports none.
func TestItemInstances_RingsAndUniqueEffect(t *testing.T) {
	ctx, db := catalogueDB(t)
	owner := uuid.New()
	plainTpl := seedRingTemplate(t, ctx, db, "Test Iron Band", "normal", 1, 1, "", "")
	uniqueTpl := seedRingTemplate(t, ctx, db, "Test Last King", "fabled", 18, 16, "floor_attributes", "+1 to all attributes per floor climbed.")
	repo := NewRepository(db)

	normal, fabled := rarityID(t, ctx, db, "normal"), rarityID(t, ctx, db, "fabled")
	plainID, uniqueID := uuid.New(), uuid.New()
	ring := func(id, tpl, rarity uuid.UUID, name string) *ItemInstance {
		return &ItemInstance{
			ID: id, TemplateID: tpl, OwnerMemberID: owner, Source: "extracted", Status: "AVAILABLE",
			ItemType: "ring", Name: name, RarityID: &rarity, ItemLevel: 18,
			Affixes: Affixes{{Stat: "strength", Tier: 0, Value: 2}},
		}
	}
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if err := repo.BatchUpsertItemInstances(ctx, tx, []*ItemInstance{
		ring(plainID, plainTpl, normal, "Test Iron Band"),
		ring(uniqueID, uniqueTpl, fabled, "Test Last King"),
	}); err != nil {
		_ = tx.Rollback()
		t.Fatalf("store rings: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	wantCode, wantText := "floor_attributes", "+1 to all attributes per floor climbed."
	checkInstance := func(t *testing.T, where string, it *ItemInstance) {
		t.Helper()
		if it == nil {
			t.Fatalf("%s: missing", where)
		}
		switch it.ID {
		case uniqueID:
			if it.UniqueEffectCode == nil || *it.UniqueEffectCode != wantCode || it.UniqueEffectText == nil || *it.UniqueEffectText != wantText {
				t.Errorf("%s unique effect = %v / %v, want %s / %s", where, it.UniqueEffectCode, it.UniqueEffectText, wantCode, wantText)
			}
		case plainID:
			if it.UniqueEffectCode != nil || it.UniqueEffectText != nil {
				t.Errorf("%s plain ring carries a unique effect: %v / %v", where, it.UniqueEffectCode, it.UniqueEffectText)
			}
			if it.ItemType != "ring" || it.AttackPower != nil || it.DefenseRating != nil || it.ArmorSlot != nil {
				t.Errorf("%s plain ring = %+v, want a ring with no weapon/armor stats", where, it)
			}
		}
	}

	listed, err := repo.ListItemInstances(ctx, &ListItemInstancesRequest{MemberId: owner})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(listed) != 2 {
		t.Fatalf("listed %d instances, want 2", len(listed))
	}
	for _, it := range listed {
		checkInstance(t, "ListItemInstances", it)
	}
	for _, id := range []uuid.UUID{plainID, uniqueID} {
		it, err := repo.GetItemInstanceByID(ctx, id)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		checkInstance(t, "GetItemInstanceByID", it)
	}

	summaries, err := repo.GetItemSummaries(ctx, []uuid.UUID{plainID, uniqueID})
	if err != nil || len(summaries) != 2 {
		t.Fatalf("summaries: %v %v", summaries, err)
	}
	for _, s := range summaries {
		switch s.ID {
		case uniqueID:
			if s.UniqueEffectText == nil || *s.UniqueEffectText != wantText {
				t.Errorf("unique summary effect text = %v, want %s", s.UniqueEffectText, wantText)
			}
		case plainID:
			if s.UniqueEffectText != nil {
				t.Errorf("plain summary effect text = %s, want none", *s.UniqueEffectText)
			}
		}
	}

}
