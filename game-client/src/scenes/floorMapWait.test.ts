import { describe, expect, it } from "vitest";
import { FloorMapWait } from "./floorMapWait";

/** The asks `wait` makes over snapshots of `floor` at each time, its map held or not. */
const asks = (wait: FloorMapWait, frames: [floor: number | undefined, held: boolean, now: number][]) =>
  frames.filter(([floor, held, now]) => wait.due(floor, held, now)).map(([, , now]) => now);

describe("FloorMapWait (FS-KE075 §H.41)", () => {
  it("asks once the floor has gone a second without its map, then every second", () => {
    const wait = new FloorMapWait();
    const frames = Array.from({ length: 110 }, (_, i) => [2, false, 1000 + i * 33] as [number, boolean, number]);
    expect(asks(wait, frames)).toEqual([2023, 3046, 4069]);
  });

  it("never asks while the floor's map is held", () => {
    const wait = new FloorMapWait();
    expect(asks(wait, [[1, true, 0], [1, true, 1500], [1, true, 4000]])).toEqual([]);
  });

  it("starts the second again for a new floor without a map", () => {
    const wait = new FloorMapWait();
    expect(asks(wait, [[1, false, 0], [1, false, 1000], [2, false, 1500], [2, false, 2400], [2, false, 2500]])).toEqual([1000, 2500]);
  });

  it("forgets the wait once the map comes", () => {
    const wait = new FloorMapWait();
    expect(asks(wait, [[1, false, 0], [1, true, 900], [1, false, 1000], [1, false, 1999], [1, false, 2000]])).toEqual([2000]);
  });

  it("never asks for a world without floors, or without a clock", () => {
    const wait = new FloorMapWait();
    expect(asks(wait, [[undefined, false, 0], [undefined, false, 5000]])).toEqual([]);
    expect(asks(new FloorMapWait(), [[1, false, NaN], [1, false, NaN]])).toEqual([]);
  });
});
