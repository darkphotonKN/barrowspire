import { describe, expect, it } from "vitest";
import type { PartyMember, PartyUpdatePayload } from "@/stores/partyStore";
import type { PlayerState } from "@/types/gameState";
import { chatWindowFrame, CHAT_WINDOW_X } from "./chatWindowLayout";
import { invitePromptFrames } from "./partyInvitePromptLayout";
import { PARTY_PANEL_X } from "./partyPanelLayout";
import {
  PARTY_FRAMES_PLACEMENT,
  partyBustFrame,
  partyFrameRows,
  partyFramesFrame,
} from "./partyFramesLayout";
import { PROGRESS_HUD_AT, PROGRESS_HUD_H, PROGRESS_HUD_W } from "./ProgressHud";
import { resourceHudHeight } from "./ResourceHud";

// FS-R82NV §Requirements R34, R35. I-R82NV-9: the party frames' pure half; I-R82NV-12: every
// member, the player first with their own bars, as wide as the level/XP frame.

const ME = "me";
const member = (
  player_id: string,
  name: string,
  extra: Partial<PartyMember> = {},
): PartyMember => ({
  player_id,
  name,
  class: "warrior",
  joined_at: "2026-11-01T05:00:00Z",
  where: "hub",
  online: true,
  ...extra,
});
const party = (
  members: PartyMember[],
  leader_id = members[0].player_id,
): PartyUpdatePayload => ({
  party_id: "p",
  leader_id,
  members,
  size: 4,
  reason: "joined",
  subject_id: members[members.length - 1].player_id,
});

/** A player as the state broadcast carries them; only the fields the frames read matter. */
const seen = (id: string, extra: Partial<PlayerState> = {}): PlayerState =>
  ({ id, escape: false, ...extra }) as PlayerState;

describe("partyFrameRows", () => {
  it("draws nothing with no party", () => {
    expect(partyFrameRows(null, ME, "hub")).toEqual([]);
  });

  it("gives one row per member, the player first, then the others in join order, the leader's row flagged", () => {
    const rows = partyFrameRows(
      party(
        [
          member("lead", "Aldric"),
          member(ME, "Me"),
          member("wren", "Wren", { class: "mage" }),
        ],
        "lead",
      ),
      ME,
      "hub",
    );
    expect(rows.map((r) => [r.player_id, r.name, r.class, r.leader])).toEqual([
      [ME, "Me", "warrior", false],
      ["lead", "Aldric", "warrior", true],
      ["wren", "Wren", "mage", false],
    ]);
  });

  it("gives a two-member party two rows, the player's first, holding their own bars in the hub", () => {
    const rows = partyFrameRows(
      party([member("wren", "Wren"), member(ME, "Me")]),
      ME,
      "hub",
      {
        current_player: seen(ME, {
          current_health: 90,
          max_health: 120,
          resource: {
            kind: "stamina",
            current: 25,
            max: 100,
            ability_cost: 10,
          },
        }),
      },
    );
    expect(rows.map((r) => r.player_id)).toEqual([ME, "wren"]);
    expect(rows[0].slot).toEqual({
      kind: "bars",
      health: 0.75,
      resource: { channel: "stamina", label: "Stamina:", fill: 0.25 },
    });
  });
});

describe("partyFrameRows: the player's own row", () => {
  const two = (where = "hub") =>
    party([member(ME, "Me", { where }), member("wren", "Wren")]);
  const mine = (
    world: "hub" | "field" | "run",
    current_player?: PlayerState | null,
    p = two(),
  ) => partyFrameRows(p, ME, world, { current_player })[0].slot;

  it.each(["hub", "field", "run"] as const)(
    "shows both bars from the player's own state in the %s",
    (world) => {
      const me = seen(ME, {
        current_health: 30,
        max_health: 120,
        resource: { kind: "mana", current: 50, max: 200, ability_cost: 20 },
      });
      expect(mine(world, me)).toEqual({
        kind: "bars",
        health: 0.25,
        resource: { channel: "mana", label: "Mana:", fill: 0.25 },
      });
    },
  );

  it("draws parry charges as pips", () => {
    const me = seen(ME, {
      current_health: 130,
      max_health: 130,
      resource: { kind: "parry_charges", current: 1, max: 3, ability_cost: 1 },
    });
    const slot = mine("run", me);
    expect(slot.kind === "bars" && slot.resource?.pips).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("keeps the bars, empty, before the player's first state", () => {
    expect(mine("hub", null)).toEqual({ kind: "bars", health: 0 });
    expect(mine("hub", undefined)).toEqual({ kind: "bars", health: 0 });
  });

  it("never shows the player a state word for themselves, whatever the party pod says", () => {
    const me = seen(ME, { current_health: 60, max_health: 120 });
    expect(mine("run", me, two("run"))).toEqual({ kind: "bars", health: 0.5 });
  });

  it("ignores a teammate's broadcast entry carrying the player's id", () => {
    const rows = partyFrameRows(two(), ME, "run", {
      current_player: seen(ME, { current_health: 120, max_health: 120 }),
      other_players: [seen(ME, { current_health: 1, max_health: 120 })],
    });
    expect(rows[0].slot).toEqual({ kind: "bars", health: 1 });
  });
});

describe("partyFrameRows: a teammate's bar slot", () => {
  const two = (extra: Partial<PartyMember> = {}) =>
    party([member(ME, "Me"), member("wren", "Wren", extra)]);
  const slotOf = (
    p: PartyUpdatePayload,
    world: "hub" | "field" | "run",
    others?: PlayerState[],
  ) => partyFrameRows(p, ME, world, { other_players: others })[1].slot;

  it.each([
    { name: "hub", where: "hub", world: "hub" as const, word: "village" },
    {
      name: "a field",
      where: "field:gentle_meadows",
      world: "hub" as const,
      word: "afield",
    },
    { name: "a run", where: "run", world: "hub" as const, word: "delving" },
    { name: "away", where: "away", world: "hub" as const, word: "away" },
    {
      name: "elsewhere while I stand in a field",
      where: "run",
      world: "field" as const,
      word: "delving",
    },
  ])(
    "shows the state word for $name when no health is on the wire",
    ({ where, world, word }) => {
      expect(slotOf(two({ where }), world)).toEqual({ kind: "word", word });
    },
  );

  it("reads an offline member as away, whatever their where says", () => {
    expect(slotOf(two({ online: false }), "hub")).toEqual({
      kind: "word",
      word: "away",
    });
  });

  it("fills the health bar from the broadcast's current and max health", () => {
    const others = [seen("wren", { current_health: 30, max_health: 120 })];
    expect(slotOf(two({ where: "run" }), "run", others)).toEqual({
      kind: "bars",
      health: 0.25,
    });
  });

  it("adds the resource bar, coloured by its kind, when the broadcast carries it", () => {
    const others = [
      seen("wren", {
        current_health: 120,
        max_health: 120,
        resource: { kind: "mana", current: 50, max: 200, ability_cost: 20 },
      }),
    ];
    expect(slotOf(two({ where: "run" }), "run", others)).toEqual({
      kind: "bars",
      health: 1,
      resource: { channel: "mana", label: "Mana:", fill: 0.25 },
    });
  });

  it("draws parry charges as pips", () => {
    const others = [
      seen("wren", {
        current_health: 60,
        max_health: 120,
        resource: {
          kind: "parry_charges",
          current: 2,
          max: 3,
          ability_cost: 1,
        },
      }),
    ];
    const slot = slotOf(two({ where: "run" }), "run", others);
    expect(slot.kind === "bars" && slot.resource?.pips).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("shows the word in the hub even if health were on the wire: the village carries no bars", () => {
    const others = [seen("wren", { current_health: 30, max_health: 120 })];
    expect(slotOf(two(), "hub", others)).toEqual({
      kind: "word",
      word: "village",
    });
  });

  it("shows the word for a member the broadcast does not list", () => {
    const others = [
      seen("someone-else", { current_health: 30, max_health: 120 }),
    ];
    expect(
      slotOf(two({ where: "field:forlorn_forest" }), "field", others),
    ).toEqual({
      kind: "word",
      word: "afield",
    });
  });

  it("shows away for a disconnected member even if a stale state still lists them", () => {
    const others = [seen("wren", { current_health: 30, max_health: 120 })];
    expect(slotOf(two({ where: "away" }), "run", others)).toEqual({
      kind: "word",
      word: "away",
    });
  });
});

describe("partyBustFrame", () => {
  it.each([
    // game-service CONTEXT.md: the warrior is drawn from the knight sheet, the mage the wizard's
    { cls: "warrior", sheet: "char_knight_base" },
    { cls: "mage", sheet: "char_wizard_base" },
    { cls: "archer", sheet: "char_archer_base" },
    { cls: "mercenary", sheet: "char_mercenary_base" },
  ])(
    "cuts the $cls's bust from the $sheet standing frame, facing the viewer",
    ({ cls, sheet }) => {
      // idle, frame 0, facing se (index 1 in DIRECTION_ORDER): the menus' standing pose
      expect(partyBustFrame(cls)).toEqual({
        sheet,
        animation: "idle",
        direction: 1,
        index: 0,
      });
    },
  );
});

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const union = (rects: Rect[]): Rect => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
};

describe("partyFramesFrame", () => {
  it("stacks the rows down from the top, each part inside its row", () => {
    const rows = partyFramesFrame(2, 10, 86);
    expect(rows).toHaveLength(2);
    expect(rows[0].row.y).toBe(86);
    expect(rows[1].row.y).toBeGreaterThan(rows[0].row.y + rows[0].row.height);
    for (const { row, bust, health, resource, name, word } of rows) {
      expect(bust.x - bust.r).toBeGreaterThanOrEqual(row.x);
      expect(bust.y - bust.r).toBeGreaterThanOrEqual(row.y);
      expect(bust.y + bust.r).toBeLessThanOrEqual(row.y + row.height);
      for (const r of [health, resource])
        expect(overlaps(r, row) && r.x + r.width <= row.x + row.width).toBe(
          true,
        );
      expect(health.y + health.height).toBeLessThanOrEqual(resource.y);
      expect(name.x).toBeGreaterThan(bust.x + bust.r);
      expect(word.x).toBe(health.x);
    }
  });

  // 1080x720, the fullest party (cap 4, the player's row among them), in each world that mounts
  // the frames; the XP bars stand where the scenes place them (`PROGRESS_HUD_AT`)
  const W = 1080;
  const H = 720;
  const MARGIN = 16;
  it.each([
    // the run: resource bars bottom-left (two rows), chat above them
    {
      world: "run" as const,
      xpBar: PROGRESS_HUD_AT.run,
      chatBottom: H - MARGIN - resourceHudHeight(2),
    },
    // the hub: no resource bars, chat on the canvas bottom
    {
      world: "hub" as const,
      xpBar: PROGRESS_HUD_AT.hub,
      chatBottom: H - MARGIN,
    },
    // a field: no XP bar, resource bars and chat as the run's
    {
      world: "field" as const,
      xpBar: null,
      chatBottom: H - MARGIN - resourceHudHeight(2),
    },
  ])(
    "in the $world, four rows clear the XP bar, the chat window, the T panel and the prompts",
    ({ world, xpBar, chatBottom }) => {
      const { x, top } = PARTY_FRAMES_PLACEMENT[world];
      const frames = union(partyFramesFrame(4, x, top).map((f) => f.row));
      // one column with the level/XP frame: exactly its outer width (a field keeps the same)
      expect(frames.width).toBe(PROGRESS_HUD_W);
      expect(frames.x).toBeGreaterThanOrEqual(0);
      if (xpBar) {
        const bar = { ...xpBar, width: PROGRESS_HUD_W, height: PROGRESS_HUD_H };
        expect(overlaps(frames, bar)).toBe(false);
        // below it, on its left edge
        expect(frames.y).toBeGreaterThanOrEqual(bar.y + bar.height);
        expect(frames.x).toBe(bar.x);
      }
      expect(
        overlaps(frames, chatWindowFrame(CHAT_WINDOW_X, chatBottom).panel),
      ).toBe(false);
      // the T panel stands right of the frames (R28)
      expect(frames.x + frames.width).toBeLessThan(PARTY_PANEL_X);
      for (const panelOpen of [false, true])
        for (const prompt of invitePromptFrames(4, {
          canvasWidth: W,
          panelOpen,
        }))
          expect(overlaps(frames, prompt.panel)).toBe(false);
      expect(frames.y + frames.height).toBeLessThan(H);
    },
  );
});
