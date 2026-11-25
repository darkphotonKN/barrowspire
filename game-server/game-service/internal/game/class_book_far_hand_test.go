package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §B R9, §J R50 as reconciled at wave 2; FS-5FZ4J §C R16, §D
// R25-R28; FS-MQYEX. I-X2CMM-15.

// castFarHand is the mage's Far Hand cast at the entity target.
func castFarHand(s *Session, mage uuid.UUID, target uuid.UUID) error {
	return s.castSkill(mage, types.PlayerCastSkillPayload{SkillID: "far_hand", TargetID: target.String()})
}

// farSpot is the centre of a walkable cell of the dungeon floor 3 to 5 cells
// from (x, y): out of an interact's reach, within Far Hand's 6 cells.
func farSpot(t *testing.T, s *Session, x, y float64) point {
	t.Helper()
	d := s.dungeon
	size := d.layout.CellSize
	from := d.cellOf(point{x, y})
	for r := 3; r <= 5; r++ {
		for dy := -r; dy <= r; dy++ {
			for dx := -r; dx <= r; dx++ {
				c := components.Cell{X: from.X + dx, Y: from.Y + dy}
				at := d.cellCentre(c)
				if gap := math.Hypot(at.x-x, at.y-y); gap < 3*size || gap > 5*size {
					continue
				}
				if s.navGrid.Walkable(c.X, c.Y) {
					return at
				}
			}
		}
	}
	t.Fatalf("no walkable cell 3 to 5 cells from (%v, %v)", x, y)
	return point{}
}

// farHandMageBy stands a level-5 mage of the run on a walkable cell 3 to 5
// cells from target, the world ticked once.
func farHandMageBy(t *testing.T, s *Session, target *ecs.Entity) (uuid.UUID, *ecs.Entity) {
	t.Helper()
	at := transformOf(t, target)
	spot := farSpot(t, s, at.X, at.Y)
	mage, body := placeDelverAt(t, s, "mage", 5, spot.x, spot.y)
	// ticked once, so their gear counts
	clearMonsters(s)
	tick(s)
	return mage, body
}

// throughFarHand casts Far Hand and runs the world through its 1 s cast,
// monsters cleared each tick.
func throughFarHand(t *testing.T, s *Session, mage uuid.UUID, target uuid.UUID) {
	t.Helper()
	require.NoError(t, castFarHand(s, mage, target))
	for range castTicks(1) {
		clearMonsters(s)
		tick(s)
	}
}

// A level-5 mage's Far Hand on the first lever in turn, 3 to 5 cells off,
// pulls it down when the 1 s cast completes, as an interact beside it would:
// 15 mana paid and the 30 s cooldown started. R50, R9.
func TestCastSkill_FarHand_PullsALeverFromAfar(t *testing.T) {
	s, _, _ := sealedRun(t, 7, forcedSeal(components.SealLeverOrder))
	clearMonsters(s)
	levers := leversInTurn(t, s)
	mage, body := farHandMageBy(t, s, levers[0])
	require.False(t, s.calcWithinDistance(transformOf(t, body).X, transformOf(t, body).Y, transformOf(t, levers[0]).X, transformOf(t, levers[0]).Y), "out of an interact's reach")
	mana := currentResource(body)

	throughFarHand(t, s, mage, levers[0].ID)

	assert.True(t, pieceOf(levers[0]).Active, "pulled down")
	assert.Equal(t, mana-15, currentResource(body))
	assert.Equal(t, components.BookCooldown{Remaining: 30, Total: 30}, bookOf(t, body).Cooldowns[components.PageFarHand])
}

// A lever pulled out of turn by Far Hand darts the mage and springs every
// lever back up, and the mage is told so on the interact's reply, as an E
// press would be told. FS-5FZ4J §C R16.
func TestCastSkill_FarHand_ALeverOutOfTurnDartsTheMage(t *testing.T) {
	s, _, sender := sealedRun(t, 7, forcedSeal(components.SealLeverOrder))
	clearMonsters(s)
	levers := leversInTurn(t, s)
	mage, body := farHandMageBy(t, s, levers[1])
	health := currentHealth(body)

	throughFarHand(t, s, mage, levers[1].ID)
	tick(s)

	assert.False(t, pieceOf(levers[1]).Active)
	assert.Less(t, currentHealth(body), health, "the dart volley hit the mage")
	reply := lastReply(t, sender, mage)
	assert.Equal(t, RefusalLeverWrong, reply["reason"])
}

// Far Hand on a run's shut chest starts the mage's timed open, counted where
// the mage stands, 4 cells off: still, the chest opens 1.5 s later; a step
// cancels it and the chest stays shut, as it would beside the chest. FS-MQYEX
// D3.
func TestCastSkill_FarHand_AChestOpensThroughTheMagesTimedOpen(t *testing.T) {
	for name, moves := range map[string]bool{"standing": false, "stepping away": true} {
		t.Run(name, func(t *testing.T) {
			s, _, chest := worldWithShutChest(t, RunBounds())
			at := transformOf(t, chest)
			mage, body := placeDelverAt(t, s, "mage", 5, at.X+4*cell, at.Y)

			require.NoError(t, castFarHand(s, mage, chest.ID))
			ticks(s, castTicks(1))

			open := timedOpenOf(body)
			require.NotNil(t, open, "the cast's end starts the mage's timed open")
			assert.Equal(t, chest.ID, open.TargetID)
			assertShutAndUnrolled(t, chest)
			if moves {
				require.NoError(t, s.handleMove(mage, 0, 1))
				tick(s)
				require.NoError(t, s.handleMove(mage, 0, 0))
			}
			ticks(s, timedOpenTicks()+1)

			oc, _ := chest.GetComponent(ecs.ComponentTypeOpenable)
			if moves {
				assert.False(t, oc.(*components.OpenableComponent).IsOpen, "a step cancels it")
				return
			}
			assert.True(t, oc.(*components.OpenableComponent).IsOpen)
			assert.True(t, oc.(*components.OpenableComponent).HasBeenOpened, "rolled")
		})
	}
}

// Far Hand on a floor door 4 cells off swings it, shut to open, as an
// interact beside it would.
func TestCastSkill_FarHand_SwingsADoor(t *testing.T) {
	s, _, chest := worldWithShutChest(t, RunBounds())
	at := transformOf(t, chest)
	door, _ := s.EntityManager.GetEntity(s.AddDoor(at.X+4*cell-40, at.Y-8, 80, 16))
	mage, _ := placeDelverAt(t, s, "mage", 5, at.X, at.Y+2*cell)

	require.NoError(t, castFarHand(s, mage, door.ID))
	ticks(s, castTicks(1))

	oc, _ := door.GetComponent(ecs.ComponentTypeOpenable)
	assert.True(t, oc.(*components.OpenableComponent).IsOpen)
}

// The stairs are no Far Hand target: the cast is refused, and nobody
// climbs. R50 as reconciled.
func TestCastSkill_FarHand_RefusesTheStairs(t *testing.T) {
	s := unstartedRun(t)
	stairs := CreateStairsEntity(s.EntityManager, StairsConfig{X: 500 + 3*cell, Y: 500})
	mage, body := placeDelverAt(t, s, "mage", 5, 500, 500)
	mana := currentResource(body)

	require.NoError(t, castFarHand(s, mage, stairs.ID))
	ticks(s, castTicks(1))

	assert.Nil(t, bookOf(t, body).Casting)
	assert.Equal(t, mana, currentResource(body))
	assert.Empty(t, bookOf(t, body).Cooldowns)
}

// springByFarHand is trapsRun's floor with its first trap made a detected
// trap of kind and a level-5 mage 3 to 5 cells from it.
func springByFarHand(t *testing.T, kind components.TrapKind) (*Session, []uuid.UUID, *ecs.Entity, uuid.UUID, *ecs.Entity) {
	t.Helper()
	s, ids := trapsRun(t, 7, 1)
	trap := firstTrapAs(t, s, kind)
	dc, _ := trap.GetComponent(ecs.ComponentTypeDetectable)
	dc.(*components.DetectableComponent).Detected = true
	mage, body := farHandMageBy(t, s, trap)
	return s, ids, trap, mage, body
}

// Far Hand springs a detected spike plate, dart wall or fire jet as if it
// were stepped on with no body on it: it disarms, to re-arm later, and hits
// no one, the mage included.
func TestCastSkill_FarHand_SpringsAHittingTrapHittingNoOne(t *testing.T) {
	for _, kind := range []components.TrapKind{components.TrapSpikePlate, components.TrapDartWall, components.TrapFireJet} {
		t.Run(string(kind), func(t *testing.T) {
			s, _, trap, mage, body := springByFarHand(t, kind)
			health := currentHealth(body)

			throughFarHand(t, s, mage, trap.ID)
			tick(s)

			assert.False(t, trapOf(trap).Armed, "sprung")
			assert.False(t, trapOf(trap).Spent)
			assert.Equal(t, health, currentHealth(body), "the mage is not hit")
		})
	}
}

// A tripwire sprung by Far Hand is spent and wakes its ambush on the mage.
// FS-5FZ4J §D R27.
func TestCastSkill_FarHand_ATripwireWakesItsAmbushOnTheMage(t *testing.T) {
	s, _, trap, mage, body := springByFarHand(t, components.TrapTripwire)
	require.NoError(t, castFarHand(s, mage, trap.ID))
	clearMonsters(s)
	ticks(s, castTicks(1)-1)
	before := monstersInWorld(s.EntityManager)

	tick(s)

	assert.True(t, trapOf(trap).Spent)
	pack := newMonsters(s, before)
	require.NotEmpty(t, pack, "its ambush woke")
	for _, m := range pack {
		assert.Equal(t, body.ID, monsterOf(m).LastAttacker, "it hunts the mage")
	}
}

// A gas vent sprung by Far Hand puffs at whoever stands in its cloud: the
// teammate beside it is poisoned, the mage 3 to 5 cells off is not.
// FS-5FZ4J §D R28.
func TestCastSkill_FarHand_AGasVentPuffsAtWhoeverIsInItsCloud(t *testing.T) {
	s, ids, vent, mage, body := springByFarHand(t, components.TrapGasVent)
	teammate := delverEntity(t, s, ids[0])
	require.NoError(t, castFarHand(s, mage, vent.ID))
	clearMonsters(s)
	ticks(s, castTicks(1)-1)
	beside(t, s, teammate, trapOf(vent).Cell)
	trapOf(vent).Clouded, trapOf(vent).PuffIn = true, GasVentPuffEvery
	clearPoison(teammate)

	tick(s)

	assert.Positive(t, poisonedFor(teammate), "the teammate in the cloud is poisoned")
	assert.Zero(t, poisonedFor(body), "the mage out of it is not")
	assert.True(t, trapOf(vent).Puffed)
}

// clearPoison takes any poison off the delver.
func clearPoison(delver *ecs.Entity) {
	delver.RemoveComponent(ecs.ComponentTypePoison)
}

// Far Hand on a chest whose guard still stands is refused as the reach is:
// the mage is told so on the interact's reply, no timed open starts, and the
// page is not paid for. FS-KE075 §J R58; FS-X2CMM §A R4.
func TestCastSkill_FarHand_AGuardedChestIsRefusedNothingSpent(t *testing.T) {
	s, _, chest, guards, sent := guardedChest(t, 1)
	guardAt := transformOf(t, guards[0])
	guardAt.X, guardAt.Y = 3000, 3000
	at := transformOf(t, chest)
	mage, body := placeDelverAt(t, s, "mage", 5, at.X+4*cell, at.Y)
	tick(s)
	mana := currentResource(body)

	require.NoError(t, castFarHand(s, mage, chest.ID))
	ticks(s, castTicks(1))

	assert.Nil(t, timedOpenOf(body))
	assertShutAndUnrolled(t, chest)
	assert.Contains(t, refusalsTo(sent, mage), RefusalContainerGuarded)
	assert.Equal(t, mana, currentResource(body), "no mana")
	assert.Empty(t, bookOf(t, body).Cooldowns, "no cooldown")
}
