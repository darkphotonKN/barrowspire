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
 *
 * It stands embossed (FS-S8Z2Y; the owner, 2026-11-13: 「加上浮凸漸層」): its own texture is shown a
 * second time under it as a drop shadow, and its tint is laid per corner so the bronze is lit from
 * above. Neither draws anything more into the texture.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette, shade } from "@/utils/canvasPalette";
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

/** What {@link stroke} draws with: a Phaser `Graphics` is one. */
export type StrokePen = Pick<Phaser.GameObjects.Graphics, "beginPath" | "moveTo" | "lineTo" | "closePath" | "strokePath">;

/** Strokes the line through `ps`, moved by (ox, oy), as one path, closed when `closed`: a fallback's lines. */
export function stroke(g: StrokePen, ps: readonly Pt[], ox: number, oy: number, closed = false): void {
  g.beginPath();
  g.moveTo(ox + ps[0][0], oy + ps[0][1]);
  for (const [x, y] of ps.slice(1)) g.lineTo(ox + x, oy + y);
  if (closed) g.closePath();
  g.strokePath();
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

/**
 * A knockout's tint and alpha, idle and under the pointer. It is lit from above unless `flat`: one
 * tint over the whole silhouette (the greyed Mailbox, FS-S8Z2Y R6).
 */
export interface KnockoutInk {
  idle: { tint: number; alpha: number };
  hover: { tint: number; alpha: number };
  flat?: boolean;
}

/** The row's bronze idle, lifted toward the bright amber under the pointer (FS-7TQN4 R10). */
export const BRONZE: KnockoutInk = {
  idle: { tint: mix(palette.frame, palette.interactable, 0.5), alpha: 0.85 },
  hover: { tint: mix(palette.frame, palette.interactableBright, 0.5), alpha: 1 },
};

/**
 * The greyed knockout (ADR-0080 "Unavailable"): flat in the faint grey at 0.6, never brightening under
 * the pointer (FS-7TQN4 R9), on the drop shadow with no gradient (FS-S8Z2Y R6). The greyed Mailbox wears
 * it; one place, so no icon copies it.
 */
export const GREYED_ALPHA = 0.6;
export const GREYED: KnockoutInk = {
  idle: { tint: palette.hudFaint, alpha: GREYED_ALPHA },
  hover: { tint: palette.hudFaint, alpha: GREYED_ALPHA },
  flat: true,
};

/** The cut lines' width, in logical px (FS-7TQN4 R2). */
export const CUT_W = 1.6;
/**
 * The drop shadow (FS-S8Z2Y R1): the knockout's own texture in the charcoal ink, half seen, moved
 * this far right and down in logical px, so the icon reads raised off the world.
 */
const SHADOW = { tint: palette.ink, alpha: 0.5, dx: 1, dy: 1 };
/** How far the silhouette's top is lifted toward the bright amber, and its foot shaded (R4). */
const LIFT = 0.25;
const SHADE = 0.2;
/** Phaser 4's `TintModes.FILL`: the tint replaces the texel's colour, its alpha kept. */
const TINT_FILL = 1 as Phaser.TintModes;
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
  private shadow?: Phaser.GameObjects.Image;
  /** The silhouette's top and foot, in local px: where the gradient's two ends lie (R4). */
  private readonly span: { top: number; foot: number };
  private builtAt = 0;
  private failed = false;
  private at?: { f: Rect; hovered: boolean };
  private readonly unwatch: () => void;

  constructor(private readonly deps: KnockoutDeps) {
    const ys = deps.picture.silhouette.flatMap((shape) => shape.map(([, y]) => y));
    this.span = { top: Math.min(...ys), foot: Math.max(...ys) };
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
    const [cx, cy] = [f.x + f.width / 2, f.y + f.height / 2];
    const image = this.image!.setPosition(cx, cy).setAlpha(ink.alpha);
    if (this.deps.ink.flat) image.setTint(ink.tint);
    else {
      const { top, foot } = topLit(ink.tint, this.span, f.height / 2);
      image.setTint(top, top, foot, foot);
    }
    // the shadow never moves under the pointer (R3)
    this.shadow!.setPosition(cx + SHADOW.dx, cy + SHADOW.dy);
    return true;
  }

  /** Takes its texture down and stops watching the view. */
  destroy(): void {
    this.unwatch();
    this.drop();
  }

  private drop(): void {
    this.shadow?.destroy();
    this.shadow = undefined;
    this.image?.destroy();
    this.image = undefined;
  }

  /** Whether the scene can make it and its shadow: a test's stand-in scene cannot. */
  private possible(): boolean {
    const { scene } = this.deps;
    return (
      typeof scene.make?.graphics === "function" &&
      typeof scene.add?.renderTexture === "function" &&
      typeof scene.add?.image === "function" &&
      typeof scene.children?.moveBelow === "function"
    );
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
      // the drop shadow: the same texture shown again, so nothing is drawn twice (FS-S8Z2Y R1)
      this.shadow = scene.add
        .image(f.x + f.width / 2, f.y + f.height / 2, image.texture)
        .setScrollFactor(0)
        .setDepth(depth)
        .setScale(1 / k)
        .setTint(SHADOW.tint)
        .setTintMode(TINT_FILL)
        .setAlpha(SHADOW.alpha);
    } catch (err) {
      this.shadow?.destroy();
      this.shadow = undefined;
      image.destroy();
      throw err;
    } finally {
      for (const g of pens) g.destroy();
    }
    this.image = image;
    this.builtAt = renderScale;
    this.deps.built?.(image);
    // just under the image, wherever its owner has placed it (R2)
    scene.children.moveBelow(this.shadow as Phaser.GameObjects.GameObject, image as Phaser.GameObjects.GameObject);
  }
}

/**
 * The corner tints that light `base` from above (FS-S8Z2Y R4): lifted toward the bright amber at the
 * silhouette's top, shaded at its foot, in a straight line between, carried out to the texture's
 * top and foot `half` px from its middle, so the quad's own interpolation lays that line on the
 * silhouette. Each channel is rounded and held to 0–255.
 */
function topLit(base: number, span: { top: number; foot: number }, half: number): { top: number; foot: number } {
  const lit = mix(base, palette.interactableBright, LIFT);
  const dark = shade(base, SHADE);
  const at = (y: number) => {
    const u = (y - span.top) / (span.foot - span.top);
    return [16, 8, 0].reduce((c, bits) => {
      const [a, b] = [(lit >> bits) & 0xff, (dark >> bits) & 0xff];
      return c | (Math.max(0, Math.min(0xff, Math.round(a + u * (b - a)))) << bits);
    }, 0);
  };
  return { top: at(-half), foot: at(half) };
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
