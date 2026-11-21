import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { EffectsRuntime } from "./runtime";
import { StunTells, stunOwner } from "./stun";
import { EFFECTS } from "./table";

// FS-04EEA §H R47–R48 (I-04EEA-8): a stunned monster carries a stun tell over its head, drawn in
// code from the effects table, for as long as its action is `stunned`.

describe("stun tell entry (FS-04EEA §H R48)", () => {
  const e = EFFECTS.stunTell;

  it("should be a stream held while its owner is stunned, cut at once when it is not", () => {
    expect(e.timing.kind).toBe("stream");
    expect(e.timing.onRelease).toBe("cut");
  });

  it("should draw from baked fx sheets in pale vellum and brass, never amber or the hostile oxblood", () => {
    expect(e.sprite.texture).toBe("fx_glow");
    expect(e.particles.texture).toEqual(["fx_ember"]);
    const colours = [...e.sprite.tint, ...e.particles.tint];
    for (const c of colours) expect(c in BARROW_HEX, c).toBe(true);
    for (const c of ["amber", "amberBright", "oxblood", "oxbloodText"]) expect(colours).not.toContain(c);
  });
});

describe("StunTells (FS-04EEA §H R47)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let fx: EffectsRuntime;
  let tells: StunTells;
  const head = (id: string, x = 300, y = 200, lift = 90) => ({ id, at: { x, y }, lift });

  beforeEach(() => {
    fake = fakeScene();
    fx = new EffectsRuntime(fake.scene, fakeArt, fakeLights().lights, { warn: () => {} });
    tells = new StunTells(fx);
  });

  const glows = () => fake.live().filter((m) => m.kind === "image");

  it("should play one tell over each stunned monster's head, under its own owner key", () => {
    tells.show([head("a"), head("b", 500, 100, 60)]);
    expect(fx.playing(stunOwner("a"))).toBe(1);
    expect(fx.playing(stunOwner("b"))).toBe(1);
    // the monster's own key stays free for its claw and its other effects
    expect(fx.playing("a")).toBe(0);
    const s = worldToScreen(300, 200);
    const [x, y] = glows()[0].calls.setPosition as [number, number];
    expect(x).toBeCloseTo(s.x);
    expect(y).toBeCloseTo(s.y - 90);
  });

  it("should hold one tell per monster across frames, following it where it is drawn", () => {
    tells.show([head("a")]);
    tells.show([head("a", 340, 200)]);
    expect(fx.playing(stunOwner("a"))).toBe(1);
    expect(glows()).toHaveLength(1);
    const s = worldToScreen(340, 200);
    const [x] = glows()[0].calls.setPosition as [number, number];
    expect(x).toBeCloseTo(s.x);
  });

  it("should take a tell away once its monster is no longer stunned: moving, dead, or gone", () => {
    tells.show([head("a"), head("b")]);
    tells.show([head("b")]);
    expect(fx.playing(stunOwner("a"))).toBe(0);
    expect(fx.playing(stunOwner("b"))).toBe(1);
    tells.show([]);
    expect(fake.live()).toEqual([]);
  });

  it("should draw it again after the runtime let everything go (a floor change, a reset)", () => {
    tells.show([head("a")]);
    fx.clearAll();
    tells.show([head("a")]);
    expect(fx.playing(stunOwner("a"))).toBe(1);
  });

  it("should take every tell away on clear", () => {
    tells.show([head("a"), head("b")]);
    tells.clear();
    expect(fx.playing()).toBe(0);
    expect(fake.live()).toEqual([]);
  });
});
