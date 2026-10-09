/**
 * A drop pile on the canvas (FS-4R9M9 req 46, 61): the small heap of remains a slain monster
 * leaves where its loot fell. No baked prop fits yet, so it is built in code (ADR-0021's rule:
 * our own art, never sourced) as a placeholder texture, like the chest and the stairs before
 * their sheets: barrow earth, a rag, a skull and bones, and one amber glint of the loot in it,
 * because amber on the canvas means the delver can act on it (guideline "Gameplay accent").
 *
 * Phaser-free: it paints through {@link PileBrush}, the slice of `Phaser.GameObjects.Graphics`
 * it uses, so the art is tested without a canvas. The scene bakes it to a texture once.
 */

import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";

/** The pile's texture: its key, its size, and where on it the heap meets the ground. */
export const DROP_PILE = {
  texture: "drop_pile",
  width: 36,
  height: 24,
  /** The texture point standing on the pile's world position: the mound's foot, centred. */
  origin: { x: 0.5, y: 0.75 },
} as const;

/** What the painter asks of a graphics object. */
export interface PileBrush {
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
}

/** A long bone lying across the heap: a shaft with a knuckle at each end. */
function bone(
  g: PileBrush,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  g.lineStyle(3, palette.dropPileBoneShade, 1);
  g.lineBetween(x1, y1 + 1, x2, y2 + 1);
  g.lineStyle(2, palette.dropPileBone, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.fillStyle(palette.dropPileBone, 1);
  g.fillCircle(x1, y1, 1.5);
  g.fillCircle(x2, y2, 1.5);
}

/** Paints the heap into a {@link DROP_PILE}-sized texture, lit from screen-left. */
export function paintDropPile(g: PileBrush): void {
  const { width: w, height: h } = DROP_PILE;
  const foot = h * DROP_PILE.origin.y;

  // contact shadow, falling screen-right like the baked props'
  g.fillStyle(palette.inkDeep, 0.55);
  g.fillEllipse(w / 2 + 2, foot + 1, w - 6, 8);

  // the mound of grave earth, and its lit left shoulder
  g.fillStyle(palette.dropPileEarth, 1);
  g.fillEllipse(w / 2, foot - 2, w - 10, 11);
  g.fillStyle(palette.ground, 1);
  g.fillEllipse(w / 2 - 3, foot - 4, w - 20, 6);

  // a scrap of rotted rag over the back of it
  g.fillStyle(palette.dropPileRag, 1);
  g.fillPoints(
    [
      { x: w / 2 + 1, y: foot - 9 },
      { x: w - 7, y: foot - 7 },
      { x: w - 9, y: foot - 2 },
      { x: w / 2 + 4, y: foot - 3 },
    ],
    true,
  );

  // bones across the front
  bone(g, 7, foot - 1, 18, foot - 5);
  bone(g, 15, foot, 26, foot - 2);

  // the skull, sockets dark
  g.fillStyle(palette.dropPileBoneShade, 1);
  g.fillCircle(11, foot - 7, 4);
  g.fillStyle(palette.dropPileBone, 1);
  g.fillCircle(10.5, foot - 7.5, 3.5);
  g.fillStyle(palette.inkDeep, 1);
  g.fillCircle(9.5, foot - 8, 0.9);
  g.fillCircle(12, foot - 8, 0.9);

  // the loot: one glinting edge catching the torch
  g.lineStyle(2, palette.dropPileGlint, 1);
  g.lineBetween(w / 2 + 2, foot - 7, w / 2 + 8, foot - 10);
  g.fillStyle(palette.dropPileGlint, 1);
  g.fillCircle(w / 2 + 8, foot - 10, 1.2);
}
