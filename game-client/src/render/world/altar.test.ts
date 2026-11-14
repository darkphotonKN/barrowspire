import { describe, expect, it } from "vitest";
import { shippedManifest } from "@/render/art/artLoader.standin";
import { ALTAR, TOME, SummoningSet, altarFrame, type SummoningLook } from "./altar";
import { INTERACT_RANGE } from "./stairs";

/** A stand-in for the scene: each drawn piece and every call made on it. */
function recording() {
  const made: { look: SummoningLook; at: { x: number; y: number }; calls: string[]; destroyed: boolean }[] = [];
  const set = new SummoningSet<(typeof made)[number] & { destroy(): void }>({
    add: (look, at) => {
      const piece = { look, at, calls: [] as string[], destroyed: false, destroy: () => void (piece.destroyed = true) };
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
  });
  return { set, made };
}

const tome = (x = 100, y = 200) => ({ entity_id: "tome-1", position: { x, y } });
const altar = (burned = false, entity_id = "altar-1") => ({ entity_id, position: { x: 500, y: 400 }, burned });

describe("the tome and the altar's frames (FS-3103M §H R23, §I R27)", () => {
  it("should show the altar dormant until it is burned", () => {
    expect(altarFrame(false)).toBe("dormant");
    expect(altarFrame(true)).toBe("burned");
  });

  it("should name sheets and frames the shipped manifest bakes, on the resident summoning group", () => {
    const manifest = shippedManifest();
    expect(manifest.sheets[TOME.sheet].animations[TOME.frame]).toBeDefined();
    for (const frame of ["dormant", "burned"]) expect(manifest.sheets[ALTAR.sheet].animations[frame]).toBeDefined();
    for (const sheet of [TOME.sheet, ALTAR.sheet]) expect(manifest.sheets[sheet].atlas).toMatch(/^summoning-\d+$/);
  });
});

describe("SummoningSet (FS-3103M §I R27)", () => {
  it("should draw the tome and the altar at their positions from their sheets, the altar in its frame", () => {
    const { set, made } = recording();
    set.sync({ tome: tome(), altar: altar() });
    expect(made.map(({ look, at }) => ({ look, at }))).toEqual([
      { look: { sheet: "tome", frame: "default" }, at: { x: 100, y: 200 } },
      { look: { sheet: "altar", frame: "dormant" }, at: { x: 500, y: 400 } },
    ]);
  });

  it("should turn the altar to its burned frame when it burns, in place, drawn once", () => {
    const { set, made } = recording();
    set.sync({ altar: altar() });
    set.sync({ altar: altar() });
    set.sync({ altar: altar(true) });
    expect(made).toHaveLength(1);
    expect(made[0].look).toEqual({ sheet: "altar", frame: "burned" });
    expect(made[0].calls).toEqual(["show altar/burned"]);
  });

  it("should take the tome away once it is no longer listed: taken, or cut by distance", () => {
    const { set, made } = recording();
    set.sync({ tome: tome(), altar: altar() });
    set.sync({ altar: altar() });
    expect(made[0].destroyed).toBe(true);
    expect(made[1].destroyed).toBe(false);
    set.sync({});
    expect(made[1].destroyed).toBe(true);
  });

  it("should draw a new altar anew when its entity is another, and move one that moved", () => {
    const { set, made } = recording();
    set.sync({ tome: tome(), altar: altar() });
    set.sync({ tome: tome(120, 200), altar: altar(false, "altar-2") });
    expect(made[0].calls).toEqual(["stand 120,200"]);
    expect(made[1].destroyed).toBe(true);
    expect(made[2].look).toEqual({ sheet: "altar", frame: "dormant" });
  });

  it("should reach a listed tome and an unburned altar with E, never a burned altar", () => {
    const { set } = recording();
    set.sync({ tome: tome(), altar: altar() });
    expect(set.nearby({ x: 100 + INTERACT_RANGE - 1, y: 200 })).toEqual({ kind: "tome", entityId: "tome-1" });
    expect(set.nearby({ x: 100 + INTERACT_RANGE, y: 200 })).toBeNull();
    expect(set.nearby({ x: 500, y: 430 })).toEqual({ kind: "altar", entityId: "altar-1" });

    set.sync({ altar: altar(true) });
    expect(set.nearby({ x: 500, y: 430 })).toBeNull();
    expect(set.nearby({ x: 100, y: 200 })).toBeNull();
  });

  it("should list each piece drawn, where it stands, for the hide rule and the fog", () => {
    const { set, made } = recording();
    set.sync({ tome: tome(), altar: altar() });
    expect([...set.placed()]).toEqual([
      { sprite: made[0], pos: { x: 100, y: 200 } },
      { sprite: made[1], pos: { x: 500, y: 400 } },
    ]);
  });

  it("should destroy both on clear, and only forget them on forget", () => {
    const cleared = recording();
    cleared.set.sync({ tome: tome(), altar: altar() });
    cleared.set.clear();
    expect(cleared.made.every((m) => m.destroyed)).toBe(true);
    expect([...cleared.set.placed()]).toEqual([]);

    const forgot = recording();
    forgot.set.sync({ tome: tome(), altar: altar() });
    forgot.set.forget();
    expect(forgot.made.some((m) => m.destroyed)).toBe(false);
    expect(forgot.set.nearby({ x: 100, y: 200 })).toBeNull();
  });
});
