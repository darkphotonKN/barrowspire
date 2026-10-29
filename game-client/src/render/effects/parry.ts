/**
 * The Mercenary's parry, as its own client draws it (FS-MAMHR §G.35, §G.36): the **stance tell**
 * (the blade raised crosswise before the chest, a steel glint at its point) and the **parry
 * flash** (a short, bright burst of steel on steel). Both ride on the merc's own figure and
 * follow it, since the stance never roots the merc (§C.13).
 *
 * Signals:
 * - The tell shows from the right-click that sends `parry` and holds for as long as the server
 *   reports `parry_open`. Until the server has seen the click it holds on the click alone, for
 *   at most {@link PARRY_TELL_GRACE_MS}.
 * - The flash plays whenever `current_player.parries` rises, at 3 parry charges too. The first
 *   state after (re)connecting is the baseline and flashes nothing.
 *
 * Local only: fed from `current_player`, never from `other_players`, so a teammate's parry draws
 * nothing (§G.38). Drawn, not table effects: the table is FS-fixed (FS-KYPQ9 §B.1) and neither
 * shape is a baked sheet. Because the table's `clearAll` never sees them, every object made here
 * is tracked and {@link ParryFx.forget} takes it down with the run. Tokens only (ADR-0013); no
 * Bounce, Elastic or Back, no shake.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import type { PlayerState } from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import { fourPointStar } from "./star";

/**
 * How long the tell holds on the click alone, waiting for a state that reports the stance open:
 * the server's 0.25 s window (§C.11) and a round trip's slack. A click the server refused (it
 * should not happen: the right-click is gated on the latest state) drops after it.
 */
export const PARRY_TELL_GRACE_MS = 400;

/** How long the flash shows: short, a spark rather than a glow. */
export const PARRY_FLASH_MS = 180;

/** Screen px above the merc's feet the blade is held at: chest height, the bow's (38) a touch lower. */
export const BLADE_LIFT = 34;

/** Over the merc's body (`standAt(…, 1)`) and legs (layer 2): the blade is held in front. */
const OVER_FIGURE = 3;

/** The flash grows a little as it fades: uniform, and never past 1.6 (FS-KYPQ9 §B.4). */
const FLASH_SCALE = { from: 1, to: 1.35 };

/** The blade, chest-centred: pommel low-left, point high-right, a short guard across it. */
const BLADE = { from: { x: -12, y: 8 }, to: { x: 13, y: -10 } };
const GUARD = { from: { x: -9, y: 1 }, to: { x: -3, y: 9 } };
/** Where the glint sits on the blade, toward the point. */
const GLINT = { x: 9, y: -7 };

/** What the merc's own state says of the stance and its parries (FS-MAMHR req 28). */
export type ParryWire = Pick<PlayerState, "parry_open" | "parries">;

/** The slice of a Phaser Graphics the tell and the flash draw with. */
export interface ParryGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

/** The slice of a Phaser scene the parry draws with. */
export interface ParryScene {
  add: { graphics(): ParryGraphics };
  tweens: {
    add(config: {
      targets: unknown;
      alpha: { from: number; to: number };
      scale: { from: number; to: number };
      duration: number;
      ease: string;
      onComplete: () => void;
    }): unknown;
  };
}

/** The blade raised crosswise, drawn about (0, 0): dull steel, a pale edge, a glint. */
function drawTell(g: ParryGraphics): void {
  const { from, to } = BLADE;
  g.lineStyle(3, BARROW_HEX.slateLight, 1);
  g.lineBetween(from.x, from.y, to.x, to.y);
  g.lineStyle(1, BARROW_HEX.vellumDark, 1);
  g.lineBetween(from.x + 1, from.y - 1, to.x, to.y - 1);
  g.lineStyle(2, BARROW_HEX.brass, 1);
  g.lineBetween(GUARD.from.x, GUARD.from.y, GUARD.to.x, GUARD.to.y);
  g.fillStyle(BARROW_HEX.vellum, 1);
  g.fillPoints(fourPointStar(GLINT, 4), true);
}

/** Steel on steel, drawn about (0, 0): a bright star with short sparks off its arms. */
function drawFlash(g: ParryGraphics): void {
  g.fillStyle(BARROW_HEX.vellum, 1);
  g.fillPoints(fourPointStar({ x: 0, y: 0 }, 9), true);
  g.lineStyle(1, BARROW_HEX.vellumDark, 1);
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    g.lineBetween(dx * 5, dy * 5, dx * 11, dy * 11);
}

/** One merc's own parry presentation: made once per run, fed every state and every frame. */
export class ParryFx {
  private tell?: ParryGraphics;
  private readonly flashes = new Set<ParryGraphics>();
  /** When the click raised the tell, until a state has reported the stance open. */
  private raisedAt?: number;
  /** The stance as the latest state reports it. */
  private open = false;
  /** `parries` as last seen; undefined until the first state (the baseline). */
  private seen?: number;
  /** The merc's feet, as last followed. */
  private at?: Point;

  constructor(private readonly scene: ParryScene) {}

  /** Whether the stance tell is up. */
  get stanceShown(): boolean {
    return this.tell !== undefined;
  }

  /** The right-click that sent `parry` (req 35): the tell shows at once. */
  raise(now: number): void {
    this.raisedAt = now;
    this.show(now);
  }

  /**
   * The merc's own latest state (req 35, 36): holds or drops the tell, and flashes on a rise in
   * `parries`. `null` is a delver out of the delve's state (escaped): the tell goes.
   */
  sync(me: ParryWire | null | undefined, now: number): void {
    this.open = me?.parry_open === true;
    // the server has seen the click: from here its word alone holds the tell
    if (this.open) this.raisedAt = undefined;

    const parries = me?.parries;
    if (parries !== undefined) {
      if (this.seen !== undefined && parries > this.seen) this.flash();
      this.seen = parries;
    }
    this.show(now);
  }

  /** Each frame (req 35): the tell and any flash stand at the merc's drawn position. */
  follow(at: Point, now: number): void {
    this.at = at;
    this.show(now);
    if (this.tell) this.place(this.tell);
    for (const g of this.flashes) this.place(g);
  }

  /**
   * The run is torn down (a restart, which a reconnect is). Every object made here is taken down,
   * as `RiposteFx.forget` does: Phaser has usually destroyed it already (a second destroy
   * is a no-op), but a teardown that skips SHUTDOWN leaves it standing, and a flash's fade would
   * otherwise outlive the run. The next first state is a fresh baseline (req 36).
   */
  forget(): void {
    this.tell?.destroy();
    this.tell = undefined;
    for (const g of this.flashes) g.destroy();
    this.flashes.clear();
    this.raisedAt = undefined;
    this.open = false;
    this.seen = undefined;
    this.at = undefined;
  }

  /** Brings the tell up or down to match the stance as it stands at `now`. */
  private show(now: number): void {
    const pending =
      this.raisedAt !== undefined && now - this.raisedAt < PARRY_TELL_GRACE_MS;
    if (!pending) this.raisedAt = undefined;
    const up = this.open || pending;
    if (up && !this.tell) {
      this.tell = this.scene.add.graphics();
      drawTell(this.tell);
      this.place(this.tell);
    } else if (!up && this.tell) {
      this.tell.destroy();
      this.tell = undefined;
    }
  }

  private flash(): void {
    const g = this.scene.add.graphics();
    drawFlash(g);
    this.place(g);
    this.flashes.add(g);
    this.scene.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      scale: FLASH_SCALE,
      duration: PARRY_FLASH_MS,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (this.flashes.delete(g)) g.destroy();
      },
    });
  }

  /** At the merc's chest, sorted over the figure. Nowhere yet before the first follow. */
  private place(g: ParryGraphics): void {
    if (!this.at) return;
    const s = worldToScreen(this.at.x, this.at.y);
    g.setPosition(s.x, s.y - BLADE_LIFT);
    g.setDepth(worldDepth(this.at.x, this.at.y, OVER_FIGURE));
  }
}
