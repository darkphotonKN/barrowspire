import { describe, expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import { PARRY_TELL_GRACE_MS } from "@/render/effects/parry";
import { BLINK } from "@/render/effects/blink";
import { fakeArt } from "@/render/effects/fakeScene";
import { ClassKitFx } from "./classKitFx";

/** A scene with just what the parry draws with: graphics that record nothing, tweens that never run. */
function scene(): Phaser.Scene {
  const g = new Proxy({}, { get: (_t, key) => (key === "destroy" ? () => {} : () => g) });
  return { add: { graphics: () => g }, tweens: { add: () => {} } } as unknown as Phaser.Scene;
}

const merc = (parry_open: boolean) => ({ parry_open, parries: 0 }) as never;

describe("ClassKitFx guarding (FS-MAMHR §G.35)", () => {
  it("should not guard before a parry was ever raised, or for another class", () => {
    const kit = new ClassKitFx(scene());
    expect(kit.guarding).toBe(false);
    kit.sync({ class: "warrior" } as never, 0);
    expect(kit.guarding).toBe(false);
  });

  it("should guard from the click, hold while the server reports the stance open, and drop when it closes", () => {
    const kit = new ClassKitFx(scene());
    kit.raiseParry(1000);
    expect(kit.guarding).toBe(true);
    kit.sync(merc(true), 1050);
    kit.follow({ x: 0, y: 0 }, 1500);
    expect(kit.guarding).toBe(true);
    kit.sync(merc(false), 1300);
    expect(kit.guarding).toBe(false);
  });

  it("should drop the guard after the click's grace when the server never opened the stance", () => {
    const kit = new ClassKitFx(scene());
    kit.raiseParry(1000);
    kit.follow({ x: 0, y: 0 }, 1000 + PARRY_TELL_GRACE_MS);
    expect(kit.guarding).toBe(false);
  });

  it("should drop the guard with the world", () => {
    const kit = new ClassKitFx(scene());
    kit.raiseParry(1000);
    kit.forget();
    expect(kit.guarding).toBe(false);
  });
});

describe("ClassKitFx Arrow Rain aim circle (FS-04EEA R38)", () => {
  it("should draw the circle on the aim, and leave none once the aim ends", () => {
    const kit = new ClassKitFx(scene());
    kit.rainAim({ x: 100, y: 100 });
    expect(kit.aimCircle?.drawn).toBe(true);
    kit.endRainAim();
    expect(kit.aimCircle?.drawn).toBe(false);
  });

  it("should drop the circle with the world", () => {
    const kit = new ClassKitFx(scene());
    kit.rainAim({ x: 100, y: 100 });
    kit.forget();
    expect(kit.aimCircle).toBeUndefined();
  });
});

/**
 * A kit over a scene whose clock runs what is due on `advance`, and an effects runtime recording what is
 * played and released (FS-04EEA §H).
 */
function kitOnStage() {
  let now = 0;
  const due: { at: number; fn: () => void; removed: boolean }[] = [];
  const time = {
    delayedCall: (delay: number, fn: () => void) => {
      const t = { at: now + delay, fn, removed: false };
      due.push(t);
      return { remove: () => void (t.removed = true) };
    },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const next = due.filter((t) => !t.removed && t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.removed = true;
      now = next.at;
      next.fn();
    }
    now = until;
  };
  const obj: Record<string, unknown> = new Proxy({}, { get: (_t, key) => (key === "destroy" ? () => {} : () => obj) });
  const stage = {
    add: { graphics: () => obj, image: () => obj },
    tweens: { add: () => ({ stop: () => {} }), addCounter: () => ({ stop: () => {} }) },
    time,
  } as unknown as Phaser.Scene;
  const fx = { play: vi.fn((..._args: unknown[]) => null), release: vi.fn() };
  const kit = new ClassKitFx(stage, { fx: () => fx as never, art: () => fakeArt });
  const played = (name: string) => fx.play.mock.calls.filter((c) => c[1] === name);
  return { kit, fx, advance, played };
}

const feet = { x: 200, y: 200 };

describe("ClassKitFx tree-ability looks (FS-04EEA §H R43–R46)", () => {
  it("should slam round the warrior and open its shock ring over the next moments", () => {
    const { kit, advance, played } = kitOnStage();
    kit.earthbreaker(feet);
    expect(played("earthbreakerSlam")).toHaveLength(1);
    expect(played("earthbreakerShock")).toHaveLength(0);
    advance(1000);
    expect(played("earthbreakerShock").length).toBeGreaterThan(0);
  });

  it("should draw the flurry for the charges spent", () => {
    const { kit, advance, played } = kitOnStage();
    kit.settleTheDebt(feet, 5);
    advance(1000);
    expect(played("flurrySlash")).toHaveLength(12);
    expect(played("flurryFlare")).toHaveLength(1);
  });

  it("should play nothing before the world has an effects runtime", () => {
    const kit = new ClassKitFx(scene());
    expect(() => {
      kit.earthbreaker(feet);
      kit.blink(feet, 0);
      kit.settleTheDebt(feet, 3);
      kit.arrowRain(feet, { x: 300, y: 200 });
      kit.landed(feet, 10);
    }).not.toThrow();
  });

  it("should cut a slam's rings still to come with the world", () => {
    const { kit, advance, played } = kitOnStage();
    kit.earthbreaker(feet);
    kit.forget();
    advance(1000);
    expect(played("earthbreakerShock")).toHaveLength(0);
  });
});

describe("ClassKitFx Blink (FS-04EEA §H R44, R41)", () => {
  it("should blink out where the mage stands, and in where the own body is placed when it jumps", () => {
    const { kit, played } = kitOnStage();
    kit.blink(feet, 1000);
    expect(played("blinkOut")[0]?.[2]).toEqual(feet);
    kit.landed({ x: 320, y: 200 }, 1100);
    expect(played("blinkIn")[0]?.[2]).toEqual({ x: 320, y: 200 });
    kit.landed({ x: 500, y: 200 }, 1200);
    expect(played("blinkIn")).toHaveLength(1);
  });

  it("should blink in for no jump without a Blink, and none once the wait ran out (a refused Blink)", () => {
    const { kit, played } = kitOnStage();
    kit.landed(feet, 100);
    kit.blink(feet, 1000);
    kit.landed({ x: 320, y: 200 }, 1001 + BLINK.landWithinMs);
    expect(played("blinkIn")).toHaveLength(0);
  });

  it("should let a Blink waiting to land go with the floor", () => {
    const { kit, played } = kitOnStage();
    kit.blink(feet, 1000);
    kit.leaveFloor();
    kit.landed({ x: 320, y: 200 }, 1100);
    expect(played("blinkIn")).toHaveLength(0);
  });
});

describe("ClassKitFx Arrow Rain (FS-04EEA §H R45; Edge States: Archer dies mid-rain)", () => {
  const rainOn = () => {
    const stage = kitOnStage();
    stage.kit.arrowRain({ x: 0, y: 0 }, { x: 200, y: 0 });
    return stage;
  };

  it("should land its volleys over the next moments", () => {
    const { kit, advance, played } = rainOn();
    expect(kit.raining).toBe(true);
    advance(2000);
    expect(played("arrowRainImpact").length).toBeGreaterThan(0);
    expect(kit.raining).toBe(false);
  });

  it.each([
    ["the archer falls", { current_health: 0 }],
    ["the archer escapes", { current_health: 50, escape: true }],
    ["the archer leaves the world", null],
  ])("should stop drawing the rain when %s", (_, me) => {
    const { kit, advance, played, fx } = rainOn();
    kit.sync(me as never, 0);
    advance(2000);
    expect(kit.raining).toBe(false);
    expect(played("arrowRainImpact")).toHaveLength(0);
    expect(fx.release).toHaveBeenCalled();
  });

  it("should keep the rain falling for an archer still in play", () => {
    const { kit } = rainOn();
    kit.sync({ current_health: 50 } as never, 0);
    expect(kit.raining).toBe(true);
  });

  it.each([
    ["a floor change", (kit: ClassKitFx) => kit.leaveFloor()],
    ["a teardown", (kit: ClassKitFx) => kit.forget()],
  ])("should stop drawing the rain on %s", (_, end) => {
    const { kit, advance, played } = rainOn();
    end(kit);
    advance(2000);
    expect(kit.raining).toBe(false);
    expect(played("arrowRainImpact")).toHaveLength(0);
  });
});
