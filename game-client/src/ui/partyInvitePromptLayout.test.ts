import { describe, expect, it } from "vitest";
import { partyActions, type PartyUpdatePayload } from "@/stores/partyStore";
import { partyPanelFrame, type Rect } from "./partyPanelLayout";
import {
  CHAT_WINDOW_MARGIN,
  CHAT_WINDOW_X,
  chatWindowFrame,
} from "./chatWindowLayout";
import {
  INVITE_PROMPT_MAX,
  INVITE_PROMPT_Y,
  invitePromptFrames,
  invitePromptText,
} from "./partyInvitePromptLayout";

// FS-R82NV §Requirements R32. I-R82NV-7: the invite prompt's words and where each one sits.

/** The canvas every scene draws on (PhaserGame's config). */
const CANVAS = { width: 1080, height: 720 };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** The party panel at its tallest: four members, the viewer leading. */
function fullPartyPanel(): Rect {
  const members = ["a", "b", "c", "d"].map((id) => ({
    player_id: id,
    name: id,
    class: "warrior",
    joined_at: "2026-11-01T05:00:00Z",
    where: "hub",
    online: true,
  }));
  const party: PartyUpdatePayload = {
    party_id: "p",
    leader_id: "a",
    members,
    size: 4,
    reason: "joined",
    subject_id: "d",
  };
  return partyPanelFrame(partyActions(party, "a", "hub")).panel;
}

describe("invitePromptText (FS-R82NV R32)", () => {
  it("should name the leader and the party's count over its cap", () => {
    expect(
      invitePromptText({ leader_name: "Wren", member_count: 2, size: 4 }),
    ).toBe("Wren invites you to their party (2/4)");
  });

  it("should still read when the server left the name blank", () => {
    expect(
      invitePromptText({ leader_name: "  ", member_count: 1, size: 4 }),
    ).toBe("Someone invites you to their party (1/4)");
  });
});

describe("invitePromptFrames (FS-R82NV R32: top centre, stacked)", () => {
  it("should sit top centre, under the queue panel and the hub's notice band", () => {
    const [first] = invitePromptFrames(1, {
      canvasWidth: CANVAS.width,
      panelOpen: false,
    });
    expect(first.panel.x + first.panel.width / 2).toBe(CANVAS.width / 2);
    expect(first.panel.y).toBe(INVITE_PROMPT_Y);
  });

  it("should stack several prompts downward without one covering another", () => {
    const frames = invitePromptFrames(3, {
      canvasWidth: CANVAS.width,
      panelOpen: false,
    });
    expect(frames).toHaveLength(3);
    expect(frames[1].panel.y).toBeGreaterThan(frames[0].panel.y);
    expect(overlaps(frames[0].panel, frames[1].panel)).toBe(false);
    expect(overlaps(frames[1].panel, frames[2].panel)).toBe(false);
  });

  it("should step right of the open party panel, even at four members", () => {
    const panel = fullPartyPanel();
    const frames = invitePromptFrames(3, {
      canvasWidth: CANVAS.width,
      panelOpen: true,
    });
    for (const f of frames) {
      expect(overlaps(f.panel, panel)).toBe(false);
      expect(inside(f.panel, { x: 0, y: 0, ...CANVAS })).toBe(true);
    }
  });

  it("should keep the most prompts it shows clear of the chat window at the bottom left", () => {
    const chat = chatWindowFrame(
      CHAT_WINDOW_X,
      CANVAS.height - CHAT_WINDOW_MARGIN,
    ).panel;
    for (const panelOpen of [false, true])
      for (const f of invitePromptFrames(INVITE_PROMPT_MAX, {
        canvasWidth: CANVAS.width,
        panelOpen,
      }))
        expect(overlaps(f.panel, chat)).toBe(false);
  });

  it("should never lay out more prompts than it shows", () => {
    expect(
      invitePromptFrames(INVITE_PROMPT_MAX + 3, {
        canvasWidth: CANVAS.width,
        panelOpen: false,
      }),
    ).toHaveLength(INVITE_PROMPT_MAX);
  });

  it("should keep the words, the countdown and both buttons inside the prompt, apart", () => {
    const [f] = invitePromptFrames(1, {
      canvasWidth: CANVAS.width,
      panelOpen: false,
    });
    for (const part of [f.text, f.countdown, f.accept, f.decline])
      expect(inside(part, f.panel)).toBe(true);
    expect(overlaps(f.accept, f.decline)).toBe(false);
    expect(overlaps(f.countdown, f.decline)).toBe(false);
    expect(overlaps(f.text, f.accept)).toBe(false);
  });
});
