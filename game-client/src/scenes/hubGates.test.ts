import { describe, expect, it } from "vitest";
import type { GateState } from "@/types/gameState";
import {
  DEV_GATE_LABELS,
  FIELD_IDS,
  FIELD_NAMES,
  fieldOf,
  gateAt,
  gateEdges,
  gatesInThisBuild,
  signpostOf,
} from "./hubGates";

const spire: GateState = {
  entity_id: "spire-gate",
  destination: "spire",
  position: { x: 1000, y: 50 },
  range: 80,
};
const forest: GateState = {
  entity_id: "forest-gate",
  destination: "forest",
  position: { x: 40, y: 580 },
  range: 80,
};
const gates = [spire, forest];

describe("gateAt (FS-0XMCP §Requirements 7, 10, 22)", () => {
  it.each([
    { where: "on the gate", pos: { x: 1000, y: 50 }, want: "spire" },
    { where: "at exactly its range", pos: { x: 1000, y: 130 }, want: "spire" },
    { where: "at its range on a diagonal", pos: { x: 1000 + 48, y: 50 + 64 }, want: "spire" },
    { where: "just beyond its range", pos: { x: 1000, y: 130.01 }, want: undefined },
    { where: "at another gate", pos: { x: 100, y: 580 }, want: "forest" },
    { where: "far from every gate", pos: { x: 1000, y: 500 }, want: undefined },
  ])("should answer $want $where", ({ pos, want }) => {
    expect(gateAt(pos, gates)?.destination).toBe(want);
  });

  it("should use each gate's own range, as the server sends it", () => {
    const wide = { ...spire, range: 200 };
    expect(gateAt({ x: 1000, y: 240 }, [wide])?.destination).toBe("spire");
    expect(gateAt({ x: 1000, y: 240 }, [spire])).toBeUndefined();
  });

  it("should find no gate with no gates", () => {
    expect(gateAt({ x: 1000, y: 50 }, [])).toBeUndefined();
  });
});

describe("gateEdges (FS-0XMCP §Requirements 10)", () => {
  it("should enter a gate when stepping in from outside", () => {
    expect(gateEdges(undefined, spire)).toEqual({ entered: spire, left: undefined });
  });

  it("should leave a gate when stepping out", () => {
    expect(gateEdges(spire, undefined)).toEqual({ entered: undefined, left: spire });
  });

  it("should fire nothing while lingering inside, even with a fresh copy of the gate", () => {
    expect(gateEdges(spire, { ...spire })).toEqual({ entered: undefined, left: undefined });
  });

  it("should fire nothing while outside", () => {
    expect(gateEdges(undefined, undefined)).toEqual({ entered: undefined, left: undefined });
  });

  it("should leave one gate and enter the other when moving straight between them", () => {
    expect(gateEdges(spire, forest)).toEqual({ entered: forest, left: spire });
  });
});

const meadows: GateState = {
  entity_id: "meadows-gate",
  destination: "meadows",
  position: { x: 1960, y: 360 },
  range: 80,
};

describe("fieldOf (FS-0XMCP §Requirements 21)", () => {
  it("should yield one meadows field on entering the Meadows gate, and none while lingering", () => {
    const stepIn = gateEdges(undefined, gateAt({ x: 1950, y: 360 }, [meadows]));
    const linger = gateEdges(meadows, gateAt({ x: 1960, y: 370 }, [{ ...meadows }]));

    expect(fieldOf(stepIn.entered)).toBe("meadows");
    expect(fieldOf(linger.entered)).toBeUndefined();
  });

  it.each([
    { gate: forest, want: "forest" },
    { gate: meadows, want: "meadows" },
    { gate: spire, want: undefined },
    { gate: undefined, want: undefined },
  ])("should call the $gate.destination gate's field $want", ({ gate, want }) => {
    expect(fieldOf(gate)).toBe(want);
  });

  it("should name each field as the screen says it", () => {
    expect(FIELD_NAMES).toEqual({
      forest: "The Forlorn Forest",
      meadows: "Gentle Meadows",
      dev_test_room: "Dev Test Room",
    });
  });
});

describe("field ids (FS-X2F2H §Requirements 2, 11)", () => {
  const entrance: GateState = {
    entity_id: "road-home",
    destination: "hub",
    position: { x: 40, y: 500 },
    range: 80,
  };

  it("should lead nowhere from a field's entrance gate: it is the road home, not a field", () => {
    expect(fieldOf(entrance)).toBeUndefined();
  });

  it("should name the Meadows gate's field by the id the server knows it by", () => {
    expect(FIELD_IDS.meadows).toBe("gentle_meadows");
  });

  it("should name the Forest gate's field by the id the server knows it by (FS-3QHQZ)", () => {
    expect(FIELD_IDS.forest).toBe("forlorn_forest");
  });
});

describe("the dev test room's gate (FS-BDRTJ §Requirements 2, 3)", () => {
  const dev: GateState = {
    entity_id: "dev-gate",
    destination: "dev_test_room",
    position: { x: 120, y: 900 },
    range: 80,
  };

  it("should lead to the field the server knows as dev_test_room", () => {
    expect(fieldOf(dev)).toBe("dev_test_room");
    expect(FIELD_IDS.dev_test_room).toBe("dev_test_room");
  });

  it.each(["development", "test", undefined, "Production"])("should keep the gate under NODE_ENV %s", (env) => {
    expect(gatesInThisBuild([spire, dev], env)).toEqual([spire, dev]);
  });

  it("should drop the gate, and only that gate, under production", () => {
    expect(gatesInThisBuild([spire, dev, forest], "production")).toEqual([spire, forest]);
  });
});

describe("signpostOf (FS-0XMCP §Requirements 18, 21)", () => {
  const dressing = [
    { sheet: "signpost", at: { x: 140, y: 650 } },
    { sheet: "tree_pine", at: { x: 45, y: 585 } },
    { sheet: "signpost", at: { x: 1860, y: 420 } },
  ];

  it("should find the signpost standing beside the gate, not another prop nearer it", () => {
    expect(signpostOf(forest, dressing)).toEqual({ x: 140, y: 650 });
    expect(signpostOf(meadows, dressing)).toEqual({ x: 1860, y: 420 });
  });

  it("should fall back to the gate itself with no signpost to stand over", () => {
    expect(signpostOf(meadows, [])).toEqual(meadows.position);
  });
});

describe("the endgame test run's gate (FS-BDRTJ §Change: Endgame test run, R20, R21, R23)", () => {
  const room: GateState = {
    entity_id: "dev-gate",
    destination: "dev_test_room",
    position: { x: 120, y: 900 },
    range: 80,
  };
  const endgame: GateState = {
    entity_id: "endgame-gate",
    destination: "dev_endgame_run",
    position: { x: 160, y: 720 },
    range: 80,
  };

  it("should lead to no field: it starts a run, not an enter_field", () => {
    expect(fieldOf(endgame)).toBeUndefined();
  });

  it.each(["development", "test", undefined])("should keep the gate under NODE_ENV %s", (env) => {
    expect(gatesInThisBuild([spire, room, endgame], env)).toEqual([spire, room, endgame]);
  });

  it("should drop both dev gates, and only those, under production", () => {
    expect(gatesInThisBuild([spire, room, endgame, forest], "production")).toEqual([spire, forest]);
  });

  it("should label each dev gate in plain words", () => {
    expect(DEV_GATE_LABELS).toEqual({
      dev_test_room: "Dev Test Room",
      dev_endgame_run: "Endgame Test Run",
    });
  });
});
