// The Berserker's bearded axes (FS-1J1CB R2, R28): built on his own rig (cast.js `knight` in the
// look, warriorLooks.js), posed through his own clips, each axe's cutting edge read back from the
// mesh as the bake builds it. The edge faces forward and down in the carry and leads the swing,
// in the right hand's attack and the left hand's off-hand attack alike; the hand is never turned
// over for it (the guideline's normal grip): the head is set so in the grip frame.

import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";

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
const { applyPose, clipsFor, groundPose } = await import("./clips.js");
const { KNIGHT_SHEET } = await import("./classStyles.js");

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

/** Each axe's edge in the model (+z forward, +y up, the character's left +x), in H. */
function edges(rig, axes, p) {
  applyPose(rig, p);
  groundPose(rig);
  rig.root.updateMatrixWorld(true);
  return Object.fromEntries(
    Object.entries(axes).map(([side, axe]) => [
      side,
      { dir: axe.userData.edge.dir.clone().transformDirection(axe.matrixWorld), at: axe.userData.edge.at.clone().applyMatrix4(axe.matrixWorld).divideScalar(rig.H) },
    ]),
  );
}

const { rig, style } = knight(berserker);
const axes = axesOf(rig);
const sheet = KNIGHT_SHEET;
const clips = clipsFor(style, sheet.animations);

describe("the Berserker's axes (FS-1J1CB R2)", () => {
  it("carries a bearded axe in each hand", () => {
    expect(Object.keys(axes).sort()).toEqual(["L", "R"]);
  });

  it("holds each axe's edge forward and not up in the idle carry, on every frame", () => {
    clips.idle.forEach((p, i) => {
      const e = edges(rig, axes, p);
      for (const side of ["L", "R"]) {
        expect(e[side].dir.z, `idle @${i} ${side}: forward`).toBeGreaterThan(0);
        expect(e[side].dir.y, `idle @${i} ${side}: not up`).toBeLessThanOrEqual(0);
      }
    });
  });
});
