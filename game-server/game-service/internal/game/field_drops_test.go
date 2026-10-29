package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §Requirements 31–36 (D13, D17, D23, D25); Edge States "Killer leaves
// before the window ends". I-X2F2H-5.

// lootedField is a built Meadows channel, not started, with a tier I pool of
// every type to drop from.
func lootedField(t *testing.T) *Session {
	t.Helper()
	field := builtField(t)
	pool := dropSession()
	field.itemPool, field.lootRarities = pool.itemPool, pool.lootRarities
	return field
}

// killedAt is a kill of the archetype by the killer, lying at (x, y).
func killedAt(archetype components.MonsterArchetype, killer uuid.UUID, level int, elite bool, x, y float64) systems.KillRecord {
	return systems.KillRecord{
		MonsterEntityID: uuid.New(), Archetype: archetype, Level: level, Elite: elite,
		KillerMemberID: killer, X: x, Y: y, Floor: 1,
	}
}

func pileOf(t *testing.T, pile *ecs.Entity) *components.ContainerComponent {
	t.Helper()
	cc, ok := pile.GetComponent(ecs.ComponentTypeContainer)
	require.True(t, ok)
	return cc.(*components.ContainerComponent)
}

// landPile drops one pile from the killer's kill where the killer stands, and
// hands it back with the item it holds.
func landPile(t *testing.T, field *Session, killer uuid.UUID) (*ecs.Entity, uuid.UUID) {
	t.Helper()
	before := map[uuid.UUID]bool{}
	for _, p := range dropPiles(field) {
		before[p.ID] = true
	}
	at := field.place.Arrival
	newFieldDrops(field, fixedRand{0}).ConsumeKill(killedAt(components.MonsterArchetypeBoar, killer, 2, false, at.X, at.Y))

	var landed []*ecs.Entity
	for _, p := range dropPiles(field) {
		if !before[p.ID] {
			landed = append(landed, p)
		}
	}
	require.Len(t, landed, 1)
	pile := landed[0]
	ids := pileItemIDs(t, pile)
	require.Len(t, ids, 1)
	return pile, ids[0]
}

// pickUp is the member's pickup of the item from where their body stands.
func pickUp(t *testing.T, field *Session, memberID, itemID uuid.UUID) error {
	t.Helper()
	body := delverEntity(t, field, memberID)
	tc, ok := body.GetComponent(ecs.ComponentTypeTransform)
	require.True(t, ok)
	return field.pickUpItem(body, tc.(*components.TransformComponent), itemID)
}

func ageFieldPiles(field *Session, seconds float64) {
	field.ageFieldDropPiles(seconds, field.EntityManager.GetAllEntities())
}

// A field kill drops at the chance of the Spire row its creature drops as,
// times the place's drop factor: the boar, the zombie and the ghost as the
// ghoul, any elite as the elite row. R31, D23.
func TestFieldDrops_ChanceIsTheSpireRowTimesThePlacesFactor(t *testing.T) {
	ghoul := MonsterDrops[components.MonsterArchetypeGhoul].Chance * MeadowsDropFactor
	elite := EliteMonsterDrop.Chance * MeadowsDropFactor
	const under = 1e-9

	tests := []struct {
		name      string
		archetype components.MonsterArchetype
		elite     bool
		roll      float64
		drops     bool
	}{
		{"boar under the ghoul's chance × factor", components.MonsterArchetypeBoar, false, ghoul - under, true},
		{"boar at the ghoul's chance × factor", components.MonsterArchetypeBoar, false, ghoul, false},
		{"elite boar under the elite chance × factor", components.MonsterArchetypeBoar, true, elite - under, true},
		{"elite boar at the elite chance × factor", components.MonsterArchetypeBoar, true, elite, false},
		{"zombie drops as the ghoul", components.MonsterArchetypeZombie, false, ghoul - under, true},
		{"ghost drops as the ghoul", components.MonsterArchetypeGhost, false, ghoul, false},
		{"elite zombie drops as the elite row", components.MonsterArchetypeZombie, true, elite - under, true},
		{"a creature naming no row drops nothing", "wisp", false, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			field := lootedField(t)

			newFieldDrops(field, fixedRand{tt.roll}).ConsumeKill(killedAt(tt.archetype, uuid.New(), 2, tt.elite, 100, 100))

			if tt.drops {
				assert.Len(t, dropPiles(field), 1)
			} else {
				assert.Empty(t, dropPiles(field))
			}
		})
	}
}

// The field reads the Spire's rows at roll time: retuning the ghoul's or the
// elite row retunes the field's chance with no field edit. R31, AC 16.
func TestFieldDrops_ReadTheSpireRowsLive(t *testing.T) {
	ghoulRow := MonsterDrops[components.MonsterArchetypeGhoul]
	eliteRow := EliteMonsterDrop
	t.Cleanup(func() {
		MonsterDrops[components.MonsterArchetypeGhoul] = ghoulRow
		EliteMonsterDrop = eliteRow
	})

	retuned := ghoulRow
	retuned.Chance = 0.6
	MonsterDrops[components.MonsterArchetypeGhoul] = retuned
	EliteMonsterDrop.Chance = 0.9

	tests := []struct {
		name  string
		elite bool
		roll  float64
		drops bool
	}{
		{"boar under the retuned ghoul row", false, 0.6*MeadowsDropFactor - 1e-9, true},
		{"boar at the retuned ghoul row", false, 0.6 * MeadowsDropFactor, false},
		{"elite boar under the retuned elite row", true, 0.9*MeadowsDropFactor - 1e-9, true},
		{"elite boar at the retuned elite row", true, 0.9 * MeadowsDropFactor, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			field := lootedField(t)

			newFieldDrops(field, fixedRand{tt.roll}).ConsumeKill(killedAt(components.MonsterArchetypeBoar, uuid.New(), 2, tt.elite, 100, 100))

			assert.Equal(t, tt.drops, len(dropPiles(field)) == 1)
		})
	}
}

// Over many seeded kills a field's drop rate lands on the Spire row's chance ×
// the factor, one item a drop as the row says. R31, AC "Field drop chance".
func TestFieldDrops_SeededRates(t *testing.T) {
	tests := []struct {
		name  string
		elite bool
		rate  float64
	}{
		{"boar", false, MonsterDrops[components.MonsterArchetypeGhoul].Chance * MeadowsDropFactor},
		{"elite boar", true, EliteMonsterDrop.Chance * MeadowsDropFactor},
	}
	const kills = 8000
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			field := lootedField(t)
			drops := newFieldDrops(field, seeded())
			for range kills {
				drops.ConsumeKill(killedAt(components.MonsterArchetypeBoar, uuid.New(), 2, tt.elite, 100, 100))
			}

			piles := dropPiles(field)
			assert.InDelta(t, tt.rate, float64(len(piles))/kills, 0.01)
			for _, pile := range piles {
				assert.Len(t, pileItemIDs(t, pile), 1)
			}
		})
	}
}

// A field pile lands open where the monster fell, holds items at the kill's
// level and is reserved for the killer from the moment it lands. R31, R33.
func TestFieldDrops_PileLandsReservedForTheKiller(t *testing.T) {
	field := lootedField(t)
	killer := uuid.New()

	newFieldDrops(field, fixedRand{0}).ConsumeKill(killedAt(components.MonsterArchetypeBoar, killer, 3, false, 321, 654))

	piles := dropPiles(field)
	require.Len(t, piles, 1)
	tc, _ := piles[0].GetComponent(ecs.ComponentTypeTransform)
	assert.Equal(t, 321.0, tc.(*components.TransformComponent).X)
	assert.Equal(t, 654.0, tc.(*components.TransformComponent).Y)
	oc, _ := piles[0].GetComponent(ecs.ComponentTypeOpenable)
	assert.True(t, oc.(*components.OpenableComponent).IsOpen)
	assert.Equal(t, killer, pileOf(t, piles[0]).ReservedFor)

	items := itemsByID(field, pileItemIDs(t, piles[0]))
	require.Len(t, items, 1)
	assert.Equal(t, 3, items[0].ItemLevel)
}

// A kill with no player killer still drops, reserved for nobody.
func TestFieldDrops_NoKiller_PileIsOpenToAnyone(t *testing.T) {
	field := lootedField(t)

	newFieldDrops(field, fixedRand{0}).ConsumeKill(killedAt(components.MonsterArchetypeBoar, uuid.Nil, 3, false, 100, 100))

	piles := dropPiles(field)
	require.Len(t, piles, 1)
	assert.Equal(t, uuid.Nil, pileOf(t, piles[0]).ReservedFor)
}

// The container rule keeps each chest-rolled item with probability equal to
// the factor. R32, AC "container rule".
func TestKeepEach_KeepsEachItemWithTheFactor(t *testing.T) {
	r := seeded()
	const items = 20000
	ids := make([]uuid.UUID, items)
	for i := range ids {
		ids[i] = uuid.New()
	}

	kept, dropped := keepEach(r, ids, MeadowsDropFactor)

	assert.Len(t, append(kept, dropped...), items, "every item is kept or dropped")
	assert.InDelta(t, MeadowsDropFactor, float64(len(kept))/items, 0.01)
}

// A field container rolls the Spire's chest roll unchanged and keeps each item
// at the factor; what it does not keep leaves the world. R32.
func TestFieldContainerRoll_KeepsTheChestRollAtTheFactor(t *testing.T) {
	items := func(s *Session) int {
		n := 0
		for _, e := range s.EntityManager.GetAllEntities() {
			if e.HasComponent(ecs.ComponentTypeItem) {
				n++
			}
		}
		return n
	}

	t.Run("factor 1 keeps the whole chest roll", func(t *testing.T) {
		field := lootedField(t)
		ids, err := field.fieldContainerRoll(seeded(), 1)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(ids), 2)
		assert.LessOrEqual(t, len(ids), 4)
		assert.Equal(t, len(ids), items(field))
	})
	t.Run("factor 0 keeps nothing and leaves nothing behind", func(t *testing.T) {
		field := lootedField(t)
		ids, err := field.fieldContainerRoll(seeded(), 0)
		require.NoError(t, err)
		assert.Empty(t, ids)
		assert.Zero(t, items(field))
	})
	t.Run("the Meadows' factor keeps about that share", func(t *testing.T) {
		field := lootedField(t)
		r := seeded()
		kept := 0
		for range 2000 {
			ids, err := field.fieldContainerRoll(r, MeadowsDropFactor)
			require.NoError(t, err)
			kept += len(ids)
		}
		// the chest roll draws 2 to 4 items, 3 on average
		assert.InDelta(t, 3*MeadowsDropFactor, float64(kept)/2000, 0.1)
		assert.Equal(t, kept, items(field))
	})
}

// Inside the window anyone else's pickup is refused loot_reserved and the
// item stays; the killer's succeeds at once. After it, anyone in range takes.
// R33, AC "loot_reserved".
func TestFieldPile_KillerFirstWindow(t *testing.T) {
	field := lootedField(t)
	killer := visitor(t, field, fieldWren)
	other := visitor(t, field, fieldKael)

	pile, itemID := landPile(t, field, killer)
	require.ErrorIs(t, pickUp(t, field, other, itemID), ErrLootReserved)
	assert.Equal(t, []uuid.UUID{itemID}, pileItemIDs(t, pile), "the item stays")

	ageFieldPiles(field, FieldLootWindow-0.1)
	require.ErrorIs(t, pickUp(t, field, other, itemID), ErrLootReserved, "still inside the window")

	ageFieldPiles(field, 0.1)
	require.NoError(t, pickUp(t, field, other, itemID), "the window is over")
	assert.Contains(t, inventory(t, field, delverEntity(t, field, other).ID).ItemIDs, itemID)

	_, mine := landPile(t, field, killer)
	require.NoError(t, pickUp(t, field, killer, mine), "the killer takes at once")
	assert.Contains(t, inventory(t, field, delverEntity(t, field, killer).ID).ItemIDs, mine)
}

// The window runs whether or not the killer is still in the field. Edge State
// "Killer leaves before the window ends".
func TestFieldPile_KillerLeft_WindowStillRuns(t *testing.T) {
	field := lootedField(t)
	killer := visitor(t, field, fieldWren)
	other := visitor(t, field, fieldKael)
	_, itemID := landPile(t, field, killer)

	field.RemovePlayer(killer.String())

	require.ErrorIs(t, pickUp(t, field, other, itemID), ErrLootReserved)
	ageFieldPiles(field, FieldLootWindow)
	require.NoError(t, pickUp(t, field, other, itemID))
}

// A refused pickup tells the player why, with the loot_reserved reason.
// R33, R60.
func TestHandleInteract_ReservedPile_RefusesWithLootReserved(t *testing.T) {
	field := lootedField(t)
	sender := &recordingSender{}
	field.sender = sender
	killer := visitor(t, field, fieldWren)
	other := visitor(t, field, fieldKael)
	_, itemID := landPile(t, field, killer)

	require.ErrorIs(t, field.handleInteract(other, itemID), ErrLootReserved)

	sent := sender.to(other)
	require.Len(t, sent, 1)
	payload := sent[0].Payload
	assert.Equal(t, string(constants.ActionInteract), sent[0].Action)
	assert.Equal(t, false, payload["success"])
	assert.Equal(t, "loot_reserved", payload["reason"])
}

// The pile carries who it is reserved for only while the window is open.
// R35.
func TestFieldPile_ReservationEndsWithTheWindow(t *testing.T) {
	field := lootedField(t)
	killer := uuid.New()
	pile, _ := landPile(t, field, killer)

	ageFieldPiles(field, FieldLootWindow-0.1)
	assert.Equal(t, killer, pileOf(t, pile).ReservedFor)

	ageFieldPiles(field, 0.1)
	assert.Equal(t, uuid.Nil, pileOf(t, pile).ReservedFor)
}

// A field pile is removed 120 s after landing with whatever it holds; an
// emptied one at once, on the world's tick. R34, D25.
func TestFieldPile_Expires(t *testing.T) {
	t.Run("gone with its items 120 s after landing", func(t *testing.T) {
		field := lootedField(t)
		pile, itemID := landPile(t, field, uuid.New())

		ageFieldPiles(field, FieldDropPileLifetime-0.1)
		_, ok := field.EntityManager.GetEntity(pile.ID)
		require.True(t, ok, "still there just before")

		ageFieldPiles(field, 0.1)
		_, ok = field.EntityManager.GetEntity(pile.ID)
		assert.False(t, ok, "the pile is gone")
		_, ok = field.EntityManager.GetEntity(itemID)
		assert.False(t, ok, "and what it held with it")
	})
	t.Run("an emptied pile goes on the next tick", func(t *testing.T) {
		field := lootedField(t)
		killer := visitor(t, field, fieldWren)
		pile, itemID := landPile(t, field, killer)
		require.NoError(t, pickUp(t, field, killer, itemID))

		tick(field)

		_, ok := field.EntityManager.GetEntity(pile.ID)
		assert.False(t, ok)
		_, ok = field.EntityManager.GetEntity(itemID)
		assert.True(t, ok, "the taken item is the killer's, not removed")
	})
	t.Run("the world's tick ages a pile", func(t *testing.T) {
		field := lootedField(t)
		pile, _ := landPile(t, field, uuid.New())

		tick(field)

		assert.InDelta(t, 1.0/float64(constants.GameFrameRate), pileOf(t, pile).Age, 1e-9)
	})
}

// A run's piles never expire, are never reserved and stay when emptied.
// R34, R35: "run piles unchanged".
func TestRunPile_Unchanged(t *testing.T) {
	s := lootedRun(t)
	_, delver := placeDelver(t, s, "warrior", 500, 500)
	itemID := s.AddItem(oneOfEverySlot()["weapon"])
	kept := s.AddItem(oneOfEverySlot()["weapon"])
	emptied := CreateDropPileEntity(s.EntityManager, 500, 500, []uuid.UUID{itemID})
	full := CreateDropPileEntity(s.EntityManager, 520, 500, []uuid.UUID{kept})

	tc, _ := delver.GetComponent(ecs.ComponentTypeTransform)
	require.NoError(t, s.pickUpItem(delver, tc.(*components.TransformComponent), itemID))
	ageFieldPiles(s, FieldDropPileLifetime*2)
	tick(s)

	for _, pile := range []*ecs.Entity{emptied, full} {
		_, ok := s.EntityManager.GetEntity(pile.ID)
		assert.True(t, ok)
		assert.Equal(t, uuid.Nil, pileOf(t, pile).ReservedFor)
		assert.Zero(t, pileOf(t, pile).Age)
	}
}

// A field subscribes the field drop consumer and not the run's; a run the
// run's alone. R31.
func TestNewSession_FieldDropsInFieldsOnly(t *testing.T) {
	count := func(s *Session) (run, field int) {
		for _, consumer := range s.killConsumers {
			switch consumer.(type) {
			case *monsterDrops:
				run++
			case *fieldDrops:
				field++
			}
		}
		return run, field
	}

	run, field := count(builtField(t))
	assert.Equal(t, 0, run)
	assert.Equal(t, 1, field)

	run, field = count(unstartedRun(t))
	assert.Equal(t, 1, run)
	assert.Equal(t, 0, field)
}

// A field loads the item catalogue as it is built, so its kills have
// something to drop. R31.
func TestNewSession_FieldLoadsTheItemPool(t *testing.T) {
	place := GentleMeadows()

	field := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, FieldBounds(place))

	assert.Positive(t, field.itemPool.count())
}
