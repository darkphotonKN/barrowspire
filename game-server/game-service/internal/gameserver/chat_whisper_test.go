package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-KCQ06 §Requirements A1–A5, B6–B10. I-KCQ06-1: a whisper names its target by character name;
// the sender's pod finds them in the presence index, off the hub's loop, and hands the line to a
// target it seats itself, echoing it to the sender. A target found nowhere, or placed here but
// not seated, is not online. I-KCQ06-2: a target on another pod is carried there by one whisper
// letter, and echoed once the inbox has published it.

// ---- the relay alone, with the presence side faked -----------------------------------------------

// whisperSpy records what the relay sends: lines to players by id, and what goes back to the
// sender's connection (echoes and notices alike).
type whisperSpy struct {
	lines  []types.Message
	to     [][]uuid.UUID
	toConn []types.Message
	// players whose writer queue is full: a line for them is refused
	full map[uuid.UUID]bool
}

func (s *whisperSpy) SendMessageToConn(_ *websocket.Conn, msg types.Message) error {
	s.toConn = append(s.toConn, msg)
	return nil
}

func (s *whisperSpy) BroadcastToPlayerList(players []uuid.UUID, msg types.Message) error {
	for _, id := range players {
		if s.full[id] {
			return fmt.Errorf("writer queue full for %s", id)
		}
	}
	s.lines = append(s.lines, msg)
	s.to = append(s.to, append([]uuid.UUID(nil), players...))
	return nil
}

// fakeChatWhisper is the presence side as the relay sees it: whether whisper is open here, and
// what a lookup by name answers. It answers at once; the pod tests hold the real one.
type fakeChatWhisper struct {
	closed bool
	// who the index holds, by the name as the index keys it (lowercased)
	present map[string]partypresence.Found
	err     error
	asked   []string
	// whisper letters handed to the inbox, and whether the inbox fails to publish them
	letters    []carriedWhisper
	cannotSend bool
}

// carriedWhisper is a whisper letter the relay asked to send: to whom, where, and the line.
type carriedWhisper struct {
	to   partypresence.Found
	line types.Message
}

func (f *fakeChatWhisper) carryWhisper(_ context.Context, to partypresence.Found, line types.Message, carried func(ok bool)) {
	f.letters = append(f.letters, carriedWhisper{to: to, line: line})
	carried(!f.cannotSend)
}

func (f *fakeChatWhisper) whisperOpen() bool { return !f.closed }

func (f *fakeChatWhisper) findWhisperTarget(_ context.Context, name string, found func(partypresence.Found, bool, error)) {
	f.asked = append(f.asked, name)
	if f.err != nil {
		found(partypresence.Found{}, false, f.err)
		return
	}
	target, ok := f.present[strings.ToLower(name)]
	found(target, ok, nil)
}

type whisperRelayRig struct {
	relay   *chatRelay
	spy     *whisperSpy
	whisper *fakeChatWhisper
	clock   *chatClock
}

// newWhisperRelayRig is a relay on a pod seating seated, with present in the presence index.
func newWhisperRelayRig(seated []uuid.UUID, present ...partypresence.Found) *whisperRelayRig {
	spy := &whisperSpy{full: make(map[uuid.UUID]bool)}
	clock := newChatClock()
	fake := &fakeChatWhisper{present: make(map[string]partypresence.Found)}
	for _, f := range present {
		fake.present[strings.ToLower(f.Name)] = f
	}
	return &whisperRelayRig{
		relay:   newChatRelay(everyoneHere(seated), spy, testPodID, clock.now, func() uuid.UUID { return chatTestID }, nil, nil, fake),
		spy:     spy,
		whisper: fake,
		clock:   clock,
	}
}

// presentAt is a player as the presence index finds them on pod.
func presentAt(p *types.Player, pod, world string) partypresence.Found {
	return partypresence.Found{PlayerID: p.ID, Name: p.Character.Name, PodID: pod, World: world}
}

func (r *whisperRelayRig) whisperTo(p *types.Player, target any, text any) {
	r.relay.relay(context.Background(), p, &websocket.Conn{}, map[string]interface{}{"channel": "whisper", "target": target, "text": text})
}

func (r *whisperRelayRig) say(p *types.Player, channel string, text any) {
	r.relay.relay(context.Background(), p, &websocket.Conn{}, map[string]interface{}{"channel": channel, "text": text})
}

// noticeCodes are the codes of the chat notices sent back to the sender, in order.
func (r *whisperRelayRig) noticeCodes() []string {
	codes := []string{}
	for _, m := range r.spy.toConn {
		if m.Action == chatNoticeAction {
			codes = append(codes, m.Payload["code"].(string))
		}
	}
	return codes
}

// echoes are the chat lines sent back to the sender's connection.
func (r *whisperRelayRig) echoes() []types.Message {
	var out []types.Message
	for _, m := range r.spy.toConn {
		if m.Action == chatAction {
			out = append(out, m)
		}
	}
	return out
}

// A whisper to a player seated on this pod is stamped with channel whisper, the target's id as
// its scope, and the target's id and name as the index holds them; it is handed to the target
// once, and the sender gets the very same line as the echo. FS-KCQ06 R3, R6, R7, R9.
func TestWhisper_Relay_SamePod_DeliversAndEchoes(t *testing.T) {
	wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
	rig := newWhisperRelayRig([]uuid.UUID{wren.ID, kaelen.ID}, presentAt(kaelen, testPodID, "hub"))

	rig.whisperTo(wren, "Kaelen", "meet me at the well")

	assert.Empty(t, rig.noticeCodes())
	require.Len(t, rig.spy.lines, 1, "handed to the target once")
	assert.Equal(t, []uuid.UUID{kaelen.ID}, rig.spy.to[0], "to the target alone")
	assert.Equal(t, map[string]interface{}{
		"message_id":  chatTestID.String(),
		"sender_id":   wren.ID.String(),
		"sender_name": "Wren",
		"channel":     "whisper",
		"scope":       kaelen.ID.String(),
		"sent_at":     "2026-10-31T09:30:15.250Z",
		"text":        "meet me at the well",
		"target_id":   kaelen.ID.String(),
		"target_name": "Kaelen",
	}, rig.spy.lines[0].Payload)
	echoes := rig.echoes()
	require.Len(t, echoes, 1, "one echo")
	assert.Equal(t, rig.spy.lines[0], echoes[0], "the echo is the line the target got")
}

// A target the sender cannot hand the line to is not online: no entry in the index (unknown,
// offline, or on the main menu), a read that fails, an entry naming this pod for a player it seats
// in no world, or a writer queue that cannot take it. One not_online notice, with its words; nothing handed on and no echo. FS-KCQ06 R4, R9.
func TestWhisper_Relay_NotOnline(t *testing.T) {
	tests := []struct {
		name string
		// the target's presence and seat, and how the read and their queue answer
		present  bool
		pod      string
		seated   bool
		readErr  error
		fullFeed bool
	}{
		{name: "no entry in the index", present: false},
		{name: "the read fails", present: true, pod: testPodID, seated: true, readErr: errors.New("redis down")},
		{name: "placed here but seated in no world", present: true, pod: testPodID, seated: false},
		{name: "their writer queue is full", present: true, pod: testPodID, seated: true, fullFeed: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
			seated := []uuid.UUID{wren.ID}
			if tt.seated {
				seated = append(seated, kaelen.ID)
			}
			var present []partypresence.Found
			if tt.present {
				present = append(present, presentAt(kaelen, tt.pod, "hub"))
			}
			rig := newWhisperRelayRig(seated, present...)
			rig.whisper.err = tt.readErr
			rig.spy.full[kaelen.ID] = tt.fullFeed

			rig.whisperTo(wren, "Kaelen", "are you there?")

			require.Len(t, rig.spy.toConn, 1, "one notice, and nothing else back")
			assert.Equal(t, map[string]interface{}{"code": "not_online", "text": "That player is not online."}, rig.spy.toConn[0].Payload)
			assert.Empty(t, rig.spy.lines, "handed to nobody")
			assert.Empty(t, rig.echoes(), "no echo")
		})
	}
}

// A target the index places on another pod is carried there by one whisper letter, addressed to
// them, with the stamped line; once the inbox has published it the sender gets the same line as
// the echo. Nothing is told on this pod. FS-KCQ06 R8, R9.
func TestWhisper_Relay_AnotherPod_OneLetterThenTheEcho(t *testing.T) {
	wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
	rig := newWhisperRelayRig([]uuid.UUID{wren.ID}, presentAt(kaelen, "pod-b", "field"))

	rig.whisperTo(wren, "Kaelen", "over the river")

	assert.Empty(t, rig.noticeCodes())
	assert.Empty(t, rig.spy.lines, "nobody here is told")
	require.Len(t, rig.whisper.letters, 1, "one letter")
	letter := rig.whisper.letters[0]
	assert.Equal(t, presentAt(kaelen, "pod-b", "field"), letter.to)
	assert.Equal(t, "whisper", letter.line.Payload["channel"])
	assert.Equal(t, kaelen.ID.String(), letter.line.Payload["scope"])
	assert.Equal(t, kaelen.ID.String(), letter.line.Payload["target_id"])
	assert.Equal(t, "Kaelen", letter.line.Payload["target_name"])
	assert.Equal(t, "over the river", letter.line.Payload["text"])
	echoes := rig.echoes()
	require.Len(t, echoes, 1, "one echo")
	assert.Equal(t, letter.line, echoes[0], "the echo is the line the letter carries")
}

// A whisper letter the inbox cannot publish (its publisher behind, or Redis gone) has not gone
// out: the sender is told not_online, and gets no echo. FS-KCQ06 R9.
func TestWhisper_Relay_AnotherPod_LetterNotSentIsNotOnline(t *testing.T) {
	wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
	rig := newWhisperRelayRig([]uuid.UUID{wren.ID}, presentAt(kaelen, "pod-b", "hub"))
	rig.whisper.cannotSend = true

	rig.whisperTo(wren, "Kaelen", "hello?")

	require.Len(t, rig.spy.toConn, 1, "one notice, and nothing else back")
	assert.Equal(t, "not_online", rig.spy.toConn[0].Payload["code"])
	assert.Empty(t, rig.echoes(), "no echo")
	assert.Len(t, rig.whisper.letters, 1)
}

// A target the index places on this pod but who is seated in no world here is not lettered: this
// pod is where the index says they are. FS-KCQ06 R4, R8.
func TestWhisper_Relay_PlacedHereNotSeated_NoLetter(t *testing.T) {
	wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
	rig := newWhisperRelayRig([]uuid.UUID{wren.ID}, presentAt(kaelen, testPodID, "hub"))

	rig.whisperTo(wren, "Kaelen", "hello?")

	assert.Equal(t, []string{"not_online"}, rig.noticeCodes())
	assert.Empty(t, rig.whisper.letters)
}

// A whisper to oneself, in any case and with any padding, is refused whisper_self before the index
// is asked; the flood window is not started, so an area line right after is heard. FS-KCQ06 R2.
func TestWhisper_Relay_SelfIsRefusedWithoutALookup(t *testing.T) {
	for _, target := range []string{"Wren", "wren", "  WREN ", "\tWrEn"} {
		t.Run(target, func(t *testing.T) {
			wren := seatedSpeaker("Wren")
			rig := newWhisperRelayRig([]uuid.UUID{wren.ID}, presentAt(wren, testPodID, "hub"))

			rig.whisperTo(wren, target, "hello me")
			rig.say(wren, "area", "hello all")

			require.Len(t, rig.spy.toConn, 1)
			assert.Equal(t, map[string]interface{}{"code": "whisper_self", "text": "You can't whisper yourself."}, rig.spy.toConn[0].Payload)
			assert.Empty(t, rig.whisper.asked, "the index is never asked")
			require.Len(t, rig.spy.lines, 1, "the flood window was not started")
			assert.Equal(t, "hello all", rig.spy.lines[0].Payload["text"])
		})
	}
}

// A target seated here is handed the line even while the index still names the pod they came
// from: it lags a seat by up to a tick, and what this pod seats is the fact. FS-KCQ06 R7.
func TestWhisper_Relay_SeatedHere_DeliveredWhateverPodTheIndexNames(t *testing.T) {
	wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
	rig := newWhisperRelayRig([]uuid.UUID{wren.ID, kaelen.ID}, presentAt(kaelen, "pod-b", "hub"))

	rig.whisperTo(wren, "Kaelen", "welcome over")

	assert.Empty(t, rig.noticeCodes())
	require.Len(t, rig.spy.lines, 1)
	assert.Equal(t, []uuid.UUID{kaelen.ID}, rig.spy.to[0])
	assert.Len(t, rig.echoes(), 1)
}

// The target is looked up as typed, trimmed: the index matches it in any case. FS-KCQ06 R1, R3.
func TestWhisper_Relay_TargetIsTrimmedForTheLookup(t *testing.T) {
	wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
	rig := newWhisperRelayRig([]uuid.UUID{wren.ID, kaelen.ID}, presentAt(kaelen, testPodID, "run"))

	rig.whisperTo(wren, "  kAELEN  ", "hi")

	assert.Equal(t, []string{"kAELEN"}, rig.whisper.asked)
	require.Len(t, rig.spy.lines, 1)
	assert.Equal(t, "Kaelen", rig.spy.lines[0].Payload["target_name"], "the name as the index holds it, not as typed")
}

// The refusals come in order: not_in_world, channel_closed, whisper_self, the empty drop
// (target or text), too_long, too_fast. Nothing refused is looked up. FS-KCQ06 R1, R2.
func TestWhisper_Relay_Refusals_InOrder(t *testing.T) {
	long := strings.Repeat("a", chatTextMax+1)
	tests := []struct {
		name      string
		inWorld   bool
		closed    bool
		before    string // an area line just before, to open the flood window
		target    any
		text      any
		wantCodes []string
		delivered bool
	}{
		{name: "in no world, closed, to self", inWorld: false, closed: true, target: "Wren", text: "hi", wantCodes: []string{"not_in_world"}},
		{name: "closed before whisper_self", inWorld: true, closed: true, target: "Wren", text: "hi", wantCodes: []string{"channel_closed"}},
		{name: "whisper_self before the empty drop", inWorld: true, target: "Wren", text: "  ", wantCodes: []string{"whisper_self"}},
		{name: "whisper_self before too_long", inWorld: true, target: "Wren", text: long, wantCodes: []string{"whisper_self"}},
		{name: "whisper_self before too_fast", inWorld: true, before: "first", target: "Wren", text: "hi", wantCodes: []string{"whisper_self"}},
		{name: "empty text is dropped silently", inWorld: true, target: "Kaelen", text: " \n ", wantCodes: []string{}},
		{name: "missing text is dropped silently", inWorld: true, target: "Kaelen", text: nil, wantCodes: []string{}},
		{name: "empty target is dropped silently", inWorld: true, target: "   ", text: "hi", wantCodes: []string{}},
		{name: "missing target is dropped silently", inWorld: true, target: nil, text: "hi", wantCodes: []string{}},
		{name: "empty target before too_long", inWorld: true, target: "", text: long, wantCodes: []string{}},
		{name: "too long", inWorld: true, target: "Kaelen", text: long, wantCodes: []string{"too_long"}},
		{name: "too long before too_fast", inWorld: true, before: "first", target: "Kaelen", text: long, wantCodes: []string{"too_long"}},
		{name: "200 code points pass", inWorld: true, target: "Kaelen", text: strings.Repeat("字", chatTextMax), wantCodes: []string{}, delivered: true},
		{name: "too fast after an area line", inWorld: true, before: "first", target: "Kaelen", text: "second", wantCodes: []string{"too_fast"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
			rig := newWhisperRelayRig([]uuid.UUID{wren.ID, kaelen.ID}, presentAt(kaelen, testPodID, "hub"), presentAt(wren, testPodID, "hub"))
			rig.whisper.closed = tt.closed
			if tt.before != "" {
				rig.say(wren, "area", tt.before)
				rig.spy.lines = nil
			}
			if !tt.inWorld {
				wren.CurrentGameSessionId = uuid.Nil
			}

			rig.whisperTo(wren, tt.target, tt.text)

			assert.Equal(t, tt.wantCodes, rig.noticeCodes())
			assert.Equal(t, tt.delivered, len(rig.spy.lines) == 1, "delivered")
			if !tt.delivered {
				assert.Empty(t, rig.whisper.asked, "nothing refused is looked up")
			}
		})
	}
}

// A whisper and an area, world or party line share the one flood window, both ways; an accepted
// whisper starts it whether or not its target turns out to be online. FS-KCQ06 R2.
func TestWhisper_Relay_SharesTheFloodWindow(t *testing.T) {
	t.Run("a whisper after another line is too fast", func(t *testing.T) {
		wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
		rig := newWhisperRelayRig([]uuid.UUID{wren.ID, kaelen.ID}, presentAt(kaelen, testPodID, "hub"))

		rig.say(wren, "area", "one")
		rig.whisperTo(wren, "Kaelen", "two")
		rig.clock.advance(chatFloodWindow)
		rig.whisperTo(wren, "Kaelen", "three")

		assert.Equal(t, []string{"too_fast"}, rig.noticeCodes())
		require.Len(t, rig.spy.lines, 2)
		assert.Equal(t, "three", rig.spy.lines[1].Payload["text"])
	})
	t.Run("a line after a whisper to nobody online is too fast", func(t *testing.T) {
		wren := seatedSpeaker("Wren")
		rig := newWhisperRelayRig([]uuid.UUID{wren.ID})

		rig.whisperTo(wren, "Ghost", "one")
		rig.say(wren, "area", "two")

		assert.Equal(t, []string{"not_online", "too_fast"}, rig.noticeCodes())
		assert.Empty(t, rig.spy.lines)
	})
}

// A pod without the presence side, or with it not open (no presence index or no pod inbox),
// refuses whisper channel_closed and looks nothing up. FS-KCQ06 R1.
func TestWhisper_Relay_ClosedWithoutPresenceOrInbox(t *testing.T) {
	t.Run("not open", func(t *testing.T) {
		wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
		rig := newWhisperRelayRig([]uuid.UUID{wren.ID, kaelen.ID}, presentAt(kaelen, testPodID, "hub"))
		rig.whisper.closed = true

		rig.whisperTo(wren, "Kaelen", "hi")

		assert.Equal(t, []string{"channel_closed"}, rig.noticeCodes())
		assert.Empty(t, rig.whisper.asked)
		assert.Empty(t, rig.spy.lines)
	})
	t.Run("no presence side", func(t *testing.T) {
		spy := &relaySpy{}
		relay := newChatRelay(everyoneHere{uuid.New()}, spy, testPodID, newChatClock().now, uuid.New, nil, nil, nil)

		relay.relay(context.Background(), seatedSpeaker("Wren"), &websocket.Conn{}, map[string]interface{}{"channel": "whisper", "target": "Kaelen", "text": "hi"})

		require.Len(t, spy.notices, 1)
		assert.Equal(t, "channel_closed", spy.notices[0].Payload["code"])
		assert.Empty(t, spy.lines)
	})
}

// Named by their player id, the sender is still themselves: whisper_self, nothing delivered.
func TestWhisper_Relay_SelfByIDIsRefused(t *testing.T) {
	wren := seatedSpeaker("Wren")
	rig := newWhisperRelayRig([]uuid.UUID{wren.ID})
	rig.whisper.present[strings.ToLower(wren.ID.String())] = presentAt(wren, testPodID, "hub")

	rig.whisperTo(wren, wren.ID.String(), "hi")

	assert.Equal(t, []string{"whisper_self"}, rig.noticeCodes())
	assert.Empty(t, rig.spy.lines)
}

// ---- a pod, its runner, the presence index on Redis and a recording inbox ------------------------

// whisperPod is a pod with the presence index on its Redis and an inbox that records every letter.
type whisperPod struct {
	*partyRig
	inbox *recordingInbox
}

// newWhisperPod builds the pod; presence wraps the index it reads, for a test that holds a read.
func newWhisperPod(t *testing.T, presence func(*partypresence.Redis) presenceStore) *whisperPod {
	t.Helper()
	inbox := newRecordingInbox()
	clock := newChatClock()
	rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
		index := partypresence.NewRedis(client)
		var store presenceStore = index
		if presence != nil {
			store = presence(index)
		}
		return []Option{WithPresence(store), WithPodInbox(inbox), WithChatClock(clock.now), WithChatIDs(func() uuid.UUID { return chatTestID })}
	})
	// the relay's clock, so a test can move past the flood window without waiting
	rig.clock = clock
	return &whisperPod{partyRig: rig, inbox: inbox}
}

// present writes everyone seated so far into the presence index, as the pod's next tick does, and
// waits until name's entry is there.
func (p *whisperPod) present(t *testing.T, name string) {
	t.Helper()
	p.tick()
	awaitPresence(t, p.mini, name, testPodID)
}

func sendWhisper(server *Server, conn *websocket.Conn, target, text string) {
	sendChatPayload(server, conn, map[string]interface{}{"channel": "whisper", "target": target, "text": text})
}

// A whisper reaches a target seated on this pod in any world, hub, field or run, found in the
// presence index by the name typed in another case and padded; the sender gets the same line as
// the echo. Nobody else hears it, no letter is sent, and nothing in Redis changes. FS-KCQ06 R3,
// R5–R7, R9, R10.
func TestWhisper_Pod_SamePod_AnyWorld(t *testing.T) {
	tests := []struct {
		world string
		seat  func(r *partyRig, t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox)
	}{
		{world: "hub", seat: func(r *partyRig, t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
			return r.inHub(t, name)
		}},
		{world: "field", seat: func(r *partyRig, t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
			return r.inMeadows(t, name)
		}},
		{world: "run", seat: func(r *partyRig, t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
			return r.inRun(t, name)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.world, func(t *testing.T) {
			sink := captureLogs(t)
			pod := newWhisperPod(t, nil)
			wren, wrenConn, wrenInbox := pod.inHub(t, "Wren")
			kaelen, _, kaelenInbox := tt.seat(pod.partyRig, t, "Kaelen")
			_, _, ashInbox := pod.inHub(t, "Ash")
			pod.present(t, "Kaelen")
			before := pod.mini.Dump()

			const secret = "the-well-at-midnight-swordfish"
			sendWhisper(pod.server, wrenConn, "  kAELEN ", secret)

			heard := awaitChat(t, kaelenInbox, "Kaelen, in the "+tt.world)
			assert.Equal(t, map[string]interface{}{
				"message_id":  chatTestID.String(),
				"sender_id":   wren.ID.String(),
				"sender_name": "Wren",
				"channel":     "whisper",
				"scope":       kaelen.ID.String(),
				"sent_at":     "2026-10-31T09:30:15.250Z",
				"text":        secret,
				"target_id":   kaelen.ID.String(),
				"target_name": "Kaelen",
			}, heard.Payload)
			echo := awaitChat(t, wrenInbox, "Wren, the sender")
			assert.Equal(t, heard.Payload, echo.Payload, "the echo is the line Kaelen got")
			assertSilent(t, ashInbox, "Ash")
			assertSilent(t, kaelenInbox, "Kaelen, once only")
			assert.Zero(t, pod.inbox.count(), "a target here is never lettered")
			assert.Equal(t, before, pod.mini.Dump(), "a whisper writes nothing to Redis")
			assert.NotContains(t, sink.String(), secret, "a whisper's text reached the log")
		})
	}
}

// A whisper to a name the index does not hold, or to a player at the main menu (connected, with
// no world, so never written into the index), gets not_online and no echo. FS-KCQ06 R4.
func TestWhisper_Pod_UnknownAndMainMenuAreNotOnline(t *testing.T) {
	pod := newWhisperPod(t, nil)
	_, wrenConn, wrenInbox := pod.inHub(t, "Wren")
	_, _, ashInbox := pod.connected(t, "Ash")
	pod.present(t, "Wren")

	sendWhisper(pod.server, wrenConn, "Nobody", "hello?")
	notice := awaitNotice(t, wrenInbox, "Wren, to Nobody")
	assert.Equal(t, map[string]interface{}{"code": "not_online", "text": "That player is not online."}, notice.Payload)

	pod.clock.advance(chatFloodWindow)
	sendWhisper(pod.server, wrenConn, "Ash", "hello?")
	assert.Equal(t, "not_online", awaitNotice(t, wrenInbox, "Wren, to Ash").Payload["code"])
	assertSilent(t, ashInbox, "Ash, at the main menu")
	assertSilent(t, wrenInbox, "Wren: no echo")
	assert.Zero(t, pod.inbox.count())
}

// The presence read runs off the hub's loop: while it is held, another player's area line is
// relayed; once it answers, the whisper is delivered. FS-KCQ06 R3.
func TestWhisper_Pod_LookupNeverHoldsTheLoop(t *testing.T) {
	entered, gate := make(chan struct{}, 1), make(chan struct{})
	pod := newWhisperPod(t, func(index *partypresence.Redis) presenceStore {
		return gatedLookup{Redis: index, entered: entered, gate: gate}
	})
	_, wrenConn, wrenInbox := pod.inHub(t, "Wren")
	_, _, kaelenInbox := pod.inHub(t, "Kaelen")
	_, ashConn, ashInbox := pod.inHub(t, "Ash")
	pod.present(t, "Kaelen")

	sendWhisper(pod.server, wrenConn, "Kaelen", "psst")
	select {
	case <-entered:
	case <-time.After(pointerWait):
		t.Fatal("the whisper never looked its target up")
	}

	sendChat(pod.server, ashConn, "area", "anyone here?")
	assert.Equal(t, "anyone here?", awaitChat(t, ashInbox, "Ash").Payload["text"], "the loop went on while Redis was held")
	assert.Equal(t, "anyone here?", awaitChat(t, kaelenInbox, "Kaelen, hearing Ash").Payload["text"])
	assert.Equal(t, "anyone here?", awaitChat(t, wrenInbox, "Wren, hearing Ash").Payload["text"])

	close(gate)
	assert.Equal(t, "psst", awaitChat(t, kaelenInbox, "Kaelen").Payload["text"])
	assert.Equal(t, "psst", awaitChat(t, wrenInbox, "Wren, the echo").Payload["text"])
}

// A pod without the presence index, or without the pod inbox, refuses whisper channel_closed.
// FS-KCQ06 R1, Edge States.
func TestWhisper_Pod_ClosedWithoutPresenceOrInbox(t *testing.T) {
	tests := []struct {
		name string
		opts func(client redis.UniversalClient) []Option
	}{
		{name: "neither", opts: func(redis.UniversalClient) []Option { return nil }},
		{name: "no inbox", opts: func(client redis.UniversalClient) []Option {
			return []Option{WithPresence(partypresence.NewRedis(client))}
		}},
		{name: "no presence index", opts: func(redis.UniversalClient) []Option {
			return []Option{WithPodInbox(newRecordingInbox())}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRigOn(t, tt.opts)
			_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
			_, _, kaelenInbox := rig.inHub(t, "Kaelen")

			sendWhisper(rig.server, wrenConn, "Kaelen", "hi")

			assert.Equal(t, "channel_closed", awaitNotice(t, wrenInbox, "Wren").Payload["code"])
			assertSilent(t, kaelenInbox, "Kaelen")
		})
	}
}

// ---- two pods on one Redis -----------------------------------------------------------------------

// publishedThrough is an inbox bus that records every letter in sent before publishing it.
type publishedThrough struct {
	inboxBus
	sent *recordingInbox
}

func (b publishedThrough) Publish(ctx context.Context, channel string, payload []byte) error {
	if err := b.sent.Publish(ctx, channel, payload); err != nil {
		return err
	}
	return b.inboxBus.Publish(ctx, channel, payload)
}

func (b publishedThrough) PublishCount(ctx context.Context, channel string, payload []byte) (int64, error) {
	if err := b.sent.Publish(ctx, channel, payload); err != nil {
		return 0, err
	}
	return b.inboxBus.PublishCount(ctx, channel, payload)
}

// A whisper from Wren on pod A to Kaelen on pod B goes out as exactly one whisper letter, to B's
// inbox and nowhere else, addressed to Kaelen and carrying the stamped line. B hands Kaelen the
// line, and A echoes the very same line to Wren. Nobody else hears it and no log carries the text.
// FS-KCQ06 R6, R8, R9, R10.
func TestWhisper_TwoPods_OneLetterToTheTargetsPod(t *testing.T) {
	sink := captureLogs(t)
	client, mini := testutil.NewRedis(t)
	sent := newRecordingInbox()
	a, b, _ := twoPartyPodsOn(t, client, mini, publishedThrough{inboxBus: chatbus.NewRedis(client), sent: sent})
	wren, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	kaelen, _, kaelenInbox := seatedThere(t, b, mini, "Kaelen")
	_, _, ashInbox := b.inHub(t, "Ash")
	_, _, idrisInbox := a.inHub(t, "Idris")

	const secret = "the-ferry-at-dawn-swordfish"
	sendWhisper(a.server, wrenConn, " kaelen ", secret)

	heard := awaitChat(t, kaelenInbox, "Kaelen, on pod B")
	assert.Equal(t, "whisper", heard.Payload["channel"])
	assert.Equal(t, wren.ID.String(), heard.Payload["sender_id"])
	assert.Equal(t, "Wren", heard.Payload["sender_name"])
	assert.Equal(t, kaelen.ID.String(), heard.Payload["scope"])
	assert.Equal(t, kaelen.ID.String(), heard.Payload["target_id"])
	assert.Equal(t, "Kaelen", heard.Payload["target_name"])
	assert.Equal(t, secret, heard.Payload["text"])
	echo := awaitChat(t, wrenInbox, "Wren, the echo, on pod A")
	assert.Equal(t, heard.Payload, echo.Payload, "the echo is the line Kaelen got")

	letters := sent.letters()
	require.Len(t, letters, 1, "one inbox written to")
	require.Len(t, letters["pod:pod-b:inbox"], 1, "one letter, to pod B")
	l := letters["pod:pod-b:inbox"][0]
	assert.Equal(t, "whisper", l.Kind)
	assert.Equal(t, kaelen.ID.String(), l.ToPlayerID)
	assert.Equal(t, heard.Payload, l.Payload, "the letter carries the stamped line")

	assertSilent(t, kaelenInbox, "Kaelen, once only")
	assertSilent(t, ashInbox, "Ash, on pod B")
	assertSilent(t, idrisInbox, "Idris, on pod A")
	assert.NotContains(t, sink.String(), secret, "a whisper's text reached the log")
}

// A whisper letter pod A cannot publish has not gone out: Wren is told not_online and gets no
// echo, and Kaelen hears nothing. FS-KCQ06 R9, Edge States (publisher behind).
func TestWhisper_TwoPods_LetterNotPublishedIsNotOnline(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	a, b, _ := twoPartyPodsOn(t, client, mini, failingPublish{chatbus.NewRedis(client)})
	_, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	_, _, kaelenInbox := seatedThere(t, b, mini, "Kaelen")

	sendWhisper(a.server, wrenConn, "Kaelen", "are you there?")

	notice := awaitNotice(t, wrenInbox, "Wren")
	assert.Equal(t, map[string]interface{}{"code": "not_online", "text": "That player is not online."}, notice.Payload)
	assertSilent(t, wrenInbox, "Wren: no echo")
	assertSilent(t, kaelenInbox, "Kaelen")
}

// Kaelen's pod has crashed, and their presence entry lingers until the TTL: a whisper letter no
// pod is listening for has not gone out either. Wren is told not_online, gets no echo, and the
// log carries neither the text nor Kaelen's name. FS-KCQ06 R9, Edge States (target's pod crashed);
// charter #2.
func TestWhisper_TwoPods_NobodyListeningIsNotOnline(t *testing.T) {
	sink := captureLogs(t)
	client, mini := testutil.NewRedis(t)
	a := newPartyPod(t, client, "pod-a", chatbus.NewRedis(client))
	_, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	const deadPod = "pod-c"
	require.NoError(t, partypresence.NewRedis(client).Seat(context.Background(), deadPod, podAddrOf(deadPod),
		[]partypresence.Entry{{PlayerID: uuid.New(), Name: "Kaelen", World: "hub"}}))
	require.Zero(t, mini.PubSubNumSub(inboxChannel(deadPod))[inboxChannel(deadPod)], "nobody listens on the dead pod's inbox")

	const secret = "the-lantern-in-the-crypt-swordfish"
	sendWhisper(a.server, wrenConn, "Kaelen", secret)

	notice := awaitNotice(t, wrenInbox, "Wren")
	assert.Equal(t, map[string]interface{}{"code": "not_online", "text": "That player is not online."}, notice.Payload)
	assertSilent(t, wrenInbox, "Wren: no echo")
	assert.NotContains(t, sink.String(), secret, "a whisper's text reached the log")
	assert.NotContains(t, sink.String(), "Kaelen", "a whisper's target name reached the log")
}

// ---- receiving a whisper letter ------------------------------------------------------------------

// whisperLetter is a whisper letter as it comes off the bus: decoded from JSON.
func whisperLetter(t *testing.T, to string, line map[string]interface{}) letter {
	t.Helper()
	raw, err := json.Marshal(letter{Kind: "whisper", ToPlayerID: to, Payload: line})
	require.NoError(t, err)
	var l letter
	require.NoError(t, json.Unmarshal(raw, &l))
	return l
}

func whisperLine(target uuid.UUID, text string) map[string]interface{} {
	return map[string]interface{}{
		"message_id": chatTestID.String(), "sender_id": uuid.New().String(), "sender_name": "Wren",
		"channel": "whisper", "scope": target.String(), "sent_at": "2026-10-31T09:30:15.250Z", "text": text,
		"target_id": target.String(), "target_name": "Kaelen",
	}
}

// A received whisper letter is handed, as the chat line it carries, to its addressee if this pod
// seats them in a world, in a run as in the hub; nobody else hears it. FS-KCQ06 R8.
func TestWhisper_Letter_ToldToTheSeatedAddressee(t *testing.T) {
	rig := newPartyRig(t)
	kaelen, _, kaelenInbox := rig.inRun(t, "Kaelen")
	_, _, ashInbox := rig.inHub(t, "Ash")
	line := whisperLine(kaelen.ID, "found you")

	rig.onLoop(t, func(reg *partyRegistry) { reg.receive(whisperLetter(t, kaelen.ID.String(), line)) })

	assert.Equal(t, line, awaitChat(t, kaelenInbox, "Kaelen, in a run").Payload)
	assertSilent(t, kaelenInbox, "Kaelen, once only")
	assertSilent(t, ashInbox, "Ash")
}

// A whisper letter for a player this pod does not seat in a world (at the main menu here, or not
// here at all) is dropped with a Debug line naming only their id, and nothing else happens.
// FS-KCQ06 R8, R10, Edge States (target changes pod, reconnect grace).
func TestWhisper_Letter_ForAPlayerNotSeatedHereDropped(t *testing.T) {
	sink := captureLogs(t)
	rig := newPartyRig(t)
	ash, _, ashInbox := rig.connected(t, "Ash")
	_, _, marlInbox := rig.inHub(t, "Marl")
	gone := uuid.New()

	rig.onLoop(t, func(reg *partyRegistry) {
		reg.receive(whisperLetter(t, ash.ID.String(), whisperLine(ash.ID, "swordfish-secret")))
		reg.receive(whisperLetter(t, gone.String(), whisperLine(gone, "swordfish-secret")))
	})

	assertSilent(t, ashInbox, "Ash, at the main menu")
	assertSilent(t, marlInbox, "Marl, not addressed")
	for _, id := range []uuid.UUID{ash.ID, gone} {
		assert.Len(t, levelLinesWith(sink, "DEBUG", "whisper letter", id.String()), 1, "one Debug line for %s", id)
	}
	assert.NotContains(t, sink.String(), "swordfish-secret")
	assert.NotContains(t, sink.String(), "Kaelen", "no log carries the target's name")
}

// A whisper letter with no addressee, or no line, is skipped with a Warn that carries no text.
func TestWhisper_Letter_IncompleteSkippedWithAWarn(t *testing.T) {
	line := map[string]interface{}{"channel": "whisper", "text": "swordfish-secret"}
	tests := []struct {
		name string
		to   func(marl uuid.UUID) string
		line map[string]interface{}
	}{
		{name: "no addressee", to: func(uuid.UUID) string { return "" }, line: line},
		{name: "addressee not an id", to: func(uuid.UUID) string { return "Marl" }, line: line},
		{name: "no line", to: func(marl uuid.UUID) string { return marl.String() }, line: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sink := captureLogs(t)
			rig := newPartyRig(t)
			marl, _, marlInbox := rig.inHub(t, "Marl")

			rig.onLoop(t, func(reg *partyRegistry) { reg.receive(whisperLetter(t, tt.to(marl.ID), tt.line)) })

			assertSilent(t, marlInbox, "Marl")
			assert.Len(t, warnLinesWith(sink, "whisper"), 1, "one Warn")
			assert.NotContains(t, sink.String(), "swordfish-secret")
		})
	}
}

// levelLinesWith are the log lines at level holding every one of needles.
func levelLinesWith(sink *lockedLog, level string, needles ...string) []string {
	var out []string
	for _, line := range strings.Split(sink.String(), "\n") {
		if !strings.Contains(line, "level="+level) {
			continue
		}
		all := true
		for _, n := range needles {
			all = all && strings.Contains(line, n)
		}
		if all {
			out = append(out, line)
		}
	}
	return out
}

// ---- the publisher never waits on the hub's loop -------------------------------------------------

// kindsHeard is an inbox bus on which every letter is heard by one pod; it reports each letter's
// kind as it is published.
type kindsHeard struct {
	fakeBus
	kinds chan string
}

func (b kindsHeard) Publish(_ context.Context, _ string, payload []byte) error {
	var l letter
	if err := json.Unmarshal(payload, &l); err != nil {
		return err
	}
	b.kinds <- l.Kind
	return nil
}

func (b kindsHeard) PublishCount(ctx context.Context, channel string, payload []byte) (int64, error) {
	return 1, b.Publish(ctx, channel, payload)
}

// With the hub's loop behind (its jobs queue full), whisper echoes wait for room off the
// publisher, which keeps publishing every other letter in the meantime; once the loop catches
// up, every echo is told sent, in whatever order. Code review FS-KCQ06 round 1, Standards #1.
func TestWhisper_Courier_EchoesWaitOffThePublisher(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	bus := kindsHeard{fakeBus: fakeBus{onMessage: make(chan func([]byte), 1)}, kinds: make(chan string, inboxBuffer)}
	inbox := newPodInbox(bus, "pod-a")
	inbox.start(ctx)
	jobs := newLoopJobs()
	for len(jobs) < cap(jobs) {
		jobs <- func() {}
	}
	courier := newPartyCourier(inbox, nil, jobs, "pod-a", func(partyUpdateLetter) {}, func([]uuid.UUID, map[string]interface{}) {})

	const whispers = 3
	carried := make(chan bool, whispers)
	for i := 0; i < whispers; i++ {
		courier.sendWhisper(ctx, "pod-b", uuid.New(), map[string]interface{}{}, func(ok bool) { carried <- ok })
	}
	courier.sendNotice("pod-b", uuid.New(), "declined", "Kaelen")

	published := time.After(time.Second)
	for noticed := false; !noticed; {
		select {
		case kind := <-bus.kinds:
			noticed = kind == letterPartyNotice
		case <-published:
			t.Fatal("the publisher stalled behind a whisper echo waiting on the loop")
		}
	}

	deadline := time.After(2 * time.Second)
	for told := 0; told < whispers; {
		select {
		case ok := <-carried:
			assert.True(t, ok, "a published whisper is told sent")
			told++
		case job := <-jobs:
			job()
		case <-deadline:
			t.Fatalf("only %d of %d echoes reached the loop", told, whispers)
		}
	}
}
