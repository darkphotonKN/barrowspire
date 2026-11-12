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

/** The folk as manifest sheets: idle and walk only (FOLK_ANIMATIONS). */
export const FOLK = [
  // each build carries the palettes the hub sends (game-server hub_map.go hubResidents); the
  // first is the plain clips and the client's fallback for any palette the sheet lacks
  { sheet: "folk_resident_trousers", fn: "resident", build: () => resident("trousers", ["rust", "slate"]) },
  { sheet: "folk_resident_skirt", fn: "resident", build: () => resident("skirt", ["green", "flax"]) },
  { sheet: "folk_spirewarden", fn: "spirewarden", build: spirewarden },
  { sheet: "folk_quartermaster", fn: "quartermaster", build: quartermaster },
].map((f) => ({ ...f, group: "folk", animations: FOLK_ANIMATIONS }));
