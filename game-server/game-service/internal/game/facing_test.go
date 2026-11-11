package game

import (
	"bytes"
	"log/slog"
	"strings"
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-JS7C8 §E R27, R30–R32, R35: a player's facing, sent with `face`, is kept
// on their body and relayed in the state, in the town, a field and a run;
// anything else is ignored with nothing sent back. I-JS7C8-2.

const actionFace = constants.Action("face")

// faceMessage is a `face` as a client sends it.
func faceMessage(playerID uuid.UUID, facing any) types.ClientPackage {
	return clientMessage(actionFace, playerID, map[string]interface{}{"facing": facing})
}

// facingWorld is one world with two players in it, whose replies are recorded.
type facingWorld struct {
	s          *Session
	wren, finn uuid.UUID
	wrenBody   *ecs.Entity
	worldType  types.WorldType
	sent       *recordingDispatcher
}

var facingWorlds = []struct {
	name  string
	build func(t *testing.T) facingWorld
}{
	{"the town", func(t *testing.T) facingWorld {
		s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
		wren, finn := uuid.New(), uuid.New()
		require.NoError(t, s.Admit(wren, types.CharacterInPlay{Name: "Wren", Class: "warrior"}, ""))
		require.NoError(t, s.Admit(finn, types.CharacterInPlay{Name: "Finn", Class: "mage"}, ""))
		return facingWorld{s: s, wren: wren, finn: finn, wrenBody: delverEntity(t, s, wren), worldType: types.WorldTypeHub}
	}},
	{"a field", func(t *testing.T) facingWorld {
		room := devRoom(t)
		wren, wrenBody := devVisitor(t, room)
		finn, _ := devVisitor(t, room)
		return facingWorld{s: room, wren: wren, finn: finn, wrenBody: wrenBody, worldType: types.WorldTypeField}
	}},
	{"a run", func(t *testing.T) facingWorld {
		s := unstartedRun(t)
		wren, wrenBody := placeDelver(t, s, "warrior", 500, 500)
		finn, _ := placeDelver(t, s, "mage", 600, 500)
		return facingWorld{s: s, wren: wren, finn: finn, wrenBody: wrenBody, worldType: types.WorldTypeRun}
	}},
}

// deliver sends the messages through the session's message loop while it
// ticks, then leaves it ready to take more.
func deliver(t *testing.T, s *Session, messages ...types.ClientPackage) {
	t.Helper()
	runConcurrently(t, s, messages)
	s.stopChan = make(chan struct{})
}

func (w facingWorld) recorded(t *testing.T) facingWorld {
	t.Helper()
	w.sent = &recordingDispatcher{}
	w.s.sender = messaging.NewMessageSender(w.sent)
	return w
}

// facingIn is the facing key of player's entry in recipient's frame, and
// whether the key is there at all.
func (w facingWorld) facingIn(t *testing.T, recipient, player uuid.UUID) (any, bool) {
	t.Helper()
	frame := frameOf(t, w.s, w.worldType, recipient)
	if recipient == player {
		me, ok := frame["current_player"].(map[string]any)
		require.True(t, ok, "the recipient has their own state")
		facing, present := me["facing"]
		return facing, present
	}
	others, _ := frame["other_players"].([]any)
	for _, o := range others {
		other := o.(map[string]any)
		if other["id"] == player.String() {
			facing, present := other["facing"]
			return facing, present
		}
	}
	t.Fatalf("player %s is not in %s's other_players", player, recipient)
	return nil, false
}

// A `face` sets the sender's facing: the next state carries it on their own
// current_player and on their entry in everyone else's other_players. Before
// any, the key is absent. R31, R32.
func TestFace_RelayedInTheStateInEveryWorld(t *testing.T) {
	for _, world := range facingWorlds {
		t.Run(world.name, func(t *testing.T) {
			w := world.build(t).recorded(t)

			_, present := w.facingIn(t, w.wren, w.wren)
			assert.False(t, present, "absent until a face is sent")
			_, present = w.facingIn(t, w.finn, w.wren)
			assert.False(t, present, "absent on the other players too")

			deliver(t, w.s, faceMessage(w.wren, "nw"))

			own, _ := w.facingIn(t, w.wren, w.wren)
			assert.Equal(t, "nw", own, "current_player.facing")
			seen, _ := w.facingIn(t, w.finn, w.wren)
			assert.Equal(t, "nw", seen, "other_players[].facing")
			_, present = w.facingIn(t, w.wren, w.finn)
			assert.False(t, present, "a player who sent none still has none")
			assert.Empty(t, w.sent.framesTo(w.wren), "nothing is sent back for a face")
		})
	}
}

// Each of the 8 names is taken, and the last one sent stands.
func TestFace_TakesEachOfTheEightNamesAndTheLastStands(t *testing.T) {
	w := facingWorlds[2].build(t).recorded(t)

	for _, facing := range []string{"n", "ne", "e", "se", "s", "sw", "w", "nw"} {
		deliver(t, w.s, faceMessage(w.wren, facing))
		got, _ := w.facingIn(t, w.finn, w.wren)
		assert.Equal(t, facing, got)
	}
}

// A facing outside the 8 names is ignored and the stored one kept; nothing is
// sent back, and nothing about it is logged above Debug. R31.
func TestFace_UnknownFacingIsIgnoredQuietly(t *testing.T) {
	logs := captureLogs(t)
	w := facingWorlds[2].build(t).recorded(t)
	deliver(t, w.s, faceMessage(w.wren, "nw"))

	bad := []types.ClientPackage{
		faceMessage(w.wren, "up"),
		faceMessage(w.wren, ""),
		faceMessage(w.wren, "NW"),
		faceMessage(w.wren, 3.0),
		clientMessage(actionFace, w.wren, map[string]interface{}{}),
	}
	deliver(t, w.s, bad...)

	got, _ := w.facingIn(t, w.finn, w.wren)
	assert.Equal(t, "nw", got, "the stored facing is unchanged")
	assert.Empty(t, w.sent.framesTo(w.wren), "nothing is sent back")
	for _, line := range logs.lines() {
		if strings.Contains(line, "face") {
			assert.Contains(t, line, "level=DEBUG", "a face is logged at Debug only: %s", line)
		}
	}
}

// A dead body keeps the facing it fell in: a face from a delver out of play
// turns nothing. Edge state "Dead".
func TestFace_FromADeadDelverTurnsNothing(t *testing.T) {
	w := facingWorlds[2].build(t).recorded(t)
	deliver(t, w.s, faceMessage(w.wren, "e"))

	kill(t, w.wrenBody)
	deliver(t, w.s, faceMessage(w.wren, "w"))

	got, _ := w.facingIn(t, w.wren, w.wren)
	assert.Equal(t, "e", got, "the facing it fell in")
}

// A face naming a player with no body in this world changes nothing and
// answers nothing.
func TestFace_FromAPlayerWithNoBodyIsIgnored(t *testing.T) {
	w := facingWorlds[2].build(t).recorded(t)
	stranger := uuid.New()

	deliver(t, w.s, faceMessage(stranger, "s"))

	_, present := w.facingIn(t, w.finn, w.wren)
	assert.False(t, present)
	assert.Empty(t, w.sent.framesTo(stranger))
}

// syncBuffer is a log sink safe across the session's goroutines.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) lines() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return strings.Split(strings.TrimSpace(b.buf.String()), "\n")
}

// captureLogs sends every log line, Debug up, to a buffer for the test.
func captureLogs(t *testing.T) *syncBuffer {
	t.Helper()
	sink := &syncBuffer{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return sink
}
