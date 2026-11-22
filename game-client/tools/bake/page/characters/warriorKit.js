// The warrior kit (FS-1J1CB §Change: Looks v2 R68, R69): what every warrior specialization look
// (warriorLooks.js) is composed from. The trims a look is finished with (the kite shield's studs
// and guige; the stud rows and buckles every class kit shares live in gear.js) and each look's own
// wear (the fabric keys it re-dyes, fabrics.js), and the weapons only spec looks carry (the
// Guardian's flanged mace, the Berserker's heavy bearded axe). The knight's own kite shield stays in gear.js, which the base uses; a look
// sizes it through its options and straps the kit's trims to it. Split from warriorLooks.js past
// R69's 400 lines; a third warrior look adds a look object there and, at most, a piece here,
// changing none of the pieces already here.

import * as THREE from "three";
import { GRIP_BASIS, extrude, placed, rod, stud } from "./gear.js";

/** Each spec look's own wear (R63): the fabric keys it re-dyes over the knight's, from fabrics.js. */
export const WEAR = {
  guardian: (F) => ({ mail: F.guardianMail, mailDouble: F.guardianMailDouble, mailDark: F.guardianMailDark, darkSteel: F.guardianSteel, cloakKnight: F.guardianCloak }),
  berserker: (F) => ({ mail: F.berserkerMail, mailDouble: F.berserkerMailDouble, mailDark: F.berserkerMailDark, cloakKnight: F.berserkerCloak, leatherDark: F.berserkerLeather }),
};

/**
 * How far the heavy axe's cutting edge is turned from square to the haft, toward the haft's far
 * end (rad): the beard sweeps down and out, so the edge faces partly along the haft. Carried head
 * down, the haft hanging forward of the fist as a blade's point does, the edge then faces forward
 * and a little down; square to the haft it faced up and forward. The broader beard of the heavy
 * axe sweeps on the same line, so the turn is unchanged from the one-handed axe's.
 */
export const AXE_EDGE_TURN = 0.55;

/** The heavy axe's haft (H, butt to the head's top; R55: about 1.3x the one-handed axe's 0.36). */
export const AXE_HAFT = 0.47;

/**
 * The Berserker's heavy bearded axe (FS-1J1CB R2, §Change: Looks v2 R55), built in the grip frame
 * like any held weapon (the normal grip: the haft runs out of the thumb side of the fist along +z):
 * a long ash haft {@link AXE_HAFT} H wrapped in cord from an iron pommel knob up past the fist,
 * iron langets riveted down the haft under the head, and at its far end a broad head, its poll on
 * -y and its bit on +y, the side the thumb points to, which leads a cut swung toward it. The bit's
 * long beard sweeps down and out toward the fist, so the edge faces {@link AXE_EDGE_TURN} toward the
 * haft's end from square to it. `userData.edge` is that edge in the group's frame: `at`, the middle
 * of the edge, and `dir`, the way it faces (axe.test.mjs holds it forward and down in the carry and
 * leading the swing); `userData.axe` its measures (H).
 */
export function heavyAxe(rig, { wood, cord, iron, edge }) {
  const H = rig.H;
  const g = new THREE.Group();
  const len = AXE_HAFT * H;
  const butt = -0.07 * H;
  const z0 = butt + len;
  // the haft, swelling a little toward the head
  const haft = new THREE.CylinderGeometry(0.0115 * H, 0.0128 * H, len, 10);
  haft.rotateX(Math.PI / 2);
  haft.translate(0, 0, butt + len / 2);
  g.add(new THREE.Mesh(haft, wood));
  // the cord wound from the knob up past the fist, in ridged turns
  const grip = [butt + 0.012 * H, 0.1 * H];
  g.add(placed(rod(0.0142 * H, 0.0142 * H, grip[1] - grip[0]), cord, 0, 0, (grip[0] + grip[1]) / 2));
  const turns = 9;
  for (let i = 0; i <= turns; i++) {
    const turn = new THREE.TorusGeometry(0.0146 * H, 0.0024 * H, 4, 10);
    g.add(placed(turn, cord, 0, 0, grip[0] + ((grip[1] - grip[0]) * i) / turns, 0, 0.18));
  }
  // the iron pommel knob and its collar
  const knob = butt - 0.006 * H;
  g.add(placed(new THREE.SphereGeometry(0.02 * H, 10, 8), iron, 0, 0, knob));
  g.add(placed(rod(0.016 * H, 0.016 * H, 0.008 * H), iron, 0, 0, butt + 0.008 * H));
  // the langets down both flats under the head, a rivet at each end
  for (const sx of [-1, 1]) {
    g.add(placed(new THREE.BoxGeometry(0.004 * H, 0.016 * H, 0.1 * H), iron, sx * 0.012 * H, 0, z0 - 0.09 * H));
    for (const dz of [-0.13, -0.05]) g.add(placed(new THREE.SphereGeometry(0.0042 * H, 6, 4), iron, sx * 0.0145 * H, 0, z0 + dz * H));
  }
  // the head, in shape coordinates (x toward the bit, the grip frame's +y; y along the haft, its
  // +z), its top at the haft's end: the edge runs from the beard's tip up and in to the toe
  const a = AXE_EDGE_TURN;
  const n = [Math.cos(a), Math.sin(a)];
  const beard = [0.152 * H, z0 - 0.122 * H];
  const reach = 0.168 * H;
  const toe = [beard[0] - n[1] * reach, beard[1] + n[0] * reach];
  const mid = [(beard[0] + toe[0]) / 2, (beard[1] + toe[1]) / 2];
  const belly = (d) => [mid[0] + n[0] * d, mid[1] + n[1] * d];
  const s = new THREE.Shape();
  // the poll, squared and heavy behind the eye
  s.moveTo(-0.036 * H, z0 - 0.04 * H);
  s.lineTo(-0.012 * H, z0 - 0.036 * H);
  s.lineTo(0.016 * H, z0 - 0.046 * H);
  // the beard's hooked underside, down and out from the haft to its tip
  s.quadraticCurveTo(0.094 * H, z0 - 0.066 * H, beard[0], beard[1]);
  // the edge, bellied
  s.quadraticCurveTo(...belly(0.018 * H), toe[0], toe[1]);
  s.quadraticCurveTo(0.04 * H, z0 + 0.006 * H, 0.014 * H, z0 + 0.01 * H);
  s.lineTo(-0.012 * H, z0 + 0.012 * H);
  s.lineTo(-0.036 * H, z0 + 0.008 * H);
  s.closePath();
  const head = extrude(s, 0.011 * H, 0.0025 * H);
  head.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(head, iron));
  // the bright ground edge: a band along it, a little proud of the head's faces
  const inset = 0.013 * H;
  const e = new THREE.Shape();
  e.moveTo(beard[0], beard[1]);
  e.quadraticCurveTo(...belly(0.018 * H), toe[0], toe[1]);
  e.lineTo(toe[0] - n[0] * inset, toe[1] - n[1] * inset);
  e.quadraticCurveTo(...belly(0.018 * H - inset), beard[0] - n[0] * inset, beard[1] - n[1] * inset);
  e.closePath();
  const bright = extrude(e, 0.0124 * H, 0);
  bright.applyMatrix4(GRIP_BASIS);
  g.add(new THREE.Mesh(bright, edge));
  const at = belly(0.009 * H);
  g.userData.edge = { at: new THREE.Vector3(0, at[0], at[1]), dir: new THREE.Vector3(0, n[0], n[1]) };
  g.userData.axe = { haft: AXE_HAFT, grip: { from: grip[0] / H, to: grip[1] / H }, knob: knob / H, bit: { out: beard[0] / H, edge: reach / H } };
  return g;
}

/** The flanged mace's measures in the grip frame (H, along +z from the fist): pommel, grip, haft, head. */
const MACE = { pommel: -0.075, grip: [-0.052, 0.048], haft: 0.0105, head: [0.262, 0.354], flanges: 7, r: 0.044, crown: 0.372 };

/**
 * The Guardian's flanged mace (FS-1J1CB §Change: Looks v2 R54), in the grip frame: an iron pommel
 * knob, a leather grip bound at both ends in brass, an iron haft, and a head of {@link MACE}'s
 * seven flanges standing clear of the haft round a short core, each flange stepped out from the
 * haft and peaked at its shoulder, a knob on the crown. One-handed and shorter than the longsword,
 * so the shield carries the outline. `userData.mace` is its measures (H).
 */
export function flangedMace(rig, { iron, steel, grip, brass }) {
  const H = rig.H;
  const g = new THREE.Group();
  const [g0, g1] = MACE.grip;
  const [h0, h1] = MACE.head;
  g.add(placed(new THREE.SphereGeometry(0.019 * H, 10, 8), steel, 0, 0, (MACE.pommel + 0.019) * H));
  g.add(placed(rod(0.0118 * H, 0.0112 * H, (g1 - g0) * H), grip, 0, 0, ((g0 + g1) / 2) * H));
  for (const z of [g0, g1]) g.add(placed(rod(0.0145 * H, 0.0145 * H, 0.01 * H), brass, 0, 0, z * H));
  g.add(placed(rod(MACE.haft * H, MACE.haft * 0.9 * H, (h0 - g1) * H), iron, 0, 0, ((g1 + h0) / 2) * H));
  // the head's core and the flanges round it, each a stepped blade in the haft's plane
  g.add(placed(rod(0.017 * H, 0.015 * H, (h1 - h0) * H), iron, 0, 0, ((h0 + h1) / 2) * H));
  const r = MACE.r;
  const f = new THREE.Shape();
  f.moveTo(0.012 * H, h0 * H);
  f.lineTo(0.026 * H, (h0 + 0.004) * H);
  f.lineTo(r * H, (h0 + 0.036) * H);
  f.lineTo(r * 0.98 * H, (h1 - 0.026) * H);
  f.lineTo(0.03 * H, h1 * H);
  f.lineTo(0.012 * H, (h1 + 0.004) * H);
  f.closePath();
  for (let k = 0; k < MACE.flanges; k++) {
    const geo = extrude(f, 0.0062 * H, 0.0013 * H);
    geo.applyMatrix4(GRIP_BASIS);
    geo.rotateZ((k * Math.PI * 2) / MACE.flanges);
    g.add(new THREE.Mesh(geo, steel));
  }
  // the crown's knob
  g.add(placed(new THREE.SphereGeometry(0.014 * H, 10, 6), steel, 0, 0, (h1 + 0.008) * H));
  g.add(placed(new THREE.ConeGeometry(0.008 * H, 0.016 * H, 8), steel, 0, 0, (MACE.crown - 0.004) * H, Math.PI / 2));
  g.userData.mace = { length: MACE.crown - MACE.pommel, pommel: MACE.pommel, head: { from: h0, to: h1, r, haft: MACE.haft } };
  return g;
}

/** The figure's kite shield (gear.js `kiteShield`, tagged `userData.shield`), or undefined. */
function shieldOf(rig) {
  let found;
  rig.root.traverse((o) => {
    if (o.userData.shield) found = o;
  });
  return found;
}

/**
 * The kite shield's outline at `k` of its size about its middle, `count` points evenly round it,
 * in its own frame (H: [u across, v along]), as gear.js `kiteShield` cuts it.
 */
function shieldOutline({ w, top, bot }, k, count) {
  const s = new THREE.Shape();
  const cy = (top * 0.72 + bot) / 2;
  const p = (x, y) => [x * k, cy + (y - cy) * k];
  s.moveTo(...p(-w, top * 0.72));
  s.quadraticCurveTo(...p(0, top * 1.12), ...p(w, top * 0.72));
  s.quadraticCurveTo(...p(w * 1.02, -0.02), ...p(0, bot));
  s.quadraticCurveTo(...p(-w * 1.02, -0.02), ...p(-w, top * 0.72));
  return s.getSpacedPoints(count).slice(0, count).map((v) => [v.x, v.y]);
}

/**
 * Brass studs round a kite shield's rim, on its face inside the painted border, and its guige: a
 * leather strap hung slack from the top of the shield's inner face, with a brass buckle on it.
 */
export function shieldTrims(rig, mats, { studs = 18 } = {}) {
  const shield = shieldOf(rig);
  const o = shield.userData.shield;
  const H = rig.H;
  const sx = o.side === "L" ? 1 : -1;
  // a point on the face (u across, v along, H) in the shield mesh's frame (shape x → y, shape y →
  // z, out of the face → x), `off` out from it; and on the back, `off` behind it
  const bend = (u) => o.curve * (u / o.w) ** 2;
  const face = (u, v, off = 0) => new THREE.Vector3(sx * (0.0105 + off - bend(u)) * H, sx * u * H, v * H);
  const back = (u, v, off = 0) => [-sx * (0.0105 + off + bend(u)), sx * u, v];
  for (const [u, v] of shieldOutline(o, 0.9, studs)) {
    const m = new THREE.Mesh(stud(H, 0.0058), mats.brass);
    m.position.copy(face(u, v, -0.001));
    m.rotation.y = (sx * Math.PI) / 2;
    shield.add(m);
  }
  // a ring of rivets round the iron boss (shieldFace paints it 0.46 down the face and 0.08 of the face across)
  const faceTop = o.top * 0.92;
  const boss = { v: faceTop - 0.46 * (faceTop - o.bot), u: 0.19 * o.w, dv: 0.095 * (faceTop - o.bot) };
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const m = new THREE.Mesh(stud(H, 0.0042), mats.brass);
    m.position.copy(face(Math.cos(a) * boss.u, boss.v + Math.sin(a) * boss.dv));
    m.rotation.y = (sx * Math.PI) / 2;
    shield.add(m);
  }
  // the guige, slack from the top corners of the inner face, a buckle on its near run
  const pts = [back(-o.w * 0.55, o.top * 0.6, 0.002), back(-o.w * 0.3, o.top * 0.2, 0.012), back(0, o.top * 0.02, 0.02), back(o.w * 0.3, o.top * 0.2, 0.012), back(o.w * 0.55, o.top * 0.6, 0.002)];
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p).multiplyScalar(H)));
  shield.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.005 * H, 4, false), mats.leather));
  const b = new THREE.Mesh(new THREE.TorusGeometry(0.01 * H, 0.0028 * H, 4, 4), mats.brass);
  b.position.set(...back(-o.w * 0.3, o.top * 0.2, 0.017).map((v) => v * H));
  b.rotation.y = Math.PI / 2;
  shield.add(b);
}
