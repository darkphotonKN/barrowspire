// A sheet's mean colour: what its art averages to on screen, for the manifest's `mean`
// (src/render/art/manifest.ts). Lighting measures a hostile's readability against the ground's
// mean rather than a flat token, because the ground is drawn from these tiles (FS-2325V §C.9).
//
// The average is taken in sRGB, weighted by alpha: the light-map multiplies and the vignette
// mixes in sRGB, both linear there, so lighting the mean equals the mean of the lit pixels.
// Transparent pixels (a tile's clear corners) carry no weight.

/**
 * @param {Buffer[]} frames RGBA pixels, straight alpha, one buffer per frame
 * @returns {{ r: number, g: number, b: number } | undefined} undefined when every pixel is clear
 */
export function meanColour(frames) {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (const px of frames)
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      r += px[i] * a;
      g += px[i + 1] * a;
      b += px[i + 2] * a;
      weight += a;
    }
  if (weight === 0) return undefined;
  return { r: Math.round(r / weight), g: Math.round(g / weight), b: Math.round(b / weight) };
}
