package gameserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
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
	gameSessionCh  chan types.Message
	sessions       map[string]*game.Session
	mu             sync.RWMutex
	sender         *messaging.MessageSender
}

type SessionManager interface {
	CreateGameSession(players []*types.Player) *game.Session
	GetGameSession(id uuid.UUID) (*game.Session, bool)
	GetServerChan() chan types.ClientPackage
	AddPlayer(*types.Player) error
	GetPlayerFromConn(conn *websocket.Conn) (*types.Player, bool)
	EnterHub(ctx context.Context, conn *websocket.Conn, characterID string) (*game.Session, error)
	PlayerByID(playerID uuid.UUID) (*types.Player, bool)
	JoinHub(conn *websocket.Conn, character types.CharacterInPlay) (*game.Session, error)
	GetMatchedChan(ctx context.Context) chan []*types.Player
	GetQueueStatusChan(ctx context.Context) chan matchmaker.QueueStatus
}

// Routing failures. The world a message belongs to is server-held state, so
// every one of these means the server's own record is missing or stale — never
// that the client said something wrong.
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
)

// characterResolveTimeout bounds how long entry waits on character-service
// before refusing with a retryable reason.
const characterResolveTimeout = 3 * time.Second

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
// FS-29KSH §Requirements 15.
func worldEnteredMessage(session *game.Session) types.Message {
	return types.Message{
		Action: string(constants.ActionWorldEntered),
		Payload: map[string]interface{}{
			"session_id": session.ID.String(),
			"world_type": string(session.WorldType()),
		},
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

func NewMessageHub(sessionManager SessionManager, sender *messaging.MessageSender) *messageHub {
	return &messageHub{
		sessionManager: sessionManager,
		sessions:       make(map[string]*game.Session),
		sender:         sender,
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

					clientErr := "You are not in a game session"
					h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
						Action: clientPackage.Message.Action,
						Payload: map[string]interface{}{
							"message": clientErr,
						},
						Error: &clientErr,
					})
					continue
				}

				// propogate message to corresponding game
				session.MessageCh <- clientPackage
				continue
			}

			// --- MENU RELATED ACTIONS ---
			// These actions will be actions for before game initialization happens.
			switch messageAction {

			// NOTE: a player who has picked a character asks to enter the hub
			case constants.ActionEnterHub:
				// The request names the character by id; who it is comes from
				// character-service, never the payload. FS-BDA7X §Requirements 5.
				go h.enterHub(clientPackage)

			// NOTE: queues a player for a game
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

					clientErr := "Enter the hub with a character first."
					h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
						Action:  clientPackage.Message.Action,
						Payload: map[string]interface{}{"message": clientErr},
						Error:   &clientErr,
					})
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

				// -- queue up player --
				err = h.sessionManager.AddPlayer(player)
				if err != nil {
					queueErr := err.Error()
					message := "Error occured when attempting to queue player"

					if errors.Is(err, game.ErrPlayerAlreadyInQueue) {
						message = "Player attempted to queue twice."
						// TODO: send error
						continue
					}

					h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
						Action: clientPackage.Message.Action,
						Payload: map[string]interface{}{
							"message":   message,
							"player_id": player.ID.String(),
							"username":  player.Username,
						},
						Error: &queueErr,
					})
					continue
				}

				slog.Info("Player added to matchmaking queue", "player username", player.Username)

				h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
					Action: clientPackage.Message.Action,
					Payload: map[string]interface{}{
						"message":   "Successfully joined matchmaking queue",
						"player_id": player.ID.String(),
						"username":  player.Username,
					},
				})

			case constants.ActionLeaveQueue:
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)
				if !exists {
					slog.Error("Player not found for connection on leave_queue")
					continue
				}

				slog.Debug("Player leaving game queue",
					"player_id", player.ID,
				)

				h.sender.SendMessageToPlayer(player.ID, types.Message{
					Action: clientPackage.Message.Action,
					Payload: map[string]interface{}{
						"message":   "Successfully left the queue",
						"player_id": player.ID.String(),
					},
				})

			default:
				err := "Unknown action"
				h.sender.SendMessageToConn(
					clientPackage.Conn, types.Message{
						Action: clientPackage.Message.Action,
						Payload: map[string]interface{}{
							"message": err,
						},
						Error: &err,
					},
				)
			}

		case matched := <-h.sessionManager.GetMatchedChan(ctx):
			// The matchmaker deals in ids only: its queue lives in Redis, which
			// holds no names or classes. The full record is this server's own.
			matchedPlayers := h.resolveMatchedPlayers(matched)
			if len(matchedPlayers) == 0 {
				slog.Warn("Match had no players connected to this server, no run started", "matched", len(matched))
				continue
			}

			slog.Info("")
			slog.Info("Received matched players, creating game session...",
				"matched_players", matchedPlayers)
			session := h.sessionManager.CreateGameSession(matchedPlayers)
			playerIDs := make([]uuid.UUID, len(matchedPlayers))
			for i, player := range matchedPlayers {
				playerIDs[i] = player.ID
			}
			// game_found was this message under an older name, from when a run
			// was the only world anyone could enter. FS-29KSH §Requirements 15.
			h.sender.BroadcastToPlayerList(playerIDs, worldEnteredMessage(session))

		case status := <-h.sessionManager.GetQueueStatusChan(ctx):
			fmt.Printf("Queue status update: %d/%d\n", status.Current, status.Total)
			playerIDs := make([]uuid.UUID, len(status.Players))
			for i, player := range status.Players {
				playerIDs[i] = player.ID
			}
			h.sender.BroadcastToPlayerList(playerIDs,
				types.Message{
					Action: "queue_status",
					Payload: map[string]any{
						"current": status.Current,
						"total":   status.Total,
					},
				})
		}
	}
}

/**
* Turns a match, which carries only player ids, into this server's full player
* records, the ones holding the name and class a run is built from.
*
* A matched player with no record here is dropped: they disconnected after
* being popped, or are connected to another replica. Moving those players
* across replicas is the handoff's job (FS-K2HKP slice 3), not this lookup's.
**/
func (h *messageHub) resolveMatchedPlayers(matched []*types.Player) []*types.Player {
	players := make([]*types.Player, 0, len(matched))

	for _, m := range matched {
		player, exists := h.sessionManager.PlayerByID(m.ID)
		if !exists {
			slog.Warn("Matched player not connected to this server, left out of the run", "player_id", m.ID)
			continue
		}

		players = append(players, player)
	}

	return players
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
		// when the only session anyone could be in was a run, so every delver now
		// looked like they had one in progress — and asking to descend resumed them
		// into the world they were already standing in instead of queuing them.
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

		h.sender.SendMessageToConn(clientPackage.Conn, worldEnteredMessage(session))

		// return no error if player exists in a game
		return nil
	}

	slog.Debug("Player doesn't exist in any game.")
	return commonconstants.ErrGameDoesntExist
}
