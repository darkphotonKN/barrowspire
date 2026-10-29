/**
 * Mercenary cut (FS-MAMHR §G.32): a narrow, quick band of steel laid on the isometric ground in
 * front of the merc, sweeping the server's cone exactly (§B.6: 70°, 55 px) so what the player
 * sees is what the cut can hit. Drawn over the delver and the target, fading over {@link CUT_MS}.
 * No flash, no shake.
 *
 * Signal: the merc's own left-click that sends `CastSkill {skill_id: "cut"}`. It plays the moment
 * the message is sent (client prediction, as the slash does), never broadcast to teammates
 * (§G.38).
 *
 * Why it is drawn, not a table effect: the baked `fx_slash` smear is the warrior's ~103° arc,
 * and a uniform scale cannot narrow it to the cut's 70° (per-axis scale is banned, FS-KYPQ9
 * §B.4). The band is drawn to its shape instead; {@link swordArc} takes any arc and reach, so the
 * riposte's wide slice (§E.23, §G.33) can draw on the same band.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { swingLayer } from "./slash";

/** The arc (radians, whole width) and reach (world px) a sword band sweeps. */
export interface ArcShape {
  arc: number;
  reach: number;
  /** World px the band is thick at its leading edge; {@link BAND_WIDTH} when not given. */
  width?: number;
}

/** The server's cut (FS-MAMHR §B.6): a 70° arc centred on the aim, 55 px of reach. */
export const CUT_SHAPE: ArcShape = { arc: (70 * Math.PI) / 180, reach: 55 };

/** How long the cut shows: quicker than the slash's 220 ms smear, as a lighter blade is. */
export const CUT_MS = 160;

/** The fewest steps a band is drawn in along its arc, and the widest one step may turn. */
const MIN_STEPS = 12;
const MAX_STEP = (10 * Math.PI) / 180;
/** World px the band is thick at its tail, and at its leading edge by default. */
const TAIL = 2;
export const BAND_WIDTH = 14;

/**
 * The band's outline in world px: along the outer edge (the full reach) from the tail to the
 * leading edge, then back along the inner edge. It thickens toward the leading edge, as a blade
 * dragged through a swing does. An aim on the delver's own footprint runs along +x.
 */
export function swordArc(from: Point, toward: Point, shape: ArcShape): Point[] {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const aim = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const at = (u: number, r: number): Point => {
    const a = aim + (u - 0.5) * shape.arc;
    return { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r };
  };
  const steps = Math.max(MIN_STEPS, Math.ceil(shape.arc / MAX_STEP));
  const thicken = (shape.width ?? BAND_WIDTH) - TAIL;
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps; // 0 tail → 1 leading edge
    outer.push(at(u, shape.reach));
    inner.push(at(u, shape.reach - (TAIL + thicken * u)));
  }
  return [...outer, ...inner.reverse()];
}

/** The slice of a Phaser Graphics the band draws with. */
export interface CutGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokePoints(points: Point[], closeShape?: boolean): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

/** The slice of a Phaser scene the cut draws with. */
export interface CutScene {
  add: { graphics(): CutGraphics };
  tweens: {
    add(config: {
      targets: unknown;
      alpha: { from: number; to: number };
      duration: number;
      ease: string;
      onComplete: () => void;
    }): unknown;
  };
}

/** Screen px of the band's bright cutting lip. */
const LIP_WIDTH = 1.5;

/**
 * One merc's own cuts: made once per run, played on each left-click. Because the effects table's
 * `clearAll` never sees a drawn band, every cut still fading is tracked and {@link CutFx.forget}
 * takes it down with the run, as `RiposteFx.forget` does.
 */
export class CutFx {
  private readonly cuts = new Set<CutGraphics>();

  constructor(private readonly scene: CutScene) {}

  /** Plays the cut from the merc at `from` toward `toward`, both world positions. */
  play(from: Point, toward: Point): void {
    const band = swordArc(from, toward, CUT_SHAPE).map((p) =>
      worldToScreen(p.x, p.y),
    );
    const lip = band.slice(0, band.length / 2);
    const g = this.scene.add.graphics();
    // dull steel inside, a pale vellum cutting lip on the outer edge: the slash's tokens
    g.fillStyle(BARROW_HEX.vellumDark, 0.85);
    g.fillPoints(band, true);
    g.lineStyle(LIP_WIDTH, BARROW_HEX.vellum, 1);
    g.strokePoints(lip, false);
    g.setDepth(worldDepth(from.x, from.y, swingLayer(from, toward)));
    this.cuts.add(g);
    this.scene.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      duration: CUT_MS,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (this.cuts.delete(g)) g.destroy();
      },
    });
  }

  /**
   * The run is torn down (a restart, which a reconnect is): every cut still fading is taken down.
   * Phaser has usually destroyed it already (a second destroy is a no-op), but a teardown that
   * skips SHUTDOWN leaves it standing, and its fade would otherwise outlive the run.
   */
  forget(): void {
    for (const g of this.cuts) g.destroy();
    this.cuts.clear();
  }
}
