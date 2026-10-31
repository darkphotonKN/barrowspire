import { describe, expect, it } from "vitest";
import { partyActions, type PartyUpdatePayload } from "@/stores/partyStore";
import {
  PARTY_HINT,
  isTextEntry,
  mayTogglePartyPanel,
  partyClassLabel,
  partyPanelFrame,
  partyPanelTitle,
  partyWhereLabel,
} from "./partyPanelLayout";

// FS-R82NV §Requirements R28–R30: the T panel's rule, words and geometry, without a canvas.

const ME = "me";
const member = (player_id: string, name: string) => ({
  player_id,
  name,
  class: "mage",
  joined_at: "2026-11-01T05:00:00Z",
  where: "hub",
  online: true,
});
const party = (n: number): PartyUpdatePayload => ({
  party_id: "p",
  leader_id: ME,
  members: [
    member(ME, "Aldric"),
    ...Array.from({ length: n - 1 }, (_, i) => member(`m${i}`, `M${i}`)),
  ],
  size: 4,
  reason: "joined",
  subject_id: ME,
});

describe("mayTogglePartyPanel (FS-R82NV R28: T, never while typing)", () => {
  it.each([
    ["nothing focused", false, null, true],
    ["a button focused", false, { tagName: "BUTTON" }, true],
    ["the chat field focused", false, { tagName: "INPUT" }, false],
    ["a textarea focused", false, { tagName: "TEXTAREA" }, false],
    [
      "an editable focused",
      false,
      { tagName: "DIV", isContentEditable: true },
      false,
    ],
    ["an overlay owns the keys", true, null, false],
  ])("%s", (_case, blocked, active, want) => {
    expect(mayTogglePartyPanel({ blocked, active })).toBe(want);
  });

  it("should not count a disabled or non-text input as typing", () => {
    expect(isTextEntry({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextEntry({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextEntry({ tagName: "SELECT" })).toBe(true);
  });
});

describe("panel words (FS-R82NV R29, R30, R34's state words)", () => {
  it.each([
    ["hub", "village"],
    ["field:gentle_meadows", "afield"],
    ["run", "delving"],
    ["away", "away"],
    ["somewhere_new", "somewhere_new"],
  ])("%s → %s", (where, want) => {
    expect(partyWhereLabel(where)).toBe(want);
  });

  it("should name a class in title case", () => {
    expect(partyClassLabel("mercenary")).toBe("Mercenary");
    expect(partyClassLabel("")).toBe("");
  });

  it("should title the panel with the count over the cap, and plainly with no party", () => {
    expect(partyPanelTitle(party(2))).toBe("Party (2/4)");
    expect(partyPanelTitle(null)).toBe("Party");
  });

  it("should offer the hint line copy from R30", () => {
    expect(PARTY_HINT).toBe("Invite someone by name to form a party.");
  });
});

describe("partyPanelFrame (FS-R82NV R28–R30)", () => {
  const within = (
    inner: { x: number; y: number; width: number; height: number },
    outer: { x: number; y: number; width: number; height: number },
  ) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

  it("should show a player in no party only the hint and the invite row", () => {
    const frame = partyPanelFrame(partyActions(null, ME, "hub"));
    expect(frame.rows).toEqual([]);
    expect(frame.hint).toBeDefined();
    expect(frame.leave).toBeUndefined();
    expect(frame.loot).toBeUndefined();
    expect(within(frame.invite, frame.panel)).toBe(true);
  });

  it("should give each member a row, a reserved loot-rule slot and a Leave button, all inside the panel", () => {
    const frame = partyPanelFrame(partyActions(party(4), ME, "hub"));
    expect(frame.rows).toHaveLength(4);
    expect(frame.hint).toBeUndefined();
    for (const r of frame.rows) {
      expect(within(r.row, frame.panel)).toBe(true);
      expect(within(r.kick, r.row)).toBe(true);
      expect(within(r.transfer, r.row)).toBe(true);
      expect(r.kick.x).toBeGreaterThan(r.transfer.x);
    }
    expect(within(frame.loot!, frame.panel)).toBe(true);
    expect(within(frame.leave!, frame.panel)).toBe(true);
    expect(within(frame.invite, frame.panel)).toBe(true);
  });

  it("should grow with the party and stay on a 1080x720 canvas at the cap", () => {
    const two = partyPanelFrame(partyActions(party(2), ME, "hub")).panel;
    const four = partyPanelFrame(partyActions(party(4), ME, "hub")).panel;
    expect(four.height).toBeGreaterThan(two.height);
    expect(four.y + four.height).toBeLessThan(420); // clear of the chat window's top
    expect(four.x + four.width).toBeLessThan(1080);
  });

  it("should never overlap the rows' bands", () => {
    const { rows } = partyPanelFrame(partyActions(party(4), ME, "hub"));
    for (let i = 1; i < rows.length; i++)
      expect(rows[i].row.y).toBeGreaterThanOrEqual(
        rows[i - 1].row.y + rows[i - 1].row.height,
      );
  });
});
