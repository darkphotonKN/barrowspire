// Game state types matching Go server structures

// Matching Go uuid.UUID type
export type UUID = string;

// Player position in 2D space
export interface Position {
  x: number;
  y: number;
}

// Player movement direction and velocity
export interface PlayerDirection {
  vx: number;
  vy: number;
  speed: number;
}

// Individual player state
export interface PlayerState {
  id: UUID; // Player's permanent user ID (from signup)
  entity_id: UUID; // Temporary entity ID in game session
  username: string;
  class: string;
  position: Position;
  direction: PlayerDirection;
  inventory?: ItemState[]; // 玩家背包
  equipment?: EquipmentState; // 玩家已裝備的 loadout
  escape: boolean;
  current_health?: number;
  max_health?: number;
  current_mana?: number;
  max_mana?: number;
  /** The character's level (FS-BDA7X req 42); sent with every delver, run and hub. */
  level?: number;
  /** Total experience, monotonic. */
  experience?: number;
  /** Total experience at which the current level began. */
  level_floor?: number;
  /** Total experience that reaches the next level; absent at the cap (level 20). */
  next_level_at?: number;
}

// Player equipment state from server (matches Go types.EquipmentState JSON tags).
// Note: backend uses chest/gloves/legs; frontend UI uses body/hands/feet — map when consuming.
export interface EquipmentState {
  weapon: ItemState | null;
  head: ItemState | null;
  chest: ItemState | null;
  gloves: ItemState | null;
  legs: ItemState | null;
  ring_1: ItemState | null;
  ring_2: ItemState | null;
  consumable_1: ItemState | null;
  consumable_2: ItemState | null;
  consumable_3: ItemState | null;
}

// Door/interactable state
export interface DoorState {
  entity_id: UUID;
  position: Position;
  width: number;
  height: number;
  is_open: boolean;
}

// Item state
export interface ItemState {
  item_id: UUID;
  entity_id: UUID;
  name: string;
  quantity: number;
  attack_power?: number;
  critical_rate?: number;
  weapon_type?: string;
  defense_rating?: number;
  armor_slot?: string;
  healing_amount?: number;
  mana_amount?: number;
  description?: string;
  /** The level a character needs to equip it (FS-BDA7X req 30); absent means 1. */
  required_level?: number;
  /** Armour's magic resistance (FS-4R9M9 R54); absent means 0. */
  magic_resistance?: number;
  /** The rarity tier's code: normal, uncommon, rare, runed or fabled. Absent on an unrolled item. */
  rarity?: string;
  /** The level the item rolled at (FS-4R9M9 R54); absent on an item from before item levels. */
  item_level?: number;
  /** Every rolled affix, and a unique's fixed ones (tier 0); absent when it has none. */
  affixes?: AffixState[];
  /** A unique's effect, in words; absent on any other item. */
  unique_effect?: string;
  /**
   * The item's type, where the source names it (the loadout's item instances do, and the run's
   * world state does once the server sends it, I-4R9M9-16). Where it is absent,
   * {@link getItemType} falls back to reading it from the stats.
   */
  item_type?: string;
  durability?: number;
  lootedAt?: number; // 本地取得時間戳，用於 pending 判斷
}

/** One affix on an item (FS-4R9M9 R16, R19): tier 0 is a unique's fixed affix. */
export interface AffixState {
  stat: string;
  tier: number;
  value: number;
}

/**
 * What a container is (FS-4R9M9 R55): a floor's chest, or the drop pile a slain monster left,
 * which is always open and stays in state, emptied, once its last item is taken.
 */
export type ContainerKind = "chest" | "drop_pile";

// Container/chest state
export interface ContainerState {
  container_id: UUID;
  entity_id: UUID;
  kind: ContainerKind;
  position: Position;
  is_open: boolean;
  items: ItemState[];
}

// Escape door state
export interface EscapeDoorState {
  entity_id: UUID;
  position: Position;
  is_open: boolean;
  is_locked: boolean;
}

// Switch/button state
export interface SwitchState {
  entity_id: UUID;
  position: Position;
  switch_id: number;
  is_activated: boolean;
}

/** Stairs up to the next floor (FS-F6F88 req 27). Every floor below the top has one. */
export interface StairsState {
  entity_id: UUID;
  position: Position;
}

// Wall state
export interface WallState {
  house_id?: UUID;
  entity_id: UUID;
  position: Position;
  width: number;
  height: number;
}

/**
 * A live burning trail (FS-4R9M9 R36, R56): the path a `burning_dash` wearer dashed, burning
 * `half_width` world px either side of `from`→`to` for `remaining` more seconds (3 → 0).
 */
export interface TrailState {
  entity_id: UUID;
  from: Position;
  to: Position;
  half_width: number;
  remaining: number;
}

export interface ProjectileState {
  entity_id: UUID;
  projectile_type: string;
  position: Position;
  velocity: { vx: number; vy: number };
}

// Complete game state received from server
/** One of the hub's residents. `function` is empty for an ambient NPC. */
export interface NPCState {
  entity_id: UUID;
  name: string;
  function: "" | "delve" | "storekeeper";
  /** How they look, e.g. "green_skirt". Empty for a function NPC. */
  appearance?: string;
  position: Position;
}

/** What kind of monster it is: picks its sheet and size tier (FS-77AB6 req 32, 34–35). */
export type MonsterArchetype = "ghoul" | "troll" | "demon";

/** What a monster is doing this tick. `attack` is the wind-up and the strike. */
export type MonsterAction = "idle" | "move" | "attack" | "dead";

/** One monster in a run's state broadcast (FS-77AB6 req 32). Absent or empty in the hub. */
export interface MonsterState {
  entity_id: UUID;
  archetype: MonsterArchetype;
  /** Server-authored display name, including any elite prefix. */
  name: string;
  level: number;
  elite: boolean;
  boss: boolean;
  position: Position;
  /** The direction it faces: non-zero while it stands, winds up or lies dead. */
  facing: Position;
  action: MonsterAction;
  current_health: number;
  max_health: number;
}

export interface ClientGameState {
  session_id: UUID;
  /** Which kind of world this state came from. Mirrors types.WorldType. */
  world_type?: "hub" | "run";
  current_player: PlayerState | null; // This client's player state
  other_players: PlayerState[]; // Other players in session
  items: string[]; // TODO: Update when items are structured
  doors: DoorState[];
  walls: WallState[];
  containers: ContainerState[];
  escape_doors: EscapeDoorState[]; // Escape doors with lock state
  switches: SwitchState[]; // Switches/buttons for puzzles
  npcs?: NPCState[]; // The hub's residents; absent in a run
  projectiles?: ProjectileState[]; // Active projectiles in session
  monsters?: MonsterState[]; // A run's monsters, corpses included; absent in the hub
  /** The party's floor, 1-based (FS-F6F88 req 26). Run only; absent in the hub. */
  floor?: number;
  /** How many floors the run has (FS-F6F88 req 26). Run only; absent in the hub. */
  floor_count?: number;
  /** Stairs up: empty on the top floor, absent in the hub (FS-F6F88 req 27). */
  stairs?: StairsState[];
  /** Live burning trails, a full snapshot each tick; absent when none, always absent in the hub (FS-4R9M9 R56). */
  trails?: TrailState[];
  escaped_count: number; // Number of players who have escaped
}

// Type guard to check if a message is a game state update
export function isGameState(data: any): data is ClientGameState {
  return (
    data &&
    typeof data.session_id === "string" &&
    (data.current_player !== undefined || data.other_players !== undefined)
  );
}

// Equipment types
export type EquipmentSlot = 'weapon' | 'head' | 'body' | 'hands' | 'feet' | 'ring_1' | 'ring_2' | 'consumable_1' | 'consumable_2' | 'consumable_3';

// Matches backend types.ArmorSlot — game-server/game-service/internal/types/game.go
export type ArmorSlot = 'head' | 'chest' | 'gloves' | 'legs';

export interface EquippedItems {
  weapon: ItemState | null;
  head: ItemState | null;
  body: ItemState | null;
  hands: ItemState | null;
  feet: ItemState | null;
  ring_1: ItemState | null;
  ring_2: ItemState | null;
  consumable_1: ItemState | null;
  consumable_2: ItemState | null;
  consumable_3: ItemState | null;
}

export type ItemType = 'weapon' | 'armor' | 'ring' | 'consumable' | 'unknown';

const ITEM_TYPES: readonly string[] = ['weapon', 'armor', 'ring', 'consumable'];

/**
 * What kind of item it is. A named type always wins; only where the source names none do the
 * stats decide, as a fallback, and then an item with no weapon, armour or restorative stats is a
 * ring: the one type whose power is all affixes (FS-4R9M9 R5).
 */
export function getItemType(item: ItemState): ItemType {
  const named = item.item_type?.trim().toLowerCase();
  if (named) return ITEM_TYPES.includes(named) ? (named as ItemType) : 'unknown';
  if (item.attack_power || item.weapon_type) return 'weapon';
  if (item.defense_rating !== undefined || item.armor_slot) return 'armor';
  if (item.healing_amount || item.mana_amount) return 'consumable';
  return 'ring';
}

export function getValidSlotsForItem(item: ItemState): EquipmentSlot[] {
  const type = getItemType(item);
  switch (type) {
    case 'weapon':
      return ['weapon'];
    case 'armor': {
      const slot = item.armor_slot as ArmorSlot | undefined;
      switch (slot) {
        case 'head': return ['head'];
        case 'chest': return ['body'];
        case 'gloves': return ['hands'];
        case 'legs': return ['feet'];
        default: return [];
      }
    }
    case 'ring':
      return ['ring_1', 'ring_2'];
    case 'consumable':
      return ['consumable_1', 'consumable_2', 'consumable_3'];
    default:
      return [];
  }
}

/**
 * The slot an equip puts an item in, as the server will: a consumable takes the first empty
 * consumable slot (none when all are full); a ring takes ring 1, then ring 2, and over ring 1
 * when both are worn (FS-4R9M9 R42); anything else its one slot. Null when it fits nowhere.
 */
export function equipSlotFor(
  item: ItemState,
  equipped: EquippedItems,
): EquipmentSlot | null {
  const slots = getValidSlotsForItem(item);
  if (slots.length === 0) return null;
  const empty = slots.find((slot) => equipped[slot] === null);
  switch (getItemType(item)) {
    case 'consumable':
      return empty ?? null;
    case 'ring':
      return empty ?? 'ring_1';
    default:
      return slots[0];
  }
}

export function getSlotDisplayName(slot: EquipmentSlot): string {
  const names: Record<EquipmentSlot, string> = {
    weapon: 'Weapon',
    head: 'Head',
    body: 'Body',
    hands: 'Hands',
    feet: 'Feet',
    ring_1: 'Ring 1',
    ring_2: 'Ring 2',
    consumable_1: 'Consumable 1',
    consumable_2: 'Consumable 2',
    consumable_3: 'Consumable 3',
  };
  return names[slot];
}

// Helper to format position for display
export function formatPosition(pos: Position): string {
  return `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`;
}

// Helper to format velocity for display
export function formatVelocity(dir: PlayerDirection): string {
  return `(${dir.vx.toFixed(1)}, ${dir.vy.toFixed(1)})`;
}
