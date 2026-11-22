// The warrior's specialization looks (FS-1J1CB §A R1–R2, §Change: Looks v2 R49–R69): the Guardian
// and the Berserker, each the knight re-dressed on his own rig, build and clips (cast.js
// `knight(look)`, look.js).
//
// Each look is a look object composed from the warrior kit (R68, warriorKit.js: the trims, each
// look's own wear, the flanged mace and the heavy axe), so a third warrior look is one more object
// here, one more id in cast.js `SPEC_LOOKS` and one more `specRow`, with no change to the kit's
// pieces or to look.js.

import * as THREE from "three";
import { attach, jointAt as J, rigidTube } from "./rig.js";
import { hair, overTorso, shortBeard, skirt } from "./anatomy.js";
import { extrude, inHand, limbGuard } from "./gear.js";
import { BERSERKER_STYLE, GUARDIAN_STYLE } from "./classStyles.js";
import { hash2 } from "../noise.js";
import { WEAR, buckle, flangedMace, heavyAxe, shieldTrims, studRow } from "./warriorKit.js";

// --- the Guardian (R1, R49, R50, R54, R63) ---------------------------------------------------

/** The Guardian's kite shield (R54): about 1.3x the knight's, the house cross counterchanged inside the brass border. */
const GUARDIAN_SHIELD = { scale: 1.3, cross: true };

/**
 * How far the Guardian's surcoat and its oxblood hem band stand out over the hauberk (H), and where
 * each hem falls against the hauberk's (+ above it). A hem is lifted on the skirt's last ring only
 * (anatomy.js `overSkirt`), so a lift past the last step (about 0.025 H on the knight) folds the
 * cloth back up and the step above shows as the hem: the coat is lifted that one step, and the band
 * let down a little past the mail, so a band of oxblood about 0.037 H deep shows under the bone.
 */
const SURCOAT = { band: { out: 0.012, hem: -0.012 }, coat: { out: 0.017, hem: 0.024 } };

/**
 * A sleeveless surcoat in worn bone over the hauberk, open at the front like it, its skirt bound at
 * the hem in a broad oxblood band (a layer of oxblood under the bone, cut a hand longer), the house
 * cross on the breast and again on the back, laid on the cloth's curve. Each skirt is cut over the
 * hauberk (`skirt({ over })`, R11), so the three move as one cloth.
 */
function surcoat(rig, { F, hauberk }) {
  const H = rig.H;
  const [, cy] = J(rig, "chest");
  overTorso(rig, F.surcoat, { from: hauberk.top - 0.01, pad: 0.014 });
  for (const [mat, { out, hem }] of [
    [F.houseRed, SURCOAT.band],
    [F.surcoat, SURCOAT.coat],
  ])
    skirt(rig, mat, {
      over: hauberk,
      rTop: [hauberk.rTop[0] + out, hauberk.rTop[1] + out],
      rBottom: [hauberk.rBottom[0] + out, hauberk.rBottom[1] + out],
      bottom: hauberk.bottom + hem,
      arc: hauberk.arc,
    });
  // the cross, before and behind
  const z = 0.079 * rig.p.torsoD + 0.016;
  for (const [sz, ry] of [
    [1, 0],
    [-1, Math.PI],
  ]) {
    attach(rig, "chest", new THREE.BoxGeometry(0.036 * H, 0.16 * H, 0.008 * H), F.houseRed, [0, cy - 0.015, sz * (z + 0.006)], { rx: -0.06 * sz, ry });
    attach(rig, "chest", new THREE.BoxGeometry(0.12 * H, 0.034 * H, 0.008 * H), F.houseRed, [0, cy + 0.02, sz * (z + 0.01)], { ry });
  }
}

/** The great helm's measures (H): its drum's height, and its radii at the top and the brow, in head radii. */
const HELM = { h: 0.158, rt: 1.14, rb: 1.24 };

/**
 * The flat-topped great helm over the coif (R1, pushed in R49): a steel drum closed over the face
 * with a low dome on its flat top, a dark eye-slit round the front over a row of brass rivets, a
 * brass band at the crown and a brass cross down the face, breaths on the right cheek; on its top
 * a torse of oxblood and bone and a tall fan crest in the house oxblood edged in brass, so the head
 * reads as no other knight's in a black fill.
 */
function greatHelm(rig, { F, M }) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const { h, rt, rb } = HELM;
  const y = hy + 0.05;
  const z = hz - 0.002;
  // the drum's radius (headR) at a height dy above its middle
  const at = (dy) => (rt + rb) / 2 + ((rt - rb) * dy) / h;
  const drum = { sz: 1.08 };
  attach(rig, "head", new THREE.CylinderGeometry(r * rt * H, r * rb * H, h * H, 22, 1, false), F.darkSteel, [0, y, z], drum);
  attach(rig, "head", new THREE.SphereGeometry(r * rt * H, 22, 6, 0, Math.PI * 2, 0, Math.PI * 0.22), F.darkSteel, [0, y + h / 2 - 0.004, z], { ...drum, sy: 0.6 });
  const ring = (dy, out, height, mat, arc = [0, Math.PI * 2]) =>
    attach(rig, "head", new THREE.CylinderGeometry(r * (at(dy) + out) * H, r * (at(dy) + out) * H, height * H, 22, 1, true, ...arc), mat, [0, y + dy, z], drum);
  ring(0.034, 0.03, 0.02, M.black, [-1.05, 2.1]);
  ring(h / 2 - 0.012, 0.02, 0.014, M.brass);
  ring(-h / 2 + 0.008, 0.02, 0.012, M.brass);
  const front = z + r * (at(-0.01) + 0.03) * 1.08;
  attach(rig, "head", new THREE.BoxGeometry(0.013 * H, 0.11 * H, 0.008 * H), M.brass, [0, y - 0.012, front]);
  attach(rig, "head", new THREE.BoxGeometry(0.05 * H, 0.011 * H, 0.008 * H), M.brass, [0, y + 0.012, front - 0.001]);
  for (let k = 0; k < 6; k++) attach(rig, "head", new THREE.BoxGeometry(0.004 * H, 0.004 * H, 0.006 * H), M.black, [-0.026 - (k % 2) * 0.01, y - 0.016 - Math.floor(k / 2) * 0.012, front - 0.012]);
  // the rivets under the slit, round the front half
  const dy = 0.016;
  const rr = r * (at(dy) + 0.004);
  const rivets = Array.from({ length: 9 }, (_, k) => -1.2 + (k * 2.4) / 8).map((a) => [Math.sin(a) * rr, y + dy, z + Math.cos(a) * rr * 1.08]);
  studRow(rig, "head", rivets, M.brass, { r: 0.0045, normal: ([x, , zz]) => [x, 0, (zz - z) / 1.08] });
  // the torse round the top, twisted oxblood and bone, and the fan crest stood fore and aft in it
  const top = y + h / 2 + 0.012;
  for (const [mat, a] of [
    [F.houseRed, 0],
    [F.surcoat, Math.PI / 6],
  ]) {
    const torse = new THREE.TorusGeometry(r * 0.62 * H, 0.0075 * H, 5, 6);
    torse.rotateX(Math.PI / 2);
    torse.rotateY(a);
    attach(rig, "head", torse, mat, [0, top - 0.004, z], { sz: 1.08 });
  }
  const fan = (R, mat, t) => {
    const s = new THREE.Shape();
    s.moveTo(-R * 0.82 * H, 0);
    s.quadraticCurveTo(-R * 1.0 * H, R * 0.95 * H, 0, R * 1.18 * H);
    s.quadraticCurveTo(R * 0.85 * H, R * 0.9 * H, R * 0.7 * H, 0);
    s.closePath();
    const g = extrude(s, t * H, 0.002 * H);
    // the shape's x along the head's front-back (+z), its y up, its thickness across (x)
    g.rotateY(-Math.PI / 2);
    attach(rig, "head", g, mat, [0, top, z - 0.004]);
  };
  fan(0.078, M.brass, 0.007);
  fan(0.07, F.houseRed, 0.011);
}

/** How far each ailette's top leans out from upright (rad). */
const AILETTE_LEAN = 0.32;

/**
 * An ailette on each shoulder: a flat board laced to the shoulder and standing up off it, painted
 * in the surcoat's bone with the house cross and edged in brass, its top leaning out, so his
 * shoulder line is square and broad in a black fill without plate (the knight is mail, never
 * plate). Rides the upper arm, so it lifts with the arm and never through it.
 */
function ailettes(rig, { F, M }) {
  const H = rig.H;
  for (const [s, sx] of [
    ["L", 1],
    ["R", -1],
  ]) {
    const [x, uy] = J(rig, `upperArm${s}`);
    const at = [x + sx * 0.042, uy + 0.046, -0.008];
    const o = { rz: -sx * AILETTE_LEAN };
    // out of the board's face and up its length, as the lean turns them
    const [c, sn] = [Math.cos(AILETTE_LEAN), Math.sin(AILETTE_LEAN)];
    const on = (d, up = 0) => [at[0] + sx * (d * c + up * sn), at[1] - d * sn + up * c, at[2]];
    attach(rig, `upperArm${s}`, new THREE.BoxGeometry(0.005 * H, 0.106 * H, 0.09 * H), M.brass, on(-0.001), o);
    attach(rig, `upperArm${s}`, new THREE.BoxGeometry(0.006 * H, 0.096 * H, 0.08 * H), F.surcoat, on(0.0015), o);
    attach(rig, `upperArm${s}`, new THREE.BoxGeometry(0.003 * H, 0.096 * H, 0.018 * H), F.houseRed, on(0.004), o);
    attach(rig, `upperArm${s}`, new THREE.BoxGeometry(0.003 * H, 0.018 * H, 0.08 * H), F.houseRed, on(0.004, 0.014), o);
  }
}

/** The sword belt let out over the surcoat, studded in brass along its front and buckled. */
function swordBelt(rig, { M, hy }) {
  const y = hy + 0.03;
  const [rx, rz] = [0.124 * rig.p.hipW, 0.104 * rig.p.torsoD];
  const pts = [-1.1, -0.8, -0.5, 0.5, 0.8, 1.1].map((a) => [Math.sin(a) * (rx + 0.002), y, Math.cos(a) * (rz + 0.002)]);
  studRow(rig, "hips", pts, M.brass, { r: 0.0048, normal: ([x, , z]) => [x / rx, 0, z / rz] });
}

/**
 * The Guardian (R1, §Change: Looks v2 R54, R63): the great helm crested, the surcoat banded at the
 * hem and crossed before and behind, ailettes on the shoulders; a flanged mace in place of the
 * longsword and the kite shield about 1.3x, studded round its rim, its guige slung; the mail kept
 * bright and the steel polished (fabrics.js `guardian*`). His cut is the knight's own, compact
 * behind the raised shield (KNIGHT_STYLE).
 */
export const guardian = {
  tones: WEAR.guardian,
  mats: (F) => ({ belt: F.guardianBelt }),
  swap: {
    helm: greatHelm,
    weapon: (rig, { F, M }) => inHand(rig, "R").add(flangedMace(rig, { iron: F.blackIron, steel: F.guardianSteel, grip: F.leatherDark, brass: M.brass })),
  },
  // the belt let out to sit over the surcoat; the cloak cut fuller, to the calf
  opts: { belt: { r: [0.124, 0.104] }, shield: GUARDIAN_SHIELD, cloak: { length: 0.68, spread: 1.6, flare: 1.45 } },
  add: (rig, kit) => {
    surcoat(rig, kit);
    ailettes(rig, kit);
    swordBelt(rig, kit);
    shieldTrims(rig, { brass: kit.M.brass, leather: kit.F.leatherDark });
  },
  style: GUARDIAN_STYLE,
};

// --- the Berserker (R2, R49, R50, R55, R63) --------------------------------------------------

/** The cloak torn short, its body to the hips and its hem shredded into tatters toward the knee. */
const TORN = { length: 0.36, spread: 1.55, ragged: { teeth: 9, depth: 0.28, seed: 11 } };

/** The coif pushed down off the head: a mail mantle round the neck and over the shoulder line. */
function mailMantle(rig, { mat }) {
  const [, ny] = J(rig, "neck");
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny + 0.03, -0.006], r: [0.07, 0.068] },
      { p: [0, ny, -0.006], r: [0.08, 0.076] },
      { p: [0, ny - 0.05, -0.004], r: [0.13 * rig.p.shoulderW, 0.094 * rig.p.torsoD] },
    ],
    { segs: 24, steps: 4, caps: false },
  );
  attach(rig, "chest", geo, mat, [0, 0, 0]);
}

/**
 * A bear's pelt thrown over the shoulders and the mail mantle: a heavy, shaggy mantle, open at the
 * throat, standing out past the shoulder points and hanging down the back to the shoulder blades,
 * its edge torn into tufts and every vertex pushed out at random, so his shoulder line reads as fur
 * and as wider than any knight's. Rigid on the chest, above the hips (R11).
 */
function bearPelt(rig, mat) {
  const [, ny] = J(rig, "neck");
  const sw = rig.p.shoulderW;
  const td = rig.p.torsoD;
  const lowest = ny - 0.1;
  const open = 0.62;
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny + 0.022, -0.012], r: [0.074, 0.072] },
      { p: [0, ny + 0.002, -0.01], r: [0.14 * sw, 0.104 * td] },
      { p: [0, ny - 0.04, -0.008], r: [0.172 * sw, 0.118 * td] },
      { p: [0, lowest, -0.014], r: [0.166 * sw, 0.116 * td] },
    ],
    { segs: 34, steps: 4, caps: false, arc: [Math.PI / 2 + open, Math.PI / 2 + Math.PI * 2 - open] },
  );
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ang = Math.atan2(v.z, v.x);
    const tuft = hash2(Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 21), 5, 13);
    const k = 1 + 0.1 * hash2(i, 7, 17);
    v.x *= k;
    v.z *= k;
    // longer behind (the back's -z), short over the chest
    const behind = Math.max(0, -Math.sin(ang));
    if (v.y < (lowest + 0.02) * rig.H) v.y -= (0.014 + 0.04 * tuft + 0.05 * behind) * rig.H;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  attach(rig, "chest", geo, mat, [0, 0, 0]);
}

/**
 * The beard grown out and braided below the chin: the full short beard, and a braid from its point
 * down to the breastbone, bound in two iron rings.
 */
function braidedBeard(rig, { F }) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  shortBeard(rig, F.hairDark, { full: 1.6 });
  const top = [0, hy - 0.02, hz + 0.05];
  const cps = [0, 1, 2, 3, 4].map((i) => ({ p: [0, top[1] - i * 0.026, top[2] + 0.006 - i * 0.005], r: [0.017 - i * 0.0025, 0.013 - i * 0.002] }));
  attach(rig, "head", rigidTube(H, cps, { segs: 8, steps: 3 }), F.hairDark, [0, 0, 0]);
  for (const i of [1.4, 2.8]) {
    const ringGeo = new THREE.TorusGeometry((0.0165 - i * 0.0025) * H, 0.0032 * H, 4, 10);
    ringGeo.rotateX(Math.PI / 2);
    attach(rig, "head", ringGeo, F.berserkerIron, [0, top[1] - i * 0.026, top[2] + 0.006 - i * 0.005]);
  }
}

/** A heavy axe in the hand on `side`, in the grip frame (the kit's `heavyAxe`). */
const axeIn = (rig, side, { M, F }) => inHand(rig, side).add(heavyAxe(rig, { wood: M.woodDark, cord: F.cord, iron: F.berserkerIron, edge: F.berserkerEdge }));

/**
 * The bare head's dark hair grown out to the collar and the braided beard, the bear's pelt;
 * blood-dark cloth wound thick round both forearms from the wrist to the elbow, a studded leather
 * band round each bare upper arm, and cord cross-gartered round both shins over the boots (rigid
 * on the shins, held inside the cloak by its guard); the left hand's axe and the belt's buckle.
 */
function berserkerGear(rig, kit) {
  const { F } = kit;
  hair(rig, F.hairDark, { long: true });
  braidedBeard(rig, kit);
  bearPelt(rig, F.berserkerFur);
  for (const s of ["L", "R"]) {
    const sx = s === "L" ? 1 : -1;
    const [x, uy] = J(rig, `upperArm${s}`);
    const [, ey] = J(rig, `foreArm${s}`);
    const [, wy] = J(rig, `hand${s}`);
    limbGuard(rig, `foreArm${s}`, wy + 0.008, ey - 0.012, [0.034, 0.034], F.wraps, { taper: 1.25 });
    // the wraps' ragged loose ends at the wrist
    attach(rig, `foreArm${s}`, new THREE.BoxGeometry(0.008 * rig.H, 0.04 * rig.H, 0.004 * rig.H), F.wraps, [x + sx * 0.03, wy, 0.012], { rz: sx * 0.3 });
    limbGuard(rig, `upperArm${s}`, uy - 0.1, uy - 0.07, [0.044, 0.044], F.berserkerLeather, { taper: 1 });
    studRow(
      rig,
      `upperArm${s}`,
      [-0.9, -0.3, 0.3, 0.9].map((a) => [x + sx * Math.cos(a) * 0.045, uy - 0.085, Math.sin(a) * 0.045]),
      F.berserkerIron,
      { r: 0.005, normal: ([px, , pz]) => [px - x, 0, pz] },
    );
    const [lx] = J(rig, `shin${s}`);
    const [, ky] = J(rig, `shin${s}`);
    limbGuard(rig, `shin${s}`, 0.1, ky - 0.05, [0.04, 0.044], F.cord, { taper: 1.05 });
    for (let k = 0; k < 3; k++)
      attach(rig, `shin${s}`, new THREE.BoxGeometry(0.084 * rig.H, 0.006 * rig.H, 0.004 * rig.H), F.berserkerLeather, [lx, 0.12 + k * 0.035, 0.044], { rz: (k % 2 ? 1 : -1) * 0.45 });
  }
  axeIn(rig, "L", kit);
  // the belt's great iron buckle
  buckle(rig, "hips", [0, kit.hy + 0.03, 0.09 * rig.p.torsoD + 0.004], F.berserkerIron, { w: 0.034 });
}

/**
 * The Berserker (R2, §Change: Looks v2 R55, R63): bareheaded with a braided beard, a bear's pelt
 * over the mail mantle, the arms bare under the wraps, the cloak torn to tatters; a heavy
 * long-hafted axe in each hand and no shield; the mail gone to rust and filth (fabrics.js
 * `berserker*`). His carry and cut are his own (BERSERKER_STYLE).
 */
export const berserker = {
  tones: WEAR.berserker,
  mats: (F) => ({ arms: F.skin, hands: F.skin }),
  omit: ["helm", "shield"],
  swap: { coif: mailMantle, weapon: (rig, kit) => axeIn(rig, "R", kit) },
  opts: { cloak: TORN },
  add: berserkerGear,
  style: BERSERKER_STYLE,
};
