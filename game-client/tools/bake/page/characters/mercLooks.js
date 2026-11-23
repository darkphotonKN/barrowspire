// The mercenary's specialization looks (FS-1J1CB §A R7–R8, §Change: Looks v2 R49–R69): the Duelist
// and the Sellsword, each the swordsman in madder re-dressed on his own rig, build and clips
// (cast.js `mercenary(look)`, look.js).
//
// Each look is a look object composed from the mercenary kit (R68, mercKit.js: each look's own
// wear, the edge bindings, cuff bands and studded belt, the long-hilted blade and its scabbard, the
// broad falchion and its scabbard), so a third mercenary look is one more object here, one more id
// in cast.js `SPEC_LOOKS` and one more `specRow`, with no change to the kit's pieces or to look.js.
//
// The two are cut as opposites, each against the swordsman too (R50): the Duelist long and narrow,
// a robe let down near to the ankle and flared at the hem, deep bell sleeves, a half-cloak from
// the off shoulder down past the hip, a long slender blade on a long hilt; the Sellsword square
// and heavy, both shoulders under big spaulders, a high buff collar, the buff coat's skirts flared
// wide over the black, bucket-topped boots, a broad falchion on a long grip. Both keep the class's
// bare head and one-handed blade (R71).

import * as THREE from "three";
import { attach, ellipsoid, jointAt as J, rigidTube, skinTube } from "./rig.js";
import { cloakBones, overTorso, sash, skirt } from "./anatomy.js";
import { buckle, inHand, spaulder, studRow } from "./gear.js";
import { DUELIST_STYLE } from "./classStyles.js";
import { WEAR, bedroll, binding, cuffBand, falchion, falchionScabbard, longBlade, longScabbard, onChest, purse, studdedBelt } from "./mercKit.js";

// --- the Duelist (R7, R49, R50, R60, R63) -------------------------------------------------------

/**
 * How firmly the half-cloak's chain is held, link by link from the collar (anatomy.js `cloakBones`
 * `strap`): tied at the collarbone, its top swings less than a cloak hung free. Held further down,
 * it lay in on his left leg at the cut's last key and the boot came out through it (the cloak
 * guard, 0.8 to 4.1 px).
 */
const HALF_CLOAK_HELD = [0.5, 1, 1, 1];

/**
 * How the half-cloak is carried in the run (FS-JS7C8 § Change: The mercenary's sprint and trailing
 * sword R159, owner 2026-11-23: 「左肩還是會破圖 跑步時就讓匹夫不要這貼 飛高一點吧」): its top let
 * swing free (`strap` 1, not `HALF_CLOAK_HELD`'s 0.5, so the collar link drags back and flings as a
 * cloak hung free does) and its top two links hung turned out to his left (`tilt`, rad), so the
 * cloth over the shoulder stands off it. Held close, the sprint's free-arm pump drove his left upper
 * arm out through it on keys 3–7 (0, 0, 0, 20, 80, 113, 52, 37 edges). Every other clip keeps the
 * chain as it was (cloakBones `clips`).
 *
 * Integrated with Looks v2 (2026-11-23): his half-cloak is Looks v2's, let down to 0.42 H and its
 * chain's drag 0.26. At R159's tilt [0.4, 0.2] his left upper arm and forearm still crossed it on run
 * keys 3 and 4 (52 and 36 edges); more tilt crossed it more (0.6, 0.3: 66, 54), none still crossed it
 * (0, 0: 30, 32). In the run the chain drags back as R159's cloak did and a little more (`drag` 0.4;
 * 0.34 left 12 edges, 0.38 7) and its top hangs 0.3 out (0.25–0.35 all clear at 0.4 drag): no edge
 * of either arm crosses it on any run key.
 */
const HALF_CLOAK_RUN = { strap: [1, 1, 1, 1], tilt: [0.3, 0.2], drag: 0.4 };

/** The half-cloak's length down the back, from the shoulder line (H): its bone chain's too. */
const HALF_CLOAK = 0.42;

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
 * A half-cloak in slate-black slung from the off (left) shoulder (R49: pushed further, let down
 * past the hip and cut fuller): round the back of the neck, over the left shoulder and down the
 * back and the outside of the arm, its hem long behind and short at the side. Skinned like the
 * knight's cloak: the back hangs on the cloak chain (`cloakBones`) and the edge at his side rides
 * the chest. It is cut wide of the arm and stops at his side: carried by the arm, the cut's free
 * arm thrown out and back lifted it over his head like a wing; hung in front of it, the arm came
 * through it. Tagged as a cloak, so the cloak guard holds the legs inside it (R11).
 */
function halfCloak(rig, mat) {
  const [, ny] = J(rig, "neck");
  const [, hy] = J(rig, "hips");
  const top = ny - 0.004;
  // the rings, top to hem: round the neck at the collar, then out over the left shoulder, wide of
  // the arm (the tube's angle runs his right 0, front π/2, left π, back 3π/2)
  const cps = [
    { p: [0, top, -0.004], r: [0.076, 0.062] },
    { p: [0.028, top - 0.026, -0.006], r: [0.174, 0.096] },
    { p: [0.04, top - 0.09, -0.008], r: [0.19, 0.114] },
    { p: [0.046, (top + hy) / 2 - 0.04, -0.012], r: [0.196, 0.124] },
    { p: [0.048, top - HALF_CLOAK * 0.78, -0.016], r: [0.2, 0.13] },
    { p: [0.048, top - HALF_CLOAK, -0.02], r: [0.204, 0.136] },
  ].map((c) => ({ ...c, w: { chest: 1 } }));
  // from a little before his left side round it and across the back to right of centre
  const arc = [Math.PI - 0.25, (Math.PI * 3) / 2 + 0.55];
  // the hem lifts toward the front: long behind, short at the side
  const drop = (t, a) => -Math.max(0, Math.sin(a)) * 0.12 * t * t + Math.max(0, -Math.sin(a)) * 0.015 * t;
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
 * The robe's collar (R63: an edge binding in the cloak's slate): a band down the wrapped V's two
 * edges from the throat to just above the sash, and round the back of the neck, so the wrap reads
 * as a cut. Rigid on the chest.
 */
function robeCollar(rig, mat) {
  const [, ny] = J(rig, "neck");
  const low = 0.63;
  const high = ny - 0.012;
  const edge = (a0, a1) => Array.from({ length: 6 }, (_, i) => i / 5).map((u) => onChest(rig, a0 + (a1 - a0) * u, high + (low - high) * u, 0.017));
  const right = edge(Math.PI / 2 - 0.5, V.at + 0.02);
  const left = edge(Math.PI / 2 + 0.42, V.at + 0.06).reverse();
  const back = [Math.PI * 0.85, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75, Math.PI * 2, Math.PI * 2.15].map((a) => onChest(rig, a, ny + 0.002, 0.014));
  binding(rig, "chest", [...right, ...left, ...back], mat, { r: 0.0058 });
}

/**
 * Deep bell sleeves over both arms (R49: the shoulder and arm line re-cut), from the shoulder to
 * past the middle of the forearm, open and wide at the mouth so the vambrace and the bracer come
 * out of them, a slate band round each mouth: the arm's own tube (anatomy.js `arms`), flared toward
 * the mouth.
 */
function bellSleeves(rig, mat, band, r) {
  const ar = rig.p.armR * r;
  const flare = [1.12, 1.16, 1.3, 1.5, 1.62, 1.7, 1.76];
  for (const s of ["L", "R"]) {
    const [x, uy] = J(rig, `upperArm${s}`);
    const [, fy] = J(rig, `foreArm${s}`);
    const cps = [
      { p: [x * 0.92, uy + 0.022, 0], r: [0.036 * ar, 0.042 * ar], w: { chest: 0.5, [`upperArm${s}`]: 0.5 } },
      { p: [x, uy - 0.012, 0], r: [0.046 * ar, 0.047 * ar], w: { [`upperArm${s}`]: 0.85, chest: 0.15 } },
      { p: [x, uy - 0.07, 0.002], r: [0.039 * ar, 0.042 * ar], w: { [`upperArm${s}`]: 1 } },
      { p: [x, fy + 0.03, 0], r: [0.032 * ar, 0.033 * ar], w: { [`upperArm${s}`]: 1 } },
      { p: [x, fy - 0.018, 0.002], r: [0.033 * ar, 0.033 * ar], w: { [`foreArm${s}`]: 1 } },
      { p: [x, fy - 0.05, 0.005], r: [0.035 * ar, 0.033 * ar], w: { [`foreArm${s}`]: 1 } },
      { p: [x, fy - 0.08, 0.008], r: [0.036 * ar, 0.034 * ar], w: { [`foreArm${s}`]: 1 } },
    ].map((c, i) => ({ ...c, r: c.r.map((v) => v * flare[i]) }));
    skinTube(rig, cps, mat, { segs: 18, steps: 4, caps: false, uv: 5, ground: false });
    cuffBand(rig, `foreArm${s}`, fy - 0.078, 0.036 * ar * flare[6] + 0.002, band, { w: 0.01 });
  }
}

/**
 * How much of the thighs' swing the robe's hem follows (anatomy.js `skirt`, `legFollow`; integrated
 * with Looks v2 2026-11-23, FS-JS7C8 § Change: The mercenary's sprint and trailing sword, the
 * owner's 「改 Duelist 長袍」 again): 0.8, was Looks v2's 0.5. Looks v2's robe, longer and wider at
 * the hem (to 0.085 H, from 0.16), follows the thigh less high up, so the sprint's knee drive
 * (the shared SPRINT_STEP thigh at −0.85) pushed the upper front of each thigh out through it, by
 * 2.08 px at 1x on run frames 2 and 6 (the guard's limit 0.67). 0.7, the mercenary's own coat's,
 * reads 1.69 px; 0.75 1.60; 0.8 0.25; 0.9 0.23. Standing (no thigh swing) it hangs exactly as
 * Looks v2 cut it; in motion the hem follows his legs a little more.
 */
const ROBE_LEG_FOLLOW = 0.8;

/**
 * The robe's cut below the sash (R7, R11, R49: let down near to the ankle and flared, so his hem
 * line is a wide bell in a black fill), open down the front from the sash as the arming coat is
 * (its `arc`), hung as the mage's robe is (the thigh carrying the cloth over the knee it bends, the
 * panels below it), so the legs stay inside it through the run, the walk, the cut and the parry.
 * The panels carry more of it than the mage's (0.55, not 0.35): his run's stride is longer, and at
 * her 0.35 his leading knee came out through the front panel. v1's skirts were split at both
 * sides; flared this wide, each split's edge swung out in the run as a loose flap, so the robe is
 * whole round the back and sides and open only at the front.
 */
const ROBE = {
  bottom: 0.085,
  rBottom: [0.2, 0.18],
  legFollow: ROBE_LEG_FOLLOW,
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
 * The cord the half-cloak is tied by (R63: a strap where a garment hangs): from its edge over the
 * left breast down across the chest under the right arm, knotted at the breast.
 */
function cloakCord(rig, mat) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const pts = [
    [Math.PI / 2 + 0.95, ny - 0.03],
    [Math.PI / 2 + 0.5, cy + 0.045],
    [Math.PI / 2, cy + 0.02],
    [Math.PI / 2 - 0.55, cy - 0.005],
    [Math.PI / 2 - 1.05, cy - 0.02],
  ].map(([a, y]) => onChest(rig, a, y, 0.024));
  binding(rig, "chest", pts, mat, { r: 0.0036 });
  attach(rig, "chest", ellipsoid(0.008 * H, 0.007 * H, 0.006 * H, 8), mat, pts[1]);
}

/** Where the Duelist's scabbard rides: thrust through the sash at the left hip, slung back and out. */
const DUELIST_SCABBARD = { at: [0.1, 0.03, 0.045], tilt: 1.0, out: 0.22 };

/**
 * The Duelist (R7, §Change: Looks v2 R60, R63): variant A's half-cloak from the off shoulder on
 * cloak bones in place of the left spaulder, let down past the hip and tied across the chest by a
 * cord; a robe in faded madder wrapped left over right in a deep V, its collar bound in slate, deep
 * bell sleeves banded in slate at the mouth, skirted near to the ankle, open at the front and
 * flared at the hem; a wide slate-black sash wound twice; the long-hilted curved blade in his right
 * hand and its lacquered scabbard through the sash. "Almost" samurai: a cut, not a costume, so no
 * lacing and no topknot. His run is his own style (classStyles.js DUELIST_STYLE): under FS-JS7C8's sprint he trails the sword as the mercenary does, the arm a
 * little further out past the half-cloak (the owner, 2026-11-23: 「Duelist 也改拖劍」), the hilt clear
 * of his forearm. The vambrace, hair and beard stay; the
 * knee cop goes under the robe. His wear is kept (fabrics.js `duelist*`): polished steel,
 * blackened iron, lacquer and matte wool.
 */
export const duelist = {
  tones: WEAR.duelist,
  // the robe's under-layer, showing in the V, is the breeches' dark wool
  mats: (F) => ({ torso: F.breeches, arms: F.duelistRobe, coat: F.duelistRobe, sash: F.duelistSlate }),
  opts: { coat: ROBE, skirtSprings: { skirtB: ROBE_BACK_CARRY } },
  omit: ["spaulder", "collar", "kneeCop"],
  bones: (rig) => cloakBones(rig, { length: HALF_CLOAK, drag: 0.26, strap: HALF_CLOAK_HELD, clips: { run: HALF_CLOAK_RUN } }),
  swap: {
    sash: (rig, { mat, o }) => woundSash(rig, mat, o),
    scabbard: (rig, { F }) => longScabbard(rig, { sheath: F.duelistSaya, iron: F.duelistIron, cord: F.duelistCord }, DUELIST_SCABBARD),
    weapon: (rig, { F }) => inHand(rig, "R").add(longBlade(rig, { steel: F.duelistSteel, edge: F.duelistEdgeSteel, iron: F.duelistIron, core: F.duelistCore, cord: F.duelistCord })),
  },
  style: DUELIST_STYLE,
  add: (rig, { F, hy }) => {
    wrappedBody(rig, F.duelistRobe, hy);
    robeCollar(rig, F.duelistSlate);
    bellSleeves(rig, F.duelistRobe, F.duelistSlate, 1.06);
    halfCloak(rig, F.duelistSlate);
    cloakCord(rig, F.duelistCord);
  },
};

// --- the Sellsword (R8, R49, R50, R61, R63) -----------------------------------------------------

/** How far the buff coat stands off the torso (H). */
const BUFF_PAD = 0.014;

/**
 * The black arming coat's skirts (R49: the hem re-cut): flared wide at the hem, so his hem line is
 * square and heavy, hung as the knight's hauberk is (the thighs carrying most of it), the buff
 * coat's skirts over it (`buffSkirts`).
 */
const SELL_COAT = { bottom: 0.355, rBottom: [0.2, 0.172], legFollow: 0.72, panelWeight: 0.3 };

/**
 * A sleeveless buff-leather coat over the arming coat, from the waist to the neck, closed down the
 * front with five brass buckles and a row of brass studs down each side of the closure (R63).
 * Skinned on the torso, so it bends with him.
 */
function buffCoat(rig, mat, brass) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  overTorso(rig, mat, { from: hy - 0.012, pad: BUFF_PAD, arc: [Math.PI / 2 + 0.1, Math.PI / 2 + Math.PI * 2 - 0.1] });
  for (let i = 0; i < 5; i++) {
    const y = hy + 0.075 + i * 0.042;
    const p = onChest(rig, Math.PI / 2, y, BUFF_PAD + 0.003);
    // under the chest's profile (onChest's lowest ring) the belly draws in a little
    if (y < J(rig, "chest")[1] - 0.03) p[2] -= 0.004;
    attach(rig, "chest", new THREE.BoxGeometry(0.018 * H, 0.009 * H, 0.006 * H), brass, p);
  }
  const rows = [-1, 1].map((s) => Array.from({ length: 6 }, (_, i) => onChest(rig, Math.PI / 2 + s * 0.2, hy + 0.08 + i * 0.034, BUFF_PAD + 0.002)));
  for (const pts of rows) studRow(rig, "chest", pts.filter((p) => p[1] > J(rig, "chest")[1] - 0.04), brass, { r: 0.0036, normal: ([px, , pz]) => [px, 0, pz] });
}

/**
 * The buff coat's skirts over the black arming coat's (R49): four tabbed panels, split at the
 * front, the sides and the back, cut on the arming coat's own rig (anatomy.js `skirt({ over })`) so
 * the black never comes out through them, stopping short of its hem so a band of black shows below.
 */
function buffSkirts(rig, mat, coat) {
  const arcs = [
    [Math.PI / 2 + 0.24, Math.PI - 0.1],
    [Math.PI + 0.1, (Math.PI * 3) / 2 - 0.08],
    [(Math.PI * 3) / 2 + 0.08, Math.PI * 2 - 0.1],
    [Math.PI * 2 + 0.1, Math.PI * 2 + Math.PI / 2 - 0.24],
  ];
  for (const arc of arcs) skirt(rig, mat, { over: coat, arc, bottom: coat.bottom + 0.035, rTop: coat.rTop.map((v) => v + 0.008), rBottom: coat.rBottom.map((v) => v + 0.022) });
}

/** A high standing collar of buff leather, flared at its lip, open a little at the throat (R49: his neck and shoulder line squared). */
function buffCollar(rig, mat) {
  const [, ny] = J(rig, "neck");
  const gap = 0.45;
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny - 0.018, 0.002], r: [0.062, 0.058] },
      { p: [0, ny + 0.02, -0.002], r: [0.06, 0.057] },
      { p: [0, ny + 0.048, -0.008], r: [0.068, 0.064] },
    ],
    { segs: 22, steps: 3, caps: false, arc: [Math.PI / 2 + gap, Math.PI / 2 + Math.PI * 2 - gap] },
  );
  attach(rig, "chest", geo, mat, [0, 0, 0]);
}

/** Buff gauntlet cuffs, flared wide over both wrists (R49: the arm's line re-cut, R63: a contrasting cuff). */
function gauntletCuffs(rig, mat, { wy }) {
  for (const s of ["L", "R"]) {
    const [x] = J(rig, `foreArm${s}`);
    const geo = rigidTube(
      rig.H,
      [
        { p: [x, wy + 0.072, 0.002], r: [0.06, 0.058] },
        { p: [x, wy + 0.03, 0.002], r: [0.046, 0.045] },
        { p: [x, wy + 0.004, 0.002], r: [0.04, 0.04] },
      ],
      { segs: 16, steps: 2, caps: false },
    );
    attach(rig, `foreArm${s}`, geo, mat, [0, 0, 0]);
  }
}

/** Bucket tops on his tall boots: a stiff leather cuff flared out over each knee's foot (R49: the leg line re-cut). */
function bootTops(rig, mat) {
  for (const s of ["L", "R"]) cuffBand(rig, `shin${s}`, 0.212, 0.064, mat, { w: 0.056, flare: 0.74 });
}

/** Where the Sellsword's scabbard rides: slung from the sword belt on the left hip, the point back. */
const SELL_SCABBARD = { at: [0.108, -0.02, 0.03], tilt: 0.42, out: 0.14 };

/**
 * The Sellsword (R8, §Change: Looks v2 R61, R63): variant B, the madder base dyed black (Kranti's
 * pick), pushed further and squared off: the arming coat in charcoal black, never pure black, its
 * skirts flared wide, under a sleeveless buff-leather coat buckled and studded in brass, its own
 * tabbed skirts over the black; a high buff collar; a big spaulder on each shoulder; flared buff
 * gauntlet cuffs; a broad studded sword belt for the sash, the purse and the scabbard's hanger
 * buckle on it; bucket-topped boots; a bedroll across his back; his hair cropped and the beard
 * grown full. A broad falchion on a long grip in his right hand and its wide scabbard slung on the
 * left hip. His wear is used hard (fabrics.js `sell*`): pitted iron, oiled leather, dull brass.
 */
export const sellsword = {
  tones: WEAR.sellsword,
  opts: {
    coat: SELL_COAT,
    hair: { tail: false },
    beard: { full: 1.35 },
    spaulder: { lames: 4, size: 1.4 },
  },
  omit: ["kneeCop"],
  swap: {
    collar: (rig, { F }) => buffCollar(rig, F.buffCoat),
    sash: (rig, { F, hy }) => studdedBelt(rig, { mat: F.sellLeather, stud: F.sellBrass, y: hy + 0.012, rx: 0.106 * rig.p.hipW + 0.02, rz: 0.082 * rig.p.torsoD + 0.02, w: 0.034 }),
    scabbard: (rig, { F }) => falchionScabbard(rig, { sheath: F.sellLeather, iron: F.sellIron }, SELL_SCABBARD),
    weapon: (rig, { F }) => inHand(rig, "R").add(falchion(rig, { steel: F.sellSteel, edge: F.sellEdge, iron: F.sellIron, grip: F.sellLeather })),
  },
  add: (rig, kit) => {
    const { F, coat } = kit;
    buffCoat(rig, F.buffCoat, F.sellBrass);
    buffSkirts(rig, F.buffCoat, coat);
    spaulder(rig, "R", F.sellPlateDouble, { lames: 4, size: 1.4 });
    gauntletCuffs(rig, F.buffCoat, kit);
    bootTops(rig, F.sellLeather);
    purse(rig, F.sellLeather, F.sellBrass);
    bedroll(rig, { roll: F.sellRoll, strap: F.sellLeather, brass: F.sellBrass });
    // the scabbard's hanger buckle on the belt over the left hip
    buckle(rig, "hips", [0.112, J(rig, "hips")[1], 0.07], F.sellBrass, { w: 0.02, ry: 0.9 });
  },
};
