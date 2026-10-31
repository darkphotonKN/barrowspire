package items

import (
	"context"
	"os"
	"slices"
	"strings"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// assertExtractedRow checks the fields the item_instances FK and CHECKs decide
// on: a real template, an owner, source 'extracted', status 'AVAILABLE', and an
// armor slot only on armor (I-4R9M9-15).
func assertExtractedRow(t *testing.T, got *ItemInstance, member, template uuid.UUID, wantSlot *string) {
	t.Helper()
	if got.TemplateID != template {
		t.Errorf("TemplateID = %v, want %v", got.TemplateID, template)
	}
	if got.OwnerMemberID != member {
		t.Errorf("OwnerMemberID = %v, want %v", got.OwnerMemberID, member)
	}
	if got.Source != "extracted" {
		t.Errorf("Source = %q, want extracted", got.Source)
	}
	if got.Status != "AVAILABLE" {
		t.Errorf("Status = %q, want AVAILABLE", got.Status)
	}
	switch {
	case wantSlot == nil && got.ArmorSlot != nil:
		t.Errorf("ArmorSlot = %q, want NULL", *got.ArmorSlot)
	case wantSlot != nil && (got.ArmorSlot == nil || *got.ArmorSlot != *wantSlot):
		t.Errorf("ArmorSlot = %v, want %q", got.ArmorSlot, *wantSlot)
	}
}

func TestMapProtoEquipmentToItemInstances_RowsSatisfyConstraints(t *testing.T) {
	member, weaponTemplate, chestTemplate := uuid.New(), uuid.New(), uuid.New()
	broughtIn := uuid.New()
	chest := "chest"

	instances, loadout, err := (&service{}).MapProtoEquipmentToItemInstances(member, &pb.Equipment{
		Weapon: &pb.Item{TemplateId: weaponTemplate.String(), InstanceId: broughtIn.String(), ItemType: "weapon", Name: "Barrow Seax", ItemLevel: 4},
		Chest:  &pb.Item{TemplateId: chestTemplate.String(), ItemType: "armor", ArmorSlot: "chest", Name: "Grave Mail"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 2 {
		t.Fatalf("got %d instances, want 2", len(instances))
	}

	byTemplate := map[uuid.UUID]*ItemInstance{}
	for _, it := range instances {
		byTemplate[it.TemplateID] = it
	}
	weapon, armor := byTemplate[weaponTemplate], byTemplate[chestTemplate]
	if weapon == nil || armor == nil {
		t.Fatalf("instances lost their templates: %+v", instances)
	}
	assertExtractedRow(t, weapon, member, weaponTemplate, nil)
	assertExtractedRow(t, armor, member, chestTemplate, &chest)

	if weapon.ID != broughtIn {
		t.Errorf("brought-in weapon ID = %v, want its instance id %v", weapon.ID, broughtIn)
	}
	if weapon.ItemLevel != 4 {
		t.Errorf("ItemLevel = %d, want 4", weapon.ItemLevel)
	}
	if loadout.WeaponInstanceID == nil || *loadout.WeaponInstanceID != broughtIn {
		t.Errorf("loadout weapon = %v, want %v", loadout.WeaponInstanceID, broughtIn)
	}
	if loadout.ChestInstanceID == nil || *loadout.ChestInstanceID != armor.ID {
		t.Errorf("loadout chest = %v, want %v", loadout.ChestInstanceID, armor.ID)
	}
}

func TestMapProtoItemToItemInstances_RowsSatisfyConstraints(t *testing.T) {
	member, potion, helm := uuid.New(), uuid.New(), uuid.New()
	head := "head"

	instances, err := (&service{}).MapProtoItemToItemInstances(member, []*pb.Item{
		{TemplateId: potion.String(), ItemType: "consumable", Name: "Lesser Heal Potion", HealingAmount: 10},
		{TemplateId: helm.String(), ItemType: "armor", ArmorSlot: "head", Name: "Bone Helm"},
		// no template: cannot be stored, so it is skipped and the rest still extract
		{ItemType: "weapon", Name: "Nameless"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 2 {
		t.Fatalf("got %d instances, want 2 (the templateless item skipped)", len(instances))
	}
	assertExtractedRow(t, instances[0], member, potion, nil)
	assertExtractedRow(t, instances[1], member, helm, &head)
	if instances[0].ID == uuid.Nil {
		t.Errorf("an item found in the run must get a new id")
	}
}

// A brought-in item re-extracted keeps what the store already knows about it:
// its owner, source, rarity and roll (FS-4R9M9 R20, R53). The fenced update
// must not assign any of them, and it writes only an item the run still owns
// (FS-18Z5F R27).
func TestApplyRunItemQuery_KeepsStoredOwnershipAndRoll(t *testing.T) {
	set, where, ok := strings.Cut(applyRunItemQuery, "WHERE")
	if !ok {
		t.Fatalf("no fence:\n%s", applyRunItemQuery)
	}
	for _, kept := range []string{"owner_member_id", "source", "rarity_id", "item_level", "affixes", "required_level"} {
		if strings.Contains(set, kept+" ") {
			t.Errorf("fenced update overwrites stored %s:\n%s", kept, set)
		}
	}
	for _, fence := range []string{"id = $1", "owner_member_id = $2", "status = 'IN_RUN'", "run_id = $3"} {
		if !strings.Contains(where, fence) {
			t.Errorf("fenced update does not check %q:\n%s", fence, where)
		}
	}
}

// FS-VPD8Y R9, FS-18Z5F R27: a find lands in the bag whatever location it
// carries, and the insert has no conflict path to write an existing row by.
func TestInsertItemsQuery_FindsGoToTheBag(t *testing.T) {
	items := []*ItemInstance{{Location: LocationStash}, {}}

	query, args := insertItemsQuery(items)

	col := slices.Index(insertItemColumns, "location")
	if col < 0 {
		t.Fatalf("location is not written: %v", insertItemColumns)
	}
	for i := range items {
		if got := args[i*len(insertItemColumns)+col]; got != LocationBag {
			t.Errorf("row %d location = %v, want %q", i, got, LocationBag)
		}
	}
	if strings.Contains(query, "ON CONFLICT") {
		t.Errorf("the insert writes existing rows:\n%s", query)
	}
}

// Opt-in: runs only with ITEMS_TEST_DSN pointing at a migrated items DB; all in
// one rolled-back transaction. An extraction batch mapped from the event
// satisfies the template FK and the source, status and armor-slot CHECKs, and
// a brought-in item, IN_RUN under the run, keeps its stored source and roll
// (I-4R9M9-15).
func TestExtraction_MappedBatchStoresWithoutConstraintErrors(t *testing.T) {
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

	// a brought-in item already stored, owned and rolled before the run, and
	// checked out into it
	member, broughtIn, runID := uuid.New(), uuid.New(), uuid.New()
	rolled := Affixes{{Stat: "strength", Tier: 2, Value: 3}}
	attack, crit, wtype := 6, 0.08, "sword"
	repo := NewRepository(db)
	if err := repo.InsertItemInstancesTx(ctx, tx, []*ItemInstance{{
		ID: broughtIn, TemplateID: templateID, OwnerMemberID: member, Source: "starting_gear", Status: "AVAILABLE",
		ItemType: "weapon", Name: "Test Blade", RarityID: &rarityID, AttackPower: &attack, CriticalRate: &crit, WeaponType: &wtype,
		ItemLevel: 5, RequiredLevel: 3, Affixes: rolled,
	}}); err != nil {
		t.Fatalf("seed brought-in item: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE item_instances SET status = 'IN_RUN', run_id = $2 WHERE id = $1`, broughtIn, runID); err != nil {
		t.Fatalf("check out: %v", err)
	}

	svc := &service{}
	equipped, _, err := svc.MapProtoEquipmentToItemInstances(member, &pb.Equipment{
		// an older producer: the brought-in item comes back without its roll
		Weapon: &pb.Item{TemplateId: templateID.String(), InstanceId: broughtIn.String(), ItemType: "weapon", Name: "Test Blade", AttackPower: 6, WeaponType: "sword"},
		Chest:  &pb.Item{TemplateId: templateID.String(), ItemType: "armor", ArmorSlot: "chest", Name: "Grave Mail", DefenseRating: 4},
	})
	if err != nil {
		t.Fatalf("map equipment: %v", err)
	}
	carried, err := svc.MapProtoItemToItemInstances(member, []*pb.Item{
		{TemplateId: templateID.String(), ItemType: "consumable", Name: "Lesser Heal Potion", HealingAmount: 10, ItemLevel: 2},
	})
	if err != nil {
		t.Fatalf("map inventory: %v", err)
	}

	finds, back := splitFinds(append(equipped, carried...), map[uuid.UUID]bool{broughtIn: true})
	if err := repo.InsertItemInstancesTx(ctx, tx, finds); err != nil {
		t.Fatalf("extraction finds: %v", err)
	}
	if applied, err := repo.ApplyRunItemsTx(ctx, tx, member, runID, back); err != nil || len(applied) != 1 {
		t.Fatalf("extraction brought-in: %v, %v", applied, err)
	}

	var stored []struct {
		ID        uuid.UUID `db:"id"`
		Owner     uuid.UUID `db:"owner_member_id"`
		Source    string    `db:"source"`
		Status    string    `db:"status"`
		ItemLevel int       `db:"item_level"`
		Affixes   Affixes   `db:"affixes"`
	}
	ids := []uuid.UUID{broughtIn}
	for _, it := range append(equipped, carried...) {
		ids = append(ids, it.ID)
	}
	if err := tx.SelectContext(ctx, &stored,
		`SELECT id, owner_member_id, source, status, item_level, affixes FROM item_instances WHERE id = ANY($1)`, pq.Array(ids)); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if len(stored) != 3 {
		t.Fatalf("stored %d rows, want 3", len(stored))
	}
	for _, row := range stored {
		if row.ID == broughtIn {
			if row.Owner != member || row.Source != "starting_gear" || row.Status != "AVAILABLE" || row.ItemLevel != 5 || len(row.Affixes) != 1 || row.Affixes[0] != rolled[0] {
				t.Errorf("brought-in item lost what was stored: %+v", row)
			}
			continue
		}
		if row.Owner != member || row.Source != "extracted" || row.Status != "AVAILABLE" {
			t.Errorf("found item stored as %+v, want owner %v, extracted, AVAILABLE", row, member)
		}
	}
}

// An extracted row stores only its own type's stat columns; the rest stay NULL,
// so a weapon never reads "Defense 0 · Healing 0" (FS-4R9M9 R52, R59).
func TestConvertSingleProtoItemtoItemInstance_StoresOnlyItsTypesStats(t *testing.T) {
	// a producer that fills every stat field, whatever the type
	full := func(itemType string) *pb.Item {
		return &pb.Item{
			TemplateId: uuid.New().String(), ItemType: itemType, Name: "Any",
			AttackPower: 6, CriticalRate: 0.08, WeaponType: "sword",
			DefenseRating: 4, MagicResistance: 2, ArmorSlot: "chest",
			HealingAmount: 10, ManaAmount: 5, BuffDuration: 3,
		}
	}
	type stats struct{ weapon, armor, consumable bool }
	tests := []struct {
		itemType string
		want     stats
	}{
		{"weapon", stats{weapon: true}},
		{"armor", stats{armor: true}},
		{"consumable", stats{consumable: true}},
		{"ring", stats{}},
	}
	for _, tt := range tests {
		t.Run(tt.itemType, func(t *testing.T) {
			got, err := (&service{}).ConvertSingleProtoItemtoItemInstance(uuid.New(), full(tt.itemType))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			for _, col := range []struct {
				name string
				set  bool
				want bool
			}{
				{"attack_power", got.AttackPower != nil, tt.want.weapon},
				{"critical_rate", got.CriticalRate != nil, tt.want.weapon},
				{"weapon_type", got.WeaponType != nil, tt.want.weapon},
				{"defense_rating", got.DefenseRating != nil, tt.want.armor},
				{"magic_resistance", got.MagicResistance != nil, tt.want.armor},
				{"armor_slot", got.ArmorSlot != nil, tt.want.armor},
				{"healing_amount", got.HealingAmount != nil, tt.want.consumable},
				{"mana_amount", got.ManaAmount != nil, tt.want.consumable},
				{"buff_duration", got.BuffDuration != nil, tt.want.consumable},
			} {
				if col.set != col.want {
					t.Errorf("%s set = %v, want %v", col.name, col.set, col.want)
				}
			}
		})
	}
}
