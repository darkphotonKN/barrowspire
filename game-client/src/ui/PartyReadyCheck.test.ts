import { EventEmitter } from "eventemitter3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import type Phaser from "phaser";
import {
  createPartyStore,
  type PartyReadyCheckPayload,
} from "@/stores/partyStore";
import { palette } from "@/utils/canvasPalette";
import { PartyReadyCheck } from "./PartyReadyCheck";
import { readyCheckFrame } from "./partyReadyCheckLayout";

// FS-BJNYC §Requirements R23–R26. I-BJNYC-5: the ready-check popup as a scene draws it, on a
// recording stand-in for the Phaser scene.

interface FakeText {
  content: string;
  destroyed: boolean;
  interactive: boolean;
  fontSize?: string;
  onPress?: () => void;
}

/** A plain rectangle a fake graphics filled, in the colour it was filled with. */
interface FakeFill {
  colour: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FakeGraphics {
  fills: FakeFill[];
  destroyed: boolean;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const drawn: FakeGraphics[] = [];
  const graphics = () => {
    const rec: FakeGraphics = { fills: [], destroyed: false };
    drawn.push(rec);
    let colour = 0;
    const self: Record<string, unknown> = {};
    for (const m of [
      "setScrollFactor",
      "setDepth",
      "lineStyle",
      "fillRoundedRect",
      "strokeRoundedRect",
      "strokeRect",
      "lineBetween",
      "fillCircle",
    ])
      self[m] = () => self;
    self.fillStyle = (c: number) => ((colour = c), self);
    self.fillRect = (x: number, y: number, width: number, height: number) => (
      rec.fills.push({ colour, x, y, width, height }), self
    );
    self.clear = () => ((rec.fills = []), self);
    self.destroy = () => void (rec.destroyed = true);
    return self;
  };
  const text = (
    _x: number,
    _y: number,
    content: string,
    style?: { fontSize?: string },
  ) => {
    const t: FakeText = {
      content,
      destroyed: false,
      interactive: false,
      fontSize: style?.fontSize,
    };
    texts.push(t);
    const self: Record<string, unknown> = {
      setScrollFactor: () => self,
      setDepth: () => self,
      setOrigin: () => self,
      setAlpha: () => self,
      setInteractive: () => ((t.interactive = true), self),
      on: (event: string, cb: () => void) => {
        if (event === "pointerdown") t.onPress = cb;
        return self;
      },
      destroy: () => void (t.destroyed = true),
    };
    return self;
  };
  const events = new EventEmitter();
  const scene = {
    events,
    cameras: { main: { width: 1080, height: 720 } },
    add: { graphics, text },
  } as unknown as Phaser.Scene;
  const live = () => texts.filter((t) => !t.destroyed);
  const find = (content: string) => live().find((t) => t.content === content);
  /** The bright-brass fills on live graphics: the countdown bar's fill (FS-B3NDZ R5). */
  const barFills = () =>
    drawn
      .filter((g) => !g.destroyed)
      .flatMap((g) => g.fills)
      .filter((f) => f.colour === palette.xpFill);
  /** The charcoal fills on live graphics: the countdown bar's track. */
  const barTracks = () =>
    drawn
      .filter((g) => !g.destroyed)
      .flatMap((g) => g.fills)
      .filter((f) => f.colour === palette.xpTrack);
  return { scene, events, texts, live, find, barFills, barTracks };
}

const LEADER = "leader";
const WREN = "wren";
const MIRA = "mira";
const QUESTION = "Aldric would enter the Spire. Are you ready?";

const check = (
  extra: Partial<PartyReadyCheckPayload> = {},
): PartyReadyCheckPayload => ({
  check_id: "chk-1",
  leader_id: LEADER,
  expires_in_ms: 30_000,
  members: [
    { player_id: LEADER, name: "Aldric", state: "accepted" },
    { player_id: WREN, name: "Wren", state: "waiting" },
    { player_id: MIRA, name: "Mira", state: "waiting" },
  ],
  outcome: "open",
  ...extra,
});

function setup(self = WREN, opts: { hidden?: boolean } = {}) {
  const env = fakeScene();
  const clock = { now: 0 };
  const said: string[] = [];
  const store = createPartyStore({
    selfId: () => self,
    now: () => clock.now,
    say: (line) => said.push(line.text),
  });
  const state = { hidden: opts.hidden ?? false };
  const commands = { ready: vi.fn() };
  const popup = new PartyReadyCheck(env.scene, {
    store,
    commands,
    selfId: () => self,
    hidden: () => state.hidden,
  });
  const frame = () => env.events.emit("postupdate");
  const receive = (extra: Partial<PartyReadyCheckPayload> = {}) =>
    store.getState().receiveReadyCheck(check(extra));
  return { ...env, clock, said, store, state, commands, popup, frame, receive };
}

describe("PartyReadyCheck (FS-BJNYC R23: one popup for everyone)", () => {
  it("should draw nothing with no check open", () => {
    const env = setup();
    expect(env.live()).toHaveLength(0);
    expect(env.popup.shown()).toBe(false);
  });

  it("should show a member the question, every member's state in join order, a 30 s countdown and both buttons", () => {
    const env = setup();
    env.receive();
    expect(env.popup.shown()).toBe(true);
    expect(env.find(QUESTION)).toBeDefined();
    const words = env.live().map((t) => t.content);
    expect(words.filter((w) => ["Aldric", "Wren", "Mira"].includes(w))).toEqual(
      ["Aldric", "Wren", "Mira"],
    );
    expect(words.filter((w) => ["Ready", "Waiting"].includes(w))).toEqual([
      "Ready",
      "Waiting",
      "Waiting",
    ]);
    expect(env.find("30s")).toBeDefined();
    expect(env.find("Accept")?.interactive).toBe(true);
    expect(env.find("Decline")?.interactive).toBe(true);
  });

  it("should show the leader the same popup, their own row ticked, and no Accept, Decline or Cancel", () => {
    const env = setup(LEADER);
    env.receive();
    expect(env.find(QUESTION)).toBeDefined();
    expect(env.live().map((t) => t.content)).toContain("Ready");
    expect(env.find("30s")).toBeDefined();
    expect(env.find("Accept")).toBeUndefined();
    expect(env.find("Decline")).toBeUndefined();
    expect(env.find("Cancel")).toBeUndefined();
    expect(env.live().some((t) => t.interactive)).toBe(false);
    expect(env.find("Waiting on your party.")).toBeDefined();
  });

  it("should count down in whole seconds from expires_in_ms, never a fixed wait", () => {
    const env = setup();
    env.receive({ expires_in_ms: 12_000 });
    expect(env.find("12s")).toBeDefined();
    env.clock.now = 1_000;
    env.frame();
    expect(env.find("11s")).toBeDefined();
    expect(env.find("12s")).toBeUndefined();
  });
});

describe("PartyReadyCheck answers (FS-BJNYC R24)", () => {
  it("should send one party_ready yes with the check id, and give the buttons way to the answer", () => {
    const env = setup();
    env.receive();
    env.find("Accept")!.onPress?.();
    expect(env.commands.ready).toHaveBeenCalledTimes(1);
    expect(env.commands.ready).toHaveBeenCalledWith("chk-1", true);
    expect(env.find("Accept")).toBeUndefined();
    expect(env.find("Decline")).toBeUndefined();
    expect(env.find("You are ready.")).toBeDefined();
  });

  it("should send one party_ready no with the check id", () => {
    const env = setup();
    env.receive();
    env.find("Decline")!.onPress?.();
    expect(env.commands.ready).toHaveBeenCalledTimes(1);
    expect(env.commands.ready).toHaveBeenCalledWith("chk-1", false);
    expect(env.find("Accept")).toBeUndefined();
    expect(env.find("You declined.")).toBeDefined();
  });

  it("should keep the buttons away when the server's next message still has the player waiting", () => {
    const env = setup();
    env.receive();
    env.find("Accept")!.onPress?.();
    env.receive({ expires_in_ms: 29_000 });
    expect(env.find("Accept")).toBeUndefined();
  });
});

describe("PartyReadyCheck live and close (FS-BJNYC R25, R26)", () => {
  it("should redraw the rows and reset the countdown on a newer message for the same check", () => {
    const env = setup(LEADER);
    env.receive();
    env.clock.now = 5_000;
    env.frame();
    expect(env.find("25s")).toBeDefined();
    env.receive({
      expires_in_ms: 24_400,
      members: [
        { player_id: LEADER, name: "Aldric", state: "accepted" },
        { player_id: WREN, name: "Wren", state: "accepted" },
        { player_id: MIRA, name: "Mira", state: "waiting" },
      ],
    });
    const words = env.live().map((t) => t.content);
    expect(words.filter((w) => ["Ready", "Waiting"].includes(w))).toEqual([
      "Ready",
      "Ready",
      "Waiting",
    ]);
    expect(env.find("25s")).toBeDefined();
    env.clock.now = 6_000;
    env.frame();
    expect(env.find("24s")).toBeDefined();
  });

  it("should replace the popup with a check of another id, buttons back", () => {
    const env = setup();
    env.receive();
    env.find("Accept")!.onPress?.();
    env.receive({ check_id: "chk-2" });
    expect(env.find("Accept")?.interactive).toBe(true);
    env.find("Accept")!.onPress?.();
    expect(env.commands.ready).toHaveBeenLastCalledWith("chk-2", true);
  });

  it("should close on started, saying nothing (the scene follows world_entered)", () => {
    const env = setup();
    env.receive();
    env.receive({ outcome: "started" });
    expect(env.popup.shown()).toBe(false);
    expect(env.live()).toHaveLength(0);
    expect(env.said).toEqual([]);
  });

  it("should close on cancelled and say why, the names filled in", () => {
    const env = setup(LEADER);
    env.receive();
    env.receive({ outcome: "cancelled", reason: "declined", names: ["Mira"] });
    expect(env.popup.shown()).toBe(false);
    expect(env.live()).toHaveLength(0);
    expect(env.said).toEqual(["Mira declined. The party stays."]);
  });

  it("should hide under an overlay that owns the screen, the countdown running on, and come back", () => {
    const env = setup(WREN, { hidden: true });
    env.receive();
    expect(env.live()).toHaveLength(0);
    env.clock.now = 3_000;
    env.state.hidden = false;
    env.frame();
    expect(env.find("27s")).toBeDefined();
  });

  it("should stop drawing once destroyed", () => {
    const env = setup();
    env.popup.destroy();
    env.receive();
    env.frame();
    expect(env.live()).toHaveLength(0);
  });
});

// FS-B3NDZ §Requirements 1–10. I-B3NDZ-1: the popup's countdown as the shared bar.
describe("PartyReadyCheck countdown bar (FS-B3NDZ R1–R10)", () => {
  const frameOf = (rows = 3) =>
    readyCheckFrame(rows, { canvasWidth: 1080, panelOpen: false });

  it("should draw a full bar along the popup's foot, edge to edge, in the XP bar's colours", () => {
    const env = setup();
    env.receive();
    const { bar } = frameOf();
    expect(env.barTracks()).toEqual([{ colour: palette.xpTrack, ...bar }]);
    expect(env.barFills()).toEqual([{ colour: palette.xpFill, ...bar }]);
  });

  it("should show the seconds at 18 px", () => {
    const env = setup();
    env.receive();
    expect(env.find("30s")?.fontSize).toBe("18px");
  });

  it("should drain the bar from the right every frame, its left end anchored", () => {
    const env = setup();
    env.receive();
    const { bar } = frameOf();
    env.clock.now = 300;
    env.frame();
    const [early] = env.barFills();
    expect(early.x).toBe(bar.x);
    expect(early.width).toBeCloseTo(bar.width * 0.99);
    env.clock.now = 15_000;
    env.frame();
    const [half] = env.barFills();
    expect(half.x).toBe(bar.x);
    expect(half.width).toBeCloseTo(bar.width / 2);
  });

  it("should leave the texts alone between second ticks", () => {
    const env = setup();
    env.receive();
    const made = env.texts.length;
    env.clock.now = 300;
    env.frame();
    env.clock.now = 600;
    env.frame();
    expect(env.texts.length).toBe(made);
    expect(env.barFills()).toHaveLength(1);
  });

  it("should drain over the window the check began with, not each message's", () => {
    const env = setup();
    env.receive({ expires_in_ms: 30_000 });
    env.clock.now = 6_000;
    env.receive({ expires_in_ms: 24_000 });
    env.frame();
    const { bar } = frameOf();
    expect(env.barFills()[0].width).toBeCloseTo(bar.width * 0.8);
  });

  it("should draw the bar on the leader's status-only popup too", () => {
    const env = setup(LEADER);
    env.receive();
    expect(env.barFills()).toHaveLength(1);
  });

  it("should draw no bar while hidden or once the check closes", () => {
    const env = setup(WREN, { hidden: true });
    env.receive();
    env.frame();
    expect(env.barTracks()).toEqual([]);
    env.state.hidden = false;
    env.frame();
    expect(env.barTracks()).toHaveLength(1);
    env.receive({ outcome: "started" });
    env.frame();
    expect(env.barTracks()).toEqual([]);
  });
});

describe("PartyReadyCheck at another logical width (FS-ZAJMH R12, R13)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should stand the open popup centred across the top again once the view widens", () => {
    const env = setup();
    env.receive();
    const at = (width: number) =>
      readyCheckFrame(3, { canvasWidth: width, panelOpen: false }).bar.x;
    expect(env.barTracks().map((t) => t.x)).toEqual([at(1080)]);

    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.popup.relayout();
    expect(env.barTracks().map((t) => t.x)).toEqual([at(1280)]);
    expect(env.find(QUESTION)).toBeDefined();
  });
});
