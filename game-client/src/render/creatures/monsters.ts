/**
 * Monsters on the canvas (FS-77AB6 req 34–39): each monster in a run's state broadcast drawn from
 * its baked creature sheet, playing what the server says it is doing, with a hostile nameplate
 * and HP bar over its head; on a `frame` floor it has no plate, the target frame names it instead
 * (FS-48CTQ §B.3), and only a damaged one carries its bar (§F.18). A living monster is a target: the pointer over its footprint or its drawn body
 * reports it, a click strikes it, and a hit the server confirms flashes it.
 *
 * Nothing about a monster is client-held. The server sends where it stands, which way it faces
 * and what it is doing (`action`); the roster eases the position between ticks like a player's
 * and plays the clip the action names. A reconnect rebuilds every monster and corpse from the
 * next broadcast.
 *
 * The rules (which sheet, what size, which clip, what the plate reads) are pure. The roster
 * drives the scene's objects through {@link MonsterStage}, the narrow slice of Phaser it needs,
 * so it is tested without a canvas.
 */

import { CharacterAnimator, type AnimatedSprite } from "@/render/art/character";
import {
  MAX_WALK_SCALE,
  MOVING_SPEED,
  WALK_PACE,
  type AnimationChoice,
  type CharacterAnimation,
} from "@/render/art/animationSelect";
import type { ArtLibrary } from "@/render/art/library";
import { directionIndex } from "@/render/art/manifest";
import { facingFrom, type Facing8 } from "@/render/iso/facing";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import {
  DamageChip,
  MARKER_DEPTH,
  healthBarKey,
  markerBase,
  onBackingGrid,
  paintHealthBar,
} from "@/render/markers";
import { bodyHitArea, footprintHitArea, type BodyColumn } from "@/render/world/footprint";
import type { MarkerMode } from "./markerMode";
import { onDemandFor } from "@/render/art/sceneArt";
import { AbilityTelegraphs, type GroundBrush } from "@/render/effects/monsterAbility";
import type { MonsterAction, MonsterState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";

// ── Looks and size ────────────────────────────────────────────────────────

/**
 * Height tiers as a multiple of a player's (guideline "Enemy design language"): fodder
 * 0.85–1.0x, a brute 1.3–1.5x, a boss at least 1.8x. Each look aims at the middle of its band;
 * the boss's ceiling is ours, to keep it on screen.
 */
export const SIZE_TIERS = {
  fodder: { min: 0.85, max: 1.0, aim: 0.92 },
  brute: { min: 1.3, max: 1.5, aim: 1.4 },
  boss: { min: 1.8, max: 2.2, aim: 2.0 },
} as const;
export type SizeTier = keyof typeof SIZE_TIERS;

/** The player height a tier is measured against: the default class's sheet (`characterSheet`). */
export const PLAYER_REFERENCE_SHEET = "char_knight_base";

export interface MonsterLook {
  sheet: string;
  tier: SizeTier;
  /** A multiply tint over the whole sprite, when the look is a recoloured sheet. */
  tint?: number;
  /**
   * The sheet an elite is drawn from, when the archetype has its own elite look baked. It is
   * drawn as baked: the sheet is the elite's look. Without one an elite wears the hostile wash.
   */
  elite?: string;
  /**
   * How its size tier is measured: a standing figure by its height (the default), a quadruped by
   * its body length (guideline "Size is a threat tier").
   */
  measure?: "length";
  /**
   * Where in its tier's band it stands, as a multiple of a player's height: the tier's own aim
   * when absent. Inside the band only (FS-C8VM7 §F R34: the ogre family at the brute band's top).
   */
  aim?: number;
}

/** A Spire variant's own baked sheet (FS-C8VM7 §F R34): `creature_<archetype>_base`. */
const variant = (archetype: string, tier: SizeTier, aim?: number): MonsterLook => ({
  sheet: `creature_${archetype}_base`,
  tier,
  ...(aim === undefined ? {} : { aim }),
});

/** The ogre family reads bigger than a troll: the brute band's top (FS-C8VM7 §F R34). */
const OGRE_AIM = SIZE_TIERS.brute.max;

/** Each archetype the client has a look for. */
export const MONSTER_LOOKS: Record<string, MonsterLook> = {
  ghoul: { sheet: "creature_ghoul_base", tier: "fodder" },
  troll: { sheet: "creature_troll_base", tier: "brute" },
  /**
   * The Bone Archer (FS-B4SG9 §C R20): the ghoul holding a bow, on its own sheet. Its `attack`
   * clip is the shot, nock to loose, as long as the server's wind-up (§E R26).
   */
  bone_archer: { sheet: "creature_bone_archer_base", tier: "fodder" },
  /** The winged demon boss (req 41, FS-KYPQ9): its own baked sheet, drawn as baked, at boss size. */
  demon: { sheet: "creature_demon_base", tier: "boss" },
  /**
   * The rarer blood demon boss (FS-VHGE7 §C R26, §E R41): its own baked sheet, the demon rig in a
   * blood hide with heavier horns and larger wings, drawn as baked, at boss size.
   */
  blood_demon: { sheet: "creature_blood_demon_base", tier: "boss" },
  /** A Master Spire's boss (FS-M8CSE §H R41): the blood demon's own sheet, at boss size. */
  daagon: { sheet: "creature_blood_demon_base", tier: "boss" },
  /** The Forlorn Forest's dead (FS-3QHQZ §C R29): the shambling zombie, and the rarer ghost. */
  zombie: { sheet: "creature_zombie_base", tier: "fodder" },
  /** Its translucence is baked into the sheet (body alpha ≈ 0.6, eyes opaque): no tint here. */
  ghost: { sheet: "creature_ghost_base", tier: "fodder" },
  /**
   * The Spire's own dead (FS-M8CSE §H R37): baked recolours of the zombie and the ghost, in the
   * `creatures` group. Their colours are in the sheets: a tint would override the elite wash.
   */
  barrow_thrall: { sheet: "creature_barrow_thrall_base", tier: "fodder" },
  spire_wraith: { sheet: "creature_spire_wraith_base", tier: "fodder" },
  /**
   * Gentle Meadows' boar (FS-X2F2H §H R61): field wildlife on the quadruped rig, fodder by body
   * length, with its own elite sheet (bigger tusks, scarred, darker bristle).
   */
  boar: {
    sheet: "creature_boar_base",
    tier: "fodder",
    elite: "creature_boar_elite",
    measure: "length",
  },
  /**
   * The Spire's tiered variants (FS-C8VM7 §A R3, R8; §F R34), each on its own sheet at its
   * family's tier, until that sheet is in drawn as its stand-in (`drawnLook`, §G R44). The old
   * families' steps are baked recolours of their tier-1 look; a goblin variant has a blade look
   * and a blade-and-shield look, each its own archetype.
   */
  ghast: variant("ghast", "fodder"),
  ravener: variant("ravener", "fodder"),
  ashen_archer: variant("ashen_archer", "fodder"),
  wight_archer: variant("wight_archer", "fodder"),
  cave_troll: variant("cave_troll", "brute"),
  blood_troll: variant("blood_troll", "brute"),
  plague_thrall: variant("plague_thrall", "fodder"),
  blightborn: variant("blightborn", "fodder"),
  shade: variant("shade", "fodder"),
  phantom: variant("phantom", "fodder"),
  banshee: variant("banshee", "fodder"),
  goblin: variant("goblin", "fodder"),
  goblin_shield: variant("goblin_shield", "fodder"),
  goblin_cutthroat: variant("goblin_cutthroat", "fodder"),
  goblin_cutthroat_shield: variant("goblin_cutthroat_shield", "fodder"),
  goblin_reaver: variant("goblin_reaver", "fodder"),
  goblin_reaver_shield: variant("goblin_reaver_shield", "fodder"),
  goblin_warchief: variant("goblin_warchief", "fodder"),
  goblin_warchief_shield: variant("goblin_warchief_shield", "fodder"),
  ogre: variant("ogre", "brute", OGRE_AIM),
  ogre_mauler: variant("ogre_mauler", "brute", OGRE_AIM),
  ogre_tyrant: variant("ogre_tyrant", "brute", OGRE_AIM),
  dark_warrior: variant("dark_warrior", "brute"),
  dark_reaper: variant("dark_reaper", "brute"),
};

/**
 * What an unknown archetype is drawn as, rather than crashing: the troll. A hostile the client
 * does not know yet should read as a threat, not as fodder.
 */
export const FALLBACK_LOOK = MONSTER_LOOKS.troll;

/** The sheet and size tier an archetype is drawn with. */
export function monsterLook(archetype: string): MonsterLook {
  return Object.hasOwn(MONSTER_LOOKS, archetype)
    ? MONSTER_LOOKS[archetype]
    : FALLBACK_LOOK;
}

/**
 * The look a monster wears once its art is in: its archetype's, or a champion's (`boss: true` on a
 * look not boss tier, FS-C8VM7 §F R35): the same sheet, scaled to the boss tier's aim.
 */
function ownLook(archetype: string, boss = false): MonsterLook {
  const look = monsterLook(archetype);
  if (!boss || look.tier === "boss") return look;
  const { aim: _bandAim, ...rest } = look;
  return { ...rest, tier: "boss" };
}

/**
 * The look a monster is drawn in now: its own ({@link ownLook}), or, while the art of an on-demand
 * group is not in (ADR-0071 Decision 3, ADR-0081 Decision 5), its stand-in: the named sheet, under
 * its tint where it has one, at its own tier and aim.
 */
export function drawnLook(
  archetype: string,
  art: Pick<ArtLibrary, "has">,
  boss = false,
): MonsterLook {
  const look = ownLook(archetype, boss);
  const standIn = onDemandFor(archetype)?.standIn;
  if (!standIn || art.has(look.sheet)) return look;
  const { aim: _standInAim, ...stand } = monsterLook(standIn.archetype);
  return {
    ...stand,
    tier: look.tier,
    ...(look.aim === undefined ? {} : { aim: look.aim }),
    ...(standIn.tint === undefined ? {} : { tint: standIn.tint }),
  };
}

/** The sheet a monster is drawn from: its look's elite sheet for an elite, when it has one. */
export function monsterSheet(
  look: MonsterLook,
  monster: Pick<MonsterState, "elite">,
): string {
  return monster.elite && look.elite ? look.elite : look.sheet;
}

/**
 * The wash over a monster's sprite, if any: its look's own tint, else the elite tint on an elite
 * (req 38) whose archetype has no elite sheet. A common monster, and an elite drawn from its own
 * elite sheet, are drawn as baked.
 */
export function monsterTint(
  look: MonsterLook,
  monster: Pick<MonsterState, "elite">,
): number | undefined {
  return (
    look.tint ?? (monster.elite && !look.elite ? palette.eliteTint : undefined)
  );
}

/** Where a look stands in its tier's band: its own aim, else the tier's. */
const lookAim = (look: MonsterLook): number => look.aim ?? SIZE_TIERS[look.tier].aim;

/** The slice of the art library sizing reads. */
interface SheetHeights {
  sheet(name: string): { crown?: number; length?: number } | undefined;
}

/** A side-on screen px of a quadruped's length reads as cos 30° px of height (the iso view). */
const HEIGHT_PER_LENGTH_PX = Math.cos(Math.PI / 6);

/**
 * The sprite scale that stands a look at its tier: the tier's aim times a player's head height,
 * over the creature's own measure, both taken by the bake: its `crown`, or a quadruped's body
 * `length` in the same height px. Without both the art is not there to measure, and the tier's
 * aim is the best guess.
 */
export function monsterScale(look: MonsterLook, art: SheetHeights): number {
  const aim = lookAim(look);
  const player = art.sheet(PLAYER_REFERENCE_SHEET)?.crown;
  const own = art.sheet(look.sheet);
  const creature =
    look.measure === "length"
      ? (own?.length ?? 0) * HEIGHT_PER_LENGTH_PX
      : own?.crown;
  if (!player || !creature) return aim;
  return (aim * player) / creature;
}

/** A monster's body on the server, in world px: the player's `PlayerRadius`, for every archetype. */
const BODY_RADIUS = 20;

/**
 * The ground a click on a monster lands on, in world px (FS-2325V §C.6): its body, widened with
 * the size tier, so a brute or the boss is struck across the base it is drawn standing on. Never
 * narrower than the body.
 */
export function footprintRadius(look: MonsterLook): number {
  return BODY_RADIUS * Math.max(1, lookAim(look));
}

/**
 * Half a standing body's width, as a share of its crown. Measured on the baked sheets' idle and
 * walk frames (2026-11-06): a column this wide either side of the anchor holds 97–99% of a ghoul's,
 * zombie's or ghost's opaque body above its feet, 93% of a troll's and 89% of the winged demon's;
 * what it leaves out is a flung arm or a wingtip. Any wider and it takes more of the empty floor
 * beside a narrow body, and of whatever stands behind it.
 */
export const BODY_HALF_WIDTH = 0.4;

/**
 * Where a monster is hit over its drawn body (FS-48CTQ §C.5, owner playtest 2026-11-06), in screen
 * px at drawn size `scale`: from its feet up to its crown, {@link BODY_HALF_WIDTH} of a crown either
 * side, or half its body length for a quadruped, which is longer than it is tall. None for a sheet
 * that records no crown (no baked art): its footprint alone answers.
 */
export function bodyColumn(
  sheet: { crown?: number; length?: number } | undefined,
  scale: number,
): BodyColumn | undefined {
  if (!sheet?.crown) return undefined;
  const half = Math.max(BODY_HALF_WIDTH * sheet.crown, (sheet.length ?? 0) / 2);
  return { halfWidth: half * scale, height: sheet.crown * scale };
}

// ── Clips and nameplate ───────────────────────────────────────────────────

/**
 * The clip each server action plays (req 34; a demon's fire claw, FS-VHGE7 §D R31). An ability's
 * wind-up, and a pounce's leap, is the attack clip (FS-C8VM7 §F R37): its effect, not the body,
 * tells the ability apart, and the leap is the sprite following the server's position.
 */
export const ACTION_CLIPS: Record<MonsterAction, CharacterAnimation> = {
  idle: "idle",
  move: "walk",
  attack: "attack",
  claw: "claw",
  ability: "attack",
  dead: "death",
};

/**
 * What a clip not every sheet carries plays on a sheet without it (FS-VHGE7 §D R31): the claw is
 * the attack until the demons' sheets are baked with it, so it shows and never freezes.
 */
const CLIP_FALLBACKS: Partial<Record<CharacterAnimation, CharacterAnimation>> = {
  claw: "attack",
};

/**
 * The clip a monster plays: its action's clip, in the 8-way facing the server sent. A zero
 * facing keeps `current`. The walk follows the pace the body is drawn covering (`speed`, world
 * px/s), scaled up with the sprite, whose stride is longer. `has` says whether the monster's sheet
 * carries a clip; one it lacks plays its fallback ({@link CLIP_FALLBACKS}).
 */
export function monsterClip(
  monster: Pick<MonsterState, "action" | "facing">,
  current: Facing8,
  speed = 0,
  scale = 1,
  has: (clip: CharacterAnimation) => boolean = () => true,
): AnimationChoice {
  const named = ACTION_CLIPS[monster.action] ?? "idle";
  const animation = has(named) ? named : (CLIP_FALLBACKS[named] ?? named);
  const facing = facingFrom(monster.facing.x, monster.facing.y, current);
  const timeScale =
    animation === "walk" && speed >= MOVING_SPEED
      ? Math.min(speed / (WALK_PACE * scale), MAX_WALK_SCALE)
      : 1;
  return { animation, facing, direction: directionIndex(facing), timeScale };
}

/** What a monster's plate reads (req 37): `Ghoul · Lv 14`. */
export function nameplate(
  monster: Pick<MonsterState, "name" | "level">,
): string {
  return `${monster.name} · Lv ${monster.level}`;
}

/** How full a monster's HP bar is: its health over its maximum, clamped to 0–1 (FS-77AB6 req 37). */
export function healthFraction(
  monster: Pick<MonsterState, "current_health" | "max_health">,
): number {
  return Math.max(
    0,
    Math.min(1, monster.current_health / Math.max(1, monster.max_health)),
  );
}

/** An elite's plate in two parts: the prefix, lettered in the hostile accent, and the rest. */
export interface ElitePlate {
  prefix: string;
  rest: string;
}

/**
 * Splits an elite's server-authored name (`Hollow Troll`) into its prefix and the plate proper
 * (`Troll · Lv 9`): the prefix is everything before the archetype's base name, each `_` of the
 * archetype read as a space (`barrow_thrall` names `Barrow Thrall`, FS-M8CSE §D R21). A name that
 * does not carry its base name, or carries nothing before it, has no prefix to set apart.
 */
export function elitePlate(
  monster: Pick<MonsterState, "name" | "level" | "archetype" | "elite">,
): ElitePlate | null {
  if (!monster.elite || !monster.archetype) return null;
  const at = monster.name
    .toLowerCase()
    .lastIndexOf(monster.archetype.toLowerCase().replaceAll("_", " "));
  const prefix = at > 0 ? monster.name.slice(0, at).trim() : "";
  if (!prefix) return null;
  return {
    prefix,
    rest: nameplate({ name: monster.name.slice(at), level: monster.level }),
  };
}

/** Screen px between an elite's prefix and the rest of its plate: a word space at 11px. */
const PREFIX_GAP = 3;

/**
 * Where a plate's two parts stand on one line centred on `centreX`: the rest, centre-anchored, at
 * `rest`; an elite's prefix, right-anchored, at `prefix`, `gap` px to its left. With no prefix
 * (`prefixWidth` 0) the rest is centred alone. Shared by the overhead plate and the target frame.
 */
export function seatPlate(
  centreX: number,
  restWidth: number,
  prefixWidth: number,
  gap: number = PREFIX_GAP,
): { rest: number; prefix: number } {
  if (prefixWidth <= 0) return { rest: centreX, prefix: centreX };
  const rest = centreX + (prefixWidth + gap) / 2;
  return { rest, prefix: rest - restWidth / 2 - gap };
}

// ── The roster ────────────────────────────────────────────────────────────

/** Eased toward the server position each frame, as players are. */
const LERP = 0.3;
/** How quickly the measured speed follows the drawn motion, in ms (as `CharacterMotion`). */
const SPEED_SMOOTHING_MS = 100;
/** Screen px from the marker base to the bottom of the HP bar. */
const BAR_GAP = 2;
/** The overhead HP bar's trough, in screen px; its brass rim stands 1px outside (FS-48CTQ §F.21). */
export const OVERHEAD_BAR = { width: 40, height: 5 } as const;
/**
 * At most this many overhead damage chips drain at once (§F.23): a hit past that shows its new
 * health with no chip, so an area blow across a crowd redraws a handful of bars a frame, not all.
 */
export const CHIP_BUDGET = 4;
/** Screen px from the top of the HP bar to the bottom of the name. */
const NAME_GAP = 2;
/** How long a confirmed hit holds the damage flash, in ms: as long as a player's. */
export const FLASH_MS = 200;
/** No facing: the clip keeps the one it has. */
const STILL = { x: 0, y: 0 };

export interface MonsterSprite extends AnimatedSprite {
  /** Whether it is drawn: the hide rule's and the fog's say (FS-48CTQ §C.7 reads it). */
  readonly visible: boolean;
  x: number;
  y: number;
  displayOriginY: number;
  scaleY: number;
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setScale(scale: number): unknown;
  setTint(tint: number): unknown;
  clearTint(): unknown;
  setVisible(visible: boolean): unknown;
  setInteractive(config: {
    hitArea: object;
    hitAreaCallback: ReturnType<typeof footprintHitArea>;
  }): unknown;
  on(event: MonsterPointerEvent, fn: () => void): unknown;
  destroy(): void;
}

/** The pointer events a monster's sprite answers. */
type MonsterPointerEvent = "pointerdown" | "pointerover" | "pointerout";

/**
 * The world effects a monster's actions play (FS-VHGE7 §D R32–33). The roster only says which
 * monster turned to what, and where it is drawn; the effect itself is the scene's.
 */
export interface MonsterEffects {
  /** A shown monster turned to `claw`: once per turn, at its drawn world position. */
  claw(monster: MonsterState, at: Point): void;
}

/**
 * What the scene does with a living monster under the pointer (req 39). The roster only says
 * which monster; the attack, its range and its cooldown are the scene's.
 */
export interface MonsterTargeting {
  /** A living monster was clicked. */
  strike(monster: MonsterState): void;
  /** The pointer came onto a living monster, or left the one it was on (`null`). */
  hover(monster: MonsterState | null): void;
}

/**
 * Brings in the art of an on-demand group while the scene runs (`onDemandArt`, FS-VHGE7 §F):
 * idempotent, once a scene. `landed` runs only when the group's art is in the library.
 */
export interface MonsterArtFetch {
  fetch(group: string, landed: () => void): void;
}

export interface MonsterText {
  /** Drawn width in screen px, to seat an elite's prefix beside its name. */
  readonly width: number;
  setText(text: string): unknown;
  setPosition(x: number, y: number): unknown;
  setVisible(visible: boolean): unknown;
  setDepth(depth: number): unknown;
  setOrigin(x: number, y: number): unknown;
  destroy(): void;
}

export interface MonsterBar {
  clear(): unknown;
  setPosition(x: number, y: number): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
  setVisible(visible: boolean): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

export interface NameplateStyle {
  fontSize: string;
  fontFamily: string;
  color: string;
  stroke: string;
  strokeThickness: number;
  align: "center";
}

/** What the roster asks of the scene: one sprite, one label and one bar per monster. */
export interface MonsterStage {
  sprite(): MonsterSprite;
  text(content: string, style: NameplateStyle): MonsterText;
  graphics(): MonsterBar;
  /** Backing px per logical unit (`viewport.renderScale`), so a bar's edges fall on whole px; 1 if absent. */
  renderScale?(): number;
  /** A ground mark for an ability's telegraph or impact (FS-C8VM7 §F R36); none drawn if absent. */
  ground?(): GroundBrush;
}

/**
 * A hostile marker's lettering: the oxblood channel, legible at the canvas edge. An elite's
 * prefix takes the hostile accent instead (req 38).
 */
function nameplateStyle(ink: number = palette.markerHostile): NameplateStyle {
  return {
    fontSize: "11px",
    fontFamily: CANVAS_FONT.body,
    color: toCss(ink),
    stroke: toCss(palette.markerStroke),
    strokeThickness: 3,
    align: "center",
  };
}

interface MonsterView {
  sprite: MonsterSprite;
  name: MonsterText;
  /** An elite's prefix, lettered apart in the hostile accent; none on a common monster. */
  prefix: MonsterText | null;
  bar: MonsterBar;
  /** The bar's health and damage chip (FS-48CTQ §F.22). */
  chip: DamageChip;
  /** What the bar last drew (`healthBarKey`): it is redrawn only when this changes (§F.23). */
  drawn?: string;
  anim: CharacterAnimator;
  /** What it is drawn in now: its own look, or an on-demand group's stand-in until that is in. */
  look: MonsterLook;
  scale: number;
  /** World position as drawn, eased toward `state.position`. */
  pos: Point;
  /** Drawn speed, smoothed, in world px/s. */
  speed: number;
  facing: Facing8;
  /** The death clip has started: the facing is fixed from here on. */
  fallen: boolean;
  /** What is left of the damage flash, in ms; 0 when the sprite wears its own look. */
  flashMs: number;
  /** Whether its sheet carries each clip, for the clips one may lack (FS-VHGE7 §D R31). */
  has: (clip: CharacterAnimation) => boolean;
  state: MonsterState;
}

const alive = (monster: MonsterState) => monster.action !== "dead";

/**
 * Every monster on the canvas, keyed by `entity_id`. {@link sync} on each state broadcast creates,
 * updates and removes; {@link update} once a frame eases and animates.
 */
export class MonsterRoster {
  private readonly views = new Map<string, MonsterView>();
  /** The living monster under the pointer, by `entity_id`. */
  private hovered?: string;
  /** Plates over every head, or none for the target frame (FS-48CTQ §A.1, §B.3). */
  private mode: MarkerMode = "overhead";
  /** Each pending ability's area on the ground, a corpse's burst included (FS-C8VM7 §F R36). */
  private readonly abilities?: AbilityTelegraphs;

  constructor(
    private readonly stage: MonsterStage,
    private readonly art: ArtLibrary,
    private readonly targeting?: MonsterTargeting,
    private readonly effects?: MonsterEffects,
    private readonly artFetch?: MonsterArtFetch,
  ) {
    const ground = stage.ground?.bind(stage);
    if (ground) this.abilities = new AbilityTelegraphs(ground);
  }

  /** How many monsters (corpses included) are on the canvas. */
  get size(): number {
    return this.views.size;
  }

  /**
   * Every monster let go, the one under the pointer with them and no hover ending reported: the
   * world is going, and the cursor is its scene's to hand back (on a game destroy the scene's input
   * has destroyed itself first, scenes/sceneEnd.ts).
   */
  clear(): void {
    this.hovered = undefined;
    this.abilities?.clear();
    this.sync([]);
  }

  /**
   * The floor's marker mode (FS-48CTQ §A.1): on `frame` no monster carries a plate or bar, from
   * the next {@link update} on; its sprite and any elite wash are drawn as ever (§B.3).
   */
  setMarkerMode(mode: MarkerMode): void {
    this.mode = mode;
  }

  /** The living monster under the pointer, by `entity_id`: the target frame's first pick (§C.5). */
  get hoveredId(): string | undefined {
    return this.hovered;
  }

  /**
   * The monsters the target frame may name (FS-48CTQ §C.7): the living ones whose sprites are
   * shown, as the latest broadcast has them. A corpse, and one the hide rule or the fog has hidden,
   * are left out. Read it after the frame's hide rule has run.
   */
  targetable(): MonsterState[] {
    return [...this.views.values()]
      .filter((view) => view.sprite.visible && alive(view.state))
      .map((view) => view.state);
  }

  /**
   * The broadcast's monsters are the whole truth: anyone absent from it is gone, slain away or,
   * on a dungeon floor, out of the recipient's interest (FS-KE075 §H.48). It goes with nothing
   * replayed, and one that comes back is drawn as it now is: no flash for health lost meanwhile, a
   * corpse already fallen. So too one hidden by the hide rule or the fog (FS-SRA9J §D.15): a hit
   * taken unseen does not flash. A shown monster that turns to `claw` plays its claw effect, once
   * per turn (FS-VHGE7 §D R33); one first seen mid-claw, a reconnect's, plays none. Being listed, shown
   * or hidden, is what fetches an on-demand group's art (§F R44).
   */
  sync(monsters: readonly MonsterState[]): void {
    const present = new Set(monsters.map((m) => m.entity_id));
    for (const [id, view] of this.views)
      if (!present.has(id)) {
        view.sprite.destroy();
        view.name.destroy();
        view.prefix?.destroy();
        view.bar.destroy();
        this.views.delete(id);
      }

    for (const { archetype } of monsters) this.fetchArtOf(archetype);
    this.abilities?.sync(monsters);

    for (const monster of monsters) {
      const view = this.views.get(monster.entity_id);
      if (!view) {
        this.views.set(monster.entity_id, this.create(monster));
        continue;
      }
      const shown = view.sprite.visible;
      const hit = monster.current_health < view.state.current_health && shown;
      if (hit) this.flash(view);
      if (shown && monster.action === "claw" && view.state.action !== "claw")
        this.effects?.claw(monster, view.pos);
      view.state = monster;
      view.chip.set(healthFraction(monster), hit && alive(monster) && this.chipRoom(view));
    }

    // a monster that falls or goes from under the pointer is no longer a target there
    const held = this.hovered && this.views.get(this.hovered);
    if (this.hovered && !(held && alive(held.state))) this.unhover();
  }

  /** One frame: ease each monster toward the server, play its clip, seat its markers. */
  update(deltaMs: number): void {
    this.abilities?.update(deltaMs);
    for (const view of this.views.values()) {
      const { pos, state } = view;
      const before = { x: pos.x, y: pos.y };
      pos.x += (state.position.x - pos.x) * LERP;
      pos.y += (state.position.y - pos.y) * LERP;
      if (deltaMs > 0) {
        const moved =
          (Math.hypot(pos.x - before.x, pos.y - before.y) * 1000) / deltaMs;
        view.speed +=
          (moved - view.speed) * (1 - Math.exp(-deltaMs / SPEED_SMOOTHING_MS));
      }
      this.stand(view);

      const choice = this.clip(view);
      const turnedFrom = view.facing;
      view.facing = choice.facing;
      // one that dies unseen lies where it fell, and is never seen mid-fall when it is shown again
      const fellUnseen = state.action === "dead" && !view.fallen && !view.sprite.visible;
      view.fallen = state.action === "dead";
      if (fellUnseen) this.layCorpse(view, view.anim.sheet);
      else if (view.anim.baked && !this.turnWindUp(view, choice, turnedFrom))
        view.anim.show(view.sprite, choice);
      if (view.flashMs > 0) {
        view.flashMs -= deltaMs;
        if (view.flashMs <= 0) this.wear(view);
      }
      view.chip.step(deltaMs);

      this.mark(view);
    }
  }

  /**
   * The hide rule (FS-9PN7X §C.2) and the fog's (FS-SRA9J §D.15), as one: a monster whose drawn
   * position `hidden` names goes, body, plate, elite prefix and bar; the rest show their bodies, and
   * keep the plate and bar this frame's {@link update} seated. A hidden monster is no target
   * (§D.17): the hover on it ends, since a pointer resting still is not hit-tested again, and a
   * flash on it ends, so it does not flash when shown again. Call it after `update`, once the frame
   * knows which building is the player's.
   */
  hideWhere(hidden: (at: Point) => boolean): void {
    for (const [id, view] of this.views) {
      const shown = !hidden(view.pos);
      view.sprite.setVisible(shown);
      if (shown) continue;
      view.name.setVisible(false);
      view.prefix?.setVisible(false);
      view.bar.setVisible(false);
      if (this.hovered === id) this.unhover();
      if (view.flashMs > 0) {
        view.flashMs = 0;
        this.wear(view);
      }
      view.chip.clear();
    }
  }

  /**
   * Each monster's body and where it is drawn, for the blackout's mask (FS-9PN7X §D). Its plate
   * and bar stand over the dark, so they are not among its parts.
   */
  standing(): { parts: MonsterSprite[]; at: Point }[] {
    return [...this.views.values()].map((view) => ({ parts: [view.sprite], at: view.pos }));
  }

  /** The clip a monster should be playing, this frame. */
  private clip(view: MonsterView): AnimationChoice {
    const { state } = view;
    // a corpse lies the way it fell: a later facing never rolls it over to replay the fall
    const facing = view.fallen ? STILL : state.facing;
    return monsterClip(
      { action: state.action, facing },
      view.facing,
      view.speed,
      view.scale,
      view.has,
    );
  }

  /**
   * A wind-up that turns (FS-B4SG9 §C R21): a ranged monster keeps facing its target while it
   * draws, and the draw is the telegraph, so the one-shot clip carries on in the new facing from
   * the frame it had reached; the animator alone would draw it again from the start, and the
   * loose would show after the arrow had left. Whether it did: false when the clip is not a
   * one-shot already playing in `from`, which is the animator's to play.
   */
  private turnWindUp(view: MonsterView, choice: AnimationChoice, from: Facing8): boolean {
    const { sprite, anim } = view;
    const { animation, direction } = choice;
    const current = sprite.anims.currentAnim;
    const key = this.art.animationKey(anim.sheet, animation, direction);
    const turning =
      key !== undefined &&
      current !== null &&
      current.key !== key &&
      current.key === this.art.animationKey(anim.sheet, animation, directionIndex(from)) &&
      this.art.sheet(anim.sheet)?.animations[animation]?.loop === false;
    if (!turning) return false;
    const reached = Math.max(0, current.frames.indexOf(sprite.anims.currentFrame));
    sprite.play({ key, startFrame: reached });
    sprite.anims.timeScale = choice.timeScale;
    return true;
  }

  /** Whether a sheet carries a clip. */
  private clipsOf(sheet: string): MonsterView["has"] {
    return (clip) => this.art.animationKey(sheet, clip) !== undefined;
  }

  /** Asks for the art of `archetype`'s on-demand group, if it has one and it is not in yet (§F R44). */
  private fetchArtOf(archetype: string): void {
    const onDemand = onDemandFor(archetype);
    if (onDemand && !this.art.has(monsterLook(archetype).sheet))
      this.artFetch?.fetch(onDemand.group, () => this.redress(onDemand.group));
  }

  /**
   * The group's art is in: every monster drawn as a stand-in for it changes (§F R48), whichever
   * archetype asked. A group's later asks are dropped, so the first asker's callback answers them
   * all (FS-M8CSE §H R42); a floor's pool fetched ahead of its monsters answers here too (FS-C8VM7
   * §G R42, R44).
   */
  redress(group: string): void {
    for (const view of this.views.values())
      if (onDemandFor(view.state.archetype)?.group === group) this.wearOwnLook(view);
  }

  /**
   * On its own sprite, between one frame and the next: a new animator for the new sheet, its size,
   * and the clip it was playing, carried at its place. The sprite has a texture throughout; the
   * hit column stands, a tier's height either way (crown × scale).
   */
  private wearOwnLook(view: MonsterView): void {
    const look = ownLook(view.state.archetype, view.state.boss);
    const sheet = monsterSheet(look, view.state);
    view.look = look;
    view.scale = monsterScale(look, this.art);
    view.anim = new CharacterAnimator(this.art, { sheet }, view.facing);
    view.has = this.clipsOf(sheet);
    view.anim.dress(view.sprite, view.scale);
    view.anim.show(view.sprite, this.clip(view));
    if (view.flashMs <= 0) this.wear(view);
  }

  private create(state: MonsterState): MonsterView {
    const look = drawnLook(state.archetype, this.art, state.boss);
    const sheet = monsterSheet(look, state);
    const facing = facingFrom(state.facing.x, state.facing.y, "se");
    const anim = new CharacterAnimator(this.art, { sheet }, facing);
    const sprite = this.stage.sprite();
    const scale = monsterScale(look, this.art);
    anim.dress(sprite, scale);

    const plate = elitePlate(state);
    const name = this.stage.text(
      plate?.rest ?? nameplate(state),
      nameplateStyle(),
    );
    name.setOrigin(0.5, 1);
    name.setDepth(MARKER_DEPTH.name);
    const prefix = plate
      ? this.stage.text(plate.prefix, nameplateStyle(palette.markerElite))
      : null;
    prefix?.setOrigin(1, 1);
    prefix?.setDepth(MARKER_DEPTH.name);
    const bar = this.stage.graphics();
    bar.setDepth(MARKER_DEPTH.bar);

    const view: MonsterView = {
      sprite,
      name,
      prefix,
      bar,
      chip: new DamageChip(healthFraction(state)),
      anim,
      look,
      scale,
      pos: { x: state.position.x, y: state.position.y },
      speed: 0,
      facing,
      fallen: false,
      flashMs: 0,
      has: this.clipsOf(sheet),
      state,
    };
    this.wear(view);
    this.target(view, look, sheet);
    this.stand(view);
    if (state.action === "dead") this.layCorpse(view, sheet);
    return view;
  }

  /**
   * Makes a monster a target (req 39): hit-tested on the ground it stands on and over its drawn
   * body (FS-48CTQ §C.5), never its frame's empty margin or its plate, one hit test for the hover
   * and the click. It answers only while it lives and is shown (FS-SRA9J §D.17). Phaser hit-tests
   * no hidden object (`InputManager.inputCandidate` asks `willRender`), so the shown check only
   * holds the rule here too; a corpse is hit nowhere, so under Phaser's top-only input it never
   * takes the pointer from a living monster behind it. Each event reads the latest broadcast.
   */
  private target(view: MonsterView, look: MonsterLook, sheet: string): void {
    const { sprite } = view;
    const id = view.state.entity_id;
    const live = () => alive(view.state) && sprite.visible;
    const ground = footprintHitArea(() => view.pos, footprintRadius(look));
    const column = bodyColumn(this.art.sheet(sheet), view.scale);
    const body = column && bodyHitArea(() => view.pos, column);
    sprite.setInteractive({
      hitArea: {},
      hitAreaCallback: (area, x, y, obj) =>
        live() && (ground(area, x, y, obj) || (body?.(area, x, y, obj) ?? false)),
    });
    sprite.on("pointerdown", () => {
      if (live()) this.targeting?.strike(view.state);
    });
    sprite.on("pointerover", () => {
      if (!live()) return;
      this.hovered = id;
      this.targeting?.hover(view.state);
    });
    sprite.on("pointerout", () => {
      if (this.hovered === id) this.unhover();
    });
  }

  private unhover(): void {
    this.hovered = undefined;
    this.targeting?.hover(null);
  }

  /** A hit the server confirmed: the damage flash, held for {@link FLASH_MS}. */
  private flash(view: MonsterView): void {
    view.sprite.setTint(palette.damage);
    view.flashMs = FLASH_MS;
  }

  /** The sprite's own look: its hostile wash (req 38, 41), its stand-in's tint, or as baked. */
  private wear(view: MonsterView): void {
    const tint = monsterTint(view.look, view.state);
    if (tint !== undefined) view.sprite.setTint(tint);
    else view.sprite.clearTint();
  }

  /**
   * A monster first seen dead (a reconnect, a corpse coming into a late state, or one coming back
   * into interest, FS-KE075 §H.48) already lies where it fell: its death clip starts on the last
   * frame, so the fall is not replayed.
   */
  private layCorpse(view: MonsterView, sheet: string): void {
    const direction = directionIndex(view.facing);
    const key = this.art.animationKey(sheet, ACTION_CLIPS.dead, direction);
    const frames =
      this.art.sheet(sheet)?.animations[ACTION_CLIPS.dead]?.frames[direction];
    if (key && frames) view.sprite.play({ key, startFrame: frames.length - 1 });
  }

  /** Same projection and depth sorting as a player (FS-2325V §A): on its world footprint. */
  private stand(view: MonsterView): void {
    const at = worldToScreen(view.pos.x, view.pos.y);
    view.sprite.setPosition(at.x, at.y);
    view.sprite.setDepth(worldDepth(view.pos.x, view.pos.y, 1));
  }

  /** Room for one more draining chip (§F.23): `view`'s own, or one under {@link CHIP_BUDGET}. */
  private chipRoom(view: MonsterView): boolean {
    if (view.chip.draining) return true;
    let draining = 0;
    for (const other of this.views.values()) if (other.chip.draining) draining += 1;
    return draining < CHIP_BUDGET;
  }

  private renderScale(): number {
    return this.stage.renderScale?.() || 1;
  }

  /**
   * The plate and HP bar over a living monster's head; none over a corpse. On a frame floor the
   * target frame names the monster, so it has no plate, and its bar shows only while it is damaged
   * (FS-48CTQ §B.3, §F.18–19). The bar is drawn at its own origin and moved with the monster; it is
   * redrawn only when what it shows changes, in backing px (§F.23).
   */
  private mark(view: MonsterView): void {
    const { sprite, name, prefix, bar, chip, state } = view;
    const living = state.action !== "dead";
    const plated = this.mode === "overhead" && living;
    const barred = plated || (living && state.current_health < state.max_health);
    const base = barred ? markerBase(sprite, view.anim.crown, false, view.anim.artScale) : null;
    name.setVisible(plated && base !== null);
    prefix?.setVisible(plated && base !== null);
    bar.setVisible(base !== null);
    if (base === null) {
      chip.clear();
      return;
    }

    const scale = this.renderScale();
    const top = base - BAR_GAP - OVERHEAD_BAR.height;
    bar.setPosition(
      onBackingGrid(sprite.x - OVERHEAD_BAR.width / 2, scale),
      onBackingGrid(top, scale),
    );
    if (plated) this.letter(view, Math.round(top) - 1 - NAME_GAP);

    const key = healthBarKey(OVERHEAD_BAR, chip.fill, chip.chip, scale);
    if (key === view.drawn) return;
    view.drawn = key;
    bar.clear();
    paintHealthBar(bar, { x: 0, y: 0, ...OVERHEAD_BAR }, chip.fill, chip.chip, scale);
  }

  /**
   * The plate's lettering, its bottom at `y` and centred over the sprite. An elite's prefix and
   * the rest are centred as one line, the prefix set to the left of the rest.
   */
  private letter(view: MonsterView, y: number): void {
    const { sprite, name, prefix, state } = view;
    const plate = prefix ? elitePlate(state) : null;
    name.setText(plate?.rest ?? nameplate(state));
    if (!prefix || !plate) {
      name.setPosition(sprite.x, y);
      return;
    }
    prefix.setText(plate.prefix);
    const seat = seatPlate(sprite.x, name.width, prefix.width);
    name.setPosition(seat.rest, y);
    prefix.setPosition(seat.prefix, y);
  }
}
