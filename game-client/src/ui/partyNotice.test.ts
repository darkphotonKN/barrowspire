import { describe, expect, it } from "vitest";
import {
  PARTY_ENTER_REFUSALS,
  PARTY_NOTICE_COPY,
  partyNoticeText,
  readyCheckCancelText,
} from "./partyNotice";

// FS-R82NV §Requirements R31, R36, as amended by FS-NCC9J R29: every party_notice code, its copy,
// the name filled in.

describe("partyNoticeText (FS-R82NV R36, FS-NCC9J R29)", () => {
  it.each([
    ["sent", "Wren", "Word sent to Wren."],
    ["accepted", "Wren", "Wren answers the call."],
    ["no_show", "Wren", "Wren did not arrive."],
    ["declined", "Wren", "Wren declines."],
    // the accepter's view; the leader's "No answer from <name>." is the client's own (R27)
    ["expired", "Wren", "That invitation has lapsed."],
    ["not_found", "wren", "wren is not here right now."],
    ["already_in_party", "Wren", "Wren walks with another party."],
    ["party_full", undefined, "Your party is full."],
    ["pod_full", undefined, "No room where your party stands."],
    ["pending", "Wren", "Wren has already been asked."],
    ["self", undefined, "You cannot invite yourself."],
    ["not_leader", undefined, "Only the leader may do that."],
    ["not_member", undefined, "They are not in your party."],
    ["not_in_hub", undefined, "Only from the village."],
    ["locked", undefined, "Not while delving."],
    ["queued", undefined, "Leave the queue first."],
    ["party_gone", undefined, "That party is no more."],
    ["delivery_failed", "Wren", "Word could not be sent."],
    ["leader_away", undefined, "Your leader cannot be reached."],
    ["unavailable", undefined, "The party cannot be changed right now."],
    // the invite's target is in a run (FS-NCC9J R10, R29)
    ["in_run", "Mira", "Mira is in a delve."],
    ["in_run", undefined, "Someone is in a delve."],
  ])("%s → %s", (code, name, want) => {
    expect(partyNoticeText({ code, name })).toBe(want);
  });

  it("should cover every code in R36's table, R29's and FS-BJNYC's party entry", () => {
    expect(Object.keys(PARTY_NOTICE_COPY)).toHaveLength(24);
  });

  it("should word every code that refuses a party_enter (FS-BJNYC R5)", () => {
    for (const code of PARTY_ENTER_REFUSALS) expect(Object.hasOwn(PARTY_NOTICE_COPY, code)).toBe(true);
  });

  it("should fall back to a bare subject when a named code arrives without its name", () => {
    expect(partyNoticeText({ code: "declined" })).toBe("Someone declines.");
  });

  it("should return null for a code it has no copy for, so nothing unworded is shown", () => {
    expect(partyNoticeText({ code: "brand_new" })).toBeNull();
  });
});

// FS-BJNYC §Requirements R22, §Copy: party_enter's refusals, its not_in_town naming every member
// not in the town ({ code, names }, no name).
describe("partyNoticeText for party_enter's refusals (FS-BJNYC R22, §Copy)", () => {
  it.each([
    ["checking", "Your party is already being asked."],
    ["not_at_gate", "Walk to the Spire's door first."],
    // the existing words, unchanged
    ["not_member", "They are not in your party."],
    ["not_leader", "Only the leader may do that."],
    ["locked", "Not while delving."],
    ["unavailable", "The party cannot be changed right now."],
  ])("%s → %s", (code, want) => {
    expect(partyNoticeText({ code })).toBe(want);
  });

  it.each([
    [["Wren"], "Wren is not in the town."],
    [["Wren", "Mira"], "Wren and Mira are not in the town."],
    [["Wren", "Mira", "Tobin"], "Wren, Mira and Tobin are not in the town."],
  ])("not_in_town %j → %s", (names, want) => {
    expect(partyNoticeText({ code: "not_in_town", names })).toBe(want);
  });

  it("should still read when not_in_town arrives with no names", () => {
    expect(partyNoticeText({ code: "not_in_town" })).toBe("Someone is not in the town.");
    expect(partyNoticeText({ code: "not_in_town", names: [" ", ""] })).toBe("Someone is not in the town.");
  });
});

// FS-BJNYC R22, R26, §Copy (cancelled rows). I-BJNYC-5: why a ready check was cancelled.
describe("readyCheckCancelText (FS-BJNYC §Copy: a cancelled ready check, in words)", () => {
  it.each([
    ["declined", ["Wren"], "Wren declined. The party stays."],
    ["timeout", ["Wren"], "Wren did not answer. The party stays."],
    ["timeout", ["Wren", "Mira", "Tobin"], "Wren, Mira and Tobin did not answer. The party stays."],
    ["left", ["Wren"], "Wren left the town. The party stays."],
    ["disconnected", ["Wren"], "Wren is gone. The party stays."],
    ["disconnected", ["Wren", "Mira"], "Wren and Mira are gone. The party stays."],
    ["changed", [], "The party changed. Ask again."],
    ["failed", ["Wren"], "Wren's gear could not be read. Ask again."],
    ["failed", [], "The way is shut for now. Ask again."],
    ["failed", ["  "], "The way is shut for now. Ask again."],
    ["declined", [], "Someone declined. The party stays."],
  ])("should read %s with %j as the copy table says", (reason, names, text) => {
    expect(readyCheckCancelText(reason, names)).toBe(text);
  });

  it("should say nothing for a reason it has no words for", () => {
    expect(readyCheckCancelText("bored", ["Wren"])).toBeNull();
    expect(readyCheckCancelText(undefined, [])).toBeNull();
  });
});
