import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@/render/iso";
import type { ClientGameState } from "@/types/gameState";
import {
  DRESSING_MAX,
  dressingBreaches,
  dressingStatics,
  planDressing,
  type DressingLean,
  type DressingPiece,
  type DressingStatics,
} from "./runDressing";

const at = (x: number, y: number) => ({ x, y });

/** `AddBuilding`'s rooms: 20-thick walls, a 50-wide door gap centred in the south wall. */
function room(bx: number, by: number, bw: number, bh: number, id: string) {
  const gap = (bw - 50) / 2;
  const walls = [
    [bx, by, bw, 20],
    [bx, by, 20, bh],
    [bx + bw - 20, by, 20, bh],
    [bx, by + bh - 20, gap, 20],
    [bx + gap + 50, by + bh - 20, gap, 20],
  ].map(([x, y, width, height], i) => ({
    entity_id: `${id}${i}`,
    house_id: id,
    position: at(x, y),
    width,
    height,
  }));
  const door = { entity_id: `d${id}`, position: at(bx + gap, by + bh - 20), width: 50, height: 20, is_open: true };
  return { walls, door };
}

const rooms = [room(120, 80, 300, 200, "s"), room(560, 60, 400, 300, "m"), room(860, 500, 500, 400, "l")];

/** A floor's broadcast, as far as dressing reads it. */
const broadcast: Pick<ClientGameState, "walls" | "doors" | "containers" | "escape_doors" | "switches" | "stairs"> = {
  walls: rooms.flatMap((r) => r.walls),
  doors: rooms.map((r) => r.door),
  containers: [
    { container_id: "c", entity_id: "c1", kind: "chest", position: at(1080, 700), is_open: false, items: [] },
    { container_id: "p", entity_id: "p1", kind: "drop_pile", position: at(500, 600), is_open: true, items: [] },
  ],
  escape_doors: [{ entity_id: "e1", position: at(1380, 120), is_open: false, is_locked: true }],
  switches: [{ entity_id: "s1", position: at(60, 900), switch_id: 1, is_activated: false }],
  stairs: [{ entity_id: "st1", position: at(300, 700) }],
};
const statics = dressingStatics(broadcast, 1440, 960);

/** Lots of everything, so every rule gets tried. */
const lean: DressingLean = {
  count: 16,
  weights: [
    [30, "rubble"],
    [50, "bone_pile"],
    [70, "broken_crate"],
    [85, "chains"],
    [95, "roots"],
    [100, "brazier"],
  ],
  most: { brazier: 2 },
};

const square = (p: DressingPiece): Rect => ({ x: p.at.x - p.r, y: p.at.y - p.r, width: 2 * p.r, height: 2 * p.r });
const overlaps = (a: Rect, b: Rect) =>
  a.x + a.width >= b.x && a.x <= b.x + b.width && a.y + a.height >= b.y && a.y <= b.y + b.height;
const grow = (r: Rect, n: number, south = 0): Rect => ({
  x: r.x - n,
  y: r.y - n,
  width: r.width + 2 * n,
  height: r.height + 2 * n + south,
});
/** Distance from a point to the nearest point of a rect, 0 inside it. */
const reach = (p: Point, r: Rect) =>
  Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.width), Math.max(r.y - p.y, 0, p.y - r.y - r.height));
const rectOf = (e: { position: Point; width: number; height: number }): Rect => ({ ...e.position, width: e.width, height: e.height });

describe("dressingStatics (FS-8RBQY §C.5, R3)", () => {
  it("should keep out from the stairs, the chest, the escape door and the switch, but not a drop pile", () => {
    expect(statics.interactables).toEqual(
      expect.arrayContaining([at(300, 700), at(1080, 700), at(1380, 120), at(60, 900)]),
    );
    expect(statics.interactables).toHaveLength(4);
  });

  it("should take every wall and door rect from the broadcast", () => {
    expect(statics.walls).toHaveLength(15);
    expect(statics.doors).toEqual(rooms.map((r) => rectOf(r.door)));
  });
});

describe("dressingBreaches (FS-8RBQY §C.5)", () => {
  const empty: DressingStatics = { width: 1440, height: 960, walls: [], doors: [], interactables: [] };
  const fp = (x: number, y: number, r = 10) => ({ from: at(x, y), to: at(x, y), r });

  it("should pass a footprint in open floor", () => {
    expect(dressingBreaches(fp(700, 480), empty)).toEqual([]);
  });

  it("should refuse one within 24 px of a wall", () => {
    const s = { ...empty, walls: [{ x: 600, y: 400, width: 200, height: 20 }] };
    expect(dressingBreaches(fp(700, 453), s)).toContain("wall");
    expect(dressingBreaches(fp(700, 455), s)).not.toContain("wall");
  });

  it("should refuse one in a door's threshold, and 60 px down its approach lane", () => {
    const s = { ...empty, doors: [{ x: 600, y: 400, width: 50, height: 20 }] };
    expect(dressingBreaches(fp(625, 375), s)).toContain("door");
    expect(dressingBreaches(fp(625, 525), s)).toContain("door");
    expect(dressingBreaches(fp(625, 535), s)).not.toContain("door");
    expect(dressingBreaches(fp(625, 345), s)).not.toContain("door");
  });

  it("should refuse one within 60 px of something a delver uses", () => {
    const s = { ...empty, interactables: [at(700, 480)] };
    expect(dressingBreaches(fp(765, 480), s)).toContain("interactable");
    expect(dressingBreaches(fp(775, 480), s)).not.toContain("interactable");
  });

  it("should refuse one within 30 px of the play area's edge", () => {
    expect(dressingBreaches(fp(35, 480), empty)).toContain("edge");
    expect(dressingBreaches(fp(700, 945), empty)).toContain("edge");
    expect(dressingBreaches(fp(41, 480), empty)).toEqual([]);
  });
});

describe("planDressing (FS-8RBQY §C.4–§C.5)", () => {
  const plan = planDressing(lean, 0x1234, statics);

  it("should strew some dressing, never more than 16 pieces", () => {
    expect(DRESSING_MAX).toBe(16);
    expect(plan.length).toBeGreaterThan(4);
    expect(plan.length).toBeLessThanOrEqual(16);
    expect(planDressing({ ...lean, count: 40 }, 0x1234, statics).length).toBeLessThanOrEqual(16);
  });

  it("should keep every piece clear of each keep-out rule", () => {
    const walls = broadcast.walls.map(rectOf);
    const doors = broadcast.doors.map(rectOf);
    const uses = [at(300, 700), at(1080, 700), at(1380, 120), at(60, 900)];
    for (const p of plan) {
      const sq = square(p);
      expect(walls.some((w) => overlaps(sq, grow(w, 24)))).toBe(false);
      expect(doors.some((d) => overlaps(sq, grow(d, 40, 60)))).toBe(false);
      expect(uses.every((u) => reach(u, sq) > 60)).toBe(true);
      expect(sq.x >= 30 && sq.y >= 30 && sq.x + sq.width <= 1410 && sq.y + sq.height <= 930).toBe(true);
    }
  });

  it("should drop a crowded candidate, never nudge it", () => {
    // things to use everywhere: no candidate is left room
    const crowded = {
      ...statics,
      interactables: [...Array(19).keys()].flatMap((i) => [...Array(13).keys()].map((j) => at(i * 80, j * 80))),
    };
    expect(planDressing(lean, 0x1234, crowded)).toEqual([]);
    // a chest where the first piece stood: that piece goes, and the rest stand where they did
    const chest = at(plan[0].at.x, plan[0].at.y);
    const fewer = planDressing(lean, 0x1234, { ...statics, interactables: [...statics.interactables, chest] });
    expect(fewer.some((p) => reach(chest, square(p)) <= 60)).toBe(false);
    const kept = fewer.filter((p) => plan.some((q) => q.at.x === p.at.x && q.at.y === p.at.y));
    expect(kept.length).toBeGreaterThanOrEqual(plan.length / 2);
  });

  it("should plan the same dressing for the same floor, and different dressing for another", () => {
    expect(planDressing(lean, 0x1234, statics)).toEqual(plan);
    expect(planDressing(lean, 0x9876, statics)).not.toEqual(plan);
  });

  it("should strew only the lean's sheets, within each sheet's most", () => {
    const only = planDressing({ count: 12, weights: [[100, "chains"]] }, 7, statics);
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((p) => p.sheet === "chains")).toBe(true);
    const fires = planDressing({ count: 16, weights: [[100, "brazier"]], most: { brazier: 2 } }, 7, statics);
    expect(fires).toHaveLength(2);
  });

  it("should not pile pieces on one another", () => {
    for (const a of plan)
      for (const b of plan)
        if (a !== b) expect(Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y)).toBeGreaterThan(a.r + b.r);
  });

  it("should stand a brazier up as tall, and lay everything else low", () => {
    const fires = planDressing({ count: 2, weights: [[100, "brazier"]] }, 7, statics);
    expect(fires.every((p) => p.tall)).toBe(true);
    expect(plan.filter((p) => p.sheet !== "brazier").every((p) => !p.tall)).toBe(true);
  });
});
