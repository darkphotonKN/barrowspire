// Weapons and armour, built in local space and mounted on rig bones (FS-2325V §E.3).
//
// A weapon's local frame is the hand's GRIP: the fist closes around local +z (a held stick
// points forward when the arm hangs), so blades, staves and hafts run along +z from the grip and
// pommels sit at -z. Edges face ±y, the swing plane; flats face ±x.
//
// Sizes are in H units like everything else on the rig, so gear scales with its wearer.

import * as THREE from "three";
import { attach, gripAt, jointAt as J, mount, rigidTube } from "./rig.js";
import { glow, materials, mkCanvas } from "../materials.js";
import { cssRgb, mix, shade } from "../palette.js";

// the grip point lives with the rig (rig.js), where the draw solver (draw.js) reads it too
export { gripAt };


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

/**
 * How far the bearded axe's cutting edge is turned from square to the haft, toward the haft's far
 * end (rad): the beard sweeps down and out, so the edge faces partly along the haft. Carried head
 * down, the haft hanging forward of the fist as a blade's point does, the edge then faces forward
 * and a little down; square to the haft (the variant's axe) it faced up and forward.
 */
export const AXE_EDGE_TURN = 0.55;

/**
 * A one-handed bearded axe (the Berserker's, FS-1J1CB R2), built in the grip frame like any held
 * weapon (the normal grip: the haft runs out of the thumb side of the fist along +z): an ash haft
 * with a leather grip under the fist, and at its far end the head, its poll on -y and its bit on
 * +y, the side the thumb points to, which leads a cut swung toward it. The bit's long beard sweeps
 * down and out toward the fist, so the edge faces {@link AXE_EDGE_TURN} toward the haft's end from
 * square to it. `userData.edge` is that edge in the group's frame: `at`, the middle of the edge,
 * and `dir`, the way it faces (the bake test, axe.test.mjs, holds it forward and down in the carry
 * and leading the swing).
 */
export function beardedAxe(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const len = 0.36 * H;
  const haft = new THREE.CylinderGeometry(0.009 * H, 0.011 * H, len, 10);
  haft.rotateX(Math.PI / 2);
  haft.translate(0, 0, len / 2 - 0.05 * H);
  g.add(new THREE.Mesh(haft, M.woodDark));
  g.add(new THREE.Mesh(rod(0.012 * H, 0.012 * H, 0.08 * H), F.leatherDark));
  // the head, in shape coordinates (x toward the bit, the grip frame's +y; y along the haft, its
  // +z), its top at the haft's end: the edge runs from the beard's tip up and in to the toe
  const z0 = len - 0.05 * H;
  const a = AXE_EDGE_TURN;
  const n = [Math.cos(a), Math.sin(a)];
  const beard = [0.118 * H, z0 - 0.092 * H];
  const reach = 0.125 * H;
  const toe = [beard[0] - n[1] * reach, beard[1] + n[0] * reach];
  const mid = [(beard[0] + toe[0]) / 2, (beard[1] + toe[1]) / 2];
  const belly = (d) => [mid[0] + n[0] * d, mid[1] + n[1] * d];
  const s = new THREE.Shape();
  s.moveTo(-0.022 * H, z0 - 0.032 * H);
  s.lineTo(0, z0 - 0.03 * H);
  s.lineTo(0.014 * H, z0 - 0.036 * H);
  // the beard's hooked underside, down and out from the haft to its tip
  s.quadraticCurveTo(0.075 * H, z0 - 0.05 * H, beard[0], beard[1]);
  // the edge, a little bellied
  s.quadraticCurveTo(...belly(0.012 * H), toe[0], toe[1]);
  s.quadraticCurveTo(0.03 * H, z0 + 0.004 * H, 0.012 * H, z0 + 0.008 * H);
  s.lineTo(0, z0 + 0.01 * H);
  s.lineTo(-0.022 * H, z0 + 0.006 * H);
  s.closePath();
  const head = extrude(s, 0.008 * H, 0.002 * H);
  head.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(head, F.darkSteel));
  // the bright ground edge: a strip along it, a little proud of the head's faces
  const inset = 0.009 * H;
  const e = new THREE.Shape();
  e.moveTo(beard[0], beard[1]);
  e.quadraticCurveTo(...belly(0.012 * H), toe[0], toe[1]);
  e.lineTo(toe[0] - n[0] * inset, toe[1] - n[1] * inset);
  e.quadraticCurveTo(...belly(0.012 * H - inset), beard[0] - n[0] * inset, beard[1] - n[1] * inset);
  e.closePath();
  const edge = extrude(e, 0.0092 * H, 0);
  edge.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(edge, F.steel));
  const at = belly(0.006 * H);
  g.userData.edge = { at: new THREE.Vector3(0, at[0], at[1]), dir: new THREE.Vector3(0, n[0], n[1]) };
  return g;
}

/**
 * A tall kite shield strapped to the forearm, curved across its width, painted in the house
 * colours: per pale, bone and oxblood, an iron boss at the heart. `scale` sizes it in height and
 * width about the strap (the Guardian's, FS-1J1CB R1: about 1.15); `cross` lays the house cross
 * over the field counterchanged, oxblood on the bone half and bone on the oxblood, inside a narrow
 * brass border. With neither it is the knight's own shield.
 */
export function kiteShield(rig, side, F, { scale = 1, cross = false } = {}) {
  const H = rig.H;
  const s = new THREE.Shape();
  const w = 0.115 * H * scale;
  const top = 0.145 * H * scale;
  const bot = -0.27 * H * scale;
  s.moveTo(-w, top * 0.72);
  s.quadraticCurveTo(0, top * 1.12, w, top * 0.72);
  s.quadraticCurveTo(w * 1.02, -0.02 * H, 0, bot);
  s.quadraticCurveTo(-w * 1.02, -0.02 * H, -w, top * 0.72);
  const geo = extrude(s, 0.012 * H, 0.004 * H);
  // bend it: a kite shield is curved across its width
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w;
    pos.setZ(i, pos.getZ(i) - x * x * 0.026 * H * scale);
  }
  geo.computeVertexNormals();

  // the outline's highest point, where the face's paint ends
  const face = shieldFace(w, top * 0.92, bot, cross ? { w, top, bot, H } : null);
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

/**
 * The shield's painted face, the shape's box laid over the canvas. `cross` (the shape's own
 * measures, H units) adds the counterchanged house cross and a brass border inside the rim, laid
 * along the outline.
 */
function shieldFace(w, top, bot, cross = null) {
  const S = 256;
  const c = mkCanvas(S, S);
  const ctx = c.getContext("2d");
  const boneTone = shade(mix("vellum", "vellumDark", 0.5), 0.82);
  const redTone = mix("oxblood", "barrowDeep", 0.12);
  // per pale: bone to the left, oxblood to the right
  ctx.fillStyle = cssRgb(boneTone);
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = cssRgb(redTone);
  ctx.fillRect(S * 0.5, 0, S * 0.5, S);
  if (cross) {
    // the cross, its arms through the boss: each half in the other half's colour
    const bar = S * 0.1;
    const armY = S * 0.46;
    for (const [x0, tone] of [
      [0, redTone],
      [S * 0.5, boneTone],
    ]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, S * 0.5, S);
      ctx.clip();
      ctx.fillStyle = cssRgb(tone);
      ctx.fillRect(S * 0.5 - bar / 2, 0, bar, S);
      ctx.fillRect(0, armY - bar / 2, S, bar);
      ctx.restore();
    }
  }
  // the iron boss
  ctx.fillStyle = cssRgb(mix("slate", "pitch", 0.4));
  ctx.beginPath();
  ctx.arc(S * 0.5, S * 0.46, S * 0.08, 0, Math.PI * 2);
  ctx.fill();
  // wear on the paint
  const grime = mix("barrowDeep", "pitch", 0.4);
  for (let i = 0; i < 1100; i++) {
    const x = (i * 97) % S;
    const y = (i * 61 + ((i * i) % 37)) % S;
    ctx.fillStyle = cssRgb(grime, 0.12 + ((i * 7) % 10) / 60);
    ctx.fillRect(x, y, 3 + (i % 3), 2);
  }
  // rim
  ctx.strokeStyle = cssRgb(mix("barrowDeep", "pitch", 0.3));
  ctx.lineWidth = 18;
  ctx.strokeRect(0, 0, S, S);
  if (cross) {
    // the outline on the canvas (kiteShield's shape, the box mapped onto it), drawn in toward the
    // middle: the dark rim along the edge, the brass border just inside it
    const { w: sw, top: st, bot: sb, H } = cross;
    const px = (x, y, k) => [((x * k) / (2 * sw) + 0.5) * S, ((top - (y * k + (1 - k) * (st * 0.72 + sb) / 2)) / (top - bot)) * S];
    const outline = (k) => {
      ctx.beginPath();
      ctx.moveTo(...px(-sw, st * 0.72, k));
      ctx.quadraticCurveTo(...px(0, st * 1.12, k), ...px(sw, st * 0.72, k));
      ctx.quadraticCurveTo(...px(sw * 1.02, -0.02 * H, k), ...px(0, sb, k));
      ctx.quadraticCurveTo(...px(-sw * 1.02, -0.02 * H, k), ...px(-sw, st * 0.72, k));
      ctx.closePath();
    };
    ctx.strokeStyle = cssRgb(mix("barrowDeep", "pitch", 0.3));
    ctx.lineWidth = 14;
    outline(1);
    ctx.stroke();
    ctx.strokeStyle = cssRgb(mix("brass", "brassBright", 0.4));
    ctx.lineWidth = 7;
    outline(0.9);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // ExtrudeGeometry's face UVs are the shape's own coordinates; map its box onto the canvas
  t.repeat.set(1 / (2 * w), 1 / (top - bot));
  t.offset.set(0.5, -bot / (top - bot));
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, metalness: 0.1 });
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

/**
 * A quiver of arrows riding the back, its mouth over the right shoulder, placed by `o`
 * (classStyles.js ARCHER_QUIVER: `tilt` degrees off the spine, `at`, `rx`).
 */
export function quiver(rig, M, F, o) {
  const H = rig.H;
  const [, cy] = J(rig, "chest");
  const g = mount(rig, "chest", [o.at[0], cy + o.at[1], o.at[2] * rig.p.torsoD], { rz: (o.tilt * Math.PI) / 180, rx: o.rx });
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

/**
 * A conical nasal helm, worn over a mail coif (anatomy.js coif): a dark steel cone rising to a
 * point, an iron band about the brow and an iron nasal down over the nose, the face left bare.
 */
export function nasalHelm(rig, F) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const cone = rigidTube(
    H,
    [
      { p: [0, hy + 0.058, hz - 0.004], r: [r * 1.15, r * 1.2] },
      { p: [0, hy + 0.095, hz - 0.006], r: [r * 1.02, r * 1.07] },
      { p: [0, hy + 0.138, hz - 0.004], r: [r * 0.55, r * 0.58] },
      { p: [0, hy + 0.176, hz + 0.002], r: [r * 0.07, r * 0.07] },
    ],
    { segs: 20, steps: 3 },
  );
  attach(rig, "head", cone, F.darkSteel, [0, 0, 0]);
  const band = rigidTube(
    H,
    [
      { p: [0, hy + 0.054, hz - 0.004], r: [r * 1.19, r * 1.24] },
      { p: [0, hy + 0.068, hz - 0.004], r: [r * 1.17, r * 1.22] },
    ],
    { segs: 20, steps: 1 },
  );
  attach(rig, "head", band, F.blackIron, [0, 0, 0]);
  attach(rig, "head", new THREE.BoxGeometry(0.014 * H, 0.062 * H, 0.008 * H), F.blackIron, [0, hy + 0.032, hz + r * 1.22]);
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

// --- the Mage -----------------------------------------------------------------------------

/** A short iron sceptre, a ball pommel under the fist and the stone held in three prongs at its head. */
export function sceptre(rig, M, F, orbMat) {
  const H = rig.H;
  const g = new THREE.Group();
  g.add(placed(rod(0.009 * H, 0.008 * H, 0.3 * H, 8), F.blackIron, 0, 0, 0.09 * H));
  g.add(placed(new THREE.SphereGeometry(0.014 * H, 10, 8), F.blackIron, 0, 0, -0.06 * H));
  g.add(placed(rod(0.012 * H, 0.012 * H, 0.06 * H), F.leatherDark));
  const top = 0.24 * H;
  g.add(placed(rod(0.016 * H, 0.009 * H, 0.02 * H, 8), F.blackIron, 0, 0, top));
  g.add(placed(new THREE.SphereGeometry(0.022 * H, 14, 10), orbMat, 0, 0, top + 0.03 * H));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const prong = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, top),
      new THREE.Vector3(Math.cos(a) * 0.024 * H, Math.sin(a) * 0.024 * H, top + 0.022 * H),
      new THREE.Vector3(Math.cos(a) * 0.016 * H, Math.sin(a) * 0.016 * H, top + 0.05 * H),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(prong, 8, 0.004 * H, 5, false), F.blackIron));
  }
  return g;
}

/**
 * A mage specialization's focus haft (FS-1J1CB R3, R4): about 1.5x the sceptre's length and short
 * of a staff. The head sits where the sceptre's does, `FOCUS_TOP` up from the fist, so it clears
 * her head in every clip as the sceptre's does, and the haft runs on down past the fist to an iron
 * knob at `FOCUS_BUTT`: the fist holds it higher up than the sceptre. In the grip frame (H).
 */
export const FOCUS_BUTT = -0.2;
export const FOCUS_TOP = 0.2;

function focusHaft(rig, F) {
  const H = rig.H;
  const g = new THREE.Group();
  g.add(placed(rod(0.0105 * H, 0.009 * H, (FOCUS_TOP - FOCUS_BUTT) * H, 8), F.blackIron, 0, 0, ((FOCUS_TOP + FOCUS_BUTT) / 2) * H));
  g.add(placed(new THREE.SphereGeometry(0.015 * H, 10, 8), F.blackIron, 0, 0, FOCUS_BUTT * H));
  g.add(placed(rod(0.013 * H, 0.013 * H, 0.07 * H), F.leatherDark));
  // an iron band each side of the wrap
  for (const z of [-0.045, 0.045]) g.add(placed(rod(0.0135 * H, 0.0135 * H, 0.01 * H, 8), F.blackIron, 0, 0, z * H));
  // the collar the head sits in, widening up
  g.add(placed(rod(0.009 * H, 0.016 * H, 0.022 * H, 8), F.blackIron, 0, 0, (FOCUS_TOP + 0.011) * H));
  return g;
}

/**
 * The Spellwarden's ward focus (FS-1J1CB R3): the focus haft (`focusHaft`) crowned with an open
 * iron ring standing in the swing plane, a pale stone held at its heart on two short bars, lit
 * `stoneMat` (necrotic toward vellum, low; it glows with the clip as the sceptre's orb does).
 */
export function wardFocus(rig, M, F, stoneMat) {
  const H = rig.H;
  const g = focusHaft(rig, F);
  const R = 0.04;
  const zc = FOCUS_TOP + 0.02 + R;
  const ring = new THREE.TorusGeometry(R * H, 0.0055 * H, 8, 36);
  ring.rotateY(Math.PI / 2);
  g.add(placed(ring, F.blackIron, 0, 0, zc * H));
  g.add(placed(new THREE.SphereGeometry(0.021 * H, 14, 10), stoneMat, 0, 0, zc * H));
  for (const sy of [-1, 1]) g.add(placed(new THREE.BoxGeometry(0.006 * H, (R - 0.02) * H, 0.006 * H), F.blackIron, 0, sy * (R / 2 + 0.01) * H, zc * H));
  // the ring's foot in the collar
  g.add(placed(rod(0.006 * H, 0.006 * H, 0.02 * H, 6), F.blackIron, 0, 0, (FOCUS_TOP + 0.015) * H));
  return g;
}

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
 * The Pyromancer's fire focus (FS-1J1CB R4): the focus haft (`focusHaft`) crowned with an open
 * iron cage of four bars and a rim, a coal at its foot and a tongue of flame in it, the flame kept
 * upright in the world whatever the hand's tilt (a rig hook turns it each pose). The flame's body
 * is `flameMat`, which glows with the clip as the sceptre's orb does; its core and the coal are
 * the fire ramp (the guideline: fire baked into one body).
 */
export function fireFocus(rig, M, F, flameMat) {
  const H = rig.H;
  const g = focusHaft(rig, F);
  const foot = FOCUS_TOP + 0.02;
  const top = foot + 0.07;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const at = (r, z) => new THREE.Vector3(Math.cos(a) * r * H, Math.sin(a) * r * H, z * H);
    const bar = new THREE.CatmullRomCurve3([at(0.012, foot - 0.006), at(0.033, foot + 0.028), at(0.024, top)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(bar, 10, 0.0042 * H, 5, false), F.blackIron));
  }
  g.add(placed(new THREE.TorusGeometry(0.024 * H, 0.0042 * H, 6, 24), F.blackIron, 0, 0, top * H));
  g.add(placed(new THREE.SphereGeometry(0.016 * H, 10, 8), glow("fireDeep", 2.4), 0, 0, (foot + 0.008) * H));
  const flame = new THREE.Group();
  flame.position.set(0, 0, (foot + 0.02) * H);
  flame.add(new THREE.Mesh(flameGeometry(0.12 * H, 0.03 * H), flameMat));
  const core = new THREE.Mesh(flameGeometry(0.07 * H, 0.016 * H), glow("fireCore", 2.2));
  core.position.y = 0.004 * H;
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
  return g;
}

/**
 * A closed tome bound in black leather with iron corners, carried by its spine and hanging at the
 * side. Mount it in the off hand turned a quarter back (`inHand(rig, "L", { rx: -Math.PI / 2 })`).
 */
export function tome(rig, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const book = new THREE.Group();
  book.position.set(0, -0.02 * H, -0.03 * H);
  book.add(new THREE.Mesh(new THREE.BoxGeometry(0.036 * H, 0.1 * H, 0.078 * H), F.leatherDark));
  book.add(placed(new THREE.BoxGeometry(0.028 * H, 0.094 * H, 0.076 * H), materials().vellum, 0, 0, 0.004 * H));
  for (const sy of [-1, 1])
    for (const sz of [-1, 1]) book.add(placed(new THREE.BoxGeometry(0.04 * H, 0.014 * H, 0.014 * H), F.blackIron, 0, sy * 0.044 * H, sz * 0.034 * H));
  g.add(book);
  return g;
}

// --- the Mercenary (FS-MAMHR §H) -----------------------------------------------------------

/**
 * A curved, single-edged dueling sword held in one fist (the Aldori blade): long and slender,
 * longer than an arming sword but nowhere near a greatsword. The edge runs along the grip frame's
 * -y, the convex side; the back sweeps toward +y and drops to a clipped point near the tip. A
 * short cross, its back quillon a knob and its front one swept down into a knuckle-bow.
 */
export function curvedSword(rig, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = 0.46 * H;
  const w = 0.019 * H;
  const k = 0.055 * H; // the tip's offset from straight
  const clip = 0.8;
  const grip = 0.08 * H;
  const N = 24;
  const centre = (t) => k * t ** 1.6;
  const half = (t) => (w / 2) * (1 - 0.3 * t);
  const blade = new THREE.Shape();
  // the edge, hilt to tip
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = centre(t) - half(t) * (t > 0.92 ? 1 - (t - 0.92) / 0.08 : 1);
    if (i === 0) blade.moveTo(x, 0);
    else blade.lineTo(x, t * L);
  }
  // the back, tip to hilt: from the clip it falls straight to the point
  for (let i = N - 1; i >= 0; i--) {
    const t = i / N;
    const fall = t > clip ? (t - clip) / (1 - clip) : 0;
    blade.lineTo(centre(t) + half(t) * (1 - 1.6 * fall ** 1.4), t * L);
  }
  blade.closePath();
  const bg = extrude(blade, 0.0034 * H, 0.0014 * H);
  bg.applyMatrix4(GRIP_BASIS);
  bg.translate(0, 0, 0.045 * H);
  g.add(new THREE.Mesh(bg, F.steel));
  // a narrow fuller near the back, following the curve
  const fpts = [];
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * 0.68 + 0.02;
    fpts.push(new THREE.Vector3(0, centre(t) + half(t) * 0.3, 0.045 * H + t * L));
  }
  const fuller = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fpts), 16, 0.0026 * H, 4, false);
  fuller.scale(1.5, 1, 1);
  g.add(new THREE.Mesh(fuller, F.blackIron));

  // the cross, short and flat across the blade, and the grip
  const span = 0.056 * H;
  g.add(placed(new THREE.BoxGeometry(0.011 * H, span, 0.011 * H), F.blackIron, 0, 0, 0.04 * H));
  g.add(new THREE.Mesh(rod(0.0095 * H, 0.0088 * H, grip), F.leatherDark));
  // the back quillon curls toward the blade, the front one sweeps down into a knuckle-bow
  const pz = -grip / 2 - 0.006 * H;
  g.add(placed(new THREE.SphereGeometry(0.008 * H, 8, 6), F.blackIron, 0, span / 2, 0.05 * H));
  const bow = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -span / 2, 0.04 * H),
    new THREE.Vector3(0, -0.04 * H, 0.012 * H),
    new THREE.Vector3(0, -0.036 * H, -0.024 * H),
    new THREE.Vector3(0, -0.014 * H, pz),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(bow, 16, 0.0042 * H, 5, false), F.blackIron));
  g.add(placed(new THREE.SphereGeometry(0.012 * H, 10, 8), F.blackIron, 0, -0.004 * H, pz));
  return g;
}

/**
 * One shoulder's defence: `lames` overlapping caps riding the upper arm, from the top down.
 * `size` scales them; `mat` should be double-sided.
 */
export function spaulder(rig, side, mat, { lames = 3, size = 1 } = {}) {
  const H = rig.H;
  const sx = side === "L" ? 1 : -1;
  const [x, uy] = J(rig, `upperArm${side}`);
  for (let k = 0; k < lames; k++) {
    const cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    cap.scale(0.064 * H * size * (1 - k * 0.1), 0.042 * H * size, 0.066 * H * size * (1 - k * 0.09));
    attach(rig, `upperArm${side}`, cap, mat, [x + sx * (0.008 + k * 0.012) * size, uy + 0.026 - k * 0.026 * size, 0], {
      rz: -sx * (0.32 + k * 0.24),
    });
  }
}

/** A knee cop on one knee, riding the shin. */
export function kneeCop(rig, side, mat) {
  const H = rig.H;
  const [x, ky] = J(rig, `shin${side}`);
  const cap = new THREE.SphereGeometry(0.031 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  cap.rotateX(Math.PI / 2);
  attach(rig, `shin${side}`, cap, mat, [x, ky - 0.004, 0.035]);
  // the wing on the outside of the knee
  const wing = new THREE.SphereGeometry(0.022 * H, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  wing.rotateZ((side === "L" ? -1 : 1) * Math.PI / 2);
  attach(rig, `shin${side}`, wing, mat, [x + (side === "L" ? 0.03 : -0.03), ky - 0.004, 0.018]);
}

/**
 * A leather scabbard hung from the belt on one hip, slung back so the tip trails behind the
 * leg, with an iron locket at the mouth and a chape at the tip.
 */
export function scabbard(rig, side, F) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const sx = side === "L" ? 1 : -1;
  const g = mount(rig, "hips", [sx * 0.118 * rig.p.hipW, hy + 0.005, 0.03], { rx: 0.36, rz: sx * 0.12 });
  const L = 0.3 * H;
  const sheath = new THREE.CylinderGeometry(0.011 * H, 0.015 * H, L, 8);
  sheath.scale(0.7, 1, 1.25);
  g.add(placed(sheath, F.leatherDark, 0, -L / 2 - 0.02 * H, 0));
  g.add(placed(new THREE.BoxGeometry(0.018 * H, 0.03 * H, 0.03 * H), F.blackIron, 0, -0.03 * H, 0));
  const chape = new THREE.ConeGeometry(0.0125 * H, 0.04 * H, 8);
  chape.scale(0.75, 1, 1.2);
  chape.rotateX(Math.PI);
  g.add(placed(chape, F.blackIron, 0, -L - 0.03 * H, 0));
  // the hilt of the dagger that rides beside it
  g.add(placed(new THREE.CylinderGeometry(0.007 * H, 0.007 * H, 0.05 * H, 6), F.leatherDark, -sx * 0.018 * H, 0.012 * H, -0.012 * H));
  g.add(placed(new THREE.SphereGeometry(0.009 * H, 8, 6), F.blackIron, -sx * 0.018 * H, 0.04 * H, -0.012 * H));
  return g;
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
