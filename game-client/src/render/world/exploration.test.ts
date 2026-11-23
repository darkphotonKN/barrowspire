import { describe, expect, it, vi } from "vitest";
import type { FloorRegion } from "@/types/gameState";
import { RegionGrid, type DungeonMap } from "./dungeon";
import fixture from "./dungeon.fixture.json";
import { Exploration, SHOWN_WITHIN, TINY_SEGMENT, partyPositions } from "./exploration";

const CELL = 80;

/** A hand-made dungeon floor: `cols` × `rows` cells of 80 px, these regions walkable. */
const floor = (cols: number, rows: number, regions: FloorRegion[]) =>
  new RegionGrid({ width: cols * CELL, height: rows * CELL, cell_size: CELL, regions });

const region = (kind: FloorRegion["kind"]) => (id: number, x: number, y: number, w: number, h: number): FloorRegion => ({
  id,
  kind,
  cells: [{ x, y, w, h }],
});
const room = region("room");
const corridor = region("corridor");

/** The world point at the middle of cell (cx, cy). */
const mid = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });

// room A (1) over cells 1–4 × 1–4, a corridor (2) over 5–10 × 2–3, room B (3) over 11–14 × 1–4:
// the corridor's mouths are the rooms' doorway cells (4, 2–3) and (11, 2–3)
const A = 1;
const C = 2;
const B = 3;
const walk = () => floor(17, 7, [room(A, 1, 1, 4, 4), corridor(C, 5, 2, 6, 2), room(B, 11, 1, 4, 4)]);

describe("exploration by region (FS-SRA9J §B)", () => {
  it("leaves room A explored and room B visible once a member walks A → corridor → B", () => {
    const seen = new Exploration(walk());
    seen.see([mid(2, 2)]);
    seen.see([mid(7, 2)]);
    // three steps into B: the corridor's last cell (10, 3) is beyond reach
    seen.see([mid(13, 3)]);
    expect([seen.state(A), seen.state(C), seen.state(B)]).toEqual(["explored", "explored", "visible"]);
  });

  it("starts every region unexplored", () => {
    const seen = new Exploration(walk());
    expect([seen.state(A), seen.state(C), seen.state(B)]).toEqual(["unexplored", "unexplored", "unexplored"]);
  });

  it("makes both regions visible while two members stand in different ones", () => {
    const seen = new Exploration(walk());
    seen.see([mid(2, 2), mid(13, 2)]);
    expect([seen.state(A), seen.state(C), seen.state(B)]).toEqual(["visible", "unexplored", "visible"]);
  });

  // a body pressed against a wall's edge stands on the shell, on no walkable cell (§B.7)
  it.each([
    ["just north of room A, in its north wall", { x: 2.5 * CELL, y: CELL - 6 }, A],
    ["just east of room B, in its east wall", { x: 15 * CELL + 10, y: 2.5 * CELL }, B],
    ["in the corridor's north wall, nearer the corridor than room A", { x: 6.5 * CELL, y: 2 * CELL - 4 }, C],
  ])("takes the region of the nearest walkable cell for a position %s", (_, at, id) => {
    const seen = new Exploration(walk());
    seen.see([at]);
    expect(seen.state(id)).toBe("visible");
  });

  it("uncovers nothing for a position far from every walkable cell", () => {
    const seen = new Exploration(walk());
    seen.see([{ x: 8 * CELL, y: 6 * CELL + 40 }]);
    expect([seen.state(A), seen.state(C), seen.state(B)]).toEqual(["unexplored", "unexplored", "unexplored"]);
  });

  it("says whether any region changed state, so the fog redraws only then", () => {
    const seen = new Exploration(walk());
    const changed = [
      seen.see([mid(2, 2)]), // A visible
      seen.see([mid(2, 2)]), // no change
      seen.see([mid(2, 3)]), // still in A, the corridor out of reach
      seen.see([mid(8, 2)]), // A explored, C visible
      seen.see([mid(9, 2)]), // B within reach
      seen.see([]), // C and B explored: nobody living
      seen.see([]),
    ];
    expect(changed).toEqual([true, false, false, true, true, true, false]);
  });
});

describe("a region within two walkable steps is visible (FS-SRA9J §Change: Lighter fog and lit regions, F3–F6)", () => {
  it("makes room B visible from two corridor cells off its doorway cell, and not from three", () => {
    const near = new Exploration(walk());
    near.see([mid(9, 2)]);
    expect([near.state(C), near.state(B)]).toEqual(["visible", "visible"]);
    const far = new Exploration(walk());
    far.see([mid(8, 2)]);
    expect([far.state(C), far.state(B)]).toEqual(["visible", "unexplored"]);
  });

  it("never reaches through a wall: rooms back to back across one wall cell stay apart", () => {
    // room 1 over cells 1–2 × 1–2, a wall cell at x 3, room 2 over 4–5 × 1–2
    const seen = new Exploration(floor(7, 4, [room(1, 1, 1, 2, 2), room(2, 4, 1, 2, 2)]));
    seen.see([mid(2, 1)]);
    expect([seen.state(1), seen.state(2)]).toEqual(["visible", "unexplored"]);
  });

  it("counts a diagonal cell at two steps through a walkable cell beside both", () => {
    // room 1 over (1, 1) and (2, 1), room 2 at (2, 2): (2, 1) lies beside both (1, 1) and (2, 2)
    const seen = new Exploration(floor(4, 4, [room(1, 1, 1, 2, 1), room(2, 2, 2, 1, 1)]));
    seen.see([mid(1, 1)]);
    expect(seen.state(2)).toBe("visible");
  });

  it("does not count a diagonal cell with no walkable cell beside both", () => {
    // room 1 at (1, 1), room 2 at (2, 2), touching at a corner only
    const seen = new Exploration(floor(4, 4, [room(1, 1, 1, 1, 1), room(2, 2, 2, 1, 1)]));
    seen.see([mid(1, 1)]);
    expect([seen.state(1), seen.state(2)]).toEqual(["visible", "unexplored"]);
  });

  it("reaches from the nearest walkable cell for a member on none (§B.7, F4)", () => {
    // in the corridor's north wall cell (9, 1), 4 px off its cell (9, 2): two steps from B's (11, 2),
    // three from the wall cell itself
    const seen = new Exploration(walk());
    seen.see([{ x: 9.5 * CELL, y: 2 * CELL - 4 }]);
    expect([seen.state(C), seen.state(B)]).toEqual(["visible", "visible"]);
  });

  it("leaves a region reached and then left behind explored (§B.4)", () => {
    const seen = new Exploration(walk());
    seen.see([mid(9, 2)]);
    seen.see([mid(6, 2)]);
    expect(seen.state(B)).toBe("explored");
  });

  it.each([
    ["dead", { current_health: 0 }],
    ["escaped", { escape: true }],
  ])("reaches nothing from a %s member (§B.3)", (_, over) => {
    const seen = new Exploration(walk());
    const member = { position: mid(9, 2), current_health: 50, escape: false, ...over };
    seen.see(partyPositions({ current_player: member, other_players: [member] }));
    expect([seen.state(A), seen.state(C), seen.state(B)]).toEqual(["unexplored", "unexplored", "unexplored"]);
  });

  it("walks a cell's reach once, the first time a member stands on it, and only looks it up after (F6)", () => {
    const grid = walk();
    const steps = vi.spyOn(grid, "walkable");
    const seen = new Exploration(grid);
    const there = [mid(2, 2), mid(4, 3), mid(7, 2), mid(9, 3), mid(12, 2)];
    for (const p of there) seen.see([p]);
    const walked = steps.mock.calls.length;
    expect(walked).toBeGreaterThan(0);
    // back and forth over the same cells, a step inside each too: no cell walked again
    for (const p of [...there].reverse()) seen.see([p, { x: p.x + 10, y: p.y - 10 }]);
    for (const p of there) seen.see([p]);
    expect(steps.mock.calls.length).toBe(walked);
  });

  it("shows a monster anywhere in a region reached early, past 400 px from every member (§D.15, F5)", () => {
    const seen = new Exploration(walk());
    // in the corridor, two steps from room A's doorway cell (4, 2)
    const member = mid(6, 2);
    seen.see([member]);
    expect(seen.state(A)).toBe("visible");
    // room A's far corner, 430 px off
    const corner = mid(1, 4);
    expect(Math.hypot(corner.x - member.x, corner.y - member.y)).toBeGreaterThan(SHOWN_WITHIN);
    expect(seen.shows(corner)).toBe(true);
  });

  describe("on the levelgen golden floor", () => {
    const grid = new RegionGrid(fixture as DungeonMap);
    const cells = grid.regions.flatMap((r) => r.cells.flatMap((q) => Array.from({ length: q.w * q.h }, (_, i) => ({ cx: q.x + (i % q.w), cy: q.y + Math.floor(i / q.w) }))));

    it("shows, from every doorway cell, the region beyond it", () => {
      const doorways = cells.filter(({ cx, cy }) => grid.doorway(cx, cy));
      expect(doorways.length).toBeGreaterThan(0);
      for (const { cx, cy } of doorways) {
        const seen = new Exploration(grid);
        seen.see([mid(cx, cy)]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const beyond = grid.region(cx + dx, cy + dy);
          if (beyond) expect(seen.state(beyond)).toBe("visible");
        }
      }
    });

    it("shows from no cell a region none of whose cells lie within two walkable steps", () => {
      // the reach checked against a plain walk of the fixture's cells, every walkable cell a start;
      // the golden floor has no tiny segment, so every region is seen by itself
      expect(grid.regions.filter((r) => r.kind === "corridor" && r.cells.reduce((n, q) => n + q.w * q.h, 0) <= TINY_SEGMENT)).toEqual([]);
      const within = (from: { cx: number; cy: number }) => {
        const near = new Set<number>([grid.region(from.cx, from.cy)]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const one = grid.region(from.cx + dx, from.cy + dy);
          if (!one) continue;
          near.add(one);
          for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const two = grid.region(from.cx + dx + ex, from.cy + dy + ey);
            if (two) near.add(two);
          }
        }
        return near;
      };
      for (const at of cells) {
        const seen = new Exploration(grid);
        seen.see([mid(at.cx, at.cy)]);
        const near = within(at);
        for (const r of grid.regions) if (!near.has(r.id)) expect(seen.state(r.id), `region ${r.id} from ${at.cx},${at.cy}`).not.toBe("visible");
      }
    });
  });
});

// the cut leaves a corridor's last few cells as a segment of their own (FS-KE075 §A: a segment is
// at most 16 cells on its longer side); a member crossing one would light it alone for a moment.
// The segments are long enough to stand three steps off the tiny one, beyond reach (F3).
describe("a tiny corridor segment (1–3 cells)", () => {
  // room A, then corridor C1 (5–10 × 2–3, 12 cells), the tiny T (11 × 2–3, 2 cells), corridor C3
  // (12–16 × 2–3, 10 cells), room B
  const C1 = 2;
  const T = 4;
  const C3 = 5;
  const cut = () =>
    floor(23, 7, [room(A, 1, 1, 4, 4), corridor(C1, 5, 2, 6, 2), corridor(T, 11, 2, 1, 2), corridor(C3, 12, 2, 5, 2), room(B, 17, 1, 4, 4)]);

  it("is seen with the larger corridor segment it touches, never alone", () => {
    const seen = new Exploration(cut());
    // four steps from T, two from neither room
    seen.see([mid(7, 2)]);
    expect([seen.state(C1), seen.state(T), seen.state(C3)]).toEqual(["visible", "visible", "unexplored"]);
    seen.see([mid(15, 2)]);
    expect([seen.state(C1), seen.state(T), seen.state(C3)]).toEqual(["explored", "explored", "visible"]);
  });

  it("is seen with the room it touches when it touches no other corridor", () => {
    // room A, the tiny T (5 × 2–3) as the only way to room B (6–9)
    const seen = new Exploration(floor(12, 7, [room(A, 1, 1, 4, 4), corridor(T, 5, 2, 1, 2), room(B, 6, 1, 4, 3)]));
    // in A's far corner, five steps from T
    seen.see([mid(1, 1)]);
    // T touches each room on two cells; A is the larger
    expect([seen.state(A), seen.state(T), seen.state(B)]).toEqual(["visible", "visible", "unexplored"]);
  });

  it("leaves a segment of four cells alone", () => {
    // C1, then Q (11–12 × 2–3, 4 cells), then C3: Q would go with C1 were it tiny
    const Q = 4;
    const seen = new Exploration(
      floor(25, 7, [room(A, 1, 1, 4, 4), corridor(C1, 5, 2, 6, 2), corridor(Q, 11, 2, 2, 2), corridor(C3, 13, 2, 6, 2), room(B, 19, 1, 4, 4)]),
    );
    seen.see([mid(7, 2)]);
    expect([seen.state(C1), seen.state(Q)]).toEqual(["visible", "unexplored"]);
  });

  it("lights its whole group when any region of it is reached", () => {
    const seen = new Exploration(cut());
    // two steps from T, three from C1's last cell (10, 2)
    seen.see([mid(13, 2)]);
    expect([seen.state(C1), seen.state(T), seen.state(C3)]).toEqual(["visible", "visible", "visible"]);
  });
});

describe("who uncovers a region (FS-SRA9J §B.3, §B.5)", () => {
  const member = (at: { x: number; y: number }, over: Partial<{ current_health: number; escape: boolean }> = {}) => ({
    position: at,
    current_health: 50,
    escape: false,
    ...over,
  });

  it("counts the local player and every other living member", () => {
    const at = partyPositions({ current_player: member(mid(2, 2)), other_players: [member(mid(7, 2))] });
    expect(at).toEqual([mid(2, 2), mid(7, 2)]);
  });

  it.each([
    ["dead", { current_health: 0 }],
    ["escaped", { escape: true }],
  ])("counts nothing for a %s member, local or not", (_, over) => {
    expect(partyPositions({ current_player: member(mid(2, 2), over), other_players: [member(mid(7, 2), over)] })).toEqual([]);
  });

  it("counts the others while the local player is gone (escaped: no current player)", () => {
    expect(partyPositions({ current_player: null, other_players: [member(mid(7, 2))] })).toEqual([mid(7, 2)]);
  });
});

describe("which monsters and drop piles the fog shows (FS-SRA9J §D.15, §D.16, B3)", () => {
  // a member at the middle of cell (2, 2) of room A, x 200: the corridor runs east of x 400
  const member = mid(2, 2);
  const east = (px: number) => ({ x: member.x + px, y: member.y });

  it("shows within 400 px", () => {
    expect(SHOWN_WITHIN).toBe(400);
  });

  it.each([
    [399, true],
    [400, true],
    [401, false],
  ])("shows one %i px from a member in an unexplored region: %s", (px, shown) => {
    const seen = new Exploration(walk());
    seen.see([member]);
    expect(seen.state(C)).toBe("unexplored");
    expect(seen.shows(east(px))).toBe(shown);
  });

  it("shows one anywhere in a visible region, however far from every member", () => {
    // one long room, 800 px across
    const seen = new Exploration(floor(12, 3, [room(1, 0, 0, 10, 2)]));
    seen.see([mid(0, 0)]);
    expect(seen.shows(mid(9, 1))).toBe(true);
  });

  it("hides one in an explored region more than 400 px from every member, and shows one within it", () => {
    const seen = new Exploration(walk());
    seen.see([mid(2, 2)]);
    seen.see([mid(13, 3)]);
    expect(seen.state(A)).toBe("explored");
    expect(seen.shows(mid(2, 2))).toBe(false);
    // the corridor's east end, explored, 320 px from the member in room B, three steps off
    seen.see([mid(7, 2)]);
    seen.see([mid(13, 2)]);
    expect(seen.state(C)).toBe("explored");
    expect(seen.shows(mid(9, 2))).toBe(true);
  });

  it("counts only the positions of the latest look: a member gone from it shows nothing", () => {
    const seen = new Exploration(walk());
    seen.see([member]);
    seen.see([]);
    expect(seen.shows(east(100))).toBe(false);
    expect(seen.shows(member)).toBe(false);
  });

  it("shows nothing before the party has been seen at all", () => {
    expect(new Exploration(walk()).shows(member)).toBe(false);
  });

  it("shows one by distance alone where it stands on no region", () => {
    const seen = new Exploration(walk());
    seen.see([member]);
    // north of room A, past its shell: no walkable cell near
    expect(seen.shows({ x: member.x, y: -205 })).toBe(false);
    expect(seen.shows({ x: member.x, y: -150 })).toBe(true);
  });
});
