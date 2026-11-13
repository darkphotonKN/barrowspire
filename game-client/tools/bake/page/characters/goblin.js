// The goblin (FS-C8VM7 §H R46): the first of the tiered roster's new families, on the shared
// humanoid rig (ADR-0021), built in code, never sourced. Little (the fodder band, below a ghoul's
// height), green, ugly and sharp-eyed: a big head on a scrawny, hunched, pot-bellied body, long
// pointed ears swept out from the skull, a long hooked nose, a heavy brow over narrow ember eyes,
// an underbite with two fangs, long arms and big hands and feet. A scrap-leather jerkin open down
// the front, a ragged loincloth, leather wraps on the forearms. It carries one crude, rust-brown
// blade low in its right hand; the shield look adds a small round wooden buckler on the left
// forearm.
//
// It scuttles low and quick, jerking its head, and its attack is an overhand slash from high over
// the right shoulder, down and across: the same throw of the arm a thrown dagger takes (R38), so
// the one clip serves both. It dies as the ghoul does, the eyes going out by the last frame.
//
// Its tiers (R46) are baked recolours of this look, deepening with the step (GOBLIN_STEPS): the
// hide goes from a muddy olive toward a near-black bog green, the leather and rags toward black.
// Green is the family's colour by the owner's brief; it is a body colour only, kept darker and
// duller than `arcane` (which means safe), never an emissive or a marker. The eyes stay ember red.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { smoothstep, voronoi } from "../noise.js";
import { attach, createRig, ellipsoid, jointAt as J, rigidTube } from "./rig.js";
import { arms, bareFeet, belt, hands, legs, neck, overTorso, skirt, skirtBones, torso } from "./anatomy.js";
import { add, deathClip, idleCycle, pose, walkCycle } from "./clips.js";
import { fabrics, mat, paint, pf, pn } from "./fabrics.js";
import { inHand, limbGuard } from "./gear.js";
import { fadingEyes } from "./forlorn.js";
import { toneOf } from "./variantTones.js";

const P = pose;
const sides = [
  ["L", 1],
  ["R", -1],
];

/**
 * The four steps' tones (R46), recipes over BARROW (variantTones.js `toneOf`): `skin` the hide,
 * `leather` the jerkin, wraps and belt, `rag` the loincloth. Each step deeper than the one below.
 */
export const GOBLIN_STEPS = {
  goblin: {
    skin: { base: "arcaneDeep", steps: [["arcane", 0.22], ["barrowBrown", 0.3], ["charcoal", 0.12]] },
    leather: { base: "barrowBrown", steps: [["barrowDeep", 0.3]] },
    rag: { base: "barrowBrown", steps: [["slate", 0.4]] },
  },
  goblin_cutthroat: {
    skin: { base: "arcaneDeep", steps: [["barrowBrown", 0.35]], shade: 0.86 },
    leather: { base: "barrowDeep", steps: [["pitch", 0.2]] },
    rag: { base: "barrowDeep", steps: [["oxblood", 0.2]] },
  },
  goblin_reaver: {
    skin: { base: "arcaneDeep", steps: [["slate", 0.45], ["charcoal", 0.3]] },
    leather: { base: "barrowDeep", steps: [["pitch", 0.45]] },
    rag: { base: "charcoal", steps: [["slate", 0.35]] },
  },
  goblin_warchief: {
    skin: { base: "arcaneDeep", steps: [["pitch", 0.55]], shade: 0.95 },
    leather: { base: "pitch", steps: [["barrowDeep", 0.35]] },
    rag: { base: "pitch", steps: [["oxblood", 0.25]] },
  },
};

// --- materials -----------------------------------------------------------------------------

/** Goblin hide: warty, creased and mottled, darker in the folds. */
function wartyHide(tone, seed) {
  return paint(
    (x, y) => {
      const v = voronoi(x / 6, y / 6, seed, 128 / 6 >= 1 ? Math.floor(128 / 6) : 1);
      const wart = (1 - smoothstep(0.08, 0.3, v.f1)) * (v.id > 0.72 ? 1 : 0);
      const crease = 1 - smoothstep(0.0, 0.08, v.f2 - v.f1);
      const mottle = pf(x, y, 32, seed + 2);
      const h = 0.45 + 0.35 * wart - 0.2 * crease + 0.15 * pn(x, y, 4, 4, seed + 3);
      let c = shade(tone, 0.82 + 0.12 * wart - 0.18 * crease + 0.3 * (mottle - 0.5));
      c = mix(c, mix("barrowDeep", "barrowBrown", 0.5), 0.25 * smoothstep(0.55, 0.8, pf(x, y, 16, seed + 4)));
      return { c, h };
    },
    { strength: 1.8 },
  );
}

/** Scrap leather: patched, scuffed, stitched across in rough seams. */
function scrapLeather(tone, seed) {
  return paint(
    (x, y) => {
      const patch = pf(x, y, 32, seed) > 0.55 ? 1.12 : 0.92;
      const seam = Math.abs(((y + 8 * pf(x, y, 32, seed + 1)) % 32) - 16) < 0.8 ? 1 : 0;
      const scuff = smoothstep(0.6, 0.82, pf(x, y, 16, seed + 2));
      const h = 0.5 - 0.3 * seam + 0.1 * pn(x, y, 2, 2, seed + 3);
      let c = shade(tone, patch * (0.8 + 0.25 * pf(x, y, 16, seed + 4)) - 0.25 * seam);
      c = mix(c, shade(tone, 1.45), 0.3 * scuff);
      return { c, h };
    },
    { strength: 1.5 },
  );
}

/** Ragged, filthy cloth, holed and stained. */
function filthyRag(tone, seed) {
  return paint(
    (x, y) => {
      const weave = 0.5 + 0.25 * Math.sin((x * Math.PI) / 2) * Math.sin((y * Math.PI) / 2);
      const hole = smoothstep(0.72, 0.78, pf(x, y, 16, seed));
      const stain = smoothstep(0.4, 0.8, pf(x, y, 32, seed + 1));
      const h = weave * (1 - hole) + 0.2 * pn(x, y, 2, 2, seed + 2);
      let c = shade(tone, 0.8 + 0.2 * weave - 0.5 * hole);
      c = mix(c, mix("barrowDeep", "pitch", 0.5), 0.45 * stain);
      return { c, h };
    },
    { strength: 1.2 },
  );
}

const SETS = {};

/** A step's material set, painted once per bake. */
function goblinFabrics(step) {
  if (SETS[step]) return SETS[step];
  const recipe = GOBLIN_STEPS[step];
  if (!recipe) throw new Error(`goblin: no step "${step}"`);
  const tone = Object.fromEntries(Object.entries(recipe).map(([k, r]) => [k, toneOf(mix, shade, r)]));
  const D = THREE.DoubleSide;
  SETS[step] = {
    skin: mat(wartyHide(tone.skin, 141), { rough: 0.66, normal: 1 }),
    leather: mat(scrapLeather(tone.leather, 143), { rough: 0.72, side: D }),
    rag: mat(filthyRag(tone.rag, 145), { side: D }),
    // the nails, fangs and the inside of the ears: a dirty horn from the bone mix
    horn: mat(scrapLeather(mix(mix("vellumDark", "barrowBrown", 0.45), tone.skin, 0.15), 147), { rough: 0.5 }),
  };
  return SETS[step];
}

// --- the body ------------------------------------------------------------------------------

/**
 * The goblin's head: a big skull, a heavy brow over narrow, slanted ember eyes, a long hooked
 * nose, long pointed ears swept out and back, and an underslung jaw with two fangs.
 */
function goblinHead(rig, G, eye) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  // the skull, longer than deep and bulging at the back
  attach(rig, "head", ellipsoid(r * 0.92 * H, r * 0.86 * H, r * 1.0 * H, 20), G.skin, [0, hy + 0.05, hz - 0.006]);
  attach(rig, "head", ellipsoid(r * 0.8 * H, r * 0.74 * H, r * 0.62 * H, 16), G.skin, [0, hy + 0.058, hz - r * 0.42]);
  // the face: cheekbones jutting under the eyes, the brow a heavy shelf over them
  attach(rig, "head", ellipsoid(r * 0.82 * H, r * 0.46 * H, r * 0.66 * H, 16), G.skin, [0, hy + 0.026, hz + r * 0.36]);
  attach(rig, "head", ellipsoid(r * 0.9 * H, r * 0.2 * H, r * 0.34 * H, 14), G.skin, [0, hy + 0.068, hz + r * 0.74], { rx: 0.15 });
  for (const [, sx] of sides) {
    // narrow, slanted eyes deep under the brow: sharp, not dull
    attach(rig, "head", ellipsoid(r * 0.27 * H, r * 0.13 * H, r * 0.14 * H, 10), M.black, [sx * r * 0.36, hy + 0.05, hz + r * 0.86], { rz: sx * 0.38 });
    attach(rig, "head", ellipsoid(r * 0.21 * H, r * 0.085 * H, r * 0.08 * H, 8), eye, [sx * r * 0.36, hy + 0.05, hz + r * 0.95], { rz: sx * 0.38, noShadow: true });
    // a long pointed ear, flat, swept out from the side of the skull and up and back
    const ear = new THREE.ConeGeometry(r * 0.32 * H, r * 1.95 * H, 7);
    ear.scale(1, 1, 0.38);
    attach(rig, "head", ear, G.skin, [sx * r * 1.45, hy + 0.062, hz - r * 0.12], { rz: -sx * 1.3, rx: -0.2, ry: sx * 0.35 });
    const inner = new THREE.ConeGeometry(r * 0.19 * H, r * 1.4 * H, 6);
    inner.scale(1, 1, 0.3);
    attach(rig, "head", inner, G.horn, [sx * r * 1.36, hy + 0.061, hz - r * 0.06], { rz: -sx * 1.3, rx: -0.2, ry: sx * 0.35 });
  }
  // the nose: a long hooked cone over a bulbous bridge
  attach(rig, "head", ellipsoid(r * 0.2 * H, r * 0.26 * H, r * 0.22 * H, 10), G.skin, [0, hy + 0.045, hz + r * 1.0]);
  const nose = new THREE.ConeGeometry(r * 0.17 * H, r * 0.95 * H, 8);
  attach(rig, "head", nose, G.skin, [0, hy + 0.026, hz + r * 1.38], { rx: Math.PI / 2 + 0.7 });
  // the jaw, underslung, a dark mouth across it and two fangs standing up out of it
  const [, jy, jz] = J(rig, "jaw");
  attach(rig, "jaw", ellipsoid(r * 0.74 * H, r * 0.3 * H, r * 0.8 * H, 14), G.skin, [0, jy - 0.012, jz + r * 0.22]);
  attach(rig, "jaw", ellipsoid(r * 0.55 * H, r * 0.12 * H, r * 0.3 * H, 10), M.black, [0, jy - 0.0, jz + r * 0.72]);
  for (const [, sx] of sides)
    attach(rig, "jaw", new THREE.ConeGeometry(r * 0.07 * H, r * 0.3 * H, 5), G.horn, [sx * r * 0.3, jy + 0.004, jz + r * 0.86], { rx: -0.15 });
}

/** A crude blade: a wrapped grip, a bent iron guard and a broad, single-edged, rust-brown blade. */
function crudeBlade(rig, M, G) {
  const H = rig.H;
  const g = new THREE.Group();
  // grip along +z from the fist (gear.js: the hand's grip frame)
  const grip = new THREE.CylinderGeometry(0.009 * H, 0.01 * H, 0.08 * H, 8);
  grip.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(grip, G.leather));
  const guard = new THREE.BoxGeometry(0.012 * H, 0.06 * H, 0.012 * H);
  const gm = new THREE.Mesh(guard, M.iron);
  gm.position.set(0, 0, 0.04 * H);
  gm.rotation.x = 0.2;
  g.add(gm);
  // the blade: in the swing plane (y), widening toward a clipped point, its back straight
  const s = new THREE.Shape();
  s.moveTo(-0.012 * H, 0);
  s.lineTo(0.012 * H, 0);
  s.lineTo(0.028 * H, 0.19 * H);
  s.lineTo(0.01 * H, 0.27 * H);
  s.lineTo(-0.012 * H, 0.255 * H);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.004 * H, bevelEnabled: true, bevelThickness: 0.0015 * H, bevelSize: 0.0015 * H, bevelSegments: 1 });
  blade.translate(0, 0, -0.002 * H);
  // shape (x = width, y = length) → grip frame: length along +z, width along +y
  blade.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  blade.translate(0, 0, 0.045 * H);
  g.add(new THREE.Mesh(blade, M.rust));
  const pommel = new THREE.SphereGeometry(0.012 * H, 8, 6);
  const pm = new THREE.Mesh(pommel, M.iron);
  pm.position.set(0, 0, -0.045 * H);
  g.add(pm);
  return g;
}

/** A small round wooden buckler on the left forearm: planks under an iron rim and boss, face outward. */
function buckler(rig, M) {
  const H = rig.H;
  const [x, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");
  const R = 0.088 * H;
  const g = new THREE.Group();
  const board = new THREE.CylinderGeometry(R, R, 0.012 * H, 20);
  g.add(new THREE.Mesh(board, M.woodDark));
  const rim = new THREE.TorusGeometry(R, 0.007 * H, 6, 24);
  rim.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(rim, M.iron));
  const boss = new THREE.SphereGeometry(0.026 * H, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const bm = new THREE.Mesh(boss, M.iron);
  bm.position.y = 0.006 * H;
  g.add(bm);
  // a plank seam across it
  for (const dx of [-0.32, 0.32]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004 * H, 0.0135 * H, R * 1.9 * Math.sqrt(1 - dx * dx)), M.black);
    seam.position.x = dx * R;
    g.add(seam);
  }
  // the face (+y of the disc) turned outward, to +x on the left arm
  g.rotation.z = -Math.PI / 2;
  g.position.set(x * H + 0.034 * H - rig.bind.foreArmL.x, ((fy + wy) / 2) * H - rig.bind.foreArmL.y, 0.004 * H - rig.bind.foreArmL.z);
  rig.bones.foreArmL.add(g);
  return g;
}

/**
 * The goblin, one look at one step: `shield` adds the buckler, `step` names its tones
 * (GOBLIN_STEPS). Every look and step shares the rig, the clips and the size.
 */
function goblinOf({ shield = false, step = "goblin" } = {}) {
  const M = materials();
  const F = fabrics();
  const G = goblinFabrics(step);
  const rig = createRig(1.96, {
    hunch: 1,
    jaw: true,
    hipY: 0.44,
    thigh: 0.205,
    shin: 0.19,
    spine: 0.075,
    chest: 0.11,
    neck: 0.1,
    torsoW: 0.8,
    torsoD: 0.86,
    shoulderW: 0.86,
    hipW: 0.86,
    limbR: 0.72,
    armR: 0.72,
    upperArm: 0.185,
    foreArm: 0.175,
    headR: 0.079,
  });
  rig.hooks = [];
  rig.rest.hunch = [0.36, 0, 0];
  rig.rest.neck = [-0.3, 0, 0];
  rig.rest.head = [-0.06, 0, 0];
  rig.rest.jaw = [0.06, 0, 0];
  rig.rest.upperArmL = [0, 0, 0.2];
  rig.rest.upperArmR = [0, 0, -0.2];
  skirtBones(rig, { stiffness: 48, drag: 0.32 });
  const [, hy] = J(rig, "hips");
  const [, cy] = J(rig, "chest");
  const [, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");
  const eye = fadingEyes(rig);
  const loin = {
    top: hy + 0.018,
    bottom: hy - 0.15,
    rTop: [0.088, 0.072],
    rBottom: [0.1, 0.086],
    legFollow: 0.6,
    panels: true,
    panelWeight: 0.4,
    ragged: { teeth: 9, depth: 0.12, seed: 41 },
    segs: 28,
  };

  torso(rig, G.skin, { ribs: true, waist: 0.92 });
  // a pot belly under the ribs
  attach(rig, "spine", ellipsoid(0.07 * rig.H, 0.064 * rig.H, 0.058 * rig.H, 14), G.skin, [0, hy + 0.07, 0.03]);
  neck(rig, G.skin, { w: 0.82 });
  arms(rig, G.skin, { r: 0.86 });
  legs(rig, G.skin, { r: 0.86, under: loin });
  hands(rig, G.skin, { size: 1.15, claws: G.horn });
  bareFeet(rig, G.skin, { size: 1.02, claws: G.horn });
  goblinHead(rig, G, eye);
  // a scrap-leather jerkin open down the front, over the shoulders and the back
  overTorso(rig, G.leather, { from: cy - 0.03, arc: [Math.PI / 2 + 0.55, Math.PI / 2 + Math.PI * 2 - 0.55], pad: 0.012 });
  skirt(rig, G.rag, loin);
  belt(rig, G.leather, M.iron, { r: [0.092, 0.08], dy: 0.016, pouch: true });
  for (const [s] of sides) limbGuard(rig, `foreArm${s}`, wy + 0.025, fy - 0.03, [0.028, 0.026], G.leather);
  inHand(rig, "R", { rx: 0.15 }).add(crudeBlade(rig, M, G));
  if (shield) buckler(rig, M);
  void F;

  // the carry: hunched, the blade low and forward, the buckler held before the body
  const hold = pose({
    upperArmR: [-0.45, 0, -0.08],
    foreArmR: [-0.6, 0, 0],
    handR: [0.35, 0, 0],
    ...(shield
      ? { upperArmL: [-0.55, -0.45, 0.12], foreArmL: [-1.05, 0, 0], handL: [0.2, 0, 0] }
      : { upperArmL: [-0.3, 0, 0.08], foreArmL: [-0.65, 0, 0], handL: [0.3, 0, 0] }),
    neck: [-0.04, 0, 0],
  });
  const style = {
    speed: 1.1,
    hold,
    // a low, quick scuttle, the knees well bent
    walk: { stride: 0.82, knee: 1.25, arms: [shield ? 0.2 : 0.5, 0.45], lean: 0.12, twist: 1.3 },
    walkExtra: (i) => {
      const ph = (i / 8) * Math.PI * 2;
      return pose(
        {
          neck: [0.05 * Math.sin(ph * 2), 0.14 * Math.sin(ph), 0.05 * Math.sin(ph * 2 + 1)],
          thighL: [-0.12, 0, 0],
          thighR: [-0.12, 0, 0],
          shinL: [0.18, 0, 0],
          shinR: [0.18, 0, 0],
        },
        {},
        { jaw: 0.1 + 0.05 * Math.sin(ph * 2) },
      );
    },
    idle: { lean: 0.05 },
    // the head jerks round, sharp-eyed, the jaw working
    idleExtra: (i, ph) =>
      pose(
        {
          neck: [0, 0.32 * Math.sign(Math.sin(ph)) * Math.min(1, Math.abs(Math.sin(ph)) * 2), 0.06 * Math.sin(ph * 2)],
          thighL: [-0.1, 0, 0],
          thighR: [-0.1, 0, 0],
          shinL: [0.16, 0, 0],
          shinR: [0.16, 0, 0],
          footL: [-0.06, 0, 0],
          footR: [-0.06, 0, 0],
        },
        {},
        { jaw: 0.12 + 0.08 * Math.sin(ph * 2) },
      ),
    deathExtra: (i) => pose({}, {}, { eyes: 1 - i / 6 }),
    clips: {
      idle: (spec) => idleCycle(style, spec.frames),
      walk: () => walkCycle(style),
      attack: () => goblinSlash(shield),
      death: () => deathClip(style),
    },
  };
  return { rig, style };
}

/** A low crouch, the left foot forward, the right back: where the slash is thrown from. */
const CROUCH = pose({
  hips: [0, -0.22, 0],
  thighL: [-0.5, 0, 0.08],
  shinL: [0.55, 0, 0],
  footL: [-0.05, 0, 0],
  thighR: [0.05, 0, -0.08],
  shinR: [0.5, 0, 0],
  footR: [-0.5, 0, 0],
});

/**
 * The slash (R46), which is also the dagger throw's pose (R38): from the carry the blade goes up
 * and back high over the right shoulder (keys 0-1) and is held there a beat (key 2, the wind-up);
 * the hips snap round, then the chest, and the arm comes over and down across the body (key 3, the
 * strike), on to low past the left hip (key 4), and back to the carry (keys 5-6). The buckler
 * stays up before the chest; without it the free hand is thrown out against the cut.
 */
function goblinSlash(shield) {
  const off = (k) =>
    shield
      ? { upperArmL: [-0.6 - 0.1 * k, -0.5 - 0.15 * k, 0.12], foreArmL: [-1.1, 0, 0], handL: [0.2, 0, 0] }
      : { upperArmL: [-0.5 + 0.7 * k, 0, 0.3 + 0.7 * k], foreArmL: [-0.5 + 0.2 * k, 0, 0], handL: [0.3, 0, 0] };
  return [
    P({ ...off(0), hips: [0, -0.05, 0], chest: [-0.05, -0.15, 0], upperArmR: [-1.1, -0.5, -0.35], foreArmR: [-0.9, 0, 0], handR: [0.55, 0, 0], neck: [-0.05, 0, 0] }, { z: -0.01 }, { jaw: 0.2, eyes: 1 }),
    P({ ...off(0), hips: [0, -0.2, 0], spine: [-0.06, -0.15, 0], chest: [-0.14, -0.35, 0], upperArmR: [-2.45, -0.8, -1.1], foreArmR: [-1.1, 0, 0], handR: [0.4, 0, 0], neck: [-0.2, 0.2, 0] }, { z: -0.03 }, { jaw: 0.6, eyes: 1 }),
    P({ ...off(0.2), hips: [0, -0.24, 0], spine: [-0.08, -0.18, 0], chest: [-0.16, -0.4, 0], upperArmR: [-2.7, -0.7, -1.0], foreArmR: [-1.2, 0, 0], handR: [0.35, 0, 0], neck: [-0.22, 0.25, 0] }, { z: -0.035 }, { jaw: 0.8, eyes: 1 }),
    P({ ...off(1), hips: [0, 0.3, 0], spine: [0.12, 0.18, 0], chest: [0.16, 0.32, 0], upperArmR: [-1.6, -0.05, -0.15], foreArmR: [-0.1, 0, 0], handR: [0.95, 0.2, 0], neck: [0.1, -0.2, 0] }, { z: 0.05 }, { jaw: 1, eyes: 1 }),
    P({ ...off(1), hips: [0, 0.36, 0], spine: [0.15, 0.22, 0], chest: [0.22, 0.42, 0], upperArmR: [-1.05, 0.75, 0.7], foreArmR: [-0.15, 0, 0], handR: [1.1, 0, 0], neck: [0.12, -0.3, 0] }, { z: 0.045 }, { jaw: 0.6, eyes: 1 }),
    P({ ...off(0.5), hips: [0, 0.14, 0], spine: [0.05, 0.08, 0], chest: [0.06, 0.12, 0], upperArmR: [-0.6, 0.45, 0.15], foreArmR: [-0.45, 0, 0], handR: [0.7, 0, 0] }, { z: 0.015 }, { jaw: 0.3, eyes: 1 }),
    P({ ...off(0), upperArmR: [-0.5, 0.05, -0.08], foreArmR: [-0.6, 0, 0], handR: [0.4, 0, 0] }, { z: 0.004 }, { jaw: 0.15, eyes: 1 }),
  ].map((p) => add(CROUCH, p));
}

/** The four goblin variants (R3), each in its two looks (R8): blade, and blade + shield. */
export const goblin = () => goblinOf();
export const goblinShield = () => goblinOf({ shield: true });
export const goblinCutthroat = () => goblinOf({ step: "goblin_cutthroat" });
export const goblinCutthroatShield = () => goblinOf({ step: "goblin_cutthroat", shield: true });
export const goblinReaver = () => goblinOf({ step: "goblin_reaver" });
export const goblinReaverShield = () => goblinOf({ step: "goblin_reaver", shield: true });
export const goblinWarchief = () => goblinOf({ step: "goblin_warchief" });
export const goblinWarchiefShield = () => goblinOf({ step: "goblin_warchief", shield: true });
