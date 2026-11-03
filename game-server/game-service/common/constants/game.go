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
	// ActionDrinkPotion is a delver in a run drinking a health potion from
	// their consumable slots; no payload of its own. FS-P9G8R §Requirements 2.
	ActionDrinkPotion Action = "drink_potion"
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
	// ActionPartyCreate is a party-less player creating a party of one they lead, with no
	// payload. FS-R82NV §Requirements 4a.
	ActionPartyCreate Action = "party_create"
	// ActionPartyKick and ActionPartyTransfer are the leader's, as { "target_id" }: not R19's
	// player_id, which the client's socket overwrites with the sender's (I-R82NV-6 notes).
	// FS-R82NV §Requirements 19.
	ActionPartyKick     Action = "party_kick"
	ActionPartyTransfer Action = "party_transfer"
	// ActionPartyTravel is a member asking to be taken to the hub of the pod their leader stands
	// on, with no payload; answered by world_handoff { addr, hub: true } or a notice.
	// FS-NCC9J §Requirements 18.
	ActionPartyTravel Action = "party_travel"
	// ActionPartyEnter is the leader at the Spire's door asking to take the whole party down, with
	// no payload; answered by party_ready_check or a notice. FS-BJNYC §Requirements 3–6.
	ActionPartyEnter Action = "party_enter"
	// ActionPartyReady is a member answering an open ready check, as { "check_id", "accept" }.
	// FS-BJNYC §Requirements 9.
	ActionPartyReady Action = "party_ready"
	// ActionPartyReadyCheck is a ready check as it now stands, to every member of it, as
	// { "check_id", "leader_id", "expires_in_ms", "members": [{ "player_id", "name", "state" }],
	// "outcome", "reason"?, "names"? }. FS-BJNYC §Requirements 8.
	ActionPartyReadyCheck Action = "party_ready_check"

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
	// ChatChannelWorld is heard by every player on every pod. FS-5SH4G.
	ChatChannelWorld ChatChannel = "world"
	// ChatChannelWhisper is heard by one player, found by name on any pod. FS-KCQ06.
	ChatChannelWhisper ChatChannel = "whisper"
	// ChatChannelParty is heard by every member of the sender's party, on any pod. FS-XGW7H.
	ChatChannelParty ChatChannel = "party"
	// ChatChannelTrade: a reserved type with no behaviour yet.
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
	// ChatNoticeNoParty: a party line from a player their pod knows in no party. FS-XGW7H R3.
	ChatNoticeNoParty ChatNoticeCode = "no_party"
	// ChatNoticeNotOnline: a whisper's target has no presence entry, or could not be handed the
	// line. FS-KCQ06 R4, R9.
	ChatNoticeNotOnline ChatNoticeCode = "not_online"
	// ChatNoticeWhisperSelf: a whisper names the sender's own character. FS-KCQ06 R2.
	ChatNoticeWhisperSelf ChatNoticeCode = "whisper_self"
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
	// PartyNoticeInRun: the invite's target is in a run, so is never asked. FS-NCC9J R10.
	PartyNoticeInRun PartyNoticeCode = "in_run"

	// PartyNoticeUnavailable: Redis cannot be reached, so the party cannot change. FS-NCC9J R8.
	PartyNoticeUnavailable PartyNoticeCode = "unavailable"
	// PartyNoticeLeaderAway: the leader is away, so there is nobody to travel to. FS-NCC9J R18.
	PartyNoticeLeaderAway PartyNoticeCode = "leader_away"

	// Refusals of party_enter (FS-BJNYC R5), in order: not_member, not_leader, locked, too_few,
	// checking, not_at_gate, settling, not_in_town, then unavailable.
	// PartyNoticeTooFew: the party is just its leader; it needs at least two to enter.
	PartyNoticeTooFew PartyNoticeCode = "too_few"
	// PartyNoticeChecking: the party already has a ready check open.
	PartyNoticeChecking PartyNoticeCode = "checking"
	// PartyNoticeNotAtGate: the leader is not standing at the Spire's door.
	PartyNoticeNotAtGate PartyNoticeCode = "not_at_gate"
	// PartyNoticeNotInTown: members not seated in the leader's pod's hub, as { "names" } in join
	// order.
	PartyNoticeNotInTown PartyNoticeCode = "not_in_town"
	// PartyNoticeSettling: a member is a released escapee whose run has not settled yet, so their
	// bag must stay home. FS-QPDKN R33.
	PartyNoticeSettling PartyNoticeCode = "settling"
)

// ReadyCheckState is one member's answer on a party_ready_check. FS-BJNYC §Requirements 8.
type ReadyCheckState string

const (
	ReadyCheckWaiting  ReadyCheckState = "waiting"
	ReadyCheckAccepted ReadyCheckState = "accepted"
	ReadyCheckDeclined ReadyCheckState = "declined"
)

// ReadyCheckOutcome is where a party_ready_check stands. FS-BJNYC §Requirements 8.
type ReadyCheckOutcome string

const (
	ReadyCheckOpen      ReadyCheckOutcome = "open"
	ReadyCheckStarted   ReadyCheckOutcome = "started"
	ReadyCheckCancelled ReadyCheckOutcome = "cancelled"
)

// ReadyCheckReason is why a ready check was cancelled; the names it concerns go with it.
// FS-BJNYC §Requirements 10, 11.
type ReadyCheckReason string

const (
	// a member declined, named
	ReadyCheckReasonDeclined ReadyCheckReason = "declined"
	// 30 s passed; everyone still waiting is named
	ReadyCheckReasonTimeout ReadyCheckReason = "timeout"
	// a member left the town (a field, a run, travel, the roster), named
	ReadyCheckReasonLeft ReadyCheckReason = "left"
	// a member disconnected, named
	ReadyCheckReasonDisconnected ReadyCheckReason = "disconnected"
	// the party's membership or leader changed; no names
	ReadyCheckReasonChanged ReadyCheckReason = "changed"
	// gear unreadable (named), or Redis down or the run not built (no names)
	ReadyCheckReasonFailed ReadyCheckReason = "failed"
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
	// PartyUpdateSync: the party as Redis holds it, sent to subject_id as they are seated on a
	// pod. FS-NCC9J R6.
	PartyUpdateSync PartyUpdateReason = "sync"
	// PartyUpdateInvited: a slot is now reserved for subject_id, invited. FS-NCC9J R21.
	PartyUpdateInvited PartyUpdateReason = "invited"
	// PartyUpdateInviteEnded: subject_id's reserved slot is free again: they declined, joined
	// another party, or the invite was withdrawn. An expiry sends nothing (the client goes by
	// expires_at). FS-NCC9J R12, R21.
	PartyUpdateInviteEnded PartyUpdateReason = "invite_ended"
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

// HubTravelMargin is how far past HubOccupancyCap a hub admits a member joining their party's
// leader there, by party_travel or any entry while the leader stands in that hub: one full party.
// FS-NCC9J §Requirements 18, 20 (amended).
const HubTravelMargin int = 4

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
