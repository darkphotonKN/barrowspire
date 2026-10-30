import { describe, it, expect } from "vitest";
import { ANIMATIONS, MERC_ANIMATIONS, clipsFor, idleCycle, parryClip, pose } from "./clips.js";

const style = {
  attack: "slash",
  hold: pose({ upperArmR: [-0.2, 0, -0.2], foreArmR: [-0.7, 0, 0] }),
  guard: pose({ upperArmR: [-0.8, -0.5, 0], foreArmR: [-1.4, 0, 0], thighL: [-0.24, 0, 0.1] }, { z: -0.01 }),
};

describe("the Mercenary's parry clip (FS-MAMHR §G.35)", () => {
  it("is his alone, played once and held, and raised inside the server's 0.25 s window", () => {
    expect(Object.keys(ANIMATIONS)).not.toContain("parry");
    const { frames, fps, loop } = MERC_ANIMATIONS.parry;
    expect(loop).toBe(false);
    expect(((frames - 1) / fps) * 1000).toBeLessThan(250);
  });

  it("raises from the carry toward the guard and ends on the guard itself", () => {
    const frames = parryClip(style, MERC_ANIMATIONS.parry.frames);
    const from = idleCycle(style, 1)[0];
    const arm = (p) => p.b.upperArmR[0];
    expect(frames).toHaveLength(MERC_ANIMATIONS.parry.frames);
    expect(arm(frames[0])).toBeLessThan(arm(from));
    for (let i = 1; i < frames.length; i++) expect(arm(frames[i])).toBeLessThanOrEqual(arm(frames[i - 1]));
    expect(frames.at(-1).b.upperArmR).toEqual([-0.8, -0.5, 0]);
    expect(frames.at(-1).b.thighL).toEqual([-0.24, 0, 0.1]);
    expect(frames.at(-1).body.z).toBeCloseTo(-0.01);
  });

  it("is made by clipsFor for a sheet that asks for it, and by no other", () => {
    expect(clipsFor(style, MERC_ANIMATIONS).parry).toHaveLength(MERC_ANIMATIONS.parry.frames);
    expect(clipsFor(style).parry).toBeUndefined();
  });
});
