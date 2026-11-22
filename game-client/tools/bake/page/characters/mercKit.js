// The mercenary kit (FS-1J1CB §Change: Looks v2 R68, R69): what every mercenary specialization look
// (mercLooks.js) is composed from. Each look's own wear (the fabric keys it re-dyes, fabrics.js),
// the trims a look is finished with (edge bindings, cuff bands, studded belts, and `onChest`, where
// a trim lies on the chest; the stud rows and buckles every class kit shares live in gear.js), and
// the gear only spec looks carry: the Duelist's long-hilted curved blade and the scabbard re-cut to
// it, the Sellsword's broad falchion and its scabbard, a purse and a bedroll. The mercenary's own
// knuckle-bowed blade and scabbard stay in gear.js (`curvedSword`, `scabbard`), which the base uses.
// Split from mercLooks.js past R69's 400 lines; a third mercenary look adds a look object there
// and, at most, a piece here, changing none of the pieces already here.
//
// Each blade is built in the grip frame (gear.js): the fist closes round +z, the blade runs on out
// of it along +z, the edge on -y. Each tags `userData.axis`, points down its length from the butt
// to the point in that frame (H), and `userData.outline`, points round its blade, so the motion
// tests (mercLooks.test.mjs) hold it clear of the head, the body and the forearm on every pose.

import * as THREE from "three";
import { attach, ellipsoid, jointAt as J, mount, rigidTube } from "./rig.js";
import { GRIP_BASIS, buckle, extrude, placed, rod, studRow } from "./gear.js";

/** Each spec look's own wear (R63): the fabric keys it re-dyes over the mercenary's, from fabrics.js. */
export const WEAR = {
  duelist: (F) => ({ steel: F.duelistSteel, blackIron: F.duelistIron, leatherDark: F.duelistLeather }),
  sellsword: (F) => ({ coat: F.sellBlack, sash: F.sellSash, steel: F.sellSteel, darkSteel: F.sellPlate, darkSteelDouble: F.sellPlateDouble, blackIron: F.sellIron, leatherDark: F.sellLeather }),
};

// --- the Duelist's blade ------------------------------------------------------------------------

/**
 * The long-hilted blade's measures in the grip frame (H, along +z from the fist): the butt cap,
 * the wrapped grip (about two fists long, most of it behind the fist, so one hand swings it and
 * the butt stands out past the heel of the hand), the round guard, and the blade from its collar
 * to the point, its centre line bowed `curve` toward +y at the point, evenly (`curve · t²`).
 */
export const LONG_BLADE = { butt: -0.084, grip: [-0.078, 0.032], guard: { z: 0.039, r: 0.028 }, blade: [0.046, 0.55], curve: 0.032, width: 0.0205 };

/** A point on the long blade's centre line `t` of the way from its collar to its point ([y, z], H). */
const longCentre = (t) => {
  const [z0, z1] = LONG_BLADE.blade;
  return [LONG_BLADE.curve * t * t, z0 + (z1 - z0) * t];
};

/**
 * The Duelist's long-hilted curved single-edged blade (FS-1J1CB §Change: Looks v2 R60), in the
 * grip frame: a blade of even, shallow curve, its width near constant to a clean point where the
 * edge sweeps up to the back, the edge ground bright down its length; a plain iron collar; a plain
 * round iron guard, no cross and no knuckle-bow; a grip about two fists long, its pale core wound
 * in crossing turns of dark cord between an iron collar and a plain iron butt cap. No ornament:
 * "almost" samurai (R7). `mats`: `steel` the blade, `edge` its ground edge, `iron` the fittings,
 * `core` and `cord` the grip.
 */
export function longBlade(rig, { steel, edge, iron, core, cord }) {
  const H = rig.H;
  const g = new THREE.Group();
  const { butt, grip, guard, blade, width } = LONG_BLADE;
  const L = blade[1] - blade[0];
  const N = 28;
  const half = (t) => (width / 2) * (1 - 0.18 * t);
  // the point: the edge sweeps up to the back over the last stretch
  const sweep = (t) => (t < 0.92 ? 0 : THREE.MathUtils.smoothstep(t, 0.92, 1));
  const edgeAt = (t) => longCentre(t)[0] - half(t) * (1 - 2 * sweep(t));
  const backAt = (t) => longCentre(t)[0] + half(t) * (1 - 0.15 * sweep(t));
  const shape = (inset = 0) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = edgeAt(t) + inset * (1 - sweep(t));
      const y = blade[0] + L * t;
      if (i === 0) s.moveTo(x * H, y * H);
      else s.lineTo(x * H, y * H);
    }
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      s.lineTo((inset ? edgeAt(t) + (inset + 0.004) * (1 - sweep(t)) : backAt(t)) * H, (blade[0] + L * t) * H);
    }
    s.closePath();
    return s;
  };
  const body = extrude(shape(), 0.0034 * H, 0.0012 * H);
  body.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(body, steel));
  // the ground edge: a bright band along it, a little proud of the flats
  const band = extrude(shape(0.0005), 0.0046 * H, 0);
  band.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(band, edge));
  // the collar at the blade's root and the round guard
  g.add(placed(new THREE.BoxGeometry(0.0062 * H, 0.0196 * H, 0.011 * H), iron, 0, 0, (blade[0] + 0.004) * H));
  g.add(placed(rod(guard.r * H, guard.r * H, 0.0058 * H, 20), iron, 0, 0, guard.z * H));
  // the grip: a flattened pale core, wound in crossing turns of cord, a collar by the guard, a cap on the butt
  const core0 = new THREE.Mesh(rod(0.0104 * H, 0.0098 * H, (grip[1] - grip[0]) * H, 10), core);
  core0.position.z = ((grip[0] + grip[1]) / 2) * H;
  core0.scale.x = 0.86;
  g.add(core0);
  const turns = 9;
  for (let i = 0; i <= turns; i++) {
    const z = grip[0] + 0.006 + ((grip[1] - grip[0] - 0.012) * i) / turns;
    const turn = new THREE.TorusGeometry(0.0106 * H, 0.0026 * H, 4, 10);
    turn.scale(0.86, 1, 1);
    g.add(placed(turn, cord, 0, 0, z * H, 0, (i % 2 ? 1 : -1) * 0.42, 0));
  }
  g.add(placed(rod(0.0118 * H, 0.0118 * H, 0.008 * H), iron, 0, 0, (grip[1] + 0.002) * H));
  g.add(placed(rod(0.0112 * H, 0.0096 * H, 0.01 * H), iron, 0, 0, (butt + 0.005) * H));
  // down its length, butt to point, and round its blade (H, grip frame)
  const axis = [
    [0, butt],
    [0, grip[0]],
    [0, 0],
    ...Array.from({ length: 11 }, (_, i) => longCentre(i / 10)),
  ];
  const outline = Array.from({ length: 11 }, (_, i) => i / 10).flatMap((t) => [
    [edgeAt(t), blade[0] + L * t],
    [backAt(t), blade[0] + L * t],
  ]);
  Object.assign(g.userData, { longBlade: { ...LONG_BLADE, length: blade[1] - butt }, axis, outline });
  return g;
}

/**
 * The Duelist's scabbard re-cut to the long blade (R60): its own curve and length, slim and dark,
 * an iron mouth and an iron cap on its tip, a cord bound round its mouth, carried empty at the
 * left hip, thrust through the sash and slung back so the tip trails behind and out from the leg.
 * Rigid on the hips. `o.at` (H) and `o.tilt` (rad back from straight down) seat it; `o.out` turns
 * its tip out from the leg (rad). Thrust through the sash it swings there, so its tip never rises
 * over {@link SCABBARD_RISE} in the world: as he falls forward in the death, the hips tipping
 * level stood it straight up out of his back, and a hook (rig.hooks, after each pose) swings it
 * back down toward his legs, a tenth of a radian at a time, until it hangs under that.
 */
export function longScabbard(rig, { sheath, iron, cord }, { at, tilt, out }) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  // the scabbard in the grip frame, its mouth at the origin and its tip down +z
  const g = mount(rig, "hips", [at[0], hy + at[1], at[2]], { rx: Math.PI / 2 + tilt, rz: out, order: "ZXY" });
  const L = LONG_BLADE.blade[1] - LONG_BLADE.blade[0] + 0.02;
  const pts = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return new THREE.Vector3(0, LONG_BLADE.curve * t * t * H, L * t * H);
  });
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0118 * H, 8, false);
  tube.scale(0.62, 1, 1);
  g.add(new THREE.Mesh(tube, sheath));
  g.add(placed(rod(0.0132 * H, 0.0132 * H, 0.016 * H), iron, 0, 0, 0.006 * H));
  const tip = pts[8];
  const cap = new THREE.SphereGeometry(0.0124 * H, 8, 6);
  cap.scale(0.62, 1, 1.4);
  g.add(placed(cap, iron, 0, tip.y, tip.z));
  // the cord bound round its mouth, its tail hanging
  for (const z of [0.03, 0.045]) g.add(placed(new THREE.TorusGeometry(0.0128 * H, 0.0024 * H, 4, 10), cord, 0, 0, z * H));
  g.userData.longScabbard = { length: L };
  const dir = new THREE.Vector3();
  rig.hooks?.push((r) => {
    r.root.updateMatrixWorld(true);
    let t = tilt;
    for (;;) {
      g.rotation.set(Math.PI / 2 + t, 0, out, "ZXY");
      g.updateMatrixWorld(true);
      dir.set(0, 0, 1).transformDirection(g.matrixWorld);
      if (dir.y <= SCABBARD_RISE || t < tilt - 2.5) break;
      t -= 0.1;
    }
  });
  return g;
}

/** How high a scabbard through the sash may point (the world's up component of its line, mouth to tip). */
export const SCABBARD_RISE = 0.15;

// --- the Sellsword's falchion -------------------------------------------------------------------

/**
 * The broad falchion's measures in the grip frame (H, along +z from the fist): the pommel, a grip
 * long enough for two hands, the plain cross, and the blade, its width at the root and at its
 * broadest, toward the point, where the edge sweeps up to the clipped back.
 */
export const FALCHION = { pommel: -0.112, grip: [-0.1, 0.028], cross: { z: 0.037, span: 0.094 }, blade: [0.044, 0.43], root: 0.03, broad: 0.066, at: 0.8, clip: 0.84 };

/**
 * The Sellsword's broad falchion (FS-1J1CB §Change: Looks v2 R61), in the grip frame: a heavy,
 * wide single-edged blade, its back straight and its edge swelling out to its broadest near the
 * point, then sweeping up to meet the back where it is clipped down to the point; a dark fuller
 * under the back and the edge ground bright; a plain straight cross with square ends; a long
 * leather grip bound with three risers, and a wheel pommel, so it looks a two-handed weapon,
 * carried and swung in one hand. `mats`: `steel` the blade, `edge` its ground edge, `iron` the
 * cross, pommel and fuller, `grip`.
 */
export function falchion(rig, { steel, edge, iron, grip }) {
  const H = rig.H;
  const g = new THREE.Group();
  const { pommel, blade, root, broad, at, clip } = FALCHION;
  const L = blade[1] - blade[0];
  const back = root / 2;
  const N = 24;
  // the edge's offset from the back, swelling to the broadest at `at`, then sweeping up to the point
  const widthAt = (t) => (t <= at ? root + (broad - root) * Math.sin(((t / at) * Math.PI) / 2) ** 1.4 : broad * (1 - ((t - at) / (1 - at)) ** 1.8) + 0.006 * ((t - at) / (1 - at)));
  const backAt = (t) => (t <= clip ? back : back - 0.022 * ((t - clip) / (1 - clip)) ** 1.2);
  const edgeAt = (t) => back - widthAt(t);
  const shape = (inset = 0) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = Math.min(edgeAt(t) + inset, backAt(t));
      if (i === 0) s.moveTo(x * H, (blade[0] + L * t) * H);
      else s.lineTo(x * H, (blade[0] + L * t) * H);
    }
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      s.lineTo((inset ? Math.min(edgeAt(t) + inset + 0.009, backAt(t)) : backAt(t)) * H, (blade[0] + L * t) * H);
    }
    s.closePath();
    return s;
  };
  const body = extrude(shape(), 0.0044 * H, 0.0014 * H);
  body.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(body, steel));
  const band = extrude(shape(0.0006), 0.0056 * H, 0);
  band.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(band, edge));
  // the fuller, a dark groove under the back on both flats down most of the blade
  for (const sx of [-1, 1]) g.add(placed(new THREE.BoxGeometry(0.0012 * H, 0.0058 * H, L * 0.62 * H), iron, sx * 0.0026 * H, (back - 0.009) * H, (blade[0] + L * 0.33) * H));
  // the cross: a plain straight bar, square-ended, a little thicker at the ends
  const { z: cz, span } = FALCHION.cross;
  g.add(placed(new THREE.BoxGeometry(0.012 * H, span * H, 0.011 * H), iron, 0, 0, cz * H));
  for (const sy of [-1, 1]) g.add(placed(new THREE.BoxGeometry(0.015 * H, 0.012 * H, 0.014 * H), iron, 0, (sy * span * H) / 2, cz * H));
  // the long leather grip, bound with three risers, and the wheel pommel
  const [g0, g1] = FALCHION.grip;
  g.add(placed(rod(0.0118 * H, 0.0104 * H, (g1 - g0) * H), grip, 0, 0, ((g0 + g1) / 2) * H));
  for (const z of [g0 + 0.02, (g0 + g1) / 2, g1 - 0.018]) g.add(placed(new THREE.TorusGeometry(0.0118 * H, 0.0026 * H, 4, 10), grip, 0, 0, z * H));
  const wheel = new THREE.CylinderGeometry(0.0205 * H, 0.0205 * H, 0.012 * H, 16);
  wheel.rotateZ(Math.PI / 2);
  g.add(placed(wheel, iron, 0, 0, (pommel + 0.008) * H));
  g.add(placed(new THREE.SphereGeometry(0.008 * H, 8, 6), iron, 0, 0, (pommel - 0.006) * H));
  const axis = [
    [0, pommel - 0.012],
    [0, g0],
    [0, 0],
    ...Array.from({ length: 11 }, (_, i) => [back - widthAt(i / 10) / 2, blade[0] + (L * i) / 10]),
  ];
  const outline = Array.from({ length: 11 }, (_, i) => i / 10).flatMap((t) => [
    [edgeAt(t), blade[0] + L * t],
    [backAt(t), blade[0] + L * t],
  ]);
  Object.assign(g.userData, { falchion: { ...FALCHION, length: blade[1] - pommel, width: broad }, axis, outline });
  return g;
}

/**
 * The falchion's scabbard re-cut to it (R61): a wide flat sheath of the blade's own broad shape,
 * its edge stitched in a welt, an iron locket at the mouth and an iron chape over the clipped
 * point, slung by two straps from the sword belt on the left hip, the point trailing behind.
 * Rigid on the hips. `o` seats it as {@link longScabbard}'s does.
 */
export function falchionScabbard(rig, { sheath, iron }, { at, tilt, out }) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const g = mount(rig, "hips", [at[0], hy + at[1], at[2]], { rx: Math.PI / 2 + tilt, rz: out, order: "ZXY" });
  const { blade, root, broad, at: t1 } = FALCHION;
  const L = blade[1] - blade[0] + 0.012;
  const back = root / 2 + 0.004;
  const s = new THREE.Shape();
  s.moveTo(back * H, 0);
  s.lineTo(back * H, L * 0.86 * H);
  s.quadraticCurveTo(back * H, L * H, (back - 0.024) * H, L * H);
  s.quadraticCurveTo((back - broad - 0.006) * H, L * (t1 + 0.12) * H, (back - broad - 0.008) * H, L * t1 * H);
  s.quadraticCurveTo((back - broad * 0.8) * H, L * 0.3 * H, (back - root - 0.008) * H, 0);
  s.closePath();
  const sh = extrude(s, 0.011 * H, 0.002 * H);
  sh.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(sh, sheath));
  g.add(placed(new THREE.BoxGeometry(0.016 * H, (root + 0.02) * H, 0.024 * H), iron, 0, (back - root / 2 - 0.004) * H, 0.008 * H));
  const chape = new THREE.BoxGeometry(0.015 * H, 0.04 * H, 0.03 * H);
  g.add(placed(chape, iron, 0, (back - 0.022) * H, (L - 0.016) * H, 0, 0, 0));
  g.userData.falchionScabbard = { length: L };
  return g;
}

// --- the trims ----------------------------------------------------------------------------------

/** A band `r` (H) thick laid along `points` (H, bind pose) on `bone`: an edge binding or a cord. */
export function binding(rig, bone, points, mat, { r = 0.004 } = {}) {
  const H = rig.H;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p).multiplyScalar(H)));
  return attach(rig, bone, new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), r * H, 5, false), mat, [0, 0, 0]);
}

/** A band round a limb `bone` at `y` (H): a ring `r` (H) out from the bone's line, `w` (H) deep. */
export function cuffBand(rig, bone, y, r, mat, { w = 0.008, flare = 1 } = {}) {
  const [x, , z] = J(rig, bone);
  const H = rig.H;
  const band = rigidTube(
    H,
    [
      { p: [x, y + w / 2, z], r: [r, r] },
      { p: [x, y - w / 2, z], r: [r * flare, r * flare] },
    ],
    { segs: 16, steps: 1, caps: false },
  );
  return attach(rig, bone, band, mat, [0, 0, 0]);
}

/**
 * A wide sword belt round the hips at `y` (H), `rx`, `rz` its radii, `w` its depth: the band, a
 * row of `studs` brass studs round its front and a buckle at its front. A cover over the thighs'
 * roots, as anatomy.js `belt` is.
 */
export function studdedBelt(rig, { mat, stud, y, rx, rz, w = 0.03, studs = 9 }) {
  const H = rig.H;
  const band = new THREE.CylinderGeometry(1, 1, w * H, 28, 1, true);
  band.scale(rx * H, 1, rz * H);
  band.userData.tube = { rows: 2, cols: 29, closed: true, centres: [[0, (w / 2) * H, 0], [0, (-w / 2) * H, 0]] };
  attach(rig, "hips", band, mat, [0, y, 0]).userData.cover = true;
  const ring = Array.from({ length: studs }, (_, i) => -1.35 + (2.7 * i) / (studs - 1))
    .filter((a) => Math.abs(a) > 0.2)
    .map((a) => [Math.sin(a) * (rx + 0.001), y, Math.cos(a) * (rz + 0.001)]);
  studRow(rig, "hips", ring, stud, { r: 0.0048, normal: ([px, , pz]) => [px / rx, 0, pz / rz] });
  buckle(rig, "hips", [0, y, rz + 0.004], stud, { w: w * 1.1 });
}

/**
 * A point on the chest's surface at angle `a` round it (his right 0, front π/2) and height `y`,
 * `pad` (H) out from it: the torso's profile (anatomy.js `torsoProfile`) between its rings.
 */
export function onChest(rig, a, y, pad) {
  const { torsoW: tw, torsoD: td, shoulderW: sw } = rig.p;
  const [, cy] = J(rig, "chest");
  const [, ny] = J(rig, "neck");
  const rings = [
    [cy - 0.005, 0.099 * tw, 0.074 * td, 0.006],
    [cy + 0.06, 0.112 * tw, 0.079 * td, 0.01],
    [ny - 0.022, 0.104 * sw, 0.062 * td, 0],
    [ny + 0.006, 0.046, 0.044, 0],
  ];
  let k = 0;
  while (k < rings.length - 2 && y > rings[k + 1][0]) k++;
  const [y0, x0, z0, c0] = rings[k];
  const [y1, x1, z1, c1] = rings[k + 1];
  const f = THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
  const lerp = (p, q) => p + (q - p) * f;
  // the profile is a superellipse, fuller than an ellipse at the diagonals
  const c = Math.cos(a);
  const s = Math.sin(a);
  const n = 2.6;
  const k2 = (Math.abs(c) ** n + Math.abs(s) ** n) ** (-1 / n);
  return [-c * (lerp(x0, x1) * k2 + pad), y, s * (lerp(z0, z1) * k2 + pad) + lerp(c0, c1)];
}

// --- the gear a look hangs on itself -----------------------------------------------------------

/** A fat leather purse on its drawstring at the right hip, tied in brass (variant B `purse`). */
export function purse(rig, mat, brass) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const g = mount(rig, "hips", [-0.1, hy - 0.03, 0.07], { rz: -0.1 });
  const bag = new THREE.Mesh(ellipsoid(0.03 * H, 0.036 * H, 0.026 * H, 12), mat);
  bag.position.y = -0.03 * H;
  g.add(bag);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009 * H, 0.014 * H, 0.016 * H, 8), mat);
  neck.position.y = 0.006 * H;
  g.add(neck);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.011 * H, 0.0025 * H, 5, 10), brass);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.002 * H;
  g.add(tie);
}

/**
 * A bedroll (R49: the Sellsword's back re-cut; R63: straps and buckles where gear hangs): a wool
 * blanket rolled tight and slung across the back from over the left shoulder blade down to the
 * right of the waist, standing off the back so it reads in a black fill, bound by two buckled
 * straps. Rigid on the chest.
 */
export function bedroll(rig, { roll, strap, brass }) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const pts = [
    [0.125, ny + 0.005, -0.07],
    [0.085, ny - 0.035, -0.132],
    [0.0, cy + 0.02, -0.148],
    [-0.08, cy - 0.055, -0.134],
    [-0.105, cy - 0.095, -0.1],
  ].map((p) => new THREE.Vector3(...p).multiplyScalar(H));
  const curve = new THREE.CatmullRomCurve3(pts);
  attach(rig, "chest", new THREE.TubeGeometry(curve, 24, 0.05 * H, 10, false), roll, [0, 0, 0]);
  for (const end of [0, 1]) {
    const p = curve.getPoint(end).divideScalar(H);
    attach(rig, "chest", new THREE.SphereGeometry(0.05 * H, 10, 6), roll, [p.x, p.y, p.z]);
  }
  for (const t of [0.3, 0.7]) {
    const p = curve.getPoint(t);
    const d = curve.getTangent(t);
    const band = new THREE.TorusGeometry(0.052 * H, 0.0045 * H, 4, 14);
    const m = attach(rig, "chest", band, strap, [p.x / H, p.y / H, p.z / H]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const q = p.clone().add(new THREE.Vector3(0, 0, -0.053 * H)).divideScalar(H);
    buckle(rig, "chest", [q.x, q.y, q.z], brass, { w: 0.016, ry: Math.PI });
  }
}
