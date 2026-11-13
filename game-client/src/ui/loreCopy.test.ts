import { describe, expect, it } from "vitest";
import { lootRefusalCopy } from "@/scenes/fieldRefusals";
import { loreForEvent, loreForFall, loreForReply } from "./loreCopy";

// FS-XWHZP §D R16-R18, §F R25. I-XWHZP-2: what the world says inside the Spire, keyed on the event
// or the reply's reason, in the client's own words.

describe("loreForReply (FS-XWHZP R16-R18)", () => {
  const gather = (missing?: number) => ({
    success: false,
    message: "the party has not gathered at the stairs",
    reason: "party_not_gathered",
    missing,
  });

  it("should write the stair's wait in the lore voice from `missing`, never the server's words (FS-F6F88 req 31)", () => {
    expect(loreForReply(gather(2))).toEqual({
      text: "The stair waits. 2 of your party are not yet with you.",
      tone: "lore",
    });
    expect(loreForReply(gather(1))?.text).toBe("The stair waits. 1 of your party is not yet with you.");
  });

  it("should still turn the party back when the count is missing or nonsense", () => {
    for (const missing of [undefined, 0, -1])
      expect(loreForReply(gather(missing))).toEqual({ text: "The stair waits for the whole party.", tone: "lore" });
  });

  it("should say a guarded chest will not open, and give no reason why (FS-KE075 §J R60)", () => {
    const line = loreForReply({ success: false, message: "its guards still stand", reason: "container_guarded" });
    expect(line).toEqual({ text: "It will not open.", tone: "lore" });
    expect(line?.text).not.toMatch(/guard|monster|lock|kill/i);
  });

  it("should give a reserved pile the field's words for the same reason", () => {
    expect(loreForReply({ success: false, message: "that loot is reserved for its killer", reason: "loot_reserved" })).toEqual({
      text: lootRefusalCopy("loot_reserved"),
      tone: "lore",
    });
  });

  it("should write FS-3103M's tome and altar lines, as amended (R25)", () => {
    expect(loreForReply({ success: true, message: "", reason: "tome_taken" })).toEqual({
      text: "Wonder if I can burn it.",
      tone: "lore",
    });
    expect(loreForReply({ success: false, message: "no tome", reason: "altar_without_tome" })).toEqual({
      text: "A tome was burned here once, they say, to insult a demon.",
      tone: "lore",
    });
  });

  it("should say nothing for a burned altar, whatever the server wrote (R16)", () => {
    expect(loreForReply({ success: false, message: "the altar is burned", reason: "altar_burned" })).toBeNull();
  });

  it("should keep the server's words, as lore, for a reply with no reason it knows (R17)", () => {
    expect(loreForReply({ success: false, message: "too far away to interact" })).toEqual({
      text: "too far away to interact",
      tone: "lore",
    });
    expect(loreForReply({ success: false, message: "escape door is locked", reason: "unknown_reason" })).toEqual({
      text: "escape door is locked",
      tone: "lore",
    });
    expect(loreForReply({ success: true, message: "The door gives way." })).toEqual({
      text: "The door gives way.",
      tone: "lore",
    });
  });

  it("should say nothing for the empty frame that follows a reply (R18)", () => {
    expect(loreForReply({ success: false, message: "" })).toBeNull();
    expect(loreForReply({ success: true, message: "" })).toBeNull();
  });
});

describe("loreForFall (FS-XWHZP R16; FS-9K8EZ req 4)", () => {
  it("should pass the server's words as lore", () => {
    expect(loreForFall("You are already out of the delve.")).toEqual({
      text: "You are already out of the delve.",
      tone: "lore",
    });
  });

  it("should say the barrow will not take you yet when the server said nothing", () => {
    expect(loreForFall(undefined)).toEqual({ text: "The barrow will not take you yet.", tone: "lore" });
    expect(loreForFall("")).toEqual({ text: "The barrow will not take you yet.", tone: "lore" });
  });
});

describe("loreForEvent (FS-XWHZP R16)", () => {
  it("should break the seal in hope, the same line for the switch and the server's one-shot (R14)", () => {
    const line = { text: "The seal breaks. Somewhere, a door gives.", tone: "hope" };
    expect(loreForEvent({ kind: "switch_thrown" })).toEqual(line);
    expect(loreForEvent({ kind: "exit_door_unlocked" })).toEqual(line);
  });

  it("should open the way out in hope", () => {
    expect(loreForEvent({ kind: "door_opened" })).toEqual({ text: "The way out stands open.", tone: "hope" });
  });

  it("should walk a player out of the dark by name, and the player themself as you", () => {
    expect(loreForEvent({ kind: "escaped", name: "Wenna", self: false })).toEqual({
      text: "Wenna walks out of the dark.",
      tone: "hope",
    });
    expect(loreForEvent({ kind: "escaped", name: "Aldric", self: true })).toEqual({
      text: "You walk out of the dark.",
      tone: "hope",
    });
  });

  it("should hear the burn from hell in dread (FS-3103M R26, as amended)", () => {
    expect(loreForEvent({ kind: "burn_heard" })).toEqual({ text: "You hear a sound from hell", tone: "dread" });
  });
});
