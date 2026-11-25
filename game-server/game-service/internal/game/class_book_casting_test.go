package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §C R14, §D R16–R20, §E R21, §F R32, R34. I-X2CMM-2.

// cell is the cell edge a run with no floor entity measures pages in.
var cell = levelgen.DungeonFloor1Params.CellSize

// castTicks is the ticks a page's cast time takes, the cast's own tick counted.
func castTicks(seconds float64) int {
	return int(math.Round(seconds * float64(constants.GameFrameRate)))
}

func castWitchlight(s *Session, playerID uuid.UUID, x, y float64) error {
	return s.castSkill(playerID, types.PlayerCastSkillPayload{SkillID: "witchlight", TargetX: x, TargetY: y})
}

// witchlights are the run's witchlights, as entities.
func witchlights(s *Session) []*ecs.Entity {
	var lights []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if ec, ok := e.GetComponent(ecs.ComponentTypeBookEffect); ok && ec.(*components.BookEffectComponent).Kind == components.BookEffectWitchlight {
			lights = append(lights, e)
		}
	}
	return lights
}

// witchlightMage is a run with a level-2 mage at (500, 500) and a teammate
// far off, so the run goes on whatever befalls the mage.
func witchlightMage(t *testing.T) (s *Session, mage uuid.UUID, body *ecs.Entity) {
	t.Helper()
	s = unstartedRun(t)
	s.endSessionCh = make(chan bool, 64)
	mage, body = placeDelverAt(t, s, "mage", 2, 500, 500)
	placeDelverAt(t, s, "warrior", 1, 3000, 3000)
	return s, mage, body
}

// assertNothingSpent is a cast that ended with no cost, no cooldown and no
// light, however long the world then runs.
func assertNothingSpent(t *testing.T, s *Session, body *ecs.Entity, manaBefore int) {
	t.Helper()
	assert.Nil(t, bookOf(t, body).Casting, "the cast is broken")
	ticks(s, castTicks(1))
	assert.Empty(t, bookOf(t, body).Cooldowns, "no cooldown")
	assert.Empty(t, witchlights(s), "no light")
	assert.GreaterOrEqual(t, currentResource(body), manaBefore, "no mana spent")
}

// A level-2 mage casts Witchlight at a walkable point 5 cells off: casting
// shows in their book for 1 s, then 20 mana is paid, the 45 s cooldown starts
// and a witchlight stands in every recipient's state at the point for 20 s.
// AC 1; R16–R17, R21, R32, R34.
func TestCastSkill_WitchlightCastsForASecondThenLightsThePointFor20Seconds(t *testing.T) {
	s, mage, body := witchlightMage(t)
	other := uuid.New()
	s.AddPlayer(other, types.CharacterInPlay{Name: "Kaelen", Class: "warrior"}, "")
	manaBefore := currentResource(body)

	require.NoError(t, castWitchlight(s, mage, 500+5*cell, 500))
	ticks(s, castTicks(1)-1)

	casting := frameOf(t, s, types.WorldTypeRun, mage)["current_player"].(map[string]any)["book"].(map[string]any)["casting"]
	require.NotNil(t, casting, "casting through the cast time")
	assert.Equal(t, "witchlight", casting.(map[string]any)["page"])
	assert.Equal(t, 1.0, casting.(map[string]any)["total"])
	assert.Empty(t, witchlights(s), "no light before the cast completes")
	assert.Equal(t, manaBefore, currentResource(body), "nothing paid yet")

	tick(s)

	assert.Nil(t, bookOf(t, body).Casting)
	assert.NotContains(t, frameOf(t, s, types.WorldTypeRun, mage)["current_player"].(map[string]any)["book"], "casting")
	assert.Equal(t, manaBefore-20, currentResource(body), "20 mana")
	assert.Equal(t, components.BookCooldown{Remaining: 45, Total: 45}, bookOf(t, body).Cooldowns[components.PageWitchlight])
	require.Len(t, witchlights(s), 1)
	for _, recipient := range []uuid.UUID{mage, other} {
		effects := frameOf(t, s, types.WorldTypeRun, recipient)["book_effects"].([]any)
		require.Len(t, effects, 1, recipient)
		light := effects[0].(map[string]any)
		assert.Equal(t, "witchlight", light["kind"])
		assert.Equal(t, 500+5*cell, light["x"])
		assert.Equal(t, 500.0, light["y"])
	}

	ticks(s, castTicks(20)-1)
	assert.Len(t, witchlights(s), 1, "lit until 20 s")
	ticks(s, 2)
	assert.Empty(t, witchlights(s), "gone after 20 s")
}

// Walking, a monster hit that costs health, a left-click that resolves and
// death during the cast each break it with no mana spent, no cooldown and no
// light. AC 2; R18, R20.
func TestCastSkill_WitchlightBrokenWithNothingSpent(t *testing.T) {
	tests := []struct {
		name    string
		breakIt func(t *testing.T, s *Session, mage uuid.UUID, body *ecs.Entity)
	}{
		{"walking", func(t *testing.T, s *Session, mage uuid.UUID, _ *ecs.Entity) {
			require.NoError(t, s.handleMove(mage, 0, 1), "casting does not root")
			tick(s)
			require.NoError(t, s.handleMove(mage, 0, 0))
		}},
		// FS-7P736 §A R10; AC 5
		{"a roll", func(t *testing.T, s *Session, mage uuid.UUID, _ *ecs.Entity) {
			s.queueIntent(func() { s.roll(mage, 0, 1) })
			tick(s)
		}},
		{"a monster hit that costs health", func(t *testing.T, s *Session, _ uuid.UUID, body *ecs.Entity) {
			before := currentHealth(body)
			strikeFrom(t, s, body)
			tick(s)
			require.Less(t, currentHealth(body), before, "the strike cost health")
		}},
		{"a left-click that resolves", func(t *testing.T, s *Session, mage uuid.UUID, _ *ecs.Entity) {
			require.NoError(t, s.handleCastSkill(mage, "fireball", 500, 900))
			tick(s)
		}},
		{"death", func(t *testing.T, s *Session, _ uuid.UUID, body *ecs.Entity) {
			kill(t, body)
			tick(s)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, mage, body := witchlightMage(t)
			manaBefore := currentResource(body)
			require.NoError(t, castWitchlight(s, mage, 500+5*cell, 500))
			ticks(s, 10)
			require.NotNil(t, bookOf(t, body).Casting)

			tt.breakIt(t, s, mage, body)

			assertNothingSpent(t, s, body, manaBefore)
		})
	}
}

// A point 9 cells off, or inside a wall, is refused with nothing spent; so is
// a second page while casting, and the first cast runs on. AC 3; R14, R19.
func TestCastSkill_WitchlightRefusedWithNothingSpent(t *testing.T) {
	t.Run("9 cells off", func(t *testing.T) {
		s, mage, body := witchlightMage(t)
		require.NoError(t, castWitchlight(s, mage, 500+9*cell, 500))
		assert.Nil(t, bookOf(t, body).Casting, "refused")
	})
	t.Run("inside a wall", func(t *testing.T) {
		s, mage, body := witchlightMage(t)
		CreateWallEntity(s.EntityManager, WallConfig{X: 700, Y: 400, Width: 80, Height: 200}, uuid.Nil)
		require.NoError(t, castWitchlight(s, mage, 740, 500))
		assert.Nil(t, bookOf(t, body).Casting, "refused")
	})
	t.Run("off the map", func(t *testing.T) {
		s, mage, body := witchlightMage(t)
		transformOf(t, body).X = 100
		require.NoError(t, castWitchlight(s, mage, -50, 500))
		assert.Nil(t, bookOf(t, body).Casting, "refused")
	})
	t.Run("a second page while casting", func(t *testing.T) {
		s, mage, body := witchlightMage(t)
		manaBefore := currentResource(body)
		require.NoError(t, castWitchlight(s, mage, 500+5*cell, 500))
		ticks(s, 10)
		started := *bookOf(t, body).Casting

		require.NoError(t, castWitchlight(s, mage, 500, 500+5*cell))

		assert.Equal(t, started, *bookOf(t, body).Casting, "the first cast runs on")
		// to the first cast's completing tick
		ticks(s, castTicks(1)-10)
		assert.Len(t, witchlights(s), 1, "one light, the first cast's")
		assert.Equal(t, manaBefore-20, currentResource(body), "paid once")
	})
}

// dungeonMage is a run on a generated dungeon floor with a level-2 mage where
// the floor seats them, on its ground.
func dungeonMage(t *testing.T) (s *Session, mage uuid.UUID, body *ecs.Entity) {
	t.Helper()
	s = newRun(t, &countingItemsClient{})
	require.NotNil(t, s.dungeon, "a dungeon floor")
	mage = uuid.New()
	body, ok := s.EntityManager.GetEntity(s.AddPlayer(mage, types.CharacterInPlay{Name: "Delver", Class: "mage", Level: 2}, ""))
	require.True(t, ok)
	at := transformOf(t, body)
	require.True(t, s.pageGround(at.X, at.Y), "the mage stands on ground")
	return s, mage, body
}

// groundNear is a point about cells off (x, y) that a ground page may aim at.
func groundNear(t *testing.T, s *Session, x, y, cells float64) (float64, float64) {
	t.Helper()
	for turn := 0.0; turn < 2*math.Pi; turn += math.Pi / 32 {
		px, py := x+cells*cell*math.Cos(turn), y+cells*cell*math.Sin(turn)
		if s.pageGround(px, py) {
			return px, py
		}
	}
	t.Fatalf("no ground %v cells off (%v, %v)", cells, x, y)
	return 0, 0
}

// On a dungeon floor a point on rock is refused, one on a walkable cell taken.
// R14.
func TestCastSkill_WitchlightOnADungeonFloorNeedsAWalkableCell(t *testing.T) {
	s, mage, body := dungeonMage(t)
	at := transformOf(t, body)
	rock := false
	var rx, ry float64
	for turn := 0.0; turn < 2*math.Pi && !rock; turn += math.Pi / 32 {
		for d := 1.0; d <= 7 && !rock; d++ {
			rx, ry = at.X+d*cell*math.Cos(turn), at.Y+d*cell*math.Sin(turn)
			rock = !s.pageGround(rx, ry)
		}
	}
	require.True(t, rock, "rock within 7 cells")

	require.NoError(t, castWitchlight(s, mage, rx, ry))
	assert.Nil(t, bookOf(t, body).Casting, "rock is refused")

	gx, gy := groundNear(t, s, at.X, at.Y, 1)
	require.NoError(t, castWitchlight(s, mage, gx, gy))
	assert.NotNil(t, bookOf(t, body).Casting, "a walkable cell is taken")
}

// A floor change breaks a cast in progress with nothing spent, and takes every
// witchlight of the old floor with it. AC 2, AC 4; R18, R21.
func TestRegenerateFloor_BreaksTheCastAndClearsTheWitchlights(t *testing.T) {
	s, mage, body := dungeonMage(t)
	at := transformOf(t, body)
	gx, gy := groundNear(t, s, at.X, at.Y, 2)
	require.NoError(t, castWitchlight(s, mage, gx, gy))
	ticks(s, castTicks(1))
	require.Len(t, witchlights(s), 1, "the first cast lit its point")

	bookOf(t, body).Cooldowns = map[components.PageID]components.BookCooldown{}
	manaBefore := currentResource(body)
	require.NoError(t, castWitchlight(s, mage, gx, gy))
	require.NotNil(t, bookOf(t, body).Casting)

	require.NoError(t, s.regenerateFloor())

	assert.Empty(t, witchlights(s), "the old floor's light went with it")
	assert.Nil(t, bookOf(t, body).Casting, "the floor change broke the cast")
	ticks(s, castTicks(1))
	assert.Empty(t, witchlights(s), "no light on the new floor")
	assert.Empty(t, bookOf(t, body).Cooldowns, "no cooldown")
	assert.GreaterOrEqual(t, currentResource(body), manaBefore, "no mana spent")
}
