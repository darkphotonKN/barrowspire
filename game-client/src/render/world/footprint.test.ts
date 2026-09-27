import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso";
import { footprintHitArea } from "./footprint";

describe("footprintHitArea", () => {
  // a 60×60 delver sprite standing on world (300, 200), origin at its centre, as `standAt` places it
  const pos = { x: 300, y: 200 };
  const at = worldToScreen(pos.x, pos.y);
  const sprite = {
    x: at.x,
    y: at.y,
    displayOriginX: 30,
    displayOriginY: 30,
    scaleX: 1,
    scaleY: 1,
  };
  const hit = footprintHitArea(() => pos, 20);
  /** Phaser hands the callback frame-local coordinates: from the frame's top-left. */
  const local = (sx: number, sy: number) =>
    [sx - at.x + 30, sy - at.y + 30] as const;

  it("should hit where the delver stands", () => {
    expect(hit({}, ...local(at.x, at.y), sprite)).toBe(true);
    const edge = worldToScreen(pos.x + 18, pos.y);
    expect(hit({}, ...local(edge.x, edge.y), sprite)).toBe(true);
  });

  it("should miss the upper body, which stands over other ground", () => {
    // 25 px up the sprite is the head: the ground under it is a tile and more away
    expect(hit({}, ...local(at.x, at.y - 25), sprite)).toBe(false);
  });

  it("should miss ground just past the footprint", () => {
    const past = worldToScreen(pos.x, pos.y + 24);
    expect(hit({}, ...local(past.x, past.y), sprite)).toBe(false);
  });

  it("should follow the delver as they move", () => {
    let where = { x: 300, y: 200 };
    const moving = footprintHitArea(() => where, 20);
    where = { x: 340, y: 200 };
    const s = worldToScreen(340, 200);
    const moved = { ...sprite, x: s.x, y: s.y };
    expect(moving({}, 30, 30, moved)).toBe(true);
  });
});
