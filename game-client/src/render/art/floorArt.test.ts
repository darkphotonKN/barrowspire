import { describe, expect, it, vi } from "vitest";
import type { OnDemandArt } from "./phaser";
import { FloorPoolArt } from "./floorArt";

/** The scene's on-demand art as the floor sees it: what it holds, what it was asked. */
function fakeArt(held: string[] = []) {
  const holding = new Set(held);
  const prefetched: string[][] = [];
  const released: string[][] = [];
  let landedWith: (group: string) => void = () => {};
  const art: Pick<OnDemandArt, "prefetch" | "release" | "holding"> = {
    prefetch: (groups, landed) => {
      prefetched.push([...groups]);
      landedWith = landed;
      for (const group of groups) holding.add(group);
    },
    release: (groups) => {
      released.push([...groups]);
      for (const group of groups) holding.delete(group);
    },
    holding: () => [...holding],
  };
  return { art, prefetched, released, holding, land: (group: string) => landedWith(group) };
}

const map = (floor: number, enemy_pool?: string[]) => ({ floor, ...(enemy_pool ? { enemy_pool } : {}) });

describe("a floor's pool art (FS-C8VM7 §G R42-R43, ADR-0081 Decisions 3-4)", () => {
  it("should queue the pool's groups and evict the held variant groups it does not name", () => {
    const { art, prefetched, released } = fakeArt(["ghast", "shade"]);
    const floor = new FloorPoolArt(art, vi.fn());

    floor.see(map(3, ["ghoul", "ghast", "ogre", "ogre_mauler"]), 3, []);

    expect(prefetched).toEqual([["ghast", "ogre", "ogre_mauler"]]);
    expect(released).toEqual([["shade"]]);
  });

  it("should keep a group both floors name, and never touch the blood demon's", () => {
    const { art, released, holding } = fakeArt(["ghast", "blood_demon"]);
    new FloorPoolArt(art, vi.fn()).see(map(2, ["ghast"]), 2, []);
    expect(released).toEqual([]);
    expect([...holding].sort()).toEqual(["blood_demon", "ghast"]);
  });

  it("should fetch with the map, and evict only once the scene stands on its floor, the old floor's monsters gone", () => {
    const { art, prefetched, released } = fakeArt(["shade"]);
    const floor = new FloorPoolArt(art, vi.fn());

    // the climb's map comes before the new floor's first snapshot
    floor.see(map(4, ["ogre"]), 3, ["shade"]);
    expect(prefetched).toEqual([["ogre"]]);
    expect(released).toEqual([]);

    floor.see(map(4, ["ogre"]), 4, ["ogre"]);
    expect(released).toEqual([["shade"]]);
    expect(prefetched).toHaveLength(1);
  });

  it("should not evict a group a listed monster is drawn from: a champion met before a late map", () => {
    const { art, released } = fakeArt(["ghast", "shade", "phantom"]);
    new FloorPoolArt(art, vi.fn()).see(map(5, ["ogre"]), 5, ["ghast", "ogre", "ghoul"]);
    expect(released).toEqual([["shade", "phantom"]]);
  });

  it("should neither fetch nor evict for a map without enemy_pool (an older server)", () => {
    const { art, prefetched, released } = fakeArt(["shade"]);
    const floor = new FloorPoolArt(art, vi.fn());
    floor.see(map(2), 2, []);
    floor.see(undefined, 2, []);
    expect(prefetched).toEqual([]);
    expect(released).toEqual([]);
  });

  it("should not refetch or evict for a re-sent map of the same floor (ADR-0060)", () => {
    const { art, prefetched, released, holding } = fakeArt(["shade"]);
    const floor = new FloorPoolArt(art, vi.fn());
    floor.see(map(2, ["ghast"]), 2, []);
    holding.add("phantom"); // met on sight since
    floor.see(map(2, ["ghast"]), 2, []);
    floor.see(map(2, ["ghast"]), 2, ["phantom"]);
    expect(prefetched).toEqual([["ghast"]]);
    expect(released).toEqual([["shade"]]);
  });

  it("should fetch and evict again for the next floor's map", () => {
    const { art, prefetched, released } = fakeArt();
    const floor = new FloorPoolArt(art, vi.fn());
    floor.see(map(1, ["ghast"]), 1, []);
    floor.see(map(2, ["shade"]), 2, []);
    expect(prefetched).toEqual([["ghast"], ["shade"]]);
    expect(released).toEqual([["ghast"]]);
  });

  it("should tell the roster which group landed, to re-dress its stand-ins", () => {
    const { art, land } = fakeArt();
    const redress = vi.fn();
    new FloorPoolArt(art, redress).see(map(2, ["ghast"]), 2, []);
    land("ghast");
    expect(redress).toHaveBeenCalledWith("ghast");
  });
});
