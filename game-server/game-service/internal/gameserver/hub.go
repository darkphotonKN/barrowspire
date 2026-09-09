package gameserver

import (
	"errors"
	"fmt"
	"log/slog"
	"sync"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/queue"
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
	JoinHub(conn *websocket.Conn, character types.Character) (*game.Session, error)
	GetMatchedChan() chan []*types.Player
	GetQueueStatusChan() chan queue.QueueStatus
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

// characterFromPayload reads the character a client is entering with, falling
// back the same way find_game does when the class is missing or unknown.
func characterFromPayload(payload map[string]interface{}) types.Character {
	class, _ := payload["class"].(string)
	if class == "" {
		class, _ = payload["className"].(string)
	}
	if _, known := game.Classes[class]; !known {
		class = "mage"
	}

	name, _ := payload["characterName"].(string)
	if name == "" {
		name, _ = payload["username"].(string)
	}

	return types.Character{Class: class, Name: name}
}

// worldEnteredMessage tells a client which world it is now in. Every transition
// uses this one message, so the client has a single place to switch scenes.
// FS-0008 §Requirements 15.
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
// a client cannot address a world it is not in (FS-0008 §Requirements 16).
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
func (h *messageHub) Run() {
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
					// (FS-0008 §Requirements 16).
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
				// The chosen character comes with the request, the same way it
				// does for find_game: the server has no memory of a selection
				// made in the menu.
				hub, err := h.sessionManager.JoinHub(
					clientPackage.Conn,
					characterFromPayload(clientPackage.Message.Payload),
				)

				if err != nil {
					slog.Warn("Could not place player in the hub", "error", err)

					clientErr := "Could not enter"
					h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
						Action:  clientPackage.Message.Action,
						Payload: map[string]interface{}{"message": clientErr},
						Error:   &clientErr,
					})
					continue
				}

				h.sender.SendMessageToConn(clientPackage.Conn, worldEnteredMessage(hub))

			// NOTE: queues a player for a game
			case constants.ActionFindGame:
				slog.Debug("ActionFindGame")
				player, exists := h.sessionManager.GetPlayerFromConn(clientPackage.Conn)

				// player doesn't exist at all in the server, skip them
				if !exists {
					slog.Debug("Player doesn't exist in session.")
					continue
				}

				// Get and validate class selection from payload
				classVal, _ := clientPackage.Message.Payload["class"].(string)
				if classVal == "" {
					classVal, _ = clientPackage.Message.Payload["className"].(string)
				}
				if _, ok := game.Classes[classVal]; !ok {
					classVal = "mage"
				}
				player.Class = classVal

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

		case matchedPlayers := <-h.sessionManager.GetMatchedChan():
			fmt.Printf("Received matched players, creating game session...\n")
			fmt.Println(matchedPlayers)
			session := h.sessionManager.CreateGameSession(matchedPlayers)
			playerIDs := make([]uuid.UUID, len(matchedPlayers))
			for i, player := range matchedPlayers {
				playerIDs[i] = player.ID
			}
			// game_found was this message under an older name, from when a run
			// was the only world anyone could enter. FS-0008 §Requirements 15.
			h.sender.BroadcastToPlayerList(playerIDs, worldEnteredMessage(session))

		case status := <-h.sessionManager.GetQueueStatusChan():
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
* Checks if a player exists in a game and handles the responses to the client if they
* exist, or throws an error if they dont.
**/
func (h *messageHub) handlePlayerExistingGame(player *types.Player, clientPackage types.ClientPackage) error {
	if player.CurrentGameSessionId != uuid.Nil {
		slog.Warn("Attempting to find a game when player already in an old session. Attempting to resume.")

		// find the session with their current game sessionId
		session, exists := h.sessionManager.GetGameSession(player.CurrentGameSessionId)

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
