/**
 * The class book's look (FS-X2CMM §G R37; the open tome, §Change: Illuminated pages and the open tome
 * C3–C5, C9): the leather binding, the two vellum pages falling from their middle tone near the spine to
 * their edge tone outside, the gutter's shadow at the fold, the title's rule, a row's wash, and every
 * line's ink, size and slant. The roundels are ADR-0095's (`pageRoundel.ts`). Tokens only (ADR-0013);
 * the body serif only (the blackletter bound).
 *
 * One of the book's swappable halves with `classBookLayout.ts`: a later look of the book changes this
 * file, never the panel's wiring or the casting.
 */

import type Phaser from "phaser";
import { mix, palette } from "@/utils/canvasPalette";
import { TOME_LAYOUT, type TomeLayout } from "./classBookLayout";
import type { Rect } from "./hudCornerLayout";

const TOME = palette.bookTome;

/** One line's type: its size, ink, slant and spacing. */
export interface TomeType {
  px: number;
  ink: number;
  italic?: boolean;
  spacing?: number;
}

export const BOOK_STYLE = {
  binding: {
    radius: 7,
    /** Its edge round the outside, and a lit line along its top. */
    edge: TOME.leatherEdge,
    lit: TOME.leatherLit,
    litAlpha: 0.6,
    /** A brass corner stud at each of the binding's corners, its radius and ink. */
    stud: { r: 3, ink: palette.frame, lit: palette.frameBright },
  },
  vellum: {
    /** The page's fall from the spine outward, in this many bands. */
    bands: 24,
    /** The gutter's shadow at the fold: its strength at the spine, eased out to none at its reach. */
    gutterAlpha: 0.9,
    /** The fold itself: a hairline of the leather's edge. */
    fold: { ink: TOME.leatherEdge, alpha: 0.35 },
    /** The pages' own edge, a hairline inside the binding. */
    edge: { ink: TOME.leatherEdge, alpha: 0.5 },
    /** The leaves under the top one, showing at the foot of each page: how many, and their ink. */
    leaves: 2,
    leafInk: TOME.gutter,
  },
  rule: { ink: TOME.title, alpha: 0.55 },
  /** A shown row's wash (C4): soft, of the dark vellum. */
  wash: { ink: TOME.wash, alpha: 0.32, radius: 3 },
  /** A locked row's words (C4). */
  faint: 0.55,
  type: {
    title: { px: 17, ink: TOME.title, spacing: 1 },
    name: { px: 13, ink: TOME.ink },
    mark: { px: 11, ink: TOME.inkMuted },
    empty: { px: 12, ink: TOME.inkMuted, italic: true },
    leafName: { px: 16, ink: TOME.title, spacing: 0.5 },
    scar: { px: 11, ink: TOME.inkMuted, spacing: 0.5 },
    line: { px: 12, ink: TOME.ink },
    earned: { px: 11, ink: TOME.inkMuted, italic: true },
    terms: { px: 11, ink: TOME.inkMuted },
    hint: { px: 11, ink: TOME.title, italic: true },
    close: { px: 15, ink: TOME.inkMuted },
    closeLit: { px: 15, ink: TOME.title },
  } satisfies Record<string, TomeType>,
  /** The right page's gaps (C5): under its roundel, under its name, between its other lines. */
  leaf: { afterName: 2, afterScar: 8, between: 7, lineSpacing: 2 },
} as const;

type Pen = Pick<
  Phaser.GameObjects.Graphics,
  "fillStyle" | "fillRect" | "fillRoundedRect" | "fillCircle" | "lineStyle" | "strokeRoundedRect" | "lineBetween"
>;

/** The leather, the two pages and their gutter, the fold and the title's rule: everything still on the spread. */
export function drawTome(g: Pen, layout: TomeLayout): void {
  const { binding, vellum, rule } = BOOK_STYLE;
  const { panel, left, right, spine } = layout;
  g.fillStyle(TOME.leather, 1);
  g.fillRoundedRect(panel.x, panel.y, panel.width, panel.height, binding.radius);
  g.lineStyle(1, binding.edge, 1);
  g.strokeRoundedRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1, binding.radius);
  g.lineStyle(1, binding.lit, binding.litAlpha);
  g.lineBetween(panel.x + binding.radius, panel.y + 1.5, panel.x + panel.width - binding.radius, panel.y + 1.5);
  // the leaves under the top one, a px apart at each page's foot, the spread's thickness
  for (let i = vellum.leaves; i >= 1; i--) {
    g.fillStyle(mix(vellum.leafInk, TOME.leatherEdge, 0.25 * i), 1);
    g.fillRect(left.x + i, left.y + left.height, left.width - i, i + 1);
    g.fillRect(right.x, right.y + right.height, right.width - i, i + 1);
  }
  drawPage(g, left, "left");
  drawPage(g, right, "right");
  g.lineStyle(1, vellum.fold.ink, vellum.fold.alpha);
  g.lineBetween(spine, left.y, spine, left.y + left.height);
  g.lineStyle(1, vellum.edge.ink, vellum.edge.alpha);
  g.strokeRoundedRect(left.x - 0.5, left.y - 0.5, left.width + right.width + 1, left.height + 1, 1);
  const { r, ink, lit } = binding.stud;
  for (const [x, y] of [
    [panel.x + 6, panel.y + 6],
    [panel.x + panel.width - 6, panel.y + 6],
    [panel.x + 6, panel.y + panel.height - 6],
    [panel.x + panel.width - 6, panel.y + panel.height - 6],
  ]) {
    g.fillStyle(ink, 1);
    g.fillCircle(x, y, r);
    g.fillStyle(lit, 0.8);
    g.fillCircle(x - 0.75, y - 0.75, r / 2);
  }
  g.lineStyle(1, rule.ink, rule.alpha);
  g.lineBetween(layout.rule.x1, layout.rule.y + 0.5, layout.rule.x2, layout.rule.y + 0.5);
}

/**
 * One page: the vellum falling in bands from its middle tone at the spine to its edge tone outside,
 * then the gutter's shadow, eased from the fold out to its reach.
 */
function drawPage(g: Pen, page: Rect, side: "left" | "right"): void {
  const { bands, gutterAlpha } = BOOK_STYLE.vellum;
  const reach = TOME_LAYOUT.gutter;
  const step = page.width / bands;
  for (let i = 0; i < bands; i++) {
    // 0 at the spine, 1 at the outer edge; eased so the middle tone holds over most of the page
    const u = (i + 0.5) / bands;
    const tone = mix(TOME.vellumMiddle, TOME.vellumEdge, u * u);
    const x0 = Math.round(side === "right" ? page.x + i * step : page.x + page.width - (i + 1) * step);
    const x1 = Math.round(side === "right" ? page.x + (i + 1) * step : page.x + page.width - i * step);
    g.fillStyle(tone, 1);
    g.fillRect(x0, page.y, x1 - x0, page.height);
  }
  for (let d = 0; d < reach; d++) {
    const t = 1 - d / reach;
    g.fillStyle(TOME.gutter, gutterAlpha * t * t * t);
    g.fillRect(side === "right" ? page.x + d : page.x + page.width - d - 1, page.y, 1, page.height);
  }
}

/** A shown row's wash (C4), on its own pen, cleared and drawn again in place. */
export function drawWash(g: Pick<Phaser.GameObjects.Graphics, "fillStyle" | "fillRoundedRect">, row: Rect): void {
  const { ink, alpha, radius } = BOOK_STYLE.wash;
  g.fillStyle(ink, alpha);
  g.fillRoundedRect(row.x, row.y + 1, row.width, row.height - 2, radius);
}
