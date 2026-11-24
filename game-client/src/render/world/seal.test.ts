import { describe, expect, it } from "vitest";
import type { BarrierState, SealPieceState } from "@/types/gameState";
import { MIST_DEPTH } from "@/render/effects/mist";
import { WORLD_DEPTH } from "@/render/iso/shapes";
import { BLOCK_SLIDE_SPEED, SEAL_GROUND_DEPTH, SealSet, type SealBand, type SealGrid, type WallFace } from "./seal";
import type { SealLook } from "./sealLooks";
import { INTERACT_RANGE } from "./stairs";

type Point = { x: number; y: number };

/** A stand-in for the scene: each sprite drawn and every call made on it. */
function recording() {
  type Piece = {
    look: SealLook;
    at: Point;
    band: SealBand;
    layer: number;
    calls: string[];
    lit: boolean;
    destroyed: boolean;
    destroy(): void;
  };
  const made: Piece[] = [];
  const set = new SealSet<Piece>({
    add: (look, at, band, layer) => {
      const piece: Piece = {
        look,
        at,
        band,
        layer,
        calls: [],
        lit: false,
        destroyed: false,
        destroy: () => void (piece.destroyed = true),
      };
      made.push(piece);
      return piece;
    },
    show: (piece, look) => {
      piece.look = look;
      piece.calls.push(`show ${look.sheet}/${look.frame}`);
    },
    stand: (piece, at) => {
      piece.at = at;
      piece.calls.push(`stand ${at.x},${at.y}`);
    },
    glow: (piece, _at, on) => {
      piece.lit = on;
      piece.calls.push(on ? "light" : "dark");
    },
    decal: (look, at, depthAt) => {
      const piece: Piece = {
        look,
        at,
        band: "standing",
        layer: -1,
        calls: [`decal over ${depthAt.x},${depthAt.y}`],
        lit: false,
        destroyed: false,
        destroy: () => void (piece.destroyed = true),
      };
      made.push(piece);
      return piece;
    },
  });
  const live = () => made.filter((p) => !p.destroyed);
  return { set, made, live };
}

const CELL = 80;
/** A floor of open ground 20 × 20 cells but for the cells named as rock. */
function grid(rock: string[] = []): SealGrid {
  const shut = new Set(rock);
  return { cell: CELL, walkable: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 20 && !shut.has(`${x},${y}`) };
}
const centre = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });

const piece = (over: Partial<SealPieceState> & Pick<SealPieceState, "kind">): SealPieceState => ({
  entity_id: `${over.kind}-1`,
  position: centre(2, 2),
  cell: { x: 2, y: 2 },
  active: false,
  ...over,
});
const barrier = (over: Partial<BarrierState> & Pick<BarrierState, "kind" | "cells">): BarrierState => ({
  entity_id: `${over.kind}-1`,
  open: false,
  ...over,
});

describe("SealSet: the pieces (FS-5FZ4J §J R51)", () => {
  it("should draw each piece at its position from its sheet, a lever's glyph over it on the layer above", () => {
    const { set, live } = recording();
    set.sync({ seal_pieces: [piece({ kind: "lever", glyph: "eye" }), piece({ kind: "mural", entity_id: "m", position: { x: 500, y: 40 } })] }, grid());
    expect(live().map(({ look, at, band, layer }) => ({ look, at, band, layer }))).toEqual([
      { look: { sheet: "seal_lever", frame: "up" }, at: centre(2, 2), band: "standing", layer: 0 },
      { look: { sheet: "seal_lever", frame: "glyph_eye" }, at: centre(2, 2), band: "standing", layer: 1 },
      { look: { sheet: "mural", frame: "default" }, at: { x: 500, y: 40 }, band: "standing", layer: 0 },
    ]);
  });

  it("should keep the ground band over the floor's ground, under the mist and every standing thing", () => {
    // the floor's ground is at -1 (`GROUND_DEPTH`, a Phaser module)
    expect(SEAL_GROUND_DEPTH).toBeGreaterThan(-1);
    expect(SEAL_GROUND_DEPTH).toBeLessThan(MIST_DEPTH);
    expect(SEAL_GROUND_DEPTH).toBeLessThan(WORLD_DEPTH);
  });

  it("should lay a pressure plate in the ground band, under the bodies standing on it", () => {
    const { set, live } = recording();
    set.sync({ seal_pieces: [piece({ kind: "plate" })] }, grid());
    expect(live()[0].band).toBe("ground");
  });

  it("should turn a piece to the frame its state names, in place, drawn once", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [piece({ kind: "lever", glyph: "crow" }), piece({ kind: "plate", entity_id: "p" })] }, grid());
    set.sync({ seal_pieces: [piece({ kind: "lever", glyph: "crow", active: true }), piece({ kind: "plate", entity_id: "p", active: true })] }, grid());
    expect(made).toHaveLength(3);
    expect(made[0].look).toEqual({ sheet: "seal_lever", frame: "down" });
    expect(made[1].calls).toEqual([]);
    expect(made[2].look).toEqual({ sheet: "pressure_plate", frame: "pressed" });
  });

  it("should light a brazier's flame only while it is lit", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [piece({ kind: "brazier" })] }, grid());
    expect(made[0].lit).toBe(false);
    set.sync({ seal_pieces: [piece({ kind: "brazier", active: true })] }, grid());
    expect(made[0]).toMatchObject({ lit: true, look: { sheet: "seal_brazier", frame: "lit" } });
    set.sync({ seal_pieces: [piece({ kind: "brazier" })] }, grid());
    expect(made[0].calls).toEqual(["show seal_brazier/lit", "light", "show seal_brazier/cold", "dark"]);
  });

  it("should take away a piece no longer listed, its light first: the stair key taken", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [piece({ kind: "stair_key" }), piece({ kind: "brazier", entity_id: "b", active: true })] }, grid());
    set.sync({ seal_pieces: [] }, grid());
    expect(made.every((p) => p.destroyed)).toBe(true);
    expect(made[1].calls).toEqual(["light", "dark"]);
  });

  it("should draw nothing for a piece kind it does not know, and not throw", () => {
    const { set, made } = recording();
    expect(() => set.sync({ seal_pieces: [piece({ kind: "statue" })] }, grid())).not.toThrow();
    expect(made).toHaveLength(0);
    expect(set.nearby(centre(2, 2))).toBeNull();
  });

  it("should move a piece other than a block straight to its new position", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [piece({ kind: "shrine" })] }, grid());
    set.sync({ seal_pieces: [piece({ kind: "shrine", position: centre(3, 2) })] }, grid());
    expect(made[0].at).toEqual(centre(3, 2));
  });
});

describe("SealSet: a stone block slides (FS-5FZ4J §C R19, §J R51)", () => {
  const block = (cx: number) => piece({ kind: "block", position: centre(cx, 2), cell: { x: cx, y: 2 } });

  it("should slide a pushed block between cells over the push time rather than snapping", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [block(2)] }, grid());
    set.sync({ seal_pieces: [block(3)] }, grid());
    expect(made[0].at).toEqual(centre(2, 2));
    const pushTimeMs = (CELL / BLOCK_SLIDE_SPEED) * 1000;
    set.step(pushTimeMs / 2);
    expect(made[0].at.x).toBeCloseTo(centre(2, 2).x + CELL / 2);
    expect(made[0].at.y).toBe(centre(2, 2).y);
    set.step(pushTimeMs);
    expect(made[0].at).toEqual(centre(3, 2));
  });

  it("should be half a cell a second at a player's walk: the server's push speed", () => {
    expect(BLOCK_SLIDE_SPEED).toBe(100);
  });

  it("should snap a block that jumps farther than a slide, as a reconnect's would", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [block(2)] }, grid());
    set.sync({ seal_pieces: [block(9)] }, grid());
    expect(made[0].at).toEqual(centre(9, 2));
  });

  it("should stand still once it has arrived", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [block(2)] }, grid());
    set.step(500);
    expect(made[0].calls).toEqual([]);
  });

  it("should be no E target (R52)", () => {
    const { set } = recording();
    set.sync({ seal_pieces: [block(2)] }, grid());
    expect(set.nearby(centre(2, 2))).toBeNull();
  });
});

describe("SealSet: the gate, pits and the bridge (FS-5FZ4J §J R51)", () => {
  it("should lay one gate piece centred on each gate cell, gate_x for a gate running along world x", () => {
    const { set, live } = recording();
    set.sync({ barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }, { x: 5, y: 7 }] })] }, grid());
    expect(live().map(({ look, at, band }) => ({ look, at, band }))).toEqual([
      { look: { sheet: "gate_x", frame: "shut" }, at: centre(4, 7), band: "standing" },
      { look: { sheet: "gate_x", frame: "shut" }, at: centre(5, 7), band: "standing" },
    ]);
  });

  it("should read a one-cell gate's run from the corridor's walls beside it", () => {
    const across = recording();
    across.set.sync({ barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }] })] }, grid(["3,7", "5,7"]));
    expect(across.live()[0].look.sheet).toBe("gate_x");
    const along = recording();
    along.set.sync({ barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }] })] }, grid(["4,6", "4,8"]));
    expect(along.live()[0].look.sheet).toBe("gate_y");
    const column = recording();
    column.set.sync({ barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }, { x: 4, y: 8 }] })] }, grid());
    expect(column.live()[0].look.sheet).toBe("gate_y");
  });

  it("should raise the gate in place when it opens", () => {
    const { set, made } = recording();
    const cells = [{ x: 4, y: 7 }, { x: 5, y: 7 }];
    const floor = grid();
    set.sync({ barriers: [barrier({ kind: "gate", cells })] }, floor);
    set.sync({ barriers: [barrier({ kind: "gate", cells, open: true })] }, floor);
    expect(made).toHaveLength(2);
    expect(made.map((p) => p.look.frame)).toEqual(["open", "open"]);
  });

  it("should paint pit cells in the ground band, the rock face where floor lies north or west", () => {
    const { set, live } = recording();
    // a 2 × 2 chasm at (5..6, 5..6): its north-west cell has floor north and west of it
    const cells = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }];
    set.sync({ barriers: [barrier({ kind: "pit", cells })] }, grid());
    expect(live().map(({ look, band }) => `${band} ${look.frame}`)).toEqual(["ground nw", "ground n", "ground w", "ground open"]);
  });

  it("should show no rock face against rock: a face falls only from a floor edge", () => {
    const { set, live } = recording();
    set.sync({ barriers: [barrier({ kind: "pit", cells: [{ x: 5, y: 5 }] })] }, grid(["5,4", "4,5"]));
    expect(live()[0].look.frame).toBe("open");
  });

  it("should read a neighbouring pit's cell as pit, not floor", () => {
    const { set, live } = recording();
    set.sync(
      {
        barriers: [
          barrier({ kind: "pit", entity_id: "a", cells: [{ x: 5, y: 4 }] }),
          barrier({ kind: "pit", entity_id: "b", cells: [{ x: 5, y: 5 }] }),
        ],
      },
      grid(),
    );
    expect(live()[1].look.frame).toBe("w");
  });

  it("should lay a lowered lane's cells as bridge, along the crossing", () => {
    const { set, made } = recording();
    const lane = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }];
    const floor = grid();
    set.sync({ barriers: [barrier({ kind: "pit", cells: lane })] }, floor);
    set.sync({ barriers: [barrier({ kind: "pit", cells: lane, open: true })] }, floor);
    expect(made).toHaveLength(3);
    expect(made.map((p) => p.look)).toEqual(lane.map(() => ({ sheet: "bridge_cell", frame: "y" })));
  });

  it("should draw nothing for a barrier kind it does not know", () => {
    const { set, made } = recording();
    set.sync({ barriers: [barrier({ kind: "portcullis", cells: [{ x: 1, y: 1 }] })] }, grid());
    expect(made).toHaveLength(0);
  });

  it("should wait for the floor's grid before laying a barrier's cells", () => {
    const { set, made } = recording();
    set.sync({ barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }] })] }, undefined);
    expect(made).toHaveLength(0);
    set.sync({ barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }] })] }, grid());
    expect(made).toHaveLength(1);
  });

  it("should lay the barriers again over a new grid for the same floor (a floor map re-sent)", () => {
    const { set, made, live } = recording();
    const gate = barrier({ kind: "gate", cells: [{ x: 4, y: 7 }] });
    set.sync({ barriers: [gate] }, grid(["3,7", "5,7"]));
    set.sync({ barriers: [gate] }, grid(["4,6", "4,8"]));
    expect(made).toHaveLength(2);
    expect(live().map((p) => p.look.sheet)).toEqual(["gate_y"]);
  });

  it("should name every shut gate's run for the minimap, in cell units, and none once open (R56)", () => {
    const { set } = recording();
    const row = [{ x: 4, y: 7 }, { x: 5, y: 7 }];
    const floor = grid();
    set.sync({ barriers: [barrier({ kind: "gate", cells: row })] }, floor);
    expect(set.shutGates()).toEqual([{ at: centre(4, 7), points: [{ x: 4, y: 7.5 }, { x: 6, y: 7.5 }] }]);
    set.sync({ barriers: [barrier({ kind: "gate", cells: row, open: true })] }, floor);
    expect(set.shutGates()).toEqual([]);
  });
});

describe("SealSet: E targets (FS-5FZ4J §J R52)", () => {
  it.each(["lever", "brazier", "bridge_lever", "stair_key", "mural", "shrine"] as const)("should reach a %s in range", (kind) => {
    const { set } = recording();
    set.sync({ seal_pieces: [piece({ kind })] }, grid());
    const at = centre(2, 2);
    expect(set.nearby({ x: at.x + INTERACT_RANGE - 1, y: at.y })).toEqual({ kind, entityId: `${kind}-1` });
    expect(set.nearby({ x: at.x + INTERACT_RANGE + 1, y: at.y })).toBeNull();
  });

  it.each([
    ["lever", "down"],
    ["brazier", "lit"],
    ["bridge_lever", "lowered"],
  ] as const)("should not reach a %s once %s: there is nothing left to do at it", (kind, _state) => {
    const { set } = recording();
    set.sync({ seal_pieces: [piece({ kind, active: true })] }, grid());
    expect(set.nearby(centre(2, 2))).toBeNull();
  });

  it("should not reach a plate", () => {
    const { set } = recording();
    set.sync({ seal_pieces: [piece({ kind: "plate" })] }, grid());
    expect(set.nearby(centre(2, 2))).toBeNull();
  });

  it("should reach the shut gate from beside any of its cells, and not once it is open", () => {
    const { set } = recording();
    const cells = [{ x: 4, y: 7 }, { x: 5, y: 7 }];
    const floor = grid();
    set.sync({ barriers: [barrier({ kind: "gate", cells })] }, floor);
    // south of the gate's east cell, a little short of reach from its edge
    const below = { x: centre(5, 7).x, y: 8 * CELL + INTERACT_RANGE - 1 };
    expect(set.nearby(below)).toEqual({ kind: "gate", entityId: "gate-1" });
    expect(set.nearby({ x: below.x, y: 8 * CELL + INTERACT_RANGE + 1 })).toBeNull();
    set.sync({ barriers: [barrier({ kind: "gate", cells, open: true })] }, floor);
    expect(set.nearby(below)).toBeNull();
  });

  it("should not reach a pit", () => {
    const { set } = recording();
    set.sync({ barriers: [barrier({ kind: "pit", cells: [{ x: 2, y: 2 }] })] }, grid());
    expect(set.nearby(centre(2, 2))).toBeNull();
  });

  it("should reach the nearest of two in range", () => {
    const { set } = recording();
    set.sync(
      { seal_pieces: [piece({ kind: "mural", entity_id: "far", position: { x: 150, y: 200 } }), piece({ kind: "shrine", entity_id: "near", position: { x: 210, y: 200 } })] },
      grid(),
    );
    expect(set.nearby({ x: 200, y: 200 })).toEqual({ kind: "shrine", entityId: "near" });
  });
});

describe("SealSet: the hide rule and a floor's end", () => {
  it("should list every sprite with where it stands, pieces and barrier cells alike", () => {
    const { set } = recording();
    set.sync(
      { seal_pieces: [piece({ kind: "lever", glyph: "key" })], barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }] })] },
      grid(),
    );
    expect(set.placed().map(({ pos }) => pos)).toEqual([centre(2, 2), centre(2, 2), centre(4, 7)]);
  });

  it("should destroy everything on clear and draw anew after, and touch nothing on forget", () => {
    const { set, made } = recording();
    set.sync({ seal_pieces: [piece({ kind: "mural" })], barriers: [barrier({ kind: "gate", cells: [{ x: 4, y: 7 }] })] }, grid());
    set.clear();
    expect(made.every((p) => p.destroyed)).toBe(true);
    set.sync({ seal_pieces: [piece({ kind: "mural" })] }, grid());
    expect(made).toHaveLength(3);
    set.forget();
    expect(made[2].destroyed).toBe(false);
    expect(set.placed()).toEqual([]);
  });
});

describe("SealSet: a detected secret door (FS-5FZ4J §J R51, R52)", () => {
  // the door's cell (6, 3) is rock while it is shut: a corridor runs north to south through it, so its
  // wall plan shows a back piece on its north edge and a cut-away piece on its south edge, two tiles each
  const door = (open = false) => barrier({ kind: "secret_door", cells: [{ x: 6, y: 3 }], open });
  const floor = grid(["6,3"]);
  const faces: WallFace[] = [
    { at: { x: 500, y: 245 }, depthAt: { x: 480, y: 240 }, axis: "x", height: "back" },
    { at: { x: 540, y: 245 }, depthAt: { x: 520, y: 240 }, axis: "x", height: "back" },
    { at: { x: 500, y: 315 }, depthAt: { x: 500, y: 320 }, axis: "x", height: "front" },
    { at: { x: 540, y: 315 }, depthAt: { x: 540, y: 320 }, axis: "x", height: "front" },
    // a wall piece of another cell: no cracks
    { at: { x: 100, y: 100 }, depthAt: { x: 100, y: 100 }, axis: "y", height: "back" },
  ];

  it("should lay its cracks over every wall piece of its face, by the piece's height and axis, sorted over it", () => {
    const { set, live } = recording();
    set.sync({ barriers: [door()] }, floor, faces);
    expect(live().map((p) => [p.look.sheet, p.look.frame, p.at.x, p.at.y])).toEqual([
      ["secret_cracks", "x", 500, 245],
      ["secret_cracks", "x", 540, 245],
      ["secret_cracks", "front_x", 500, 315],
      ["secret_cracks", "front_x", 540, 315],
    ]);
    expect(live()[0].calls).toEqual(["decal over 480,240"]);
  });

  it("should wait for the floor's wall faces before laying cracks", () => {
    const { set, made } = recording();
    set.sync({ barriers: [door()] }, floor);
    expect(made).toHaveLength(0);
    set.sync({ barriers: [door()] }, floor, faces);
    expect(made).toHaveLength(4);
  });

  it("should take its cracks away once it opens: the floor map re-sent draws it as a doorway", () => {
    const { set, live } = recording();
    set.sync({ barriers: [door()] }, floor, faces);
    set.sync({ barriers: [door(true)] }, floor, faces);
    expect(live()).toHaveLength(0);
  });

  it("should lay the cracks again over new wall faces, and none where the new faces have none", () => {
    const { set, made, live } = recording();
    set.sync({ barriers: [door()] }, floor, faces);
    set.sync({ barriers: [door()] }, floor, faces.slice(2));
    expect(made).toHaveLength(6);
    expect(live().map((p) => p.look.frame)).toEqual(["front_x", "front_x"]);
  });

  it("should be the Search target while shut and in reach, measured to its cells, and none once open (R52)", () => {
    const { set } = recording();
    set.sync({ barriers: [door()] }, floor, faces);
    const below = { x: centre(6, 3).x, y: 4 * CELL + INTERACT_RANGE - 1 };
    expect(set.nearby(below)).toEqual({ kind: "secret_door", entityId: "secret_door-1" });
    expect(set.nearby({ x: below.x, y: 4 * CELL + INTERACT_RANGE + 1 })).toBeNull();
    set.sync({ barriers: [door(true)] }, floor, faces);
    expect(set.nearby(below)).toBeNull();
  });

  it("should name what it drew for an entity, for the open bar to stand over: the door's cracks, a piece's sprites, nothing else", () => {
    const { set } = recording();
    set.sync({ seal_pieces: [piece({ kind: "lever", glyph: "key" })], barriers: [door()] }, floor, faces);
    expect(set.drawnFor("secret_door-1").map((p) => p.look.frame)).toEqual(["x", "x", "front_x", "front_x"]);
    expect(set.drawnFor("lever-1")).toHaveLength(2);
    expect(set.drawnFor("nobody")).toEqual([]);
  });

  it("should list its cracks for the hide rule, and destroy them on clear", () => {
    const { set, made } = recording();
    set.sync({ barriers: [door()] }, floor, faces);
    expect(set.placed().map(({ pos }) => pos)).toEqual(faces.slice(0, 4).map((f) => f.at));
    set.clear();
    expect(made.every((p) => p.destroyed)).toBe(true);
  });

  it("should not count a secret door among the shut gates the minimap strokes: the map draws it as wall already", () => {
    const { set } = recording();
    set.sync({ barriers: [door()] }, floor, faces);
    expect(set.shutGates()).toEqual([]);
  });
});
