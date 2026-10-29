import { describe, expect, it } from "vitest";
import type { GateState } from "@/types/gameState";
import { gateAt, gateEdges } from "./hubGates";

const spire: GateState = {
  entity_id: "spire-gate",
  destination: "spire",
  position: { x: 1000, y: 50 },
  range: 80,
};
const forest: GateState = {
  entity_id: "forest-gate",
  destination: "forest",
  position: { x: 40, y: 400 },
  range: 80,
};
const gates = [spire, forest];

describe("gateAt (FS-0XMCP §Requirements 7, 10, 22)", () => {
  it.each([
    { where: "on the gate", pos: { x: 1000, y: 50 }, want: "spire" },
    { where: "at exactly its range", pos: { x: 1000, y: 130 }, want: "spire" },
    { where: "at its range on a diagonal", pos: { x: 1000 + 48, y: 50 + 64 }, want: "spire" },
    { where: "just beyond its range", pos: { x: 1000, y: 130.01 }, want: undefined },
    { where: "at another gate", pos: { x: 100, y: 400 }, want: "forest" },
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
