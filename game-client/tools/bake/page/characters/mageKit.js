// The mage kit (FS-1J1CB §Change: Looks v2 R68, R69): what every mage specialization look
// (mageLooks.js) is composed from. Each look's own wear (the fabric keys it re-dyes, fabrics.js),
// the trims a look is finished with (rivet rows and the warded tome's hanger; the stud rows and
// buckles every class kit shares live in gear.js), and the weapons only spec looks carry: the
// Spellwarden's iron-shod warding staff and the Pyromancer's brazier rod. The wizard's own sceptre
// and tome stay in gear.js, which the base uses. A third mage look adds a look object to
// mageLooks.js and, at most, a piece here, changing none of the pieces already here.

import * as THREE from "three";
import { attach, jointAt as J, mount } from "./rig.js";
import { overTorso, skirt } from "./anatomy.js";
import { placed, rod, studRow } from "./gear.js";
import { glow } from "../materials.js";

/** Each spec look's own wear (R63): the fabric keys it re-dyes over the wizard's, from fabrics.js. */
export const WEAR = {
  spellwarden: (F) => ({ robe: F.wardenGown, scapular: F.wardenScapular, blackIron: F.wardenIron, leatherDark: F.wardenLeather }),
  pyromancer: (F) => ({ blackIron: F.pyroIron }),
};

/**
 * The warding staff's measures in the grip frame (H, along +z from the fist): the iron shoe's point
 * (`butt`), the shoe's collar, the haft's top, the cage round the stone from its foot to where its
 * bars close (`cage`, its widest radius `r`), the stone's centre, and the finial's tip (`top`). The
 * fist holds it a little under its middle, so stood upright beside her the shoe hangs a hand over
 * the ground and the cage stands over her crown.
 */
export const STAFF = { butt: -0.46, shoe: -0.37, haft: 0.42, cage: [0.41, 0.555], r: 0.05, stone: 0.478, top: 0.62 };

/** A point `r` (H) out from the grip frame's +z axis at angle `a`, `z` (H) along it. */
const round = (a, r, z) => new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z);

/**
 * The Spellwarden's iron-shod warding staff (FS-1J1CB §Change: Looks v2 R56), in the grip frame: a
 * long haft of dark ash bound in iron bands, its grip wrapped in leather between two iron ferrules,
 * an iron shoe sheathing its foot to a blunt point; at its head an iron collar and a cage of six
 * bars swelling out round the ward stone and closing over it under a spiked finial, two hoops
 * binding the bars. The stone is `stoneMat`, lit with the clip as the sceptre's orb is. Taller than
 * her crown (STAFF). `userData.staff` is its measures (H).
 */
export function wardingStaff(rig, { wood, iron, grip, stoneMat }) {
  const H = rig.H;
  const g = new THREE.Group();
  const S = STAFF;
  // the haft, swelling a little toward the head
  g.add(placed(rod(0.0105 * H, 0.0118 * H, (S.haft - S.shoe) * H), wood, 0, 0, ((S.haft + S.shoe) / 2) * H));
  // the iron shoe: a sleeve over the foot, tapering to a blunt point, a collar at its mouth
  g.add(placed(rod(0.0095 * H, 0.0128 * H, (S.shoe - S.butt - 0.03) * H), iron, 0, 0, ((S.shoe + S.butt + 0.03) / 2) * H));
  g.add(placed(new THREE.ConeGeometry(0.0095 * H, 0.03 * H, 10), iron, 0, 0, (S.butt + 0.015) * H, -Math.PI / 2));
  g.add(placed(rod(0.0148 * H, 0.0148 * H, 0.012 * H), iron, 0, 0, S.shoe * H));
  // iron bands down the haft, each with a rivet either side
  for (const z of [-0.24, -0.12, 0.17, 0.3]) {
    g.add(placed(rod(0.0138 * H, 0.0138 * H, 0.009 * H), iron, 0, 0, z * H));
    for (const s of [-1, 1]) g.add(placed(new THREE.SphereGeometry(0.0036 * H, 6, 4), iron, s * 0.0142 * H, 0, z * H));
  }
  // the leather grip between two ferrules
  g.add(placed(rod(0.0138 * H, 0.0138 * H, 0.13 * H), grip, 0, 0, 0.005 * H));
  for (const z of [-0.062, 0.072]) g.add(placed(rod(0.0152 * H, 0.0152 * H, 0.012 * H), iron, 0, 0, z * H));
  // the head: a collar widening up into the cage's foot
  const [c0, c1] = S.cage;
  g.add(placed(rod(0.012 * H, 0.021 * H, (c0 - S.haft + 0.02) * H), iron, 0, 0, ((S.haft + c0) / 2 - 0.005) * H));
  // six bars from the collar out round the stone and in over it to the finial
  const bars = 6;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2 + Math.PI / bars;
    const pts = [round(a, 0.018, c0), round(a, S.r * 0.92, c0 + 0.035), round(a, S.r, S.stone), round(a, S.r * 0.8, c1 - 0.03), round(a, 0.01, c1)].map((v) => v.multiplyScalar(H));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0048 * H, 5, false), iron));
  }
  // two hoops binding the bars, above and below the stone
  for (const [z, r] of [
    [S.stone - 0.035, S.r * 0.97],
    [S.stone + 0.04, S.r * 0.9],
  ])
    g.add(placed(new THREE.TorusGeometry(r * H, 0.0042 * H, 5, 24), iron, 0, 0, z * H));
  g.add(placed(new THREE.SphereGeometry(0.03 * H, 16, 12), stoneMat, 0, 0, S.stone * H));
  // the finial: a knob where the bars close, and a short spike over it
  g.add(placed(new THREE.SphereGeometry(0.014 * H, 10, 8), iron, 0, 0, c1 * H));
  g.add(placed(new THREE.ConeGeometry(0.009 * H, (S.top - c1) * H, 8), iron, 0, 0, ((S.top + c1) / 2) * H, Math.PI / 2));
  g.userData.staff = { butt: S.butt, top: S.top, head: { from: c0, to: S.top, r: S.r }, stone: S.stone };
  return g;
}

/**
 * The brazier rod's measures in the grip frame (H): the pommel knob, the haft's foot under it and
 * its top where the brazier's bowl sits (`foot`), the cage's rim (`rim`) and its widest radius
 * (`r`), and the tips of the bars standing over the rim (`top`). The haft is about the sceptre's
 * length; the cage about twice the v1 fire focus's (0.074 H across).
 */
export const BRAZIER = { pommel: -0.084, foot: 0.23, rim: 0.36, r: 0.068, top: 0.388 };

/** A tongue of flame along local +y, `h` tall and `r` wide (H), its foot a little under the origin. */
function flameGeometry(h, r) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const w = r * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) ** 0.6;
    pts.push(new THREE.Vector2(Math.max(0.0001, w), t * h - h * 0.15));
  }
  return new THREE.LatheGeometry(pts, 14);
}

/**
 * The Pyromancer's brazier rod (FS-1J1CB §Change: Looks v2 R57), in the grip frame: a short iron
 * haft about the sceptre's length, a scorched leather grip and a pommel knob, and on it a large open
 * fire cage: an iron dish of coals under eight bars bowing out and back in to a rim, each bar
 * standing on past the rim in a point. The coals are the fire ramp; the flame over them, a tall
 * tongue with two smaller beside it, is `flameMat`, which glows with the clip, and is kept upright
 * in the world whatever the hand's tilt (a rig hook turns it each pose). `userData.brazier` is its
 * measures (H).
 */
export function brazierRod(rig, { iron, grip, flameMat }) {
  const H = rig.H;
  const B = BRAZIER;
  const g = new THREE.Group();
  g.add(placed(rod(0.0095 * H, 0.0105 * H, (B.foot - B.pommel - 0.02) * H, 8), iron, 0, 0, ((B.foot + B.pommel + 0.02) / 2) * H));
  g.add(placed(new THREE.SphereGeometry(0.017 * H, 10, 8), iron, 0, 0, (B.pommel + 0.017) * H));
  g.add(placed(rod(0.0128 * H, 0.0128 * H, 0.08 * H), grip, 0, 0, 0.004 * H));
  for (const z of [-0.038, 0.046]) g.add(placed(rod(0.0138 * H, 0.0138 * H, 0.009 * H, 8), iron, 0, 0, z * H));
  // a twist of iron up the haft under the brazier
  for (const z of [0.09, 0.12, 0.15]) g.add(placed(new THREE.TorusGeometry(0.012 * H, 0.003 * H, 4, 10), iron, 0, 0, z * H));
  // the dish: an iron bowl on a short neck
  g.add(placed(rod(0.011 * H, 0.02 * H, 0.03 * H, 8), iron, 0, 0, (B.foot - 0.01) * H));
  const dish = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    dish.push(new THREE.Vector2((0.018 + 0.042 * Math.sin((t * Math.PI) / 2)) * H, (0.008 + 0.03 * t * t) * H));
  }
  const bowl = new THREE.LatheGeometry(dish, 18);
  bowl.rotateX(Math.PI / 2);
  g.add(placed(bowl, iron, 0, 0, B.foot * H));
  // the bars, bowing out to the widest and back in to the rim, each on past it in a point
  const bars = 8;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    const pts = [round(a, 0.055, B.foot + 0.035), round(a, B.r, B.foot + 0.075), round(a, B.r * 0.94, B.rim - 0.02), round(a, B.r * 0.8, B.rim), round(a, B.r * 0.86, B.top)].map((v) => v.multiplyScalar(H));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0045 * H, 5, false), iron));
  }
  g.add(placed(new THREE.TorusGeometry(B.r * 0.8 * H, 0.0048 * H, 5, 28), iron, 0, 0, B.rim * H));
  g.add(placed(new THREE.TorusGeometry(B.r * 0.98 * H, 0.004 * H, 5, 28), iron, 0, 0, (B.foot + 0.075) * H));
  // the coals heaped in the dish, the fire ramp
  const hot = glow("fireHot", 2.6);
  const deep = glow("fireDeep", 2.4);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const r = i === 0 ? 0 : 0.018 + 0.016 * (i % 3);
    g.add(placed(new THREE.SphereGeometry((0.014 - 0.002 * (i % 3)) * H, 8, 6), i % 2 ? deep : hot, Math.cos(a) * r * H, Math.sin(a) * r * H, (B.foot + 0.03 + 0.006 * (i % 2)) * H));
  }
  // the flame: a tall tongue and two smaller, upright in the world
  const flame = new THREE.Group();
  flame.position.set(0, 0, (B.foot + 0.045) * H);
  flame.add(new THREE.Mesh(flameGeometry(0.27 * H, 0.046 * H), flameMat));
  for (const [x, h, r] of [
    [0.028, 0.15, 0.022],
    [-0.026, 0.12, 0.02],
  ]) {
    const tongue = new THREE.Mesh(flameGeometry(h * H, r * H), flameMat);
    tongue.position.x = x * H;
    flame.add(tongue);
  }
  const core = new THREE.Mesh(flameGeometry(0.14 * H, 0.024 * H), glow("fireCore", 2.2));
  core.position.y = 0.006 * H;
  flame.add(core);
  flame.userData.upright = true;
  g.add(flame);
  const q = new THREE.Quaternion();
  rig.hooks.push((r) => {
    r.root.updateMatrixWorld(true);
    flame.parent.getWorldQuaternion(q);
    flame.quaternion.copy(q.invert());
    flame.updateMatrixWorld(true);
  });
  g.userData.brazier = { pommel: B.pommel, foot: B.foot, top: B.top, cage: { r: B.r + 0.0045, from: B.foot, to: B.top } };
  return g;
}

/**
 * The warded tome hung on the left hip (R56): the book bound shut in two iron bands with a hasp,
 * its spine up and its covers flat to the hip, slung on two short straps with a buckle on each
 * from the girdle at `girdleY` (H), rigid on the hips so the left hand is free. It sits out past
 * the gown and the sleeve.
 */
export function hipTome(rig, { leather, iron, vellum, strap, girdleY }) {
  const H = rig.H;
  const at = [0.15, girdleY - 0.082, -0.012];
  const g = mount(rig, "hips", at, { rz: 0.12 });
  const [w, h, d] = [0.036, 0.112, 0.088];
  g.add(placed(new THREE.BoxGeometry(w * H, h * H, d * H), leather));
  g.add(placed(new THREE.BoxGeometry(w * 0.8 * H, h * 0.94 * H, d * 0.97 * H), vellum, 0, 0, 0.004 * H));
  for (const sy of [-1, 1]) {
    // iron bands round the boards, and iron corners
    g.add(placed(new THREE.BoxGeometry((w + 0.006) * H, 0.009 * H, (d + 0.006) * H), iron, 0, sy * 0.026 * H, 0));
    for (const sz of [-1, 1]) g.add(placed(new THREE.BoxGeometry((w + 0.005) * H, 0.016 * H, 0.016 * H), iron, 0, sy * 0.048 * H, sz * 0.038 * H));
  }
  // the hasp over the fore-edge, and a lock plate
  g.add(placed(new THREE.BoxGeometry((w + 0.01) * H, 0.022 * H, 0.008 * H), iron, 0, 0, (d / 2 + 0.003) * H));
  g.add(placed(new THREE.BoxGeometry(0.006 * H, 0.03 * H, 0.022 * H), iron, (w / 2 + 0.003) * H, 0, (d / 2 - 0.012) * H));
  // the hanger: two straps up from the boards to the girdle, a buckle on each
  for (const sz of [-1, 1]) {
    g.add(placed(new THREE.BoxGeometry(0.004 * H, 0.07 * H, 0.012 * H), strap, -(w / 2 + 0.002) * H, (h / 2 + 0.02) * H, sz * 0.026 * H));
    const b = new THREE.TorusGeometry(0.0075 * H, 0.0022 * H, 4, 4);
    b.rotateY(Math.PI / 2);
    g.add(placed(b, iron, -(w / 2 + 0.004) * H, (h / 2 + 0.03) * H, sz * 0.026 * H));
  }
  g.userData.tome = { at, size: [w, h, d] };
  return g;
}

/** A ring of rivets round a horizontal oval (`rx`, `rz`, H) about (`x`, `z`) at height `y` on `bone`, over `arc` (rad, 0 the front). */
export function rivetRing(rig, bone, { y, rx, rz, x = 0, z = 0, count, arc = [-Math.PI, Math.PI], mat, r = 0.004 }) {
  const pts = Array.from({ length: count }, (_, k) => arc[0] + ((arc[1] - arc[0]) * (k + 0.5)) / count).map((a) => [x + Math.sin(a) * rx, y, z + Math.cos(a) * rz]);
  studRow(rig, bone, pts, mat, { r, normal: ([px, , pz]) => [(px - x) / rx, 0, (pz - z) / rz] });
}


/**
 * The scapular's front and back panels cut over a look's own gown (`kit.robe`, the gown's options
 * with the look's merged over them), as cast.js `wizard` cuts them over the wizard's: each panel a
 * little out from the gown all the way down (the wizard's own offsets), its hem `hem` H over the
 * gown's, so a bell or a singed gown keeps its scapular on top of it and never inside it.
 */
export function scapularOver(rig, m, { hy, waist, robe, panels }, { hem = 0.034 } = {}) {
  for (const arc of panels) {
    overTorso(rig, m, { from: hy - 0.01, arc, pad: 0.012, waist });
    skirt(rig, m, {
      top: hy - 0.005,
      bottom: robe.bottom + hem,
      rTop: [robe.rTop[0] + 0.008, robe.rTop[1] + 0.006],
      rBottom: [robe.rBottom[0] + 0.005, robe.rBottom[1] + 0.008],
      arc,
      over: robe,
    });
  }
}

/**
 * A girdle slung low round the hips over the gown's top: a broad band `mat`, rivets `rivet` round
 * its front, and a buckle. A garment's cover over its height, as `belt` is (clearance.js).
 */
export function girdle(rig, { mat, rivet, r = [0.118, 0.09], dy = 0.004 }) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const y = hy + dy;
  const band = new THREE.CylinderGeometry(1, 1.03, 0.03 * H, 30, 1, true);
  band.scale(r[0] * H, 1, r[1] * H);
  attach(rig, "hips", band, mat, [0, y, 0]);
  rivetRing(rig, "hips", { y, rx: r[0] + 0.002, rz: r[1] + 0.002, count: 12, arc: [-2.2, 2.2], mat: rivet, r: 0.0042 });
  attach(rig, "hips", new THREE.BoxGeometry(0.034 * H, 0.036 * H, 0.01 * H), rivet, [0, y, r[1] + 0.004]);
  return y;
}
