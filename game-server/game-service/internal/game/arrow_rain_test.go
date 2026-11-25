package game

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	Arrow Rain through a run: the handler's cast, a floor change, and the
	broadcast. FS-04EEA §E R23–R28.
*/

// seatArcher seats an archer, holding the tier-3 node when withNode, standing
// at (500, 500).
func seatArcher(t *testing.T, s *Session, withNode bool) (uuid.UUID, *ecs.Entity) {
	t.Helper()
	var ranks passivetree.Ranks
	if withNode {
		node, ok := passivetree.AbilityNode("archer")
		require.True(t, ok)
		ranks = passivetree.Ranks{node.ID: 1}
	}
	playerID := uuid.New()
	entity, ok := s.EntityManager.GetEntity(s.AddPlayer(playerID, types.CharacterInPlay{Name: "Sable", Class: "archer", PassiveRanks: ranks}, ""))
	require.True(t, ok)
	tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
	transform := tc.(*components.TransformComponent)
	transform.X, transform.Y = 500, 500
	return playerID, entity
}

// Arrow Rain cast through the handler marks a rain for an archer holding the
// node, spending 55 stamina, and its volleys land on a target in the circle;
// one without the node gets nothing at all. FS-04EEA §A R3, §E R23–R24.
func TestCastSkill_ArrowRainOnlyForAnArcherHoldingTheNode(t *testing.T) {
	for _, tt := range []struct {
		name     string
		withNode bool
	}{{"with the node", true}, {"without the node", false}} {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			playerID, archer := seatArcher(t, s, tt.withNode)
			stamina := currentResource(archer)
			target := unarmoredTarget(s, 640, 500)

			require.NoError(t, s.handleCastSkill(playerID, "arrow_rain", 650, 500))
			tick(s)
			spent := stamina - currentResource(archer)
			tickFor(s, 1.6)

			if tt.withNode {
				assert.Equal(t, 55, spent)
				assert.Less(t, currentHealth(target), 1000)
				assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeArrowRain), "gone after its fifth volley")
				return
			}
			assert.Equal(t, 0, spent)
			assert.Equal(t, 1000, currentHealth(target))
			assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeArrowRain))
		})
	}
}

// A floor change clears a rain in progress with the floor. FS-04EEA §E R26;
// §Edge States "Floor change mid-rain".
func TestRun_FloorChangeClearsAnArrowRain(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	playerID, _ := seatArcher(t, s, true)

	require.NoError(t, s.handleCastSkill(playerID, "arrow_rain", 650, 500))
	tick(s)
	require.Len(t, entityIDsWith(s, ecs.ComponentTypeArrowRain), 1)

	require.NoError(t, s.regenerateFloor())

	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeArrowRain))
}

// A rain is not on the wire: the archer's broadcast is the same with the rain
// in the world as without it. FS-04EEA §E R28.
func TestRun_ArrowRainIsNotInTheBroadcast(t *testing.T) {
	s := unstartedRun(t)
	playerID, _ := seatArcher(t, s, true)
	require.NoError(t, s.handleCastSkill(playerID, "arrow_rain", 650, 500))
	tick(s)

	entities := s.EntityManager.GetAllEntities()
	var withoutRain []*ecs.Entity
	for _, e := range entities {
		if !e.HasComponent(ecs.ComponentTypeArrowRain) {
			withoutRain = append(withoutRain, e)
		}
	}
	require.Len(t, withoutRain, len(entities)-1, "one rain falling")

	stateSerializer := serializer.NewStateSerializer(s.EntityManager, nil)
	clientState := func(entities []*ecs.Entity) *types.ClientGameState {
		backendState, err := stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, entities)
		require.NoError(t, err)
		return stateSerializer.FormatStateToClientState(backendState, playerID)
	}

	assert.Equal(t, clientState(withoutRain), clientState(entities))
}
