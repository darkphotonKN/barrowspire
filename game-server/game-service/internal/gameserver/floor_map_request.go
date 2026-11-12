package gameserver

import (
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
)

// floorMapAnswerEvery is how often one connection's request_floor_map is
// answered at most. The client asks once a second while its map is missing; a
// window 100 ms short of that answers a retry that arrives a little early,
// where a full second refused every other one. FS-KE075 §F Requirement 33.
const floorMapAnswerEvery = 900 * time.Millisecond

// floorMapAnswers is when each connection's request_floor_map was last
// answered. It lives on the hub's loop alone. Only the last window's answers
// are kept, so it never holds more than the connections that asked within it,
// and a closed connection is forgotten a window after its last answer.
type floorMapAnswers struct {
	last map[*websocket.Conn]time.Time
}

// allow reports whether conn's request at now is answered, and if so counts
// the answer.
func (a *floorMapAnswers) allow(conn *websocket.Conn, now time.Time) bool {
	if a.last == nil {
		a.last = make(map[*websocket.Conn]time.Time)
	}
	for asked, at := range a.last {
		if now.Sub(at) >= floorMapAnswerEvery {
			delete(a.last, asked)
		}
	}
	if _, answered := a.last[conn]; answered {
		return false
	}
	a.last[conn] = now
	return true
}

// answerFloorMap sends conn its run floor's map again: every outbound message
// can be dropped on a full queue, so a client whose map never came asks for it
// (FS-KE075 §F R33). Outside a run the request is ignored, with no refusal.
func (h *messageHub) answerFloorMap(conn *websocket.Conn, now time.Time) {
	_, session, err := h.resolveGameSession(conn)
	if err != nil {
		slog.Debug("request_floor_map from a connection in no world, ignored", "error", err)
		return
	}
	floorMap, ok := session.FloorMapMessage()
	if !ok {
		slog.Debug("request_floor_map outside a run, ignored", "world_type", session.WorldType())
		return
	}
	if !h.floorMapAnswers.allow(conn, now) {
		return
	}
	if err := h.sender.SendMessageToConn(conn, floorMap); err != nil {
		slog.Warn("Floor map not delivered on request", "session_id", session.ID, "error", err)
	}
}
