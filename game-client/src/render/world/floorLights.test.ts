import { describe, expect, it } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import {
  FIXED_LIGHT_CAP,
  budgetLights,
  interactablePool,
  type FixedLight,
  type FixedLightKind,
} from "./floorLights";

/** `n` lights of one kind, spread along a row so each has its own place. */
const row = (kind: FixedLightKind, n: number, y: number): FixedLight<string>[] =>
  [...Array(n).keys()].map((i) => ({
    kind,
    at: { x: 40 + i * 37, y },
    light: `${kind}${i}`,
  }));

const count = (lights: FixedLight<string>[], kind: FixedLightKind) =>
  lights.filter((l) => l.kind === kind).length;

describe("budgetLights (FS-8RBQY §C.6)", () => {
  it("should cap a floor's fixed lights at 24", () => {
    expect(FIXED_LIGHT_CAP).toBe(24);
  });

  it("should keep every light of a floor under the cap, in the order given", () => {
    const lights = [...row("slit", 10, 0), ...row("sconce", 10, 100), ...row("stairs", 1, 200)];
    expect(budgetLights(lights)).toEqual(lights);
  });

  it("should drop arrow slits first", () => {
    const kept = budgetLights([
      ...row("slit", 10, 0),
      ...row("sconce", 14, 100),
      ...row("brazier", 2, 300),
      ...row("stairs", 1, 200),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "slit")).toBe(7);
    expect(count(kept, "brazier")).toBe(2);
    expect(count(kept, "sconce")).toBe(14);
  });

  it("should drop braziers once the slits are gone, then sconces", () => {
    const kept = budgetLights([
      ...row("slit", 4, 0),
      ...row("brazier", 3, 300),
      ...row("sconce", 25, 100),
      ...row("stairs", 1, 200),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "slit")).toBe(0);
    expect(count(kept, "brazier")).toBe(0);
    expect(count(kept, "sconce")).toBe(23);
  });

  it("should drop an interactable's pool only once every slit, brazier and sconce is gone", () => {
    const kept = budgetLights([
      ...row("interactable", 2, 400),
      ...row("sconce", 23, 100),
      ...row("slit", 3, 0),
      ...row("stairs", 1, 200),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "interactable")).toBe(2);
    expect(count(kept, "sconce")).toBe(21);
    const starved = budgetLights([...row("interactable", 3, 400), ...row("stairs", 1, 200)], 2);
    expect(count(starved, "interactable")).toBe(1);
    expect(count(starved, "stairs")).toBe(1);
  });

  it("should light an interactable with a faint amber pool, dimmer and smaller than a sconce's", () => {
    const pool = interactablePool({ x: 10, y: 20 }, 3);
    expect(pool.color).toBe(BARROW_HEX.amber);
    expect(pool).toMatchObject({ x: 10, y: 20, seed: 3 });
    expect(pool.radius).toBeLessThan(150);
    expect(pool.intensity).toBeLessThan(0.7);
  });

  it("should never drop the stairs pool, however crowded the floor", () => {
    const kept = budgetLights([
      ...row("stairs", 1, 200),
      ...row("sconce", 40, 100),
      ...row("slit", 10, 0),
      ...row("brazier", 4, 300),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "stairs")).toBe(1);
  });

  it("should drop the same lights for the same floor whatever order they arrive in", () => {
    const lights = [...row("slit", 10, 0), ...row("sconce", 16, 100), ...row("stairs", 1, 200)];
    const names = (l: FixedLight<string>[]) => l.map((x) => x.light).sort();
    expect(names(budgetLights([...lights].reverse()))).toEqual(names(budgetLights(lights)));
  });

  it("should spread the dropped slits along the wall rather than take one end", () => {
    const kept = budgetLights([...row("slit", 10, 0), ...row("sconce", 19, 100)]);
    const dropped = row("slit", 10, 0)
      .map((l, i) => (kept.some((k) => k.light === l.light) ? -1 : i))
      .filter((i) => i >= 0);
    expect(dropped).toHaveLength(5);
    expect(dropped).not.toEqual([5, 6, 7, 8, 9]);
    expect(dropped).not.toEqual([0, 1, 2, 3, 4]);
  });

  it("should fit a smaller cap, as the room left after an earlier stamping", () => {
    const kept = budgetLights([...row("slit", 3, 0), ...row("stairs", 1, 200)], 2);
    expect(kept).toHaveLength(2);
    expect(count(kept, "stairs")).toBe(1);
  });
});
