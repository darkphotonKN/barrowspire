/**
 * The archer's hound on the canvas (FS-X2CMM §I R47; Call the Hound, R28): every `hound` entry of the run's
 * book effects (`book_effects`, §F R34), drawn for every viewer from its baked sheet (`creature_hound_base`,
 * built in code at `tools/bake/page/characters/hound.js`, ADR-0021) at its state position, facing the way it
 * moves, playing the clip its `action` names. It carries a small health bar over its head and a faint
 * verdigris ring on the floor under it, and never a monster's nameplate: it is the archer's, not the Spire's.
 * While its `bay` shows (§J R49) it bays: a ripple of rings on the floor at the point it bays toward
 * (`src/render/effects/houndBay.ts`), played once per bay and finished even when the state stops naming it.
 * The bay has no sound: the client plays no world event's sound (its gameplay effects answer the player's
 * own hand, FS-AND39).
 *
 * Nothing about it is client-held. The broadcast is the whole truth, diffed by id like the other book
 * effects: a hound new to it is drawn, one that leaves it (its time up, its health gone, replaced by a new
 * call, or out of the recipient's interest) fades out over {@link HOUND_FADE_MS} and goes; a fallen one first
 * lies out its fall ({@link HOUND_FALL_MS}). The server sends no facing, so it faces the way it is drawn
 * moving and keeps that facing while it stands or bites.
 *
 *   const hounds = new HoundSet(stage, art);
 *   hounds.sync(state.book_effects);  // every state
 *   hounds.update(deltaMs);           // every frame
 *   hounds.hideWhere(hidden);         // with the hide rule
 *   hounds.clear();                   // the floor is going (a hound never climbs)
 *
 * Phaser-free: it draws through {@link HoundStage}, so it is tested without a canvas.
 */

import {
  MAX_WALK_SCALE,
  MOVING_SPEED,
  type AnimationChoice,
  type CharacterAnimation,
} from "@/render/art/animationSelect";
import { CharacterAnimator, type AnimatedSprite } from "@/render/art/character";
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
import { HOUND_BAY, paintHoundBay } from "@/render/effects/houndBay";
import { groundEllipse } from "@/render/world/bookLook";
import type { BookEffectState, HoundAction } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";

/** The hound's baked sheet (tools/bake/page/characters/cast.js), on its own resident `hound` atlas group. */
export const HOUND_SHEET = "creature_hound_base";

/**
 * The clip each action plays: its run is the sheet's walk slot (the gallop), its bite the attack slot, its
 * fall the death slot (the sheet keeps the standard slots every creature sheet carries).
 */
export const HOUND_CLIPS: Record<HoundAction, CharacterAnimation> = {
  idle: "idle",
  run: "walk",
  bite: "attack",
  dead: "death",
};

/** The clip a hound doing `action` plays; one the client does not know, or none, stands it in its idle. */
export function houndClip(action: string | undefined): CharacterAnimation {
  return (action !== undefined && Object.hasOwn(HOUND_CLIPS, action) && HOUND_CLIPS[action as HoundAction]) || "idle";
}

/** How long a hound that leaves the state takes to fade out, in ms. */
export const HOUND_FADE_MS = 400;
/**
 * How long its fall takes to lie still, in ms: the baked fall, 7 frames at 9 fps. The server sends a fallen
 * hound in one state only (R28), so one that leaves the state having fallen lies this long from its fall
 * before it fades.
 */
export const HOUND_FALL_MS = 800;
/** Its overhead bar, screen px: smaller than a monster's (40 × 5), as the body is. */
export const HOUND_BAR = { width: 28, height: 4 } as const;
/** How often a hound bites while it goes on biting (FS-X2CMM R28: every 1.0 s), so each bite is drawn. */
export const HOUND_BITE_MS = 1000;
/**
 * World px per second its gallop covers at 1x: the clip's stride, keyed at 14 fps for the archer's full-pace
 * base speed (R28). A fact of the art, not a speed: faster or slower, the stride follows the pace drawn.
 * At the paced base walk (100 px/s at the pace's 0.5, FS-TAGWA R11) the gallop plays at its 0.5x floor.
 */
export const HOUND_PACE = 200;
/** The ring under it, world px: a little wider than its body. */
const RING_RADIUS = 26;
/** The ring's line and fill: faint, a mark of whose it is, never a light. */
const RING_LINE = { width: 1.5, alpha: 0.42 } as const;
const RING_FILL_ALPHA = 0.1;
/** Eased toward the server position each frame, as monsters and players are. */
const LERP = 0.3;
/** How quickly the measured speed follows the drawn motion, in ms. */
const SPEED_SMOOTHING_MS = 100;
/** World px still to go below which it is standing where the state put it: easing residue, no new facing. */
const HEADING_SLACK = 2;
/** Screen px from the head's marker base to the bar's bottom. */
const BAR_GAP = 2;

/** The slice of a Phaser sprite the set drives. */
export interface HoundSprite extends AnimatedSprite {
  x: number;
  y: number;
  displayOriginY: number;
  scaleY: number;
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setAlpha(alpha: number): unknown;
  setVisible(visible: boolean): unknown;
  destroy(): void;
}

/** The slice of a Phaser Graphics the set paints its bar and ring with. */
export interface HoundMark {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  strokeEllipse(x: number, y: number, width: number, height: number): unknown;
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setAlpha(alpha: number): unknown;
  setVisible(visible: boolean): unknown;
  destroy(): void;
}

/** What the set asks of the scene: a sprite, an overhead bar, and a ring laid on the floor (its depth the scene's). */
export interface HoundStage {
  sprite(): HoundSprite;
  bar(): HoundMark;
  ring(): HoundMark;
  /** The mark of the hound's bay, laid on the floor as the ring is (R49). */
  houndBay(): HoundMark;
  /** Backing px per logical unit, so the bar's edges fall on whole px; 1 if absent. */
  renderScale?(): number;
  /** The viewer asked for less motion: the hound bay's rings stand still. */
  reducedMotion?: boolean;
}

interface HoundView {
  state: BookEffectState;
  sprite: HoundSprite;
  bar: HoundMark;
  ring: HoundMark;
  /** The mark of its hound bay, and the point and set-clock time its latest bay began; undefined before its first. */
  houndBay: HoundMark;
  houndBayAt?: Point;
  houndBayFrom?: number;
  anim: CharacterAnimator;
  chip: DamageChip;
  /** World position as drawn, eased toward the state's. */
  pos: Point;
  /** Drawn speed, smoothed, world px/s. */
  speed: number;
  facing: Facing8;
  /** When its current run of bites last bit, on the set's clock; undefined while it is not biting. */
  bitAt?: number;
  /** The hide rule's say. */
  shown: boolean;
  /** What the bar last drew, redrawn only when it changes. */
  drawn?: string;
  /** When it starts to fade, on the set's clock, having left the state; it may first finish its fall. */
  goneAt?: number;
  /** When it fell, on the set's clock; undefined while it stands. */
  fellAt?: number;
}

const fallen = (state: BookEffectState) => state.action === "dead";

const healthOf = (state: BookEffectState): number | null =>
  state.health !== undefined && state.max_health !== undefined && state.max_health > 0
    ? Math.max(0, Math.min(1, state.health / state.max_health))
    : null;

/** Every hound on the canvas, keyed by its book effect id. */
export class HoundSet {
  private readonly views = new Map<string, HoundView>();
  /** The set's own clock, ms: the frames it has been stepped through. */
  private clock = 0;

  constructor(
    private readonly stage: HoundStage,
    private readonly art: ArtLibrary,
  ) {}

  /** How many hounds are drawn, fading ones included. */
  get size(): number {
    return this.views.size;
  }

  /** Make the canvas match the state's hounds: the broadcast is the whole truth. */
  sync(effects: readonly BookEffectState[] | undefined): void {
    const listed = new Map((effects ?? []).filter((e) => e.kind === "hound").map((e) => [e.id, e]));
    for (const [id, view] of this.views)
      if (!listed.has(id) && view.goneAt === undefined)
        view.goneAt = Math.max(this.clock, (view.fellAt ?? -Infinity) + HOUND_FALL_MS);

    for (const state of listed.values()) {
      const view = this.views.get(state.id);
      if (!view) {
        this.views.set(state.id, this.create(state));
        continue;
      }
      // back in the state mid-fade (it left the interest cut a tick): whole again, at full alpha
      if (view.goneAt !== undefined) this.setAlpha(view, 1);
      view.goneAt = undefined;
      if (fallen(state) && view.fellAt === undefined) view.fellAt = this.clock;
      else if (!fallen(state)) view.fellAt = undefined;
      const fill = healthOf(state);
      const was = healthOf(view.state);
      if (fill !== null) view.chip.set(fill, was !== null && fill < was && !fallen(state));
      this.heardHoundBay(view, state);
      view.state = state;
    }
  }

  /** One frame: each hound eased toward its state, turned the way it moves, its clip, bar, ring and fade. */
  update(deltaMs: number): void {
    this.clock += deltaMs;
    for (const [id, view] of this.views) {
      if (view.goneAt !== undefined) {
        view.bar.setVisible(false);
        view.houndBay.setVisible(false);
        // its fall still drawing out: it lies as it is
        if (this.clock < view.goneAt) continue;
        const left = 1 - (this.clock - view.goneAt) / HOUND_FADE_MS;
        if (left <= 0) {
          this.destroy(view);
          this.views.delete(id);
          continue;
        }
        this.setAlpha(view, left);
        continue;
      }
      this.move(view, deltaMs);
      this.play(view);
      view.chip.step(deltaMs);
      this.mark(view);
      this.rippleHoundBay(view);
    }
  }

  /** The hide rule's and the fog's say, as for a monster: a hound where `hidden` names is not drawn, nor its bar or ring. */
  hideWhere(hidden: (at: Point) => boolean): void {
    for (const view of this.views.values()) {
      view.shown = !hidden(view.pos);
      view.sprite.setVisible(view.shown);
      view.ring.setVisible(view.shown);
      if (!view.shown) {
        view.bar.setVisible(false);
        view.houndBay.setVisible(false);
      }
    }
  }

  /** The hounds the state holds, as last synced: none that is fading out. */
  placed(): BookEffectState[] {
    return [...this.views.values()].filter((v) => v.goneAt === undefined).map((v) => v.state);
  }

  /** Each hound's body and where it is drawn, for the blackout's mask; its bar and ring are not parts. */
  standing(): { parts: HoundSprite[]; at: Point }[] {
    return [...this.views.values()].map((view) => ({ parts: [view.sprite], at: view.pos }));
  }

  /** Destroy every hound at once and forget it: the floor it ran on is gone (a hound never climbs). */
  clear(): void {
    for (const view of this.views.values()) this.destroy(view);
    this.views.clear();
  }

  /** Forget every hound without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.views.clear();
  }

  private create(state: BookEffectState): HoundView {
    const facing: Facing8 = "se";
    const anim = new CharacterAnimator(this.art, { sheet: HOUND_SHEET }, facing);
    const sprite = this.stage.sprite();
    anim.dress(sprite, 1);
    const bar = this.stage.bar();
    bar.setDepth(MARKER_DEPTH.bar);
    const ring = this.stage.ring();
    paintRing(ring);
    const houndBay = this.stage.houndBay();
    houndBay.setVisible(false);
    const view: HoundView = {
      state,
      sprite,
      bar,
      ring,
      houndBay,
      // one first seen baying bays from now: the held bay is set here, not heard against a state before it
      houndBayAt: state.bay && { x: state.bay.x, y: state.bay.y },
      houndBayFrom: state.bay ? this.clock : undefined,
      anim,
      chip: new DamageChip(healthOf(state) ?? 1),
      pos: { x: state.x, y: state.y },
      speed: 0,
      facing,
      shown: true,
    };
    this.stand(view);
    // one first seen fallen (a reconnect, one coming into interest) already lies where it fell
    if (fallen(state)) {
      view.fellAt = this.clock - HOUND_FALL_MS;
      this.layDown(view);
    }
    return view;
  }

  /** Eases it toward the state's position and turns it the way it is heading. */
  private move(view: HoundView, deltaMs: number): void {
    const { pos, state } = view;
    const before = { x: pos.x, y: pos.y };
    const ahead = { x: state.x - pos.x, y: state.y - pos.y };
    pos.x += ahead.x * LERP;
    pos.y += ahead.y * LERP;
    if (deltaMs > 0) {
      const moved = (Math.hypot(pos.x - before.x, pos.y - before.y) * 1000) / deltaMs;
      view.speed += (moved - view.speed) * (1 - Math.exp(-deltaMs / SPEED_SMOOTHING_MS));
    }
    // a fallen hound lies the way it fell
    if (!fallen(state) && Math.hypot(ahead.x, ahead.y) > HEADING_SLACK)
      view.facing = facingFrom(ahead.x, ahead.y, view.facing);
    this.stand(view);
  }

  /** The clip its action names, in its facing; a bite drawn again each {@link HOUND_BITE_MS} it goes on biting. */
  private play(view: HoundView): void {
    if (!view.anim.baked) return;
    const animation = houndClip(view.state.action);
    if (animation === "attack") {
      if (view.bitAt === undefined || this.clock - view.bitAt >= HOUND_BITE_MS) {
        view.bitAt = this.clock;
        view.anim.attack(this.clock);
      }
    } else view.bitAt = undefined;
    const timeScale =
      animation === "walk" && view.speed >= MOVING_SPEED
        ? Math.min(Math.max(view.speed / HOUND_PACE, 0.5), MAX_WALK_SCALE)
        : 1;
    const choice: AnimationChoice = {
      animation,
      facing: view.facing,
      direction: directionIndex(view.facing),
      timeScale,
    };
    view.anim.show(view.sprite, choice);
  }

  /** On its world footprint, sorted as a body; its ring under it. */
  private stand(view: HoundView): void {
    const at = worldToScreen(view.pos.x, view.pos.y);
    view.sprite.setPosition(at.x, at.y);
    view.sprite.setDepth(worldDepth(view.pos.x, view.pos.y, 1));
    view.ring.setPosition(at.x, at.y);
  }

  /** Starts its fall on its last frame: it is already lying there. */
  private layDown(view: HoundView): void {
    const direction = directionIndex(view.facing);
    const clip = HOUND_CLIPS.dead;
    const key = this.art.animationKey(HOUND_SHEET, clip, direction);
    const frames = this.art.sheet(HOUND_SHEET)?.animations[clip]?.frames[direction];
    if (key && frames) view.sprite.play({ key, startFrame: frames.length - 1 });
  }

  /**
   * The bar over a living hound's head when the state gives its health; none over a fallen one or a hidden
   * one. Drawn at its own origin and moved with the hound, redrawn only when what it shows changes.
   */
  private mark(view: HoundView): void {
    const { sprite, bar, chip, state } = view;
    const fill = healthOf(state);
    const base =
      view.shown && fill !== null && !fallen(state)
        ? markerBase(sprite, view.anim.crown, false, view.anim.artScale)
        : null;
    bar.setVisible(base !== null);
    if (base === null) return;
    const scale = this.stage.renderScale?.() || 1;
    const top = base - BAR_GAP - HOUND_BAR.height;
    bar.setPosition(onBackingGrid(sprite.x - HOUND_BAR.width / 2, scale), onBackingGrid(top, scale));
    const key = healthBarKey(HOUND_BAR, chip.fill, chip.chip, scale);
    if (key === view.drawn) return;
    view.drawn = key;
    bar.clear();
    paintHealthBar(bar, { x: 0, y: 0, ...HOUND_BAR }, chip.fill, chip.chip, scale);
  }

  /**
   * A bay the state newly names (it named none, or another point) begins now; one it goes on naming is the
   * same bay, never begun again. One first seen with the hound is held where the hound is made (`create`).
   */
  private heardHoundBay(view: HoundView, state: BookEffectState): void {
    const call = state.bay;
    if (!call) return;
    const held = view.state.bay;
    if (held && held.x === call.x && held.y === call.y) return;
    view.houndBayAt = { x: call.x, y: call.y };
    view.houndBayFrom = this.clock;
  }

  /** Its latest hound bay's ripple at the point it bays toward, while it plays and the hound is shown; else nothing. */
  private rippleHoundBay(view: HoundView): void {
    const since = view.houndBayFrom === undefined ? Infinity : this.clock - view.houndBayFrom;
    const playing = view.shown && view.houndBayAt !== undefined && since < HOUND_BAY.ms;
    view.houndBay.setVisible(playing);
    if (!playing || !view.houndBayAt) {
      view.houndBay.clear();
      return;
    }
    const at = worldToScreen(view.houndBayAt.x, view.houndBayAt.y);
    view.houndBay.setPosition(at.x, at.y);
    paintHoundBay(view.houndBay, since, this.stage.reducedMotion === true);
  }

  private setAlpha(view: HoundView, alpha: number): void {
    view.sprite.setAlpha(alpha);
    view.ring.setAlpha(alpha);
    view.bar.setAlpha(alpha);
    view.houndBay.setAlpha(alpha);
  }

  private destroy(view: HoundView): void {
    view.sprite.destroy();
    view.bar.destroy();
    view.ring.destroy();
    view.houndBay.destroy();
  }
}

/** The faint verdigris ring laid on the floor under a hound, about its origin: whose it is, at a glance. */
function paintRing(g: HoundMark): void {
  const { width, height } = groundEllipse(RING_RADIUS);
  const ink = palette.bookEffect.houndRing;
  g.clear();
  g.fillStyle(ink, RING_FILL_ALPHA);
  g.fillEllipse(0, 0, width, height);
  g.lineStyle(RING_LINE.width, ink, RING_LINE.alpha);
  g.strokeEllipse(0, 0, width, height);
}
