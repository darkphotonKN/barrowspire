package gameserver

import (
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
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

// chatRelay stamps and delivers chat lines for one pod.
type chatRelay struct {
	audience chatAudience
	sender   chatSender
	podID    string
	// the stamp's clock and id, seams a test fixes
	now   func() time.Time
	newID func() uuid.UUID
}

// newChatRelay builds the pod's relay. now and newID are what lines are
// stamped with: the wall clock and fresh uuids in production, fixed in tests.
func newChatRelay(audience chatAudience, sender chatSender, podID string, now func() time.Time, newID func() uuid.UUID) *chatRelay {
	return &chatRelay{
		audience: audience,
		sender:   sender,
		podID:    podID,
		now:      now,
		newID:    newID,
	}
}

// chatNoticeCopy is what each notice says, in the words the player sees. The
// client keys on the code, so these are free to change. FS-WJGFJ R7.
var chatNoticeCopy = map[constants.ChatNoticeCode]string{
	constants.ChatNoticeNotInWorld:    "Enter the world before you speak.",
	constants.ChatNoticeChannelClosed: "That channel is not open yet.",
}

// relay handles one inbound chat line from sender on conn. The sender was
// resolved from the connection by the caller; nothing in payload says who is
// speaking (R2).
func (r *chatRelay) relay(sender *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if sender.CurrentGameSessionId == uuid.Nil {
		r.notice(conn, constants.ChatNoticeNotInWorld)
		return
	}

	channel, _ := payload["channel"].(string)
	if constants.ChatChannel(channel) != constants.ChatChannelArea {
		r.notice(conn, constants.ChatNoticeChannelClosed)
		return
	}

	text, _ := payload["text"].(string)
	line := r.stamp(sender, constants.ChatChannelArea, r.podID, text)

	audience := r.audience.SeatedPlayerIDs()
	if err := r.sender.BroadcastToPlayerList(audience, line); err != nil {
		// a full writer queue or a connection gone between resolving and
		// delivering: that player misses the line, nobody else waits (R12)
		slog.Debug("chat line not delivered to everyone", "channel", channel, "error", err)
	}
}

// stamp builds the outbound line. Every field here is the pod's: the id, the
// sender from the connection's record, the character's name as the name plate
// shows it, the clock. The client supplies the text and nothing else (R3).
func (r *chatRelay) stamp(sender *types.Player, channel constants.ChatChannel, scope, text string) types.Message {
	name := sender.Character.Name
	if name == "" {
		name = sender.Username
	}

	return types.Message{
		Action: string(constants.ActionChat),
		Payload: map[string]interface{}{
			"message_id":  r.newID().String(),
			"sender_id":   sender.ID.String(),
			"sender_name": name,
			"channel":     string(channel),
			"scope":       scope,
			"sent_at":     r.now().UTC().Format("2006-01-02T15:04:05.000Z07:00"),
			"text":        text,
		},
	}
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
