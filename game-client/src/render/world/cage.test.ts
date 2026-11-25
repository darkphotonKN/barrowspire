import { describe, expect, it } from "vitest";
import { shippedManifest } from "@/render/art/artLoader.standin";
import type { CageState, EncounterKeyState } from "@/types/gameState";
import { CAGE_HALF, CageSet, cageLooks, KEY_LOOK, type CageLook } from "./cage";
import { INTERACT_RANGE } from "./stairs";

type Point = { x: number; y: number };

function recording() {
  type Sprite = { look: CageLook; at: Point; depthAt: Point; destroyed: boolean; destroy(): void };
  const made: Sprite[] = [];
  const set = new CageSet<Sprite>({
    add: (look, at, depthAt) => {
      const s: Sprite = { look, at, depthAt, destroyed: false, destroy: () => void (s.destroyed = true) };
      made.push(s);
      return s;
    },
    show: (s, look) => void (s.look = look),
  });
  const live = () => made.filter((s) => !s.destroyed);
  return { set, made, live };
}

const cage = (open = false): CageState => ({ entity_id: "cage-1", position: { x: 500, y: 500 }, open });
const key = (at: Point = { x: 900, y: 140 }): EncounterKeyState => ({ entity_id: "key-1", position: at });

// FS-4EC7Z §G R31, §H R36 (I-4EC7Z-6): the cage, drawn shut or open with the captives between its back and front, and its key
describe("CageSet: the Captives' cage and its key (FS-4EC7Z §G R31)", () => {
  it("should name the baked cage's frames and the key's, on the resident sealed group", () => {
    const sheets = shippedManifest().sheets;
    for (const open of [false, true]) for (const look of Object.values(cageLooks(open))) expect(sheets[look.sheet].animations[look.frame], look.frame).toBeDefined();
    expect(sheets[KEY_LOOK.sheet].animations[KEY_LOOK.frame]).toBeDefined();
  });

  it("should draw a shut cage as its back under the captives and its front over them, sorted by its far and near corners", () => {
    const { set, live } = recording();
    set.sync({ cages: [cage()] });
    expect(live().map((s) => [s.look.frame, s.at, s.depthAt])).toEqual([
      ["shut_back", { x: 500, y: 500 }, { x: 500 - CAGE_HALF, y: 500 - CAGE_HALF }],
      ["shut_front", { x: 500, y: 500 }, { x: 500 + CAGE_HALF, y: 500 + CAGE_HALF }],
    ]);
  });

  it("should turn it open in place", () => {
    const { set, made, live } = recording();
    set.sync({ cages: [cage()] });
    set.sync({ cages: [cage(true)] });
    expect(made).toHaveLength(2);
    expect(live().map((s) => s.look.frame)).toEqual(["open_back", "open_front"]);
  });

  it("should draw the key where it lies, and take it away once taken", () => {
    const { set, live } = recording();
    set.sync({ encounter_keys: [key()] });
    expect(live().map((s) => [s.look, s.at])).toEqual([[KEY_LOOK, { x: 900, y: 140 }]]);
    set.sync({});
    expect(live()).toEqual([]);
  });

  it("should make the key and the shut cage E targets in reach, the nearer first; an open cage none", () => {
    const { set } = recording();
    set.sync({ cages: [cage()], encounter_keys: [key({ x: 540, y: 500 })] });
    expect(set.reach({ x: 560, y: 500 })).toEqual({ target: { kind: "cage_key", entityId: "key-1" }, distance: 20 });
    expect(set.reach({ x: 460, y: 500 })).toEqual({ target: { kind: "cage", entityId: "cage-1" }, distance: 40 });
    set.sync({ cages: [cage(true)] });
    expect(set.reach({ x: 460, y: 500 })).toBeNull();
    expect(set.reach({ x: 500 + INTERACT_RANGE + 100, y: 500 })).toBeNull();
  });

  it("should list every sprite for the hide rule and destroy them on clear; forget touches none", () => {
    const { set, made } = recording();
    set.sync({ cages: [cage()], encounter_keys: [key()] });
    expect(set.placed().map((p) => p.pos)).toEqual([{ x: 500, y: 500 }, { x: 500, y: 500 }, { x: 900, y: 140 }]);
    set.clear();
    expect(made.every((s) => s.destroyed)).toBe(true);
    set.sync({ cages: [cage()] });
    set.forget();
    expect(set.placed()).toEqual([]);
    expect(made.at(-1)!.destroyed).toBe(false);
  });
});
