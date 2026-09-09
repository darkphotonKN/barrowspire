package types

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Manages all message types for websocket connections.
**/

type Message struct {
	Action  string                 `json:"action"`
	Payload map[string]interface{} `json:"payload"`
	Error   *string                `json:"error,omitempty"`
}

/**
* Provides the abstraction for clients to interface with the websocket connections.
**/

type ClientPackage struct {
	Message Message
	Conn    *websocket.Conn
}

type ProjectileState struct {
	EntityID       uuid.UUID `json:"entity_id"`
	ProjectileType string    `json:"projectile_type"`
	Position       Position  `json:"position"`
	Velocity       Velocity  `json:"velocity"`
}

// WorldType names which kind of world a session runs. The client is told which
// one it is in; it never infers it from the shape of a broadcast.
// Vocabulary: game-service/CONTEXT.md.
type WorldType string

const (
	// WorldTypeHub is the shared, long-lived world players occupy between runs.
	WorldTypeHub WorldType = "hub"
	// WorldTypeRun is a short-lived world built for one match.
	WorldTypeRun WorldType = "run"
)

// represents entire game state that client receives
type ClientGameState struct {
	SessionID     uuid.UUID          `json:"session_id"`
	WorldType     WorldType          `json:"world_type"`
	CurrentPlayer *PlayerState       `json:"current_player"` // The recipient's player state
	OtherPlayers  []*PlayerState     `json:"other_players"`  // All other players
	Items         []uuid.UUID        `json:"items"`          // TODO: update with item entity converted into struct format
	Doors         []*DoorState       `json:"doors"`
	Walls         []*WallState       `json:"walls"`
	Containers    []*ContainerState  `json:"containers"`
	EscapeDoor    []*EscapeDoorState `json:"escape_doors"`
	Equipment     *EquipmentState    `json:"equipment"`
	Switch        []*SwitchState     `json:"switches"`
	Projectiles   []*ProjectileState `json:"projectiles"`
	EscapedCount  int                `json:"escaped_count"`
}

type BackendGameState struct {
	SessionID    uuid.UUID
	WorldType    WorldType
	Players      map[uuid.UUID]*PlayerState
	Items        []uuid.UUID
	Doors        []*DoorState
	Walls        []*WallState
	Containers   []*ContainerState
	EscapeDoor   []*EscapeDoorState
	Equipment    *EquipmentState
	Switch       []*SwitchState
	Projectiles  []*ProjectileState
	EscapedCount int
}

// ErrInvalidPayload marks a client payload that cannot be parsed. The payload
// arrives as map[string]interface{} straight off the socket, so every field read
// is a type assertion on client-controlled data.
var ErrInvalidPayload = errors.New("invalid payload")

// requireString reads a required string field. It never panics: a missing key
// yields a nil interface, and the single-value assertion form would take the
// process down with it.
func (m *Message) requireString(key string) (string, error) {
	value, ok := m.Payload[key].(string)
	if !ok {
		return "", fmt.Errorf("field %q is missing or not a string: %w", key, ErrInvalidPayload)
	}
	return value, nil
}

// requireFloat reads a required number field. JSON numbers decode to float64.
func (m *Message) requireFloat(key string) (float64, error) {
	value, ok := m.Payload[key].(float64)
	if !ok {
		return 0, fmt.Errorf("field %q is missing or not a number: %w", key, ErrInvalidPayload)
	}
	return value, nil
}

func (m *Message) ParsePayload() (interface{}, error) {
	action := constants.Action(m.Action)

	// Every in-game action identifies its sender. Which world the message belongs
	// to is NOT read from the payload — the server routes on the player's own
	// CurrentGameSessionId (FS-0008 §Requirements 16).
	var playerID string
	var err error

	switch action {
	case constants.ActionMove, constants.ActionInteract, constants.ActionAttack,
		constants.ActionEquip, constants.ActionUnequip, constants.ActionCastSkill:
		playerID, err = m.requireString("player_id")
		if err != nil {
			return nil, fmt.Errorf("parsing %s payload: %w", action, err)
		}
	}

	switch action {
	case constants.ActionMove:
		vx, err := m.requireFloat("vx")
		if err != nil {
			return nil, fmt.Errorf("parsing move payload: %w", err)
		}
		vy, err := m.requireFloat("vy")
		if err != nil {
			return nil, fmt.Errorf("parsing move payload: %w", err)
		}

		parsedPayload := PlayerSessionMovePayload{
			PlayerSessionPayload: PlayerSessionPayload{PlayerID: playerID},
			Vx:                   vx,
			Vy:                   vy,
		}

		slog.Debug("payload of action move", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionInteract:
		entityID, err := m.requireString("entity_id")
		if err != nil {
			return nil, fmt.Errorf("parsing interact payload: %w", err)
		}

		parsedPayload := PlayerSessionInteractPayload{
			PlayerSessionPayload: PlayerSessionPayload{PlayerID: playerID},
			EntityID:             entityID,
		}

		slog.Debug("payload of action interact", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionAttack:
		enemyEntityID, err := m.requireString("enemy_entity_id")
		if err != nil {
			return nil, fmt.Errorf("parsing attack payload: %w", err)
		}

		parsedPayload := PlayerSectionAttackPayload{
			PlayerSessionPayload: PlayerSessionPayload{PlayerID: playerID},
			EnemyEntityID:        enemyEntityID,
		}

		slog.Debug("payload of action attack", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionEquip, constants.ActionUnequip:
		itemEntityID, err := m.requireString("item_entity_id")
		if err != nil {
			return nil, fmt.Errorf("parsing equip / unequip payload: %w", err)
		}

		parsedPayload := PlayerEquipPayload{
			PlayerSessionPayload: PlayerSessionPayload{PlayerID: playerID},
			ItemEntityID:         itemEntityID,
		}

		slog.Debug("payload of action equip / unequip", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionCastSkill:
		// Skill fields stay optional, as they were before: SkillSystem is a stub
		// and nothing consumes them yet.
		skillID, _ := m.Payload["skill_id"].(string)
		targetX, _ := m.Payload["target_x"].(float64)
		targetY, _ := m.Payload["target_y"].(float64)

		parsedPayload := PlayerCastSkillPayload{
			PlayerSessionPayload: PlayerSessionPayload{PlayerID: playerID},
			SkillID:              skillID,
			TargetX:              targetX,
			TargetY:              targetY,
		}

		slog.Debug("payload of action cast_skill", "payload", parsedPayload)

		return parsedPayload, nil
	default:
		return nil, fmt.Errorf("no matching action %q: %w", m.Action, ErrInvalidPayload)
	}
}

/**
* Payloads for players in ongoing games
**/
type PlayerSessionPayload struct {
	PlayerID string `json:"player_id"`
}

type PlayerSessionMovePayload struct {
	PlayerSessionPayload
	Vx float64 `json:"vx"`
	Vy float64 `json:"vy"`
}

type PlayerSessionInteractPayload struct {
	PlayerSessionPayload
	EntityID string `json:"entity_id"`
}

type PlayerSectionAttackPayload struct {
	PlayerSessionPayload
	EnemyEntityID string `json:"enemy_entity_id"`
}

type PlayerEquipPayload struct {
	PlayerSessionPayload
	ItemEntityID string `json:"item_entity_id"`
}

type PlayerCastSkillPayload struct {
	PlayerSessionPayload
	SkillID string  `json:"skill_id"`
	TargetX float64 `json:"target_x"`
	TargetY float64 `json:"target_y"`
}
