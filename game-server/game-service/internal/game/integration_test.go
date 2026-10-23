package game

import (
	"context"
	"math"
	"slices"
	"sync"
	"testing"
	"time"

	gameconstants "github.com/darkphotonKN/barrowspire-server/game-service/common/constants"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// positionRecorder stands in for the hub's dispatcher and keeps every position
// the session broadcasts to one delver. The broadcast is the only view of the
// world a client gets, so the test watches movement through it instead of
// reading live components the game loop is writing.
type positionRecorder struct {
	playerID uuid.UUID

	mu        sync.Mutex
	positions []types.Position
}

func (r *positionRecorder) PushMessageToChannelQueue(
	playerID uuid.UUID,
	msg interface{},
) error {
	state, ok := msg.(*types.ClientGameState)
	if !ok || playerID != r.playerID || state.CurrentPlayer == nil || state.CurrentPlayer.Position == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.positions = append(r.positions, *state.CurrentPlayer.Position)
	return nil
}

func (r *positionRecorder) PushMessageToConn(
	conn *websocket.Conn,
	msg interface{},
) error {
	return nil
}

// seen returns a copy of every position broadcast so far.
func (r *positionRecorder) seen() []types.Position {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.positions)
}

// Mock EventEmitter for testing
type mockEventEmitter struct{}

func (m *mockEventEmitter) PublishMatchComplete(ctx context.Context, data *types.RawMatchState) {
}

// A move sets the delver's velocity, and the running game loop carries them
// along it every tick until told otherwise. The move goes in the way a client's
// does, through the session's message channel, so the loop applies it on its
// own goroutine. Spawn is random inside the run's map, so the test takes where
// the delver started from the first broadcast and asserts the movement relative
// to it: forward on both axes, never past the map's edge, and never further
// than the speed allows in the time the loop ran.
func TestSession_GameLoopAppliesMovement_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}
	player1ID := uuid.New()
	recorder := &positionRecorder{playerID: player1ID}
	sender := messaging.NewMessageSender(recorder)
	em := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(em)
	mockEmitter := &mockEventEmitter{}
	session := NewSession(&mockSessionCloser{}, sender, stateSerializer, em, mockEmitter, nil, RunBounds())
	defer session.Shutdown()

	session.AddPlayer(player1ID, types.CharacterInPlay{Name: "Player1", Class: "warrior"}, "")

	// standing still, every broadcast before the move carries the spawn point
	require.Eventually(t, func() bool { return len(recorder.seen()) > 0 },
		time.Second, time.Millisecond, "the session never broadcast the delver's state")
	start := recorder.seen()[0]

	const vx, vy = 0.81, 0.81
	moveStart := time.Now()
	session.MessageCh <- types.ClientPackage{Message: types.Message{
		Action: string(gameconstants.ActionMove),
		Payload: map[string]interface{}{
			"player_id": player1ID.String(),
			"vx":        vx,
			"vy":        vy,
		},
	}}

	time.Sleep(300 * time.Millisecond)

	// every broadcast read here was made before this point, so none can carry
	// more movement than the time since the move was sent allows
	positions := recorder.seen()
	elapsed := time.Since(moveStart)

	// one extra tick of slack: a tick already due as the move was sent may be
	// the one that applies it
	maxSeconds := elapsed.Seconds() + 1.0/float64(gameconstants.GameFrameRate)
	maxStepX := vx * gameconstants.DefaultSpeed * maxSeconds
	maxStepY := vy * gameconstants.DefaultSpeed * maxSeconds

	// broadcasts are delivered on their own goroutines, so arrival order is not
	// tick order; the delver only moves forward, so the furthest point is the
	// latest tick
	end := start
	for _, p := range positions {
		end.X = math.Max(end.X, p.X)
		end.Y = math.Max(end.Y, p.Y)
	}

	assert.Greater(t, end.X, start.X, "the delver should have moved right")
	assert.Greater(t, end.Y, start.Y, "the delver should have moved down")
	assert.LessOrEqual(t, end.X-start.X, maxStepX, "moved further right than the speed allows")
	assert.LessOrEqual(t, end.Y-start.Y, maxStepY, "moved further down than the speed allows")
	assert.LessOrEqual(t, end.X, gameconstants.MapWidth-gameconstants.PlayerRadius, "walked past the map's right edge")
	assert.LessOrEqual(t, end.Y, gameconstants.MapHeight-gameconstants.PlayerRadius, "walked past the map's bottom edge")
}
