import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { WorldType } from "@/assets/types/client";
import { createPartyStore, type PartyUpdatePayload } from "@/stores/partyStore";
import { PartyPanel, type PartyPanelDeps } from "./PartyPanel";
import type { PartyInviteFieldHandle } from "./partyInviteField";
import { PARTY_HINT, type FocusedElement } from "./partyPanelLayout";

// FS-R82NV §Requirements R28–R30. I-R82NV-6: the T panel as a scene draws it, on a recording
// stand-in for the Phaser scene.

interface FakeText {
  content: string;
  alpha: number;
  destroyed: boolean;
  interactive: boolean;
  onPress?: () => void;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const keyboard = new EventEmitter();
  const input = Object.assign(new EventEmitter(), { keyboard });
  const graphics = () => {
    const self: Record<string, unknown> = {};
    for (const m of [
      "setScrollFactor",
      "setDepth",
      "clear",
      "fillStyle",
      "lineStyle",
      "fillRect",
      "fillRoundedRect",
      "strokeRoundedRect",
      "lineBetween",
      "fillTriangle",
      "fillCircle",
    ])
      self[m] = () => self;
    self.destroy = () => undefined;
    return self;
  };
  const text = (_x: number, _y: number, content: string) => {
    const t: FakeText = {
      content,
      alpha: 1,
      destroyed: false,
      interactive: false,
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
        return self;
      },
      width: content.length * 7,
      height: 18,
      setPosition: () => self,
      destroy: () => void (t.destroyed = true),
    };
    return self;
  };
  const events = new EventEmitter();
  const scene = {
    events,
    input,
    add: { graphics, text },
  } as unknown as Phaser.Scene;
  const live = () => texts.filter((t) => !t.destroyed);
  const find = (content: string) => live().find((t) => t.content === content);
  return { scene, keyboard, events, input, live, find };
}

function fakeField() {
  const field = {
    value: "",
    enabled: true,
    shown: false,
    destroyed: false,
    submit: (_v: string) => undefined as void,
  };
  const handle: PartyInviteFieldHandle = {
    get value() {
      return field.value;
    },
    set value(v) {
      field.value = v;
    },
    setEnabled: (e) => void (field.enabled = e),
    moveTo: () => undefined,
    show: () => void (field.shown = true),
    hide: () => void (field.shown = false),
    blur: () => undefined,
    destroy: () => void (field.destroyed = true),
  };
  return { field, handle };
}

const ME = "me";
const ALLY = "ally";
const member = (player_id: string, name: string) => ({
  player_id,
  name,
  class: "archer",
  joined_at: "2026-11-01T05:00:00Z",
  where: "hub",
  online: true,
});
const update = (leader = ME): PartyUpdatePayload => ({
  party_id: "p",
  leader_id: leader,
  members: [member(ME, "Aldric"), member(ALLY, "Wren")],
  size: 4,
  reason: "joined",
  subject_id: ALLY,
});

function setup(
  opts: {
    world?: WorldType;
    active?: FocusedElement | null;
    blocked?: boolean;
  } = {},
) {
  const scene = fakeScene();
  const store = createPartyStore({ selfId: () => ME });
  const { field, handle } = fakeField();
  const state = {
    world: (opts.world ?? "hub") as WorldType,
    active: opts.active ?? null,
    blocked: opts.blocked ?? false,
  };
  const commands = {
    invite: vi.fn((name: string) => name.trim() !== ""),
    kick: vi.fn(),
    transfer: vi.fn(),
    leave: vi.fn(),
  };
  const deps: PartyPanelDeps = {
    store,
    world: () => state.world,
    selfId: () => ME,
    commands,
    makeField: (_scene, _rect, events) => {
      field.submit = events.submit;
      return handle;
    },
    activeElement: () => state.active,
    blocked: () => state.blocked,
  };
  const panel = new PartyPanel(scene.scene, deps);
  const pressT = () => scene.keyboard.emit("keydown-T");
  const frame = () => scene.events.emit("postupdate");
  return { ...scene, store, field, state, commands, panel, pressT, frame };
}

describe("PartyPanel (FS-R82NV R28: T toggles it)", () => {
  it.each(["hub", "field", "run"] as const)(
    "should open and close on T in the %s",
    (world) => {
      const env = setup({ world });
      expect(env.panel.isOpen()).toBe(false);
      env.pressT();
      expect(env.panel.isOpen()).toBe(true);
      expect(env.find("Party")).toBeDefined();
      env.pressT();
      expect(env.panel.isOpen()).toBe(false);
      expect(env.find("Party")).toBeUndefined();
    },
  );

  it("should ignore T while a text field has focus (typing in chat)", () => {
    const env = setup({ active: { tagName: "INPUT", type: "text" } });
    env.pressT();
    expect(env.panel.isOpen()).toBe(false);
  });

  it("should ignore T while something else owns the keys", () => {
    const env = setup({ blocked: true });
    env.pressT();
    expect(env.panel.isOpen()).toBe(false);
  });

  it("should stay open across scenes: a new panel on the same store opens as it was", () => {
    const env = setup();
    env.pressT();
    env.panel.destroy();
    const next = new PartyPanel(fakeScene().scene, {
      store: env.store,
      world: () => "field",
      selfId: () => ME,
      commands: env.commands,
      makeField: () => fakeField().handle,
      activeElement: () => null,
      blocked: () => false,
    });
    expect(next.isOpen()).toBe(true);
  });
});

describe("PartyPanel (FS-R82NV R29, R30: contents)", () => {
  it("should show a player in no party only the hint and the invite field", () => {
    const env = setup();
    env.pressT();
    expect(env.find(PARTY_HINT)).toBeDefined();
    expect(env.find("Invite")).toBeDefined();
    expect(env.find("Leave party")).toBeUndefined();
    expect(env.find("Kick")).toBeUndefined();
    env.frame();
    expect(env.field.shown).toBe(true);
    expect(env.field.enabled).toBe(true);
  });

  it("should reflect a party_update: names, class and where, the leader marked", () => {
    const env = setup();
    env.pressT();
    env.store.getState().apply(update(ALLY));
    expect(env.find("Party (2/4)")).toBeDefined();
    expect(env.find("Aldric")).toBeDefined();
    expect(env.find("Wren")).toBeDefined();
    expect(
      env.live().filter((t) => t.content === "Archer · village"),
    ).toHaveLength(2);
    expect(env.panel.leaderRow()).toBe(1);
    env.store.getState().apply(update(ME));
    expect(env.panel.leaderRow()).toBe(0);
  });

  it("should let the leader kick and transfer the other member", () => {
    const env = setup();
    env.store.getState().apply(update(ME));
    env.pressT();
    // one pair of buttons, on Wren's row only
    expect(env.live().filter((t) => t.content === "Kick")).toHaveLength(1);
    env.find("Kick")!.onPress?.();
    env.find("Transfer")!.onPress?.();
    expect(env.commands.kick).toHaveBeenCalledWith(ALLY);
    expect(env.commands.transfer).toHaveBeenCalledWith(ALLY);
  });

  it("should grey kick and transfer for a member, and send nothing on a press", () => {
    const env = setup();
    env.store.getState().apply(update(ALLY));
    env.pressT();
    const kick = env.find("Kick")!;
    expect(kick.interactive).toBe(false);
    expect(kick.alpha).toBeLessThan(1);
    kick.onPress?.();
    expect(env.commands.kick).not.toHaveBeenCalled();
    // leave is any member's
    env.find("Leave party")!.onPress?.();
    expect(env.commands.leave).toHaveBeenCalled();
  });

  it("should grey every action inside an instance", () => {
    const env = setup({ world: "run" });
    env.store.getState().apply(update(ME));
    env.pressT();
    for (const label of ["Kick", "Transfer", "Leave party"])
      expect(env.find(label)!.interactive).toBe(false);
    env.frame();
    expect(env.field.enabled).toBe(false);
  });
});

describe("PartyPanel (FS-R82NV R29: the invite field)", () => {
  it("should send party_invite on Enter and clear the field", () => {
    const env = setup();
    env.pressT();
    env.field.value = "Wren";
    env.field.submit("Wren");
    expect(env.commands.invite).toHaveBeenCalledWith("Wren");
    expect(env.field.value).toBe("");
  });

  it.each(["field", "run"] as const)(
    "should disable the field in the %s and send nothing",
    (world) => {
      const env = setup({ world });
      env.pressT();
      env.frame();
      expect(env.field.enabled).toBe(false);
      env.field.submit("Wren");
      expect(env.commands.invite).not.toHaveBeenCalled();
    },
  );

  it("should hide the field while the panel is shut or something else owns the keys", () => {
    const env = setup();
    env.frame();
    expect(env.field.shown).toBe(false);
    env.pressT();
    env.frame();
    expect(env.field.shown).toBe(true);
    env.state.blocked = true;
    env.frame();
    expect(env.field.shown).toBe(false);
  });

  it("should take its own field down on destroy and stop hearing T", () => {
    const env = setup();
    env.panel.destroy();
    expect(env.field.destroyed).toBe(true);
    env.pressT();
    expect(env.store.getState().panelOpen).toBe(false);
  });
});
