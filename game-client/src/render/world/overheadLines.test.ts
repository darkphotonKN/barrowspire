import { describe, expect, it } from "vitest";
import type { EncounterNPCState } from "@/types/gameState";
import { LINE_MS, OverheadLines } from "./overheadLines";

type Point = { x: number; y: number };

function recording() {
  type Line = { text: string; at?: Point; shown?: boolean; destroyed: boolean; destroy(): void };
  const made: Line[] = [];
  const lines = new OverheadLines<Line>(
    {
      say: (text) => {
        const line: Line = { text, destroyed: false, destroy: () => void (line.destroyed = true) };
        made.push(line);
        return line;
      },
      place: (line, at, shown) => Object.assign(line, { at, shown }),
    },
    (key) => (key === "unknown" ? null : `said ${key}`),
  );
  const live = () => made.filter((l) => !l.destroyed);
  return { lines, made, live };
}

const npc = (over: Partial<EncounterNPCState> = {}): EncounterNPCState => ({
  entity_id: "npc-1",
  kind: "pilgrim",
  look: "pilgrim_a",
  position: { x: 400, y: 300 },
  facing: { x: 0, y: 1 },
  health: 30,
  max_health: 30,
  stance: "peaceful",
  action: "idle",
  ...over,
});
const head = (at: Point, shown = true) => () => ({ at, shown });

// FS-4EC7Z §G R30 (I-4EC7Z-6): a short line over the NPC's head for 4 s, once per line_at, never on a first broadcast
describe("OverheadLines: what encounter NPCs say (FS-4EC7Z §G R30)", () => {
  it("should say a line once per line_at, for 4 s, over the NPC's head", () => {
    const { lines, live } = recording();
    lines.sync([npc()], 0);
    lines.sync([npc({ line: "pilgrim_plea", line_at: 5 })], 100);
    lines.sync([npc({ line: "pilgrim_plea", line_at: 5 })], 200);
    expect(live().map((l) => l.text)).toEqual(["said pilgrim_plea"]);
    lines.step(300, head({ x: 10, y: 20 }));
    expect(live()[0]).toMatchObject({ at: { x: 10, y: 20 }, shown: true });
    lines.step(100 + LINE_MS - 1, head({ x: 10, y: 20 }));
    expect(live()).toHaveLength(1);
    lines.step(100 + LINE_MS, head({ x: 10, y: 20 }));
    expect(live()).toHaveLength(0);
    expect(LINE_MS).toBe(4000);
  });

  it("should say the same line again when its line_at rises, the newer in place of the older", () => {
    const { lines, made, live } = recording();
    lines.sync([npc()], 0);
    lines.sync([npc({ line: "pilgrim_plea", line_at: 5 })], 100);
    lines.sync([npc({ line: "pilgrim_plea", line_at: 7 })], 2100);
    expect(made).toHaveLength(2);
    expect(live()).toHaveLength(1);
    lines.step(100 + LINE_MS, head({ x: 0, y: 0 }));
    expect(live()).toHaveLength(1);
  });

  it("should say nothing on a first broadcast that finds a line said, nor for an NPC first seen with one", () => {
    const { lines, made } = recording();
    lines.sync([npc({ line: "pilgrim_plea", line_at: 5 })], 0);
    lines.sync([npc({ line: "pilgrim_plea", line_at: 5 }), npc({ entity_id: "npc-2", line: "ally_ack", line_at: 9 })], 100);
    expect(made).toEqual([]);
  });

  it("should take an NPC back in the state after it left as first seen: an old line is not said again", () => {
    const { lines, made } = recording();
    lines.sync([npc()], 0);
    lines.sync([], 100);
    lines.sync([npc({ line: "pilgrim_plea", line_at: 5 })], 200);
    expect(made).toEqual([]);
  });

  it("should keep a line whose NPC leaves the state at its last place for the rest of its 4 s (the cutthroats' turn)", () => {
    const { lines, live } = recording();
    lines.sync([npc({ kind: "cutthroat" })], 0);
    lines.sync([npc({ kind: "cutthroat", line: "cutthroat_turn", line_at: 3 })], 100);
    lines.step(150, head({ x: 40, y: 50 }));
    lines.sync([], 200);
    lines.step(1000, () => undefined);
    expect(live()[0]).toMatchObject({ text: "said cutthroat_turn", at: { x: 40, y: 50 } });
    lines.step(100 + LINE_MS, () => undefined);
    expect(live()).toHaveLength(0);
  });

  it("should hide a line while its NPC is hidden", () => {
    const { lines, live } = recording();
    lines.sync([npc()], 0);
    lines.sync([npc({ line: "ally_ack", line_at: 2 })], 100);
    lines.step(150, head({ x: 1, y: 1 }, false));
    expect(live()[0].shown).toBe(false);
  });

  it("should say nothing for a key it has no words for", () => {
    const { lines, made } = recording();
    lines.sync([npc()], 0);
    lines.sync([npc({ line: "unknown", line_at: 2 })], 100);
    expect(made).toEqual([]);
  });

  it("should take every line down on clear, and take the next broadcast as a first after forget", () => {
    const { lines, live, made } = recording();
    lines.sync([npc()], 0);
    lines.sync([npc({ line: "ally_ack", line_at: 2 })], 100);
    lines.clear();
    expect(live()).toHaveLength(0);
    lines.forget();
    lines.sync([npc({ line: "ally_ack", line_at: 4 })], 200);
    expect(made).toHaveLength(1);
  });
});
