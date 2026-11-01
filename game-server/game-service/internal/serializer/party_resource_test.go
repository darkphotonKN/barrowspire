package serializer

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-CH21F §Requirements R1–R4, R6. I-CH21F-1.

// fixedParties is a membership snapshot that never changes, counting how often
// it is read.
type fixedParties struct {
	partyOf map[uuid.UUID]uuid.UUID
	reads   atomic.Int32
}

func (f *fixedParties) Snapshot() map[uuid.UUID]uuid.UUID {
	f.reads.Add(1)
	return f.partyOf
}

// partyWorld is one world with recipient Wren, her party's mage and mercenary,
// a stranger warrior at level 4, and a loner with no party.
type partyWorld struct {
	em                               *ecs.EntityManager
	parties                          *fixedParties
	wren, mage, merc, stranger, solo uuid.UUID
}

func newPartyWorld() *partyWorld {
	w := &partyWorld{em: ecs.NewEntityManager(), wren: uuid.New(), mage: uuid.New(), merc: uuid.New(), stranger: uuid.New(), solo: uuid.New()}
	ours, theirs := uuid.New(), uuid.New()
	w.parties = &fixedParties{partyOf: map[uuid.UUID]uuid.UUID{
		w.wren: ours, w.mage: ours, w.merc: ours,
		// another party: the stranger is grouped, just not with Wren
		w.stranger: theirs,
	}}

	seatWithResource(w.em, w.wren, "warrior", stamina(80, 100), components.AttackDash)
	seatWithResource(w.em, w.mage, "mage", mana(120, 150), components.AttackTripleFireball)
	seatMerc(w.em, w.merc, 2, components.ParryComponent{Open: true, Parries: 3})
	stranger := seatWithResource(w.em, w.stranger, "warrior", stamina(60, 100), components.AttackDash)
	stats := components.NewStatsComponent(1, 1, 1, 1)
	stats.Level = 4
	stranger.AddComponent(stats)
	seatWithResource(w.em, w.solo, "mage", mana(10, 150), components.AttackTripleFireball)
	return w
}

// frameFor serializes the world once and returns the frame one recipient is
// sent, as the JSON the client reads, each other player keyed by id.
func (w *partyWorld) frameFor(t *testing.T, worldType types.WorldType, recipient uuid.UUID) map[uuid.UUID]map[string]any {
	t.Helper()

	s := NewStateSerializer(w.em, w.parties)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), worldType, w.em.GetAllEntities())
	require.NoError(t, err)
	encoded, err := json.Marshal(s.FormatStateToClientState(backendState, recipient))
	require.NoError(t, err)

	var frame map[string]any
	require.NoError(t, json.Unmarshal(encoded, &frame))
	others := map[uuid.UUID]map[string]any{}
	for _, raw := range frame["other_players"].([]any) {
		other := raw.(map[string]any)
		others[uuid.MustParse(other["id"].(string))] = other
	}
	return others
}

// For a recipient in a party, every other member in this world carries their
// class resource as their own HUD gets it, and a mercenary their parry fields;
// a player outside the party carries health and level and nothing more. A
// recipient in no party gets no one's resource. The same in every world.
// FS-CH21F R1–R3.
func TestFormatStateToClientState_PartyMembersCarryResource(t *testing.T) {
	w := newPartyWorld()
	mageResource := map[string]any{"kind": "mana", "current": float64(120), "max": float64(150), "ability_cost": float64(15)}
	mercResource := map[string]any{"kind": "parry_charges", "current": float64(2), "max": float64(3), "ability_cost": float64(0)}
	mercParry := map[string]any{"parry_open": true, "parry_lockout": float64(0), "parries": float64(3)}

	tests := []struct {
		name      string
		recipient uuid.UUID
		// what each other player's resource should be; absent from the map, none
		resource map[uuid.UUID]map[string]any
		parry    map[uuid.UUID]map[string]any
	}{
		{"a party member sees her teammates' resources", w.wren,
			map[uuid.UUID]map[string]any{w.mage: mageResource, w.merc: mercResource},
			map[uuid.UUID]map[string]any{w.merc: mercParry}},
		{"a member of another party sees no one's", w.stranger, nil, nil},
		{"a player in no party sees no one's", w.solo, nil, nil},
	}

	for _, worldType := range []types.WorldType{types.WorldTypeHub, types.WorldTypeField, types.WorldTypeRun} {
		for _, tt := range tests {
			t.Run(string(worldType)+"/"+tt.name, func(t *testing.T) {
				others := w.frameFor(t, worldType, tt.recipient)
				require.Len(t, others, 4, "everyone else is in other_players")

				for id, other := range others {
					assert.Contains(t, other, "current_health", "health stays public")
					assert.Contains(t, other, "max_health", "health stays public")
					assert.Contains(t, other, "level", "level stays public")

					if want, member := tt.resource[id]; member {
						assert.Equal(t, want, other["resource"], "a teammate's resource")
					} else {
						assert.NotContains(t, other, "resource", "a non-member's resource")
					}
					for _, field := range parryFields {
						if want, merc := tt.parry[id]; merc {
							assert.Equal(t, want[field], other[field], field)
						} else {
							assert.NotContains(t, other, field, "parry keys only on a teammate mercenary")
						}
					}
				}
			})
		}
	}
	assert.Equal(t, float64(4), w.frameFor(t, types.WorldTypeHub, w.wren)[w.stranger]["level"], "a stranger's level")
}

// A non-member's entry in other_players is byte-for-byte the bare player
// state, as it was before party members carried more. FS-CH21F R2, R4.
func TestFormatStateToClientState_NonMemberWireUnchanged(t *testing.T) {
	w := newPartyWorld()
	s := NewStateSerializer(w.em, w.parties)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, w.em.GetAllEntities())
	require.NoError(t, err)

	for _, recipient := range []uuid.UUID{w.wren, w.solo} {
		state := s.FormatStateToClientState(backendState, recipient)
		for _, other := range state.OtherPlayers {
			if other.ID != w.stranger {
				continue
			}
			got, err := json.Marshal(other)
			require.NoError(t, err)
			want, err := json.Marshal(backendState.Players[w.stranger])
			require.NoError(t, err)
			assert.JSONEq(t, string(want), string(got))
			assert.Equal(t, string(want), string(got), "byte for byte")
		}
	}
}

// Building two recipients' frames from one backend state writes neither
// addition into the shared player states, and neither recipient sees the
// other's. FS-CH21F R4.
func TestFormatStateToClientState_SharedPlayerStateNeverWritten(t *testing.T) {
	w := newPartyWorld()
	s := NewStateSerializer(w.em, w.parties)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, w.em.GetAllEntities())
	require.NoError(t, err)

	before := map[uuid.UUID]string{}
	for id, p := range backendState.Players {
		raw, err := json.Marshal(p)
		require.NoError(t, err)
		before[id] = string(raw)
	}

	ours := s.FormatStateToClientState(backendState, w.wren)
	theirs := s.FormatStateToClientState(backendState, w.stranger)

	for id, p := range backendState.Players {
		raw, err := json.Marshal(p)
		require.NoError(t, err)
		assert.Equal(t, before[id], string(raw), "the shared player state is unchanged")
	}
	for _, other := range theirs.OtherPlayers {
		assert.Nil(t, other.Resource, "the stranger sees no resource Wren was given")
		assert.Nil(t, other.ParryState, "nor any parry fields")
	}
	members := 0
	for _, other := range ours.OtherPlayers {
		if other.Resource != nil {
			members++
		}
	}
	assert.Equal(t, 2, members, "Wren still sees both teammates' resources")
}

// A broadcast reads the membership snapshot once for all its recipients, so one
// tick never mixes two versions; with no snapshot at all, nobody is a member.
// FS-CH21F R6, Edge States "Snapshot not yet published".
func TestStateSerializer_ReadsMembershipOncePerBroadcast(t *testing.T) {
	w := newPartyWorld()
	s := NewStateSerializer(w.em, w.parties)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeHub, w.em.GetAllEntities())
	require.NoError(t, err)
	for _, recipient := range []uuid.UUID{w.wren, w.mage, w.merc, w.stranger, w.solo} {
		s.FormatStateToClientState(backendState, recipient)
	}
	assert.Equal(t, int32(1), w.parties.reads.Load())

	t.Run("no membership given", func(t *testing.T) {
		bare := NewStateSerializer(w.em, nil)
		backendState, err := bare.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeHub, w.em.GetAllEntities())
		require.NoError(t, err)
		for _, other := range bare.FormatStateToClientState(backendState, w.wren).OtherPlayers {
			assert.Nil(t, other.Resource)
		}
	})
	t.Run("nothing published yet", func(t *testing.T) {
		empty := NewStateSerializer(w.em, &fixedParties{})
		backendState, err := empty.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeHub, w.em.GetAllEntities())
		require.NoError(t, err)
		for _, other := range empty.FormatStateToClientState(backendState, w.wren).OtherPlayers {
			assert.Nil(t, other.Resource)
		}
	})
}
