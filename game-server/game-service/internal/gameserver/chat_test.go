package gameserver

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-WJGFJ §Requirements A1–A4, A7–A8, B9–B16, D32. I-WJGFJ-1.
//
// chat is an inbound action on the message hub's loop. An area message from a
// seated player is stamped by the pod and relayed to every player seated in
// any world on this pod. The tests drive the hub as a client would: a message
// on the server channel, routed on the sender's record, answered on each
// recipient's writer channel.

// The clock and the id the relay stamps with, fixed so the stamp is checkable.
var (
	chatTestNow = time.Date(2026, 10, 31, 9, 30, 15, 250_000_000, time.UTC)
	chatTestID  = uuid.MustParse("0c1c3a1e-6b3a-4e0a-9f2b-1d0e9b6f4a11")
)

// chatRig is a server whose chat relay stamps with a fixed clock and id, with
// its hub and its Meadows channel at hand.
type chatRig struct {
	server     *Server
	clock      *chatClock
	hub        *game.Session
	meadows    *game.Session
	characters *fakeCharacters
}

func newChatRig(t *testing.T) *chatRig {
	t.Helper()

	characters := newFakeCharacters()
	clock := newChatClock()
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters, testPodID, testPodAddr, noopAnnouncer{},
		WithChatClock(clock.now),
		WithChatIDs(func() uuid.UUID { return chatTestID }),
	)
	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")
	meadows, ok := server.FieldSession(game.FieldGentleMeadows)
	require.True(t, ok, "the server builds the Meadows at startup")

	return &chatRig{server: server, clock: clock, hub: hub, meadows: meadows, characters: characters}
}

// connected registers a fresh member on a connection, with a character in play
// but in no world, and listens on the connection.
func (r *chatRig) connected(t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: name + "-account"}
	player.Character = r.characters.give(player.ID, "warrior", name, 3, 900)
	registerTestConn(r.server, conn, player)

	return player, conn, startSoloListen(t, r.server, conn)
}

// seated registers a member and seats them in world at (x, y).
func (r *chatRig) seated(t *testing.T, name string, world *game.Session, x, y float64) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	player, conn, inbox := r.connected(t, name)
	world.AddPlayerAt(player.ID, player.Character, "", x, y)
	r.server.setCurrentWorld(player, world.ID)

	return player, conn, inbox
}

// inHub seats a member in the hub.
func (r *chatRig) inHub(t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	return r.seated(t, name, r.hub, 600, 600)
}

// inMeadows seats a member in this pod's Meadows channel.
func (r *chatRig) inMeadows(t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	return r.seated(t, name, r.meadows, 200, 200)
}

// inRun seats a member in a run of one on this pod.
func (r *chatRig) inRun(t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	player, conn, inbox := r.inHub(t, name)
	run := r.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{player}})
	require.Equal(t, run.ID, player.CurrentGameSessionId, "the run seats them")

	return player, conn, inbox
}

// sendChat sends chat as the client does: the channel and the text, routed on
// the sender's record (FS-WJGFJ §Requirements A2).
func sendChat(server *Server, conn *websocket.Conn, channel, text string) {
	sendChatPayload(server, conn, map[string]interface{}{"channel": channel, "text": text})
}

func sendChatPayload(server *Server, conn *websocket.Conn, payload map[string]interface{}) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(constants.ActionChat), Payload: payload},
	}
}

const (
	chatAction       = "chat"
	chatNoticeAction = "chat_notice"
)

// awaitChat waits for one relayed chat line on the inbox. Any other reply,
// including the hub's "Unknown action" fallback and a notice, fails here.
func awaitChat(t *testing.T, inbox *startSoloInbox, who string) types.Message {
	t.Helper()

	reply, answered := inbox.await(chatAction, chatNoticeAction)
	require.True(t, answered, "%s never received the line", who)
	require.Equal(t, chatAction, reply.Action,
		"%s expected a chat line; got %q with error %q", who, reply.Action, startSoloErrorOf(reply))
	require.Nil(t, reply.Error, "a relayed line is not an error")

	return reply
}

// awaitNotice waits for one chat_notice on the inbox and returns its code.
func awaitNotice(t *testing.T, inbox *startSoloInbox, who string) types.Message {
	t.Helper()

	reply, answered := inbox.await(chatAction, chatNoticeAction)
	require.True(t, answered, "%s was never answered", who)
	require.Equal(t, chatNoticeAction, reply.Action,
		"%s expected a chat_notice; got %q with error %q", who, reply.Action, startSoloErrorOf(reply))
	require.Nil(t, reply.Error, "a notice is not an error reply: it must not reach the client's global error handler (FS-WJGFJ R7)")

	return reply
}

// chatSilence is how long a test listens before calling an inbox quiet: the
// hub loop relays in microseconds, so a line that has not arrived by then is
// not coming.
const chatSilence = 200 * time.Millisecond

// assertSilent fails if a chat line or notice arrives on the inbox within chatSilence.
func assertSilent(t *testing.T, inbox *startSoloInbox, who string) {
	t.Helper()

	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == chatAction || msg.Action == chatNoticeAction {
				t.Fatalf("%s should hear nothing; got %q %v", who, msg.Action, msg.Payload)
			}
		case <-deadline:
			return
		}
	}
}

// An area line from a hub member reaches everyone seated on the pod, whatever
// world they stand in, the sender included, stamped by the pod. Nobody on
// another pod is reachable from here, so the audience is the pod.
// FS-WJGFJ §Requirements A3, A4, B9, B15; ADR-0032.
func TestChat_AreaReachesEveryWorldOnThePod(t *testing.T) {
	rig := newChatRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inMeadows(t, "Kaelen")
	_, _, idrisInbox := rig.inRun(t, "Idris")

	sendChat(rig.server, wrenConn, "area", "hi")

	for who, inbox := range map[string]*startSoloInbox{"Wren (hub, sender)": wrenInbox, "Kaelen (Meadows)": kaelenInbox, "Idris (run)": idrisInbox} {
		line := awaitChat(t, inbox, who)
		assert.Equal(t, map[string]interface{}{
			"message_id":  chatTestID.String(),
			"sender_id":   wren.ID.String(),
			"sender_name": "Wren",
			"channel":     "area",
			"scope":       testPodID,
			"sent_at":     "2026-10-31T09:30:15.250Z",
			"text":        "hi",
		}, line.Payload, "%s gets the stamped line", who)
	}
}

// Whatever the client says about who is speaking is ignored: the stamp comes
// from the connection's record and the pod's clock. FS-WJGFJ R2, R3; §Edge
// States "forged payload".
func TestChat_IgnoresWhatTheClientSaysAboutTheSender(t *testing.T) {
	rig := newChatRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")

	sendChatPayload(rig.server, wrenConn, map[string]interface{}{
		"channel":     "area",
		"text":        "trust me",
		"player_id":   uuid.New().String(),
		"sender_id":   uuid.New().String(),
		"sender_name": "The Lich Lord",
		"message_id":  uuid.New().String(),
		"sent_at":     "1999-01-01T00:00:00.000Z",
		"scope":       "another-pod",
	})

	line := awaitChat(t, wrenInbox, "Wren")
	assert.Equal(t, wren.ID.String(), line.Payload["sender_id"])
	assert.Equal(t, "Wren", line.Payload["sender_name"])
	assert.Equal(t, chatTestID.String(), line.Payload["message_id"])
	assert.Equal(t, "2026-10-31T09:30:15.250Z", line.Payload["sent_at"])
	assert.Equal(t, testPodID, line.Payload["scope"])
}

// A connected member seated in no world can neither speak nor hear: the
// window is not even on their screen. FS-WJGFJ R10.
func TestChat_InNoWorldNeitherSpeaksNorHears(t *testing.T) {
	rig := newChatRig(t)
	_, ashConn, ashInbox := rig.connected(t, "Ash")
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")

	sendChat(rig.server, ashConn, "area", "anyone?")
	notice := awaitNotice(t, ashInbox, "Ash")
	assert.Equal(t, "not_in_world", notice.Payload["code"])
	assert.NotEmpty(t, notice.Payload["text"], "a notice carries words the player can read")
	assertSilent(t, wrenInbox, "Wren")

	sendChat(rig.server, wrenConn, "area", "hello hub")
	awaitChat(t, wrenInbox, "Wren")
	assertSilent(t, ashInbox, "Ash")
}

// Every channel but area is closed in this slice, as is any name outside the
// five: refused with channel_closed, relayed to nobody. FS-WJGFJ R8.
func TestChat_ClosedChannelsAreRefused(t *testing.T) {
	for _, channel := range []string{"world", "party", "whisper", "trade", "shout", ""} {
		t.Run("channel "+channel, func(t *testing.T) {
			rig := newChatRig(t)
			_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
			_, _, kaelenInbox := rig.inHub(t, "Kaelen")

			sendChat(rig.server, wrenConn, channel, "hi")

			notice := awaitNotice(t, wrenInbox, "Wren")
			assert.Equal(t, "channel_closed", notice.Payload["code"])
			assertSilent(t, kaelenInbox, "Kaelen")
		})
	}
}

// Lines leave the hub's loop in the order they arrived, and reach a recipient
// in another world in that order. Ten speakers, one line each, so the flood
// window (R6) holds nobody back. FS-WJGFJ R13.
func TestChat_KeepsOrder(t *testing.T) {
	rig := newChatRig(t)
	_, _, idrisInbox := rig.inRun(t, "Idris")

	sent := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}
	speakers := make([]*websocket.Conn, len(sent))
	for i, text := range sent {
		_, speakers[i], _ = rig.inHub(t, "Speaker"+text)
	}
	for i, text := range sent {
		sendChat(rig.server, speakers[i], "area", text)
	}

	got := make([]string, 0, len(sent))
	for range sent {
		got = append(got, awaitChat(t, idrisInbox, "Idris").Payload["text"].(string))
	}
	assert.Equal(t, sent, got)
}

// A recipient whose writer queue is full misses the line; everyone else gets
// it and nobody waits. FS-WJGFJ R12.
func TestChat_FullWriterQueueSkipsOnlyThatPlayer(t *testing.T) {
	rig := newChatRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	// Idris is seated but nobody drains their queue: fill it to the brim
	idrisConn := &websocket.Conn{}
	idris := &types.Player{ID: uuid.New(), Username: "idris-account"}
	idris.Character = rig.characters.give(idris.ID, "warrior", "Idris", 3, 900)
	idrisQueue := registerTestConn(rig.server, idrisConn, idris)
	rig.hub.AddPlayerAt(idris.ID, idris.Character, "", 600, 600)
	rig.server.setCurrentWorld(idris, rig.hub.ID)
	for len(idrisQueue) < cap(idrisQueue) {
		idrisQueue <- "junk"
	}

	sendChat(rig.server, wrenConn, "area", "still here?")

	awaitChat(t, wrenInbox, "Wren")
	awaitChat(t, kaelenInbox, "Kaelen")
	assert.Len(t, idrisQueue, cap(idrisQueue), "Idris's full queue took nothing more")
}

// A recipient whose connection went away between being counted and being
// delivered to is skipped without error or retry. FS-WJGFJ R12; §Edge States
// "player disconnects during relay".
func TestChat_GoneRecipientIsSkipped(t *testing.T) {
	rig := newChatRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, _ := rig.inHub(t, "Kaelen")

	// Kaelen is still on the connection table (so they are counted) but
	// their writer is gone, as it is the instant a close is being processed
	rig.server.mu.Lock()
	delete(rig.server.msgChan, kaelenConn)
	rig.server.mu.Unlock()

	sendChat(rig.server, wrenConn, "area", "kaelen?")

	line := awaitChat(t, wrenInbox, "Wren")
	assert.Equal(t, "kaelen?", line.Payload["text"])
}

// A line never reaches a world: the run's inbound channel stays empty while
// chat flows through the hub. FS-WJGFJ R11.
func TestChat_IsNotForwardedToAWorld(t *testing.T) {
	rig := newChatRig(t)
	idris, idrisConn, idrisInbox := rig.inRun(t, "Idris")
	run, ok := rig.server.GetGameSession(idris.CurrentGameSessionId)
	require.True(t, ok)

	sendChat(rig.server, idrisConn, "area", "from the Spire")
	awaitChat(t, idrisInbox, "Idris")

	select {
	case pkg := <-run.MessageCh:
		t.Fatalf("the run received %q; chat must never enter a world", pkg.Message.Action)
	default:
	}
}

// A member who walks hub → field → hub on one pod keeps hearing the pod.
// FS-WJGFJ R15.
func TestChat_SurvivesAWorldSwitchOnThePod(t *testing.T) {
	rig := newChatRig(t)
	_, wrenConn, _ := rig.inHub(t, "Wren")
	kaelen, _, kaelenInbox := rig.inHub(t, "Kaelen")

	sendChat(rig.server, wrenConn, "area", "one")
	assert.Equal(t, "one", awaitChat(t, kaelenInbox, "Kaelen in the hub").Payload["text"])
	rig.clock.advance(chatFloodWindow)

	rig.hub.RemovePlayer(kaelen.ID.String())
	rig.meadows.AddPlayerAt(kaelen.ID, kaelen.Character, "", 200, 200)
	rig.server.setCurrentWorld(kaelen, rig.meadows.ID)
	sendChat(rig.server, wrenConn, "area", "two")
	assert.Equal(t, "two", awaitChat(t, kaelenInbox, "Kaelen in the Meadows").Payload["text"])
	rig.clock.advance(chatFloodWindow)

	rig.meadows.RemovePlayer(kaelen.ID.String())
	rig.hub.AddPlayerAt(kaelen.ID, kaelen.Character, "", 600, 600)
	rig.server.setCurrentWorld(kaelen, rig.hub.ID)
	sendChat(rig.server, wrenConn, "area", "three")
	assert.Equal(t, "three", awaitChat(t, kaelenInbox, "Kaelen back in the hub").Payload["text"])
}

// lockedLog is a log sink the hub's goroutine and the test can share.
type lockedLog struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (l *lockedLog) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buf.Write(p)
}

func (l *lockedLog) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buf.String()
}

// Nothing the relay logs, at any level, carries the line's text. FS-WJGFJ R14;
// ADR-0033.
func TestChat_LogsCarryNoText(t *testing.T) {
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	rig := newChatRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	const secret = "the-password-is-swordfish"
	sendChat(rig.server, wrenConn, "area", secret)
	awaitChat(t, wrenInbox, "Wren")
	awaitChat(t, kaelenInbox, "Kaelen")

	assert.NotContains(t, sink.String(), secret, "a chat line's text reached the log")
}

// The read loop logs every inbound frame before the hub sees it. A chat line's text rides in that
// frame, so the loop may log its size and never its bytes. Driven through a real connection, as
// the earlier log test injects on the server channel and never passes the loop.
// FS-WJGFJ R14; ADR-0033. Code review 2026-10-31.
func TestChat_ReadLoopLogsCarryNoText(t *testing.T) {
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)
	client := route.connect(t, "token")

	const secret = "the-vault-combination-is-4815"
	require.NoError(t, client.WriteJSON(map[string]any{
		"action":  "chat",
		"payload": map[string]any{"channel": "area", "text": secret},
	}))

	// the member is in no world, so the line is refused on the loop: by then the frame was read and logged
	eventually(t, "the frame reached the hub loop", func() bool {
		return strings.Contains(sink.String(), "incoming chat line")
	})
	assert.NotContains(t, sink.String(), secret, "the read loop logged the frame's text")
}
