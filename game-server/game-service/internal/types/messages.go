package types

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
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

	// LoadoutChecked marks a message the message hub sent back to itself once
	// the sender's gear was read off its loop. Only the hub sets it; a client's
	// message is decoded into Message alone, so a client can never set it.
	LoadoutChecked bool

	// PlayerID is who sent the message: the player the message hub holds for
	// Conn, stamped as it routes the message into that player's world. Only the
	// hub sets it; a client's message is decoded into Message alone, so a client
	// can never set it, and no payload names its sender. FS-29KSH §Change: The
	// acting player is the connection's, R37; ADR-0079.
	PlayerID uuid.UUID
}

type ProjectileState struct {
	EntityID       uuid.UUID `json:"entity_id"`
	ProjectileType string    `json:"projectile_type"`
	Position       Position  `json:"position"`
	Velocity       Velocity  `json:"velocity"`
}

// TrailState is a burning trail as the client draws it: the path dashed, from
// one end to the other, burning HalfWidth px either side, for Remaining more
// seconds. FS-4R9M9 §Requirements 56.
type TrailState struct {
	EntityID  uuid.UUID `json:"entity_id"`
	From      Position  `json:"from"`
	To        Position  `json:"to"`
	HalfWidth float64   `json:"half_width"`
	Remaining float64   `json:"remaining"`
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
	// WorldTypeField is a long-lived world shared like the hub, with no queue:
	// one channel of each field per pod, entered by a world switch from the hub
	// and never ended. FS-X2F2H §Requirements 1.
	WorldTypeField WorldType = "field"
)

// represents entire game state that client receives
type ClientGameState struct {
	SessionID     uuid.UUID           `json:"session_id"`
	WorldType     WorldType           `json:"world_type"`
	CurrentPlayer *CurrentPlayerState `json:"current_player"` // The recipient's player state
	OtherPlayers  []OtherPlayerState  `json:"other_players"`  // All other players
	Items         []uuid.UUID         `json:"items"`          // TODO: update with item entity converted into struct format
	Doors         []*DoorState        `json:"doors"`
	// Walls are the hub's and a field's, every tick; a run's travel in its
	// floor map and the key is absent, hence the pointer. FS-KE075 §F R34.
	Walls        *[]*WallState      `json:"walls,omitempty"`
	Containers   []*ContainerState  `json:"containers"`
	EscapeDoor   []*EscapeDoorState `json:"escape_doors"`
	Equipment    *EquipmentState    `json:"equipment"`
	Switch       []*SwitchState     `json:"switches"`
	NPCs         []*NPCState        `json:"npcs"`
	Projectiles  []*ProjectileState `json:"projectiles"`
	EscapedCount int                `json:"escaped_count"`
	// Floor is a run's; the hub has no floors and omits it. The run's height
	// stays on the server. FS-F6F88 §Requirements 26, FS-M8CSE §A R5.
	Floor int `json:"floor,omitempty"`
	// Stairs are a run's, every tick, an empty list on the top floor; the hub
	// has none and omits the key, hence the pointer. FS-F6F88 §Requirements 27.
	Stairs *[]*StairsState `json:"stairs,omitempty"`
	// Monsters are a run's, every one each tick, corpses included; the hub has
	// none and omits the key. FS-77AB6 §Requirements 32.
	Monsters []*MonsterState `json:"monsters,omitempty"`
	// Trails are a run's live burning trails; with none burning, and always in
	// the hub, the key is absent. FS-4R9M9 §Requirements 56.
	Trails []*TrailState `json:"trails,omitempty"`
	// Gates are the hub's; a run has none and omits the key. FS-0XMCP
	// §Requirements 6.
	Gates []*GateState `json:"gates,omitempty"`
	// Tome is a tome run's tome while it lies on the current floor, cut by
	// distance as containers are; Altar is the altar on its floor, sent whole;
	// TomeCarried is set while the party carries the tome unburned. All are
	// absent anywhere else. FS-3103M §E R14.
	Tome        *TomeState  `json:"tome,omitempty"`
	Altar       *AltarState `json:"altar,omitempty"`
	TomeCarried bool        `json:"tome_carried,omitempty"`
	// Seal, SealPieces and Barriers are a sealed floor's, sent whole every
	// tick; absent in the hub, a field, on the top floor and on a floor of
	// buildings, which have none. FS-5FZ4J §I R46.
	Seal       *SealState        `json:"seal,omitempty"`
	SealPieces []*SealPieceState `json:"seal_pieces,omitempty"`
	Barriers   []*BarrierState   `json:"barriers,omitempty"`
	// Traps are a dungeon floor's detected traps, sent whole to every
	// member; an undetected one is sent to no one. FS-5FZ4J §D R30, §I R46.
	Traps []*TrapState `json:"traps,omitempty"`
	// Fountain is the floor's healing fountain and HallowedAltar the hallowed
	// altar on its floor once reachable, both sent whole; absent where there
	// is none. FS-5FZ4J §I R46.
	Fountain      *FountainState      `json:"fountain,omitempty"`
	HallowedAltar *HallowedAltarState `json:"hallowed_altar,omitempty"`
	// Merchant is the floor's wandering merchant and his wares, sent whole;
	// absent where there is none. FS-9JV5K §A R4.
	Merchant *MerchantState `json:"merchant,omitempty"`
	// EncounterNPCs are a run floor's encounter NPCs, cut by interest as
	// monsters are; absent in the hub, a field and on a floor without one.
	// FS-4EC7Z §F R22.
	EncounterNPCs []*EncounterNPCState `json:"encounter_npcs,omitempty"`
	// Cages are a run floor's Captives' cage, EncounterKeys its cage key while
	// it lies, both sent whole; CageKeyCarried is set while the party carries
	// the key. All absent where there are none. FS-4EC7Z §F R23.
	Cages          []*CageState         `json:"cages,omitempty"`
	EncounterKeys  []*EncounterKeyState `json:"encounter_keys,omitempty"`
	CageKeyCarried bool                 `json:"cage_key_carried,omitempty"`
}

// CurrentPlayerState is the recipient's own player state: what every player
// shows, plus what only its owner is told. Another player carries a resource
// only for a recipient in their party (OtherPlayerState). FS-8AY7S
// §Requirements 17–18.
// A mercenary's parry fields sit inline beside the resource; for anyone else
// the embedded pointer is nil and the keys are absent. FS-MAMHR §Requirements 28.
type CurrentPlayerState struct {
	*PlayerState
	Resource *ResourceState `json:"resource,omitempty"`
	*ParryState
	// TimedOpen is the recipient's own timed open on a run's shut container;
	// absent when they have none. Nobody else is told it. FS-MQYEX
	// §Requirements 18–19.
	TimedOpen *TimedOpenState `json:"timed_open,omitempty"`
	// AbilityCooldown is the recipient's right-click ability's cooldown, a
	// mercenary's the whiff lockout; absent only for a delver with no ability.
	// Never on another player. FS-Q18Q3 §A R1–R2, R6.
	AbilityCooldown *CooldownState `json:"ability_cooldown,omitempty"`
	// TreeAbilityCooldown is the recipient's tree ability's cooldown, a
	// mercenary's the cut's slot; absent while they do not hold it. Never on
	// another player. FS-Q18Q3 §A R4, R6.
	TreeAbilityCooldown *CooldownState `json:"tree_ability_cooldown,omitempty"`
	// PassiveState is the recipient's passive tree: the ranks their body holds
	// and the points they have left, in every world. Never on another player.
	// FS-8RZ51 §E R23.
	*PassiveState
}

// PassiveState is a delver's passive tree as its owner is told it: Ranks by
// node id, nodes at rank 1 or more, {} when none; Points unspent from the
// body's current level, so a level-up in a run raises it at once. FS-8RZ51 R7,
// R23.
type PassiveState struct {
	Ranks  passivetree.Ranks `json:"passive_ranks"`
	Points int               `json:"passive_points"`
}

// OtherPlayerState is another player as one recipient is told them: what every
// player shows, never their bag or worn gear (FS-KE075 §I R51, ADR-0064),
// plus, when they are in the recipient's party, their class resource and a
// mercenary's parry fields, as their own HUD gets them. For anyone else both
// are nil and the JSON is the bare PublicPlayerState's.
// FS-CH21F §Requirements 1–4.
type OtherPlayerState struct {
	*PublicPlayerState
	Resource *ResourceState `json:"resource,omitempty"`
	*ParryState
}

type BackendGameState struct {
	SessionID uuid.UUID
	WorldType WorldType
	Players   map[uuid.UUID]*PlayerState
	// LeftBehind holds dead delvers whose body stayed on a floor the party has
	// left: each still sees their own state, nobody else sees the body
	LeftBehind map[uuid.UUID]*PlayerState
	// Escaped holds delvers who escaped the run: each still sees their own
	// state until the run ends, nobody else sees them
	Escaped map[uuid.UUID]*PlayerState
	// Resources is each delver's class resource, kept beside their state and
	// attached only to the frame their own client is sent
	Resources map[uuid.UUID]*ResourceState
	// Parries is each mercenary's parry stance, attached like Resources
	Parries map[uuid.UUID]*ParryState
	// TimedOpens is each delver's timed open, attached only to the frame
	// their own client is sent
	TimedOpens map[uuid.UUID]*TimedOpenState
	// AbilityCooldowns is each delver's right-click cooldown, attached only to
	// the frame their own client is sent
	AbilityCooldowns map[uuid.UUID]*CooldownState
	// TreeAbilityCooldowns is each delver's held tree ability's cooldown,
	// attached only to the frame their own client is sent
	TreeAbilityCooldowns map[uuid.UUID]*CooldownState
	// Passives is each delver's passive tree, attached only to the frame their
	// own client is sent
	Passives map[uuid.UUID]*PassiveState
	// PartyOf is the pod's party membership snapshot (player id → party id) as
	// this broadcast read it, once for all its recipients. Published immutable:
	// shared, never written. FS-CH21F §Requirements 5–6.
	PartyOf      map[uuid.UUID]uuid.UUID
	Items        []uuid.UUID
	Doors        []*DoorState
	Walls        []*WallState
	Containers   []*ContainerState
	EscapeDoor   []*EscapeDoorState
	Equipment    *EquipmentState
	Switch       []*SwitchState
	NPCs         []*NPCState
	Projectiles  []*ProjectileState
	EscapedCount int
	Floor        int
	Stairs       []*StairsState
	Monsters     []*MonsterState
	Trails       []*TrailState
	Gates        []*GateState
	// Tome, Altar and TomeCarried are a tome run's (FS-3103M §E R14)
	Tome        *TomeState
	Altar       *AltarState
	TomeCarried bool
	// Seal, SealPieces and Barriers are a sealed floor's (FS-5FZ4J §I R46)
	Seal       *SealState
	SealPieces []*SealPieceState
	Barriers   []*BarrierState
	// Traps are a dungeon floor's detected traps (FS-5FZ4J §I R46)
	Traps []*TrapState
	// Fountain and HallowedAltar are a floor's respites (FS-5FZ4J §I R46)
	Fountain      *FountainState
	HallowedAltar *HallowedAltarState
	// Merchant is the floor's wandering merchant (FS-9JV5K §A R4)
	Merchant *MerchantState
	// EncounterNPCs are the floor's encounter NPCs (FS-4EC7Z §F R22)
	EncounterNPCs []*EncounterNPCState
	// Cages, EncounterKeys and CageKeyCarried are the floor's Captives' cage
	// and key (FS-4EC7Z §F R23)
	Cages          []*CageState
	EncounterKeys  []*EncounterKeyState
	CageKeyCarried bool
	// CellSize is the edge of the cell grid the floor is built on, from its
	// FloorComponent: above 0 on a dungeon floor, whose monsters and
	// containers are cut per recipient by distance. FS-KE075 §G R36.
	CellSize float64
	// InPlay is where each living, in-play delver's body stands: the interest
	// centres a dungeon floor's cut is measured from. FS-KE075 §G R37.
	InPlay map[uuid.UUID]Position
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

// ParsePayload reads an in-world action's own fields. It reads neither who
// sent it nor which world it is for: the server routes on the player's own
// CurrentGameSessionId (FS-29KSH §Requirements 16) and acts for the player the
// message hub stamped on the package (R37). A player_id a client still sends is
// never read (R38).
func (m *Message) ParsePayload() (interface{}, error) {
	action := constants.Action(m.Action)

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
			Vx: vx,
			Vy: vy,
		}

		slog.Debug("payload of action move", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionInteract:
		entityID, err := m.requireString("entity_id")
		if err != nil {
			return nil, fmt.Errorf("parsing interact payload: %w", err)
		}

		parsedPayload := PlayerSessionInteractPayload{
			EntityID: entityID,
		}

		slog.Debug("payload of action interact", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionAttack:
		enemyEntityID, err := m.requireString("enemy_entity_id")
		if err != nil {
			return nil, fmt.Errorf("parsing attack payload: %w", err)
		}

		parsedPayload := PlayerSectionAttackPayload{
			EnemyEntityID: enemyEntityID,
		}

		slog.Debug("payload of action attack", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionEquip, constants.ActionUnequip:
		itemEntityID, err := m.requireString("item_entity_id")
		if err != nil {
			return nil, fmt.Errorf("parsing equip / unequip payload: %w", err)
		}

		parsedPayload := PlayerEquipPayload{
			ItemEntityID: itemEntityID,
		}

		slog.Debug("payload of action equip / unequip", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionUseItem:
		// FS-9JV5K §D R17: the bag item to use
		itemEntityID, err := m.requireString("item_entity_id")
		if err != nil {
			return nil, fmt.Errorf("parsing use_item payload: %w", err)
		}

		parsedPayload := PlayerUseItemPayload{
			ItemEntityID: itemEntityID,
		}

		slog.Debug("payload of action use_item", "payload", parsedPayload)

		return parsedPayload, nil

	case constants.ActionBuy:
		// FS-9JV5K §B R5: the merchant and the ware
		merchantID, err := m.requireString("merchant_id")
		if err != nil {
			return nil, fmt.Errorf("parsing buy payload: %w", err)
		}
		ware, err := m.requireString("ware")
		if err != nil {
			return nil, fmt.Errorf("parsing buy payload: %w", err)
		}

		return PlayerBuyPayload{MerchantID: merchantID, Ware: ware}, nil

	case constants.ActionCastSkill:
		// Skill fields stay optional, as they were before: SkillSystem is a stub
		// and nothing consumes them yet.
		skillID, _ := m.Payload["skill_id"].(string)
		targetX, _ := m.Payload["target_x"].(float64)
		targetY, _ := m.Payload["target_y"].(float64)

		parsedPayload := PlayerCastSkillPayload{
			SkillID: skillID,
			TargetX: targetX,
			TargetY: targetY,
		}

		slog.Debug("payload of action cast_skill", "payload", parsedPayload)

		return parsedPayload, nil
	default:
		return nil, fmt.Errorf("no matching action %q: %w", m.Action, ErrInvalidPayload)
	}
}

/**
* Payloads for players in ongoing games. None names its sender: that is the
* package's PlayerID, stamped by the message hub (ADR-0079).
**/
type PlayerSessionMovePayload struct {
	Vx float64 `json:"vx"`
	Vy float64 `json:"vy"`
}

type PlayerSessionInteractPayload struct {
	EntityID string `json:"entity_id"`
}

type PlayerSectionAttackPayload struct {
	EnemyEntityID string `json:"enemy_entity_id"`
}

type PlayerEquipPayload struct {
	ItemEntityID string `json:"item_entity_id"`
}

// PlayerBuyPayload names the merchant bought from and the ware. FS-9JV5K §B R5.
type PlayerBuyPayload struct {
	MerchantID string `json:"merchant_id"`
	Ware       string `json:"ware"`
}

// PlayerUseItemPayload names the bag item to use. FS-9JV5K §D R17.
type PlayerUseItemPayload struct {
	ItemEntityID string `json:"item_entity_id"`
}

type PlayerCastSkillPayload struct {
	SkillID string  `json:"skill_id"`
	TargetX float64 `json:"target_x"`
	TargetY float64 `json:"target_y"`
}
