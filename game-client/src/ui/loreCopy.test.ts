import { describe, expect, it, vi } from "vitest";
import { lootRefusalCopy } from "@/scenes/fieldRefusals";
import { CONTAINER_GUARDED } from "./floor";
import { burnHeard, loreForEvent, loreForFall, loreForReply, newlyEscaped, turnedOn } from "./loreCopy";

// the field's refusal words, real unless a test takes them away
vi.mock("@/scenes/fieldRefusals", async (actual) => {
  const real = await actual<typeof import("@/scenes/fieldRefusals")>();
  return { ...real, lootRefusalCopy: vi.fn(real.lootRefusalCopy) };
});

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
    const line = loreForReply({ success: false, message: "its guards still stand", reason: CONTAINER_GUARDED });
    expect(line).toEqual({ text: "It will not open.", tone: "lore" });
    expect(line?.text).not.toMatch(/guard|monster|lock|kill/i);
  });

  it("should give a reserved pile the field's words for the same reason", () => {
    expect(loreForReply({ success: false, message: "that loot is reserved for its killer", reason: "loot_reserved" })).toEqual({
      text: lootRefusalCopy("loot_reserved"),
      tone: "lore",
    });
  });

  it("should say nothing for a reserved pile when the field has no words for it, never an empty line", () => {
    vi.mocked(lootRefusalCopy).mockReturnValueOnce(undefined);
    expect(loreForReply({ success: false, message: "that loot is reserved for its killer", reason: "loot_reserved" })).toBeNull();
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

// FS-XWHZP §E R22-R24. I-XWHZP-3: broadcast lines fire on a transition only; the first broadcast
// is the baseline.

describe("turnedOn (FS-XWHZP R22, R23)", () => {
  it("should see a flag turn on between two broadcasts", () => {
    expect(turnedOn(false, true)).toBe(true);
  });

  it("should take the first broadcast as the baseline, whatever it says", () => {
    expect(turnedOn(undefined, true)).toBe(false);
    expect(turnedOn(undefined, false)).toBe(false);
  });

  it("should see nothing while a flag stays, or when it turns off", () => {
    expect(turnedOn(true, true)).toBe(false);
    expect(turnedOn(false, false)).toBe(false);
    expect(turnedOn(true, false)).toBe(false);
  });
});

describe("burnHeard (FS-3103M R26 as amended by A1)", () => {
  it("should hear the burn on the altar's unburned-to-burned flip", () => {
    expect(burnHeard({ burned: false }, { burned: true })).toBe(true);
  });

  it("should take a first state as the baseline: a connect, a reconnect, a new floor", () => {
    expect(burnHeard(undefined, { burned: true })).toBe(false);
    expect(burnHeard(undefined, { burned: false })).toBe(false);
  });

  it("should hear nothing while the altar stays as it was, or with no altar on this state", () => {
    expect(burnHeard({ burned: true }, { burned: true })).toBe(false);
    expect(burnHeard({ burned: false }, { burned: false })).toBe(false);
    expect(burnHeard({ burned: false }, undefined)).toBe(false);
    expect(burnHeard(undefined, undefined)).toBe(false);
  });
});

describe("newlyEscaped (FS-XWHZP R23, R24)", () => {
  const out = (id: string, username: string, escape = true) => ({ id, username, escape });

  it("should seed every player already out on the first broadcast, and name none", () => {
    const seen = newlyEscaped(undefined, [out("me", "Aldric"), out("ally", "Wenna", false)]);
    expect(seen.escaped).toEqual([]);
    expect([...seen.said]).toEqual(["me"]);
  });

  it("should name each player who has escaped since, once", () => {
    const first = newlyEscaped(undefined, [out("me", "Aldric", false), out("ally", "Wenna", false)]);
    const second = newlyEscaped(first.said, [out("me", "Aldric", false), out("ally", "Wenna")]);
    expect(second.escaped).toEqual([{ id: "ally", name: "Wenna" }]);
    const third = newlyEscaped(second.said, [out("me", "Aldric"), out("ally", "Wenna")]);
    expect(third.escaped).toEqual([{ id: "me", name: "Aldric" }]);
  });

  it("should pass over a player with no id", () => {
    const first = newlyEscaped(undefined, []);
    expect(newlyEscaped(first.said, [out("", "Nobody")]).escaped).toEqual([]);
  });
});
