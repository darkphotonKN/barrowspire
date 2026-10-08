/**
 * Hostile markers (FS-2325V §C.9, guideline "Lighting → The readability floor"): the name plates
 * and HP bar drawn over characters, and later a creature's glowing eyes.
 *
 * Markers draw above the light-map and the vignette, so darkness never dims them, and each keeps
 * at least 3:1 contrast against the darkest lit ground at the canvas edge. They carry readability
 * so the world itself may stay dark; ambient is never lifted for it.
 *
 * Phaser-free: depths, inks and placement, tested without a canvas. Scenes draw them.
 */

import { palette } from "@/utils/canvasPalette";

/** The HUD, and the container view with it (`CONTAINER_VIEW_DEPTH`). Markers stay under both. */
export const HUD_DEPTH = 1000;

/**
 * Above the light-map (135), the atmosphere (902–905) and the indoor mask (500); below the HUD.
 * A bar draws over its name.
 */
export const MARKER_DEPTH = { name: 950, bar: 951 } as const;

/** Every ink a marker is read by, each held to the readability floor (tested). */
export const MARKER_INKS = {
  "own name": palette.markerSelf,
  "ally name": palette.markerAlly,
  "hub name": palette.markerHub,
  "monster name": palette.markerHostile,
  "elite prefix": palette.markerElite,
  "HP fill": palette.markerHp,
  "MP fill": palette.markerMp,
} as const;

/** The HP bar's parts. */
export const MARKER_BAR = {
  backing: palette.markerBarBacking,
  rim: palette.markerBarRim,
  hp: palette.markerHp,
  mp: palette.markerMp,
} as const;

/** Screen px between a baked character's head and the lower edge of its marker stack. */
export const HEAD_GAP = 3;

/** The slice of a sprite {@link markerBase} reads. */
export interface StandingSprite {
  y: number;
  displayOriginY: number;
  scaleY: number;
}

/**
 * The screen y a character's markers stack up from, or null when it shows none.
 *
 * - A baked sheet records its head height (`crown`, px above the anchor): the stack sits a
 *   {@link HEAD_GAP} over the head. The frame's top is no guide there, being padded for attack
 *   and death poses.
 * - A baked corpse shows none: it lies at the feet, and a plate over the empty air where the
 *   head was reads as a bug.
 * - A placeholder (no `crown`) keeps the frame's top, exactly where its markers always were.
 */
export function markerBase(
  sprite: StandingSprite,
  crown: number | undefined,
  dead: boolean,
): number | null {
  if (crown === undefined)
    return sprite.y - sprite.displayOriginY * sprite.scaleY;
  if (dead) return null;
  return sprite.y - (crown + HEAD_GAP) * sprite.scaleY;
}
