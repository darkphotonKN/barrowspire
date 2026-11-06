/**
 * The fog of war as a field of texels (FS-SRA9J §C.13, owner playtest 2026-11-06): its polygons laid
 * on a coarse lattice and feathered inward, so a fog edge fades in over a few texels instead of
 * cutting hard. Pure: no Phaser; the fog layer paints what it returns into canvas textures.
 *
 * **Feathered inward only.** The feather may make the fog lighter near an edge, never darker, and
 * never puts any on a px the sharp fog leaves clear (a member's head, a drawn wall): the field is
 * `min(sharp, blur(erode(equiv)))`. Eroding first by the blur's own reach pulls the fog back from
 * every lighter edge, so the blur's ramp ends at the edge rather than spilling over it, and the
 * `min` keeps whatever the sharp fog leaves clear at nothing.
 *
 * **A wall stands as dark as its tint** (`equiv`): a drawn wall is clear in the sharp fog, since
 * it is tinted instead, but it feathers as its tint's share of the fog. So the fog behind a wall
 * tinted as dark as it feathers nothing, and only an edge between lighter and darker is softened.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";

/** The feather's lattice and reach (owner playtest 2026-11-06: no torn edges). */
export const FEATHER = {
  /**
   * Screen px a side of one texel: the lattice the fog is laid on, drawn smooth between texels.
   * Coarse on purpose: a chunk's field is a sixty-fourth of its px, so a change of state repaints
   * in a few ms; the feather hides the lattice.
   */
  texel: 8,
  /** Texels of one box blur, either side; two run, so the ramp spans twice it each side. */
  radius: 1,
  /** Texels from a lighter edge to the full veil: the erosion (2 · radius) and the blur's reach. */
  reach: 4,
} as const;

/** What the fog lays over one polygon of screen: its alpha, and the alpha it feathers as. */
export interface FieldShape {
  /** The share of the fog's ink over it: 0 where it is clear. */
  alpha: number;
  /** The fog it stands as for the feather: a drawn wall's tint share, else its alpha. */
  equiv: number;
  points: readonly Point[];
}

/** A window of the lattice: its top-left corner in screen px, its size in texels. */
export interface FieldWindow {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

/**
 * The lattice's window over a screen rect: its edges snapped down to the lattice, so the windows of
 * rects that tile the screen tile it too, texel for texel.
 */
export function fieldWindow(rect: Rect): FieldWindow {
  const t = FEATHER.texel;
  const x = Math.floor(rect.x / t) * t;
  const y = Math.floor(rect.y / t) * t;
  return {
    x,
    y,
    cols: Math.max(1, Math.floor((rect.x + rect.width) / t) - x / t),
    rows: Math.max(1, Math.floor((rect.y + rect.height) / t) - y / t),
  };
}

/**
 * The shapes on a window of the lattice: each texel takes the alpha and equiv of the shape covering
 * its middle (the fog's shapes never overlap), nothing where none does.
 */
export function rasterize(shapes: readonly FieldShape[], win: FieldWindow): { sharp: Float32Array; equiv: Float32Array } {
  const t = FEATHER.texel;
  const sharp = new Float32Array(win.cols * win.rows);
  const equiv = new Float32Array(win.cols * win.rows);
  const xs: number[] = [];
  for (const shape of shapes) {
    const pts = shape.points;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    const r0 = Math.max(0, Math.ceil((y0 - win.y) / t - 0.5));
    const r1 = Math.min(win.rows - 1, Math.ceil((y1 - win.y) / t - 0.5) - 1);
    for (let r = r0; r <= r1; r++) {
      const y = win.y + (r + 0.5) * t;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const p = pts[j];
        const q = pts[i];
        if (p.y > y !== q.y > y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - win.x) / t - 0.5));
        const c1 = Math.min(win.cols - 1, Math.ceil((xs[k + 1] - win.x) / t - 0.5) - 1);
        for (let c = c0; c <= c1; c++) {
          sharp[r * win.cols + c] = shape.alpha;
          equiv[r * win.cols + c] = shape.equiv;
        }
      }
    }
  }
  return { sharp, equiv };
}

/**
 * `src` with each texel the least of those within `reach` along one axis, the edges held: van
 * Herk's running minimum, a few comparisons a texel whatever the reach.
 */
function minAlong(src: Float32Array, cols: number, rows: number, reach: number, across: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const n = across ? rows : cols;
  const lines = across ? cols : rows;
  const step = across ? cols : 1;
  const width = 2 * reach + 1;
  // one line, padded by `reach` held texels each end, its blocks' running minima from either side
  const len = n + 2 * reach;
  const line = new Float32Array(len);
  const fwd = new Float32Array(len);
  const back = new Float32Array(len);
  for (let l = 0; l < lines; l++) {
    const start = across ? l : l * cols;
    for (let i = 0; i < len; i++) {
      const k = Math.min(n - 1, Math.max(0, i - reach));
      line[i] = src[start + k * step];
    }
    for (let i = 0; i < len; i++) fwd[i] = i % width === 0 ? line[i] : Math.min(fwd[i - 1], line[i]);
    for (let i = len - 1; i >= 0; i--) back[i] = i === len - 1 || (i + 1) % width === 0 ? line[i] : Math.min(back[i + 1], line[i]);
    // the window [i, i + width) of the padded line is the one centred on texel i
    for (let i = 0; i < n; i++) out[start + i * step] = Math.min(back[i], fwd[i + width - 1]);
  }
  return out;
}

/** `src` averaged over `radius` texels either side along one axis, the edges held: a running sum. */
function boxAlong(src: Float32Array, cols: number, rows: number, radius: number, across: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const n = across ? rows : cols;
  const lines = across ? cols : rows;
  const step = across ? cols : 1;
  const width = 2 * radius + 1;
  for (let l = 0; l < lines; l++) {
    const start = across ? l : l * cols;
    const last = start + (n - 1) * step;
    const at = (i: number) => src[i < 0 ? start : i >= n ? last : start + i * step];
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += at(k);
    for (let i = 0; i < n; i++) {
      out[start + i * step] = sum / width;
      sum += at(i + radius + 1) - at(i - radius);
    }
  }
  return out;
}

/**
 * The sharp fog feathered inward (see the module's note): `equiv` eroded by twice `radius`, blurred
 * by two boxes of `radius`, and never above `sharp`.
 */
export function featherField(sharp: Float32Array, equiv: Float32Array, cols: number, rows: number, radius: number): Float32Array {
  let f = minAlong(minAlong(equiv, cols, rows, 2 * radius, false), cols, rows, 2 * radius, true);
  for (let pass = 0; pass < 2; pass++) f = boxAlong(boxAlong(f, cols, rows, radius, false), cols, rows, radius, true);
  for (let i = 0; i < f.length; i++) f[i] = Math.min(f[i], sharp[i]);
  return f;
}

/**
 * The feathered fog over a screen rect: computed over the rect's window grown by the feather's
 * reach, so the shapes past its edge count as they do for the chunk beside it, then cut back to it.
 */
export function fogField(shapes: readonly FieldShape[], rect: Rect): { window: FieldWindow; alpha: Float32Array } {
  const win = fieldWindow(rect);
  const pad = FEATHER.reach;
  const t = FEATHER.texel;
  const wide = { x: win.x - pad * t, y: win.y - pad * t, cols: win.cols + 2 * pad, rows: win.rows + 2 * pad };
  const { sharp, equiv } = rasterize(shapes, wide);
  const all = featherField(sharp, equiv, wide.cols, wide.rows, FEATHER.radius);
  const alpha = new Float32Array(win.cols * win.rows);
  for (let r = 0; r < win.rows; r++) alpha.set(all.subarray((r + pad) * wide.cols + pad, (r + pad) * wide.cols + pad + win.cols), r * win.cols);
  return { window: win, alpha };
}
