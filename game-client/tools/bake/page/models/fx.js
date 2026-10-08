// Effect textures (FS-KYPQ9 §B.10), authored in code (ADR-0021): the baked textures the effects
// module (src/render/effects/) plays over. Nothing here is sourced, and nothing is drawn at
// runtime but these frames.
//
// Unlike the props these are not rendered through three.js. A smear, a mote of dust or a pool
// of pale light has no form for a camera to light, so each texture is shaded per pixel here,
// like the ground tiles (ground.js), and supersampled down to 1× by `raster`. Pure arithmetic
// on seeded noise, so a re-bake is byte-identical (FS-KYPQ9 §0.6).
//
// Two kinds of texture:
//  - **Tint-taking** (slash, dust, ember, smoke, scorch, glow, escape column): neutral
//    luminance (palette.js `grey`, no hue), so the runtime's multiply tint puts a `BARROW` token
//    on them (fx_slash `vellum`, fx_glow `amber`, fx_scorch `pitch`...). Their grit lives in
//    the luminance, so a tinted effect is never a flat fill.
//  - **Coloured** (fire core, arrow): the colour is the object's own, from `BARROW` tokens.
//    fx_fire_core runs `ember` → `amberBright` (FS-KYPQ9 §E.2); fx_arrow is wood, iron and
//    feather.
//
// World-plane textures (slash, scorch, glow) are drawn top-down in world px: the runtime lays
// them on `addWorldPlane`, which turns them onto the isometric ground. Upright textures (dust,
// ember, smoke, fire core, escape column, arrow) are in screen px.
//
// Look (guideline Part I): dark and grounded. No hard rings, no halos, no white: the brightest
// value in a tint-taking texture is a multiplier, never a colour, and fire tops out at
// `amberBright`.

import { clamp, fbm, rng, smoothstep, vnoise } from "../noise.js";
import { grey, mix, rgb, shade } from "../palette.js";

/**
 * Rasterises a w × h texture: `paint(x, y)` (pixel space, y down) is sampled on an ss × ss grid
 * inside each pixel and returns null (empty) or [r, g, b, a] with rgb 0..255 and a 0..1. Samples
 * average in premultiplied alpha; the result is straight-alpha RGBA bytes, like the baker's
 * frames.
 */
export function raster(w, h, paint, ss = 4) {
  const out = new Uint8ClampedArray(w * h * 4);
  const n = ss * ss;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < ss; j++)
        for (let i = 0; i < ss; i++) {
          const c = paint(x + (i + 0.5) / ss, y + (j + 0.5) / ss);
          if (!c || c[3] <= 0) continue;
          const ca = Math.min(1, c[3]);
          r += c[0] * ca;
          g += c[1] * ca;
          b += c[2] * ca;
          a += ca;
        }
      if (a <= 0) continue;
      const o = (y * w + x) * 4;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round((a / n) * 255);
    }
  return out;
}

/** A neutral multiplier (no hue) at luminance v, with alpha a. */
const lum = (v, a) => [...grey(clamp(v, 0, 255)), a];
const withAlpha = (c, a) => [c[0], c[1], c[2], a];

/**
 * fx_slash: a steel smear on the ground (§D.1). Top-down, the delver at the pivot (the
 * anchor), the arc facing +x. It sweeps from the top end (the tail, thin and broken) to the
 * bottom end (the leading edge, heavy and crisp); the runtime rotates it to the target and
 * flips it for the other hand. A broad, near-solid band with a bright cutting lip on its outer
 * edge, so it reads as a weighty smear at 1× under the dark of the barrow.
 */
export const SLASH = { width: 64, height: 88, pivot: [4, 44] };
const SLASH_ARC = 0.9; // half the arc, radians
export function slash(seed = 41) {
  const [px, py] = SLASH.pivot;
  return raster(SLASH.width, SLASH.height, (x, y) => {
    const dx = x - px;
    const dy = y - py;
    const ang = Math.atan2(dy, dx);
    if (Math.abs(ang) > SLASH_ARC) return null;
    const u = (ang + SLASH_ARC) / (2 * SLASH_ARC); // 0 tail → 1 leading edge
    const r = Math.hypot(dx, dy);
    const streak = vnoise(r * 1.3, u * 2.5, seed); // concentric striations, as a blade drags
    const grit = vnoise(r * 3.1, u * 19, seed + 1);
    // the band thickens toward the leading edge and rounds off at its tip
    const half = (2.5 + 12.5 * Math.pow(u, 1.15)) * smoothstep(1.0, 0.95, u);
    if (half <= 0) return null;
    const q = (r - (36 + 4 * u)) / half; // -1 inner edge, +1 outer edge
    if (q < -1.3 || q > 1.1) return null;
    // feathered inside, crisp outside: the edge that cut
    const across = smoothstep(-1.3, 0.0, q) * smoothstep(1.1, 0.75, q);
    // the tail breaks up into streaks; the leading edge is solid
    const along = smoothstep(0.0, 0.4, u + 0.3 * (streak - 0.5));
    const a = across * along * (0.8 + 0.2 * streak) * (0.9 + 0.1 * grit);
    const edge = smoothstep(0.05, 0.6, q) * smoothstep(1.1, 0.8, q); // the bright cutting lip
    return lum(200 + 45 * edge + 18 * streak + 10 * (grit - 0.5), a);
  });
}

/**
 * The key light in texture space, toward the light (x right, y down, z to the viewer): from
 * screen-left and above, as the baker's sun.
 */
export const LIGHT = (() => {
  const l = [-0.55, -0.65, 0.52];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

/**
 * A soft, lumpy puff in a size × size frame: overlapping lobes, eroded by noise, lit from the
 * key light's side so it has a little body. Shared by dust and smoke.
 */
function puff(size, seed, { lobes, spread, radius, erode, opacity, low, high }) {
  const next = rng(seed);
  const c = size / 2;
  const blobs = Array.from({ length: lobes }, () => {
    const a = next() * Math.PI * 2;
    const d = next() * spread;
    return { x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, r: radius * (0.7 + 0.3 * next()) };
  });
  return raster(size, size, (x, y) => {
    let dens = 0;
    let lit = 0;
    for (const b of blobs) {
      const dx = (x - b.x) / b.r;
      const dy = (y - b.y) / b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const w = (1 - d2) * (1 - d2);
      dens += w;
      // a sphere's normal: how much this lobe faces the light
      const nz = Math.sqrt(1 - d2);
      lit += w * clamp(dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2], 0, 1);
    }
    if (dens <= 0) return null;
    const n = fbm(x / size * 3.2, y / size * 3.2, seed + 3, 3);
    const a = smoothstep(0.08, 0.7, dens - erode * (n - 0.35));
    if (a <= 0) return null;
    const shadeV = lit / dens;
    return lum(low + (high - low) * shadeV + 18 * (n - 0.5), a * opacity);
  });
}

/** fx_dust: a mote of kicked-up dust, in three variants (§D, §F, §G). */
export const DUST = { size: 16, seeds: [51, 52, 53] };
export const dust = (seed) =>
  puff(DUST.size, seed, { lobes: 5, spread: 3, radius: 4, erode: 1.3, opacity: 0.8, low: 175, high: 230 });

/** fx_smoke: a billow of smoke, in three variants (chimney smoke, fireball trail). */
export const SMOKE = { size: 32, seeds: [61, 62, 63] };
export const smoke = (seed) =>
  puff(SMOKE.size, seed, { lobes: 6, spread: 6, radius: 8.5, erode: 1.1, opacity: 0.75, low: 140, high: 230 });

/** fx_ember: a small hot fleck, in three variants: a bright core that falls off fast. */
export const EMBER = { size: 8, seeds: [71, 72, 73] };
export function ember(seed) {
  const next = rng(seed);
  const a = next() * Math.PI;
  const stretch = 1.2 + next() * 0.6;
  const c = EMBER.size / 2;
  return raster(EMBER.size, EMBER.size, (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const u = (dx * Math.cos(a) + dy * Math.sin(a)) / stretch;
    const v = -dx * Math.sin(a) + dy * Math.cos(a);
    const d2 = u * u + v * v;
    const core = Math.exp(-d2 / 1.1);
    const tail = Math.exp(-d2 / 4.5) * 0.35;
    const al = clamp(core + tail, 0, 1);
    if (al < 0.01) return null;
    return lum(200 + 55 * core, al);
  });
}

/**
 * fx_fire_core: the fireball's core (§E.2), coloured in the bake: `amberBright` at the heart,
 * `ember` toward the edge. A burning ball with ragged tongues licking up off it (a flame, not a
 * disc): a core, four tapering, curling tongues 4–5 px long merged into it, and noise along the
 * whole edge, with a narrow falloff. Steady: one frame, never pulsed.
 */
export const FIRE_CORE = { size: 28 };
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};
/** A tongue: from (ax, ay) on the core out to its tip, r0 → r1 thick, bowed sideways by bend. */
function tongue(ax, ay, angle, len, r0, r1, bend) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return (x, y) => {
    let px = x - ax;
    let py = y - ay;
    const along = clamp(px * ux + py * uy, 0, len);
    const t = along / len;
    // the spine curls to one side toward the tip
    const side = bend * t * t;
    px -= -uy * side;
    py -= ux * side;
    const qx = px - ux * along;
    const qy = py - uy * along;
    return Math.hypot(qx, qy) - (r0 + (r1 - r0) * t);
  };
}
export function fireCore(seed = 81) {
  const [cx, cy] = [14, 16];
  const next = rng(seed);
  const core = (x, y) => Math.hypot(x - cx, y - cy) - 6.2;
  // [angle, length]: uneven, the tallest just off centre, so it never reads as a crown
  const tongues = [
    [-2.3, 3.4],
    [-1.72, 5.4],
    [-1.3, 4.4],
    [-0.8, 2.9],
  ].map(([a, len]) => {
    const angle = a + (next() - 0.5) * 0.2;
    const bend = (next() < 0.5 ? -1 : 1) * (1.5 + next() * 1.5);
    return tongue(cx + Math.cos(angle) * 4.5, cy + Math.sin(angle) * 4.5, angle, len + 2, 2.4, 0.5, bend);
  });
  const hot = mix("amberBright", "ember", 0.15);
  const dark = shade("ember", 0.55);
  return raster(FIRE_CORE.size, FIRE_CORE.size, (x, y) => {
    let d = core(x, y);
    for (const t of tongues) d = smin(d, t(x, y), 1.6);
    // ragged edge: flame flickers in and out by up to a pixel
    d += 1.1 * (fbm(x * 0.35, y * 0.35, seed + 4, 3) - 0.5);
    if (d > 0.7) return null;
    const grain = vnoise(x * 0.9, y * 0.9, seed + 2);
    const heat = clamp(-d / 5.5 + 0.12 * (grain - 0.5), 0, 1);
    let col = mix(dark, "ember", smoothstep(0.0, 0.3, heat));
    col = mix(col, hot, smoothstep(0.3, 0.65, heat));
    col = mix(col, "amberBright", smoothstep(0.65, 0.95, heat));
    const al = smoothstep(0.7, -0.6, d) * (0.92 + 0.08 * grain);
    return withAlpha(col, al);
  });
}

/** fx_scorch: a ragged burn mark on the ground (§E.3), top-down; darker at the heart. */
export const SCORCH = { size: 56 };
export function scorch(seed = 91) {
  const c = SCORCH.size / 2;
  return raster(SCORCH.size, SCORCH.size, (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const th = Math.atan2(dy, dx);
    // splash rays: some directions reach further, as fire throws soot
    const ray = fbm(Math.cos(th) * 2.4 + 9, Math.sin(th) * 2.4 + 9, seed, 3);
    const warp = fbm(x * 0.12, y * 0.12, seed + 1, 3);
    const d = Math.hypot(dx, dy) / (16.5 * (0.75 + 0.6 * ray) * (0.85 + 0.3 * warp));
    if (d > 1.05) return null;
    const ash = vnoise(x * 0.7, y * 0.7, seed + 2);
    const a = smoothstep(1.05, 0.3, d) * (0.8 + 0.2 * ash);
    return lum(100 + 100 * d + 30 * (ash - 0.5), a);
  });
}

/**
 * fx_glow: a soft pool of light on the ground (§H.1, the entrance marker), top-down. A smooth
 * falloff with no edge and no ring; a faint grain keeps it from banding under a tint.
 */
export const GLOW = { size: 64 };
export function glow(seed = 101) {
  const c = GLOW.size / 2;
  return raster(GLOW.size, GLOW.size, (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const wob = fbm(x * 0.08, y * 0.08, seed, 2);
    const d = Math.hypot(dx, dy) / (30 * (0.94 + 0.08 * wob));
    if (d >= 1) return null;
    const k = 1 - d * d;
    const grain = vnoise(x * 0.8, y * 0.8, seed + 1);
    return lum(238 + 14 * (grain - 0.5), k * k * 0.9);
  });
}

/**
 * fx_escape_column: a quiet column of pale light where a delver leaves (§G.3), upright: a
 * faint pool at the feet (the anchor) and a soft shaft fading upward, with slow vertical
 * striations. No rays, no sparkle.
 */
export const ESCAPE_COLUMN = { width: 40, height: 120, base: [20, 112] };
export function escapeColumn(seed = 111) {
  const [bx, by] = ESCAPE_COLUMN.base;
  return raster(ESCAPE_COLUMN.width, ESCAPE_COLUMN.height, (x, y) => {
    const dx = x - bx;
    const up = by - y; // px above the ground
    const pool = Math.exp(-((dx / 13) ** 2) - ((up / 5) ** 2)) * 0.35;
    const streak = vnoise(dx * 0.5, y * 0.035, seed);
    const shaft =
      (Math.exp(-((dx / 6.5) ** 2)) * 0.8 + Math.exp(-((dx / 13) ** 2)) * 0.25) *
      smoothstep(-4, 8, up) *
      smoothstep(108, 40, up) *
      (0.6 + 0.4 * streak);
    const a = clamp(pool + shaft, 0, 0.8);
    if (a < 0.004) return null;
    return lum(225 + 25 * streak, a);
  });
}

/**
 * fx_arrow: an arrow side-on (§F.2), pointing +x, at the scale of the hex arrow it replaces:
 * a pale ash shaft, a leaf-shaped iron head with a bright edge, two pale fletching vanes and a
 * dark nock, light enough to read at 1× over the run's dark ground. Behind the nock a very
 * faint, short air-streak (`vellum`, tapering to nothing) goes with the arrow: a thin line, no
 * glow. The anchor is the pivot the runtime rotates about. Coloured, not tinted.
 */
export const ARROW = { width: 56, height: 10, pivot: [36, 5] };
const STREAK = 24; // px of air-streak behind the nock
export function arrow(seed = 121) {
  const cy = ARROW.pivot[1];
  const wood = mix("vellumDark", "vellum", 0.25);
  const iron = mix("slateLight", "vellumDark", 0.35);
  const feather = mix("vellumDark", "vellum", 0.55);
  const nock = shade("barrowDeep", 0.8);
  /** A cylinder across y lit from above: 1.15 on top, 0.55 underneath. */
  const roll = (v) => 0.85 - 0.3 * clamp(v, -1, 1);
  return raster(ARROW.width, ARROW.height, (px, y) => {
    const x = px - STREAK; // the arrow's own frame: nock at x 0.5, point at x 31
    const v = y - cy;
    // iron head: a leaf from the socket (x 22) to the point (x 31)
    if (x >= 21.5 && x <= 31) {
      const t = (x - 21.5) / 9.5;
      const halfW = 2.7 * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.15 * t);
      if (Math.abs(v) <= Math.max(halfW, x < 23 ? 1.15 : 0)) {
        const upper = v < 0;
        const ridge = 1 - smoothstep(0, 0.6, Math.abs(v));
        const c = shade(iron, (upper ? 1.35 : 0.8) + 0.45 * ridge);
        return withAlpha(c, 1);
      }
    }
    // shaft
    if (x >= 1.5 && x <= 22.5 && Math.abs(v) <= 0.95) {
      const g = vnoise(x * 0.6, y * 4, seed);
      return withAlpha(shade(wood, roll(v / 0.95) * (0.9 + 0.2 * g)), 1);
    }
    // nock
    if (x >= 0.5 && x < 1.5 && Math.abs(v) <= 1.1) return withAlpha(nock, 1);
    // fletching: two vanes, top and bottom, swept back toward the nock
    if (x >= 2.2 && x <= 10) {
      // a vane rises from the shaft at the front and is cut square at the back
      const h = 2.9 * Math.pow(smoothstep(10, 3.2, x), 0.8);
      const av = Math.abs(v);
      if (av > 0.6 && av <= 0.6 + h) {
        const barb = 0.5 + 0.5 * Math.sin((x + av * 1.4) * 3.2); // barbs angled back
        const top = v < 0;
        const c = shade(feather, (top ? 1.05 : 0.8) * (0.85 + 0.2 * barb));
        const edge = smoothstep(0.6 + h, 0.6 + h - 0.5, av);
        return withAlpha(c, edge);
      }
    }
    // the air-streak: a hairline behind the nock, fading out over STREAK px
    if (x < 0.5 && x >= -STREAK && Math.abs(v) <= 0.8) {
      const fade = smoothstep(-STREAK, 0.5, x);
      const across = smoothstep(0.8, 0.1, Math.abs(v));
      return withAlpha(rgb("vellum"), 0.5 * fade * across);
    }
    return null;
  });
}

/**
 * Every effect texture the bake emits, as the catalogue reads them: sheet name, authoring
 * function, frame size, anchor, and one builder per frame (variants where a sheet has several).
 */
export const FX_TEXTURES = [
  {
    name: "fx_slash",
    fn: "slash",
    width: SLASH.width,
    height: SLASH.height,
    anchor: { x: SLASH.pivot[0] / SLASH.width, y: SLASH.pivot[1] / SLASH.height },
    frames: [() => slash()],
  },
  ...[
    ["fx_dust", "dust", DUST, dust],
    ["fx_ember", "ember", EMBER, ember],
    ["fx_smoke", "smoke", SMOKE, smoke],
  ].map(([name, fn, spec, build]) => ({
    name,
    fn,
    width: spec.size,
    height: spec.size,
    anchor: { x: 0.5, y: 0.5 },
    frames: spec.seeds.map((s) => () => build(s)),
  })),
  ...[
    ["fx_fire_core", "fireCore", FIRE_CORE, fireCore],
    ["fx_scorch", "scorch", SCORCH, scorch],
    ["fx_glow", "glow", GLOW, glow],
  ].map(([name, fn, spec, build]) => ({
    name,
    fn,
    width: spec.size,
    height: spec.size,
    anchor: { x: 0.5, y: 0.5 },
    frames: [() => build()],
  })),
  {
    name: "fx_escape_column",
    fn: "escapeColumn",
    width: ESCAPE_COLUMN.width,
    height: ESCAPE_COLUMN.height,
    anchor: {
      x: ESCAPE_COLUMN.base[0] / ESCAPE_COLUMN.width,
      y: ESCAPE_COLUMN.base[1] / ESCAPE_COLUMN.height,
    },
    frames: [() => escapeColumn()],
  },
  {
    name: "fx_arrow",
    fn: "arrow",
    width: ARROW.width,
    height: ARROW.height,
    anchor: { x: ARROW.pivot[0] / ARROW.width, y: ARROW.pivot[1] / ARROW.height },
    frames: [() => arrow()],
  },
];
