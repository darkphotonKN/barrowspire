import { describe, expect, it } from "vitest";
import type { ResourceState } from "@/types/gameState";
import {
  SHADOW_SHOT_COOLDOWN_MS,
  SHADOW_SHOT_MIN_HOLD_MS,
  ShadowShotAim,
} from "./shadowShotAim";

/** The timing tests run with no resource on the wire, passed on purpose (affordable). */
const NO_RESOURCE = undefined;

describe("ShadowShotAim (FS-JTNPR req 8, 12, 13, 15)", () => {
  it("should hold the charter's numbers: 0.3 s to draw, 1.2 s between shots", () => {
    expect(SHADOW_SHOT_MIN_HOLD_MS).toBe(300);
    expect(SHADOW_SHOT_COOLDOWN_MS).toBe(1200);
  });

  it("should not be aiming until pressed, and aim once pressed", () => {
    const aim = new ShadowShotAim();
    expect(aim.aiming).toBe(false);
    expect(aim.press(1000)).toBe(true);
    expect(aim.aiming).toBe(true);
  });

  it("should not restart a hold that is already running", () => {
    const aim = new ShadowShotAim();
    aim.press(1000);
    expect(aim.press(1200)).toBe(false);
    expect(aim.release(1300, NO_RESOURCE)).toBe("fire");
  });

  it.each([
    [290, "cancel"],
    [299, "cancel"],
    [300, "fire"],
    [5000, "fire"],
  ] as const)("should answer a release held %i ms with %s", (held, outcome) => {
    const aim = new ShadowShotAim();
    aim.press(10_000);
    expect(aim.release(10_000 + held, NO_RESOURCE)).toBe(outcome);
    expect(aim.aiming).toBe(false);
  });

  it("should answer nothing to a release with no hold running", () => {
    const aim = new ShadowShotAim();
    expect(aim.release(1000, NO_RESOURCE)).toBeNull();
  });

  it("should be ready only once the hold is long enough, and stay ready however long it is held", () => {
    const aim = new ShadowShotAim();
    expect(aim.ready(0, NO_RESOURCE)).toBe(false);
    aim.press(1000);
    expect(aim.ready(1299, NO_RESOURCE)).toBe(false);
    expect(aim.ready(1300, NO_RESOURCE)).toBe(true);
    expect(aim.ready(60_000, NO_RESOURCE)).toBe(true);
  });

  it("should cancel a ready-length hold released inside 1.2 s of the last fire", () => {
    const aim = new ShadowShotAim();
    aim.press(0);
    expect(aim.release(400, NO_RESOURCE)).toBe("fire");
    aim.press(500);
    expect(aim.ready(1599, NO_RESOURCE)).toBe(false);
    expect(aim.release(1599, NO_RESOURCE)).toBe("cancel");
  });

  it("should fire again once 1.2 s have passed since the last fire, counted from the send", () => {
    const aim = new ShadowShotAim();
    aim.press(0);
    aim.release(400, NO_RESOURCE);
    aim.press(500);
    expect(aim.ready(1600, NO_RESOURCE)).toBe(true);
    expect(aim.release(1600, NO_RESOURCE)).toBe("fire");
  });

  it("should start no cooldown on a cancelled release", () => {
    const aim = new ShadowShotAim();
    aim.press(0);
    expect(aim.release(100, NO_RESOURCE)).toBe("cancel");
    aim.press(200);
    expect(aim.release(500, NO_RESOURCE)).toBe("fire");
  });

  it("should end a hold on cancel with nothing to fire, and start no cooldown", () => {
    const aim = new ShadowShotAim();
    aim.press(0);
    expect(aim.cancel()).toBe(true);
    expect(aim.aiming).toBe(false);
    expect(aim.ready(1000, NO_RESOURCE)).toBe(false);
    expect(aim.release(1000, NO_RESOURCE)).toBeNull();
    aim.press(1000);
    expect(aim.release(1300, NO_RESOURCE)).toBe("fire");
  });

  it("should report no hold to cancel when none is running", () => {
    expect(new ShadowShotAim().cancel()).toBe(false);
  });

  it("should forget the hold and the cooldown on reset (a new run)", () => {
    const aim = new ShadowShotAim();
    aim.press(0);
    aim.release(400, NO_RESOURCE);
    aim.press(500);
    aim.reset();
    expect(aim.aiming).toBe(false);
    aim.press(600);
    expect(aim.release(900, NO_RESOURCE)).toBe("fire");
  });

  describe("affordability (FS-JTNPR req 18)", () => {
    const stamina = (current: number): ResourceState => ({ kind: "stamina", current, max: 100, ability_cost: 40 });

    it.each([
      [39, "cancel"],
      [40, "fire"],
    ] as const)("should answer a ready-length, off-cooldown release at stamina %i with %s", (current, outcome) => {
      const aim = new ShadowShotAim();
      aim.press(0);
      expect(aim.ready(400, stamina(current))).toBe(outcome === "fire");
      expect(aim.release(400, stamina(current))).toBe(outcome);
    });

    it("should start no cooldown on a release it cancels for want of stamina", () => {
      const aim = new ShadowShotAim();
      aim.press(0);
      expect(aim.release(400, stamina(10))).toBe("cancel");
      aim.press(500);
      expect(aim.release(800, stamina(40))).toBe("fire");
    });

    it("should judge at release, so stamina regained during the hold counts", () => {
      const aim = new ShadowShotAim();
      aim.press(0);
      expect(aim.ready(300, stamina(30))).toBe(false);
      expect(aim.release(900, stamina(40))).toBe("fire");
    });

    it("should fire with no resource on the wire (an older server refuses it itself)", () => {
      const aim = new ShadowShotAim();
      aim.press(0);
      expect(aim.release(400, NO_RESOURCE)).toBe("fire");
    });
  });
});
