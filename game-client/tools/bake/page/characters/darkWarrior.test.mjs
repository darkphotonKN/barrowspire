// The dark warrior (FS-C8VM7 §H R46): upright, not hunched, a greatsword in both hands, its
// Reaper a deeper shade of it. Built and posed exactly as the bake poses it (poses.js), with
// plain materials (the bake page paints with canvases) and palette.js's own mix and shade over
// BARROW.

import { describe, it, expect, vi } from "vitest";
import { BARROW } from "../../../../src/utils/theme";

const rgb = (c) => {
  if (typeof c !== "string") return c;
  const n = parseInt(BARROW[c].slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t);
const shade = (c, v) => rgb(c).map((x) => x * v);

vi.mock("../palette.js", () => ({ cssRgb: () => "", mix, shade }));
vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  return { materials: () => any, mkCanvas: () => { throw new Error("no canvas in Node"); } };
});
vi.mock("./fabrics.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const THREE = await import("three");
const dw = await import("./darkWarrior.js");
const { DARK_WARRIOR_STEPS, SECOND_HAND } = dw;
const { toneOf } = await import("./variantTones.js");
const { characterPoses } = await import("./poses.js");
const { gripAt } = await import("./rig.js");

function luminance(c) {
  const [r, g, b] = rgb(c).map((v) => {
    const x = Math.min(255, Math.max(0, v)) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const tone = (step, k) => toneOf(mix, shade, DARK_WARRIOR_STEPS[step][k]);

describe("the dark warrior's tones (FS-C8VM7 §H R46)", () => {
  it("has the two variants' steps, in order", () => {
    expect(Object.keys(DARK_WARRIOR_STEPS)).toEqual(["dark_warrior", "dark_reaper"]);
  });

  it("mixes only existing BARROW tokens (ADR-0013)", () => {
    for (const step of Object.values(DARK_WARRIOR_STEPS))
      for (const r of Object.values(step)) {
        expect(BARROW).toHaveProperty(r.base);
        for (const [token] of r.steps ?? []) expect(BARROW).toHaveProperty(token);
      }
  });

  it.each(["bone", "rag"])("deepens the Reaper's %s below the Warrior's", (k) => {
    expect(luminance(tone("dark_reaper", k))).toBeLessThan(luminance(tone("dark_warrior", k)));
  });
});

describe("the dark warrior's body (FS-C8VM7 §H R46)", () => {
  const build = dw.darkWarrior;

  it("stands upright: no hunch bone, the neck not bent forward", () => {
    const { rig } = build();
    expect(rig.bones.hunch).toBeUndefined();
    expect((rig.rest.neck ?? [0])[0]).toBeGreaterThanOrEqual(0);
  });

  it("holds the greatsword in both hands through idle, walk and attack: the left fist on the grip behind the right", () => {
    const { rig, poses } = characterPoses({ name: "dark_warrior", build });
    const g = gripAt(rig, "L");
    const local = new THREE.Vector3(g[0] * rig.H - rig.bind.handL.x, g[1] * rig.H - rig.bind.handL.y, g[2] * rig.H - rig.bind.handL.z);
    let worst = 0;
    for (const p of poses.filter((x) => x.anim !== "death")) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      const mount = rig.bones.handR.children.find((c) => c.isGroup);
      const want = new THREE.Vector3(0, 0, -SECOND_HAND * rig.H).applyMatrix4(mount.children[0].matrixWorld);
      const fist = local.clone().applyMatrix4(rig.bones.handL.matrixWorld);
      worst = Math.max(worst, fist.distanceTo(want) / rig.H);
    }
    expect(worst).toBeLessThan(0.02);
  });
});
