package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §E R27, §F R34. I-X2CMM-7.

// draughts are the run's draughts, as entities.
func draughts(s *Session) []*ecs.Entity {
	var set []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if ec, ok := e.GetComponent(ecs.ComponentTypeBookEffect); ok && ec.(*components.BookEffectComponent).Kind == components.BookEffectDraught {
			set = append(set, e)
		}
	}
	return set
}

// brew has the archer cast Brew and lets its 3 s run out: the draught.
func brew(t *testing.T, s *Session, archer uuid.UUID) *ecs.Entity {
	t.Helper()
	require.NoError(t, castPageSkill(s, archer, "brew"))
	ticks(s, castTicks(3))
	set := draughts(s)
	require.Len(t, set, 1, "the draught is set down")
	return set[0]
}

// wound sets the delver's health.
func wound(delver *ecs.Entity, current, maximum int) {
	hc, _ := delver.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	health.CurrentHealth, health.MaxHealth = current, maximum
}

// A level-9 archer brews: after 3 s 30 stamina is paid, the 120 s cooldown
// starts and a draught stands at their feet in every recipient's state, as
// book effect kind "draught" with the id an interact names. AC 1; R27, R34.
func TestCastSkill_BrewSetsADraughtAtTheArchersFeetForEveryone(t *testing.T) {
	s := unstartedRun(t)
	archer, body := placeDelverAt(t, s, "archer", 9, 500, 500)
	mate, _ := placeDelverAt(t, s, "warrior", 9, 3000, 3000)
	staminaBefore := currentResource(body)

	draught := brew(t, s, archer)

	assert.Equal(t, staminaBefore-30, currentResource(body), "30 stamina")
	assert.Equal(t, components.BookCooldown{Remaining: 120, Total: 120}, bookOf(t, body).Cooldowns[components.PageBrew])
	for _, recipient := range []uuid.UUID{archer, mate} {
		effects, _ := frameOf(t, s, types.WorldTypeRun, recipient)["book_effects"].([]any)
		require.Len(t, effects, 1, recipient)
		set := effects[0].(map[string]any)
		assert.Equal(t, "draught", set["kind"])
		assert.Equal(t, draught.ID.String(), set["id"])
		assert.Equal(t, 500.0, set["x"])
		assert.Equal(t, 500.0, set["y"])
	}
}

// A wounded teammate interacting with the draught within 60 px drinks it: it
// is gone from every state, the teammate heals 30 % of max over 6 s and
// carries draught while healing; a second interact does nothing. AC 2; R27,
// R34.
func TestHandleInteract_AWoundedTeammateDrinksTheDraught(t *testing.T) {
	s := unstartedRun(t)
	archer, _ := placeDelverAt(t, s, "archer", 9, 500, 500)
	mate, mateBody := placeDelverAt(t, s, "warrior", 9, 540, 520)
	draught := brew(t, s, archer)
	wound(mateBody, 50, 200)

	require.NoError(t, s.handleInteract(mate, draught.ID))
	tick(s)

	assert.Empty(t, draughts(s), "drunk, the draught is gone")
	assert.Empty(t, frameOf(t, s, types.WorldTypeRun, archer)["book_effects"])
	assert.Contains(t, bookStateNames(t, s, mate, mate), "draught", "on the drinker's own state")
	assert.Contains(t, bookStateNames(t, s, archer, mate), "draught", "on the drinker in the archer's other_players")
	assert.NotContains(t, bookStateNames(t, s, archer, archer), "draught")

	ticks(s, castTicks(6)-1)
	assert.Equal(t, 110, healthOf(t, s, mate), "50 + 30 % of 200 in 6 s")
	assert.NotContains(t, bookStateNames(t, s, mate, mate), "draught", "healed, the state goes")

	assert.ErrorIs(t, s.handleInteract(mate, draught.ID), ErrEntityNotFound, "a second interact does nothing")
	tick(s)
	assert.Equal(t, 110, healthOf(t, s, mate))
}

// A delver beyond the 60 px reach is told it is too far, and the draught
// stands. R27.
func TestHandleInteract_ADraughtOutOfReachStands(t *testing.T) {
	s := unstartedRun(t)
	sent := &recordingSender{}
	s.sender = sent
	archer, _ := placeDelverAt(t, s, "archer", 9, 500, 500)
	mate, mateBody := placeDelverAt(t, s, "warrior", 9, 600, 500)
	draught := brew(t, s, archer)
	wound(mateBody, 50, 200)

	assert.ErrorIs(t, s.handleInteract(mate, draught.ID), ErrOutOfRange)
	require.Len(t, sent.sent[mate], 1, "told it is too far")
	assert.Equal(t, string(constants.ActionInteract), sent.sent[mate][0].Action)

	assert.Len(t, draughts(s), 1, "still standing")
	assert.NotContains(t, bookOf(t, mateBody).States, components.BookStateDraught)
}

// A floor change takes every draught of the old floor with it. AC 3; R27;
// §Edge States "Floor change during a cast".
func TestRegenerateFloor_ClearsTheDraughts(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	require.NotNil(t, s.dungeon, "a dungeon floor")
	archer := uuid.New()
	_, ok := s.EntityManager.GetEntity(s.AddPlayer(archer, types.CharacterInPlay{Name: "Delver", Class: "archer", Level: 9}, ""))
	require.True(t, ok)
	brew(t, s, archer)

	require.NoError(t, s.regenerateFloor())

	assert.Empty(t, draughts(s), "the old floor's draught went with it")
}
