package game

import (
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func hubSession(t *testing.T) *Session {
	t.Helper()
	em := ecs.NewEntityManager()
	return NewSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil, HubBounds())
}

// A world knows how full it is. Asking it to admit someone is the moment to
// decide, because that is the only moment its membership cannot change
// underneath the decision. FS-29KSH §Requirements 31, 33.
func TestAdmit_RefusesBeyondCapacity(t *testing.T) {
	session := hubSession(t)

	for i := 0; i < constants.HubOccupancyCap; i++ {
		require.NoError(t, session.Admit(uuid.New(), "Delver", "mage"), "refused before full")
	}

	latecomer := uuid.New()

	assert.ErrorIs(t, session.Admit(latecomer, "Latecomer", "mage"), ErrWorldFull)
	assert.False(t, session.HasPlayer(latecomer))
}

// Someone already inside is not arriving, and must not be shut out of a world
// they are standing in.
func TestAdmit_SomeoneAlreadyInsideIsNotArriving(t *testing.T) {
	session := hubSession(t)

	for i := 0; i < constants.HubOccupancyCap-1; i++ {
		require.NoError(t, session.Admit(uuid.New(), "Delver", "mage"))
	}

	resident := uuid.New()
	require.NoError(t, session.Admit(resident, "Wren", "mage"))

	assert.NoError(t, session.Admit(resident, "Wren", "mage"),
		"a delver was refused entry to the world they are already in")
}

// A crowd reaching for the last place. Two goroutines almost never interleave
// inside the window, so a pair would pass whether or not the check and the act
// happen together.
func TestAdmit_LastPlaceGoesToOne(t *testing.T) {
	const contenders = 24

	session := hubSession(t)
	for i := 0; i < constants.HubOccupancyCap-1; i++ {
		require.NoError(t, session.Admit(uuid.New(), "Delver", "mage"))
	}

	var wg sync.WaitGroup
	var start sync.WaitGroup
	start.Add(1)

	results := make([]error, contenders)
	for i := range results {
		wg.Add(1)
		go func(slot int) {
			defer wg.Done()
			start.Wait()
			results[slot] = session.Admit(uuid.New(), "Contender", "mage")
		}(i)
	}

	start.Done()
	wg.Wait()

	admitted := 0
	for _, err := range results {
		if err == nil {
			admitted++
		}
	}

	assert.Equal(t, 1, admitted, "%d delvers were let into one place", admitted)
	assert.Len(t, session.GetPlayerIDs(), constants.HubOccupancyCap)
}

// A run has no door policy: its roster is decided by matchmaking.
func TestAdmit_ARunHasNoCap(t *testing.T) {
	em := ecs.NewEntityManager()
	run := NewSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil, RunBounds())

	for i := 0; i < constants.HubOccupancyCap+5; i++ {
		require.NoError(t, run.Admit(uuid.New(), "Delver", "mage"))
	}
}
