// The sealed floor's props (FS-5FZ4J §K R57): the seal pieces (lever, pressure plate, stone block,
// bridge lever, stair key, mural), the lore shrine, the barriers (gate, pit, lowered bridge, a
// secret door's cracks), the five traps and the healing fountain. The seal's brazier is the run's
// (props.js `brazier`, with a cold state) and the hallowed altar the Altar of Consecration
// (interactables.js `altar`, with the hallowed look); neither is copied here.
//
// Authored in code (ADR-0020, ADR-0021) on the shared camera, key light and scale: one three.js
// unit is one tile edge (40 world px), so a floor cell (80 px) is 2 units; +x is world x, +z world
// y, +y up; each model's origin is the centre of its footprint (a cell piece's: the cell's centre).
// Every colour is a BARROW blend (ADR-0013); this file is in the bake model fence (lint-fence.sh).
//
// Readability (design guideline, "Gameplay accent"): nothing here is amber but a flame. A seal
// piece is marked actionable by the client's own amber pool and prompt, never by its paint. The
// traps carry the danger channel, oxblood, where blood would be (the spikes); the fountain's water
// carries health's own colour (oxbloodText), never green; a fire jet is fire's ramp, a fire effect.

import * as THREE from "three";
import { fbm, hash2, rng, smoothstep, vnoise, vnoise3 } from "../noise.js";
import { color, cssRgb, grey, mix, shade } from "../palette.js";
import { canvasTexture, materials, mkCanvas, pixelTexture, plain, textured } from "../materials.js";
import { joint, part, rod, scaled, V3 } from "./util.js";
import { roughBox, towerMaterials } from "./tower.js";

/** A floor cell's edge in units: 80 world px of 40 px tiles (game-service cell_size). */
export const CELL = 2;
/** What a ground cell piece reaches past its cell, so two side by side meet with no seam. */
const SEAM = 0.03;
/** A masonry wall piece: one tile along its axis, its face 0.12 proud of its centre line (tower.js). */
const WALL_LEN = 1.024;
const WALL_FACE = 0.12;

// ── Palette (BARROW blends only) ───────────────────────────────────────────────────
const GRANITE = mix(mix("slate", "slateLight", 0.55), "vellumFaint", 0.18);
const DRESSED = mix(mix("slateLight", "vellumFaint", 0.42), "barrowBrown", 0.12);
const JOINT = mix("pitch", "charcoal", 0.5);
const GRIME = mix("charcoal", "barrowDeep", 0.6);
const MOSS = mix("arcaneDeep", "barrowDeep", 0.35);
const ABYSS = mix("pitch", "umber", 0.08);
const MIST = mix(mix("necrotic", "slate", 0.5), "pitch", 0.72);
const ROCK_HI = mix(mix("slateLight", "barrowBrown", 0.3), "vellumFaint", 0.15);
const ROCK_LO = mix("slate", "barrowDeep", 0.5);
const PLANK = mix("barrowBrown", "slate", 0.22);
const BLOOD = mix("oxblood", "pitch", 0.25);
const BILE = mix(mix("arcane", "brassBright", 0.45), "vellumDark", 0.35);
const BILE_CRUST = mix(mix("arcaneDeep", "brass", 0.5), "barrowDeep", 0.35);
const SCORCH = mix("pitch", "charcoal", 0.6);
const SOOT_RIM = mix("charcoal", "barrowDeep", 0.4);
const WIRE = mix("slateLight", "vellum", 0.55);
const FLETCH = mix("vellumDark", "barrowBrown", 0.3);
const WATER = mix(mix("slate", "necrotic", 0.25), "pitch", 0.45);
const HEAL = mix("oxbloodText", "vellum", 0.15);
const STAIN = mix(mix("barrowDeep", "oxblood", 0.15), "charcoal", 0.35);
const FRESCO_GROUND = mix("vellumDark", "barrowBrown", 0.35);
const BONE = mix("vellum", "vellumDark", 0.45);

/** Turns a free-standing face toward the camera (its normal from +z to the view's +x+z). */
const FACE_VIEW = Math.PI / 4;

let SEALED = null;
/** The props' own materials, built once per bake (every texture seeded, so deterministic). */
function sealedMaterials() {
  if (SEALED) return SEALED;
  const stone = (base, s, o = {}) =>
    pixelTexture(128, 128, (x, y) => {
      const n = fbm(x / 16, y / 16, s, 4);
      const fine = vnoise(x / 2.2, y / 2.2, s + 3);
      const chisel = 0.94 + 0.06 * Math.sin((x + y * 0.3) * 0.9 + fbm(x / 6, y / 30, s + 5) * 3);
      let c = shade(base, (0.7 + 0.38 * n) * (0.9 + 0.16 * fine) * chisel);
      if (o.grime) c = mix(c, GRIME, o.grime * smoothstep(0.55, 0.8, fbm(x / 24, y / 24, s + 7)));
      if (o.flaw) {
        const line = Math.abs(fbm(x / 14, y / 14, s + 9, 3) - 0.5);
        c = mix(c, JOINT, 0.7 * (1 - smoothstep(0.004, 0.016, line)));
      }
      return c;
    });
  const wood = (base, s) =>
    pixelTexture(128, 128, (x, y) =>
      shade(base, (0.62 + 0.2 * Math.sin(y * 0.3 + fbm(x / 40, y / 6, s) * 9) + 0.3 * fbm(x / 30, y / 4, s + 1)) * (vnoise(x / 3, y / 60, s + 2) > 0.86 ? 0.7 : 1)),
    );
  SEALED = {
    granite: textured(stone(GRANITE, 9101, { grime: 0.5, flaw: true }), { rough: 0.95, bump: 0.9 }),
    dressed: textured(stone(DRESSED, 9111, { grime: 0.35 }), { rough: 0.9, bump: 0.7 }),
    dressedDark: textured(stone(shade(DRESSED, 0.72), 9121, { grime: 0.6, flaw: true }), { rough: 0.95, bump: 0.8 }),
    plank: textured(wood(PLANK, 9131), { rough: 0.92, bump: 0.6 }),
    plankDark: textured(wood(shade(PLANK, 0.75), 9141), { rough: 0.92, bump: 0.6 }),
    joint: plain(JOINT, { rough: 1 }),
    abyss: plain(ABYSS, { rough: 1 }),
    blood: plain(BLOOD, { rough: 0.45 }),
    wire: plain(WIRE, { rough: 0.3, metal: 0.8 }),
    fletch: plain(FLETCH, { rough: 1, side: THREE.DoubleSide }),
    bone: plain(BONE, { rough: 0.7 }),
    crust: textured(
      pixelTexture(64, 64, (x, y) => shade(BILE_CRUST, 0.7 + 0.5 * fbm(x / 5, y / 5, 9151))),
      { rough: 1, bump: 1 },
    ),
    soot: plain(SCORCH, { rough: 1 }),
  };
  return SEALED;
}

/** Marks a part to cast no ground shadow (a decal, a flame, a translucent wisp). */
const unshadowed = (mesh) => {
  mesh.userData.noShadow = true;
  return mesh;
};

/** A flat square of `material` lying on the ground at height `y`. */
const slab = (w, d, material, y = 0.002) => part(new THREE.PlaneGeometry(w, d), material, { y, rx: -Math.PI / 2 });

// ── The glyphs (FS-5FZ4J §C R15: crow, key, flame, eye, serpent, moon) ─────────────

export const GLYPHS = ["crow", "key", "flame", "eye", "serpent", "moon"];

/** Draws one glyph white on clear into a 128² canvas context, centred, about 100 px across. */
function drawGlyph(ctx, glyph) {
  const ink = cssRgb(grey(255));
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (glyph === "crow") {
    // side on, facing left: body, head, beak, a raised wing, the tail fanned behind, legs
    ctx.ellipse(66, 70, 30, 17, -0.25, 0, Math.PI * 2);
    ctx.moveTo(44, 48);
    ctx.arc(38, 48, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(27, 44);
    ctx.lineTo(8, 52);
    ctx.lineTo(28, 54);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(56, 60);
    ctx.quadraticCurveTo(80, 18, 112, 22);
    ctx.quadraticCurveTo(96, 48, 84, 66);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(90, 76);
    ctx.lineTo(122, 92);
    ctx.lineTo(116, 100);
    ctx.lineTo(86, 86);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(60, 84);
    ctx.lineTo(56, 112);
    ctx.moveTo(72, 84);
    ctx.lineTo(74, 112);
    ctx.stroke();
  } else if (glyph === "key") {
    ctx.lineWidth = 12;
    ctx.arc(34, 64, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(54, 64);
    ctx.lineTo(118, 64);
    ctx.moveTo(100, 64);
    ctx.lineTo(100, 92);
    ctx.moveTo(114, 64);
    ctx.lineTo(114, 86);
    ctx.stroke();
  } else if (glyph === "flame") {
    ctx.moveTo(64, 6);
    ctx.bezierCurveTo(84, 40, 108, 56, 100, 90);
    ctx.bezierCurveTo(94, 116, 34, 118, 28, 90);
    ctx.bezierCurveTo(22, 64, 46, 54, 50, 28);
    ctx.bezierCurveTo(60, 44, 58, 52, 64, 6);
    ctx.fill();
    // the hollow at its heart
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(64, 60);
    ctx.bezierCurveTo(78, 78, 80, 104, 64, 106);
    ctx.bezierCurveTo(48, 104, 50, 82, 64, 60);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  } else if (glyph === "eye") {
    ctx.lineWidth = 11;
    ctx.moveTo(8, 64);
    ctx.quadraticCurveTo(64, 10, 120, 64);
    ctx.quadraticCurveTo(64, 118, 8, 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 64, 18, 0, Math.PI * 2);
    ctx.fill();
  } else if (glyph === "serpent") {
    ctx.lineWidth = 13;
    ctx.moveTo(30, 116);
    ctx.bezierCurveTo(-10, 90, 120, 82, 92, 52);
    ctx.bezierCurveTo(70, 28, 30, 44, 44, 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(56, 14, 15, 10, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (glyph === "moon") {
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(88, 52, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  } else throw new Error(`sealed: unknown glyph "${glyph}"`);
}

const GLYPH_TEX = {};
/** A glyph as an alpha map (white where the glyph is), cached per glyph. */
function glyphAlpha(glyph) {
  if (GLYPH_TEX[glyph]) return GLYPH_TEX[glyph];
  const c = mkCanvas(128, 128);
  drawGlyph(c.getContext("2d"), glyph);
  const t = canvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return (GLYPH_TEX[glyph] = t);
}

/** A glyph inlaid in bright brass, a `size` square plane facing +z. */
function glyphInlay(glyph, size) {
  const M = materials();
  const mat = new THREE.MeshStandardMaterial({
    map: M.brass.map,
    alphaMap: glyphAlpha(glyph),
    alphaTest: 0.45,
    metalness: 0.85,
    roughness: 0.32,
    emissive: color(mix("brassBright", "vellum", 0.3)),
    emissiveIntensity: 0.22,
  });
  return unshadowed(part(new THREE.PlaneGeometry(size, size), mat));
}

// ── Seal pieces ─────────────────────────────────────────────────────────────────────

const LEVER_PIVOT = 0.9;
const LEVER_SHAFT = 0.48;

/**
 * The seal's lever (§C R15–R16): a waist-high pillar of dressed stone, a sunk panel on each face
 * the camera sees, and an iron lever in a slot on its top. `up`: the lever stands, leaning back;
 * `down`: thrown forward and down. `glyph`: only the lever's brass glyph, inlaid in those two
 * panels, drawn over the lever on the same frame and anchor (a frame per glyph, GLYPHS).
 */
export function sealLever(state) {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  const s = LEVER_SHAFT;
  const panelY = 0.46;
  const panel = 0.3;
  if (state.startsWith("glyph_")) {
    const glyph = state.slice("glyph_".length);
    const front = glyphInlay(glyph, panel - 0.04);
    front.position.set(0, panelY, s / 2 + 0.012);
    const side = glyphInlay(glyph, panel - 0.04);
    side.position.set(s / 2 + 0.012, panelY, 0);
    side.rotation.y = Math.PI / 2;
    g.add(front, side);
    return scaled(g, 1.2);
  }
  g.add(part(roughBox(s + 0.2, 0.12, s + 0.2, 31, 0.08), T.block, { y: 0.06 }));
  g.add(part(new THREE.BoxGeometry(s, LEVER_PIVOT - 0.2, s), S.dressed, { y: 0.12 + (LEVER_PIVOT - 0.2) / 2 - 0.01 }));
  g.add(part(roughBox(s + 0.1, 0.1, s + 0.1, 33, 0.06), T.cap, { y: LEVER_PIVOT - 0.08 + 0.05 - 0.04 }));
  // the sunk panels, dark, where the glyph sits
  g.add(part(new THREE.BoxGeometry(panel, panel, 0.02), S.joint, { y: panelY, z: s / 2 }));
  g.add(part(new THREE.BoxGeometry(0.02, panel, panel), S.joint, { x: s / 2, y: panelY }));
  // a moulding round the panels
  for (const [w, h, x, y, z] of [
    [panel + 0.06, 0.03, 0, panelY + panel / 2 + 0.015, s / 2 + 0.006],
    [panel + 0.06, 0.03, 0, panelY - panel / 2 - 0.015, s / 2 + 0.006],
  ]) {
    g.add(part(new THREE.BoxGeometry(w, h, 0.02), T.cap, { x, y, z }));
    g.add(part(new THREE.BoxGeometry(0.02, h, w), T.cap, { x: z, y, z: x }));
  }
  // the slot on top, an iron plate either side of it
  const top = LEVER_PIVOT - 0.02;
  for (const sx of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.11, 0.035, 0.36), M.iron, { x: sx * 0.08, y: top }));
  g.add(part(new THREE.BoxGeometry(0.05, 0.02, 0.34), S.joint, { y: top - 0.004 }));
  for (const sx of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), M.iron, { x: sx * 0.06, y: top + 0.04, rz: Math.PI / 2 }));
  const pivot = joint(g, 0, top + 0.04, 0);
  const arm = joint(pivot, 0, 0, 0);
  arm.add(part(new THREE.CylinderGeometry(0.022, 0.03, 0.56, 8), M.iron, { y: 0.28 }));
  arm.add(part(new THREE.CylinderGeometry(0.036, 0.036, 0.16, 8), M.leather, { y: 0.5 }));
  arm.add(part(new THREE.SphereGeometry(0.05, 10, 8), M.brass, { y: 0.6 }));
  arm.add(part(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), M.brass, { y: 0.41 }));
  arm.rotation.x = state === "down" ? 1.2 : -0.32;
  return scaled(g, 1.2);
}

/** The plate's carved face: a dressed square, a sunk ring and a cross of grooves, worn at the centre. */
let PLATE_FACE = null;
function plateFace() {
  if (PLATE_FACE) return PLATE_FACE;
  const tex = pixelTexture(128, 128, (x, y) => {
    const n = fbm(x / 14, y / 14, 9201, 4);
    let c = shade(DRESSED, (0.72 + 0.36 * n) * (0.92 + 0.14 * vnoise(x / 2, y / 2, 9202)));
    const dx = x - 63.5;
    const dy = y - 63.5;
    const r = Math.hypot(dx, dy);
    const edge = Math.min(x, y, 127 - x, 127 - y);
    const groove = (d, w) => 1 - smoothstep(w * 0.5, w, Math.abs(d));
    let cut = Math.max(groove(r - 40, 3.5), groove(r - 22, 2.5), edge < 8 ? groove(edge - 6, 2) : 0);
    if (r < 40 && r > 22) cut = Math.max(cut, groove(dx, 2.2), groove(dy, 2.2));
    c = mix(c, JOINT, 0.78 * cut);
    // worn smooth and paler where feet have stood
    c = mix(c, shade(DRESSED, 1.15), 0.25 * (1 - smoothstep(10, 34, r)));
    c = mix(c, GRIME, 0.5 * smoothstep(0.55, 0.8, fbm(x / 20, y / 20, 9203)) * smoothstep(30, 60, r));
    return c;
  });
  PLATE_FACE = textured(tex, { rough: 0.85, bump: 1.1 });
  return PLATE_FACE;
}

/**
 * A pressure plate (§C R17–R18): a dressed slab in an iron frame, sunk in the cell's floor, a ring
 * and a cross cut in it. `up`: it stands proud, the dark gap of its well round it; `pressed`: sunk
 * flush, the gap closed to a seam.
 */
export function pressurePlate(state) {
  const M = materials();
  const S = sealedMaterials();
  const g = new THREE.Group();
  const P = 1.3;
  const pressed = state === "pressed";
  // the well and the iron frame it sits in
  g.add(slab(P + 0.14, P + 0.14, S.abyss, 0.004));
  for (const [w, d, x, z] of [
    [P + 0.28, 0.07, 0, -(P / 2 + 0.105)],
    [P + 0.28, 0.07, 0, P / 2 + 0.105],
    [0.07, P + 0.14, -(P / 2 + 0.105), 0],
    [0.07, P + 0.14, P / 2 + 0.105, 0],
  ])
    g.add(part(new THREE.BoxGeometry(w, 0.025, d), M.iron, { x, y: 0.0125, z }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 8), M.iron, { x: sx * (P / 2 + 0.105), y: 0.03, z: sz * (P / 2 + 0.105) }));
  const h = 0.06;
  const top = pressed ? 0.012 : 0.1;
  g.add(part(new THREE.BoxGeometry(P, h, P), [S.dressedDark, S.dressedDark, plateFace(), S.dressed, S.dressedDark, S.dressedDark], { y: top - h / 2 }));
  return scaled(g, 1.0);
}

/**
 * A stone block (§C R19): one cell of rough-dressed granite a little less than the cell, so it
 * reads apart from the walls it is pushed against, an iron ring sunk in each face to haul it by,
 * moss at its foot. One frame: it slides, it never changes.
 */
export function stoneBlock() {
  const M = materials();
  const S = sealedMaterials();
  const g = new THREE.Group();
  const W = 1.62;
  const H = 1.12;
  g.add(part(roughBox(W, H, W, 9301, 0.05, 5), S.granite, { y: H / 2 }));
  // a chamfered cap course, a hair narrower: the block's top edge breaks the light
  g.add(part(roughBox(W - 0.08, 0.1, W - 0.08, 9303, 0.12, 4), S.granite, { y: H + 0.03 }));
  for (const [x, z, ry] of [
    [0, W / 2, 0],
    [W / 2, 0, Math.PI / 2],
    [0, -W / 2, Math.PI],
    [-W / 2, 0, -Math.PI / 2],
  ]) {
    const face = joint(g, x, 0.62, z);
    face.rotation.y = ry;
    face.add(part(new THREE.BoxGeometry(0.16, 0.12, 0.04), M.iron, { z: 0.01 }));
    face.add(part(new THREE.TorusGeometry(0.1, 0.022, 6, 16), M.rust, { y: -0.1, z: 0.05, rx: 0.35 }));
  }
  // moss and grit where it meets the floor, on the faces the camera sees
  const R = rng(9305);
  for (let i = 0; i < 9; i++) {
    const t = R() * 2 - 1;
    const onX = R() > 0.5;
    g.add(
      part(new THREE.SphereGeometry(0.05 + R() * 0.05, 7, 5), onX ? M.cushion : S.granite, {
        x: onX ? W / 2 + 0.02 : t * W * 0.45,
        y: 0.02,
        z: onX ? t * W * 0.45 : W / 2 + 0.02,
        sy: 0.45,
      }),
    );
  }
  return scaled(g, 1.0);
}

/**
 * The stair key (§E R32): a great iron-and-brass key lying across a low reliquary stone, its bow a
 * ring of four lobes round the spire's mark, its bit cut in three wards.
 */
export function stairKey() {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  g.add(part(roughBox(0.78, 0.1, 0.5, 9401, 0.06), T.block, { y: 0.05 }));
  g.add(part(new THREE.BoxGeometry(0.66, 0.16, 0.38), S.dressed, { y: 0.18 }));
  g.add(part(new THREE.BoxGeometry(0.7, 0.04, 0.42), T.cap, { y: 0.28 }));
  const key = joint(g, 0, 0.32, 0);
  key.rotation.y = 0.35;
  // the bow: four lobes round a ring, a spire point in it
  key.add(part(new THREE.TorusGeometry(0.1, 0.026, 8, 22), M.gold, { x: -0.3, rx: Math.PI / 2 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    key.add(part(new THREE.TorusGeometry(0.045, 0.016, 6, 14), M.gold, { x: -0.3 + Math.cos(a) * 0.12, z: Math.sin(a) * 0.12, rx: Math.PI / 2 }));
  }
  key.add(part(new THREE.ConeGeometry(0.035, 0.12, 4), M.brass, { x: -0.3, rz: Math.PI / 2 }));
  // collar, shank and the bit's wards
  key.add(part(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), M.gold, { x: -0.17, rz: Math.PI / 2 }));
  key.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.44, 8), M.iron, { x: 0.05, rz: Math.PI / 2 }));
  key.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), M.gold, { x: -0.1, rz: Math.PI / 2 }));
  for (const [x, w] of [
    [0.19, 0.04],
    [0.25, 0.03],
    [0.3, 0.05],
  ])
    key.add(part(new THREE.BoxGeometry(0.035, 0.03, w + 0.08), M.gold, { x, z: (w + 0.08) / 2 }));
  return scaled(g, 1.6);
}

/**
 * The bridge lever (§E R33): a windlass on a stone footing, two oak posts, a chain drum between
 * them with its ratchet wheel and pawl, a long iron-shod lever on the drum's end. `up`: the bridge
 * is raised, the lever stands, the chain wound thick; `down`: the lever hauled over and down, the
 * chain paid out, a slack loop hanging from the drum.
 */
export function bridgeLever(state) {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  const down = state === "down";
  g.add(part(roughBox(1.2, 0.16, 0.72, 9501, 0.07), T.block, { y: 0.08 }));
  for (const sx of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.16, 1.0, 0.18), M.beam, { x: sx * 0.42, y: 0.16 + 0.5 }));
    g.add(part(new THREE.BoxGeometry(0.2, 0.05, 0.22), M.iron, { x: sx * 0.42, y: 0.2 }));
    g.add(part(new THREE.BoxGeometry(0.2, 0.05, 0.22), M.iron, { x: sx * 0.42, y: 1.12 }));
    g.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), M.iron, { x: sx * 0.42, y: 0.86, rz: Math.PI / 2 }));
  }
  // the drum and the chain wound on it
  const drumY = 0.86;
  g.add(part(new THREE.CylinderGeometry(0.13, 0.13, 0.68, 16), M.woodDark, { y: drumY, rz: Math.PI / 2 }));
  const turns = down ? 5 : 11;
  for (let i = 0; i < turns; i++)
    g.add(part(new THREE.TorusGeometry(down ? 0.15 : 0.165, 0.022, 6, 18), M.rust, { x: -0.24 + (i / 10) * 0.48, y: drumY, ry: Math.PI / 2 }));
  // the chain off the drum and down into the footing (to the bridge, below the floor)
  const chainTo = down ? [V3(0.02, drumY - 0.12, 0.12), V3(0.06, 0.55, 0.36), V3(0.02, 0.26, 0.34), V3(0, 0.17, 0.22)] : [V3(0.02, drumY - 0.15, 0.08), V3(0, 0.5, 0.18), V3(0, 0.17, 0.2)];
  const curve = new THREE.CatmullRomCurve3(chainTo);
  const links = down ? 14 : 9;
  for (let i = 0; i <= links; i++) {
    const p = curve.getPoint(i / links);
    g.add(part(new THREE.TorusGeometry(0.03, 0.01, 5, 10), M.rust, { x: p.x, y: p.y, z: p.z, ry: i % 2 ? Math.PI / 2 : 0 }));
  }
  g.add(part(new THREE.BoxGeometry(0.16, 0.02, 0.1), S.joint, { y: 0.165, z: 0.22 }));
  // the ratchet wheel and its pawl, on the east post's outside
  const wheelX = 0.56;
  g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), M.iron, { x: wheelX, y: drumY, rz: Math.PI / 2 }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(part(new THREE.BoxGeometry(0.05, 0.06, 0.05), M.iron, { x: wheelX, y: drumY + Math.cos(a) * 0.21, z: Math.sin(a) * 0.21, rx: a }));
  }
  g.add(part(new THREE.BoxGeometry(0.04, 0.24, 0.05), M.iron, { x: wheelX, y: drumY + 0.3, z: -0.1, rx: 0.5 }));
  // the lever, on the drum's axle beyond the wheel
  const hub = joint(g, wheelX + 0.07, drumY, 0);
  hub.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), M.iron, { rz: Math.PI / 2 }));
  const arm = joint(hub, 0, 0, 0);
  arm.add(part(new THREE.BoxGeometry(0.06, 0.95, 0.07), M.woodDark, { y: 0.48 }));
  for (const y of [0.12, 0.7]) arm.add(part(new THREE.BoxGeometry(0.075, 0.05, 0.085), M.iron, { y }));
  arm.add(part(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), M.leather, { y: 0.9 }));
  arm.add(part(new THREE.SphereGeometry(0.05, 8, 6), M.iron, { y: 0.98 }));
  arm.rotation.x = down ? 2.05 : -0.18;
  return scaled(g, 1.25);
}

/** The mural's painted face: a fresco flaking off its plaster, six glyph roundels and the spire. */
let FRESCO = null;
function frescoFace() {
  if (FRESCO) return FRESCO;
  const W = 256;
  const H = 288;
  const c = mkCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = cssRgb(FRESCO_GROUND);
  ctx.fillRect(0, 0, W, H);
  // a painted border and the spire on its mound across the top band
  ctx.strokeStyle = cssRgb(mix("oxblood", "barrowDeep", 0.2));
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = cssRgb(mix("slate", "barrowDeep", 0.3));
  ctx.beginPath();
  ctx.moveTo(128, 22);
  ctx.lineTo(142, 92);
  ctx.lineTo(176, 104);
  ctx.lineTo(80, 104);
  ctx.lineTo(114, 92);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = cssRgb(mix("brass", "barrowBrown", 0.25));
  ctx.fillRect(122, 40, 12, 6);
  // six roundels, two rows of three, a glyph in each
  const glyphCanvas = mkCanvas(128, 128);
  GLYPHS.forEach((glyph, i) => {
    const cx = 52 + (i % 3) * 76;
    const cy = 150 + Math.floor(i / 3) * 76;
    ctx.fillStyle = cssRgb(mix("oxblood", "barrowDeep", 0.35));
    ctx.beginPath();
    ctx.arc(cx, cy, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = cssRgb(mix("brass", "vellumDark", 0.3));
    ctx.lineWidth = 4;
    ctx.stroke();
    const gc = glyphCanvas.getContext("2d");
    gc.clearRect(0, 0, 128, 128);
    drawGlyph(gc, glyph);
    gc.globalCompositeOperation = "source-in";
    gc.fillStyle = cssRgb(mix("vellum", "brassBright", 0.3));
    gc.fillRect(0, 0, 128, 128);
    gc.globalCompositeOperation = "source-over";
    ctx.drawImage(glyphCanvas, cx - 22, cy - 22, 44, 44);
  });
  // age: the plaster flaked to the stone beneath, grime and damp over it all
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let px = [d[i], d[i + 1], d[i + 2]];
      const flake = fbm(x / 22, y / 22, 9601, 4);
      const n = fbm(x / 6, y / 6, 9602, 3);
      if (flake > 0.62) px = shade(GRANITE, 0.6 + 0.4 * n);
      else px = shade(px, 0.78 + 0.32 * n);
      px = mix(px, GRIME, 0.55 * smoothstep(0.5, 0.8, fbm(x / 30, y / 40, 9603)) + 0.3 * smoothstep(H * 0.7, H, y));
      d[i] = px[0];
      d[i + 1] = px[1];
      d[i + 2] = px[2];
    }
  ctx.putImageData(img, 0, 0);
  FRESCO = textured(canvasTexture(c), { rough: 0.9, bump: 0.5 });
  return FRESCO;
}

/**
 * The mural (§C R15): a free-standing stele of dressed stone on a stepped base, turned to face the
 * viewer, its face a flaking fresco of the spire over six glyph roundels. The order is the
 * client's line, not the stone's: every glyph is painted, so the mural reads the same on any floor.
 */
export function mural() {
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  const W = 1.2;
  const H = 1.4;
  const D = 0.22;
  g.add(part(roughBox(W + 0.36, 0.12, D + 0.4, 9611, 0.06), T.block, { y: 0.06 }));
  g.add(part(roughBox(W + 0.16, 0.12, D + 0.2, 9613, 0.06), T.blockLight, { y: 0.18 }));
  const face = frescoFace();
  g.add(part(new THREE.BoxGeometry(W, H, D), [S.dressed, S.dressed, S.dressed, S.dressed, face, S.dressed], { y: 0.24 + H / 2 }));
  // a weathered gable on top, one corner broken away
  const cap = new THREE.Shape();
  cap.moveTo(-W / 2 - 0.06, 0);
  cap.lineTo(W / 2 + 0.06, 0);
  cap.lineTo(W / 2 + 0.06, 0.07);
  cap.lineTo(0.08, 0.3);
  cap.lineTo(-0.08, 0.3);
  cap.lineTo(-W / 2 - 0.06, 0.07);
  cap.closePath();
  const capGeo = new THREE.ExtrudeGeometry(cap, { depth: D + 0.06, bevelEnabled: false });
  g.add(part(capGeo, S.dressedDark, { y: 0.24 + H, z: -(D + 0.06) / 2 }));
  g.add(part(roughBox(0.2, 0.18, D + 0.02, 9615, 0.3), S.dressedDark, { x: -W / 2 + 0.05, y: 0.24 + H - 0.05, z: 0.005 }));
  g.rotation.y = FACE_VIEW;
  return scaled(g, 1.0);
}

/**
 * The lore shrine (§F R39): a wayside shrine on a pillar, a gabled stone niche on it, turned to
 * the viewer, a hooded figure of pale stone inside, a bowl of offerings and two candles before it,
 * one still burning.
 */
export function loreShrine() {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  g.add(part(roughBox(0.9, 0.12, 0.9, 9701, 0.07), T.block, { y: 0.06 }));
  g.add(part(new THREE.BoxGeometry(0.44, 0.7, 0.44), S.dressedDark, { y: 0.12 + 0.35 }));
  g.add(part(roughBox(0.62, 0.08, 0.62, 9703, 0.06), T.cap, { y: 0.86 }));
  const niche = joint(g, 0, 0.9, 0);
  niche.rotation.y = FACE_VIEW;
  // the niche: back, two sides, a floor, a gabled roof
  niche.add(part(new THREE.BoxGeometry(0.52, 0.6, 0.06), S.dressed, { y: 0.3, z: -0.2 }));
  for (const sx of [-1, 1]) niche.add(part(new THREE.BoxGeometry(0.07, 0.6, 0.46), S.dressed, { x: sx * 0.26, y: 0.3, z: 0 }));
  niche.add(part(new THREE.BoxGeometry(0.52, 0.05, 0.46), S.dressed, { y: 0.025 }));
  niche.add(part(new THREE.BoxGeometry(0.4, 0.5, 0.02), S.joint, { y: 0.3, z: -0.165 }));
  for (const sx of [-1, 1]) niche.add(part(new THREE.BoxGeometry(0.4, 0.06, 0.56), T.cap, { x: sx * 0.15, y: 0.69, rz: sx * -0.62 }));
  niche.add(part(new THREE.ConeGeometry(0.05, 0.14, 4), T.cap, { y: 0.86, ry: Math.PI / 4 }));
  // the figure: a hooded robe, head bowed, of pale worn stone
  const pale = S.dressed;
  niche.add(part(new THREE.CylinderGeometry(0.06, 0.12, 0.34, 10), pale, { y: 0.22, z: -0.06 }));
  niche.add(part(new THREE.SphereGeometry(0.07, 10, 8), pale, { y: 0.42, z: -0.05 }));
  niche.add(part(new THREE.ConeGeometry(0.085, 0.16, 10), pale, { y: 0.47, z: -0.07, rx: -0.25 }));
  niche.add(part(new THREE.CircleGeometry(0.045, 10), S.joint, { y: 0.41, z: 0.012 }));
  // before it: a bowl of offerings, two candles (one guttered, one burning)
  niche.add(part(new THREE.CylinderGeometry(0.07, 0.04, 0.035, 12), M.brass, { x: 0.02, y: 0.07, z: 0.12 }));
  const R = rng(9705);
  for (let i = 0; i < 3; i++)
    niche.add(part(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 10), M.gold, { x: 0.02 + (R() - 0.5) * 0.06, y: 0.09, z: 0.12 + (R() - 0.5) * 0.05, rx: R() - 0.5 }));
  niche.add(part(new THREE.CylinderGeometry(0.022, 0.026, 0.12, 8), M.vellum, { x: -0.16, y: 0.11, z: 0.12 }));
  niche.add(unshadowed(part(new THREE.ConeGeometry(0.018, 0.06, 8), M.flame, { x: -0.16, y: 0.2, z: 0.12 })));
  niche.add(part(new THREE.CylinderGeometry(0.022, 0.03, 0.05, 8), M.vellum, { x: 0.17, y: 0.075, z: 0.1 }));
  return scaled(g, 1.25);
}

// ── Barriers ────────────────────────────────────────────────────────────────────────

const GATE_BARS = 8;
const GATE_H = 2.1;
const GATE_BEAM = 2.26;
/** How far an open gate's portcullis is wound up: its spikes clear a delver's head. */
const GATE_LIFT = 1.78;

/**
 * One cell of the gate (§B R13, §E R32): an iron portcullis across the corridor under an oak beam,
 * a stone sill with its slot under it. A piece is exactly one cell along `axis` and carries no
 * jamb, so a gate two or three cells wide is one piece per cell, centred on each, and the bars keep
 * their spacing across the joins; the corridor's walls are its jambs. `shut`: down in its slot;
 * `open`: wound up under the beam, its spiked foot overhead.
 */
export function gate(state, axis) {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  const L = CELL;
  g.add(part(new THREE.BoxGeometry(L, 0.04, 0.34), T.cap, { y: 0.02 }));
  g.add(part(new THREE.BoxGeometry(L, 0.01, 0.07), S.joint, { y: 0.041 }));
  // the beam, bound in iron at its quarters
  g.add(part(new THREE.BoxGeometry(L, 0.24, 0.3), M.beam, { y: GATE_BEAM }));
  for (const x of [-0.5, 0.5]) g.add(part(new THREE.BoxGeometry(0.06, 0.26, 0.32), M.iron, { x, y: GATE_BEAM }));
  const port = new THREE.Group();
  const step = L / GATE_BARS;
  for (let i = 0; i < GATE_BARS; i++) {
    const x = -L / 2 + step * (i + 0.5);
    port.add(part(new THREE.BoxGeometry(0.06, GATE_H - 0.06, 0.06), T.rust, { x, y: GATE_H / 2 + 0.03 }));
    port.add(part(new THREE.ConeGeometry(0.04, 0.14, 4), M.iron, { x, y: 0.0, rx: Math.PI, ry: Math.PI / 4 }));
  }
  for (const y of [0.32, 0.98, 1.64, GATE_H - 0.04]) {
    port.add(part(new THREE.BoxGeometry(L, 0.065, 0.035), M.iron, { y, z: 0.045 }));
    for (let i = 0; i < GATE_BARS; i++)
      port.add(part(new THREE.SphereGeometry(0.022, 6, 5), M.iron, { x: -L / 2 + step * (i + 0.5), y, z: 0.06 }));
  }
  port.position.y = state === "open" ? GATE_LIFT : 0.07;
  g.add(port);
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

const PIT_PX = 256;
/**
 * A chasm cell's floor, painted (a flat cell can carry no depth below the ground): the dark it
 * falls into, a cold mist far down, and the rock face it falls from on its `n` and `w` edges, the
 * two the camera sees down into. Noise tiles each cell's width, so faces carry on across cells.
 */
const PIT_TEX = {};
function pitTexture(rims) {
  if (PIT_TEX[rims]) return PIT_TEX[rims];
  const P = PIT_PX;
  const face = (along, depth, s) => {
    // depth: px from the rim; the face falls away in ledges and cracks, fading into the dark
    const ledge = fbm(along / 16, depth / 4, s, 3, P / 16);
    const crack = smoothstep(0.62, 0.7, vnoise(along / 6, depth / 40, s + 1, P / 6));
    const lit = 1 - smoothstep(0, P * 0.42, depth);
    const lip = 1 + 0.35 * (1 - smoothstep(0, 7, depth));
    const tone = (0.55 + 0.65 * ledge) * (1 - 0.6 * crack) * (0.06 + 1.05 * lit ** 1.6) * lip;
    return { c: shade(mix(ROCK_LO, ROCK_HI, 0.7 * lit), tone), k: 1 - smoothstep(P * 0.36, P * 0.46, depth) };
  };
  const tex = pixelTexture(P, P, (x, y) => {
    const n = fbm(x / 64, y / 64, 9801, 3, 4);
    let c = mix(ABYSS, MIST, 0.4 * smoothstep(0.5, 0.85, n));
    const faces = [];
    if (rims.includes("n")) faces.push(face(x, y - fbm(x / 20, 0, 9803, 3, P / 20) * 14, 9805));
    if (rims.includes("w")) faces.push(face(y, x - fbm(0, y / 20, 9807, 3, P / 20) * 14, 9809));
    for (const f of faces) c = mix(c, f.c, f.k);
    return c;
  });
  PIT_TEX[rims] = textured(tex, { rough: 1, bump: 0.6 });
  return PIT_TEX[rims];
}

/**
 * A pit cell of the Chasm (§E R33), laid as ground under every body. `open`: the dark alone, for a
 * cell whose north and west neighbours are pit too; `n`, `w`, `nw`: the rock face falling from the
 * floor on that edge, with broken lip stones along it, for a cell whose neighbour there is floor.
 * The south and east edges never show a face (the camera cannot see under them).
 */
export function pitCell(state) {
  const T = towerMaterials();
  const g = new THREE.Group();
  const rims = state === "open" ? "" : state;
  const floor = part(new THREE.PlaneGeometry(CELL + SEAM, CELL + SEAM), pitTexture(rims), { y: 0.001, rx: -Math.PI / 2 });
  g.add(floor);
  const R = rng(rims.length * 131 + 9811);
  const lip = (along) => {
    for (let t = -CELL / 2 + 0.08; t < CELL / 2 - 0.12; ) {
      const w = 0.14 + R() * 0.2;
      if (R() > 0.25) {
        const stone = part(roughBox(w, 0.05 + R() * 0.04, 0.12 + R() * 0.1, Math.floor(R() * 1000), 0.3), R() > 0.5 ? T.block : T.dark, {});
        along(stone, t + w / 2, R());
        g.add(stone);
      }
      t += w + 0.02;
    }
  };
  // the stones stay inside the cell (their depth is at most 0.22): the cell's floor neighbour is
  // the client's ground, which they lie at the edge of
  if (rims.includes("n")) lip((m, t, r) => m.position.set(t, 0.02, -CELL / 2 + 0.11 + r * 0.03));
  if (rims.includes("w")) lip((m, t, r) => m.position.set(-CELL / 2 + 0.11 + r * 0.03, 0.02, t));
  return g;
}

/**
 * A cell of the lowered bridge (§E R33): planks laid across the crossing on two stringers, nailed
 * and strapped, the chasm's dark between them. `x`: the crossing runs along world x (the planks
 * along y); `y`: turned. A plank spans the whole cell, so the lane's two cells read as one deck.
 */
export function bridgeCell(axis) {
  const M = materials();
  const S = sealedMaterials();
  const g = new THREE.Group();
  g.add(part(new THREE.PlaneGeometry(CELL + SEAM, CELL + SEAM), pitTexture(""), { y: 0.001, rx: -Math.PI / 2 }));
  for (const z of [-0.6, 0.6]) g.add(part(new THREE.BoxGeometry(CELL, 0.12, 0.16), M.beam, { y: -0.02, z }));
  const planks = 8;
  const pw = CELL / planks;
  const R = rng(9821);
  for (let i = 0; i < planks; i++) {
    const x = -CELL / 2 + pw * (i + 0.5);
    const len = CELL - 0.02 - R() * 0.06;
    g.add(
      part(new THREE.BoxGeometry(pw - 0.02, 0.05, len), R() > 0.3 ? S.plank : S.plankDark, {
        x,
        y: 0.05 + R() * 0.008,
        z: (R() - 0.5) * 0.04,
        ry: (R() - 0.5) * 0.03,
      }),
    );
    for (const z of [-0.6, 0.6]) g.add(part(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6), M.iron, { x, y: 0.079, z }));
  }
  for (const z of [-0.6, 0.6]) g.add(part(new THREE.BoxGeometry(CELL, 0.012, 0.06), towerMaterials().rust, { y: 0.081, z }));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/** A secret door's cracks (white where they are), on a wall piece's face `h` tall. */
const CRACK_TEX = {};
function crackTexture(back) {
  const key = back ? "back" : "front";
  if (CRACK_TEX[key]) return CRACK_TEX[key];
  const W = 128;
  const H = back ? 280 : 128;
  const c = mkCanvas(W, H);
  const ctx = c.getContext("2d");
  const R = rng(back ? 9901 : 9903);
  const jag = (pts, width, tone) => {
    ctx.strokeStyle = cssRgb(tone);
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  // a crack wandering from (x0, y0) to (x1, y1), stepped like a crack through mortar
  const wander = (x0, y0, x1, y1, steps, amp) => {
    const pts = [[x0, y0]];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      pts.push([x0 + (x1 - x0) * t + (R() - 0.5) * amp, y0 + (y1 - y0) * t + (R() - 0.5) * amp]);
    }
    pts.push([x1, y1]);
    return pts;
  };
  const cracks = [];
  // the slab's foot does not meet the floor: a dark seam the whole piece wide, ends level
  cracks.push({ pts: wander(0, H - 3, W, H - 3, 8, 2), w: 4 });
  if (back) {
    // the lintel's seam, level at both ends so pieces carry it on
    cracks.push({ pts: wander(0, 58, W, 58, 10, 9), w: 4 });
    // stepped joints down from it, and hairlines branching off
    for (const x of [28 + R() * 20, 84 + R() * 22]) {
      const pts = wander(x, 58, x + (R() - 0.5) * 22, H - 3, 9, 14);
      cracks.push({ pts, w: 3 });
      const k = 2 + Math.floor(R() * 5);
      cracks.push({ pts: wander(pts[k][0], pts[k][1], pts[k][0] + (R() - 0.5) * 50, pts[k][1] + 16 + R() * 30, 4, 8), w: 1.6 });
    }
  } else {
    for (const x of [30 + R() * 20, 86 + R() * 20]) {
      const pts = wander(x, 8 + R() * 10, x + (R() - 0.5) * 18, H - 3, 6, 12);
      cracks.push({ pts, w: 3 });
      cracks.push({ pts: wander(pts[2][0], pts[2][1], pts[2][0] + (R() - 0.5) * 40, pts[2][1] + 20, 3, 6), w: 1.5 });
    }
  }
  // a chipped pale edge first, the dark of the crack over it
  for (const { pts, w } of cracks) jag(pts.map(([x, y]) => [x + 1, y + 1]), w + 2.5, mix("vellumFaint", "slateLight", 0.4));
  for (const { pts, w } of cracks) jag(pts, w, mix("pitch", "charcoal", 0.3));
  const t = canvasTexture(c);
  CRACK_TEX[key] = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.08, roughness: 1, depthWrite: false });
  return CRACK_TEX[key];
}

/**
 * The faint cracks of a detected secret door (§F R38): a decal for a masonry wall piece's face,
 * drawn over the piece at its own position and anchor, on every piece of the face the door is
 * (the door's seam runs on across them). `x`, `y`: a back (full-height) piece along that axis;
 * `front_x`, `front_y`: a cut-away piece. A little grit has fallen from the seams at its foot.
 */
export function secretCracks(variant) {
  const back = !variant.startsWith("front");
  const axis = variant.endsWith("y") ? "y" : "x";
  const M = materials();
  const g = new THREE.Group();
  const H = back ? 2.2 : 1.0;
  g.add(part(new THREE.PlaneGeometry(WALL_LEN, H), crackTexture(back), { y: H / 2, z: WALL_FACE + 0.006 }));
  const R = rng(back ? 9911 : 9913);
  for (let i = 0; i < 7; i++)
    g.add(part(new THREE.SphereGeometry(0.018 + R() * 0.02, 5, 4), M.stone, { x: (R() - 0.5) * 0.8, y: 0.01, z: WALL_FACE + 0.05 + R() * 0.12, sy: 0.6 }));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

// ── Traps (§D R24–R28) ──────────────────────────────────────────────────────────────

const SPIKE_GRID = 5;
/**
 * The spike plate: an iron grating sunk in the floor. `armed`: the spikes' points just showing in
 * its holes; `sprung`: five rows of spikes thrust up, blood on their points.
 */
export function spikePlate(state) {
  const M = materials();
  const S = sealedMaterials();
  const g = new THREE.Group();
  const P = 1.36;
  g.add(slab(P, P, S.abyss, 0.004));
  const step = P / SPIKE_GRID;
  // the grating: bars both ways between the holes, and a frame
  for (let i = 0; i <= SPIKE_GRID; i++) {
    const t = -P / 2 + step * i;
    g.add(part(new THREE.BoxGeometry(P + 0.06, 0.035, 0.05), M.iron, { y: 0.017, z: t }));
    g.add(part(new THREE.BoxGeometry(0.05, 0.035, P + 0.06), M.iron, { x: t, y: 0.017 }));
  }
  const sprung = state === "sprung";
  for (let i = 0; i < SPIKE_GRID; i++)
    for (let j = 0; j < SPIKE_GRID; j++) {
      const x = -P / 2 + step * (i + 0.5);
      const z = -P / 2 + step * (j + 0.5);
      const h = sprung ? 0.42 + hash2(i, j, 9953) * 0.12 : 0.05;
      g.add(part(new THREE.ConeGeometry(0.05, h, 5), M.iron, { x, y: h / 2 - (sprung ? 0 : 0.02), z }));
      if (sprung && hash2(i, j, 9955) > 0.45) g.add(part(new THREE.ConeGeometry(0.022, h * 0.3, 5), S.blood, { x, y: h - h * 0.15 + 0.002, z }));
    }
  return g;
}

/**
 * The dart wall: a knee-high sill of old stone along the cell's back edge, a row of dark holes in
 * its face, and the loose flag before it that springs it. `sprung`: the flag pressed, darts in
 * flight across the cell with their wake, one already in the floor.
 */
export function dartWall(state) {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  const sprung = state === "sprung";
  const sillZ = -0.78;
  g.add(part(roughBox(1.8, 0.5, 0.32, 9963, 0.06), T.block, { y: 0.25, z: sillZ }));
  g.add(part(roughBox(1.86, 0.08, 0.38, 9965, 0.08), T.cap, { y: 0.54, z: sillZ }));
  const holes = [-0.6, -0.2, 0.2, 0.6];
  for (const x of holes) {
    g.add(part(new THREE.CircleGeometry(0.045, 10), S.joint, { x, y: 0.3, z: sillZ + 0.165 }));
    g.add(part(new THREE.TorusGeometry(0.05, 0.012, 5, 12), M.iron, { x, y: 0.3, z: sillZ + 0.163 }));
  }
  // the trigger flag
  g.add(slab(0.5, 0.5, S.joint, 0.003));
  g.add(part(roughBox(0.46, 0.05, 0.46, 9967, 0.12), T.blockLight, { y: sprung ? 0.008 : 0.03 }));
  if (sprung) {
    const dart = (x, z, y, tilt = 0) => {
      const d = joint(g, x, y, z);
      d.rotation.x = tilt;
      d.add(part(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 5), M.woodDark, { rx: Math.PI / 2 }));
      d.add(part(new THREE.ConeGeometry(0.03, 0.09, 5), M.steel, { z: 0.22, rx: Math.PI / 2 }));
      for (const r of [0, Math.PI / 2]) d.add(part(new THREE.PlaneGeometry(0.07, 0.1), S.fletch, { z: -0.15, ry: Math.PI / 2, rz: r }));
      return d;
    };
    const wake = new THREE.MeshBasicMaterial({ color: color(mix("vellum", "slateLight", 0.4)), transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    holes.forEach((x, i) => {
      const z = -0.1 + i * 0.28 - (i % 2) * 0.2;
      dart(x, z, 0.3);
      g.add(unshadowed(part(new THREE.PlaneGeometry(0.03, z - sillZ - 0.3), wake, { x, y: 0.3, z: (z + sillZ) / 2, rx: Math.PI / 2 })));
    });
    dart(0.35, 0.86, 0.12, 0.6);
  }
  return g;
}

const FIRE = ["fireCore", "fireHot", "ember", "fireDeep"];
/**
 * The fire jet: an iron nozzle in a scorched flag, slotted like a grate. `armed`: cold, soot round
 * it; `sprung`: a column of flame roaring up out of it in fire's ramp, white-hot at the root.
 */
export function fireJet(state) {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  g.add(part(roughBox(1.2, 0.03, 1.2, 9973, 0.1), T.dark, { y: 0.015 }));
  g.add(part(new THREE.CircleGeometry(0.62, 24), S.soot, { y: 0.032, rx: -Math.PI / 2 }));
  g.add(part(new THREE.CylinderGeometry(0.28, 0.32, 0.07, 16), M.iron, { y: 0.06 }));
  g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 16), S.joint, { y: 0.096 }));
  for (let i = 0; i < 6; i++) g.add(part(new THREE.BoxGeometry(0.4, 0.03, 0.035), M.iron, { y: 0.1, ry: (i / 6) * Math.PI }));
  if (state === "sprung") {
    const R = rng(9975);
    // a flame tongue: a lathe that swells, then pinches to a flickering point, bent by noise
    const tongue = (r, h, seed) => {
      const prof = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        prof.push(new THREE.Vector2(r * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.08)) * (1 - t) ** 0.6 + 0.002, t * h));
      }
      const geo = new THREE.LatheGeometry(prof, 12);
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const t = v.y / h;
        const n = vnoise3(v.x * 6, v.y * 3, v.z * 6, seed) - 0.5;
        pos.setXYZ(i, v.x * (1 + n * 0.5) + Math.sin(t * 5 + seed) * 0.06 * t, v.y, v.z * (1 + n * 0.5) + Math.cos(t * 4 + seed) * 0.05 * t);
      }
      geo.computeVertexNormals();
      return geo;
    };
    FIRE.forEach((token, k) => {
      const flame = new THREE.MeshStandardMaterial({
        color: color(grey(0)),
        emissive: color(token),
        emissiveIntensity: [3.2, 2.6, 2.2, 1.5][k],
        transparent: true,
        opacity: [1, 0.85, 0.6, 0.4][k],
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const r = [0.1, 0.17, 0.24, 0.3][k];
      const h = [0.85, 1.3, 1.65, 1.9][k];
      const n = k ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R() * 1.5;
        const off = k * 0.05;
        g.add(unshadowed(part(tongue(r * (0.75 + R() * 0.4), h * (0.8 + R() * 0.3), 9977 + k * 10 + i), flame, { x: Math.cos(a) * off, y: 0.1, z: Math.sin(a) * off, ry: R() * 6 })));
      }
    });
    for (let i = 0; i < 10; i++)
      g.add(unshadowed(part(new THREE.SphereGeometry(0.018, 5, 4), M.ember, { x: (R() - 0.5) * 0.7, y: 0.6 + R() * 1.5, z: (R() - 0.5) * 0.7 })));
  }
  return g;
}

/**
 * The tripwire: a wire drawn taut at the ankle between two iron stakes driven into the floor, a
 * small bell hung on one to wake what waits. `sprung`: snapped, its ends curled on the floor, the
 * stakes knocked askew, the bell fallen on its side.
 */
export function tripwire(state) {
  const M = materials();
  const S = sealedMaterials();
  const g = new THREE.Group();
  const sprung = state === "sprung";
  const a = V3(-0.72, 0, -0.42);
  const b = V3(0.72, 0, 0.42);
  const wireY = 0.16;
  const stake = (p, lean) => {
    const s = joint(g, p.x, 0, p.z);
    s.rotation.z = lean;
    s.add(part(new THREE.CylinderGeometry(0.034, 0.012, 0.36, 6), M.iron, { y: 0.14 }));
    s.add(part(new THREE.TorusGeometry(0.036, 0.011, 5, 10), M.iron, { y: wireY, rx: Math.PI / 2 }));
    s.add(part(new THREE.CylinderGeometry(0.05, 0.045, 0.04, 8), M.iron, { y: 0.33 }));
    s.add(part(new THREE.SphereGeometry(0.07, 7, 5), towerMaterials().dark, { y: 0.01, sy: 0.35 }));
    return s;
  };
  stake(a, sprung ? 0.35 : 0);
  stake(b, sprung ? -0.25 : 0);
  if (!sprung) {
    g.add(rod(V3(a.x, wireY, a.z), V3(b.x, wireY, b.z), 0.012, 0.012, S.wire, 5));
    g.add(part(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 5), M.iron, { x: b.x, y: 0.28, z: b.z + 0.04 }));
    g.add(part(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), M.brass, { x: b.x, y: 0.22, z: b.z + 0.05 }));
  } else {
    const end = (from, pts) => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, ...pts]), 20, 0.012, 4, false), S.wire));
    end(V3(a.x + 0.05, wireY, a.z), [V3(-0.45, 0.04, -0.2), V3(-0.3, 0.01, -0.3), V3(-0.38, 0.01, -0.12)]);
    end(V3(b.x - 0.05, wireY - 0.05, b.z), [V3(0.5, 0.03, 0.24), V3(0.38, 0.01, 0.38), V3(0.3, 0.01, 0.22)]);
    g.add(part(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), M.brass, { x: 0.82, y: 0.05, z: 0.66, rz: 1.5 }));
  }
  // the wire runs across the screen, as a line across the way reads
  g.rotation.y = Math.PI / 2;
  return g;
}

/** The gas: a lumpy cloud of `size` about `at`, `opacity` thick, seeded by `seed`. */
function gasCloud(g, seed, at, size, opacity) {
  const R = rng(seed);
  const mat = new THREE.MeshStandardMaterial({
    color: color(BILE),
    emissive: color(mix(BILE, "vellum", 0.2)),
    emissiveIntensity: 0.35,
    roughness: 1,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const lobes = 9;
  for (let i = 0; i < lobes; i++) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const s = seed + i * 7;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const n = vnoise3(v.x * 2.2, v.y * 2.2, v.z * 2.2, s);
      v.multiplyScalar(0.75 + 0.5 * n);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const r = size * (0.3 + R() * 0.25);
    const a = R() * Math.PI * 2;
    const d = R() * size * 0.45;
    g.add(unshadowed(part(geo, mat, { x: at[0] + Math.cos(a) * d, y: at[1] + (R() - 0.3) * size * 0.5, z: at[2] + Math.sin(a) * d, sx: r, sy: r * 0.8, sz: r })));
  }
}

/** The puff, frame by frame: the cloud swelling up out of the vent and thinning as it spreads. */
export const GAS_PUFF = [
  { size: 0.35, y: 0.25, opacity: 0.55 },
  { size: 0.7, y: 0.5, opacity: 0.55 },
  { size: 1.05, y: 0.7, opacity: 0.5 },
  { size: 1.3, y: 0.82, opacity: 0.4 },
  { size: 1.5, y: 0.9, opacity: 0.28 },
  { size: 1.65, y: 0.95, opacity: 0.15 },
];

/**
 * The gas vent: a cracked flag over a pit, an iron grille in it crusted round with what it
 * breathes, a skull beside it. `armed`: a thin wisp over the grille (a vent is always armed);
 * `sprung`: the puff at its height; `puff` (by frame, GAS_PUFF): the cloud swelling and thinning.
 * The gas is a sour bile, not the arcane green that means safe.
 */
export function gasVent(state, frame = 0) {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  g.add(part(roughBox(1.1, 0.03, 1.1, 9993, 0.12), T.dark, { y: 0.015 }));
  g.add(part(new THREE.CircleGeometry(0.5, 20), S.crust, { y: 0.033, rx: -Math.PI / 2 }));
  g.add(part(new THREE.CircleGeometry(0.26, 16), S.joint, { y: 0.036, rx: -Math.PI / 2 }));
  g.add(part(new THREE.TorusGeometry(0.27, 0.03, 6, 20), M.rust, { y: 0.045, rx: Math.PI / 2 }));
  for (const x of [-0.16, -0.08, 0, 0.08, 0.16]) g.add(part(new THREE.BoxGeometry(0.025, 0.025, 0.5 * Math.sqrt(1 - (x / 0.27) ** 2)), M.rust, { x, y: 0.05 }));
  const R = rng(9995);
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2;
    g.add(part(new THREE.SphereGeometry(0.04 + R() * 0.04, 6, 5), S.crust, { x: Math.cos(a) * 0.34, y: 0.035, z: Math.sin(a) * 0.34, sy: 0.4 }));
  }
  // a skull, the last to breathe it
  const skull = joint(g, 0.55, 0.06, 0.38);
  skull.rotation.set(0.2, -0.7, 0.3);
  skull.add(part(new THREE.SphereGeometry(0.075, 10, 8), S.bone, { sz: 1.15 }));
  skull.add(part(new THREE.BoxGeometry(0.08, 0.05, 0.06), S.bone, { y: -0.05, z: 0.05 }));
  for (const sx of [-1, 1]) skull.add(part(new THREE.SphereGeometry(0.02, 6, 5), S.joint, { x: sx * 0.03, y: 0.0, z: 0.075 }));
  if (state === "armed") gasCloud(g, 9997, [0, 0.16, 0], 0.22, 0.32);
  else {
    const p = GAS_PUFF[state === "sprung" ? 3 : frame];
    gasCloud(g, 9999, [0, p.y, 0], p.size, p.opacity);
  }
  return g;
}

// ── Respites (§G R40–R41) ───────────────────────────────────────────────────────────

let WATER_MAT = null;
/**
 * The fountain's water: dark and still, pale rings where the falls strike it, and a glow rising
 * from its heart in health's own colour (the guideline's "restoring a resource" channel).
 */
function waterMaterial() {
  if (WATER_MAT) return WATER_MAT;
  const P = 128;
  const ring = (x, y) => {
    const r = Math.hypot(x - P / 2, y - P / 2) / (P / 2);
    return { r, wave: 0.5 + 0.5 * Math.sin(r * 34 + fbm(x / 10, y / 10, 10031) * 4) };
  };
  const map = pixelTexture(P, P, (x, y) => {
    const { r, wave } = ring(x, y);
    const c = mix(WATER, mix("necrotic", "vellum", 0.4), 0.22 * smoothstep(0.55, 0.95, wave) * smoothstep(0.35, 0.8, r));
    return shade(c, 0.85 + 0.25 * fbm(x / 12, y / 12, 10033));
  });
  const glowMap = pixelTexture(P, P, (x, y) => {
    const { r } = ring(x, y);
    return shade(HEAL, (1 - smoothstep(0.05, 0.75, r)) * (0.8 + 0.4 * fbm(x / 9, y / 9, 10035)));
  });
  WATER_MAT = new THREE.MeshStandardMaterial({ map, emissive: color(grey(255)), emissiveMap: glowMap, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.25 });
  return WATER_MAT;
}

/**
 * The healing fountain: an octagonal basin of old stone on a step, a pillar rising from it to an
 * upper bowl that spills into the basin. `full`: the water lit faintly from within in health's own
 * colour; `dry`: the basin empty to its cracked floor, a dark tide-mark where the water stood,
 * the bowl dry.
 */
export function fountain(state) {
  const M = materials();
  const S = sealedMaterials();
  const T = towerMaterials();
  const g = new THREE.Group();
  const full = state === "full";
  const Rb = 0.9;
  const wallH = 0.42;
  const sides = 8;
  g.add(part(new THREE.CylinderGeometry(Rb + 0.16, Rb + 0.2, 0.1, sides, 1, false, Math.PI / 8), T.block, { y: 0.05 }));
  // the basin's wall, stone by stone, and its coping
  const seg = 2 * Rb * Math.tan(Math.PI / sides);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const cx = Math.cos(a) * (Rb - 0.06);
    const cz = Math.sin(a) * (Rb - 0.06);
    g.add(part(roughBox(seg + 0.02, wallH, 0.14, 10001 + i, 0.05), S.dressed, { x: cx, y: 0.1 + wallH / 2, z: cz, ry: -a + Math.PI / 2 }));
    g.add(part(roughBox(seg + 0.06, 0.06, 0.2, 10011 + i, 0.08), T.cap, { x: cx, y: 0.1 + wallH + 0.03, z: cz, ry: -a + Math.PI / 2 }));
  }
  g.add(part(new THREE.CylinderGeometry(Rb - 0.1, Rb - 0.1, 0.04, sides, 1, false, Math.PI / 8), S.dressedDark, { y: 0.12 }));
  // the pillar, its upper bowl and finial
  g.add(part(new THREE.CylinderGeometry(0.13, 0.17, 0.85, 10), S.dressed, { y: 0.14 + 0.42 }));
  for (const y of [0.2, 0.92]) g.add(part(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 10), T.cap, { y }));
  const bowl = [
    [0.05, 0],
    [0.24, 0.04],
    [0.38, 0.14],
    [0.42, 0.2],
    [0.4, 0.21],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(bowl, 20), new THREE.MeshStandardMaterial({ map: S.dressed.map, bumpMap: S.dressed.map, bumpScale: 0.6, roughness: 0.9, side: THREE.DoubleSide }), { y: 0.95 }));
  g.add(part(new THREE.CylinderGeometry(0.03, 0.06, 0.2, 8), S.dressed, { y: 1.25 }));
  g.add(part(new THREE.SphereGeometry(0.06, 8, 6), S.dressed, { y: 1.38 }));
  if (full) {
    const water = waterMaterial();
    g.add(part(new THREE.CircleGeometry(Rb - 0.11, sides * 3), water, { y: 0.44, rx: -Math.PI / 2 }));
    g.add(part(new THREE.CircleGeometry(0.39, 20), water, { y: 1.14, rx: -Math.PI / 2 }));
    // ripples where it falls, and the falls themselves from the bowl's lip
    const ripple = new THREE.MeshStandardMaterial({ color: color(HEAL), emissive: color(HEAL), emissiveIntensity: 0.4, roughness: 0.3, transparent: true, opacity: 0.5, depthWrite: false });
    for (const r of [0.55, 0.68]) g.add(unshadowed(part(new THREE.TorusGeometry(r, 0.008, 4, 40), ripple, { y: 0.455, rx: Math.PI / 2 })));
    const fall = new THREE.MeshStandardMaterial({ color: color(mix(HEAL, "vellum", 0.55)), emissive: color(HEAL), emissiveIntensity: 0.15, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      g.add(unshadowed(part(new THREE.CylinderGeometry(0.01, 0.022, 0.7, 6, 1, true), fall, { x: Math.cos(a) * 0.43, y: 0.8, z: Math.sin(a) * 0.43 })));
    }
  } else {
    // the tide-mark inside the wall, cracks and leaf-litter on the basin floor
    g.add(part(new THREE.CylinderGeometry(Rb - 0.12, Rb - 0.12, 0.012, sides * 3), plain(STAIN, { rough: 1 }), { y: 0.145 }));
    const R = rng(10021);
    for (let i = 0; i < 10; i++) {
      const a = R() * Math.PI * 2;
      const d = 0.25 + R() * 0.45;
      g.add(part(new THREE.BoxGeometry(0.06 + R() * 0.05, 0.006, 0.03), R() > 0.5 ? M.leather : S.soot, { x: Math.cos(a) * d, y: 0.155, z: Math.sin(a) * d, ry: R() * 3 }));
    }
    g.add(part(new THREE.CircleGeometry(0.34, 16), plain(STAIN, { rough: 1 }), { y: 1.0, rx: -Math.PI / 2 }));
  }
  return scaled(g, 1.0);
}
