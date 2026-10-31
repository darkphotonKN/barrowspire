package gameserver

import (
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-WJGFJ §Requirements A5–A7. I-WJGFJ-2: what the relay does to a line's text before it
// stamps it, and how often one player may speak. Driven on the relay itself, with a clock the
// test turns, so no test sleeps.

// chatClock is a clock the test moves by hand. The hub's goroutine reads it, so it is locked.
type chatClock struct {
	mu sync.Mutex
	at time.Time
}

func newChatClock() *chatClock { return &chatClock{at: chatTestNow} }

func (c *chatClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.at
}

func (c *chatClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.at = c.at.Add(d)
}

// relaySpy records what the relay sends: lines broadcast, notices to one connection.
type relaySpy struct {
	lines   []types.Message
	notices []types.Message
}

func (s *relaySpy) SendMessageToConn(_ *websocket.Conn, msg types.Message) error {
	s.notices = append(s.notices, msg)
	return nil
}

func (s *relaySpy) BroadcastToPlayerList(_ []uuid.UUID, msg types.Message) error {
	s.lines = append(s.lines, msg)
	return nil
}

type everyoneHere []uuid.UUID

func (e everyoneHere) SeatedPlayerIDs() []uuid.UUID { return e }

type rulesRig struct {
	relay *chatRelay
	spy   *relaySpy
	clock *chatClock
}

func newRulesRig() *rulesRig {
	spy := &relaySpy{}
	clock := newChatClock()
	return &rulesRig{
		relay: newChatRelay(everyoneHere{uuid.New()}, spy, testPodID, clock.now, uuid.New),
		spy:   spy,
		clock: clock,
	}
}

// seatedSpeaker is a player seated in some world on the pod.
func seatedSpeaker(name string) *types.Player {
	return &types.Player{ID: uuid.New(), Username: name, CurrentGameSessionId: uuid.New(), Character: types.CharacterInPlay{Name: name}}
}

func (r *rulesRig) say(p *types.Player, text any) {
	r.relay.relay(p, &websocket.Conn{}, map[string]interface{}{"channel": "area", "text": text})
}

// lastText is the text of the last line relayed, or "" with ok false when none was.
func (r *rulesRig) lastText() (string, bool) {
	if len(r.spy.lines) == 0 {
		return "", false
	}
	return r.spy.lines[len(r.spy.lines)-1].Payload["text"].(string), true
}

// A line's text is trimmed and its control characters become spaces, a run of them one space;
// empty after that, or no text at all, it is dropped without a word. FS-WJGFJ R5.
func TestChatRelay_NormalisesText(t *testing.T) {
	tests := []struct {
		name    string
		text    any
		want    string
		dropped bool
	}{
		{name: "trimmed", text: "  hello  ", want: "hello"},
		{name: "line break becomes a space", text: "a\nb", want: "a b"},
		{name: "a run of control characters becomes one space", text: "a\r\n\tb", want: "a b"},
		{name: "tab inside", text: "a\tb\tc", want: "a b c"},
		{name: "spaces the player typed are kept", text: "a  b", want: "a  b"},
		{name: "chinese untouched", text: "你好，世界", want: "你好，世界"},
		{name: "whitespace only is dropped", text: "   \n  ", dropped: true},
		{name: "empty is dropped", text: "", dropped: true},
		{name: "missing text is dropped", text: nil, dropped: true},
		{name: "text that is not a string is dropped", text: 42, dropped: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newRulesRig()

			rig.say(seatedSpeaker("Wren"), tt.text)

			got, relayed := rig.lastText()
			if tt.dropped {
				assert.False(t, relayed, "nothing is relayed")
				assert.Empty(t, rig.spy.notices, "and nothing is said about it")
				return
			}
			require.True(t, relayed)
			assert.Equal(t, tt.want, got)
		})
	}
}

// More than 200 code points, counted after normalising, is refused with too_long; the count is
// in code points, so a line of Chinese is measured as the player sees it. FS-WJGFJ R5, R7.
func TestChatRelay_RefusesTooLong(t *testing.T) {
	tests := []struct {
		name    string
		text    string
		refused bool
	}{
		{name: "200 latin", text: strings.Repeat("a", 200)},
		{name: "201 latin", text: strings.Repeat("a", 201), refused: true},
		{name: "200 chinese is 600 bytes and fine", text: strings.Repeat("字", 200)},
		{name: "201 chinese", text: strings.Repeat("字", 201), refused: true},
		{name: "200 after trimming", text: "   " + strings.Repeat("a", 200) + "   "},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newRulesRig()

			rig.say(seatedSpeaker("Wren"), tt.text)

			if !tt.refused {
				_, relayed := rig.lastText()
				assert.True(t, relayed)
				assert.Empty(t, rig.spy.notices)
				return
			}
			assert.Empty(t, rig.spy.lines, "a refused line reaches nobody")
			require.Len(t, rig.spy.notices, 1)
			assert.Equal(t, "chat_notice", rig.spy.notices[0].Action)
			assert.Equal(t, "too_long", rig.spy.notices[0].Payload["code"])
			assert.NotEmpty(t, rig.spy.notices[0].Payload["text"])
		})
	}
}

// One line per player per 2 seconds, from the last line accepted: inside the window the line
// is refused with too_fast and nothing is queued. Another player is not held up. FS-WJGFJ R6.
func TestChatRelay_FloodWindow(t *testing.T) {
	tests := []struct {
		name    string
		gap     time.Duration
		refused bool
	}{
		{name: "0.1 s later", gap: 100 * time.Millisecond, refused: true},
		{name: "1.9 s later", gap: 1900 * time.Millisecond, refused: true},
		{name: "exactly 2 s later", gap: 2 * time.Second},
		{name: "2.1 s later", gap: 2100 * time.Millisecond},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newRulesRig()
			wren := seatedSpeaker("Wren")

			rig.say(wren, "one")
			rig.clock.advance(tt.gap)
			rig.say(wren, "two")

			got, _ := rig.lastText()
			if tt.refused {
				assert.Equal(t, "one", got, "the second line reached nobody")
				require.Len(t, rig.spy.notices, 1)
				assert.Equal(t, "too_fast", rig.spy.notices[0].Payload["code"])
				return
			}
			assert.Equal(t, "two", got)
			assert.Empty(t, rig.spy.notices)
		})
	}
}

func TestChatRelay_FloodWindowIsPerPlayer(t *testing.T) {
	rig := newRulesRig()

	rig.say(seatedSpeaker("Wren"), "one")
	rig.say(seatedSpeaker("Kaelen"), "two")

	assert.Len(t, rig.spy.lines, 2, "two players at the same instant are both heard")
	assert.Empty(t, rig.spy.notices)
}

// A line refused for any earlier reason does not start the window, and a too_fast refusal does
// not move it: only accepted lines count. FS-WJGFJ R6 (I-WJGFJ-2 check order).
func TestChatRelay_OnlyAcceptedLinesCountTowardTheWindow(t *testing.T) {
	t.Run("too long does not start it", func(t *testing.T) {
		rig := newRulesRig()
		wren := seatedSpeaker("Wren")

		rig.say(wren, strings.Repeat("a", 201))
		rig.clock.advance(100 * time.Millisecond)
		rig.say(wren, "short")

		got, _ := rig.lastText()
		assert.Equal(t, "short", got)
	})

	t.Run("empty does not start it", func(t *testing.T) {
		rig := newRulesRig()
		wren := seatedSpeaker("Wren")

		rig.say(wren, "   ")
		rig.say(wren, "now")

		got, _ := rig.lastText()
		assert.Equal(t, "now", got)
	})

	t.Run("too fast does not extend it", func(t *testing.T) {
		rig := newRulesRig()
		wren := seatedSpeaker("Wren")

		rig.say(wren, "one")
		rig.clock.advance(1500 * time.Millisecond)
		rig.say(wren, "refused")
		rig.clock.advance(600 * time.Millisecond) // 2.1 s after "one", 0.6 s after the refusal
		rig.say(wren, "three")

		got, _ := rig.lastText()
		assert.Equal(t, "three", got)
	})
}

// The relay remembers only who spoke in the last 2 seconds: a player who spoke and went quiet,
// or left, is forgotten once the window has passed, so the record never grows with every player
// the pod has ever seen. FS-WJGFJ R6; decided with the user 2026-10-31 (I-WJGFJ-2).
func TestChatRelay_ForgetsSpeakersOnceTheirWindowHasPassed(t *testing.T) {
	rig := newRulesRig()
	wren := seatedSpeaker("Wren")
	kaelen := seatedSpeaker("Kaelen")

	rig.say(wren, "hi")
	require.Contains(t, rig.relay.lastAccepted, wren.ID)

	rig.clock.advance(2 * time.Second)
	rig.say(kaelen, "hello")

	assert.NotContains(t, rig.relay.lastAccepted, wren.ID, "Wren's window has passed")
	assert.Contains(t, rig.relay.lastAccepted, kaelen.ID)
}
