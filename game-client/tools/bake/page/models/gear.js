// Gear icons (weapons, armour, rings) in four tiers by item level: 1-9, 10-19, 20-24, 25 and up.
// The tier is fixed by the item's level, never rolled. Each tier steps up the same piece twice
// over, in finish and in silhouette, so a better item reads at 1x by its outline alone:
//
//   1  plain iron, leather and wood; the simplest form of the thing
//   2  kept steel: brushed, use-scratched, brass fittings, waxed oxblood leather
//   3  blackened steel with gilt trim, and the piece grows a part (cheek plates, pauldrons, a spike)
//   4  polished masterwork in gold, a garnet set in it, crimson cloth, the fullest silhouette
//
// No tier glows: a still glow behind an icon is the rarity's, drawn by the client (guideline,
// "Item glitter"), and the two must not be confused.

import * as THREE from "three";
import { canvasTexture, materials, mkCanvas } from "../materials.js";
import { fbm, hash2, smoothstep, vnoise } from "../noise.js";
import { rgb } from "../palette.js";
import { laid, part } from "./util.js";

const TX = 128;
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const scale3 = (a, k) => a.map((v) => Math.min(255, Math.max(0, v * k)));

/** A material from one painter `fn(x, y) -> [r, g, b, roughness, metalness]`, also its bump. */
function painted(fn, { bump = 0.6, side = THREE.DoubleSide, flat = false } = {}) {
  const cs = [mkCanvas(TX, TX), mkCanvas(TX, TX), mkCanvas(TX, TX)];
  const im = cs.map((c) => c.getContext("2d").createImageData(TX, TX));
  for (let y = 0; y < TX; y++)
    for (let x = 0; x < TX; x++) {
      const [r, g, b, ro, me] = fn(x, y);
      const i = (y * TX + x) * 4;
      im[0].data.set([r, g, b, 255], i);
      im[1].data.set([ro * 255, ro * 255, ro * 255, 255], i);
      im[2].data.set([me * 255, me * 255, me * 255, 255], i);
    }
  cs.forEach((c, k) => c.getContext("2d").putImageData(im[k], 0, 0));
  const [map, rough, metal] = cs.map((c) => canvasTexture(c));
  rough.colorSpace = metal.colorSpace = THREE.NoColorSpace;
  return new THREE.MeshStandardMaterial({
    map, roughnessMap: rough, metalnessMap: metal, bumpMap: map, bumpScale: bump,
    roughness: 1, metalness: 1, side, flatShading: flat,
  });
}

const scratch = (x, y, s) =>
  hash2(Math.floor(x / 3 + y / 9), Math.floor(y / 41), s) > 0.93 && Math.abs(((x + y * 0.3) % 3) - 1.5) < 0.6 ? 1 : 0;

/** Worked metal: brushed or hammered, smeared darker in places, bright where scratched. */
function metal(base, { rough, brushed = true, smear = 0.35, scratches = 0.5, seed = 1, bump = 0.5 }) {
  const dark = rgb("charcoal");
  const lit = lerp3(rgb("slateLight"), rgb("vellum"), 0.5);
  return painted((x, y) => {
    const grain = brushed ? 0.85 + 0.2 * vnoise(x / 0.9, y / 70, seed) + 0.1 * fbm(x / 30, y / 30, seed + 1) : 0.75 + 0.45 * fbm(x / 14, y / 14, seed);
    const sm = smoothstep(0.68, 0.85, fbm(x / 12, y / 12, seed + 13));
    const sc = scratch(x, y, seed + 7);
    let c = scale3(base, grain);
    c = lerp3(c, dark, sm * smear);
    c = lerp3(c, lit, sc * scratches);
    return [...c, Math.min(1, rough + 0.15 * sm + 0.1 * (1 - grain) - 0.1 * sc), 0.95];
  }, { bump });
}

function hide(base, seed = 3) {
  return painted((x, y) => {
    const n = fbm(x / 7, y / 7, seed);
    const crease = vnoise(x / 2.5, y / 22, seed + 5) > 0.8 ? 0.65 : 1;
    return [...scale3(base, (0.72 + 0.45 * n) * crease), 0.6, 0];
  }, { bump: 1.4 });
}

function stone(base, rough) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(...base.map((v) => v / 255)).convertSRGBToLinear(), roughness: rough, metalness: 0.1, flatShading: true });
}

const TONE = {
  iron: lerp3(rgb("slate"), rgb("slateLight"), 0.25),
  steel: lerp3(lerp3(rgb("slateLight"), rgb("vellum"), 0.35), rgb("slate"), 0.35),
  black: lerp3(rgb("charcoal"), rgb("slate"), 0.4),
  polish: lerp3(rgb("slateLight"), rgb("vellum"), 0.55),
  brass: lerp3(rgb("brass"), rgb("brassBright"), 0.4),
  gilt: lerp3(rgb("brass"), rgb("brassBright"), 0.6),
  gold: lerp3(rgb("brassBright"), rgb("amberBright"), 0.2),
  leather: lerp3(rgb("barrowBrown"), rgb("barrowDeep"), 0.4),
  oxhide: lerp3(rgb("barrowDeep"), rgb("oxblood"), 0.3),
  darkhide: lerp3(rgb("barrowDeep"), rgb("charcoal"), 0.4),
};

const SETS = {};
/**
 * The materials of one tier. `blade` is an edge, `plate` an armour shell, `trim` fittings and
 * edging, `grip` what a hand holds, `wood` a haft or stave, `cloth` a soft part, `gem` the stone.
 */
function tier(t) {
  if (SETS[t]) return SETS[t];
  const M = materials();
  const iron = metal(TONE.iron, { rough: 0.5, brushed: false, smear: 0.5, scratches: 0.35, seed: 4, bump: 0.9 });
  const steel = metal(TONE.steel, { rough: 0.32, seed: 8 });
  SETS[t] = [
    null,
    { blade: iron, plate: iron, trim: metal(shade3(TONE.iron, 0.75), { rough: 0.55, brushed: false, seed: 5, bump: 0.9 }), grip: M.leather, wood: M.wood, cloth: M.leather, gem: null },
    { blade: steel, plate: steel, trim: metal(TONE.brass, { rough: 0.35, scratches: 0.2, seed: 6 }), grip: hide(TONE.oxhide), wood: M.woodDark, cloth: hide(TONE.oxhide, 4), gem: null },
    { blade: steel, plate: metal(TONE.black, { rough: 0.38, smear: 0.2, scratches: 0.25, seed: 9 }), trim: metal(TONE.gilt, { rough: 0.3, scratches: 0.15, seed: 10 }), grip: hide(TONE.darkhide, 5), wood: M.woodDark, cloth: hide(TONE.darkhide, 6), gem: stone(lerp3(rgb("slate"), rgb("necrotic"), 0.3), 0.15) },
    { blade: metal(TONE.polish, { rough: 0.2, smear: 0.15, scratches: 0.2, seed: 11 }), plate: metal(TONE.polish, { rough: 0.22, smear: 0.15, scratches: 0.2, seed: 12 }), trim: metal(TONE.gold, { rough: 0.25, scratches: 0.1, seed: 13 }), grip: M.crimson, wood: M.woodDark, cloth: M.crimson, gem: stone(lerp3(rgb("oxblood"), rgb("ember"), 0.25), 0.08) },
  ][t];
  return SETS[t];
}
function shade3(c, k) {
  return scale3(c, k);
}

// --- shared shapes -------------------------------------------------------------------------

const lathe = (prof, m, segs = 36) => part(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), segs), m);
const ring = (r, tube, m, o = {}) => part(new THREE.TorusGeometry(r, tube, 8, 32), m, { rx: Math.PI / 2, ...o });
const ball = (r, m, o = {}) => part(new THREE.SphereGeometry(r, 14, 10), m, o);
const cyl = (r0, r1, h, m, o = {}, segs = 14) => part(new THREE.CylinderGeometry(r1, r0, h, segs), m, o);
function slab(pts, depth, m, o = {}, bevel = 0.006) {
  const s = new THREE.Shape();
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) p.length === 4 ? s.quadraticCurveTo(...p) : s.lineTo(...p);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 1.6, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  geo.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 4));
  return part(geo, m, o);
}
const tube = (pts, r, m) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 32, r, 8), m);
const gemAt = (t, r, o) => (t.gem ? ball(r, t.gem, { ...o, sy: 1.1 }) : new THREE.Group());

// --- weapons (built pointing +y, hilt at the origin, then laid on the ground) --------------

/** A blade with an optional fuller; tip at `len`. */
function blade(len, w, m, fuller) {
  const g = new THREE.Group();
  g.add(slab([[-w / 2, 0], [w / 2, 0], [w * 0.36, len * 0.82], [w * 0.2, len * 0.95, 0, len], [-w * 0.2, len * 0.95, -w * 0.36, len * 0.82]], 0.004, m, {}, 0.008));
  if (fuller) for (const z of [-1, 1]) g.add(part(new THREE.BoxGeometry(w * 0.2, len * 0.7, 0.004), fuller, { y: len * 0.38, z: z * 0.0125 }));
  return g;
}

function hilted(n, { dagger = false } = {}) {
  const t = tier(n);
  const g = new THREE.Group();
  const len = dagger ? [0.3, 0.36, 0.4, 0.44][n - 1] : [0.62, 0.78, 0.86, 0.96][n - 1];
  const w = (dagger ? 0.85 : 1) * [0.068, 0.074, 0.084, 0.094][n - 1];
  const gripLen = dagger ? 0.12 : [0.15, 0.17, 0.19, 0.25][n - 1];
  const b = blade(len, w, t.blade, n >= 2 ? (n === 4 ? t.trim : tier(3).plate) : null);
  b.position.y = 0.02;
  g.add(b);
  // guard
  const gw = (dagger ? 0.6 : 1) * [0.2, 0.26, 0.3, 0.34][n - 1];
  if (n === 1 && !dagger) g.add(part(new THREE.BoxGeometry(gw, 0.026, 0.04), t.trim));
  if (n === 2) {
    g.add(cyl(0.013, 0.013, gw, t.trim, { rz: Math.PI / 2, sz: 1.6 }));
    for (const s of [-1, 1]) g.add(ball(0.018, t.trim, { x: (s * gw) / 2 }));
  }
  if (n === 3 && dagger) for (const y of [0, -gripLen - 0.02]) g.add(cyl(0.05, 0.05, 0.014, t.trim, { y }, 18));
  if (n === 3 && !dagger) {
    for (const s of [-1, 1]) g.add(tube([[0, 0, 0], [s * gw * 0.3, 0.005, 0], [s * gw * 0.5, 0.045, 0]], 0.014, t.trim));
    g.add(part(new THREE.BoxGeometry(0.03, 0.08, 0.026), t.trim, { y: 0.03 }));
  }
  if (n === 4) {
    for (const s of [-1, 1]) {
      g.add(tube([[0, 0, 0], [s * gw * 0.35, -0.004, 0], [s * gw * 0.5, 0.03, 0], [s * gw * 0.44, 0.06, 0]], 0.015, t.trim));
      g.add(ball(0.018, t.trim, { x: s * gw * 0.44, y: 0.062 }));
    }
    g.add(gemAt(t, 0.022, { z: 0.022 }));
  }
  if (n === 1 && dagger) g.add(cyl(0.03, 0.03, 0.02, t.trim));
  // grip
  const handle = n === 1 && dagger ? tier(1).wood : t.grip;
  g.add(cyl(0.022, 0.019, gripLen, handle, { y: -gripLen / 2 - 0.01 }));
  if (n >= 2) for (let i = 0; i < Math.round(gripLen / 0.034); i++) g.add(ring(0.022, 0.0045, n === 2 ? t.grip : t.trim, { y: -0.025 - i * 0.034, rx: Math.PI / 2 + 0.25 }));
  // pommel
  const py = -gripLen - 0.03;
  if (n === 1) g.add(ball(0.03, t.trim, { y: py }));
  if (n === 2) g.add(ball(0.036, t.trim, { y: py, sz: 0.55 }));
  if (n >= 3 && !(n === 3 && dagger)) g.add(cyl(0.046, 0.046, 0.03, t.trim, { y: py, rx: Math.PI / 2 }, 20));
  if (n === 4) g.add(gemAt(t, 0.02, { y: py, z: 0.02 }));
  return laid(g, -0.25);
}

function axe(n) {
  const t = tier(n);
  const g = new THREE.Group();
  const haft = [0.66, 0.74, 0.8, 0.86][n - 1];
  g.add(cyl(0.024, 0.02, haft, t.wood, { y: haft / 2 }, 10));
  const k = [0.8, 1, 1.1, 1.25][n - 1];
  const head = (s) =>
    slab([[0, 0.07 * k], [0.06 * k, 0.05 * k], [0.2 * k, 0.13 * k], [0.25 * k, 0, 0.18 * k, -0.15 * k], [0.1 * k, -0.04 * k, 0.05 * k, -0.035 * k], [0, -0.04 * k]], 0.022, t.blade, { y: haft - 0.06, sx: s });
  g.add(head(1));
  if (n === 4) g.add(head(-1));
  if (n === 3) g.add(cyl(0.026, 0.001, 0.12, t.plate, { x: -0.07, y: haft - 0.06, rz: Math.PI / 2 }, 8));
  g.add(part(new THREE.BoxGeometry(0.06, 0.12 * k, 0.05), n >= 3 ? t.plate : t.blade, { y: haft - 0.06 }));
  if (n >= 2) for (const y of [haft - 0.15, haft - 0.2]) g.add(ring(0.026, 0.006, t.trim, { y }));
  if (n >= 2) g.add(cyl(0.027, 0.027, 0.16, t.grip, { y: 0.12 }, 12));
  if (n >= 3) g.add(cyl(0.03, 0.022, 0.03, t.trim, { y: 0.01 }));
  if (n === 4) g.add(gemAt(t, 0.022, { y: haft - 0.06, z: 0.03 }));
  return laid(g, -0.35);
}

function mace(n) {
  const t = tier(n);
  const g = new THREE.Group();
  const L = 0.52;
  if (n === 1) {
    g.add(cyl(0.024, 0.06, L + 0.12, t.wood, { y: (L + 0.12) / 2 }, 12));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      g.add(ball(0.014, t.trim, { x: Math.cos(a) * 0.055, y: L - 0.04 + (i % 3) * 0.05, z: Math.sin(a) * 0.055 }));
    }
    return laid(g, -0.3);
  }
  g.add(cyl(0.02, 0.02, L, n === 2 ? t.wood : t.plate, { y: L / 2 }, 10));
  g.add(cyl(0.024, 0.024, 0.15, t.grip, { y: 0.08 }, 12));
  g.add(ring(0.026, 0.008, t.trim, { y: L - 0.02 }));
  const hy = L + 0.08;
  g.add(ball(0.06, t.plate, { y: hy, sy: 1.3 }));
  const flanges = n === 2 ? 6 : 8;
  if (n <= 3)
    for (let i = 0; i < flanges; i++) {
      const f = slab([[0, -0.08], [0.05, -0.05], [0.075, 0.02], [0.03, 0.09], [0, 0.09]], 0.012, n === 3 ? t.trim : t.blade, { y: hy, ry: (i / flanges) * Math.PI * 2 });
      g.add(f);
    }
  if (n === 3) g.add(cyl(0.022, 0.001, 0.1, t.plate, { y: hy + 0.13 }, 8));
  if (n === 4) {
    for (let i = 0; i < 14; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 14), th = i * 2.4;
      const d = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const s = cyl(0.018, 0.001, 0.07, t.blade, {}, 6);
      s.position.set(d.x * 0.085, hy + d.y * 0.1, d.z * 0.085);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      g.add(s);
    }
    g.add(ring(0.062, 0.01, t.trim, { y: hy }));
    g.add(gemAt(t, 0.02, { y: -0.02 }));
  }
  g.add(cyl(0.03, 0.022, 0.03, t.trim, { y: 0.0 }));
  return laid(g, -0.3);
}

function spear(n) {
  const t = tier(n);
  const g = new THREE.Group();
  const shaft = 0.95;
  g.add(cyl(0.017, 0.017, shaft, t.wood, { y: shaft / 2 }, 10));
  const hl = [0.18, 0.24, 0.26, 0.3][n - 1], hw = [0.06, 0.07, 0.075, 0.1][n - 1];
  const leaf = [[0, 0], [hw / 2, hl * 0.3, hw * 0.55, hl * 0.45], [0, hl], [-hw * 0.55, hl * 0.45, -hw / 2, hl * 0.3]];
  g.add(slab(leaf, 0.01, t.blade, { y: shaft + 0.04 }));
  g.add(cyl(0.02, 0.026, 0.08, n >= 2 ? t.trim : t.blade, { y: shaft + 0.0 }));
  if (n === 3) for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.06, 0.016, 0.014), t.plate, { x: s * 0.035, y: shaft - 0.02 }));
  if (n === 4) {
    for (const s of [-1, 1]) g.add(slab([[0, 0], [s * 0.1, 0.04], [s * 0.12, 0.08, s * 0.08, 0.09], [0, 0.04]], 0.01, t.blade, { y: shaft + 0.03 }));
    g.add(cyl(0.004, 0.035, 0.09, t.cloth, { y: shaft - 0.08 }, 12));
    g.add(gemAt(t, 0.016, { y: shaft + 0.06, z: 0.014 }));
  }
  if (n >= 3) for (const y of [shaft * 0.55, shaft * 0.3]) g.add(ring(0.019, 0.006, t.trim, { y }));
  if (n >= 2) g.add(cyl(0.017, 0.003, 0.06, t.trim, { y: -0.03 }, 8));
  return laid(g, -0.3);
}

function bow(n) {
  const t = tier(n);
  const g = new THREE.Group();
  const H = [0.5, 0.52, 0.5, 0.52][n - 1];
  const D = [0.2, 0.22, 0.2, 0.22][n - 1];
  const recurve = n >= 3;
  const tip = recurve ? [-0.04, H] : [0, H];
  const pts = recurve
    ? [[tip[0], -H, 0], [0.02, -H * 0.88, 0], [D * 0.85, -H * 0.45, 0], [D, 0, 0], [D * 0.85, H * 0.45, 0], [0.02, H * 0.88, 0], [tip[0], H, 0]]
    : [[0, -H, 0], [D * 0.75, -H * 0.5, 0], [D, 0, 0], [D * 0.75, H * 0.5, 0], [0, H, 0]];
  g.add(tube(pts, [0.016, 0.02, 0.022, 0.024][n - 1], n === 1 ? t.wood : tier(2).wood));
  g.add(cyl(0.003, 0.003, 2 * H, materials().vellum, { x: tip[0] + 0.004 }, 4));
  if (n >= 2) g.add(cyl(0.028, 0.028, 0.12, t.grip, { x: D }, 12));
  if (n >= 2) for (const s of [-1, 1]) g.add(ball(0.016, t.trim, { x: tip[0], y: s * H }));
  if (n >= 3) for (const s of [-1, 1]) g.add(ring(0.026, 0.006, t.trim, { x: D * 0.97, y: s * 0.075 }));
  if (n === 4) {
    for (const s of [-1, 1]) g.add(tube([[D * 0.85, s * H * 0.45, 0], [D * 0.5, s * H * 0.72, 0], [0.04, s * H * 0.92, 0]], 0.012, t.trim));
    g.add(gemAt(t, 0.016, { x: D + 0.026 }));
  }
  return laid(g, -0.55);
}

function staff(n) {
  const t = tier(n);
  const g = new THREE.Group();
  const L = 1.0;
  if (n === 1) {
    g.add(tube([[0, 0, 0], [0.012, L * 0.4, 0], [-0.01, L * 0.75, 0], [0.03, L, 0], [0.07, L + 0.04, 0]], 0.022, t.wood));
    g.add(ball(0.03, t.wood, { x: 0.012, y: L * 0.55, sy: 1.4 }));
    return laid(g, -0.3);
  }
  g.add(cyl(0.024, 0.02, L, t.wood, { y: L / 2 }, 10));
  g.add(cyl(0.02, 0.004, 0.06, t.trim, { y: -0.03 }, 8));
  for (const y of n === 2 ? [L * 0.5, L - 0.04] : [L * 0.5, L * 0.6, L - 0.04]) g.add(ring(0.024, 0.007, t.trim, { y }));
  if (n === 2) g.add(ball(0.04, t.trim, { y: L + 0.01, sy: 0.8 }));
  if (n >= 3) {
    const cage = n === 3 ? 3 : 4, r = n === 3 ? 0.05 : 0.065, top = L + (n === 3 ? 0.14 : 0.18);
    for (let i = 0; i < cage; i++) {
      const a = (i / cage) * Math.PI * 2;
      g.add(tube([[0, L - 0.02, 0], [Math.cos(a) * r, L + 0.05, Math.sin(a) * r], [Math.cos(a) * r * 0.9, top - 0.04, Math.sin(a) * r * 0.9], [0, top, 0]], 0.007, t.trim));
    }
    g.add(part(new THREE.OctahedronGeometry(n === 3 ? 0.04 : 0.052, 0), t.gem, { y: L + 0.07 + (n === 4 ? 0.02 : 0), sy: 1.5 }));
  }
  if (n === 4) g.add(cyl(0.028, 0.028, 0.22, t.grip, { y: L * 0.4 }, 12));
  return laid(g, -0.3);
}

// --- armour (stood upright, front at +z, turned a little toward the camera) ----------------

function helm(n) {
  const t = tier(n);
  const g = new THREE.Group();
  if (n === 1) {
    // a kettle hat: a low iron bowl with a wide brim
    g.add(lathe([[0.42, 0.0], [0.42, 0.012], [0.3, 0.03], [0.29, 0.12], [0.24, 0.24], [0.13, 0.31], [0.001, 0.33]], t.plate));
    g.add(ring(0.295, 0.012, t.trim, { y: 0.035 }));
    g.add(ring(0.42, 0.01, t.trim, { y: 0.006 }));
    g.rotation.x = 0.12;
    return g;
  }
  if (n === 4) {
    // a sugarloaf great helm: eye slit, gold cross and rims, a gold finial
    g.add(lathe([[0.27, 0], [0.29, 0.14], [0.29, 0.3], [0.25, 0.44], [0.15, 0.54], [0.001, 0.58]], t.plate));
    for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.15, 0.036, 0.08), materials().black, { x: s * 0.1, y: 0.31, z: 0.26, ry: s * -0.35 }));
    g.add(part(new THREE.BoxGeometry(0.05, 0.42, 0.03), t.trim, { y: 0.24, z: 0.29 }));
    g.add(part(new THREE.BoxGeometry(0.34, 0.04, 0.03), t.trim, { y: 0.36, z: 0.275 }));
    for (const [y, r] of [[0.02, 0.28], [0.44, 0.25]]) g.add(ring(r, 0.013, t.trim, { y }));
    g.add(ball(0.03, t.trim, { y: 0.585 }));
    g.add(gemAt(t, 0.024, { y: 0.36, z: 0.3 }));
    g.rotation.y = 0.85;
    return g;
  }
  // a spangenhelm: ribbed dome, brow band, nasal; tier 3 adds cheek plates and a spike
  const prof = [[0.32, 0.02], [0.315, 0.1], [0.3, 0.22], [0.25, 0.36], [0.16, 0.48], [0.06, 0.55], [0.001, 0.56]];
  g.add(lathe(prof, t.plate));
  g.add(part(new THREE.CylinderGeometry(0.335, 0.338, 0.085, 48, 1, true), n === 3 ? t.trim : t.plate, { y: 0.06 }));
  const ribs = n === 3 ? 6 : 4;
  for (let k = 0; k < ribs; k++) {
    const rib = tube(prof.slice(0, 6).map(([r, y]) => [r * 1.03, y, 0]), 0.016, t.trim);
    rib.rotation.y = (k / ribs) * Math.PI * 2 + Math.PI / ribs;
    g.add(rib);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(ball(0.014, t.trim, { x: Math.cos(a) * 0.34, y: 0.06, z: Math.sin(a) * 0.34 }));
  }
  const nasal = new THREE.BoxGeometry(0.06, 0.24, 0.02);
  nasal.translate(0, -0.08, 0);
  g.add(part(nasal, n === 3 ? t.trim : t.plate, { y: 0.08, z: 0.34, rx: 0.06 }));
  if (n === 3) {
    for (const s of [-1, 1]) {
      const cheek = new THREE.CylinderGeometry(0.33, 0.3, 0.22, 16, 1, true, 0, 0.75);
      cheek.translate(0, -0.11, 0);
      g.add(part(cheek, t.plate, { y: 0.04, ry: s > 0 ? 0.25 : Math.PI - 1.0 }));
    }
    g.add(cyl(0.03, 0.001, 0.14, t.trim, { y: 0.62 }, 8));
  } else g.add(ball(0.03, t.trim, { y: 0.56 }));
  g.rotation.y = 0.55;
  g.position.y = n === 3 ? 0.18 : 0.16;
  return g;
}

/** A torso shell, flattened front to back. */
const torso = (m) => part(new THREE.LatheGeometry([[0.17, 0], [0.2, 0.1], [0.22, 0.22], [0.23, 0.32], [0.2, 0.38], [0.11, 0.42], [0.08, 0.43]].map(([r, y]) => new THREE.Vector2(r, y)), 36), m, { sz: 0.62 });

function cuirass(n) {
  const t = tier(n);
  const g = new THREE.Group();
  g.add(torso(n === 1 ? tier(1).cloth : t.plate));
  const rim = (y, r, o = {}) => g.add(ring(r, 0.012, t.trim, { y, sy: 0.62, ...o }));
  if (n === 1) {
    for (let y = 0.05; y < 0.36; y += 0.055) g.add(ring(0.205 + Math.min(y, 0.3) * 0.08, 0.004, materials().black, { y, sy: 0.63 }));
    for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.02, 0.36, 0.006), t.trim, { x: s * 0.04, y: 0.2, z: 0.12 }));
  }
  if (n >= 2) {
    rim(0.0, 0.17);
    rim(0.425, 0.085);
    g.add(part(new THREE.BoxGeometry(0.016, 0.36, 0.03), t.trim, { y: 0.2, z: 0.142 }));
  }
  if (n >= 3) {
    for (const s of [-1, 1]) {
      const lames = n === 4 ? 2 : 1;
      for (let i = 0; i < lames; i++) {
        const p = new THREE.SphereGeometry(0.11 - i * 0.015, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
        g.add(part(p, t.plate, { x: s * (0.21 + i * 0.03), y: 0.37 - i * 0.05, rz: -s * 0.9 }));
        g.add(ring(0.11 - i * 0.015, 0.008, t.trim, { x: s * (0.21 + i * 0.03), y: 0.37 - i * 0.05, rx: Math.PI / 2, ry: s * 0.9 }));
      }
    }
  }
  if (n === 4) {
    g.add(lathe([[0.25, -0.2], [0.2, -0.1], [0.165, 0.0]], t.cloth).translateY(0));
    g.children[g.children.length - 1].scale.z = 0.62;
    g.add(ball(0.035, t.trim, { y: 0.27, z: 0.14, sz: 0.5 }));
    g.add(gemAt(t, 0.022, { y: 0.27, z: 0.152 }));
  }
  g.rotation.y = 0.85;
  g.position.y = n === 4 ? 0.2 : 0;
  return g;
}

function hand(n, t) {
  const h = new THREE.Group();
  const skin = n >= 3 ? t.plate : t.grip;
  const finger = (m, r, len, o) => part(new THREE.CapsuleGeometry(r, len, 4, 10), m, { rx: Math.PI / 2, ...o });
  h.add(ball(0.06, skin, { y: 0.024, sy: 0.4, sz: 1.05 }));
  if (n === 2) h.add(ball(0.056, t.blade, { y: 0.034, z: 0.0, sy: 0.32, sz: 0.8 }));
  for (let f = 0; f < 4; f++) {
    const x = -0.039 + f * 0.026, len = [0.05, 0.062, 0.066, 0.056][f];
    h.add(finger(t.grip === materials().crimson ? tier(3).grip : t.grip, 0.011, len, { x, y: 0.02, z: 0.065 + len / 2 }));
    if (n >= 2) h.add(finger(n === 2 ? t.blade : t.plate, 0.0125, len * 0.45, { x, y: 0.026, z: 0.07 + len * 0.15 }));
    if (n >= 3) h.add(finger(t.plate, 0.0125, len * 0.35, { x, y: 0.026, z: 0.075 + len * 0.62 }));
  }
  h.add(finger(skin, 0.012, 0.045, { x: 0.068, y: 0.02, z: 0.03, ry: -0.7 }));
  if (n >= 3) h.add(part(new THREE.BoxGeometry(0.108, 0.012, 0.014), t.trim, { y: 0.042, z: 0.06 }));
  const flare = [0.055, 0.065, 0.08, 0.09][n - 1];
  h.add(part(new THREE.CylinderGeometry(flare, 0.052, 0.12, 20, 1, true), n === 1 ? t.grip : n === 2 ? t.blade : t.plate, { y: 0.04, z: -0.1, rx: -Math.PI / 2 }));
  if (n >= 2) h.add(ring(flare, 0.007, t.trim, { y: 0.04, z: -0.16, rx: 0 }));
  if (n === 4) h.add(gemAt(t, 0.016, { y: 0.1, z: -0.11 }));
  return h;
}

function gauntlets(n) {
  const t = tier(n);
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const h = hand(n, t);
    h.position.set(s * 0.09, 0, 0);
    h.rotation.y = s * 0.3;
    if (s > 0) h.scale.x = -1;
    g.add(h);
  }
  return g;
}

function greaves(n) {
  const t = tier(n);
  const g = new THREE.Group();
  const shell = n === 1 ? t.cloth : t.plate;
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.add(lathe([[0.034, -0.18], [0.04, -0.12], [0.056, 0.0], [0.05, 0.12], [0.046, 0.17]], shell, 24));
    l.add(ball(n >= 3 ? 0.06 : 0.054, n === 1 ? t.trim : t.plate, { y: 0.2, sz: 0.9 }));
    if (n >= 3) l.add(lathe([[0.052, 0.24], [0.064, 0.38], [0.07, 0.52]], t.plate, 24));
    if (n >= 2) for (const [y, r] of [[-0.17, 0.036], [0.16, 0.047]]) l.add(ring(r, 0.006, t.trim, { y }));
    if (n >= 3) {
      l.add(slab([[0, -0.04], [0.07, 0], [0, 0.05]], 0.008, t.trim, { x: 0.05, y: 0.2, ry: Math.PI / 2 }));
      l.add(ring(0.066, 0.007, t.trim, { y: 0.52 }));
    }
    if (n === 4) l.add(gemAt(t, 0.016, { y: 0.2, z: 0.06 }));
    l.rotation.x = Math.PI / 2;
    l.position.set(s * 0.08, 0.06, 0);
    l.rotation.z = s * 0.06;
    g.add(l);
  }
  g.rotation.y = 0.35;
  return g;
}

function boot(n, t) {
  const b = new THREE.Group();
  const H = [0.2, 0.24, 0.26, 0.28][n - 1];
  b.add(cyl(0.05, 0.055, H, t.grip === materials().crimson ? tier(3).grip : n === 1 ? t.grip : tier(2).grip, { y: 0.03 + H / 2 }, 16));
  b.add(ball(0.055, n >= 3 ? t.plate : n === 1 ? t.grip : tier(2).grip, { y: 0.04, z: 0.06, sx: 0.95, sy: 0.75, sz: 1.9 }));
  b.add(part(new THREE.BoxGeometry(0.09, 0.014, 0.2), tier(1).trim, { y: 0.007, z: 0.06 }));
  if (n === 1) b.add(cyl(0.065, 0.058, 0.05, t.grip, { y: H }, 16));
  if (n === 2) {
    b.add(ball(0.05, t.blade, { y: 0.045, z: 0.13, sy: 0.7, sz: 1 }));
    b.add(ring(0.054, 0.007, t.trim, { y: 0.09 }));
    b.add(part(new THREE.BoxGeometry(0.02, 0.02, 0.01), t.trim, { x: 0.04, y: 0.09, z: 0.04 }));
  }
  if (n >= 3) {
    b.add(cyl(0.056, 0.06, H * 0.8, t.plate, { y: 0.06 + H * 0.45, sz: 0.7, z: 0.01 }, 16));
    b.add(ball(0.052, t.trim, { y: 0.05, z: 0.15, sx: 0.9, sy: 0.6, sz: 0.5 }));
    b.add(ring(0.062, 0.007, t.trim, { y: 0.06 + H * 0.85 }));
  }
  if (n === 4) {
    b.add(cyl(0.006, 0.006, 0.08, t.trim, { y: 0.07, z: -0.09, rx: Math.PI / 2 }, 6));
    b.add(ring(0.018, 0.005, t.trim, { y: 0.07, z: -0.135, rx: 0 }));
    b.add(gemAt(t, 0.014, { y: 0.06 + H * 0.6, z: 0.05 }));
  }
  return b;
}

function boots(n) {
  const t = tier(n);
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const b = boot(n, t);
    b.position.set(s * 0.075, 0, s * -0.03);
    b.rotation.y = s * 0.12;
    g.add(b);
  }
  g.rotation.y = 0.5;
  return g;
}

function ringIcon(n) {
  const t = tier(n);
  const g = new THREE.Group();
  const r = 0.07, tb = [0.012, 0.014, 0.015, 0.016][n - 1];
  g.add(part(new THREE.TorusGeometry(r, tb, 12, 40), n === 1 ? t.plate : t.trim));
  const top = r + tb;
  if (n === 2) g.add(cyl(0.03, 0.03, 0.012, t.trim, { y: top + 0.002 }, 20));
  if (n >= 3) {
    g.add(cyl(0.022, 0.028, 0.02, t.trim, { y: top + 0.006 }, 20));
    g.add(part(new THREE.OctahedronGeometry(0.024, 0), t.gem, { y: top + 0.026, sy: 0.8, ry: 0.4 }));
  }
  if (n === 4) for (let i = 0; i < 4; i++) g.add(cyl(0.004, 0.003, 0.036, t.trim, { x: Math.cos(i * 1.57 + 0.78) * 0.022, y: top + 0.024, z: Math.sin(i * 1.57 + 0.78) * 0.022 }, 5));
  g.rotation.set(-0.45, 0.5, 0);
  g.position.y = r + tb;
  return g;
}

const BUILDERS = {
  sword: (n) => hilted(n),
  dagger: (n) => hilted(n, { dagger: true }),
  axe, mace, spear, bow, staff,
  helm, cuirass, gauntlets, greaves, boots,
  ring: ringIcon,
};

/** Every gear icon as `<name>_t<tier>`, the names the client's itemIcon resolves to. */
export function gearIcons() {
  const out = {};
  for (const [name, build] of Object.entries(BUILDERS)) for (let n = 1; n <= 4; n++) out[`${name}_t${n}`] = () => build(n);
  return out;
}
