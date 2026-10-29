package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §Requirements 22–25, D10, D11. I-X2F2H-4.

// fallInField drops a visitor's body to 0 HP and runs the tick they fall on.
func fallInField(t *testing.T, field *Session, memberID uuid.UUID) {
	t.Helper()
	setHealth(t, delverEntity(t, field, memberID), 0)
	tick(field)
	require.True(t, field.Resolved(memberID), "fallen on the tick their health ran out")
}

func healthAndMana(t *testing.T, body *ecs.Entity) (*components.HealthComponent, *components.ManaComponent) {
	t.Helper()
	hc, ok := body.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	mc, ok := body.GetComponent(ecs.ComponentTypeMana)
	require.True(t, ok)
	return hc.(*components.HealthComponent), mc.(*components.ManaComponent)
}

// A player who falls in a field keeps everything worn and carried, and 3 s
// later stands at the arrival point in play, at full health and mana. R22, R23.
func TestFieldDeath_RespawnsAtTheArrivalKeepingEverything(t *testing.T) {
	field := builtField(t)
	place := GentleMeadows()
	memberID := visitor(t, field, fieldWren)
	moveBody(t, field, memberID, place.Arrival.X+600, place.Arrival.Y+100)
	tick(field)

	body := delverEntity(t, field, memberID)
	held := heldItems(body)
	require.NotEmpty(t, held)
	_, mana := healthAndMana(t, body)
	mana.CurrentMana = 3

	fallInField(t, field, memberID)
	tickFor(field, FieldPlayerRespawnDelay-0.1)
	assert.True(t, field.Resolved(memberID), "still fallen before 3 s")

	tickFor(field, 0.1)
	require.False(t, field.Resolved(memberID), "in play again 3 s after falling")

	body = delverEntity(t, field, memberID)
	tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
	assert.Equal(t, place.Arrival.X, tc.(*components.TransformComponent).X)
	assert.Equal(t, place.Arrival.Y, tc.(*components.TransformComponent).Y)
	health, mana := healthAndMana(t, body)
	assert.Equal(t, health.MaxHealth, health.CurrentHealth, "full health")
	assert.Equal(t, mana.MaxMana, mana.CurrentMana, "full mana")

	assert.ElementsMatch(t, held, heldItems(body), "nothing worn or carried is lost")
	for _, id := range held {
		_, stillThere := field.EntityManager.GetEntity(id)
		assert.True(t, stillThere, "item %s was dropped", id)
	}
	assert.True(t, field.HasPlayer(memberID), "the visit goes on")
}

// The fallen act in nothing: moves, attacks, interactions and the walk out are
// refused, as for a dead delver in a run. R22, R14.
func TestFieldDeath_ActionsRefusedWhileFallen(t *testing.T) {
	field := builtField(t)
	place := GentleMeadows()
	memberID := visitor(t, field, fieldWren)
	moveBody(t, field, memberID, place.Entrance.X, place.Entrance.Y)
	tick(field)

	fallInField(t, field, memberID)

	assert.ErrorIs(t, field.handleMove(memberID, 1, 0), ErrDelverOutOfPlay)
	assert.ErrorIs(t, field.handleAttack(memberID, uuid.New()), ErrDelverOutOfPlay)
	assert.ErrorIs(t, field.handleInteract(memberID, uuid.New()), ErrDelverOutOfPlay)
	_, err := field.LeaveThroughEntrance(memberID)
	assert.ErrorIs(t, err, ErrFallen)
}

// A field records no eliminations and its end rule never fires: no end_game
// and no result card for a death there. R24.
func TestFieldDeath_RecordsNoEliminationAndNeverEnds(t *testing.T) {
	field := builtField(t)
	memberID := visitor(t, field, fieldWren)

	fallInField(t, field, memberID)
	tickFor(field, FieldPlayerRespawnDelay)

	field.mu.RLock()
	assert.Empty(t, field.eliminations)
	field.mu.RUnlock()
	select {
	case <-field.endSessionCh:
		t.Fatal("a death ended the field")
	default:
	}
	assert.False(t, field.Ended())
}

// Each death counts once in the visit's deaths, what its settlement reads. R22.
func TestFieldDeath_CountsInTheVisitsDeaths(t *testing.T) {
	field := builtField(t)
	memberID := visitor(t, field, fieldWren)
	beside := visitor(t, field, fieldKael)

	fallInField(t, field, memberID)
	tickFor(field, FieldPlayerRespawnDelay)
	fallInField(t, field, memberID)

	visit, ok := field.EndVisit(memberID)
	require.True(t, ok)
	assert.Equal(t, 2, visit.Deaths)
	besideVisit, _ := field.EndVisit(beside)
	assert.Zero(t, besideVisit.Deaths)
}

// A monster drops a fallen player as its target. R25.
func TestFieldDeath_MonstersIgnoreTheFallen(t *testing.T) {
	field := builtField(t)
	boar := spawnedAt(t, field, 0)
	bt, _ := boar.GetComponent(ecs.ComponentTypeTransform)
	at := bt.(*components.TransformComponent)
	memberID := visitor(t, field, fieldWren)
	moveBody(t, field, memberID, at.X+20, at.Y)
	tick(field)
	require.Equal(t, delverEntity(t, field, memberID).ID, monsterOf(boar).Target, "the boar takes the player in play")

	fallInField(t, field, memberID)
	tick(field)

	assert.Equal(t, uuid.Nil, monsterOf(boar).Target, "and drops them once fallen")
	assert.False(t, systems.InPlay(delverEntity(t, field, memberID)))
}
