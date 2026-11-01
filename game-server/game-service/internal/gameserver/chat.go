package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* The chat relay: a line comes in from a connection, the pod stamps it, works
* out who hears it, delivers it, and forgets it. It runs on the message hub's
* loop and never touches a world (FS-WJGFJ §Requirements B11); nothing it
* handles is stored or logged in full (R14, ADR-0033).
*
* It depends on two narrow things, who is in the audience and how a line
* reaches a player, so that if chat ever moves out of game-service only those
* two change (FS-5SH4G parking lot).
**/

// chatAudience answers who is seated on this pod right now: the area channel's
// audience (ADR-0032).
type chatAudience interface {
	SeatedPlayerIDs() []uuid.UUID
}

// chatSender is how a line reaches players, and how a notice reaches one connection.
type chatSender interface {
	SendMessageToConn(conn *websocket.Conn, msg types.Message) error
	BroadcastToPlayerList(players []uuid.UUID, msg types.Message) error
}

// chatTextMax is the most code points a line may carry, after normalising. FS-WJGFJ R5.
const chatTextMax = 200

// chatFloodWindow is how long after an accepted line its speaker must wait to be heard again.
// FS-WJGFJ R6.
const chatFloodWindow = 2 * time.Second

// chatBus is what the relay needs from the Redis side of chat (FS-5SH4G): a subscription that
// hands over each message's bytes in order and reports when it drops.
type chatBus interface {
	Listen(ctx context.Context, channel string, onMessage func(payload []byte)) error
	Publish(ctx context.Context, channel string, payload []byte) error
}

// chatOutboundBuffer is how many accepted world lines may wait for the publisher before one
// is dropped (at-most-once, ADR-0033); chatPublishTimeout bounds each publish, so a slow Redis
// holds up only the publisher goroutine.
const (
	chatOutboundBuffer = 64
	chatPublishTimeout = 2 * time.Second
)

// chatInboundBuffer is how many lines off the bus may wait for the hub loop before one is
// dropped: at-most-once, never a stalled subscriber (ADR-0033).
const chatInboundBuffer = 64

// chatResubscribeWait is how long the subscriber waits after its subscription drops before
// subscribing again.
const chatResubscribeWait = time.Second

// chatRelay stamps and delivers chat lines for one pod.
type chatRelay struct {
	audience chatAudience
	sender   chatSender
	podID    string
	// the stamp's clock and id, seams a test fixes
	now   func() time.Time
	newID func() uuid.UUID
	// when each player's last line was accepted, for the flood window. Only the hub's loop
	// touches it, so it needs no lock; it holds only who spoke inside the window (R6).
	lastAccepted map[uuid.UUID]time.Time
	// lines arrived off the bus, waiting for the hub loop to deliver them (FS-5SH4G R9)
	inboundLines chan types.Message
	// accepted world lines, waiting for the publisher in acceptance order (FS-5SH4G R8)
	outboundLines chan types.Message
	// the Redis side of chat; nil on a pod built without one, which then refuses world chat
	bus chatBus
}

// chatWorldScope is world chat's scope key: one fixed constant for every pod (FS-5SH4G R2).
const chatWorldScope = "world"

// newChatRelay builds the pod's relay. now and newID are what lines are stamped with: the wall
// clock and fresh uuids in production, fixed in tests. bus carries world chat between pods; with
// none, world chat is closed on this pod (code review 2026-10-31).
func newChatRelay(audience chatAudience, sender chatSender, podID string, now func() time.Time, newID func() uuid.UUID, bus chatBus) *chatRelay {
	return &chatRelay{
		audience: audience,
		sender:   sender,
		podID:    podID,
		now:      now,
		newID:    newID,
		bus:      bus,

		lastAccepted:  make(map[uuid.UUID]time.Time),
		inboundLines:  make(chan types.Message, chatInboundBuffer),
		outboundLines: make(chan types.Message, chatOutboundBuffer),
	}
}

// start runs the relay's two bus goroutines, the subscriber and the publisher, for the life of
// ctx. A relay with no bus starts nothing.
func (r *chatRelay) start(ctx context.Context) {
	if r.bus == nil {
		return
	}
	go r.listen(ctx)
	go r.publishLoop(ctx)
}

// publishLoop is the pod's one publisher: it puts each accepted world line on the bus in the
// order the loop accepted it, each within chatPublishTimeout; one that fails is dropped with a
// Warn carrying no text, and the next is tried afresh (FS-5SH4G R8, R11). Runs on its own
// goroutine for the life of ctx.
func (r *chatRelay) publishLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case line := <-r.outboundLines:
			// shutting down: what is left in the queue goes unsent (at-most-once), quietly
			if ctx.Err() != nil {
				return
			}
			raw, err := json.Marshal(line.Payload)
			if err != nil {
				slog.Warn("world line not encoded", "error", err)
				continue
			}
			publishCtx, cancel := context.WithTimeout(ctx, chatPublishTimeout)
			err = r.bus.Publish(publishCtx, chatbus.WorldChannel, raw)
			cancel()
			if err != nil {
				slog.Warn("world line dropped: publish failed", "error", err)
			}
		}
	}
}

// queueWorldChat hands an accepted, stamped world line to the publisher. The sender's own pod
// hears it only when the bus returns it (R6): one path, so no pod needs to recognise its own
// lines. A full queue drops the line (at-most-once).
func (r *chatRelay) queueWorldChat(line types.Message) {
	select {
	case r.outboundLines <- line:
	default:
		slog.Debug("world line dropped: publisher behind")
	}
}

// inbound is where lines off the bus arrive for the hub loop to deliver.
func (r *chatRelay) inbound() <-chan types.Message {
	return r.inboundLines
}

// listen keeps a subscription to the world channel open for the life of ctx, subscribing again
// a moment after it drops (FS-5SH4G R9, R11). Runs on its own goroutine.
func (r *chatRelay) listen(ctx context.Context) {
	for {
		err := r.bus.Listen(ctx, chatbus.WorldChannel, r.arrived)
		if ctx.Err() != nil {
			return
		}
		slog.Warn("chat bus subscription dropped; subscribing again", "redis_channel", chatbus.WorldChannel, "error", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(chatResubscribeWait):
		}
	}
}

// arrived takes one message's bytes off the bus: a stamped line goes to the hub loop, anything
// else is skipped. A full queue drops the line rather than stall the subscriber (at-most-once).
func (r *chatRelay) arrived(raw []byte) {
	line, err := decodeWorldChatLine(raw)
	if err != nil {
		// never the bytes: a line's text may be in them (R14)
		slog.Warn("chat bus message skipped", "redis_channel", chatbus.WorldChannel, "error", err)
		return
	}
	select {
	case r.inboundLines <- line:
	default:
		slog.Debug("chat line off the bus dropped: hub loop behind", "redis_channel", chatbus.WorldChannel)
	}
}

var errNotAChatLine = errors.New("not a stamped world chat line")

// chatLineKeys are the stamp's fields (R3), every one a string; `stamp` writes them and a line
// read off the bus must carry them all.
var chatLineKeys = []string{"message_id", "sender_id", "sender_name", "channel", "scope", "sent_at", "text"}

// decodeWorldChatLine reads a published line back as the message a client receives: the stamped
// payload, unchanged, so a line reads the same whichever pod it came from. The world channel
// carries world lines only, so any other chat channel or scope is refused.
func decodeWorldChatLine(raw []byte) (types.Message, error) {
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return types.Message{}, fmt.Errorf("decode world chat line: %w", err)
	}
	for _, key := range chatLineKeys {
		if _, ok := payload[key].(string); !ok {
			return types.Message{}, fmt.Errorf("decode world chat line: %w: missing %s", errNotAChatLine, key)
		}
	}
	if payload["channel"] != string(constants.ChatChannelWorld) || payload["scope"] != chatWorldScope {
		return types.Message{}, fmt.Errorf("decode world chat line: %w: not world", errNotAChatLine)
	}
	return types.Message{Action: string(constants.ActionChat), Payload: payload}, nil
}

// deliver hands a line off the bus to every player seated on this pod (FS-5SH4G R7). On the
// hub loop, like an area line; a full writer queue or a gone player is skipped (R12).
func (r *chatRelay) deliver(line types.Message) {
	audience := r.audience.SeatedPlayerIDs()
	if len(audience) == 0 {
		return
	}
	if err := r.sender.BroadcastToPlayerList(audience, line); err != nil {
		slog.Debug("chat line off the bus not delivered to everyone", "redis_channel", chatbus.WorldChannel, "error", err)
	}
}

// WithChatClock stamps chat lines from now instead of the wall clock, so a
// test can check the stamp. FS-WJGFJ R3.
func WithChatClock(now func() time.Time) Option {
	return func(o *bootOptions) { o.chatNow = now }
}

// WithChatIDs mints chat line ids from newID instead of fresh uuids. FS-WJGFJ R3.
func WithChatIDs(newID func() uuid.UUID) Option {
	return func(o *bootOptions) { o.chatNewID = newID }
}

// WithChatBus gives the pod the Redis side of chat: it subscribes to the world channel at boot
// and delivers what arrives to its seated players. FS-5SH4G R9, R13.
func WithChatBus(bus chatBus) Option {
	return func(o *bootOptions) { o.chatBus = bus }
}

// chatNoticeCopy is what each notice says, in the words the player sees. The
// client keys on the code, so these are free to change. FS-WJGFJ R7.
var chatNoticeCopy = map[constants.ChatNoticeCode]string{
	constants.ChatNoticeNotInWorld:    "Enter the world before you speak.",
	constants.ChatNoticeChannelClosed: "That channel is not open yet.",
	constants.ChatNoticeTooLong:       "Too long. Two hundred characters at most.",
	constants.ChatNoticeTooFast:       "Catch your breath before you speak again.",
}

// relay handles one inbound chat line from sender on conn. The sender was
// resolved from the connection by the caller; nothing in payload says who is
// speaking (R2).
func (r *chatRelay) relay(sender *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if sender.CurrentGameSessionId == uuid.Nil {
		r.notice(conn, constants.ChatNoticeNotInWorld)
		return
	}

	channelName, _ := payload["channel"].(string)
	chatChannel := constants.ChatChannel(channelName)
	worldOpen := chatChannel == constants.ChatChannelWorld && r.bus != nil
	if chatChannel != constants.ChatChannelArea && !worldOpen {
		r.notice(conn, constants.ChatNoticeChannelClosed)
		return
	}

	// a missing or non-string text is no text: dropped like an empty line (R5)
	raw, _ := payload["text"].(string)
	text := normaliseChatText(raw)
	if text == "" {
		return
	}
	if utf8.RuneCountInString(text) > chatTextMax {
		r.notice(conn, constants.ChatNoticeTooLong)
		return
	}

	// one clock read per line: the window and the stamp agree on when it was said
	at := r.now()
	r.forgetQuiet(at)
	if last, spoke := r.lastAccepted[sender.ID]; spoke && at.Sub(last) < chatFloodWindow {
		r.notice(conn, constants.ChatNoticeTooFast)
		return
	}
	r.lastAccepted[sender.ID] = at

	// the world's scope key is the fixed constant; area's is this pod (FS-WJGFJ R1, FS-5SH4G R2)
	if chatChannel == constants.ChatChannelWorld {
		r.queueWorldChat(r.stamp(sender, chatChannel, chatWorldScope, text, at))
		return
	}
	line := r.stamp(sender, chatChannel, r.podID, text, at)

	audience := r.audience.SeatedPlayerIDs()
	if err := r.sender.BroadcastToPlayerList(audience, line); err != nil {
		// a full writer queue or a connection gone between resolving and
		// delivering: that player misses the line, nobody else waits (R12)
		slog.Debug("chat line not delivered to everyone", "chat_channel", channelName, "error", err)
	}
}

// stamp builds the outbound line. Every field here is the pod's: the id, the
// sender from the connection's record, the character's name as the name plate
// shows it, the clock. The client supplies the text and nothing else (R3).
func (r *chatRelay) stamp(sender *types.Player, channel constants.ChatChannel, scope, text string, at time.Time) types.Message {
	// the character's name, as the name plate shows it; never the account's (R3)
	name := sender.Character.Name

	return types.Message{
		Action: string(constants.ActionChat),
		Payload: map[string]interface{}{
			"message_id":  r.newID().String(),
			"sender_id":   sender.ID.String(),
			"sender_name": name,
			"channel":     string(channel),
			"scope":       scope,
			"sent_at":     at.UTC().Format("2006-01-02T15:04:05.000Z07:00"),
			"text":        text,
		},
	}
}

// forgetQuiet drops every speaker whose window has passed: their record can refuse nothing any
// more, so a player who spoke and left is not remembered for the life of the pod.
func (r *chatRelay) forgetQuiet(at time.Time) {
	for id, last := range r.lastAccepted {
		if at.Sub(last) >= chatFloodWindow {
			delete(r.lastAccepted, id)
		}
	}
}

// normaliseChatText trims a line and turns each run of control characters (line breaks, tabs)
// into one space, so a line is always one line. Spaces the player typed are kept. FS-WJGFJ R5.
func normaliseChatText(text string) string {
	var b strings.Builder
	b.Grow(len(text))
	inControl := false
	for _, r := range text {
		if unicode.IsControl(r) {
			if !inControl {
				b.WriteByte(' ')
			}
			inControl = true
			continue
		}
		inControl = false
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

// notice tells one connection something about its chat, by code. Not an error
// reply: the client shows it as a system line (R7).
func (r *chatRelay) notice(conn *websocket.Conn, code constants.ChatNoticeCode) {
	if err := r.sender.SendMessageToConn(conn, types.Message{
		Action: string(constants.ActionChatNotice),
		Payload: map[string]interface{}{
			"code": string(code),
			"text": chatNoticeCopy[code],
		},
	}); err != nil {
		slog.Warn("Could not deliver a chat notice", "code", code, "error", err)
	}
}
