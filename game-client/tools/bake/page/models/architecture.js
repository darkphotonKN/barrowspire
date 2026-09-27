// Half-timbered wall pieces, corner posts and roof pieces. Every piece is exactly one tile along
// its axis (plus a hair of overlap so neighbours abut without a seam), with its origin at the
// centre of its footprint, so the scene lays a wall rect as a run of pieces one tile apart.

import * as THREE from "three";
import { fbm, rng, smoothstep, vnoise } from "../noise.js";
import { color, cssRgb, grey, mix, shade } from "../palette.js";
import { canvasTexture, materials, mkCanvas, pixelTexture, TONE } from "../materials.js";
import { part } from "./util.js";

/** Full-height (back) and cut-away (front) wall heights, in world units (tile edges). */
export const WALL_BACK = 3.6;
export const WALL_FRONT = 1.1;
/** Wall thickness and the overlap that hides the seam between neighbouring pieces. */
const THICK = 0.18;
const LENGTH = 1.024;

/** Torch sconce flame position on a back wall, model space (for the manifest light). */
export const SCONCE_FLAME = [0, 2.55, 0.31];
/** Front (cut-away) torch: a short cresset standing on the wall cap. */
export const CRESSET_FLAME = [0, WALL_FRONT + 0.34, 0];
/** Centre of the leaded window's glass on a back wall. */
export const WINDOW_GLASS = [0, 2.15, THICK / 2];

const PLASTER_A = mix("slateLight", "vellumFaint", 0.35);
const PLASTER_B = mix("vellumFaint", "barrowBrown", 0.3);
const PLINTH = mix("slate", "slateLight", 0.6);
const MORTAR = mix("charcoal", "slate", 0.3);
const BEAM = mix("barrowDeep", "charcoal", 0.25);
const BEAM_GRAIN = mix("charcoal", "pitch", 0.5);
const GLASS = "amber";
const GLASS_EMISSIVE = "amberBright";
const LEAD = "ink";

/** Plaster face with stone plinth, oak beams, and (variant) a brace or a leaded window. */
function wallTexture(H, variant, seed) {
  const W = 128;
  const Hp = Math.round(128 * H);
  const c = mkCanvas(W, Hp);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, Hp);
  const d = img.data;
  for (let y = 0; y < Hp; y++)
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 26 + seed * 7, y / 26, seed, 4);
      const st = fbm(x / 3 + seed, y / 70, seed + 3, 2);
      const sp = vnoise(x / 1.6, y / 1.6, seed + 5);
      const v = (0.78 + 0.32 * n) * (0.92 + 0.1 * sp) * (1 - 0.12 * st) * (1 - 0.25 * smoothstep(Hp * 0.55, Hp, y));
      const col = mix(PLASTER_A, PLASTER_B, smoothstep(0.55, 0.8, n));
      const i = (y * W + x) * 4;
      d[i] = col[0] * v;
      d[i + 1] = col[1] * v;
      d[i + 2] = col[2] * v;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);

  const R = rng(seed * 31 + 7);
  const plinth = Math.min(Hp, Math.round(0.6 * 128));
  const rowH = 19;
  ctx.fillStyle = cssRgb(MORTAR);
  ctx.fillRect(0, Hp - plinth, W, plinth);
  for (let y = Hp - plinth, row = 0; y < Hp; y += rowH, row++) {
    let x = -(row % 2) * 22 - R() * 10;
    while (x < W) {
      const bw = 34 + R() * 22;
      ctx.fillStyle = cssRgb(shade(PLINTH, 0.72 + R() * 0.34));
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, rowH - 3);
      ctx.fillStyle = cssRgb(grey(255), 0.09);
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, 2);
      ctx.fillStyle = cssRgb(grey(0), 0.28);
      ctx.fillRect(x + 1.5, y + rowH - 4, bw - 3, 2.5);
      x += bw;
    }
  }
  for (let i = 0; i < 700; i++) {
    const x = R() * W;
    const y = Hp - plinth + R() * plinth;
    ctx.fillStyle = R() > 0.5 ? cssRgb(grey(0), 0.25) : cssRgb(grey(255), 0.07);
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  for (let i = 0; i < 160; i++) {
    const x = R() * W;
    const y = Hp - R() * R() * plinth * 0.8;
    ctx.fillStyle = cssRgb(shade(TONE.moss, 1 + R() * 0.4), 0.35);
    ctx.fillRect(x, y, 2, 2);
  }

  const beam = (x, y, w, h) => {
    ctx.fillStyle = cssRgb(BEAM);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = cssRgb(BEAM_GRAIN, 0.55);
    ctx.lineWidth = 1;
    const along = w > h;
    for (let k = 0; k < (along ? h : w) / 2.5; k++) {
      ctx.beginPath();
      if (along) {
        const yy = y + 1 + k * 2.5 + R();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy + (R() - 0.5) * 2);
      } else {
        const xx = x + 1 + k * 2.5 + R();
        ctx.moveTo(xx, y);
        ctx.lineTo(xx + (R() - 0.5) * 2, y + h);
      }
      ctx.stroke();
    }
    ctx.fillStyle = cssRgb(mix("vellum", "amberBright", 0.3), 0.08);
    if (along) ctx.fillRect(x, y, w, 1);
    else ctx.fillRect(x, y, 1, h);
  };

  const top = Math.max(10, Hp - plinth - 12);
  if (H > 1.5) {
    beam(0, 0, 9, top);
    beam(W - 9, 0, 9, top);
    beam(0, 0, W, 10);
    beam(0, top, W, 12);
  } else {
    // Cut-away: only the sill beam survives above the plinth.
    beam(0, 0, W, 10);
  }
  if (H > 2) {
    const mid = Math.round(top * 0.46);
    beam(0, mid, W, 10);
    if (variant === "brace") {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(9, mid + 10);
      ctx.lineTo(22, mid + 10);
      ctx.lineTo(W - 9, top);
      ctx.lineTo(W - 22, top);
      ctx.closePath();
      ctx.clip();
      beam(0, mid, W, top - mid);
      ctx.restore();
    }
  }

  let em = null;
  if (variant === "window") {
    em = mkCanvas(W, Hp);
    const e = em.getContext("2d");
    e.fillStyle = cssRgb(grey(0));
    e.fillRect(0, 0, W, Hp);
    const x0 = 34;
    const x1 = 94;
    // Back walls carry the full window; a cut-away keeps the bottom row of panes above its sill.
    const y0 = H > 2 ? Math.round(Hp - 2.75 * 128) : 12;
    const y1 = H > 2 ? Math.round(Hp - 1.55 * 128) : 12 + Math.round(0.28 * 128);
    const rows = H > 2 ? 5 : 1;
    beam(x0 - 7, y0 - 7, x1 - x0 + 14, y1 - y0 + 14);
    const cols = 3;
    const pw = (x1 - x0) / cols;
    const ph = (y1 - y0) / rows;
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < cols; q++) {
        const t = 0.7 + R() * 0.35;
        const px = x0 + q * pw;
        const py = y0 + r * ph;
        ctx.fillStyle = cssRgb(shade(GLASS, t));
        ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
        e.fillStyle = cssRgb(shade(GLASS_EMISSIVE, t * 0.8));
        e.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      }
    ctx.strokeStyle = cssRgb(LEAD);
    ctx.lineWidth = 2;
    for (let q = 0; q <= cols; q++) {
      ctx.beginPath();
      ctx.moveTo(x0 + q * pw, y0);
      ctx.lineTo(x0 + q * pw, y1);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + r * ph);
      ctx.lineTo(x1, y0 + r * ph);
      ctx.stroke();
    }
  }
  return { map: canvasTexture(c), em: em ? canvasTexture(em) : null };
}

/**
 * One tile of wall. `variant` is plain | brace | window | torch; `axis` x runs along world x
 * (faces ±y), y runs along world y (faces ±x). Its origin is the centre of its footprint.
 */
export function wallPiece(H, variant, axis, seed) {
  const M = materials();
  const t = wallTexture(H, variant, seed);
  const face = new THREE.MeshStandardMaterial({
    map: t.map,
    bumpMap: t.map,
    bumpScale: 0.6,
    roughness: 0.92,
    emissive: color(grey(t.em ? 255 : 0)),
    emissiveMap: t.em,
    emissiveIntensity: 1.3,
  });
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(LENGTH, H, THICK), [M.cap, M.cap, M.cap, M.cap, face, face], { y: H / 2 }));
  g.add(part(new THREE.BoxGeometry(LENGTH, 0.1, 0.26), M.cap, { y: H + 0.05 }));
  if (variant === "torch") {
    if (H > 2) {
      g.add(part(new THREE.BoxGeometry(0.04, 0.04, 0.18), M.iron, { y: 2.2, z: 0.17 }));
      g.add(part(new THREE.CylinderGeometry(0.028, 0.02, 0.36, 8), M.woodDark, { y: 2.32, z: 0.26, rx: 0.35 }));
      g.add(part(new THREE.ConeGeometry(0.055, 0.16, 8), M.flame, { x: SCONCE_FLAME[0], y: SCONCE_FLAME[1], z: SCONCE_FLAME[2] }));
    } else {
      g.add(part(new THREE.CylinderGeometry(0.07, 0.04, 0.16, 8, 1, true), M.ironDouble, { y: H + 0.18 }));
      g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), M.iron, { y: H + 0.1 }));
      g.add(part(new THREE.SphereGeometry(0.05, 6, 5), M.coal, { y: H + 0.24 }));
      g.add(part(new THREE.ConeGeometry(0.06, 0.18, 8), M.flame, { y: CRESSET_FLAME[1] }));
    }
  }
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/** A corner post: the square oak upright where two wall runs meet. */
export function post(H) {
  const M = materials();
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.24, H + 0.12, 0.24), M.beam, { y: (H + 0.12) / 2 }));
  g.add(part(new THREE.BoxGeometry(0.3, 0.08, 0.3), M.cap, { y: H + 0.16 }));
  return g;
}

// ── Roofs ────────────────────────────────────────────────────────────────────────
//
// A roof is laid as rows of one-tile slope pieces climbing from the eave to the ridge, each row
// ROOF_RISE higher than the last, capped by ridge pieces. A slope piece's origin is the centre of
// its footprint at its LOW edge's height; the scene lifts row k by k·ROOF_RISE (screen:
// k·ROOF_RISE·VPX px). `facing` names the downhill side in world terms: s = +y, e = +x.

export const ROOF_RISE = 0.7;
const ROOF_THICK = 0.09;

let SHINGLE = null;
function shingleMaterial() {
  if (SHINGLE) return SHINGLE;
  const base = mix("slate", "barrowDeep", 0.35);
  const tex = pixelTexture(128, 128, (x, y) => {
    const row = Math.floor(y / 16);
    const col = Math.floor((x + (row % 2) * 10) / 20);
    const fy = (y % 16) / 16;
    const edge = fy > 0.86 ? 0.45 : 1;
    const gap = (x + (row % 2) * 10) % 20 < 1.5 ? 0.5 : 1;
    const tone = 0.7 + 0.35 * fbm(col * 3.1 + row * 7.7, row, 51, 1) + 0.2 * fbm(x / 9, y / 9, 52, 3);
    const moss = smoothstep(0.62, 0.78, fbm(x / 40, y / 40, 53, 3));
    return mix(shade(base, tone * edge * gap * (1 - 0.25 * fy)), shade("arcaneDeep", tone), moss * 0.5);
  });
  SHINGLE = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.8, roughness: 0.9 });
  return SHINGLE;
}

const FACING_YAW = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

/** One tile of roof slope, descending toward `facing`. */
export function roofSlope(facing) {
  const pitch = Math.atan2(ROOF_RISE, 1);
  const len = Math.hypot(1, ROOF_RISE) + 0.04;
  const g = new THREE.Group();
  const slab = part(new THREE.BoxGeometry(LENGTH, ROOF_THICK, len), shingleMaterial(), {
    y: ROOF_RISE / 2 + ROOF_THICK / 2,
    rx: pitch,
  });
  g.add(slab);
  const inner = new THREE.Group();
  inner.add(g);
  inner.rotation.y = FACING_YAW[facing];
  return inner;
}

/** Ridge cap along the named world axis, sitting on the top of the highest slope row. */
export function roofRidge(axis) {
  const M = materials();
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(LENGTH, 0.14, 0.26), M.beam, { y: 0.07 }));
  g.add(part(new THREE.BoxGeometry(LENGTH, 0.06, 0.34), M.cap, { y: 0.16 }));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}
