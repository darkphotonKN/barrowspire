package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BDRTJ §Requirements 6-7, 11-17; §Acceptance Criteria. I-BDRTJ-1.

// devRoom is a built room, not started: the test is the only thing ticking it.
func devRoom(t *testing.T) *Session {
	t.Helper()

	place := DevTestRoom()
	layout, err := place.Layout.Layout()
	require.NoError(t, err)

	room := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, FieldBounds(place))
	room.InitialFieldMapObjects(place, layout)
	return room
}

// devVisitor seats a body in the room as it is seated on entry.
func devVisitor(t *testing.T, room *Session) (uuid.UUID, *ecs.Entity) {
	t.Helper()

	memberID := uuid.New()
	character, gear := DevTestRoomSeat(fieldWren)
	_, err := room.SeatVisitor(memberID, character, uuid.New(), gear)
	require.NoError(t, err)
	return memberID, delverEntity(t, room, memberID)
}

func devStep(room *Session, seconds float64) {
	const dt = 1.0 / 60
	for elapsed := 0.0; elapsed < seconds-dt/2; elapsed += dt {
		room.step(dt, room.EntityManager.GetAllEntities())
	}
}

func devMonsters(room *Session) []*ecs.Entity {
	var monsters []*ecs.Entity
	for _, entity := range room.EntityManager.GetAllEntities() {
		if entity.HasComponent(ecs.ComponentTypeEnemy) {
			monsters = append(monsters, entity)
		}
	}
	return monsters
}

func devChests(room *Session) []*ecs.Entity {
	var chests []*ecs.Entity
	for _, entity := range room.EntityManager.GetAllEntities() {
		if entity.HasComponent(ecs.ComponentTypeContainer) {
			chests = append(chests, entity)
		}
	}
	return chests
}

func heldBy(t *testing.T, chest *ecs.Entity) []uuid.UUID {
	t.Helper()
	lc, ok := chest.GetComponent(ecs.ComponentTypeItemIDList)
	require.True(t, ok)
	return lc.(*components.ItemIDListComponent).ItemIDs
}

func itemOf(t *testing.T, room *Session, id uuid.UUID) *components.ItemComponent {
	t.Helper()
	entity, ok := room.EntityManager.GetEntity(id)
	require.True(t, ok, "the item stands in the world")
	ic, ok := entity.GetComponent(ecs.ComponentTypeItem)
	require.True(t, ok)
	return ic.(*components.ItemComponent)
}

// The room's place holds nothing a field would roll or restock. R6, R7.
func TestDevTestRoom_PlaceRollsAndRestocksNothing(t *testing.T) {
	place := DevTestRoom()

	assert.Equal(t, FieldDevTestRoom, place.ID)
	assert.Equal(t, 900.0, place.Width)
	assert.Equal(t, 600.0, place.Height)
	assert.Empty(t, place.Creatures)
	assert.Zero(t, place.DropFactor)
	assert.Zero(t, place.ChestRestockDelay)

	layout, err := place.Layout.Layout()
	require.NoError(t, err)
	assert.Equal(t, FieldLayout{}, layout)
}

// A level 20 Troll, elite Troll and Demon boss stand without Velocity. R14, R15.
func TestDevTestRoom_EnemiesStandWithoutVelocity(t *testing.T) {
	monsters := devMonsters(devRoom(t))
	require.Len(t, monsters, 3)

	var elite, boss, plain int
	for _, entity := range monsters {
		mc, _ := entity.GetComponent(ecs.ComponentTypeEnemy)
		monster := mc.(*components.MonsterComponent)
		assert.Equal(t, 20, monster.Level)
		assert.False(t, entity.HasComponent(ecs.ComponentTypeVelocity))

		switch {
		case monster.Boss:
			boss++
			assert.Equal(t, components.MonsterArchetypeDemon, monster.Archetype)
		case monster.Elite:
			elite++
			assert.Equal(t, components.MonsterArchetypeTroll, monster.Archetype)
		default:
			plain++
			assert.Equal(t, components.MonsterArchetypeTroll, monster.Archetype)
		}
	}
	assert.Equal(t, []int{1, 1, 1}, []int{plain, elite, boss})
}

// Standing beside them for seconds, a body is never struck and they never move.
// R15.
func TestDevTestRoom_EnemiesNeverMoveOrStrike(t *testing.T) {
	room := devRoom(t)
	_, body := devVisitor(t, room)
	tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	at.X, at.Y = 450, 320 // beside the Demon, inside everyone's aggro

	hc, _ := body.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)

	before := map[uuid.UUID]components.TransformComponent{}
	for _, monster := range devMonsters(room) {
		mt, _ := monster.GetComponent(ecs.ComponentTypeTransform)
		before[monster.ID] = *mt.(*components.TransformComponent)
	}

	devStep(room, 5)

	assert.Equal(t, health.MaxHealth, health.CurrentHealth, "never struck")
	for _, monster := range devMonsters(room) {
		mt, _ := monster.GetComponent(ecs.ComponentTypeTransform)
		assert.Equal(t, before[monster.ID], *mt.(*components.TransformComponent), "never moved")
	}
}

// A body walks straight through where an enemy stands. R15.
func TestDevTestRoom_EnemiesCanBeWalkedThrough(t *testing.T) {
	room := devRoom(t)
	_, body := devVisitor(t, room)
	tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	at.X, at.Y = 400, 150 // west of the Troll, on its line
	vc, _ := body.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX = 1

	devStep(room, 1)

	assert.Greater(t, at.X, 500.0, "through the Troll at x 450")
	assert.Equal(t, 150.0, at.Y, "and not pushed round it")
}

// 2s after a death the corpse is gone and a fresh enemy stands, with no drop. R16, R17.
func TestDevTestRoom_AKilledEnemyIsReplacedWithNoDrop(t *testing.T) {
	room := devRoom(t)
	ids := func() []uuid.UUID {
		var out []uuid.UUID
		for _, monster := range devMonsters(room) {
			out = append(out, monster.ID)
		}
		return out
	}

	for _, slain := range devMonsters(room) {
		mc, _ := slain.GetComponent(ecs.ComponentTypeEnemy)
		monster := mc.(*components.MonsterComponent)
		hc, _ := slain.GetComponent(ecs.ComponentTypeHealth)
		hc.(*components.HealthComponent).CurrentHealth = 0
		newFieldDrops(room, fixedRand{0}).ConsumeKill(killedAt(monster.Archetype, uuid.New(), monster.Level, monster.Elite, 450, 300))
		room.step(1.0/60, room.EntityManager.GetAllEntities())

		devStep(room, 1.9)
		assert.Contains(t, ids(), slain.ID, "the corpse still lies inside the 2s")
		assert.Equal(t, components.MonsterActionDead, monster.Action)

		devStep(room, 0.2)
		assert.NotContains(t, ids(), slain.ID, "the corpse is gone")
		assert.Len(t, ids(), 3, "and one stands in its place")
	}

	assert.Empty(t, dropPiles(room), "no drops")
	for _, monster := range devMonsters(room) {
		assert.False(t, monster.HasComponent(ecs.ComponentTypeVelocity), "spawned the same way")
		mc, _ := monster.GetComponent(ecs.ComponentTypeEnemy)
		assert.NotEqual(t, components.MonsterActionDead, mc.(*components.MonsterComponent).Action)
	}
}

// A corpse its lifetime already took is no error: the slot still refills. R16.
func TestDevTestRoom_ACorpseAlreadyGoneStillRefills(t *testing.T) {
	room := devRoom(t)
	slain := devMonsters(room)[0]
	hc, _ := slain.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	room.step(1.0/60, room.EntityManager.GetAllEntities())
	room.EntityManager.RemoveEntity(slain.ID)

	devStep(room, 2.1)

	assert.Len(t, devMonsters(room), 3)
}

// Four pre-opened chests hold the fixed list, every unique included, at max
// affix values, and nothing rolls. R11, R12.
func TestDevTestRoom_ChestsArePreOpenedAndHoldTheList(t *testing.T) {
	room := devRoom(t)
	chests := devChests(room)
	require.Len(t, chests, 4)

	effects := map[string]bool{}
	byType := map[types.ItemType]int{}
	for _, chest := range chests {
		oc, _ := chest.GetComponent(ecs.ComponentTypeOpenable)
		openable := oc.(*components.OpenableComponent)
		assert.True(t, openable.IsOpen)
		assert.True(t, openable.HasBeenOpened, "so opening it never rolls")

		for _, id := range heldBy(t, chest) {
			item := itemOf(t, room, id)
			byType[item.ItemType]++
			assert.LessOrEqual(t, item.RequiredLevel, 20, item.Name)
			assert.Nil(t, item.InstanceID, "%s is in ECS memory only", item.Name)

			if item.UniqueEffectCode != "" {
				effects[item.UniqueEffectCode] = true
				assert.Equal(t, rarityFabled, item.RarityCode)
				continue
			}
			assert.Equal(t, rarityRuned, item.RarityCode, item.Name)
			for _, affix := range item.Affixes {
				rule := devAffixRule(t, affix.Stat)
				assert.Equal(t, rule.Bands[len(rule.Bands)-1].Max, affix.Value, "%s %s", item.Name, affix.Stat)
				assert.True(t, slices.Contains(rule.On, string(item.ItemType)) || slices.Contains(rule.On, string(item.ArmorSlot)),
					"%s cannot carry %s", item.Name, affix.Stat)
			}
		}
	}

	for code := range knownUniqueEffects {
		assert.True(t, effects[code], "no unique carries %s", code)
	}
	assert.Positive(t, byType[types.ItemTypeWeapon])
	assert.Positive(t, byType[types.ItemTypeArmor])
	assert.Positive(t, byType[types.ItemTypeRing])
}

func devAffixRule(t *testing.T, stat string) AffixRule {
	t.Helper()
	for _, rule := range AffixTable {
		if rule.Stat == stat {
			return rule
		}
	}
	t.Fatalf("no affix rule for %s", stat)
	return AffixRule{}
}

// A taken item is the taker's, and a copy is back in its chest 2s later. R13.
func TestDevTestRoom_ATakenItemIsBackInItsChestAfterTwoSeconds(t *testing.T) {
	room := devRoom(t)
	memberID, body := devVisitor(t, room)

	chest := devChests(room)[0]
	held := heldBy(t, chest)
	size := len(held)
	require.Positive(t, size)
	taken := held[0]
	name := itemOf(t, room, taken).Name

	ct, _ := chest.GetComponent(ecs.ComponentTypeTransform)
	bt, _ := body.GetComponent(ecs.ComponentTypeTransform)
	at := bt.(*components.TransformComponent)
	at.X, at.Y = ct.(*components.TransformComponent).X, ct.(*components.TransformComponent).Y
	require.NoError(t, pickUp(t, room, memberID, taken))
	assert.Len(t, heldBy(t, chest), size-1)

	devStep(room, 1.9)
	assert.Len(t, heldBy(t, chest), size-1, "not yet")

	devStep(room, 0.2)
	now := heldBy(t, chest)
	require.Len(t, now, size, "back")
	assert.NotContains(t, now, taken, "a new entity")
	assert.Equal(t, name, itemOf(t, room, now[len(now)-1]).Name)
	assert.Equal(t, name, itemOf(t, room, taken).Name, "and the taker keeps theirs")

	lc, _ := body.GetComponent(ecs.ComponentTypeItemIDList)
	assert.Contains(t, lc.(*components.ItemIDListComponent).ItemIDs, taken)
}
