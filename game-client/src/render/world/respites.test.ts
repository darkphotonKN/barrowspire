import { describe, expect, it } from "vitest";
import type { FountainState, HallowedAltarState } from "@/types/gameState";
import { RespiteSet } from "./respites";
import type { SealBand } from "./seal";
import type { SealLook } from "./sealLooks";
import { INTERACT_RANGE } from "./stairs";

type Point = { x: number; y: number };

/** A stand-in for the scene: each sprite drawn and every call made on it. */
function recording() {
  type Piece = { look: SealLook; at: Point; band: SealBand; calls: string[]; lit: boolean; lightKind?: string; destroyed: boolean; destroy(): void };
  const made: Piece[] = [];
  const set = new RespiteSet<Piece>({
    add: (look, at, band) => {
      const piece: Piece = { look, at, band, calls: [], lit: false, destroyed: false, destroy: () => void (piece.destroyed = true) };
      made.push(piece);
      return piece;
    },
    show: (piece, look) => {
      piece.look = look;
      piece.calls.push(`show ${look.sheet}/${look.frame}`);
    },
    stand: (piece, at) => {
      piece.at = at;
      piece.calls.push(`stand ${at.x},${at.y}`);
    },
    glow: (piece, _at, on, kind) => {
      piece.lit = on;
      piece.lightKind = kind;
      piece.calls.push(on ? "light" : "dark");
    },
  });
  const live = () => made.filter((p) => !p.destroyed);
  return { set, made, live };
}

const fountain = (dry = false, over: Partial<FountainState> = {}): FountainState => ({
  entity_id: "fountain-1",
  position: { x: 400, y: 560 },
  dry,
  ...over,
});
const altar = (prayed = false, over: Partial<HallowedAltarState> = {}): HallowedAltarState => ({
  entity_id: "altar-1",
  position: { x: 880, y: 240 },
  prayed,
  ...over,
});

// FS-5FZ4J §J R51, R52 (I-5FZ4J-11)
describe("RespiteSet: the healing fountain and the hallowed altar (FS-5FZ4J §J R51, R52)", () => {
  it("should draw each at its position, standing among the bodies, in the frame its state names", () => {
    const { set, made } = recording();
    set.sync({ fountain: fountain(), hallowed_altar: altar() });
    expect(made.map(({ look, at, band }) => ({ look, at, band }))).toMatchObject([
      { look: { sheet: "healing_fountain", frame: "full" }, at: { x: 400, y: 560 }, band: "standing" },
      { look: { sheet: "hallowed_altar", frame: "dormant" }, at: { x: 880, y: 240 }, band: "standing" },
    ]);
  });

  it("should turn the fountain dry and the altar prayed in place, each drawn once", () => {
    const { set, made } = recording();
    set.sync({ fountain: fountain(), hallowed_altar: altar() });
    set.sync({ fountain: fountain(), hallowed_altar: altar() });
    set.sync({ fountain: fountain(true), hallowed_altar: altar(true) });
    expect(made).toHaveLength(2);
    expect(made.map((p) => p.look)).toMatchObject([
      { sheet: "healing_fountain", frame: "dry" },
      { sheet: "hallowed_altar", frame: "prayed" },
    ]);
    expect(made.map((p) => p.calls.filter((c) => c.startsWith("show")))).toEqual([
      ["show healing_fountain/dry"],
      ["show hallowed_altar/prayed"],
    ]);
  });

  it("should light the altar's candles while it is dormant, put them out once prayed, and never light the fountain", () => {
    const { set, made } = recording();
    set.sync({ fountain: fountain(), hallowed_altar: altar() });
    const [basin, stone] = made;
    expect(stone.lit).toBe(true);
    // the candles are the hallowed altar's own kind of fixed light, never a brazier's (FS-8RBQY §C.6)
    expect(stone.lightKind).toBe("hallowed_altar");
    set.sync({ fountain: fountain(), hallowed_altar: altar(true) });
    expect(stone.lit).toBe(false);
    expect(basin.calls).not.toContain("light");
  });

  it("should draw an altar first seen prayed dark (a reconnect)", () => {
    const { set, made } = recording();
    set.sync({ hallowed_altar: altar(true) });
    expect(made[0].look.frame).toBe("prayed");
    expect(made[0].calls).not.toContain("light");
  });

  it("should take each down once no longer listed, the altar's candles out with it", () => {
    const { set, made, live } = recording();
    set.sync({ fountain: fountain(), hallowed_altar: altar() });
    set.sync({});
    expect(live()).toEqual([]);
    expect(made[1].calls).toContain("dark");
  });

  it("should draw a new one afresh for a new entity", () => {
    const { set, made, live } = recording();
    set.sync({ fountain: fountain() });
    set.sync({ fountain: fountain(false, { entity_id: "fountain-2", position: { x: 10, y: 20 } }) });
    expect(made[0].destroyed).toBe(true);
    expect(live().map((p) => p.at)).toEqual([{ x: 10, y: 20 }]);
  });

  it("should make the dormant altar the E target in reach, Pray, and never the fountain (R52)", () => {
    const { set } = recording();
    set.sync({ fountain: fountain(false, { position: { x: 880, y: 250 } }), hallowed_altar: altar() });
    expect(set.nearby({ x: 880, y: 240 + INTERACT_RANGE - 1 })).toEqual({ kind: "hallowed_altar", entityId: "altar-1" });
    expect(set.nearby({ x: 880, y: 240 + INTERACT_RANGE + 1 })).toBeNull();
  });

  it("should reach no altar once it is prayed at", () => {
    const { set } = recording();
    set.sync({ hallowed_altar: altar(true) });
    expect(set.nearby({ x: 880, y: 240 })).toBeNull();
  });

  it("should reach nothing at a fountain alone", () => {
    const { set } = recording();
    set.sync({ fountain: fountain() });
    expect(set.nearby({ x: 400, y: 560 })).toBeNull();
  });

  it("should say what it drew for an entity, for the prayer's bar, and where each stands", () => {
    const { set, made } = recording();
    set.sync({ fountain: fountain(), hallowed_altar: altar() });
    expect(set.drawnFor("altar-1")).toEqual([made[1]]);
    expect(set.drawnFor("door-1")).toEqual([]);
    expect(set.placed().map((p) => p.pos)).toEqual([{ x: 400, y: 560 }, { x: 880, y: 240 }]);
  });

  it("should destroy both on clear, the candles out first, and only forget them on forget", () => {
    const cleared = recording();
    cleared.set.sync({ fountain: fountain(), hallowed_altar: altar() });
    cleared.set.clear();
    expect(cleared.live()).toEqual([]);
    expect(cleared.made[1].lit).toBe(false);
    expect(cleared.set.placed()).toEqual([]);
    const forgot = recording();
    forgot.set.sync({ fountain: fountain() });
    forgot.set.forget();
    expect(forgot.made[0].destroyed).toBe(false);
    expect(forgot.set.placed()).toEqual([]);
  });
});
