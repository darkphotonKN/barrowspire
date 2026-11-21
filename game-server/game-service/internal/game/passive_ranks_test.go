package game

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-8RZ51 R31: the seated body carries its held ranks, from the character in
// play, whichever way it was seated.

func rankedWarrior(ranks passivetree.Ranks) types.CharacterInPlay {
	return types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 6, PassiveRanks: ranks}
}

func newPassiveWorld() *Session {
	return newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
}

func TestSeating_TheBodyHoldsTheCharactersRanks(t *testing.T) {
	ranks := passivetree.Ranks{"warrior.t1a": 2, "warrior.t1b": 1}

	t.Run("seated in a world", func(t *testing.T) {
		s := newPassiveWorld()
		memberID := uuid.New()

		s.AddPlayer(memberID, rankedWarrior(ranks), "")

		assert.Equal(t, ranks, systems.PassiveRanks(delverEntity(t, s, memberID)))
	})

	t.Run("a handoff seat", func(t *testing.T) {
		s := newPassiveWorld()
		memberID := uuid.New()
		s.AddPlayersToPendingConnection([]*types.Player{{ID: memberID, Character: rankedWarrior(ranks)}})

		_, err := s.SeatArrival(&types.Player{ID: memberID}, nil)
		require.NoError(t, err)

		assert.Equal(t, ranks, systems.PassiveRanks(delverEntity(t, s, memberID)))
	})

	t.Run("none held is empty, never nil", func(t *testing.T) {
		s := newPassiveWorld()
		memberID := uuid.New()

		s.AddPlayer(memberID, rankedWarrior(nil), "")

		held := systems.PassiveRanks(delverEntity(t, s, memberID))
		assert.NotNil(t, held)
		assert.Empty(t, held)
	})
}

// R20, R27: a spend in town raises the body's ranks, by the higher rank per
// node, and only on the body of the character that spent.
func TestRaisePassiveRanks(t *testing.T) {
	s := newPassiveWorld()
	memberID := uuid.New()
	character := rankedWarrior(passivetree.Ranks{"warrior.t1a": 2})
	s.AddPlayer(memberID, character, "")

	assert.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"warrior.t1a": 1, "warrior.t1b": 1}))
	assert.Equal(t, passivetree.Ranks{"warrior.t1a": 2, "warrior.t1b": 1}, systems.PassiveRanks(delverEntity(t, s, memberID)),
		"an older answer never lowers a rank")

	assert.False(t, s.RaisePassiveRanks(memberID, uuid.New(), passivetree.Ranks{"warrior.t1b": 2}), "another character's spend")
	assert.False(t, s.RaisePassiveRanks(uuid.New(), character.ID, passivetree.Ranks{"warrior.t1b": 2}), "no body here")
	assert.Equal(t, passivetree.Ranks{"warrior.t1a": 2, "warrior.t1b": 1}, systems.PassiveRanks(delverEntity(t, s, memberID)))
}

// FS-8RZ51 R23, Acceptance "A level-up in a run raises passive_points in the
// same tick's state": a kill that levels the delver shows the new point in the
// state built after it.
func TestRun_ALevelUpRaisesPassivePointsInTheSameTick(t *testing.T) {
	s := unstartedRun(t)
	m := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 1, Experience: 90,
		PassiveRanks: passivetree.Ranks{}})
	pointsNow := func() int {
		state := serializer.NewStateSerializer(s.EntityManager, nil)
		backend, err := state.SerializeBackendState(context.Background(), s.ID, types.WorldTypeRun, s.EntityManager.GetAllEntities())
		require.NoError(t, err)
		return state.FormatStateToClientState(backend, m.id).CurrentPlayer.Points
	}
	require.Equal(t, 0, pointsNow(), "level 1 earns none")

	s.publishKills([]systems.KillRecord{{Archetype: components.MonsterArchetypeGhoul, Level: 1, KillerMemberID: m.id}})

	require.Equal(t, 2, m.body.stats.Level)
	assert.Equal(t, 1, pointsNow())
}
