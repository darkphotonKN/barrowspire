/**
 * The class book's world effects on the canvas (FS-X2CMM §I R47–R48): every witchlight, rune and draught the
 * run's state carries (`book_effects`, §F R34), drawn for every viewer. The broadcast is the whole truth, so
 * the set is diffed by id like the burning trails: a new effect is given its look's layers (and its light,
 * for a look that casts one), an effect that leaves the state goes, layers and light alike. A kind the client
 * does not know is drawn as nothing.
 *
 * Each frame every look is repainted from its own clock (`bookLook.ts`); its light pool follows it. A rune
 * flashes each time its `caught` count climbs. A witchlight is also a lit point for the fog (R48): see
 * {@link litPoints}. A draught is an interactable, reached by the interact key (R27): see
 * {@link BookEffectSet.nearbyDraught}.
 *
 *   const effects = new BookEffectSet(stage);
 *   effects.sync(state.book_effects, now); // every state
 *   effects.frame(now);                    // every frame
 *   effects.hideWhere(unseen);             // with the hide rule
 *   effects.clear();                       // the floor is going
 *
 * Phaser-free: it paints through the stage's marks and lights, so it is tested without a canvas.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import type { TransientSpec } from "@/render/lighting/LightMap";
import type { LitPoint } from "./exploration";
import type { BookEffectKind, BookEffectState } from "@/types/gameState";
import { DRAUGHT_LOOK } from "@/render/effects/draught";
import { runeLook } from "@/render/effects/rune";
import { WITCHLIGHT_LOOK } from "@/render/effects/witchlight";
import { seedOf, type EffectLook, type LayerKind, type LookClock, type LookMark } from "./bookLook";
import { INTERACT_RANGE } from "./stairs";

/** How many cells about a witchlight the fog treats as seen while it burns (FS-X2CMM R48). */
export const WITCHLIGHT_LIT_CELLS = 3;

/** The lit points the run's witchlights make for the fog (R48): one per witchlight, out to its 3 cells. */
export function litPoints(effects: readonly BookEffectState[] | undefined): LitPoint[] {
  return (effects ?? [])
    .filter((e) => e.kind === "witchlight")
    .map((e) => ({ at: { x: e.x, y: e.y }, cells: WITCHLIGHT_LIT_CELLS }));
}

/** A light the set moves and fades: the light-map's transient light, as much of it as the set touches. */
export interface BookEffectLight {
  x: number;
  y: number;
  intensity: number;
  hidden?: boolean;
  remove(): void;
}

/** What the set asks of the scene. */
export interface BookEffectStage<M extends LookMark> {
  /** A fresh mark for one layer of effect `id`, at that layer's depth and blend, standing on world `at`. */
  layer(id: string, kind: LayerKind, at: Point): M;
  /** A transient pool on the light-map; the set removes it when its effect goes. */
  light(spec: TransientSpec): BookEffectLight;
  /** The floor's cell, world px (a rune's size is in cells, R24). */
  cell(): number;
  reducedMotion?: boolean;
}

interface Drawn<M> {
  effect: BookEffectState;
  look: EffectLook;
  marks: Partial<Record<LayerKind, M>>;
  light?: BookEffectLight;
  /** The effect's floor point on screen. */
  screen: Point;
  born: number;
  syncedAt: number;
  caught: number;
  flashAt: number;
  seed: number;
  shown: boolean;
}

export class BookEffectSet<M extends LookMark> {
  private readonly drawn = new Map<string, Drawn<M>>();
  private runeFor?: { cell: number; look: EffectLook };

  constructor(private readonly stage: BookEffectStage<M>) {}

  /** Make the canvas match the state's book effects at `timeMs`: the broadcast is the whole truth. */
  sync(effects: readonly BookEffectState[] | undefined, timeMs: number): void {
    const listed = new Map((effects ?? []).map((e) => [e.id, e]));
    for (const [id, d] of this.drawn) if (!listed.has(id)) this.drop(id, d);

    for (const effect of listed.values()) {
      const held = this.drawn.get(effect.id);
      if (held) {
        const caught = effect.caught ?? 0;
        if (caught > held.caught) held.flashAt = timeMs;
        held.caught = caught;
        if (held.effect.x !== effect.x || held.effect.y !== effect.y) this.place(held, effect);
        held.effect = effect;
        held.syncedAt = timeMs;
        continue;
      }
      const look = this.lookFor(effect.kind);
      if (!look) continue;
      this.drawn.set(effect.id, this.make(effect, look, timeMs));
    }
  }

  /** One frame: every effect's look repainted from its clock, its light where its look hangs it. */
  frame(timeMs: number): void {
    for (const d of this.drawn.values()) {
      const clock = this.clockOf(d, timeMs);
      for (const [kind, mark] of Object.entries(d.marks) as [LayerKind, M][]) {
        mark.clear();
        d.look.layers[kind]?.(mark, clock);
      }
      const light = d.look.light;
      if (light && d.light) {
        const at = light.at(clock);
        d.light.x = d.screen.x + at.dx;
        d.light.y = d.screen.y + at.dy;
        d.light.intensity = light.intensity * at.strength;
      }
    }
  }

  /** The hide rule (FS-9PN7X §C.1, FS-SRA9J §C.14): an effect, its layers and its light, hidden where `unseen`. */
  hideWhere(unseen: (at: Point) => boolean): void {
    for (const d of this.drawn.values()) {
      const shown = !unseen({ x: d.effect.x, y: d.effect.y });
      if (shown === d.shown) continue;
      d.shown = shown;
      for (const mark of Object.values(d.marks)) mark?.setVisible(shown);
      if (d.light) d.light.hidden = !shown;
    }
  }

  /** The nearest draught within the interact reach of world point `me` (R27), by its id; null when none. */
  nearbyDraught(me: Point): string | null {
    let best: string | null = null;
    let nearest = INTERACT_RANGE;
    for (const { effect } of this.drawn.values()) {
      if (effect.kind !== "draught") continue;
      const d = Math.hypot(me.x - effect.x, me.y - effect.y);
      if (d < nearest) {
        nearest = d;
        best = effect.id;
      }
    }
    return best;
  }

  /** The effects drawn, as last synced. */
  placed(): BookEffectState[] {
    return [...this.drawn.values()].map((d) => d.effect);
  }

  /** Destroy every effect and its light, and forget it: the floor it lay on is gone. */
  clear(): void {
    for (const [id, d] of this.drawn) this.drop(id, d);
  }

  /** Forget every effect without touching it: the scene has already destroyed its objects and lights. */
  forget(): void {
    this.drawn.clear();
  }

  private make(effect: BookEffectState, look: EffectLook, timeMs: number): Drawn<M> {
    const at = { x: effect.x, y: effect.y };
    const marks: Partial<Record<LayerKind, M>> = {};
    for (const kind of Object.keys(look.layers) as LayerKind[]) marks[kind] = this.stage.layer(effect.id, kind, at);
    const screen = worldToScreen(effect.x, effect.y);
    for (const mark of Object.values(marks)) mark?.setPosition(screen.x, screen.y);
    const light = look.light
      ? this.stage.light({
          x: screen.x,
          y: screen.y,
          radius: look.light.radius,
          color: look.light.color,
          intensity: 0,
          flicker: look.light.flicker,
          seed: seedOf(effect.id),
        })
      : undefined;
    // a rune first seen with catches already made (a reconnect) flashes for none of them
    return {
      effect,
      look,
      marks,
      light,
      screen,
      born: timeMs,
      syncedAt: timeMs,
      caught: effect.caught ?? 0,
      flashAt: -Infinity,
      seed: seedOf(effect.id),
      shown: true,
    };
  }

  private place(d: Drawn<M>, effect: BookEffectState): void {
    d.screen = worldToScreen(effect.x, effect.y);
    for (const mark of Object.values(d.marks)) mark?.setPosition(d.screen.x, d.screen.y);
  }

  private clockOf(d: Drawn<M>, timeMs: number): LookClock {
    return {
      ageMs: timeMs - d.born,
      // its seconds left run on between states, so a fade out is smooth
      remaining: Math.max(0, d.effect.remaining - (timeMs - d.syncedAt) / 1000),
      seed: d.seed,
      sinceFlashMs: timeMs - d.flashAt,
      reduced: this.stage.reducedMotion === true,
    };
  }

  private lookFor(kind: string): EffectLook | undefined {
    switch (kind as BookEffectKind) {
      case "witchlight":
        return WITCHLIGHT_LOOK;
      case "draught":
        return DRAUGHT_LOOK;
      case "rune": {
        const cell = this.stage.cell();
        if (this.runeFor?.cell !== cell) this.runeFor = { cell, look: runeLook(cell) };
        return this.runeFor.look;
      }
      // a body that moves, bites and falls, drawn by its own set (src/render/creatures/hounds.ts)
      case "hound":
      default:
        return undefined;
    }
  }

  private drop(id: string, d: Drawn<M>): void {
    for (const mark of Object.values(d.marks)) mark?.destroy();
    d.light?.remove();
    this.drawn.delete(id);
  }
}
