/**
 * A class book page's roundel (FS-X2CMM §I R45, ADR-0094): a muted pigment glyph inside a
 * bronze-rimmed disc of dark ground. The one coloured family on the canvas HUD; every other HUD
 * icon stays a bronze knockout (ADR-0080).
 *
 * It is laid from four layers of the one shared knockout renderer (`Knockout`), so it keeps that
 * renderer's supersampling at twice the render scale and its rebuild on a render-scale change:
 * - the **ground**, a disc in `palette.ink`. Only this layer casts ADR-0080's drop shadow.
 * - the **body**, the glyph's picture in its page's main pigment, flat, its cuts through to the ground.
 * - the **bone**, the glyph's highlights and detail, flat, laid on the body.
 * - the **rim**, a ring in the HUD's bronze, lit from above as the knockouts are.
 *
 * A page's state changes only the inks the layers wear (`roundelInk`), never their textures. Where
 * the textures cannot be made, its owner draws the glyph as a 2.25 px line in its main pigment
 * (`drawPageLines`), so a page is never blank. A recovering page's cooldown sweep is its owner's
 * to draw each frame, over the roundel (`drawRoundelSweep`, at `depth + 1`). Tokens only (ADR-0013).
 */

import type Phaser from "phaser";
import { mix, palette, shade, type BookPigment } from "@/utils/canvasPalette";
import { ABILITY_ICON_SLOT, circle, drawIconLines, type AbilityIconPen } from "./abilityIcons";
import type { Rect } from "./hudCornerLayout";
import { BRONZE, GREYED_ALPHA, Knockout, type KnockoutCut, type KnockoutInk, type KnockoutPicture, type Pt } from "./knockout";
import type { Point } from "./xpBarLayout";

/** The roundel's sizes, in logical px (R45; ADR-0094: about 44 px in the book, 28 on the cast bar). */
export const PAGE_ROUNDEL_SIZE = { book: 44, castBar: 28 } as const;

/**
 * A page's states as a roundel shows them (CONTEXT "Page roundel"): **ready**; **recovering**, its
 * pigment kept under its owner's cooldown sweep; **dim**, short of its cost; **locked**, below its
 * unlock level. Hovered is apart: only a ready page lifts under the pointer.
 */
export const PAGE_STATES = ["ready", "recovering", "dim", "locked"] as const;
export type PageState = (typeof PAGE_STATES)[number];

/**
 * A page's picture, in local px about its roundel's centre, x to the right and y down, drawn in the
 * ability bar's 30 px box and kept inside that box's round, then fitted to the roundel: its `body`
 * in the main pigment, its `bone` laid on the body, and its `lines`, the fallback.
 */
export interface PageGlyph {
  body: KnockoutPicture;
  bone: KnockoutPicture;
  lines: readonly KnockoutCut[];
}

/** A page's icon (R45): its picture and the main pigment it wears, by what the page does. */
export interface PageIcon {
  pigment: BookPigment;
  glyph: PageGlyph;
}

/** The inks a roundel's layers wear in one state, idle and under the pointer. */
export interface RoundelInk {
  ground: KnockoutInk;
  body: KnockoutInk;
  bone: KnockoutInk;
  rim: KnockoutInk;
}

/** The ground's ink: the dark disc, whole, in every state. */
const GROUND: KnockoutInk = {
  idle: { tint: palette.ink, alpha: 1 },
  hover: { tint: palette.ink, alpha: 1 },
  flat: true,
};
/** How far a dim page's glyph sinks toward the ground (short of its cost: it dims, never brightens). */
const DIM = 0.45;
/** A glyph's alpha at rest; under the pointer it goes to 1 (ADR-0080 "Hover"). */
const GLYPH_ALPHA = 0.92;
/** How far an unlit rim (a locked page's) is shaded, flat, with no top-lit gradient. */
const UNLIT = 0.3;

/** A flat ink of `tint` at `alpha`, the same under the pointer. */
const still = (tint: number, alpha: number): KnockoutInk => ({ idle: { tint, alpha }, hover: { tint, alpha }, flat: true });

/**
 * The inks of a roundel in `pigment` in `state` (ADR-0094):
 * - **ready**: the glyph flat in its pigment and bone; the rim the HUD's bronze lit from above. Under
 *   the pointer the rim's tint lifts and every alpha goes to 1.
 * - **recovering**: as ready at rest, and it never lifts.
 * - **dim**: the glyph sunk toward the ground, and it never lifts.
 * - **locked**: the body flat in `hudFaint` at 0.6, the bone in the ground's ink so its detail reads
 *   as cuts (a greyed knockout, ADR-0080), the rim unlit. Never coloured, never lifted.
 */
export function roundelInk(pigment: BookPigment, state: PageState): RoundelInk {
  const [main, bone] = [palette.bookPigment[pigment], palette.bookPigment.bone];
  if (state === "locked")
    return {
      ground: GROUND,
      body: still(palette.hudFaint, GREYED_ALPHA),
      bone: still(palette.ink, 1),
      rim: still(shade(BRONZE.idle.tint, UNLIT), BRONZE.idle.alpha),
    };
  if (state === "dim")
    return {
      ground: GROUND,
      body: still(mix(main, palette.ink, DIM), GLYPH_ALPHA),
      bone: still(mix(bone, palette.ink, DIM), GLYPH_ALPHA),
      rim: { idle: BRONZE.idle, hover: BRONZE.idle },
    };
  const lifts = state === "ready";
  const glyph = (tint: number): KnockoutInk => ({ idle: { tint, alpha: GLYPH_ALPHA }, hover: { tint, alpha: lifts ? 1 : GLYPH_ALPHA }, flat: true });
  return { ground: GROUND, body: glyph(main), bone: glyph(bone), rim: { idle: BRONZE.idle, hover: lifts ? BRONZE.hover : BRONZE.idle } };
}

/** A roundel's measures at `size`: its radius, its rim's width, the ground inside the rim, the glyph's scale. */
export function roundelGeometry(size: number): { r: number; rim: number; inner: number; glyphScale: number } {
  const r = size / 2;
  const rim = Math.max(2, size * 0.075);
  const inner = r - rim;
  // the glyph's round (15 px in its 30 px box) kept a little inside the rim
  const glyphScale = (inner - size * 0.045) / (ABILITY_ICON_SLOT / 2);
  return { r, rim, inner, glyphScale };
}

/** The points `ps` scaled by `s` about the centre. */
const scalePts = (ps: readonly Pt[], s: number): Pt[] => ps.map(([x, y]) => [x * s, y * s] as Pt);

const scaleCut = (cut: KnockoutCut, s: number): KnockoutCut =>
  "ring" in cut ? { ring: { x: cut.ring.x * s, y: cut.ring.y * s, r: cut.ring.r * s } } : { path: scalePts(cut.path, s), closed: cut.closed };

const scalePicture = (p: KnockoutPicture, s: number): KnockoutPicture => ({
  silhouette: p.silhouette.map((shape) => scalePts(shape, s)),
  cuts: p.cuts.map((cut) => scaleCut(cut, s)),
  holes: p.holes?.map(({ x, y, r }) => ({ x: x * s, y: y * s, r: r * s })),
});

/** A glyph fitted to a roundel of `size`: every point and radius scaled; the cuts keep the renderer's width. */
export function fitGlyph(glyph: PageGlyph, size: number): PageGlyph {
  const s = roundelGeometry(size).glyphScale;
  return { body: scalePicture(glyph.body, s), bone: scalePicture(glyph.bone, s), lines: glyph.lines.map((cut) => scaleCut(cut, s)) };
}

export interface PageRoundelDeps {
  scene: Phaser.Scene;
  depth: number;
  icon: PageIcon;
  /** Its size, in logical px: `PAGE_ROUNDEL_SIZE.book` or `.castBar`. The box it is shown on is this wide. */
  size: number;
  /** Told when a rebuild at a new render scale could not be drawn: its owner draws the lines. */
  lost?: () => void;
  /** Named in the warning when its textures cannot be made. */
  name?: string;
}

/**
 * One page's roundel on a box: its four layers built once per render scale, then only moved and
 * inked. `show` says whether it stands; where it cannot, it takes every layer down, its owner draws
 * `drawPageLines`, and it never tries again.
 */
export class PageRoundel {
  /** Ground, body, bone, rim, each with the ink it wears: made in this order, so they stand in it at one depth. */
  private readonly layers: { knockout: Knockout; ink: keyof RoundelInk }[];
  private failed = false;

  constructor(private readonly deps: PageRoundelDeps) {
    const { scene, depth, icon, size, name = "a page" } = deps;
    const { r, inner } = roundelGeometry(size);
    const glyph = fitGlyph(icon.glyph, size);
    const lost = () => {
      if (this.failed) return;
      this.fail();
      deps.lost?.();
    };
    const layer = (picture: KnockoutPicture, ink: keyof RoundelInk) => ({
      knockout: new Knockout({ scene, depth, picture, ink: GROUND, shadow: ink === "ground", lost, name: `${name}'s ${ink}` }),
      ink,
    });
    this.layers = [
      layer({ silhouette: [circle(0, 0, r, 48)], cuts: [] }, "ground"),
      layer(glyph.body, "body"),
      ...(glyph.bone.silhouette.length ? [layer(glyph.bone, "bone")] : []),
      layer({ silhouette: [circle(0, 0, r, 48)], cuts: [], holes: [{ x: 0, y: 0, r: inner }] }, "rim"),
    ];
  }

  /** Shows it on the box `f` in `state`, hovered or not; false where it cannot be drawn. */
  show(f: Rect, state: PageState, hovered = false): boolean {
    if (this.failed) return false;
    const inks = roundelInk(this.deps.icon.pigment, state);
    if (this.layers.every(({ knockout, ink }) => knockout.show(f, hovered, inks[ink]))) return true;
    this.fail();
    return false;
  }

  /** Takes every layer down and stops watching the view. */
  destroy(): void {
    for (const { knockout } of this.layers) knockout.destroy();
  }

  private fail(): void {
    this.failed = true;
    this.destroy();
  }
}

/** The fallback's ink in `state`: the main pigment, sunk when dim, `hudFaint` at 0.6 when locked. */
export function pageLineInk(pigment: BookPigment, state: PageState): { tint: number; alpha: number } {
  if (state === "locked") return { tint: palette.hudFaint, alpha: GREYED_ALPHA };
  const main = palette.bookPigment[pigment];
  return state === "dim" ? { tint: mix(main, palette.ink, DIM), alpha: GLYPH_ALPHA } : { tint: main, alpha: GLYPH_ALPHA };
}

/**
 * The fallback (ADR-0094 "Fallback"): `icon`'s glyph as 2.25 px lines in its main pigment, fitted to
 * a roundel of `size` centred on the box `f`, with nothing filled.
 */
export function drawPageLines(g: AbilityIconPen, icon: PageIcon, f: Rect, size: number, state: PageState): void {
  const { tint, alpha } = pageLineInk(icon.pigment, state);
  const glyph = fitGlyph(icon.glyph, size);
  drawIconLines(g, { picture: glyph.body, lines: glyph.lines }, f.x + f.width / 2, f.y + f.height / 2, tint, alpha);
}

/** A recovering page's sweep (ADR-0094 "Not ready"): `ink`, about as dark as the ability bar's. */
export const ROUNDEL_SWEEP = { tint: palette.ink, alpha: 0.55 } as const;

/**
 * The wedge covering `fraction` of a roundel of `size` on the box `f`, inside its rim: from the hand,
 * where the clear part ends, clockwise round to 12 o'clock, as a closed polygon from the centre along
 * the ground's edge. Empty at 0; the whole ground at 1. The fraction is `cooldownSwept`'s.
 */
export function roundelSweep(f: Rect, size: number, fraction: number): Point[] {
  const frac = Math.min(1, fraction);
  if (!(frac > 0)) return [];
  const { inner } = roundelGeometry(size);
  const [cx, cy] = [f.x + f.width / 2, f.y + f.height / 2];
  const hand = (1 - frac) * 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(frac * 48));
  const rim = Array.from({ length: steps + 1 }, (_, i) => {
    const a = hand + ((2 * Math.PI - hand) * i) / steps;
    return { x: cx + Math.sin(a) * inner, y: cy - Math.cos(a) * inner };
  });
  return [{ x: cx, y: cy }, ...rim];
}

/** What the sweep draws with: its wedge's points are plain ones, as Phaser reads them. */
export interface SweepPen {
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
}

/** Draws the sweep over a roundel on `g`, which its owner keeps at the roundel's depth + 1 and clears each frame. */
export function drawRoundelSweep(g: SweepPen, f: Rect, size: number, fraction: number): void {
  const points = roundelSweep(f, size, fraction);
  if (points.length === 0) return;
  g.fillStyle(ROUNDEL_SWEEP.tint, ROUNDEL_SWEEP.alpha);
  g.fillPoints(points, true);
}
