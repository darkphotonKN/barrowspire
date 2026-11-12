// Trimming a sheet's frames (FS-HF0WW): each frame is cut down to the box that holds its
// pixels, so the atlas stops storing the empty margin every frame carries for the widest pose of
// the sheet. The manifest records where the cut sits in the frame (`trim`), and the client puts
// it back there (Phaser `Frame.setTrim`), so a trimmed frame draws, anchors and sizes exactly as
// the whole frame did (src/render/art/manifest.ts, phaser.ts).
//
// Lossless by construction: the cut keeps every pixel with any byte set, so the frame rebuilt
// from it (`expandFrame`) is byte-identical to the frame baked.
//
// The cut is grown before it is stored:
//  - by TRIM_MARGIN transparent px each side. The game draws with linear filtering, which blends
//    each screen px from the two nearest texels each way; a screen px whose centre falls up to
//    half a texel outside the last opaque texel still takes some of it. The whole frame's quad
//    covers that px, a quad cut flush to the pixels would not, and the sprite's soft edge would
//    lose that half-texel of fringe. One texel of margin puts every such px inside the quad.
//  - out to whole screen px (multiples of the sheet's `trimGrid`), so the cut's corners sit on the
//    same screen px grid the whole frame's do. Phaser 4 rounds each corner of a sprite's quad to
//    the backing px (`TransformerImage.run`, ADR-0057); where a screen px is a whole number of
//    backing px (render scale 1 and 2, a sprite at its true size) the cut's corners then round
//    exactly as the whole frame's, and the trimmed sprite draws the same px. Elsewhere it can land
//    up to half a backing px off (ADR-0058, measured in FS-HF0WW).

import { wholeStep } from "../page/step.mjs";

/**
 * The trim grid of a sheet baked at `scale`, in sheet px (ADR-0076 Decision 3): `wholeStep`
 * screen px, so a cut's corners are whole sheet px and whole screen px. 1 at 1x, 2 at 2x; 3 at
 * 1.5 (two screen px), which also lands every corner on whole backing px at render scale 1, 1.5
 * and 2.
 *
 * @param {number} scale
 */
export const trimGrid = (scale) => scale * wholeStep(scale);

/** Transparent px kept around each frame's pixels, for linear filtering (see above). */
export const TRIM_MARGIN = 1;

/**
 * The box of `px` (straight RGBA, `width × height`) that holds every pixel with any byte set,
 * grown by `margin` px each side and out to multiples of `grid` px, inside the frame. A blank
 * frame keeps one `grid × grid` cell at its top-left, so every frame still has a size.
 *
 * @param {Uint8Array | Buffer} px
 * @param {number} width
 * @param {number} height
 * @param {{ grid?: number, margin?: number }} [options] `grid`: the sheet's {@link trimGrid}
 * @returns {{ x: number, y: number, w: number, h: number }} in frame px
 */
export function trimRect(px, width, height, { grid = 1, margin = TRIM_MARGIN } = {}) {
  if (width % grid || height % grid) throw new Error(`trim: ${width}×${height} is not a multiple of ${grid}`);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!(px[i] | px[i + 1] | px[i + 2] | px[i + 3])) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  if (maxX < 0) return { x: 0, y: 0, w: grid, h: grid };
  const x0 = Math.max(0, Math.floor((minX - margin) / grid) * grid);
  const y0 = Math.max(0, Math.floor((minY - margin) / grid) * grid);
  const x1 = Math.min(width, Math.ceil((maxX + 1 + margin) / grid) * grid);
  const y1 = Math.min(height, Math.ceil((maxY + 1 + margin) / grid) * grid);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The `rect` of a `width`-wide frame, as its own straight RGBA. */
export function cropFrame(px, width, rect) {
  const out = Buffer.alloc(rect.w * rect.h * 4);
  const src = Buffer.isBuffer(px) ? px : Buffer.from(px.buffer, px.byteOffset, px.byteLength);
  for (let row = 0; row < rect.h; row++) {
    const from = ((rect.y + row) * width + rect.x) * 4;
    src.copy(out, row * rect.w * 4, from, from + rect.w * 4);
  }
  return out;
}

/** A cut put back where `rect` says, in an otherwise empty `width × height` frame. */
export function expandFrame(cut, rect, width, height) {
  const out = Buffer.alloc(width * height * 4);
  const src = Buffer.isBuffer(cut) ? cut : Buffer.from(cut.buffer, cut.byteOffset, cut.byteLength);
  for (let row = 0; row < rect.h; row++)
    src.copy(out, ((rect.y + row) * width + rect.x) * 4, row * rect.w * 4, (row + 1) * rect.w * 4);
  return out;
}
