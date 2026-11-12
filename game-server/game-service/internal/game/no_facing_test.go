package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-JS7C8 §E R47: game-service keeps and relays no facing. A `face` that
// reaches a world anyway (the hub refuses it before any world sees it) is no
// action there: it changes nothing, answers nothing, and no player entry in
// any state carries a facing, in the town, a field and a run. I-JS7C8-10.

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

// No current_player and no other_players entry carries facing, before a face
// or after one, and a face draws no reply.
func TestFace_NoFacingInAnyStateInEveryWorld(t *testing.T) {
	for _, world := range facingWorlds {
		t.Run(world.name, func(t *testing.T) {
			w := world.build(t).recorded(t)

			deliver(t, w.s, faceMessage(w.wren, "nw"))

			for _, entry := range []struct{ recipient, player uuid.UUID }{
				{w.wren, w.wren}, {w.finn, w.wren}, {w.finn, w.finn}, {w.wren, w.finn},
			} {
				_, present := w.facingIn(t, entry.recipient, entry.player)
				assert.False(t, present, "%s's entry in %s's state carries no facing", entry.player, entry.recipient)
			}
			assert.Empty(t, w.sent.framesTo(w.wren), "nothing is sent back for a face")
			_, kept := w.wrenBody.GetComponent(ecs.ComponentType("Facing"))
			assert.False(t, kept, "no facing is kept on the body")
		})
	}
}
