// The tower interior (FS-8RBQY §D, §E): masonry partition walls and posts, the tower's thick
// outer (perimeter) wall with its arrow slits, the run's floor dressing, and the spiral stairs.
// Authored in code (ADR-0021), on the same camera, key light and scale as the shipped world
// sheets: one three.js unit is one tile edge, +x is world +x, +z is world +y, +y is up, and each
// model's origin is the centre of its footprint.
//
// Partition pieces stand in for today's timber `wall_*`/`post_*` (architecture.js) through the
// same cutWall geometry, so each one carries the timber piece it replaces as an invisible frame
// guide: the bake frames a sheet by its models' bounds, and the guide pins those bounds, so a
// tower piece's frame size and anchor equal the timber piece's. Everything visible stays inside
// the guide's bounds and its shadow's.

import * as THREE from "three";
import { fbm, hash2, rng, smoothstep, vnoise, vnoise3 } from "../noise.js";
import { color, cssRgb, grey, mix, normalized, shade } from "../palette.js";
import { canvasTexture, glow, materials, mkCanvas, pixelTexture, plain, textured } from "../materials.js";
import { part, rod, scaled, V3 } from "./util.js";
import { post, SCONCE_FLAME, wallPiece } from "./architecture.js";

/** A piece is one tile along its axis plus the hair of overlap the timber pieces use. */
const LENGTH = 1.024;
/** Partition masonry depth: inside the timber cap's 0.26, which bounds the frame. */
const P_THICK = 0.24;
/** The outer wall: thicker and taller than a partition. */
export const PERIMETER_BACK = 4.6;
export const PERIMETER_FRONT = 0.78;
const PER_THICK = 0.62;

/** The arrow slit's opening on the inner face, model space (for the manifest light). */
export const SLIT_LIGHT = [0, 2.2, PER_THICK / 2 + 0.02];
/** Where the stairs' warm pool sits: among its lowest treads, so it lights them and the foot. */
export const STAIRS_LIGHT = [0.2, 1.0, 0.3];

/** Texture px per tile edge on a wall face. */
const PX = 128;

// ── Palette (BARROW blends only) ─────────────────────────────────────────────────
const STONE_LO = mix("slate", "barrowDeep", 0.4);
const STONE_MID = mix("slate", "barrowBrown", 0.32);
const STONE_HI = mix("slateLight", "vellumFaint", 0.32);
const MORTAR = mix("charcoal", "barrowDeep", 0.45);
const GRIME = mix("charcoal", "barrowDeep", 0.6);
const MOSS = mix("arcaneDeep", "barrowDeep", 0.35);
const DAMP = mix("slate", "necrotic", 0.2);
const RUBBLE_CORE = mix("charcoal", "barrowBrown", 0.25);
const COLD_LIGHT = normalized(mix("necrotic", "vellum", 0.35));
const BANNER_FIELD = mix("oxblood", "barrowDeep", 0.3);
const BANNER_BORDER = mix("brass", "barrowBrown", 0.45);
const BANNER_DEVICE = mix("vellumDark", "barrowBrown", 0.35);
const WEB = mix("vellum", "slateLight", 0.3);
const BONE_OLD = mix("vellumDark", "barrowBrown", 0.2);
const OLD_WOOD = mix("barrowBrown", "slate", 0.35);
const ROOT = mix("barrowBrown", "vellumDark", 0.12);

// ── Masonry texture ──────────────────────────────────────────────────────────────

/** Course heights from the ground up, fixed by `key` (never the seed), so pieces line up. */
function coursesOf(Hp, [lo, hi], key) {
  const out = [];
  let y = 0;
  for (let k = 0; y < Hp; k++) {
    const h = Math.round(lo + (hi - lo) * hash2(k, 0, key));
    out.push({ k, y0: y, y1: y + h });
    y += h;
  }
  return out;
}

/** Block joints across one period `W` of course `k`, fixed by `key`. */
function jointsOf(W, [lo, hi], k, key) {
  const ws = [];
  let sum = 0;
  for (let i = 0; sum < W; i++) {
    const w = lo + (hi - lo) * hash2(k, i, key + 1);
    ws.push(w);
    sum += w;
  }
  const s = W / sum;
  const xs = [];
  let x = 0;
  for (const w of ws) {
    xs.push(x);
    x += w * s;
  }
  xs.push(W);
  return { xs, shift: hash2(k, 0, key + 2) * W };
}

/**
 * A coursed-masonry face, colour and bump, `width` × `height` px with the ground at the bottom.
 * The joints are periodic in `width`, so neighbouring pieces carry on each other's courses.
 * Options: course/block px ranges, `key` (layout), `seed` (wear only), `fade` [from, to] in
 * tile edges (darkens toward the top), `soot` [{ x, y, r }] px from the ground, `moss` 0..1,
 * `damp` 0..1, `grime` 0..1 (at the foot).
 */
function masonry(width, height, o = {}) {
  const W = width;
  const Hp = height;
  const key = o.key ?? 5100;
  const seed = o.seed ?? 1;
  const courses = coursesOf(Hp, o.course ?? [26, 40], key);
  const rows = courses.map((c) => jointsOf(W, o.block ?? [44, 96], c.k, key));
  const rowAt = new Int16Array(Hp);
  for (const c of courses) for (let y = c.y0; y < Math.min(c.y1, Hp); y++) rowAt[y] = c.k;

  const col = mkCanvas(W, Hp);
  const bmp = mkCanvas(W, Hp);
  const ci = col.getContext("2d").createImageData(W, Hp);
  const bi = bmp.getContext("2d").createImageData(W, Hp);
  const d = ci.data;
  const b = bi.data;
  const R = rng(seed * 97 + 13);
  // a few spalled or cracked blocks per face, away from the piece's ends
  const flaws = Array.from({ length: o.flaws ?? 3 }, () => ({ x: 14 + R() * (W - 28), y: R() * Hp * 0.85 }));
  const per = Math.round(W / 16);
  for (let y = 0; y < Hp; y++) {
    const yb = Hp - 1 - y;
    const c = courses[rowAt[yb]];
    const row = rows[rowAt[yb]];
    for (let x = 0; x < W; x++) {
      const uu = (((x + row.shift) % W) + W) % W;
      let i = 0;
      while (uu >= row.xs[i + 1]) i++;
      const dx = Math.min(uu - row.xs[i], row.xs[i + 1] - uu);
      const dy = Math.min(yb - c.y0, c.y1 - 1 - yb) + 0.5;
      const chip = (vnoise(x / 4, yb / 4, key + 11, per / 4) - 0.5) * 3.4 + (vnoise(x / 1.7, yb / 1.7, key + 12) - 0.5) * 1.3;
      const e = Math.min(dx, dy) + chip;
      const id = hash2(c.k, i, key + 3);
      const mottle = fbm((x * 6) / W, (yb * 6) / W, key + 13, 3, 6);
      const grain = vnoise(x / 1.4, yb / 1.4, key + 14);
      let tone = (o.lift ?? 1) * (0.76 + 0.3 * id) * (0.8 + 0.34 * mottle) * (0.93 + 0.1 * grain);
      let colr = mix(STONE_LO, STONE_MID, smoothstep(0.1, 0.7, id * 0.8 + mottle * 0.4));
      if (id > 0.88) colr = mix(colr, STONE_HI, 0.35);
      // a block face is a little proud of its neighbours at the centre: the pillow
      const pillow = smoothstep(0, 9, e);
      tone *= 0.82 + 0.18 * pillow;
      let px = shade(colr, tone);
      // wear seeded per variant, kept off the piece's ends so neighbours always meet
      const inner = smoothstep(4, 18, Math.min(x, W - 1 - x));
      let crack = 0;
      for (const f of flaws) {
        const fd = Math.hypot(x - f.x, (yb - f.y) * 0.8);
        if (fd < 26) {
          const line = Math.abs(fbm(x / 9 + f.x, yb / 9, seed + 21, 3) - 0.5);
          crack = Math.max(crack, (1 - smoothstep(0.006, 0.02, line)) * (1 - fd / 26) * inner);
        }
      }
      // damp streaks from the top, grime and moss at the foot
      const streak = smoothstep(0.58, 0.82, vnoise((x * 16) / W, yb / 70, key + 15, 16));
      px = mix(px, DAMP, (o.damp ?? 0.4) * 0.4 * streak);
      const foot = 1 - smoothstep(0, PX * 0.8, yb);
      px = mix(px, GRIME, (o.grime ?? 0.6) * foot * foot);
      if (o.moss && yb < PX * 1.1) {
        const m = smoothstep(0.55, 0.75, fbm(x / 10, yb / 10, seed + 23, 3)) * (1 - yb / (PX * 1.1)) * inner;
        px = mix(px, MOSS, o.moss * m * 0.8);
      }
      // mortar: dark and recessed
      const mortar = 1 - smoothstep(0.8, 2.2, e);
      px = mix(px, shade(MORTAR, 0.9 + 0.2 * grain), mortar);
      px = mix(px, GRIME, crack * 0.8);
      for (const s of o.soot ?? []) {
        const sx = (x - s.x) / (s.r * 0.55);
        const sy = (yb - s.y - s.r * 0.9) / (s.r * 1.3);
        const sd = sx * sx + sy * sy;
        if (sd < 1 && yb > s.y - 6) px = mix(px, grey(8), 0.82 * (1 - sd) * (1 - sd));
      }
      if (o.fade) {
        const k = smoothstep(o.fade[0] * PX, o.fade[1] * PX, yb);
        px = shade(px, 1 - 0.86 * k);
      }
      const n = (y * W + x) * 4;
      d[n] = px[0];
      d[n + 1] = px[1];
      d[n + 2] = px[2];
      d[n + 3] = 255;
      const h = 255 * (0.2 + 0.62 * pillow + 0.18 * mottle - 0.35 * crack);
      b[n] = b[n + 1] = b[n + 2] = Math.max(0, Math.min(255, h));
      b[n + 3] = 255;
    }
  }
  col.getContext("2d").putImageData(ci, 0, 0);
  bmp.getContext("2d").putImageData(bi, 0, 0);
  return { map: canvasTexture(col), bump: canvasTexture(bmp) };
}

const stoneMat = (t, o = {}) =>
  new THREE.MeshStandardMaterial({
    map: t.map,
    bumpMap: t.bump,
    bumpScale: o.bump ?? 1.2,
    roughness: 0.94,
    side: o.side ?? THREE.FrontSide,
    vertexColors: !!o.vc,
  });

let TOWER = null;

/** The tower's shared materials, built once per bake (seeded, so deterministic). */
function towerMaterials() {
  if (TOWER) return TOWER;
  const cap = (s) =>
    pixelTexture(128, 128, (x, y) => {
      const n = fbm(x / 14, y / 14, s, 4);
      const joint = Math.abs(((x + 64 * Math.floor(y / 64)) % 64) - 32) > 30 || y % 64 < 2;
      return shade(mix(STONE_MID, STONE_HI, n * 0.6), (0.72 + 0.4 * n) * (joint ? 0.55 : 1) * (0.92 + 0.1 * vnoise(x / 2, y / 2, s + 1)));
    });
  TOWER = {
    pier: stoneMat(masonry(64, 512, { key: 5320, course: [34, 46], block: [64, 64], lift: 1.18, grime: 0.4, flaws: 0 }), { bump: 1.2 }),
    blockLight: stoneMat(masonry(128, 128, { key: 5350, course: [40, 60], block: [50, 90], lift: 1.2, grime: 0, damp: 0.2, flaws: 2 }), { bump: 1.4 }),
    dark: stoneMat(masonry(128, 128, { key: 5330, course: [30, 44], block: [50, 90], lift: 0.62, grime: 0, flaws: 0 }), { bump: 1.2 }),
    bone: textured(
      pixelTexture(128, 128, (x, y) =>
        mix(shade(BONE_OLD, 0.78 + 0.3 * fbm(x / 12, y / 12, 5251)), mix("barrowBrown", "barrowDeep", 0.35), 0.75 * smoothstep(0.5, 0.75, fbm(x / 18, y / 18, 5252))),
      ),
      { rough: 0.8 },
    ),
    cap: textured(cap(5201), { rough: 0.95, bump: 0.8 }),
    core: textured(
      pixelTexture(128, 128, (x, y) => {
        const v = 0.55 + 0.7 * fbm(x / 7, y / 7, 5202, 4);
        const stone = vnoise(x / 9, y / 9, 5203) > 0.62;
        return shade(stone ? mix(STONE_LO, STONE_MID, 0.5) : RUBBLE_CORE, v);
      }),
      { rough: 1, bump: 1.4 },
    ),
    block: stoneMat(masonry(128, 128, { key: 5300, course: [40, 60], block: [50, 90], grime: 0, damp: 0.2, flaws: 2 }), { bump: 1.4 }),
    banner: (() => {
      const W = 128;
      const H = 384;
      return textured(
        pixelTexture(W, H, (x, y) => {
          const weave = ((x + y) % 4 < 2 ? 1 : 0.9) * (0.92 + 0.12 * vnoise(x / 2, y / 30, 5211));
          const n = fbm(x / 18, y / 18, 5212, 3);
          let c = shade(BANNER_FIELD, (0.7 + 0.45 * n) * weave);
          const border = x < 10 || x > W - 11 || y < 12;
          if (border) c = shade(BANNER_BORDER, (0.75 + 0.3 * n) * weave);
          // a faded device: the spire on its mound, worked in pale thread
          const cx = x - W / 2;
          const spire = y > 90 && y < 250 && Math.abs(cx) < 6 + (y - 90) * 0.1;
          const mound = y >= 250 && y < 280 && Math.abs(cx) < 44 - (280 - y) * 0.6;
          const top = y > 70 && y <= 90 && Math.abs(cx) < (y - 70) * 0.3;
          if (spire || mound || top) c = mix(c, shade(BANNER_DEVICE, 0.8 + 0.3 * n), 0.75);
          // fading and grime toward the hem
          c = mix(c, GRIME, 0.45 * smoothstep(200, 384, y) * (0.6 + 0.4 * n));
          return c;
        }),
        { side: THREE.DoubleSide, bump: 0.3, rough: 1 },
      );
    })(),
    rust: textured(
      pixelTexture(64, 64, (x, y) =>
        mix(shade(mix("slate", "charcoal", 0.3), 0.8 + 0.4 * fbm(x / 6, y / 6, 5221)), mix("ember", "barrowDeep", 0.5), 0.6 * smoothstep(0.42, 0.7, fbm(x / 9, y / 9, 5222))),
      ),
      { metal: 0.55, rough: 0.7 },
    ),
    web: (() => {
      const S = 256;
      const c = mkCanvas(S, S);
      const ctx = c.getContext("2d");
      const R = rng(5231);
      // a corner web: the hub at the top left, strands fanning down and across, sagging spirals
      ctx.fillStyle = cssRgb(WEB, 0.0);
      ctx.fillRect(0, 0, S, S);
      const hub = [6, 6];
      const spokes = [];
      for (let k = 0; k < 9; k++) {
        const a = 0.04 + (k / 8) * (Math.PI / 2 - 0.08) + (R() - 0.5) * 0.08;
        const len = S * (0.75 + R() * 0.3);
        spokes.push([a, len]);
      }
      // the film: a pale veil inside the web
      const grad = ctx.createRadialGradient(hub[0], hub[1], 4, hub[0], hub[1], S * 0.9);
      grad.addColorStop(0, cssRgb(WEB, 0.6));
      grad.addColorStop(0.7, cssRgb(WEB, 0.28));
      grad.addColorStop(1, cssRgb(WEB, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(hub[0], hub[1]);
      for (const [a, len] of spokes) ctx.lineTo(hub[0] + Math.cos(a) * len, hub[1] + Math.sin(a) * len);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = cssRgb(WEB, 1);
      ctx.lineWidth = 7;
      for (const [a, len] of spokes) {
        ctx.beginPath();
        ctx.moveTo(hub[0], hub[1]);
        ctx.lineTo(hub[0] + Math.cos(a) * len, hub[1] + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.lineWidth = 5;
      ctx.strokeStyle = cssRgb(WEB, 0.9);
      for (let ring = 1; ring < 9; ring++) {
        const r = ring * S * 0.095;
        ctx.beginPath();
        spokes.forEach(([a], k) => {
          const rr = r * (0.94 + R() * 0.12);
          const p = [hub[0] + Math.cos(a) * rr, hub[1] + Math.sin(a) * rr];
          if (k === 0) ctx.moveTo(p[0], p[1]);
          else {
            const pa = spokes[k - 1][0];
            const m = (pa + a) / 2;
            ctx.quadraticCurveTo(hub[0] + Math.cos(m) * rr * 0.9, hub[1] + Math.sin(m) * rr * 0.9 + ring * 0.6, p[0], p[1]);
          }
        });
        ctx.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({
        map: t,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        side: THREE.DoubleSide,
      });
    })(),
    oldWood: textured(
      pixelTexture(128, 128, (x, y) =>
        shade(OLD_WOOD, 0.7 + 0.16 * Math.sin(x * 0.25 + fbm(x / 30, y / 8, 5261) * 8) + 0.3 * fbm(x / 6, y / 40, 5262)),
      ),
    ),
    oldWoodDark: textured(
      pixelTexture(128, 128, (x, y) =>
        shade(mix(OLD_WOOD, "charcoal", 0.4), 0.7 + 0.16 * Math.sin(x * 0.25 + fbm(x / 30, y / 8, 5263) * 8) + 0.3 * fbm(x / 6, y / 40, 5264)),
      ),
    ),
    coldGlow: glow(COLD_LIGHT, 3),
    cheek: (() => {
      const m = stoneMat(masonry(64, 256, { key: 5340, course: [28, 40], block: [64, 64], lift: 0.55, grime: 0, flaws: 0 }), { bump: 1 });
      m.emissive = color(COLD_LIGHT);
      m.emissiveIntensity = 0.05;
      return m;
    })(),
    rootBark: textured(
      pixelTexture(64, 128, (x, y) =>
        shade(ROOT, 0.5 + 0.5 * Math.abs(Math.sin(x * 0.45 + fbm(x / 5, y / 30, 5271) * 5)) * (0.75 + 0.45 * fbm(x / 3, y / 6, 5272))),
      ),
      { rough: 1, bump: 1 },
    ),
    coldDim: glow(shade(COLD_LIGHT, 0.5), 0.9),
    soil: textured(pixelTexture(64, 64, (x, y) => shade(mix("barrowDeep", "charcoal", 0.35), 0.65 + 0.55 * fbm(x / 6, y / 6, 5241))), { rough: 1, bump: 1.2 }),
    amberTrim: glow("amber", 0.85),
  };
  return TOWER;
}

/**
 * The outer wall casts no long shadow: a run of tall pieces would stack their shadows into
 * stripes across the floor. Only the plinth (added after) grounds it with a contact shadow.
 */
function contactShadowOnly(g) {
  g.traverse((o) => {
    if (o.isMesh) o.userData.noShadow = true;
  });
}

/** Hides a frame guide: still counted by the bake's framing, never drawn and never shadowing. */
function guide(obj) {
  obj.visible = false;
  return obj;
}

/** A box whose vertices are pushed about by noise: a rough-hewn stone or a broken one. */
function roughBox(w, h, d, seed, amount = 0.18, seg = 3) {
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const s = Math.min(w, h, d);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = vnoise3(v.x * 7 + seed, v.y * 7, v.z * 7, seed) - 0.5;
    pos.setXYZ(i, v.x + n * s * amount, v.y + n * s * amount * 0.6, v.z + n * s * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A window onto a face texture: the part of it a sub-box spanning [xa, xb] × [ya, yb] covers. */
function slice(t, xa, xb, ya, yb, L, H, bump = 1.5) {
  const cut = (src) => {
    const c = src.clone();
    c.repeat.set((xb - xa) / L, (yb - ya) / H);
    c.offset.set((xa + L / 2) / L, ya / H);
    c.needsUpdate = true;
    return c;
  };
  return stoneMat({ map: cut(t.map), bump: cut(t.bump) }, { bump });
}

/** A masonry wall body: a box faced with `face` on its ±z sides, `ends` on ±x, `top` above. */
function body(L, H, T, face, ends, top) {
  return part(new THREE.BoxGeometry(L, H, T), [ends, ends, top, top, face, face], { y: H / 2 });
}

/**
 * A broken top course for a cut-away piece: stones of uneven height along the wall's top at
 * `y`, some missing, the rubble core showing between. Stays under `maxY`.
 */
function brokenTop(g, L, T, y, maxY, seed, M) {
  const R = rng(seed);
  g.add(part(new THREE.BoxGeometry(L, 0.04, T * 0.86), M.core, { y: y + 0.02 }));
  let x = -L / 2;
  while (x < L / 2 - 0.05) {
    const w = 0.16 + R() * 0.22;
    const ww = Math.min(w, L / 2 - x);
    if (R() > 0.45) {
      const h = Math.min(maxY - y - 0.01, 0.03 + R() * 0.08);
      g.add(part(roughBox(ww - 0.012, h, T * (0.8 + R() * 0.18), Math.floor(R() * 1000), 0.25), M.block, { x: x + ww / 2, y: y + h / 2 + 0.01, z: (R() - 0.5) * 0.03 }));
    }
    x += ww;
  }
}

// ── Partition walls (FS-8RBQY §D.3) ───────────────────────────────────────────────

/**
 * One tile of masonry partition wall. `variant` is plain | pillar | sconce | banner | cobweb
 * (back) or plain | pillar (front); `axis` x runs along world x, y along world y.
 */
export function partitionWall(H, variant, axis, seed) {
  const T = towerMaterials();
  const back = H > 2;
  const soot = variant === "sconce" ? [{ x: 64, y: Math.round(SCONCE_FLAME[1] * PX) - 4, r: 30 }] : [];
  const tex = masonry(PX, Math.round(PX * H), {
    seed,
    soot,
    moss: variant === "cobweb" ? 0.9 : 0.25,
    damp: variant === "cobweb" ? 0.8 : 0.4,
    grime: back ? 0.65 : 0.5,
    flaws: back ? 3 : 1,
  });
  const face = stoneMat(tex);
  const g = new THREE.Group();
  const top = back ? H : H - 0.14;
  g.add(body(LENGTH, top, P_THICK, face, T.block, T.cap));
  // a projecting base course, lifted a hair so the footprint stays the timber wall's
  g.add(part(roughBox(1.0, 0.26, 0.24, seed + 3, 0.04), T.block, { y: 0.03 + 0.13 }));
  if (back) g.add(part(new THREE.BoxGeometry(LENGTH, 0.1, 0.26), T.cap, { y: H + 0.05 }));
  else brokenTop(g, LENGTH, P_THICK, top, H + 0.09, seed * 7 + 1, T);

  if (variant === "pillar") {
    // an engaged pier: base, shaft and capital standing proud of the face
    const ph = back ? H - 0.02 : top;
    g.add(part(new THREE.BoxGeometry(0.36, ph, 0.1), T.pier, { y: ph / 2, z: P_THICK / 2 + 0.05 }));
    g.add(part(roughBox(0.44, 0.3, 0.14, seed + 6, 0.04), T.blockLight, { y: 0.03 + 0.15, z: P_THICK / 2 + 0.06 }));
    if (back) g.add(part(roughBox(0.44, 0.16, 0.15, seed + 7, 0.04), T.blockLight, { y: H - 0.1, z: P_THICK / 2 + 0.06 }));
    else brokenTop(g, 0.34, 0.1, top, H + 0.09, seed * 11, T);
  }
  if (variant === "sconce") {
    const M = materials();
    const [, fy, fz] = SCONCE_FLAME;
    g.add(part(new THREE.BoxGeometry(0.1, 0.22, 0.02), T.rust, { y: fy - 0.42, z: P_THICK / 2 + 0.01 }));
    g.add(part(new THREE.BoxGeometry(0.03, 0.03, fz - P_THICK / 2 - 0.02), M.iron, { y: fy - 0.36, z: (fz + P_THICK / 2) / 2 }));
    g.add(part(new THREE.CylinderGeometry(0.055, 0.035, 0.1, 8, 1, true), M.ironDouble, { y: fy - 0.28, z: fz - 0.01 }));
    g.add(part(new THREE.TorusGeometry(0.055, 0.009, 5, 12), M.iron, { y: fy - 0.23, z: fz - 0.01, rx: Math.PI / 2 }));
    g.add(part(new THREE.CylinderGeometry(0.03, 0.022, 0.3, 8), M.woodDark, { y: fy - 0.2, z: fz - 0.01 }));
    g.add(part(new THREE.SphereGeometry(0.042, 7, 5), M.coal, { y: fy - 0.06, z: fz }));
    g.add(part(new THREE.ConeGeometry(0.05, 0.17, 8), M.flame, { y: fy, z: fz }));
  }
  if (variant === "banner") {
    const M = materials();
    const z = P_THICK / 2 + 0.03;
    const top = H - 0.32;
    g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.66, 6), M.iron, { y: top + 0.02, z, rz: Math.PI / 2 }));
    for (const sx of [-1, 1]) {
      g.add(part(new THREE.SphereGeometry(0.022, 6, 5), M.iron, { x: sx * 0.33, y: top + 0.02, z }));
      g.add(part(new THREE.BoxGeometry(0.02, 0.1, 0.03), M.iron, { x: sx * 0.26, y: top + 0.07, z: z - 0.015 }));
    }
    const bw = 0.52;
    const bh = 1.9;
    const geo = new THREE.PlaneGeometry(bw, bh, 12, 24);
    const pos = geo.attributes.position;
    const R = rng(seed + 41);
    const rag = Array.from({ length: 13 }, () => R() * 0.22);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const col = Math.round(((x + bw / 2) / bw) * 12);
      const t = (y + bh / 2) / bh; // 0 at the hem, 1 at the rod
      const lift = rag[col] * (1 - t) * (1 - t) * 1.2;
      const fold = Math.sin(((x + bw / 2) / bw) * Math.PI * 3.2 + 0.4) * 0.018 * (0.4 + 0.6 * (1 - t));
      pos.setXYZ(i, x * (0.96 + 0.04 * t), y + lift, fold + 0.012 * (1 - t));
    }
    geo.computeVertexNormals();
    g.add(part(geo, T.banner, { y: top - bh / 2 - 0.02, z: z + 0.005 }));
  }
  if (variant === "cobweb") {
    // a web draped in the top corner of the piece and a smaller one at its far end
    const big = new THREE.PlaneGeometry(0.62, 0.7);
    g.add(part(big, T.web, { x: -LENGTH / 2 + 0.31, y: H - 0.35, z: P_THICK / 2 + 0.005 }));
    const small = new THREE.PlaneGeometry(0.34, 0.36);
    g.add(part(small, T.web, { x: LENGTH / 2 - 0.17, y: H - 0.2, z: P_THICK / 2 + 0.005, rz: -Math.PI / 2 }));
  }
  // the timber piece this one replaces, as the frame guide
  g.add(guide(wallPiece(H, "plain", "x", 1)));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/** A masonry corner pier where two partition runs meet, framed as the timber post. */
export function partitionPost(H) {
  const T = towerMaterials();
  const g = new THREE.Group();
  const face = stoneMat(masonry(36, Math.round(PX * (H + 0.12)), { key: 5400, block: [36, 36], course: [24, 34], flaws: 0 }));
  // a 0.24 core to the ground (the timber post's footprint), the pier proper lifted a hair
  g.add(part(new THREE.BoxGeometry(0.24, 0.05, 0.24), T.block, { y: 0.025 }));
  g.add(part(new THREE.BoxGeometry(0.28, H + 0.08, 0.28), [face, face, T.cap, T.cap, face, face], { y: 0.04 + (H + 0.08) / 2 }));
  g.add(part(roughBox(0.3, 0.08, 0.3, 77, 0.06), T.cap, { y: H + 0.16 }));
  g.add(guide(post(H)));
  return g;
}

// ── The perimeter: the tower's outer wall (FS-8RBQY §B.5, §D.4) ─────────────────────

/** One tile of outer wall. `variant` is plain | slit (back) or plain (front). */
export function perimeterWall(H, variant, axis, seed) {
  const T = towerMaterials();
  const back = H > 2;
  const g = new THREE.Group();
  const tex = masonry(PX, Math.round(PX * H), {
    key: 5500,
    seed,
    course: [30, 44],
    block: [48, 96],
    fade: back ? [2.9, H + 0.2] : null,
    grime: 0.7,
    damp: 0.6,
    moss: 0.35,
    flaws: back ? 4 : 1,
  });
  const face = stoneMat(tex, { bump: 1.5 });
  const top = back ? H : H - 0.14;
  const fz = PER_THICK / 2;
  const ends = stoneMat(masonry(Math.round(PX * PER_THICK), Math.round(PX * H), { key: 5510, seed, course: [30, 44], block: [40, 40], fade: back ? [2.9, H + 0.2] : null, grime: 0.7 }), { bump: 1.4 });
  if (variant === "slit") {
    // the wall body is laid round a splayed embrasure: wide on the inner face, narrowing to a
    // hand's breadth of slit, where the cold light of the world outside comes through
    const y0 = 1.35;
    const y1 = 3.05;
    const half = 0.24;
    const depth = 0.38;
    const slitW = 0.09;
    const L2 = LENGTH / 2;
    const at = (xa, xb, ya, yb) => slice(tex, xa, xb, ya, yb, LENGTH, H);
    for (const sx of [-1, 1]) {
      const xa = sx < 0 ? -L2 : half;
      const xb = sx < 0 ? -half : L2;
      const m = at(xa, xb, 0, top);
      g.add(part(new THREE.BoxGeometry(xb - xa, top, PER_THICK), [ends, ends, T.core, T.core, m, m], { x: (xa + xb) / 2, y: top / 2 }));
    }
    const below = at(-half, half, 0, y0);
    g.add(part(new THREE.BoxGeometry(2 * half + 0.01, y0, PER_THICK), [T.dark, T.dark, T.dark, T.dark, below, below], { y: y0 / 2 }));
    const above = at(-half, half, y1, top);
    g.add(part(new THREE.BoxGeometry(2 * half + 0.01, top - y1, PER_THICK), [T.dark, T.dark, T.core, T.dark, above, above], { y: (top + y1) / 2 }));
    // the solid wall behind the embrasure, its back face pierced by the slit
    g.add(part(new THREE.BoxGeometry(2 * half, y1 - y0, PER_THICK - depth), T.dark, { y: (y0 + y1) / 2, z: -depth / 2 }));
    // a lintel stone and a sloped sill
    g.add(part(roughBox(2 * half + 0.16, 0.2, 0.1, seed + 9, 0.06), T.block, { y: y1 + 0.08, z: fz + 0.02 }));
    g.add(part(new THREE.BoxGeometry(2 * half, 0.05, depth), T.cap, { y: y0 + 0.02, z: fz - depth / 2, rx: -0.22 }));
    // splayed cheeks narrowing to the slit, washed by its cold light
    const splay = Math.atan2(half - slitW / 2, depth);
    const cheekLen = Math.hypot(half - slitW / 2, depth);
    for (const sx of [-1, 1])
      g.add(
        part(new THREE.BoxGeometry(0.03, y1 - y0, cheekLen), T.cheek, {
          x: sx * (slitW / 2 + (half - slitW / 2) / 2),
          y: (y0 + y1) / 2,
          z: fz - depth / 2,
          ry: sx * splay,
        }),
      );
    // the slit and its crosslet, lit cold from outside
    const sz = fz - depth - 0.005;
    g.add(part(new THREE.BoxGeometry(slitW, y1 - y0 - 0.16, 0.012), T.coldGlow, { y: (y0 + y1) / 2, z: sz }));
    g.add(part(new THREE.BoxGeometry(0.22, 0.05, 0.012), T.coldGlow, { y: (y0 + y1) / 2 + 0.18, z: sz }));
    // cold light spilling on the sill
    g.add(part(new THREE.BoxGeometry(slitW + 0.06, 0.012, depth * 0.8), T.coldDim, { y: y0 + 0.055, z: fz - depth / 2 - 0.02, rx: -0.22 }));
  } else {
    g.add(body(LENGTH, top, PER_THICK, face, ends, T.core));
  }
  // a battered plinth on the inner face, lifted a hair
  const plinth = part(roughBox(LENGTH, 0.42, 0.1, seed + 13, 0.05), T.block, { y: 0.03 + 0.21, z: fz + 0.04 });
  if (back) {
    // the cut top: a rough course over the rubble core, fading into the dark above
    brokenTop(g, LENGTH, PER_THICK, top, top + 0.16, seed * 13 + 5, { ...T, block: T.dark });
  } else brokenTop(g, LENGTH, PER_THICK, top, H + 0.1, seed * 13 + 5, T);
  contactShadowOnly(g);
  g.add(plinth);
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/** A corner pier of the outer wall: a square buttress, its upper reach lost in the dark. */
export function perimeterPost(H) {
  const T = towerMaterials();
  const back = H > 2;
  const S = 0.9;
  const g = new THREE.Group();
  const face = stoneMat(
    masonry(Math.round(PX * S), Math.round(PX * H), { key: 5700, course: [30, 44], block: [56, 60], fade: back ? [2.9, H + 0.2] : null, grime: 0.7, moss: 0.3 }),
    { bump: 1.5 },
  );
  const top = back ? H : H - 0.14;
  g.add(part(new THREE.BoxGeometry(S, top, S), [face, face, T.core, T.core, face, face], { y: top / 2 }));
  if (back) brokenTop(g, S, S, top, top + 0.16, 93, { ...T, block: T.dark });
  else brokenTop(g, S, S, top, H + 0.1, 95, T);
  contactShadowOnly(g);
  g.add(part(roughBox(S + 0.1, 0.42, S + 0.1, 91, 0.04), T.block, { y: 0.03 + 0.21 }));
  return g;
}

// ── Dressing (FS-8RBQY §C.4, §D.5): low, ground-hugging, no light ────────────────────

export function rubble(seed) {
  const T = towerMaterials();
  const g = new THREE.Group();
  const R = rng(seed);
  // a fallen ashlar block or two, then broken stones heaped round them, then grit
  for (let i = 0; i < 2; i++) {
    const w = 0.26 + R() * 0.12;
    g.add(part(roughBox(w, 0.16 + R() * 0.06, 0.2 + R() * 0.06, seed + i, 0.12), T.blockLight, { x: (R() - 0.5) * 0.4, y: 0.08, z: (R() - 0.5) * 0.3, ry: R() * 3, rz: (R() - 0.5) * 0.3 }));
  }
  for (let i = 0; i < 14; i++) {
    const s = 0.06 + R() * 0.11;
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 0.42;
    g.add(
      part(roughBox(s * (1 + R()), s, s * (0.8 + R() * 0.6), seed + 20 + i, 0.4, 2), T.blockLight, {
        x: Math.cos(a) * d,
        y: s * 0.4 + (d < 0.25 ? R() * 0.1 : 0),
        z: Math.sin(a) * d * 0.8,
        rx: R() * 3,
        ry: R() * 3,
        rz: R() * 3,
      }),
    );
  }
  const grit = plain(mix(STONE_MID, GRIME, 0.3), { rough: 1, flat: true });
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2;
    const d = 0.2 + R() * 0.38;
    g.add(part(new THREE.DodecahedronGeometry(0.015 + R() * 0.025, 0), grit, { x: Math.cos(a) * d, y: 0.01, z: Math.sin(a) * d * 0.8, sy: 0.6 }));
  }
  return scaled(g, 1.35);
}

/** A skull: cranium, brow, cheekbones, dark orbits and nose, and a loose jaw. */
function skull(M, o) {
  const g = new THREE.Group();
  const dark = plain(mix("pitch", "barrowDeep", 0.4), { rough: 1 });
  g.add(part(new THREE.SphereGeometry(0.1, 12, 10), M.bone, { y: 0.09, sx: 0.85, sz: 1.08 }));
  g.add(part(new THREE.SphereGeometry(0.065, 10, 8), M.bone, { y: 0.045, z: 0.06, sx: 1.05, sy: 0.8 }));
  for (const sx of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.024, 8, 6), dark, { x: sx * 0.035, y: 0.07, z: 0.1 }));
  g.add(part(new THREE.ConeGeometry(0.012, 0.03, 5), dark, { y: 0.04, z: 0.115, rx: Math.PI }));
  g.add(part(new THREE.TorusGeometry(0.045, 0.012, 5, 10, Math.PI), M.bone, { y: 0.012, z: 0.07, rx: Math.PI / 2 + 0.3 }));
  g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  g.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  return g;
}

/** A long bone: a shaft with knuckled ends. */
function longBone(M, a, b, r) {
  const g = new THREE.Group();
  g.add(rod(a, b, r, r * 0.85, M.bone, 6));
  for (const p of [a, b])
    for (const k of [-1, 1]) g.add(part(new THREE.SphereGeometry(r * 1.5, 6, 5), M.bone, { x: p.x + k * r * 0.9, y: p.y, z: p.z - k * r * 0.5 }));
  return g;
}

export function bonePile(seed) {
  const M = { ...materials(), bone: towerMaterials().bone };
  const g = new THREE.Group();
  const R = rng(seed);
  g.add(skull(M, { x: 0.05, y: 0.04, z: 0.04, ry: 0.6 + R(), rz: 0.2 }));
  if (seed % 2) g.add(skull(M, { x: -0.25, y: 0, z: -0.12, ry: -0.8, rx: 0.4, rz: 0.5 }));
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI;
    const len = 0.22 + R() * 0.22;
    const c = V3((R() - 0.5) * 0.6, 0.02 + (i > 5 ? 0.05 : 0), (R() - 0.5) * 0.45);
    const dv = V3(Math.cos(a) * len * 0.5, (R() - 0.5) * 0.06, Math.sin(a) * len * 0.5);
    g.add(longBone(M, c.clone().sub(dv), c.clone().add(dv), 0.014 + R() * 0.006));
  }
  // a run of ribs, arched up out of the heap
  for (let i = 0; i < 6; i++)
    g.add(part(new THREE.TorusGeometry(0.1, 0.008, 4, 10, Math.PI * 0.75), M.bone, { x: -0.1 + i * 0.045, y: 0.01, z: 0.18, ry: Math.PI / 2 + (R() - 0.5) * 0.2, rz: 0.2 }));
  for (let i = 0; i < 10; i++)
    g.add(part(new THREE.CapsuleGeometry(0.01, 0.04, 2, 5), M.bone, { x: (R() - 0.5) * 0.8, y: 0.01, z: (R() - 0.5) * 0.6, rz: Math.PI / 2, ry: R() * 3 }));
  return scaled(g, 1.1);
}

export function brokenCrate(seed) {
  const T = towerMaterials();
  const M = { ...materials(), wood: T.oldWood, woodDark: T.oldWoodDark };
  const g = new THREE.Group();
  const R = rng(seed);
  const s = 0.55;
  const b = 0.05;
  // the base and the two sides that still stand, one stove in
  g.add(part(new THREE.BoxGeometry(s, 0.04, s), M.wood, { y: 0.02 }));
  for (let k = 0; k < 4; k++)
    g.add(part(new THREE.BoxGeometry(s, 0.1, 0.03), M.wood, { y: 0.07 + k * 0.105, z: -s / 2 + 0.015, rz: (R() - 0.5) * 0.04 }));
  for (let k = 0; k < 2; k++)
    g.add(part(new THREE.BoxGeometry(0.03, 0.1, s), M.wood, { x: -s / 2 + 0.015, y: 0.07 + k * 0.105 }));
  const brokenH = [0.42, 0.3, 0.18];
  for (let k = 0; k < 3; k++)
    g.add(part(new THREE.BoxGeometry(0.03, brokenH[k] * (0.7 + R() * 0.3), 0.16), M.wood, { x: -s / 2 + 0.015, y: 0.25 + (brokenH[k] - 0.42) / 2, z: 0.05 + k * 0.08, rx: 0.08 * k }));
  for (const sx of [-1, 1]) g.add(part(new THREE.BoxGeometry(b, 0.44, b), M.woodDark, { x: sx * (s - b) / 2, y: 0.22, z: -(s - b) / 2 }));
  g.add(part(new THREE.BoxGeometry(b, 0.3, b), M.woodDark, { x: -(s - b) / 2, y: 0.15, z: (s - b) / 2, rz: 0.1 }));
  // the lid, thrown aside, and loose boards and splinters
  g.add(part(new THREE.BoxGeometry(s, 0.03, s * 0.9), M.wood, { x: 0.42, y: 0.1, z: 0.12, rz: 0.35, ry: 0.5 }));
  g.add(part(new THREE.BoxGeometry(s * 0.95, 0.035, 0.05), M.woodDark, { x: 0.42, y: 0.13, z: 0.12, rz: 0.35, ry: 0.5 + Math.PI / 4 }));
  for (let i = 0; i < 6; i++)
    g.add(part(new THREE.BoxGeometry(0.2 + R() * 0.3, 0.025, 0.09), R() > 0.5 ? M.wood : M.woodDark, { x: (R() - 0.3) * 0.7, y: 0.015 + R() * 0.03, z: 0.25 + R() * 0.2, ry: R() * 3, rz: (R() - 0.5) * 0.2 }));
  for (let i = 0; i < 8; i++)
    g.add(part(new THREE.ConeGeometry(0.012, 0.1 + R() * 0.08, 4), M.wood, { x: (R() - 0.5) * 0.8, y: 0.01, z: (R() - 0.2) * 0.6, rz: Math.PI / 2, ry: R() * 3 }));
  return g;
}

/** A root as a tube along a curve, tapering from `r0` to `r1`. */
function root(points, r0, r1, M) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubular = 24;
  const radial = 7;
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const p = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(p).multiplyScalar(r * (0.9 + 0.2 * vnoise3(p.x * 9, p.y * 9, p.z * 9 + j, 7)));
      pos.setXYZ(k, p.x + v.x, p.y + v.y, p.z + v.z);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, M.rootBark);
}

export function roots(seed) {
  const T = towerMaterials();
  const M = { rootBark: T.rootBark };
  const g = new THREE.Group();
  const R = rng(seed);
  // roots run in from one side under the floor, breaking the surface in low humps and diving
  // back under, a rootlet splitting off here and there; flags tilt where they break out
  const dir = R() * Math.PI * 2;
  const along = [Math.cos(dir), Math.sin(dir) * 0.85];
  const across = [-along[1], along[0]];
  for (let k = 0; k < 4; k++) {
    const off = (k - 1.5) * 0.12 + (R() - 0.5) * 0.06;
    const len = 0.7 + R() * 0.35;
    const humps = 1.5 + R() * 1.2;
    const phase = R() * Math.PI;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8 - 0.5;
      const u = t * len;
      const w = off + Math.sin(t * 5 + k) * 0.05 + (R() - 0.5) * 0.02;
      const y = -0.02 + (0.06 + 0.03 * R()) * Math.max(0, Math.sin((t + 0.5) * Math.PI * humps + phase)) - 0.02 * Math.abs(t * 2);
      pts.push(V3(along[0] * u + across[0] * w, y, along[1] * u + across[1] * w));
    }
    g.add(root(pts, 0.05 + R() * 0.02, 0.016, M));
    const m = pts[3 + Math.floor(R() * 3)];
    const side = R() > 0.5 ? 1 : -1;
    g.add(root([m, V3(m.x + across[0] * side * 0.12 + along[0] * 0.08, 0.02, m.z + across[1] * side * 0.12 + along[1] * 0.08), V3(m.x + across[0] * side * 0.22 + along[0] * 0.18, -0.03, m.z + across[1] * side * 0.22 + along[1] * 0.18)], 0.018, 0.006, M));
  }
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2;
    const d = R() * 0.3;
    g.add(part(roughBox(0.12 + R() * 0.1, 0.06, 0.1 + R() * 0.08, seed + i, 0.4, 2), T.soil, { x: Math.cos(a) * d, y: 0.0, z: Math.sin(a) * d * 0.8, ry: R() * 3 }));
  }
  for (let i = 0; i < 3; i++) {
    const a = R() * Math.PI * 2;
    g.add(part(roughBox(0.26, 0.04, 0.2, seed + 30 + i, 0.15, 2), T.block, { x: Math.cos(a) * 0.32, y: 0.04, z: Math.sin(a) * 0.26, ry: a, rx: 0.25, rz: (R() - 0.5) * 0.4 }));
  }
  return scaled(g, 1.25);
}

export function chains(seed) {
  const M = materials();
  const T = towerMaterials();
  const g = new THREE.Group();
  const R = rng(seed);
  const link = new THREE.TorusGeometry(0.036, 0.011, 5, 12);
  // a chain coiled in a slack heap: links laid along a spiral, alternate links turned on edge
  const n = 48;
  let prev = null;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const a = t * Math.PI * 4.2 + R() * 0.1;
    const r = 0.36 - t * 0.24;
    const p = V3(Math.cos(a) * r, 0.012 + t * 0.06 + (i % 2) * 0.008, Math.sin(a) * r * 0.85);
    if (prev) {
      const dir = p.clone().sub(prev);
      const yaw = Math.atan2(dir.x, dir.z);
      g.add(part(link, i % 3 === 0 ? T.rust : M.iron, { x: p.x, y: p.y, z: p.z, sx: 1.5, ry: yaw + Math.PI / 2, rx: i % 2 ? Math.PI / 2 : 0.15 }));
    }
    prev = p;
  }
  // a pair of manacles on a short length, and the staple ring it hung from
  for (const [x, z, ry] of [
    [0.32, 0.3, 0.4],
    [0.46, 0.14, 1.2],
  ]) {
    g.add(part(new THREE.TorusGeometry(0.065, 0.016, 6, 16), T.rust, { x, y: 0.02, z, rx: Math.PI / 2 - 0.15, ry }));
    g.add(part(new THREE.BoxGeometry(0.04, 0.03, 0.03), M.iron, { x: x + 0.06, y: 0.025, z: z - 0.03, ry }));
  }
  for (let i = 0; i < 4; i++) g.add(part(link, M.iron, { x: 0.34 + i * 0.04, y: 0.014, z: 0.24 - i * 0.04, sx: 1.5, ry: -0.8, rx: i % 2 ? Math.PI / 2 : 0.1 }));
  g.add(part(roughBox(0.2, 0.08, 0.18, seed + 3, 0.1, 2), T.block, { x: -0.36, y: 0.04, z: 0.26, ry: 0.3 }));
  g.add(part(new THREE.TorusGeometry(0.05, 0.012, 6, 14), M.iron, { x: -0.36, y: 0.1, z: 0.26, ry: 0.3 }));
  return scaled(g, 1.2);
}

// ── The spiral stairs (FS-8RBQY §E.1–§E.3) ─────────────────────────────────────────

const STEP = (Math.PI * 2) / 16;
const RISE = 0.17;
const TREADS = 21;
const R_IN = 0.12;
const R_OUT = 0.86;
const WELL_R = 0.97;

/**
 * Darkness rising: albedo multiplier at height y. The first turn stays in full stone, so its
 * treads read at 1×; the second turn sinks toward black as it climbs out of sight.
 */
const fadeAt = (y) => 1 - 0.85 * smoothstep(1.9, 4.0, y);

/** Writes a vertex colour per vertex from its world height (`dy` lifts local y). */
function fadeColours(geo, dy = 0) {
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = fadeAt(pos.getY(i) + dy);
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = f;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return geo;
}

/** A tread: a wedge of stone from the newel out to the well, `a0`..`a1`, standing `h` tall. */
function tread(a0, a1, h) {
  const shape = new THREE.Shape();
  const seg = 6;
  const at = (r, a) => [Math.sin(a) * r, -Math.cos(a) * r];
  shape.moveTo(...at(R_IN, a0));
  for (let i = 0; i <= seg; i++) shape.lineTo(...at(R_OUT, a0 + ((a1 - a0) * i) / seg));
  for (let i = seg; i >= 0; i--) shape.lineTo(...at(R_IN, a0 + ((a1 - a0) * i) / seg));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function spiralStairs() {
  const g = new THREE.Group();
  const stepTex = masonry(128, 128, { key: 5800, course: [128, 128], block: [128, 128], grime: 0.2, damp: 0.3, flaws: 1, lift: 1.3 });
  const stepMat = stoneMat(stepTex, { vc: true, bump: 1 });
  // the partition walls' stone, a shade lifted, so the drum reads as masonry and not a void
  const wallTex = masonry(256, Math.round(PX * 4), { key: 5810, course: [26, 36], block: [40, 70], lift: 1.12, grime: 0.45, damp: 0.4, moss: 0.2 });
  const wallMat = stoneMat(wallTex, { vc: true, side: THREE.DoubleSide, bump: 1.3 });
  const T = towerMaterials();
  // the stair winds up from the front-left, round the right and the back, into the dark
  const a0 = 0;
  for (let k = 0; k < TREADS; k++) {
    const y = k * RISE;
    const geo = fadeColours(tread(a0 + k * STEP, a0 + (k + 1) * STEP + 0.02, RISE + 0.03), y - 0.03);
    g.add(part(geo, stepMat, { y: y - 0.03 }));
    if (k < 3) {
      // the interactable cue: amber trim along the nosing of the lowest treads
      const a = a0 + k * STEP + 0.02;
      const mid = (R_IN + R_OUT) / 2 + 0.06;
      g.add(
        part(new THREE.BoxGeometry(0.034, 0.02, R_OUT - R_IN - 0.16), T.amberTrim, {
          x: Math.sin(a) * mid,
          y: y + RISE + 0.008,
          z: Math.cos(a) * mid,
          ry: a,
        }),
      );
    }
  }
  // the newel the treads wind round
  const top = TREADS * RISE + 0.35;
  g.add(part(fadeColours(new THREE.CylinderGeometry(R_IN + 0.02, R_IN + 0.03, top, 12, 16), top / 2), stepMat, { y: top / 2 }));
  // the stairwell: the back half of the tower's turret, open to the south, between the camera
  // (from +x+z) and the key light (from -x+z), so the light falls into the well across the
  // treads instead of the shell shading them, and the first turn faces the camera
  const wellH = top + 0.15;
  const back = Math.PI;
  const span = Math.PI;
  const shell = new THREE.CylinderGeometry(WELL_R, WELL_R, wellH, 32, 16, true, back - span / 2, span);
  g.add(part(fadeColours(shell, wellH / 2), wallMat, { y: wellH / 2 }));
  const outer = new THREE.CylinderGeometry(WELL_R + 0.12, WELL_R + 0.12, wellH, 32, 16, true, back - span / 2, span);
  g.add(part(fadeColours(outer, wellH / 2), wallMat, { y: wellH / 2 }));
  // the wall's cut ends, so its thickness reads
  for (const a of [back - span / 2, back + span / 2]) {
    const r = WELL_R + 0.06;
    g.add(part(fadeColours(new THREE.BoxGeometry(0.12, wellH, 0.14, 1, 16, 1), wellH / 2), wallMat, { x: Math.sin(a) * r, y: wellH / 2, z: Math.cos(a) * r, ry: a }));
  }
  // a foot stone before the first tread, worn smooth
  g.add(part(fadeColours(roughBox(0.5, 0.06, 0.32, 5820, 0.06, 2)), stepMat, { x: -0.18, y: 0.03, z: 0.82, ry: 0.15 }));
  return g;
}

