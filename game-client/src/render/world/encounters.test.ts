import { describe, expect, it } from "vitest";
import { ENCOUNTER_ART } from "@/render/art/sceneArt";
import type { EncounterNPCState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import {
  EncounterSet,
  encounterClip,
  encounterName,
  encounterPlate,
  type EncounterClip,
  type EncounterLook,
  type EncounterPlate,
} from "./encounters";
import { INTERACT_RANGE } from "./stairs";

type Point = { x: number; y: number };

/** A stand-in for the scene and its art: each body drawn and every call made on it, the art's fetches. */
function recording(own = false) {
  type Body = {
    look: EncounterLook;
    at: Point;
    clip?: EncounterClip;
    facing?: string;
    plate?: EncounterPlate | null;
    calls: string[];
    destroyed: boolean;
    destroy(): void;
  };
  const made: Body[] = [];
  let fetched = 0;
  const art = {
    held: own,
    has: (sheet: string) => !sheet.startsWith("npc_") || art.held,
    fetch: () => void fetched++,
  };
  const set = new EncounterSet<Body>(
    {
      add: (look, at) => {
        const body: Body = { look, at, calls: [], destroyed: false, destroy: () => void (body.destroyed = true) };
        made.push(body);
        return body;
      },
      wear: (body, look) => {
        body.look = look;
        body.calls.push(`wear ${look.sheet}`);
      },
      stand: (body, at) => void (body.at = at),
      play: (body, clip, facing) => {
        body.clip = clip;
        body.facing = facing;
      },
      plate: (body, plate) => void (body.plate = plate),
    },
    () => art,
  );
  const live = () => made.filter((b) => !b.destroyed);
  return { set, made, live, art, fetches: () => fetched };
}

const npc = (over: Partial<EncounterNPCState> = {}): EncounterNPCState => ({
  entity_id: "npc-1",
  kind: "pilgrim",
  look: "pilgrim_b",
  position: { x: 400, y: 300 },
  facing: { x: 0, y: 1 },
  health: 30,
  max_health: 60,
  stance: "peaceful",
  action: "idle",
  ...over,
});

// FS-4EC7Z §G R29 (I-4EC7Z-6): encounter NPCs on the canvas
describe("encounter NPCs' plates and clips (FS-4EC7Z §G R29)", () => {
  it.each([
    ["pilgrim", "Pilgrim"],
    ["captive", "Captive"],
    ["cutthroat", "Cutthroat"],
    ["lost_soul", "Lost Soul"],
  ])("should name a %s %j", (kind, name) => expect(encounterName(kind)).toBe(name));

  it("should plate one that is no ally with its kind's name in the neutral ink, and no bar", () => {
    expect(encounterPlate(npc())).toEqual({ name: "Pilgrim", ink: palette.markerEncounter, bar: null });
    expect(encounterPlate(npc({ kind: "captive", stance: "caged" }))).toEqual({ name: "Captive", ink: palette.markerEncounter, bar: null });
  });

  it("should plate an ally in the ally ink with its health over the head (FS-CH21F's bar, shown for allies)", () => {
    expect(encounterPlate(npc({ kind: "cutthroat", stance: "ally", hirer_id: "p1" }))).toEqual({
      name: "Cutthroat",
      ink: palette.markerAlly,
      bar: 0.5,
    });
  });

  it("should plate no corpse", () => {
    expect(encounterPlate(npc({ action: "dead", health: 0 }))).toBeNull();
  });

  it.each([
    ["idle", "peaceful", "idle"],
    ["move", "ally", "walk"],
    ["attack", "ally", "attack"],
    ["cower", "peaceful", "cower"],
    ["dead", "peaceful", "death"],
    ["idle", "caged", "bound"],
    ["dead", "caged", "death"],
    ["sing", "peaceful", "idle"],
  ])("should play %s (stance %s) as %s", (action, stance, clip) => {
    expect(encounterClip(npc({ action, stance }), () => true)).toBe(clip);
  });

  it("should play idle for a clip the sheet does not carry: a cutthroat's cower, a pilgrim's bound", () => {
    expect(encounterClip(npc({ action: "cower" }), (c) => c !== "cower")).toBe("idle");
    expect(encounterClip(npc({ stance: "caged" }), (c) => c !== "bound")).toBe("idle");
  });
});

describe("EncounterSet: the encounter NPCs on the canvas (FS-4EC7Z §G R29)", () => {
  it("should draw each listed NPC at its position as the stand-in, and ask for the encounters' group once", () => {
    const { set, made, fetches } = recording();
    set.sync({ encounter_npcs: [npc(), npc({ entity_id: "npc-2", look: "cutthroat_a", kind: "cutthroat" })] });
    set.sync({ encounter_npcs: [npc(), npc({ entity_id: "npc-2", look: "cutthroat_a", kind: "cutthroat" })] });
    expect(made.map((b) => b.look)).toEqual([
      { sheet: ENCOUNTER_ART.standIn.sheet, tint: ENCOUNTER_ART.standIn.tint },
      { sheet: ENCOUNTER_ART.standIn.sheet, tint: ENCOUNTER_ART.standIn.tint },
    ]);
    expect(made[0].at).toEqual({ x: 400, y: 300 });
    expect(fetches()).toBe(1);
  });

  it("should dress each in its own look once the group lands: its sheet, and a variant's own clips", () => {
    const { set, made, art } = recording();
    set.sync({ encounter_npcs: [npc(), npc({ entity_id: "npc-2", look: "pilgrim_a" })] });
    art.held = true;
    set.landed();
    expect(made.map((b) => b.look)).toEqual([
      { sheet: "npc_pilgrim", variant: "b" },
      { sheet: "npc_pilgrim" },
    ]);
  });

  it("should draw its own look at once with its group in, asking for nothing", () => {
    const { set, made, fetches } = recording(true);
    set.sync({ encounter_npcs: [npc({ look: "captive_b", kind: "captive" })] });
    expect(made[0].look).toEqual({ sheet: "npc_captive", variant: "b" });
    expect(fetches()).toBe(0);
  });

  it("should play its clip in the facing sent, and plate it, on its first sight and on each change", () => {
    const { set, made } = recording(true);
    set.sync({ encounter_npcs: [npc({ action: "cower", facing: { x: 1, y: 0 } })] });
    set.step();
    expect(made[0]).toMatchObject({ clip: "cower", facing: "e" });
    expect(made[0].plate).toEqual({ name: "Pilgrim", ink: palette.markerEncounter, bar: null });
    set.sync({ encounter_npcs: [npc({ action: "dead", health: 0 })] });
    set.step();
    expect(made[0].clip).toBe("death");
    expect(made[0].plate).toBeNull();
  });

  it("should turn its plate to the ally plate when it is hired", () => {
    const { set, made } = recording(true);
    set.sync({ encounter_npcs: [npc({ kind: "cutthroat", look: "cutthroat_a" })] });
    set.sync({ encounter_npcs: [npc({ kind: "cutthroat", look: "cutthroat_a", stance: "ally", hirer_id: "p1", health: 45 })] });
    set.step();
    expect(made[0].plate).toEqual({ name: "Cutthroat", ink: palette.markerAlly, bar: 0.75 });
  });

  it("should ease a moving NPC toward its new position each frame, as monsters are", () => {
    const { set, made } = recording(true);
    set.sync({ encounter_npcs: [npc()] });
    set.sync({ encounter_npcs: [npc({ position: { x: 500, y: 300 }, action: "move" })] });
    set.step();
    expect(made[0].at.x).toBeGreaterThan(400);
    expect(made[0].at.x).toBeLessThan(500);
    for (let i = 0; i < 60; i++) set.step();
    expect(made[0].at.x).toBeCloseTo(500, 0);
  });

  it("should take down an NPC no longer listed, and every one on clear", () => {
    const { set, live } = recording();
    set.sync({ encounter_npcs: [npc(), npc({ entity_id: "npc-2" })] });
    set.sync({ encounter_npcs: [npc({ entity_id: "npc-2" })] });
    expect(live()).toHaveLength(1);
    set.sync({});
    expect(live()).toHaveLength(0);
    set.sync({ encounter_npcs: [npc()] });
    set.clear();
    expect(live()).toHaveLength(0);
  });

  it("should be the talk target E reaches: the nearest living NPC in reach, never a corpse", () => {
    const { set } = recording(true);
    set.sync({
      encounter_npcs: [npc(), npc({ entity_id: "npc-2", position: { x: 430, y: 300 } }), npc({ entity_id: "npc-3", position: { x: 445, y: 300 }, action: "dead" })],
    });
    expect(set.reach({ x: 440, y: 300 })).toEqual({ target: { kind: "encounter_npc", entityId: "npc-2" }, distance: 10 });
    expect(set.reach({ x: 400 + INTERACT_RANGE + 40, y: 300 })).toBeNull();
  });

  it("should list each body and where it is drawn, for the hide rule, and say where one stands by its id", () => {
    const { set, made } = recording(true);
    set.sync({ encounter_npcs: [npc()] });
    expect(set.placed()).toEqual([{ sprite: made[0], pos: { x: 400, y: 300 } }]);
    expect(set.drawn("npc-1")).toEqual({ body: made[0], pos: { x: 400, y: 300 } });
    expect(set.drawn("nobody")).toBeUndefined();
  });

  it("should forget every NPC without touching its body", () => {
    const { set, made } = recording(true);
    set.sync({ encounter_npcs: [npc()] });
    set.forget();
    expect(made[0].destroyed).toBe(false);
    expect(set.placed()).toEqual([]);
  });
});
