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
import { createRig, jointAt as J, mount } from "./rig.js";
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
