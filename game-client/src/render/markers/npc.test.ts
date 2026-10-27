import { describe, expect, it } from "vitest";
import type { NPCState } from "@/types/gameState";
import { NPC_NAME_PX, isFunctionNPC, sigilPoints } from "./npc";

describe("isFunctionNPC (FS-MRZH7 req 1)", () => {
  it.each([
    ["delve", true],
    ["storekeeper", true],
    // a function this client has no offer for yet is still someone to deal with
    ["questgiver", true],
    ["", false],
  ])("should mark function %j: %s", (fn, want) => {
    expect(isFunctionNPC({ function: fn as NPCState["function"] })).toBe(want);
  });
});

describe("NPC_NAME_PX (FS-MRZH7 req 7)", () => {
  it("should set a function NPC's name a step above an ambient NPC's", () => {
    expect(NPC_NAME_PX.function).toBe(13);
    expect(NPC_NAME_PX.ambient).toBe(12);
  });
});

describe("sigilPoints (FS-MRZH7 req 4)", () => {
  it("should draw a lozenge about 8 wide and 11 tall, its foot on the given point", () => {
    const pts = sigilPoints(100, 50);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(pts).toHaveLength(4);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(8);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(11);
    expect(Math.max(...ys)).toBe(50);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBe(100);
  });
});
