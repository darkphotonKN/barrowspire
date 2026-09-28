// Every colour the bake authors comes from BARROW (src/utils/theme.ts, ADR-0013), served to
// this page transpiled as /theme.js. Shades and blends are derived from the tokens, never typed
// in, so art and UI stay one ramp. The only non-token values are neutral luminance (grey(v)),
// used for masks and multipliers that carry no hue.

import * as THREE from "three";
import { BARROW } from "/theme.js";

/** A BARROW token as [r, g, b] in 0..255 sRGB. */
export function rgb(token) {
  const hex = BARROW[token];
  if (!hex) throw new Error(`palette: unknown BARROW token "${token}"`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const asRgb = (c) => (typeof c === "string" ? rgb(c) : c);

/** Blend two colours (tokens or rgb triples). */
export function mix(a, b, t) {
  const x = asRgb(a);
  const y = asRgb(b);
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}

/** Scale brightness (v < 1 darkens, v > 1 lifts; the result may exceed 255 and is clamped on use). */
export function shade(c, v) {
  const x = asRgb(c);
  return [x[0] * v, x[1] * v, x[2] * v];
}

/** Keep the hue, lift the brightest channel to 255: a token's hue as a light colour. */
export function normalized(c) {
  const x = asRgb(c);
  const m = Math.max(x[0], x[1], x[2], 1);
  return shade(x, 255 / m);
}

/** Neutral luminance for masks and multipliers; no hue, so not a palette colour. */
export const grey = (v) => [v, v, v];

export const cssRgb = (c, a = 1) => {
  const x = asRgb(c).map((v) => Math.round(Math.min(255, Math.max(0, v))));
  return a >= 1 ? `rgb(${x[0]},${x[1]},${x[2]})` : `rgba(${x[0]},${x[1]},${x[2]},${a})`;
};

/** A three.js colour (linear working space) from a token or rgb triple. */
export function color(c) {
  const x = asRgb(c).map((v) => Math.min(255, Math.max(0, v)) / 255);
  return new THREE.Color().setRGB(x[0], x[1], x[2], THREE.SRGBColorSpace);
}
