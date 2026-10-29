import { describe, expect, it } from "vitest";
import { bustCrop } from "./bust";

describe("bustCrop", () => {
  it.each([
    // The Spirewarden's idle frame: 143 wide, a staff widening the bounds to the right.
    { name: "centres on the figure, not its bounds", bounds: { left: 15, top: 25, right: 100, bottom: 120 }, centreX: 51, frameWidth: 143, want: { x: 22, y: 25, size: 59 } },
    // A narrow frame, the figure near its left edge.
    { name: "keeps the crop inside the left edge", bounds: { left: 9, top: 4, right: 71, bottom: 85 }, centreX: 20, frameWidth: 77, want: { x: 0, y: 4, size: 50 } },
    { name: "keeps the crop inside the right edge", bounds: { left: 40, top: 10, right: 76, bottom: 60 }, centreX: 74, frameWidth: 77, want: { x: 46, y: 10, size: 31 } },
    { name: "never collapses to nothing", bounds: { left: 3, top: 3, right: 4, bottom: 4 }, centreX: 3, frameWidth: 8, want: { x: 3, y: 3, size: 1 } },
  ])("$name", ({ bounds, centreX, frameWidth, want }) => {
    expect(bustCrop(bounds, centreX, frameWidth)).toEqual(want);
  });
});
