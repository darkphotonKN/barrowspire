// The mercenary's specialization looks (FS-1J1CB §A R7–R8): the Duelist and the Sellsword, each the
// swordsman in madder re-dressed on his own rig, build and clips (cast.js `mercenary(look)`,
// look.js). Ported from the /variants round's mercSpecs.js (Duelist A's half-cloak with a wrapped
// robe; Sellsword B with the madder dyed black), cleaned up and rebuilt on the look's pieces. The
// half-cloak, rigid on the chest in the variant, hangs on cloak bones here (R11).

import * as THREE from "three";
import { attach, ellipsoid, jointAt as J, mount, rigidTube, skinTube } from "./rig.js";
import { cloakBones, overTorso, sash, skirt } from "./anatomy.js";
import { spaulder } from "./gear.js";


// --- the Duelist (R7) ------------------------------------------------------------------------

/**
 * How firmly the half-cloak's chain is held, link by link from the collar (anatomy.js `cloakBones`
 * `strap`): tied at the collarbone, its top swings less than a cloak hung free. Held further down,
 * it lay in on his left leg at the cut's last key and the boot came out through it (the cloak
 * guard, 0.8 to 4.1 px).
 */
const HALF_CLOAK_HELD = [0.5, 1, 1, 1];

/** The half-cloak's length down the back, from the shoulder line to the hip (H): its bone chain's too. */
const HALF_CLOAK = 0.27;

/**
 * The cloak chain's weights a fraction `t` down a cloak (anatomy.js `cloak`): the chest at the
 * collar, then each link of the chain in turn.
 */
function chainAt(t) {
  if (t < 0.08) return { chest: 1 - t / 0.08, cloak0: t / 0.08 };
  const i0 = Math.min(3, Math.floor(t * 4 - 0.3));
  const f = THREE.MathUtils.clamp(t * 4 - 0.3 - i0, 0, 1);
  const w = { [`cloak${Math.max(0, i0)}`]: 1 - f };
  const next = `cloak${Math.min(3, i0 + 1)}`;
  w[next] = (w[next] ?? 0) + f;
  return w;
}

/**
 * A half-cloak in slate-black slung from the off (left) shoulder: round the back of the neck, over
 * the left shoulder and down the back and the outside of the arm to the hip, its hem long behind
 * and short at the side (variant A `halfCape`). Skinned like the knight's cloak: the back hangs on
 * the cloak chain (`cloakBones`) and the edge at his side rides the chest. It is cut wide of the
 * arm and stops at his side, not round the front of the arm as the variant's did: carried by the
 * arm, the cut's free arm thrown out and back lifted it over his head like a wing; hung in front of
 * it, the arm came through it. Tagged as a cloak, so the cloak guard holds the legs inside it (R11).
 */
function halfCloak(rig, mat) {
  const [, ny] = J(rig, "neck");
  const [, hy] = J(rig, "hips");
  const top = ny - 0.004;
  // the rings, top to hem: round the neck at the collar, then out over the left shoulder, wide of
  // the arm (the tube's angle runs his right 0, front π/2, left π, back 3π/2)
  const cps = [
    { p: [0, top, -0.004], r: [0.076, 0.062] },
    { p: [0.028, top - 0.026, -0.006], r: [0.17, 0.094] },
    { p: [0.04, top - 0.09, -0.008], r: [0.182, 0.11] },
    { p: [0.045, (top + hy) / 2 - 0.04, -0.01], r: [0.184, 0.118] },
    { p: [0.046, top - HALF_CLOAK, -0.014], r: [0.186, 0.122] },
  ].map((c) => ({ ...c, w: { chest: 1 } }));
  // from a little before his left side round it and across the back to right of centre
  const arc = [Math.PI - 0.25, (Math.PI * 3) / 2 + 0.5];
  // the hem lifts toward the front: long behind, short at the side
  const drop = (t, a) => -Math.max(0, Math.sin(a)) * 0.1 * t * t + Math.max(0, -Math.sin(a)) * 0.015 * t;
  // the back on the chain, the edge at his side on the chest
  const weight = (t, a) => {
    const side = THREE.MathUtils.smoothstep(Math.sin(a), -0.15, 0.4);
    const w = { chest: side };
    for (const [b, v] of Object.entries(chainAt(t))) w[b] = (w[b] ?? 0) + v * (1 - side);
    return w;
  };
  const mesh = skinTube(rig, cps, mat, { segs: 30, steps: 4, arc, drop, weight, caps: false, uv: 4, ground: false });
  mesh.userData.cloak = true;
  return mesh;
}

/** Where the wrapped front opens, as fractions of the robe's torso from the waist (0) to the neck (1). */
const V = { point: 0.16, at: Math.PI / 2 - 0.28, right: -0.2, left: 0.68 };

/**
 * The robe's body (R7): wrapped closed across the chest, the left panel over the right in a deep V
 * to the sash, drawn in under the torso inside the V so what it is wrapped over shows there. The V's
 * point lies right of centre where the left panel crosses over; its left edge is the long one.
 */
function wrappedBody(rig, mat, hy) {
  const shape = (t, a) => {
    if (t < V.point) return 1;
    const u = (t - V.point) / (1 - V.point);
    const lo = V.at + V.right * u;
    const hi = V.at + V.left * u;
    return a > lo && a < hi ? 0.75 : 1;
  };
  overTorso(rig, mat, { from: hy - 0.012, pad: 0.012, segs: 96, shape });
}

/**
 * Wide sleeves over both arms from the shoulder to the middle of the forearm, open at the cuff, so
 * the vambrace and the bracer come out of them: the arm's own tube (anatomy.js `arms`), to its
 * fifth ring, flared toward the mouth.
 */
function wideSleeves(rig, mat, r) {
  const ar = rig.p.armR * r;
  const flare = [1.12, 1.12, 1.16, 1.3, 1.55, 1.8];
  for (const s of ["L", "R"]) {
    const [x, uy] = J(rig, `upperArm${s}`);
    const [, fy] = J(rig, `foreArm${s}`);
    const cps = [
      { p: [x * 0.92, uy + 0.022, 0], r: [0.036 * ar, 0.042 * ar], w: { chest: 0.5, [`upperArm${s}`]: 0.5 } },
      { p: [x, uy - 0.012, 0], r: [0.046 * ar, 0.047 * ar], w: { [`upperArm${s}`]: 0.85, chest: 0.15 } },
      { p: [x, uy - 0.07, 0.002], r: [0.039 * ar, 0.042 * ar], w: { [`upperArm${s}`]: 1 } },
      { p: [x, fy + 0.03, 0], r: [0.032 * ar, 0.033 * ar], w: { [`upperArm${s}`]: 1 } },
      { p: [x, fy - 0.018, 0.002], r: [0.033 * ar, 0.033 * ar], w: { [`foreArm${s}`]: 1 } },
      { p: [x, fy - 0.06, 0.005], r: [0.036 * ar, 0.033 * ar], w: { [`foreArm${s}`]: 1 } },
    ].map((c, i) => ({ ...c, r: c.r.map((v) => v * flare[i]) }));
    skinTube(rig, cps, mat, { segs: 16, steps: 4, caps: false, uv: 5, ground: false });
  }
}

/** The robe's skirts, split at both sides from the sash down: a front panel and a back one. */
const SPLIT = 0.22;
const PANELS = [
  [SPLIT, Math.PI - SPLIT],
  [Math.PI + SPLIT, Math.PI * 2 - SPLIT],
];

/**
 * The robe's cut below the sash (R7, R11): to mid-calf over the tall boots, hung as the mage's robe
 * is (the thigh carrying the cloth over the knee it bends, the panels below it), so the legs stay
 * inside it through the run, the walk, the cut and the parry. The panels carry more of it than the
 * mage's (0.55, not 0.35): his run's stride is longer, and at her 0.35 his leading knee came out
 * through the front panel by 6.3 px on the run's first key. 0.52 to 0.6 all pass every clip.
 */
const ROBE = {
  bottom: 0.16,
  rBottom: [0.15, 0.132],
  legFollow: 0.5,
  panelWeight: 0.55,
  kneeCover: 0.05,
  trail: 0.02,
  segs: 32,
};

/**
 * How the robe's back panel is carried in the run (FS-JS7C8 § Change: The mercenary's sprint and
 * trailing sword, owner 2026-11-23: 「改 Duelist 長袍」): its spring (anatomy.js `skirtBones`,
 * `skirtB`) drags back further with his speed (`drag`, was 0.2) and may swing further (`limit`, was
 * 0.8 rad), so in the sprint the back panel flies out behind over the heel kick (the shared sprint's
 * swing shin folding to 1.8 rad), which came out through it by 3.62 px on the run's second key.
 * Standing (no speed) it hangs as before; the cut is unchanged. The other panels, and the base's and
 * the Sellsword's coats, keep the shared springs. 0.38 to 0.5 with 1 to 1.4 all pass every clip.
 * Given to the back panel alone through the mercenary's skirt springs (`skirtSprings`, cast.js
 * `mercenary`; anatomy.js `skirtBones`' per-bone options).
 */
const ROBE_BACK_CARRY = { drag: 0.4, limit: 1.1 };

/** A wide sash wound twice about the waist: a deep band with the second turn standing over it. */
function woundSash(rig, mat, o) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  sash(rig, mat, { ...o, depth: 0.07, pad: 0.014 });
  const pad = 0.024;
  const turn = rigidTube(
    H,
    [
      { p: [0, hy - 0.004, 0.002], r: [0.102 * rig.p.hipW + pad, 0.081 * rig.p.torsoD + pad] },
      { p: [0, hy + 0.03, 0.004], r: [0.099 * rig.p.torsoW + pad, 0.079 * rig.p.torsoD + pad] },
    ],
    { segs: 24, steps: 2, caps: false },
  );
  attach(rig, "hips", turn, mat, [0, 0, 0]);
}

/**
 * The Duelist (R7): variant A's half-cloak from the off shoulder on cloak bones in place of the left
 * spaulder, over a robe in faded madder wrapped left over right in a deep V, wide-sleeved and
 * split-skirted to mid-calf, girt with a wide slate-black sash wound twice. "Almost" samurai: a
 * cut, not a costume, so no lacing and no topknot. The vambrace, blade, hair and beard stay; the
 * knee cop goes under the robe.
 */
export const duelist = {
  // the robe's under-layer, showing in the V, is the breeches' dark wool
  mats: (F) => ({ torso: F.breeches, arms: F.duelistRobe, coat: F.duelistRobe, sash: F.duelistSlate }),
  opts: { coat: ROBE, skirtSprings: { skirtB: ROBE_BACK_CARRY } },
  omit: ["spaulder", "collar", "kneeCop"],
  bones: (rig) => cloakBones(rig, { length: HALF_CLOAK, drag: 0.34, strap: HALF_CLOAK_HELD }),
  swap: {
    coat: (rig, { mat, o }) => {
      for (const arc of PANELS) skirt(rig, mat, { ...o, arc });
    },
    sash: (rig, { mat, o }) => woundSash(rig, mat, o),
  },
  add: (rig, { F, hy }) => {
    wrappedBody(rig, F.duelistRobe, hy);
    wideSleeves(rig, F.duelistRobe, 1.06);
    halfCloak(rig, F.duelistSlate);
  },
};

// --- the Sellsword (R8) ----------------------------------------------------------------------

/** How far the buff coat stands off the torso (H). */
const BUFF_PAD = 0.014;

/**
 * A sleeveless buff-leather coat over the arming coat, from the waist to the neck, closed down the
 * front with four brass buckles (variant B `buffJerkin`). Skinned on the torso, not rigid on the
 * chest as the variant was, so it bends with him; the sash rides over its foot.
 */
function buffCoat(rig, mat, brass) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const [, cy] = J(rig, "chest");
  const td = rig.p.torsoD;
  overTorso(rig, mat, { from: hy - 0.012, pad: BUFF_PAD, arc: [Math.PI / 2 + 0.1, Math.PI / 2 + Math.PI * 2 - 0.1] });
  // the buckles on the coat's front, which the torso's profile sets (anatomy.js `torsoProfile`)
  const front = [
    [hy + 0.06, 0.002 + 0.064 * td],
    [cy - 0.005, 0.006 + 0.074 * td],
    [cy + 0.06, 0.01 + 0.079 * td],
  ];
  const zAt = (y) => {
    const [[y0, z0], [y1, z1]] = y < front[1][0] ? [front[0], front[1]] : [front[1], front[2]];
    return z0 + ((z1 - z0) * (y - y0)) / (y1 - y0) + BUFF_PAD + 0.002;
  };
  for (let i = 0; i < 4; i++) {
    const y = hy + 0.085 + i * 0.05;
    attach(rig, "chest", new THREE.BoxGeometry(0.018 * H, 0.009 * H, 0.006 * H), brass, [0, y, zAt(y)]);
  }
}

/** A fat leather purse on its drawstring at the right hip, tied in brass (variant B `purse`). */
function purse(rig, mat, brass) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const g = mount(rig, "hips", [-0.1, hy - 0.03, 0.06], { rz: -0.1 });
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
 * The Sellsword (R8): variant B, the madder base dyed black (Kranti's pick): the arming coat and the
 * sash a charcoal black, never pure black, under a sleeveless buff-leather coat buckled in brass,
 * with a spaulder on both shoulders and a purse at the belt. The blade, vambrace, hair and beard stay.
 */
export const sellsword = {
  tones: (F) => ({ coat: F.sellBlack, sash: F.sellSash }),
  // the sash rides over the buff coat's foot
  opts: { sash: { pad: 0.02 } },
  add: (rig, { F, M }) => {
    buffCoat(rig, F.buffCoat, M.brass);
    spaulder(rig, "R", F.darkSteelDouble, { lames: 3, size: 0.98 });
    purse(rig, F.leatherDark, M.brass);
  },
};
