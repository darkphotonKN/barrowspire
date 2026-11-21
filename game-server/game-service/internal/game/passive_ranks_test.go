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

// FS-E1ZDG §B R8: a raise that takes the body from no specialization to one
// makes it that specialization from the next state, and runs the pick's seam
// once; a later raise of other nodes does not run it again.
func TestRaisePassiveRanks_ATier6RaiseIsThePick(t *testing.T) {
	type pick struct {
		entity *ecs.Entity
		spec   string
	}
	var picks []pick
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds(),
		withSpecializationGained(func(entity *ecs.Entity, spec string) { picks = append(picks, pick{entity, spec}) }))
	memberID := uuid.New()
	character := types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 20, PassiveRanks: passivetree.Ranks{"warrior.t1a": 2}}
	s.AddPlayer(memberID, character, "")
	specializationNow := func() any {
		state := serializer.NewStateSerializer(s.EntityManager, nil)
		backend, err := state.SerializeBackendState(context.Background(), s.ID, types.WorldTypeHub, s.EntityManager.GetAllEntities())
		require.NoError(t, err)
		return state.FormatStateToClientState(backend, memberID).CurrentPlayer.Specialization
	}

	require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"warrior.t1b": 1}))
	assert.Empty(t, picks, "no tier-6 node, no pick")
	assert.Equal(t, "", specializationNow())

	require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"warrior.t6b": 1}))
	assert.Equal(t, "berserker", specializationNow())
	require.Len(t, picks, 1)
	assert.Equal(t, pick{delverEntity(t, s, memberID), "berserker"}, picks[0])

	require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"warrior.t4a": 2}))
	assert.Len(t, picks, 1, "the pick runs once")
	assert.Equal(t, "berserker", specializationNow())
}

// A body seated already holding its tier-6 node is that specialization from
// seating; no raise is a pick for it.
func TestRaisePassiveRanks_SeatedSpecializedIsNoPick(t *testing.T) {
	picked := 0
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds(),
		withSpecializationGained(func(*ecs.Entity, string) { picked++ }))
	memberID := uuid.New()
	character := types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "archer", Level: 20, PassiveRanks: passivetree.Ranks{"archer.t6b": 1}}
	s.AddPlayer(memberID, character, "")

	require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"archer.t1a": 1}))

	assert.Equal(t, "shadow_ranger", systems.Specialization(delverEntity(t, s, memberID)))
	assert.Zero(t, picked)
}
