package gameserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"

	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	grpcauth "github.com/darkphotonKN/barrowspire-server/game-service/grpc/auth"
	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Represents the core game server, intializing the goroutines that
* talk to each other and coordinate all game sessions and websocket
* connections.
**/

type Server struct {
	upgrader   websocket.Upgrader
	serverChan chan types.ClientPackage
	ctx        context.Context

	// NOTE: primary use for client messages to the message hub
	// [player connection] to dynamic client payload
	msgChan map[*websocket.Conn]chan interface{}

	// active sessions
	// [sessionId] to active sessions
	sessions map[uuid.UUID]*game.Session

	// the hub world. One per process, built at startup, outlives every run.
	hubSessionID uuid.UUID

	// for messages the server itself originates, such as telling a returning
	// player which world they are now in
	sender *messaging.MessageSender

	// online players
	// [playerId] to player
	players map[uuid.UUID]*types.Player

	// websocket conn to player mapping
	// [active connections] to player
	connToPlayer map[*websocket.Conn]*types.Player

	mu sync.RWMutex

	queue QueueManager

	// auth client for gRPC calls
	authClient grpcauth.AuthClient

	// message broker communication channel
	eventEmitter game.EventEmitter
	// item client for gRPC
	itemsClient grpcitems.ItemsClient
	// resolves the character a member enters with
	characters CharacterReader
}

// CharacterReader reads one of a member's characters from character-service,
// scoped by member: another member's, a deleted, and an unknown character are
// all types.ErrCharacterNotFound. FS-BDA7X §Requirements 5.
type CharacterReader interface {
	GetCharacter(ctx context.Context, memberID, characterID uuid.UUID) (types.CharacterInPlay, error)
}

type MessageSender interface {
	BroadcastToPlayerList(players []*types.Player, msg types.Message) error
}

// QueueManager is the subset of queue operations the gameserver consumes.
type QueueManager interface {
	Start()
	PlayerJoinQueue(ctx context.Context, player *types.Player) error
	PlayerRemoveQueue(ctx context.Context, player *types.Player) error
	GetMatchedChan() chan []*types.Player
	GetQueueStatusChan() chan matchmaker.QueueStatus
}

func NewServer(ctx context.Context, authClient grpcauth.AuthClient, queueService QueueManager, eventEmitter game.EventEmitter, itemsClient grpcitems.ItemsClient, characters CharacterReader) *Server {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			// TODO: Allow all connections by default for simplicity; can add more logic here
			return true
		},
	}

	server := &Server{
		ctx:      ctx,
		upgrader: upgrader,

		serverChan: make(chan types.ClientPackage, 10),
		msgChan:    make(map[*websocket.Conn]chan interface{}, constants.MaxMsgChanBuffer),

		sessions:     make(map[uuid.UUID]*game.Session, 10),
		players:      make(map[uuid.UUID]*types.Player, 10),
		connToPlayer: make(map[*websocket.Conn]*types.Player, 10),

		queue:        queueService,
		authClient:   authClient,
		eventEmitter: eventEmitter,
		itemsClient:  itemsClient,
		characters:   characters,
	}

	// initialize message sender
	newSender := messaging.NewMessageSender(server)
	server.sender = newSender

	server.queue.Start()

	// initialize message hub
	messageHub := NewMessageHub(server, newSender)
	go messageHub.Run()

	server.createHubSession()

	return server
}

/**
* Builds the one hub world. It is created before anyone connects and lives for
* the whole process, unlike a run, which is built per match and torn down
*
* Note what is deliberately NOT called: InitialSystems(), which creates the
* MatchProgress entity. RulesSystem ends a session once every delver on it has
* resolved, but it returns early when no MatchProgress exists. Skipping that
* call is what makes the hub immune, with no change to the system itself.
* FS-29KSH §Requirements 1
**/
func (s *Server) createHubSession() *game.Session {
	fmt.Printf("\n\nWorld Hub SESSION INITIALIZED\n\n\n")
	entityManager := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(entityManager)

	hub := game.NewSession(s, messaging.NewMessageSender(s), stateSerializer, entityManager, s.eventEmitter, s.itemsClient, game.HubBounds())

	hub.InitialHubMapObjects()

	s.mu.Lock()
	defer s.mu.Unlock()

	s.sessions[hub.ID] = hub
	s.hubSessionID = hub.ID

	slog.Info("Hub world initiated", "session_id", hub.ID)

	return hub
}

/**
* Enters the hub as one of the member's characters.
*
* The character is resolved from character-service, scoped by the connection's
* member, and nothing else about it is taken from the client. A missing id, one
* that is not the member's, and a service that cannot answer all refuse entry:
* the member is never seated as a guessed or default character.
* FS-BDA7X §Requirements 5–6.
**/
func (s *Server) EnterHub(ctx context.Context, conn *websocket.Conn, characterID string) (*game.Session, error) {
	player, exists := s.GetPlayerFromConn(conn)
	if !exists {
		return nil, errPlayerNotFound
	}

	if characterID == "" {
		return nil, errNoCharacter
	}

	id, err := uuid.Parse(characterID)
	if err != nil {
		return nil, fmt.Errorf("character id %q: %w", characterID, types.ErrCharacterNotFound)
	}

	character, err := s.characters.GetCharacter(ctx, player.ID, id)
	if errors.Is(err, types.ErrCharacterNotFound) {
		return nil, err
	}
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errCharactersUnavailable, err)
	}

	return s.JoinHub(conn, character)
}

/**
* Places a connected player into the hub world as a resolved character, and
* records both where they are and the character they are playing.
*
* Note the two writes. connToPlayer holds a copy of the player, MapConnToPlayer
* takes it by value, so it is a different object from the one in s.players, and
* both have to be told. CreateGameSession does the same thing for the same reason.
**/
func (s *Server) JoinHub(conn *websocket.Conn, character types.CharacterInPlay) (*game.Session, error) {
	hub, exists := s.HubSession()
	if !exists {
		return nil, errHubMissing
	}

	player, exists := s.GetPlayerFromConn(conn)
	if !exists {
		return nil, errPlayerNotFound
	}

	// A run keeps the character it was entered with: entering the HUB as
	// another one mid-run would seat a second body and repoint the record away
	// from the run still holding the first (FS-BDA7X §Requirements 7)
	if current, inWorld := s.GetGameSession(player.CurrentGameSessionId); inWorld &&
		current.WorldType() == types.WorldTypeRun && current.HasPlayer(player.ID) &&
		player.Character.ID != character.ID {
		return nil, fmt.Errorf("enter hub from run %s: %w", current.ID, game.ErrCharacterSwitchMidRun)
	}

	// The world decides whether it has room, under its own lock. Counting from
	// out here would mean holding the server's lock over data the session owns,
	// which serialises JoinHub against itself and nothing else, so the next path
	// into the hub would sidestep the cap without noticing.
	if err := hub.Admit(player.ID, character); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	connected := constants.Connected

	for _, record := range s.everyRecordOf(player) {
		record.Character = character
		record.CurrentGameSessionId = hub.ID
		record.ConnectState = &connected
	}

	return hub, nil
}

/**
* Records which world a player is in, across every copy of them.
*
* MapConnToPlayer stores the player by value, so connToPlayer holds a different
* object from players — and connToPlayer is the one routing reads. Writing only
* one leaves messages delivered to a world the player is not in.
**/
func (s *Server) setCurrentWorld(player *types.Player, worldID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()

	connected := constants.Connected

	for _, record := range s.everyRecordOf(player) {
		record.CurrentGameSessionId = worldID
		record.ConnectState = &connected
	}
}

/**
* Collects every copy of a player the server holds.
*
* MapConnToPlayer stores the player by value, so connToPlayer holds a different
* object from players — and connToPlayer is the one routing reads. Writing to one
* and not the others leaves messages delivered to a world the player is not in.
*
* Callers must already hold the write lock.
**/
func (s *Server) everyRecordOf(player *types.Player) []*types.Player {
	records := []*types.Player{player}

	if stored, exists := s.players[player.ID]; exists && stored != player {
		records = append(records, stored)
	}

	for _, connPlayer := range s.connToPlayer {
		if connPlayer.ID == player.ID && connPlayer != player {
			records = append(records, connPlayer)
		}
	}

	return records
}

/**
* playerByID finds a connected player.
**/
func (s *Server) playerByID(playerID uuid.UUID) (*types.Player, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	player, exists := s.players[playerID]

	return player, exists
}

/**
* Brings a finished run's players home.
*
* Called as the run resolves, before its world is torn down: they were in a
* world that is about to stop existing, and leaving them pointed at it would
* strand them somewhere unroutable. Escape and death land in the same place —
* the hub's fixed spawn — because arriving is arriving.
**/
func (s *Server) ReturnPlayersToHub(runID uuid.UUID) {
	hub, exists := s.HubSession()
	if !exists {
		slog.Error("A run ended with no hub to return to", "run_id", runID)
		return
	}

	run, exists := s.GetGameSession(runID)
	if !exists {
		return
	}

	for _, playerID := range run.GetPlayerIDs() {
		player, exists := s.playerByID(playerID)
		if !exists {
			continue
		}

		run.RemovePlayer(playerID.String())
		hub.AddPlayer(player.ID, player.Character)
		s.setCurrentWorld(player, hub.ID)

		if err := s.sender.SendMessageToPlayer(playerID, worldEnteredMessage(hub)); err != nil {
			slog.Warn("Could not tell a returning player they are home",
				"player_id", playerID, "error", err)
		}
	}
}

/**
* Keeps what a finished run did to each member's character in play.
*
* Called as the run resolves, before its players are sent home, so the HUB
* seats them at the run's resulting level without waiting for character-service
* to consume the run's end (FS-BDA7X §Requirements 24). A seated member takes
* where their body finished; a member removed before the end takes what they
* earned on top of the record, never below the level they were seated at. A
* record now playing another character, or a member no longer here, is left
* alone: the persisted grant still reaches character-service.
**/
func (s *Server) ApplyRunProgress(progress []types.RunProgress) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, p := range progress {
		player, exists := s.players[p.MemberID]
		if !exists {
			continue
		}

		for _, record := range s.everyRecordOf(player) {
			if record.Character.ID != p.CharacterID {
				continue
			}

			if p.Seated {
				record.Character.Level = p.Level
				record.Character.Experience = p.Experience
				continue
			}

			record.Character.Experience += p.Gained
			record.Character.Level = max(record.Character.Level, int(progression.LevelFor(record.Character.Experience)))
		}
	}
}

/**
* The hub world, which every connected player returns to between runs.
**/
func (s *Server) HubSession() (*game.Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	hub, exists := s.sessions[s.hubSessionID]

	return hub, exists
}

/**
* exposes server chan for communication between server and client
**/
func (s *Server) GetServerChan() chan types.ClientPackage {
	return s.serverChan
}

/**
* maps a connected client to its player information
**/
func (s *Server) MapConnToPlayer(conn *websocket.Conn, player types.Player) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// check if there's an old connection with same player ID, if so clean it up
	for oldConn, existingPlayer := range s.connToPlayer {
		if existingPlayer.ID == player.ID && oldConn != conn {
			slog.Info("Player reconnected, cleaning up old connection",
				"player_id", player.ID,
				"player_username", player.Username,
			)
			// close old msgChan
			if ch, exists := s.msgChan[oldConn]; exists {
				close(ch)
				delete(s.msgChan, oldConn)
			}
			// remove old conn to player mapping
			delete(s.connToPlayer, oldConn)
			break
		}
	}

	s.connToPlayer[conn] = &player
}

/**
* grabs player information from connected client's websocket connection
* information.
**/

func (s *Server) GetPlayerFromConn(conn *websocket.Conn) (*types.Player, bool) {
	// Read lock: this only looks the connection up. It sits on the routing path
	// for every inbound game action, and an exclusive lock there would block the
	// per-tick broadcast deliveries that read s.msgChan under RLock.
	s.mu.RLock()
	defer s.mu.RUnlock()

	player, exists := s.connToPlayer[conn]

	return player, exists
}

/**
* allows the creation of a new game session.
**/
func (s *Server) CreateGameSession(players []*types.Player) *game.Session {
	// create entity manager first so it can be shared
	entityManager := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(entityManager)

	// create session with message sender
	newGameSession := game.NewSession(s, messaging.NewMessageSender(s), stateSerializer, entityManager, s.eventEmitter, s.itemsClient, game.RunBounds())

	newGameSession.InitialSystems()

	// Leaving the hub is part of arriving in the run: a player occupies one world
	// at a time, and the hub is never torn down, so anything left behind there
	// stays visible and broadcasting (FS-29KSH §Requirements 23).
	if hub, exists := s.HubSession(); exists {
		for _, player := range players {
			hub.RemovePlayer(player.ID.String())
		}
	}

	// The roster is placed before the first floor is built: the floor's monsters
	// are levelled to the party and spawned clear of every delver, so both must
	// already be known (FS-77AB6 §Requirements 22). The session is not yet
	// registered, so nothing routes to it while it is being built.
	for _, player := range players {
		newGameSession.AddPlayer(player.ID, player.Character)
	}
	newGameSession.InitialMapObjects()

	s.mu.Lock()
	defer s.mu.Unlock()

	connected := constants.Connected

	for _, player := range players {
		for _, record := range s.everyRecordOf(player) {
			record.CurrentGameSessionId = newGameSession.ID
			record.ConnectState = &connected
		}
	}

	s.sessions[newGameSession.ID] = newGameSession

	// NOTE: keep this info level, important to save meta data DO NOT REMOVE
	slog.Info("New game session initiated", "session_id", newGameSession.ID, "players", len(players))

	return newGameSession
}

func (s *Server) CloseSession(sessionID uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, exists := s.sessions[sessionID]

	if !exists {
		slog.Error("Attempted to remove a session that didnt exist",
			"session_id", sessionID,
		)
		return fmt.Errorf("Attempted to remove a session that didnt exist")
	}

	// delete session
	delete(s.sessions, sessionID)
	return nil
}

/**
* allows the retrieval of an existing session.
**/
func (s *Server) GetGameSession(id uuid.UUID) (*game.Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, exists := s.sessions[id]
	return session, exists
}

/**
* add player to queue (delegates to QueueSystem)
**/
func (s *Server) AddPlayer(player *types.Player) error {
	err := s.queue.PlayerJoinQueue(s.ctx, player)

	if err != nil {
		return err
	}

	return nil
}

/**
* remove player from queue (delegates to QueueSystem)
**/
func (s *Server) RemovePlayerFromQueue(player *types.Player) {
	s.queue.PlayerRemoveQueue(s.ctx, player)
}

/**
* get matched channel for listening to matched players
**/
func (s *Server) GetMatchedChan() chan []*types.Player {
	return s.queue.GetMatchedChan()
}

/**
* get queue status channel for listening to queue updates
**/
func (s *Server) GetQueueStatusChan() chan matchmaker.QueueStatus {
	return s.queue.GetQueueStatusChan()
}

/**
* get conn from player ID
**/
func (s *Server) GetConnFromPlayer(playerID uuid.UUID) (*websocket.Conn, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for conn, player := range s.connToPlayer {
		if player.ID == playerID {
			return conn, true
		}
	}
	return nil, false
}

/**
* --- Internal Message Sending (used by MessageSender) ---
**/

/**
* PushMessageToChannelQueue
* Allows the server to sequentially pipe multiple messages into a single channel for sequential writes back to the client due to gorilla websockets constraint of max one concurrent writer with conn.
**/
func (s *Server) PushMessageToChannelQueue(playerID uuid.UUID, msg interface{}) error {
	conn, exists := s.GetConnFromPlayer(playerID)
	if !exists {
		return fmt.Errorf("player %s not found", playerID)
	}

	s.mu.RLock()
	ch, ok := s.msgChan[conn]
	s.mu.RUnlock()

	if !ok {
		return fmt.Errorf("message channel not found for player %s", playerID)
	}

	// non-blocking send to prevent slow clients from blocking
	select {
	case ch <- msg:
		return nil
	default:
		return fmt.Errorf("message channel full for player %s", playerID)
	}
}

func (s *Server) PushMessageToConn(conn *websocket.Conn, msg interface{}) error {
	typeMsg, ok := msg.(types.Message)
	if !ok {
		return fmt.Errorf("invalid message type")
	}
	if conn == nil {
		slog.Warn("nil connection, skipping send")
		return nil
	}
	s.mu.RLock()
	ch, ok := s.msgChan[conn]
	s.mu.RUnlock()

	if !ok {
		slog.Warn("message channel not found for connection")
		return nil
	}

	select {
	case ch <- typeMsg:
		return nil
	default:
		return fmt.Errorf("message channel full for connection")
	}
}

/**
* returns the auth client for gRPC calls
**/
func (s *Server) GetAuthClient() grpcauth.AuthClient {
	return s.authClient
}
