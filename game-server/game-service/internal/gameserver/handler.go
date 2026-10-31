package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	authPb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.opentelemetry.io/otel"
	"google.golang.org/grpc/metadata"
)

/**
* Handles all the management and maintenance of connections with client
**/
var tracer = otel.Tracer("game-service")

func (s *Server) HandleWebSocketConnection(c *gin.Context) {
	ctx := c.Request.Context()
	ctx, span := tracer.Start(ctx, "service.HandleWebSocketConnection")
	defer span.End()

	userIdStr, ok := c.Get("userIdStr")
	slog.Debug("User ID from token and passed down with gin context", "userIdStr", userIdStr)

	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"statusCode": http.StatusUnauthorized, "message": "Unauthorized"})
		return
	}

	// verify member
	grpcPayload := &authPb.GetMemberRequest{
		Id: userIdStr.(string),
	}
	authClient := s.GetAuthClient()

	data, err := authClient.GetMember(c.Request.Context(), grpcPayload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user does not exist"})
		return
	}

	memberId, err := uuid.Parse(data.Id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "memberId is not uuid"})
		return
	}

	// a member already on record is reconnecting: their record is kept and
	// takes the token they reconnected with. player is a copy of the record,
	// so it is read below without the lock the worlds write it under.
	player, isReconnection := s.connectPlayer(memberId, data.Name, types.BearerToken(c.GetString(auth.TokenKey)))
	if isReconnection {
		slog.Debug("Player is reconnecting",
			"username", player.Username,
			"game_session_id", player.CurrentGameSessionId,
			"connect_state", player.ConnectState)
	} else {
		slog.Debug("Player connecting fresh.",
			"username", data.Name,
		)
	}

	// a handoff connection names the run it was sent to. The middleware always
	// passes the session id on, empty for an ordinary connect. FS-K2HKP R22.
	sessionID := c.GetString(auth.SessionIDKey)
	isHandoff := sessionID != ""

	// establish websocket connection
	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Error("Error establishing websocket connection.",
			"error", err,
		)
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to upgrade connection"})
		return
	}

	// The writer channel is filled with the reconnect replies before anyone
	// else can see it, then published with the connection in one step. Nothing
	// can close it under these sends, and nothing is sent on a channel a
	// concurrent reconnect has already closed.
	msgChan := make(chan interface{}, clientWriterBuffer)

	// a member on record here in a world is reconnecting to it: they keep the
	// body they have, and nothing is checked out (FS-18Z5F §C R18)
	reconnecting := isReconnection && player.CurrentGameSessionId != uuid.Nil

	// setup connecting player from handoff with his gear and character before attempting to connect to the match
	// decided only after the upgrade, since the client reads a refusal's close
	// code from an open socket, and before the connection is mapped, so a refused
	// one is never served. FS-K2HKP §Requirements 22, 24.
	if isHandoff {
		sessionIDUUID, err := uuid.Parse(sessionID)
		if err != nil {
			slog.Warn("attempt to handoff connect to game with incorrect session id", "session_id", sessionID, "member_id", memberId)
			s.refuseHandoff(conn, player.ID, isReconnection, "invalid session id")
			return
		}

		// check game session already created and is still running
		run, err := s.handoffRun(sessionIDUUID)
		if err != nil {
			slog.Warn("Refusing a handoff connection", "session_id", sessionIDUUID, "member_id", memberId, "error", err)
			s.refuseHandoff(conn, player.ID, isReconnection, err.Error())
			return
		}

		// decided before the checkout, so a stale or expired handoff never
		// re-tags the member's live gear into a run that then refuses it. A
		// member already seated, whose record here names the run, is
		// reconnecting; any other with no seat waiting is refused (FS-18Z5F
		// §C R13, R18; FS-K2HKP R24).
		switch run.HandoffSeatOf(memberId) {
		case game.HandoffSeatTaken:
			if !reconnecting || player.CurrentGameSessionId != run.ID {
				slog.Warn("Refusing a handoff connection, seated here but not on record in the run", "session_id", sessionIDUUID, "member_id", memberId)
				s.refuseHandoff(conn, player.ID, isReconnection, seatRefusalReason(game.ErrNoSeat))
				return
			}
			slog.Debug("Handoff connection from a member already seated, reconnecting", "session_id", sessionIDUUID, "member_id", memberId)

		case game.HandoffSeatExpected:
			// checked out under the run's session id, after the run's own checks
			// and before its lock is taken: a slow items-service delays only this
			// arrival (FS-K2HKP R22; FS-18Z5F §C R13, R16)
			handoffConnectCtx, handoffConnectCancel := context.WithTimeout(ctx, time.Second*3) // wait max 3 seconds for item
			defer handoffConnectCancel()
			gear, err := s.setupHandoffConnectingPlayer(handoffConnectCtx, memberId, run.ID, player.Token)
			if err != nil {
				slog.Warn("Refusing a handoff connection, loadout unavailable", "session_id", sessionIDUUID, "member_id", memberId, "error", err)
				s.refuseHandoff(conn, player.ID, isReconnection, "loadout unavailable")
				return
			}

			character, err := run.SeatArrival(&player, gear)
			if err != nil {
				slog.Warn("Refusing a handoff connection, seating failed", "session_id", sessionIDUUID, "member_id", memberId, "error", err)
				s.refuseHandoff(conn, player.ID, isReconnection, seatRefusalReason(err))
				return
			}

			player.Character = character
			s.enterHandedOffRun(&player, run, msgChan)
			reconnecting = false

		default:
			slog.Warn("Refusing a handoff connection, not expected", "session_id", sessionIDUUID, "member_id", memberId)
			s.refuseHandoff(conn, player.ID, isReconnection, seatRefusalReason(game.ErrNoSeat))
			return
		}
	}

	if reconnecting {
		slog.Debug("Sending reconnection success message.",
			"player_username", player.Username,
			"player_current_game_session_id", player.CurrentGameSessionId,
		)

		msgChan <- types.Message{
			Action: "reconnected",
			Payload: map[string]interface{}{
				"message":    "Successfully reconnected",
				"session_id": player.CurrentGameSessionId.String(),
				"username":   player.Username,
			},
		}

		s.announceCurrentWorld(msgChan, &player)
	}

	// the member keeps one live connection: any older one is unmapped, its
	// writer stopped, and the socket closed
	superseded, mapped := s.MapConnToPlayer(conn, player.ID, msgChan)
	if !mapped {
		// the record went (the reconnect grace ran out) while this connection
		// was being set up: refuse it rather than serve a member not on record.
		// msgChan was never published, so nothing else holds it.
		slog.Warn("Refusing a connection whose member is no longer on record",
			"player_id", player.ID,
		)
		_ = conn.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "member no longer on record, reconnect"),
			time.Now().Add(time.Second))
		conn.Close()
		return
	}
	for _, old := range superseded {
		old.Close()
	}

	s.startClientWriter(conn, msgChan)

	// handle connection messages
	go s.ServeConnectedPlayer(conn)
}

/**
* Tells a returning player which world they are in, so the client can put them
* back where they were.
*
* This used to send game_found unconditionally, which was true while a run was
* the only world anyone could be in. It stopped being true with the hub: a
* refresh sent everyone standing in the hub into the run scene, carrying the
* hub's own id. The world-identity message already answers exactly this
* question, so reconnection is simply another moment that asks it.
**/
func (s *Server) announceCurrentWorld(msgChan chan interface{}, player *types.Player) {
	session, exists := s.GetGameSession(player.CurrentGameSessionId)
	if !exists {
		slog.Warn("Reconnecting player points at a world that is gone",
			"username", player.Username,
			"session_id", player.CurrentGameSessionId,
		)
		return
	}

	slog.Info("Announcing world to reconnecting player",
		"username", player.Username,
		"world_type", session.WorldType(),
	)

	msgChan <- worldEnteredMessage(session)
}

/**
* Serves each individually connected player.
**/
func (s *Server) ServeConnectedPlayer(conn *websocket.Conn) {
	for {
		slog.Debug("Listening for player messages")
		_, message, err := conn.ReadMessage()

		// --- Handle WebSocket Errors ---
		if err != nil {
			s.handleReadError(conn, err)
			return // exit this goroutine
		}

		// --- Normal Message Processing ---
		// the frame itself is never logged: a chat line's text rides in it (FS-WJGFJ R14, ADR-0033)
		slog.Debug("Message received from connected user", "bytes", len(message))

		slog.Debug("before decoding received message")

		// --- Client Connection Handling ---
		// Decodes Incoming client message and serves their unique connection its own goroutine

		// decode message to pre-defined json structure "GameMessage"
		var decodedMsg types.Message

		err = json.Unmarshal(message, &decodedMsg)

		if err != nil {
			slog.Error("Error when decoding payload", "error", err)

			if err := conn.WriteJSON(types.Message{Action: "Error", Payload: map[string]interface{}{"error": "Your message to server was the incorrect format and could not be decoded as JSON."}}); err != nil {
				slog.Warn("Could not tell a client its message was malformed", "error", err)
			}
			continue
		}

		clientPackage := types.ClientPackage{Message: decodedMsg, Conn: conn}

		slog.Debug("Sending clientPackage to message hub")

		// send message to MessageHub via an *unbuffered channel* for handling based on the type field.
		s.serverChan <- clientPackage
	}
}

// How long a dropped member is held for a reconnect: a member who navigated
// away gets the short window, any other drop the long one.
const (
	reconnectGrace = 30 * time.Second
	goingAwayGrace = 10 * time.Second
)

/**
* Decides what a connection's read error means for the member it carried.
*
* Only a deliberate leave, a normal close, ends their stay at once. A member
* who navigated away is held for the short grace. Every other error is a drop
* the member did not choose: an abnormal or unexpected close, a reset, a
* timeout, any network error. It is held for the full grace, so a flaky
* network never costs a delver their run.
*
* The server's own close of a connection it already unmapped (one a reconnect
* superseded) also lands here, as "use of closed network connection". There is
* nobody behind it, so it is only closed.
**/
func (s *Server) handleReadError(conn *websocket.Conn, err error) {
	if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
		slog.Info("Player closed connection normally (intentional leave)")
		s.cleanUpClient(conn)
		return
	}

	grace := reconnectGrace
	if websocket.IsCloseError(err, websocket.CloseGoingAway) {
		grace = goingAwayGrace
	}

	player, hold, held := s.holdForReconnect(conn)
	conn.Close()

	if !held {
		slog.Info("Closed a connection no player is mapped to", "error", err)
		return
	}

	slog.Warn("Player dropped, keeping state for reconnection",
		"player_info", fmt.Sprintf("%s (ID: %s)", player.Username, player.ID),
		"grace", grace,
		"error", err,
	)

	// a member dropped in a field waits out the grace at home in the hub
	// (FS-X2F2H §Requirements 17)
	s.homeFromField(s.ctx, player.ID)

	go s.handleReconnectionTimeout(player.ID, hold, grace)
}

// clientWriterBuffer is how many messages a connection's writer channel holds
// before further sends to it are dropped rather than block the sender.
const clientWriterBuffer = 10

/**
* Writes everything sent on msgChan back to the client, until the channel is
* closed.
*
* NOTE: Gorilla Websocket package only allows ONE CONCURRENT WRITER
* at a time, so every write to a connection goes through its one channel.
**/
func (s *Server) startClientWriter(conn *websocket.Conn, msgChan chan interface{}) {
	go func() {
		defer func() {
			// ensure we recover from any panics in the writer goroutine
			if r := recover(); r != nil {
				slog.Info("clientWriter panic recovered",
					"r", r,
				)
			}
		}()

		for msg := range msgChan {
			if err := conn.WriteJSON(msg); err != nil {
				slog.Error("Error writing to client, connection likely closed",
					"error", err,
				)
				// the channel is closed when the connection is cleaned up
				return
			}
		}
	}()
}

/**
* Stops a connection's writer: its channel is closed and forgotten in one step.
*
* Callers must hold the write lock. Every sender looks the channel up and sends
* under the read lock, so a channel is closed exactly once and never while
* anyone can still send on it.
**/
func (s *Server) stopClientWriterLocked(conn *websocket.Conn) {
	if ch, exists := s.msgChan[conn]; exists {
		close(ch)
		delete(s.msgChan, conn)
	}
}

// graceHold names one drop's reconnect grace. Only the member's latest drop
// holds them: a reconnect ends the hold, and a later drop starts a new one, so
// an earlier drop's grace running out ends nothing.
type graceHold uint64

/**
* Holds the member a dropped connection carried for the reconnect grace: the
* connection is unmapped and its writer stopped, and every record of the member
* is marked reconnecting. Their record, world and queue place are kept. The
* returned hold is the one this drop's grace may end.
*
* One step under the lock, and only for a connection still mapped. A connection
* the server already unmapped (one a reconnect superseded, or one already
* cleaned up) carries nobody: reporting false there is what keeps the server's
* own close of a superseded socket from marking the member on the connection
* that replaced it as reconnecting. The caller closes the socket.
**/
func (s *Server) holdForReconnect(conn *websocket.Conn) (types.Player, graceHold, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	mapped, exists := s.connToPlayer[conn]
	if !exists {
		return types.Player{}, 0, false
	}

	s.stopClientWriterLocked(conn)
	delete(s.connToPlayer, conn)

	reconnecting := constants.Reconnecting
	for _, record := range s.everyRecordOf(mapped) {
		record.ConnectState = &reconnecting
	}

	s.lastGraceHold++
	hold := s.lastGraceHold
	s.graceHolds[mapped.ID] = hold

	return *mapped, hold, true
}

func (s *Server) handleReconnectionTimeout(playerID uuid.UUID, hold graceHold, timeout time.Duration) {
	slog.Debug("Reconnection timer started",
		"player_id", playerID,
		"timeout", timeout,
	)

	time.Sleep(timeout)

	s.cleanUpPlayerCompletely(playerID, hold)
}

/**
* Ends the stay of a member who did not come back within the reconnect grace
* of the drop that started hold.
*
* Checking they are still reconnecting under that same hold and deleting their
* record is one step under the lock, so a reconnect landing in between either
* keeps the record (it marked them connected and ended the hold first) or
* arrives after it is gone and starts fresh, never half of each. A member who
* reconnected and dropped again is under a newer hold, and only that drop's
* grace running out ends their stay.
**/
func (s *Server) cleanUpPlayerCompletely(playerID uuid.UUID, hold graceHold) {
	s.mu.Lock()

	record, exists := s.players[playerID]
	if !exists || s.graceHolds[playerID] != hold ||
		record.ConnectState == nil || *record.ConnectState != constants.Reconnecting {
		s.mu.Unlock()
		slog.Debug("Player reconnected, dropped again or was already cleaned up", "player_id", playerID)
		return
	}

	// A resolved member of a run is kept, body and record, until the run ends
	// and settles them: an escape must not be lost to a dropped connection.
	// The run's end deletes the record if they are still away (FS-QPDKN R18, R19).
	if world, inWorld := s.sessions[record.CurrentGameSessionId]; inWorld &&
		world.WorldType() == types.WorldTypeRun && world.Resolved(playerID) {
		s.awaitingSettlement[playerID] = struct{}{}
		delete(s.graceHolds, playerID)
		s.mu.Unlock()
		slog.Info("Resolved delver failed to reconnect within the grace, kept for the run's settlement",
			"username", record.Username, "run_id", world.ID)
		return
	}

	// a copy taken under the lock: the worlds keep writing the record under it
	player := *record
	delete(s.players, playerID)
	delete(s.graceHolds, playerID)

	s.mu.Unlock()

	slog.Info("Player failed to reconnect within the grace, cleaning up completely", "username", player.Username)

	s.releaseDeparted(&player)
}

/**
* Releases what a member whose record is already deleted still holds.
*
* The body in their world goes first: it is in-process and quick. The queue
* place goes after, because removing it may be slow and retried, and a member
* who reconnects and re-enters a world meanwhile must not have that new body
* removed by this old cleanup finishing late. Nothing here forgets a world on
* a record: the record is gone, and the member's current one, if they came
* back, is not this cleanup's to touch.
**/
func (s *Server) releaseDeparted(player *types.Player) {
	s.leaveCurrentWorld(player)

	// queue removal is external and can retry for a while, so it never runs under
	// the server lock; on its own goroutine so the disconnect isn't held up either.
	// It gets its own copy of the record. FS-K2HKP §Requirements 8.
	queued := *player
	go func(player *types.Player) {
		if err := s.queue.PlayerRemoveQueue(s.ctx, player); err != nil {
			slog.Error("failed to remove disconnected player from queue", "player_id", player.ID, "err", err)
		}
	}(&queued)
}

/**
* Cleans up all resources associated with a client connection.
* Called when connection is closed or errors out.
*
* A connection the server no longer maps (one a reconnect replaced) has no
* player behind it: it is only closed, and the member it used to carry is left
* alone on the connection that replaced it.
**/
func (s *Server) cleanUpClient(conn *websocket.Conn) {
	s.mu.Lock()

	mapped, exists := s.connToPlayer[conn]

	s.stopClientWriterLocked(conn)
	delete(s.connToPlayer, conn)

	// a copy taken under the lock: the worlds keep writing the record under it
	var player types.Player
	if exists {
		player = *mapped
		delete(s.players, player.ID)
		delete(s.graceHolds, player.ID)
	}

	s.mu.Unlock()

	if !exists {
		slog.Info("Cleaning up a connection no player is mapped to")
		conn.Close()
		return
	}

	slog.Info("Cleaning up client", "username", player.Username, "player_id", player.ID)

	// removes the body before the (possibly slow) queue removal, and never
	// touches a record the member may have come back with meanwhile
	s.releaseDeparted(&player)

	conn.Close()
}

/**
* Removes the player's body from the world their record points at, shutting
* down a run left empty. The record itself is not touched.
* This is separated from cleanUpClient to avoid holding the server mutex for too long.
**/
func (s *Server) leaveCurrentWorld(player *types.Player) {
	if player == nil {
		slog.Warn("leaveCurrentWorld: player is nil, skipping")
		return
	}

	if player.CurrentGameSessionId == uuid.Nil {
		slog.Debug("Player is not in any session, skipping session cleanup", "username", player.Username)
		return
	}

	s.mu.RLock()
	playerSession, exists := s.sessions[player.CurrentGameSessionId]
	s.mu.RUnlock()

	if !exists {
		slog.Warn("Session not found for player", "session_id", player.CurrentGameSessionId, "username", player.Username)
		return
	}

	// a field is never shut down: the visit settles and the field keeps
	// ticking for whoever is left, or nobody (FS-X2F2H §Requirements 5, 49)
	if playerSession.WorldType() == types.WorldTypeField {
		s.endVisit(s.ctx, playerSession, player.ID)
		return
	}

	slog.Info("Removing player from session", "username", player.Username, "session_id", playerSession.ID)

	// remove player from session
	playerSession.RemovePlayer(player.ID.String())

	// the hub outlives everyone leaving it
	if playerSession.WorldType() == types.WorldTypeHub {
		return
	}

	// check if session still has players
	remainingPlayers := playerSession.GetPlayerIDs()
	if len(remainingPlayers) == 0 {
		slog.Info("Session has no remaining players, shutting down", "session_id", playerSession.ID)

		// shutdown session
		playerSession.Shutdown()

		// remove from server's sessions map
		s.mu.Lock()
		delete(s.sessions, playerSession.ID)
		s.mu.Unlock()

		slog.Info("Session shut down and removed", "session_id", playerSession.ID)
	} else {
		slog.Info("Session still has remaining players", "session_id", playerSession.ID, "remaining", len(remainingPlayers))
	}
}

// Why a handoff connection names no run this host can seat it in.
var (
	errHandoffUnknownRun = errors.New("unknown run")
	errHandoffNotARun    = errors.New("session is not a run")
	errHandoffRunEnded   = errors.New("run has ended")
)

/**
* The run a handoff connection names, if it is one an arrival can still be
* seated in: it exists here, is a run (not the hub), and has not ended.
* FS-K2HKP §Requirements 24.
**/
func (s *Server) handoffRun(sessionID uuid.UUID) (*game.Session, error) {
	run, exists := s.GetGameSession(sessionID)
	if !exists {
		return nil, errHandoffUnknownRun
	}
	if run.WorldType() != types.WorldTypeRun {
		return nil, errHandoffNotARun
	}
	if run.Ended() {
		return nil, errHandoffRunEnded
	}

	return run, nil
}

/**
* Refuses a handoff connection at the handshake: a 4002 close frame with the
* reason, then the socket. It is called before the connection is mapped, so
* nothing else holds it and no goroutine serves it. FS-K2HKP §Requirements 24.
*
* A record this connect created for a member who was not on record before is
* forgotten, unless another connection has published them meanwhile: a refused
* member never arrived here, and would otherwise be kept with no connection and
* no grace to end it. A member who was already on record keeps their record.
**/
func (s *Server) refuseHandoff(conn *websocket.Conn, playerID uuid.UUID, wasOnRecord bool, reason string) {
	_ = conn.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(auth.CloseCodeHandoffRefused, reason),
		time.Now().Add(time.Second))
	_ = conn.Close()

	if wasOnRecord {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, connected := s.connOfLocked(playerID); connected {
		return
	}
	delete(s.players, playerID)
}

/**
* What follows seating a handed-off arrival: every record of the member points
* at the run, and the run's world_entered is queued on msgChan. The handler
* passes the connection's writer channel before MapConnToPlayer publishes it,
* so world_entered is the first message the connection is sent. FS-K2HKP
* §Requirements 22.
**/
func (s *Server) enterHandedOffRun(player *types.Player, run *game.Session, msgChan chan interface{}) {
	// an arrival never entered this pod's HUB, so its record has no character
	// until now: the one seated, which ReturnPlayersToHub reads after the run
	s.mu.Lock()
	for _, record := range s.everyRecordOf(player) {
		record.Character = player.Character
	}
	s.mu.Unlock()

	s.setCurrentWorld(player, run.ID)

	msgChan <- worldEnteredMessage(run)
}

/**
* seatRefusalReason is the short, fixed reason a refused seat's 4002 close frame
* carries: a close reason holds at most 123 bytes, so the full error is logged,
* never sent.
**/
func seatRefusalReason(err error) string {
	switch {
	case errors.Is(err, game.ErrNoSeat):
		return "no seat"
	case errors.Is(err, game.ErrCharacterNotSeatable):
		return "character not seatable"
	default:
		return "seating failed"
	}
}

/**
* setupHandoffConnectingPlayer checks the member's worn and bag items out of
* items-service into the world runID names, a run's session id or a field
* visit's id, and returns them to seat from (FS-18Z5F §C R13). A handoff
* arrival and a field entry seat this way.
**/
func (s *Server) setupHandoffConnectingPlayer(ctx context.Context, memberID, runID uuid.UUID, token types.BearerToken) (*items.CheckOutRunGearResponse, error) {
	gear, err := s.itemsClient.CheckOutRunGear(asMember(ctx, token), &items.CheckOutRunGearRequest{
		MemberId: memberID.String(),
		RunId:    runID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("check out run gear of %s into %s: %w", memberID, runID, err)
	}
	return gear, nil
}

// readLoadout reads the member's worn loadout without checking anything out:
// a pre-check, not a seating (FS-18Z5F §C R13).
func (s *Server) readLoadout(ctx context.Context, memberID uuid.UUID, token types.BearerToken) (*items.GetLoadoutWithItemsResponse, error) {
	res, err := s.itemsClient.GetLoadoutWithItems(asMember(ctx, token), &items.GetLoadoutWithItemsRequest{
		MemberId: memberID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("read loadout of %s: %w", memberID, err)
	}
	return res, nil
}

// asMember makes the call as the member: their gear is their own, so the call
// carries their bearer token, as game's asMember does, and items-service checks
// they own it.
func asMember(ctx context.Context, token types.BearerToken) context.Context {
	if token == "" {
		return ctx
	}
	return metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+string(token))
}
