package gameserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Core concurrent message orchestrator.
**/

type messageHub struct {
	sessionManager SessionManager
	sessions       map[string]*game.Session
	sender         *messaging.MessageSender

	// this pod's identity: a matched player on podID and connected here is
	// local, anyone else is handed off to the run at podAddr
	podID     string
	podAddr   string
	announcer HandoffAnnouncer
}

// handoffAnnounceTimeout bounds each announce to another pod, so a slow redis
// holds up only the announcing goroutine and only for this long per pod.
const handoffAnnounceTimeout = 2 * time.Second

type SessionManager interface {
	CreateGameSession(players *types.ResolvedMatchedPlayers) *game.Session
	GetGameSession(id uuid.UUID) (*game.Session, bool)
	GetServerChan() chan types.ClientPackage
	AddPlayer(*types.Player) error
	RemovePlayerFromQueue(*types.Player) error
	IsQueued(ctx context.Context, playerID uuid.UUID) (bool, error)
	LeaveRun(player *types.Player) (*game.Session, error)
	ForfeitRun(player *types.Player) error
	LeaveHub(ctx context.Context, player *types.Player) error
	GetPlayerFromConn(conn *websocket.Conn) (*types.Player, bool)
	EnterHub(ctx context.Context, conn *websocket.Conn, characterID string) (*game.Session, error)
	PlayerByID(playerID uuid.UUID) (*types.Player, bool)
	JoinHub(conn *websocket.Conn, character types.CharacterInPlay) (*game.Session, error)
	GetMatchedChan(ctx context.Context) chan matchmaker.MatchStart
	GetQueueStatusChan(ctx context.Context) chan matchmaker.QueueStatus
	GetHandoffChan(ctx context.Context) chan matchmaker.MatchStart
	AtSpireGate(playerID uuid.UUID) bool
	CheckLoadout(ctx context.Context, player *types.Player) error
	EnterField(ctx context.Context, conn *websocket.Conn, fieldID string) (*game.Session, error)
	LeaveField(ctx context.Context, player *types.Player) (*game.Session, error)
}

// Routing failures. The world a message belongs to is server-held state, so
// each of these means the server's own record is missing or stale. None of
// them mean the client said something wrong.
var (
	errPlayerNotFound     = errors.New("no player registered for this connection")
	errPlayerNotInSession = errors.New("player is not in a game session")
	errSessionNotFound    = errors.New("game session no longer exists")
	errHubMissing         = errors.New("hub world does not exist")
)

// Entry refusals. Each one reaches the menu as a reason the delver can act on.
// FS-BDA7X §Requirements 6.
var (
	errNoCharacter           = errors.New("no character id to enter with")
	errCharactersUnavailable = errors.New("character service unavailable")

	// the queue entry holds the character the run is built from, so it cannot
	// change while queued. FS-K2HKP §Requirements 7a.
	errCharacterSwitchWhileQueued = errors.New("character switch while queued")
)

// characterResolveTimeout bounds how long entry waits on character-service
// before refusing with a retryable reason.
const characterResolveTimeout = 3 * time.Second

// queueReadTimeout bounds how long a solo start waits to learn whether the
// member is queued; it runs on the hub's loop, so it must be short.
const queueReadTimeout = 2 * time.Second

// Solo start refusals, in the words the delver can act on. FS-NSV3D §Requirements 9.
const (
	startSoloNoCharacter = "Enter the hub with a character first."
	startSoloQueued      = "Leave the queue first."
)

// awayFromSpireGate refuses find_game and start_solo from anyone not standing
// at the Spire's door: the Spire is entered there, not from across the hub.
// FS-0XMCP §Requirements 12.
const awayFromSpireGate = "Walk to the Spire's door first."

// leaveRunRefusal is what a refused leave_run says, by why the run would not
// let the member go. FS-QPDKN §Requirements 14.
func leaveRunRefusal(err error) string {
	switch {
	case errors.Is(err, game.ErrStillInPlay):
		return "You are still in the delve."
	case errors.Is(err, game.ErrEscapedWaits):
		return "You are out of the barrow; the delve ends for you when it ends."
	default:
		return "You are not in a delve."
	}
}

// forfeitRunRefusal is what a refused forfeit_run says. FS-9K8EZ §Requirements 12.
func forfeitRunRefusal(err error) string {
	if errors.Is(err, game.ErrAlreadyResolved) {
		return "You are already out of the delve."
	}
	return "You are not in a delve."
}

// leaveHubRefusal is what a refused leave_hub says. FS-G4VMQ §Requirements 24.
func leaveHubRefusal(err error) string {
	switch {
	case errors.Is(err, errLeaveHubQueued):
		return "Leave the queue first."
	case errors.Is(err, errLeaveHubInRun):
		return "You are in a delve."
	default:
		return "You are not in the hub."
	}
}

// refuse answers an action with why it was not done: the same words on the
// error and in the payload, so the client shows one message whichever it reads.
func (h *messageHub) refuse(conn *websocket.Conn, action string, why string) {
	if err := h.sender.SendMessageToConn(conn, types.Message{
		Action:  action,
		Payload: map[string]interface{}{"message": why},
		Error:   &why,
	}); err != nil {
		slog.Warn("Could not deliver a refusal", "action", action, "error", err)
	}
}

// enterHubRefusal is what the menu shows for a refused entry. The detail stays
// in the log; a stranger's client gets only what it can act on.
func enterHubRefusal(err error) string {
	switch {
	case errors.Is(err, game.ErrWorldFull):
		return "The hub is full. Try again shortly."
	case errors.Is(err, errNoCharacter):
		return "Choose a character to enter with."
	case errors.Is(err, types.ErrCharacterNotFound):
		return "That character could not be found. Choose another."
	case errors.Is(err, errCharactersUnavailable):
		return "Characters are unavailable right now. Try again shortly."
	case errors.Is(err, game.ErrCharacterSwitchMidRun):
		return "You cannot change character during a delve."
	case errors.Is(err, errCharacterSwitchWhileQueued):
		return "Leave the queue before changing character."
	default:
		return "Could not enter"
	}
}

// enterHub resolves the character a client enters with and seats it. It runs
// off the message hub's loop: it waits on character-service, and every other
// connection's messages pass through that loop.
func (h *messageHub) enterHub(clientPackage types.ClientPackage) {
	ctx, cancel := context.WithTimeout(context.Background(), characterResolveTimeout)
	defer cancel()

	characterID, _ := clientPackage.Message.Payload["characterId"].(string)

	var reply types.Message
	hub, err := h.sessionManager.EnterHub(ctx, clientPackage.Conn, characterID)
	if err != nil {
		slog.Warn("Could not place player in the hub", "error", err)

		clientErr := enterHubRefusal(err)
		reply = types.Message{
			Action:  clientPackage.Message.Action,
			Payload: map[string]interface{}{"message": clientErr},
			Error:   &clientErr,
		}
	} else {
		reply = worldEnteredMessage(hub)
	}

	if err := h.sender.SendMessageToConn(clientPackage.Conn, reply); err != nil {
		slog.Warn("Could not answer enter_hub", "error", err)
	}
}

// worldEnteredMessage tells a client which world it is now in. Every transition
// uses this one message, so the client has a single place to switch scenes.
// FS-29KSH §Requirements 15. A field's also names the field, so the client
// picks its look without inferring it; hub and run messages are unchanged
// (FS-X2F2H §Requirements 2).
func worldEnteredMessage(session *game.Session) types.Message {
	payload := map[string]interface{}{
		"session_id": session.ID.String(),
		"world_type": string(session.WorldType()),
	}
	if session.WorldType() == types.WorldTypeField {
		payload["field"] = string(session.FieldID())
	}

	return types.Message{
		Action:  string(constants.ActionWorldEntered),
		Payload: payload,
	}
}

// refuseField answers a refused field action with its words and the stable
// reason the client switches on. FS-X2F2H §Requirements 10, 14, 60.
func (h *messageHub) refuseField(conn *websocket.Conn, action string, err error) {
	reason, why := fieldRefusal(err)
	if sendErr := h.sender.SendMessageToConn(conn, types.Message{
		Action:  action,
		Payload: map[string]interface{}{"message": why, "reason": reason},
		Error:   &why,
	}); sendErr != nil {
		slog.Warn("Could not deliver a field refusal", "action", action, "error", sendErr)
	}
}

// enterField walks a hub member into a field. It runs off the message hub's
// loop: it waits on the queue and on items-service. FS-X2F2H §Requirements 9–13.
func (h *messageHub) enterField(clientPackage types.ClientPackage) {
	ctx, cancel := context.WithTimeout(context.Background(), fieldReadTimeout)
	defer cancel()

	fieldID, _ := clientPackage.Message.Payload["field"].(string)

	field, err := h.sessionManager.EnterField(ctx, clientPackage.Conn, fieldID)
	if err != nil {
		slog.Warn("Refusing enter_field", "field", fieldID, "error", err)
		h.refuseField(clientPackage.Conn, clientPackage.Message.Action, err)
		return
	}

	if err := h.sender.SendMessageToConn(clientPackage.Conn, worldEnteredMessage(field)); err != nil {
		slog.Warn("Could not tell a player they are in the field", "error", err)
	}
}

// checkGear reads a Spire entrant's gear off the message hub's loop, bounded as
// a field entry's read is. Unreadable gear is refused with loadout_unavailable,
// as a field refuses it: a run seated on unread gear would settle the stored
// loadout as empty, so entry fails closed. Readable gear sends the message
// back into the hub's inbound channel marked checked, so the loop runs every
// guard again on its own state and decides there.
func (h *messageHub) checkGear(ctx context.Context, player *types.Player, clientPackage types.ClientPackage) {
	readCtx, cancel := context.WithTimeout(ctx, fieldReadTimeout)
	err := h.sessionManager.CheckLoadout(readCtx, player)
	cancel()
	if err != nil {
		slog.Warn("Refusing Spire entry: gear unreadable",
			"action", clientPackage.Message.Action, "player_id", player.ID, "error", err)
		h.refuseField(clientPackage.Conn, clientPackage.Message.Action, err)
		return
	}

	clientPackage.LoadoutChecked = true
	select {
	case h.sessionManager.GetServerChan() <- clientPackage:
	case <-ctx.Done():
	}
}

// resolveGameSession answers which world a connection's messages belong to,
// from the server's own record of the player. It deliberately takes no payload:
// a client cannot address a world it is not in (FS-29KSH §Requirements 16).
func (h *messageHub) resolveGameSession(conn *websocket.Conn) (*game.Session, error) {
	player, exists := h.sessionManager.GetPlayerFromConn(conn)
	if !exists {
		return nil, errPlayerNotFound
	}

	if player.CurrentGameSessionId == uuid.Nil {
		return nil, fmt.Errorf("%w: %s", errPlayerNotInSession, player.Username)
	}

	session, exists := h.sessionManager.GetGameSession(player.CurrentGameSessionId)
	if !exists {
		return nil, fmt.Errorf("%w: %s", errSessionNotFound, player.CurrentGameSessionId)
	}

	return session, nil
}

func NewMessageHub(sessionManager SessionManager, sender *messaging.MessageSender, podID, podAddr string, announcer HandoffAnnouncer) *messageHub {
	return &messageHub{
		sessionManager: sessionManager,
		sessions:       make(map[string]*game.Session),
		sender:         sender,
		podID:          podID,
		podAddr:        podAddr,
		announcer:      announcer,
	}
}

/**
* Core goroutine hub to handle all incoming messages and orchestrate them
* to other parts of game.
**/
func (h *messageHub) Run(ctx context.Context) {
	slog.Info("Initializing message hub.")

	for {
		select {
		case clientPackage := <-h.sessionManager.GetServerChan():
			slog.Info("incoming message.", "message", clientPackage.Message)

			// handle message based on action
			var gameActions map[constants.Action]bool = map[constants.Action]bool{
				constants.ActionMove:      true,
				constants.ActionAttack:    true,
				constants.ActionInteract:  true,
				constants.ActionEquip:     true,
				constants.ActionUnequip:   true,
				constants.ActionCastSkill: true,
			}

			messageAction := constants.Action(clientPackage.Message.Action)

			// --- GAME RELATED ACTIONS ---
			// any message sent from the client after a game session is initialized
			// will be propogated from the message hub to corresponding server.

			if gameActions[messageAction] {
				session, err := h.resolveGameSession(clientPackage.Conn)

				if err != nil {
					// Detail stays server-side. The client no longer supplies a
					// session id and must not be handed one back in an error
					// (FS-29KSH §Requirements 16).
					slog.Warn("Could not route game action",
						"action", clientPackage.Message.Action,
						"error", err,
					)

					h.refuse(clientPackage.Conn, clientPackage.Message.Action, "You are not in a game session")
					continue
				}

				// propogate message to corresponding game
				session.MessageCh <- clientPackage
				continue
			}

			// --- MENU RELATED ACTIONS ---
			// These actions will be actions for before game initialization happens
			switch messageAction {

			case constants.ActionEnterHub:
				// The request names the character by id; who it is comes from
				// character-service, never the payload. FS-BDA7X §Requirements 5.
				go h.enterHub(clientPackage)

			case constants.ActionFindGame:
				slog.Debug("ActionFindGame")
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)

				// player doesn't exist at all in the server, skip them
				if !exists {
					slog.Debug("Player doesn't exist in session.")
					continue
				}

				// The run seats the character in play from the player's record;
				// find_game names no character, and a player who has not
				// entered with one is never queued as a guessed one.
				// FS-BDA7X §Requirements 6–7.
				if player.Character.ID == uuid.Nil {
					slog.Warn("Refusing find_game: no character in play", "player_id", player.ID)

					h.refuse(clientPackage.Conn, clientPackage.Message.Action, startSoloNoCharacter)
					continue
				}

				// -- player already exists in an old game --
				err := h.handlePlayerExistingGame(player, clientPackage)

				// no error, so player exists, skip queue
				if err == nil {
					slog.Debug("player exists already, skipping queue",
						"player_id", player.ID,
						"player_username", player.Username,
					)
					continue
				}

				// the Spire is entered at its door; the queue below is untouched.
				// FS-0XMCP §Requirements 12, 14.
				if !h.sessionManager.AtSpireGate(player.ID) {
					slog.Debug("Refusing find_game: not at the Spire gate", "player_id", player.ID)
					h.refuse(clientPackage.Conn, clientPackage.Message.Action, awayFromSpireGate)
					continue
				}

				// gear is read off the loop; the message comes back checked
				if !clientPackage.LoadoutChecked {
					go h.checkGear(ctx, player, clientPackage)
					continue
				}

				// -- queue up player --
				err = h.sessionManager.AddPlayer(player)
				if err != nil {
					queueErr := err.Error()
					message := "Error occured when attempting to queue player"

					if errors.Is(err, matchmaker.ErrPlayerAlreadyQueued) {
						// TODO: tell the client they are already queued
						continue
					}

					if err := h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
						Action: clientPackage.Message.Action,
						Payload: map[string]interface{}{
							"message":   message,
							"player_id": player.ID.String(),
							"username":  player.Username,
						},
						Error: &queueErr,
					}); err != nil {
						slog.Warn("Could not answer find_game", "player_id", player.ID, "error", err)
					}
					continue
				}

				slog.Info("Player added to matchmaking queue", "player username", player.Username)

				if err := h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
					Action: clientPackage.Message.Action,
					Payload: map[string]interface{}{
						"message":   "Successfully joined matchmaking queue",
						"player_id": player.ID.String(),
						"username":  player.Username,
					},
				}); err != nil {
					slog.Warn("Could not answer find_game", "player_id", player.ID, "error", err)
				}

			// A run of one, built at once: no queue, no matchmaker, no handoff.
			// The guards are find_game's, and a member already in a run is
			// resumed as find_game resumes them. FS-NSV3D §Requirements 8–12.
			case constants.ActionStartSolo:
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)
				if !exists {
					slog.Debug("start_solo from a connection with no player")
					continue
				}

				if player.Character.ID == uuid.Nil {
					slog.Warn("Refusing start_solo: no character in play", "player_id", player.ID)
					h.refuse(clientPackage.Conn, clientPackage.Message.Action, startSoloNoCharacter)
					continue
				}

				// already delving: the run they are in is the answer
				if err := h.handlePlayerExistingGame(player, clientPackage); err == nil {
					continue
				}

				// FS-0XMCP §Requirements 12
				if !h.sessionManager.AtSpireGate(player.ID) {
					slog.Debug("Refusing start_solo: not at the Spire gate", "player_id", player.ID)
					h.refuse(clientPackage.Conn, clientPackage.Message.Action, awayFromSpireGate)
					continue
				}

				// gear is read off the loop; the message comes back checked
				if !clientPackage.LoadoutChecked {
					go h.checkGear(ctx, player, clientPackage)
					continue
				}

				// a queued member's character belongs to the queue entry until they
				// leave it (FS-K2HKP R7a); an unreadable queue is not a queue they
				// are in, as enter_hub already treats it
				queueCtx, cancel := context.WithTimeout(ctx, queueReadTimeout)
				queued, err := h.sessionManager.IsQueued(queueCtx, player.ID)
				cancel()
				if err != nil {
					slog.Warn("Could not read queue entry on start_solo, treating as not queued",
						"player_id", player.ID, "error", err)
				}
				if queued {
					h.refuse(clientPackage.Conn, clientPackage.Message.Action, startSoloQueued)
					continue
				}

				session := h.sessionManager.CreateGameSession(&types.ResolvedMatchedPlayers{
					LocalPlayers: []*types.Player{player},
				})
				slog.Info("Solo run started", "session_id", session.ID, "player_id", player.ID)
				if err := h.sender.SendMessageToConn(clientPackage.Conn, worldEnteredMessage(session)); err != nil {
					slog.Warn("Could not tell the delver their solo run started", "player_id", player.ID, "error", err)
				}

			// A dead delver leaving the run for the hub before it ends; the run
			// keeps their body for its settlement. FS-QPDKN §Requirements 13, 14.
			case constants.ActionLeaveRun:
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)
				if !exists {
					slog.Debug("leave_run from a connection with no player")
					continue
				}

				hub, err := h.sessionManager.LeaveRun(player)
				if err != nil {
					slog.Warn("Refusing leave_run", "player_id", player.ID, "error", err)
					h.refuse(clientPackage.Conn, clientPackage.Message.Action, leaveRunRefusal(err))
					continue
				}

				slog.Info("Delver left the run early", "player_id", player.ID)
				if err := h.sender.SendMessageToConn(clientPackage.Conn, worldEnteredMessage(hub)); err != nil {
					slog.Warn("Could not tell the leaver they are home", "player_id", player.ID, "error", err)
				}

			// A hub member at a field gate walking into this pod's channel of
			// the field; off the loop, since it reads the queue and the loadout.
			// FS-X2F2H §Requirements 9–13.
			case constants.ActionEnterField:
				go h.enterField(clientPackage)

			// A player at a field's entrance walking home to the hub, beside
			// leave_run. FS-X2F2H §Requirements 14–16.
			case constants.ActionLeaveField:
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)
				if !exists {
					slog.Debug("leave_field from a connection with no player")
					continue
				}

				hub, err := h.sessionManager.LeaveField(ctx, player)
				if err != nil {
					slog.Warn("Refusing leave_field", "player_id", player.ID, "error", err)
					h.refuseField(clientPackage.Conn, clientPackage.Message.Action, err)
					continue
				}

				slog.Info("Walked home from a field", "player_id", player.ID)
				if err := h.sender.SendMessageToConn(clientPackage.Conn, worldEnteredMessage(hub)); err != nil {
					slog.Warn("Could not tell a player they are home", "player_id", player.ID, "error", err)
				}

			// A delver in play dying where they stand: health to zero, and the
			// death takes its ordinary course. Nothing is sent on success; the
			// next state shows it. FS-9K8EZ §Requirements 9–12.
			case constants.ActionForfeitRun:
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)
				if !exists {
					slog.Debug("forfeit_run from a connection with no player")
					continue
				}

				if err := h.sessionManager.ForfeitRun(player); err != nil {
					slog.Warn("Refusing forfeit_run", "player_id", player.ID, "error", err)
					h.refuse(clientPackage.Conn, clientPackage.Message.Action, forfeitRunRefusal(err))
					continue
				}

				slog.Info("Delver fell where they stood", "player_id", player.ID)

			// A hub member leaving for the roster: body gone, record in no world,
			// so a refresh lands on the roster. FS-G4VMQ §Requirements 23–24.
			case constants.ActionLeaveHub:
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)
				if !exists {
					slog.Debug("leave_hub from a connection with no player")
					continue
				}

				queueCtx, cancel := context.WithTimeout(ctx, queueReadTimeout)
				err := h.sessionManager.LeaveHub(queueCtx, player)
				cancel()
				if err != nil {
					slog.Warn("Refusing leave_hub", "player_id", player.ID, "error", err)
					h.refuse(clientPackage.Conn, clientPackage.Message.Action, leaveHubRefusal(err))
					continue
				}

				slog.Info("Delver left the hub for the roster", "player_id", player.ID)
				if err := h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
					Action: string(constants.ActionWorldLeft),
				}); err != nil {
					slog.Warn("Could not tell a member they left the hub", "player_id", player.ID, "error", err)
				}

			case constants.ActionLeaveQueue:
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)
				if !exists {
					slog.Error("Player not found for connection on leave_queue")
					continue
				}

				slog.Debug("Player leaving game queue",
					"player_id", player.ID,
				)

				// removal can retry for a while, so it runs off the hub loop; the reply
				// waits for it, so "left" is only ever said once it is true.
				// FS-K2HKP §Requirements 7.
				go func(conn *websocket.Conn, player *types.Player, action string) {
					if err := h.sessionManager.RemovePlayerFromQueue(player); err != nil {
						slog.Error("failed to remove player from queue", "player_id", player.ID, "err", err)

						h.refuse(conn, action, "Could not leave the queue, please try again.")
						return
					}

					if err := h.sender.SendMessageToConn(conn, types.Message{
						Action: action,
						Payload: map[string]interface{}{
							"message":   "Successfully left the queue",
							"player_id": player.ID.String(),
						},
					}); err != nil {
						slog.Warn("Could not tell a member they left the queue", "player_id", player.ID, "error", err)
					}
				}(clientPackage.Conn, player, clientPackage.Message.Action)

			default:
				h.refuse(clientPackage.Conn, clientPackage.Message.Action, "Unknown action")
			}

		case matched := <-h.sessionManager.GetMatchedChan(ctx):
			// The matchmaker deals in ids only: its queue lives in Redis, which
			// holds no names or classes. The full record is this server's own
			matchedPlayers := h.resolveMatchedPlayers(matched)
			if len(matchedPlayers.LocalPlayers) == 0 {
				slog.Warn("Match had no players connected to this server, no run started")
				continue
			}

			slog.Info("Received matched players, creating game session...",
				"matched_players", matchedPlayers)
			session := h.sessionManager.CreateGameSession(matchedPlayers)
			playerIDs := make([]uuid.UUID, len(matchedPlayers.LocalPlayers))

			// broadcast to local players
			for i, player := range matchedPlayers.LocalPlayers {
				playerIDs[i] = player.ID
			}
			// game_found was this message under an older name, from when a run
			// was the only world anyone could enter. FS-29KSH §Requirements 15.
			if err := h.sender.BroadcastToPlayerList(playerIDs, worldEnteredMessage(session)); err != nil {
				slog.Warn("world_entered not delivered to every matched player", "session_id", session.ID, "error", err)
			}

			// only now that the run exists are the other pods told to send their
			// players over. Off the loop, so a slow redis never stalls it.
			// FS-K2HKP §Requirements 20.
			go h.announceHandoffs(ctx, session.ID, h.handoffsByPod(matched))

		case status := <-h.sessionManager.GetQueueStatusChan(ctx):
			fmt.Printf("Queue status update: %d/%d\n", status.Current, status.Total)
			playerIDs := make([]uuid.UUID, len(status.Players))
			for i, player := range status.Players {
				playerIDs[i] = player.ID
			}
			if err := h.sender.BroadcastToPlayerList(playerIDs,
				types.Message{
					Action: "queue_status",
					Payload: map[string]any{
						"current": status.Current,
						"total":   status.Total,
					},
				}); err != nil {
				// a snapshot is stale by the next tick anyway
				slog.Debug("queue_status not delivered to every queued player", "error", err)
			}

		// handoff takes match ready players that shouldn't connect to this pod to reconnect
		case handoff := <-h.sessionManager.GetHandoffChan(ctx):
			slog.Debug("handoff received", "handoff", handoff)
			h.sendWorldHandoff(handoff)
		}

	}
}

/**
* Splits a match by pod. A player on this pod and connected here is local, and
* resolves to this server's full record. A player on another pod is handed off,
* carrying the character they queued with. A player on this pod with no record
* here disconnected after being popped, and is dropped.
* FS-K2HKP §Requirements 19–20.
**/

func (h *messageHub) resolveMatchedPlayers(match matchmaker.MatchStart) *types.ResolvedMatchedPlayers {
	players := make([]*types.Player, 0)
	handoffPlayers := make([]*types.Player, 0)

	for _, matchedPlayer := range match.Players {
		// on another pod: seated once they reconnect here, built from the
		// character they queued with
		if matchedPlayer.Pod != h.podID {
			handoffPlayers = append(handoffPlayers, &types.Player{
				ID:        matchedPlayer.ID,
				Character: matchedPlayer.Character,
			})
			continue
		}

		player, exists := h.sessionManager.PlayerByID(matchedPlayer.ID)
		if !exists {
			// queued here but gone since, nobody to move in or hand off
			slog.Warn("Matched player on this pod is not connected, dropped from the run",
				"player_id", matchedPlayer.ID, "pod_id", h.podID)
			continue
		}

		players = append(players, player)
	}

	return &types.ResolvedMatchedPlayers{
		LocalPlayers:   players,
		HandoffPlayers: handoffPlayers,
	}
}

/**
* Groups a match's players on other pods by their pod, so each pod is told
* about its own players only. The host's own players are never in it.
**/
func (h *messageHub) handoffsByPod(match matchmaker.MatchStart) map[string][]matchmaker.MatchStartPlayer {
	byPod := make(map[string][]matchmaker.MatchStartPlayer)

	for _, player := range match.Players {
		if player.Pod == h.podID {
			continue
		}
		byPod[player.Pod] = append(byPod[player.Pod], player)
	}

	return byPod
}

/**
* Publishes one handoff step per other pod for a run this pod just created.
*
* A failed announce is logged and the next pod is still told: nothing is
* undone, the seats of a pod that never heard simply lapse after 15s.
* FS-K2HKP §Requirements 20, 25.
**/
func (h *messageHub) announceHandoffs(ctx context.Context, sessionID uuid.UUID, byPod map[string][]matchmaker.MatchStartPlayer) {
	for podID, players := range byPod {
		announceCtx, cancel := context.WithTimeout(ctx, handoffAnnounceTimeout)
		err := h.announcer.Announce(announceCtx, matchmaker.MatchStart{
			PodID:     podID,
			Step:      matchmaker.MatchStepHandoff,
			SessionID: sessionID,
			HostAddr:  h.podAddr,
			Players:   players,
		})
		cancel()

		if err != nil {
			slog.Warn("Could not announce handoff, its seats lapse",
				"session_id", sessionID, "pod_id", podID, "players", len(players), "err", err)
			continue
		}
	}
}

/**
* Tells each listed player connected here to reconnect to the run's host.
*
* A listed player not connected here is skipped by the sender; their seat
* lapses. The HUB world and the queue are left alone: the player leaves the HUB
* through the ordinary disconnect once their old socket closes.
* FS-K2HKP §Requirements 21, 23.
**/
func (h *messageHub) sendWorldHandoff(handoff matchmaker.MatchStart) {
	if handoff.HostAddr == "" || handoff.SessionID == uuid.Nil {
		slog.Error("handoff step without host addr or session id, dropped",
			"session_id", handoff.SessionID, "host_addr", handoff.HostAddr, "players", len(handoff.Players))
		return
	}

	playerIDs := make([]uuid.UUID, 0, len(handoff.Players))
	for _, player := range handoff.Players {
		playerIDs = append(playerIDs, player.ID)
	}

	err := h.sender.BroadcastToPlayerList(playerIDs, types.Message{
		Action: string(constants.ActionWorldHandoff),
		Payload: map[string]interface{}{
			"addr":       handoff.HostAddr,
			"session_id": handoff.SessionID.String(),
		},
	})
	if err != nil {
		slog.Debug("world_handoff not delivered to every listed player",
			"session_id", handoff.SessionID, "err", err)
	}
}

/**
* Checks if a player exists in a game and handles the responses to the client if they
* exist, or throws an error if they dont.
**/
func (h *messageHub) handlePlayerExistingGame(player *types.Player, clientPackage types.ClientPackage) error {
	if player.CurrentGameSessionId != uuid.Nil {
		slog.Warn("Attempting to find a game when player already in an old session. Attempting to resume.")

		// find the session with their current game sessionId
		session, exists := h.sessionManager.GetGameSession(player.CurrentGameSessionId)

		// Standing in the hub is not being in a game. This check predates the hub,
		// when a run was the only session anyone could be in. Once the hub existed,
		// every delver looked like they had a run in progress, and asking to descend
		// resumed them into the world they were already standing in instead of
		// queuing them.
		if exists && session.WorldType() == types.WorldTypeHub {
			slog.Debug("Player is in the hub, which is not a game to resume", "player_id", player.ID)
			return commonconstants.ErrGameDoesntExist
		}

		if !exists {
			slog.Error("When attempting to resume game for player detected that game session doesn't exist anymore", "playerId", player.ID, "sessionId", player.CurrentGameSessionId)
			// clear the non-existing session
			player.CurrentGameSessionId = uuid.Nil
			return commonconstants.ErrGameDoesntExist
		}

		// game found, tells frontend to resume, player should be already receiving game state at this point
		slog.Debug("Resuamble session found", "sessionId", session.ID)

		slog.Info("Player already in session, sending world_entered",
			"player_id", player.ID,
			"current_game_session_id", player.CurrentGameSessionId)

		if err := h.sender.SendMessageToConn(clientPackage.Conn, worldEnteredMessage(session)); err != nil {
			slog.Warn("Could not tell a member which run to resume", "player_id", player.ID, "error", err)
		}

		// return no error if player exists in a game
		return nil
	}

	slog.Debug("Player doesn't exist in any game.")
	return commonconstants.ErrGameDoesntExist
}
