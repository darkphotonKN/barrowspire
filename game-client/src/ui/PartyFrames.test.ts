import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { WorldType } from "@/assets/types/client";
import {
  createPartyStore,
  type PartyMember,
  type PartyUpdatePayload,
} from "@/stores/partyStore";
import type { FrameQuery } from "@/render/art/library";
import { palette } from "@/utils/canvasPalette";
import { PartyFrames, type PartyFramesDeps } from "./PartyFrames";
import type { SeenPlayer } from "./partyFramesLayout";

// FS-R82NV §Requirements R34, R35. I-R82NV-9: the party frames as a scene draws them, on a
// recording stand-in for the Phaser scene.

interface FakeText {
  content: string;
  destroyed: boolean;
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
    ])
      self[m] = () => self;
    self.clear = () => ((g.fills = []), self);
    self.fillStyle = (colour: number) => (g.fills.push(colour), self);
    self.destroy = () => void (g.destroyed = true);
    return self;
  };
  const text = (_x: number, _y: number, content: string) => {
    const t: FakeText = { content, destroyed: false };
    texts.push(t);
    const self: Record<string, unknown> = {
      setScrollFactor: () => self,
      setDepth: () => self,
      setOrigin: () => self,
      setAlpha: () => self,
      setText: (c: string) => ((t.content = c), self),
      destroy: () => void (t.destroyed = true),
    };
    return self;
  };
  const scene = { add: { graphics, text } } as unknown as Phaser.Scene;
  const live = () => texts.filter((t) => !t.destroyed).map((t) => t.content);
  const liveFills = () =>
    allGraphics.filter((g) => !g.destroyed).flatMap((g) => g.fills);
  /** How many texts were ever made: each one a fresh canvas texture on a real scene. */
  const textsMade = () => texts.length;
  return { scene, live, liveFills, textsMade };
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

function setup(world: WorldType = "hub") {
  const scene = fakeScene();
  const store = createPartyStore({ selfId: () => ME });
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
  };
  const frames = new PartyFrames(scene.scene, deps);
  return { ...scene, store, frames, busts, resolved, state };
}

describe("PartyFrames", () => {
  it("draws nothing with no party", () => {
    const { frames, live, liveFills } = setup();
    expect(frames.rowCount()).toBe(0);
    expect(live()).toEqual([]);
    expect(liveFills()).toEqual([]);
  });

  it("draws one frame for a two-member party: the other member's", () => {
    const { store, frames, live } = setup();
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    expect(frames.rowCount()).toBe(1);
    expect(live()).toContain("Wren");
    expect(live()).not.toContain("Me");
  });

  it("cuts the bust from the member's own class sheet", () => {
    const { store, busts } = setup();
    store
      .getState()
      .apply(update([member(ME, "Me"), member("wren", "Wren", "mage")]));
    expect(busts).toEqual([
      { texture: "art:char_wizard_base", frame: "char_wizard_base/idle/1/0" },
    ]);
  });

  it("shows the state word in the bar slot when no health is on the wire", () => {
    const { store, live, liveFills } = setup();
    store.getState().apply(update([member(ME, "Me"), member("wren", "Wren")]));
    expect(live()).toContain("village");
    expect(liveFills()).not.toContain(palette.hudHealth);
  });

  it("draws the health and resource bars when the state carries them, and drops the word", () => {
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
    frames.show([seen]);
    expect(liveFills()).toContain(palette.hudHealth);
    expect(liveFills()).toContain(palette.hudMana);
    expect(live()).not.toContain("delving");
  });

  it("goes back to the word when the member drops out of the state", () => {
    const { store, frames, live, liveFills } = setup("run");
    store
      .getState()
      .apply(update([member(ME, "Me"), member("wren", "Wren", "mage", "run")]));
    frames.show([{ id: "wren", current_health: 60, max_health: 120 }]);
    frames.show([]);
    expect(live()).toContain("delving");
    expect(liveFills()).not.toContain(palette.hudHealth);
  });

  it("redraws only the bars when a tick moves a bar: the words are not made again", () => {
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
    frames.show([{ id: "wren", current_health: 60, max_health: 120 }]);
    expect(live()).toContain("away");
    const made = textsMade();

    frames.show([{ id: "wren", current_health: 61, max_health: 120 }]);
    frames.show([{ id: "wren", current_health: 62, max_health: 120 }]);

    expect(textsMade()).toBe(made);
    expect(live()).toContain("away");
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
    expect(frames.leaderRow()).toBe(0);
    store.getState().apply(update(members, "bram", "leader"));
    expect(frames.leaderRow()).toBe(1);
    store.getState().apply(update(members, ME, "leader"));
    expect(frames.leaderRow()).toBe(-1);
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
