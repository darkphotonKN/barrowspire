package constants

type Action string
type ErrorCode string

const (
	// menu actions
	ActionQueue      Action = "queue"
	ActionFindGame   Action = "find_game"
	ActionLeaveQueue Action = "leave_queue"
	ActionLeaveGame  Action = "leave_game"
	// ActionStartSolo asks for a run of one, built at once without the queue.
	// FS-NSV3D §Requirements 8.
	ActionStartSolo Action = "start_solo"
	// ActionLeaveRun is a dead delver leaving a run for the hub before it ends.
	// FS-QPDKN §Requirements 13.
	ActionLeaveRun Action = "leave_run"
	// ActionForfeitRun is a delver in play choosing to die where they stand.
	// FS-9K8EZ §Requirements 9.
	ActionForfeitRun Action = "forfeit_run"
	// ActionLeaveHub is a hub member leaving for the roster: their body goes,
	// their record stays in no world. FS-G4VMQ §Requirements 23.
	ActionLeaveHub Action = "leave_hub"
	// ActionWorldLeft answers an accepted leave_hub: the member is in no world.
	ActionWorldLeft Action = "world_left"

	// ActionEnterField is a hub member at a field gate asking to walk into
	// this pod's channel of that field; payload { "field": "<id>" }.
	// FS-X2F2H §Requirements 9.
	ActionEnterField Action = "enter_field"
	// ActionLeaveField is a player at a field's entrance gate asking to walk
	// back to the hub; no payload. FS-X2F2H §Requirements 14.
	ActionLeaveField Action = "leave_field"

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
	// ActionChat is a chat line, inbound as { "channel", "text" } and outbound
	// as the pod-stamped line. Handled on the message hub, never by a world.
	// FS-WJGFJ §Requirements A2–A4, B11.
	ActionChat Action = "chat"
	// ActionChatNotice is a system line about chat to one player: a refusal or
	// a status, as { "code", "text" }. Never an error reply, so the client's
	// global error handler never sees it. FS-WJGFJ §Requirements A7.
	ActionChatNotice Action = "chat_notice"

	// ActionPartyInvite is a party invite: inbound from the inviter as
	// { "name" }, outbound to the target as the prompt. FS-R82NV §Requirements 12, 13.
	ActionPartyInvite Action = "party_invite"
	// ActionPartyNotice answers one player about their party, by code: a refusal or a
	// status, as { "code", "name"? }. The client owns the words. FS-R82NV §Requirements 12.
	ActionPartyNotice Action = "party_notice"
	// ActionPartyAccept is the target accepting an invite, as { "invite_id" }.
	// FS-R82NV §Requirements 16.
	ActionPartyAccept Action = "party_accept"
	// ActionPartyUpdate is the party as it now stands, sent to every member on
	// every change. FS-R82NV §Requirements 21.
	ActionPartyUpdate Action = "party_update"
	// ActionPartyDecline is the target declining an invite, as { "invite_id" }.
	// FS-R82NV §Requirements 15.
	ActionPartyDecline Action = "party_decline"
	// ActionPartyLeave is a member leaving their party, with no payload. FS-R82NV §Requirements 20.
	ActionPartyLeave Action = "party_leave"
	// ActionPartyKick and ActionPartyTransfer are the leader's, as { "target_id" }: not R19's
	// player_id, which the client's socket overwrites with the sender's (I-R82NV-6 notes).
	// FS-R82NV §Requirements 19.
	ActionPartyKick     Action = "party_kick"
	ActionPartyTransfer Action = "party_transfer"

	// system actions
	ActionError          Action = "error"
	ActionSuccess        Action = "success"
	ActionEndGame        Action = "end_game"
	ActionHandoffConnect Action = "end_game"
	ActionReconnect      Action = "reconnected"

	// ActionWorldEntered tells a client which world it is now in. One message
	// for every transition, into the hub, into a run, and back again,, so the
	// client has a single place to switch scenes. FS-29KSH §Requirements 15.
	ActionWorldEntered Action = "world_entered"

	// ActionWorldHandoff tells a client its run is hosted on another pod, and
	// where to reconnect to enter it. FS-K2HKP §Requirements 21.
	ActionWorldHandoff Action = "world_handoff"
)

// ChatChannel is which kind of talk a chat line belongs to. The five are the
// closed set; a later feature opens a channel, it never adds to the envelope.
// FS-WJGFJ §Requirements A1, D32. Vocabulary: game-service/CONTEXT.md § Chat.
type ChatChannel string

const (
	// ChatChannelArea is heard by every player seated on this pod (ADR-0032).
	ChatChannelArea ChatChannel = "area"
	// ChatChannelWorld, ChatChannelWhisper: cross-pod, FS-5SH4G. Closed until then.
	ChatChannelWorld   ChatChannel = "world"
	ChatChannelWhisper ChatChannel = "whisper"
	// ChatChannelParty, ChatChannelTrade: reserved types with no behaviour yet.
	ChatChannelParty ChatChannel = "party"
	ChatChannelTrade ChatChannel = "trade"
)

// ChatNoticeCode is the stable reason on a chat_notice the client switches on.
type ChatNoticeCode string

const (
	// ChatNoticeNotInWorld: the sender is seated in no world. FS-WJGFJ R10.
	ChatNoticeNotInWorld ChatNoticeCode = "not_in_world"
	// ChatNoticeChannelClosed: the channel is not relayed yet, or is not one
	// of the five. FS-WJGFJ R8.
	ChatNoticeChannelClosed ChatNoticeCode = "channel_closed"
	// ChatNoticeTooLong: more than the line limit, in code points. FS-WJGFJ R5.
	ChatNoticeTooLong ChatNoticeCode = "too_long"
	// ChatNoticeTooFast: inside the speaker's flood window. FS-WJGFJ R6.
	ChatNoticeTooFast ChatNoticeCode = "too_fast"
)

// PartyNoticeCode is the stable reason on a party_notice the client switches on.
type PartyNoticeCode string

const (
	// PartyNoticeSent: the invite reached the target's pod. FS-R82NV R13.
	PartyNoticeSent PartyNoticeCode = "sent"
	// PartyNoticeDeclined: the target declined the invite. FS-R82NV R15.
	PartyNoticeDeclined PartyNoticeCode = "declined"
	// PartyNoticeExpired: the invite went unanswered for its minute. FS-R82NV R14.
	PartyNoticeExpired PartyNoticeCode = "expired"
	// PartyNoticeDeliveryFailed: the invite could not reach the target. FS-R82NV R10.
	PartyNoticeDeliveryFailed PartyNoticeCode = "delivery_failed"
	// PartyNoticePartyGone: the invite's party has ended. FS-R82NV R16.
	PartyNoticePartyGone PartyNoticeCode = "party_gone"
	// PartyNoticeNotMember: the target (or the sender, for a leave) is not in the party.
	// FS-R82NV R19, R20.
	PartyNoticeNotMember PartyNoticeCode = "not_member"
	// PartyNoticeLocked: the party is inside an instance. FS-R82NV R19, R20; wired by FS-BJNYC.
	PartyNoticeLocked PartyNoticeCode = "locked"

	// Refusals of an invite (FS-R82NV R11, R12, R16), checked in this order:
	// the sender's own standing first, then R12's list.
	PartyNoticeNotInHub       PartyNoticeCode = "not_in_hub"
	PartyNoticeNotLeader      PartyNoticeCode = "not_leader"
	PartyNoticeQueued         PartyNoticeCode = "queued"
	PartyNoticePartyFull      PartyNoticeCode = "party_full"
	PartyNoticeSelf           PartyNoticeCode = "self"
	PartyNoticeNotFound       PartyNoticeCode = "not_found"
	PartyNoticeAlreadyInParty PartyNoticeCode = "already_in_party"
	PartyNoticePodFull        PartyNoticeCode = "pod_full"
	PartyNoticePending        PartyNoticeCode = "pending"
)

// PartyUpdateReason is why a party_update was sent. FS-R82NV §Requirements 21.
type PartyUpdateReason string

const (
	// PartyUpdateJoined: subject_id became a member.
	PartyUpdateJoined PartyUpdateReason = "joined"
	// PartyUpdateDissolved: the party ended with its pod's graceful shutdown. FS-R82NV R5.
	PartyUpdateDissolved PartyUpdateReason = "dissolved"
	// PartyUpdateLeft: subject_id left the party. FS-R82NV R20.
	PartyUpdateLeft PartyUpdateReason = "left"
	// PartyUpdateLeader: subject_id now leads the party. FS-R82NV R22.
	PartyUpdateLeader PartyUpdateReason = "leader"
	// PartyUpdateKicked: the leader removed subject_id. FS-R82NV R19.
	PartyUpdateKicked PartyUpdateReason = "kicked"
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

// RunPlayerDamage is whether delvers can damage each other in a run. Off: runs
// are co-op. A world-build setting, never client-sent. FS-77AB6 §Requirements 12.
const RunPlayerDamage = false

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

// How close a player must stand to a hub gate to be at it: the distance the
// Warden is spoken to from. FS-0XMCP §Requirements 4.
const GateRange float64 = 80

// Gentle Meadows is about the hub's size, larger than the viewport, so it
// scrolls. FS-X2F2H §Requirements 51.
const MeadowsMapWidth float64 = 2000
const MeadowsMapHeight float64 = 1000

// The Forlorn Forest is roomy enough that walking on reveals more of it: 39 x 25
// cells of 80 px, the generator's Forest parameters. FS-KSD6K §Requirements 1.
const ForestMapWidth float64 = 3120
const ForestMapHeight float64 = 2000

// How close a player must stand to a field's entrance gate to walk back to the
// hub through it: the hub gates' own range. FS-X2F2H §Requirements 14.
const FieldEntranceRange float64 = GateRange

// How far from its spawn point a monster with no target wanders, in px, and how
// long it stands between destinations and may fail to close on one before
// giving it up. Starting values. FS-77AB6 §Requirements 26.
const MonsterHomeRadius float64 = 150
const MonsterPauseSeconds float64 = 1.6
const MonsterStallSeconds float64 = 1.2

// How many floors a run climbs. Floor 1 is where it starts; this one is the top.
// One server constant, not per run. FS-F6F88 §Requirements 1.
const RunFloorCount int = 3

const MapWidth float64 = 1440
const MapHeight float64 = 960
const PlayerRadius float64 = 20
const ContainerWidthRadius float64 = 20
const ContainerHeightRadius float64 = 16

// The stairs' footprint, centred on their position: what placement keeps clear
// of the floor's other objects. FS-F6F88 §Requirements 7.
const StairsWidthRadius float64 = 24
const StairsHeightRadius float64 = 24
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
