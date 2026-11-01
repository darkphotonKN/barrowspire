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
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
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

	// this pod's channel of each field, by field, built at startup beside the
	// hub and never shut down (FS-X2F2H §Requirements 4, 5)
	fields map[game.FieldID]uuid.UUID
	// where every ended field visit goes, exactly once (FS-X2F2H §F)
	visitSettler VisitSettler
	// members with a field entry in flight, under mu: one entry at a time per
	// member, so a second never checks out over the first's live gear
	// (FS-18Z5F §C R13, R14)
	fieldEntries map[uuid.UUID]struct{}

	// for messages the server itself originates, such as telling a returning
	// player which world they are now in
	sender *messaging.MessageSender

	// online players
	// [playerId] to player
	players map[uuid.UUID]*types.Player

	// websocket conn to player mapping
	// [active connections] to player
	connToPlayer map[*websocket.Conn]*types.Player

	// the reconnect grace each dropped member is held under, by member, and
	// the last hold handed out
	graceHolds map[uuid.UUID]graceHold
	// resolved run members whose reconnect grace ran out: kept, body and
	// record, until their run ends and settles them (FS-QPDKN R18, R19)
	awaitingSettlement map[uuid.UUID]struct{}
	lastGraceHold      graceHold

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
	Start(ctx context.Context)
	PlayerJoinQueue(ctx context.Context, player *types.Player) error
	PlayerRemoveQueue(ctx context.Context, player *types.Player) error
	GetMatchedChan(ctx context.Context) chan matchmaker.MatchStart
	GetQueueStatusChan(ctx context.Context) chan matchmaker.QueueStatus
	GetHandoffChan(ctx context.Context) chan matchmaker.MatchStart
	QueuedCharacter(ctx context.Context, playerID uuid.UUID) (characterID uuid.UUID, queued bool, err error)
}

// HandoffAnnouncer publishes a match-start step on another pod's channel. The
// host uses it to tell each other involved pod which of its players to send
// over. FS-K2HKP §Requirements 20.
type HandoffAnnouncer interface {
	Announce(ctx context.Context, payload matchmaker.MatchStart) error
}

/**
* podID and podAddr are this replica's identity: a match step names its pods by
* id, and podAddr is where a handed-off player reconnects to reach this pod.
*
* The pod's fields are laid out first, before anything starts: a field that
* cannot be laid out fails construction with the wrapped error and the pod does
* not start, rather than serving a broken field (FS-3QHQZ Edge States
* "Generator boxed in").
**/
func NewServer(ctx context.Context, authClient grpcauth.AuthClient, queueService QueueManager, eventEmitter game.EventEmitter, itemsClient grpcitems.ItemsClient, characters CharacterReader, podID, podAddr string, announcer HandoffAnnouncer, opts ...Option) (*Server, error) {
	boot := newBootOptions(opts...)
	fields, err := layOutFields(boot)
	if err != nil {
		return nil, fmt.Errorf("new server: %w", err)
	}

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

		sessions:           make(map[uuid.UUID]*game.Session, 10),
		fields:             make(map[game.FieldID]uuid.UUID),
		visitSettler:       boot.visitSettler,
		fieldEntries:       make(map[uuid.UUID]struct{}),
		players:            make(map[uuid.UUID]*types.Player, 10),
		connToPlayer:       make(map[*websocket.Conn]*types.Player, 10),
		graceHolds:         make(map[uuid.UUID]graceHold),
		awaitingSettlement: make(map[uuid.UUID]struct{}),

		queue:        queueService,
		authClient:   authClient,
		eventEmitter: eventEmitter,
		itemsClient:  itemsClient,
		characters:   characters,
	}

	// initialize message sender
	newSender := messaging.NewMessageSender(server)
	server.sender = newSender

	server.queue.Start(ctx)

	// initialize message hub
	chat := newChatRelay(server, newSender, podID, boot.chatNow, boot.chatNewID, boot.chatBus)
	messageHub := NewMessageHub(server, newSender, podID, podAddr, announcer, chat)
	go messageHub.Run(ctx)
	chat.start(ctx)

	server.createHubSession()
	server.createFieldSessions(fields)

	return server, nil
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

	// The queue entry carries the character the run is built from, so a queued
	// player keeps it until they leave the queue. An unreadable queue lets them
	// in: queueing needs it too, so nobody can have joined while it is down.
	// FS-K2HKP §Requirements 7a.
	queuedID, queued, err := s.queue.QueuedCharacter(ctx, player.ID)
	if err != nil {
		slog.Warn("Could not read queue entry on enter_hub, letting them in", "player_id", player.ID, "error", err)
	}
	if queued && queuedID != id {
		return nil, fmt.Errorf("queued as %s, entering as %s: %w", queuedID, id, errCharacterSwitchWhileQueued)
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
		current.WorldType() == types.WorldTypeRun && current.HasPlayer(player.ID) {
		if player.Character.ID != character.ID {
			return nil, fmt.Errorf("enter hub from run %s: %w", current.ID, game.ErrCharacterSwitchMidRun)
		}
		// The same character, asking in from the menu while their body is still
		// delving: the run is their world, so it is the one announced. Seating
		// them in the hub as well would give one member two worlds broadcasting
		// to one socket (reported 2026-10-29).
		return current, nil
	}

	// From a field: the visit settles and the player is seated home at the
	// field's gate as the requested character, past the cap, since coming home
	// is not arriving. A field is never resumed (FS-X2F2H §Requirements 19).
	if current, inWorld := s.GetGameSession(player.CurrentGameSessionId); inWorld &&
		current.WorldType() == types.WorldTypeField {
		s.endVisit(s.ctx, current, player.ID)
		if !hub.HasPlayer(player.ID) {
			place, _ := current.FieldPlace()
			x, y, ok := hub.GateArrival(place.HubGate)
			if !ok {
				x, y = constants.HubSpawnX, constants.HubSpawnY
			}
			hub.AddPlayerAt(player.ID, character, s.tokenOf(player), x, y)
		}
	}

	// The world decides whether it has room, under its own lock. Counting from
	// out here would mean holding the server's lock over data the session owns,
	// which serialises JoinHub against itself and nothing else, so the next path
	// into the hub would sidestep the cap without noticing.
	if err := hub.Admit(player.ID, character, s.tokenOf(player)); err != nil {
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
* object from players, and connToPlayer is the one routing reads. Writing only
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
* object from players, and connToPlayer is the one routing reads. Writing to one
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
* Finds or creates the record of a member arriving on a connection, holding the
* bearer token they connected with.
*
* A member already on record is reconnecting: the record is kept (it knows the
* world they are in and the character they play) and every copy of it takes the
* new token, so the next world they are seated in loads their gear with a token
* that is current as of this connect. Reports whether it was a reconnect.
*
* Returns a copy of the record taken under the lock, not the record itself: the
* worlds the member is in keep writing the record under that lock, so the
* caller reads, logs and maps the copy rather than racing them.
**/
func (s *Server) connectPlayer(memberID uuid.UUID, username string, token types.BearerToken) (types.Player, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	connected := constants.Connected

	if player, exists := s.players[memberID]; exists {
		// back before their run ended: no longer kept only for its settlement
		delete(s.awaitingSettlement, memberID)
		for _, record := range s.everyRecordOf(player) {
			record.ConnectState = &connected
			// may have changed name
			record.Username = username
			record.Token = token
		}
		return *player, true
	}

	player := &types.Player{
		ID:                   memberID,
		Username:             username,
		CurrentGameSessionId: uuid.Nil,
		ConnectState:         &connected,
		Token:                token,
	}
	s.players[memberID] = player

	return *player, false
}

/**
* The bearer token a player's worn gear is loaded with, read under the lock a
* reconnect refreshes it under.
**/
func (s *Server) tokenOf(player *types.Player) types.BearerToken {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return player.Token
}

/**
* PlayerByID finds a connected player.
**/
func (s *Server) PlayerByID(playerID uuid.UUID) (*types.Player, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	player, exists := s.players[playerID]

	return player, exists
}

/**
* Brings a finished run's players home.
*
* Called as the run resolves, before its world is torn down. Its players are in
* a world about to stop existing, and leaving them pointed at it would strand
* them somewhere unroutable. Escape and death land in the same place, the hub's
* fixed spawn, because arriving is arriving.
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
		player, exists := s.PlayerByID(playerID)
		if !exists {
			continue
		}
		// a member who left early, or has since entered another world, is not
		// this run's to move: their body here is for settlement only (FS-QPDKN R22)
		if world, _ := s.currentWorldOf(playerID); world != runID {
			continue
		}
		// a resolved member kept past their grace is settled by this end (the
		// snapshot was taken before this) and goes off record; nobody seats a
		// body in the hub for a member who is not here (FS-QPDKN R18, R19)
		if s.forgetIfAwaitingSettlement(playerID) {
			continue
		}

		run.RemovePlayer(playerID.String())
		hub.AddPlayer(player.ID, player.Character, s.tokenOf(player))
		s.setCurrentWorld(player, hub.ID)

		if err := s.sender.SendMessageToPlayer(playerID, worldEnteredMessage(hub)); err != nil {
			slog.Warn("Could not tell a returning player they are home",
				"player_id", playerID, "error", err)
		}
	}
}

// forgetIfAwaitingSettlement ends the stay of a member kept only for their
// run's settlement, now that the run has settled them. Reports whether they
// were such a member; one who came back meanwhile is not.
func (s *Server) forgetIfAwaitingSettlement(playerID uuid.UUID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, kept := s.awaitingSettlement[playerID]; !kept {
		return false
	}
	delete(s.awaitingSettlement, playerID)
	delete(s.players, playerID)
	slog.Info("Kept delver settled with their run, off record", "player_id", playerID)
	return true
}

// currentWorldOf is the world a member's record names, read under the lock
// the worlds write it under.
func (s *Server) currentWorldOf(playerID uuid.UUID) (uuid.UUID, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	player, exists := s.players[playerID]
	if !exists {
		return uuid.Nil, false
	}
	return player.CurrentGameSessionId, true
}

/**
* Lets a dead delver leave the run their record names, for the hub, before the
* run ends (FS-QPDKN §Requirements 13, 14). The run keeps their body and settles
* them at its end; the hub seats them now. Refused, with the run's reason, for
* anyone the run will not let go, and for a member whose record names no run.
**/
func (s *Server) LeaveRun(player *types.Player) (*game.Session, error) {
	hub, exists := s.HubSession()
	if !exists {
		return nil, errHubMissing
	}

	world, _ := s.currentWorldOf(player.ID)
	run, exists := s.GetGameSession(world)
	if !exists || run.WorldType() != types.WorldTypeRun {
		return nil, fmt.Errorf("leave run: %w", errPlayerNotInSession)
	}

	if err := run.Depart(player.ID); err != nil {
		return nil, fmt.Errorf("leave run %s: %w", run.ID, err)
	}

	hub.AddPlayer(player.ID, player.Character, s.tokenOf(player))
	s.setCurrentWorld(player, hub.ID)

	return hub, nil
}

// Why a member may not leave the hub right now.
var (
	errLeaveHubQueued  = errors.New("queued members leave the queue first")
	errLeaveHubInRun   = errors.New("member is in a run")
	errLeaveHubNotHere = errors.New("member is not in the hub")
)

/**
* Lets a hub member leave for the roster (FS-G4VMQ §Requirements 23, 24): their
* body goes, the hub slot is freed, and their record names no world while
* keeping its token and character, so a later enter_hub seats them again
* through Admit and a reconnect meanwhile is announced nothing. Refused for a
* queued member (the queue entry holds their character, FS-K2HKP R7a), for one
* in a run, and for one in no world. An unreadable queue is not a queue they
* are in, as enter_hub already treats it.
**/
func (s *Server) LeaveHub(ctx context.Context, player *types.Player) error {
	hub, exists := s.HubSession()
	if !exists {
		return errHubMissing
	}

	// from a field: the visit settles and they leave for the roster from there
	// (FS-X2F2H §Requirements 18)
	if s.leaveFieldForRoster(ctx, player) {
		return nil
	}

	world, _ := s.currentWorldOf(player.ID)
	if world == uuid.Nil {
		return errLeaveHubNotHere
	}
	if world != hub.ID {
		if current, inWorld := s.GetGameSession(world); inWorld && current.WorldType() == types.WorldTypeRun {
			return errLeaveHubInRun
		}
		return errLeaveHubNotHere
	}

	queued, err := s.IsQueued(ctx, player.ID)
	if err != nil {
		slog.Warn("Could not read queue entry on leave_hub, treating as not queued", "player_id", player.ID, "error", err)
	}
	if queued {
		return errLeaveHubQueued
	}

	hub.RemovePlayer(player.ID.String())
	s.setCurrentWorld(player, uuid.Nil)

	return nil
}

/**
* A delver in play choosing to die where they stand (FS-9K8EZ §Requirements
* 10–12): the run their record names sets their health to zero, and the death
* takes its ordinary course from the next tick. Refused with the run's reason,
* and for a member whose record names no run.
**/
func (s *Server) ForfeitRun(player *types.Player) error {
	world, _ := s.currentWorldOf(player.ID)
	run, exists := s.GetGameSession(world)
	if !exists || run.WorldType() != types.WorldTypeRun {
		return fmt.Errorf("forfeit run: %w", errPlayerNotInSession)
	}

	if err := run.Fall(player.ID); err != nil {
		return fmt.Errorf("forfeit run %s: %w", run.ID, err)
	}

	return nil
}

/**
* A delver drinking a health potion (FS-P9G8R §Requirements 2–4): the run their
* record names queues the drink for its tick, which makes every check. A member
* whose record names the hub, a field or no world is ignored, silently.
**/
func (s *Server) DrinkPotion(player *types.Player) {
	world, _ := s.currentWorldOf(player.ID)
	run, exists := s.GetGameSession(world)
	if !exists || run.WorldType() != types.WorldTypeRun {
		slog.Debug("Ignoring drink_potion outside a run", "player_id", player.ID, "world_id", world)
		return
	}

	run.Drink(player.ID)
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
* AtSpireGate reports whether the player stands at the Spire's door in the hub,
* as the hub measured them on its last tick. A player in a run, a field, or no
* world at all is at no gate. FS-0XMCP §Requirements 12.
**/
func (s *Server) AtSpireGate(playerID uuid.UUID) bool {
	hub, exists := s.HubSession()
	if !exists {
		return false
	}

	return hub.AtGate(playerID, components.GateDestinationSpire)
}

/**
* CheckLoadout reads the member's worn gear from items-service, as their own
* token, and reports errNoLoadout when it cannot be read. It blocks on the
* read, so callers run it off the message hub's loop and bound ctx.
**/
func (s *Server) CheckLoadout(ctx context.Context, player *types.Player) error {
	if _, err := s.readLoadout(ctx, player.ID, s.tokenOf(player)); err != nil {
		return fmt.Errorf("check loadout of %s: %w: %w", player.ID, errNoLoadout, err)
	}
	return nil
}

/**
* exposes server chan for communication between server and client
**/
func (s *Server) GetServerChan() chan types.ClientPackage {
	return s.serverChan
}

/**
* Publishes conn as the member's one live connection, written to through
* msgChan, and returns the connections it supersedes. Reports false, mapping
* nothing, when the member is no longer on record.
*
* The connection carries a copy of the record as it stands now, under the lock,
* not the copy the handler took before the upgrade: a run ending or a grace
* cleanup in between would otherwise be undone on the copy routing reads.
*
* A published connection is live, so every record of the member is marked
* connected and any reconnect grace they are held under ends: an old
* connection failing after the reconnect began cannot leave them evicted.
*
* Mapping the connection and registering its writer happen in one step, as
* does unmapping a superseded connection and stopping its writer, so
* overlapping reconnects cannot leave a member with two live connections or a
* sender holding a closed channel. The caller closes the superseded sockets.
**/
func (s *Server) MapConnToPlayer(conn *websocket.Conn, playerID uuid.UUID, msgChan chan interface{}) ([]*websocket.Conn, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	record, onRecord := s.players[playerID]
	if !onRecord {
		return nil, false
	}

	var superseded []*websocket.Conn

	for oldConn, existingPlayer := range s.connToPlayer {
		if existingPlayer.ID == playerID && oldConn != conn {
			slog.Info("Player reconnected, cleaning up old connection",
				"player_id", playerID,
				"player_username", record.Username,
			)
			s.stopClientWriterLocked(oldConn)
			delete(s.connToPlayer, oldConn)
			superseded = append(superseded, oldConn)
		}
	}

	connected := constants.Connected
	for _, rec := range s.everyRecordOf(record) {
		rec.ConnectState = &connected
	}
	delete(s.graceHolds, playerID)

	published := *record
	s.connToPlayer[conn] = &published
	s.msgChan[conn] = msgChan

	return superseded, true
}

/**
* grabs player information from connected client's websocket connection
* information.
**/

/**
* SeatedPlayerIDs is everyone connected to this pod and seated in a world: the
* area chat audience (FS-WJGFJ R9, ADR-0032). Read off the connection table,
* which is what routing trusts, so a member seated anywhere here hears the pod
* and a connection in no world does not (R10).
**/
func (s *Server) SeatedPlayerIDs() []uuid.UUID {
	s.mu.RLock()
	defer s.mu.RUnlock()

	seated := make([]uuid.UUID, 0, len(s.connToPlayer))
	seen := make(map[uuid.UUID]struct{}, len(s.connToPlayer))
	for _, player := range s.connToPlayer {
		if player.CurrentGameSessionId == uuid.Nil {
			continue
		}
		if _, dup := seen[player.ID]; dup {
			continue
		}
		seen[player.ID] = struct{}{}
		seated = append(seated, player.ID)
	}
	return seated
}

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
func (s *Server) CreateGameSession(players *types.ResolvedMatchedPlayers) *game.Session {
	// create entity manager first so it can be shared
	entityManager := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(entityManager)

	// create session with message sender
	newGameSession := game.NewSession(s, messaging.NewMessageSender(s), stateSerializer, entityManager, s.eventEmitter, s.itemsClient, game.RunBounds())

	newGameSession.InitialSystems()

	// Remove player from Hub
	// Leaving the hub is part of arriving in the run: a player occupies one world
	// at a time, and the hub is never torn down, so anything left behind there
	// stays visible and broadcasting (FS-29KSH §Requirements 23).
	if hub, exists := s.HubSession(); exists {
		for _, player := range players.LocalPlayers {
			hub.RemovePlayer(player.ID.String())
		}
	}

	// The roster is seated before the first floor is built: the floor sets the
	// party down together at one spawn point, then levels its monsters to the
	// party and spawns them clear of every delver, so both must already be known
	// (FS-77AB6 §Requirements 22). The session is not yet registered, so nothing
	// routes to it while it is being built.
	for _, player := range players.LocalPlayers {
		newGameSession.AddPlayer(player.ID, player.Character, s.tokenOf(player))
	}

	// FS-K2HKP R18: pass the handoff players so the first floor's formation and
	// monster level count the whole matched party, not only who is seated now.
	// Their characters come with the match; they are seated when they connect.
	expected := make([]types.CharacterInPlay, 0, len(players.HandoffPlayers))
	for _, player := range players.HandoffPlayers {
		expected = append(expected, player.Character)
	}
	newGameSession.InitialMapObjects(expected)

	s.mu.Lock()
	defer s.mu.Unlock()

	connected := constants.Connected

	for _, player := range players.LocalPlayers {
		for _, record := range s.everyRecordOf(player) {
			record.CurrentGameSessionId = newGameSession.ID
			record.ConnectState = &connected
		}
	}

	// add players to handoff and expected to connect in game session map
	newGameSession.AddPlayersToPendingConnection(players.HandoffPlayers)

	s.sessions[newGameSession.ID] = newGameSession

	// NOTE: keep this info level, important to save meta data DO NOT REMOVE
	slog.Info("New game session initiated", "session_id", newGameSession.ID, "local_players", len(players.LocalPlayers))

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
// IsQueued reports whether the member holds a queue entry. The error means the
// queue could not be read, not that they are queued.
func (s *Server) IsQueued(ctx context.Context, playerID uuid.UUID) (bool, error) {
	_, queued, err := s.queue.QueuedCharacter(ctx, playerID)
	if err != nil {
		return false, fmt.Errorf("read queue entry for %s: %w", playerID, err)
	}
	return queued, nil
}

func (s *Server) RemovePlayerFromQueue(player *types.Player) error {
	return s.queue.PlayerRemoveQueue(s.ctx, player)
}

/**
* get matched channel for listening to matched players
**/
func (s *Server) GetMatchedChan(ctx context.Context) chan matchmaker.MatchStart {
	return s.queue.GetMatchedChan(ctx)
}

/**
* get queue status channel for listening to queue updates
**/
func (s *Server) GetQueueStatusChan(ctx context.Context) chan matchmaker.QueueStatus {
	return s.queue.GetQueueStatusChan(ctx)
}

/**
* get handoff channel from matchmaker which pipes along players to reconnect to the
* corresponding pod that hosts the game session
**/
func (s *Server) GetHandoffChan(ctx context.Context) chan matchmaker.MatchStart {
	return s.queue.GetHandoffChan(ctx)
}

/**
* get conn from player ID
**/
func (s *Server) GetConnFromPlayer(playerID uuid.UUID) (*websocket.Conn, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.connOfLocked(playerID)
}

// connOfLocked finds the member's live connection. Callers hold the lock.
func (s *Server) connOfLocked(playerID uuid.UUID) (*websocket.Conn, bool) {
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
	// The lookups and the send happen under one read lock: a writer channel is
	// only closed under the write lock, so the connection found here and its
	// channel are still the member's, and still open. The send never blocks, so
	// the lock is never held waiting on a slow client.
	s.mu.RLock()
	defer s.mu.RUnlock()

	conn, exists := s.connOfLocked(playerID)
	if !exists {
		return fmt.Errorf("player %s not found", playerID)
	}

	ch, ok := s.msgChan[conn]
	if !ok {
		return fmt.Errorf("message channel not found for player %s", playerID)
	}

	// nonblocking send to prevent slow clients from blocking
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
	// sent under the read lock, as PushMessageToChannelQueue does
	s.mu.RLock()
	defer s.mu.RUnlock()

	ch, ok := s.msgChan[conn]
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
