import { describe, expect, it } from "vitest";
import type { TrapState } from "@/types/gameState";
import { TRAP_FAINT, TRAP_REVEALED, type SealLook } from "./sealLooks";
import { TrapSet } from "./traps";

type Point = { x: number; y: number };

/** A stand-in for the scene: each trap drawn and every call made on it. */
function recording() {
  type Drawn = {
    look: SealLook;
    at: Point;
    alpha: number;
    calls: string[];
    revealed: boolean;
    destroyed: boolean;
    destroy(): void;
  };
  const made: Drawn[] = [];
  const set = new TrapSet<Drawn>({
    add: (look, at, alpha) => {
      const d: Drawn = { look, at, alpha, calls: [], revealed: false, destroyed: false, destroy: () => void (d.destroyed = true) };
      made.push(d);
      return d;
    },
    show: (d, look, alpha) => {
      d.look = look;
      d.alpha = alpha;
      d.calls.push(`show ${look.frame} ${alpha}`);
    },
    spring: (d, look, settle) => {
      d.look = look;
      d.alpha = 1;
      d.calls.push(`spring ${look.frame}${settle ? ` then ${settle.look.frame} ${settle.alpha}` : ""}`);
    },
    reveal: (d, revealed) => {
      d.revealed = revealed;
      d.calls.push(`reveal ${revealed}`);
    },
  });
  const live = () => made.filter((d) => !d.destroyed);
  return { set, made, live };
}

const CELL = 80;
const grid = { cell: CELL };
const trap = (over: Partial<TrapState> = {}): TrapState => ({
  entity_id: "t1",
  kind: "spike_plate",
  cell: { x: 3, y: 4 },
  armed: true,
  revealed: false,
  ...over,
});

describe("TrapSet: a listed trap drawn faint (FS-5FZ4J §J R51)", () => {
  it("should draw a listed trap at its cell's centre from its sheet, its armed frame faint", () => {
    const { set, live } = recording();
    set.sync([trap()], grid);
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ look: { sheet: "trap_spike_plate", frame: "armed" }, at: { x: 280, y: 360 }, alpha: TRAP_FAINT });
  });

  it("should wait for the floor's grid before placing a trap", () => {
    const { set, live } = recording();
    set.sync([trap()], undefined);
    expect(live()).toHaveLength(0);
    set.sync([trap()], grid);
    expect(live()).toHaveLength(1);
  });

  it("should draw a trap first seen disarmed in its sprung frame, at full strength, playing no spring: a first sight is the baseline (R48)", () => {
    const { set, live } = recording();
    set.sync([trap({ armed: false })], grid);
    expect(live()[0]).toMatchObject({ look: { frame: "sprung" }, alpha: 1 });
    expect(live()[0].calls.filter((c) => c.startsWith("spring"))).toEqual([]);
  });

  it("should play its spring once when armed falls, and draw it faint again once re-armed", () => {
    const { set, live } = recording();
    set.sync([trap()], grid);
    set.sync([trap({ armed: false })], grid);
    set.sync([trap({ armed: false })], grid);
    expect(live()[0].calls).toEqual(["spring sprung"]);
    set.sync([trap()], grid);
    expect(live()[0].calls).toEqual(["spring sprung", `show armed ${TRAP_FAINT}`]);
    expect(live()[0].alpha).toBe(TRAP_FAINT);
  });

  it("should puff a gas vent when its puffed_at changes, settling back faint, and not on the first sight of a puff", () => {
    const { set, live } = recording();
    const vent = (puffed_at?: number) => trap({ kind: "gas_vent", puffed_at });
    set.sync([vent(10)], grid);
    set.sync([vent(10)], grid);
    expect(live()[0].calls).toEqual([]);
    set.sync([vent(14)], grid);
    expect(live()[0].calls).toEqual([`spring puff then armed ${TRAP_FAINT}`]);
    set.sync([vent(14)], grid);
    expect(live()[0].calls).toHaveLength(1);
  });

  it("should puff a gas vent's first puff after it was seen with none", () => {
    const { set, live } = recording();
    set.sync([trap({ kind: "gas_vent" })], grid);
    set.sync([trap({ kind: "gas_vent", puffed_at: 3 })], grid);
    expect(live()[0].calls).toEqual([`spring puff then armed ${TRAP_FAINT}`]);
  });

  // the review's fix round 1: a vent is detected and puffs on one tick, so its first listing carries the puff
  it("should play the first puff of a gas vent first listed after the floor's first sync with puffed_at set", () => {
    const { set, live } = recording();
    set.sync([], grid);
    set.sync([trap({ kind: "gas_vent", puffed_at: 7 })], grid);
    expect(live()[0]).toMatchObject({ look: { frame: "puff" } });
    expect(live()[0].calls).toEqual([`spring puff then armed ${TRAP_FAINT}`]);
    set.sync([trap({ kind: "gas_vent", puffed_at: 7 })], grid);
    expect(live()[0].calls).toHaveLength(1);
  });

  it("should play the spring of a trap first listed after the floor's first sync already sprung", () => {
    const { set, live } = recording();
    set.sync([trap({ entity_id: "t0" })], grid);
    set.sync([trap({ entity_id: "t0" }), trap({ armed: false })], grid);
    expect(live()[1].calls).toEqual(["spring sprung"]);
    expect(live()[0].calls).toEqual([]);
  });

  it("should keep the floor's first sync silent: what it lists sprung or puffed is the baseline (entering, a reconnect)", () => {
    const { set, live } = recording();
    set.sync([trap({ armed: false }), trap({ entity_id: "t2", kind: "gas_vent", puffed_at: 4 })], grid);
    expect(live().flatMap((d) => d.calls)).toEqual([]);
  });

  it("should not take a sync with no grid yet for the floor's first: the first with its grid is still the baseline", () => {
    const { set, live } = recording();
    set.sync([], undefined);
    set.sync([trap({ armed: false })], grid);
    expect(live()[0].calls).toEqual([]);
  });

  it("should take away a trap no longer listed, and draw nothing for a kind it does not know", () => {
    const { set, live, made } = recording();
    set.sync([trap(), trap({ entity_id: "t2", kind: "bear_trap" })], grid);
    expect(live()).toHaveLength(1);
    set.sync([], grid);
    expect(made[0].destroyed).toBe(true);
    set.sync(undefined, grid);
    expect(live()).toHaveLength(0);
  });

  it("should list every trap drawn with where it stands, for the hide rule", () => {
    const { set } = recording();
    set.sync([trap(), trap({ entity_id: "t2", cell: { x: 0, y: 0 } })], grid);
    expect(set.placed().map((p) => p.pos)).toEqual([
      { x: 280, y: 360 },
      { x: 40, y: 40 },
    ]);
  });

  it("should destroy every trap on clear and draw anew after, and touch nothing on forget", () => {
    const { set, made, live } = recording();
    set.sync([trap()], grid);
    set.clear();
    expect(made[0].destroyed).toBe(true);
    set.sync([trap({ armed: false })], grid);
    // after a clear the next sight is a first again: no spring
    expect(live()[0].calls).toEqual([]);
    set.forget();
    expect(live()).toHaveLength(1);
    set.sync([trap()], grid);
    expect(live()).toHaveLength(2);
  });
});

describe("TrapSet: a trap a page revealed, drawn apart from one only detected (FS-X2CMM §J R49)", () => {
  it("should draw a revealed trap's armed frame stronger than a detected one's, and washed as revealed", () => {
    const { set, live } = recording();
    set.sync([trap(), trap({ entity_id: "t2", revealed: true })], grid);
    const [seen, revealed] = live();
    expect(seen).toMatchObject({ alpha: TRAP_FAINT, revealed: false });
    expect(revealed).toMatchObject({ look: { frame: "armed" }, alpha: TRAP_REVEALED, revealed: true });
    expect(TRAP_REVEALED).toBeGreaterThan(TRAP_FAINT);
  });

  it("should turn a held trap revealed when the state says so, playing no spring", () => {
    const { set, live } = recording();
    set.sync([trap()], grid);
    set.sync([trap({ revealed: true })], grid);
    expect(live()[0].calls).toEqual(["reveal true", `show armed ${TRAP_REVEALED}`]);
    set.sync([trap({ revealed: true })], grid);
    expect(live()[0].calls).toHaveLength(2);
  });

  it("should keep a revealed trap washed through its spring, and settle it back at the revealed alpha once re-armed", () => {
    const { set, live } = recording();
    set.sync([trap({ revealed: true })], grid);
    set.sync([trap({ revealed: true, armed: false })], grid);
    set.sync([trap({ revealed: true })], grid);
    expect(live()[0].revealed).toBe(true);
    expect(live()[0].calls).toEqual(["reveal true", "spring sprung", `show armed ${TRAP_REVEALED}`]);
  });

  it("should settle a revealed gas vent's puff at the revealed alpha", () => {
    const { set, live } = recording();
    set.sync([trap({ kind: "gas_vent", revealed: true })], grid);
    set.sync([trap({ kind: "gas_vent", revealed: true, puffed_at: 3 })], grid);
    expect(live()[0].calls).toContain(`spring puff then armed ${TRAP_REVEALED}`);
  });
});
