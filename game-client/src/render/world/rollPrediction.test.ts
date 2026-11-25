import { describe, expect, it } from "vitest";
import {
  BODY_HALF,
  CONFIRM_GRACE_MS,
  ROLL_DISTANCE,
  ROLL_DURATION_MS,
  RollPrediction,
  rollReach,
  type RollGround,
} from "./rollPrediction";

// FS-7P736 §B R14 (R3, R4 as the client's copy): the predicted roll on the local body, 200 px over 0.4 s at a
// constant speed, swept against what the client knows stops a body, and handed back to the server's position

/** An open floor of 80 px cells, `cols` by `rows`, rock where `rock` says. */
function floor(cols: number, rows: number, rock: (cx: number, cy: number) => boolean = () => false): RollGround {
  return {
    cell: 80,
    walkable: (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && !rock(cx, cy),
  };
}

const EAST = { x: 1, y: 0 };

describe("the roll's numbers (FS-7P736 R3)", () => {
  it("should be 2.5 cells, 200 px, over 0.4 s, the pace not touching them", () => {
    expect(ROLL_DISTANCE).toBe(200);
    expect(ROLL_DURATION_MS).toBe(400);
    expect(BODY_HALF).toBe(20);
  });
});

describe("rollReach (FS-7P736 R4, R14)", () => {
  it("should carry the body the whole 200 px across open floor", () => {
    expect(rollReach({ x: 100, y: 100 }, EAST, floor(10, 10), [])).toEqual({ x: 300, y: 100 });
  });

  it("should roll a diagonal 200 px along it", () => {
    const d = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const end = rollReach({ x: 100, y: 100 }, d, floor(10, 10), []);
    expect(Math.hypot(end.x - 100, end.y - 100)).toBeCloseTo(200, 0);
  });

  it("should stop where the body touches rock, its edge at the wall", () => {
    // rock from x = 240: the body's right edge, x + 20, stops at it
    const end = rollReach({ x: 100, y: 100 }, EAST, floor(10, 10, (cx) => cx >= 3), []);
    expect(end.y).toBe(100);
    expect(end.x).toBeLessThanOrEqual(240 - BODY_HALF);
    expect(end.x).toBeGreaterThan(240 - BODY_HALF - 3);
  });

  it("should stop at the world's edge", () => {
    const end = rollReach({ x: 700, y: 100 }, EAST, floor(10, 10), []);
    expect(end.x).toBeLessThanOrEqual(800 - BODY_HALF);
    expect(end.x).toBeGreaterThan(800 - BODY_HALF - 3);
  });

  it("should stop at a shut door, a blocker's rect", () => {
    const door = { x: 200, y: 60, width: 20, height: 80 };
    const end = rollReach({ x: 100, y: 100 }, EAST, floor(10, 10), [door]);
    expect(end.x).toBeLessThanOrEqual(200 - BODY_HALF);
    expect(end.x).toBeGreaterThan(200 - BODY_HALF - 3);
  });

  it("should end the roll touching either axis in a corner, never sliding along the wall", () => {
    // rock north of y = 80: a roll north-east stops on its line, as walking's sweep does
    const d = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    const end = rollReach({ x: 200, y: 120 }, d, floor(10, 10, (_cx, cy) => cy < 1), []);
    expect(end.y - BODY_HALF).toBeGreaterThanOrEqual(80);
    // on the line it set out along
    expect(end.x - 200).toBeCloseTo(120 - end.y, 5);
    expect(end.x).toBeLessThan(250);
  });

  it("should not move a body that starts touching a wall it rolls into", () => {
    const end = rollReach({ x: 240 - BODY_HALF, y: 100 }, EAST, floor(10, 10, (cx) => cx >= 3), []);
    expect(end).toEqual({ x: 240 - BODY_HALF, y: 100 });
  });

  it("should carry the body on without a floor grid (bodies never stop it, R4), stopped only by what it knows", () => {
    expect(rollReach({ x: 100, y: 100 }, EAST, undefined, [])).toEqual({ x: 300, y: 100 });
  });
});

describe("RollPrediction (FS-7P736 R14)", () => {
  const started = (length = ROLL_DISTANCE) => {
    const p = new RollPrediction();
    p.start({ x: 100, y: 100 }, EAST, length, 1000);
    return p;
  };

  it("should draw nothing of its own before a roll", () => {
    const p = new RollPrediction();
    expect(p.at(0)).toBeNull();
    expect(p.inFlight(0)).toBe(false);
  });

  it("should move the body at once, at a constant 500 px/s along the roll", () => {
    const p = started();
    expect(p.at(1000)).toEqual({ x: 100, y: 100 });
    expect(p.at(1100)).toEqual({ x: 150, y: 100 });
    expect(p.at(1200)).toEqual({ x: 200, y: 100 });
    expect(p.inFlight(1200)).toBe(true);
  });

  it("should stop where the sweep stopped it, sooner, at the same speed", () => {
    const p = started(50);
    expect(p.at(1050)).toEqual({ x: 125, y: 100 });
    expect(p.at(1100)).toEqual({ x: 150, y: 100 });
    expect(p.at(1200)).toEqual({ x: 150, y: 100 });
  });

  it("should hand back to the server's position once the server's own roll has ended (reconciled as walking is)", () => {
    const p = started();
    p.hear({ roll: { dir_x: 1, dir_y: 0 }, roll_cooldown: { remaining: 2.9, total: 3 } });
    // the server's roll still runs as the prediction ends: held at its end, no pull back
    expect(p.at(1400)).toEqual({ x: 300, y: 100 });
    expect(p.at(1450)).toEqual({ x: 300, y: 100 });
    p.hear({ roll_cooldown: { remaining: 2.5, total: 3 } });
    expect(p.at(1460)).toBeNull();
    expect(p.inFlight(1460)).toBe(false);
  });

  it("should snap back to the server's position when the server never answers with a roll (refused)", () => {
    const p = started();
    p.hear({});
    p.hear({});
    expect(p.at(1400 + CONFIRM_GRACE_MS - 1)).toEqual({ x: 300, y: 100 });
    expect(p.at(1400 + CONFIRM_GRACE_MS)).toBeNull();
  });

  it("should never hold its end longer than another roll's length, whatever the server last said", () => {
    const p = started();
    p.hear({ roll: { dir_x: 1, dir_y: 0 } });
    expect(p.at(1400 + ROLL_DURATION_MS - 1)).toEqual({ x: 300, y: 100 });
    expect(p.at(1400 + ROLL_DURATION_MS)).toBeNull();
  });

  it("should drop the roll at once when cleared (a floor change)", () => {
    const p = started();
    p.clear();
    expect(p.at(1100)).toBeNull();
  });
});
