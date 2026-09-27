// Procedural canvas textures and the shared material set. Grit lives here: weave, grain, rust,
// grime. Colours are BARROW-derived (palette.js).

import * as THREE from "three";
import { fbm, smoothstep, vnoise } from "./noise.js";
import { color, cssRgb, grey, mix, shade } from "./palette.js";

export const mkCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export function canvasTexture(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A texture painted per pixel by `fn(x, y) -> [r, g, b]`. */
export function pixelTexture(w, h, fn, repeat = 1) {
  const c = mkCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, repeat);
}

// Base tones, all from tokens.
export const TONE = {
  iron: mix("slate", "slateLight", 0.4),
  steel: mix("slateLight", "vellum", 0.5),
  rust: mix("ember", "barrowDeep", 0.45),
  brass: mix("brass", "brassBright", 0.6),
  gold: mix("brassBright", "amberBright", 0.35),
  wood: mix("barrowBrown", "brass", 0.25),
  woodDark: mix("barrowDeep", "barrowBrown", 0.25),
  staves: mix("barrowBrown", "brass", 0.35),
  bark: mix("barrowDeep", "barrowBrown", 0.55),
  stone: mix("slateLight", "vellumFaint", 0.45),
  cap: mix("slate", "slateLight", 0.7),
  beam: mix("barrowDeep", "charcoal", 0.3),
  cloth: mix("oxblood", "barrowBrown", 0.25),
  leather: mix("barrowBrown", "barrowDeep", 0.4),
  vellum: "vellum",
  moss: "arcaneDeep",
  bone: mix("vellum", "vellumDark", 0.3),
};

const TEX = {
  cloth: (c, s = 1) =>
    pixelTexture(128, 128, (x, y) =>
      shade(c, (0.72 + 0.5 * fbm(x / 14, y / 14, s)) * ((x + y) % 4 < 2 ? 1 : 0.9) * (0.92 + 0.12 * vnoise(x / 2, y / 40, s + 3))),
    ),
  leather: (c, s = 2) =>
    pixelTexture(128, 128, (x, y) =>
      shade(c, (0.7 + 0.5 * fbm(x / 9, y / 9, s)) * (vnoise(x / 2.5, y / 22, s + 5) > 0.78 ? 0.7 : 1)),
    ),
  wood: (c, s = 5) =>
    pixelTexture(128, 128, (x, y) =>
      shade(c, 0.7 + 0.18 * Math.sin(x * 0.25 + fbm(x / 30, y / 8, s) * 8) + 0.3 * fbm(x / 6, y / 40, s + 1)),
    ),
  staves: (c) =>
    pixelTexture(128, 64, (x, y) =>
      shade(c, (x % 16 < 1.5 ? 0.35 : 1) * (0.7 + 0.18 * Math.sin(x * 0.9 + fbm(x / 8, y / 12, 5) * 6) + 0.25 * fbm(x / 6, y / 30, 6))),
    ),
  metal: (c, rust = 0, s = 6) =>
    pixelTexture(128, 128, (x, y) =>
      mix(
        shade(c, (0.75 + 0.35 * fbm(x / 10, y / 10, s)) * (vnoise(x / 1.5, y / 30, s + 4) > 0.85 ? 1.15 : 1)),
        TONE.rust,
        rust * smoothstep(0.45, 0.7, fbm(x / 14, y / 14, s + 8)),
      ),
    ),
  stone: (c, s = 7) =>
    pixelTexture(128, 128, (x, y) =>
      shade(c, (0.65 + 0.45 * fbm(x / 16, y / 16, s)) * (0.9 + 0.2 * fbm(x / 5, y / 5, s + 3)) * (Math.abs(vnoise(x / 12, y / 12, s + 6) - 0.5) < 0.02 ? 0.55 : 1)),
    ),
  bark: (s = 8) =>
    pixelTexture(64, 128, (x, y) =>
      shade(TONE.bark, 0.45 + 0.55 * Math.abs(Math.sin(x * 0.45 + fbm(x / 5, y / 30, s) * 5)) * (0.7 + 0.5 * fbm(x / 3, y / 6, s + 1))),
    ),
  bone: (s = 4) =>
    pixelTexture(128, 128, (x, y) =>
      mix(shade(TONE.bone, 0.8 + 0.3 * fbm(x / 12, y / 12, s)), mix("barrowBrown", "barrowDeep", 0.3), 0.8 * smoothstep(0.55, 0.75, fbm(x / 20, y / 20, s + 2))),
    ),
};

/** A textured standard material; the texture doubles as its bump map. */
export function textured(tex, o = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    bumpMap: tex,
    bumpScale: o.bump ?? 0.5,
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
    side: o.side ?? THREE.FrontSide,
    vertexColors: !!o.vc,
  });
}

/** A self-lit material (flame, coal, lit glass): black albedo, emissive colour. */
export const glow = (c, intensity = 2.5) =>
  new THREE.MeshStandardMaterial({ color: color(grey(0)), emissive: color(c), emissiveIntensity: intensity });

export const plain = (c, o = {}) =>
  new THREE.MeshStandardMaterial({
    color: color(c),
    roughness: o.rough ?? 0.9,
    metalness: o.metal ?? 0,
    flatShading: !!o.flat,
    side: o.side ?? THREE.FrontSide,
    ...(o.emissive ? { emissive: color(o.emissive), emissiveIntensity: o.ei ?? 1 } : {}),
  });

let MAT = null;

/** The shared material set, built once per bake (textures are seeded, so it is deterministic). */
export function materials() {
  if (MAT) return MAT;
  const D = THREE.DoubleSide;
  MAT = {
    steel: textured(TEX.metal(TONE.steel), { metal: 0.85, rough: 0.32 }),
    iron: textured(TEX.metal(TONE.iron, 0.5), { metal: 0.7, rough: 0.6 }),
    ironDouble: textured(TEX.metal(TONE.iron, 0.5), { metal: 0.7, rough: 0.6, side: D }),
    rust: textured(TEX.metal(shade(TONE.iron, 1.4), 1), { metal: 0.5, rough: 0.7 }),
    brass: textured(TEX.metal(TONE.brass), { metal: 0.9, rough: 0.35 }),
    gold: textured(TEX.metal(TONE.gold), { metal: 1, rough: 0.3 }),
    wood: textured(TEX.wood(TONE.wood)),
    woodDark: textured(TEX.wood(TONE.woodDark, 7)),
    staves: textured(TEX.staves(TONE.staves)),
    bark: textured(TEX.bark(), { rough: 1 }),
    stone: textured(TEX.stone(TONE.stone), { rough: 0.95 }),
    stoneVc: textured(TEX.stone(shade(TONE.stone, 1.12), 3), { rough: 0.95, vc: true }),
    cap: textured(TEX.stone(TONE.cap, 5), { rough: 0.95 }),
    beam: textured(TEX.wood(TONE.beam, 9), { rough: 0.9 }),
    cushion: textured(TEX.cloth(mix("arcaneDeep", "barrowDeep", 0.2), 14)),
    crimson: textured(TEX.cloth(TONE.cloth, 1), { side: D }),
    leather: textured(TEX.leather(TONE.leather, 3)),
    vellum: textured(TEX.cloth(TONE.vellum, 15)),
    bone: textured(TEX.bone(), { rough: 0.7 }),
    black: plain("pitch", { rough: 1 }),
    flame: glow("amberBright", 3),
    coal: glow("ember", 2.2),
    ember: glow(shade("ember", 1.25), 4),
    arcane: glow("arcane", 3),
    glass: glow("amberBright", 1.8),
  };
  return MAT;
}

/** The painted mask a leaf card is cut from (alphaTest), cached per kind. */
const LEAF = {};
export function leafTexture(needle, rng) {
  const key = needle ? "needle" : "leaf";
  if (LEAF[key]) return LEAF[key];
  const S = 128;
  const c = mkCanvas(S, S);
  const ctx = c.getContext("2d");
  const R = rng(needle ? 5 : 3);
  const base = mix("vellum", grey(255), 0.55);
  for (let i = 0; i < (needle ? 110 : 80); i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 52;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const l = 0.62 + R() * 0.5 - (y - 64) / 260;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(needle ? a + (R() - 0.5) * 0.6 : R() * Math.PI * 2);
    ctx.beginPath();
    if (needle) ctx.ellipse(0, 0, 10, 1.4, 0, 0, Math.PI * 2);
    else ctx.ellipse(0, 0, 7, 3.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = cssRgb(shade(base, l));
    ctx.fill();
    ctx.strokeStyle = cssRgb(grey(0), 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (LEAF[key] = t);
}
