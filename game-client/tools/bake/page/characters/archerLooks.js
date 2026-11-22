// The archer's specialization looks (FS-1J1CB §A R5–R6, §Change: Looks v2 R49–R69): the Hunter
// and the Shadow Ranger, each the Nightwood ranger re-dressed on her own rig, build and clips
// (cast.js `archer(look)`, look.js).
//
// Each look is a look object composed from the archer kit (R68, archerKit.js: each look's own
// wear, the baldric, the laced bracers, the leg wraps and the dagged edge, the heavy recurve and
// the skinning knife, the slim blackened longbow and the hooded quiver), so a third archer look is
// one more object here, one more id in cast.js `SPEC_LOOKS` and one more `specRow`, with no change
// to the kit's pieces or to look.js. The Shadow Ranger's gloom is a runtime aura (§E), never baked
// here.
//
// The two are cut as opposites, each against the ranger too (R50): the Hunter bareheaded, broad at
// the shoulder in a shaggy wolf pelt, her cloak cut short to a hunting cape over the hips, a short
// thick recurve; the Shadow Ranger deep in a cowl drawn out to a long liripipe down her back, a
// dagged mantle over the shoulders, her cloak let down near to the ankle and dagged, the slim
// black longbow at the ranger's length.

import * as THREE from "three";
import { attach, jointAt as J, rigidTube } from "./rig.js";
import { capelet, hair, overTorso } from "./anatomy.js";
import { studRow } from "./gear.js";
import { hash2 } from "../noise.js";
import { WEAR, baldric, dag, hoodedQuiver, lacedBracer, legWraps, recurve, skinningKnife, slimLongbow } from "./archerKit.js";

// --- the Hunter (R5, R49, R50, R58, R63) -----------------------------------------------------

/** How far the pelt stands open each side of the throat (radians): bare of the hood, a pelt closed up to the chin read as a beard. */
const OPEN = 0.55;

/**
 * The cloak cut short to a hunting cape (R49: her outline re-cut against the ranger's long cloak):
 * the ranger's cloak (cast.js `archer`, 0.56 H) cut off over the hips, so it keeps the ranger's
 * fullness and the quiver still rides over it, its hem torn ragged.
 */
const HUNTING_CAPE = { length: 0.27, cutFrom: 0.56, spread: 1.4, ragged: { teeth: 11, depth: 0.07, seed: 23 } };

/**
 * A wolf pelt thrown over the shoulders (R49: the pelt pushed further), over the capelet: a heavy,
 * shaggy mantle open at the throat, standing out past the shoulder points so her shoulder line is
 * broad in a black fill, longer behind, its lower edge torn into tufts and every vertex pushed out a
 * little at random, so the outline reads as fur, not cloth; the forepaws hang over her breast,
 * knotted, the claws in horn, and the wolf's head lies thrown back behind her neck. Rigid on the
 * chest, above the hips (R11).
 */
function peltMantle(rig, { F }) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const sw = rig.p.shoulderW;
  const td = rig.p.torsoD;
  const lowest = ny - 0.105;
  const geo = rigidTube(
    H,
    [
      { p: [0, ny + 0.02, -0.008], r: [0.07, 0.068] },
      { p: [0, ny + 0.0, -0.008], r: [0.136 * sw, 0.1 * td] },
      { p: [0, ny - 0.045, -0.004], r: [0.198 * sw, 0.126 * td] },
      { p: [0, lowest, -0.01], r: [0.19 * sw, 0.124 * td] },
    ],
    { segs: 34, steps: 4, caps: false, arc: [Math.PI / 2 + OPEN, Math.PI / 2 + Math.PI * 2 - OPEN] },
  );
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ang = Math.atan2(v.z, v.x);
    const tuft = hash2(Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 19), 3, 9);
    const k = 1 + 0.09 * hash2(i, 5, 11);
    v.x *= k;
    v.z *= k;
    // longer behind (the back's -z), short over the breast
    const behind = Math.max(0, -Math.sin(ang));
    if (v.y < (lowest + 0.02) * H) v.y -= (0.014 + 0.036 * tuft + 0.045 * behind) * H;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  attach(rig, "chest", geo, F.wolf, [0, 0, 0]);
  // the forepaws, down from the pelt's open edges over the breast, their ends knotted together
  for (const sx of [-1, 1]) {
    const pts = [
      [sx * 0.06, ny - 0.02, 0.078],
      [sx * 0.045, ny - 0.07, 0.094],
      [sx * 0.012, ny - 0.105, 0.1],
    ].map((q) => new THREE.Vector3(...q).multiplyScalar(H));
    attach(rig, "chest", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.012 * H, 6, false), F.wolf, [0, 0, 0]);
    for (const k of [-1, 0, 1]) attach(rig, "chest", new THREE.ConeGeometry(0.0032 * H, 0.012 * H, 4), F.horn, [sx * 0.02 + k * 0.006, ny - 0.118, 0.104], { rx: 0.3 });
  }
  attach(rig, "chest", new THREE.SphereGeometry(0.016 * H, 8, 6), F.wolf, [0, ny - 0.108, 0.104]);
  wolfHead(rig, F, ny);
}

/**
 * The wolf's head, the pelt's hood thrown back: the skull lying on the pelt behind her neck, a
 * little left of her spine (the quiver's mouth is over her right shoulder), its ears up and its
 * muzzle down her back, its eyes and nose dark horn. Her head stays bare (R14); in a black fill it
 * stands over her shoulders behind the head as no cowl does. Rigid on the chest.
 */
function wolfHead(rig, F, ny) {
  const H = rig.H;
  const at = [0.028, ny + 0.004, -0.142];
  attach(rig, "chest", new THREE.SphereGeometry(1, 14, 10), F.wolf, at, { sx: 0.046 * H, sy: 0.04 * H, sz: 0.044 * H, rx: 0.35 });
  // the muzzle, down and a little out behind
  const muzzle = new THREE.ConeGeometry(0.024 * H, 0.075 * H, 10);
  attach(rig, "chest", muzzle, F.wolf, [at[0], at[1] - 0.058, at[2] - 0.018], { rx: Math.PI - 0.32 });
  attach(rig, "chest", new THREE.SphereGeometry(0.0075 * H, 6, 4), F.horn, [at[0], at[1] - 0.094, at[2] - 0.03]);
  for (const sx of [-1, 1]) {
    attach(rig, "chest", new THREE.ConeGeometry(0.014 * H, 0.04 * H, 6), F.wolf, [at[0] + sx * 0.026, at[1] + 0.036, at[2] - 0.004], { rz: -sx * 0.35, rx: -0.2 });
    attach(rig, "chest", new THREE.SphereGeometry(0.005 * H, 6, 4), F.horn, [at[0] + sx * 0.02, at[1] - 0.012, at[2] - 0.036]);
  }
}

/**
 * A sleeveless hide jerkin over the buff's chest, from the hips' line up, open in a laced slit down
 * the front, its hem bound in her darker hide: it stays above the hips, so the tunic's skirt below
 * is the buff's own (R11).
 */
function jerkin(rig, { F, hy }) {
  const H = rig.H;
  overTorso(rig, F.jerkinHide, { from: hy - 0.012, pad: 0.01, arc: [Math.PI / 2 + 0.14, Math.PI / 2 + Math.PI * 2 - 0.14] });
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) attach(rig, "chest", new THREE.BoxGeometry(0.03 * H, 0.0035 * H, 0.004 * H), F.sinew, [0, hy + 0.035 + i * 0.04, 0.088 * rig.p.torsoD], { rz: s * 0.5 });
  }
  // the hem's binding, a band of her hide round the jerkin's foot
  const band = new THREE.CylinderGeometry(1, 1, 0.014 * H, 28, 1, true);
  band.scale((0.097 * rig.p.hipW + 0.013) * H, 1, (0.072 * rig.p.torsoD + 0.013) * H);
  attach(rig, "hips", band, F.hunterLeather, [0, hy - 0.004, 0]);
}

/**
 * Her bare head (R14, R49): the shared face under brown hair loose to the collar and tied at the
 * nape in a tail, two goose feathers bound into it, the capelet kept on its own.
 */
function bareHead(rig, { F, mat }) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  capelet(rig, mat);
  hair(rig, F.hairBrown, { long: true, tail: true });
  for (const [dx, rz] of [
    [-0.01, 0.35],
    [0.006, 0.6],
  ])
    attach(rig, "head", new THREE.BoxGeometry(0.011 * H, 0.06 * H, 0.002 * H), F.goose, [dx, hy + 0.02, hz - r * 1.12], { rx: 0.5, rz });
}

/** Her bracers: a long laced guard on the bow arm, wrist to elbow, and a short cuff on the drawing wrist. */
function hunterBracers(rig, { F, wy, fy }) {
  lacedBracer(rig, "foreArmL", wy + 0.012, fy - 0.014, { mat: F.hunterLeather, lace: F.sinew, r: 0.036, laces: 4 });
  lacedBracer(rig, "foreArmR", wy + 0.014, wy + 0.06, { mat: F.hunterLeather, lace: F.sinew, r: 0.034, laces: 1 });
}

/**
 * The Hunter (R5, §Change: Looks v2 R58, R63): bareheaded, the wolf pelt pushed out over her
 * shoulders and its paws knotted on her breast; the laced hide jerkin bound at the hem; the cloak
 * cut short to a ragged hunting cape over the hips, in undyed grey-brown wool, nothing of the
 * Nightwood green left; fur wrapped round her shins and cross-gartered in sinew; a long laced
 * bracer on the bow arm; the quiver's baldric over the jerkin, high goose fletching over her
 * shoulder; a heavy recurve in the left hand, and a skinning knife on the belt. Her wear is the
 * wilds' (fabrics.js `hunter*`): matte, grimed hide and fur.
 */
export const hunter = {
  tones: WEAR.hunter,
  opts: {
    cloak: HUNTING_CAPE,
    quiver: { fletchLength: 2.2 },
    weapon: { bow: (rig, M, F) => recurve(rig, M, F, { wood: F.hunterBow, horn: F.horn, grip: F.rawhide, sinew: F.sinew }) },
  },
  swap: { cowl: bareHead, bracers: hunterBracers },
  add: (rig, kit) => {
    const { F, M, hy } = kit;
    jerkin(rig, kit);
    peltMantle(rig, kit);
    baldric(rig, F.hunterLeather, M.brass);
    skinningKnife(rig, { sheath: F.hunterSheath, grip: F.horn, iron: M.brass, loop: F.hunterLeather, beltY: hy + 0.02 });
    legWraps(rig, { mat: F.wolf, garter: F.sinew, from: 0.07, to: 0.25, r: 0.056 });
  },
};

// --- the Shadow Ranger (R6, R49, R50, R59, R63) ----------------------------------------------

/**
 * Her cowl drawn deeper and its point let out into a long liripipe that hangs down her back (R49:
 * her head re-cut against the ranger's short drooping point and the Hunter's bare head).
 */
const LIRIPIPE = { shade: 2, brow: 0.3, gap: 0.95, reach: 0.028, point: { dir: [0, 0.05, -1], length: 0.22, droop: 2, pinch: 0.8, girth: 3, swell: 0.1 } };

/**
 * Her cloak let down near to the ankle and fuller behind, hung a little further off her back so
 * her stride stays inside it (R65), its hem cut in long dags.
 */
const SHADOW_CLOAK = { length: 0.66, spread: 1.45, flare: 2.6, back: 0.16, ragged: { teeth: 10, depth: 0.08, seed: 31 } };

/**
 * Her quiver seated a little further off her back and its foot tipped further out than the
 * ranger's (classStyles.js ARCHER_QUIVER), so it rides over her fuller cloak in every clip.
 */
const SHADOW_QUIVER = { at: [-0.045, 0.03, -0.17], rx: 0.18 };

/**
 * A dagged mantle over the cowl's capelet (R49: her shoulder line re-cut): a short shoulder cape
 * standing out past the shoulder points, its edge cut in long dags, open over the throat and held
 * there by an iron clasp. Rigid on the chest.
 */
function daggedMantle(rig, { F }) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const sw = rig.p.shoulderW;
  const td = rig.p.torsoD;
  const lowest = ny - 0.14;
  const open = 0.3;
  const geo = rigidTube(
    H,
    [
      { p: [0, ny + 0.022, -0.006], r: [0.058, 0.056] },
      { p: [0, ny - 0.01, -0.006], r: [0.118 * sw, 0.088 * td] },
      { p: [0, ny - 0.06, -0.004], r: [0.196 * sw, 0.122 * td] },
      { p: [0, lowest, -0.004], r: [0.216 * sw, 0.13 * td] },
    ],
    { segs: 36, steps: 4, caps: false, arc: [Math.PI / 2 + open, Math.PI / 2 + Math.PI * 2 - open] },
  );
  attach(rig, "chest", dag(geo, H, { edge: lowest + 0.01, teeth: 15, depth: 0.05, seed: 37 }), F.shadow, [0, 0, 0]);
  // the iron clasp at the throat
  attach(rig, "chest", new THREE.TorusGeometry(0.011 * H, 0.003 * H, 4, 10), F.shadowIron, [0, ny - 0.008, 0.07]);
  attach(rig, "chest", new THREE.BoxGeometry(0.03 * H, 0.004 * H, 0.004 * H), F.shadowIron, [0, ny - 0.008, 0.072]);
}

/**
 * Her iron (R63): rivets down both black bracers, studs round the belt's front and a buckle on it,
 * the baldric across her breast.
 */
function shadowIron(rig, { F, hy, wy, fy }) {
  const H = rig.H;
  for (const s of ["L", "R"]) {
    const [x] = J(rig, `foreArm${s}`);
    const sx = x > 0 ? 1 : -1;
    const pts = [0.25, 0.5, 0.75].map((t) => [x + sx * 0.035, wy + 0.02 + (fy - 0.025 - wy - 0.02) * t, 0.006]);
    studRow(rig, `foreArm${s}`, pts, F.shadowIron, { r: 0.0042, normal: () => [sx, 0, 0.2] });
  }
  const y = hy + 0.02;
  const [rx, rz] = [0.1 * rig.p.hipW + 0.002, 0.076 * rig.p.torsoD + 0.002];
  const belt = [-1.2, -0.85, -0.5, 0.5, 0.85, 1.2].map((a) => [Math.sin(a) * rx, y, Math.cos(a) * rz]);
  studRow(rig, "hips", belt, F.shadowIron, { r: 0.0042, normal: ([px, , pz]) => [px / rx, 0, pz / rz] });
  baldric(rig, F.shadowBlack, F.shadowIron);
  attach(rig, "hips", new THREE.BoxGeometry(0.026 * H, 0.026 * H, 0.006 * H), F.shadowIron, [0, y, rz + 0.004]);
}

/**
 * The Shadow Ranger (R6, §Change: Looks v2 R59, R63): the soot pushed further. The Nightwood dyed
 * through to a cold soot-black, the cowl drawn deep and let out into a long liripipe down her back,
 * a dagged mantle over the shoulders clasped in iron, the cloak let down near to the ankle and
 * dagged; the buff leather blackened to a cold grey; black bracers and belt riveted in iron, dark
 * wraps cross-gartered round her shins; the hooded quiver on the baldric, its fletching a dark edge
 * under the hood; the slim blackened longbow with its darker string. Her wear is kept dark and close
 * (fabrics.js `shadow*`): oiled leather and clean iron.
 */
export const shadowRanger = {
  tones: WEAR.shadowRanger,
  mats: (F) => ({ legs: F.shadowDark, hands: F.shadowLeather, boots: F.shadowBlack, bracers: F.shadowBlack }),
  opts: {
    cowl: LIRIPIPE,
    quiver: SHADOW_QUIVER,
    cloak: SHADOW_CLOAK,
    weapon: { bow: (rig, M, F) => slimLongbow(rig, M, F, { wood: F.shadowBow, cord: F.shadowString, iron: F.shadowIron, string: F.shadowString }) },
  },
  swap: {
    quiver: (rig, { M, F, o }) => hoodedQuiver(rig, M, { leather: F.shadowQuiver, hood: F.shadowQuiver, iron: F.shadowIron, fletch: F.shadowFletch, strap: F.shadowBlack }, o),
  },
  add: (rig, kit) => {
    const { F } = kit;
    daggedMantle(rig, kit);
    shadowIron(rig, kit);
    legWraps(rig, { mat: F.shadowDark, garter: F.shadowBlack, from: 0.08, to: 0.2, r: 0.044 });
  },
};
