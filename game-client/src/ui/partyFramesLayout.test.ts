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
  partyNameRoom,
  partyTravelButtonRect,
  travelButton,
  type PartyFrameRow,
  type PartyMemberFrameRow,
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

/** The member frames among the rows, failing the test if a skeleton stands in their place. */
const memberRows = (rows: PartyFrameRow[]): PartyMemberFrameRow[] =>
  rows.map((r) => {
    if (r.kind !== "member")
      throw new Error(`expected a member row, got ${r.kind}`);
    return r;
  });

describe("partyFrameRows", () => {
  it("draws nothing with no party", () => {
    expect(partyFrameRows(null, ME)).toEqual([]);
  });

  it("gives one row per member, the player first, then the others in join order, the leader's row flagged", () => {
    const rows = memberRows(
      partyFrameRows(
        party(
          [
            member("lead", "Aldric"),
            member(ME, "Me"),
            member("wren", "Wren", { class: "mage" }),
          ],
          "lead",
        ),
        ME,
      ),
    );
    expect(rows.map((r) => [r.player_id, r.name, r.class, r.leader])).toEqual([
      [ME, "Me", "warrior", false],
      ["lead", "Aldric", "warrior", true],
      ["wren", "Wren", "mage", false],
    ]);
  });

  it("gives a two-member party two rows, the player's first, holding their own bars in the hub", () => {
    const rows = memberRows(
      partyFrameRows(party([member("wren", "Wren"), member(ME, "Me")]), ME, {
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
      }),
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
  // every world alike: the rows never ask the world (FS-CH21F R12)
  const mine = (current_player?: PlayerState | null, p = two()) =>
    memberRows(partyFrameRows(p, ME, { current_player }))[0].slot;

  it("shows both bars from the player's own state", () => {
    const me = seen(ME, {
      current_health: 30,
      max_health: 120,
      resource: { kind: "mana", current: 50, max: 200, ability_cost: 20 },
    });
    expect(mine(me)).toEqual({
      kind: "bars",
      health: 0.25,
      resource: { channel: "mana", label: "Mana:", fill: 0.25 },
    });
  });

  it("draws parry charges as pips", () => {
    const me = seen(ME, {
      current_health: 130,
      max_health: 130,
      resource: { kind: "parry_charges", current: 1, max: 3, ability_cost: 1 },
    });
    const slot = mine(me);
    expect(slot.kind === "bars" && slot.resource?.pips).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("keeps the bars, empty, before the player's first state", () => {
    expect(mine(null)).toEqual({ kind: "bars", health: 0 });
    expect(mine(undefined)).toEqual({ kind: "bars", health: 0 });
  });

  it("never shows the player a state word for themselves, whatever the party pod says", () => {
    const me = seen(ME, { current_health: 60, max_health: 120 });
    expect(mine(me, two("run"))).toEqual({ kind: "bars", health: 0.5 });
  });

  it("ignores a teammate's broadcast entry carrying the player's id", () => {
    const rows = memberRows(
      partyFrameRows(two(), ME, {
        current_player: seen(ME, { current_health: 120, max_health: 120 }),
        other_players: [seen(ME, { current_health: 1, max_health: 120 })],
      }),
    );
    expect(rows[0].slot).toEqual({ kind: "bars", health: 1 });
  });
});

describe("partyFrameRows: a teammate's bar slot", () => {
  const two = (extra: Partial<PartyMember> = {}) =>
    party([member(ME, "Me"), member("wren", "Wren", extra)]);
  // every world alike, the hub included: the rows never ask the world (FS-CH21F R8, R12)
  const slotOf = (p: PartyUpdatePayload, others?: PlayerState[]) =>
    memberRows(partyFrameRows(p, ME, { other_players: others }))[1].slot;

  // FS-NCC9J R25: missing bars are the "not here" signal; no state word, whatever `where` says,
  // even a field of this one's name (on another pod it is not this world)
  it.each([
    { name: "the hub", where: "hub" },
    { name: "a field", where: "field:gentle_meadows" },
    { name: "a run", where: "run" },
    { name: "away", where: "away" },
  ])(
    "shows name and bust only for a teammate in $name whose health is not in this world's state",
    ({ where }) => {
      expect(slotOf(two({ where }))).toEqual({ kind: "none" });
    },
  );

  it("fills the health bar from the broadcast's current and max health", () => {
    const others = [seen("wren", { current_health: 30, max_health: 120 })];
    expect(slotOf(two({ where: "run" }), others)).toEqual({
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
    expect(slotOf(two({ where: "run" }), others)).toEqual({
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
    const slot = slotOf(two({ where: "run" }), others);
    expect(slot.kind === "bars" && slot.resource?.pips).toEqual([
      true,
      true,
      false,
    ]);
  });

  // FS-CH21F R8: the hub's refusal is lifted; one rule decides bars in every world
  it("shows a teammate in the hub, listed in the hub's state, both bars", () => {
    const others = [
      seen("wren", {
        current_health: 30,
        max_health: 120,
        resource: { kind: "stamina", current: 50, max: 100, ability_cost: 10 },
      }),
    ];
    expect(slotOf(two({ where: "hub" }), others)).toEqual({
      kind: "bars",
      health: 0.25,
      resource: { channel: "stamina", label: "Stamina:", fill: 0.5 },
    });
  });

  it("keeps the resource bar empty while the broadcast carries no resource (FS-CH21F R9)", () => {
    const others = [seen("wren", { current_health: 30, max_health: 120 })];
    expect(slotOf(two(), others)).toEqual({
      kind: "bars",
      health: 0.25,
    });
  });

  it("shows no bars for a member the broadcast does not list", () => {
    const others = [
      seen("someone-else", { current_health: 30, max_health: 120 }),
    ];
    expect(slotOf(two({ where: "field:forlorn_forest" }), others)).toEqual({
      kind: "none",
    });
  });

  it("decides bars from this world's state, not from where: a member said to be elsewhere but in the state shows bars", () => {
    const others = [seen("wren", { current_health: 60, max_health: 120 })];
    expect(slotOf(two({ where: "hub" }), others)).toEqual({
      kind: "bars",
      health: 0.5,
    });
  });
});

// FS-CH21F R10, R11: "Lv N" after a same-world teammate's name, nowhere else
describe("partyFrameRows: a row's level", () => {
  const rowsOf = (others: PlayerState[] = []) =>
    memberRows(
      partyFrameRows(party([member(ME, "Me"), member("wren", "Wren")]), ME, {
        current_player: seen(ME, {
          current_health: 9,
          max_health: 9,
          level: 7,
        }),
        other_players: others,
      }),
    );

  it("carries a listed teammate's broadcast level", () => {
    const rows = rowsOf([
      seen("wren", { current_health: 30, max_health: 120, level: 12 }),
    ]);
    expect(rows[1].level).toBe(12);
  });

  // FS-CH21F R10 (amended 2026-11-02, Nick: own level shown in the party frames); I-CH21F-4
  it("carries the player's own level from their own state", () => {
    expect(rowsOf()[0].level).toBe(7);
  });

  it.each([
    ["before the first state", undefined],
    [
      "while the state carries no level",
      seen(ME, { current_health: 9, max_health: 9 }),
    ],
  ])("gives the player's own row no level %s", (_, current_player) => {
    const rows = memberRows(
      partyFrameRows(party([member(ME, "Me"), member("wren", "Wren")]), ME, {
        current_player,
      }),
    );
    expect(rows[0].level).toBeUndefined();
    expect(rows[0]).not.toHaveProperty("level");
  });

  it("gives a teammate absent from this world's state no level", () => {
    const rows = rowsOf([seen("someone-else", { level: 3 })]);
    expect(rows[1].level).toBeUndefined();
    expect(rows[1].slot).toEqual({ kind: "none" });
  });

  it("gives a listed teammate without health on the wire no level, as no bars", () => {
    const rows = rowsOf([seen("wren", { level: 3 })]);
    expect(rows[1].level).toBeUndefined();
  });

  it("gives a listed teammate whose level is not on the wire none", () => {
    const rows = rowsOf([
      seen("wren", { current_health: 30, max_health: 120 }),
    ]);
    expect(rows[1].level).toBeUndefined();
  });
});

describe("partyFrameRows: an away member is greyed (FS-NCC9J R25)", () => {
  const rowOf = (extra: Partial<PartyMember>, others: PlayerState[] = []) =>
    memberRows(
      partyFrameRows(
        party([member(ME, "Me"), member("wren", "Wren", extra)]),
        ME,
        { other_players: others },
      ),
    )[1];

  it.each([
    { name: "online", extra: {}, away: false },
    {
      name: "online left off the wire",
      extra: { online: undefined },
      away: false,
    },
    { name: "offline", extra: { online: false }, away: true },
    { name: "where away", extra: { where: "away" }, away: true },
  ])("marks a member $name as away: $away", ({ extra, away }) => {
    expect(rowOf(extra).away).toBe(away);
  });

  it("keeps an away member's bars while this world's state still carries their health, greyed", () => {
    const row = rowOf({ online: false }, [
      seen("wren", { current_health: 30, max_health: 120 }),
    ]);
    expect(row.away).toBe(true);
    expect(row.slot).toEqual({ kind: "bars", health: 0.25 });
  });

  it("never greys the player's own row", () => {
    const rows = memberRows(
      partyFrameRows(
        party([member(ME, "Me", { online: false }), member("wren", "Wren")]),
        ME,
      ),
    );
    expect(rows[0].away).toBe(false);
  });
});

describe("partyFrameRows: skeleton rows for open invites (FS-NCC9J R26)", () => {
  const reserved = (...names: string[]) =>
    names.map((name) => ({ name, expires_at: "2026-11-01T05:01:00Z" }));

  it("gives a party of one member and one reserved slot a member frame, then a skeleton row with the invitee's name", () => {
    const rows = partyFrameRows(
      { ...party([member(ME, "Me")]), reserved: reserved("Kaelen") },
      ME,
    );
    expect(rows.map((r) => [r.kind, r.name])).toEqual([
      ["member", "Me"],
      ["skeleton", "Kaelen"],
    ]);
  });

  it("draws the skeletons after every member, in the order the server lists them, for every member", () => {
    const p = {
      ...party([member("lead", "Aldric"), member(ME, "Me")], "lead"),
      reserved: reserved("Kaelen", "Bram"),
    };
    for (const self of [ME, "lead"])
      expect(partyFrameRows(p, self).map((r) => r.kind)).toEqual([
        "member",
        "member",
        "skeleton",
        "skeleton",
      ]);
    expect(
      partyFrameRows(p, ME)
        .slice(2)
        .map((r) => r.name),
    ).toEqual(["Kaelen", "Bram"]);
  });

  it("replaces the skeleton with a real frame when the invitee joins", () => {
    const before = partyFrameRows(
      { ...party([member(ME, "Me")]), reserved: reserved("Kaelen") },
      ME,
    );
    const after = partyFrameRows(
      party([member(ME, "Me"), member("kae", "Kaelen")]),
      ME,
    );
    expect(before.map((r) => r.kind)).toEqual(["member", "skeleton"]);
    expect(after.map((r) => [r.kind, r.name])).toEqual([
      ["member", "Me"],
      ["member", "Kaelen"],
    ]);
  });

  it("draws no skeleton for a name already among the members", () => {
    const rows = partyFrameRows(
      {
        ...party([member(ME, "Me"), member("kae", "Kaelen")]),
        reserved: reserved("Kaelen"),
      },
      ME,
    );
    expect(rows.map((r) => r.kind)).toEqual(["member", "member"]);
  });

  it("never draws more rows than the party's size", () => {
    const rows = partyFrameRows(
      {
        ...party([member(ME, "Me"), member("wren", "Wren")]),
        size: 3,
        reserved: reserved("Kaelen", "Bram"),
      },
      ME,
    );
    expect(rows.map((r) => r.name)).toEqual(["Me", "Wren", "Kaelen"]);
  });

  it("draws no skeleton when the update carries no reserved list", () => {
    const rows = partyFrameRows(party([member(ME, "Me")]), ME);
    expect(rows.map((r) => r.kind)).toEqual(["member"]);
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
    for (const { row, bust, health, resource, name } of rows) {
      expect(bust.x - bust.r).toBeGreaterThanOrEqual(row.x);
      expect(bust.y - bust.r).toBeGreaterThanOrEqual(row.y);
      expect(bust.y + bust.r).toBeLessThanOrEqual(row.y + row.height);
      for (const r of [health, resource])
        expect(overlaps(r, row) && r.x + r.width <= row.x + row.width).toBe(
          true,
        );
      expect(health.y + health.height).toBeLessThanOrEqual(resource.y);
      expect(name.x).toBeGreaterThan(bust.x + bust.r);
      expect(name.x).toBe(health.x);
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
      // the fullest party at the largest cap (PARTY_SIZE max 4): two members, two open invites
      const fullest = partyFrameRows(
        {
          ...party([member(ME, "Me"), member("wren", "Wren")]),
          size: 4,
          reserved: [
            { name: "Kaelen", expires_at: "2026-11-01T05:01:00Z" },
            { name: "Bram", expires_at: "2026-11-01T05:01:00Z" },
          ],
        },
        ME,
      );
      expect(fullest.map((r) => r.kind)).toEqual([
        "member",
        "member",
        "skeleton",
        "skeleton",
      ]);
      const frames = union(
        partyFramesFrame(fullest.length, x, top).map((f) => f.row),
      );
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

// FS-NCC9J §Requirements R28; I-NCC9J-8. The Travel button beside the leader's frame.
describe("travelButton", () => {
  const wren = (extra: Partial<PartyMember> = {}) =>
    member("wren", "Wren", { pod_id: "pod-a", ...extra });
  const me = (extra: Partial<PartyMember> = {}) =>
    member(ME, "Marl", { pod_id: "pod-b", ...extra });

  it.each([
    { name: "no party", p: null, world: "hub", want: "hidden" },
    {
      name: "on the leader's pod",
      p: party([wren(), me({ pod_id: "pod-a" })]),
      world: "hub",
      want: "hidden",
    },
    {
      name: "the leader themselves",
      p: party([me(), wren()]),
      world: "hub",
      want: "hidden",
    },
    {
      name: "in a field",
      p: party([wren(), me()]),
      world: "field",
      want: "greyed",
    },
    {
      name: "in a run",
      p: party([wren(), me()]),
      world: "run",
      want: "greyed",
    },
    {
      name: "the leader away",
      p: party([wren({ online: false }), me()]),
      world: "hub",
      want: "greyed",
    },
    {
      name: "the leader on no pod (offline)",
      p: party([wren({ pod_id: "", online: false }), me()]),
      world: "hub",
      want: "hidden",
    },
    {
      name: "the leader online but on no pod",
      p: party([wren({ pod_id: "" }), me()]),
      world: "hub",
      want: "hidden",
    },
    {
      name: "the player's own pod unknown",
      p: party([wren(), me({ pod_id: undefined })]),
      world: "hub",
      want: "hidden",
    },
    {
      name: "in town, the leader elsewhere",
      p: party([wren(), me()]),
      world: "hub",
      want: "live",
    },
  ] as const)("$name: $want", ({ p, world, want }) => {
    expect(travelButton(p, ME, world)).toBe(want);
  });
});

describe("partyTravelButtonRect", () => {
  it("sits inside the leader's frame, on the name line at its right end, clear of the bars and the T panel (R28)", () => {
    const { x, top } = PARTY_FRAMES_PLACEMENT.hub;
    const [frame] = partyFramesFrame(1, x, top);

    const button = partyTravelButtonRect(frame);

    expect(button.x).toBeGreaterThan(frame.name.x + 60); // room for a name before it
    expect(button.x + button.width).toBeLessThanOrEqual(
      frame.row.x + frame.row.width - 2,
    );
    expect(button.x + button.width).toBeLessThan(PARTY_PANEL_X);
    expect(button.y).toBeGreaterThanOrEqual(frame.row.y);
    expect(button.y + button.height).toBeLessThanOrEqual(frame.health.y - 1);
    expect(button.height).toBeGreaterThanOrEqual(14);
  });
});

describe("partyNameRoom", () => {
  it("is the width a name may take: to the frame's edge, after the crown, and short of the Travel button (R28)", () => {
    const { x, top } = PARTY_FRAMES_PLACEMENT.hub;
    const [frame] = partyFramesFrame(1, x, top);
    const button = partyTravelButtonRect(frame);

    const plain = partyNameRoom(frame, false, false);
    const crowned = partyNameRoom(frame, true, false);
    const withTravel = partyNameRoom(frame, true, true);

    expect(plain).toBeLessThanOrEqual(
      frame.row.x + frame.row.width - frame.name.x,
    );
    expect(crowned).toBeLessThan(plain);
    expect(frame.name.x + (plain - crowned) + withTravel).toBeLessThan(
      button.x,
    );
  });
});
