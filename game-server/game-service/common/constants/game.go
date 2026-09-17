package constants

type Action string
type ErrorCode string

const (
	// menu actions
	ActionQueue      Action = "queue"
	ActionFindGame   Action = "find_game"
	ActionLeaveQueue Action = "leave_queue"
	ActionLeaveGame  Action = "leave_game"

	// ActionEnterHub is how a player asks to enter the hub, after picking a
	// character. Connecting opens the socket; entering is a separate step.
	ActionEnterHub Action = "enter_hub"

	// active game actions
	ActionMove      Action = "move"
	ActionInteract  Action = "interact"
	ActionAttack    Action = "attack"
	ActionPickup    Action = "pickup"
	ActionUseItem   Action = "use_item"
	ActionDropItem  Action = "drop_item"
	ActionEquip     Action = "equip"
	ActionUnequip   Action = "unequip"
	ActionCastSkill Action = "cast_skill"
	ActionChat      Action = "chat"

	// system actions
	ActionError   Action = "error"
	ActionSuccess Action = "success"
	ActionEndGame Action = "end_game"

	// ActionWorldEntered tells a client which world it is now in. One message
	// for every transition — into the hub, into a run, and back again — so the
	// client has a single place to switch scenes. FS-29KSH §Requirements 15.
	ActionWorldEntered Action = "world_entered"
)

const (
	ErrorSessionNotFound     ErrorCode = "session_not_found"
	ErrorInvalidSessionID    ErrorCode = "invalid_session_id"
	ErrorPlayerNotFound      ErrorCode = "player_not_found"
	ErrorInvalidPayload      ErrorCode = "invalid_payload"
	ErrorInternalServerError ErrorCode = "internal_server_error"
)

// Server Memory Constants
const MaxMsgChanBuffer int = 30

// Game Defaults
const DefaultSpeed float64 = 200
const DefaultInteractableRange float64 = 60
const DefautMaxSessionPlayers = 2

// map setting
// The hub world is its own size, larger than a run's map and larger than the
// 1080x720 viewport, so it scrolls. FS-29KSH §Requirements 3.
const HubMapWidth float64 = 2000
const HubMapHeight float64 = 1000

// The fixed point every player enters and returns to. FS-29KSH §Requirements 22.
const HubSpawnX float64 = 1000
const HubSpawnY float64 = 800

// How many delvers the hub holds at once.
//
// This is the door check, and distinct from the 50-player concurrency ceiling
// ADR-0015 rests on: raising that reopens an ADR, raising this does not
// (game-service/CONTEXT.md).
const HubOccupancyCap int = 40

// How fast a resident ambles, and how long they stand once they arrive.
const NPCWanderSpeed float64 = 60
const NPCPauseSeconds float64 = 1.6

// How long a resident may fail to close on its destination before giving up on
// it. Without this a random walk wedges permanently in a corner.
const NPCStallSeconds float64 = 1.2

// How close a delver must stand to talk to an NPC.
const NPCInteractRange float64 = 80

const MapWidth float64 = 1440
const MapHeight float64 = 960
const PlayerRadius float64 = 20
const ContainerWidthRadius float64 = 20
const ContainerHeightRadius float64 = 16
const InitialPlayerX float64 = 720
const InitialPlayerY float64 = 480

// game loop
const GameFrameRate int = 30

// Item Pool Configuration
const ItemPoolSize int = 40 // Total number of item slots in the pool

// Item type ratios (must sum to 100)
const WeaponRatio int = 40     // 40% weapons
const ArmorRatio int = 35      // 35% armors
const ConsumableRatio int = 25 // 25% consumables

type ConnectState string

const (
	Connected    ConnectState = "connected"
	Disconnected ConnectState = "disconnected"
	Reconnecting ConnectState = "reconnecting"
)
