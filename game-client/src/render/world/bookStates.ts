/**
 * The class book's delver states on the canvas (FS-X2CMM §I R47): afloat, hardened, long night, tracker's
 * eye and the draught's heal, drawn on every body that carries them (`book_states`, on `current_player` and
 * every `other_players` entry alike, §F R34), for every viewer. Each state's look is its own file
 * (`src/render/effects/`); this set gives a state its layers the state it first appears, repaints them on
 * the body's drawn feet every frame, and takes them away the state it goes. A state the client does not
 * know is drawn as nothing.
 *
 *   const states = new BookStateMarks(stage);
 *   states.sync([[id, player.book_states], ...], now); // every state: every body in it
 *   sprite.y -= states.lift(id, now);                 // as the body is placed: afloat lifts it
 *   states.follow(id, feet, crown, now);              // every frame, after the hide rule; null hides
 *   states.clear();                                   // the world or the floor is going
 *
 * Phaser-free: it paints through the stage's marks, so it is tested without a canvas.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import type { BookStateName, BookTimedState } from "@/types/gameState";
import { AFLOAT_LOOK } from "@/render/effects/afloat";
import { DRAUGHT_HEAL_LOOK } from "@/render/effects/draughtHeal";
import { HARDENED_LOOK } from "@/render/effects/hardened";
import { LONG_NIGHT_LOOK } from "@/render/effects/longNight";
import { TRACKERS_EYE_LOOK } from "@/render/effects/trackersEye";
import { seedOf, type BodyClock, type BodyLayerKind, type LookMark, type StateLook } from "./bookLook";

/** Each book state's look (R47). */
export const STATE_LOOKS: Record<BookStateName, StateLook> = {
  afloat: AFLOAT_LOOK,
  draught: DRAUGHT_HEAL_LOOK,
  hardened: HARDENED_LOOK,
  long_night: LONG_NIGHT_LOOK,
  trackers_eye: TRACKERS_EYE_LOOK,
};

/** Screen px over the feet a body's head stands at when its sheet records no crown. */
export const STATE_CROWN_FALLBACK = 80;

/** What the set asks of the scene: a fresh mark for one layer of a body's state, at that layer's depth. */
export interface BookStateStage<M extends LookMark> {
  layer(bodyId: string, state: string, kind: BodyLayerKind): M;
  reducedMotion?: boolean;
}

interface Held<M> {
  look: StateLook;
  marks: Partial<Record<BodyLayerKind, M>>;
  born: number;
  remaining: number;
  syncedAt: number;
  seed: number;
}

export class BookStateMarks<M extends LookMark> {
  /** By body, then state name. */
  private readonly bodies = new Map<string, Map<string, Held<M>>>();

  constructor(private readonly stage: BookStateStage<M>) {}

  /** Every body's states at `timeMs`, from one state: a body or a state not listed loses its marks. */
  sync(bodies: Iterable<readonly [string, readonly BookTimedState[] | undefined]>, timeMs: number): void {
    const listed = new Map(bodies);
    for (const [id, held] of this.bodies) if (!listed.has(id)) this.drop(id, held);
    for (const [id, states] of listed) {
      const held = this.bodies.get(id) ?? new Map<string, Held<M>>();
      const now = new Map((states ?? []).map((s) => [s.name, s]));
      for (const [name, h] of held) if (!now.has(name)) this.release(held, name, h);
      for (const [name, s] of now) {
        const known = held.get(name);
        if (known) {
          known.remaining = s.remaining;
          known.syncedAt = timeMs;
          continue;
        }
        const look = STATE_LOOKS[name as BookStateName];
        if (!look) continue;
        const marks: Partial<Record<BodyLayerKind, M>> = {};
        for (const kind of Object.keys(look.layers) as BodyLayerKind[]) marks[kind] = this.stage.layer(id, name, kind);
        held.set(name, { look, marks, born: timeMs, remaining: s.remaining, syncedAt: timeMs, seed: seedOf(`${id}:${name}`) });
      }
      if (held.size > 0) this.bodies.set(id, held);
      else this.bodies.delete(id);
    }
  }

  /** Screen px body `bodyId` is drawn raised this frame (afloat, R47); 0 when nothing lifts it. */
  lift(bodyId: string, timeMs: number, crown?: number): number {
    let up = 0;
    for (const h of this.bodies.get(bodyId)?.values() ?? [])
      if (h.look.lift) up = Math.max(up, h.look.lift(this.clockOf(h, timeMs, crown)));
    return up;
  }

  /**
   * One frame of body `bodyId`'s states on its drawn feet (world px), or hidden with its body (`null`: the
   * blackout, an escape, death). `crown` is its head's height over its feet, screen px.
   */
  follow(bodyId: string, feet: Point | null, crown: number | undefined, timeMs: number): void {
    const held = this.bodies.get(bodyId);
    if (!held) return;
    const at = feet ? worldToScreen(feet.x, feet.y) : undefined;
    for (const h of held.values())
      for (const [kind, mark] of Object.entries(h.marks) as [BodyLayerKind, M][]) {
        mark.setVisible(!!feet);
        if (!feet || !at) continue;
        mark.setPosition(at.x, at.y);
        if (kind === "front") mark.setDepth(worldDepth(feet.x, feet.y, 3));
        mark.clear();
        h.look.layers[kind]?.(mark, this.clockOf(h, timeMs, crown));
      }
  }

  /** Every body's marks taken away. */
  clear(): void {
    for (const [id, held] of this.bodies) this.drop(id, held);
  }

  /** Forget every mark without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.bodies.clear();
  }

  private clockOf(h: Held<M>, timeMs: number, crown: number | undefined): BodyClock {
    return {
      ageMs: timeMs - h.born,
      remaining: Math.max(0, h.remaining - (timeMs - h.syncedAt) / 1000),
      seed: h.seed,
      sinceFlashMs: Infinity,
      reduced: this.stage.reducedMotion === true,
      crown: crown ?? STATE_CROWN_FALLBACK,
    };
  }

  private release(held: Map<string, Held<M>>, name: string, h: Held<M>): void {
    for (const mark of Object.values(h.marks)) mark?.destroy();
    held.delete(name);
  }

  private drop(id: string, held: Map<string, Held<M>>): void {
    for (const [name, h] of held) this.release(held, name, h);
    this.bodies.delete(id);
  }
}
