import { describe, expect, it } from "vitest";
import type { OpenReadyCheck } from "@/stores/partyStore";
import { PARTY_PANEL_W, PARTY_PANEL_X } from "./partyPanelLayout";
import {
  READY_CHECK_W,
  READY_CHECK_Y,
  readyCheckFrame,
  readyCheckView,
} from "./partyReadyCheckLayout";
import { countdownBarRect } from "./countdownBar";
import type { Rect } from "./partyPanelLayout";

// FS-BJNYC §Requirements R23, R24, §Copy (popup). I-BJNYC-5: the ready-check popup's pure half.

const LEADER = "leader";
const WREN = "wren";
const MIRA = "mira";

const check = (extra: Partial<OpenReadyCheck> = {}): OpenReadyCheck => ({
  check_id: "chk-1",
  leader_id: LEADER,
  expires_in_ms: 30_000,
  members: [
    { player_id: LEADER, name: "Aldric", state: "accepted" },
    { player_id: WREN, name: "Wren", state: "waiting" },
    { player_id: MIRA, name: "Mira", state: "waiting" },
  ],
  outcome: "open",
  received_at: 0,
  total_ms: 30_000,
  answer: null,
  ...extra,
});

describe("readyCheckView (FS-BJNYC R23, R24: what each member sees)", () => {
  it("should ask the question in the leader's name", () => {
    expect(readyCheckView(check(), WREN).question).toBe(
      "Aldric would enter the Spire. Are you ready?",
    );
  });

  it("should read a blank leader name as Someone", () => {
    const blank = check({
      members: [{ player_id: LEADER, name: " ", state: "accepted" }],
    });
    expect(readyCheckView(blank, WREN).question).toBe(
      "Someone would enter the Spire. Are you ready?",
    );
  });

  it("should list every member in join order with their state", () => {
    const view = readyCheckView(
      check({
        members: [
          { player_id: LEADER, name: "Aldric", state: "accepted" },
          { player_id: WREN, name: "Wren", state: "accepted" },
          { player_id: MIRA, name: "Mira", state: "declined" },
        ],
      }),
      WREN,
    );
    expect(view.rows.map((r) => [r.name, r.state])).toEqual([
      ["Aldric", "accepted"],
      ["Wren", "accepted"],
      ["Mira", "declined"],
    ]);
  });

  it("should show the leader's row ticked from the moment it opens, whatever the row says", () => {
    const view = readyCheckView(
      check({
        members: [
          { player_id: LEADER, name: "Aldric", state: "waiting" },
          { player_id: WREN, name: "Wren", state: "waiting" },
        ],
      }),
      LEADER,
    );
    expect(view.rows[0]).toMatchObject({
      name: "Aldric",
      state: "accepted",
      leader: true,
    });
  });

  it("should give a waiting member Accept and Decline", () => {
    expect(readyCheckView(check(), WREN).buttons).toBe(true);
  });

  it("should give the leader status only: no buttons, the wait in words", () => {
    const view = readyCheckView(check(), LEADER);
    expect(view.buttons).toBe(false);
    expect(view.status).toBe("Waiting on your party.");
  });

  it("should put this player's answer in place of the buttons as soon as they press", () => {
    const view = readyCheckView(check({ answer: "accepted" }), WREN);
    expect(view.buttons).toBe(false);
    expect(view.status).toBe("You are ready.");
    expect(view.rows[1].state).toBe("accepted");
  });

  it("should put the server's word for this player's answer in place of the buttons", () => {
    const answered = check({
      members: [
        { player_id: LEADER, name: "Aldric", state: "accepted" },
        { player_id: WREN, name: "Wren", state: "accepted" },
      ],
    });
    expect(readyCheckView(answered, WREN)).toMatchObject({
      buttons: false,
      status: "You are ready.",
    });
  });

  it("should give a player not on the check no buttons", () => {
    expect(readyCheckView(check(), "stranger").buttons).toBe(false);
  });
});

describe("readyCheckFrame (FS-BJNYC R23: where the popup sits)", () => {
  it("should sit top centre, one row per member, buttons on its last line", () => {
    const f = readyCheckFrame(3, { canvasWidth: 1080, panelOpen: false });
    expect(f.panel).toMatchObject({
      x: (1080 - READY_CHECK_W) / 2,
      y: READY_CHECK_Y,
      width: READY_CHECK_W,
    });
    expect(f.rows).toHaveLength(3);
    // rows stack under the question, the buttons under the rows, all inside the frame
    expect(f.rows[0].y).toBeGreaterThanOrEqual(
      f.question.y + f.question.height,
    );
    expect(f.rows[1].y).toBe(f.rows[0].y + f.rows[0].height);
    expect(f.accept.y).toBeGreaterThanOrEqual(f.rows[2].y + f.rows[2].height);
    expect(f.accept.y + f.accept.height).toBeLessThanOrEqual(
      f.panel.y + f.panel.height,
    );
    expect(f.decline.x + f.decline.width).toBeLessThan(f.accept.x);
    expect(f.countdown.y).toBe(f.accept.y);
  });

  it("should grow with the party", () => {
    const two = readyCheckFrame(2, { canvasWidth: 1080, panelOpen: false });
    const four = readyCheckFrame(4, { canvasWidth: 1080, panelOpen: false });
    expect(four.panel.height).toBeGreaterThan(two.panel.height);
  });

  it("should step right of the open party panel", () => {
    const f = readyCheckFrame(2, { canvasWidth: 1080, panelOpen: true });
    expect(f.panel.x).toBeGreaterThan(PARTY_PANEL_X + PARTY_PANEL_W);
  });
});

// FS-B3NDZ §Requirements 1, 2, 9, 10. I-B3NDZ-1: the countdown bar along the popup's foot.
describe("readyCheckFrame (FS-B3NDZ R1, R9: the countdown bar along its foot)", () => {
  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

  it.each([1, 2, 4])(
    "should carry the bar along the panel's foot, edge to edge, clear of every part (%s rows)",
    (rows) => {
      const f = readyCheckFrame(rows, { canvasWidth: 1080, panelOpen: false });
      expect(f.bar).toEqual(countdownBarRect(f.panel));
      for (const part of [
        f.question,
        ...f.rows,
        f.countdown,
        f.accept,
        f.decline,
        f.status,
      ])
        expect(overlaps(part, f.bar)).toBe(false);
    },
  );

  it("should keep the seconds in the row just above the bar", () => {
    const f = readyCheckFrame(3, { canvasWidth: 1080, panelOpen: false });
    expect(f.countdown.y + f.countdown.height).toBeLessThanOrEqual(f.bar.y);
    expect(f.bar.y - (f.countdown.y + f.countdown.height)).toBeLessThanOrEqual(
      12,
    );
  });
});
