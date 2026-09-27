// Weapons and armour, built in local space and mounted on rig bones (FS-2325V §E.3).
//
// A weapon's local frame is the hand's GRIP: the fist closes around local +z (a held stick
// points forward when the arm hangs), so blades, staves and hafts run along +z from the grip and
// pommels sit at -z. Edges face ±y, the swing plane; flats face ±x.
//
// Sizes are in H units like everything else on the rig, so gear scales with its wearer.

import * as THREE from "three";
import { attach, jointAt as J, mount, rigidTube } from "./rig.js";
import { materials, mkCanvas } from "../materials.js";
import { cssRgb, mix, shade } from "../palette.js";


/** Shape (x = width, y = length) → grip frame: y along +z, x along +y, extrusion along +x. */
const GRIP_BASIS = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(1, 0, 0),
);

function extrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A mesh placed at (x, y, z) with an optional rotation. */
function placed(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

const rod = (r0, r1, len, seg = 10) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.rotateX(Math.PI / 2); // along +z: r0 at -z, r1 at +z
  return g;
};

/** Where a hand's grip sits in model space (bind pose). */
export function gripAt(rig, side) {
  const [x, wy] = J(rig, `hand${side}`);
  return [x, wy - 0.036, 0.008];
}

/** A group on the hand bone, in the grip frame. `rx` tilts the weapon in the swing plane. */
export function inHand(rig, side, o = {}) {
  return mount(rig, `hand${side}`, gripAt(rig, side), o);
}

export function longsword(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = 0.4 * H;
  const w = 0.026 * H;
  const blade = new THREE.Shape();
  blade.moveTo(-w / 2, 0);
  blade.lineTo(w / 2, 0);
  blade.lineTo(w * 0.42, L * 0.85);
  blade.lineTo(0, L);
  blade.lineTo(-w * 0.42, L * 0.85);
  blade.closePath();
  const bg = extrude(blade, 0.004 * H, 0.0018 * H);
  bg.applyMatrix4(GRIP_BASIS);
  bg.translate(0, 0, 0.05 * H);
  g.add(new THREE.Mesh(bg, F.steel));
  // fuller: a dark groove down the flat
  const fuller = new THREE.BoxGeometry(0.0072 * H, 0.006 * H, L * 0.62);
  g.add(placed(fuller, F.blackIron, 0, 0, 0.05 * H + L * 0.36));
  const guard = new THREE.BoxGeometry(0.014 * H, 0.105 * H, 0.014 * H);
  g.add(placed(guard, M.brass, 0, 0, 0.045 * H));
  g.add(new THREE.Mesh(rod(0.01 * H, 0.009 * H, 0.085 * H), F.leatherDark));
  const pommel = new THREE.SphereGeometry(0.016 * H, 10, 8);
  g.add(placed(pommel, M.brass, 0, 0, -0.05 * H));
  return g;
}

/** A kite shield painted with the house device, strapped to the forearm. */
export function kiteShield(rig, side, F) {
  const H = rig.H;
  const s = new THREE.Shape();
  const w = 0.105 * H;
  const top = 0.13 * H;
  const bot = -0.23 * H;
  s.moveTo(-w, top * 0.72);
  s.quadraticCurveTo(0, top * 1.12, w, top * 0.72);
  s.quadraticCurveTo(w * 1.02, -0.02 * H, 0, bot);
  s.quadraticCurveTo(-w * 1.02, -0.02 * H, -w, top * 0.72);
  const geo = extrude(s, 0.012 * H, 0.004 * H);
  // bend it: a kite shield is curved across its width
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w;
    pos.setZ(i, pos.getZ(i) - x * x * 0.03 * H);
  }
  geo.computeVertexNormals();

  const face = shieldFace(w, top, bot);
  // shape → forearm frame: long axis along forearm-local +z (up when the forearm is raised
  // forward), width along the forearm, face outward (+x on the left arm)
  const sx = side === "L" ? 1 : -1;
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, sx, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(sx, 0, 0),
  );
  geo.applyMatrix4(basis);
  const mats = [face, F.leatherDark];
  const [x, fy] = J(rig, `foreArm${side}`);
  const [, wy] = J(rig, `hand${side}`);
  return attach(rig, `foreArm${side}`, geo, mats, [x + sx * 0.042, (fy + wy) / 2 - 0.01, -0.03]);
}

function shieldFace(w, top, bot) {
  const S = 256;
  const c = mkCanvas(S, S);
  const ctx = c.getContext("2d");
  const field = mix("oxblood", "barrowDeep", 0.1);
  ctx.fillStyle = cssRgb(field);
  ctx.fillRect(0, 0, S, S);
  // wear on the paint
  for (let i = 0; i < 900; i++) {
    const x = (i * 97) % S;
    const y = (i * 61 + ((i * i) % 37)) % S;
    ctx.fillStyle = cssRgb(shade(field, 0.7 + ((i * 13) % 10) / 20), 0.35);
    ctx.fillRect(x, y, 3, 2);
  }
  // a brass chevron and a vellum tower: the house of the barrow-watch
  ctx.fillStyle = cssRgb(mix("brass", "brassBright", 0.5));
  ctx.beginPath();
  ctx.moveTo(S * 0.12, S * 0.62);
  ctx.lineTo(S * 0.5, S * 0.4);
  ctx.lineTo(S * 0.88, S * 0.62);
  ctx.lineTo(S * 0.88, S * 0.72);
  ctx.lineTo(S * 0.5, S * 0.5);
  ctx.lineTo(S * 0.12, S * 0.72);
  ctx.fill();
  ctx.fillStyle = cssRgb(mix("vellum", "vellumDark", 0.3));
  ctx.fillRect(S * 0.42, S * 0.16, S * 0.16, S * 0.2);
  ctx.fillRect(S * 0.38, S * 0.13, S * 0.06, S * 0.05);
  ctx.fillRect(S * 0.47, S * 0.13, S * 0.06, S * 0.05);
  ctx.fillRect(S * 0.56, S * 0.13, S * 0.06, S * 0.05);
  // rim
  ctx.strokeStyle = cssRgb(mix("brass", "barrowDeep", 0.3));
  ctx.lineWidth = 16;
  ctx.strokeRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // ExtrudeGeometry's face UVs are the shape's own coordinates; map its box onto the canvas
  t.repeat.set(1 / (2 * w), 1 / (top * 1.12 - bot));
  t.offset.set(0.5, -bot / (top * 1.12 - bot));
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.1 });
}

/**
 * A longbow in the left hand, with a live string: `update(nock)` redraws the string to a
 * nock point in the bow's frame (clips pull it to the right hand while drawing).
 */
export function longbow(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = 0.4 * H;
  const brace = 0.075 * H;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, brace, -L),
    new THREE.Vector3(0, brace * 0.1, -L * 0.55),
    new THREE.Vector3(0, -0.012 * H, 0),
    new THREE.Vector3(0, brace * 0.1, L * 0.55),
    new THREE.Vector3(0, brace, L),
  ]);
  const stave = new THREE.TubeGeometry(curve, 40, 0.0085 * H, 7, false);
  // taper the limbs toward the tips
  const pos = stave.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = Math.min(1, Math.abs(v.z) / L);
    const centre = curve.getPoint(Math.min(1, Math.max(0, 0.5 + (v.z / L) * 0.5)));
    const k = 1 - 0.55 * t;
    pos.setXYZ(i, centre.x + (v.x - centre.x) * k, centre.y + (v.y - centre.y) * k, v.z);
  }
  stave.computeVertexNormals();
  g.add(new THREE.Mesh(stave, M.woodDark));
  g.add(new THREE.Mesh(rod(0.012 * H, 0.012 * H, 0.08 * H), F.leatherDark));
  const tips = [new THREE.Vector3(0, brace, -L), new THREE.Vector3(0, brace, L)];
  const stringMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.75, 0.7, 0.58), roughness: 0.9 });
  const strands = tips.map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0022 * H, 0.0022 * H, 1, 4), stringMat);
    g.add(m);
    return m;
  });
  const arrow = new THREE.Group();
  const shaft = rod(0.0035 * H, 0.0035 * H, 0.42 * H, 5);
  shaft.translate(0, 0, 0.21 * H);
  arrow.add(new THREE.Mesh(shaft, M.wood));
  const head = new THREE.ConeGeometry(0.008 * H, 0.03 * H, 5);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, 0.435 * H);
  arrow.add(new THREE.Mesh(head, F.steel));
  for (let i = 0; i < 3; i++) {
    const vane = new THREE.BoxGeometry(0.001 * H, 0.012 * H, 0.05 * H);
    vane.translate(0, 0.007 * H, 0.03 * H);
    vane.rotateZ((i / 3) * Math.PI * 2);
    arrow.add(new THREE.Mesh(vane, F.linen));
  }
  g.add(arrow);

  const rest = new THREE.Vector3(0, brace, 0);
  const grip = new THREE.Vector3(0, -0.012 * H, 0);
  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  /** Draws the string to `nock` (bow-local; null = at rest) and shows the arrow when nocked. */
  function update(nock, showArrow) {
    const n = nock ?? rest;
    strands.forEach((m, i) => {
      tmp.subVectors(n, tips[i]);
      const len = tmp.length();
      m.position.copy(tips[i]).addScaledVector(tmp, 0.5);
      m.scale.set(1, len, 1);
      m.quaternion.setFromUnitVectors(up, tmp.normalize());
    });
    arrow.visible = !!showArrow;
    if (showArrow) {
      arrow.position.copy(n);
      tmp.subVectors(grip, n).normalize();
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmp);
    }
  }
  update(null, false);
  return { group: g, update };
}

/** A quiver of arrows riding the back, its mouth over the right shoulder. */
export function quiver(rig, M, F) {
  const H = rig.H;
  const [, cy] = J(rig, "chest");
  const g = mount(rig, "chest", [-0.03, cy + 0.03, -0.1 * rig.p.torsoD], { rz: 0.5, rx: -0.12 });
  const body = new THREE.CylinderGeometry(0.032 * H, 0.026 * H, 0.26 * H, 12, 1, true);
  g.add(new THREE.Mesh(body, F.leatherDouble));
  g.add(placed(new THREE.TorusGeometry(0.032 * H, 0.005 * H, 5, 14), M.brass, 0, 0.13 * H, 0, Math.PI / 2));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.016 * H;
    const z = Math.sin(a) * 0.016 * H;
    const shaft = new THREE.CylinderGeometry(0.003 * H, 0.003 * H, 0.08 * H, 4);
    g.add(placed(shaft, M.wood, x, 0.16 * H, z));
    const fl = new THREE.BoxGeometry(0.014 * H, 0.05 * H, 0.002 * H);
    g.add(placed(fl, F.linen, x, 0.205 * H, z, 0, a, 0));
  }
  return g;
}

/** A gnarled staff held upright, crowned with claws gripping a glowing orb. */
export function staff(rig, M, F, orbMat) {
  const H = rig.H;
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(Math.sin(t * 9) * 0.006 * H, Math.cos(t * 7) * 0.005 * H, (-0.47 + t * 0.97) * H));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const shaft = new THREE.TubeGeometry(curve, 48, 0.011 * H, 7, false);
  g.add(new THREE.Mesh(shaft, M.woodDark));
  const top = pts[8];
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03 * H, 16, 12), orbMat);
  orb.position.set(top.x, top.y, top.z + 0.035 * H);
  g.add(orb);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const claw = new THREE.ConeGeometry(0.006 * H, 0.075 * H, 5);
    claw.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(claw, M.woodDark);
    m.position.set(top.x + Math.cos(a) * 0.026 * H, top.y + Math.sin(a) * 0.026 * H, top.z + 0.03 * H);
    m.rotation.set(-Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0);
    g.add(m);
  }
  g.add(placed(rod(0.014 * H, 0.014 * H, 0.05 * H), F.leatherDark));
  g.userData.orb = orb;
  return g;
}

export function cleaver(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rod(0.011 * H, 0.012 * H, 0.14 * H), M.woodDark));
  const s = new THREE.Shape();
  s.moveTo(-0.01 * H, 0);
  s.lineTo(0.07 * H, 0.01 * H);
  s.lineTo(0.08 * H, 0.17 * H);
  s.lineTo(-0.015 * H, 0.2 * H);
  s.closePath();
  const blade = extrude(s, 0.006 * H, 0.0015 * H);
  blade.applyMatrix4(GRIP_BASIS);
  blade.translate(0, -0.005 * H, 0.06 * H);
  g.add(new THREE.Mesh(blade, F.rustIron));
  return g;
}

export function spikedClub(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = 0.42 * H;
  const club = new THREE.CylinderGeometry(0.052 * H, 0.018 * H, L, 12);
  club.rotateX(Math.PI / 2);
  club.translate(0, 0, L * 0.4);
  // knots and swellings
  const pos = club.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const bump = 1 + 0.18 * Math.sin(v.z * 40 / H + Math.atan2(v.y, v.x) * 3);
    pos.setXYZ(i, v.x * bump, v.y * bump, v.z);
  }
  club.computeVertexNormals();
  g.add(new THREE.Mesh(club, M.woodDark));
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const z = (0.3 + (i % 3) * 0.12 + i * 0.012) * L;
    const r = (0.025 + ((z / L) * 0.03)) * H;
    const spike = new THREE.ConeGeometry(0.008 * H, 0.045 * H, 5);
    const m = new THREE.Mesh(spike, F.rustIron);
    m.position.set(Math.cos(a) * r, Math.sin(a) * r, z);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), Math.sin(a), 0.2).normalize());
    g.add(m);
  }
  return g;
}

// --- armour --------------------------------------------------------------------------------

/** A flat-topped great helm with an eye slit, a brass cross and an oxblood crest. */
export function greatHelm(rig, F, M, crestMat) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const shell = rigidTube(
    H,
    [
      { p: [0, hy - 0.012, hz - 0.002], r: [r * 1.08, r * 1.14] },
      { p: [0, hy + 0.05, hz], r: [r * 1.12, r * 1.18] },
      { p: [0, hy + 0.1, hz - 0.002], r: [r * 1.06, r * 1.12] },
      { p: [0, hy + 0.125, hz - 0.004], r: [r * 0.78, r * 0.84] },
    ],
    { segs: 22, steps: 3 },
  );
  attach(rig, "head", shell, F.steel, [0, 0, 0]);
  attach(rig, "head", new THREE.BoxGeometry(r * 1.7 * H, 0.011 * H, 0.03 * H), F.blackIron, [0, hy + 0.066, hz + r * 1.1]);
  attach(rig, "head", new THREE.BoxGeometry(0.012 * H, 0.085 * H, 0.012 * H), M.brass, [0, hy + 0.035, hz + r * 1.18]);
  attach(rig, "head", new THREE.BoxGeometry(r * 1.9 * H, 0.01 * H, 0.012 * H), M.brass, [0, hy + 0.084, hz + r * 1.12]);
  const crest = new THREE.SphereGeometry(1, 14, 10);
  crest.scale(0.012 * H, 0.04 * H, 0.085 * H);
  attach(rig, "head", crest, crestMat, [0, hy + 0.15, hz - 0.01]);
}

/** Steel pauldrons: two lames on each shoulder, riding the upper arm. */
export function pauldrons(rig, F) {
  const H = rig.H;
  for (const [s, sx] of [
    ["L", 1],
    ["R", -1],
  ]) {
    const [x, uy] = J(rig, `upperArm${s}`);
    for (let k = 0; k < 2; k++) {
      const cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
      cap.scale(0.06 * H * (1 - k * 0.12), 0.04 * H, 0.062 * H * (1 - k * 0.1));
      attach(rig, `upperArm${s}`, cap, F.steelDouble, [x + sx * (0.006 + k * 0.012), uy + 0.022 - k * 0.028, 0], { rz: -sx * (0.35 + k * 0.25) });
    }
  }
}

/** Rigid plate or leather tubes over a limb segment (vambraces, bracers, greaves). */
export function limbGuard(rig, bone, from, to, r, mat, o = {}) {
  const H = rig.H;
  const [x] = J(rig, bone);
  const geo = rigidTube(
    H,
    [
      { p: [x, from, o.z ?? 0], r: [r[0], r[1]] },
      { p: [x, (from + to) / 2, o.z ?? 0], r: [r[0] * 1.04, r[1] * 1.06] },
      { p: [x, to, o.z ?? 0], r: [r[0] * (o.taper ?? 1.12), r[1] * (o.taper ?? 1.12)] },
    ],
    { segs: 14, steps: 2, caps: false },
  );
  return attach(rig, bone, geo, mat, [0, 0, 0]);
}

/** A knee cop on the front of each knee, riding the shin. */
export function poleyns(rig, F) {
  const H = rig.H;
  for (const s of ["L", "R"]) {
    const [x, ky] = J(rig, `shin${s}`);
    const cap = new THREE.SphereGeometry(0.03 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    cap.rotateX(Math.PI / 2);
    attach(rig, `shin${s}`, cap, F.steel, [x, ky - 0.004, 0.035]);
  }
}

/** A tall wizard's hat: a drooping brim, a crooked cone and a brass band. */
export function wizardHat(rig, mat, bandMat) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const brimPts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = (0.052 + t * 0.11) * H;
    brimPts.push(new THREE.Vector2(r, (-t * t * 0.022 + 0.004) * H));
  }
  for (let i = 8; i >= 0; i--) {
    const t = i / 8;
    const r = (0.052 + t * 0.11) * H;
    brimPts.push(new THREE.Vector2(r, (-t * t * 0.022 - 0.004) * H));
  }
  const brim = new THREE.LatheGeometry(brimPts, 32);
  attach(rig, "head", brim, mat, [0, hy + 0.078, hz - 0.004], { rx: -0.08 });
  const cone = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.068 * H, 0),
      new THREE.Vector2(0.06 * H, 0.05 * H),
      new THREE.Vector2(0.042 * H, 0.11 * H),
      new THREE.Vector2(0.024 * H, 0.17 * H),
      new THREE.Vector2(0.0, 0.2 * H),
    ],
    24,
  );
  attach(rig, "head", cone, mat, [0, hy + 0.074, hz - 0.012], { rx: -0.22 });
  const tip = new THREE.ConeGeometry(0.02 * H, 0.08 * H, 12);
  attach(rig, "head", tip, mat, [0, hy + 0.265, hz - 0.075], { rx: -1.05 });
  const band = new THREE.CylinderGeometry(0.067 * H, 0.069 * H, 0.016 * H, 24, 1, true);
  attach(rig, "head", band, bandMat, [0, hy + 0.086, hz - 0.013], { rx: -0.22 });
}

// --- hub folk (FS-2325V §G) ----------------------------------------------------------------

/**
 * A warden's lantern-pole, held upright: a tall ash shaft ending in an iron crook, the lantern
 * hanging from its tip ahead of the bearer. The glass glows amber: the warden is someone to
 * talk to (the interactable channel).
 */
export function lanternPole(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const top = 0.44 * H;
  g.add(placed(rod(0.011 * H, 0.009 * H, top + 0.5 * H, 8), M.woodDark, 0, 0, (top - 0.5 * H) / 2));
  // grip wrap
  g.add(new THREE.Mesh(rod(0.013 * H, 0.013 * H, 0.06 * H, 8), F.leatherDark));
  // the crook: iron, curling forward (grip -y is ahead of the bearer when the pole stands)
  const crook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, top - 0.02 * H),
    new THREE.Vector3(0, -0.02 * H, top + 0.06 * H),
    new THREE.Vector3(0, -0.09 * H, top + 0.09 * H),
    new THREE.Vector3(0, -0.15 * H, top + 0.06 * H),
    new THREE.Vector3(0, -0.16 * H, top + 0.02 * H),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(crook, 20, 0.0065 * H, 6, false), F.blackIron));
  // the lantern: a pyramid cap, four iron posts around lit glass, a base plate
  const lx = 0;
  const ly = -0.16 * H;
  const lz = top - 0.06 * H;
  const s = 0.034 * H;
  const h = 0.07 * H;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(s * 1.5, s * 1.5, h * 0.8), M.glass);
  glass.position.set(lx, ly, lz);
  glass.userData.noShadow = true;
  g.add(glass);
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    g.add(placed(new THREE.BoxGeometry(0.004 * H, 0.004 * H, h), F.blackIron, lx + sx * s * 0.8, ly + sy * s * 0.8, lz));
  const capGeo = new THREE.ConeGeometry(s * 1.35, 0.03 * H, 4);
  capGeo.rotateX(Math.PI / 2);
  capGeo.rotateZ(Math.PI / 4);
  g.add(placed(capGeo, F.blackIron, lx, ly, lz + h / 2 + 0.014 * H));
  g.add(placed(new THREE.BoxGeometry(s * 1.8, s * 1.8, 0.006 * H), F.blackIron, lx, ly, lz - h / 2));
  return g;
}

/**
 * A thick ledger bound in dark leather with brass corners, carried upright against the body.
 * Built in the bind pose's frame of the forearm that carries it: thickness across the arm (x),
 * width along it (y), height out of its front (z), which the raised forearm turns upward.
 */
export function ledger(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const t = 0.032 * H;
  const w = 0.09 * H;
  const l = 0.12 * H;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(t, w, l), F.leatherDark));
  // the page block, showing on the three edges away from the spine
  g.add(placed(new THREE.BoxGeometry(t * 0.72, w * 0.95, l * 0.94), materials().vellum, 0, 0.004 * H, 0));
  for (const sy of [-1, 1])
    for (const sz of [-1, 1])
      g.add(placed(new THREE.BoxGeometry(t * 1.08, 0.013 * H, 0.013 * H), M.brass, 0, sy * (w / 2 - 0.004 * H), sz * (l / 2 - 0.004 * H)));
  return g;
}

/** A ring of iron keys hanging at the hip. */
export function keyRing(rig, F, side = "L") {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const sx = side === "L" ? 1 : -1;
  const g = mount(rig, "hips", [sx * 0.1 * rig.p.hipW, hy - 0.03, 0.02]);
  g.add(placed(new THREE.TorusGeometry(0.014 * H, 0.0025 * H, 5, 12), F.blackIron, 0, 0, 0, 0, Math.PI / 2, 0));
  for (let i = 0; i < 3; i++) {
    const a = -0.5 + i * 0.5;
    const key = placed(new THREE.BoxGeometry(0.004 * H, 0.04 * H, 0.008 * H), F.blackIron, 0, -0.024 * H, 0, 0, 0, a);
    key.position.x = Math.sin(a) * 0.012 * H;
    g.add(key);
  }
  return g;
}
