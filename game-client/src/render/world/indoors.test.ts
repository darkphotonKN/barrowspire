import { describe, expect, it } from "vitest";
import type { Point } from "@/render/iso/projection";
import type { House } from "./houses";
import { buildingAt, hidden, markerShown } from "./indoors";

/**
 * Two buildings apart, and a pair sharing a wall line (FS-9PN7X §A.2, "Edge States"): the inn at
 * (100, 100) 200 × 100 with its door gap on the south edge, the store at (500, 100) 100 × 100, and
 * east room/west room meeting on x = 900.
 */
const INN: House = { id: "inn", x: 100, y: 100, width: 200, height: 100 };
const STORE: House = { id: "store", x: 500, y: 100, width: 100, height: 100 };
const WEST: House = { id: "west", x: 800, y: 100, width: 100, height: 100 };
const EAST: House = { id: "east", x: 900, y: 100, width: 100, height: 100 };
const HOUSES = [INN, STORE, WEST, EAST];

const IN_INN: Point = { x: 150, y: 150 };
const IN_STORE: Point = { x: 550, y: 150 };
/** The inn's door gap: on its south edge, inside by the edges-inclusive test. */
const INN_DOOR: Point = { x: 200, y: 200 };
/** On the line the two rooms share: inside both rects. */
const SHARED_LINE: Point = { x: 900, y: 150 };
const STREET: Point = { x: 400, y: 400 };

describe("buildingAt (FS-9PN7X §A.2, §A.3)", () => {
  it.each([
    ["outside every building", STREET, undefined],
    ["inside the inn", IN_INN, INN],
    ["inside the store", IN_STORE, STORE],
    ["in the inn's door gap", INN_DOOR, INN],
    ["on the line two rooms share, the first in order", SHARED_LINE, WEST],
    ["no player at all", undefined, undefined],
  ] as const)("should find the building %s", (_case, pos, want) => {
    expect(buildingAt(pos, HOUSES)).toBe(want);
  });

  it("should pick by order, not by which rect is nearer", () => {
    expect(buildingAt(SHARED_LINE, [EAST, WEST])).toBe(EAST);
  });

  it("should find nothing among no buildings", () => {
    expect(buildingAt(IN_INN, [])).toBeUndefined();
  });
});

describe("hidden (FS-9PN7X §C.1)", () => {
  it.each([
    // the player outside: only who is indoors goes
    ["the street, the player outside", STREET, undefined, false],
    ["the inn, the player outside", IN_INN, undefined, true],
    ["the inn's door gap, the player outside", INN_DOOR, undefined, true],
    // the player inside: everything but their own building goes
    ["the inn, the player in the inn", IN_INN, INN, false],
    ["the inn's door gap, the player in the inn", INN_DOOR, INN, false],
    ["the street, the player in the inn", STREET, INN, true],
    ["the store, the player in the inn", IN_STORE, INN, true],
    ["the inn, the player in the store", IN_INN, STORE, true],
    // the shared line belongs to the first room, as the player's own pick does
    ["the shared line, the player in the west room", SHARED_LINE, WEST, false],
    ["the shared line, the player in the east room", SHARED_LINE, EAST, true],
  ] as const)("should decide %s", (_case, pos, playerBuilding, want) => {
    expect(hidden(pos, HOUSES, playerBuilding)).toBe(want);
  });

  it("should never hide the player, wherever their own building pick lands", () => {
    for (const at of [STREET, IN_INN, INN_DOOR, IN_STORE, SHARED_LINE])
      expect(hidden(at, HOUSES, buildingAt(at, HOUSES)), JSON.stringify(at)).toBe(false);
  });

  it("should hide nothing outdoors while no building is the player's", () => {
    expect(hidden(STREET, HOUSES, undefined)).toBe(false);
    expect(hidden(STREET, [], undefined)).toBe(false);
  });
});

describe("markerShown (FS-9PN7X §C.5)", () => {
  it.each([
    ["over a closed building, the player outside", IN_STORE, undefined, true],
    ["out on the street, the player outside", STREET, undefined, true],
    ["inside the player's own building", IN_STORE, STORE, true],
    ["over another building, the player inside one", IN_STORE, INN, false],
    ["out on the street, the player inside a building", STREET, INN, false],
  ] as const)("should decide a function marker %s", (_case, pos, playerBuilding, want) => {
    expect(markerShown(pos, HOUSES, playerBuilding)).toBe(want);
  });
});
