package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The monster AI rolls from the source the session was built with on every
// floor: floor 1's AI, which paths, and a fallback floor's, which steers straight, both
// draw their wander picks from it, so a floor change never swaps the global
// source back in. FS-KE075 §D R25, ADR-0062.
func TestFloorChange_MonsterAIKeepsTheInjectedRoll(t *testing.T) {
	rolls := 0
	roll := func() float64 { rolls++; return 0.5 }
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds(),
		withMonsterRoll(roll))
	s.spawnRand = seededSpawns(3)
	s.InitialSystems()
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	s.InitialMapObjects(nil)

	// long enough for every idle monster to pause and pick where to wander
	pause := constants.MonsterPauseSeconds
	ticks := int(3 * pause * float64(constants.GameFrameRate))
	dt := 1.0 / float64(constants.GameFrameRate)
	for floor := firstFloor; floor <= firstFloor+1; floor++ {
		if floor > firstFloor {
			failGeneration(s)
			require.NoError(t, s.regenerateFloor())
		}
		require.Equal(t, floor == firstFloor, s.dungeon != nil, "floor %d", floor)
		before := rolls
		for range ticks {
			s.monsterAISystem.Update(dt, s.EntityManager.GetAllEntities())
		}
		assert.Greater(t, rolls, before, "floor %d's monster AI rolls from the injected source", floor)
	}
}
