package gameserver

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Whisper (FS-KCQ06): a line for one player, named by character name. The sender's pod finds the
* target in the presence index, one read off the hub's loop through the party runner, as party
* chat reads presence (R3). A target this pod seats is handed the line through their writer
* queue, and the sender is handed the same line as the echo (R7, R9). A target found nowhere, or
* not seated here, is not online: one notice, no echo, nothing kept or retried (R4; ADR-0033).
*
* A target the index places on another pod is reached by one whisper letter to that pod's inbox,
* and the sender is echoed once the inbox has published it; one it could not publish is not online
* (R8, R9). There is no answer from that pod: a target gone from it meanwhile misses the line.
* That pod hands the letter's line to the target if it seats them, and drops it otherwise.
*
* Presence is only read, never written, and no log line carries the text (R10).
**/

// chatWhisper is what the relay needs from the presence side: whether this pod can look anyone
// up and reach other pods at all, the lookup itself, and a letter carrying a line to the target's
// pod. Both answer on the hub's loop.
type chatWhisper interface {
	whisperOpen() bool
	findWhisperTarget(ctx context.Context, name string, found func(target partypresence.Found, present bool, err error))
	// carried says whether the inbox published the letter
	carryWhisper(ctx context.Context, to partypresence.Found, line types.Message, carried func(ok bool))
}

// relayWhisper looks up an accepted whisper's target and, once the index answers, delivers it or
// tells the sender they are not online. at is when the line was accepted: the stamp keeps it,
// however long the lookup took.
func (r *chatRelay) relayWhisper(ctx context.Context, sender *types.Player, conn *websocket.Conn, name, text string, at time.Time) {
	r.whisper.findWhisperTarget(ctx, name, func(target partypresence.Found, present bool, err error) {
		if err != nil {
			// a failed read is offline to the sender; never retried (R4)
			slog.Warn("whisper target not looked up", "player_id", sender.ID, "error", err)
			r.notice(conn, constants.ChatNoticeNotOnline)
			return
		}
		if !present {
			r.notice(conn, constants.ChatNoticeNotOnline)
			return
		}
		// named by their player id rather than their name: still themselves
		if target.PlayerID == sender.ID {
			r.notice(conn, constants.ChatNoticeWhisperSelf)
			return
		}
		line := r.stampWhisper(sender, target, text, at)
		// seated here decides, whatever pod the index names: it lags a seat by up to a tick
		if r.seatsHere(target.PlayerID) {
			r.whisperHere(conn, target.PlayerID, line)
			return
		}
		if target.PodID != r.podID {
			r.whisperThere(ctx, conn, target, line)
			return
		}
		// placed here but seated in no world: back on the main menu, or the index lags
		r.notice(conn, constants.ChatNoticeNotOnline)
	})
}

// whisperThere carries a whisper to the target's pod in one letter, then echoes it to the sender
// once the inbox has published it (R8, R9). A letter the inbox could not publish has not gone out:
// the sender is told the target is not online, and gets no echo.
func (r *chatRelay) whisperThere(ctx context.Context, conn *websocket.Conn, target partypresence.Found, line types.Message) {
	r.whisper.carryWhisper(ctx, target, line, func(ok bool) {
		if !ok {
			r.notice(conn, constants.ChatNoticeNotOnline)
			return
		}
		r.echoWhisper(conn, line)
	})
}

// whisperHere hands a whisper to a target this pod seats, then echoes it to the sender (R7, R9).
// A writer queue that cannot take it has not been handed the line: the sender is told the target
// is not online, and gets no echo.
func (r *chatRelay) whisperHere(conn *websocket.Conn, targetID uuid.UUID, line types.Message) {
	if err := r.sender.BroadcastToPlayerList([]uuid.UUID{targetID}, line); err != nil {
		slog.Debug("whisper not delivered", "player_id", targetID, "error", err)
		r.notice(conn, constants.ChatNoticeNotOnline)
		return
	}
	r.echoWhisper(conn, line)
}

// echoWhisper hands the sender the line that went out. A full queue misses it; nobody waits.
func (r *chatRelay) echoWhisper(conn *websocket.Conn, line types.Message) {
	if err := r.sender.SendMessageToConn(conn, line); err != nil {
		slog.Debug("whisper echo not delivered", "error", err)
	}
}

// seatsHere is whether this pod seats the player in a world right now.
func (r *chatRelay) seatsHere(playerID uuid.UUID) bool {
	for _, id := range r.audience.SeatedPlayerIDs() {
		if id == playerID {
			return true
		}
	}
	return false
}

// stampWhisper is a whisper's line: stamped like every line, with the target's id as its scope,
// and the target's id and name as the index holds them (R6).
func (r *chatRelay) stampWhisper(sender *types.Player, target partypresence.Found, text string, at time.Time) types.Message {
	line := r.stamp(sender, constants.ChatChannelWhisper, target.PlayerID.String(), text, at)
	line.Payload["target_id"] = target.PlayerID.String()
	line.Payload["target_name"] = target.Name
	return line
}

// whisperLookup is a presence read for a whisper, as the runner hands it back.
type whisperLookup struct {
	found   partypresence.Found
	present bool
}

// whisperOpen reports whether this pod can find a whisper's target and reach their pod: it has
// the presence index and the pod inbox (R1).
func (r *partyRegistry) whisperOpen() bool {
	return r.cfg.presence != nil && r.courier.open()
}

// findWhisperTarget reads name from the presence index on the runner, in order with this pod's
// other party calls, and hands the answer back on the hub's loop, which never waits for it (R3).
// A runner with no room answers at once with an error.
func (r *partyRegistry) findWhisperTarget(ctx context.Context, name string, found func(target partypresence.Found, present bool, err error)) {
	onRunner(ctx, r.run,
		func(c context.Context) (whisperLookup, error) {
			f, present, err := r.cfg.presence.Lookup(c, name)
			return whisperLookup{found: f, present: present}, err
		},
		func(res whisperLookup, err error) {
			found(res.found, res.present, err)
		},
	)
}

// carryWhisper sends line to the pod the index found the target on, in one whisper letter, and
// tells carried, on the hub's loop, whether the inbox published it (R8, R9).
func (r *partyRegistry) carryWhisper(ctx context.Context, to partypresence.Found, line types.Message, carried func(ok bool)) {
	r.courier.sendWhisper(ctx, to.PodID, to.PlayerID, line.Payload, carried)
}

// heardWhisper hands a whisper from another pod to its addressee if this pod seats them in a
// world, and drops it otherwise, asking nothing else (R8): a target who has moved on, or is in
// reconnect grace, misses it.
func (r *partyRegistry) heardWhisper(to uuid.UUID, message map[string]interface{}) {
	if _, ok := r.directory.SeatedConns()[to]; !ok {
		slog.Debug("whisper letter for a player not seated here dropped", "player_id", to)
		return
	}
	if err := r.sender.SendMessageToPlayer(to, types.Message{Action: string(constants.ActionChat), Payload: message}); err != nil {
		slog.Debug("whisper letter not delivered", "player_id", to, "error", err)
	}
}

// sendWhisper sends one whisper letter, addressed to targetID and carrying message, to podID's
// inbox. carried is told on the hub's loop whether it was published; ctx is the pod's, and the
// wait for room on the loop ends with it. That wait runs on a goroutine of its own, never the
// inbox publisher's, so a busy loop holds up only whisper echoes, which may then reach it out of
// order, and not every other letter (code review FS-KCQ06 round 1).
func (c *partyCourier) sendWhisper(ctx context.Context, podID string, targetID uuid.UUID, message map[string]interface{}, carried func(ok bool)) {
	c.inbox.sendConfirmed(podID, letter{Kind: letterWhisper, ToPlayerID: targetID.String(), Payload: message},
		func() { go c.jobs.post(ctx, func() { carried(true) }) },
		func() { go c.jobs.post(ctx, func() { carried(false) }) },
	)
}

// receiveWhisper reads a whisper letter's addressee and line and hands them on. A letter missing
// either is skipped with a Warn that carries no text.
func (c *partyCourier) receiveWhisper(l letter) {
	to, err := uuid.Parse(l.ToPlayerID)
	if err != nil || l.Payload == nil {
		slog.Warn("pod inbox whisper skipped: incomplete", "has_addressee", err == nil, "has_message", l.Payload != nil)
		return
	}
	c.onWhisper(to, l.Payload)
}
