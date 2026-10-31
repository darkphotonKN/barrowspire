import type { ChatChannel } from "@/stores/chatStore";
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
  /** A hub player walking into a field gate (FS-X2F2H req 9). */
  enter_field: { field: FieldId };
  /** A field player walking into the entrance gate, home to the hub (FS-X2F2H req 14): no payload. */
  leave_field: Record<string, never>;
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
 * The run this player was matched into is hosted on another server: connect to
 * `addr` for the run with `session_id`. The host's world_entered follows once they are seated.
 * FS-K2HKP §Requirements 21, 29.
 */
export interface WorldHandoffPayload {
  addr: string;
  session_id: string;
}
