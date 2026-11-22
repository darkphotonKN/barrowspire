// The archer's specialization looks (FS-1J1CB §A R5–R6): the Hunter and the Shadow Ranger, each the
// Nightwood ranger re-dressed on her own rig, build and clips (cast.js `archer(look)`, look.js).
// Ported from the /variants round's archerLooks.js (Hunter A with C's jerkin, fletching and nocks;
// Shadow Ranger A), cleaned up and rebuilt on the look's pieces. The Shadow Ranger's gloom is a
// runtime aura (§E), never baked here.

import * as THREE from "three";
import { attach, jointAt as J, rigidTube } from "./rig.js";
import { capelet, hair, overTorso } from "./anatomy.js";
import { hash2 } from "../noise.js";

// --- the Hunter (R5) -------------------------------------------------------------------------

/** How far the pelt stands open each side of the throat (radians): bare of the hood, a pelt closed up to the chin read as a beard. */
const OPEN = 0.5;

/**
 * A wolf pelt laid over the shoulders, over the capelet: a short, shaggy mantle open at the throat,
 * its lower edge torn into tufts and every vertex pushed out a little at random, so the outline
 * reads as fur, not cloth. Rigid on the chest, above the hips (R11).
 */
function peltMantle(rig, m) {
  const [, ny] = J(rig, "neck");
  const sw = rig.p.shoulderW;
  const td = rig.p.torsoD;
  const lowest = ny - 0.095;
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny + 0.015, -0.006], r: [0.066, 0.064] },
      { p: [0, ny - 0.005, -0.006], r: [0.122 * sw, 0.094 * td] },
      { p: [0, ny - 0.05, -0.002], r: [0.152 * sw, 0.11 * td] },
      { p: [0, lowest, -0.006], r: [0.15 * sw, 0.108 * td] },
    ],
    { segs: 30, steps: 4, caps: false, arc: [Math.PI / 2 + OPEN, Math.PI / 2 + Math.PI * 2 - OPEN] },
  );
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const tuft = hash2(Math.floor(((Math.atan2(v.z, v.x) + Math.PI) / (Math.PI * 2)) * 17), 3, 9);
    const k = 1 + 0.07 * hash2(i, 5, 11);
    v.x *= k;
    v.z *= k;
    if (v.y < (lowest + 0.02) * rig.H) v.y -= (0.012 + 0.03 * tuft) * rig.H;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  attach(rig, "chest", geo, m, [0, 0, 0]);
}

/**
 * A sleeveless hide jerkin over the buff's chest, from the hips' line up, open in a laced slit down
 * the front: it stays above the hips, so the tunic's skirt below is the buff's own (R11).
 */
function jerkin(rig, m, lace) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  overTorso(rig, m, { from: hy - 0.012, pad: 0.01, arc: [Math.PI / 2 + 0.14, Math.PI / 2 + Math.PI * 2 - 0.14] });
  for (let i = 0; i < 4; i++) attach(rig, "chest", new THREE.BoxGeometry(0.03 * H, 0.004 * H, 0.004 * H), lace, [0, hy + 0.04 + i * 0.05, 0.088 * rig.p.torsoD]);
}

/**
 * The Hunter (R5): variant A's wolf pelt; variant C's laced hide jerkin, high goose fletching and
 * horn nock caps; the cloak, capelet and sleeves in undyed grey-brown wool, nothing of the
 * Nightwood green left. No cowl: the shared face (R14) under brown hair loose to the collar,
 * unbearded, the capelet kept on its own.
 */
export const hunter = {
  tones: (F) => ({ rangerNight: F.hunterWool, rangerNightDark: F.hunterWoolDark, linen: F.goose }),
  opts: { quiver: { fletchLength: 1.9 }, weapon: { nocks: true } },
  swap: {
    cowl: (rig, { F, mat }) => {
      capelet(rig, mat);
      hair(rig, F.hairBrown, { long: true });
    },
  },
  add: (rig, { F }) => {
    peltMantle(rig, F.wolf);
    jerkin(rig, F.jerkinHide, F.leatherDark);
  },
};

// --- the Shadow Ranger (R6) ------------------------------------------------------------------

/**
 * The Shadow Ranger (R6): variant A. The Nightwood dyed through to a cold soot-black on the cowl,
 * capelet and cloak, the sleeves and hose darker; the buff leather blackened to a cold grey; the
 * bracers, boots and fletching black.
 */
export const shadowRanger = {
  tones: (F) => ({ rangerNight: F.shadow, rangerNightDark: F.shadowDark, buff: F.shadowLeather, linen: F.shadowFletch }),
  mats: (F) => ({ legs: F.shadowDark, hands: F.shadowLeather, boots: F.shadowBlack, bracers: F.shadowBlack }),
};
