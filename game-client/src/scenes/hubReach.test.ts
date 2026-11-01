import { describe, expect, it } from "vitest";
import { nearestInReach } from "./hubReach";

describe("nearestInReach (FS-B0H2D R28; FS-VPD8Y R34)", () => {
  const at = (x: number, y = 0) => ({ x, y });

  it("should answer the nearest within reach", () => {
    expect(
      nearestInReach(
        at(0),
        [
          { at: at(50), who: "far" },
          { at: at(20), who: "near" },
        ],
        80,
      ),
    ).toBe("near");
  });

  it("should answer no one past the reach, and no one when there is no one", () => {
    expect(
      nearestInReach(at(0), [{ at: at(81), who: "out" }], 80),
    ).toBeUndefined();
    expect(nearestInReach(at(0), [], 80)).toBeUndefined();
  });

  it("should take the reach's edge as in, and give a tie to the one listed first", () => {
    expect(nearestInReach(at(0), [{ at: at(80), who: "edge" }], 80)).toBe(
      "edge",
    );
    expect(
      nearestInReach(
        at(0),
        [
          { at: at(30), who: "npc" },
          { at: at(-30), who: "chest" },
        ],
        80,
      ),
    ).toBe("npc");
  });

  it("should measure in world space, on both axes", () => {
    expect(nearestInReach(at(0), [{ at: at(60, 60), who: "diag" }], 80)).toBe(
      undefined,
    );
    expect(nearestInReach(at(0), [{ at: at(50, 50), who: "diag" }], 80)).toBe(
      "diag",
    );
  });
});
