package game

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A handoff arrival is seated only into a seat the run holds for them, as the
// character the match carried onto that seat, which a class must match; with
// no loadout they are seated bare. FS-K2HKP §Requirements 22-24.
func TestSeatArrival(t *testing.T) {
	validCharacter := types.CharacterInPlay{ID: uuid.New(), Name: "arrival", Class: "warrior", Level: 1}

	tests := []struct {
		name string
		// pending puts the player in the run's pending seats
		pending bool
		// seatFirst seats the player once before the call under test
		seatFirst bool
		// character is the one the match carried onto the pending seat
		character types.CharacterInPlay
		// arrivalCharacter is whatever the connecting player carries, never seated
		arrivalCharacter types.CharacterInPlay
		wantErr          error
	}{
		{name: "not pending has no seat", pending: false, character: validCharacter, wantErr: ErrNoSeat},
		{name: "already seated has no seat", pending: true, seatFirst: true, character: validCharacter, wantErr: ErrNoSeat},
		{name: "unknown class cannot be seated", pending: true, character: types.CharacterInPlay{ID: uuid.New(), Class: "bard", Level: 1}, wantErr: ErrCharacterNotSeatable},
		{name: "empty class cannot be seated", pending: true, character: types.CharacterInPlay{ID: uuid.New(), Level: 1}, wantErr: ErrCharacterNotSeatable},
		{name: "a character on the connecting player is not seated", pending: true, arrivalCharacter: validCharacter, wantErr: ErrCharacterNotSeatable},
		{name: "nil loadout seats with no equipment", pending: true, character: validCharacter},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
			memberID := uuid.New()
			pendingEntry := &types.Player{ID: memberID, Character: tt.character}
			player := &types.Player{ID: memberID, Character: tt.arrivalCharacter}

			if tt.pending {
				s.AddPlayersToPendingConnection([]*types.Player{pendingEntry})
			}
			if tt.seatFirst {
				_, err := s.SeatArrival(player, nil)
				require.NoError(t, err)
				// back in the pending seats, so only the existing body refuses
				s.AddPlayersToPendingConnection([]*types.Player{pendingEntry})
			}

			seated, err := s.SeatArrival(player, nil)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.character, seated, "the seated character is the pending one, for the host record")

			eq, ok := delverEntity(t, s, player.ID).GetComponent(ecs.ComponentTypeEquipment)
			require.True(t, ok, "a seated delver has an equipment component")
			assert.Equal(t, &components.EquipmentComponent{}, eq.(*components.EquipmentComponent), "nothing is worn")
			assert.False(t, hasPendingSeat(s, player.ID), "the seat is claimed")
		})
	}
}

// An arrival stands on the spot the first floor kept for them, and takes it.
// FS-K2HKP R18, R22.
func TestSeatArrival_StandsOnAReservedArrivalSlot(t *testing.T) {
	s := rosterOnRun(t, 4, delverAt{level: 1})
	expected := expectedParty(1, 1)
	s.InitialMapObjects(expected)
	require.Len(t, s.arrivalSlots, 1)
	slot := s.arrivalSlots[0]

	memberID := uuid.New()
	s.AddPlayersToPendingConnection([]*types.Player{{ID: memberID, Character: expected[0]}})

	_, err := s.SeatArrival(&types.Player{ID: memberID}, nil)
	require.NoError(t, err)

	at := transformOf(t, delverEntity(t, s, memberID))
	assert.Equal(t, slot, point{at.X, at.Y}, "the arrival stands on the kept spot")
	assert.Empty(t, s.arrivalSlots, "and the spot is taken")
}

// hasPendingSeat reports whether playerID still holds an unclaimed seat.
func hasPendingSeat(s *Session, playerID uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.playersPendingConnection[playerID]
	return ok
}

// Once the run releases its unclaimed seats, an arrival for one is refused.
// FS-K2HKP §Requirements 24-25.
func TestSeatArrival_AfterRelease_HasNoSeat(t *testing.T) {
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
	s.isRunning = true
	// someone is seated, so the release does not shut the run down
	s.AddPlayer(uuid.New(), types.CharacterInPlay{ID: uuid.New(), Class: "warrior", Level: 1}, "")

	memberID := uuid.New()
	s.AddPlayersToPendingConnection([]*types.Player{{ID: memberID, Character: types.CharacterInPlay{ID: uuid.New(), Class: "warrior", Level: 1}}})
	s.releaseUnclaimedSeats(s.seatDeadline.Add(time.Millisecond))

	_, err := s.SeatArrival(&types.Player{ID: memberID}, nil)
	assert.ErrorIs(t, err, ErrNoSeat)
}
