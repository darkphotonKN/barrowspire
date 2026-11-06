import { describe, expect, it } from "vitest";
import type { FloorRegion } from "@/types/gameState";
import { RegionGrid } from "./dungeon";
import { Exploration, partyPositions } from "./exploration";

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
    seen.see([mid(12, 3)]);
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
      seen.see([mid(3, 3)]), // still in A
      seen.see([mid(6, 2)]), // A explored, C visible
      seen.see([]), // C explored: nobody living
      seen.see([]),
    ];
    expect(changed).toEqual([true, false, false, true, true, false]);
  });
});

// the cut leaves a corridor's last few cells as a segment of their own (FS-KE075 §A: a segment is
// at most 16 cells on its longer side); a member crossing one would light it alone for a moment
describe("a tiny corridor segment (1–3 cells)", () => {
  // room A, then corridor C1 (5–7 × 2–3, 6 cells), the tiny T (8 × 2–3, 2 cells), corridor C3
  // (9–10 × 2–3, 4 cells), room B
  const C1 = 2;
  const T = 4;
  const C3 = 5;
  const cut = () =>
    floor(17, 7, [room(A, 1, 1, 4, 4), corridor(C1, 5, 2, 3, 2), corridor(T, 8, 2, 1, 2), corridor(C3, 9, 2, 2, 2), room(B, 11, 1, 4, 4)]);

  it("is seen with the larger corridor segment it touches, never alone", () => {
    const seen = new Exploration(cut());
    seen.see([mid(8, 2)]);
    expect([seen.state(C1), seen.state(T), seen.state(C3)]).toEqual(["visible", "visible", "unexplored"]);
    seen.see([mid(6, 3)]);
    expect(seen.state(T)).toBe("visible");
    seen.see([mid(10, 2)]);
    expect([seen.state(C1), seen.state(T), seen.state(C3)]).toEqual(["explored", "explored", "visible"]);
  });

  it("is seen with the room it touches when it touches no other corridor", () => {
    // room A, the tiny T (5 × 2–3) as the only way to room B (6–9)
    const seen = new Exploration(floor(12, 7, [room(A, 1, 1, 4, 4), corridor(T, 5, 2, 1, 2), room(B, 6, 1, 4, 3)]));
    seen.see([mid(5, 3)]);
    // T touches each room on two cells; A is the larger
    expect([seen.state(A), seen.state(T), seen.state(B)]).toEqual(["visible", "visible", "unexplored"]);
  });

  it("leaves a segment of four cells alone", () => {
    const seen = new Exploration(cut());
    seen.see([mid(9, 2)]);
    expect([seen.state(T), seen.state(C3)]).toEqual(["unexplored", "visible"]);
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
