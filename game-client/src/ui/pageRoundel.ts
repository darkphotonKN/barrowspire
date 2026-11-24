/**
 * A class book page's roundel (FS-X2CMM §I R45, ADR-0094; inked as an illuminated initial by §Change:
 * Illuminated pages C1 and ADR-0095): a bone picture on a ground of its page's pigment, in a bronze rim.
 * The one coloured family on the canvas HUD; every other HUD icon stays a bronze knockout (ADR-0080).
 *
 * It is laid from four layers of the one shared knockout renderer (`Knockout`), so it keeps that
 * renderer's supersampling at twice the render scale and its rebuild on a render-scale change, and
 * one light over its ground:
 * - the **ground**, a flat disc, in a ready page's `shade(pigment, 0.35)`. Only it casts ADR-0080's drop shadow.
 * - the **light**, over the ground: one white radial shared by every roundel of a size at a render scale,
 *   whole at the centre top (cx 50 %, cy 35 %) and clear by the rim, tinted the pigment, so the ground
 *   falls from the pigment to its shade.
 * - the **body**, the glyph's picture in bone, flat, its cuts through to the ground.
 * - the **bone** layer, the glyph's detail, flat, laid on the body in a dark of the pigment, so it reads as cuts.
 * - the **rim**, a ring in the HUD's bronze, lit from above as the knockouts are.
 *
 * A page's state changes only the inks the layers wear (`roundelInk`), never their textures. Where
 * the textures cannot be made, its owner draws the glyph as a 2.25 px line in its main pigment
 * (`drawPageLines`), so a page is never blank. A recovering page's cooldown sweep is its owner's
 * to draw each frame, over the roundel (`drawRoundelSweep`, at `depth + 1`). Tokens only (ADR-0013).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette, shade, type BookPigment } from "@/utils/canvasPalette";
import { ABILITY_ICON_SLOT, circle, drawIconLines, type AbilityIconPen } from "./abilityIcons";
import type { Rect } from "./hudCornerLayout";
import { BRONZE, GREYED_ALPHA, Knockout, type KnockoutCut, type KnockoutInk, type KnockoutPicture, type Pt } from "./knockout";
import type { Point } from "./xpBarLayout";

/**
 * The roundel's sizes, in logical px (R45; ADR-0094: about 44 px in the book, 28 on the cast bar). The
 * open tome (§Change: Illuminated pages and the open tome C4, C5) draws a page at 28 px in its row and
 * at 64 px on its right page; 44 stays the contact sheet's book size.
 */
export const PAGE_ROUNDEL_SIZE = { book: 44, castBar: 28, tomeRow: 28, tomePage: 64 } as const;

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

/** The inks a roundel's layers wear in one state, idle and under the pointer: the light is its ground's. */
export interface RoundelInk {
  ground: KnockoutInk;
  light: KnockoutInk;
  body: KnockoutInk;
  bone: KnockoutInk;
  rim: KnockoutInk;
}

/** How far a ready ground falls toward the pitch at its rim, and how dark its picture's detail is cut (ADR-0095). */
const GROUND_SHADE = 0.35;
const DETAIL_SHADE = 0.55;
/** How far the ground's centre lifts toward bone under the pointer (ADR-0095 "Hovered"). */
const HOVER_LIFT = 0.15;
/** How far every layer of a dim page sinks toward the locked ground (short of its cost: it dims, never brightens). */
export const ROUNDEL_DIM = 0.45;
/** How far an unlit rim (a locked page's) is shaded, flat, with no top-lit gradient. */
const UNLIT = 0.3;

/** A flat ink of `tint` at `alpha`, the same under the pointer. */
const still = (tint: number, alpha: number): KnockoutInk => ({ idle: { tint, alpha }, hover: { tint, alpha }, flat: true });

/** `ink` at rest in every state, its tints sunk toward the locked ground by `sink` (0 leaves them be). */
const sunk = (ink: KnockoutInk, sink: number): KnockoutInk => {
  const idle = { tint: mix(ink.idle.tint, palette.bookPigment.lockedGround, sink), alpha: ink.idle.alpha };
  return { ...ink, idle, hover: idle };
};

/**
 * The inks of a roundel in `pigment` in `state` (ADR-0095, amending ADR-0094's):
 * - **ready**: the ground the pigment, falling from the centre top to `shade(pigment, 0.35)` at the rim;
 *   the picture bone at 1, its detail `shade(pigment, 0.55)`; the rim the HUD's bronze lit from above.
 *   Under the pointer the ground's centre lifts to `mix(pigment, bone, 0.15)` and the rim to brassBright.
 * - **recovering**: as ready at rest, under its owner's sweep, and it never lifts.
 * - **dim**: every layer of ready sunk toward the locked ground, and it never lifts.
 * - **locked**: the flat warm near-ink ground, no light; the body flat in `hudFaint` at 0.6, the detail
 *   the ground's colour so it reads as cuts (a greyed knockout, ADR-0080); the rim unlit. Never coloured,
 *   never lifted.
 */
export function roundelInk(pigment: BookPigment, state: PageState): RoundelInk {
  const { [pigment]: main, bone, lockedGround, rimLit } = palette.bookPigment;
  if (state === "locked")
    return {
      ground: still(lockedGround, 1),
      light: still(lockedGround, 0),
      body: still(palette.hudFaint, GREYED_ALPHA),
      bone: still(lockedGround, 1),
      rim: still(shade(BRONZE.idle.tint, UNLIT), BRONZE.idle.alpha),
    };
  const ready: RoundelInk = {
    ground: still(shade(main, GROUND_SHADE), 1),
    light: { idle: { tint: main, alpha: 1 }, hover: { tint: mix(main, bone, HOVER_LIFT), alpha: 1 }, flat: true },
    body: still(bone, 1),
    bone: still(shade(main, DETAIL_SHADE), 1),
    rim: { idle: BRONZE.idle, hover: { tint: rimLit, alpha: 1 } },
  };
  if (state === "ready") return ready;
  const sink = state === "dim" ? ROUNDEL_DIM : 0;
  return {
    ground: sunk(ready.ground, sink),
    light: sunk(ready.light, sink),
    body: sunk(ready.body, sink),
    bone: sunk(ready.bone, sink),
    rim: sunk(ready.rim, sink),
  };
}

/** A roundel's measures at `size`: its radius, its rim's width, the ground inside the rim, the glyph's scale. */
export function roundelGeometry(size: number): { r: number; rim: number; inner: number; glyphScale: number } {
  const r = size / 2;
  const rim = Math.max(2, size * 0.08);
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
 * Where the ground's light is whole, as a share of the size from the top (ADR-0095: cy 35 %), and how far
 * it reaches. Tuned on the contact sheet (I-X2CMM-24): a shorter reach leaves the ground's lower third
 * and its edge at the shade, which keeps an ochre ground off the bronze rim and its bone picture legible
 * at 28 px; 0.5 washed ochre out.
 */
const LIGHT_AT = 0.35;
const LIGHT_REACH = 0.32;
/** How much finer than the render scale the light is painted, as the knockouts are. */
const LIGHT_SUPERSAMPLE = 2;

/**
 * The key of the ground's light for a roundel of `size` at `renderScale`, painted on the scene's first
 * ask and shared by every roundel of that size and scale: a white disc of the roundel's radius, whole at
 * the centre top and clear `LIGHT_REACH` of the size away, eased so the fall is soft. Undefined where the
 * scene makes no canvas textures: the ground then stands flat.
 */
function groundLight(scene: Phaser.Scene, size: number, renderScale: number): string | undefined {
  const textures = scene.textures as Phaser.Textures.TextureManager | undefined;
  if (typeof textures?.createCanvas !== "function") return undefined;
  const px = Math.round(size * LIGHT_SUPERSAMPLE * renderScale);
  const key = `page-roundel-light-${size}@${renderScale}`;
  if (textures.exists(key)) return key;
  const texture = textures.createCanvas(key, px, px);
  if (!texture) return undefined;
  const ctx = texture.getContext();
  const [c, at] = [px / 2, px * LIGHT_AT];
  const light = ctx.createRadialGradient(c, at, 0, c, at, px * LIGHT_REACH);
  // smoothstep in eight steps, whole at the centre top, clear at the reach
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    light.addColorStop(u, `rgba(255, 255, 255, ${+(1 - u * u * (3 - 2 * u)).toFixed(4)})`);
  }
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, 2 * Math.PI);
  ctx.fill();
  texture.refresh();
  return key;
}

/**
 * One page's roundel on a box: its four layers built once per render scale, then only moved and
 * inked, and its ground's light laid just over its ground each time the ground is built. `show` says
 * whether it stands; where it cannot, it takes every layer down, its owner draws `drawPageLines`, and
 * it never tries again.
 */
export class PageRoundel {
  /** Ground, body, bone, rim, each with the ink it wears: made in this order, so they stand in it at one depth. */
  private readonly layers: { knockout: Knockout; ink: Exclude<keyof RoundelInk, "light"> }[];
  /** The ground's light, over the ground and under the body; none where the scene makes no canvas. */
  private light?: Phaser.GameObjects.Image;
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
    const layer = (picture: KnockoutPicture, ink: Exclude<keyof RoundelInk, "light">) => ({
      knockout: new Knockout({
        scene,
        depth,
        picture,
        ink: roundelInk(icon.pigment, "ready")[ink],
        shadow: ink === "ground",
        // the ground is built first, and again first at each render scale: its light goes just over it
        built: ink === "ground" ? (ground) => this.lightOver(ground) : undefined,
        lost,
        name: `${name}'s ${ink}`,
      }),
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
    if (this.layers.every(({ knockout, ink }) => knockout.show(f, hovered, inks[ink]))) {
      const { tint, alpha } = hovered ? inks.light.hover : inks.light.idle;
      this.light?.setPosition(f.x + f.width / 2, f.y + f.height / 2).setTint(tint).setAlpha(alpha).setVisible(true);
      return true;
    }
    this.fail();
    return false;
  }

  /** Hides every layer, their textures kept: the next `show` stands it again, nothing rebuilt (C7). */
  hide(): void {
    for (const { knockout } of this.layers) knockout.hide();
    this.light?.setVisible(false);
  }

  /** Takes every layer down and stops watching the view. */
  destroy(): void {
    for (const { knockout } of this.layers) knockout.destroy();
    this.light?.destroy();
    this.light = undefined;
  }

  /** Lays the ground's light, at the view's render scale, just over the newly built `ground`. */
  private lightOver(ground: Phaser.GameObjects.RenderTexture): void {
    const { scene, depth, size } = this.deps;
    const key = groundLight(scene, size, viewport.renderScale);
    if (!key) return;
    if (this.light) this.light.setTexture(key);
    else this.light = scene.add.image(ground.x, ground.y, key).setScrollFactor(0).setDepth(depth).setAlpha(0);
    this.light.setDisplaySize(size, size);
    scene.children.moveAbove(this.light as Phaser.GameObjects.GameObject, ground as Phaser.GameObjects.GameObject);
  }

  private fail(): void {
    this.failed = true;
    this.destroy();
  }
}

/** The fallback's lines' alpha (ADR-0094 "Fallback", which ADR-0095 keeps). */
const LINE_ALPHA = 0.92;

/** The fallback's ink in `state`: the main pigment, sunk when dim, `hudFaint` at 0.6 when locked. */
export function pageLineInk(pigment: BookPigment, state: PageState): { tint: number; alpha: number } {
  if (state === "locked") return { tint: palette.hudFaint, alpha: GREYED_ALPHA };
  const main = palette.bookPigment[pigment];
  return state === "dim" ? { tint: mix(main, palette.ink, ROUNDEL_DIM), alpha: LINE_ALPHA } : { tint: main, alpha: LINE_ALPHA };
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
