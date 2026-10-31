import { describe, expect, it } from "vitest";
import { PARTY_NOTICE_COPY, partyNoticeText } from "./partyNotice";

// FS-R82NV §Requirements R31, R36: every party_notice code, its copy, the name filled in.

describe("partyNoticeText (FS-R82NV R36)", () => {
  it.each([
    ["sent", "Wren", "Word sent to Wren."],
    ["accepted", "Wren", "Wren answers the call."],
    ["no_show", "Wren", "Wren did not arrive."],
    ["declined", "Wren", "Wren declines."],
    ["expired", "Wren", "No answer from Wren."],
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
  ])("%s → %s", (code, name, want) => {
    expect(partyNoticeText({ code, name })).toBe(want);
  });

  it("should cover every code in R36's table", () => {
    expect(Object.keys(PARTY_NOTICE_COPY)).toHaveLength(18);
  });

  it("should fall back to a bare subject when a named code arrives without its name", () => {
    expect(partyNoticeText({ code: "declined" })).toBe("Someone declines.");
  });

  it("should return null for a code it has no copy for, so nothing unworded is shown", () => {
    expect(partyNoticeText({ code: "brand_new" })).toBeNull();
  });
});
