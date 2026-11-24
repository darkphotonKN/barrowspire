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
import { color, grey, mix, shade } from "../palette.js";
import { browMaterial, faceMaterial } from "./face.js";

const S = 128;

/**
 * Paints a tile: `fn(x, y) → { c: [r, g, b], h: height 0..1 }`. Returns the colour texture and a
 * tangent-space normal map derived from the height by central differences.
 */
export function paint(fn, { strength = 2, repeat = 1 } = {}) {
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
export const pf = (x, y, cell, s, oct = 4) => fbm(x / cell, y / cell, s, oct, S / cell);
/** Value noise stretched cx by cy px, tiling the S-px tile (cx and cy must divide S). */
export function pn(x, y, cx, cy, s) {
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

/**
 * A quilted arming coat: padding stitched in long vertical channels, each one puffed between
 * the sunken seams, the cloth rubbed pale along the puffs and dark in the seams.
 */
function quilted(tone, { dirt = 0.4, seed = 71 } = {}) {
  const cell = 8;
  return paint(
    (x, y) => {
      const u = x % cell;
      const puff = Math.sin((u / cell) * Math.PI) ** 0.6;
      const weave = pn(x, y, 2, 2, seed) * 0.5 + 0.25 * Math.sin(((x - y) * Math.PI) / 2);
      const h = 0.7 * puff + 0.08 * weave;
      const c = shade(tone, 0.68 + 0.3 * puff + 0.06 * weave + 0.16 * pf(x, y, 32, seed + 1));
      return { c: grime(c, dirt, x, y, seed + 2), h };
    },
    { strength: 2 },
  );
}

// --- materials -----------------------------------------------------------------------------

export function mat(tex, o = {}) {
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
  // the knight's heavy wool cloak, in the house oxblood
  cloakKnight: mix("oxblood", "barrowDeep", 0.58),
  // the Archer's Nightwood: a green dyed so deep it is nearly black, over muted buff leather that
  // carries the figure. The cloak sits a shade above black, so the back still reads in a dark room.
  rangerNight: mix("arcaneDeep", "pitch", 0.54),
  rangerNightDark: mix("arcaneDeep", "pitch", 0.72),
  rangerHose: mix("barrowDeep", "slate", 0.5),
  buff: mix(mix("brass", "vellumDark", 0.5), "barrowBrown", 0.5),
  breeches: mix("barrowDeep", "slate", 0.35),
  // the Mage: a black gown under a scapular in the class's necrotic teal
  robe: mix("pitch", "charcoal", 0.6),
  scapular: mix("necrotic", "charcoal", 0.5),
  linen: mix("vellum", "vellumDark", 0.4),
  skin: shade(mix("vellum", "oxbloodText", 0.45), 0.695),
  // raven hair, cooled toward slate so it parts from the black gown behind it
  raven: mix("pitch", "slate", 0.48),
  bone: mix("vellum", "vellumDark", 0.35),
  // barrow mud and cold stone, kept off the demon boss's bog green so the two never read as kin
  troll: mix(mix("slate", "barrowBrown", 0.5), "vellumDark", 0.12),
  trollBelly: mix("barrowBrown", "vellumFaint", 0.3),
  rag: mix("barrowBrown", "slate", 0.45),
  fur: mix("barrowBrown", "barrowDeep", 0.55),
  // hub folk (FS-2325V §G): undyed and plant-dyed homespun, nothing heraldic
  // undyed linen, warmed toward rose: a khaki sleeve reads as grave-rot skin at 1x
  shirt: mix(mix("vellum", "barrowBrown", 0.4), "oxbloodText", 0.18),
  wardWool: mix("charcoal", "necrotic", 0.2),
  felt: mix("barrowDeep", "slate", 0.5),
  apron: mix("barrowBrown", "brass", 0.4),
  hairGrey: mix("slateLight", "vellumDark", 0.45),
  // the Confessor (FS-R4MYX §H R37): a robe dyed near black with a cold stone cast, kept off the
  // wizard's gown and the Spirewarden's teal-grey mantle, and a stole in the palest parchment the
  // palette has, the one pale mark on him that reads across the chapel
  confessorRobe: mix(mix("charcoal", "pitch", 0.3), "slate", 0.3),
  stole: mix("vellum", "vellumDark", 0.08),
  // the Mercenary (FS-MAMHR §H): a quilted arming coat in faded madder, a madder sash. Burnt
  // sienna, kept off the knight's crimson and the archer's green.
  coat: mix(mix("ember", "oxblood", 0.5), "barrowDeep", 0.7),
  sash: mix(mix("ember", "oxblood", 0.35), "barrowDeep", 0.35),
  hairDark: mix("barrowDeep", "pitch", 0.35),
  // the warrior's specialization looks (FS-1J1CB R1, R2; warriorLooks.js): the Guardian's
  // surcoat in the shield's worn bone and its house cross in the shield's oxblood, and the
  // Berserker's blood-dark forearm wraps
  surcoat: shade(mix("vellum", "vellumDark", 0.5), 0.8),
  houseRed: mix("oxblood", "barrowDeep", 0.12),
  wraps: mix("oxblood", "pitch", 0.35),
  // the cord wound on the Berserker's hafts (FS-1J1CB §Change: Looks v2 R55): undyed hemp gone dark with grip
  cord: mix(mix("vellumDark", "barrowBrown", 0.55), "barrowDeep", 0.25),
  // the mage's specialization looks (FS-1J1CB R4; mageLooks.js): the Pyromancer's scapular in a
  // scorched oxblood (fabrics `pyroSoot`), the house oxblood a little toward ember under grime. Near-black (variant B's
  // soot) or the oxblood itself left her back under the dark-room floor (R10) on the black gown
  soot: mix("oxblood", "ember", 0.1),
  // the mage looks v2 (FS-1J1CB §Change: Looks v2 R56, R57, R63; mageKit.js). The Spellwarden's
  // gown a dark iron-grey wool, lighter than the wizard's black so the iron reads on it and her back
  // keeps the dark-room floor; the Pyromancer's leathers scorched toward ember, her boots soot-black
  wardenGown: mix(mix("charcoal", "slate", 0.45), "pitch", 0.2),
  scorch: mix(mix("barrowDeep", "ember", 0.22), "pitch", 0.25),
  // the archer's specialization looks (FS-1J1CB R5, R6; archerLooks.js). The Hunter: the wilds'
  // own colours, warm and earthy, and nothing of the Nightwood green. A grey-brown wolf pelt over a
  // cloak and capelet of undyed wool a shade browner and darker than it, so the pelt parts from
  // them; a laced hide jerkin, pale goose fletching, horn nock caps, brown hair
  wolf: mix(mix("slate", "barrowBrown", 0.55), "vellumDark", 0.08),
  hunterWool: mix(mix("barrowBrown", "barrowDeep", 0.55), "slate", 0.2),
  hunterWoolDark: mix(mix(mix("barrowBrown", "barrowDeep", 0.55), "slate", 0.2), "pitch", 0.35),
  jerkinHide: mix("barrowBrown", "barrowDeep", 0.15),
  goose: mix("vellum", "vellumDark", 0.25),
  horn: mix("vellumDark", "barrowBrown", 0.35),
  hairBrown: mix("barrowBrown", "barrowDeep", 0.3),
  // the Shadow Ranger: the Nightwood dyed through to a cold soot-black, the warmth taken out; the
  // buff leather a cold grey, the bracers, boots and fletching black. The soot is lifted toward
  // slate, the sleeves and hose with it: variant A's soot (pitch a little past halfway to slate,
  // under charcoal) left her back at 0.0159 against the dark-room floor's 0.0222 (R10). Looks v2
  // (FS-1J1CB §Change: Looks v2 R59) lifted it again, 0.85 to 0.93 of the way to slate: her
  // longer cloak, the liripipe and the dagged mantle fill more of her back, and at 0.85 it read
  // 0.0216, under the floor
  shadow: mix("pitch", "slate", 0.93),
  shadowDark: mix("pitch", "slate", 0.35),
  shadowLeather: mix(mix("barrowDeep", "slate", 0.55), "pitch", 0.35),
  shadowBlack: mix("pitch", "slate", 0.3),
  // the archer looks v2 (FS-1J1CB §Change: Looks v2 R58, R59, R63; archerKit.js). The Hunter's
  // recurve sinew-backed wood a warm honey-brown, its grip rawhide and its string and bindings
  // sinew; her belt and bracers a hide a shade warmer than the knight's dark leather. The Shadow
  // Ranger's longbow blackened and oiled, its string darker than the base's, her quiver and its
  // hood a cold slate leather lifted off the soot so her back keeps the dark-room floor (R65)
  hunterBow: mix(mix("barrowBrown", "brass", 0.25), "barrowDeep", 0.2),
  rawhide: mix("vellumDark", "barrowBrown", 0.45),
  sinew: mix(mix("vellumDark", "barrowBrown", 0.6), "barrowDeep", 0.15),
  hunterLeather: mix(mix("barrowBrown", "barrowDeep", 0.6), "ember", 0.06),
  shadowBow: mix("pitch", "slate", 0.22),
  shadowString: mix("pitch", "slate", 0.12),
  shadowQuiver: mix(mix("slate", "pitch", 0.4), "necrotic", 0.06),
  // the mercenary's specialization looks (FS-1J1CB R7, R8; mercLooks.js). The Duelist keeps the
  // madder (GEAR.coat) on a wrapped wool robe, under a half-cloak and sash in a cold slate-black,
  // set against the warm madder so they part from it by temperature (variant A's cape)
  duelistSlate: mix(mix("slate", "pitch", 0.45), "necrotic", 0.08),
  // the Sellsword: the madder dyed a charcoal black, never pure black, the sash a cooler step of
  // it, under a coat of oiled buff leather, browner than gold (variant B's)
  sellBlack: mix("charcoal", "slate", 0.3),
  sellSash: mix("charcoal", "slate", 0.5),
  buffCoat: mix(mix("barrowBrown", "brass", 0.3), "barrowDeep", 0.2),
  // the mercenary looks v2 (FS-1J1CB §Change: Looks v2 R60, R61, R63; mercKit.js). The Duelist's
  // blade polished near white at the edge, its fittings blackened iron, its scabbard a lacquer
  // black warmed toward oxblood, its grip a pale core under slate cord; the Sellsword's falchion a
  // dark forged iron ground bright at the edge, his plate and iron pitted, his belts and grip an
  // oiled brown leather, his studs and buckles a dull brass
  duelistEdge: mix("vellum", "slateLight", 0.45),
  duelistSaya: mix("pitch", "oxblood", 0.32),
  sellSteel: mix("slate", "slateLight", 0.55),
  sellLeather: mix(mix("barrowBrown", "barrowDeep", 0.5), "pitch", 0.15),
  sellBrass: mix("brass", "barrowBrown", 0.25),
};

/**
 * A hub resident's palette (FS-2325V §G.2): the name is the first half of the server's
 * `appearance` ("rust" in "rust_trousers"). `cloth` is the main garment (tunic, kirtle), `under`
 * the second (trousers, shawl), `hair` the hair. Earthy, muted dyes; none of them a player's
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
    // the brows from this palette's hair (FS-67QQY R11): the hair material itself would paint
    // them at the hair's own tone and texture
    brow: browMaterial(tones.hair),
  });
}

const RETONED = new Map();

/**
 * The character set with a creature's body materials re-painted in other tones (FS-C8VM7 §H R45:
 * a variant is its family's look in another shade). `tones` names the materials it changes
 * (`bone`, `rag`, `troll`, `fur`), each painted exactly as `fabrics()` paints it but for the
 * tone; every other material is the shared one. Painted once per tone set per bake.
 */
export function retonedFabrics(tones) {
  const key = JSON.stringify(tones);
  if (RETONED.has(key)) return RETONED.get(key);
  const F = fabrics();
  const D = THREE.DoubleSide;
  const paintOf = {
    bone: (t) => mat(bone(t), { rough: 0.7 }),
    rag: (t) => mat(rag(t), { side: D }),
    troll: (t) => mat(hide(t), { rough: 0.7, normal: 0.9 }),
    fur: (t) => mat(hair(t, { seed: 41 }), { side: D }),
  };
  const set = { ...F };
  for (const [name, tone] of Object.entries(tones)) {
    if (!paintOf[name]) throw new Error(`fabrics: no re-tone for "${name}"`);
    set[name] = paintOf[name](tone);
  }
  RETONED.set(key, set);
  return set;
}

let SET = null;

/** The character material set, painted once per bake. */
export function fabrics() {
  if (SET) return SET;
  const D = THREE.DoubleSide;
  SET = {
    mail: mat(mail(GEAR.mail), { metal: 0.8, rough: 0.45, normal: 1.2 }),
    mailDouble: mat(mail(GEAR.mail), { metal: 0.8, rough: 0.45, normal: 1.2, side: D }),
    mailDark: mat(mail(GEAR.blackIron, { rust: 0.35, dirt: 0.5, seed: 4 }), { metal: 0.7, rough: 0.55 }),
    steel: mat(plate(GEAR.steel), { metal: 0.85, rough: 0.3 }),
    steelDouble: mat(plate(GEAR.steel), { metal: 0.85, rough: 0.3, side: D }),
    blackIron: mat(plate(GEAR.blackIron, { rust: 0.3, seed: 6 }), { metal: 0.7, rough: 0.5 }),
    darkSteel: mat(plate(GEAR.darkSteel, { rust: 0.2, seed: 10 }), { metal: 0.8, rough: 0.42 }),
    darkSteelDouble: mat(plate(GEAR.darkSteel, { rust: 0.2, seed: 10 }), { metal: 0.8, rough: 0.42, side: D }),
    rustIron: mat(plate(GEAR.rustIron, { rust: 0.8, dents: 0.8, dirt: 0.5, seed: 8 }), { metal: 0.5, rough: 0.7 }),
    leather: mat(leather(GEAR.leather), { rough: 0.7 }),
    leatherLight: mat(leather(GEAR.leatherLight, { seed: 21 }), { rough: 0.72 }),
    leatherDark: mat(leather(GEAR.leatherDark, { seed: 23 }), { rough: 0.65 }),
    leatherDouble: mat(leather(GEAR.leatherLight, { seed: 21 }), { rough: 0.72, side: D }),
    cloakKnight: mat(wool(GEAR.cloakKnight, { seed: 93, dirt: 0.5 }), { side: D }),
    rangerNight: mat(wool(GEAR.rangerNight, { seed: 29, dirt: 0.4 }), { side: D }),
    rangerNightDark: mat(wool(GEAR.rangerNightDark, { seed: 31 })),
    rangerHose: mat(wool(GEAR.rangerHose, { seed: 33 })),
    buff: mat(leather(GEAR.buff, { seed: 21 }), { rough: 0.72 }),
    breeches: mat(wool(GEAR.breeches, { seed: 33 })),
    robe: mat(wool(GEAR.robe, { seed: 35, dirt: 0.3 }), { side: D }),
    scapular: mat(wool(GEAR.scapular, { seed: 37, dirt: 0.3 }), { side: D }),
    linen: mat(linen(GEAR.linen)),
    skin: mat(skin(GEAR.skin), { rough: 0.6, normal: 0.5 }),
    // a smoother finish than other hair: the key light lays a cold sheen down its length
    raven: mat(hair(GEAR.raven, { seed: 131 }), { rough: 0.45, side: D }),
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
    confessorRobe: mat(wool(GEAR.confessorRobe, { seed: 411, dirt: 0.45 }), { side: D }),
    stole: mat(linen(GEAR.stole, { seed: 413, dirt: 0.12 }), { side: D }),
    coat: mat(quilted(GEAR.coat), { rough: 0.85, normal: 1.2, side: D }),
    sash: mat(wool(GEAR.sash, { seed: 79, dirt: 0.35 }), { side: D }),
    hairDark: mat(hair(GEAR.hairDark, { seed: 67 }), { rough: 0.9 }),
    surcoat: mat(wool(GEAR.surcoat, { seed: 201, dirt: 0.5 }), { side: D }),
    houseRed: mat(wool(GEAR.houseRed, { seed: 203, dirt: 0.3 }), { side: D }),
    wraps: mat(wool(GEAR.wraps, { seed: 207, dirt: 0.5 })),
    // the warrior looks' own wear (FS-1J1CB §Change: Looks v2 R63), never the knight's textures at
    // a new tone. The Guardian's is kept: mail scoured bright and near clean of rust, polished steel
    // with few dents, his cloak's wool brushed; the Berserker's is neglected: mail gone to rust and
    // filth, pitted iron, a cloak dragged through the barrow. Metal against cloth and sheen against
    // matte between the two (R63's per-spec contrast).
    guardianMail: mat(mail(GEAR.mail, { rust: 0.03, dirt: 0.2, seed: 301 }), { metal: 0.85, rough: 0.36, normal: 1.25 }),
    guardianMailDouble: mat(mail(GEAR.mail, { rust: 0.03, dirt: 0.2, seed: 301 }), { metal: 0.85, rough: 0.36, normal: 1.25, side: D }),
    guardianMailDark: mat(mail(GEAR.blackIron, { rust: 0.1, dirt: 0.3, seed: 303 }), { metal: 0.75, rough: 0.48 }),
    guardianSteel: mat(plate(GEAR.darkSteel, { dents: 0.2, rust: 0.02, dirt: 0.15, seed: 305 }), { metal: 0.85, rough: 0.34 }),
    guardianCloak: mat(wool(GEAR.cloakKnight, { seed: 307, dirt: 0.3 }), { side: D }),
    guardianBelt: mat(leather(GEAR.leatherDark, { seed: 309, dirt: 0.2 }), { rough: 0.55 }),
    berserkerMail: mat(mail(GEAR.mail, { rust: 0.55, dirt: 0.75, seed: 311 }), { metal: 0.6, rough: 0.62, normal: 1.3 }),
    berserkerMailDouble: mat(mail(GEAR.mail, { rust: 0.55, dirt: 0.75, seed: 311 }), { metal: 0.6, rough: 0.62, normal: 1.3, side: D }),
    berserkerMailDark: mat(mail(GEAR.blackIron, { rust: 0.6, dirt: 0.75, seed: 313 }), { metal: 0.6, rough: 0.66 }),
    berserkerIron: mat(plate(GEAR.darkSteel, { dents: 0.95, rust: 0.45, dirt: 0.55, seed: 315 }), { metal: 0.7, rough: 0.55 }),
    berserkerEdge: mat(plate(GEAR.steel, { dents: 0.6, rust: 0.08, dirt: 0.2, seed: 317 }), { metal: 0.85, rough: 0.3 }),
    berserkerFur: mat(hair(GEAR.fur, { seed: 319 }), { rough: 0.95, side: D, normal: 1.5 }),
    berserkerCloak: mat(wool(GEAR.cloakKnight, { seed: 321, dirt: 0.85 }), { side: D }),
    berserkerLeather: mat(leather(GEAR.leatherDark, { seed: 323, dirt: 0.7 }), { rough: 0.8 }),
    cord: mat(linen(GEAR.cord, { seed: 325, dirt: 0.55 }), { rough: 0.9, normal: 1.4 }),
    // the mage looks' own wear (FS-1J1CB §Change: Looks v2 R63), never the wizard's textures at a
    // new tone (the Spellwarden's spaulders and collar drawn both faces: a lame is an open shell).
    // The Spellwarden's is kept and heavy: iron blackened and oiled, few dents and a
    // little rust, a close-fulled grey wool, her scapular brushed; the Pyromancer's is burnt:
    // a gown filthy with soot over its embers, iron fire-pitted and scaled with rust, leather
    // charred matte. Metal and sheen against singed cloth (R63's per-spec contrast).
    wardenIron: mat(plate(GEAR.blackIron, { dents: 0.3, rust: 0.12, dirt: 0.25, seed: 331 }), { metal: 0.8, rough: 0.38 }),
    wardenIronDouble: mat(plate(GEAR.blackIron, { dents: 0.3, rust: 0.12, dirt: 0.25, seed: 331 }), { metal: 0.8, rough: 0.38, side: D }),
    wardenGown: mat(wool(GEAR.wardenGown, { seed: 333, dirt: 0.2 }), { side: D }),
    wardenScapular: mat(wool(GEAR.scapular, { seed: 335, dirt: 0.15 }), { side: D }),
    wardenLeather: mat(leather(GEAR.leatherDark, { seed: 337, dirt: 0.2 }), { rough: 0.5 }),
    pyroIron: mat(plate(GEAR.blackIron, { dents: 0.85, rust: 0.6, dirt: 0.8, seed: 341 }), { metal: 0.55, rough: 0.7 }),
    pyroLeather: mat(leather(GEAR.scorch, { seed: 343, dirt: 0.75 }), { rough: 0.85, side: D }),
    pyroSoot: mat(wool(GEAR.soot, { seed: 345, dirt: 0.7 }), { side: D }),
    // the Hunter's and the Shadow Ranger's cloth (FS-1J1CB R5, R6)
    wolf: mat(hair(GEAR.wolf, { seed: 221 }), { rough: 0.95, side: D, normal: 1.4 }),
    hunterWool: mat(wool(GEAR.hunterWool, { seed: 223, dirt: 0.45 }), { side: D }),
    hunterWoolDark: mat(wool(GEAR.hunterWoolDark, { seed: 225 })),
    jerkinHide: mat(leather(GEAR.jerkinHide, { seed: 227, dirt: 0.45 }), { rough: 0.75, side: D }),
    goose: mat(linen(GEAR.goose, { seed: 229, dirt: 0.15 })),
    horn: mat(bone(GEAR.horn, { seed: 231 }), { rough: 0.5 }),
    hairBrown: mat(hair(GEAR.hairBrown, { seed: 233 }), { rough: 0.9 }),
    shadow: mat(wool(GEAR.shadow, { seed: 235, dirt: 0.3 }), { side: D }),
    shadowDark: mat(wool(GEAR.shadowDark, { seed: 237 })),
    shadowLeather: mat(leather(GEAR.shadowLeather, { seed: 239, dirt: 0.3 }), { rough: 0.7 }),
    shadowBlack: mat(leather(GEAR.shadowBlack, { seed: 241, dirt: 0.25 }), { rough: 0.65 }),
    shadowFletch: mat(linen(GEAR.shadowDark, { seed: 243, dirt: 0.1 })),
    // the archer looks' own wear (FS-1J1CB §Change: Looks v2 R63), never the ranger's textures at
    // a new tone. The Hunter's is the wilds': hide and rawhide matte and grimed, her bow's back
    // scuffed, her pelt shaggy; the Shadow Ranger's is kept dark and close: black leather oiled to
    // a sheen, her iron clean and few-dented. Matte against sheen, fur against oiled leather and
    // iron (R63's per-spec contrast).
    hunterBow: mat(leather(GEAR.hunterBow, { seed: 351, dirt: 0.35 }), { rough: 0.62 }),
    rawhide: mat(leather(GEAR.rawhide, { seed: 353, dirt: 0.5 }), { rough: 0.8 }),
    sinew: mat(linen(GEAR.sinew, { seed: 355, dirt: 0.4 }), { rough: 0.85 }),
    hunterLeather: mat(leather(GEAR.hunterLeather, { seed: 357, dirt: 0.6 }), { rough: 0.8 }),
    hunterSheath: mat(leather(GEAR.leather, { seed: 359, dirt: 0.55 }), { rough: 0.78 }),
    shadowBow: mat(leather(GEAR.shadowBow, { seed: 361, dirt: 0.08 }), { rough: 0.32 }),
    shadowString: mat(linen(GEAR.shadowString, { seed: 363, dirt: 0.05 }), { rough: 0.7 }),
    shadowIron: mat(plate(GEAR.blackIron, { dents: 0.15, rust: 0.02, dirt: 0.1, seed: 365 }), { metal: 0.85, rough: 0.3 }),
    shadowQuiver: mat(leather(GEAR.shadowQuiver, { seed: 367, dirt: 0.15 }), { rough: 0.42, side: D }),
    // the Duelist's and the Sellsword's cloth (FS-1J1CB R7, R8): the robe a plain wool in the
    // coat's madder, not the arming coat's quilting
    duelistRobe: mat(wool(GEAR.coat, { seed: 245, dirt: 0.4 }), { side: D }),
    duelistSlate: mat(wool(GEAR.duelistSlate, { seed: 247, dirt: 0.4 }), { side: D }),
    sellBlack: mat(quilted(GEAR.sellBlack, { seed: 249 }), { rough: 0.85, normal: 1.2, side: D }),
    sellSash: mat(wool(GEAR.sellSash, { seed: 251, dirt: 0.35 }), { side: D }),
    // the buff coat painted flat and matte, as variant B was: the leather grain's scuffs lit it gold
    buffCoat: mat(linen(GEAR.buffCoat, { seed: 253, dirt: 0.3 }), { rough: 0.75, side: D }),
    // the mercenary looks' own wear (FS-1J1CB §Change: Looks v2 R63), never the mercenary's
    // textures at a new tone. The Duelist's is kept: a blade polished bright and clean, its iron
    // blackened with little rust, lacquer with a sheen, matte wool and silk cord; the Sellsword's is
    // used hard: forged iron pitted, dented and rusted at the seams, plate gone dull, leather oiled
    // dark and scuffed, brass dulled with grime. Polished steel and matte cloth against oiled
    // leather and pitted iron (R63's per-spec contrast).
    duelistSteel: mat(plate(GEAR.steel, { dents: 0.05, rust: 0, dirt: 0.06, seed: 371 }), { metal: 0.9, rough: 0.22 }),
    duelistEdgeSteel: mat(plate(GEAR.duelistEdge, { dents: 0.02, rust: 0, dirt: 0.02, seed: 373 }), { metal: 0.9, rough: 0.18 }),
    duelistIron: mat(plate(GEAR.blackIron, { dents: 0.12, rust: 0.05, dirt: 0.15, seed: 375 }), { metal: 0.75, rough: 0.4 }),
    duelistLeather: mat(leather(GEAR.leatherDark, { seed: 377, dirt: 0.25 }), { rough: 0.6 }),
    duelistSaya: mat(leather(GEAR.duelistSaya, { seed: 379, dirt: 0.05 }), { rough: 0.28 }),
    duelistCord: mat(linen(GEAR.duelistSlate, { seed: 381, dirt: 0.2 }), { rough: 0.8, normal: 1.3 }),
    duelistCore: mat(linen(GEAR.linen, { seed: 383, dirt: 0.3 }), { rough: 0.7 }),
    sellSteel: mat(plate(GEAR.sellSteel, { dents: 0.6, rust: 0.3, dirt: 0.45, seed: 385 }), { metal: 0.7, rough: 0.5 }),
    sellEdge: mat(plate(GEAR.steel, { dents: 0.35, rust: 0.05, dirt: 0.15, seed: 387 }), { metal: 0.85, rough: 0.3 }),
    sellIron: mat(plate(GEAR.blackIron, { dents: 0.75, rust: 0.5, dirt: 0.55, seed: 389 }), { metal: 0.6, rough: 0.6 }),
    sellPlate: mat(plate(GEAR.darkSteel, { dents: 0.8, rust: 0.35, dirt: 0.5, seed: 391 }), { metal: 0.7, rough: 0.52 }),
    sellPlateDouble: mat(plate(GEAR.darkSteel, { dents: 0.8, rust: 0.35, dirt: 0.5, seed: 391 }), { metal: 0.7, rough: 0.52, side: D }),
    sellLeather: mat(leather(GEAR.sellLeather, { seed: 393, dirt: 0.55 }), { rough: 0.45 }),
    sellRoll: mat(wool(GEAR.sellSash, { seed: 397, dirt: 0.6 }), { normal: 1.4 }),
    sellBrass: mat(plate(GEAR.sellBrass, { dents: 0.3, rust: 0, dirt: 0.45, seed: 395 }), { metal: 0.8, rough: 0.45 }),
    // the one painted face on every human (FS-67QQY R7), and brows from the hair (R10); a
    // character with no hair of its own takes browDark
    face: faceMaterial(),
    browDark: browMaterial(GEAR.hairDark),
    browRaven: browMaterial(GEAR.raven),
    browGrey: browMaterial(GEAR.hairGrey),
  };
  // the Pyromancer's gown (FS-1J1CB R4, §Change: Looks v2 R57, R63): embers in its hem, in a gown
  // of her own, sooted
  SET.pyroGown = withEmbers(mat(wool(GEAR.robe, { seed: 347, dirt: 0.75 }), { side: D }));
  return SET;
}

/**
 * How far up the hem the Pyromancer's embers reach (H), the band {@link emberHem} is painted on
 * and mageLooks.js `fitHem` lays at the foot of the gown.
 */
export const EMBER_BAND = 0.07;

/**
 * The Pyromancer's singed hem (FS-1J1CB R4): a tile of ember specks in the fire ramp on black, the
 * gown's emissive map. Row 0 is the hem's edge, where the embers crowd and the cloth smoulders in
 * broken runs; they thin out up the band and are gone well before its top, so the black clamped
 * above it lights nothing. 128 columns round the cloth (repeating) by 32 rows up the band, near
 * square texels on the mage's hem. Painted in the texture, the embers ride the skinned skirt and
 * swing with the hem; never rigid on a body bone.
 */
export function emberHem({ seed = 157 } = {}) {
  const W = 128;
  const R = 32;
  const c = mkCanvas(W, R);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, R);
  const hot = mix("fireHot", "fireCore", 0.25);
  const deep = mix("fireDeep", "fireHot", 0.35);
  // ember centres: a jittered grid, denser and hotter toward the hem
  const specks = [];
  const cells = 16;
  for (let i = 0; i < cells; i++)
    for (let k = 0; k < 2; k++) {
      const h = hash2(i, k, seed);
      if (k === 1 && h < 0.45) continue;
      const x = ((i + hash2(i, k + 7, seed)) / cells) * W;
      const y = (k === 0 ? 1.5 : 7) + hash2(i, k + 13, seed) * (k === 0 ? 7 : 12);
      const r = 1.3 + 1.3 * hash2(i, k + 19, seed) * (1 - y / R);
      specks.push({ x, y, r, c: h > 0.6 ? hot : deep, a: 1 - 0.55 * (y / R) });
    }
  for (let y = 0; y < R; y++)
    for (let x = 0; x < W; x++) {
      let e = [0, 0, 0];
      // the smoulder along the edge, in broken runs
      const run = smoothstep(0.6, 0.8, pf(x, 0, 16, seed + 3, 3)) * Math.max(0, 1 - y / 2);
      if (run > 0.1) e = mix(e, deep, 0.7 * run);
      for (const s of specks) {
        const dx = Math.min(Math.abs(x - s.x), W - Math.abs(x - s.x));
        const t = 1 - Math.hypot(dx, y - s.y) / s.r;
        if (t > 0) e = mix(e, s.c, Math.min(1, t * 1.8) * s.a);
      }
      const o = (y * W + x) * 4;
      img.data[o] = Math.round(Math.min(255, e[0]));
      img.data[o + 1] = Math.round(Math.min(255, e[1]));
      img.data[o + 2] = Math.round(Math.min(255, e[2]));
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.band = EMBER_BAND;
  return t;
}

/** `cloth` with embers in its hem: the same weave, lit by {@link emberHem} where the hem lays it. */
function withEmbers(cloth) {
  const m = cloth.clone();
  m.emissive = color(grey(255));
  m.emissiveMap = emberHem();
  m.emissiveIntensity = 1.8;
  return m;
}
