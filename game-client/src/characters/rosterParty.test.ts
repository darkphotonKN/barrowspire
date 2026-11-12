import { describe, expect, it } from "vitest";
import type { PartyUpdatePayload } from "@/stores/partyStore";
import {
  ROSTER_PARTY_MARK,
  SWITCH_LOCKED,
  entryChoice,
  inPartyAs,
  switchConfirmText,
} from "./rosterParty";

const SELF = "11111111-1111-4111-8111-111111111111";
const WREN = "22222222-2222-4222-8222-222222222222";

const kaelen = { name: "Kaelen", className: "warrior" } as const;
const brannoc = { name: "Brannoc", className: "archer" } as const;

/** A party of Wren and this player, as Kaelen, as the roster's sync sends it. */
function party(over: Partial<PartyUpdatePayload> = {}): PartyUpdatePayload {
  return {
    party_id: "33333333-3333-4333-8333-333333333333",
    leader_id: WREN,
    members: [
      { player_id: WREN, name: "Wren", class: "mage", joined_at: "2026-11-12T10:00:00Z", where: "hub" },
      { player_id: SELF, name: "Kaelen", class: "warrior", joined_at: "2026-11-12T10:01:00Z", where: "" },
    ],
    size: 2,
    reason: "sync",
    subject_id: SELF,
    ...over,
  };
}

// FS-NCC9J §Change: Changing character leaves the party, C9-C12 (owner 2026-11-12).
describe("inPartyAs: the roster card the party holds this player as (C9)", () => {
  it("should mark the character the party lists this player as, by name, case aside", () => {
    expect(inPartyAs(kaelen, party(), SELF)).toBe(true);
    expect(inPartyAs({ name: "kaelen", className: "Warrior" }, party(), SELF)).toBe(true);
  });

  it("should mark no other character, nor a teammate's name", () => {
    expect(inPartyAs(brannoc, party(), SELF)).toBe(false);
    expect(inPartyAs({ name: "Wren", className: "mage" }, party(), SELF)).toBe(false);
  });

  it("should mark nothing with no party or no player", () => {
    expect(inPartyAs(kaelen, null, SELF)).toBe(false);
    expect(inPartyAs(kaelen, party(), undefined)).toBe(false);
  });
});

describe("entryChoice: what pressing ENTER THE TOWN does (C10-C12)", () => {
  it("should enter at once with no party", () => {
    expect(entryChoice(brannoc, null, SELF)).toEqual({ kind: "enter" });
  });

  it("should enter at once as the party's own character, stay in the party (C10)", () => {
    expect(entryChoice(kaelen, party(), SELF)).toEqual({ kind: "enter" });
    expect(entryChoice(kaelen, party({ locked: true }), SELF)).toEqual({ kind: "enter" });
  });

  it("should ask first as another character, naming it (C11)", () => {
    expect(entryChoice(brannoc, party(), SELF)).toEqual({
      kind: "confirm",
      text: "Entering as Brannoc will leave your party.",
    });
    expect(switchConfirmText("Brannoc")).toBe("Entering as Brannoc will leave your party.");
  });

  it("should refuse another character while the party's run is under way, in the server's words (C12)", () => {
    expect(entryChoice(brannoc, party({ locked: true }), SELF)).toEqual({
      kind: "refused",
      text: SWITCH_LOCKED,
    });
    expect(SWITCH_LOCKED).toBe("You cannot change character during a delve.");
  });

  it("should name the mark in capitals, no emoji", () => {
    expect(ROSTER_PARTY_MARK).toBe("IN A PARTY");
  });
});
