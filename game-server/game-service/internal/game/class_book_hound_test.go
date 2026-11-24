package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §E R28–R29, §F R34. I-X2CMM-8.

func castCallTheHound(s *Session, playerID uuid.UUID, x, y float64) error {
	return s.castSkill(playerID, types.PlayerCastSkillPayload{SkillID: "call_the_hound", TargetX: x, TargetY: y})
}

// hounds are the run's hounds, as entities.
func hounds(s *Session) []*ecs.Entity {
	var set []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if ec, ok := e.GetComponent(ecs.ComponentTypeBookEffect); ok && ec.(*components.BookEffectComponent).Kind == components.BookEffectHound {
			set = append(set, e)
		}
	}
	return set
}

// callTheHound has the archer call the hound at (x, y) and lets its 2 s run
// out: the hound.
func callTheHound(t *testing.T, s *Session, archer uuid.UUID, x, y float64) *ecs.Entity {
	t.Helper()
	require.NoError(t, castCallTheHound(s, archer, x, y))
	ticks(s, castTicks(2))
	set := hounds(s)
	require.Len(t, set, 1, "the hound is called")
	return set[0]
}

// houndOnWire is the hound as the recipient's frame shows it.
func houndOnWire(t *testing.T, s *Session, recipient uuid.UUID) map[string]any {
	t.Helper()
	effects, _ := frameOf(t, s, types.WorldTypeRun, recipient)["book_effects"].([]any)
	for _, e := range effects {
		if e.(map[string]any)["kind"] == "hound" {
			return e.(map[string]any)
		}
	}
	t.Fatalf("no hound in %s's frame", recipient)
	return nil
}

// A level-15 archer calls the hound 3 cells off: after 2 s 40 stamina is
// paid, the 180 s cooldown starts and the hound is in every recipient's state
// as kind "hound" with the archer's player id, its health of 40 % of the
// archer's max, and what it is doing. AC 1; R28, R34.
func TestCastSkill_CallTheHoundShowsTheHoundToEveryone(t *testing.T) {
	s := unstartedRun(t)
	s.endSessionCh = make(chan bool, 64)
	archer, body := placeDelverAt(t, s, "archer", 15, 500, 500)
	mate, _ := placeDelverAt(t, s, "warrior", 15, 3000, 3000)
	staminaBefore := currentResource(body)

	hound := callTheHound(t, s, archer, 500+3*cell, 500)
	most := maxHealthOfT(t, body) // as worn gear and passives seat it

	assert.Equal(t, staminaBefore-40, currentResource(body), "40 stamina")
	assert.Equal(t, components.BookCooldown{Remaining: 180, Total: 180}, bookOf(t, body).Cooldowns[components.PageCallTheHound])
	want := float64(roundShare(most, 0.4))
	for _, recipient := range []uuid.UUID{archer, mate} {
		got := houndOnWire(t, s, recipient)
		assert.Equal(t, hound.ID.String(), got["id"], recipient)
		assert.Equal(t, archer.String(), got["owner_id"], recipient)
		assert.Equal(t, want, got["health"], recipient)
		assert.Equal(t, want, got["max_health"], recipient)
		assert.Contains(t, []any{"idle", "run", "bite"}, got["action"], recipient)
		assert.InDelta(t, 40.0, got["remaining"], 0.1, recipient)
	}
}

// A ghoul the hound bites to death is the archer's kill: the party is given
// its experience, as for any kill of theirs. AC 3; R29.
func TestHound_AGhoulItKillsGivesThePartyExperience(t *testing.T) {
	s := unstartedRun(t)
	s.endSessionCh = make(chan bool, 64)
	archer, _ := placeDelverAt(t, s, "archer", 15, 500, 500)
	mate, _ := placeDelverAt(t, s, "warrior", 15, 3000, 3000)
	hound := callTheHound(t, s, archer, 500+3*cell, 500)
	at := transformOf(t, hound)
	ghoul := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: at.X + 0.6*cell, Y: at.Y})
	hc, _ := ghoul.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 1
	archerBefore, mateBefore := experienceOf(t, s, archer), experienceOf(t, s, mate)

	tick(s)

	assert.False(t, aliveT(ghoul), "bitten to death")
	assert.Greater(t, experienceOf(t, s, archer), archerBefore, "the archer's kill")
	assert.Greater(t, experienceOf(t, s, mate), mateBefore, "and the party's experience")
}

// A floor change takes the hound with it: it does not climb. AC 4; §Edge
// States "Floor change during a cast".
func TestRegenerateFloor_ClearsTheHound(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	require.NotNil(t, s.dungeon, "a dungeon floor")
	archer := uuid.New()
	body, ok := s.EntityManager.GetEntity(s.AddPlayer(archer, types.CharacterInPlay{Name: "Delver", Class: "archer", Level: 15}, ""))
	require.True(t, ok)
	at := transformOf(t, body)
	gx, gy := groundNear(t, s, at.X, at.Y, 2)
	callTheHound(t, s, archer, gx, gy)

	require.NoError(t, s.regenerateFloor())

	assert.Empty(t, hounds(s), "the old floor's hound went with it")
}

// The hound never holds the run open: with its archer, the party's last
// delver, fallen, the run ends though the hound still stands. AC 4; R28.
func TestApplyEndRule_AHoundNeverHoldsTheRunOpen(t *testing.T) {
	s := unstartedRun(t)
	s.endSessionCh = make(chan bool, 64)
	CreateMatchProgressEntity(s.EntityManager, 1, 3)
	archer, body := placeDelverAt(t, s, "archer", 15, 500, 500)
	callTheHound(t, s, archer, 500+3*cell, 500)
	require.Empty(t, s.endSessionCh, "the archer in play holds it open")

	wound(body, 0, maxHealthOfT(t, body))
	tick(s)

	require.Len(t, hounds(s), 1, "the hound still stands")
	assert.Len(t, s.endSessionCh, 1, "the run has ended")
}

func maxHealthOfT(t *testing.T, e *ecs.Entity) int {
	t.Helper()
	hc, ok := e.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	return hc.(*components.HealthComponent).MaxHealth
}

func aliveT(e *ecs.Entity) bool {
	hc, ok := e.GetComponent(ecs.ComponentTypeHealth)
	return ok && hc.(*components.HealthComponent).CurrentHealth > 0
}

// roundShare is share of n, rounded to the nearest whole point.
func roundShare(n int, share float64) int {
	return int(float64(n)*share + 0.5)
}
