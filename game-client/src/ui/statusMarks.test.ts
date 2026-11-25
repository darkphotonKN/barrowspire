import { describe, expect, it } from "vitest";
import type { PlayerState } from "@/types/gameState";
import { HUD_COLUMN_W, RESOURCE_HUD_AT, resourceHudRowMiddle } from "./ResourceHud";
import { STATUS_MARK_LINES, STATUS_MARK_SIZE, STATUS_MARKS_AT, statusMarkRects, statusMarks, statusTipAt } from "./statusMarks";

const me = (over: Partial<PlayerState> = {}) =>
  ({ id: "p1", entity_id: "e1", username: "Wenna", class: "warrior", position: { x: 1, y: 2 }, escape: false, current_health: 80, max_health: 100, ...over }) as PlayerState;

// FS-5FZ4J §J R55 (I-5FZ4J-11): the Blessing as a small status mark beside the player's own health bar
describe("the player's status marks (FS-5FZ4J §J R55)", () => {
  it("should mark the Blessing while blessed, and nothing without it", () => {
    expect(statusMarks({ world_type: "run", current_player: me({ blessed: true }) })).toEqual(["blessed"]);
    expect(statusMarks({ world_type: "run", current_player: me() })).toEqual([]);
  });

  it("should mark nothing in the hub, before the player's first state, or out of the delve", () => {
    expect(statusMarks({ world_type: "hub", current_player: me({ blessed: true }) })).toEqual([]);
    expect(statusMarks({ world_type: "run", current_player: null })).toEqual([]);
    expect(statusMarks({ world_type: "run", current_player: me({ blessed: true, escape: true }) })).toEqual([]);
    expect(statusMarks({ world_type: "run", current_player: me({ blessed: true, current_health: 0 }) })).toEqual([]);
  });

  it("should say what the Blessing gives in its hover line, of players' finds, never delvers'", () => {
    expect(STATUS_MARK_LINES.blessed).toBe("Blessed: better finds, quicker resource");
    expect(Object.values(STATUS_MARK_LINES).join(" ")).not.toMatch(/delver/i);
  });

  it("should stand the marks just right of the bars' column, on the health row's middle", () => {
    const [first] = statusMarkRects(STATUS_MARKS_AT, 1);
    expect(first.x).toBeGreaterThan(RESOURCE_HUD_AT.run.x + HUD_COLUMN_W);
    expect(first.x - (RESOURCE_HUD_AT.run.x + HUD_COLUMN_W)).toBeLessThanOrEqual(8);
    expect(first.y + first.height / 2).toBe(resourceHudRowMiddle(RESOURCE_HUD_AT.run.y, 0));
    expect(first.width).toBe(STATUS_MARK_SIZE);
  });

  it("should lay several marks in a row, left to right, apart", () => {
    const [a, b] = statusMarkRects({ x: 200, y: 20 }, 2);
    expect(b.y).toBe(a.y);
    expect(b.x).toBeGreaterThan(a.x + a.width);
  });

  it("should hang a mark's hover line just under it, from its left edge", () => {
    const rect = { x: 200, y: 20, width: STATUS_MARK_SIZE, height: STATUS_MARK_SIZE };
    const tip = statusTipAt(rect);
    expect(tip.x).toBe(200);
    expect(tip.y).toBeGreaterThan(rect.y + rect.height);
  });
});
