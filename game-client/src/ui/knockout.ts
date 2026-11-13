/**
 * The corner row's one knockout renderer (FS-7TQN4 R1; FS-3EBCA § Change: The inventory icon is a
 * bronze knockout rucksack, K1–K7): a picture drawn as one solid silhouette with its inner lines cut
 * out of it, so the world shows through them.
 *
 * A texture's framebuffer is not antialiased, so the silhouette is filled white into a render
 * texture at twice the render scale, its cuts erased, and the texture shown at the slot filtered
 * down; the tint gives it its colour, so hover never redraws it. A new render scale draws it again
 * (it watches the view itself). Where a scene cannot make that texture, it says so, once, and its
 * owner draws its line glyph instead. Drawn in code from palette tokens (ADR-0013).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";
import type { Rect } from "./hudCornerLayout";

export type Pt = readonly [number, number];

/** The quadratic from `a` through the pull of `c` to `b`, in `steps` points, `a` left out. */
export function bend(a: Pt, c: Pt, b: Pt, steps = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** The arc of an ellipse from angle `from` to `to`, in `steps` points, both ends kept. */
export function oval(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
}

/** A circle, in local px about the slot's centre. */
export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** A cut: a line through `path` (closed back to its first point when `closed`), or a `ring`. */
export type KnockoutCut = { path: readonly Pt[]; closed?: boolean } | { ring: Circle };

/**
 * What a knockout draws, in local px about its slot's centre, x to the right and y down: the
 * closed shapes filled as its silhouette, the cuts erased out of it as lines, and the holes erased
 * out of it whole.
 */
export interface KnockoutPicture {
  silhouette: readonly (readonly Pt[])[];
  cuts: readonly KnockoutCut[];
  holes?: readonly Circle[];
}

/** A knockout's tint and alpha, idle and under the pointer. */
export interface KnockoutInk {
  idle: { tint: number; alpha: number };
  hover: { tint: number; alpha: number };
}

/** The row's bronze idle, lifted toward the bright amber under the pointer (FS-7TQN4 R10). */
export const BRONZE: KnockoutInk = {
  idle: { tint: mix(palette.frame, palette.interactable, 0.5), alpha: 0.85 },
  hover: { tint: mix(palette.frame, palette.interactableBright, 0.5), alpha: 1 },
};

/** The cut lines' width, in logical px (FS-7TQN4 R2). */
export const CUT_W = 1.6;
/** How much finer than the render scale its texture is drawn. */
const SUPERSAMPLE = 2;

export interface KnockoutDeps {
  scene: Phaser.Scene;
  depth: number;
  picture: KnockoutPicture;
  ink: KnockoutInk;
  /** Told each time a texture is made, with the new image (the envelope sets its draw order). */
  built?: (image: Phaser.GameObjects.RenderTexture) => void;
  /** Told when a rebuild at a new render scale could not be drawn: its owner draws the lines. */
  lost?: () => void;
  /** Named in the warning when the texture cannot be made. */
  name?: string;
}

/**
 * One knockout on a slot: drawn into its own render texture once per render scale, then only moved
 * and tinted. `show` says whether it stands; where it cannot (the scene makes no textures, or making
 * one threw), its owner draws its line glyph, and it never tries again.
 */
export class Knockout {
  private image?: Phaser.GameObjects.RenderTexture;
  private builtAt = 0;
  private failed = false;
  private at?: { f: Rect; hovered: boolean };
  private readonly unwatch: () => void;

  constructor(private readonly deps: KnockoutDeps) {
    // the texture is drawn at the render scale, so a new one draws it again
    this.unwatch = viewport.onChange(() => {
      if (!this.image || !this.at || this.builtAt === viewport.renderScale) return;
      if (!this.show(this.at.f, this.at.hovered)) this.deps.lost?.();
    });
  }

  /** Shows it on the slot `f`, hovered or not; false where it cannot be drawn. */
  show(f: Rect, hovered: boolean): boolean {
    if (this.failed || !this.possible()) return false;
    this.at = { f, hovered };
    if (!this.image || this.builtAt !== viewport.renderScale) {
      try {
        this.build(f, viewport.renderScale);
      } catch (err) {
        this.failed = true;
        this.drop();
        console.warn(`knockout: ${this.deps.name ?? "an icon"} could not be drawn; drawing it in lines`, err);
        return false;
      }
    }
    const ink = hovered ? this.deps.ink.hover : this.deps.ink.idle;
    this.image!.setPosition(f.x + f.width / 2, f.y + f.height / 2)
      .setTint(ink.tint)
      .setAlpha(ink.alpha);
    return true;
  }

  /** Takes its texture down and stops watching the view. */
  destroy(): void {
    this.unwatch();
    this.drop();
  }

  private drop(): void {
    this.image?.destroy();
    this.image = undefined;
  }

  /** Whether the scene can make it: a test's stand-in scene cannot. */
  private possible(): boolean {
    const { scene } = this.deps;
    return typeof scene.make?.graphics === "function" && typeof scene.add?.renderTexture === "function";
  }

  private build(f: Rect, renderScale: number): void {
    this.drop();
    const { scene, depth, picture } = this.deps;
    const k = SUPERSAMPLE * renderScale;
    const image = scene.add.renderTexture(
      f.x + f.width / 2,
      f.y + f.height / 2,
      Math.round(f.width * k),
      Math.round(f.height * k),
    );
    const pens: Phaser.GameObjects.Graphics[] = [];
    // about the texture's own middle (it may have rounded its size up to even)
    const pen = () => {
      const g = scene.make.graphics({}, false).setPosition(image.width / 2, image.height / 2);
      pens.push(g);
      return g;
    };
    try {
      image.setScrollFactor(0).setDepth(depth).setScale(1 / k);
      // the fills at k: the scale changes nothing a fill draws
      const solid = pen().setScale(k);
      fillSilhouette(solid, picture);
      // the cuts in texel coordinates, unscaled: the renderer joins a path's corners only when its
      // own lineStyle width is over 2, before any scale (Phaser 4.2.1 StrokePath), and 1.6·k is
      const cuts = pen();
      eraseCuts(cuts, picture, k);
      image.draw(solid).erase(cuts).render();
    } catch (err) {
      image.destroy();
      throw err;
    } finally {
      for (const g of pens) g.destroy();
    }
    this.image = image;
    this.builtAt = renderScale;
    this.deps.built?.(image);
  }
}

/** Traces the line through `ps`, each point times `k`, as one path, closed when `closed`. */
function trace(g: Phaser.GameObjects.Graphics, ps: readonly Pt[], closed: boolean, k = 1): void {
  g.beginPath();
  g.moveTo(ps[0][0] * k, ps[0][1] * k);
  for (const [x, y] of ps.slice(1)) g.lineTo(x * k, y * k);
  if (closed) g.closePath();
}

/** The silhouette, filled solid in white. */
function fillSilhouette(g: Phaser.GameObjects.Graphics, picture: KnockoutPicture): void {
  g.fillStyle(TINT_IDENTITY, 1);
  for (const shape of picture.silhouette) {
    trace(g, shape, true);
    g.fillPath();
  }
}

/**
 * The cuts, each one stroke or one path, `CUT_W` wide, and the holes, each a disc, every point,
 * radius and width times `k` (FS-7TQN4 R2).
 */
function eraseCuts(g: Phaser.GameObjects.Graphics, picture: KnockoutPicture, k: number): void {
  g.lineStyle(CUT_W * k, TINT_IDENTITY, 1);
  for (const cut of picture.cuts) {
    if ("ring" in cut) g.strokeCircle(cut.ring.x * k, cut.ring.y * k, cut.ring.r * k);
    else {
      trace(g, cut.path, !!cut.closed, k);
      g.strokePath();
    }
  }
  if (picture.holes?.length) {
    g.fillStyle(TINT_IDENTITY, 1);
    for (const { x, y, r } of picture.holes) g.fillCircle(x * k, y * k, r * k);
  }
}
