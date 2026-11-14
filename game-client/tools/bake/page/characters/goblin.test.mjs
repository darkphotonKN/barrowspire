// The goblin (FS-C8VM7 §H R46): its four steps' tones hold to the owner's brief and the guideline,
// and its body, posed exactly as the bake poses it (poses.js), keeps its legs inside its
// loincloth. The bake page paints with canvases; here every material is a plain one, and the
// palette is palette.js's own mix and shade over BARROW.

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
  return { fabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const goblins = await import("./goblin.js");
const { GOBLIN_STEPS } = goblins;
const { toneOf } = await import("./variantTones.js");
const { characterPoses } = await import("./poses.js");
const { clearanceError, clearanceLimit, legClearance, mirroredGarment } = await import("./clearance.js");

function luminance(c) {
  const [r, g, b] = rgb(c).map((v) => {
    const x = Math.min(255, Math.max(0, v)) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function saturation(c) {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}
const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

const STEPS = ["goblin", "goblin_cutthroat", "goblin_reaver", "goblin_warchief"];
const skin = (step) => toneOf(mix, shade, GOBLIN_STEPS[step].skin);
const LOOKS = [
  ["goblin", goblins.goblin],
  ["goblinShield", goblins.goblinShield],
  ["goblinWarchiefShield", goblins.goblinWarchiefShield],
];

describe("the goblin's tones (FS-C8VM7 §H R46)", () => {
  it("has the four variants' steps, in order", () => {
    expect(Object.keys(GOBLIN_STEPS)).toEqual(STEPS);
  });

  it("mixes only existing BARROW tokens (ADR-0013)", () => {
    for (const step of Object.values(GOBLIN_STEPS))
      for (const r of Object.values(step)) {
        expect(BARROW).toHaveProperty(r.base);
        for (const [token] of r.steps ?? []) expect(BARROW).toHaveProperty(token);
      }
  });

  it.each(STEPS)("gives %s a green hide, darker and duller than arcane (which means safe)", (step) => {
    const [r, g, b] = skin(step);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(luminance(skin(step))).toBeLessThan(luminance("arcane"));
    expect(saturation(skin(step))).toBeLessThan(saturation("arcane"));
  });

  it.each(STEPS.slice(1).map((s, i) => [s, STEPS[i]]))("deepens %s's hide below %s's, and sets it apart", (step, below) => {
    expect(luminance(skin(step))).toBeLessThan(luminance(skin(below)));
    expect(distance(skin(step), skin(below))).toBeGreaterThan(12);
  });
});

describe("the goblin's body (FS-C8VM7 §H R46)", () => {
  it.each(LOOKS)("%s keeps its legs inside its loincloth through every clip but the death, on its own weighting", (name, build) => {
    const { rig, poses } = characterPoses({ name, build });
    expect(mirroredGarment(rig)).toBe(false);
    const clips = legClearance(rig, poses);
    for (const [anim, c] of Object.entries(clips ?? {})) expect(c.px, `${anim} frame ${c.frame}`).toBeLessThanOrEqual(clearanceLimit(1));
    expect(clearanceError(`creature_${name}_base`, clips, { mirrored: false })).toBeNull();
  });

  it("is built big-headed on short legs, not on a player's proportions", () => {
    const { rig } = goblins.goblin();
    expect(rig.p.headR).toBeGreaterThan(0.062);
    expect(rig.p.hipY).toBeLessThan(0.52);
  });

  it("carries a buckler only in the shield look", () => {
    const count = (build) => {
      const { rig } = build();
      return rig.bones.foreArmL.children.filter((o) => o.isGroup).length;
    };
    expect(count(goblins.goblinShield)).toBe(count(goblins.goblin) + 1);
  });
});
