/**
 * The run's controls badge's book (FS-84N1G R6; the owner, 「幫助圖示 畫一本書的樣子」, and his pick of the
 * previews, 「Ｄ」): a closed book from the front, its spine at the left, a title band cut high on the
 * cover, the page block showing under the cover's foot, whose cut curls down at the fore-edge, and a
 * ribbon bookmark hanging out of the pages with a swallowtail end.
 *
 * A knockout (ADR-0080; FS-7TQN4 R1) for the shared renderer, `BOOK`, and its line glyph for where the
 * texture cannot be made, `drawBookLines`, as the rucksack's are (`knockoutRucksack.ts`). Local px about
 * the slot's centre, x to the right and y down; the book stands a little high in its plate so the ribbon
 * hangs inside it. Authored in the controls-badge previews and taken over as approved.
 */

import type Phaser from "phaser";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import { bend, oval, type KnockoutPicture, type Pt } from "./knockout";

/** A box's outline from its top-left clockwise, every corner rounded by `rad`. */
function roundedBox(l: number, t: number, r: number, b: number, rad: number, steps = 4): Pt[] {
  return [
    ...oval(l + rad, t + rad, rad, rad, Math.PI, 1.5 * Math.PI, steps),
    ...oval(r - rad, t + rad, rad, rad, -0.5 * Math.PI, 0, steps),
    ...oval(r - rad, b - rad, rad, rad, 0, 0.5 * Math.PI, steps),
    ...oval(l + rad, b - rad, rad, rad, 0.5 * Math.PI, Math.PI, steps),
  ];
}

/** How far the book stands up from the plate's middle. */
const UP = -4;
/** The book's edges. */
const EDGES = { l: -12, t: -14.5 + UP, r: 12.5, b: 15 + UP };
const SPINE_X = -6.8;
/** Where the cover's foot lies over the page block. */
const COVER_FOOT = EDGES.b - 4.2;
/** The ribbon: its middle, its width, its foot and how deep its swallowtail is notched. */
const RIBBON = { x: 4, w: 5, foot: 23.5 + UP, notch: 2.8 };

const OUTLINE = roundedBox(EDGES.l, EDGES.t, EDGES.r, EDGES.b, 2.2);
/** The ribbon's tail, from inside the pages down to its swallowtail and back. */
const TAIL: Pt[] = [
  [RIBBON.x - RIBBON.w / 2, EDGES.b - 1],
  [RIBBON.x + RIBBON.w / 2, EDGES.b - 1],
  [RIBBON.x + RIBBON.w / 2 + 0.5, RIBBON.foot],
  [RIBBON.x, RIBBON.foot - RIBBON.notch],
  [RIBBON.x - RIBBON.w / 2 - 0.5, RIBBON.foot],
];
const SPINE: Pt[] = [
  [SPINE_X, EDGES.t - 1],
  [SPINE_X, EDGES.b + 1],
];
/** The cover's foot over the pages, curling down to the fore-edge. */
const FOOT: Pt[] = [
  [SPINE_X, COVER_FOOT],
  [EDGES.r - 3, COVER_FOOT],
  ...bend([EDGES.r - 3, COVER_FOOT], [EDGES.r - 0.5, COVER_FOOT], [EDGES.r - 0.2, COVER_FOOT - 3], 4),
];
const TITLE: Pt[] = [
  [SPINE_X + 4.5, EDGES.t + 6.5],
  [EDGES.r - 4.5, EDGES.t + 6.5],
];
/** Where the ribbon leaves the pages: the book's foot cut across it. */
const RIBBON_EXIT: Pt[] = [
  [RIBBON.x - RIBBON.w / 2 - 1.2, EDGES.b + 0.7],
  [RIBBON.x + RIBBON.w / 2 + 1.2, EDGES.b + 0.7],
];

/** The book as a knockout: the book and the ribbon's tail solid, its lines cut out of them. */
export const BOOK: KnockoutPicture = {
  silhouette: [OUTLINE, TAIL],
  cuts: [{ path: SPINE }, { path: FOOT }, { path: TITLE }, { path: RIBBON_EXIT }],
};

type Pen = Pick<Phaser.GameObjects.Graphics, "lineStyle" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "strokePath">;

/** Strokes the line through `ps`, moved by (ox, oy), as one path, closed when `closed`. */
function stroke(g: Pen, ps: readonly Pt[], ox: number, oy: number, closed = false): void {
  g.beginPath();
  g.moveTo(ox + ps[0][0], oy + ps[0][1]);
  for (const [x, y] of ps.slice(1)) g.lineTo(ox + x, oy + y);
  if (closed) g.closePath();
  g.strokePath();
}

/**
 * The fallback (ADR-0080): the book in the row's lines, `GLYPH_LINE_W` wide, centred on (cx, cy), in
 * `ink` at `alpha`, nothing filled: its outline, the spine, the cover's foot, the title band, and the
 * ribbon from the book's foot down to its swallowtail.
 */
export function drawBookLines(g: Pen, cx: number, cy: number, ink: number, alpha: number): void {
  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  stroke(g, OUTLINE, cx, cy, true);
  stroke(g, [[SPINE_X, EDGES.t], [SPINE_X, EDGES.b]], cx, cy);
  stroke(g, FOOT, cx, cy);
  stroke(g, TITLE, cx, cy);
  const [topLeft, topRight, footRight, notch, footLeft] = TAIL;
  stroke(g, [[topLeft[0], EDGES.b], footLeft, notch, footRight, [topRight[0], EDGES.b]], cx, cy);
}
