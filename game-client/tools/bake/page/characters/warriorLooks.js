// The warrior's specialization looks (FS-1J1CB §A R1–R2): the Guardian and the Berserker, each the
// knight re-dressed on his own rig, build and clips (cast.js `knight(look)`, look.js). Ported from
// the /variants round's knightLooks.js (Guardian B with C's helm, Berserker C), cleaned up and
// rebuilt on the look's pieces.

import * as THREE from "three";
import { attach, jointAt as J, rigidTube } from "./rig.js";
import { hair, overTorso, shortBeard, skirt } from "./anatomy.js";
import { beardedAxe, inHand, limbGuard } from "./gear.js";
import { BERSERKER_STYLE } from "./classStyles.js";

// --- the Guardian (R1) -----------------------------------------------------------------------

/**
 * A sleeveless surcoat in worn bone over the hauberk, open at the front like it and stopping a
 * hand above its hem (cut over it with `skirt({ over })`, R11), the house cross in oxblood on the
 * breast.
 */
function surcoat(rig, { F, hauberk }) {
  const H = rig.H;
  const [, cy] = J(rig, "chest");
  const out = 0.012;
  overTorso(rig, F.surcoat, { from: hauberk.top - 0.01, pad: 0.014 });
  skirt(rig, F.surcoat, {
    over: hauberk,
    rTop: [hauberk.rTop[0] + out, hauberk.rTop[1] + out],
    rBottom: [hauberk.rBottom[0] + out, hauberk.rBottom[1] + out],
    bottom: hauberk.bottom + 0.07,
    arc: hauberk.arc,
  });
  // the cross on the breast, laid on the cloth's curve
  const z = 0.079 * rig.p.torsoD + 0.016;
  attach(rig, "chest", new THREE.BoxGeometry(0.034 * H, 0.15 * H, 0.008 * H), F.houseRed, [0, cy - 0.015, z + 0.006], { rx: -0.06 });
  attach(rig, "chest", new THREE.BoxGeometry(0.11 * H, 0.032 * H, 0.008 * H), F.houseRed, [0, cy + 0.02, z + 0.01]);
}

/**
 * The flat-topped great helm over the coif, in place of the conical nasal helm: a steel drum closed
 * over the face with a low dome on its flat top, a dark eye-slit round the front, a brass band at
 * the brow and a brass cross down the face, a few breaths on the right cheek.
 */
function greatHelm(rig, { F, M }) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const h = 0.15;
  const y = hy + 0.05;
  const z = hz - 0.002;
  const [rt, rb] = [1.14, 1.22];
  // the drum's radius (headR) at a height dy above its middle
  const at = (dy) => (rt + rb) / 2 + ((rt - rb) * dy) / h;
  const drum = { sz: 1.08 };
  attach(rig, "head", new THREE.CylinderGeometry(r * rt * H, r * rb * H, h * H, 22, 1, false), F.darkSteel, [0, y, z], drum);
  attach(rig, "head", new THREE.SphereGeometry(r * rt * H, 22, 6, 0, Math.PI * 2, 0, Math.PI * 0.22), F.darkSteel, [0, y + h / 2 - 0.004, z], { ...drum, sy: 0.6 });
  const ring = (dy, out, height, mat, arc = [0, Math.PI * 2]) =>
    attach(rig, "head", new THREE.CylinderGeometry(r * (at(dy) + out) * H, r * (at(dy) + out) * H, height * H, 22, 1, true, ...arc), mat, [0, y + dy, z], drum);
  ring(0.032, 0.03, 0.02, M.black, [-1.05, 2.1]);
  ring(h / 2 - 0.012, 0.02, 0.012, M.brass);
  const front = z + r * (at(-0.01) + 0.03) * 1.08;
  attach(rig, "head", new THREE.BoxGeometry(0.012 * H, 0.1 * H, 0.008 * H), M.brass, [0, y - 0.01, front]);
  for (let k = 0; k < 4; k++) attach(rig, "head", new THREE.BoxGeometry(0.004 * H, 0.004 * H, 0.006 * H), M.black, [-0.028 - (k % 2) * 0.01, y - 0.015 - Math.floor(k / 2) * 0.012, front - 0.012]);
}

/** The Guardian (R1): variant B's surcoat with C's great helm, the kite shield about 1.15x with its cross counterchanged. */
export const guardian = {
  swap: { helm: greatHelm },
  // the belt let out to sit over the surcoat
  opts: { belt: { r: [0.122, 0.102] }, shield: { scale: 1.15, cross: true } },
  add: surcoat,
};

// --- the Berserker (R2) ----------------------------------------------------------------------

/** The cloak torn short to the hips, its hem ragged. */
const TORN = { length: 0.52, ragged: { teeth: 10, depth: 0.16, seed: 4 } };

/** The coif pushed down off the head: a mail mantle round the neck and over the shoulder line. */
function mailMantle(rig, { mat }) {
  const [, ny] = J(rig, "neck");
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny + 0.03, -0.006], r: [0.07, 0.068] },
      { p: [0, ny, -0.006], r: [0.08, 0.076] },
      { p: [0, ny - 0.05, -0.004], r: [0.13 * rig.p.shoulderW, 0.094 * rig.p.torsoD] },
    ],
    { segs: 24, steps: 4, caps: false },
  );
  attach(rig, "chest", geo, mat, [0, 0, 0]);
}

/** A bearded axe in the hand on `side`, in the grip frame (gear.js `beardedAxe`). */
const axeIn = (rig, side, { M, F }) => inHand(rig, side).add(beardedAxe(rig, M, F));

/** The bare head's dark hair and full short beard, and blood-dark cloth wound round both forearms. */
function berserkerGear(rig, kit) {
  const { F } = kit;
  hair(rig, F.hairDark, {});
  shortBeard(rig, F.hairDark, { full: 1.35 });
  for (const s of ["L", "R"]) {
    const [, ey] = J(rig, `foreArm${s}`);
    const [, wy] = J(rig, `hand${s}`);
    limbGuard(rig, `foreArm${s}`, wy + 0.012, ey - 0.02, [0.03, 0.03], F.wraps, { taper: 1.2 });
  }
  axeIn(rig, "L", kit);
}

/** The Berserker (R2): variant C, bareheaded, the cloak torn short, a bearded axe in each hand and no shield. */
export const berserker = {
  omit: ["helm", "shield"],
  swap: { coif: mailMantle, weapon: (rig, kit) => axeIn(rig, "R", kit) },
  opts: { cloak: TORN },
  add: berserkerGear,
  style: BERSERKER_STYLE,
};
