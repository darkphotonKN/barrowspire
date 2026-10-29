/**
 * The Mercenary's riposte, as its own client draws it (FS-MAMHR §G.33, §G.34).
 *
 * - The **riposte slice**: a big, clean band of steel sweeping the server's riposte exactly
 *   (§E.23: 240°, 90 px) toward the cursor. It plays in place of the cut effect on a left-click
 *   sent while the latest state shows 3 parry charges, the moment `cut` is sent (client
 *   prediction, as the cut does). The server arms the riposte, never the client (§E.24): there is
 *   no skill id, the client sends `cut` either way.
 * - The **armed tell**: while the latest state shows 3 parry charges, a glint runs again and again
 *   along a blade carried low at the merc's side, so the player knows the next left-click is the
 *   riposte. It sits below the stance tell's crosswise blade at the chest, so both read when both
 *   are up. It clears when the count drops.
 *
 * Local only: fed from `current_player`, never from `other_players`, so a teammate's riposte
 * draws nothing (§G.38). Drawn, not table effects: the table is FS-fixed (FS-KYPQ9 §B.1) and
 * neither shape is a baked sheet. Because the table's `clearAll` never sees them, every object
 * made here is tracked and {@link RiposteFx.forget} takes it down with the run. Tokens only
 * (ADR-0013); no Bounce, Elastic or Back, no shake.
 */

import { depthKey, worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import type { PlayerState } from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import { swordArc, type ArcShape } from "./cut";
import { fourPointStar } from "./star";

/** The parry charges a riposte spends, all of them (FS-MAMHR §E.23). */
export const RIPOSTE_CHARGES = 3;

/** The server's riposte (FS-MAMHR §E.23): a 240° arc centred on the aim, 90 px of reach. */
export const RIPOSTE_SHAPE: ArcShape = {
  arc: (240 * Math.PI) / 180,
  reach: 90,
  width: 22,
};

/** How long the slice shows: longer than the cut and the slash, a blow that has been waited for. */
export const RIPOSTE_MS = 280;

/** How long the armed tell's glint takes to run once along the blade, hilt to point. */
export const ARMED_GLINT_MS = 900;

/** Screen px of the slice's bright cutting lip: heavier than the cut's 1.5. */
const LIP_WIDTH = 3;

/** Over the merc's body (`standAt(…, 1)`) and legs (layer 2): the blade is carried in front. */
const OVER_FIGURE = 3;

/** The blade carried low at the merc's side, about the feet (screen px): hilt at the hip, point low. */
const CARRIED = { from: { x: 7, y: -24 }, to: { x: 19, y: -6 } };

/**
 * Whether the merc's next cut is the riposte (FS-MAMHR §G.33, §G.34): the latest state shows them
 * at 3 parry charges. The server arms it, never the client (§E.24): this only says which effect
 * the cut it is about to send should play, and whether the armed tell shows.
 */
export function riposteArmed(
  me: Pick<PlayerState, "resource"> | null | undefined,
): boolean {
  const r = me?.resource;
  return r?.kind === "parry_charges" && r.current >= RIPOSTE_CHARGES;
}

/** The slice of a Phaser Graphics the slice and the tell draw with. */
export interface RiposteGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokePoints(points: Point[], closeShape?: boolean): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

/** The slice of a Phaser scene the riposte draws with. */
export interface RiposteScene {
  add: { graphics(): RiposteGraphics };
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

/**
 * The point of the arc swept from `from` toward `toward` that stands nearest the viewer: where
 * `depthKey` (x + y) peaks, the heading 45° clamped into the arc. Whatever the arc can hit stands
 * no nearer than this.
 */
function frontmost(from: Point, toward: Point, shape: ArcShape): Point {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const aim = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const off = Math.PI / 4 - aim;
  const wrapped = Math.atan2(Math.sin(off), Math.cos(off));
  const a = aim + Math.max(-shape.arc / 2, Math.min(shape.arc / 2, wrapped));
  return {
    x: from.x + Math.cos(a) * shape.reach,
    y: from.y + Math.sin(a) * shape.reach,
  };
}

/** One merc's own riposte presentation: made once per run, fed every state and every frame. */
export class RiposteFx {
  private readonly slices = new Set<RiposteGraphics>();
  private blade?: RiposteGraphics;
  private glint?: RiposteGraphics;
  /** When the tell came up: the glint's run is timed from it. */
  private armedAt = 0;
  /** The merc's feet, as last followed. */
  private at?: Point;

  constructor(private readonly scene: RiposteScene) {}

  /** Whether the armed tell is up. */
  get armedShown(): boolean {
    return this.blade !== undefined;
  }

  /** The riposte slice from the merc at `from` toward `toward`, both world positions (req 33). */
  play(from: Point, toward: Point): void {
    const band = swordArc(from, toward, RIPOSTE_SHAPE).map((p) =>
      worldToScreen(p.x, p.y),
    );
    const lip = band.slice(0, band.length / 2);
    // sorted over whichever stands nearer the viewer: the merc, or the arc's nearest point
    const front = frontmost(from, toward, RIPOSTE_SHAPE);
    const near =
      depthKey(front.x, front.y) > depthKey(from.x, from.y) ? front : from;
    const g = this.scene.add.graphics();
    // pale steel inside, a heavy vellum cutting lip on the outer edge: the cut's tokens, brighter
    g.fillStyle(BARROW_HEX.vellumDark, 0.95);
    g.fillPoints(band, true);
    g.lineStyle(LIP_WIDTH, BARROW_HEX.vellum, 1);
    g.strokePoints(lip, false);
    g.setDepth(worldDepth(near.x, near.y, OVER_FIGURE));
    this.slices.add(g);
    this.scene.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      duration: RIPOSTE_MS,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (this.slices.delete(g)) g.destroy();
      },
    });
  }

  /**
   * The merc's own latest state (req 34): the tell is up at 3 parry charges and down below.
   * `null` is a player out of the delve's state (escaped): the tell goes.
   */
  sync(
    me: Pick<PlayerState, "resource"> | null | undefined,
    now: number,
  ): void {
    const armed = riposteArmed(me);
    if (armed && !this.blade) {
      this.armedAt = now;
      this.blade = this.scene.add.graphics();
      this.glint = this.scene.add.graphics();
      drawCarried(this.blade);
      drawGlint(this.glint);
      this.place(now);
    } else if (!armed && this.blade) {
      this.dropTell();
    }
  }

  /** Each frame (req 34): the tell stands at the merc's drawn position, its glint running. */
  follow(at: Point, now: number): void {
    this.at = at;
    this.place(now);
  }

  /**
   * The run is torn down (a restart, which a reconnect is). Every object made here is taken down:
   * Phaser has usually destroyed it already (a second destroy is a no-op), but a teardown that
   * skips SHUTDOWN leaves it standing, and a slice's fade would otherwise outlive the run.
   */
  forget(): void {
    for (const g of this.slices) g.destroy();
    this.slices.clear();
    this.dropTell();
    this.at = undefined;
  }

  private dropTell(): void {
    this.blade?.destroy();
    this.glint?.destroy();
    this.blade = undefined;
    this.glint = undefined;
  }

  /** The blade at the merc's feet over the figure, the glint where its run has reached. */
  private place(now: number): void {
    if (!this.at || !this.blade || !this.glint) return;
    const s = worldToScreen(this.at.x, this.at.y);
    const depth = worldDepth(this.at.x, this.at.y, OVER_FIGURE);
    const g = glintAt(now - this.armedAt);
    this.blade.setPosition(s.x, s.y);
    this.blade.setDepth(depth);
    this.glint.setPosition(s.x + g.x, s.y + g.y);
    this.glint.setDepth(depth);
  }
}

/**
 * Where the glint is on the carried blade, `elapsed` ms after the tell came up (screen px about
 * the feet): hilt to point over {@link ARMED_GLINT_MS}, eased in and out, then again from the hilt.
 */
export function glintAt(elapsed: number): Point {
  const t =
    (((elapsed % ARMED_GLINT_MS) + ARMED_GLINT_MS) % ARMED_GLINT_MS) /
    ARMED_GLINT_MS;
  const u = (1 - Math.cos(Math.PI * t)) / 2;
  const { from, to } = CARRIED;
  return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
}

/** The blade carried low, drawn about the feet: dull steel, a pale edge, a brass guard at the hip. */
function drawCarried(g: RiposteGraphics): void {
  const { from, to } = CARRIED;
  g.lineStyle(3, BARROW_HEX.slateLight, 1);
  g.lineBetween(from.x, from.y, to.x, to.y);
  g.lineStyle(1, BARROW_HEX.vellum, 1);
  g.lineBetween(from.x + 1, from.y, to.x + 1, to.y);
  g.lineStyle(2, BARROW_HEX.brass, 1);
  g.lineBetween(from.x - 4, from.y + 3, from.x + 4, from.y - 3);
}

/** The running glint, drawn about (0, 0): a small four-pointed star of pale light. */
function drawGlint(g: RiposteGraphics): void {
  g.fillStyle(BARROW_HEX.vellum, 1);
  g.fillPoints(fourPointStar({ x: 0, y: 0 }, 5), true);
}
