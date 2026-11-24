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

// FS-X2CMM §E R24, §F R34. I-X2CMM-4.

func castBindingGlyph(s *Session, playerID uuid.UUID, x, y float64) error {
	return s.castSkill(playerID, types.PlayerCastSkillPayload{SkillID: "binding_glyph", TargetX: x, TargetY: y})
}

// runes are the run's runes, as entities.
func runes(s *Session) []*ecs.Entity {
	var laid []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if ec, ok := e.GetComponent(ecs.ComponentTypeBookEffect); ok && ec.(*components.BookEffectComponent).Kind == components.BookEffectRune {
			laid = append(laid, e)
		}
	}
	return laid
}

// monsterAction is the action a recipient's frame shows on the monster.
func monsterAction(t *testing.T, s *Session, recipient uuid.UUID, of *ecs.Entity) string {
	t.Helper()
	monsters, _ := frameOf(t, s, types.WorldTypeRun, recipient)["monsters"].([]any)
	for _, m := range monsters {
		if m.(map[string]any)["entity_id"] == of.ID.String() {
			return m.(map[string]any)["action"].(string)
		}
	}
	t.Fatalf("monster %s not in %s's frame", of.ID, recipient)
	return ""
}

// A level-13 mage lays Binding Glyph 6 cells off: after 2.5 s 40 mana is
// paid, the 60 s cooldown starts and the rune is in every recipient's state as
// kind "rune". A ghoul stood on it is stunned on the next tick, every
// recipient sees it stunned and the rune's caught count. AC 1; R24, R34.
func TestCastSkill_BindingGlyphLaysARuneThatStunsAGhoulOnIt(t *testing.T) {
	s := unstartedRun(t)
	s.endSessionCh = make(chan bool, 64)
	mage, body := placeDelverAt(t, s, "mage", 13, 500, 500)
	mate, _ := placeDelverAt(t, s, "warrior", 13, 3000, 3000)
	manaBefore := currentResource(body)
	x := 500 + 6*cell

	require.NoError(t, castBindingGlyph(s, mage, x, 500))
	ticks(s, castTicks(2.5))

	require.Len(t, runes(s), 1, "the rune is laid")
	assert.Equal(t, manaBefore-40, currentResource(body), "40 mana")
	assert.Equal(t, components.BookCooldown{Remaining: 60, Total: 60}, bookOf(t, body).Cooldowns[components.PageBindingGlyph])

	ghoul := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: x, Y: 500})
	tick(s)

	for _, recipient := range []uuid.UUID{mage, mate} {
		assert.Equal(t, string(components.MonsterActionStunned), monsterAction(t, s, recipient, ghoul), recipient)
		effects, _ := frameOf(t, s, types.WorldTypeRun, recipient)["book_effects"].([]any)
		require.Len(t, effects, 1, recipient)
		laid := effects[0].(map[string]any)
		assert.Equal(t, "rune", laid["kind"])
		assert.Equal(t, x, laid["x"])
		assert.Equal(t, 500.0, laid["y"])
		assert.Equal(t, float64(1), laid["caught"])
	}
}

// A floor change takes every rune of the old floor with it. R24; §Edge States
// "Floor change during a cast".
func TestRegenerateFloor_ClearsTheRunes(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	require.NotNil(t, s.dungeon, "a dungeon floor")
	mage := uuid.New()
	body, ok := s.EntityManager.GetEntity(s.AddPlayer(mage, types.CharacterInPlay{Name: "Delver", Class: "mage", Level: 13}, ""))
	require.True(t, ok)
	at := transformOf(t, body)
	gx, gy := groundNear(t, s, at.X, at.Y, 2)

	require.NoError(t, castBindingGlyph(s, mage, gx, gy))
	ticks(s, castTicks(2.5))
	require.Len(t, runes(s), 1, "the rune is laid")

	require.NoError(t, s.regenerateFloor())

	assert.Empty(t, runes(s), "the old floor's rune went with it")
}
