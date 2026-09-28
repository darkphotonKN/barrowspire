// Character materials (ADR-0021 §2): procedurally generated albedo and normal maps for mail,
// plate, leather, wool, linen, skin, bone, hide and hair, with rust and grime worked in.
// Every colour is a BARROW token or a blend of tokens (palette.js); every texture tiles and is
// seeded, so a re-bake paints identical pixels.
//
// At game scale a mail ring is sub-pixel. What survives the downsample is the material's
// character: mail glitters in a fine grey mottle, plate carries broad highlights, wool is matte
// and soft, leather is dark with scuffed highlights. The normal maps are what make the key light
// pick those out.

import * as THREE from "three";
import { fbm, smoothstep, voronoi, hash2 } from "../noise.js";
import { mkCanvas } from "../materials.js";
import { mix, shade } from "../palette.js";

const S = 128;

/**
 * Paints a tile: `fn(x, y) → { c: [r, g, b], h: height 0..1 }`. Returns the colour texture and a
 * tangent-space normal map derived from the height by central differences.
 */
function paint(fn, { strength = 2, repeat = 1 } = {}) {
  const col = mkCanvas(S, S);
  const nrm = mkCanvas(S, S);
  const ci = col.getContext("2d").createImageData(S, S);
  const ni = nrm.getContext("2d").createImageData(S, S);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const { c, h: hv } = fn(x, y);
      const i = (y * S + x) * 4;
      ci.data[i] = Math.max(0, Math.min(255, c[0]));
      ci.data[i + 1] = Math.max(0, Math.min(255, c[1]));
      ci.data[i + 2] = Math.max(0, Math.min(255, c[2]));
      ci.data[i + 3] = 255;
      h[y * S + x] = hv;
    }
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      ni.data[i] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      ni.data[i + 1] = Math.round(((dy / l) * 0.5 + 0.5) * 255);
      ni.data[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      ni.data[i + 3] = 255;
    }
  col.getContext("2d").putImageData(ci, 0, 0);
  nrm.getContext("2d").putImageData(ni, 0, 0);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(col, true), normalMap: tex(nrm, false) };
}

// Periodic noise helpers: every lattice period divides the tile, so textures tile.
const pf = (x, y, cell, s, oct = 4) => fbm(x / cell, y / cell, s, oct, S / cell);
/** Value noise stretched cx by cy px, tiling the S-px tile (cx and cy must divide S). */
function pn(x, y, cx, cy, s) {
  const px = S / cx;
  const py = S / cy;
  const u = x / cx;
  const v = y / cy;
  const xi = Math.floor(u);
  const yi = Math.floor(v);
  const fu = u - xi;
  const fv = v - yi;
  const f = (t) => t * t * (3 - 2 * t);
  const m = (a, p) => ((a % p) + p) % p;
  const h = (i, j) => hash2(m(xi + i, px), m(yi + j, py), s);
  const a = h(0, 0);
  const b = h(1, 0);
  const c = h(0, 1);
  const d = h(1, 1);
  const tu = f(fu);
  const tv = f(fv);
  return a + (b - a) * tu + (c - a) * tv + (a - b - c + d) * tu * tv;
}

/** Grime: darkens crevices and random patches (0 clean .. 1 filthy). */
const grime = (c, amount, x, y, s) => shade(c, 1 - 0.45 * amount * smoothstep(0.25, 0.9, pf(x, y, 16, s, 3)));

// --- patterns ------------------------------------------------------------------------------

function mail(tone, { rust = 0.15, dirt = 0.4, seed = 1 } = {}) {
  const cw = 8;
  const rh = 6.4;
  const R = 3.3;
  const th = 1.15;
  return paint(
    (x, y) => {
      let h = 0;
      const row = Math.floor(y / rh);
      for (let j = row - 1; j <= row + 1; j++) {
        const off = (((j % 2) + 2) % 2) * (cw / 2);
        const col = Math.floor((x - off) / cw);
        for (let i = col - 1; i <= col + 1; i++) {
          const cx = i * cw + off + cw / 2;
          const cy = j * rh + rh / 2;
          const d = Math.abs(Math.hypot(x - cx, (y - cy) * 1.15) - R);
          // rings lower in the row sit on top of the ones above: a scale-like overlap
          const v = Math.max(0, 1 - d / th) * (0.75 + 0.25 * ((cy - y) / rh + 0.5));
          h = Math.max(h, v);
        }
      }
      const glint = 0.8 + 0.4 * pn(x, y, 4, 4, seed + 2);
      let c = mix(shade(tone, 0.18), shade(tone, 1.05 * glint), h);
      c = mix(c, mix("ember", "barrowDeep", 0.45), rust * smoothstep(0.55, 0.8, pf(x, y, 16, seed + 5)) * h);
      return { c: grime(c, dirt, x, y, seed), h };
    },
    { strength: 1.6, repeat: 1 },
  );
}

function plate(tone, { dents = 0.5, rust = 0.1, dirt = 0.3, seed = 3 } = {}) {
  return paint(
    (x, y) => {
      const brushed = pn(x, y, 1, 32, seed) * 0.12;
      const dent = pf(x, y, 16, seed + 1) * dents;
      const scratch = hash2(Math.floor(x / 2), Math.floor((y + x * 0.35) / 1), seed) > 0.985 ? 0.25 : 0;
      const h = 0.5 + brushed - dent * 0.6 - scratch * 0.5;
      let c = shade(tone, 0.82 + brushed * 1.4 + 0.25 * pf(x, y, 32, seed + 2) + scratch);
      c = mix(c, mix("ember", "barrowDeep", 0.5), rust * smoothstep(0.6, 0.85, pf(x, y, 16, seed + 7)));
      return { c: grime(c, dirt, x, y, seed + 3), h };
    },
    { strength: 1.2 },
  );
}

function leather(tone, { dirt = 0.35, seed = 5 } = {}) {
  return paint(
    (x, y) => {
      const v = voronoi(x / 4, y / 4, seed, S / 4);
      const grain = smoothstep(0, 0.35, v.f2 - v.f1);
      const crease = 1 - smoothstep(0.02, 0.07, Math.abs(pf(x, y, 32, seed + 1) - 0.5));
      const h = 0.5 + 0.18 * grain - 0.35 * crease;
      const scuff = smoothstep(0.62, 0.8, pf(x, y, 16, seed + 2));
      let c = shade(tone, 0.72 + 0.28 * grain + 0.35 * pf(x, y, 32, seed + 3) - 0.25 * crease);
      c = mix(c, shade(tone, 1.5), 0.35 * scuff);
      return { c: grime(c, dirt, x, y, seed + 4), h };
    },
    { strength: 1.8 },
  );
}

function wool(tone, { dirt = 0.35, seed = 7 } = {}) {
  return paint(
    (x, y) => {
      // 2/2 twill: diagonal ribs, plus loose fibre
      const rib = 0.5 + 0.5 * Math.sin(((x + y) * Math.PI) / 2);
      const fibre = pn(x, y, 2, 2, seed);
      const h = 0.35 * rib + 0.4 * fibre + 0.25 * pf(x, y, 16, seed + 1);
      const heather = 0.9 + 0.1 * pf(x, y, 16, seed + 2) + 0.05 * fibre;
      const c = shade(tone, heather * (0.94 + 0.08 * rib));
      return { c: grime(c, dirt, x, y, seed + 3), h };
    },
    { strength: 0.7 },
  );
}

function linen(tone, { dirt = 0.25, seed = 9 } = {}) {
  return paint(
    (x, y) => {
      const wx = 0.5 + 0.5 * Math.sin((x * Math.PI) / 2);
      const wy = 0.5 + 0.5 * Math.sin((y * Math.PI) / 2);
      const h = 0.5 * (x % 4 < 2 ? wx : wy) + 0.3 * pn(x, y, 1, 8, seed);
      const c = shade(tone, 0.84 + 0.18 * pf(x, y, 16, seed + 1) + 0.08 * h);
      return { c: grime(c, dirt, x, y, seed + 2), h };
    },
    { strength: 1.0 },
  );
}

function skin(tone, { seed = 11 } = {}) {
  return paint(
    (x, y) => {
      const m = pf(x, y, 16, seed);
      return { c: mix(shade(tone, 0.9 + 0.2 * m), "oxblood", 0.08 * smoothstep(0.5, 0.8, pf(x, y, 32, seed + 1))), h: 0.5 + 0.1 * m };
    },
    { strength: 0.8 },
  );
}

function bone(tone, { seed = 13 } = {}) {
  return paint(
    (x, y) => {
      const v = voronoi(x / 32, y / 32, seed, S / 32);
      const crack = 1 - smoothstep(0.0, 0.05, v.f2 - v.f1);
      const pits = smoothstep(0.7, 0.9, pn(x, y, 4, 4, seed + 1));
      const h = 0.6 - 0.4 * crack - 0.2 * pits + 0.15 * pf(x, y, 16, seed + 2);
      let c = shade(tone, 0.82 + 0.25 * pf(x, y, 16, seed + 3) - 0.35 * crack - 0.2 * pits);
      c = mix(c, mix("barrowBrown", "barrowDeep", 0.4), 0.55 * smoothstep(0.5, 0.78, pf(x, y, 32, seed + 4)));
      return { c, h };
    },
    { strength: 1.6 },
  );
}

function hide(tone, { seed = 15 } = {}) {
  return paint(
    (x, y) => {
      const v = voronoi(x / 8, y / 8, seed, S / 8);
      const wart = smoothstep(0.45, 0.0, v.f1) * (0.4 + 0.6 * pf(x, y, 16, seed + 3));
      const crease = 1 - smoothstep(0.0, 0.1, v.f2 - v.f1);
      const h = 0.4 + 0.3 * wart - 0.25 * crease + 0.3 * pf(x, y, 16, seed + 4);
      let c = shade(tone, 0.7 + 0.15 * wart - 0.2 * crease + 0.45 * pf(x, y, 32, seed + 1));
      c = mix(c, mix("barrowDeep", "barrowBrown", 0.4), 0.45 * smoothstep(0.4, 0.75, pf(x, y, 32, seed + 2)));
      return { c, h };
    },
    { strength: 2.2 },
  );
}

function hair(tone, { seed = 17 } = {}) {
  return paint(
    (x, y) => {
      const strand = pn(x, y, 1, 32, seed);
      return { c: shade(tone, 0.7 + 0.5 * strand), h: strand };
    },
    { strength: 1.2 },
  );
}

function rag(tone, { seed = 19 } = {}) {
  return paint(
    (x, y) => {
      const weave = 0.5 + 0.25 * Math.sin((x * Math.PI) / 2) * Math.sin((y * Math.PI) / 2);
      const hole = smoothstep(0.7, 0.78, pf(x, y, 16, seed));
      const stain = smoothstep(0.4, 0.8, pf(x, y, 32, seed + 1));
      const h = weave * (1 - hole) + 0.2 * pn(x, y, 2, 2, seed + 2);
      let c = shade(tone, 0.8 + 0.2 * weave - 0.55 * hole);
      c = mix(c, mix("barrowDeep", "pitch", 0.5), 0.5 * stain);
      return { c, h };
    },
    { strength: 1.2 },
  );
}

// --- materials -----------------------------------------------------------------------------

function mat(tex, o = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
    side: o.side ?? THREE.FrontSide,
  });
}

/** Tones for character gear, all from BARROW. */
export const GEAR = {
  steel: mix("slateLight", "vellum", 0.38),
  mail: mix("slateLight", "vellum", 0.35),
  blackIron: mix("slate", "pitch", 0.35),
  darkSteel: mix("slate", "slateLight", 0.7),
  rustIron: mix("slateLight", "ember", 0.25),
  leather: mix("barrowBrown", "barrowDeep", 0.3),
  leatherLight: mix("barrowBrown", "brass", 0.3),
  leatherDark: mix("barrowDeep", "pitch", 0.35),
  tabard: mix("oxblood", "barrowDeep", 0.15),
  cloakKnight: mix("charcoal", "slate", 0.55),
  ranger: mix("arcaneDeep", "barrowDeep", 0.4),
  rangerDark: mix("arcaneDeep", "pitch", 0.45),
  breeches: mix("barrowDeep", "slate", 0.35),
  robe: mix("necrotic", "charcoal", 0.52),
  robeDark: mix("necrotic", "pitch", 0.62),
  linen: mix("vellum", "vellumDark", 0.4),
  skin: shade(mix("vellum", "oxbloodText", 0.45), 0.68),
  beard: mix("vellum", "slateLight", 0.2),
  bone: mix("vellum", "vellumDark", 0.35),
  troll: mix(mix("arcaneDeep", "slate", 0.55), "barrowBrown", 0.3),
  trollBelly: mix("arcaneDeep", "vellumFaint", 0.35),
  rag: mix("barrowBrown", "slate", 0.45),
  fur: mix("barrowBrown", "barrowDeep", 0.55),
  // hub folk (FS-2325V §G): undyed and plant-dyed homespun, nothing heraldic
  // undyed linen, warmed toward rose: a khaki sleeve reads as grave-rot skin at 1x
  shirt: mix(mix("vellum", "barrowBrown", 0.4), "oxbloodText", 0.18),
  wardWool: mix("charcoal", "necrotic", 0.2),
  felt: mix("barrowDeep", "slate", 0.5),
  apron: mix("barrowBrown", "brass", 0.4),
  hairGrey: mix("slateLight", "vellumDark", 0.45),
};

/**
 * A hub resident's palette (FS-2325V §G.2): the name is the first half of the server's
 * `appearance` ("rust" in "rust_trousers"). `cloth` is the main garment (tunic, kirtle), `under`
 * the second (trousers, shawl), `hair` the hair. Earthy, muted dyes; none of them a delver's
 * heraldic red or a channel colour at full strength.
 */
export const FOLK_PALETTES = {
  rust: { cloth: mix("ember", "barrowBrown", 0.55), under: mix("barrowDeep", "slate", 0.35), hair: mix("barrowBrown", "barrowDeep", 0.25) },
  slate: { cloth: mix("slate", "necrotic", 0.3), under: mix("barrowBrown", "barrowDeep", 0.45), hair: mix("pitch", "barrowDeep", 0.45) },
  green: { cloth: mix("arcaneDeep", "barrowBrown", 0.4), under: mix("barrowBrown", "barrowDeep", 0.5), hair: mix("ember", "barrowDeep", 0.6) },
  flax: { cloth: mix("vellumDark", "slate", 0.45), under: mix("barrowDeep", "arcaneDeep", 0.3), hair: mix("vellumDark", "brass", 0.4) },
};

const FOLK_SETS = {};

/** One resident palette's materials, painted once per bake and seeded by its place in the list. */
export function folkFabrics(name) {
  if (FOLK_SETS[name]) return FOLK_SETS[name];
  const tones = FOLK_PALETTES[name];
  if (!tones) throw new Error(`fabrics: no folk palette "${name}"`);
  const seed = 101 + Object.keys(FOLK_PALETTES).indexOf(name) * 10;
  const D = THREE.DoubleSide;
  return (FOLK_SETS[name] = {
    cloth: mat(wool(tones.cloth, { seed, dirt: 0.4 }), { side: D }),
    under: mat(wool(tones.under, { seed: seed + 1, dirt: 0.45 }), { side: D }),
    hair: mat(hair(tones.hair, { seed: seed + 2 }), { rough: 0.85 }),
  });
}

let SET = null;

/** The character material set, painted once per bake. */
export function fabrics() {
  if (SET) return SET;
  const D = THREE.DoubleSide;
  SET = {
    mail: mat(mail(GEAR.mail), { metal: 0.8, rough: 0.45, normal: 1.2 }),
    mailDark: mat(mail(GEAR.blackIron, { rust: 0.35, dirt: 0.5, seed: 4 }), { metal: 0.7, rough: 0.55 }),
    steel: mat(plate(GEAR.steel), { metal: 0.85, rough: 0.3 }),
    steelDouble: mat(plate(GEAR.steel), { metal: 0.85, rough: 0.3, side: D }),
    blackIron: mat(plate(GEAR.blackIron, { rust: 0.3, seed: 6 }), { metal: 0.7, rough: 0.5 }),
    darkSteel: mat(plate(GEAR.darkSteel, { rust: 0.2, seed: 10 }), { metal: 0.8, rough: 0.42 }),
    rustIron: mat(plate(GEAR.rustIron, { rust: 0.8, dents: 0.8, dirt: 0.5, seed: 8 }), { metal: 0.5, rough: 0.7 }),
    leather: mat(leather(GEAR.leather), { rough: 0.7 }),
    leatherLight: mat(leather(GEAR.leatherLight, { seed: 21 }), { rough: 0.72 }),
    leatherDark: mat(leather(GEAR.leatherDark, { seed: 23 }), { rough: 0.65 }),
    leatherDouble: mat(leather(GEAR.leatherLight, { seed: 21 }), { rough: 0.72, side: D }),
    tabard: mat(wool(GEAR.tabard, { seed: 25 }), { side: D }),
    cloakKnight: mat(wool(GEAR.cloakKnight, { seed: 27, dirt: 0.5 }), { side: D }),
    ranger: mat(wool(GEAR.ranger, { seed: 29, dirt: 0.45 }), { side: D }),
    rangerDark: mat(wool(GEAR.rangerDark, { seed: 31 })),
    breeches: mat(wool(GEAR.breeches, { seed: 33 })),
    robe: mat(wool(GEAR.robe, { seed: 35, dirt: 0.3 }), { side: D }),
    robeDark: mat(wool(GEAR.robeDark, { seed: 37 }), { side: D }),
    linen: mat(linen(GEAR.linen)),
    skin: mat(skin(GEAR.skin), { rough: 0.6, normal: 0.5 }),
    beard: mat(hair(GEAR.beard), { rough: 0.9 }),
    bone: mat(bone(GEAR.bone), { rough: 0.7 }),
    troll: mat(hide(GEAR.troll), { rough: 0.7, normal: 0.9 }),
    trollBelly: mat(hide(GEAR.trollBelly, { seed: 39 }), { rough: 0.65 }),
    rag: mat(rag(GEAR.rag), { side: D }),
    fur: mat(hair(GEAR.fur, { seed: 41 }), { side: D }),
    shirt: mat(linen(GEAR.shirt, { seed: 43, dirt: 0.35 })),
    wardWool: mat(wool(GEAR.wardWool, { seed: 45, dirt: 0.5 }), { side: D }),
    felt: mat(wool(GEAR.felt, { seed: 47, dirt: 0.3 }), { side: D }),
    apron: mat(leather(GEAR.apron, { seed: 49, dirt: 0.5 }), { rough: 0.75, side: D }),
    hairGrey: mat(hair(GEAR.hairGrey, { seed: 51 }), { rough: 0.9 }),
  };
  return SET;
}
