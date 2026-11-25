/**
 * The corner row's Book icon (FS-X2CMM §G R36): a closed book, clasped, a ribbon out of its head, in
 * bronze for the shared knockout renderer (`Knockout`, ADR-0080), with the same picture in lines where
 * the scene cannot make the texture. Not the controls badge's book (`knockoutBook.ts`), whose title band
 * is cut high on its cover and whose ribbon hangs out of its foot: this one is shut by a strap across
 * its fore-edge, a stud hole cut in the strap, the strap's tab standing proud of the edge, and its
 * ribbon rises out of the top.
 *
 * In local px about the slot's centre, x to the right and y down, inside the row's ~30 px picture box,
 * built to survive render scale 1: no cut under the renderer's 1.6 px, the strap 10 px deep so its hole
 * keeps stone either side. Data and line drawing only; `HudCorner` places and inks it. Tweak rounds from
 * the owner's look land here.
 */

import type Phaser from "phaser";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import { oval, stroke, type KnockoutPicture, type Pt } from "./knockout";

/** A box's outline from its top-left clockwise, every corner rounded by `rad`. */
function roundedBox(l: number, t: number, r: number, b: number, rad: number, steps = 4): Pt[] {
  return [
    ...oval(l + rad, t + rad, rad, rad, Math.PI, 1.5 * Math.PI, steps),
    ...oval(r - rad, t + rad, rad, rad, -0.5 * Math.PI, 0, steps),
    ...oval(r - rad, b - rad, rad, rad, 0, 0.5 * Math.PI, steps),
    ...oval(l + rad, b - rad, rad, rad, 0.5 * Math.PI, Math.PI, steps),
  ];
}

/** The cover's edges: it stands a little low in its plate so the ribbon rises inside it. */
const EDGES = { l: -12, t: -10, r: 11, b: 14 };
const SPINE_X = -6.5;
/** The strap across the fore-edge: its top and foot, where it starts on the cover, and its tab past the edge. */
const STRAP = { top: -3, foot: 7, from: 2, tab: 14 };
/** The stud's hole in the strap. */
const STUD = { x: 7, y: (STRAP.top + STRAP.foot) / 2, r: 1.8 };
/** The ribbon: its middle, width, how high it rises over the head and how deep its swallowtail is notched. */
const RIBBON = { x: -1, w: 4.5, top: -17, notch: 2.4 };

const COVER = roundedBox(EDGES.l, EDGES.t, EDGES.r, EDGES.b, 2.2);
/** The strap's tab, standing proud of the fore-edge, its end rounded. */
const TAB: Pt[] = [
  [EDGES.r - 1, STRAP.top + 1],
  [STRAP.tab - 1.5, STRAP.top + 1],
  ...oval(STRAP.tab - 1.5, (STRAP.top + STRAP.foot) / 2, 1.5, (STRAP.foot - STRAP.top) / 2 - 1, -0.5 * Math.PI, 0.5 * Math.PI, 4),
  [EDGES.r - 1, STRAP.foot - 1],
];
/** The ribbon's tail, from inside the cover up to its swallowtail and back. */
const TAIL: Pt[] = [
  [RIBBON.x - RIBBON.w / 2, EDGES.t + 1.5],
  [RIBBON.x - RIBBON.w / 2 - 0.4, RIBBON.top],
  [RIBBON.x, RIBBON.top + RIBBON.notch],
  [RIBBON.x + RIBBON.w / 2 + 0.4, RIBBON.top],
  [RIBBON.x + RIBBON.w / 2, EDGES.t + 1.5],
];
const SPINE: Pt[] = [
  [SPINE_X, EDGES.t - 1],
  [SPINE_X, EDGES.b + 1],
];
/** The strap's two edges, cut from where it starts across the cover to the fore-edge. */
const STRAP_TOP: Pt[] = [
  [STRAP.from, STRAP.top],
  [EDGES.r + 0.2, STRAP.top],
];
const STRAP_FOOT: Pt[] = [
  [STRAP.from, STRAP.foot],
  [EDGES.r + 0.2, STRAP.foot],
];
/** Where the ribbon leaves the head: the cover's top cut across it. */
const RIBBON_EXIT: Pt[] = [
  [RIBBON.x - RIBBON.w / 2 - 1.2, EDGES.t - 0.7],
  [RIBBON.x + RIBBON.w / 2 + 1.2, EDGES.t - 0.7],
];

/** The clasped book as a knockout: the cover, the strap's tab and the ribbon solid; the spine, the strap and the ribbon's exit cut; the stud a hole. */
export const CLASPED_BOOK: KnockoutPicture = {
  silhouette: [COVER, TAB, TAIL],
  cuts: [{ path: SPINE }, { path: STRAP_TOP }, { path: STRAP_FOOT }, { path: RIBBON_EXIT }],
  holes: [STUD],
};

type Pen = Pick<Phaser.GameObjects.Graphics, "lineStyle" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "strokePath" | "strokeCircle">;

/**
 * The fallback (ADR-0080): the clasped book in the row's lines, `GLYPH_LINE_W` wide, centred on (cx, cy),
 * in `ink` at `alpha`, nothing filled: the cover, the spine, the strap and its tab, the stud, and the
 * ribbon rising from the head.
 */
export function drawClaspedBookLines(g: Pen, cx: number, cy: number, ink: number, alpha: number): void {
  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  stroke(g, COVER, cx, cy, true);
  stroke(g, [[SPINE_X, EDGES.t], [SPINE_X, EDGES.b]], cx, cy);
  stroke(g, [[STRAP.from, STRAP.top], [STRAP.tab - 1.5, STRAP.top], [STRAP.tab, STUD.y], [STRAP.tab - 1.5, STRAP.foot], [STRAP.from, STRAP.foot]], cx, cy);
  g.strokeCircle(cx + STUD.x, cy + STUD.y, STUD.r);
  const [footLeft, tipLeft, notch, tipRight, footRight] = TAIL;
  stroke(g, [[footLeft[0], EDGES.t], tipLeft, notch, tipRight, [footRight[0], EDGES.t]], cx, cy);
}
