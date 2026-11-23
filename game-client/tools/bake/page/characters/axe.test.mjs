// The Berserker's heavy bearded axes (FS-1J1CB R2, R28, §Change: Looks v2 R55): built on his own
// rig (cast.js `knight` in the look, the warrior kit's `heavyAxe`, warriorKit.js), posed through
// his own clips, each axe's cutting edge read back from the mesh as the bake builds it. The edge faces forward and down in the carry and leads the swing,
// in the right hand's attack and the left hand's off-hand attack alike; the hand is never turned
// over for it (the guideline's normal grip): the head is set so in the grip frame.

import { describe, it, expect, vi } from "vitest";

vi.mock("../palette.js", () => ({ cssRgb: () => "", mix: () => [0, 0, 0], shade: () => [0, 0, 0] }));
const blankCanvas = (width, height) => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  return { width, height, getContext: () => ctx };
};
vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (typeof k === "string" ? (t[k] ??= new THREE.MeshBasicMaterial()) : undefined) });
  return { materials: () => any, mkCanvas: blankCanvas, plain: () => any.plain, glow: () => any.glow };
});
vi.mock("./fabrics.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (typeof k === "string" ? (t[k] ??= new THREE.MeshBasicMaterial()) : undefined) });
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const { knight } = await import("./cast.js");
const { berserker } = await import("./warriorLooks.js");
const { ATTACK_TURN_LIMIT, OFFHAND_OF, applyPose, clipsFor, groundPose } = await import("./clips.js");
const { BERSERKER_SHEET, BERSERKER_STYLE } = await import("./classStyles.js");

const THREE = await import("three");
const DEG = 180 / Math.PI;

/** The figure's axes by the hand that holds each. */
function axesOf(rig) {
  const out = {};
  rig.root.traverse((o) => {
    if (!o.userData.edge) return;
    let b = o.parent;
    while (b && !/^hand[LR]$/.test(b.name)) b = b.parent;
    out[b.name.slice(-1)] = o;
  });
  return out;
}

/** Each axe in the model (+z forward, +y up, the character's left +x): its edge's way and middle (H), and its haft's way. */
function read(rig, axes, p) {
  applyPose(rig, p);
  groundPose(rig);
  rig.root.updateMatrixWorld(true);
  return Object.fromEntries(
    Object.entries(axes).map(([side, axe]) => [
      side,
      {
        dir: axe.userData.edge.dir.clone().transformDirection(axe.matrixWorld),
        at: axe.userData.edge.at.clone().applyMatrix4(axe.matrixWorld).divideScalar(rig.H),
        haft: axe.userData.edge.dir.clone().set(0, 0, 1).transformDirection(axe.matrixWorld),
      },
    ]),
  );
}

const { rig, style } = knight(berserker);
const axes = axesOf(rig);
const specs = BERSERKER_SHEET.animations;
const clips = clipsFor(style, specs);

/**
 * The attack clip the Berserker's sheet carries and its off-hand twin: `attack` and
 * `attack_offhand` alone, no class carrying an attack on the move (FS-JS7C8 § Change: The
 * knight's sprint, and the attack-on-the-move clips retired R149, R155).
 */
const TWINS = Object.entries(OFFHAND_OF).filter(([clip]) => clip in specs);

/** The attack clips by the hand that swings each: the right's, and their off-hand twins the left's. */
const SWINGS = TWINS.flatMap(([clip, twin]) => [
  [clip, "R"],
  [twin, "L"],
]);

/** How high an axe may come to the ground in a carry (H): the mercenary's sword's floor. */
const AXE_FLOOR = 0.06;
/**
 * The floor each carry is held to (H). The run's is {@link AXE_FLOOR}: his sprint's carry
 * (classStyles.js `BERSERKER_RUN_LIFT`) holds Looks v2's heavy axes (FS-1J1CB § Change: Looks v2
 * R55) at 0.062 H at the lowest. The rest and the walk are Looks v2's own carry, untouched by
 * FS-JS7C8, and its longer hafts hang lower than the old axes' 0.108 and 0.091 H: measured 0.018 H
 * in the idle and 0.0017 H in the walk (keys 1 and 5), which Looks v2 holds by the head alone
 * (over 0.03 H, below). Held here at those measures so they cannot sink further unseen; lifting
 * them to the run's floor is a change to Looks v2's approved carry, the owner's call (integrated
 * 2026-11-23).
 */
const AXE_FLOORS = { idle: 0.018, walk: 0.0015, run: AXE_FLOOR };

/** The lowest point of either axe's mesh off the ground in pose `p`, grounded as the bake grounds it (H). */
function lowestAxe(rig, axes, p) {
  applyPose(rig, p);
  groundPose(rig);
  rig.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let low = Infinity;
  for (const axe of Object.values(axes))
    axe.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) low = Math.min(low, v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y);
    });
  return low / rig.H;
}

describe("the Berserker's axes (FS-1J1CB R2)", () => {
  it("dresses in the Berserker's own style, the cleave", () => {
    expect(style).toBe(BERSERKER_STYLE);
    expect(style.attack).toBe("cleave");
  });

  it("carries a bearded axe in each hand", () => {
    expect(Object.keys(axes).sort()).toEqual(["L", "R"]);
  });

  it("makes each axe heavy (R55): a haft about 0.47 H, about 1.3x the old 0.36, wrapped in cord to a pommel knob", () => {
    for (const side of ["L", "R"]) {
      const { haft, grip, knob, bit } = axes[side].userData.axe;
      expect(haft).toBeGreaterThanOrEqual(0.45);
      expect(haft).toBeLessThanOrEqual(0.49);
      // the cord runs from the knob up past the fist
      expect(grip.from).toBeLessThan(0);
      expect(grip.to).toBeGreaterThan(0.06);
      expect(knob).toBeLessThan(grip.from);
      // a broader bit and beard than the old one's 0.118 H out from the haft and 0.125 H of edge
      expect(bit.out).toBeGreaterThan(0.14);
      expect(bit.edge).toBeGreaterThan(0.155);
    }
  });

  it.each(["idle", "walk", "run"])("keeps each heavier head off the ground through the %s", (anim) => {
    clips[anim].forEach((p, i) => {
      const e = read(rig, axes, p);
      for (const side of ["L", "R"]) expect(e[side].at.y, `${anim} @${i} ${side}`).toBeGreaterThan(0.03);
    });
  });

  it("holds each axe's edge forward and not up in the idle carry, on every frame", () => {
    clips.idle.forEach((p, i) => {
      const e = read(rig, axes, p);
      for (const side of ["L", "R"]) {
        expect(e[side].dir.z, `idle @${i} ${side}: forward`).toBeGreaterThan(0);
        expect(e[side].dir.y, `idle @${i} ${side}: not up`).toBeLessThanOrEqual(0);
        // the head hangs low, by the legs, ahead of the fist
        expect(e[side].haft.y, `idle @${i} ${side}: haft down`).toBeLessThan(0);
        expect(e[side].haft.z, `idle @${i} ${side}: haft forward`).toBeGreaterThan(0);
      }
    });
  });

  it.each(["walk", "run"])("keeps each edge facing forward through the %s, never turned up past 30°", (anim) => {
    clips[anim].forEach((p, i) => {
      const e = read(rig, axes, p);
      for (const side of ["L", "R"]) {
        expect(e[side].dir.z, `${anim} @${i} ${side}: forward`).toBeGreaterThan(0);
        expect(Math.asin(e[side].dir.y) * DEG, `${anim} @${i} ${side}: elevation`).toBeLessThanOrEqual(30);
      }
    });
  });

  // the guideline's "never on the ground", as the mercenary's sword is held (classMotion.test.mjs
  // R99): on the baked keys his heavy axes' lowest mesh points read 0.018 H in the idle, 0.0017 H in
  // the walk and 0.062 H in the run (AXE_FLOORS)
  it.each(Object.entries(AXE_FLOORS))("holds both axes off the ground on every frame of %s, at least %s H", (anim, floor) => {
    clips[anim].forEach((p, i) => expect(lowestAxe(rig, axes, p), `${anim} @${i}`).toBeGreaterThanOrEqual(floor));
  });

  it("reads an axe on the ground: lying dead, his axes are under the floor", () => {
    expect(Math.min(...clips.death.map((p) => lowestAxe(rig, axes, p)))).toBeLessThan(AXE_FLOOR);
  });

  it.each(SWINGS)("leads the head's motion with the edge at the strike of %s (the %s hand)", (anim, side) => {
    const [a, b, c] = [2, 3, 4].map((k) => read(rig, axes, clips[anim][k])[side]);
    const v = c.at.clone().sub(a.at).normalize();
    expect(b.dir.dot(v), `${anim} ${side}`).toBeGreaterThan(0);
  });

  it.each(["attack", "attack_offhand"])(`turns the swinging axe at most ATTACK_TURN_LIMIT (${ATTACK_TURN_LIMIT}°) a frame out of the carry and back to it in %s`, (anim) => {
    const side = anim === "attack" ? "R" : "L";
    const haft = (p) => read(rig, axes, p)[side].haft;
    const keys = clips[anim];
    const carry = clips.idle[0];
    for (const [step, p, q] of [
      ["carry → key 0", carry, keys[0]],
      ["key 0 → key 1", keys[0], keys[1]],
      ["key 4 → key 5", keys[4], keys[5]],
      ["key 5 → key 6", keys[5], keys[6]],
      ["key 6 → carry", keys[6], carry],
    ])
      expect(haft(p).angleTo(haft(q)) * DEG, `${anim} ${step}`).toBeLessThanOrEqual(ATTACK_TURN_LIMIT);
  });
});

describe("the Berserker's off-hand clips (FS-1J1CB §D R28)", () => {
  it("swings attack and attack_offhand alone (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired R149, R155)", () => {
    expect(TWINS).toEqual([["attack", "attack_offhand"]]);
    expect(Object.keys(specs).filter((anim) => anim.includes("attack"))).toEqual(["attack", "attack_offhand"]);
  });

  it.each(TWINS)("twins %s as %s: the same frames, fps and loop", (clip, twin) => {
    expect(specs[twin]).toEqual(specs[clip]);
    expect(clips[twin]).toHaveLength(specs[clip].frames);
  });

  it("swings the left hand's axe where the right hand's went, mirrored, at the strike", () => {
    const k = 3;
    const r = read(rig, axes, clips.attack[k]).R;
    const l = read(rig, axes, clips.attack_offhand[k]).L;
    expect(l.at.x).toBeCloseTo(-r.at.x, 2);
    expect(l.at.y).toBeCloseTo(r.at.y, 2);
    expect(l.at.z).toBeCloseTo(r.at.z, 2);
  });

  it("stands the off-hand attack on the right-hand clip's own legs", () => {
    for (const [clip, twin] of TWINS)
      clips[clip].forEach((p, i) => {
        for (const leg of ["thighL", "thighR", "shinL", "shinR", "footL", "footR", "hips"]) expect(clips[twin][i].b[leg], `${twin} @${i} ${leg}`).toEqual(p.b[leg]);
      });
  });
});
