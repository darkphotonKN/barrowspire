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

/**
 * What a player shows anyone in their world, as an `other_players` entry carries it: never their
 * bag (`inventory`) or worn gear (`equipment`), which are not sent for anyone but the recipient
 * (FS-KE075 §I R51, R54; ADR-0064). Mirrors Go types.PublicPlayerState.
 */
export interface PublicPlayerState {
  id: UUID; // Player's permanent user ID (from signup)
  entity_id: UUID; // Temporary entity ID in game session
  username: string;
  class: string;
  position: Position;
  direction: PlayerDirection;
  escape: boolean;
  current_health?: number;
  max_health?: number;
  /**
   * The player's class resource (FS-8AY7S req 17): sent on `current_player`, and on an
   * `other_players` entry only for the recipient's party members (FS-CH21F R1, R2), in every
   * world. Absent from everyone else, and from any server before FS-CH21F.
   */
  resource?: ResourceState;
  /** The character's level (FS-BDA7X req 42); sent with every player, run and hub. */
  level?: number;
  /** Total experience, monotonic. */
  experience?: number;
  /** Total experience at which the current level began. */
  level_floor?: number;
  /** Total experience that reaches the next level; absent at the cap (level 20). */
  next_level_at?: number;
  /**
   * The character's specialization id (FS-E1ZDG §B R9), derived on the server from the tier-6 node held:
   * on `current_player` and every `other_players` entry, in every world; absent before the pick.
   */
  specialization?: string;
  /**
   * The Mercenary's parry stance (FS-MAMHR req 28): sent on a mercenary's own `current_player`,
   * and on their `other_players` entry to their party members (FS-CH21F R1); absent for every
   * other class and to anyone outside the party. Whether the stance is open this tick.
   */
  parry_open?: boolean;
  /** Seconds left on the whiff lockout, 0 when none (FS-MAMHR req 28). A raw float. */
  parry_lockout?: number;
  /**
   * Strikes this merc has parried in this run, monotonic (FS-MAMHR req 28): a rise is a parry,
   * and it still rises at 3 parry charges, where the charge count does not move.
   */
  parries?: number;
  /**
   * The timed states a book ability set on this delver (FS-X2CMM §F R34): afloat, draught (healing after a
   * drink), hardened, long_night and trackers_eye, each with its seconds left, sorted by name. On `current_player` and every
   * `other_players` entry alike; absent when none. Mirrors Go types.PublicPlayerState.BookStates.
   */
  book_states?: BookTimedState[];
  /**
   * Seconds of poison left (FS-5FZ4J §I R47): on every player's entry, so a teammate's bar can
   * show it; absent when not poisoned, and always in the hub.
   */
  poisoned_for?: number;
  /**
   * True while the player carries the hallowed altar's Blessing (FS-5FZ4J §I R47): on every player's
   * entry, as poison is; absent when not, and always in the hub.
   */
  blessed?: boolean;
  /**
   * True while the player holds Contract Settled (FS-4EC7Z §F R25): on every player's entry, as the
   * Blessing is; absent when not, and always in the hub.
   */
  contract_settled?: boolean;
  /**
   * The roll under way (FS-7P736 R12): its direction, on `current_player` and every `other_players` entry
   * while that delver is rolling, so every viewer can draw it; absent otherwise.
   */
  roll?: RollState;
}

/** A roll's direction as the server holds it (FS-7P736 R12), normalised. */
export interface RollState {
  dir_x: number;
  dir_y: number;
}

/** A contract's state (FS-4EC7Z §E R19–R20, §F R25). */
export type ContractStateName = "active" | "settled" | "lost";

/**
 * The delve's contract as its taker is told it (FS-4EC7Z §F R25): its state and, while active, the
 * mark's heading from them as a compass word (`east`, `north-east`, …), never its position.
 */
export interface ContractState {
  state: ContractStateName | (string & {});
  heading?: string;
}

/**
 * A named state a book ability set on a delver, with its seconds left (FS-X2CMM §F R34). Mirrors Go
 * types.BookTimedState. A name the client does not know is drawn as nothing.
 */
export interface BookTimedState {
  name: string;
  remaining: number;
}

/** The book states the client draws on a delver (FS-X2CMM §E R23, R26, R27, R30, R31; §I R47). */
export type BookStateName = "afloat" | "draught" | "hardened" | "long_night" | "trackers_eye";

/**
 * The owner's class book (FS-X2CMM §F R32): in a run only, absent in the hub and the fields. Its pages
 * are the ones the server can resolve, in book order, locked ones included; `[]` for an empty book.
 * Never on an `other_players` entry (R33). Mirrors Go types.BookState.
 */
export interface BookState {
  pages: BookPageState[];
  /** The page being cast, while one is; absent otherwise (§D, R32). */
  casting?: BookCastingState;
}

/**
 * One offered page as its owner is told it (FS-X2CMM §F R32): its id, the character level it unlocks
 * at, its whole cost in the class resource (0 for the mercenary's), its book cooldown (`{0, 0}` when
 * ready, FS-Q18Q3 R1), and whether a once-per-floor or once-per-delve use is spent. Its own terms come
 * with it, so the tip words them and a retune needs no client change (Reconciled at review):
 * `cooldown_length` its cooldown's seconds (0 for a limited page) and `limit` how often a limited page
 * may be cast, absent for a timed one; `cast_time` its cast time's seconds, 0 for an instant page
 * (§Change: Illuminated pages and the open tome, C5). Mirrors Go types.BookPageState.
 */
export interface BookPageState {
  id: string;
  unlock_level: number;
  cost: number;
  cooldown: CooldownState;
  spent: boolean;
  cooldown_length: number;
  limit?: BookPageLimit;
  cast_time: number;
}

/** How often a page without a cooldown may be cast: once a floor, or once a delve (FS-X2CMM §A R8). */
export type BookPageLimit = "floor" | "delve";

/** A cast in progress as its caster is told it (FS-X2CMM §D, R32): the page, seconds left, the whole cast time. */
export interface BookCastingState {
  page: string;
  remaining: number;
  total: number;
}

/**
 * A book effect on the floor as every recipient of the run is told it (FS-X2CMM §F R34): its entity id,
 * its kind ({@link BookEffectKind}; a kind the client does not know is drawn as nothing), where it stands in
 * px, its seconds left. A kind that shows more adds its own fields. Mirrors Go types.BookEffectState.
 */
export interface BookEffectState {
  id: UUID;
  kind: string;
  x: number;
  y: number;
  remaining: number;
  /** How many monsters a rune has caught so far, absent while none: it flashes as the count climbs (R24, R47). */
  caught?: number;
  /** A hound's archer, by player id (R28, R34); absent on every other kind. */
  owner_id?: string;
  /** A hound's health and its max (R28, R34); absent on every other kind. */
  health?: number;
  max_health?: number;
  /** What a hound is doing (R34, R47), which clip it plays; absent on every other kind. */
  action?: HoundAction;
  /**
   * A hound's bay while it shows (R49): the point, world px, it bays toward, the nearest shut secret door or
   * seal piece or tripwire whose ambush still waits; absent otherwise and on every other kind.
   */
  bay?: { x: number; y: number };
}

/**
 * The book effects the client draws (FS-X2CMM §E R21, R24, R27, R28): a Witchlight's light, a Binding Glyph's
 * rune, a Brew's draught (an interactable: any delver drinks it with `interact` by its `id`), the archer's
 * hound (a body that moves, bites and falls, drawn apart from the rest: `src/render/creatures/hounds.ts`).
 */
export type BookEffectKind = "witchlight" | "rune" | "draught" | "hound";

/** What a hound is doing (FS-X2CMM R34): standing, running, biting, or fallen at 0 health. */
export type HoundAction = "idle" | "run" | "bite" | "dead";

/**
 * A player's own state, as `current_player` carries it: what they show, and their own bag and worn
 * gear (FS-KE075 §I R52). Mirrors Go types.PlayerState.
 */
export interface PlayerState extends PublicPlayerState {
  inventory?: ItemState[]; // 玩家背包
  equipment?: EquipmentState; // 玩家已裝備的 loadout
  /**
   * The recipient's own timed open (FS-MQYEX R18): sent every tick while it runs, in a run only;
   * absent when they have none. Never on an `other_players` entry (R19).
   */
  timed_open?: TimedOpenState;
  /**
   * The right-click ability's cooldown (FS-Q18Q3 §A R1–R2): sent whenever the delver has an
   * ability, in every world; a mercenary's is the whiff lockout. Absent from an older server.
   * Never on an `other_players` entry (R6).
   */
  ability_cooldown?: CooldownState;
  /**
   * The tree ability's cooldown (FS-Q18Q3 §A R4): sent only while the character holds its tree's
   * ability, so its absence means the ability is not held. Never on an `other_players` entry (R6).
   */
  tree_ability_cooldown?: CooldownState;
  /**
   * The roll cooldown (FS-7P736 R7, R12), FS-Q18Q3's shape: present only while it runs. Never on an
   * `other_players` entry. The client never times it: Space reads it (R13, R14), the pip sweeps it (R16).
   */
  roll_cooldown?: CooldownState;
  /**
   * The passive tree's ranks held, by node id, nodes at rank 1 or more only (FS-8RZ51 R23): sent on
   * `current_player` in every world, `{}` when none. Never on an `other_players` entry (ADR-0064).
   */
  passive_ranks?: Record<string, number>;
  /** The unspent passive points, derived from the current level (FS-8RZ51 R7, R23). */
  passive_points?: number;
  /** The owner's class book, in a run only (FS-X2CMM §F R32); never on an `other_players` entry (R33). */
  book?: BookState;
  /**
   * The delve's contract when this player took it (FS-4EC7Z §F R25); absent for everyone else and
   * when none was taken. Never on an `other_players` entry.
   */
  contract?: ContractState;
}

/**
 * One of the player's own abilities' cooldowns as the server judges it (FS-Q18Q3 §A R1–R3), in
 * float seconds. `total` is the length it started at, worn attack speed applied, and does not
 * change while it runs; both are 0 when nothing runs. Mirrors Go types.CooldownState.
 */
export interface CooldownState {
  remaining: number;
  total: number;
}

/**
 * A timed open as the server counts it (FS-MQYEX R18): the shut container a player is standing at,
 * and how far along the server's own timer is. The client draws it and never times it.
 */
export interface TimedOpenState {
  /** The target being worked: a shut container, or a detected secret door (FS-5FZ4J §I R49). */
  entity_id: UUID;
  /**
   * What the timed interact is for (FS-5FZ4J §I R49): `open` a container, `search` a secret door,
   * `pray` at the hallowed altar. Absent from a server before FS-5FZ4J, which only opened.
   */
  target_kind?: TimedTargetKind | (string & {});
  /** Simulation time counted so far, in seconds. */
  elapsed: number;
  /** The time it takes, in seconds. */
  duration: number;
}

/** What a timed interact does to its target (FS-5FZ4J §I R49). */
export type TimedTargetKind = "open" | "search" | "pray";

/** What a class resource is (FS-8AY7S req 17): mage mana, warrior/archer stamina, mercenary parry charges. */
export type ResourceKind = "mana" | "stamina" | "parry_charges";

/**
 * A player's class resource as the broadcast carries it (FS-8AY7S req 17). `current` is the pool
 * rounded down, so `current >= ability_cost` agrees with the server.
 */
export interface ResourceState {
  kind: ResourceKind;
  current: number;
  max: number;
  /** What the player's own ability costs in this pool. */
  ability_cost: number;
  /**
   * What one cast of the class's tree ability costs in this pool, the least it needs for one that
   * spends a variable amount (FS-Q18Q3 §A R5). Present only while the tree ability is held.
   */
  tree_ability_cost?: number;
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
  /**
   * An owned instance's lifecycle status, from the hub's REST read (`AVAILABLE`, `LISTED`, ...):
   * only an `AVAILABLE` one moves between bag and stash (FS-VPD8Y R39–40); an `IN_RUN` one is
   * still in a delve and takes no change at all (FS-18Z5F R38). Absent in a run.
   */
  status?: string;
  /**
   * An unsafe find: picked up in this run or field world, not brought in, so lost if the player
   * dies before escaping (FS-18Z5F R39). Only `true` is sent; absent means safe.
   */
  unsafe?: boolean;
  lootedAt?: number; // 本地取得時間戳，用於 pending 判斷
}

/** One affix on an item (FS-4R9M9 R16, R19): tier 0 is a unique's fixed affix. */
export interface AffixState {
  stat: string;
  tier: number;
  value: number;
}

/**
 * What a container is (FS-4R9M9 R55, FS-1D6BX R12): a floor's chest, or the sack that may stand
 * where a chest would (a chest in every respect but its look and its roll), or the drop pile a
 * slain monster left, which is always open and stays in state, emptied, once its last item is
 * taken. The wire may carry a kind this client does not know: read it through {@link placedKind}.
 */
export type ContainerKind = "chest" | "sack" | "drop_pile";

const CONTAINER_KINDS: readonly string[] = ["chest", "sack", "drop_pile"] satisfies ContainerKind[];

/**
 * The kind a container is drawn and opened as: its own, or a chest's when this client does not
 * know it, so a newer server never breaks an older client's world (FS-1D6BX D2). Every switch on a
 * container's kind goes through this.
 */
export function placedKind(container: { kind: string }): ContainerKind {
  return CONTAINER_KINDS.includes(container.kind) ? (container.kind as ContainerKind) : "chest";
}

// Container/chest state
export interface ContainerState {
  container_id: UUID;
  entity_id: UUID;
  kind: ContainerKind;
  position: Position;
  is_open: boolean;
  items: ItemState[];
  /** A field pile's killer (member id) while its killer-first window is open; absent after it,
   *  and on every run pile and chest (FS-X2F2H §Requirements 35). */
  reserved_for?: UUID;
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

/**
 * The Tome of Filth while it lies on the party's floor (FS-3103M §E R14): cut per recipient by
 * distance on a dungeon floor, as a container is.
 */
export interface TomeState {
  entity_id: UUID;
  position: Position;
}

/** The Altar of Consecration on its floor, sent whole; `burned` once the tome was burned there (R14). */
export interface AltarState {
  entity_id: UUID;
  position: Position;
  burned: boolean;
}

/** A floor's healing fountain, sent whole on its floor; `dry` once its pool is spent (FS-5FZ4J §I R46). */
export interface FountainState {
  entity_id: UUID;
  position: Position;
  dry: boolean;
}

/**
 * The hallowed altar on its floor, sent whole once reachable (listed only once its hidden room, if it
 * stands in one, is open); `prayed` once a prayer at it completed (FS-5FZ4J §I R46). Never the Altar
 * of Consecration's {@link AltarState}.
 */
export interface HallowedAltarState {
  entity_id: UUID;
  position: Position;
  prayed: boolean;
}

/** What the wandering merchant sells (FS-9JV5K §A R3–R4): a ware the client does not know keeps its own name. */
export type WareKind = "health_potion" | "antidote" | "tome_of_filth";

/**
 * A ware's display data (FS-9JV5K §A R4): its template's name, rarity and the stats the icon resolver
 * reads (`itemIcon`), since the catalogue sends no icon or item code. game-service's `MerchantWareItem`.
 */
export interface MerchantWareItem {
  name: string;
  item_type?: string;
  rarity?: string;
  healing_amount?: number;
  mana_amount?: number;
}

/** One of his wares: its kind, price in gold, how many are neither sold nor reserved, and the item; none for the tome. */
export interface MerchantWareState {
  ware: WareKind | (string & {});
  price: number;
  left: number;
  item?: MerchantWareItem;
}

/** The wandering merchant on his floor and his wares, sent whole; absent in the hub, a field and elsewhere (FS-9JV5K §A R4). */
export interface MerchantState {
  entity_id: UUID;
  position: Position;
  wares: MerchantWareState[];
}

/** A cell's column and row on the floor map's grid (FS-5FZ4J §I R46). */
export interface CellState {
  x: number;
  y: number;
}

/** What a seal is broken by (FS-5FZ4J §B R9, §I R46). Read off the wire as a string: a newer kind is named as sent. */
export type SealKind = "lever_order" | "weighted_plates" | "hidden_key" | "chasm" | "braziers";

/**
 * A sealed floor's seal (FS-5FZ4J §I R46): the current, first unbroken seal's kind and 1-based
 * stage, or the last one's once all are broken; `broken` once every seal of the floor is. Absent in
 * the hub, a field, the top floor and on a floor of buildings.
 */
export interface SealState {
  kind: SealKind | (string & {});
  stage: number;
  stages: number;
  broken: boolean;
  /** Seconds left while a Braziers window runs; absent otherwise (and from a server that has no Braziers yet). */
  window_ends_in?: number;
  /** Set while the party carries the floor's stair key; absent otherwise. */
  key_carried?: boolean;
}

/** What a seal piece is (FS-5FZ4J §I R46). */
export type SealPieceKind = "lever" | "plate" | "block" | "brazier" | "stair_key" | "bridge_lever" | "mural" | "shrine";

const SEAL_PIECE_KINDS: readonly string[] = [
  "lever",
  "plate",
  "block",
  "brazier",
  "stair_key",
  "bridge_lever",
  "mural",
  "shrine",
] satisfies SealPieceKind[];

/**
 * One seal piece (FS-5FZ4J §I R46): `active` a lever down, a plate held, a brazier lit, a bridge
 * lowered, false for the others; `glyph` on a lever only. A stair key is listed while it lies, a
 * shrine once its hidden room is open. `kind` may be one this client does not know: read it through
 * {@link knownSealPiece}.
 */
export interface SealPieceState {
  entity_id: UUID;
  kind: SealPieceKind | (string & {});
  position: Position;
  cell: CellState;
  glyph?: string;
  active: boolean;
}

/** What a barrier is (FS-5FZ4J §I R46). */
export type BarrierKind = "gate" | "secret_door" | "pit";

const BARRIER_KINDS: readonly string[] = ["gate", "secret_door", "pit"] satisfies BarrierKind[];

/**
 * One barrier and the cells it covers (FS-5FZ4J §I R46): a gate and the pits always listed, a
 * secret door only once detected. `open` a gate raised, a pit's lane bridged, a door found open.
 */
export interface BarrierState {
  entity_id: UUID;
  kind: BarrierKind | (string & {});
  cells: CellState[];
  open: boolean;
  /**
   * Set on a secret door the Cutthroats' tip revealed (FS-4EC7Z §F R28) or a book page revealed (Witchlight,
   * Tracker's Eye: FS-X2CMM §J R49), absent on every other.
   */
  revealed?: boolean;
}

/** What a trap is (FS-5FZ4J §D R27, §I R46), by the server's names. */
export type TrapKind = "spike_plate" | "dart_wall" | "fire_jet" | "tripwire" | "gas_vent";

const TRAP_KINDS: readonly string[] = ["spike_plate", "dart_wall", "fire_jet", "tripwire", "gas_vent"] satisfies TrapKind[];

/**
 * One detected trap (FS-5FZ4J §I R46): an undetected one is sent to no one. `armed` is false while
 * a fired trap waits to re-arm and for a spent tripwire; a gas vent is always armed, and its puff
 * is `puffed_at`, the floor's simulation time of its last, absent before its first (R48).
 * `revealed` is set once a book page revealed it (Witchlight, Tracker's Eye: FS-X2CMM §J R49).
 */
export interface TrapState {
  entity_id: UUID;
  kind: TrapKind | (string & {});
  cell: CellState;
  armed: boolean;
  revealed: boolean;
  puffed_at?: number;
}

/** A trap's kind as this client draws it, or `null` for one it does not know, which draws nothing. */
export function knownTrap(kind: string): TrapKind | null {
  return TRAP_KINDS.includes(kind) ? (kind as TrapKind) : null;
}

/**
 * A seal piece's kind as this client draws it, or `null` for one it does not know, which draws
 * nothing: a newer server never breaks an older client's world (unlike a container, there is no
 * kind to stand in for it).
 */
export function knownSealPiece(kind: string): SealPieceKind | null {
  return SEAL_PIECE_KINDS.includes(kind) ? (kind as SealPieceKind) : null;
}

/** A barrier's kind as this client draws it, or `null` for one it does not know, which draws nothing. */
export function knownBarrier(kind: string): BarrierKind | null {
  return BARRIER_KINDS.includes(kind) ? (kind as BarrierKind) : null;
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
  /**
   * What it is: `fireball`, `arrow`, `shadow_shot`, a Bone Archer's `bone_arrow` (a volley's too),
   * a goblin's `thrown_dagger` and an ogre's `ogre_rock` (FS-C8VM7 §B R18), and any later kind.
   */
  projectile_type: string;
  position: Position;
  velocity: { vx: number; vy: number };
}

/**
 * A place in the hub a player walks into to go somewhere (FS-0XMCP §Requirements 6). Its position
 * and range are the server's: every gameplay decision about a gate reads them from here.
 */
export interface GateState {
  entity_id: UUID;
  /**
   * `hub` is a field's entrance gate, the road back (FS-X2F2H §Requirements 3). `dev_endgame_run`
   * starts a run, not a field visit (FS-BDRTJ §Change: Endgame test run, R19).
   */
  destination: "spire" | "forest" | "meadows" | "dev_test_room" | "dev_endgame_run" | "hub";
  position: Position;
  /** World px from `position` within which a player is at the gate. */
  range: number;
}

// Complete game state received from server
/**
 * One of the hub's residents. `function` is empty for an ambient NPC; the Elder's is
 * `storyteller` (FS-0XMCP §Requirements 23).
 */
export interface NPCState {
  entity_id: UUID;
  name: string;
  function: "" | "storyteller" | "storekeeper";
  /** How they look, e.g. "green_skirt". Empty for a function NPC. */
  appearance?: string;
  position: Position;
}

/** What kind of monster it is: picks its sheet and size tier (FS-77AB6 req 32, 34–35). */
export type MonsterArchetype =
  | "ghoul"
  | "troll"
  // the ghoul with a bow (FS-B4SG9 §A R2): sent only on floor 1 of a run
  | "bone_archer"
  // the tower's own dead (FS-M8CSE §D R17, R21): sent only on run floors
  | "barrow_thrall"
  | "spire_wraith"
  | "demon"
  // the rarer second boss (FS-VHGE7 §C R26): sent only on run floors
  | "blood_demon"
  // a Master Spire's boss (FS-M8CSE §E R25): sent only on the top floor of a height-10 run
  | "daagon"
  // the Forlorn Forest's dead (FS-3QHQZ R18): sent only in the Forest field
  | "zombie"
  | "ghost"
  // Gentle Meadows' one creature (FS-X2F2H R53): sent only in the Meadows field
  | "boar"
  // the Spire's tiered variants (FS-C8VM7 §A R3): sent only on run floors, by the floor's pool
  | "ghast"
  | "ravener"
  | "ashen_archer"
  | "wight_archer"
  | "cave_troll"
  | "blood_troll"
  | "plague_thrall"
  | "blightborn"
  | "shade"
  | "phantom"
  | "banshee"
  // a goblin variant spawns in one of two looks, blade or blade and shield (FS-C8VM7 §A R8)
  | "goblin"
  | "goblin_shield"
  | "goblin_cutthroat"
  | "goblin_cutthroat_shield"
  | "goblin_reaver"
  | "goblin_reaver_shield"
  | "goblin_warchief"
  | "goblin_warchief_shield"
  | "ogre"
  | "ogre_mauler"
  | "ogre_tyrant"
  | "dark_warrior"
  | "dark_reaper"
  // the hostile humans (FS-4EC7Z §F R24): turned and called Cutthroats, and the contract's mark,
  // each in its `look`; sent only on run floors
  | "cutthroat"
  | "contract_mark";

/**
 * What a monster is doing this tick. `attack` is the wind-up and the strike (a demon's slam).
 * `claw` is a demon's fire claw (FS-VHGE7 §B R24): no wind-up, reported for 0.4 s from the tick
 * it lands while the demon stands still. `stunned` is every tick an Earthbreaker stun runs on it
 * (FS-04EEA §C R17), whatever it was doing, a leap in the air included; `dead` wins over it.
 */
export type MonsterAction = "idle" | "move" | "attack" | "claw" | "ability" | "stunned" | "dead";

/** A monster ability's kind (FS-C8VM7 §B R11, R17). */
export type MonsterAbilityKind =
  | "pounce"
  | "ground_slam"
  | "burst"
  | "wail"
  | "cleave"
  | "volley"
  | "dagger"
  | "rock";

/**
 * A monster's pending ability (FS-C8VM7 §B R17): sent while its area or cone is pending (its
 * wind-up, a pounce's leap, a death burst's fuse), fixed where it will land. A shot ability sets
 * only `kind` and `remaining`, its radius 0.
 */
export interface MonsterAbility {
  kind: MonsterAbilityKind;
  /** The area's centre, in world px. */
  x: number;
  y: number;
  /** The area's radius, a cone's reach, in world px; 0 for a shot. */
  radius: number;
  /** A cone's full angle in degrees; 0 for a circle. */
  arc: number;
  /** Seconds until it lands. */
  remaining: number;
}

/** One monster in a run's state broadcast (FS-77AB6 req 32). Absent or empty in the hub. */
export interface MonsterState {
  entity_id: UUID;
  archetype: MonsterArchetype;
  /**
   * A hostile human's art variant within its archetype (FS-4EC7Z §F R24): a Cutthroat's
   * `cutthroat_a`, the mark's `hooded_duelist`; absent for every archetype whose look is itself.
   */
  look?: string;
  /** Server-authored display name, including any elite prefix. */
  name: string;
  level: number;
  elite: boolean;
  boss: boolean;
  position: Position;
  /** The direction it faces: non-zero while it stands, winds up or lies dead. */
  facing: Position;
  action: MonsterAction;
  /** Its ability's area or cone while one is pending, a dead Blightborn's burst included (FS-C8VM7 §B R17). */
  ability?: MonsterAbility;
  current_health: number;
  max_health: number;
}

export interface ClientGameState {
  session_id: UUID;
  /** Which kind of world this state came from. Mirrors types.WorldType. */
  world_type?: "hub" | "run" | "field";
  current_player: PlayerState | null; // This client's player state
  /** Other players in the world: what they show, never their bag or worn gear (FS-KE075 §I). */
  other_players: PublicPlayerState[];
  items: string[]; // TODO: Update when items are structured
  doors: DoorState[];
  /**
   * The hub's and a field's walls, every tick. A run's state has none on any floor: its walls
   * come once per floor in its `floor_map` (FS-KE075 §F.34, ADR-0060), so the run scene never
   * reads this key.
   */
  walls?: WallState[];
  containers: ContainerState[];
  escape_doors: EscapeDoorState[]; // Escape doors with lock state
  switches: SwitchState[]; // Switches/buttons for puzzles
  npcs?: NPCState[]; // The hub's residents; absent in a run
  /** The hub's gates (FS-0XMCP §Requirements 6); absent in a run. */
  gates?: GateState[];
  projectiles?: ProjectileState[]; // Active projectiles in session
  monsters?: MonsterState[]; // A run's monsters, corpses included; absent in the hub
  /** The party's floor, 1-based (FS-F6F88 req 26). Run only; absent in the hub. */
  floor?: number;
  /** Stairs up: empty on the top floor, absent in the hub (FS-F6F88 req 27). */
  stairs?: StairsState[];
  /** Live burning trails, a full snapshot each tick; absent when none, always absent in the hub (FS-4R9M9 R56). */
  trails?: TrailState[];
  /** A tome run's tome while it lies on this floor; absent otherwise (FS-3103M §E R14). */
  tome?: TomeState;
  /** The altar on its floor; absent on every other floor, and in the hub and a field (R14). */
  altar?: AltarState;
  /** Set while the party carries the tome and has not burned it; absent otherwise (R14). */
  tome_carried?: boolean;
  /** The run's book effects on the floor (witchlights, runes, draughts), for every recipient; absent when none (FS-X2CMM §F R34). */
  book_effects?: BookEffectState[];
  /** A sealed floor's seal; absent anywhere else (FS-5FZ4J §I R46). */
  seal?: SealState;
  /** A sealed floor's pieces, sent whole; absent anywhere else (R46). */
  seal_pieces?: SealPieceState[];
  /** A sealed floor's gate and pits, and its detected secret doors, sent whole; absent anywhere else (R46). */
  barriers?: BarrierState[];
  /** A dungeon floor's detected traps, sent whole; absent with none detected and anywhere else (R46). */
  traps?: TrapState[];
  /** A floor's healing fountain; absent with none and anywhere else (R46). */
  fountain?: FountainState;
  /** The hallowed altar on its floor once reachable; absent anywhere else (R46). */
  hallowed_altar?: HallowedAltarState;
  /** The floor's wandering merchant and his wares, sent whole; absent with none and anywhere else (FS-9JV5K §A R4). */
  merchant?: MerchantState;
  /** A run floor's encounter NPCs, cut by interest as monsters are; absent with none and anywhere else (FS-4EC7Z §F R22). */
  encounter_npcs?: EncounterNPCState[];
  /** A run floor's Captives' cage, sent whole; absent with none (FS-4EC7Z §F R23). */
  cages?: CageState[];
  /** The cage key while it lies on the floor, sent whole; absent otherwise (R23). */
  encounter_keys?: EncounterKeyState[];
  /** Set while the party carries the cage key; absent otherwise (R23). */
  cage_key_carried?: boolean;
  escaped_count: number; // Number of players who have escaped
}

/** What an encounter NPC is (FS-4EC7Z §F R22). */
export type EncounterKind = "pilgrim" | "captive" | "cutthroat";
/** Whose side an encounter NPC is on, or that it is caged (R22). */
export type EncounterStance = "peaceful" | "caged" | "ally";
/** What an encounter NPC is doing this tick (R22). */
export type EncounterAction = "idle" | "move" | "attack" | "cower" | "dead";

/**
 * One encounter NPC (FS-4EC7Z §F R22): its kind, its art variant (`look`), where it stands and faces,
 * how hale it is, its stance and what it is doing. `line` is the key of the last line it said and
 * `line_at` when, on its own clock, rising with each line: the client shows a line once per
 * `line_at`. `hirer_id` is an ally's hirer's member id. Mirrors Go types.EncounterNPCState.
 */
export interface EncounterNPCState {
  entity_id: UUID;
  kind: EncounterKind | (string & {});
  look: string;
  position: Position;
  facing: Position;
  health: number;
  max_health: number;
  stance: EncounterStance | (string & {});
  action: EncounterAction | (string & {});
  line?: string;
  line_at?: number;
  hirer_id?: UUID;
}

/** The Captives' cage (FS-4EC7Z §F R23): where it stands and whether it is open. */
export interface CageState {
  entity_id: UUID;
  position: Position;
  open: boolean;
}

/** The cage key lying on the floor (FS-4EC7Z §F R23). */
export interface EncounterKeyState {
  entity_id: UUID;
  position: Position;
}

/** One rect of a region, in cells of the floor's `cell_size` (FS-KE075 §F.31). */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One named part of a dungeon floor's walkable cells: a room or a corridor segment. */
export interface FloorRegion {
  id: number;
  kind: "room" | "corridor";
  cells: CellRect[];
}

/**
 * A run floor's static layout, sent once per floor as `floor_map` (FS-KE075 §F.31, ADR-0060):
 * after the run's `world_entered`, on every floor change and in answer to `request_floor_map`.
 * `cell_size` and `regions` come only with a floor built on a cell grid; a floor of buildings
 * carries its walls with their `house_id` as the snapshot used to.
 */
export interface FloorMap {
  session_id: UUID;
  floor: number;
  width: number;
  height: number;
  cell_size?: number;
  regions?: FloorRegion[];
  walls: WallState[];
  /**
   * Every archetype the floor's pool can spawn, a goblin variant both its looks (FS-C8VM7 §G R40,
   * ADR-0081 Decision 2): never a boss, so it says nothing of the floor's place in the run. Absent
   * from an older server, and from a floor with no pool.
   */
  enemy_pool?: string[];
}

/** Whether a `floor_map` payload is one: a run's floor with a size and its walls. */
export function isFloorMap(data: unknown): data is FloorMap {
  const map = data as Partial<FloorMap> | null;
  return (
    !!map &&
    typeof map.session_id === "string" &&
    typeof map.floor === "number" &&
    typeof map.width === "number" &&
    typeof map.height === "number" &&
    Array.isArray(map.walls)
  );
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
