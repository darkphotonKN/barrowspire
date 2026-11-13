// The ogre (FS-C8VM7 §H R46): its three steps' tones deepen with the step from BARROW alone, and
// its body, posed exactly as the bake poses it (poses.js), keeps its legs inside its kilt. The bake
// page paints with canvases; here every material is a plain one, and the palette is palette.js's
// own mix and shade over BARROW.

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

const ogres = await import("./ogre.js");
const { OGRE_STEPS } = ogres;
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
const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

const STEPS = ["ogre", "ogre_mauler", "ogre_tyrant"];
const skin = (step) => toneOf(mix, shade, OGRE_STEPS[step].skin);
// the troll's hide (fabrics.js GEAR.troll), which the ogre must not be mistaken for
const TROLL = mix(mix("slate", "barrowBrown", 0.5), "vellumDark", 0.12);

describe("the ogre's tones (FS-C8VM7 §H R46)", () => {
  it("has the three variants' steps, in order", () => {
    expect(Object.keys(OGRE_STEPS)).toEqual(STEPS);
  });

  it("mixes only existing BARROW tokens (ADR-0013)", () => {
    for (const step of Object.values(OGRE_STEPS))
      for (const r of Object.values(step)) {
        expect(BARROW).toHaveProperty(r.base);
        for (const [token] of r.steps ?? []) expect(BARROW).toHaveProperty(token);
      }
  });

  it.each(STEPS.slice(1).map((s, i) => [s, STEPS[i]]))("deepens %s's hide below %s's, and sets it apart", (step, below) => {
    expect(luminance(skin(step))).toBeLessThan(luminance(skin(below)));
    expect(distance(skin(step), skin(below))).toBeGreaterThan(20);
  });

  it("keeps its step-0 hide apart from the troll's: a warmer flesh, not mud and stone", () => {
    const [r, , b] = skin("ogre");
    expect(r - b).toBeGreaterThan(TROLL[0] - TROLL[2]);
    expect(distance(skin("ogre"), TROLL)).toBeGreaterThan(30);
  });
});

describe("the ogre's body (FS-C8VM7 §H R46)", () => {
  it("keeps its legs inside its kilt through every clip but the death, on its own weighting", () => {
    const { rig, poses } = characterPoses({ name: "ogre", build: ogres.ogre });
    expect(mirroredGarment(rig)).toBe(false);
    const clips = legClearance(rig, poses);
    for (const [anim, c] of Object.entries(clips ?? {})) expect(c.px, `${anim} frame ${c.frame}`).toBeLessThanOrEqual(clearanceLimit(1));
    expect(clearanceError("creature_ogre_base", clips, { mirrored: false })).toBeNull();
  });

  it("is built bigger than the troll (H 2.7) and walks slower (its 0.75)", () => {
    const { rig, style } = ogres.ogre();
    expect(rig.H).toBeGreaterThan(2.7);
    expect(style.speed).toBeLessThan(0.75);
  });
});
