package game

import (
	"maps"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §A R1–R8, §B, §C R13–R15, §E R30, §K R59. I-X2CMM-1.

// placeDelverAt adds a delver of the class at the level and stands them at (x, y).
func placeDelverAt(t *testing.T, s *Session, class string, level int, x, y float64) (uuid.UUID, *ecs.Entity) {
	t.Helper()

	playerID := uuid.New()
	entity, ok := s.EntityManager.GetEntity(s.AddPlayer(playerID, types.CharacterInPlay{Name: "Delver", Class: class, Level: level}, ""))
	require.True(t, ok)
	tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
	transform := tc.(*components.TransformComponent)
	transform.X, transform.Y = x, y

	return playerID, entity
}

func castPageSkill(s *Session, playerID uuid.UUID, page string) error {
	return s.castSkill(playerID, types.PlayerCastSkillPayload{SkillID: page})
}

func bookOf(t *testing.T, delver *ecs.Entity) *components.BookComponent {
	t.Helper()
	bc, ok := delver.GetComponent(ecs.ComponentTypeBook)
	require.True(t, ok, "every delver carries a book")
	return bc.(*components.BookComponent)
}

func hardenedLeft(t *testing.T, delver *ecs.Entity) (float64, bool) {
	t.Helper()
	left, on := bookOf(t, delver).States[components.BookStateHardened]
	return left, on
}

// A level-9 warrior in a run casts Hardened: 45 stamina paid, the 90 s book
// cooldown started, hardened set for 10 s and gone after. FS-X2CMM §A R5, §E R30.
func TestCastSkill_HardenedForALevel9WarriorInARun(t *testing.T) {
	s := unstartedRun(t)
	warrior, entity := placeDelverAt(t, s, "warrior", 9, 500, 500)

	require.NoError(t, castPageSkill(s, warrior, "hardened"))

	assert.Equal(t, 55, currentResource(entity))
	cooldown := bookOf(t, entity).Cooldowns[components.PageHardened]
	assert.Equal(t, components.BookCooldown{Remaining: 90, Total: 90}, cooldown)
	left, on := hardenedLeft(t, entity)
	require.True(t, on)
	assert.Equal(t, 10.0, left)

	tickFor(s, 9.9)
	_, on = hardenedLeft(t, entity)
	assert.True(t, on, "still hardened before 10 s")
	assert.Greater(t, bookOf(t, entity).Cooldowns[components.PageHardened].Remaining, 80.0)

	tickFor(s, 0.2)
	_, on = hardenedLeft(t, entity)
	assert.False(t, on, "hardened ends after 10 s")
}

// A page cast that fails any gate is refused with nothing spent: no cost, no
// cooldown, no state. FS-X2CMM §A R4, §K R59.
func TestCastSkill_BookAbilityRefusedWithNothingSpent(t *testing.T) {
	tests := []struct {
		name  string
		world func(t *testing.T) *Session
		class string
		level int
		page  string
		ready func(t *testing.T, s *Session, delver *ecs.Entity)
	}{
		{name: "level 8", world: unstartedRun, class: "warrior", level: 8, page: "hardened"},
		{name: "in the hub", world: unstartedHub, class: "warrior", level: 9, page: "hardened"},
		{name: "in a field", world: unstartedField, class: "warrior", level: 9, page: "hardened"},
		{name: "on cooldown", world: unstartedRun, class: "warrior", level: 9, page: "hardened",
			ready: func(t *testing.T, _ *Session, d *ecs.Entity) {
				bookOf(t, d).Cooldowns[components.PageHardened] = components.BookCooldown{Remaining: 5, Total: 90}
			}},
		{name: "short of stamina", world: unstartedRun, class: "warrior", level: 9, page: "hardened",
			ready: func(_ *testing.T, _ *Session, d *ecs.Entity) { setResource(d, 29) }},
		{name: "pinned", world: unstartedRun, class: "warrior", level: 9, page: "hardened",
			ready: func(_ *testing.T, _ *Session, d *ecs.Entity) {
				d.AddComponent(&components.AttackPinComponent{Remaining: 0.2})
			}},
		{name: "dead", world: unstartedRun, class: "warrior", level: 9, page: "hardened",
			ready: func(t *testing.T, _ *Session, d *ecs.Entity) { hurt(t, d, 0, 150) }},
		{name: "a mage casting hardened", world: unstartedRun, class: "mage", level: 20, page: "hardened"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := tt.world(t)
			playerID, delver := placeDelverAt(t, s, tt.class, tt.level, 500, 500)
			if tt.ready != nil {
				tt.ready(t, s, delver)
			}
			before := currentResource(delver)
			cooldownsBefore := maps.Clone(bookOf(t, delver).Cooldowns)

			assert.NoError(t, castPageSkill(s, playerID, tt.page), "no message back")

			assert.Equal(t, before, currentResource(delver), "no cost")
			assert.Equal(t, cooldownsBefore, bookOf(t, delver).Cooldowns, "no cooldown")
			assert.Empty(t, bookOf(t, delver).States, "no effect")
		})
	}
}

// A book cooldown is the table's whatever the worn attack speed, and the cast
// starts no pin: the warrior may swing on the same tick. FS-X2CMM §A R6.
func TestCastSkill_HardenedIgnoresAttackSpeedAndStartsNoPin(t *testing.T) {
	s := unstartedRun(t)
	warrior, entity := placeDelverAt(t, s, "warrior", 9, 500, 500)
	entity.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: 50})

	require.NoError(t, castPageSkill(s, warrior, "hardened"))

	assert.Equal(t, components.BookCooldown{Remaining: 90, Total: 90}, bookOf(t, entity).Cooldowns[components.PageHardened])
	assert.False(t, entity.HasComponent(ecs.ComponentTypeAttackPin), "a book ability starts no pin")
}

// Page ids are their own cast_skill ids, never an attack kind. FS-X2CMM §A R2.
func TestCastSkill_PageIDsAreNeverAttackKinds(t *testing.T) {
	for _, id := range systems.AllPageIDs() {
		_, isAttack := systems.SkillAttackKind(string(id))
		assert.False(t, isAttack, id)
	}
}

// Each class config names its book in book order; every page of the table is
// in exactly its own class's book. FS-X2CMM §A R1, §B R9–R12.
func TestClasses_EachNamesItsBookInBookOrder(t *testing.T) {
	want := map[string][]components.PageID{
		"mage":      {"witchlight", "far_hand", "levitate", "binding_glyph", "recall"},
		"archer":    {"trackers_eye", "brew", "call_the_hound"},
		"mercenary": {"pick_the_lock", "strike_a_deal", "take_a_contract"},
		"warrior":   {"heave", "hardened", "long_night"},
	}
	seen := 0
	for class, pages := range want {
		assert.Equal(t, pages, Classes[class].Book, class)
		for _, id := range pages {
			page, ok := systems.BookPageOf(string(id))
			require.True(t, ok, id)
			assert.Equal(t, class, page.Class, id)
			seen++
		}
	}
	assert.Len(t, systems.AllPageIDs(), seen, "the table holds the 14 pages and no others")
}

// A fresh run seats a fresh book: cooldowns are per run. FS-X2CMM §A R8.
func TestAddPlayer_SeatsAFreshBookEveryRun(t *testing.T) {
	first := unstartedRun(t)
	warrior := uuid.New()
	seat := types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 9}
	body, _ := first.EntityManager.GetEntity(first.AddPlayer(warrior, seat, ""))
	require.NoError(t, castPageSkill(first, warrior, "hardened"))
	require.NotEmpty(t, bookOf(t, body).Cooldowns)

	second := unstartedRun(t)
	again, _ := second.EntityManager.GetEntity(second.AddPlayer(warrior, seat, ""))
	assert.Empty(t, bookOf(t, again).Cooldowns, "every page ready")
	assert.Equal(t, Classes["warrior"].Book, bookOf(t, again).Pages)
}

// Climbing makes a once-per-floor page ready and keeps a once-per-delve page
// spent and every book cooldown running. FS-X2CMM §A R8.
func TestSettlePartyOnNewFloor_ResetsOncePerFloorPagesOnly(t *testing.T) {
	s := unstartedRun(t)
	_, delver := placeDelverAt(t, s, "mage", 20, 500, 500)
	book := bookOf(t, delver)
	// recall is once per floor; take_a_contract once per delve: the reset
	// reads each page's limit from the table, not from what is offered
	book.Spent[components.PageRecall] = true
	book.Spent[components.PageTakeAContract] = true
	book.Cooldowns[components.PageWitchlight] = components.BookCooldown{Remaining: 30, Total: 45}

	s.settlePartyOnNewFloor(s.EntityManager.GetAllEntities())

	assert.False(t, book.Spent[components.PageRecall], "once per floor is ready again")
	assert.True(t, book.Spent[components.PageTakeAContract], "once per delve stays spent")
	assert.Equal(t, 30.0, book.Cooldowns[components.PageWitchlight].Remaining, "book cooldowns run across floors")
}

func setResource(delver *ecs.Entity, current int) {
	rc, _ := delver.GetComponent(ecs.ComponentTypeResource)
	rc.(*components.ResourceComponent).Current = current
}

func unstartedHub(t *testing.T) *Session {
	t.Helper()
	return newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
}

func unstartedField(t *testing.T) *Session {
	t.Helper()
	return newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, FieldBounds(GentleMeadows()))
}
