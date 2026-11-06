import type { ChatChannel } from "@/stores/chatStore";
import type { ItemState } from "@/types/gameState";
/**
 * The session identity every game action carries. GameSessionManager builds it
 * once and merges it into each outgoing payload, so action payload types below
 * describe only their own fields.
 */
export interface PlayerSessionPayload {
  session_id: string;
  player_id: string;
}

export interface MovePayload {
  vx: number;
  vy: number;
}

export interface AttackPayload {
  enemy_entity_id: string;
}

export interface PickupPayload {
  itemId: string;
}

export interface UsePayload {
  itemId: string;
  targetId?: string; // 可選：對誰使用
}

/** A chat line as the client sends it; the pod stamps everything else (FS-WJGFJ R2). */
export interface ChatPayload {
  channel: ChatChannel;
  /** A whisper's target, the character name as typed; on whisper only (FS-KCQ06 R1). */
  target?: string;
  text: string;
}

export interface FindGamePayload {
  playerId?: string;
  class?: string;
  className?: string;
  characterName?: string;
  username?: string;
  cancel?: boolean;
}

export interface InteractPayload {
  entity_id: string;
}

export interface EquipPayload {
  item_entity_id: string;
}

export interface UnequipPayload {
  item_entity_id: string;
}

export interface CastSkillPayload {
  skill_id: string;
  target_x: number;
  target_y: number;
}

// ====== 動作類型對應 Payload ======

/**
 * Asking to enter the hub. Connecting opens the socket; entering is a separate
 * step taken after a character is chosen, and the chosen character travels with
 * the request — the server keeps no memory of a menu selection.
 */
export interface EnterHubPayload {
  /**
   * The server record the player enters as (FS-BDA7X req 5, 41). Once the server seats by it,
   * the class and name below are ignored; they stay until then so either server reads the entry.
   */
  characterId: string;
  class: string;
  className: string;
  characterName: string;
  username: string;
}

export interface ActionMap {
  enter_hub: EnterHubPayload;
  move: MovePayload;
  attack: AttackPayload;
  pickup: PickupPayload;
  use: UsePayload;
  chat: ChatPayload;
  find_game: FindGamePayload;
  interact: InteractPayload;
  equip: EquipPayload;
  unequip: UnequipPayload;
  cast_skill: CastSkillPayload;
  /** A dead player leaving the run for the hub (FS-QPDKN req 13): no payload. */
  leave_run: Record<string, never>;
  /** A queued player cancelling (FS-G4VMQ req 18): no payload. */
  leave_queue: Record<string, never>;
  /** A hub player leaving for the roster (FS-G4VMQ req 23, 25): no payload; `world_left` answers. */
  leave_hub: Record<string, never>;
  /** A player descending alone, without the queue (FS-NSV3D req 7): no payload. */
  start_solo: Record<string, never>;
  /** A player in play choosing to fall where they stand (FS-9K8EZ req 7): no payload. */
  forfeit_run: Record<string, never>;
  /** A run whose floor's map never came asking for it again (FS-KE075 §F.33): no payload. */
  request_floor_map: Record<string, never>;
  /** A hub player walking into a field gate (FS-X2F2H req 9). */
  enter_field: { field: FieldId };
  /** A field player walking into the entrance gate, home to the hub (FS-X2F2H req 14): no payload. */
  leave_field: Record<string, never>;
  /** A player in the delve drinking a health potion (FS-P9G8R R27): no payload; the server picks the slot. */
  drink_potion: Record<string, never>;
  /** The renewed access token, for the server to hold in place of the one it connected with (FS-ZPX58 R27). */
  renew_token: { token: string };
  /** A player in no party standing up a party of one, as its leader (FS-R82NV R4a): no payload. */
  party_create: Record<string, never>;
  /** Inviting a player to this player's party, by character name or id (FS-R82NV R12). */
  party_invite: { name: string };
  /**
   * The leader removing a member (FS-R82NV R19). The FS names the field `player_id`, but every
   * outgoing payload has the sender's own `player_id` merged over it by `sendMessage`, so the
   * target travels as `target_id` until the server's handler (slice 2) settles the name.
   */
  party_kick: { target_id: string };
  /** The leader handing leadership to a member (FS-R82NV R19); `target_id` as for a kick. */
  party_transfer: { target_id: string };
  /** Leaving the party (FS-R82NV R20): no payload. */
  party_leave: Record<string, never>;
  /** Answering a `party_invite` yes (FS-R82NV R16), by the invite's id. */
  party_accept: { invite_id: string };
  /** Answering a `party_invite` no (FS-R82NV R15), by the invite's id. */
  party_decline: { invite_id: string };
  /** A member asking to be taken to the town of the leader's server (FS-NCC9J R18, R28): no payload. */
  party_travel: Record<string, never>;
  /**
   * The leader at the Spire's door taking the whole party down (FS-BJNYC R3, R21): no payload.
   * Answered by a `party_ready_check`, the run itself, or a `party_notice` saying why not.
   */
  party_enter: Record<string, never>;
  /**
   * A member answering the open ready check (FS-BJNYC R9, R24). The server records it if they are
   * waiting on that check, and ignores it otherwise; the leader sends none.
   */
  party_ready: { check_id: string; accept: boolean };
}

export const ActionType = {
  EnterHub: "enter_hub",
  Move: "move",
  Attack: "attack",
  Pickup: "pickup",
  Use: "use",
  Chat: "chat",
  Find_Game: "find_game",
  Interact: "interact",
  Equip: "equip",
  Unequip: "unequip",
  CastSkill: "cast_skill",
  LeaveRun: "leave_run",
  LeaveQueue: "leave_queue",
  LeaveHub: "leave_hub",
  StartSolo: "start_solo",
  ForfeitRun: "forfeit_run",
  EnterField: "enter_field",
  LeaveField: "leave_field",
  DrinkPotion: "drink_potion",
  PartyCreate: "party_create",
  PartyInvite: "party_invite",
  PartyKick: "party_kick",
  PartyTransfer: "party_transfer",
  PartyLeave: "party_leave",
  PartyAccept: "party_accept",
  PartyDecline: "party_decline",
  PartyTravel: "party_travel",
  PartyEnter: "party_enter",
  PartyReady: "party_ready",
} as const;

export type ActionType = (typeof ActionType)[keyof typeof ActionType];

// ====== Client → Server 訊息（泛型版）======

export interface ClientMessage<T extends keyof ActionMap> {
  action: T;
  payload: ActionMap[T];
  seq: number;
}

// ====== 或是用 Union Type（更直接）======

export type ClientAction =
  | { action: "move"; payload: MovePayload; seq: number }
  | { action: "attack"; payload: AttackPayload; seq: number }
  | { action: "pickup"; payload: PickupPayload; seq: number }
  | { action: "use"; payload: UsePayload; seq: number }
  | { action: "chat"; payload: ChatPayload; seq: number }
  | { action: "cast_skill"; payload: CastSkillPayload; seq: number };

// ====== Server → Client ======

/**
 * Which kind of world a session runs. Mirrors types.WorldType on the server.
 */
export const WorldType = {
  Hub: "hub",
  Run: "run",
  /** A field world, shared like the hub, with no queue (FS-X2F2H §Requirements 1, 55). */
  Field: "field",
} as const;

export type WorldType = (typeof WorldType)[keyof typeof WorldType];

/** A field world's stable id, sent as `field` in its world_entered (FS-X2F2H §Requirements 2). */
export type FieldId = "gentle_meadows" | "forlorn_forest";

/**
 * The one message that tells the client which world it is now in. It arrives on
 * every transition — into the hub, into a run, and back — so the client has a
 * single place to switch scenes rather than inferring the world from the shape
 * of a state broadcast.
 */
export interface WorldEnteredPayload {
  session_id: string;
  world_type: WorldType;
  /** Which field, for a field world only (FS-X2F2H §Requirements 2). */
  field?: FieldId;
}

/**
 * The player's next world is on another server: connect to `addr`. For a run, the run with
 * `session_id` (FS-K2HKP §Requirements 21, 29); for a travel to the party leader's town, `hub`
 * and no session: the client enters that server's hub as its character (FS-NCC9J R18, R20). The
 * host's world_entered follows once they are seated.
 */
export interface WorldHandoffPayload {
  addr: string;
  session_id?: string;
  hub?: boolean;
  /** A landing pod sending the client back to the pod still holding the player (FS-MCYWK C14). */
  reconnect?: boolean;
}

/** How a player left active play, as their settlement names it (FS-GV8WN R19). */
export type SettlementOutcome = "escaped" | "died";

/** `pending` once written, `confirmed` once items-service has applied it (FS-GV8WN R19, R20). */
export type SettlementStatus = "pending" | "confirmed";

/** An item the player carried out: the WS item shape, `found` when it is a find from this run. */
export interface SettlementCarriedItem extends ItemState {
  found?: boolean;
}

/**
 * An item the player lost: the WS item shape, with why. `unsafe` is a find lost on death,
 * `consumed` one used up in the run (a drunk potion).
 */
export interface SettlementLostItem extends ItemState {
  reason: "unsafe" | "consumed";
}

/**
 * `settlement`, sent only to the player who settled, the moment they resolve (FS-GV8WN R19), and
 * again with `status: confirmed` and the same content once it is applied (R20). Built from the
 * settlement snapshot, not from what items-service stored.
 */
export interface SettlementPayload {
  /** The run it settles: a late confirmation of an earlier run is not this run's (R20). */
  run_id?: string;
  outcome: SettlementOutcome;
  carried: SettlementCarriedItem[];
  lost: SettlementLostItem[];
  experience_gained: number;
  level_before: number;
  level_after: number;
  kills: number;
  seconds_in_run: number;
  status: SettlementStatus;
}
