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
  inviteAcceptState,
  invitePromptFrames,
  invitePromptText,
} from "./partyInvitePromptLayout";
import { countdownBarRect } from "./countdownBar";

// FS-R82NV §Requirements R32. I-R82NV-7: the invite prompt's words and where each one sits.
// FS-NCC9J §Requirements R24. I-NCC9J-6: Accept greyed in a run, with its note.

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

describe("inviteAcceptState (FS-NCC9J R24: Accept in every world but a run)", () => {
  it.each(["hub", "field", null] as const)(
    "should leave Accept live in the %s, with no note",
    (world) => {
      expect(inviteAcceptState(world)).toEqual({ live: true });
    },
  );

  it("should grey Accept in a run and say why", () => {
    expect(inviteAcceptState("run")).toEqual({
      live: false,
      note: "Not while delving.",
    });
  });
});

describe("invitePromptFrames (FS-NCC9J R24: the note under a greyed Accept)", () => {
  const placements = [false, true].map((panelOpen) => ({
    canvasWidth: CANVAS.width,
    panelOpen,
    note: true,
  }));

  it("should give no prompt a note row unless asked", () => {
    const [f] = invitePromptFrames(1, {
      canvasWidth: CANVAS.width,
      panelOpen: false,
    });
    expect(f.note).toBeUndefined();
  });

  it("should put the note inside the prompt, under its buttons, clear of every other part", () => {
    const [f] = invitePromptFrames(1, placements[0]);
    expect(f.note).toBeDefined();
    const note = f.note!;
    expect(inside(note, f.panel)).toBe(true);
    expect(note.y).toBeGreaterThanOrEqual(f.accept.y + f.accept.height);
    for (const part of [f.text, f.countdown, f.accept, f.decline])
      expect(overlaps(note, part)).toBe(false);
  });

  it("should still stack, step aside of the panel and clear the chat window with notes", () => {
    const panel = fullPartyPanel();
    const chat = chatWindowFrame(
      CHAT_WINDOW_X,
      CANVAS.height - CHAT_WINDOW_MARGIN,
    ).panel;
    for (const placement of placements) {
      const frames = invitePromptFrames(INVITE_PROMPT_MAX, {
        ...placement,
        floor: chat.y,
      });
      expect(frames.length).toBeGreaterThan(0);
      frames.forEach((f, i) => {
        expect(overlaps(f.panel, chat)).toBe(false);
        expect(inside(f.panel, { x: 0, y: 0, ...CANVAS })).toBe(true);
        if (placement.panelOpen) expect(overlaps(f.panel, panel)).toBe(false);
        if (i > 0) expect(overlaps(frames[i - 1].panel, f.panel)).toBe(false);
      });
    }
  });
});

describe("invitePromptFrames (FS-NCC9J R24: a floor in a field or a run)", () => {
  /** A floor higher than the chat window's top on the canvas bottom, so it comes first. */
  const HIGH_FLOOR = 396;

  it("should show all four over the chat window's own top, and three with a note row each (a run)", () => {
    const floor = chatWindowFrame(
      CHAT_WINDOW_X,
      CANVAS.height - CHAT_WINDOW_MARGIN,
    ).panel.y;
    const plain = invitePromptFrames(INVITE_PROMPT_MAX, {
      canvasWidth: CANVAS.width,
      panelOpen: false,
      floor,
    });
    const noted = invitePromptFrames(INVITE_PROMPT_MAX, {
      canvasWidth: CANVAS.width,
      panelOpen: false,
      note: true,
      floor,
    });
    expect(plain).toHaveLength(INVITE_PROMPT_MAX);
    expect(noted).toHaveLength(3);
  });

  it("should show only the prompts that end above the floor, the rest waiting their turn", () => {
    const frames = invitePromptFrames(INVITE_PROMPT_MAX, {
      canvasWidth: CANVAS.width,
      panelOpen: false,
      floor: HIGH_FLOOR,
    });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThan(INVITE_PROMPT_MAX);
    for (const f of frames)
      expect(f.panel.y + f.panel.height).toBeLessThan(HIGH_FLOOR);
  });

  it("should always show the oldest prompt, even over a floor too high for it", () => {
    expect(
      invitePromptFrames(2, {
        canvasWidth: CANVAS.width,
        panelOpen: false,
        floor: INVITE_PROMPT_Y,
      }),
    ).toHaveLength(1);
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

  it.each([1080, 1280])(
    "should step 12 px right of the centred party panel in a %i-wide view (FS-R82NV § Change C6)",
    (width) => {
      const [f] = invitePromptFrames(1, { canvasWidth: width, panelOpen: true });
      expect(f.panel.x).toBe((width - 300) / 2 + 300 + 12);
      expect(f.panel.y).toBe(92);
    },
  );

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

// FS-B3NDZ §Requirements 1, 2, 9, 11. I-B3NDZ-1: each prompt's own countdown bar along its foot.
describe("invitePromptFrames (FS-B3NDZ R1, R11: the countdown bar along each prompt's foot)", () => {
  it.each([false, true])(
    "should carry each prompt's bar along its foot, edge to edge, clear of every part (note: %s)",
    (note) => {
      const frames = invitePromptFrames(3, {
        canvasWidth: CANVAS.width,
        panelOpen: false,
        note,
      });
      for (const f of frames) {
        expect(f.bar).toEqual(countdownBarRect(f.panel));
        for (const part of [f.text, f.countdown, f.accept, f.decline])
          expect(overlaps(part, f.bar)).toBe(false);
        if (f.note) expect(overlaps(f.note, f.bar)).toBe(false);
      }
    },
  );
});
