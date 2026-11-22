// The mage's specialization looks (FS-1J1CB §A R3–R4, §Change: Looks v2 R49–R69): the
// Spellwarden and the Pyromancer, each the wizard re-dressed on her own rig, build and clips
// (cast.js `wizard(look)`, look.js).
//
// Each look is a look object composed from the mage kit (R68, mageKit.js: each look's own wear,
// the rivets, the girdle and the warded tome, the scapular cut over a look's own gown, the warding
// staff and the brazier rod), so a third mage look is one more object here, one more id in cast.js
// `SPEC_LOOKS` and one more `specRow`, with no change to the kit's pieces or to look.js. The
// Spellwarden's ward is a runtime aura (§E), never baked here.
//
// The two are cut as opposites, each against the wizard too (R50): the Spellwarden tall, broad and
// heavy, a bell of iron-grey gown, spaulders and a high iron collar, the staff over her crown; the
// Pyromancer lean and short, her gown singed off under the knee over tall boots, her sleeves fitted,
// her hair knotted high, the brazier held up like a torch.

import * as THREE from "three";
import { attach, jointAt as J, mount, rigidTube } from "./rig.js";
import { hair, skirt } from "./anatomy.js";
import { buckle, inHand, limbGuard, placed, spaulder } from "./gear.js";
import { glow, materials } from "../materials.js";
import { mix } from "../palette.js";
import { PYROMANCER_STYLE, SPELLWARDEN_STYLE } from "./classStyles.js";
import { WEAR, brazierRod, girdle, hipTome, rivetRing, scapularOver, wardingStaff } from "./mageKit.js";

// --- the Spellwarden (R3, R49, R50, R56, R63) ------------------------------------------------

/** The Spellwarden's gown cut to a bell (H radii at the hem, [across, fore and aft]): the wizard's is [0.155, 0.138]. */
const BELL = [0.19, 0.17];

/** A blackened-iron gorget at the base of the neck, over the collar's foot, riveted round its rim. */
function gorget(rig, F) {
  const [, ny] = J(rig, "neck");
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny + 0.002, 0], r: [0.062, 0.058] },
      { p: [0, ny - 0.02, 0], r: [0.092, 0.082] },
      { p: [0, ny - 0.04, 0], r: [0.112, 0.094] },
    ],
    { segs: 26, steps: 2, caps: false },
  );
  attach(rig, "chest", geo, F.blackIron, [0, 0, 0]);
  rivetRing(rig, "chest", { y: ny - 0.036, rx: 0.111, rz: 0.094, count: 10, arc: [-1.6, 1.6], mat: F.blackIron, r: 0.0042 });
}

/**
 * The warden's collar (R49: her iron pushed further): a high standing collar of blackened iron
 * flaring up behind and beside her head to the ears, open over the throat, its top edge rolled
 * and riveted, lined in the scapular's teal, so her head sits framed in iron and reads as no
 * other figure's in a black fill.
 */
function wardenCollar(rig, { F }) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const gap = 0.95;
  const arc = [Math.PI / 2 + gap, Math.PI / 2 + Math.PI * 2 - gap];
  const rings = [
    { p: [0, ny - 0.024, 0.0], r: [0.074, 0.068] },
    { p: [0, ny + 0.03, -0.012], r: [0.088, 0.08] },
    { p: [0, ny + 0.075, -0.024], r: [0.112, 0.098] },
    { p: [0, ny + 0.104, -0.034], r: [0.132, 0.114] },
  ];
  attach(rig, "chest", rigidTube(H, rings, { segs: 26, steps: 3, caps: false, arc }), F.wardenIronDouble, [0, 0, 0]);
  const lining = rings.map((c) => ({ ...c, r: c.r.map((v) => v - 0.004) }));
  attach(rig, "chest", rigidTube(H, lining, { segs: 26, steps: 3, caps: false, arc }), F.scapular, [0, 0, 0]);
  // the rolled top edge, and rivets under it
  const top = rings.at(-1);
  const pts = [];
  for (let k = 0; k <= 20; k++) {
    const a = arc[0] + ((arc[1] - arc[0]) * k) / 20;
    pts.push(new THREE.Vector3(Math.cos(a) * top.r[0] * H, top.p[1] * H, (top.p[2] + Math.sin(a) * top.r[1]) * H));
  }
  attach(rig, "chest", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0055 * H, 5, false), F.blackIron, [0, 0, 0]);
  const mid = rings[2];
  rivetRing(rig, "chest", { y: mid.p[1], rx: mid.r[0] + 0.001, rz: mid.r[1] + 0.001, z: mid.p[2], count: 9, arc: [Math.PI - 1.9, Math.PI + 1.9], mat: F.blackIron, r: 0.0042 });
}

/** Her iron: the collar, the gorget, heavy spaulders on both shoulders (four lames each at 1.3), and the girdle the tome hangs from. */
function wardenIron(rig, kit) {
  const { F, M } = kit;
  wardenCollar(rig, kit);
  gorget(rig, F);
  for (const side of ["L", "R"]) spaulder(rig, side, F.wardenIronDouble, { lames: 4, size: 1.3 });
  const girdleY = girdle(rig, { mat: F.leatherDark, rivet: F.blackIron });
  hipTome(rig, { leather: F.leatherDark, iron: F.blackIron, vellum: materials().vellum, strap: F.leatherDark, girdleY });
  // an iron ring and a short chain of three links at the girdle's buckle
  for (let k = 0; k < 3; k++) {
    const link = new THREE.TorusGeometry(0.008 * rig.H, 0.0022 * rig.H, 4, 8);
    if (k % 2) link.rotateY(Math.PI / 2);
    attach(rig, "hips", link, M.brass, [0.03, girdleY - 0.022 - k * 0.014, 0.094]);
  }
}

/**
 * The Spellwarden (R3, §Change: Looks v2 R56, R63): the iron pushed further. A gown cut to a bell in
 * an iron-grey wool, its scapular over it; a high riveted iron collar, a gorget and heavy
 * spaulders; a low girdle with the warded tome hung on her left hip; the iron-shod warding staff in
 * her right hand, taller than her crown, the ward stone caged at its head. Her sleeves fall
 * narrower than the wizard's. She stands the staff beside her and thrusts its head (SPELLWARDEN_STYLE).
 */
export const spellwarden = {
  tones: WEAR.spellwarden,
  // the stone: necrotic toward vellum, low, never neon
  mats: () => ({ orb: glow(mix("necrotic", "vellum", 0.35), 1.2) }),
  opts: {
    gown: { rBottom: BELL },
    arms: { sleeve: (t) => 1 + 0.6 * THREE.MathUtils.smoothstep(t, 0.5, 1) },
    belt: { pouch: false },
  },
  swap: {
    scapular: (rig, kit) => scapularOver(rig, kit.mat, kit),
    weapon: (rig, { M, F, mat }) => inHand(rig, "R").add(wardingStaff(rig, { wood: M.woodDark, iron: F.blackIron, grip: F.leatherDark, stoneMat: mat })),
  },
  omit: ["tome"],
  add: wardenIron,
  style: SPELLWARDEN_STYLE,
};

// --- the Pyromancer (R4, R49, R50, R57, R63) -------------------------------------------------

/**
 * The gown singed off under the knee (R57: the scorch and singed hem pushed further): its hem
 * raised from the wizard's ankle to over the boot tops, then torn ragged and deeper.
 */
const SINGED = { bottom: 0.22, ragged: { teeth: 17, depth: -0.07, seed: 6 } };

/**
 * Lays the ember band of a gown's emissive map (fabrics.js `emberHem`) on its hem: the map's top
 * row on the hem ring, its last row `band` H up the cloth, clamped black above, and a whole number
 * of its tiles round the gown so the back seam does not show. A skirt's UVs run `uvPerH` (4) a H
 * down and round it (anatomy.js `skirt`, rig.js `skinTube`), unmoved by a ragged hem's drop, so
 * the embers ride the torn edge.
 */
export function fitHem(mesh, uvPerH = 4) {
  const map = mesh.material.emissiveMap;
  const uv = mesh.geometry.attributes.uv;
  let uMax = 0;
  let vMax = 0;
  for (let i = 0; i < uv.count; i++) {
    uMax = Math.max(uMax, uv.getX(i));
    vMax = Math.max(vMax, uv.getY(i));
  }
  const band = map.userData.band * uvPerH;
  map.repeat.set(Math.max(1, Math.round(uMax)) / uMax, 1 / band);
  map.offset.set(0, 1 - vMax / band);
  map.updateMatrix();
  return mesh;
}

/**
 * Her hair knotted high on the crown (R49: her head re-cut against the wizard's falling hair and
 * the Spellwarden's collar): the hair drawn up off the neck into a knot bound in an iron ring, two
 * iron pins crossed through it.
 */
function topKnot(rig, { mat, F }) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const out = hair(rig, mat, {});
  const at = [0, hy + 0.126, hz - 0.026];
  attach(rig, "head", new THREE.SphereGeometry(1, 14, 10), mat, at, { sx: r * 0.62 * H, sy: r * 0.7 * H, sz: r * 0.6 * H, rx: -0.3 });
  const ring = new THREE.TorusGeometry(r * 0.5 * H, 0.0045 * H, 5, 14);
  ring.rotateX(Math.PI / 2);
  attach(rig, "head", ring, F.blackIron, [0, at[1] - 0.026, at[2] + 0.004], { rx: -0.3 });
  for (const s of [-1, 1]) attach(rig, "head", new THREE.CylinderGeometry(0.0026 * H, 0.0026 * H, 0.11 * H, 5), F.blackIron, [0, at[1] + 0.008, at[2]], { rz: s * 1.1, rx: -0.3 });
  return out;
}

/**
 * Her gear: a scorched leather spaulder on the torch arm's shoulder alone; scorched leather
 * bracers studded in iron over the fitted sleeves, from the wrist half up the forearm; a buckle
 * on the belt, and an iron oil flask slung on the right hip.
 */
function pyreGear(rig, { F, hy }) {
  const H = rig.H;
  // a scorched leather spaulder on the torch arm alone, the shoulder the fire rides over
  spaulder(rig, "R", F.pyroLeather, { lames: 3, size: 1.1 });
  for (const s of ["L", "R"]) {
    const [x] = J(rig, `foreArm${s}`);
    const [, wy] = J(rig, `hand${s}`);
    limbGuard(rig, `foreArm${s}`, wy + 0.014, wy + 0.105, [0.031, 0.031], F.pyroLeather, { taper: 1.18 });
    rivetRing(rig, `foreArm${s}`, { x, y: wy + 0.06, rx: 0.033, rz: 0.033, count: 6, mat: F.blackIron, r: 0.0035 });
  }
  buckle(rig, "hips", [0, hy + 0.07, 0.064], F.blackIron, { w: 0.024 });
  // the oil flask on the right hip, on a strap from the belt
  const g = mount(rig, "hips", [-0.142, hy - 0.02, -0.02]);
  g.add(placed(new THREE.CylinderGeometry(0.022 * H, 0.026 * H, 0.06 * H, 10), F.blackIron));
  g.add(placed(new THREE.CylinderGeometry(0.008 * H, 0.012 * H, 0.022 * H, 8), F.blackIron, 0, 0.04 * H, 0));
  g.add(placed(new THREE.BoxGeometry(0.004 * H, 0.07 * H, 0.012 * H), F.pyroLeather, 0.024 * H, 0.05 * H, 0));
}

/**
 * The Pyromancer (R4, §Change: Looks v2 R57, R63): the scorch and the singed hem pushed further. The
 * gown, sooted over its embers, singed off under the knee over tall scorched boots; the scapular,
 * its collar and its bust in the scorched oxblood; fitted sleeves under studded leather bracers,
 * one leather spaulder on the torch arm; her hair knotted high; the brazier rod, short and top-heavy, held up before her like a torch
 * (PYROMANCER_STYLE).
 */
export const pyromancer = {
  tones: WEAR.pyromancer,
  // the scapular, its collar and its bust cut from the scorched oxblood
  mats: (F) => ({
    collar: F.pyroSoot,
    scapular: F.pyroSoot,
    bust: F.pyroSoot,
    gown: F.pyroGown,
    boots: F.pyroLeather,
    orb: glow(mix("fireHot", "fireDeep", 0.2), 2.2),
  }),
  opts: {
    gown: SINGED,
    boots: { top: 0.22 },
    arms: { sleeve: (t) => 1 + 0.12 * THREE.MathUtils.smoothstep(t, 0.5, 1) },
  },
  omit: ["hairFall"],
  swap: {
    gown: (rig, { mat, o }) => fitHem(skirt(rig, mat, o)),
    scapular: (rig, kit) => scapularOver(rig, kit.mat, kit, { hem: 0.09 }),
    hair: topKnot,
    weapon: (rig, { F, mat }) => inHand(rig, "R").add(brazierRod(rig, { iron: F.blackIron, grip: F.pyroLeather, flameMat: mat })),
  },
  add: pyreGear,
  style: PYROMANCER_STYLE,
};
