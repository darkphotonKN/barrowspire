/**
 * The corner row's Tree icon (FS-8RZ51 R32, R33, R40): an oak in bronze, its crown three lobes over a
 * flared trunk, the boughs cut through to the world, for the shared knockout renderer (`Knockout`,
 * ADR-0080), with the same picture in lines where the scene cannot make the texture. Its marker, the
 * small ember point at the icon's top right while points are unspent (R33), is drawn by the same
 * renderer in the ember ink, with a ring in lines as its fallback. No numeral.
 *
 * In local px about the slot's centre, x to the right and y down, inside the row's ~30 px picture box,
 * built to survive render scale 1: no cut under the renderer's 1.6 px, no two cuts close enough to read
 * as one. Data and line drawing only; `HudCorner` places and inks them. The owner's contact sheet
 * (FS-8RZ51 I-8RZ51-11) may retune it here.
 */

import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import { oval, stroke, type KnockoutInk, type KnockoutPicture, type Pt } from "./knockout";

/** The crown's three lobes: the top one, and one either side a little lower. */
const LOBES = [
  { x: 0, y: -7, r: 7.5 },
  { x: -6.5, y: -1.5, r: 6 },
  { x: 6.5, y: -1.5, r: 6 },
];
/** The point the crown's outline is read round: inside every lobe. */
const CROWN_AT: Pt = [0, -3];
const CROWN_STEPS = 72;

/**
 * The crown's outline, one closed line round the three lobes' union: along each ray from `CROWN_AT`,
 * the farthest lobe edge (the union is star-shaped about it), so the lobes' meeting corners are one
 * path's vertices and the renderer joins them.
 */
const CROWN: Pt[] = Array.from({ length: CROWN_STEPS }, (_, i) => {
  const a = (i / CROWN_STEPS) * 2 * Math.PI;
  const u: Pt = [Math.cos(a), Math.sin(a)];
  const reach = Math.max(
    ...LOBES.map(({ x, y, r }) => {
      const d: Pt = [x - CROWN_AT[0], y - CROWN_AT[1]];
      const along = u[0] * d[0] + u[1] * d[1];
      const off = d[0] * d[0] + d[1] * d[1] - along * along;
      return off > r * r ? 0 : along + Math.sqrt(r * r - off);
    }),
  );
  return [CROWN_AT[0] + u[0] * reach, CROWN_AT[1] + u[1] * reach] as Pt;
});

/**
 * The trunk, from inside the crown down to its flared roots, a closed outline: its top reaches up into
 * the crown, so the solid reads as one oak where the lobes leave a notch between them.
 */
const TRUNK: Pt[] = [
  [-2.2, -1],
  [2.2, -1],
  [2.6, 9],
  [5.5, 12.5],
  [-5.5, 12.5],
  [-2.6, 9],
];

/** Where the trunk's sides meet the crown's outline, for the lines: the side lobes' foot over them. */
const TRUNK_FOOT = 2.6;

/** The boughs, cut up the crown from the trunk's top: the stem, one bough either side. */
const BOUGHS: Pt[][] = [
  [
    [0, 5],
    [0, -8],
  ],
  [
    [0, 0],
    [-5, -3.5],
  ],
  [
    [0, -3],
    [4.5, -6.5],
  ],
];

/** The Tree icon as a knockout (R40): the crown and the trunk solid, the boughs cut. */
export const TREE_KNOCKOUT: KnockoutPicture = {
  silhouette: [CROWN, TRUNK],
  cuts: BOUGHS.map((path) => ({ path })),
};

/** What a line glyph draws with: lines only, never a fill (FS-J1672 R3). */
export type TreePen = Pick<Phaser.GameObjects.Graphics, "lineStyle" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "strokePath" | "strokeCircle">;

/**
 * The Tree in lines (ADR-0080 "Fallback"), centred on (cx, cy): the crown's outline, the trunk's sides
 * and roots up to the crown's foot, and the boughs, each line one path.
 */
export function drawTreeLines(g: TreePen, cx: number, cy: number, ink: number, alpha: number): void {
  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  stroke(g, CROWN, cx, cy, true);
  // the trunk's outline from the crown's foot, open at its top where the crown stands over it
  stroke(g, [[2.2, TRUNK_FOOT], TRUNK[2], TRUNK[3], TRUNK[4], TRUNK[5], [-2.2, TRUNK_FOOT]], cx, cy);
  for (const bough of BOUGHS) stroke(g, bough, cx, cy);
}

/** Where the marker stands off the slot's centre: the icon's top right (R33). */
export const MARKER_AT: Pt = [12, -12];
/** The marker's radius, and the box its knockout is laid in. */
const MARKER_R = 3;
export const MARKER_BOX = 8;

/** The marker as a knockout: one ember point, no numeral (R33). */
export const MARKER_KNOCKOUT: KnockoutPicture = {
  silhouette: [oval(0, 0, MARKER_R, MARKER_R, 0, 2 * Math.PI, 24).slice(0, -1)],
  cuts: [],
};

/** The marker's ink: the ember, flat, the same under the pointer. */
export const MARKER_INK: KnockoutInk = {
  idle: { tint: palette.ember, alpha: 1 },
  hover: { tint: palette.ember, alpha: 1 },
  flat: true,
};

/** The marker in lines where no knockout stands: a small ember ring at the icon's top right. */
export function drawMarkerLines(g: Pick<TreePen, "lineStyle" | "strokeCircle">, cx: number, cy: number): void {
  g.lineStyle(GLYPH_LINE_W, palette.ember, 1);
  g.strokeCircle(cx + MARKER_AT[0], cy + MARKER_AT[1], MARKER_R - GLYPH_LINE_W / 2);
}
