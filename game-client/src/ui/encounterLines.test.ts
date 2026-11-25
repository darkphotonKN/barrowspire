import { describe, expect, it } from "vitest";
import type { EncounterNPCState } from "@/types/gameState";
import { loreForReply } from "./loreCopy";
import { ENCOUNTER_REPLY_REASONS, EncounterWatch, encounterLineText, encounterReplyNotice } from "./encounterLines";

const npc = (id: string, over: Partial<EncounterNPCState> = {}): EncounterNPCState => ({
  entity_id: id,
  kind: "pilgrim",
  look: "pilgrim_a",
  position: { x: 100, y: 100 },
  facing: { x: 0, y: 1 },
  health: 40,
  max_health: 40,
  stance: "peaceful",
  action: "cower",
  ...over,
});
const dead = (id: string, over: Partial<EncounterNPCState> = {}) => npc(id, { action: "dead", health: 0, ...over });

// FS-4EC7Z §G R30 (I-4EC7Z-6): the over-head lines' copy, the client's voice, keyed on the server's line keys (§F R26)
describe("encounterLineText: the over-head lines' words (FS-4EC7Z §G R30)", () => {
  it.each([
    ["pilgrim_plea", "Please, they're coming!"],
    ["pilgrim_thanks", "Bless you. Take this."],
    ["captive_plea", "The key! Find the key!"],
    ["captive_freed", "We'll fight with you."],
    ["cutthroat_greet", "Well, well. Visitors."],
    ["cutthroat_turn", "Bad luck for you."],
    ["cutthroat_tip", "There's a door in the wall. Look there."],
    ["cutthroat_lore", "Nothing in these walls worth your while. Move on."],
    ["ally_ack", "Lead on."],
  ])("should say %s as %j", (key, text) => expect(encounterLineText(key)).toBe(text));

  it.each(["", "pilgrim_sings", "toString"])("should say nothing for a key it does not know (%j)", (key) =>
    expect(encounterLineText(key)).toBeNull(),
  );
});

// FS-4EC7Z §F R27, §G R31: the encounters' refusals as HUD notices, never the server's words as a lore line
describe("encounterReplyNotice: the encounters' refusals (FS-4EC7Z §F R27, §G R31)", () => {
  it("should say Locked. Find the key. for cage_locked, refused", () => {
    expect(encounterReplyNotice({ success: false, message: "the cage is locked", reason: "cage_locked" })).toEqual({
      text: "Locked. Find the key.",
      tone: "refused",
    });
  });

  it.each(ENCOUNTER_REPLY_REASONS)("should give %s a refused line of the client's own, and no lore line", (reason) => {
    const reply = { success: false, message: "server words", reason };
    const notice = encounterReplyNotice(reply);
    expect(notice?.tone).toBe("refused");
    expect(notice?.text).not.toBe("server words");
    expect(loreForReply(reply)).toBeNull();
  });

  it("should say nothing for any other reply", () => {
    expect(encounterReplyNotice({ success: false, message: "", reason: "stairs_sealed" })).toBeNull();
    expect(encounterReplyNotice({ success: true, message: "" })).toBeNull();
  });
});

// FS-4EC7Z §G R31, R33: the cage key taken and the pilgrims lost, read off the state against the last broadcast
describe("EncounterWatch: the encounters' events off the state (FS-4EC7Z §G R31, R33)", () => {
  it("should say The cage key. when cage_key_carried turns true, and not again while it holds", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2 });
    expect(watch.see({ floor: 2, cage_key_carried: true })).toEqual([{ text: "The cage key.", tone: "waiting" }]);
    expect(watch.see({ floor: 2, cage_key_carried: true })).toEqual([]);
  });

  it("should say nothing of a key already carried on a first broadcast, nor on a new floor's", () => {
    const watch = new EncounterWatch();
    expect(watch.see({ floor: 2, cage_key_carried: true })).toEqual([]);
    watch.see({ floor: 2 });
    expect(watch.see({ floor: 3, cage_key_carried: true })).toEqual([]);
  });

  it("should say The pilgrims are lost., refused, once the last living pilgrim dies without their thanks", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2, encounter_npcs: [npc("a"), npc("b")] });
    expect(watch.see({ floor: 2, encounter_npcs: [dead("a"), npc("b")] })).toEqual([]);
    expect(watch.see({ floor: 2, encounter_npcs: [dead("a"), dead("b")] })).toEqual([{ text: "The pilgrims are lost.", tone: "refused" }]);
    // their corpses gone, nothing more
    expect(watch.see({ floor: 2, encounter_npcs: [] })).toEqual([]);
    expect(watch.see({ floor: 2 })).toEqual([]);
  });

  it("should say it when the dead pilgrims' entries are gone as the last one falls", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2, encounter_npcs: [dead("a"), npc("b")] });
    watch.see({ floor: 2, encounter_npcs: [npc("b")] });
    expect(watch.see({ floor: 2, encounter_npcs: [dead("b")] })).toEqual([{ text: "The pilgrims are lost.", tone: "refused" }]);
  });

  it("should say nothing when a pilgrim lives through the wave and thanks the party", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2, encounter_npcs: [npc("a"), npc("b")] });
    watch.see({ floor: 2, encounter_npcs: [dead("a"), npc("b", { line: "pilgrim_thanks", line_at: 30 })] });
    // a stray monster takes the last of them after the thanks: they were not lost to the wave
    expect(watch.see({ floor: 2, encounter_npcs: [dead("a"), dead("b", { line: "pilgrim_thanks", line_at: 30 })] })).toEqual([]);
  });

  it("should say nothing when living pilgrims only leave the state (the party walked out of their interest)", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2, encounter_npcs: [npc("a"), npc("b")] });
    expect(watch.see({ floor: 2, encounter_npcs: [] })).toEqual([]);
    expect(watch.see({ floor: 2 })).toEqual([]);
  });

  // R33: a pilgrim that left the state alive is unknown, not lost; the line waits until none is
  it("should not say they are lost while a pilgrim that left the state alive is unknown", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2, encounter_npcs: [npc("a"), npc("b")] });
    // a walks out of the party's interest alive; b dies in sight
    expect(watch.see({ floor: 2, encounter_npcs: [npc("b")] })).toEqual([]);
    expect(watch.see({ floor: 2, encounter_npcs: [dead("b")] })).toEqual([]);
    // a seen again alive: still not lost
    expect(watch.see({ floor: 2, encounter_npcs: [npc("a"), dead("b")] })).toEqual([]);
  });

  it("should say they are lost once an unknown pilgrim is seen again dead, and the rest are dead", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2, encounter_npcs: [npc("a"), npc("b")] });
    watch.see({ floor: 2, encounter_npcs: [npc("b")] });
    watch.see({ floor: 2, encounter_npcs: [dead("b")] });
    expect(watch.see({ floor: 2, encounter_npcs: [dead("a"), dead("b")] })).toEqual([{ text: "The pilgrims are lost.", tone: "refused" }]);
  });

  it("should say nothing on a first broadcast that finds them dead, nor count captives or cutthroats", () => {
    const watch = new EncounterWatch();
    expect(watch.see({ floor: 2, encounter_npcs: [dead("a")] })).toEqual([]);
    const other = new EncounterWatch();
    other.see({ floor: 2, encounter_npcs: [npc("c", { kind: "captive", stance: "caged" })] });
    expect(other.see({ floor: 2, encounter_npcs: [dead("c", { kind: "captive" })] })).toEqual([]);
  });

  it("should take a reset's next broadcast as a first", () => {
    const watch = new EncounterWatch();
    watch.see({ floor: 2, encounter_npcs: [npc("a")] });
    watch.reset();
    expect(watch.see({ floor: 2, encounter_npcs: [dead("a")] })).toEqual([]);
  });
});
