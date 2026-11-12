import { describe, expect, it } from "vitest";
import type { PartyUpdatePayload } from "@/stores/partyStore";
import {
  PARTY_MARK,
  ROSTER_PARTY_MARK,
  SWITCH_LOCKED,
  entryChoice,
  inPartyAs,
  inkMiddle,
  partyMarkLayout,
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

// FS-NCC9J §Change: Changing character leaves the party, C9 (owner 2026-11-12: "派對選角色畫面的 無限符號跟in
// party文字 對齊一下中線 然後位置放在正中間"): the rings and the words on one midline, the mark centred on the card.
describe("partyMarkLayout: the mark's place on its card (C9)", () => {
  /** A roster card as the sidebar lays them: 172 wide, its name's box 14 below its top. */
  const card = { x: 1070, y: 148, width: 172 };
  const NAME_TOP = 14;

  it.each([58, 63.4, 71])("should centre the plate across the card, words %s wide", (width) => {
    const { plate } = partyMarkLayout(card, { width, inkMiddle: 5.5 });
    expect(Math.abs(plate.x + plate.width / 2 - (card.x + card.width / 2))).toBeLessThanOrEqual(0.5);
    expect(Number.isInteger(plate.x)).toBe(true);
  });

  it.each([5.5, 6.25, 4])("should put both rings' centres on the words' ink middle, %s below their top", (middle) => {
    const { rings, text, plate } = partyMarkLayout(card, { width: 63, inkMiddle: middle });
    expect(rings).toHaveLength(2);
    for (const ring of rings) expect(ring.y).toBe(text.y + middle);
    // and that midline is the plate's
    expect(rings[0].y).toBe(plate.y + plate.height / 2);
  });

  it("should keep the plate's contents in order inside it: the rings, then the words", () => {
    const { plate, rings, text } = partyMarkLayout(card, { width: 63, inkMiddle: 5.5 });
    const r = PARTY_MARK.ring;
    expect(rings[0].x - r).toBeGreaterThan(plate.x);
    expect(rings[1].x).toBeGreaterThan(rings[0].x);
    expect(text.x).toBeGreaterThan(rings[1].x + r);
    expect(text.x + 63).toBeLessThan(plate.x + plate.width);
  });

  it("should stand in the card's top band, clear of the name under it", () => {
    const { plate } = partyMarkLayout(card, { width: 63, inkMiddle: 5.5 });
    expect(plate.y).toBeGreaterThan(card.y);
    expect(plate.y + plate.height).toBeLessThanOrEqual(card.y + NAME_TOP);
  });
});

describe("inkMiddle: where the words' ink is middled in their box (C9)", () => {
  it("should be the baseline (the font's ascent) less half the ink above it plus half below", () => {
    expect(inkMiddle(9, { ascent: 6.5, descent: 0 }, 12)).toBe(5.75);
    expect(inkMiddle(9, { ascent: 7, descent: 1 }, 12)).toBe(6);
  });

  it("should fall back to the box's middle where the ink cannot be measured", () => {
    expect(inkMiddle(9, undefined, 12)).toBe(6);
  });
});
