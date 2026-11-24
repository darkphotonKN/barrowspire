/**
 * The class book's look (FS-X2CMM §G R37): the vellum leaf its pages lie on, its captions, an empty
 * book's line and the hover tip's inks and sizes. The windows' frame, title and × are the shared ones
 * (`panelFrame.ts`), and the roundels are ADR-0094's (`pageRoundel.ts`). Tokens only (ADR-0013).
 *
 * One of the book's swappable halves with `classBookLayout.ts`: a later look of the book changes this
 * file, never the panel's wiring or the casting.
 */

import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import type { BookTipTone } from "./classBookModel";
import type { Rect } from "./hudCornerLayout";

export const BOOK_STYLE = {
  /** The leaf: a faint wash of the dark vellum, its corner, and a brass hairline round it. */
  leaf: { fill: palette.bookLeaf, alpha: 0.1, radius: 4, line: palette.frame, lineAlpha: 0.35 },
  /** "Lv N" under a locked page, "spent" under a spent one. */
  caption: { px: 10, locked: palette.hudFaint, spent: palette.hudLabel },
  /** An empty book's line (Edge States). */
  empty: { px: 12, ink: palette.hudLabel },
  /** The hover tip, on the item tip's ground: each line's size, ink and slant by its part. */
  tip: {
    pad: 8,
    lineGap: 3,
    wrap: 240,
    tones: {
      name: { px: 13, ink: palette.hudText },
      scar: { px: 11, ink: palette.frameBright },
      line: { px: 11, ink: palette.hudText },
      earned: { px: 11, ink: palette.hudLabel, italic: true },
      cost: { px: 11, ink: palette.hudLabel },
      why: { px: 11, ink: palette.hudFaint, italic: true },
    } satisfies Record<BookTipTone, { px: number; ink: number; italic?: boolean }>,
  },
} as const;

/** The vellum leaf at `leaf` on `g`. */
export function drawLeaf(g: Pick<Phaser.GameObjects.Graphics, "fillStyle" | "fillRoundedRect" | "lineStyle" | "strokeRoundedRect">, leaf: Rect): void {
  const { fill, alpha, radius, line, lineAlpha } = BOOK_STYLE.leaf;
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(leaf.x, leaf.y, leaf.width, leaf.height, radius);
  g.lineStyle(1, line, lineAlpha);
  g.strokeRoundedRect(leaf.x + 0.5, leaf.y + 0.5, leaf.width - 1, leaf.height - 1, radius);
}
