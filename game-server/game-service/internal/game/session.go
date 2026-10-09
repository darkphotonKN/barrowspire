package game

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"math/rand/v2"
	"slices"
	"sync"
	"time"

	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components/metrics"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/utils"
	"github.com/google/uuid"
)

// the session represents one game room with its own ECS world
type Session struct {
	ID                       uuid.UUID
	EntityManager            *ecs.EntityManager
	MessageCh                chan types.ClientPackage
	playerIDToEntitiesID     map[uuid.UUID]uuid.UUID
	playerEntityIDToPlayerID map[uuid.UUID]uuid.UUID
	mu                       sync.RWMutex

	stopChan  chan struct{}
	isRunning bool
	// closed latches once Shutdown has closed the world's channels. The tick
	// reads it before signalling, so nothing sends on a closed channel.
	closed bool

	// this world's identity: which kind it is and how big.
	worldType           types.WorldType
	mapWidth, mapHeight float64

	// caching

	// [playerID] - interacted
	playerInteractedCache map[uuid.UUID]bool

	// [entityID] - interacted
	containerInteractedCache map[uuid.UUID]bool

	// elimination tracking: [memberID] the order they fell in, recorded by the
	// tick that eliminated them
	eliminations map[uuid.UUID]int

	// end session signal
	endSessionCh chan bool

	// TEST: testing only
	TestMessageSpy chan types.Message

	// item pool (session level, items are removed once assigned to a container)
	itemPool            lootPool
	itemPoolInitialized bool
	lootRarities        []lootRarity // empty: drops are unscaled with no rarity id (NULL)

	// dependency injections
	sessionCloser   SessionCloser
	sender          SessionSender
	stateSerializer StateSerializer
	eventEmitter    EventEmitter
	itemsClient     grpcitems.ItemsClient

	// whether delvers damage delvers here; fixed at world build (FS-77AB6 §12)
	playerDamage systems.PlayerDamage

	movementSystem     *systems.MovementSystem
	combatSystem       *systems.CombatSystem
	monsterAISystem    *systems.MonsterAISystem
	monsterDeathSystem *systems.MonsterDeathSystem
	skillSystem        *systems.SkillSystem

	// told of every kill record, in order, on the tick that made it
	killConsumers []KillConsumer

	// what each member's character has earned in this run, off the entities so
	// the removed are still reported (FS-BDA7X §Requirements 23)
	runExperience *RunExperience

	// escape
	switchEntityIDs  []uuid.UUID
	exitDoorEntityID uuid.UUID
	escapeSuccess    bool

	// objects occpied areas, check if placing objects at the same position
	objectOccupiedPlaceAreas []PlaceArea

	// client actions waiting for the tick: the message goroutine queues them and
	// the tick applies them, in arrival order, at the start of step. Nothing a
	// client sends touches the world from beside the tick (I-77AB6-11).
	intentsMu sync.Mutex
	intents   []func()

	// floor changes asked for and not yet applied, by the stairs each was
	// climbed from; the loop applies them between ticks (FS-F6F88 §Requirements 16)
	ascentRequests map[uuid.UUID]bool

	// what each floor's monsters are rolled from (FS-77AB6 §Requirements 22)
	spawnRand populationRand
}

// pub / sub manager for transporting event state between instances of sessions
//

// SessionCloser is what a session needs from its host as it ends: somewhere for
// its players to go, and removal from the registry. Both belong to end of life,
// and the order matters, a player moved after the world is gone has nowhere to
// be moved from.
//
// ApplyRunProgress hands over what the run did to each member's character in
// play, before anyone is sent home, so the HUB seats them at the run's result
// without waiting for character-service. FS-BDA7X §Requirements 24.
type SessionCloser interface {
	ApplyRunProgress(progress []types.RunProgress)
	ReturnPlayersToHub(sessionID uuid.UUID)
	CloseSession(sessionID uuid.UUID) error
}

type SessionSender interface {
	SendMessageToPlayer(playerID uuid.UUID, message types.Message) error
	BroadcastToPlayerList(players []uuid.UUID, msg types.Message) error
	SendStateToPlayer(playerID uuid.UUID, clientState *types.ClientGameState) error
	BroadcastStateToPlayerList(players []uuid.UUID, state *types.ClientGameState) error
}

type EventEmitter interface {
	PublishMatchComplete(ctx context.Context, data *types.RawMatchState)
}

type StateSerializer interface {
	PutBackendState(backendState *types.BackendGameState)
	SerializeBackendState(ctx context.Context, sessionID uuid.UUID, worldType types.WorldType, entities []*ecs.Entity) (*types.BackendGameState, error)
	FormatStateToClientState(backendState *types.BackendGameState, playerID uuid.UUID) *types.ClientGameState
}

// WorldBounds is a world's extent. It is fixed when the world is built, not a
// property of the systems that run inside it: a run's map and the hub are
// different sizes and both use the same MovementSystem.
type WorldBounds struct {
	Type          types.WorldType
	Width, Height float64
}

// RunBounds is the map an escape run is built on.
func RunBounds() WorldBounds {
	return WorldBounds{Type: types.WorldTypeRun, Width: constants.MapWidth, Height: constants.MapHeight}
}

// HubBounds is the hub world, larger than a run's map and larger than the
// client viewport, so it scrolls. FS-29KSH §Requirements 3.
func HubBounds() WorldBounds {
	return WorldBounds{Type: types.WorldTypeHub, Width: constants.HubMapWidth, Height: constants.HubMapHeight}
}

func NewSession(sessionCloser SessionCloser, sender *messaging.MessageSender, serializer StateSerializer, em *ecs.EntityManager, eventEmitter EventEmitter, itemsClient grpcitems.ItemsClient, bounds WorldBounds) *Session {
	s := newSession(sessionCloser, sender, serializer, em, eventEmitter, itemsClient, bounds)

	go s.Start()

	return s
}

// newSession builds a world without starting its loops, so a test can step its
// tick by hand.
func newSession(sessionCloser SessionCloser, sender *messaging.MessageSender, serializer StateSerializer, em *ecs.EntityManager, eventEmitter EventEmitter, itemsClient grpcitems.ItemsClient, bounds WorldBounds) *Session {
	sessionId := uuid.New()
	playerDamage := systems.PlayerDamage(constants.RunPlayerDamage)
	runExperience := NewRunExperience()

	s := &Session{
		ID:            sessionId,
		EntityManager: em,
		// map [playerID] to entityID
		playerIDToEntitiesID:     make(map[uuid.UUID]uuid.UUID),
		playerEntityIDToPlayerID: make(map[uuid.UUID]uuid.UUID, constants.DefautMaxSessionPlayers),
		MessageCh:                make(chan types.ClientPackage, 100),

		playerDamage:       playerDamage,
		movementSystem:     systems.NewMovementSystem(),
		combatSystem:       systems.NewCombatSystem(em, rand.Float64, playerDamage, UniqueEffects),
		monsterAISystem:    systems.NewMonsterAISystem(rand.Float64),
		monsterDeathSystem: systems.NewMonsterDeathSystem(em, MonsterCorpseLifetime),
		skillSystem:        systems.NewSkillSystem(),
		killConsumers:      []KillConsumer{NewKillLog(slog.Default()), NewKillExperience(em, runExperience)},
		runExperience:      runExperience,
		stopChan:           make(chan struct{}),
		isRunning:          false,

		worldType: bounds.Type,
		mapWidth:  bounds.Width,
		mapHeight: bounds.Height,

		playerInteractedCache:    make(map[uuid.UUID]bool, constants.DefautMaxSessionPlayers),
		containerInteractedCache: make(map[uuid.UUID]bool),

		eliminations: make(map[uuid.UUID]int),

		// one slot: the end is latched, so the tick sends at most once and
		// never blocks on it
		endSessionCh: make(chan bool, 1),

		sessionCloser:   sessionCloser,
		sender:          sender,
		stateSerializer: serializer,
		eventEmitter:    eventEmitter,
		itemsClient:     itemsClient,

		// the same goroutine-safe global source loot rolls with
		spawnRand: sharedLootRand{},
	}
	s.SubscribeKills(newMonsterDrops(s, sharedLootRand{}))
	s.SubscribeKills(newUniqueEffects(em))

	s.loadRaritiesAtBuild()

	return s
}

// rarityLoadTimeout bounds the one rarity load a world makes as it is built.
const rarityLoadTimeout = 3 * time.Second

// loadoutLoadTimeout bounds the loadout fetch made as a delver is seated, under
// the world's lock. I-77AB6-12.
const loadoutLoadTimeout = 3 * time.Second

/**
* loadRaritiesAtBuild loads the rarities a world labels loadouts and rolls drops
* with, once, before its loop can start: the tick reads lootRarities unlocked,
* so nothing writes it after. Unavailable, the world keeps none for its whole
* life and drops are unscaled (FS-4R9M9 §Requirements 22).
**/
func (s *Session) loadRaritiesAtBuild() {
	if s.itemsClient == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), rarityLoadTimeout)
	defer cancel()
	s.lootRarities = s.loadLootRarities(ctx)
}

/**
* Handles all inner workings inside a single game session.
* NOTE: this method needs to be run inside a goroutine.
**/
func (s *Session) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return
	}

	s.isRunning = true

	// managing incoming client messages
	go s.manageClientMessages()

	// game loop processing
	go s.manageGameLoop()

	// end game processing
	go s.manageEndSession()
}

/**
* Manages all incoming messages between client and game session via the
* message hub.
**/
func (s *Session) manageClientMessages() {
	// TEST: testing only
	if s.TestMessageSpy != nil {
		for {
			select {
			case message := <-s.MessageCh:
				slog.Debug("Test message received", "message", message)

				// propogate to test
				s.TestMessageSpy <- message.Message
			case <-s.stopChan:
				return
			}
		}
	}
	// TEST: end testing

	for {
		select {
		case msg := <-s.MessageCh:
			if s.TestMessageSpy != nil {
				return
			}

			slog.Debug("Incoming message to game session",
				"sessionID", s.ID,
				"message", msg,
				"action", msg.Message.Action,
			)

			switch constants.Action(msg.Message.Action) {
			case constants.ActionMove:

				slog.Debug("Action from client was move")
				// parse payload based on message action
				parsedPayload, err := msg.Message.ParsePayload()

				if err != nil {
					slog.Error("Failed to parse payload - types don't match", "payload", parsedPayload, "error", err)
					// Get playerID from payload if possible, otherwise skip sending error to specific player
					if playerIDStr, ok := msg.Message.Payload["player_id"].(string); ok {
						if playerID, parseErr := uuid.Parse(playerIDStr); parseErr == nil {
							s.sendErrorToPlayer(playerID, msg.Message.Action, "failed to parse move request")
						}
					}
					continue
				}

				movePayload := parsedPayload.(types.PlayerSessionMovePayload)

				slog.Debug("Parsed move payload", "payload", movePayload)

				// update based on action payload
				playerID, err := uuid.Parse(movePayload.PlayerID)
				if err != nil {
					slog.Error("Invalid PlayerID from session payload", "playerID", movePayload.PlayerID, "error", err)
					// Cannot send error to player since we don't have valid playerID
					continue
				}
				s.queueIntent(func() {
					if err := s.handleMove(playerID, movePayload.Vx, movePayload.Vy); err != nil {
						slog.Debug("Move refused", "player_id", playerID, "error", err)
					}
				})

			case constants.ActionInteract:
				slog.Debug("Action from client was interact")

				parsedPayload, err := msg.Message.ParsePayload()

				if err != nil {
					slog.Error("Failed to parse interact payload", "error", err)
					if playerIDStr, ok := msg.Message.Payload["player_id"].(string); ok {
						if playerID, parseErr := uuid.Parse(playerIDStr); parseErr == nil {
							s.sendErrorToPlayer(playerID, msg.Message.Action, "failed to parse interact request")
						}
					}
					continue
				}

				interactPayload := parsedPayload.(types.PlayerSessionInteractPayload)
				slog.Debug("Parsed interact payload", "payload", interactPayload)

				playerID, err := uuid.Parse(interactPayload.PlayerID)

				if err != nil {
					slog.Error("Invalid PlayerID from session payload", "playerID", interactPayload.PlayerID, "error", err)
					continue
				}

				entityIDUUID, err := uuid.Parse(interactPayload.EntityID)

				if err != nil {
					slog.Error("Invalid EntityID from session payload", "entityID", interactPayload.EntityID, "error", err)
					s.sendErrorToPlayer(playerID, msg.Message.Action, "invalid target object")
					continue
				}

				s.queueIntent(func() {
					if err := s.handleInteract(playerID, entityIDUUID); err != nil {
						slog.Error("handleInteract failed to process on entity.",
							"player_id", playerID,
							"entity_id", entityIDUUID,
							"error", err)
						s.sender.SendMessageToPlayer(playerID, types.Message{})
					}
				})

			case constants.ActionAttack:
				slog.Debug("Action from client was attack")
				parsedPayload, err := msg.Message.ParsePayload()

				if err != nil {
					slog.Error("Failed to parse loot payload", "error", err)
					if playerIDStr, ok := msg.Message.Payload["player_id"].(string); ok {
						if playerID, parseErr := uuid.Parse(playerIDStr); parseErr == nil {
							s.sendErrorToPlayer(playerID, msg.Message.Action, "failed to parse loot request")
						}
					}
					continue
				}
				attackPayload := parsedPayload.(types.PlayerSectionAttackPayload)
				slog.Debug("Parse attack payload",
					"attackPayload", attackPayload)

				playerID, err := uuid.Parse(attackPayload.PlayerID)

				if err != nil {
					slog.Error("Invalid PlayerID from session payload", "playerID", attackPayload.PlayerID, "error", err)
					continue
				}

				enemyEntityID, err := uuid.Parse(attackPayload.EnemyEntityID)

				if err != nil {
					slog.Error("Invalid ContainerEntityID from session payload",
						"containerEntityID", attackPayload.EnemyEntityID,
						"playerID", playerID,
						"error", err)
					s.sendErrorToPlayer(playerID, msg.Message.Action, "invalid container target")
					continue
				}

				s.queueIntent(func() {
					if err := s.handleAttack(playerID, enemyEntityID); err != nil {
						s.sender.SendMessageToPlayer(playerID, types.Message{})
					}
				})

			case constants.ActionCastSkill:
				slog.Debug("Action from client was cast_skill")
				parsedPayload, err := msg.Message.ParsePayload()

				if err != nil {
					slog.Error("Failed to parse cast_skill payload", "error", err)
					if playerIDStr, ok := msg.Message.Payload["player_id"].(string); ok {
						if playerID, parseErr := uuid.Parse(playerIDStr); parseErr == nil {
							s.sendErrorToPlayer(playerID, msg.Message.Action, "failed to parse cast_skill request")
						}
					}
					continue
				}
				skillPayload := parsedPayload.(types.PlayerCastSkillPayload)

				playerID, err := uuid.Parse(skillPayload.PlayerID)
				if err != nil {
					slog.Error("Invalid PlayerID from session payload", "playerID", skillPayload.PlayerID, "error", err)
					continue
				}

				s.queueIntent(func() {
					if err := s.handleCastSkill(playerID, skillPayload.SkillID, skillPayload.TargetX, skillPayload.TargetY); err != nil {
						slog.Error("Failed to handle cast_skill", "error", err)
					}
				})

			case constants.ActionEquip, constants.ActionUnequip:
				slog.Debug("Before parsing action equip / unequip message payload",
					"message_action", msg.Message.Action,
					"message_payload_raw", msg.Message.Payload,
				)

				parsedPayload, err := msg.Message.ParsePayload()

				if err != nil {
					slog.Error("Failed to parse payload - types don't match", "payload", parsedPayload, "error", err)
					// Get playerID from payload if possible, otherwise skip sending error to specific player
					if playerIDStr, ok := msg.Message.Payload["player_id"].(string); ok {
						if playerID, parseErr := uuid.Parse(playerIDStr); parseErr == nil {
							s.sendErrorToPlayer(playerID, msg.Message.Action, "failed to parse move request")
						}
					}
					continue
				}

				playerEquipPayload, ok := parsedPayload.(types.PlayerEquipPayload)

				if !ok {
					slog.Error("Failed to assert payload to expected type.", "payload", parsedPayload, "expected_type", "types.PlayerEqupPayload")
					continue
				}

				slog.Debug("ParsedPayload of item to equip / unequip",
					"action", msg.Message.Action,
					"player_id", playerEquipPayload.PlayerID,
					"session_id", s.ID,
					"item_entity_id", playerEquipPayload.ItemEntityID,
				)

				playerID, err := uuid.Parse(playerEquipPayload.PlayerID)
				if err != nil {
					slog.Error("Invalid PlayerID from session payload", "player_id", playerEquipPayload.PlayerID, "error", err)
					continue
				}

				itemEntityID, err := uuid.Parse(playerEquipPayload.ItemEntityID)
				if err != nil {
					slog.Error("Invalid itemEntityID from session payload", "item_entity_id", playerEquipPayload.ItemEntityID, "error", err)
					continue
				}

				action := constants.Action(msg.Message.Action)
				s.queueIntent(func() {
					s.mu.RLock()
					playerEntityID, ok := s.playerIDToEntitiesID[playerID]
					s.mu.RUnlock()

					if !ok {
						slog.Error("respective playerEntityID couldnt be found for playerID", "player_id", playerID)
						return
					}

					err := s.handleEquip(action, playerEntityID, itemEntityID)

					// the player has been told; refusing an over-level item is not a fault
					if errors.Is(err, ErrBelowRequiredLevel) {
						slog.Debug("Equip refused below the item's required level.",
							"player_id", playerID,
							"item_entity_id", itemEntityID,
						)
						return
					}

					if err != nil {
						slog.Error("Couldnt complete updating player equipment with handleEquip or handleUnquip actions.",
							"action", action,
							"player_id", playerID,
							"item_entity_id", itemEntityID,
							"error", err,
						)
					}
				})

			}

		case <-s.stopChan:
			slog.Info("Game session message handler stopped", "sessionID", s.ID)
			return
		}
	}
}

/**
* manages all the game update loops.
* runs system code to update state of game x times every second.
**/
func (s *Session) manageGameLoop() {
	ticker := time.NewTicker((1 * time.Second) / time.Duration(constants.GameFrameRate))
	defer ticker.Stop()

	// --- debugging ---

	slog.Debug("Showing all item entities that was created at the start of the game session.",
		"itemsState", s.itemPool,
	)

	// --- end debugging ---

	// --- core game loop --
	for {
		select {
		case <-ticker.C:
			// NOTE: keep for tracking game loop performance
			tickStart := time.Now()

			// TEST: exclude game loop for tests
			if s.TestMessageSpy != nil {
				return
			}
			// TEST: END test block

			// between ticks: a floor change lands before the tick reads the world
			s.applyRequestedFloorChange()

			entities := s.EntityManager.GetAllEntities()

			s.step(1.0/float64(constants.GameFrameRate), entities)

			// broadcast state update to all players
			err := s.broadcastFullState(entities)
			if err != nil {
				slog.Error("Error broadcasting state", "error", err)
				continue
			}

			// NOTE: record metrics for tick duration (skip if not initialized)
			if metrics.TickDuration != nil {
				metrics.TickDuration.Record(context.Background(), time.Since(tickStart).Seconds())
			}
			if metrics.EntityCount != nil {
				metrics.EntityCount.Record(context.Background(), int64(len(entities)))
			}

		case <-s.stopChan:
			slog.Info("Game session game loop stopped", "sessionID", s.ID)
			return
		}
	}
}

// step advances the simulation one tick. Damage happens in exactly one place on
// it: the CombatSystem, fed by the projectile impacts detected just before it.
//
// It must not be called holding s.mu: the client actions it applies first, and
// the end rule, take the lock themselves.
func (s *Session) step(deltaTime float64, entities []*ecs.Entity) {
	// what clients asked for since the last tick lands before anything reads
	// the world, on this goroutine alone
	s.applyIntents()

	// gear: what each delver wears counts from this tick, in every world
	systems.NewGearSystem(s.EntityManager, GearCaps, UniqueEffects, Attributes).Update(deltaTime, entities)

	// residents amble; a run has none, so this is the hub's alone
	if s.worldType == types.WorldTypeHub {
		wanderSys := systems.NewWanderSystem()
		wanderSys.Update(deltaTime, entities)
	}

	// monster AI steers the monsters before anything moves; a run's alone, the
	// hub holds no monsters (FS-77AB6 §Requirements 27)
	if s.worldType == types.WorldTypeRun {
		s.monsterAISystem.Update(deltaTime, entities)
	}

	// movement
	movementSys := systems.MovementSystem{MapWidth: s.mapWidth, MapHeight: s.mapHeight}
	movementSys.Update(deltaTime, entities)

	// projectile
	projectileSys := systems.NewProjectileSystem(s.EntityManager, s.playerDamage)
	impacts := projectileSys.Update(deltaTime, entities)

	// combat
	kills := s.combatSystem.Update(deltaTime, entities, impacts)

	// monster death: the slain lie dead from this tick; a run's alone, the hub
	// holds no monsters
	if s.worldType == types.WorldTypeRun {
		s.monsterDeathSystem.Update(deltaTime, entities)
		s.publishKills(kills)
	}

	// interaction
	interactionSys := systems.InteractionSystem{}
	interactionSys.Update(entities)

	// elimination
	eliminationSys := systems.EliminationSystem{}
	s.recordEliminations(eliminationSys.Update(deltaTime, entities, s.ID))

	// rules
	s.applyEndRule(deltaTime, entities)
}

// queueIntent hands a client action to the tick, which applies it at the start
// of its next step. Safe from any goroutine.
//
// The action runs exactly as the handler would have run from the message
// goroutine, replies and refusals included, only on the tick: so what a client
// is told is unchanged, and it is told once the action has been applied.
func (s *Session) queueIntent(apply func()) {
	s.intentsMu.Lock()
	defer s.intentsMu.Unlock()

	s.intents = append(s.intents, apply)
}

// applyIntents applies every client action queued since the last tick, in the
// order they arrived. A world already shut down applies none: its players are
// on their way out of it, and a reply now would reach them somewhere else.
func (s *Session) applyIntents() {
	s.intentsMu.Lock()
	intents := s.intents
	s.intents = nil
	s.intentsMu.Unlock()

	if len(intents) == 0 {
		return
	}

	s.mu.RLock()
	closed := s.closed
	s.mu.RUnlock()
	if closed {
		return
	}

	for _, apply := range intents {
		apply()
	}
}

// applyEndRule runs the co-op end rule unless the world has been shut down.
// Disconnect cleanup shuts a run down without the rules, closing endSessionCh,
// and a tick already in flight must not then send on it: the panic would take
// every world in the process with it (ADR-0015). Shutdown closes under the
// write lock, so holding the read lock across the send keeps the two apart; the
// send cannot block, since the end is latched and the channel has room for it.
func (s *Session) applyEndRule(deltaTime float64, entities []*ecs.Entity) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.closed {
		return
	}

	rulesSys := systems.RulesSystem{}
	rulesSys.Update(deltaTime, entities, s.endSessionCh)
}

// KillConsumer is an in-process reader of a run's kill records (FS-77AB6
// §Requirements 29): experience (FS-BDA7X) and drops (FS-4R9M9) subscribe here.
// Each record reaches each consumer exactly once, synchronously, on the tick that
// made it and on the run's own loop, so a consumer may read and change the world
// without locking. It must not block.
type KillConsumer interface {
	ConsumeKill(record systems.KillRecord)
}

// SubscribeKills adds a consumer of this run's kill records. Subscribe while
// building the session, before its loop starts: the tick reads the list unlocked.
func (s *Session) SubscribeKills(consumer KillConsumer) {
	s.killConsumers = append(s.killConsumers, consumer)
}

// publishKills hands this tick's kill records to every consumer, in order.
func (s *Session) publishKills(kills []systems.KillRecord) {
	for _, record := range kills {
		for _, consumer := range s.killConsumers {
			consumer.ConsumeKill(record)
		}
	}
}

/**
* Tracks end game status sent over by the rules system.
**/

func (s *Session) manageEndSession() {
	for endSession := range s.endSessionCh {
		if endSession {
			s.endSession()
		}
	}
}

var Classes = map[string]ClassConfig{
	"warrior": {
		Stats:  components.StatsComponent{Strength: 8, Agility: 4, Intelligence: 2, Vitality: 9},
		Combat: components.CombatComponent{Attack: 12, Defense: 10, AttackSpeed: 1.0, AttackRange: 1},
		Health: components.HealthComponent{CurrentHealth: 150, MaxHealth: 150},
		Mana:   components.ManaComponent{CurrentMana: 50, MaxMana: 50},
		Skills: []components.SkillComponent{{SkillName: "slash", Level: 1}},
		Growth: ClassGrowth{Strength: 2, Vitality: 2, MaxHealth: 12, MaxMana: 2},
	},
	"mage": {
		Stats:  components.StatsComponent{Strength: 2, Agility: 3, Intelligence: 9, Vitality: 3},
		Combat: components.CombatComponent{Attack: 15, Defense: 3, AttackSpeed: 0.8, AttackRange: 6},
		Health: components.HealthComponent{CurrentHealth: 100, MaxHealth: 100},
		Mana:   components.ManaComponent{CurrentMana: 150, MaxMana: 150},
		Skills: []components.SkillComponent{{SkillName: "fireball", Level: 1}},
		Growth: ClassGrowth{Intelligence: 3, MaxHealth: 6, MaxMana: 10},
	},
	"archer": {
		Stats:  components.StatsComponent{Strength: 4, Agility: 8, Intelligence: 3, Vitality: 5},
		Combat: components.CombatComponent{Attack: 10, Defense: 5, AttackSpeed: 1.5, AttackRange: 8},
		Health: components.HealthComponent{CurrentHealth: 100, MaxHealth: 100},
		Mana:   components.ManaComponent{CurrentMana: 100, MaxMana: 100},
		Skills: []components.SkillComponent{{SkillName: "power_shot", Level: 1}},
		Growth: ClassGrowth{Agility: 3, MaxHealth: 8, MaxMana: 5},
	},
}

// AddPlayer seats the member's character in play in this world, at its level.
func (s *Session) AddPlayer(playerID uuid.UUID, character types.CharacterInPlay) uuid.UUID {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.addPlayerLocked(playerID, character)
}

// addPlayerLocked is AddPlayer's body. Callers hold the world's lock, so that
// deciding whether to admit someone and admitting them cannot be split by
// another goroutine slipping between the two
func (s *Session) addPlayerLocked(playerID uuid.UUID, character types.CharacterInPlay) uuid.UUID {

	// Already here: there is nothing to build. The guard lives with the world
	// rather than with whoever is asking, because overwriting the mapping while
	// leaving the old entity in place gives one delver two bodies, invisible in
	// a run, which discards the whole world, and permanent in the hub, which
	// never does
	if existing, alreadyHere := s.playerIDToEntitiesID[playerID]; alreadyHere {
		return existing
	}

	spawnX, spawnY := s.spawnPoint()

	className := character.Class
	classCfg, ok := Classes[className]
	if !ok {
		classCfg = Classes["mage"]
		className = "mage"
	}
	level := seatLevel(character.Level)

	// Seating is the loadout's level gate: an item above the character's level
	// is brought in and carried, not worn. FS-BDA7X §Requirements 31.
	carried := []uuid.UUID{}

	// add item entity and return its UUID pointer, or nil when it is carried instead
	rarities := s.lootRarities
	addSlotItem := func(item *pbitems.ItemInstance) *uuid.UUID {
		if item == nil {
			return nil
		}
		config := loadoutItemConfig(item, rarities)
		id := s.AddItemWithUnLocked(config)
		if !canWear(config.RequiredLevel, level) {
			carried = append(carried, id)
			return nil
		}
		return &id
	}

	var loadout *components.EquipmentConfig
	if s.itemsClient != nil {
		grpcLoadoutRequest := &pbitems.GetLoadoutWithItemsRequest{
			MemberId: playerID.String(),
		}
		// the fetch runs under the world's lock: a hanging items service must
		// never hold it, so past the deadline the delver is seated without a loadout
		ctx, cancel := context.WithTimeout(context.Background(), loadoutLoadTimeout)
		loadoutResult, err := s.itemsClient.GetLoadoutWithItems(ctx, grpcLoadoutRequest)
		cancel()

		if errors.Is(err, context.DeadlineExceeded) {
			slog.Warn("Loadout fetch timed out, player spawns with no equipment.",
				"member_id", playerID, "timeout", loadoutLoadTimeout, "error", err)
		} else if err != nil || loadoutResult == nil {
			slog.Error("Failed to get loadout, player spawns with no equipment.", "error", err)
		} else {
			loadout = &components.EquipmentConfig{
				WeaponSlot:  addSlotItem(loadoutResult.Weapon),
				HeadSlot:    addSlotItem(loadoutResult.Head),
				ChestSlot:   addSlotItem(loadoutResult.Chest),
				GlovesSlot:  addSlotItem(loadoutResult.Gloves),
				LegsSlot:    addSlotItem(loadoutResult.Legs),
				Ring1Slot:   addSlotItem(loadoutResult.Ring_1),
				Ring2Slot:   addSlotItem(loadoutResult.Ring_2),
				Consumable1: addSlotItem(loadoutResult.Consumable_1),
				Consumable2: addSlotItem(loadoutResult.Consumable_2),
				Consumable3: addSlotItem(loadoutResult.Consumable_3),
			}
		}
	}

	PlayerConfig := PlayerConfig{
		MemberID:     playerID,
		CharacterID:  character.ID,
		Level:        level,
		Experience:   character.Experience,
		Username:     character.Name,
		X:            spawnX,
		Y:            spawnY,
		Class:        classAtLevel(classCfg, level),
		ClassName:    className,
		ItemName:     "Health Potion",
		ItemQuantity: 3,

		Vx: 0,
		Vy: 0,

		ItemIDList:    carried,
		Escape:        false,
		PlayerLoadout: loadout,
	}

	// create player state entity
	entity := CreatePlayerEntity(s.EntityManager, PlayerConfig)

	// update player id to entity id map
	s.playerIDToEntitiesID[playerID] = entity.ID
	// update players map
	s.playerEntityIDToPlayerID[entity.ID] = playerID
	return entity.ID
}

func (s *Session) RemovePlayer(userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	playerID, err := uuid.Parse(userID)
	if err != nil {
		slog.Error("RemovePlayer: Invalid userID", "userID", userID, "error", err)
		return
	}
	s.removePlayerLocked(playerID)
}

// removePlayerLocked is RemovePlayer's body. Callers hold the world's lock.
func (s *Session) removePlayerLocked(playerID uuid.UUID) {
	// playerIDToEntitiesID is the one keyed by player; playerEntityIDToPlayerID
	// goes the other way. Reading the wrong one here meant this always missed
	// and returned, so nobody was ever removed from a world.
	entityID, exists := s.playerIDToEntitiesID[playerID]
	if !exists {
		slog.Warn("RemovePlayer: playerID not found in session", "playerID", playerID)
		return
	}
	s.EntityManager.RemoveEntity(entityID)

	delete(s.playerIDToEntitiesID, playerID)
	delete(s.playerEntityIDToPlayerID, entityID)
	slog.Info("Removed player from session", "playerID", playerID, "sessionID", s.ID)
}

func (s *Session) AddDoor(x, y, width, height float64) uuid.UUID {
	doorConfig := DoorConfig{
		X:      x,
		Y:      y,
		Width:  width,
		Height: height,
	}

	entity := CreateDoorEntity(s.EntityManager, doorConfig)
	return entity.ID
}

func (s *Session) AddContainer(x, y float64) uuid.UUID {
	s.mu.Lock()
	defer s.mu.Unlock()

	ContainerConfig := ContainerConfig{
		X: x,
		Y: y,
	}
	itemIDList := make([]uuid.UUID, 0)

	entity := CreateContainerEntity(s.EntityManager, ContainerConfig, itemIDList)
	return entity.ID
}

func (s *Session) AddBuilding(bx, by, bw, bh, wallThickness, doorWidth float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	houseID := uuid.New()
	doorOffset := (bw - doorWidth) / 2

	walls := []WallConfig{
		// 上牆
		{X: bx, Y: by, Width: bw, Height: wallThickness},
		// 左牆
		{X: bx, Y: by, Width: wallThickness, Height: bh},
		// 右牆
		{X: bx + bw - wallThickness, Y: by, Width: wallThickness, Height: bh},
		// 下左段
		{X: bx, Y: by + bh - wallThickness, Width: doorOffset, Height: wallThickness},
		// 下右段
		{X: bx + doorOffset + doorWidth, Y: by + bh - wallThickness, Width: doorOffset, Height: wallThickness},
	}

	for _, wallConfig := range walls {
		CreateWallEntity(s.EntityManager, wallConfig, houseID)
	}

	// 門（下牆缺口處，比牆壁薄）
	doorX := bx + doorOffset
	doorY := by + bh - wallThickness
	s.AddDoor(doorX, doorY, doorWidth, wallThickness)
}

// spawnPoint is where an arriving player is placed.
//
// The hub has a front door: everyone enters and returns to the same place, so
// the world has somewhere to gather (FS-29KSH §Requirements 22). A run scatters
// arrivals instead, across its own map, not a hardcoded one, so a world of any
// size places players inside itself.
func (s *Session) spawnPoint() (x, y float64) {
	if s.worldType == types.WorldTypeHub {
		return constants.HubSpawnX, constants.HubSpawnY
	}

	return constants.PlayerRadius + rand.Float64()*(s.mapWidth-2*constants.PlayerRadius),
		constants.PlayerRadius + rand.Float64()*(s.mapHeight-2*constants.PlayerRadius)
}

// ErrWorldFull is returned when a world will hold no more.
var ErrWorldFull = errors.New("this world is full")

/**
* Admits a player, if the world has room for them.
*
* The capacity check and the admission happen under the world's own lock, in one
* step. Checking for room and then taking it separately lets a crowd reaching for
* the last place each see it free — and putting that check in a caller means the
* next caller has to remember it, which is how the no-double-body guard came to
* be missing from ReturnPlayersToHub.
*
* Only the hub has a door policy. A run's roster is matchmaking's decision, and
* a player coming home from one is not arriving, so ReturnPlayersToHub adds them
* directly rather than asking.
**/
func (s *Session) Admit(playerID uuid.UUID, character types.CharacterInPlay) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if seated, alreadyHere := s.seatedCharacterLocked(playerID); alreadyHere && seated != character.ID {
		// Another character: the HUB re-seats the member as it, a run keeps
		// the one it was entered with (FS-BDA7X §Requirements 5, 7)
		if s.worldType != types.WorldTypeHub {
			return fmt.Errorf("%w: %s", ErrCharacterSwitchMidRun, s.ID)
		}
		s.removePlayerLocked(playerID)
	}

	if _, alreadyHere := s.playerIDToEntitiesID[playerID]; !alreadyHere {
		if s.worldType == types.WorldTypeHub && len(s.playerIDToEntitiesID) >= constants.HubOccupancyCap {
			return fmt.Errorf("%w: %s", ErrWorldFull, s.ID)
		}
	}

	s.addPlayerLocked(playerID, character)

	return nil
}

// seatedCharacterLocked is the id of the character the member's body here was
// seated as, and whether they have a body here at all. Callers hold the lock.
func (s *Session) seatedCharacterLocked(playerID uuid.UUID) (uuid.UUID, bool) {
	entityID, exists := s.playerIDToEntitiesID[playerID]
	if !exists {
		return uuid.Nil, false
	}

	entity, exists := s.EntityManager.GetEntity(entityID)
	if !exists {
		return uuid.Nil, true
	}
	pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
	if !ok {
		return uuid.Nil, true
	}

	return pc.(*components.PlayerComponent).CharacterID, true
}

// ErrSafeZone is returned when a world refuses combat.
var ErrSafeZone = errors.New("this world is a safe zone")

// combatAllowed refuses to record an attack intent in a world that does not
// permit one.
//
// The refusal sits here rather than in the systems because this is the only place
// an attack is armed: the CombatSystem, which the hub ticks exactly as a run
// does, resolves only the intents handleAttack and handleCastSkill record.
// Turning the action away is also more honest than accepting it and ignoring the
// intent afterwards. FS-29KSH §Requirements 6.
func (s *Session) combatAllowed() error {
	if s.worldType == types.WorldTypeHub {
		return fmt.Errorf("%w: %s", ErrSafeZone, s.ID)
	}

	return nil
}

// HasPlayer reports whether this world holds an entity for the player.
func (s *Session) HasPlayer(playerID uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	_, exists := s.playerIDToEntitiesID[playerID]

	return exists
}

// WorldType is the kind of world this session runs.
func (s *Session) WorldType() types.WorldType {
	return s.worldType
}

func (s *Session) AddEscape(x, y float64) uuid.UUID {
	s.mu.Lock()
	defer s.mu.Unlock()

	Config := EscapeConfig{
		X: x,
		Y: y,
	}
	entity := CreateEscapeDoorEntity(s.EntityManager, Config)
	return entity.ID
}

func (s *Session) Shutdown() {
	s.mu.Lock()

	if !s.isRunning {
		s.mu.Unlock()
		return
	}

	// a second Shutdown is a no-op: endSession is reachable from the rules and
	// from the last delver's disconnect cleanup (FS-QG1HR D5)
	s.isRunning = false
	s.closed = true

	// clean up channels
	close(s.stopChan)
	close(s.MessageCh)
	close(s.endSessionCh)

	s.mu.Unlock()
}

/**
* GetPlayerIDs returns all player IDs in this session
**/
func (s *Session) GetPlayerIDs() []uuid.UUID {
	s.mu.RLock()
	defer s.mu.RUnlock()

	playerIDs := make([]uuid.UUID, 0, len(s.playerIDToEntitiesID))
	for playerID := range s.playerIDToEntitiesID {
		playerIDs = append(playerIDs, playerID)
	}
	return playerIDs
}

/**
* Broadcasts the current game state, after serialization, to all the players in the
* session. Each player receives a personalized view with their player state separated.
**/
func (s *Session) broadcastFullState(entities []*ecs.Entity) error {
	ctx := context.Background()
	backendState, err := s.stateSerializer.SerializeBackendState(ctx, s.ID, s.worldType, entities)
	if err != nil {
		slog.Error("Failed to serialize state", "error", err)
		return err
	}

	clientStates := make(map[uuid.UUID]*types.ClientGameState)
	for _, playerID := range s.playerEntityIDToPlayerID {
		clientStates[playerID] = s.stateSerializer.FormatStateToClientState(backendState, playerID)
	}

	s.stateSerializer.PutBackendState(backendState)

	for playerID, clientState := range clientStates {
		go func(pID uuid.UUID, cState *types.ClientGameState) {
			s.sender.SendStateToPlayer(pID, cState)
		}(playerID, clientState)
	}

	return nil
}

/**
* --- State Updates Handlers ---
**/

/**
* updates the movement component transform based on the input provided
* by the client.
**/
func (s *Session) handleMove(playerID uuid.UUID, vx, vy float64) error {
	if err := s.delverInPlay(playerID); err != nil {
		return fmt.Errorf("move: %w", err)
	}

	s.mu.RLock()
	// get specific player entity
	playerEntityID, ok := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()

	if !ok {
		slog.Error("PlayerEntityID doesn't exist", "playerID", playerID)
		return fmt.Errorf("PlayerEntityID doesn't exist for playerID: %s", playerID)
	}

	playerEntity, ok := s.EntityManager.GetEntity(playerEntityID)

	if !ok {
		slog.Error("PlayerEntity doesn't exist", "playerEntityID", playerEntityID, "playerID", playerID)
		return fmt.Errorf("Player entity doesn't exist for id %s", playerID)
	}

	playerVelocityComponent, ok := playerEntity.GetComponent(ecs.ComponentTypeVelocity)

	if !ok {
		slog.Error("Player's Velocity Component doesn't exist", "entityID", playerEntity.ID)
		return fmt.Errorf("Players Velocity Component doesn't exist for entity ID: %s", playerEntity.ID)
	}

	component := playerVelocityComponent.(*components.VelocityComponent)

	// update velocity values
	component.VX = vx
	component.VY = vy

	return nil
}

/**
* handles player interacting with x object with target entity id.
**/
func (s *Session) handleInteract(playerID uuid.UUID, targetEntityID uuid.UUID) error {
	if err := s.delverInPlay(playerID); err != nil {
		return fmt.Errorf("interact: %w", err)
	}

	targetEntity, hasEntity := s.EntityManager.GetEntity(targetEntityID)

	slog.Debug("Entity being interacted on in handleInteract.",
		"player_id", playerID,
		"target_entity_id", targetEntityID)

	if !hasEntity {
		slog.Error("Failed to retrieve target entity", "targetEntityID", targetEntityID)
		return ErrEntityNotFound
	}

	// rate limiting cache
	s.mu.Lock() // hold lock to prevent check then act races here
	// check
	_, exists := s.containerInteractedCache[targetEntityID]
	if exists {
		s.mu.Unlock()
		slog.Debug("Container entity still cached, not available for interaction", "targetEntityID", targetEntityID)
		return fmt.Errorf("container targeted entityID %s was still cached and not available to be interacted", targetEntityID)
	} else {
		// act
		s.containerInteractedCache[targetEntityID] = true
	}
	// release lock after act
	s.mu.Unlock()

	// the stairs keep no cooldown: one climb is guaranteed by the floor change
	// request, and a refusal must never lock the way up
	_, isStairs := targetEntity.GetComponent(ecs.ComponentTypeStairs)
	if isStairs {
		defer func() {
			s.mu.Lock()
			delete(s.containerInteractedCache, targetEntityID)
			s.mu.Unlock()
		}()
	}

	// get that entity's type and decide on the effect
	_, isDoorEntity := targetEntity.GetComponent(ecs.ComponentTypeDoor)
	_, isContainerEntity := targetEntity.GetComponent(ecs.ComponentTypeContainer)
	_, isItemEntity := targetEntity.GetComponent(ecs.ComponentTypeItem)
	switchComp, isSwitch := targetEntity.GetComponent(ecs.ComponentTypeSwitch)
	_, isEscapeDoor := targetEntity.GetComponent(ecs.ComponentTypeEscapeDoor)

	if !isDoorEntity && !isContainerEntity && !isSwitch && !isEscapeDoor && !isItemEntity && !isStairs {
		slog.Debug("Entity type did not match any interactable entity", "targetEntityID", targetEntityID)
		return fmt.Errorf("entity type did not match any interactable entity")
	}

	// --- player entity ---

	// establish player's position
	s.mu.RLock()
	playerEntityID := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()

	// exit early if cached
	_, exists = s.playerInteractedCache[playerEntityID]

	if exists {
		slog.Debug("Player interacted too soon", "playerEntityID", playerEntityID)
		return fmt.Errorf("player interacted too soon with playerEntityID %s", playerEntityID)
	}

	playerEntity, hasPlayerEntity := s.EntityManager.GetEntity(playerEntityID)

	if !hasPlayerEntity {
		slog.Error("Failed to retrieve target player entity", "playerEntityID", playerEntityID)

		return fmt.Errorf("Error when attempting to retrieve target player entity with entityID %s", targetEntityID)
	}

	playerTransformComponent, hasTransform := playerEntity.GetComponent(ecs.ComponentTypeTransform)

	if !hasTransform {
		slog.Error("Failed to retrieve player entity transform component", "playerEntityID", playerEntityID)
		return fmt.Errorf("Error when attempting to retrieve player entity transform component with entityID %s", playerEntityID)
	}

	playerTransform := playerTransformComponent.(*components.TransformComponent)

	// --- stairs entity ---

	if isStairs {
		return s.climbStairs(playerID, playerTransform, targetEntity)
	}

	// --- door entity ---

	if isDoorEntity {
		// get location
		doorTransformComponent, hasTransform := targetEntity.GetComponent(ecs.ComponentTypeTransform)

		if !hasTransform {
			slog.Error("Failed to retrieve door entity transform component", "targetEntityID", targetEntityID)
			return fmt.Errorf("Error when attempting to retrieve door entity transform component with entityID %s", targetEntityID)
		}

		doorTransform := doorTransformComponent.(*components.TransformComponent)
		doorX, doorY := doorTransform.X, doorTransform.Y

		// a door is stored by its top-left corner; range is measured to the middle
		// of the doorway, or the far end of a wide door is out of reach from in front of it
		if doorComponent, hasDoor := targetEntity.GetComponent(ecs.ComponentTypeDoor); hasDoor {
			door := doorComponent.(*components.DoorComponent)
			doorX += door.Width / 2
			doorY += door.Height / 2
		}

		// validate is within distance from player
		isWithinDistance := s.calcWithinDistance(playerTransform.X, playerTransform.Y, doorX, doorY)

		if !isWithinDistance {
			slog.Debug("Door entity out of range for interaction", "targetID", targetEntityID, "playerID", playerID)
			s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "too far away to interact")
			return ErrOutOfRange
		}

		// trigger doors swap in openable state via its OpenableComponent
		doorOpenableComponent, hasOpenable := targetEntity.GetComponent(ecs.ComponentTypeOpenable)

		if !hasOpenable {
			slog.Error("Failed to retrieve door entity openable component", "targetEntityID", targetEntityID)
			return fmt.Errorf("Error when attempting to retrieve door entity openable component with entityID %s", targetEntityID)
		}

		doorOpenable := doorOpenableComponent.(*components.OpenableComponent)

		// update state
		doorOpenable.IsOpen = !doorOpenable.IsOpen

		// release cache in 100 milliseconds
		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.containerInteractedCache, targetEntityID)
			s.mu.Unlock()
		}()

		// add player to interacted cache
		s.mu.Lock()
		s.playerInteractedCache[playerEntityID] = true
		s.mu.Unlock()

		// remove them from cache after a short while
		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.playerInteractedCache, playerEntityID)
			s.mu.Unlock()
		}()
	}

	if isContainerEntity {

		// get location
		containerTransformComponent, hasTransform := targetEntity.GetComponent(ecs.ComponentTypeTransform)

		if !hasTransform {
			slog.Error("Failed to retrieve container entity transform component", "targetEntityID", targetEntityID)
			return fmt.Errorf("Error when attempting to retrieve container entity transform component with entityID %s", targetEntityID)
		}

		containerTransform := containerTransformComponent.(*components.TransformComponent)

		slog.Debug("target entity isContainerEntity",
			"entity_id", targetEntityID,
			"entity_transform",
			struct {
				x float64
				y float64
			}{
				x: containerTransform.X,
				y: containerTransform.Y},
		)

		// validate is within distance from player
		isWithinDistance := s.calcWithinDistance(playerTransform.X, playerTransform.Y, containerTransform.X, containerTransform.Y)
		if !isWithinDistance {
			slog.Debug("Container entity out of range for interaction", "targetID", targetEntityID, "playerID", playerID)
			s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "too far away to interact")
			return ErrOutOfRange
		}
		// trigger containers swap in openable state via its OpenableComponent
		containerOpenableComponent, hasOpenable := targetEntity.GetComponent(ecs.ComponentTypeOpenable)

		if !hasOpenable {
			slog.Error("Failed to retrieve container entity openable component", "targetEntityID", targetEntityID)
			return fmt.Errorf("Error when attempting to retrieve container entity openable component with entityID %s", targetEntityID)
		}

		containerOpenable := containerOpenableComponent.(*components.OpenableComponent)

		// only open, never close (chest stays open once opened)
		containerOpenable.IsOpen = true

		// create items on first open by using seeded itemPool
		if containerOpenable.HasBeenOpened == false {
			containerOpenable.HasBeenOpened = true

			// creates RANDOM items on the spot
			itemIDs, err := s.generateItems()

			if err != nil {
				fmt.Printf("Error generating container items: %v\n", err)
				return fmt.Errorf("failed to generate container items: %w", err)
			}

			itemIDsComponent, hasItemIDs := targetEntity.GetComponent(ecs.ComponentTypeItemIDList)
			if !hasItemIDs {
				slog.Error("Failed to retrieve container entity itemIDs component", "targetEntityID", targetEntityID)
				return fmt.Errorf("Error when attempting to retrieve container entity itemIDs component with entityID %s", targetEntityID)
			}

			containerItemIDs := itemIDsComponent.(*components.ItemIDListComponent)
			// relate the container with the newly generated items
			containerItemIDs.ItemIDs = itemIDs
		}

		// release cache in 100 milliseconds
		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.containerInteractedCache, targetEntityID)
			s.mu.Unlock()
		}()

		// add player to interacted cache
		s.mu.Lock()
		s.playerInteractedCache[playerEntityID] = true
		s.mu.Unlock()

		// remove them from cache after a short while
		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.playerInteractedCache, playerEntityID)
			s.mu.Unlock()
		}()
	}

	// --- item entity ---
	// when directly acting to an item
	if isItemEntity {
		err := s.pickUpItem(playerEntity, playerTransform, targetEntityID)
		if errors.Is(err, ErrOutOfRange) {
			s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "too far away to interact")
		}
		return err
	}

	// Check if the switch is on so we can open the emergency exit
	// -- switch entity --
	if isSwitch {
		// get location
		switchTransformComponent, hasTransform := targetEntity.GetComponent(ecs.ComponentTypeTransform)

		if !hasTransform {
			slog.Error("Failed to retrieve switch entity transform component", "targetEntityID", targetEntityID)
			return fmt.Errorf("Error when attempting to retrieve switch entity transform component with entityID %s", targetEntityID)
		}

		switchTransform := switchTransformComponent.(*components.TransformComponent)
		// validate is within distance from player
		isWithinDistance := s.calcWithinDistance(playerTransform.X, playerTransform.Y, switchTransform.X, switchTransform.Y)

		if !isWithinDistance {
			slog.Debug("Switch entity out of range for interaction", "targetID", targetEntityID, "playerID", playerID)
			s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "too far away to interact")
			return ErrOutOfRange
		}

		switchComponent := switchComp.(*components.SwitchComponent)
		if switchComponent.IsActivated {
			return fmt.Errorf("switch already activated")
		}
		switchComponent.IsActivated = true
		slog.Info("Switch activated!", "playerID", playerID)

		s.mu.RLock()
		exitDoorEntityID := s.exitDoorEntityID
		s.mu.RUnlock()

		exitDoor, exists := s.EntityManager.GetEntity(exitDoorEntityID)
		if exists {
			lockableComp, hasLockable := exitDoor.GetComponent(ecs.ComponentTypeLockable)
			if hasLockable {
				lockable := lockableComp.(*components.LockableComponents)
				lockable.IsLocked = false

				slog.Info("Exit door unlocked!")
			}
		}
		// release container cache so other players can use this escape door
		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.containerInteractedCache, targetEntityID)
			s.mu.Unlock()
		}()
		// add player to interacted cache
		s.mu.Lock()
		s.playerInteractedCache[playerEntityID] = true
		s.mu.Unlock()

		// remove them from cache after a short while
		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.playerInteractedCache, playerEntityID)
			s.mu.Unlock()
		}()
	}

	// -- escape door entity --
	if isEscapeDoor {
		// get location
		escapeDoorTransformComponent, hasTransform := targetEntity.GetComponent(ecs.ComponentTypeTransform)

		if !hasTransform {
			slog.Error("Failed to retrieve escape door entity transform component", "targetEntityID", targetEntityID)
			return fmt.Errorf("Error when attempting to retrieve escape door entity transform component with entityID %s", targetEntityID)
		}

		escapeDoorTransform := escapeDoorTransformComponent.(*components.TransformComponent)
		// validate is within distance from player
		isWithinDistance := s.calcWithinDistance(playerTransform.X, playerTransform.Y, escapeDoorTransform.X, escapeDoorTransform.Y)

		if !isWithinDistance {
			slog.Debug("Escape door entity out of range for interaction", "targetID", targetEntityID, "playerID", playerID)
			s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "too far away to interact")
			return ErrOutOfRange
		}

		// check if door is locked
		lockableComp, hasLockable := targetEntity.GetComponent(ecs.ComponentTypeLockable)
		if !hasLockable {
			slog.Error("Escape door does not have lockable component", "targetEntityID", targetEntityID)
			return fmt.Errorf("escape door does not have lockable component")
		}

		lockable := lockableComp.(*components.LockableComponents)

		if lockable.IsLocked {
			slog.Debug("Escape door is still locked", "targetID", targetEntityID, "playerID", playerID)
			s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "escape door is locked")
			return fmt.Errorf("escape door is locked")
		}

		// door is unlocked, open it and let player escape!
		openableComp, hasOpenable := targetEntity.GetComponent(ecs.ComponentTypeOpenable)
		if hasOpenable {
			openable := openableComp.(*components.OpenableComponent)
			if !openable.IsOpen {
				openable.IsOpen = true
				slog.Info("Escape door opened!", "playerID", playerID)
			}
		}

		// trigger escape after a short delay to allow door animation
		slog.Info("Player is escaping through the door!", "playerID", playerID)
		s.handlePlayerEscape(playerID)

		// release container cache so other players can use this escape door
		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.containerInteractedCache, targetEntityID)
			s.mu.Unlock()
		}()

		// add player to interacted cache
		s.mu.Lock()
		s.playerInteractedCache[playerEntityID] = true
		s.mu.Unlock()

		go func() {
			time.Sleep(time.Millisecond * 100)
			s.mu.Lock()
			delete(s.playerInteractedCache, playerEntityID)
			s.mu.Unlock()
		}()
	}

	return nil
}

/**
* climbStairs takes the party up a floor when every living, non-escaped delver
* stands within the stairs' interact range (FS-F6F88 §Requirements 17–22).
*
* The gather check is made at the moment of interaction: the dead and the
* escaped never count, and a delver mid-reconnect still has an entity, so still
* counts until the reconnection timeout removes it. A gathered party asks for
* the climb; the loop applies it between ticks.
**/
func (s *Session) climbStairs(playerID uuid.UUID, playerTransform *components.TransformComponent, stairs *ecs.Entity) error {
	tc, hasTransform := stairs.GetComponent(ecs.ComponentTypeTransform)
	if !hasTransform {
		return fmt.Errorf("stairs %s have no transform: %w", stairs.ID, ErrComponentNotFound)
	}
	at := tc.(*components.TransformComponent)

	if !s.calcWithinDistance(playerTransform.X, playerTransform.Y, at.X, at.Y) {
		slog.Debug("Stairs out of range for interaction", "targetID", stairs.ID, "playerID", playerID)
		s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "too far away to interact")
		return ErrOutOfRange
	}

	missing := s.delversAwayFrom(at.X, at.Y)
	if missing > 0 {
		slog.Debug("Climb refused: party not gathered", "playerID", playerID, "missing", missing)
		s.sendRefusalToPlayer(playerID, string(constants.ActionInteract), "the party has not gathered at the stairs",
			"party_not_gathered", map[string]interface{}{"missing": missing})
		return fmt.Errorf("climb stairs %s, %d delvers missing: %w", stairs.ID, missing, ErrPartyNotGathered)
	}

	slog.Info("Party gathered at the stairs, climbing", "sessionID", s.ID, "playerID", playerID)
	s.requestFloorChange(stairs.ID)

	return nil
}

// delversAwayFrom counts the living, non-escaped delvers out of interact range
// of a point.
func (s *Session) delversAwayFrom(x, y float64) int {
	away := 0
	for _, entity := range s.EntityManager.GetAllEntities() {
		if !systems.InPlay(entity) {
			continue
		}

		tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		at := tc.(*components.TransformComponent)
		if !s.calcWithinDistance(at.X, at.Y, x, y) {
			away++
		}
	}
	return away
}

// pickUpItem moves an item out of the container holding it and into the
// delver's satchel, in one step on the tick. Only an item lying in an open
// container (a chest or a drop pile) within reach is taken: one carried or worn
// by any delver, or lying in no container, is in no container's list, so it is
// refused and nothing moves; every item has one owner (FS-4R9M9 R49). A refused
// pickup gives the item back to interaction, so it can be taken once in reach.
// I-77AB6-12.
func (s *Session) pickUpItem(playerEntity *ecs.Entity, at *components.TransformComponent, itemID uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.moveItemToSatchel(playerEntity, at, itemID); err != nil {
		delete(s.containerInteractedCache, itemID)
		return err
	}
	return nil
}

// moveItemToSatchel is pickUpItem's body. Callers hold the world's lock.
func (s *Session) moveItemToSatchel(playerEntity *ecs.Entity, at *components.TransformComponent, itemID uuid.UUID) error {
	satchelComp, ok := playerEntity.GetComponent(ecs.ComponentTypeItemIDList)
	if !ok {
		return fmt.Errorf("pick up item %s: satchel: %w", itemID, ErrComponentNotFound)
	}
	satchel, ok := satchelComp.(*components.ItemIDListComponent)
	if !ok {
		return fmt.Errorf("pick up item %s: satchel: %w", itemID, ErrComponentCouldNotBeAsserted)
	}

	container, held, index := containerHolding(s.EntityManager, itemID)
	if container == nil {
		return fmt.Errorf("pick up item %s: %w", itemID, ErrItemNotInContainer)
	}

	openableComp, ok := container.GetComponent(ecs.ComponentTypeOpenable)
	if !ok || !openableComp.(*components.OpenableComponent).IsOpen {
		return fmt.Errorf("pick up item %s: %w", itemID, ErrContainerClosed)
	}

	transformComp, ok := container.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return fmt.Errorf("pick up item %s: container transform: %w", itemID, ErrComponentNotFound)
	}
	where := transformComp.(*components.TransformComponent)
	if !s.calcWithinDistance(at.X, at.Y, where.X, where.Y) {
		return fmt.Errorf("pick up item %s: %w", itemID, ErrOutOfRange)
	}

	held.ItemIDs = slices.Delete(slices.Clone(held.ItemIDs), index, index+1)
	satchel.ItemIDs = append(satchel.ItemIDs, itemID)
	return nil
}

// containerHolding is the container whose item list holds the item, that list,
// and the item's place in it; a nil container when no container holds it.
func containerHolding(em *ecs.EntityManager, itemID uuid.UUID) (*ecs.Entity, *components.ItemIDListComponent, int) {
	for _, entity := range em.GetAllEntities() {
		if !entity.HasComponent(ecs.ComponentTypeContainer) {
			continue
		}
		listComp, ok := entity.GetComponent(ecs.ComponentTypeItemIDList)
		if !ok {
			continue
		}
		list, ok := listComp.(*components.ItemIDListComponent)
		if !ok {
			continue
		}
		if index := slices.Index(list.ItemIDs, itemID); index >= 0 {
			return entity, list, index
		}
	}
	return nil, nil, -1
}

// handleEquip puts an item the delver carries on, or takes one they wear off,
// over the one slot list (systems.EquipmentSlots). Only the delver's own satchel
// is equipped from and only their own slots unequipped from, for every slot:
// anything else is refused and nothing moves. It runs on the tick (queueIntent).
func (s *Session) handleEquip(action constants.Action, playerEntityID uuid.UUID, itemEntityID uuid.UUID) error {

	// --- state retrieval and validation ---

	// -- player & equipment
	playerEntity, playerExists := s.EntityManager.GetEntity(playerEntityID)

	if !playerExists {
		slog.Error("Target player entity not found",
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrEntityNotFound
	}

	slog.Debug("Equipping item",
		"player_entity_id", playerEntityID,
		"item_entity_id", itemEntityID,
	)

	equipmentComp, exists := playerEntity.GetComponent(ecs.ComponentTypeEquipment)

	if !exists {
		slog.Error("Component not found in entity not found",
			"component_type", ecs.ComponentTypeEquipment,
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrComponentNotFound
	}

	equipment, ok := equipmentComp.(*components.EquipmentComponent)

	if !ok {
		slog.Error("Equipment component could not be asserted to expect typed.",
			"component_type", ecs.ComponentTypeEquipment,
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrComponentCouldNotBeAsserted
	}

	itemIDListComp, exists := playerEntity.GetComponent(ecs.ComponentTypeItemIDList)

	if !exists {
		slog.Error("Component not found in entity not found",
			"component_type", ecs.ComponentTypeItemIDList,
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrComponentNotFound
	}

	itemIDList, ok := itemIDListComp.(*components.ItemIDListComponent)

	if !ok {
		slog.Error("itemIDList component could not be asserted to expect typed.",
			"component_type", ecs.ComponentTypeEquipment,
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrComponentCouldNotBeAsserted
	}

	// -- item --
	itemEntity, itemExists := s.EntityManager.GetEntity(itemEntityID)

	if !itemExists {
		slog.Error("Target item entity not found",
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrEntityNotFound
	}

	itemComp, exists := itemEntity.GetComponent(ecs.ComponentTypeItem)

	if !exists {
		slog.Error("Component not found in entity not found",
			"component_type", ecs.ComponentTypeItem,
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrComponentNotFound
	}

	item, ok := itemComp.(*components.ItemComponent)

	if !ok {
		slog.Error("Item component could not be asserted to expect typed.",
			"component_type", ecs.ComponentTypeItem,
			"player_entity_id", playerEntityID,
			"item_entity_id", itemEntityID,
		)
		return ErrComponentCouldNotBeAsserted
	}

	// --- unequip: only what the delver wears comes off ---
	worn := wornSlotOf(equipment, itemEntityID)

	if action == constants.ActionUnequip {
		if worn == nil {
			return fmt.Errorf("unequip %s: %w", itemEntityID, ErrItemNotWorn)
		}
		*worn.Holder(equipment) = nil
		itemIDList.ItemIDs = append(itemIDList.ItemIDs, itemEntityID)
		return nil
	}

	// --- equip: only what the delver carries goes on ---

	// already worn: worn twice its affixes would count twice
	if worn != nil {
		return nil
	}

	// an id from a drop pile or another delver's satchel is never worn: it would
	// leave the run twice
	if !slices.Contains(itemIDList.ItemIDs, itemEntityID) {
		return fmt.Errorf("equip %s: %w", itemEntityID, ErrItemNotCarried)
	}

	slots := systems.SlotsFor(types.ItemType(item.ItemType), types.ArmorSlot(item.ArmorSlot))
	if len(slots) == 0 {
		return fmt.Errorf("equip %s of type %q: %w", itemEntityID, item.ItemType, ErrItemNotEquippable)
	}

	// -- level requirement: equip only, unequip is never gated (FS-BDA7X R32) --
	level := 1
	if sc, ok := playerEntity.GetComponent(ecs.ComponentTypeStats); ok {
		level = sc.(*components.StatsComponent).Level
	}
	if !canWear(item.RequiredLevel, level) {
		s.mu.RLock()
		playerID := s.playerEntityIDToPlayerID[playerEntityID]
		s.mu.RUnlock()
		s.sendErrorToPlayer(playerID, string(action), requiredLevelMessage(item.RequiredLevel))
		return fmt.Errorf("equip %s at level %d: %w", itemEntityID, level, ErrBelowRequiredLevel)
	}

	// the first empty slot the item fits; with all of them full, the first is
	// replaced and what it held goes back to the satchel (FS-4R9M9 R42).
	// Consumables are never swapped out.
	target := firstEmptySlot(equipment, slots)
	if target == nil && types.ItemType(item.ItemType) == types.ItemTypeConsumable {
		return fmt.Errorf("All consumable slots full")
	}
	itemIDList.ItemIDs = removeItem(itemIDList.ItemIDs, itemEntityID)
	if target == nil {
		target = &slots[0]
		itemIDList.ItemIDs = append(itemIDList.ItemIDs, **target.Holder(equipment))
	}
	*target.Holder(equipment) = &itemEntityID

	return nil
}

// wornSlotOf is the slot the item is worn in, nil when it is not worn.
func wornSlotOf(equipment *components.EquipmentComponent, itemID uuid.UUID) *systems.EquipmentSlot {
	for _, slot := range systems.EquipmentSlots {
		if held := *slot.Holder(equipment); held != nil && *held == itemID {
			return &slot
		}
	}
	return nil
}

// firstEmptySlot is the first of the slots holding nothing, nil when all are full.
func firstEmptySlot(equipment *components.EquipmentComponent, slots []systems.EquipmentSlot) *systems.EquipmentSlot {
	for _, slot := range slots {
		if *slot.Holder(equipment) == nil {
			return &slot
		}
	}
	return nil
}

// removeItem is the list without the item; a list that never held it comes back
// as it was.
func removeItem(items []uuid.UUID, targetItemID uuid.UUID) []uuid.UUID {
	result := make([]uuid.UUID, 0, len(items))

	for _, itemID := range items {
		if itemID == targetItemID {
			continue
		}
		result = append(result, itemID)
	}

	return result
}

func (s *Session) handlePlayerEscape(playerID uuid.UUID) {
	s.mu.Lock()
	s.escapeSuccess = true
	s.mu.Unlock()

	s.mu.Lock()
	playerEntityID, ok := s.playerIDToEntitiesID[playerID]
	s.mu.Unlock()

	if !ok {
		slog.Error("Player entity ID not found", "playerID", playerID)
		return
	}

	playerEntity, exists := s.EntityManager.GetEntity(playerEntityID)
	if !exists {
		slog.Error("Player entity not found", "playerEntityID", playerEntityID)
		return
	}

	playerComp, hasPlayer := playerEntity.GetComponent(ecs.ComponentTypePlayer)
	if !hasPlayer {
		slog.Error("Player component not found", "playerEntityID", playerEntityID)
		return
	}
	player := playerComp.(*components.PlayerComponent)
	player.Escape = true

	// out of play from here: their moves are refused, so stop them now
	// (FS-77AB6 §Requirements 17)
	if vc, ok := playerEntity.GetComponent(ecs.ComponentTypeVelocity); ok {
		velocity := vc.(*components.VelocityComponent)
		velocity.VX, velocity.VY = 0, 0
	}
	slog.Info("Player escaped!", "playerID", playerID, "username", player.Username)

}

// handleAttack validates a targeted attack and records it as an intent. Nothing
// is resolved here: range, cooldown and damage belong to the CombatSystem on the
// next tick. FS-77AB6 §Requirements 2.
func (s *Session) handleAttack(playerID uuid.UUID, enemyEntityID uuid.UUID) error {
	if err := s.combatAllowed(); err != nil {
		return err
	}
	if err := s.delverInPlay(playerID); err != nil {
		return fmt.Errorf("attack: %w", err)
	}

	if _, enemyExists := s.EntityManager.GetEntity(enemyEntityID); !enemyExists {
		return fmt.Errorf("attack: target %s: %w", enemyEntityID, ErrEntityNotFound)
	}

	return s.recordAttackIntent(playerID, components.AttackIntent{
		Kind:           components.AttackTargeted,
		TargetEntityID: enemyEntityID,
	})
}

// handleCastSkill validates a skill request and records it as an intent. Mana,
// cooldown, projectiles and damage are the CombatSystem's, on the next tick.
func (s *Session) handleCastSkill(playerID uuid.UUID, skillID string, targetX, targetY float64) error {
	if err := s.combatAllowed(); err != nil {
		return err
	}
	if err := s.delverInPlay(playerID); err != nil {
		return fmt.Errorf("cast_skill: %w", err)
	}

	kind, ok := systems.SkillAttackKind(skillID)
	if !ok {
		return fmt.Errorf("cast_skill %q: %w", skillID, ErrUnknownSkill)
	}

	return s.recordAttackIntent(playerID, components.AttackIntent{
		Kind:    kind,
		TargetX: targetX,
		TargetY: targetY,
	})
}

// delverInPlay refuses an action from a delver who has died or escaped. They
// stay in the world, receiving state, until the run ends, but they no longer
// act in it (FS-77AB6 §Requirements 17). A player with no body here is left to
// the handler's own lookup to report.
func (s *Session) delverInPlay(playerID uuid.UUID) error {
	s.mu.RLock()
	playerEntityID, ok := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()
	if !ok {
		return nil
	}

	playerEntity, ok := s.EntityManager.GetEntity(playerEntityID)
	if !ok || systems.InPlay(playerEntity) {
		return nil
	}

	return fmt.Errorf("player %s: %w", playerID, ErrDelverOutOfPlay)
}

func (s *Session) recordAttackIntent(playerID uuid.UUID, intent components.AttackIntent) error {
	s.mu.RLock()
	playerEntityID, ok := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()

	if !ok {
		return fmt.Errorf("record attack intent: player %s: %w", playerID, ErrEntityNotFound)
	}

	playerEntity, ok := s.EntityManager.GetEntity(playerEntityID)
	if !ok {
		return fmt.Errorf("record attack intent: player entity %s: %w", playerEntityID, ErrEntityNotFound)
	}

	ic, ok := playerEntity.GetComponent(ecs.ComponentTypeAttackIntent)
	if !ok {
		return fmt.Errorf("record attack intent: player entity %s has no attack intents: %w", playerEntityID, ErrComponentNotFound)
	}
	intents := ic.(*components.AttackIntentComponent)
	intents.Pending = append(intents.Pending, intent)

	return nil
}

const (
	weaponDropRate     float64 = 0.2
	armorDropRate      float64 = 0.3
	consumableDropRate float64 = 0.5
)

/**
* generateItems generates new random items from the session itemPool base,
* creates item entities, and returns their IDs.
**/
func (s *Session) generateItems() ([]uuid.UUID, error) {
	slog.Debug("generating items from itemPool when opening container",
		"s.itemPool", s.itemPool)

	// decide on RNG values
	numberOfItems := utils.GenRandomBetween(2, 4)

	// distribution of items
	var numberOfWeapons int
	var numberOfArmor int
	var numberOfConsumables int

	var rollRangeStart float64 = 1
	var rollRangeEnd float64 = 10

	for i := 0; i < numberOfItems; i++ {
		// roll to determine which type to get
		roll := utils.GenRandomBetween(int(rollRangeStart), int(rollRangeEnd))
		slog.Debug("Rolled based on range.",
			"roll", roll,
			"rollRangeStart", rollRangeStart,
			"rollRangeEnd", rollRangeEnd)

		weaponWeight := math.RoundToEven(float64((rollRangeEnd - rollRangeStart + 1) * weaponDropRate))

		slog.Debug("Calculated weaponWeight.",
			"weaponWeight", weaponWeight)
		armorWeight := math.RoundToEven(float64((rollRangeEnd - rollRangeStart + 1) * armorDropRate))
		slog.Debug("Calculated armorWeight.",
			"armorWeight", armorWeight)

		if roll <= int(weaponWeight) {
			numberOfWeapons++
			continue
		}

		if roll > int(weaponWeight) && roll <= int(armorWeight+weaponWeight) {
			numberOfArmor++
			continue
		}

		numberOfConsumables++
	}

	// validate item pool correctly generated items
	if s.itemPool.count() <= 0 {
		return nil, fmt.Errorf("Item pool was empty.")
	}

	// chests never drop rings (FS-4R9M9 §Requirements 47)
	drop := s.chestDrop()
	newItemEntityIDs := make([]uuid.UUID, 0, numberOfArmor+numberOfWeapons+numberOfConsumables)
	newItemEntityIDs = append(newItemEntityIDs, s.dropLoot(types.ItemTypeWeapon, s.itemPool.Weapons, numberOfWeapons, drop)...)
	newItemEntityIDs = append(newItemEntityIDs, s.dropLoot(types.ItemTypeArmor, s.itemPool.Armor, numberOfArmor, drop)...)
	newItemEntityIDs = append(newItemEntityIDs, s.dropLoot(types.ItemTypeConsumable, s.itemPool.Consumables, numberOfConsumables, drop)...)

	return newItemEntityIDs, nil
}

/**
* sendErrorToPlayer sends a structured error message to a specific player.
* It provides user friendly messages to the client.
**/
func (s *Session) sendErrorToPlayer(playerID uuid.UUID, action string, userMessage string) {
	s.sender.SendMessageToPlayer(playerID, types.Message{
		Action: action,
		Payload: map[string]interface{}{
			"success": false,
			"message": userMessage,
		},
	})
}

/**
* sendRefusalToPlayer is the error reply with a machine-readable reason and its
* details beside the message, so the client can write its own copy.
**/
func (s *Session) sendRefusalToPlayer(playerID uuid.UUID, action, userMessage, reason string, details map[string]interface{}) {
	payload := map[string]interface{}{
		"success": false,
		"message": userMessage,
		"reason":  reason,
	}
	for key, value := range details {
		payload[key] = value
	}

	s.sender.SendMessageToPlayer(playerID, types.Message{Action: action, Payload: payload})
}

/**
* checks if a target is within 2d cartesian coordinates range of another.
**/
func (s *Session) calcWithinDistance(x, y, xTarget, yTarget float64) bool {
	// calculate range via range provided by interactable
	xDiff := math.Pow(x-xTarget, 2)
	yDiff := math.Pow(y-yTarget, 2)
	distanceBetween := math.Sqrt(xDiff + yDiff)

	// too far
	if distanceBetween > constants.DefaultInteractableRange {
		return false
	}

	return true
}

/**
* addItem creates an item entity from config and returns its ID
**/
func (s *Session) AddItem(itemConfig types.ItemConfig) uuid.UUID {
	s.mu.Lock()
	defer s.mu.Unlock()
	entity := CreateItemEntity(s.EntityManager, itemConfig)
	return entity.ID
}

/**
* AddItemWithUnLocked creates an item entity from config and returns its ID with ulocked
**/
func (s *Session) AddItemWithUnLocked(itemConfig types.ItemConfig) uuid.UUID {
	entity := CreateItemEntity(s.EntityManager, itemConfig)
	return entity.ID
}

// recordEliminations records the delvers eliminated on this tick, in the order
// they fell. A world already shut down records nothing: its results have been
// read, or are being read, by endSession.
func (s *Session) recordEliminations(eliminated []types.Player) {
	if len(eliminated) == 0 {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return
	}

	for _, player := range eliminated {
		slog.Debug("Player eliminated",
			"ID", player.ID,
			"Username", player.Username,
			"SessionID", player.CurrentGameSessionId)

		s.eliminations[player.ID] = len(s.eliminations)
	}
}

/**
* notifyPlayersOfGameEnd sends each player an end_game action with their
* final position. Position 1 = winner; higher numbers = earlier elimination.
**/
func (s *Session) notifyPlayersOfGameEnd() {
	// no concurrent processes here but gather info
	// during lock to get a consistent copy
	s.mu.RLock()
	totalPlayers := len(s.playerIDToEntitiesID)
	playerIDs := make([]uuid.UUID, 0, totalPlayers)
	for pid := range s.playerIDToEntitiesID {
		playerIDs = append(playerIDs, pid)
	}
	eliminations := make(map[uuid.UUID]int, len(s.eliminations))
	for k, v := range s.eliminations {
		eliminations[k] = v
	}
	s.mu.RUnlock()

	// act on it outside without holding lock

	for _, pid := range playerIDs {
		position := 1
		if idx, eliminated := eliminations[pid]; eliminated {
			position = totalPlayers - idx
		}

		result := "survived" // default survived
		if _, eliminated := eliminations[pid]; eliminated {
			result = "eliminated"
		}
		// check escape
		if playerEntityID, ok := s.playerIDToEntitiesID[pid]; ok {
			if playerEntity, exists := s.EntityManager.GetEntity(playerEntityID); exists {
				if pc, hasPlayer := playerEntity.GetComponent(ecs.ComponentTypePlayer); hasPlayer {
					player := pc.(*components.PlayerComponent)
					if player.Escape {
						result = "escaped"
					}
				}
			}
		}

		if err := s.sender.SendMessageToPlayer(pid, types.Message{
			Action: string(constants.ActionEndGame),
			Payload: map[string]interface{}{
				"player_id": pid.String(),
				"position":  position,
				"result":    result,
			},
		}); err != nil {
			slog.Error("failed to send end_game to player",
				"sessionID", s.ID, "playerID", pid, "err", err)
		}
	}
}

/**
* Handles all processes at the end of a match session.
**/
func (s *Session) endSession() {
	slog.Info("Shutting down game session", "sessionID", s.ID)

	// notify each player of their final position before tearing channels down
	s.notifyPlayersOfGameEnd()

	// snapshot what every delver wears and carries while they are still in the
	// world: going home removes their entities (FS-4R9M9 R49, I-4R9M9-15)
	rawMatchState := s.getRawMatchState()

	// what each character earned, read alongside the snapshot for the same
	// reason (FS-BDA7X §Requirements 22–23)
	rawMatchState.Progress = s.runProgress()

	// send everyone home while this world still exists to move them out of,
	// their progress kept first so the HUB seats them at the run's result
	// (FS-BDA7X §Requirements 24). The hub is not one of these: it has no end.
	if s.worldType == types.WorldTypeRun {
		s.sessionCloser.ApplyRunProgress(rawMatchState.Progress)
		s.sessionCloser.ReturnPlayersToHub(s.ID)
	}

	// remove session from server
	s.sessionCloser.CloseSession(s.ID)

	// clean up
	s.Shutdown()

	// eliminations are recorded on the tick, and no longer once Shutdown has
	// closed the world, so the order read after it is final
	s.mu.RLock()
	rawMatchState.EliminationOrder = s.eliminations
	s.mu.RUnlock()
	s.eventEmitter.PublishMatchComplete(context.Background(), rawMatchState)
}

// runProgress is what the run did to every member's character in play: each
// seated member as their body stands now, and each member who earned experience
// and was removed before the end by that alone. FS-BDA7X §Requirements 22–24.
func (s *Session) runProgress() []types.RunProgress {
	byMember := make(map[uuid.UUID]types.RunProgress)
	for _, gain := range s.runExperience.Gains() {
		byMember[gain.MemberID] = types.RunProgress{
			MemberID:    gain.MemberID,
			CharacterID: gain.CharacterID,
			Gained:      int64(gain.Amount),
		}
	}

	s.mu.RLock()
	for memberID, entityID := range s.playerIDToEntitiesID {
		entity, exists := s.EntityManager.GetEntity(entityID)
		if !exists {
			continue
		}
		pc, hasPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		sc, hasStats := entity.GetComponent(ecs.ComponentTypeStats)
		if !hasPlayer || !hasStats {
			continue
		}
		stats := sc.(*components.StatsComponent)

		progress := byMember[memberID]
		progress.MemberID = memberID
		progress.CharacterID = pc.(*components.PlayerComponent).CharacterID
		progress.Seated = true
		progress.Level = stats.Level
		progress.Experience = int64(stats.Experience)
		byMember[memberID] = progress
	}
	s.mu.RUnlock()

	progress := make([]types.RunProgress, 0, len(byMember))
	for _, p := range byMember {
		progress = append(progress, p)
	}
	return progress
}

/**
* Converts game specific entities into raw data for processing.
**/
// none of this matters
func (s *Session) getRawMatchState() *types.RawMatchState {
	// TODO: update this to fixed player count once player count is fixed
	rawPlayers := make([]types.RawPlayerState, 0)

	entities := s.EntityManager.GetAllEntities()

	// -- item data --

	itemsMap := make(map[uuid.UUID]*components.ItemComponent)
	for _, entity := range entities {

		itemComp, isItem := entity.GetComponent(ecs.ComponentTypeItem)
		if !isItem {
			continue
		}

		item, ok := itemComp.(*components.ItemComponent)
		if !ok {
			continue
		}

		itemsMap[entity.ID] = item
	}

	// --- player data ---

	for _, entity := range entities {
		playerComponent, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		// escapeDoorComp, _ := entity.GetComponent(ecs.ComponentTypeEscapeDoor)

		if isPlayer {
			// assert back to component's original type
			playerState := playerComponent.(*components.PlayerComponent)
			statsComp, hasStats := entity.GetComponent(ecs.ComponentTypeStats)
			equipmentComp, hasEquipment := entity.GetComponent(ecs.ComponentTypeEquipment)
			itemIDListComp, hasItemIDList := entity.GetComponent(ecs.ComponentTypeItemIDList)

			// malformed player, just skip
			if !hasEquipment || !hasStats || !hasItemIDList {
				slog.Warn("Malformed player state object when rtying to extract raw state at match end.",
					"player_id", playerState.MemberID)
				continue
			}

			// -- stats --
			stats, statsOk := statsComp.(*components.StatsComponent)
			if !statsOk {
				stats = &components.StatsComponent{}
			}

			// -- equipment --
			equipment, equipmentOk := equipmentComp.(*components.EquipmentComponent)
			extractedEquipment := types.ExtractedEquipment{}

			if equipmentOk {
				extractedEquipment = extractedEquipmentOf(itemsMap, equipment)
			}

			// -- inventory items --
			inventory := []*types.ExtractedItem{}

			if itemIDList, itemIDListOk := itemIDListComp.(*components.ItemIDListComponent); itemIDListOk {

				for _, itemID := range itemIDList.ItemIDs {
					item, ok := itemsMap[itemID]
					if !ok {
						continue
					}

					inventory = append(inventory, extractedItemFrom(item))
				}

			}

			rawPlayers = append(rawPlayers, types.RawPlayerState{
				MemberID:  playerState.MemberID.String(),
				Username:  playerState.Username,
				Kills:     int32(stats.Kills),
				Deaths:    int32(stats.Deaths),
				Escape:    playerState.Escape,
				Equipment: extractedEquipment,
				Inventory: inventory,
			})
		}
	}

	return &types.RawMatchState{
		SessionID: s.ID,
		// TODO: need to add started at in session struct for tracking
		StartedAt:        time.Now(),
		EndedAt:          time.Now(),
		Players:          rawPlayers,
		EliminationOrder: s.eliminations,
	}
}

func (s *Session) InitialSystems() {
	// creates and setsup match progress entity within the entity manager
	CreateMatchProgressEntity(s.EntityManager)
}

type PlaceArea struct {
	X, Y, W, H float64
}

type BuildingType string

const (
	BuildingTypeSmall  BuildingType = "small"
	BuildingTypeMedium BuildingType = "medium"
	BuildingTypeLarge  BuildingType = "large"
)

type Building struct {
	W, H float64
}

// firstFloor is the floor every run begins on.
const firstFloor = 1

/**
* InitialMapObjects loads what a run keeps for its whole life, then builds its
* first floor.
*
* The item catalogue is session-scoped: loaded once here and reused on every
* floor, as the rarity list loaded at build is, so a floor change never calls
* the items service (FS-F6F88 §Requirements 14).
**/
func (s *Session) InitialMapObjects() {
	// deliberately non-fatal: a session with no loot still runs
	if err := s.InitializeItems(context.Background()); err != nil {
		slog.Error("Session created without ground items.",
			"error", err,
		)
	}

	s.buildFloor(firstFloor)
}

/**
* buildFloor is the floor build step: the one place a floor is made, for the
* first floor and every one after it (FS-F6F88 §Requirements 8). It lays out the
* run map, buildings, a chest, a locked escape door and the switch that unlocks
* it, on empty ground, then populates it with monsters levelled to its depth.
*
* depth is the floor being built. The roster must already stand on the floor:
* its monsters are levelled to the party and kept clear of every delver
* (FS-77AB6 §Requirements 22). A floor built with nobody on it stays empty.
**/
func (s *Session) buildFloor(depth int) {
	slog.Debug("Building floor", "sessionID", s.ID, "depth", depth)

	// a floor is placed on empty ground: nothing from an earlier floor occupies it
	s.objectOccupiedPlaceAreas = nil

	s.CreateContainer()

	buildingConfigs := map[BuildingType]Building{
		BuildingTypeSmall:  {W: 300, H: 200},
		BuildingTypeMedium: {W: 400, H: 300},
		BuildingTypeLarge:  {W: 500, H: 400},
	}

	for _, buildConfig := range buildingConfigs {
		s.CreateBuilding(buildConfig)
	}
	// add EscapeDoor
	exitDoorX := constants.ContainerWidthRadius + rand.Float64()*(s.mapWidth-2*constants.ContainerWidthRadius)
	exitDoorY := constants.ContainerHeightRadius + rand.Float64()*(s.mapHeight-2*constants.ContainerHeightRadius)
	exitDoor := CreateEscapeDoorEntity(s.EntityManager, EscapeConfig{
		X: exitDoorX,
		Y: exitDoorY,
	})

	// add Switch
	switchX := constants.ContainerWidthRadius + rand.Float64()*(s.mapWidth-2*constants.ContainerWidthRadius)
	switchY := constants.ContainerHeightRadius + rand.Float64()*(s.mapHeight-2*constants.ContainerHeightRadius)
	switchEntity := CreateSwitchEntity(s.EntityManager, SwitchConfig{
		X:        switchX,
		Y:        switchY,
		SwitchID: 1,
	})

	// the switch handler reads these from the message goroutine
	s.mu.Lock()
	s.exitDoorEntityID = exitDoor.ID
	s.switchEntityIDs = []uuid.UUID{switchEntity.ID}
	s.mu.Unlock()

	// the escape door and switch are not placed through the occupied-area
	// check, but what comes after them must keep clear of them
	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas,
		centredArea(exitDoorX, exitDoorY, constants.ContainerWidthRadius, constants.ContainerHeightRadius),
		centredArea(switchX, switchY, constants.ContainerWidthRadius, constants.ContainerHeightRadius),
	)

	// every floor but the top has a way up; placed before the monsters, so they
	// keep clear of it
	if depth < constants.RunFloorCount {
		s.CreateStairs()
	}

	s.populateMonsters(depth, depth == constants.RunFloorCount)
}

// centredArea is the area of half-width rw and half-height rh centred on (x, y).
func centredArea(x, y, rw, rh float64) PlaceArea {
	return PlaceArea{X: x - rw, Y: y - rh, W: 2 * rw, H: 2 * rh}
}

// requestFloorChange asks for the run to move up a floor by the stairs given. It
// is safe from any goroutine; the change itself waits for the loop, between
// ticks. Asking again before the loop applies it is still one floor change.
func (s *Session) requestFloorChange(viaStairs uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.ascentRequests == nil {
		s.ascentRequests = make(map[uuid.UUID]bool)
	}
	s.ascentRequests[viaStairs] = true
}

// applyRequestedFloorChange regenerates the floor if a change was asked for by
// stairs that still stand. Called by the loop between ticks, never during one.
//
// A request names its stairs so that one made against a floor the party has
// already left (a delver who passed the gather check just before a climb and
// asked just after it) finds its stairs cleared, and is dropped rather than
// becoming a second climb (FS-F6F88 §Requirements 21).
func (s *Session) applyRequestedFloorChange() {
	s.mu.Lock()
	requests := s.ascentRequests
	s.ascentRequests = nil
	s.mu.Unlock()

	for stairsID := range requests {
		stairs, stands := s.EntityManager.GetEntity(stairsID)
		if !stands || !stairs.HasComponent(ecs.ComponentTypeStairs) {
			slog.Debug("Floor change dropped: its stairs are gone", "sessionID", s.ID, "stairsID", stairsID)
			continue
		}

		if err := s.regenerateFloor(); err != nil {
			slog.Error("Floor change refused", "sessionID", s.ID, "error", err)
		}
		return
	}
}

/**
* regenerateFloor moves the run up one floor, in place: same session, same ECS
* world (FS-F6F88 §Requirements 9–16).
*
* It clears every floor entity, raises the floor depth and runs the floor build
* step again for the new depth. A floor entity is defined by exclusion: anything
* that is not a delver, not an item a delver wears or carries, and not the
* run-level entity.
*
* It must run between ticks, on the goroutine that ticks the world, so that no
* broadcast ever holds entities from two floors (§16).
**/
func (s *Session) regenerateFloor() error {
	entities := s.EntityManager.GetAllEntities()

	floor, ok := systems.CurrentFloor(entities)
	if !ok {
		return fmt.Errorf("regenerate floor in session %s: %w", s.ID, ErrNoFloors)
	}
	if floor.Depth >= floor.Count {
		return fmt.Errorf("regenerate floor %d of %d in session %s: %w", floor.Depth, floor.Count, s.ID, ErrTopFloor)
	}

	keep := persistentEntityIDs(entities)
	for _, entity := range entities {
		if !keep[entity.ID] {
			s.EntityManager.RemoveEntity(entity.ID)
		}
	}

	// the interaction rate limits were about the old floor's objects. A pending
	// release goroutine deleting from the fresh map is harmless.
	s.mu.Lock()
	s.playerInteractedCache = make(map[uuid.UUID]bool, constants.DefautMaxSessionPlayers)
	s.containerInteractedCache = make(map[uuid.UUID]bool)
	s.mu.Unlock()

	floor.Depth++

	// the party stands on the new floor before it is built, so its monsters
	// spawn clear of them
	s.settlePartyOnNewFloor(entities)

	s.buildFloor(floor.Depth)

	return nil
}

/**
* settlePartyOnNewFloor sets living, non-escaped delvers down on the new floor at
* a fresh spawn point, standing still. The dead stay on the floor they fell on:
* their record persists, their body is no longer present. The escaped are already
* gone. No delver keeps an attack aimed at the old floor (FS-F6F88 §13, §15).
**/
func (s *Session) settlePartyOnNewFloor(entities []*ecs.Entity) {
	for _, entity := range entities {
		pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		if !isPlayer {
			continue
		}
		player := pc.(*components.PlayerComponent)

		if ic, ok := entity.GetComponent(ecs.ComponentTypeAttackIntent); ok {
			ic.(*components.AttackIntentComponent).Pending = nil
		}
		// nor a charge running on from the old floor
		entity.RemoveComponent(ecs.ComponentTypeDash)

		if player.Escape {
			continue
		}

		if vc, ok := entity.GetComponent(ecs.ComponentTypeVelocity); ok {
			velocity := vc.(*components.VelocityComponent)
			velocity.VX, velocity.VY = 0, 0
		}

		if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok && hc.(*components.HealthComponent).IsEliminated {
			player.LeftBehind = true
			continue
		}

		if tc, ok := entity.GetComponent(ecs.ComponentTypeTransform); ok {
			transform := tc.(*components.TransformComponent)
			transform.X, transform.Y = s.spawnPoint()
		}
	}
}

// persistentEntityIDs is what survives a floor change: every delver, every item
// a delver's equipment or satchel references, and the run-level entity.
func persistentEntityIDs(entities []*ecs.Entity) map[uuid.UUID]bool {
	keep := make(map[uuid.UUID]bool)

	for _, entity := range entities {
		if entity.HasComponent(ecs.ComponentTypeMatchProgress) || entity.HasComponent(ecs.ComponentTypeFloor) {
			keep[entity.ID] = true
			continue
		}

		if !entity.HasComponent(ecs.ComponentTypePlayer) {
			continue
		}
		keep[entity.ID] = true

		if ec, ok := entity.GetComponent(ecs.ComponentTypeEquipment); ok {
			for _, itemID := range systems.WornIDs(ec.(*components.EquipmentComponent)) {
				keep[itemID] = true
			}
		}

		if lc, ok := entity.GetComponent(ecs.ComponentTypeItemIDList); ok {
			for _, itemID := range lc.(*components.ItemIDListComponent).ItemIDs {
				keep[itemID] = true
			}
		}
	}

	return keep
}

func (s *Session) InitializeItems(ctx context.Context) error {
	data, err := s.itemsClient.ListItemTemplates(ctx) // data from items service

	if err != nil {
		slog.Error("Error when attempting to get list of base armors for game creation.",
			"error", err,
		)
		return fmt.Errorf("listing item templates: %w", err)
	}

	// An empty catalogue is a degraded state, not a failure: the map is still playable,
	// it just has no loot on the ground. Seeding items must never stop a session starting.
	if data == nil || len(data.Items) == 0 {
		slog.Warn("No item templates available, session starts with no ground items.")
		return nil
	}

	pool, err := buildLootPool(data.Items)
	if err != nil {
		slog.Error("Error when attempting to build the loot pool during game creation.",
			"error", err,
		)
		return fmt.Errorf("building loot pool: %w", err)
	}
	s.itemPool = pool

	return nil
}

/**
* loadLootRarities fetches the rarity tiers drops roll against. Failure is not
* fatal: with no rarities, drops keep base stats and carry no rarity id.
**/
func (s *Session) loadLootRarities(ctx context.Context) []lootRarity {
	resp, err := s.itemsClient.ListItemRarities(ctx)
	if err != nil || resp == nil || len(resp.ItemRarities) == 0 {
		slog.Warn("No item rarities available, drops are unscaled with no rarity.",
			"error", err,
		)
		return nil
	}

	rarities := make([]lootRarity, 0, len(resp.ItemRarities))
	for _, r := range resp.ItemRarities {
		rarities = append(rarities, lootRarity{ID: r.Id, Code: r.RarityCode, DropRate: r.DropRateMultiplier})
	}
	return rarities
}

func (s *Session) IsAreaOccupied(placeArea PlaceArea) bool {
	for _, occupiedArea := range s.objectOccupiedPlaceAreas {
		if placeArea.X < occupiedArea.X+occupiedArea.W &&
			placeArea.X+placeArea.W > occupiedArea.X &&
			placeArea.Y < occupiedArea.Y+occupiedArea.H &&
			placeArea.Y+placeArea.H > occupiedArea.Y {
			return true
		}
	}
	return false
}

func (s *Session) CreateContainer() {
	containerW := constants.ContainerWidthRadius*2 + 20
	containerH := constants.ContainerHeightRadius*2 + 20
	for i := 0; i < 100; i++ {
		placeArea := PlaceArea{
			X: rand.Float64() * (constants.MapWidth - containerW),
			Y: rand.Float64() * (constants.MapHeight - containerH),
			W: containerW,
			H: containerH,
		}
		if !s.IsAreaOccupied(placeArea) {
			// placeArea is top-left with padding=10, convert to center for AddContainer
			containerX := placeArea.X + 10 + constants.ContainerWidthRadius
			containerY := placeArea.Y + 10 + constants.ContainerHeightRadius

			s.AddContainer(containerX, containerY)
			s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, placeArea)
			break
		}
	}

}

// stairsPlacementAttempts is how many random spots the stairs try before the
// placement falls back to scanning the floor.
const stairsPlacementAttempts = 100

/**
* CreateStairs places the floor's stairs up through the occupied-area check.
*
* Unlike the chest, the stairs may not silently fail to place: a floor without
* them strands the party (FS-F6F88 §Requirements 7). Random spots come first, as
* for every other map object; if those run out, the floor is scanned in a grid
* for the first free spot; if the floor is full, they go in its middle.
**/
func (s *Session) CreateStairs() {
	// the footprint plus the same 10px padding a chest keeps
	const padding = 10.0
	w := 2*constants.StairsWidthRadius + 2*padding
	h := 2*constants.StairsHeightRadius + 2*padding

	place := func(area PlaceArea) {
		CreateStairsEntity(s.EntityManager, StairsConfig{X: area.X + area.W/2, Y: area.Y + area.H/2})
		s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, area)
	}

	for range stairsPlacementAttempts {
		area := PlaceArea{X: rand.Float64() * (s.mapWidth - w), Y: rand.Float64() * (s.mapHeight - h), W: w, H: h}
		if !s.IsAreaOccupied(area) {
			place(area)
			return
		}
	}

	for y := 0.0; y+h <= s.mapHeight; y += h / 2 {
		for x := 0.0; x+w <= s.mapWidth; x += w / 2 {
			area := PlaceArea{X: x, Y: y, W: w, H: h}
			if !s.IsAreaOccupied(area) {
				slog.Warn("Stairs placed by scan: random placement exhausted", "sessionID", s.ID)
				place(area)
				return
			}
		}
	}

	slog.Error("Stairs forced into the middle of the floor: no free spot", "sessionID", s.ID)
	place(PlaceArea{X: (s.mapWidth - w) / 2, Y: (s.mapHeight - h) / 2, W: w, H: h})
}

func (s *Session) CreateBuilding(buildConfig Building) {
	buildingPadding := 60.0
	buildingW := buildConfig.W + buildingPadding*2
	buildingH := buildConfig.H + buildingPadding*2
	for i := 0; i < 100; i++ {
		placeArea := PlaceArea{
			X: rand.Float64() * (s.mapWidth - buildingW),
			Y: rand.Float64() * (s.mapHeight - buildingH),
			W: buildingW,
			H: buildingH,
		}
		if !s.IsAreaOccupied(placeArea) {
			s.AddBuilding(placeArea.X+buildingPadding, placeArea.Y+buildingPadding, buildConfig.W, buildConfig.H, 20, 50)
			s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, placeArea)
			break
		}
	}
}
