// The hub's folk (FS-2325V §G, ADR-0021): its residents and its two function NPCs, dressed on
// the same rig as the players, idling and walking only.
//
// Residents are ordinary people, and read as such next to a player: bare heads, homespun, no
// weapon, no armour, a working gait. They come in builds ("trousers", "skirt"), one sheet each;
// the server's `appearance` is "<palette>_<build>", and each palette in use is baked into the
// build's sheet as a variant that re-dresses the same rig (fabrics.js FOLK_PALETTES).
//
// Function NPCs are worth crossing the hub for, and their role reads from the silhouette: the
// Spirewarden, who sends players down, is tall in grave-watch mail and a hooded mantle, with a
// lantern hung from a crook; the Quartermaster, who keeps the stores, is stout, in a leather
// apron and felt cap, with a ledger on his arm.
//
// The Confessor keeps the chapel (FS-R4MYX §H R37). He is no function NPC yet and carries nothing:
// tall and gaunt in a dark hooded robe to the ground, his face in the cowl's shadow, a white stole
// hung from his neck as the one pale mark on him, his hands clasped before him.

import * as THREE from "three";
import { materials } from "../materials.js";
import { attach, createRig, jointAt as J, mount } from "./rig.js";
import { fabrics, folkFabrics } from "./fabrics.js";
import { FOLK_ANIMATIONS, pose } from "./clips.js";
import {
  arms,
  belt,
  boots,
  cap,
  cloak,
  cloakBones,
  cowl,
  face,
  hair,
  hands,
  head,
  hood,
  legs,
  neck,
  overTorso,
  shawl,
  shortBeard,
  skirt,
  skirtBones,
  torso,
} from "./anatomy.js";
import { inHand, keyRing, lanternPole, ledger, limbGuard } from "./gear.js";

const FRONT = [Math.PI / 2 - 0.8, Math.PI / 2 + 0.8];

/**
 * Palette variants for a build: `use(slot, meshes)` marks what a palette recolours; each variant
 * `dress()`es those meshes in its palette's materials. The first palette dresses the rig as built.
 */
function paletteSlots(names) {
  const slots = {};
  const use = (slot, meshes) => {
    (slots[slot] ??= []).push(...[meshes].flat());
    return meshes;
  };
  const variants = names.map((name) => ({
    name,
    dress: () => {
      const P = folkFabrics(name);
      for (const [slot, meshes] of Object.entries(slots)) for (const m of meshes) m.material = P[slot];
    },
  }));
  return { P: folkFabrics(names[0]), use, variants };
}

/** An unhurried working gait, arms loose. */
const RESIDENT_STYLE = {
  speed: 0.8,
  hold: pose({ foreArmL: [-0.12, 0, 0], foreArmR: [-0.12, 0, 0] }),
  walk: { stride: 0.85, arms: [0.8, 0.8], lean: 0.03, twist: 0.8 },
  idle: { lean: 0.02 },
};

/**
 * A resident. `trousers`: a cottar or woodcutter in a belted tunic over trousers, shirt sleeves.
 * `skirt`: a goodwife in a long kirtle and shawl, her hair up in a bun.
 */
export function resident(build, palettes) {
  const M = materials();
  const F = fabrics();
  const { P, use, variants } = paletteSlots(palettes);
  const skirted = build === "skirt";
  const rig = createRig(skirted ? 1.86 : 1.94, skirted ? { shoulderW: 0.92, torsoW: 0.93, hipW: 1.06 } : { shoulderW: 1.03, torsoW: 1.0 });
  rig.hooks = [];
  skirtBones(rig, skirted ? { stiffness: 40, drag: 0.26 } : { stiffness: 60 });
  const [, hy] = J(rig, "hips");

  use("cloth", torso(rig, P.cloth));
  neck(rig, F.skin);
  arms(rig, F.shirt);
  hands(rig, F.skin);
  head(rig, F.skin);
  // the brows follow each palette's hair (FS-67QQY R11)
  use("brow", face(rig, F.face, P.brow));
  use("hair", hair(rig, P.hair, skirted ? { long: true, bun: true } : {}));
  if (skirted) {
    // no legs under the kirtle, only boots: a stride can never poke through the cloth
    boots(rig, F.leatherDark, { top: 0.12 });
    use("cloth", skirt(rig, P.cloth, { top: hy + 0.03, bottom: 0.022, rTop: [0.11, 0.088], rBottom: [0.15, 0.13], legFollow: 0.5, panels: true, panelWeight: 0.35, segs: 30 }));
    use("under", shawl(rig, P.under));
    belt(rig, F.linen, F.linen, { r: [0.1, 0.08], dy: 0.05 });
  } else {
    const tunic = { top: hy + 0.02, bottom: hy - 0.15, rTop: [0.1, 0.078], rBottom: [0.116, 0.098] };
    use("under", legs(rig, P.under, { under: tunic }));
    boots(rig, F.leather, { top: 0.11 });
    use("cloth", skirt(rig, P.cloth, { ...tunic, legFollow: 0.7, panels: true, panelWeight: 0.3 }));
    belt(rig, F.leatherDark, M.iron, { pouch: true });
  }

  const style = skirted
    ? { ...RESIDENT_STYLE, walk: { ...RESIDENT_STYLE.walk, stride: 0.72, arms: [0.6, 0.6] } }
    : RESIDENT_STYLE;
  return { rig, style, variants };
}

/** The Spirewarden: tall, grave-watch mail under a hooded mantle, a lantern on a crook. */
export function spirewarden() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(2.08, { shoulderW: 1.06, torsoW: 1.02 });
  rig.hooks = [];
  cloakBones(rig, { length: 0.62, drag: 0.3 });
  skirtBones(rig, { stiffness: 55 });
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  const [, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");

  torso(rig, F.mail);
  neck(rig, F.skin);
  arms(rig, F.mail);
  // the hauberk hangs to the knee
  const hauberk = { top: hy + 0.02, bottom: ky + 0.01, rTop: [0.1, 0.08], rBottom: [0.12, 0.104] };
  legs(rig, F.breeches, { under: hauberk });
  hands(rig, F.leatherDark);
  boots(rig, F.leatherDark, { top: 0.2 });
  head(rig, F.skin);
  face(rig, F.face, F.browDark);
  hood(rig, F.wardWool);
  for (const s of ["L", "R"]) limbGuard(rig, `foreArm${s}`, wy + 0.02, fy - 0.03, [0.036, 0.034], F.leatherDark);
  skirt(rig, F.mail, { ...hauberk, legFollow: 0.8, segs: 24 });
  belt(rig, F.leatherDark, F.blackIron, { r: [0.106, 0.086], dy: 0.03 });
  keyRing(rig, F, "L");
  cloak(rig, F.wardWool, { length: 0.62, spread: 1.5, flare: 1.2 });
  inHand(rig, "R").add(lanternPole(rig, M, F));

  const style = {
    speed: 0.8,
    hold: pose({
      upperArmR: [-0.26, 0, -0.1],
      foreArmR: [-1.12, 0, 0],
      handR: [-0.08, 0, 0],
      foreArmL: [-0.2, 0, 0],
    }),
    walk: { stride: 0.9, arms: [0.7, 0.25], lean: 0.02, twist: 0.7 },
    idle: { lean: 0.01 },
  };
  return { rig, style };
}

/** The Quartermaster: stout, in shirt sleeves and a leather apron, felt cap, a ledger on his arm. */
export function quartermaster() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(1.9, { shoulderW: 1.08, torsoW: 1.2, torsoD: 1.28, hipW: 1.12, limbR: 1.08, armR: 1.1 });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 60 });
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  const [x, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");

  torso(rig, F.shirt);
  neck(rig, F.skin);
  arms(rig, F.shirt, { sleeve: (t) => 1 + 0.25 * THREE.MathUtils.smoothstep(t, 0.3, 0.5) * (1 - THREE.MathUtils.smoothstep(t, 0.55, 0.7)) });
  // the seat of his breeches (FS-HF0WW § Change: The folk's legs stay under their clothes, round
  // 2): a closed band in the breeches' cloth from a little over the belt, where it hugs the shirt,
  // to just below the crotch, as wide as his hips were, under the apron in front. Without it the
  // shirt's pale seat showed below the belt between the thigh roots, which came up through the shirt
  // at the hips and above the belt. His thighs are drawn in under it (legs({ under })), where it
  // covers them; below it, where only the apron covers their front, they are as built
  const seat = { top: hy + 0.05, bottom: hy - 0.1, rTop: [0.104, 0.09], rBottom: [0.13, 0.085], belly: 0.012, z: -0.006 };
  legs(rig, F.breeches, { under: seat });
  hands(rig, F.skin);
  boots(rig, F.leatherDark, { top: 0.1 });
  head(rig, F.skin);
  face(rig, F.face, F.browGrey);
  hair(rig, F.hairGrey);
  cap(rig, F.felt);
  skirt(rig, F.breeches, { ...seat, legFollow: 0.8, segs: 24 });
  // the apron: pale tanned leather, a bib over the chest and a long panel to the shin; the dark
  // ledger reads against it. It follows the thighs by half (0.4 before round 2, the least in 0.05
  // steps that keeps the leading thigh in under its side edge through the walk)
  overTorso(rig, F.apron, { from: hy, arc: FRONT, pad: 0.014 });
  skirt(rig, F.apron, { top: hy + 0.01, bottom: ky - 0.06, rTop: [0.118, 0.1], rBottom: [0.13, 0.116], arc: FRONT, panels: true, legFollow: 0.5, segs: 12 });
  belt(rig, F.leatherDark, M.brass, { r: [0.12, 0.104], dy: 0.03, pouch: true });
  keyRing(rig, F, "R");
  // upright on the raised forearm, on its outer side, so it stands in front of the body
  const book = mount(rig, "foreArmL", [x + 0.034, (fy + wy) / 2, 0.075]);
  book.add(ledger(rig, M, F));

  const style = {
    speed: 0.75,
    hold: pose({
      upperArmL: [-0.2, -0.75, 0.12],
      foreArmL: [-1.45, 0, 0],
      foreArmR: [-0.15, 0, 0],
    }),
    walk: { stride: 0.8, arms: [0.15, 0.9], lean: 0.0, twist: 1.1 },
    idle: { lean: -0.01 },
  };
  return { rig, style };
}

/** The stole's two bands, either side of the front (rad, 0 his right, π/2 his front). */
const STOLE = [
  [Math.PI / 2 + 0.17, Math.PI / 2 + 0.43],
  [Math.PI / 2 - 0.43, Math.PI / 2 - 0.17],
];

/**
 * The Confessor (FS-R4MYX §H R37): tall and gaunt, a dark hooded robe to the ground under a deep
 * cowl that shadows his eyes, a white stole from the neck to the shin, a cord at the waist, his
 * hands clasped before him in wide sleeves. No weapon, no marker, nothing amber.
 */
export function confessor() {
  const F = fabrics();
  const rig = createRig(2.06, { shoulderW: 0.9, torsoW: 0.84, torsoD: 0.86, hipW: 0.92, limbR: 0.84, armR: 0.84, headR: 0.059 });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 50, drag: 0.24 });
  const [, hy] = J(rig, "hips");
  // the robe is cut as the wizard's gown is, to the ground, so a stride keeps the knee inside it
  const robe = { top: hy - 0.005, bottom: 0.016, rTop: [0.096, 0.072], rBottom: [0.15, 0.134], legFollow: 0.5, panels: true, panelWeight: 0.35, segs: 64, trail: 0.02, kneeCover: 0.05 };

  torso(rig, F.confessorRobe);
  neck(rig, F.skin, { w: 0.86 });
  // wide sleeves, falling open from the elbow
  arms(rig, F.confessorRobe, { sleeve: (t) => 1 + 0.9 * THREE.MathUtils.smoothstep(t, 0.4, 0.95) });
  legs(rig, F.breeches, { under: robe });
  hands(rig, F.skin, { size: 0.9 });
  boots(rig, F.leatherDark, { top: 0.08 });
  head(rig, F.skin, { jaw: 0.84 });
  face(rig, F.face, F.browGrey);
  // the crown drawn out behind into a short drooping point, so from behind he reads as hooded and
  // not as a dark ball over the robe
  cowl(rig, F.confessorRobe, { shade: 1, brow: 0.4, gap: 0.95, reach: 0.018, point: { dir: [0, 0.45, -0.9], length: 0.07, droop: 0.45, pinch: 0.75, girth: 2.6 } });
  skirt(rig, F.confessorRobe, robe);
  // the stole: two bands from under the cowl's mantle down his front, lying over the robe on its
  // own rig, so the robe never shows through it, to the shin
  for (const arc of STOLE) {
    overTorso(rig, F.stole, { from: hy - 0.01, arc, pad: 0.014 });
    skirt(rig, F.stole, { top: robe.top, bottom: 0.17, rTop: [robe.rTop[0] + 0.008, robe.rTop[1] + 0.008], rBottom: [robe.rBottom[0] + 0.006, robe.rBottom[1] + 0.008], arc, over: robe });
  }
  // a plain cord girdle over the robe and the stole
  belt(rig, F.cord, F.cord, { r: [0.113, 0.098], dy: 0 });

  const style = {
    speed: 0.7,
    // the hands clasped before him at the waist, the elbows in at his sides
    hold: pose({
      upperArmL: [-0.22, -0.72, -0.1],
      foreArmL: [-1.2, 0, 0],
      upperArmR: [-0.22, 0.72, 0.1],
      foreArmR: [-1.2, 0, 0],
    }),
    // a slow, measured step; the clasped hands barely swing
    walk: { stride: 0.7, knee: 0.85, arms: [0.08, 0.08], lean: 0.0, twist: 0.5 },
    idle: { lean: 0.0 },
  };
  return { rig, style };
}

/**
 * The peddler's frame pack (FS-9JV5K §G R26), rigid on the chest, standing off his back over the
 * cloak: a canvas body under a leather flap, two straps round it, a madder blanket rolled across
 * its top, an iron pan hung on its right side, two ash poles of its frame standing proud above it,
 * and from the left pole an iron arm that hangs his lantern out beside his head. Built in model
 * space (H units, bind pose); the shoulder straps come over his shoulders to his chest, where his
 * hands hold them. Returns the lantern's glass, so a test can find where the light sits.
 */
function peddlerPack(rig, M, F) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const [, ny] = J(rig, "neck");
  const td = rig.p.torsoD;
  const g = mount(rig, "chest");
  const at = (geo, mat, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * H, y * H, z * H);
    m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    g.add(m);
    return m;
  };
  const tube = (points, r, mat) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x * H, y * H, z * H))), 24, r * H, 6, false), mat);
    g.add(m);
    return m;
  };

  // the body: a deep sack of canvas, a little wider than his shoulders' line, from his belt to
  // above his shoulders, its front off his back by the cloak's depth
  const w = 0.25;
  const front = -0.112 * td;
  const d = 0.13;
  const bottom = hy + 0.06;
  const top = ny + 0.06;
  const cz = front - d / 2;
  const body = new THREE.BoxGeometry(w * H, (top - bottom) * H, d * H, 3, 4, 2);
  // bellied: the canvas bulges out between its corners, so it reads stuffed, not boxed
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / ((w / 2) * H);
    const v = p.getY(i) / (((top - bottom) / 2) * H);
    const s = 1 + 0.12 * (1 - u * u) * (1 - v * v * 0.6);
    p.setZ(i, p.getZ(i) * s);
    p.setX(i, p.getX(i) * (1 + 0.06 * (1 - v * v)));
  }
  body.computeVertexNormals();
  at(body, F.merchantCanvas, 0, (top + bottom) / 2, cz);
  // the flap over its top and down its back, in leather, with a brass buckle
  at(new THREE.BoxGeometry((w + 0.012) * H, 0.014 * H, (d + 0.02) * H), F.leather, 0, top + 0.004, cz);
  at(new THREE.BoxGeometry((w * 0.8) * H, 0.11 * H, 0.012 * H), F.leather, 0, top - 0.05, front - d - 0.012);
  at(new THREE.BoxGeometry(0.03 * H, 0.03 * H, 0.012 * H), M.brass, 0, top - 0.1, front - d - 0.02);
  // two straps round the body
  for (const y of [bottom + 0.06, bottom + 0.17])
    at(new THREE.BoxGeometry((w * 1.08) * H, 0.018 * H, (d * 1.22) * H), F.leatherDark, 0, y, cz);
  // the frame's poles, up the back corners and proud of the top
  for (const sx of [-1, 1]) at(new THREE.CylinderGeometry(0.009 * H, 0.01 * H, (top - bottom + 0.16) * H, 6), M.wood, sx * (w / 2 + 0.006), (top + bottom) / 2 + 0.07, front - d + 0.012);
  // the blanket roll across the top, strapped down
  const roll = at(new THREE.CylinderGeometry(0.04 * H, 0.04 * H, (w + 0.05) * H, 14), F.merchantBlanket, 0, top + 0.045, cz - 0.01, { rz: Math.PI / 2 });
  roll.userData.roll = true;
  for (const sx of [-1, 1]) at(new THREE.TorusGeometry(0.042 * H, 0.006 * H, 5, 14), F.leatherDark, sx * 0.07, top + 0.045, cz - 0.01, { ry: Math.PI / 2 });
  // the pan, hung by its handle on the right side
  at(new THREE.CylinderGeometry(0.055 * H, 0.05 * H, 0.016 * H, 16), M.iron, -(w / 2 + 0.024), bottom + 0.13, cz - 0.01, { rz: Math.PI / 2 });
  at(new THREE.BoxGeometry(0.01 * H, 0.08 * H, 0.012 * H), M.iron, -(w / 2 + 0.024), bottom + 0.2, cz - 0.01);
  // a coil of rope on the left side
  at(new THREE.TorusGeometry(0.04 * H, 0.011 * H, 6, 16), F.cord, w / 2 + 0.016, bottom + 0.1, cz, { ry: Math.PI / 2 });
  // the shoulder straps: from the pack's top over each shoulder and down his chest, back under
  // the arm to the pack's foot
  const chestZ = 0.086 * td;
  for (const sx of [-1, 1])
    tube(
      [
        [sx * 0.07, top - 0.03, front - 0.01],
        [sx * 0.08, ny + 0.005, -0.02],
        [sx * 0.082, ny - 0.035, chestZ * 0.8],
        [sx * 0.085, ny - 0.1, chestZ + 0.006],
        [sx * 0.1, hy + 0.13, chestZ * 0.6],
        [sx * 0.11, hy + 0.09, -0.04],
        [sx * 0.1, bottom + 0.02, front - 0.01],
      ],
      0.009,
      F.leatherDark,
    );

  // the lantern's arm: from the top of the left pole, curving up and out over his left shoulder
  const px = w / 2 + 0.006;
  const py = top + 0.15;
  const pz = front - d + 0.012;
  const lx = px + 0.07;
  const lz = 0.0;
  // the arm and the lantern cast no shadow: so far out from him, theirs ran off as a stray thread
  const hung = [];
  hung.push(tube(
    [
      [px, py - 0.02, pz],
      [px + 0.02, py + 0.02, pz + 0.03],
      [lx - 0.01, py + 0.03, lz - 0.04],
      [lx, py + 0.0, lz],
    ],
    0.008,
    F.blackIron,
  ));
  // the lantern, hung from the arm's hook by its ring: lit glass in four iron posts under a cap
  const s = 0.03;
  const h = 0.068;
  const ly = py - 0.025 - h / 2;
  hung.push(at(new THREE.TorusGeometry(0.008 * H, 0.0022 * H, 4, 10), F.blackIron, lx, py - 0.008, lz));
  const glass = at(new THREE.BoxGeometry(s * 1.5 * H, h * 0.8 * H, s * 1.5 * H), M.glass, lx, ly, lz);
  hung.push(glass);
  for (const [ox, oz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    hung.push(at(new THREE.BoxGeometry(0.0045 * H, h * H, 0.0045 * H), F.blackIron, lx + ox * s * 0.8, ly, lz + oz * s * 0.8));
  hung.push(at(new THREE.ConeGeometry(s * 1.3 * H, 0.026 * H, 4), F.blackIron, lx, ly + h / 2 + 0.012, lz, { ry: Math.PI / 4 }));
  hung.push(at(new THREE.BoxGeometry(s * 1.8 * H, 0.006 * H, s * 1.8 * H), F.blackIron, lx, ly - h / 2, lz));
  for (const m of hung) m.userData.noShadow = true;
  return glass;
}

/**
 * A wide-brimmed felt hat, the brim turned down a little at its edge and tipped back off the brow
 * so the face shows under it from the camera's height.
 */
function wideHat(rig, mat, band) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const at = [0, hy + 0.098, hz - 0.006];
  const tip = { rx: -0.26 };
  const brim = [
    [0.9 * r, 0.004],
    [1.35 * r, 0.002],
    [1.75 * r, -0.006],
    [1.82 * r, -0.012],
    [1.75 * r, -0.016],
    [1.35 * r, -0.006],
    [0.9 * r, -0.004],
  ].map(([x, y]) => new THREE.Vector2(x * H, y * H));
  attach(rig, "head", new THREE.LatheGeometry(brim, 24), mat, at, tip);
  const crown = [
    [0, 0.072],
    [0.62 * r, 0.07],
    [0.9 * r, 0.05],
    [1.0 * r, 0.0],
  ].map(([x, y]) => new THREE.Vector2(x * H, y * H));
  attach(rig, "head", new THREE.LatheGeometry(crown, 20), mat, at, tip);
  attach(rig, "head", new THREE.CylinderGeometry(1.01 * r * H, 1.02 * r * H, 0.014 * H, 20, 1, true), band, [at[0], at[1] + 0.008, at[2]], tip);
}

/**
 * The wandering merchant (FS-9JV5K §G R26): a stout, grizzled pedlar of the deep roads, in a
 * road-dusted cloak ragged at the hem over an ochre jerkin and breeches, tall travel boots and a
 * wide felt hat, bowed a little under a frame pack that stands above his shoulders, his lantern
 * hung out over his left shoulder from its frame. His hands hold the pack's straps at his chest.
 * He never walks, so he idles only.
 */
export function merchant() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(1.94, { shoulderW: 1.05, torsoW: 1.08, torsoD: 1.12, hipW: 1.05, limbR: 1.04, armR: 1.04 });
  rig.hooks = [];
  // the cloak's top is held to his back under the pack, the rest hangs free below it
  cloakBones(rig, { length: 0.5, drag: 0.3, strap: [0.2, 0.35, 0.8, 1] });
  skirtBones(rig, { stiffness: 60 });
  const [, hy] = J(rig, "hips");

  torso(rig, F.merchantJerkin);
  neck(rig, F.skin);
  // sleeves of undyed brown wool: pale linen ones read as bare arms at 1x
  arms(rig, F.hunterWool);
  hands(rig, F.skin);
  head(rig, F.skin);
  face(rig, F.face, F.browGrey);
  hair(rig, F.hairGrey);
  shortBeard(rig, F.hairGrey, { full: 1.25 });
  wideHat(rig, F.felt, F.leatherDark);
  const tunic = { top: hy + 0.02, bottom: hy - 0.15, rTop: [0.1, 0.078], rBottom: [0.118, 0.1] };
  legs(rig, F.breeches, { under: tunic });
  boots(rig, F.leather, { top: 0.19 });
  skirt(rig, F.merchantJerkin, { ...tunic, legFollow: 0.7, panels: true, panelWeight: 0.3 });
  belt(rig, F.leatherDark, M.brass, { pouch: true });
  keyRing(rig, F, "R");
  cloak(rig, F.merchantCloak, { length: 0.5, spread: 1.35, flare: 1.15, ragged: { teeth: 15, depth: 0.04, seed: 9 } });
  peddlerPack(rig, M, F);

  const style = {
    speed: 0.7,
    // both hands up at his chest on the pack's straps, the elbows in at his sides
    hold: pose({
      upperArmL: [0.3, 0, -0.04],
      foreArmL: [-2.35, 0, 0],
      upperArmR: [0.3, 0, 0.04],
      foreArmR: [-2.35, 0, 0],
    }),
    walk: { stride: 0.7, arms: [0.1, 0.1], lean: 0.06, twist: 0.5 },
    // bowed a little under the pack's weight
    idle: { lean: 0.07 },
  };
  return { rig, style };
}

/** The merchant's sheet, on a group of its own fetched on demand (ADR-0071 Decision 6): idle only. */
export const MERCHANT = [{ sheet: "npc_merchant", fn: "merchant", build: merchant, group: "merchant", animations: { idle: FOLK_ANIMATIONS.idle } }];

/** The folk as manifest sheets: idle and walk only (FOLK_ANIMATIONS). */
export const FOLK = [
  // each build carries the palettes the hub sends (game-server hub_map.go hubResidents); the
  // first is the plain clips and the client's fallback for any palette the sheet lacks
  { sheet: "folk_resident_trousers", fn: "resident", build: () => resident("trousers", ["rust", "slate"]) },
  { sheet: "folk_resident_skirt", fn: "resident", build: () => resident("skirt", ["green", "flax"]) },
  { sheet: "folk_spirewarden", fn: "spirewarden", build: spirewarden },
  { sheet: "folk_quartermaster", fn: "quartermaster", build: quartermaster },
  { sheet: "folk_confessor", fn: "confessor", build: confessor },
].map((f) => ({ ...f, group: "folk", animations: FOLK_ANIMATIONS }));
