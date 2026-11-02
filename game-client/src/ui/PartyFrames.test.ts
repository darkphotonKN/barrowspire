import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { WorldType } from "@/assets/types/client";
import {
  createPartyStore,
  type PartyMember,
  type PartyUpdatePayload,
} from "@/stores/partyStore";
import type { FrameQuery } from "@/render/art/library";
import { palette, toCss } from "@/utils/canvasPalette";
import { PartyFrames, type PartyFramesDeps } from "./PartyFrames";
import {
  PARTY_FRAMES_PLACEMENT,
  partyFramesFrame,
  partyTravelButtonRect,
  type SeenPlayer,
} from "./partyFramesLayout";

// FS-R82NV §Requirements R34, R35. I-R82NV-9: the party frames as a scene draws them, on a
// recording stand-in for the Phaser scene. I-R82NV-12: every member, the player first, with
// their own bars.

interface FakeText {
  content: string;
  /** Its left edge (origin 0) as drawn, moved by `setX`. */
  x: number;
  colour?: string;
  destroyed: boolean;
  interactive: boolean;
  press?: () => void;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const allGraphics: { fills: number[]; destroyed: boolean }[] = [];
  const graphics = () => {
    const g = { fills: [] as number[], destroyed: false };
    allGraphics.push(g);
    const self: Record<string, unknown> = {};
    for (const m of [
      "setScrollFactor",
      "setDepth",
      "lineStyle",
      "fillRect",
      "strokeRect",
      "fillTriangle",
      "fillCircle",
      "strokeCircle",
      "strokeRoundedRect",
      "setAlpha",
    ])
      self[m] = () => self;
    self.clear = () => ((g.fills = []), self);
    self.fillStyle = (colour: number) => (g.fills.push(colour), self);
    self.destroy = () => void (g.destroyed = true);
    return self;
  };
  const text = (
    x: number,
    _y: number,
    content: string,
    style: { color?: string } = {},
  ) => {
    const t: FakeText = {
      content,
      x,
      colour: style.color,
      destroyed: false,
      interactive: false,
    };
    texts.push(t);
    const self: Record<string, unknown> = {
      setScrollFactor: () => self,
      setDepth: () => self,
      setOrigin: () => self,
      setAlpha: () => self,
      setX: (nx: number) => ((t.x = nx), self),
      setInteractive: () => ((t.interactive = true), self),
      on: (ev: string, fn: () => void) => (
        ev === "pointerdown" && (t.press = fn),
        self
      ),
      setText: (c: string) => ((t.content = c), self),
      get text() {
        return t.content;
      },
      // a measured width, 7 px a character, as a 13 px canvas font roughly runs
      get width() {
        return t.content.length * 7;
      },
      destroy: () => void (t.destroyed = true),
    };
    return self;
  };
  // the scene's frame events: `postupdate` handlers, run by `frame()`
  const handlers = new Map<string, { fn: () => void; ctx: unknown }[]>();
  const events = {
    on: (ev: string, fn: () => void, ctx?: unknown) =>
      handlers.set(ev, [...(handlers.get(ev) ?? []), { fn, ctx }]),
    off: (ev: string, fn: () => void) =>
      handlers.set(
        ev,
        (handlers.get(ev) ?? []).filter((h) => h.fn !== fn),
      ),
  };
  const frame = () =>
    (handlers.get("postupdate") ?? []).forEach((h) => h.fn.call(h.ctx));
  // the pulse tweens: live until killed
  const tweens: { targets: unknown; repeat?: number; killed: boolean }[] = [];
  const tweenManager = {
    add: (cfg: { targets: unknown; repeat?: number }) =>
      tweens.push({ ...cfg, killed: false }),
    killTweensOf: (target: unknown) =>
      tweens
        .filter((t) => t.targets === target)
        .forEach((t) => (t.killed = true)),
  };
  const liveTweens = () => tweens.filter((t) => !t.killed);
  const scene = {
    add: { graphics, text },
    events,
    tweens: tweenManager,
  } as unknown as Phaser.Scene;
  const live = () => texts.filter((t) => !t.destroyed).map((t) => t.content);
  const colourOf = (content: string) =>
    texts.find((t) => !t.destroyed && t.content === content)?.colour;
  const liveFills = () =>
    allGraphics.filter((g) => !g.destroyed).flatMap((g) => g.fills);
  /** How many texts were ever made: each one a fresh canvas texture on a real scene. */
  const textsMade = () => texts.length;
  /** The live text reading content, if any. */
  const liveText = (content: string) =>
    texts.find((t) => !t.destroyed && t.content === content);
  return {
    scene,
    live,
    colourOf,
    liveFills,
    textsMade,
    frame,
    liveTweens,
    liveText,
  };
}

const ME = "me";
const member = (
  player_id: string,
  name: string,
  cls = "warrior",
  where = "hub",
): PartyMember => ({
  player_id,
  name,
  class: cls,
  joined_at: "2026-11-01T05:00:00Z",
  where,
  online: true,
});
const update = (
  members: PartyMember[],
  leader = ME,
  reason = "joined",
): PartyUpdatePayload => ({
  party_id: "p",
  leader_id: leader,
  members,
  size: 4,
  reason,
  subject_id: members[members.length - 1].player_id,
});

function setup(world: WorldType = "hub", clock = { now: 0 }) {
  const scene = fakeScene();
  const said: { code: string; text: string }[] = [];
  const store = createPartyStore({
    selfId: () => ME,
    now: () => clock.now,
    say: (line) => said.push(line),
  });
  const resolved: (FrameQuery & { sheet: string })[] = [];
  const busts: { texture: string; frame: string | number }[] = [];
  const state = { world };
  const deps: PartyFramesDeps = {
    store,
    selfId: () => ME,
    world: () => state.world,
    art: {
      resolve: (sheet: string, query: FrameQuery = {}) => {
        resolved.push({ sheet, ...query });
        return {
          placeholder: false,
          texture: `art:${sheet}`,
          frame: `${sheet}/${query.animation}/${query.direction}/${query.index}`,
          anchor: { x: 0.5, y: 1 },
        };
      },
    },
    drawBust: vi.fn((_scene, portrait) => {
      busts.push(portrait);
      return undefined;
    }),
    travel: vi.fn(),
  };
  const frames = new PartyFrames(scene.scene, deps);
  /**
   * How many bar tracks are drawn: one per bar, health or resource, filled or empty. The
   * medallion's backing is the same charcoal, one per frame, so those are taken off.
   */
  const tracks = () =>
    scene.liveFills().filter((c) => c === palette.hudTrack).length -
    frames.rowCount();
  return {
    ...scene,
    store,
    frames,
    busts,
    resolved,
    state,
    tracks,
    said,
    deps,
  };
}

describe("PartyFrames", () => {
  it("draws nothing with no party", () => {
    const { frames, live, liveFills } = setup();
    expect(frames.rowCount()).toBe(0);
    expect(live()).toEqual([]);
    expect(liveFills()).toEqual([]);
  });

  it("draws two frames for a two-member party: the player's first", () => {
    const { store, frames, live } = setup();
    store.getState().apply(update([member("wren", "Wren"), member(ME, "Me")]));
    expect(frames.rowCount()).toBe(2);
    expect(live().filter((t) => t === "Me" || t === "Wren")).toEqual([
      "Me",
      "Wren",
    ]);
  });

  it("cuts each bust from the member's own class sheet, the player's first", () => {
    const { store, busts } = setup();
    store
      .getState()
      .apply(update([member(ME, "Me"), member("wren", "Wren", "mage")]));
    expect(busts).toEqual([
      { texture: "art:char_knight_base", frame: "char_knight_base/idle/1/0" },
      { texture: "art:char_wizard_base", frame: "char_wizard_base/idle/1/0" },
    ]);
  });

  it("draws the player's own health and resource in the hub, from their own state", () => {
    const { store, frames, liveFills } = setup("hub");
    store
      .getState()
      .apply(update([member(ME, "Me", "mage"), member("wren", "Wren")]));
    frames.show({
      current_player: {
        id: ME,
        current_health: 50,
        max_health: 100,
        resource: { kind: "mana", current: 40, max: 100, ability_cost: 20 },
      },
    });
    expect(liveFills()).toContain(palette.hudHealth);
    expect(liveFills()).toContain(palette.hudMana);
  });

  it("draws both of the player's bars even before the state carries a resource", () => {
    const { store, frames, tracks } = setup("hub");
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    frames.show({
      current_player: { id: ME, current_health: 50, max_health: 100 },
    });
    // the player's health and an empty resource track; Wren, not in this state, name and bust
    expect(tracks()).toBe(2);
  });

  it.each(["hub", "field:gentle_meadows", "run", "away"])(
    "draws a teammate absent from this world's state (where %s) as name and bust only, no word",
    (where) => {
      const { store, live, tracks, busts } = setup("field");
      store
        .getState()
        .apply(
          update([member(ME, "Me"), member("wren", "Wren", "mage", where)]),
        );
      expect(live()).toEqual(["Me", "Wren"]);
      expect(busts).toHaveLength(2);
      // the player's own two bars only
      expect(tracks()).toBe(2);
    },
  );

  it("draws a teammate's health and resource bars when the state carries them", () => {
    const { store, frames, live, liveFills } = setup("run");
    store
      .getState()
      .apply(update([member(ME, "Me"), member("wren", "Wren", "mage", "run")]));
    const seen: SeenPlayer = {
      id: "wren",
      current_health: 60,
      max_health: 120,
      resource: { kind: "mana", current: 10, max: 100, ability_cost: 20 },
    };
    frames.show({ other_players: [seen] });
    expect(liveFills()).toContain(palette.hudHealth);
    expect(liveFills()).toContain(palette.hudMana);
    expect(live()).toEqual(["Me", "Wren"]);
  });

  it("drops the teammate's bars when they drop out of the state, keeping name and bust", () => {
    const { store, frames, live, tracks } = setup("run");
    store
      .getState()
      .apply(update([member(ME, "Me"), member("wren", "Wren", "mage", "run")]));
    frames.show({
      other_players: [{ id: "wren", current_health: 60, max_health: 120 }],
    });
    expect(tracks()).toBe(4);
    frames.show({ other_players: [] });
    expect(live()).toEqual(["Me", "Wren"]);
    expect(tracks()).toBe(2);
  });

  it("redraws only the bars when a tick moves a bar: no text is made again", () => {
    const { store, frames, live, textsMade } = setup("run");
    store
      .getState()
      .apply(
        update([
          member(ME, "Me"),
          member("wren", "Wren", "mage", "run"),
          member("bram", "Bram", "warrior", "away"),
        ]),
      );
    const tick = (mine: number, wrens: number) =>
      frames.show({
        current_player: { id: ME, current_health: mine, max_health: 100 },
        other_players: [{ id: "wren", current_health: wrens, max_health: 120 }],
      });
    tick(90, 60);
    expect(live()).toEqual(["Me", "Wren", "Bram"]);
    const made = textsMade();

    tick(89, 61);
    tick(88, 62);

    expect(textsMade()).toBe(made);
    expect(live()).toEqual(["Me", "Wren", "Bram"]);
  });

  it("greys an away teammate's frame, and lifts it when they are back", () => {
    const { store, colourOf } = setup();
    const wren = member("wren", "Wren");
    store
      .getState()
      .apply(update([member(ME, "Me"), { ...wren, online: false }]));
    expect(colourOf("Wren")).toBe(toCss(palette.hudFaint));
    expect(colourOf("Me")).toBe(toCss(palette.hudText));

    store.getState().apply(update([member(ME, "Me"), wren]));
    expect(colourOf("Wren")).toBe(toCss(palette.hudText));
  });

  it("reads a member without online on the wire as online, not greyed", () => {
    const { store, colourOf } = setup();
    const { online: _online, ...wren } = member("wren", "Wren");
    store.getState().apply(update([member(ME, "Me"), wren]));
    expect(colourOf("Wren")).toBe(toCss(palette.hudText));
  });

  it("takes every frame down when the viewer is kicked", () => {
    const { store, frames, live } = setup();
    store
      .getState()
      .apply(update([member(ME, "Me"), member("wren", "Wren")], "wren"));
    store.getState().apply({
      ...update([member("wren", "Wren")], "wren", "kicked"),
      subject_id: ME,
    });
    expect(frames.rowCount()).toBe(0);
    expect(live()).toEqual([]);
  });

  it("moves the leader mark on a leader update", () => {
    const { store, frames } = setup();
    const members = [
      member(ME, "Me"),
      member("wren", "Wren"),
      member("bram", "Bram"),
    ];
    store.getState().apply(update(members, "wren"));
    expect(frames.leaderRow()).toBe(1);
    store.getState().apply(update(members, "bram", "leader"));
    expect(frames.leaderRow()).toBe(2);
    // the player's own row, first, takes the crown when they lead
    store.getState().apply(update(members, ME, "leader"));
    expect(frames.leaderRow()).toBe(0);
  });

  it("takes every frame down when the party is let go", () => {
    const { store, frames, live } = setup();
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    store
      .getState()
      .apply(
        update([member(ME, "Me"), member("wren", "Wren")], ME, "dissolved"),
      );
    expect(frames.rowCount()).toBe(0);
    expect(live()).toEqual([]);
  });

  it("stops listening once destroyed", () => {
    const { store, frames, live } = setup();
    frames.destroy();
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    expect(live()).toEqual([]);
  });
});

// FS-NCC9J §Requirements R25–R27. I-NCC9J-7: skeleton rows for open invites, and the leader's
// expiry line on the frames' own tick.

describe("PartyFrames: skeleton rows (FS-NCC9J R26)", () => {
  const EXPIRES = "2026-11-01T05:01:00Z";
  const withReserved = (
    members: PartyMember[],
    names: string[],
    leader = ME,
    reason = "sent",
  ): PartyUpdatePayload => ({
    ...update(members, leader, reason),
    reserved: names.map((name) => ({ name, expires_at: EXPIRES })),
  });

  it("draws a skeleton row after the members with the invitee's name, a grey pulse and no bust", () => {
    const { store, frames, live, liveFills, busts, tracks } = setup();
    store.getState().apply(withReserved([member(ME, "Me")], ["Kaelen"]));
    expect(frames.rowCount()).toBe(2);
    expect(live()).toEqual(["Me", "Kaelen"]);
    // only the player's bust is cut; the skeleton's medallion is the pulse
    expect(busts).toHaveLength(1);
    expect(liveFills()).toContain(palette.hudFaint);
    // no bars in a skeleton: the player's own two only
    expect(tracks()).toBe(2);
  });

  it("draws it for a member who is not the leader, too", () => {
    const { store, live } = setup();
    store
      .getState()
      .apply(
        withReserved(
          [member("lead", "Aldric"), member(ME, "Me")],
          ["Kaelen"],
          "lead",
        ),
      );
    expect(live()).toEqual(["Me", "Aldric", "Kaelen"]);
  });

  it("replaces the skeleton with a real frame when the invitee joins", () => {
    const { store, frames, live, liveFills, busts } = setup();
    store.getState().apply(withReserved([member(ME, "Me")], ["Kaelen"]));
    store
      .getState()
      .apply(update([member(ME, "Me"), member("kae", "Kaelen", "mage")]));
    expect(frames.rowCount()).toBe(2);
    expect(live()).toEqual(["Me", "Kaelen"]);
    expect(liveFills()).not.toContain(palette.hudFaint);
    expect(busts.at(-1)).toEqual({
      texture: "art:char_wizard_base",
      frame: "char_wizard_base/idle/1/0",
    });
  });

  it("takes the skeleton away when the invite is declined", () => {
    const { store, frames, live, liveFills } = setup();
    store.getState().apply(withReserved([member(ME, "Me")], ["Kaelen"]));
    store
      .getState()
      .apply(withReserved([member(ME, "Me")], [], ME, "declined"));
    expect(frames.rowCount()).toBe(1);
    expect(live()).toEqual(["Me"]);
    expect(liveFills()).not.toContain(palette.hudFaint);
  });

  it("pulses the skeleton for as long as it stands, and stops the pulse when it goes", () => {
    const { store, liveTweens } = setup();
    store.getState().apply(withReserved([member(ME, "Me")], ["Kaelen"]));
    expect(liveTweens()).toHaveLength(1);
    expect(liveTweens()[0].repeat).toBe(-1);
    store
      .getState()
      .apply(withReserved([member(ME, "Me")], [], ME, "declined"));
    expect(liveTweens()).toEqual([]);
  });

  it("writes the leader's expiry line on the frames' own tick once expires_at passes", () => {
    const clock = { now: Date.parse(EXPIRES) - 1 };
    const { store, frame, said } = setup("field", clock);
    store.getState().apply(withReserved([member(ME, "Me")], ["Kaelen"]));
    frame();
    expect(said).toEqual([]);
    clock.now = Date.parse(EXPIRES);
    frame();
    frame();
    expect(said).toEqual([
      { code: "no_answer", text: "No answer from Kaelen." },
    ]);
  });

  it("writes nothing on a member's client when the slot lapses", () => {
    const clock = { now: Date.parse(EXPIRES) + 1 };
    const { store, frame, said } = setup("hub", clock);
    store
      .getState()
      .apply(
        withReserved(
          [member("lead", "Aldric"), member(ME, "Me")],
          ["Kaelen"],
          "lead",
        ),
      );
    frame();
    expect(said).toEqual([]);
  });

  it("stops ticking once destroyed", () => {
    const clock = { now: Date.parse(EXPIRES) + 1 };
    const { store, frames, frame, said } = setup("hub", clock);
    frames.destroy();
    store.getState().apply(withReserved([member(ME, "Me")], ["Kaelen"]));
    frame();
    expect(said).toEqual([]);
  });
});

// FS-NCC9J §Requirements R28; I-NCC9J-8. The Travel button on the leader's frame.
describe("PartyFrames' Travel button", () => {
  const LEADER = "wren";
  const atPods = (mine: string, leaders: string, leaderOnline = true) =>
    update(
      [
        { ...member(LEADER, "Wren"), pod_id: leaders, online: leaderOnline },
        { ...member(ME, "Marl"), pod_id: mine },
      ],
      LEADER,
    );

  it("shows Travel on the leader's frame to a member on another pod in town; pressing it travels", () => {
    const { store, liveText, deps } = setup("hub");
    store.getState().apply(atPods("pod-b", "pod-a"));

    const travel = liveText("Travel");
    expect(travel?.interactive).toBe(true);
    travel?.press?.();
    expect(deps.travel).toHaveBeenCalledTimes(1);
  });

  it("greys it in a field, inert", () => {
    const { store, liveText } = setup("field");
    store.getState().apply(atPods("pod-b", "pod-a"));

    const travel = liveText("Travel");
    expect(travel).toBeDefined();
    expect(travel?.interactive).toBe(false);
    expect(travel?.press).toBeUndefined();
    expect(travel?.colour).toBe(toCss(palette.hudFaint));
  });

  it("shows none to a member on the leader's pod, nor to the leader", () => {
    const here = setup("hub");
    here.store.getState().apply(atPods("pod-a", "pod-a"));
    expect(here.liveText("Travel")).toBeUndefined();

    const leading = setup("hub");
    leading.store.getState().apply(
      update(
        [
          { ...member(ME, "Marl"), pod_id: "pod-b" },
          { ...member(LEADER, "Wren"), pod_id: "pod-a" },
        ],
        ME,
      ),
    );
    expect(leading.liveText("Travel")).toBeUndefined();
  });

  it("greys it once the leader goes away, and brings it back when they return", () => {
    const { store, liveText } = setup("hub");
    store.getState().apply(atPods("pod-b", "pod-a"));
    expect(liveText("Travel")?.interactive).toBe(true);

    store.getState().apply(atPods("pod-b", "pod-a", false));
    expect(liveText("Travel")?.interactive).toBe(false);

    store.getState().apply(atPods("pod-b", "pod-a", true));
    expect(liveText("Travel")?.interactive).toBe(true);
  });
});

describe("PartyFrames names", () => {
  it("shortens a name too long for its frame with an ellipsis, short of the Travel button, and leaves a short one whole", () => {
    const { store, live } = setup("hub");
    store.getState().apply(
      update(
        [
          {
            ...member("wren", "Bartholomew Thornwood the Third"),
            pod_id: "pod-a",
          },
          { ...member(ME, "Marl"), pod_id: "pod-b" },
        ],
        "wren",
      ),
    );

    const leaderName = live().find((c) => c.startsWith("Bartho"));
    expect(leaderName).toBeDefined();
    expect(leaderName?.endsWith("…")).toBe(true);
    expect(leaderName!.length).toBeLessThan(
      "Bartholomew Thornwood the Third".length,
    );
    expect(live()).toContain("Marl");
    expect(live()).toContain("Travel");
  });
});

// FS-CH21F §Requirements R8–R11; I-CH21F-2. Same-world teammates' bars in every world, the
// hub included, and "Lv N" after their names.
describe("PartyFrames: same-world teammates' vitals and level (FS-CH21F)", () => {
  const wrenSeen = (extra: Partial<SeenPlayer> = {}): SeenPlayer => ({
    id: "wren",
    current_health: 60,
    max_health: 120,
    level: 12,
    ...extra,
  });
  /** A text's measured width, as the fake scene measures it: 7 px a character. */
  const width = (t: { content: string }) => t.content.length * 7;

  it.each(["hub", "field", "run"] as const)(
    "draws a listed teammate's health and resource bars and their level in the %s",
    (world) => {
      const { store, frames, live, liveFills, tracks } = setup(world);
      store
        .getState()
        .apply(
          update([member(ME, "Me"), member("wren", "Wren", "mage", world)]),
        );
      frames.show({
        other_players: [
          wrenSeen({
            resource: { kind: "mana", current: 10, max: 100, ability_cost: 20 },
          }),
        ],
      });
      expect(tracks()).toBe(4);
      expect(liveFills()).toContain(palette.hudMana);
      expect(live()).toEqual(["Me", "Wren", "Lv 12"]);
    },
  );

  it("draws a listed teammate's resource bar empty when the state carries no resource", () => {
    const { store, frames, liveFills, tracks } = setup("hub");
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    frames.show({ other_players: [wrenSeen()] });
    expect(tracks()).toBe(4);
    expect(liveFills()).not.toContain(palette.hudMana);
  });

  it("draws a teammate absent from this world's state with no level", () => {
    const { store, frames, live } = setup("hub");
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    frames.show({ other_players: [wrenSeen({ id: "someone-else" })] });
    expect(live()).toEqual(["Me", "Wren"]);
  });

  // FS-CH21F R10 (amended 2026-11-02, Nick: own level shown in the party frames); I-CH21F-4
  it.each(["hub", "field", "run"] as const)(
    "draws the player's own level after their name, as a teammate's, in the %s",
    (world) => {
      const { store, frames, live, liveText, colourOf } = setup(world);
      store
        .getState()
        .apply(update([member(ME, "Me"), member("wren", "Wren")]));
      frames.show({
        current_player: {
          id: ME,
          current_health: 50,
          max_health: 100,
          level: 7,
        },
      });
      expect(live()).toEqual(["Me", "Lv 7", "Wren"]);
      const name = liveText("Me")!;
      const level = liveText("Lv 7")!;
      expect(level.x).toBeGreaterThan(name.x + width(name));
      expect(level.x).toBeLessThan(name.x + width(name) + 12);
      expect(colourOf("Lv 7")).toBe(toCss(palette.hudLabel));
    },
  );

  it("redraws the player's own level when it rises", () => {
    const { store, frames, live } = setup("hub");
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    frames.show({
      current_player: { id: ME, current_health: 50, max_health: 100, level: 7 },
    });
    frames.show({
      current_player: { id: ME, current_health: 50, max_health: 100, level: 8 },
    });
    expect(live()).toEqual(["Me", "Lv 8", "Wren"]);
  });

  it("draws no own level while the state carries none", () => {
    const { store, frames, live } = setup("hub");
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    frames.show({
      current_player: { id: ME, current_health: 50, max_health: 100 },
    });
    expect(live()).toEqual(["Me", "Wren"]);
  });

  it("greys an away teammate's level with their name", () => {
    const { store, frames, colourOf } = setup("run");
    store
      .getState()
      .apply(
        update([
          member(ME, "Me"),
          { ...member("wren", "Wren"), online: false },
        ]),
      );
    frames.show({ other_players: [wrenSeen()] });
    expect(colourOf("Lv 12")).toBe(toCss(palette.hudFaint));
  });

  it("redraws the level when it changes, and drops it when the teammate leaves this world", () => {
    const { store, frames, live } = setup("hub");
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    frames.show({ other_players: [wrenSeen()] });
    frames.show({ other_players: [wrenSeen({ level: 13 })] });
    expect(live()).toEqual(["Me", "Wren", "Lv 13"]);
    frames.show({ other_players: [] });
    expect(live()).toEqual(["Me", "Wren"]);
  });

  it("shortens the leader's long name short of the level, and the level short of the Travel button", () => {
    const { store, frames, liveText, live } = setup("hub");
    store.getState().apply(
      update(
        [
          {
            ...member("wren", "Bartholomew Thornwood the Third"),
            pod_id: "pod-a",
          },
          { ...member(ME, "Marl"), pod_id: "pod-b" },
        ],
        "wren",
      ),
    );
    frames.show({ other_players: [wrenSeen({ level: 20 })] });

    const name = liveText(live().find((c) => c.startsWith("Ba")) ?? "");
    const level = liveText("Lv 20");
    expect(name?.content.endsWith("…")).toBe(true);
    expect(level).toBeDefined();
    // the leader's frame is the second, under the player's own
    const { x, top } = PARTY_FRAMES_PLACEMENT.hub;
    const travel = partyTravelButtonRect(partyFramesFrame(2, x, top)[1]);
    expect(name!.x + width(name!)).toBeLessThan(level!.x);
    expect(level!.x + width(level!)).toBeLessThan(travel.x);
  });

  it("leaves a short name whole, the level right after it", () => {
    const { store, frames, liveText } = setup("hub");
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    frames.show({ other_players: [wrenSeen()] });
    const name = liveText("Wren")!;
    const level = liveText("Lv 12")!;
    expect(level.x).toBeGreaterThan(name.x + width(name));
    expect(level.x).toBeLessThan(name.x + width(name) + 12);
  });
});
