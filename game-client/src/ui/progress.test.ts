import { describe, expect, it } from "vitest";
import {
  atCap,
  equipRefusal,
  characterProgress,
  levelLabel,
  levelRose,
  levelUpCue,
  progressOf,
  xpCount,
  xpFraction,
} from "./progress";

describe("xpFraction", () => {
  it("should be the share of the current level already earned", () => {
    expect(
      xpFraction({ experience: 150, level_floor: 100, next_level_at: 230 }),
    ).toBeCloseTo(0.385, 3);
  });

  it("should be full at the cap, where there is no next level", () => {
    expect(xpFraction({ experience: 40000, level_floor: 38530 })).toBe(1);
  });
});

describe("levelLabel", () => {
  it("should name the level below the cap", () => {
    expect(levelLabel({ level: 7, next_level_at: 1650 })).toBe("Level 7");
  });

  it("should mark the cap when there is no next level", () => {
    expect(levelLabel({ level: 20 })).toBe("Level 20 · Cap");
  });
});

describe("progressOf", () => {
  it("should read a delver's progress from the world state", () => {
    expect(
      progressOf({
        level: 3,
        experience: 250,
        level_floor: 230,
        next_level_at: 390,
      }),
    ).toEqual({
      level: 3,
      experience: 250,
      level_floor: 230,
      next_level_at: 390,
    });
  });

  it("should leave the next threshold out at the cap", () => {
    expect(
      progressOf({ level: 20, experience: 39000, level_floor: 38530 }),
    ).toEqual({
      level: 20,
      experience: 39000,
      level_floor: 38530,
    });
  });

  it("should be nothing while the server sends no level", () => {
    expect(progressOf({})).toBeNull();
  });
});

describe("characterProgress", () => {
  it("should read a server character's progress for the character list", () => {
    expect(
      characterProgress({
        level: 2,
        experience: 120,
        levelFloor: 100,
        nextLevelAt: 230,
      }),
    ).toEqual({
      level: 2,
      experience: 120,
      level_floor: 100,
      next_level_at: 230,
    });
  });

  it("should keep a capped character capped", () => {
    expect(
      atCap(
        characterProgress({ level: 20, experience: 40000, levelFloor: 38530 }),
      ),
    ).toBe(true);
  });
});

describe("levelRose", () => {
  it.each([
    ["the level went up", 3, 4, true],
    ["several levels at once (a demon kill)", 3, 6, true],
    ["the level held", 4, 4, false],
    ["the first state of a start is the baseline", undefined, 4, false],
    ["the state carries no level", 4, undefined, false],
  ])(
    "should tell a rise from a hold when %s",
    (_, previous, incoming, rose) => {
      expect(levelRose(previous, incoming)).toBe(rose);
    },
  );
});

describe("levelUpCue", () => {
  it("should name the level reached", () => {
    expect(levelUpCue(5)).toBe("Risen to level 5");
  });
});

describe("equipRefusal", () => {
  it("should carry the server's words when an equip is refused", () => {
    expect(
      equipRefusal({ success: false, message: "That requires level 5." }),
    ).toBe("That requires level 5.");
  });

  it.each([
    ["an equip that went through", { success: true, message: "Equipped." }],
    ["a refusal with nothing to say", { success: false, message: "" }],
    ["an empty frame", {}],
  ])("should say nothing for %s", (_, reply) => {
    expect(equipRefusal(reply)).toBeNull();
  });
});

describe("xpCount", () => {
  it("should count the experience earned into this level against what it takes", () => {
    expect(
      xpCount({ experience: 150, level_floor: 100, next_level_at: 230 }),
    ).toBe("50 / 130");
  });

  it("should count nothing at the cap", () => {
    expect(xpCount({ experience: 40000, level_floor: 38530 })).toBeNull();
  });
});
