import { EventEmitter } from "eventemitter3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import type Phaser from "phaser";
import type { WorldType } from "@/assets/types/client";
import {
  createPartyStore,
  type PartyInvitePayload,
  type PartyUpdatePayload,
} from "@/stores/partyStore";
import { palette } from "@/utils/canvasPalette";
import { PartyInvitePrompt } from "./PartyInvitePrompt";
import { invitePromptFrames } from "./partyInvitePromptLayout";

// FS-R82NV §Requirements R32, R33. I-R82NV-7: the invite prompt as a scene draws it, on a
// recording stand-in for the Phaser scene. FS-NCC9J §Requirements R24. I-NCC9J-6: the prompt in
// every world, its Accept greyed in a run.

interface FakeText {
  content: string;
  destroyed: boolean;
  interactive: boolean;
  alpha: number;
  fontSize?: string;
  onPress?: () => void;
  onRelease?: () => void;
}

/** A plain rectangle a fake graphics filled, in the colour it was filled with. */
interface FakeFill {
  colour: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const drawn: { fills: FakeFill[]; destroyed: boolean }[] = [];
  const graphics = () => {
    const rec = { fills: [] as FakeFill[], destroyed: false };
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
      alpha: 1,
      fontSize: style?.fontSize,
    };
    texts.push(t);
    const self: Record<string, unknown> = {
      setScrollFactor: () => self,
      setDepth: () => self,
      setOrigin: () => self,
      setAlpha: (a: number) => ((t.alpha = a), self),
      setInteractive: () => ((t.interactive = true), self),
      on: (event: string, cb: () => void) => {
        if (event === "pointerdown") t.onPress = cb;
        if (event === "pointerup") t.onRelease = cb;
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
  const all = (content: string) => live().filter((t) => t.content === content);
  const fills = (colour: number) =>
    drawn
      .filter((g) => !g.destroyed)
      .flatMap((g) => g.fills)
      .filter((f) => f.colour === colour);
  /** The countdown bars' fills and tracks on live graphics (FS-B3NDZ R5). */
  const barFills = () => fills(palette.xpFill);
  const barTracks = () => fills(palette.xpTrack);
  return { scene, events, texts, live, find, all, barFills, barTracks };
}

const ME = "me";

const invite = (
  invite_id: string,
  leader_name = "Wren",
  member_count = 2,
): PartyInvitePayload => ({
  invite_id,
  party_id: `party-${invite_id}`,
  party_pod_addr: "10.0.0.7:5660",
  leader_name,
  member_count,
  size: 4,
  expires_at: "2026-11-01T05:01:00Z",
});

const joined = (): PartyUpdatePayload => ({
  party_id: "party-a",
  leader_id: "wren",
  members: [
    {
      player_id: "wren",
      name: "Wren",
      class: "mage",
      joined_at: "2026-11-01T05:00:00Z",
      where: "hub",
      online: true,
    },
    {
      player_id: ME,
      name: "Aldric",
      class: "warrior",
      joined_at: "2026-11-01T05:00:30Z",
      where: "hub",
      online: true,
    },
  ],
  size: 4,
  reason: "joined",
  subject_id: ME,
});

function setup(
  opts: { hidden?: boolean; world?: WorldType | null; floor?: number } = {},
) {
  const env = fakeScene();
  const clock = { now: 0 };
  const store = createPartyStore({ selfId: () => ME, now: () => clock.now });
  const state = {
    hidden: opts.hidden ?? false,
    world: (opts.world === undefined ? "hub" : opts.world) as WorldType | null,
    floor: opts.floor,
  };
  const commands = { accept: vi.fn(), decline: vi.fn() };
  const prompt = new PartyInvitePrompt(env.scene, {
    store,
    commands,
    hidden: () => state.hidden,
    world: () => state.world,
    floor: () => state.floor,
  });
  const frame = () => env.events.emit("postupdate");
  return { ...env, clock, store, state, commands, prompt, frame };
}

const LINE = "Wren invites you to their party (2/4)";

/** A whole click on a button: the press, then the release over it. */
const click = (t: { onPress?: () => void; onRelease?: () => void }) => {
  t.onPress?.();
  t.onRelease?.();
};

describe("PartyInvitePrompt (FS-R82NV R32: the prompt)", () => {
  it("should draw nothing with no invite waiting", () => {
    const env = setup();
    expect(env.live()).toHaveLength(0);
    expect(env.prompt.shown()).toBe(0);
  });

  it("should render a party_invite with the leader's name and the count, a 60 s countdown and both buttons", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    expect(env.find(LINE)).toBeDefined();
    expect(env.find("60s")).toBeDefined();
    expect(env.find("Accept")?.interactive).toBe(true);
    expect(env.find("Decline")?.interactive).toBe(true);
  });

  // asked 2026-11-02 (Nick): answering on the press closed the prompt before a fighting scene's
  // attack handler asked whether the press was the prompt's, so the press attacked too.
  it("should answer on the release, so the press on a button is still the prompt's", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    const accept = env.find("Accept")!;
    const [frame] = invitePromptFrames(1, { canvasWidth: 1080, panelOpen: false });

    accept.onPress?.();

    expect(env.commands.accept).not.toHaveBeenCalled();
    expect(env.prompt.covers(frame.panel.x + 5, frame.panel.y + 5)).toBe(true);

    accept.onRelease!();
    expect(env.commands.accept).toHaveBeenCalledWith("a");
  });

  it("should send party_accept with the invite id and close the prompt", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    click(env.find("Accept")!);
    expect(env.commands.accept).toHaveBeenCalledWith("a");
    expect(env.commands.decline).not.toHaveBeenCalled();
    expect(env.find(LINE)).toBeUndefined();
    expect(env.store.getState().invites).toEqual([]);
  });

  it("should send party_decline with the invite id and close the prompt", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    click(env.find("Decline")!);
    expect(env.commands.decline).toHaveBeenCalledWith("a");
    expect(env.commands.accept).not.toHaveBeenCalled();
    expect(env.find(LINE)).toBeUndefined();
  });

  it("should count down each second and close itself at 60 s", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    env.clock.now = 1_000;
    env.frame();
    expect(env.find("59s")).toBeDefined();
    expect(env.find("60s")).toBeUndefined();
    env.clock.now = 59_999;
    env.frame();
    expect(env.find("1s")).toBeDefined();
    env.clock.now = 60_000;
    env.frame();
    expect(env.find(LINE)).toBeUndefined();
    expect(env.prompt.shown()).toBe(0);
    expect(env.commands.decline).not.toHaveBeenCalled();
  });

  it("should stack two invites, and close them all when the player joins a party", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    env.store.getState().receiveInvite(invite("b", "Osric", 3));
    expect(env.prompt.shown()).toBe(2);
    expect(env.find(LINE)).toBeDefined();
    expect(env.find("Osric invites you to their party (3/4)")).toBeDefined();
    expect(env.all("Accept")).toHaveLength(2);

    env.store.getState().apply(joined());
    expect(env.prompt.shown()).toBe(0);
    expect(env.live()).toHaveLength(0);
  });

  it("should answer the invite whose prompt was pressed when two are stacked", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    env.store.getState().receiveInvite(invite("b", "Osric", 3));
    click(env.all("Decline")[1]);
    expect(env.commands.decline).toHaveBeenCalledWith("b");
    expect(env.find(LINE)).toBeDefined();
    expect(env.prompt.shown()).toBe(1);
  });

  it("should claim a press on a prompt, so it is not the world's", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    const [f] = invitePromptFrames(1, { canvasWidth: 1080, panelOpen: false });
    expect(env.prompt.covers(f.panel.x + 5, f.panel.y + 5)).toBe(true);
    expect(env.prompt.covers(5, 700)).toBe(false);
  });

  it("should step aside while the party panel is open", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    const [closed] = invitePromptFrames(1, {
      canvasWidth: 1080,
      panelOpen: false,
    });
    const [open] = invitePromptFrames(1, {
      canvasWidth: 1080,
      panelOpen: true,
    });
    env.store.getState().togglePanel();
    expect(env.prompt.covers(open.panel.x + 5, open.panel.y + 5)).toBe(true);
    expect(env.prompt.covers(closed.panel.x + 5, closed.panel.y + 5)).toBe(
      false,
    );
  });
});

describe("PartyInvitePrompt (FS-R82NV R33: hidden under an overlay)", () => {
  it("should hide while an overlay owns the screen and come back after, still counting", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    env.state.hidden = true;
    env.frame();
    expect(env.find(LINE)).toBeUndefined();
    expect(env.prompt.covers(540, 100)).toBe(false);

    env.clock.now = 30_000;
    env.state.hidden = false;
    env.frame();
    expect(env.find(LINE)).toBeDefined();
    expect(env.find("30s")).toBeDefined();
  });

  it("should still close a hidden prompt when its time runs out", () => {
    const env = setup({ hidden: true });
    env.store.getState().receiveInvite(invite("a"));
    env.clock.now = 60_000;
    env.frame();
    env.state.hidden = false;
    env.frame();
    expect(env.find(LINE)).toBeUndefined();
  });

  it("should let go of the store and the frame hook when the scene goes", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    env.prompt.destroy();
    expect(env.live()).toHaveLength(0);
    env.store.getState().receiveInvite(invite("b"));
    env.frame();
    expect(env.live()).toHaveLength(0);
  });
});

describe("PartyInvitePrompt (FS-NCC9J R24: in every world)", () => {
  it("should leave Accept live afield, with no note", () => {
    const env = setup({ world: "field" });
    env.store.getState().receiveInvite(invite("a"));
    expect(env.find("Accept")?.interactive).toBe(true);
    expect(env.find("Not while delving.")).toBeUndefined();
    click(env.find("Accept")!);
    expect(env.commands.accept).toHaveBeenCalledWith("a");
  });

  it("should grey Accept in a run, say why, and send nothing when it is pressed", () => {
    const env = setup({ world: "run" });
    env.store.getState().receiveInvite(invite("a"));
    expect(env.find(LINE)).toBeDefined();
    const accept = env.find("Accept")!;
    expect(accept.interactive).toBe(false);
    expect(accept.alpha).toBeLessThan(1);
    expect(env.find("Not while delving.")).toBeDefined();
    click(accept);
    expect(env.commands.accept).not.toHaveBeenCalled();
    // the prompt stays up for an answer once out, or a decline now
    expect(env.prompt.shown()).toBe(1);
  });

  it("should still let a delver decline", () => {
    const env = setup({ world: "run" });
    env.store.getState().receiveInvite(invite("a"));
    click(env.find("Decline")!);
    expect(env.commands.decline).toHaveBeenCalledWith("a");
    expect(env.prompt.shown()).toBe(0);
  });

  it("should redraw Accept when the world under it changes", () => {
    const env = setup({ world: "run" });
    env.store.getState().receiveInvite(invite("a"));
    env.state.world = "hub";
    env.frame();
    expect(env.find("Accept")?.interactive).toBe(true);
    expect(env.find("Not while delving.")).toBeUndefined();
  });

  it("should stack no lower than the floor it is given", () => {
    const [first] = invitePromptFrames(1, {
      canvasWidth: 1080,
      panelOpen: false,
    });
    const env = setup({ floor: first.panel.y + first.panel.height + 10 });
    env.store.getState().receiveInvite(invite("a"));
    env.store.getState().receiveInvite(invite("b", "Osric", 3));
    expect(env.prompt.shown()).toBe(1);
    // the second shows once the first is answered
    click(env.find("Decline")!);
    expect(env.prompt.shown()).toBe(1);
    expect(env.find("Osric invites you to their party (3/4)")).toBeDefined();
  });
});

// FS-B3NDZ §Requirements 1–9, 11. I-B3NDZ-1: each prompt's countdown as the shared bar.
describe("PartyInvitePrompt countdown bar (FS-B3NDZ R1–R9, R11)", () => {
  const framesOf = (count: number) =>
    invitePromptFrames(count, { canvasWidth: 1080, panelOpen: false });

  it("should draw a full bar along the prompt's foot, edge to edge, in the XP bar's colours", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    const [{ bar }] = framesOf(1);
    expect(env.barTracks()).toEqual([{ colour: palette.xpTrack, ...bar }]);
    expect(env.barFills()).toEqual([{ colour: palette.xpFill, ...bar }]);
  });

  it("should show the seconds at 18 px", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    expect(env.find("60s")?.fontSize).toBe("18px");
  });

  it("should drain each bar from the right over its own invite's window, every frame", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    env.clock.now = 15_000;
    env.store.getState().receiveInvite(invite("b"));
    env.clock.now = 30_000;
    env.frame();
    const [first, second] = framesOf(2);
    const [a, b] = env.barFills();
    expect(a.x).toBe(first.bar.x);
    expect(a.width).toBeCloseTo(first.bar.width * 0.5);
    expect(b.x).toBe(second.bar.x);
    expect(b.width).toBeCloseTo(second.bar.width * 0.75);
  });

  it("should leave the texts alone between second ticks", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    const made = env.texts.length;
    env.clock.now = 200;
    env.frame();
    env.clock.now = 400;
    env.frame();
    expect(env.texts.length).toBe(made);
    expect(env.barFills()[0].width).toBeLessThan(framesOf(1)[0].bar.width);
  });

  it("should draw no bar while hidden", () => {
    const env = setup({ hidden: true });
    env.store.getState().receiveInvite(invite("a"));
    env.frame();
    expect(env.barTracks()).toEqual([]);
  });
});

describe("PartyInvitePrompt at another logical width (FS-ZAJMH R12, R13)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should stand a shown prompt centred across the top again once the view widens", () => {
    const env = setup();
    env.store.getState().receiveInvite(invite("a"));
    const [wide] = invitePromptFrames(1, { canvasWidth: 1280, panelOpen: false });
    expect(env.prompt.covers(wide.panel.x + wide.panel.width - 2, wide.panel.y + 5)).toBe(false);

    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.prompt.relayout();
    expect(env.prompt.covers(wide.panel.x + wide.panel.width - 2, wide.panel.y + 5)).toBe(true);
    expect(env.prompt.shown()).toBe(1);
  });
});
