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
 * step taken after a character is chosen, so this payload carries nothing of
 * its own.
 */
export type EnterHubPayload = Record<string, never>;

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
