import { describe, expect, it } from "vitest";
import type { ItemState } from "@/types/gameState";
import {
  STASH_CAPACITY,
  freeToMove,
  stashCountLabel,
  stashFull,
} from "./stash";

const item = (status?: string) =>
  ({ entity_id: "x", name: "x", status }) as ItemState;

describe("the stash (FS-VPD8Y R35–36)", () => {
  it("should hold 60 items, items-service's stash cap", () => {
    expect(STASH_CAPACITY).toBe(60);
  });

  it("should count as N / 60, over capacity too", () => {
    expect(stashCountLabel(0)).toBe("0 / 60");
    expect(stashCountLabel(64)).toBe("64 / 60");
  });

  it.each([
    [59, false],
    [60, true],
    [64, true],
  ])("should be full at %i items: %s (R39)", (count, full) => {
    expect(stashFull(count)).toBe(full);
  });
});

describe("freeToMove (FS-VPD8Y R39–40)", () => {
  it.each([
    ["AVAILABLE", true],
    [undefined, true],
    ["LISTED", false],
    ["IN_ESCROW", false],
    ["PENDING_SETTLEMENT", false],
  ])(
    "should read an item with status %s as free to move: %s",
    (status, free) => {
      expect(freeToMove(item(status))).toBe(free);
    },
  );
});
