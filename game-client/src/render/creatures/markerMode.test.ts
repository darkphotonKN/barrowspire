import { describe, expect, it } from "vitest";
import { MARKER_MODES, markerMode, type MarkerModes } from "./markerMode";

// FS-48CTQ §A.1–2 (I-48CTQ-1): one client table says, per world and floor, whether monsters carry
// overhead plates or use the target frame. § Change: Floor 1 carries overhead markers; no floor
// uses the target frame (24, 26; I-48CTQ-4): the table names no floor now.

describe("markerMode (FS-48CTQ § Change: Floor 1 carries overhead markers, 24, 26)", () => {
  it.each([
    ["run floor 1", "run", 1],
    ["run floor 2", "run", 2],
    ["run floor 3", "run", 3],
    ["a run with no floor", "run", undefined],
    ["a field world", "field", undefined],
    ["a field world's floor 1", "field", 1],
    ["the hub", "hub", undefined],
  ] as const)("should keep %s on overhead plates", (_, world, floor) => {
    expect(markerMode(world, floor)).toBe("overhead");
  });

  it("should name no floor", () => {
    expect(MARKER_MODES).toEqual({});
  });

  it("should turn the frame on wherever a floor is added to the table, with no other change", () => {
    const table: MarkerModes = { ...MARKER_MODES, run: { ...MARKER_MODES.run, 2: "frame" } };
    expect(markerMode("run", 1, table)).toBe("overhead");
    expect(markerMode("run", 2, table)).toBe("frame");
    expect(markerMode("run", 3, table)).toBe("overhead");
    expect(markerMode("field", 2, table)).toBe("overhead");
  });
});
