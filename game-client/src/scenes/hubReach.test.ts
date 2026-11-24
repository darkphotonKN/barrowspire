import { describe, expect, it } from "vitest";
import { HUB_FIXED_RESIDENTS } from "@/render/world/hubInteriors";
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

  describe("in the pews and among the graves (FS-R4MYX R35)", () => {
    const folk = HUB_FIXED_RESIDENTS.map((r) => ({ at: r.at, who: r.name }));

    it.each([
      // in the aisle by the Penitent (1355, 1255) and the Chandler (1425, 1255), nearer the Penitent
      ["two worshippers, nearer the Penitent", { x: 1380, y: 1290 }, "Penitent"],
      ["two worshippers, nearer the Chandler", { x: 1400, y: 1290 }, "Chandler"],
      // between the Widower (500, 1200) and the Keener (520, 1320)
      ["two mourners, nearer the Widower", { x: 510, y: 1250 }, "Widower"],
    ])("should answer the nearest of %s", (_case, player, want) => {
      const inReach = folk.filter((f) => Math.hypot(f.at.x - player.x, f.at.y - player.y) <= 80);
      expect(inReach.length).toBeGreaterThanOrEqual(2);
      expect(nearestInReach(player, folk, 80)).toBe(want);
    });
  });
});
