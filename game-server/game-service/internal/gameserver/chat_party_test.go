package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-XGW7H §Requirements A1–A6, B7–B17, §D. I-XGW7H-1: a party line is stamped once on the
// sender's pod, told at once to the members this pod seats, and carried to the members on other
// pods by one presence read and one party_chat letter per pod.

// ---- the relay alone, with the party side faked -------------------------------------------------

// partySpy records what the relay sends, and to whom.
type partySpy struct {
	lines   []types.Message
	to      [][]uuid.UUID
	notices []types.Message
}

func (s *partySpy) SendMessageToConn(_ *websocket.Conn, msg types.Message) error {
	s.notices = append(s.notices, msg)
	return nil
}

func (s *partySpy) BroadcastToPlayerList(players []uuid.UUID, msg types.Message) error {
	s.lines = append(s.lines, msg)
	s.to = append(s.to, append([]uuid.UUID(nil), players...))
	return nil
}

// fakeChatParty is the party side as the relay sees it: who is in which party, and what was
// handed on for the other pods.
type fakeChatParty struct {
	parties map[uuid.UUID]partystore.Party
	carried []carriedLine
}

type carriedLine struct {
	partyID uuid.UUID
	away    []uuid.UUID
	line    types.Message
}

func (f *fakeChatParty) partyOfSpeaker(playerID uuid.UUID) (uuid.UUID, []uuid.UUID, bool) {
	p, in := f.parties[playerID]
	if !in {
		return uuid.Nil, nil, false
	}
	return p.ID, memberIDs(p), true
}

func (f *fakeChatParty) carryPartyLine(_ context.Context, partyID uuid.UUID, away []uuid.UUID, line types.Message) {
	f.carried = append(f.carried, carriedLine{partyID: partyID, away: away, line: line})
}

type partyRelayRig struct {
	relay *chatRelay
	spy   *partySpy
	party *fakeChatParty
	clock *chatClock
}

// newPartyRelayRig is a relay on a pod seating seated, with the given parties.
func newPartyRelayRig(seated []uuid.UUID, parties ...partystore.Party) *partyRelayRig {
	spy := &partySpy{}
	clock := newChatClock()
	fake := &fakeChatParty{parties: make(map[uuid.UUID]partystore.Party)}
	for _, p := range parties {
		for _, m := range p.Members {
			fake.parties[m.PlayerID] = p
		}
	}
	return &partyRelayRig{
		relay: newChatRelay(everyoneHere(seated), spy, testPodID, clock.now, func() uuid.UUID { return chatTestID }, nil, fake, nil),
		spy:   spy,
		party: fake,
		clock: clock,
	}
}

func partyWith(members ...uuid.UUID) partystore.Party {
	p := partystore.Party{ID: uuid.New(), Version: 1}
	for _, id := range members {
		p.Members = append(p.Members, partystore.Member{PlayerID: id})
	}
	return p
}

func (r *partyRelayRig) say(p *types.Player, channel string, text any) {
	r.relay.relay(context.Background(), p, &websocket.Conn{}, map[string]interface{}{"channel": channel, "text": text})
}

func (r *partyRelayRig) noticeCodes() []string {
	codes := make([]string, 0, len(r.spy.notices))
	for _, n := range r.spy.notices {
		codes = append(codes, n.Payload["code"].(string))
	}
	return codes
}

// A party line from a member is stamped with channel party and the party id as its scope, and
// told to the members seated here, the sender included; nobody else hears it. FS-XGW7H R1, R6–R8.
func TestPartyChat_Relay_StampsAndTellsTheMembersHere(t *testing.T) {
	wren, kaelen := seatedSpeaker("Wren"), seatedSpeaker("Kaelen")
	stranger := uuid.New()
	party := partyWith(wren.ID, kaelen.ID)
	rig := newPartyRelayRig([]uuid.UUID{wren.ID, kaelen.ID, stranger}, party)

	rig.say(wren, "party", "on my way")

	require.Empty(t, rig.spy.notices)
	require.Len(t, rig.spy.lines, 1, "one line, told once")
	assert.ElementsMatch(t, []uuid.UUID{wren.ID, kaelen.ID}, rig.spy.to[0], "the members here, sender included, and no stranger")
	assert.Equal(t, map[string]interface{}{
		"message_id":  chatTestID.String(),
		"sender_id":   wren.ID.String(),
		"sender_name": "Wren",
		"channel":     "party",
		"scope":       party.ID.String(),
		"sent_at":     "2026-10-31T09:30:15.250Z",
		"text":        "on my way",
	}, rig.spy.lines[0].Payload)
	assert.Empty(t, rig.party.carried, "every member is here: nothing to carry")
}

// A party of one hears their own line, and nothing is carried. FS-XGW7H §Edge States "Party of one".
func TestPartyChat_Relay_PartyOfOneHearsTheirOwnLine(t *testing.T) {
	wren := seatedSpeaker("Wren")
	rig := newPartyRelayRig([]uuid.UUID{wren.ID}, partyWith(wren.ID))

	rig.say(wren, "party", "hello?")

	require.Len(t, rig.spy.lines, 1)
	assert.Equal(t, []uuid.UUID{wren.ID}, rig.spy.to[0])
	assert.Empty(t, rig.party.carried)
}

// Members this pod does not seat are handed on, with the very line told here, so every pod
// shows the same stamp. FS-XGW7H R6, R9.
func TestPartyChat_Relay_CarriesTheSameLineForMembersElsewhere(t *testing.T) {
	wren := seatedSpeaker("Wren")
	marl, ori := uuid.New(), uuid.New()
	party := partyWith(wren.ID, marl, ori)
	rig := newPartyRelayRig([]uuid.UUID{wren.ID}, party)

	rig.say(wren, "party", "regroup")

	require.Len(t, rig.spy.lines, 1)
	assert.Equal(t, []uuid.UUID{wren.ID}, rig.spy.to[0], "only the sender is here")
	require.Len(t, rig.party.carried, 1)
	carried := rig.party.carried[0]
	assert.Equal(t, party.ID, carried.partyID)
	assert.Equal(t, []uuid.UUID{marl, ori}, carried.away)
	assert.Equal(t, rig.spy.lines[0], carried.line, "the line carried is the line told here")
}

// A player in no party is refused no_party with words they can read; nothing is told, nothing
// carried. FS-XGW7H R3.
func TestPartyChat_Relay_NoPartyIsRefused(t *testing.T) {
	ori := seatedSpeaker("Ori")
	rig := newPartyRelayRig([]uuid.UUID{ori.ID})

	rig.say(ori, "party", "anyone?")

	require.Len(t, rig.spy.notices, 1)
	assert.Equal(t, map[string]interface{}{"code": "no_party", "text": "You are not in a party."}, rig.spy.notices[0].Payload)
	assert.Empty(t, rig.spy.lines)
	assert.Empty(t, rig.party.carried)
}

// A no_party refusal does not start the flood window: an area line right after is relayed.
// FS-XGW7H R4.
func TestPartyChat_Relay_NoPartyLeavesTheFloodWindowAlone(t *testing.T) {
	ori := seatedSpeaker("Ori")
	rig := newPartyRelayRig([]uuid.UUID{ori.ID})

	rig.say(ori, "party", "anyone?")
	rig.say(ori, "area", "hello")

	assert.Equal(t, []string{"no_party"}, rig.noticeCodes())
	require.Len(t, rig.spy.lines, 1)
	assert.Equal(t, "hello", rig.spy.lines[0].Payload["text"])
}

// The refusals come in order: not_in_world, no_party, the empty drop, too_long, too_fast; and the
// rules are every channel's, the flood window shared with area and world. FS-XGW7H R2, R4.
func TestPartyChat_Relay_Refusals_InOrder(t *testing.T) {
	long := strings.Repeat("a", chatTextMax+1)
	tests := []struct {
		name      string
		inParty   bool
		inWorld   bool
		before    string // a line on area just before, to open the flood window
		text      any
		wantCodes []string
		relayed   bool
	}{
		{name: "in no world and no party", inParty: false, inWorld: false, text: "hi", wantCodes: []string{"not_in_world"}},
		{name: "in no world, in a party", inParty: true, inWorld: false, text: "hi", wantCodes: []string{"not_in_world"}},
		{name: "no party before the empty drop", inWorld: true, text: "   ", wantCodes: []string{"no_party"}},
		{name: "no party before too_long", inWorld: true, text: long, wantCodes: []string{"no_party"}},
		{name: "empty is dropped silently", inParty: true, inWorld: true, text: "  \n ", wantCodes: []string{}},
		{name: "missing text is dropped silently", inParty: true, inWorld: true, text: nil, wantCodes: []string{}},
		{name: "too long", inParty: true, inWorld: true, text: long, wantCodes: []string{"too_long"}},
		{name: "200 code points pass", inParty: true, inWorld: true, text: strings.Repeat("字", chatTextMax), wantCodes: []string{}, relayed: true},
		{name: "too fast after an area line", inParty: true, inWorld: true, before: "first", text: "second", wantCodes: []string{"too_fast"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wren := seatedSpeaker("Wren")
			var parties []partystore.Party
			if tt.inParty {
				parties = append(parties, partyWith(wren.ID))
			}
			rig := newPartyRelayRig([]uuid.UUID{wren.ID}, parties...)
			if tt.before != "" {
				rig.say(wren, "area", tt.before)
				rig.spy.lines = nil
			}
			if !tt.inWorld {
				wren.CurrentGameSessionId = uuid.Nil
			}

			rig.say(wren, "party", tt.text)

			assert.Equal(t, tt.wantCodes, rig.noticeCodes())
			assert.Equal(t, tt.relayed, len(rig.spy.lines) == 1, "relayed")
			if !tt.relayed {
				assert.Empty(t, rig.party.carried)
			}
		})
	}
}

// A party line opens the flood window for every channel: an area line inside 2 s is too_fast.
// FS-XGW7H R2 (FS-5SH4G's shared window).
func TestPartyChat_Relay_SharesTheFloodWindow(t *testing.T) {
	wren := seatedSpeaker("Wren")
	rig := newPartyRelayRig([]uuid.UUID{wren.ID}, partyWith(wren.ID))

	rig.say(wren, "party", "one")
	rig.say(wren, "area", "two")
	rig.clock.advance(chatFloodWindow)
	rig.say(wren, "area", "three")

	assert.Equal(t, []string{"too_fast"}, rig.noticeCodes())
	require.Len(t, rig.spy.lines, 2)
	assert.Equal(t, "three", rig.spy.lines[1].Payload["text"])
}

// Whisper, trade and unknown channels stay closed with party open. FS-XGW7H R1.
func TestPartyChat_Relay_OtherChannelsStayClosed(t *testing.T) {
	for _, channel := range []string{"whisper", "trade", "shout", ""} {
		t.Run("channel "+channel, func(t *testing.T) {
			wren := seatedSpeaker("Wren")
			rig := newPartyRelayRig([]uuid.UUID{wren.ID}, partyWith(wren.ID))

			rig.say(wren, channel, "hi")

			assert.Equal(t, []string{"channel_closed"}, rig.noticeCodes())
			assert.Empty(t, rig.spy.lines)
		})
	}
}

// ---- a pod, its party cache, a scripted presence index and a recording inbox --------------------

// scriptedPresence is a presence index whose lookups the test answers; its writes go nowhere.
type scriptedPresence struct {
	mu     sync.Mutex
	asked  [][]uuid.UUID
	answer func(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]partypresence.Found, error)
}

func (p *scriptedPresence) Seat(context.Context, string, string, []partypresence.Entry) error {
	return nil
}
func (p *scriptedPresence) Unseat(context.Context, string, []partypresence.Entry) error { return nil }
func (p *scriptedPresence) Lookup(context.Context, string) (partypresence.Found, bool, error) {
	return partypresence.Found{}, false, nil
}

func (p *scriptedPresence) LookupIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]partypresence.Found, error) {
	p.mu.Lock()
	p.asked = append(p.asked, append([]uuid.UUID(nil), ids...))
	answer := p.answer
	p.mu.Unlock()
	return answer(ctx, ids)
}

func (p *scriptedPresence) reads() [][]uuid.UUID {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([][]uuid.UUID(nil), p.asked...)
}

// recordingInbox is an inbox bus that hears nothing and records every letter published; it counts
// each as heard by one pod, as a live one is.
type recordingInbox struct {
	mu        sync.Mutex
	published map[string][]letter
}

func newRecordingInbox() *recordingInbox {
	return &recordingInbox{published: make(map[string][]letter)}
}

func (b *recordingInbox) Listen(ctx context.Context, _ string, _ func([]byte)) error {
	<-ctx.Done()
	return ctx.Err()
}

func (b *recordingInbox) Publish(_ context.Context, channel string, payload []byte) error {
	var l letter
	if err := json.Unmarshal(payload, &l); err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.published[channel] = append(b.published[channel], l)
	return nil
}

func (b *recordingInbox) PublishCount(ctx context.Context, channel string, payload []byte) (int64, error) {
	if err := b.Publish(ctx, channel, payload); err != nil {
		return 0, err
	}
	return 1, nil
}

func (b *recordingInbox) letters() map[string][]letter {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make(map[string][]letter, len(b.published))
	for k, v := range b.published {
		out[k] = append([]letter(nil), v...)
	}
	return out
}

func (b *recordingInbox) count() int {
	n := 0
	for _, ls := range b.letters() {
		n += len(ls)
	}
	return n
}

// lettersTo reads the addressees of a party_chat letter.
func lettersTo(t *testing.T, l letter) []string {
	t.Helper()
	raw, ok := l.Payload["to"].([]interface{})
	require.True(t, ok, "a party_chat letter carries to")
	to := make([]string, len(raw))
	for i, id := range raw {
		to[i] = id.(string)
	}
	return to
}

// cacheParty puts p in the pod's party cache, as a write or a letter would.
func (r *partyRig) cacheParty(t *testing.T, p partystore.Party) {
	t.Helper()
	r.onLoop(t, func(reg *partyRegistry) { reg.cache.put(p) })
}

// captureLogs sends every log line, Debug and up, to a sink for the test's life.
func captureLogs(t *testing.T) *lockedLog {
	t.Helper()
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return sink
}

func warnLinesWith(sink *lockedLog, needle string) []string {
	var out []string
	for _, line := range strings.Split(sink.String(), "\n") {
		if strings.Contains(line, "level=WARN") && strings.Contains(line, needle) {
			out = append(out, line)
		}
	}
	return out
}

// Members on pods B and C: one presence read for the members not seated here, then one
// party_chat letter to B addressed to both its members and one to C, each carrying the line as
// told here. A member the read places on this pod is not lettered; one it does not find is
// offline. The members here hear the line before the read is answered. FS-XGW7H R8–R10, §D.
func TestPartyChat_CrossPod_OneReadOneLetterPerPod(t *testing.T) {
	sink := captureLogs(t)
	release := make(chan struct{})
	marl, ori, idris, tam, ghost := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	presence := &scriptedPresence{answer: func(ctx context.Context, _ []uuid.UUID) (map[uuid.UUID]partypresence.Found, error) {
		select {
		case <-release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		return map[uuid.UUID]partypresence.Found{
			marl:  {PlayerID: marl, PodID: "pod-b", World: "hub"},
			ori:   {PlayerID: ori, PodID: "pod-b", World: "field"},
			idris: {PlayerID: idris, PodID: "pod-c", World: "run"},
			tam:   {PlayerID: tam, PodID: testPodID, World: "hub"},
		}, nil
	}}
	inbox := newRecordingInbox()
	rig := newPartyRig(t, WithPresence(presence), WithPodInbox(inbox), WithChatIDs(func() uuid.UUID { return chatTestID }))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, _, kaelenInbox := rig.inMeadows(t, "Kaelen")
	party := partyWith(wren.ID, kaelen.ID, marl, ori, idris, tam, ghost)
	rig.cacheParty(t, party)

	const secret = "meet-at-the-well-swordfish"
	sendChat(rig.server, wrenConn, "party", secret)

	// told here at once, while the read is still held
	wrenLine := awaitChat(t, wrenInbox, "Wren, the sender")
	kaelenLine := awaitChat(t, kaelenInbox, "Kaelen, in the Meadows")
	assert.Equal(t, wrenLine.Payload, kaelenLine.Payload)
	assert.Equal(t, "party", wrenLine.Payload["channel"])
	assert.Equal(t, party.ID.String(), wrenLine.Payload["scope"])
	assert.Zero(t, inbox.count(), "no letter before the read is answered")

	close(release)
	require.Eventually(t, func() bool { return inbox.count() == 2 }, pointerWait, 10*time.Millisecond, "one letter each to pod B and pod C")
	require.Len(t, presence.reads(), 1, "one presence read")
	assert.ElementsMatch(t, []uuid.UUID{marl, ori, idris, tam, ghost}, presence.reads()[0], "only the members not seated here are looked up")

	letters := inbox.letters()
	require.Len(t, letters["pod:pod-b:inbox"], 1, "two members on B share one letter")
	require.Len(t, letters["pod:pod-c:inbox"], 1)
	assert.Empty(t, letters["pod:"+testPodID+":inbox"], "a member the read puts here is not lettered")
	toB, toC := letters["pod:pod-b:inbox"][0], letters["pod:pod-c:inbox"][0]
	for _, l := range []letter{toB, toC} {
		assert.Equal(t, "party_chat", l.Kind)
		assert.Empty(t, l.ToPlayerID, "a party_chat letter names its players in its payload")
		assert.Equal(t, wrenLine.Payload, l.Payload["message"], "the very stamp told here")
	}
	assert.Equal(t, []string{marl.String(), ori.String()}, lettersTo(t, toB))
	assert.Equal(t, []string{idris.String()}, lettersTo(t, toC))

	time.Sleep(chatSilence)
	assert.Len(t, presence.reads(), 1, "and only one")
	assert.NotContains(t, sink.String(), secret, "a party line's text reached the log")
}

// With every member seated here there is no read and no letter. FS-XGW7H R9.
func TestPartyChat_CrossPod_AllHere_NoReadNoLetter(t *testing.T) {
	presence := &scriptedPresence{answer: func(context.Context, []uuid.UUID) (map[uuid.UUID]partypresence.Found, error) {
		return nil, nil
	}}
	inbox := newRecordingInbox()
	rig := newPartyRig(t, WithPresence(presence), WithPodInbox(inbox))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, _, kaelenInbox := rig.inRun(t, "Kaelen")
	rig.cacheParty(t, partyWith(wren.ID, kaelen.ID))

	sendChat(rig.server, wrenConn, "party", "hi")

	awaitChat(t, wrenInbox, "Wren")
	awaitChat(t, kaelenInbox, "Kaelen, in a run")
	time.Sleep(chatSilence)
	assert.Empty(t, presence.reads())
	assert.Zero(t, inbox.count())
}

// A failed read leaves the line with this pod's members, already told: one Warn with the party
// id and no text, no letter, no retry. FS-XGW7H R11.
func TestPartyChat_CrossPod_FailedRead_HereOnlyOneWarn(t *testing.T) {
	sink := captureLogs(t)
	presence := &scriptedPresence{answer: func(context.Context, []uuid.UUID) (map[uuid.UUID]partypresence.Found, error) {
		return nil, errors.New("redis down")
	}}
	inbox := newRecordingInbox()
	rig := newPartyRig(t, WithPresence(presence), WithPodInbox(inbox))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, _, kaelenInbox := rig.inHub(t, "Kaelen")
	party := partyWith(wren.ID, kaelen.ID, uuid.New())
	rig.cacheParty(t, party)

	const secret = "the-password-is-swordfish"
	sendChat(rig.server, wrenConn, "party", secret)

	awaitChat(t, wrenInbox, "Wren")
	awaitChat(t, kaelenInbox, "Kaelen")
	require.Eventually(t, func() bool { return len(warnLinesWith(sink, party.ID.String())) > 0 }, pointerWait, 10*time.Millisecond)
	time.Sleep(chatSilence)
	assert.Len(t, warnLinesWith(sink, party.ID.String()), 1, "one Warn, with the party id")
	assert.Len(t, presence.reads(), 1, "never retried")
	assert.Zero(t, inbox.count())
	assert.NotContains(t, sink.String(), secret)
}

// A pod built with no inbox and no presence index reaches no other pod by configuration: its
// own members hear the line, and nothing is warned. FS-XGW7H R12.
func TestPartyChat_NoInboxOrPresence_HereOnlyNoWarn(t *testing.T) {
	sink := captureLogs(t)
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, _, kaelenInbox := rig.inMeadows(t, "Kaelen")
	party := partyWith(wren.ID, kaelen.ID, uuid.New())
	rig.cacheParty(t, party)

	sendChat(rig.server, wrenConn, "party", "hi")

	awaitChat(t, wrenInbox, "Wren")
	awaitChat(t, kaelenInbox, "Kaelen")
	time.Sleep(chatSilence)
	assert.Empty(t, warnLinesWith(sink, "party"), "no Warn about the party line")
}

// A seated player in no party, on a real pod: no_party, nothing heard, no read; their area line
// right after is relayed. A player in no world gets not_in_world. FS-XGW7H R3, R4.
func TestPartyChat_Pod_NoPartyAndNoWorld(t *testing.T) {
	presence := &scriptedPresence{answer: func(context.Context, []uuid.UUID) (map[uuid.UUID]partypresence.Found, error) {
		return nil, nil
	}}
	rig := newPartyRig(t, WithPresence(presence), WithPodInbox(newRecordingInbox()))
	_, oriConn, oriInbox := rig.inHub(t, "Ori")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")
	_, ashConn, ashInbox := rig.connected(t, "Ash")

	sendChat(rig.server, oriConn, "party", "anyone?")
	notice := awaitNotice(t, oriInbox, "Ori")
	assert.Equal(t, map[string]interface{}{"code": "no_party", "text": "You are not in a party."}, notice.Payload)
	assertSilent(t, kaelenInbox, "Kaelen")
	assert.Empty(t, presence.reads())

	sendChat(rig.server, oriConn, "area", "hello")
	assert.Equal(t, "hello", awaitChat(t, oriInbox, "Ori").Payload["text"], "the flood window was not started")

	sendChat(rig.server, ashConn, "party", "hi")
	assert.Equal(t, "not_in_world", awaitNotice(t, ashInbox, "Ash").Payload["code"])
}

// ---- receiving a party_chat letter --------------------------------------------------------------

// partyChatLetter is a party_chat letter as it comes off the bus: decoded from JSON.
func partyChatLetter(t *testing.T, payload map[string]interface{}) letter {
	t.Helper()
	raw, err := json.Marshal(letter{Kind: "party_chat", Payload: payload})
	require.NoError(t, err)
	var l letter
	require.NoError(t, json.Unmarshal(raw, &l))
	return l
}

// A received party_chat letter is told to each addressed player this pod seats in a world, as
// the chat line it carries, whatever this pod's cache says of their party; an addressee not
// seated is skipped. FS-XGW7H R13.
func TestPartyChat_Letter_ToldToTheSeatedAddressees(t *testing.T) {
	rig := newPartyRig(t)
	marl, _, marlInbox := rig.inHub(t, "Marl")
	ori, _, oriInbox := rig.inRun(t, "Ori")
	ash, _, ashInbox := rig.connected(t, "Ash")
	_, _, idleInbox := rig.inHub(t, "Idle")
	message := map[string]interface{}{
		"message_id": chatTestID.String(), "sender_id": uuid.New().String(), "sender_name": "Wren",
		"channel": "party", "scope": uuid.New().String(), "sent_at": "2026-10-31T09:30:15.250Z", "text": "regroup",
	}

	rig.onLoop(t, func(reg *partyRegistry) {
		_, cached := reg.cache.partyOf(marl.ID)
		require.False(t, cached, "this pod caches no party for them")
		reg.receive(partyChatLetter(t, map[string]interface{}{
			"to":      []string{marl.ID.String(), ori.ID.String(), ash.ID.String(), uuid.New().String()},
			"message": message,
		}))
	})

	assert.Equal(t, message, awaitChat(t, marlInbox, "Marl").Payload)
	assert.Equal(t, message, awaitChat(t, oriInbox, "Ori, in a run").Payload)
	assertSilent(t, ashInbox, "Ash, in no world")
	assertSilent(t, idleInbox, "Idle, not addressed")
}

// A letter missing its addressees or its line is skipped with a Warn and no text.
// FS-XGW7H R13, R16.
func TestPartyChat_Letter_IncompleteSkippedWithAWarn(t *testing.T) {
	message := map[string]interface{}{"message_id": chatTestID.String(), "channel": "party", "text": "swordfish-secret"}
	tests := []struct {
		name    string
		payload func(marl uuid.UUID) map[string]interface{}
	}{
		{name: "no to", payload: func(uuid.UUID) map[string]interface{} { return map[string]interface{}{"message": message} }},
		{name: "empty to", payload: func(uuid.UUID) map[string]interface{} {
			return map[string]interface{}{"to": []string{}, "message": message}
		}},
		{name: "no message", payload: func(marl uuid.UUID) map[string]interface{} {
			return map[string]interface{}{"to": []string{marl.String()}}
		}},
		{name: "message not an object", payload: func(marl uuid.UUID) map[string]interface{} {
			return map[string]interface{}{"to": []string{marl.String()}, "message": "swordfish-secret"}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sink := captureLogs(t)
			rig := newPartyRig(t)
			marl, _, marlInbox := rig.inHub(t, "Marl")

			rig.onLoop(t, func(reg *partyRegistry) { reg.receive(partyChatLetter(t, tt.payload(marl.ID))) })

			assertSilent(t, marlInbox, "Marl")
			assert.Len(t, warnLinesWith(sink, "party chat"), 1, "one Warn")
			assert.NotContains(t, sink.String(), "swordfish-secret")
		})
	}
}

// ---- end to end, two pods on one Redis ---------------------------------------------------------

// A line from Wren on pod A reaches Marl on pod B through the presence index and B's inbox, with
// the stamp Wren sees, and Marl's answer comes back the same way. FS-XGW7H R6, R9–R13.
func TestPartyChat_TwoPods_BothHearTheSameLine(t *testing.T) {
	a, b, _, wren, marl, wrenConn, marlConn, wrenInbox, marlInbox := crossPodParty(t)
	var partyID uuid.UUID
	a.onLoop(t, func(reg *partyRegistry) {
		p, in := reg.cache.partyOf(wren.ID)
		require.True(t, in)
		partyID = p.ID
	})

	sendChat(a.server, wrenConn, "party", "on my way")

	mine := awaitChat(t, wrenInbox, "Wren, the sender, on A")
	theirs := awaitChat(t, marlInbox, "Marl, on B")
	assert.Equal(t, mine.Payload, theirs.Payload, "the same stamp on both pods, message_id included")
	assert.Equal(t, "party", theirs.Payload["channel"])
	assert.Equal(t, partyID.String(), theirs.Payload["scope"])
	assert.Equal(t, wren.ID.String(), theirs.Payload["sender_id"])

	sendChat(b.server, marlConn, "party", "see you there")
	reply := awaitChat(t, wrenInbox, "Wren, hearing Marl")
	assert.Equal(t, marl.ID.String(), reply.Payload["sender_id"])
	assert.Equal(t, reply.Payload, awaitChat(t, marlInbox, "Marl, hearing himself").Payload)
}

// In a run, a dead member and an escaped member still send and receive party lines: chat asks
// only that they are seated in a world. FS-XGW7H R14.
func TestPartyChat_InARun_DeadAndEscapedMembersTalk(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	idris, _, idrisInbox := rig.inHub(t, "Idris")
	rig.cacheParty(t, partyWith(wren.ID, kaelen.ID, idris.ID))
	run := rig.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen, idris}})
	require.Equal(t, run.ID, wren.CurrentGameSessionId)
	leaveRunKill(t, run, wren.ID)
	leaveRunEscape(t, run, kaelen.ID)

	sendChat(rig.server, wrenConn, "party", "I'm down")
	for who, inbox := range map[string]*startSoloInbox{"Wren (dead)": wrenInbox, "Kaelen (escaped)": kaelenInbox, "Idris": idrisInbox} {
		assert.Equal(t, "I'm down", awaitChat(t, inbox, who).Payload["text"])
	}

	sendChat(rig.server, kaelenConn, "party", "I'm out")
	for who, inbox := range map[string]*startSoloInbox{"Wren (dead)": wrenInbox, "Kaelen (escaped)": kaelenInbox, "Idris": idrisInbox} {
		assert.Equal(t, "I'm out", awaitChat(t, inbox, who).Payload["text"])
	}
}
