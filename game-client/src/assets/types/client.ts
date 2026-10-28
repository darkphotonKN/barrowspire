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

export interface ChatPayload {
  message: string;
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
   * The server record the delver enters as (FS-BDA7X req 5, 41). Once the server seats by it,
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
  /** A dead delver leaving the run for the hub (FS-QPDKN req 13): no payload. */
  leave_run: Record<string, never>;
  /** A queued delver cancelling (FS-G4VMQ req 18): no payload. */
  leave_queue: Record<string, never>;
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
} as const;

export type WorldType = (typeof WorldType)[keyof typeof WorldType];

/**
 * The one message that tells the client which world it is now in. It arrives on
 * every transition — into the hub, into a run, and back — so the client has a
 * single place to switch scenes rather than inferring the world from the shape
 * of a state broadcast.
 */
export interface WorldEnteredPayload {
  session_id: string;
  world_type: WorldType;
}

/**
 * The run this delver was matched into is hosted on another server: connect to
 * `addr` for the run with `session_id`. The host's world_entered follows once they are seated.
 * FS-K2HKP §Requirements 21, 29.
 */
export interface WorldHandoffPayload {
  addr: string;
  session_id: string;
}
