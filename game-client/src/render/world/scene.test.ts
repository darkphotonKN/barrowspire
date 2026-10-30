import { describe, expect, it } from "vitest";
// a type only: the module itself pulls in Phaser
import type { GroundWorld } from "./scene";

describe("GroundLayer's world (FS-KSD6K §Requirements 16)", () => {
  // checked by `tsc`: a faded edge erases everything past the map, so nothing may be laid there
  it("should refuse aprons or a margin beside a faded edge", () => {
    const faded: GroundWorld = {
      width: 1,
      height: 1,
      kind: "field",
      fadeEdge: true,
    };
    // @ts-expect-error past a faded edge nothing is drawn: no aprons
    const aproned: GroundWorld = { ...faded, aprons: [] };
    // @ts-expect-error nor a margin of ground past the map
    const margined: GroundWorld = { ...faded, margin: 48 };
    const hub: GroundWorld = {
      width: 1,
      height: 1,
      kind: "hub",
      aprons: [],
      margin: 0,
    };
    expect([aproned, margined, hub]).toHaveLength(3);
  });
});
