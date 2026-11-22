// The archer kit (FS-1J1CB §Change: Looks v2 R68, R69): what every archer specialization look
// (archerLooks.js) is composed from. Each look's own wear (the fabric keys it re-dyes, fabrics.js),
// the trims a look is finished with (the quiver's baldric, laced bracers, leg wraps and dagged
// edges; the stud rows and buckles every class kit shares live in gear.js), and the gear only spec
// looks carry: the Hunter's heavy recurve and skinning knife, the Shadow Ranger's slim blackened
// longbow and hooded quiver. The class's own longbow and quiver stay in gear.js, which the base
// uses. Each bow here is strung by gear.js `liveString` and handed to cast.js `bowInHand` through
// the weapon's options (`o.bow`), so the live string and the draw (draw.js) keep working. A third
// archer look adds a look object to archerLooks.js and, at most, a piece here, changing none of
// the pieces already here.

import * as THREE from "three";
import { attach, jointAt as J, mount, rigidTube } from "./rig.js";
import { buckle, liveString, placed, rod } from "./gear.js";
import { hash2 } from "../noise.js";

/** Each spec look's own wear (R63): the fabric keys it re-dyes over the archer's, from fabrics.js. */
export const WEAR = {
  hunter: (F) => ({ rangerNight: F.hunterWool, rangerNightDark: F.hunterWoolDark, linen: F.goose, leatherDark: F.hunterLeather }),
  shadowRanger: (F) => ({ rangerNight: F.shadow, rangerNightDark: F.shadowDark, buff: F.shadowLeather, linen: F.shadowFletch }),
};

// --- the bows --------------------------------------------------------------------------------

/**
 * The heavy recurve's measures in the grip frame (H; z along the stave from the grip, y toward the
 * string): where the string leaves each limb (`bridge`, at draw.js's brace, so the draw's line is
 * the longbow's), the limb's tip curled away from the archer past it (`tip`), and the limbs'
 * radius at the grip (`r`) and how wide they are against how deep (`flat`). Shorter than the
 * longbow's 0.4 H half-length (R58).
 */
export const RECURVE = { bridge: [0.075, 0.215], tip: [0.028, 0.278], r: 0.0125, flat: 1.45 };

/** A point on the recurve's back limb's centre line (y toward the string, z out along it; H). */
const RECURVE_LIMB = [
  [-0.012, 0],
  [-0.004, 0.06],
  [0.03, 0.14],
  [0.075, 0.215],
  [0.074, 0.245],
  [0.052, 0.27],
  [0.028, 0.278],
];

/**
 * The Hunter's heavy recurve hunting bow (FS-1J1CB §Change: Looks v2 R58), in the grip frame as
 * gear.js `longbow` is: thick flat limbs of sinew-backed wood bowing toward the string to where it
 * leaves them (RECURVE `bridge`), then curling away from her to horn-capped tips; a rawhide grip
 * wrap bound in sinew at both ends, and the string lying along each curl to its nock. Strung live
 * from the bridges (`liveString`), so the draw and its arrow are the longbow's. `userData.recurve`
 * is its measures (H). Built as a `bow` for cast.js `bowInHand` (`mats` from the look's fabrics).
 */
export function recurve(rig, M, F, { wood, horn, grip, sinew }) {
  const H = rig.H;
  const g = new THREE.Group();
  const pts = [...RECURVE_LIMB.slice(1).reverse().map(([y, z]) => [y, -z]), ...RECURVE_LIMB].map(([y, z]) => new THREE.Vector3(0, y * H, z * H));
  const curve = new THREE.CatmullRomCurve3(pts);
  const stave = new THREE.TubeGeometry(curve, 64, RECURVE.r * H, 8, false);
  // flatten the limbs across (x) and taper them toward the tips, the grip left round and full
  const p = stave.attributes.position;
  const v = new THREE.Vector3();
  const L = RECURVE.tip[1] * H;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = Math.min(1, Math.abs(v.z) / L);
    const c = curve.getPoint(Math.min(1, Math.max(0, 0.5 + (v.z / L) * 0.5)));
    const k = 1 - 0.5 * t;
    const flat = 1 + (RECURVE.flat - 1) * THREE.MathUtils.smoothstep(t, 0.15, 0.4);
    p.setXYZ(i, c.x + (v.x - c.x) * k * flat, c.y + (v.y - c.y) * k, v.z);
  }
  stave.computeVertexNormals();
  g.add(new THREE.Mesh(stave, wood));
  // the horn caps over each curl, from the bridge out to the tip
  for (const s of [-1, 1]) {
    const curl = RECURVE_LIMB.slice(3).map(([y, z]) => new THREE.Vector3(0, y * H, s * z * H));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curl), 12, 0.0072 * H, 6, false), horn));
    // the nock's knob
    const [ty, tz] = RECURVE.tip;
    g.add(placed(new THREE.SphereGeometry(0.0078 * H, 8, 6), horn, 0, ty * H, s * tz * H));
    // the string along the curl, from the nock to where it leaves the limb, a hair off its belly
    const lie = RECURVE_LIMB.slice(3).map(([y, z]) => new THREE.Vector3(0, (y + 0.006) * H, s * z * H));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lie), 8, 0.0022 * H, 4, false), sinew));
  }
  // the rawhide grip wrap, swelling the grip, bound in sinew at both ends and crossed down it
  g.add(placed(rod(0.0158 * H, 0.0158 * H, 0.1 * H), grip, 0, -0.004 * H, 0));
  for (const z of [-0.05, 0.05]) g.add(placed(new THREE.TorusGeometry(0.0162 * H, 0.0028 * H, 4, 12), sinew, 0, -0.004 * H, z * H));
  for (const z of [-0.025, 0, 0.025]) g.add(placed(new THREE.TorusGeometry(0.016 * H, 0.0018 * H, 4, 12), sinew, 0, -0.004 * H, z * H, 0.35, 0, 0));
  const [by, bz] = RECURVE.bridge;
  const bow = liveString(rig, g, { tips: [new THREE.Vector3(0, by * H, -bz * H), new THREE.Vector3(0, by * H, bz * H)], stringMat: sinew, M, F });
  g.userData.recurve = { half: RECURVE.tip[1], bridge: bz, r: RECURVE.r };
  return bow;
}

/** The slim longbow's measures (H): the longbow's half-length and brace, its stave's radius at the grip, thinner than the longbow's 0.0085. */
export const SLIM = { L: 0.4, r: 0.0064 };

/**
 * The Shadow Ranger's slim blackened longbow (FS-1J1CB §Change: Looks v2 R59): the longbow's
 * length and draw, its stave thinner and tapering further, the wood blackened and oiled; a grip of
 * black cord between two iron rings, iron caps over the nocks drawn out to short points, and a
 * string darker than the base's. `userData.slim` is its measures (H).
 */
export function slimLongbow(rig, M, F, { wood, cord, iron, string }) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = SLIM.L * H;
  const brace = 0.075 * H;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, brace, -L),
    new THREE.Vector3(0, brace * 0.1, -L * 0.55),
    new THREE.Vector3(0, -0.012 * H, 0),
    new THREE.Vector3(0, brace * 0.1, L * 0.55),
    new THREE.Vector3(0, brace, L),
  ]);
  const stave = new THREE.TubeGeometry(curve, 40, SLIM.r * H, 6, false);
  const p = stave.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = Math.min(1, Math.abs(v.z) / L);
    const c = curve.getPoint(Math.min(1, Math.max(0, 0.5 + (v.z / L) * 0.5)));
    const k = 1 - 0.62 * t;
    p.setXYZ(i, c.x + (v.x - c.x) * k, c.y + (v.y - c.y) * k, v.z);
  }
  stave.computeVertexNormals();
  g.add(new THREE.Mesh(stave, wood));
  g.add(new THREE.Mesh(rod(0.0094 * H, 0.0094 * H, 0.075 * H), cord));
  for (const z of [-0.04, 0.04]) g.add(placed(new THREE.TorusGeometry(0.0098 * H, 0.0024 * H, 4, 10), iron, 0, 0, z * H));
  const tips = [new THREE.Vector3(0, brace, -L), new THREE.Vector3(0, brace, L)];
  for (const [k, t] of tips.entries()) {
    const cap = new THREE.ConeGeometry(0.0046 * H, 0.04 * H, 6);
    cap.rotateX(k === 0 ? -Math.PI / 2 : Math.PI / 2);
    g.add(placed(cap, iron, t.x, t.y, t.z + (k === 0 ? -0.012 : 0.012) * H));
  }
  const bow = liveString(rig, g, { tips, stringMat: string, M, F, r: 0.0019 });
  g.userData.slim = { half: SLIM.L, r: SLIM.r };
  return bow;
}

// --- the quiver ------------------------------------------------------------------------------

/**
 * The Shadow Ranger's hooded quiver (FS-1J1CB §Change: Looks v2 R59), on the archer's mount
 * (classStyles.js ARCHER_QUIVER, the look's `quiver` options `o`), so it rides over the cloak as
 * the base's does: the case (`userData.case`, as gear.js `quiver` tags its own), two iron bands, and
 * over its mouth a stiff leather hood, closed toward her head and open over the right shoulder, so
 * the fletching under it shows only as a dark edge at its lip. A buckled strap runs down the case.
 */
export function hoodedQuiver(rig, M, { leather, hood, iron, fletch, strap }, o) {
  const H = rig.H;
  const [, cy] = J(rig, "chest");
  const g = mount(rig, "chest", [o.at[0], cy + o.at[1], o.at[2] * rig.p.torsoD], { rz: (o.tilt * Math.PI) / 180, rx: o.rx });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034 * H, 0.027 * H, 0.26 * H, 12, 1, true), leather);
  body.userData.case = true;
  g.add(body);
  for (const y of [0.1, -0.09]) g.add(placed(new THREE.TorusGeometry((0.033 - (0.1 - y) * 0.03) * H, 0.0032 * H, 4, 14), iron, 0, y * H, 0, Math.PI / 2));
  // the fletching, short and dark, just over the rim and under the hood's lip
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(placed(new THREE.BoxGeometry(0.012 * H, 0.026 * H, 0.002 * H), fletch, Math.cos(a) * 0.016 * H, 0.142 * H, Math.sin(a) * 0.016 * H, 0, a, 0));
  }
  // the hood: a dome over the mouth, cut away over the right shoulder (the quiver's -x, its +z)
  const dome = new THREE.SphereGeometry(0.043 * H, 16, 10, Math.PI * 0.15, Math.PI * 1.45, 0, Math.PI * 0.55);
  dome.scale(1, 1.35, 1);
  g.add(placed(dome, hood, 0, 0.128 * H, -0.004 * H, -0.18, 0, 0));
  g.add(placed(new THREE.TorusGeometry(0.035 * H, 0.004 * H, 4, 16), iron, 0, 0.13 * H, 0, Math.PI / 2));
  // the strap down the case, buckled
  g.add(placed(new THREE.BoxGeometry(0.014 * H, 0.2 * H, 0.004 * H), strap, 0, -0.01 * H, 0.033 * H));
  g.add(placed(new THREE.TorusGeometry(0.009 * H, 0.0024 * H, 4, 4), iron, 0, 0.04 * H, 0.036 * H, 0, 0, Math.PI / 4));
  return g;
}

// --- the trims -------------------------------------------------------------------------------

/**
 * The quiver's baldric: a strap from the right shoulder across the breast to the left flank, laid
 * `pad` H out on the chest's curve and rigid on it, a buckle `buckleMat` on its run over the breast.
 */
export function baldric(rig, mat, buckleMat, { pad = 0.014, w = 0.0075 } = {}) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const tw = rig.p.torsoW;
  const td = rig.p.torsoD;
  // a point on the chest's surface at angle a from the front toward her left (+x), height y
  const at = (a, y) => {
    const k = THREE.MathUtils.clamp((y - (cy - 0.005)) / (cy + 0.06 - (cy - 0.005)), 0, 1);
    const rx = (0.099 + 0.013 * k) * tw + pad;
    const rz = (0.074 + 0.005 * k) * td + pad;
    return new THREE.Vector3(Math.sin(a) * rx * H, y * H, Math.cos(a) * rz * H);
  };
  const run = [
    [-1.45, ny - 0.012],
    [-1.0, ny - 0.03],
    [-0.45, cy + 0.045],
    [0.2, cy + 0.0],
    [0.85, cy - 0.04],
    [1.4, cy - 0.065],
  ].map(([a, y]) => at(a, y));
  attach(rig, "chest", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), 24, w * H, 4, false), mat, [0, 0, 0]);
  const b = at(-0.2, cy + 0.03).divideScalar(H);
  buckle(rig, "chest", [b.x, b.y, b.z + 0.004], buckleMat, { w: 0.022, ry: -0.2 });
}

/**
 * A laced bracer on `bone` (a forearm) from `from` to `to` (H): a leather guard a little proud of
 * the sleeve, laced up its outer side with `lace` crossings and bound at both ends.
 */
export function lacedBracer(rig, bone, from, to, { mat, lace, r = 0.036, laces = 4 }) {
  const H = rig.H;
  const [x] = J(rig, bone);
  const sx = x > 0 ? 1 : -1;
  rigidGuard(rig, bone, from, to, r, mat);
  for (let i = 0; i < laces; i++) {
    const y = from + ((to - from) * (i + 0.5)) / laces;
    for (const s of [-1, 1]) attach(rig, bone, new THREE.BoxGeometry(0.003 * H, 0.002 * H, 0.026 * H), lace, [x + sx * (r + 0.002), y, 0], { rx: s * 0.6 });
  }
  for (const y of [from, to]) {
    const band = new THREE.TorusGeometry((r + 0.002) * H, 0.0026 * H, 4, 14);
    band.rotateX(Math.PI / 2);
    attach(rig, bone, band, lace, [x, y, 0]);
  }
}

/** A plain rigid guard round a limb `bone` from `from` to `to` (H), `r` its radius. */
function rigidGuard(rig, bone, from, to, r, mat) {
  const [x] = J(rig, bone);
  attach(
    rig,
    bone,
    rigidTube(
      rig.H,
      [
        { p: [x, from, 0], r: [r, r] },
        { p: [x, (from + to) / 2, 0], r: [r * 1.05, r * 1.05] },
        { p: [x, to, 0], r: [r * 1.1, r * 1.1] },
      ],
      { segs: 14, steps: 2, caps: false },
    ),
    mat,
    [0, 0, 0],
  );
}

/**
 * Wraps round both shins from `from` to `to` (H), `r` their radius, `mat` the wrap, and garters
 * `garter` crossed over them, `crossings` up each shin: rigid on the shins, under the cloak's hem.
 */
export function legWraps(rig, { mat, garter, from = 0.08, to = 0.22, r = 0.046, crossings = 3 }) {
  const H = rig.H;
  for (const s of ["L", "R"]) {
    rigidGuard(rig, `shin${s}`, from, to, r, mat);
    const [x] = J(rig, `shin${s}`);
    for (let k = 0; k < crossings; k++) {
      const y = from + 0.02 + ((to - from - 0.04) * k) / Math.max(1, crossings - 1);
      attach(rig, `shin${s}`, new THREE.BoxGeometry(0.09 * H, 0.006 * H, 0.004 * H), garter, [x, y, r + 0.003], { rz: (k % 2 ? 1 : -1) * 0.45 });
      attach(rig, `shin${s}`, new THREE.BoxGeometry(0.09 * H, 0.006 * H, 0.004 * H), garter, [x, y, -(r + 0.003)], { rz: (k % 2 ? -1 : 1) * 0.45 });
    }
  }
}

/**
 * Drops a tube's lowest ring into `teeth` dags round it, each up to `depth` H, seeded by `seed`:
 * a mantle's edge cut in points. Vertices below `edge` (H) are pulled down, deepest at each dag's
 * middle.
 */
export function dag(geo, H, { edge, teeth, depth, seed }) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x) + Math.PI;
    const j = Math.floor((a / (Math.PI * 2)) * teeth);
    // a dag is a point: deepest at its middle
    const f = 1 - Math.abs(((a / (Math.PI * 2)) * teeth - j) * 2 - 1);
    if (v.y < edge * H) v.y -= depth * H * (0.35 + 0.65 * hash2(j, 3, seed)) * f;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- the knife -------------------------------------------------------------------------------

/**
 * The Hunter's skinning knife in its sheath (FS-1J1CB §Change: Looks v2 R58), riding the belt
 * across her front, laid near level along it, the hilt a little right of her middle and the point
 * toward her left hip: clear of the bow hand's carry on her left, out ahead of the hip, and of the
 * right arm hanging at her side and drawing. A leather sheath, its
 * throat bound and its tip shod in `tip`, slung from the belt by a loop; a horn grip with a
 * guard and a pommel. Rigid on the hips. `userData.knife` is where it sits (H).
 */
export function skinningKnife(rig, { sheath, grip, iron, loop, beltY, at = -0.3, tilt = 1.25 }) {
  const H = rig.H;
  const rx = 0.1 * rig.p.hipW + 0.012;
  const rz = 0.076 * rig.p.torsoD + 0.012;
  const pos = [Math.sin(at) * rx, beltY - 0.016, Math.cos(at) * rz];
  // the knife lies along the belt's tangent, tipped `tilt` from upright: the hilt toward her right
  // and up a little, the point across her front and down
  const g = mount(rig, "hips", pos, { ry: at, rz: tilt, order: "YZX" });
  const blade = 0.1;
  // the sheath, wide at the throat and drawn to a rounded point below
  const s = new THREE.CylinderGeometry(0.014 * H, 0.007 * H, blade * H, 8);
  s.scale(1, 1, 0.5);
  g.add(placed(s, sheath, 0, -blade * 0.5 * H, 0));
  g.add(placed(new THREE.SphereGeometry(0.0075 * H, 6, 4), iron, 0, -blade * H, 0));
  g.add(placed(new THREE.CylinderGeometry(0.0155 * H, 0.0155 * H, 0.008 * H, 8), iron, 0, -0.004 * H, 0));
  // the grip, its guard and pommel
  g.add(placed(new THREE.BoxGeometry(0.03 * H, 0.004 * H, 0.012 * H), iron, 0, 0.002 * H, 0));
  g.add(placed(new THREE.CylinderGeometry(0.0085 * H, 0.0095 * H, 0.042 * H, 8), grip, 0, 0.024 * H, 0));
  g.add(placed(new THREE.SphereGeometry(0.0105 * H, 8, 6), iron, 0, 0.048 * H, 0));
  // the loop over the belt
  g.add(placed(new THREE.BoxGeometry(0.02 * H, 0.03 * H, 0.004 * H), loop, 0, -0.01 * H, -0.005 * H));
  g.userData.knife = { at: pos, length: blade + 0.052 };
  return g;
}
