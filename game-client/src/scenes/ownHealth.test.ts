import { describe, expect, it } from "vitest";

import { costHealth, healthIn } from "./ownHealth";

describe("ownHealth (FS-1D6BX §Change: The container view closes when its player is hit, R19–R22)", () => {
  describe("healthIn", () => {
    it("should read a player's health and max health from their state", () => {
      expect(healthIn({ current_health: 70, max_health: 100 })).toEqual({ current: 70, max: 100 });
    });

    it.each([
      ["no player", null],
      ["no player", undefined],
      ["a player whose state carries no health", { max_health: 100 }],
    ])("should read nothing from %s", (_what, player) => {
      expect(healthIn(player)).toBeUndefined();
    });
  });

  describe("costHealth", () => {
    it.each([
      ["a hit", { current: 100, max: 100 }, { current: 90, max: 100 }, true],
      ["a killing hit", { current: 5, max: 100 }, { current: 0, max: 100 }, true],
      ["a hit with no max health sent", { current: 100 }, { current: 99 }, true],
      ["the same health (a parried strike)", { current: 100, max: 100 }, { current: 100, max: 100 }, false],
      ["more health (a heal)", { current: 60, max: 100 }, { current: 80, max: 100 }, false],
      ["nothing seen before (the first state of a start)", undefined, { current: 40, max: 100 }, false],
      ["gear off: health down with max health, by as much", { current: 100, max: 100 }, { current: 80, max: 80 }, false],
      ["gear off at less than full: health down by less than max health", { current: 85, max: 100 }, { current: 80, max: 80 }, false],
      ["gear off and a hit in one state: health down by more than max health", { current: 100, max: 100 }, { current: 70, max: 80 }, true],
      // the server clamps health to the new max health, it does not lower it by as much (gear.go applyMaxima)
      ["gear off below the new max health: health stays", { current: 60, max: 100 }, { current: 60, max: 80 }, false],
      ["gear off and a hit below the new max health: health down by less than max health", { current: 60, max: 100 }, { current: 50, max: 80 }, true],
      ["gear on and a hit in one state", { current: 80, max: 80 }, { current: 70, max: 100 }, true],
      ["max health first sent in this state", { current: 100 }, { current: 90, max: 100 }, true],
    ])("should say %s → %s", (_what, before, now, cost) => {
      expect(costHealth(before, now)).toBe(cost);
    });
  });
});
