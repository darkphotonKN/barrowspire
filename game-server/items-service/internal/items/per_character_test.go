package items

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// testCharacter is the character a fixture's bag items and loadout belong to:
// one per owner, derived so a test can name it without seeding anything.
func testCharacter(owner uuid.UUID) uuid.UUID {
	return uuid.NewSHA1(owner, []byte("test-character"))
}

// holderOf reads id's location and holder.
func holderOf(t *testing.T, ctx context.Context, db *sqlx.DB, id uuid.UUID) (string, *uuid.UUID) {
	t.Helper()
	var row struct {
		Location    string     `db:"location"`
		CharacterID *uuid.UUID `db:"character_id"`
	}
	if err := db.GetContext(ctx, &row, `SELECT location, character_id FROM item_instances WHERE id = $1`, id); err != nil {
		t.Fatalf("read holder of %s: %v", id, err)
	}
	return row.Location, row.CharacterID
}

func wantHeld(t *testing.T, ctx context.Context, db *sqlx.DB, id, character uuid.UUID) {
	t.Helper()
	location, holder := holderOf(t, ctx, db, id)
	if location != LocationBag || holder == nil || *holder != character {
		t.Errorf("item %s = %s held by %v, want BAG held by %s", id, location, holder, character)
	}
}

func wantStashed(t *testing.T, ctx context.Context, db *sqlx.DB, id uuid.UUID) {
	t.Helper()
	location, holder := holderOf(t, ctx, db, id)
	if location != LocationStash || holder != nil {
		t.Errorf("item %s = %s held by %v, want STASH with no holder", id, location, holder)
	}
}

// wornWeaponOf reads the weapon slot of character's loadout row.
func wornWeaponOf(t *testing.T, ctx context.Context, db *sqlx.DB, member, character uuid.UUID) *uuid.UUID {
	t.Helper()
	var weapon *uuid.UUID
	err := db.GetContext(ctx, &weapon, `SELECT weapon_instance_id FROM player_loadouts WHERE member_id = $1 AND character_id = $2`, member, character)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		t.Fatalf("read weapon of %s: %v", character, err)
	}
	return weapon
}

func cleanLoadouts(t *testing.T, ctx context.Context, db *sqlx.DB, owner uuid.UUID) {
	t.Helper()
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM player_loadouts WHERE member_id = $1`, owner) })
}

// sqlState is the SQLSTATE of err, empty when it is not a database error.
func sqlState(err error) string {
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		return string(pqErr.Code)
	}
	return ""
}

const checkViolation, uniqueViolation, notNullViolation = "23514", "23505", "23502"

// migrationFiles are the items-service migrations of direction, in order, up
// to and including version.
func migrationFiles(t *testing.T, direction string, from, to int) []string {
	t.Helper()
	all, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*."+direction+".sql"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(all)
	var out []string
	for _, path := range all {
		var version int
		if _, err := fmt.Sscanf(filepath.Base(path), "%06d_", &version); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if version >= from && version <= to {
			out = append(out, path)
		}
	}
	return out
}

func runMigrations(t *testing.T, ctx context.Context, tx *sqlx.Tx, paths []string) {
	t.Helper()
	for _, path := range paths {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			t.Fatalf("%s: %v", filepath.Base(path), err)
		}
	}
}

// Opt-in. FS-50MTX R7, R8: the whole migration chain in a scratch schema inside
// one rolled-back transaction, so the shared test schema is not touched. Old
// bag items of any status end in the stash with no holder, old loadouts go and
// their items survive; the down clears loadouts, even two of one member's, and
// brings back one loadout per member.
func TestMigration000031_HoldsItemsPerCharacter(t *testing.T) {
	ctx, db := catalogueDB(t)
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `CREATE SCHEMA items_mig31_test; SET LOCAL search_path TO items_mig31_test, public`); err != nil {
		t.Fatal(err)
	}
	runMigrations(t, ctx, tx, migrationFiles(t, "up", 1, 30))

	var template uuid.UUID
	if err := tx.GetContext(ctx, &template, `
		WITH rarity AS (SELECT id FROM item_rarities ORDER BY sort_order LIMIT 1),
		     weapon AS (INSERT INTO weapons (id, rarity_id, attack_power) SELECT uuid_generate_v4(), id, 1 FROM rarity RETURNING id, rarity_id)
		INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id)
		SELECT uuid_generate_v4(), 'Old Blade', rarity_id, 'weapon', id FROM weapon RETURNING id`); err != nil {
		t.Fatalf("template: %v", err)
	}
	owner := uuid.New()
	seed := func(location, status string, listing *uuid.UUID) uuid.UUID {
		id := uuid.New()
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO item_instances (id, template_id, owner_member_id, source, item_type, name, status, location, listing_id)
			VALUES ($1, $2, $3, 'extracted', 'consumable', 'Old Potion', $4, $5, $6)`,
			id, template, owner, status, location, listing); err != nil {
			t.Fatalf("seed: %v", err)
		}
		return id
	}
	listing := uuid.New()
	oldBag, oldListed, oldStash := seed("BAG", "AVAILABLE", nil), seed("BAG", "LISTED", &listing), seed("STASH", "AVAILABLE", nil)
	if _, err := tx.ExecContext(ctx, `INSERT INTO player_loadouts (member_id, consumable_1_id) VALUES ($1, $2)`, owner, oldBag); err != nil {
		t.Fatalf("seed loadout: %v", err)
	}

	runMigrations(t, ctx, tx, migrationFiles(t, "up", 31, 31))

	for _, id := range []uuid.UUID{oldBag, oldListed, oldStash} {
		var row struct {
			Location    string     `db:"location"`
			CharacterID *uuid.UUID `db:"character_id"`
		}
		if err := tx.GetContext(ctx, &row, `SELECT location, character_id FROM item_instances WHERE id = $1`, id); err != nil {
			t.Fatalf("old item %s did not survive: %v", id, err)
		}
		if row.Location != LocationStash || row.CharacterID != nil {
			t.Errorf("old item %s = %+v, want STASH with no holder", id, row)
		}
	}
	var loadouts int
	if err := tx.GetContext(ctx, &loadouts, `SELECT COUNT(*) FROM player_loadouts`); err != nil {
		t.Fatal(err)
	}
	if loadouts != 0 {
		t.Errorf("%d old loadouts left, want none", loadouts)
	}

	// expect runs stmt in a savepoint and checks the SQLSTATE it fails with
	expect := func(state, stmt string, args ...any) {
		t.Helper()
		if _, err := tx.ExecContext(ctx, `SAVEPOINT attempt`); err != nil {
			t.Fatal(err)
		}
		_, err := tx.ExecContext(ctx, stmt, args...)
		if got := sqlState(err); got != state {
			t.Errorf("%s: err = %v, want SQLSTATE %q", stmt, err, state)
		}
		if _, err := tx.ExecContext(ctx, `ROLLBACK TO SAVEPOINT attempt`); err != nil {
			t.Fatal(err)
		}
	}

	insertLoadout := `INSERT INTO player_loadouts (member_id, character_id) VALUES ($1, $2)`
	characterA, characterB := uuid.New(), uuid.New()
	expect(notNullViolation, `INSERT INTO player_loadouts (member_id) VALUES ($1)`, owner)
	for _, character := range []uuid.UUID{characterA, characterB} {
		if _, err := tx.ExecContext(ctx, insertLoadout, owner, character); err != nil {
			t.Fatalf("one member, two characters: %v", err)
		}
	}
	expect(uniqueViolation, insertLoadout, uuid.New(), characterA)

	runMigrations(t, ctx, tx, migrationFiles(t, "down", 31, 31))

	if err := tx.GetContext(ctx, &loadouts, `SELECT COUNT(*) FROM player_loadouts`); err != nil {
		t.Fatal(err)
	}
	if loadouts != 0 {
		t.Errorf("down left %d loadouts", loadouts)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO player_loadouts (member_id) VALUES ($1)`, owner); err != nil {
		t.Fatalf("down: no-character loadout: %v", err)
	}
	expect(uniqueViolation, `INSERT INTO player_loadouts (member_id) VALUES ($1)`, owner)
	if _, err := tx.ExecContext(ctx, `UPDATE item_instances SET location = 'BAG' WHERE id = $1`, oldStash); err != nil {
		t.Fatalf("down: the holder check is still there: %v", err)
	}
}

// Opt-in. FS-50MTX R2: the database itself refuses a bag row with no holder
// and a stash row with one, so a query bug cannot make limbo items.
func TestItemHolderCheck_RejectsAMismatch(t *testing.T) {
	ctx, db := catalogueDB(t)
	id := seedAt(t, ctx, db, uuid.New(), "AVAILABLE", LocationStash)

	tests := []struct {
		name string
		stmt string
		args []any
	}{
		{"a bag row with no holder", `UPDATE item_instances SET location = 'BAG' WHERE id = $1`, []any{id}},
		{"a stash row with a holder", `UPDATE item_instances SET character_id = $2 WHERE id = $1`, []any{id, uuid.New()}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := db.ExecContext(ctx, tt.stmt, tt.args...)
			if got := sqlState(err); got != checkViolation {
				t.Fatalf("err = %v, want a check violation", err)
			}
		})
	}
}

// Opt-in. FS-50MTX R14-R17: equipping claims the instance for the character,
// unequipping leaves it in that character's bag, and an item another character
// holds, another account's or a missing one answers not found and writes nothing.
func TestUpdateLoadout_PerCharacter(t *testing.T) {
	ctx, db := catalogueDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, db, nil, nil, nil, everyCharacterOwned{})

	equip := func(owner, character uuid.UUID, item *uuid.UUID) error {
		return svc.UpdateLoadout(ctx, owner, &UpdateLoadoutRequest{MemberId: owner, CharacterId: character, Slot: "weapon", ItemInstanceId: item})
	}

	t.Run("equipping a stash item sets the holder and BAG, unequipping stays in that bag", func(t *testing.T) {
		owner, character := uuid.New(), uuid.New()
		cleanLoadouts(t, ctx, db, owner)
		item := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)

		if err := equip(owner, character, &item); err != nil {
			t.Fatalf("equip: %v", err)
		}
		wantHeld(t, ctx, db, item, character)
		if got := wornWeaponOf(t, ctx, db, owner, character); got == nil || *got != item {
			t.Errorf("weapon = %v, want %v", got, item)
		}

		if err := equip(owner, character, nil); err != nil {
			t.Fatalf("unequip: %v", err)
		}
		wantHeld(t, ctx, db, item, character)
		if got := wornWeaponOf(t, ctx, db, owner, character); got != nil {
			t.Errorf("weapon = %v, want empty", *got)
		}
	})

	t.Run("two characters of one account keep separate loadouts", func(t *testing.T) {
		owner, a, b := uuid.New(), uuid.New(), uuid.New()
		cleanLoadouts(t, ctx, db, owner)
		itemA, itemB := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash), seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)

		if err := equip(owner, a, &itemA); err != nil {
			t.Fatalf("equip a: %v", err)
		}
		if err := equip(owner, b, &itemB); err != nil {
			t.Fatalf("equip b: %v", err)
		}
		if err := equip(owner, b, nil); err != nil {
			t.Fatalf("unequip b: %v", err)
		}

		if got := wornWeaponOf(t, ctx, db, owner, a); got == nil || *got != itemA {
			t.Errorf("a's weapon = %v, want %v: b's write reached it", got, itemA)
		}
		wantHeld(t, ctx, db, itemA, a)
		wantHeld(t, ctx, db, itemB, b)
	})

	t.Run("not found, nothing written", func(t *testing.T) {
		owner, character, other := uuid.New(), uuid.New(), uuid.New()
		cleanLoadouts(t, ctx, db, owner)
		heldByOther := seedAt(t, ctx, db, owner, "AVAILABLE", LocationBag)
		if _, err := db.ExecContext(ctx, `UPDATE item_instances SET character_id = $2 WHERE id = $1`, heldByOther, other); err != nil {
			t.Fatal(err)
		}
		// held by another character and not AVAILABLE: not found answers first
		heldListed := seedInRun(t, ctx, db, owner, LocationBag, uuid.New())
		if _, err := db.ExecContext(ctx, `UPDATE item_instances SET character_id = $2 WHERE id = $1`, heldListed, other); err != nil {
			t.Fatal(err)
		}
		foreign := seedAt(t, ctx, db, uuid.New(), "AVAILABLE", LocationStash)
		absent := uuid.New()

		for name, item := range map[string]uuid.UUID{
			"held by another character":                   heldByOther,
			"held by another character and not AVAILABLE": heldListed,
			"not owned": foreign,
			"absent":    absent,
		} {
			t.Run(name, func(t *testing.T) {
				if err := equip(owner, character, &item); !errors.Is(err, commonconstants.ErrNotFound) {
					t.Fatalf("err = %v, want not found", err)
				}
				var rows int
				if err := db.GetContext(ctx, &rows, `SELECT COUNT(*) FROM player_loadouts WHERE member_id = $1`, owner); err != nil {
					t.Fatal(err)
				}
				if rows != 0 {
					t.Errorf("%d loadout rows written", rows)
				}
			})
		}
		wantHeld(t, ctx, db, heldByOther, other)
		wantStashed(t, ctx, db, foreign)
	})

	t.Run("another account's loadout row is never overwritten", func(t *testing.T) {
		victim, attacker, character := uuid.New(), uuid.New(), uuid.New()
		cleanLoadouts(t, ctx, db, victim)
		cleanLoadouts(t, ctx, db, attacker)
		worn := seedAt(t, ctx, db, victim, "AVAILABLE", LocationStash)
		if err := equip(victim, character, &worn); err != nil {
			t.Fatalf("equip: %v", err)
		}
		mine := seedAt(t, ctx, db, attacker, "AVAILABLE", LocationStash)

		err := equip(attacker, character, &mine)

		if !errors.Is(err, commonconstants.ErrNotFound) {
			t.Fatalf("err = %v, want not found", err)
		}
		if got := wornWeaponOf(t, ctx, db, victim, character); got == nil || *got != worn {
			t.Errorf("victim's weapon = %v, want %v", got, worn)
		}
		wantStashed(t, ctx, db, mine)
	})

	t.Run("BAG_FULL measures this character", func(t *testing.T) {
		owner, full, roomy := uuid.New(), uuid.New(), uuid.New()
		cleanLoadouts(t, ctx, db, owner)
		for range BagCapacity {
			id := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
			if _, err := db.ExecContext(ctx, `UPDATE item_instances SET location = 'BAG', character_id = $2 WHERE id = $1`, id, full); err != nil {
				t.Fatal(err)
			}
		}
		worn := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		if err := equip(owner, roomy, &worn); err != nil {
			t.Fatalf("equip on the character with room: %v", err)
		}
		if err := equip(owner, roomy, nil); err != nil {
			t.Fatalf("30 in another character's bag blocked an unequip: %v", err)
		}
		wantHeld(t, ctx, db, worn, roomy)

		wornByFull := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		if err := equip(owner, full, &wornByFull); err != nil {
			t.Fatalf("equip into an empty slot: %v", err)
		}
		var refusal *errcode.Refusal
		if err := equip(owner, full, nil); !errors.As(err, &refusal) || refusal.Code != errcode.BagFull {
			t.Fatalf("err = %v, want BAG_FULL", err)
		}
	})
}

// Opt-in. FS-50MTX R18-R21, R5: a move writes the holder with the location, an
// item another character holds is not found, even when worn, and the bag cap
// is one character's while the stash cap is the account's.
func TestMoveItemInstance_PerCharacter(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil, everyCharacterOwned{})

	move := func(owner, character, item uuid.UUID, to string) (string, error) {
		return svc.MoveItemInstance(ctx, owner, &MoveItemInstanceRequest{ItemInstanceID: item, Location: to, CharacterID: character})
	}
	holdIn := func(t *testing.T, item, character uuid.UUID) {
		t.Helper()
		if _, err := db.ExecContext(ctx, `UPDATE item_instances SET location = 'BAG', character_id = $2 WHERE id = $1`, item, character); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("stash to bag sets the holder, bag to stash clears it", func(t *testing.T) {
		owner, character := uuid.New(), uuid.New()
		item := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)

		if got, err := move(owner, character, item, LocationBag); err != nil || got != LocationBag {
			t.Fatalf("to bag = %q, %v", got, err)
		}
		wantHeld(t, ctx, db, item, character)

		if got, err := move(owner, character, item, LocationStash); err != nil || got != LocationStash {
			t.Fatalf("to stash = %q, %v", got, err)
		}
		wantStashed(t, ctx, db, item)
	})

	t.Run("the stash is how an item passes between characters", func(t *testing.T) {
		owner, a, b := uuid.New(), uuid.New(), uuid.New()
		item := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		holdIn(t, item, a)

		if _, err := move(owner, a, item, LocationStash); err != nil {
			t.Fatalf("a stashes: %v", err)
		}
		if _, err := move(owner, b, item, LocationBag); err != nil {
			t.Fatalf("b takes: %v", err)
		}
		wantHeld(t, ctx, db, item, b)
	})

	t.Run("a same-location move changes nothing", func(t *testing.T) {
		owner, character := uuid.New(), uuid.New()
		item := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		holdIn(t, item, character)

		if got, err := move(owner, character, item, LocationBag); err != nil || got != LocationBag {
			t.Fatalf("move = %q, %v", got, err)
		}
		wantHeld(t, ctx, db, item, character)
	})

	t.Run("another character's item is not found, before ITEM_WORN", func(t *testing.T) {
		owner, a, b := uuid.New(), uuid.New(), uuid.New()
		cleanLoadouts(t, ctx, db, owner)
		item := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		if err := svc.UpdateLoadout(ctx, owner, &UpdateLoadoutRequest{MemberId: owner, CharacterId: a, Slot: "weapon", ItemInstanceId: &item}); err != nil {
			t.Fatalf("equip: %v", err)
		}
		carried := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		holdIn(t, carried, a)

		for _, id := range []uuid.UUID{item, carried} {
			for _, to := range []string{LocationBag, LocationStash} {
				if _, err := move(owner, b, id, to); !errors.Is(err, commonconstants.ErrNotFound) {
					t.Errorf("move %s to %s = %v, want not found", id, to, err)
				}
			}
			wantHeld(t, ctx, db, id, a)
		}
	})

	t.Run("the bag cap is one character's, the stash cap the account's", func(t *testing.T) {
		owner, full, roomy := uuid.New(), uuid.New(), uuid.New()
		for range BagCapacity {
			holdIn(t, seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash), full)
		}
		item := seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)

		var refusal *errcode.Refusal
		if _, err := move(owner, full, item, LocationBag); !errors.As(err, &refusal) || refusal.Code != errcode.BagFull {
			t.Fatalf("err = %v, want BAG_FULL", err)
		}
		if _, err := move(owner, roomy, item, LocationBag); err != nil {
			t.Fatalf("30 in another character's bag blocked a move: %v", err)
		}
		wantHeld(t, ctx, db, item, roomy)

		for range StashCapacity {
			seedAt(t, ctx, db, owner, "AVAILABLE", LocationStash)
		}
		if _, err := move(owner, roomy, item, LocationStash); !errors.As(err, &refusal) || refusal.Code != errcode.StashFull {
			t.Fatalf("err = %v, want STASH_FULL across the account", err)
		}
	})
}

// Opt-in. FS-50MTX R30-R33: settlement homes everything with the event's
// character; an event with none puts it all in the stash, writes no loadout and
// never trips the holder check.
func TestSettlement_PerCharacter(t *testing.T) {
	ctx, db := catalogueDB(t)
	f := settlementFixture{ctx: ctx, db: db, svc: NewService(NewRepository(db), db, nil, nil, &fakeInbox{}, everyCharacterOwned{})}

	loadouts := func(t *testing.T, member uuid.UUID) int {
		t.Helper()
		var n int
		if err := db.GetContext(ctx, &n, `SELECT COUNT(*) FROM player_loadouts WHERE member_id = $1`, member); err != nil {
			t.Fatal(err)
		}
		return n
	}
	findID := func(t *testing.T, member uuid.UUID, known ...uuid.UUID) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		if err := db.GetContext(ctx, &id, `SELECT id FROM item_instances WHERE owner_member_id = $1 AND id <> ALL($2)`, member, pq.Array(known)); err != nil {
			t.Fatalf("read find: %v", err)
		}
		return id
	}

	t.Run("finds and brought-in items are held by the event's character, its loadout written, another's untouched", func(t *testing.T) {
		member, runA, other := uuid.New(), uuid.New(), uuid.New()
		character := testCharacter(member)
		sword := seedInRun(t, ctx, db, member, LocationBag, runA)
		stashed := seedInRun(t, ctx, db, member, LocationStash, runA)
		theirs := seedAt(t, ctx, db, member, "AVAILABLE", LocationStash)
		if _, err := db.ExecContext(ctx, `UPDATE item_instances SET location = 'BAG', character_id = $2 WHERE id = $1`, theirs, other); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO player_loadouts (member_id, character_id, weapon_instance_id) VALUES ($1, $2, $3)`, member, other, theirs); err != nil {
			t.Fatal(err)
		}
		f.cleanUpAfter(t, member)

		f.settle(t, runA, &pb.PlayerItems{
			MemberId:    member.String(),
			CharacterId: character.String(),
			Equipment:   &pb.Equipment{Weapon: f.carried(t, sword)},
			Inventory:   []*pb.Item{f.carried(t, stashed), f.find(t, sword)},
		})

		wantHeld(t, ctx, db, sword, character)
		wantHeld(t, ctx, db, stashed, character)
		wantHeld(t, ctx, db, findID(t, member, sword, stashed, theirs), character)
		if got := wornWeaponOf(t, ctx, db, member, character); got == nil || *got != sword {
			t.Errorf("weapon = %v, want the sword", got)
		}
		if got := wornWeaponOf(t, ctx, db, member, other); got == nil || *got != theirs {
			t.Errorf("another character's weapon = %v, want %v", got, theirs)
		}
		wantHeld(t, ctx, db, theirs, other)
	})

	noCharacter := map[string]string{"absent": "", "the nil uuid": uuid.Nil.String()}
	for name, character := range noCharacter {
		t.Run("an event with no character settles into the stash: "+name, func(t *testing.T) {
			member, runA := uuid.New(), uuid.New()
			worn := seedInRun(t, ctx, db, member, LocationBag, runA)
			carried := seedInRun(t, ctx, db, member, LocationBag, runA)
			f.cleanUpAfter(t, member)

			f.apply(t, &pb.ItemsExtractedEvent{SessionId: runA.String(), EventId: uuid.NewString(), PlayerItems: []*pb.PlayerItems{{
				MemberId:    member.String(),
				CharacterId: character,
				Equipment:   &pb.Equipment{Weapon: f.carried(t, worn)},
				Inventory:   []*pb.Item{f.carried(t, carried), f.find(t, worn)},
			}}})

			wantStashed(t, ctx, db, worn)
			wantStashed(t, ctx, db, carried)
			wantStashed(t, ctx, db, findID(t, member, worn, carried))
			if got := loadouts(t, member); got != 0 {
				t.Errorf("%d loadout rows written, want none", got)
			}
		})
	}

	t.Run("what the run never carried back is released to its holder", func(t *testing.T) {
		member, runA := uuid.New(), uuid.New()
		left := seedInRun(t, ctx, db, member, LocationBag, runA)
		f.cleanUpAfter(t, member)

		f.settle(t, runA, &pb.PlayerItems{MemberId: member.String(), CharacterId: uuid.NewString()})

		expectHome(t, ctx, db, left, LocationBag)
		wantHeld(t, ctx, db, left, testCharacter(member))
	})
}

// Opt-in. FS-50MTX R34, R35: a purchase lands in the stash with no holder, and
// a held item is refused for listing, ITEM_WORN answering first for a worn one.
func TestAccountFlows_StayAccountLevel(t *testing.T) {
	ctx, db := catalogueDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, db, nil, nil, nil, everyCharacterOwned{})

	t.Run("a purchase lands in the stash with no holder", func(t *testing.T) {
		item, seller, buyer, listing := uuid.New(), uuid.New(), uuid.New(), uuid.New()
		seedItemInstanceForListing(t, ctx, db, item, seller, "PENDING_SETTLEMENT", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), &listing)
		if _, err := db.ExecContext(ctx, `UPDATE item_instances SET location = 'BAG', character_id = $2 WHERE id = $1`, item, uuid.New()); err != nil {
			t.Fatal(err)
		}

		if ok, err := repo.TransferItem(ctx, item, buyer, listing); err != nil || !ok {
			t.Fatalf("transfer = %v, %v", ok, err)
		}
		wantStashed(t, ctx, db, item)
	})

	t.Run("a held item is not listable, and a worn one answers ITEM_WORN first", func(t *testing.T) {
		owner := uuid.New()
		cleanLoadouts(t, ctx, db, owner)
		held := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationBag)
		worn := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationBag)
		wear(t, ctx, db, owner, worn)

		for item, code := range map[uuid.UUID]errcode.Code{held: errcode.ItemNotInStash, worn: errcode.ItemWorn} {
			_, err := svc.ReserveItem(ctx, owner, item, 100, nil, time.Now().Add(time.Hour))
			var refusal *errcode.Refusal
			if !errors.As(err, &refusal) || refusal.Code != code {
				t.Errorf("reserve %s: err = %v, want %s", item, err, code)
			}
		}
	})
}

// FS-50MTX R15: what an equip cannot claim answers not found before any status
// check, and writes nothing; a stash item or this character's own is claimed.
func TestServiceUpdateLoadout_OnlyClaimsWhatItMay(t *testing.T) {
	character, other, item := uuid.New(), uuid.New(), uuid.New()

	tests := []struct {
		name      string
		placement *ItemPlacement
		wantErr   error
		wantCalls []string
	}{
		{name: "absent or not owned", wantErr: commonconstants.ErrNotFound, wantCalls: []string{"lock", "slot", "read"}},
		{name: "held by another character", placement: &ItemPlacement{Status: "AVAILABLE", Location: LocationBag, CharacterID: &other},
			wantErr: commonconstants.ErrNotFound, wantCalls: []string{"lock", "slot", "read"}},
		{name: "held by another character and not AVAILABLE", placement: &ItemPlacement{Status: itemStatusInRun, Location: LocationBag, CharacterID: &other},
			wantErr: commonconstants.ErrNotFound, wantCalls: []string{"lock", "slot", "read"}},
		{name: "a stash item", placement: &ItemPlacement{Status: "AVAILABLE", Location: LocationStash},
			wantCalls: []string{"lock", "slot", "read", "equip", "hold"}},
		{name: "this character's own", placement: &ItemPlacement{Status: "AVAILABLE", Location: LocationBag, CharacterID: &character},
			wantCalls: []string{"lock", "slot", "read", "equip", "hold"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller := uuid.New()
			repo := &loadoutWriteRepo{placement: tt.placement}
			svc := &service{repo: repo, withTx: runInline, characters: everyCharacterOwned{}}

			err := svc.UpdateLoadout(context.Background(), caller, &UpdateLoadoutRequest{MemberId: caller, CharacterId: character, Slot: "weapon", ItemInstanceId: &item})

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if got := strings.Join(repo.calls, ","); got != strings.Join(tt.wantCalls, ",") {
				t.Errorf("calls = %v, want %v", repo.calls, tt.wantCalls)
			}
			if tt.wantErr == nil && (repo.heldBy != character || len(repo.held) != 1 || repo.held[0] != item) {
				t.Errorf("held %v by %v, want %v by %v", repo.held, repo.heldBy, item, character)
			}
		})
	}
}

// FS-50MTX R20: an item another character holds is not found, ahead of every
// other refusal.
func TestServiceMoveItemInstance_AnotherCharactersItemIsNotFound(t *testing.T) {
	other := uuid.New()
	for name, placement := range map[string]*ItemPlacement{
		"unworn":        {Status: "AVAILABLE", Location: LocationBag, CharacterID: &other},
		"worn":          {Status: "AVAILABLE", Location: LocationBag, CharacterID: &other, Worn: true},
		"not available": {Status: itemStatusInRun, Location: LocationBag, CharacterID: &other},
	} {
		t.Run(name, func(t *testing.T) {
			repo := &moveRepo{placement: placement}
			svc := &service{repo: repo, withTx: runInline, characters: everyCharacterOwned{}}

			_, err := svc.MoveItemInstance(context.Background(), uuid.New(), &MoveItemInstanceRequest{ItemInstanceID: uuid.New(), Location: LocationStash, CharacterID: uuid.New()})

			if !errors.Is(err, commonconstants.ErrNotFound) {
				t.Fatalf("err = %v, want not found", err)
			}
			if got := strings.Join(repo.calls, ","); got != "lock,read" {
				t.Errorf("calls = %v, want lock,read", repo.calls)
			}
		})
	}
}

// FS-50MTX R32: an event with no character settles into the stash with no
// holder, writes no loadout and warns; R31: one with a character homes
// everything with it.
func TestProcessItemsExtracted_HomeFollowsTheCharacter(t *testing.T) {
	character := uuid.New()
	tests := []struct {
		name        string
		characterID string
		wantAt      string
		wantHolder  *uuid.UUID
		wantLoadout bool
		wantWarn    bool
	}{
		{"with a character", character.String(), LocationBag, &character, true, false},
		{"absent", "", LocationStash, nil, false, true},
		{"the nil uuid", uuid.Nil.String(), LocationStash, nil, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
			t.Cleanup(func() { slog.SetDefault(prev) })

			sword, find := broughtIn("Barrow Blade", "weapon"), potion()
			event := extractedEvent(find)
			event.PlayerItems[0].CharacterId = tt.characterID
			event.PlayerItems[0].Equipment = &pb.Equipment{Weapon: sword}
			repo := &extractionRepo{}
			svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}

			if err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(repo.insertedAt) != 1 || repo.insertedAt[0] != tt.wantAt {
				t.Errorf("finds inserted at %v, want %s", repo.insertedAt, tt.wantAt)
			}
			for _, item := range append(slices.Clone(repo.inserted), repo.applied...) {
				sameHolder := (item.CharacterID == nil) == (tt.wantHolder == nil) && (item.CharacterID == nil || *item.CharacterID == *tt.wantHolder)
				if item.Location != tt.wantAt || !sameHolder {
					t.Errorf("%s at %q held by %v, want %s held by %v", item.Name, item.Location, item.CharacterID, tt.wantAt, tt.wantHolder)
				}
			}
			if got := len(repo.loadouts) == 1; got != tt.wantLoadout {
				t.Errorf("loadouts written = %d, want written: %v", len(repo.loadouts), tt.wantLoadout)
			}
			if tt.wantLoadout && repo.loadouts[0].CharacterID != character {
				t.Errorf("loadout character = %v, want %v", repo.loadouts[0].CharacterID, character)
			}
			if got := strings.Contains(logs.String(), "names no character"); got != tt.wantWarn {
				t.Errorf("warned = %v, want %v:\n%s", got, tt.wantWarn, logs.String())
			}
		})
	}
}

// A character id that is not a UUID is a producer bug: the event fails as
// malformed before any write, like a bad member id.
func TestProcessItemsExtracted_MalformedCharacterFailsBeforeAnyWrite(t *testing.T) {
	event := extractedEvent(potion())
	event.PlayerItems[0].CharacterId = "not-a-uuid"
	repo := &extractionRepo{}
	svc := &service{repo: repo, withTx: runInline, inbox: &fakeInbox{}}

	err := svc.ProcessItemsExtracted(context.Background(), uuid.New(), commonconstants.ItemsExtracted, event)

	if !errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
		t.Fatalf("err = %v, want a malformed event", err)
	}
	if len(repo.calls) != 0 {
		t.Errorf("calls = %v, want none", repo.calls)
	}
}
