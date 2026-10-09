/**
 * Monsters on the canvas (FS-77AB6 req 34–39): each monster in a run's state broadcast drawn from
 * its baked creature sheet, playing what the server says it is doing, with a hostile nameplate
 * and HP bar over its head. A living monster is a target: the pointer over its footprint reports
 * it, a click strikes it, and a hit the server confirms flashes it.
 *
 * Nothing about a monster is client-held. The server sends where it stands, which way it faces
 * and what it is doing (`action`); the roster eases the position between ticks like a delver's
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
import { MARKER_BAR, MARKER_DEPTH, markerBase } from "@/render/markers";
import { footprintHitArea } from "@/render/world/footprint";
import type { MonsterAction, MonsterState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";

// ── Looks and size ────────────────────────────────────────────────────────

/**
 * Height tiers as a multiple of a delver's (guideline "Enemy design language"): fodder
 * 0.85–1.0x, a brute 1.3–1.5x, a boss at least 1.8x. Each look aims at the middle of its band;
 * the boss's ceiling is ours, to keep it on screen.
 */
export const SIZE_TIERS = {
  fodder: { min: 0.85, max: 1.0, aim: 0.92 },
  brute: { min: 1.3, max: 1.5, aim: 1.4 },
  boss: { min: 1.8, max: 2.2, aim: 2.0 },
} as const;
export type SizeTier = keyof typeof SIZE_TIERS;

/** The delver height a tier is measured against: the default class's sheet (`characterSheet`). */
export const DELVER_REFERENCE_SHEET = "char_knight_base";

export interface MonsterLook {
  sheet: string;
  tier: SizeTier;
  /** A multiply tint over the whole sprite, when the look is a recoloured sheet. */
  tint?: number;
}

/** Each archetype the client has a look for. */
export const MONSTER_LOOKS: Record<string, MonsterLook> = {
  ghoul: { sheet: "creature_ghoul_base", tier: "fodder" },
  troll: { sheet: "creature_troll_base", tier: "brute" },
  /** The winged demon boss (req 41, FS-KYPQ9): its own baked sheet, drawn as baked, at boss size. */
  demon: { sheet: "creature_demon_base", tier: "boss" },
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
 * The wash over a monster's sprite, if any: its look's own tint, else the elite tint on an elite
 * (req 38). A common monster is drawn as baked.
 */
export function monsterTint(
  look: MonsterLook,
  monster: Pick<MonsterState, "elite">,
): number | undefined {
  return look.tint ?? (monster.elite ? palette.eliteTint : undefined);
}

/** The slice of the art library sizing reads. */
interface SheetHeights {
  sheet(name: string): { crown?: number } | undefined;
}

/**
 * The sprite scale that stands a look at its tier: the tier's aim times a delver's head height,
 * over the creature's own (both measured by the bake as `crown`). Without both crowns the art is
 * not there to measure, and the tier's aim is the best guess.
 */
export function monsterScale(look: MonsterLook, art: SheetHeights): number {
  const aim = SIZE_TIERS[look.tier].aim;
  const delver = art.sheet(DELVER_REFERENCE_SHEET)?.crown;
  const creature = art.sheet(look.sheet)?.crown;
  if (!delver || !creature) return aim;
  return (aim * delver) / creature;
}

/** A monster's body on the server, in world px: the delver's `PlayerRadius`, for every archetype. */
const BODY_RADIUS = 20;

/**
 * The ground a click on a monster lands on, in world px (FS-2325V §C.6): its body, widened with
 * the size tier, so a brute or the boss is struck across the base it is drawn standing on. Never
 * narrower than the body.
 */
export function footprintRadius(look: MonsterLook): number {
  return BODY_RADIUS * Math.max(1, SIZE_TIERS[look.tier].aim);
}

// ── Clips and nameplate ───────────────────────────────────────────────────

/** The clip each server action plays (req 34). */
export const ACTION_CLIPS: Record<MonsterAction, CharacterAnimation> = {
  idle: "idle",
  move: "walk",
  attack: "attack",
  dead: "death",
};

/**
 * The clip a monster plays: its action's clip, in the 8-way facing the server sent. A zero
 * facing keeps `current`. The walk follows the pace the body is drawn covering (`speed`, world
 * px/s), scaled up with the sprite, whose stride is longer.
 */
export function monsterClip(
  monster: Pick<MonsterState, "action" | "facing">,
  current: Facing8,
  speed = 0,
  scale = 1,
): AnimationChoice {
  const animation = ACTION_CLIPS[monster.action] ?? "idle";
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

/** An elite's plate in two parts: the prefix, lettered in the hostile accent, and the rest. */
export interface ElitePlate {
  prefix: string;
  rest: string;
}

/**
 * Splits an elite's server-authored name (`Hollow Troll`) into its prefix and the plate proper
 * (`Troll · Lv 9`): the prefix is everything before the archetype's base name. A name that does
 * not carry its base name, or carries nothing before it, has no prefix to set apart.
 */
export function elitePlate(
  monster: Pick<MonsterState, "name" | "level" | "archetype" | "elite">,
): ElitePlate | null {
  if (!monster.elite || !monster.archetype) return null;
  const at = monster.name
    .toLowerCase()
    .lastIndexOf(monster.archetype.toLowerCase());
  const prefix = at > 0 ? monster.name.slice(0, at).trim() : "";
  if (!prefix) return null;
  return {
    prefix,
    rest: nameplate({ name: monster.name.slice(at), level: monster.level }),
  };
}

// ── The roster ────────────────────────────────────────────────────────────

/** Eased toward the server position each frame, as delvers are. */
const LERP = 0.3;
/** How quickly the measured speed follows the drawn motion, in ms (as `CharacterMotion`). */
const SPEED_SMOOTHING_MS = 100;
/** Screen px from the marker base to the bottom of the HP bar, and the bar's size. */
const BAR_GAP = 2;
const BAR_W = 38;
const BAR_H = 4;
/** Screen px from the top of the HP bar to the bottom of the name. */
const NAME_GAP = 2;
/** Screen px between an elite's prefix and the rest of its plate: a word space at 11px. */
const PREFIX_GAP = 3;
/** How long a confirmed hit holds the damage flash, in ms: as long as a delver's. */
export const FLASH_MS = 200;
/** No facing: the clip keeps the one it has. */
const STILL = { x: 0, y: 0 };

export interface MonsterSprite extends AnimatedSprite {
  x: number;
  y: number;
  displayOriginY: number;
  scaleY: number;
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setScale(scale: number): unknown;
  setTint(tint: number): unknown;
  clearTint(): unknown;
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
 * What the scene does with a living monster under the pointer (req 39). The roster only says
 * which monster; the attack, its range and its cooldown are the scene's.
 */
export interface MonsterTargeting {
  /** A living monster was clicked. */
  strike(monster: MonsterState): void;
  /** The pointer came onto a living monster, or left the one it was on (`null`). */
  hover(monster: MonsterState | null): void;
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
  anim: CharacterAnimator;
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

  constructor(
    private readonly stage: MonsterStage,
    private readonly art: ArtLibrary,
    private readonly targeting?: MonsterTargeting,
  ) {}

  /** How many monsters (corpses included) are on the canvas. */
  get size(): number {
    return this.views.size;
  }

  /** The broadcast's monsters are the whole truth: anyone absent from it is gone. */
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

    for (const monster of monsters) {
      const view = this.views.get(monster.entity_id);
      if (!view) {
        this.views.set(monster.entity_id, this.create(monster));
        continue;
      }
      if (monster.current_health < view.state.current_health) this.flash(view);
      view.state = monster;
    }

    // a monster that falls or goes from under the pointer is no longer a target there
    const held = this.hovered && this.views.get(this.hovered);
    if (this.hovered && !(held && alive(held.state))) this.unhover();
  }

  /** One frame: ease each monster toward the server, play its clip, seat its markers. */
  update(deltaMs: number): void {
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

      // a corpse lies the way it fell: a later facing never rolls it over to replay the fall
      const facing = view.fallen ? STILL : state.facing;
      const choice = monsterClip(
        { action: state.action, facing },
        view.facing,
        view.speed,
        view.scale,
      );
      view.facing = choice.facing;
      view.fallen = state.action === "dead";
      if (view.anim.baked) view.anim.show(view.sprite, choice);
      if (view.flashMs > 0) {
        view.flashMs -= deltaMs;
        if (view.flashMs <= 0) this.wear(view);
      }

      this.mark(view);
    }
  }

  private create(state: MonsterState): MonsterView {
    const look = monsterLook(state.archetype);
    const facing = facingFrom(state.facing.x, state.facing.y, "se");
    const anim = new CharacterAnimator(this.art, { sheet: look.sheet }, facing);
    const sprite = this.stage.sprite();
    anim.dress(sprite);
    const scale = monsterScale(look, this.art);
    sprite.setScale(scale);

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
      anim,
      scale,
      pos: { x: state.position.x, y: state.position.y },
      speed: 0,
      facing,
      fallen: false,
      flashMs: 0,
      state,
    };
    this.wear(view);
    this.target(view, look);
    this.stand(view);
    if (state.action === "dead") this.layCorpse(view, look.sheet);
    return view;
  }

  /**
   * Makes a monster a target (req 39): hit-tested on the ground it stands on, never its frame or
   * its plate, and answering only while it lives. Each event reads the latest broadcast.
   */
  private target(view: MonsterView, look: MonsterLook): void {
    const { sprite } = view;
    const id = view.state.entity_id;
    sprite.setInteractive({
      hitArea: {},
      hitAreaCallback: footprintHitArea(() => view.pos, footprintRadius(look)),
    });
    sprite.on("pointerdown", () => {
      if (alive(view.state)) this.targeting?.strike(view.state);
    });
    sprite.on("pointerover", () => {
      if (!alive(view.state)) return;
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

  /** The sprite's own look: its hostile wash (req 38, 41), or as baked. */
  private wear(view: MonsterView): void {
    const tint = monsterTint(monsterLook(view.state.archetype), view.state);
    if (tint !== undefined) view.sprite.setTint(tint);
    else view.sprite.clearTint();
  }

  /**
   * A monster first seen dead (a reconnect, or a corpse coming into a late state) already lies
   * where it fell: its death clip starts on the last frame, so the fall is not replayed.
   */
  private layCorpse(view: MonsterView, sheet: string): void {
    const direction = directionIndex(view.facing);
    const key = this.art.animationKey(sheet, ACTION_CLIPS.dead, direction);
    const frames =
      this.art.sheet(sheet)?.animations[ACTION_CLIPS.dead]?.frames[direction];
    if (key && frames) view.sprite.play({ key, startFrame: frames.length - 1 });
  }

  /** Same projection and depth sorting as a delver (FS-2325V §A): on its world footprint. */
  private stand(view: MonsterView): void {
    const at = worldToScreen(view.pos.x, view.pos.y);
    view.sprite.setPosition(at.x, at.y);
    view.sprite.setDepth(worldDepth(view.pos.x, view.pos.y, 1));
  }

  /** The plate and HP bar over a living monster's head; none over a corpse. */
  private mark(view: MonsterView): void {
    const { sprite, name, prefix, bar, state } = view;
    const dead = state.action === "dead";
    const base = dead ? null : markerBase(sprite, view.anim.crown, false);
    name.setVisible(base !== null);
    prefix?.setVisible(base !== null);
    bar.setVisible(base !== null);
    bar.clear();
    if (base === null) return;

    const barTop = Math.round(base - BAR_GAP - BAR_H);
    const left = Math.round(sprite.x - BAR_W / 2);
    this.letter(view, barTop - 1 - NAME_GAP);

    bar.fillStyle(MARKER_BAR.backing, 0.9);
    bar.fillRect(left - 1, barTop - 1, BAR_W + 2, BAR_H + 2);
    bar.lineStyle(1, MARKER_BAR.rim, 0.9);
    bar.strokeRect(left - 1, barTop - 1, BAR_W + 2, BAR_H + 2);
    const ratio = Math.max(
      0,
      Math.min(1, state.current_health / Math.max(1, state.max_health)),
    );
    bar.fillStyle(MARKER_BAR.hp, 1);
    bar.fillRect(left, barTop, Math.round(BAR_W * ratio), BAR_H);
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
    const lead = prefix.width + PREFIX_GAP;
    const restCentre = sprite.x + lead / 2;
    name.setPosition(restCentre, y);
    prefix.setPosition(restCentre - name.width / 2 - PREFIX_GAP, y);
  }
}
