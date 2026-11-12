import { EventEmitter } from "eventemitter3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import type Phaser from "phaser";
import type { WorldType } from "@/assets/types/client";
import { createPartyStore, type PartyUpdatePayload } from "@/stores/partyStore";
import {
  PARTY_PANEL_DEPTH,
  PartyPanel,
  type PartyPanelDeps,
} from "./PartyPanel";
import { partyCommands } from "./partyCommands";
import { drawPanelFrame } from "./panelFrame";
import { GEAR_OVERLAY_DEPTH } from "./GearOverlay";
import { MENU_DEPTH } from "./menuPanel";

// The party panel's frame is one drawing, which this surface must call, not copy (owner
// 2026-11-12: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框"). I-3EBCA-6.
vi.mock("./panelFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("./panelFrame")>();
  return { ...real, drawPanelFrame: vi.fn(real.drawPanelFrame) };
});
import type { PartyInviteFieldHandle } from "./partyInviteField";
import {
  PARTY_HINT,
  PARTY_PANEL_W,
  partyPanelLeft,
  partyPanelTop,
  type FocusedElement,
} from "./partyPanelLayout";

// FS-R82NV §Requirements R28–R30. I-R82NV-6: the T panel as a scene draws it, on a recording
// stand-in for the Phaser scene.

interface FakeText {
  content: string;
  alpha: number;
  destroyed: boolean;
  interactive: boolean;
  onPress?: () => void;
  onOver?: () => void;
  colour?: string;
  at?: { x: number; y: number };
}

function fakeScene() {
  const texts: FakeText[] = [];
  /** Every depth the panel set on what it drew, in order. */
  const depths: number[] = [];
  const keyboard = new EventEmitter();
  const input = Object.assign(new EventEmitter(), { keyboard });
  const graphics = () => {
    const self: Record<string, unknown> = {};
    for (const m of [
      "setScrollFactor",
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
    self.setDepth = (d: number) => (depths.push(d), self);
    self.destroy = () => undefined;
    return self;
  };
  const text = (x: number, y: number, content: string) => {
    const t: FakeText = {
      at: { x, y },
      content,
      alpha: 1,
      destroyed: false,
      interactive: false,
    };
    texts.push(t);
    const self: Record<string, unknown> = {
      setScrollFactor: () => self,
      setDepth: (d: number) => (depths.push(d), self),
      setOrigin: () => self,
      setAlpha: (a: number) => ((t.alpha = a), self),
      setInteractive: () => ((t.interactive = true), self),
      on: (event: string, cb: () => void) => {
        if (event === "pointerdown") t.onPress = cb;
        if (event === "pointerover") t.onOver = cb;
        return self;
      },
      setColor: (c: string) => ((t.colour = c), self),
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
  return { scene, keyboard, events, input, live, find, depths };
}

function fakeField() {
  const field = {
    value: "",
    enabled: true,
    shown: false,
    destroyed: false,
    at: undefined as { x: number; y: number } | undefined,
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
    moveTo: (r) => void (field.at = r),
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
    commands?: PartyPanelDeps["commands"];
    opening?: () => void;
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
  const commands = opts.commands ?? {
    create: vi.fn(),
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
    opening: opts.opening,
  };
  const panel = new PartyPanel(scene.scene, deps);
  const pressT = () => scene.keyboard.emit("keydown-T");
  const frame = () => scene.events.emit("postupdate");
  return {
    ...scene,
    store,
    field,
    handle,
    state,
    commands,
    panel,
    pressT,
    frame,
  };
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
  it("should show a player in no party the hint, Create party and the invite field", () => {
    const env = setup();
    env.pressT();
    expect(env.find(PARTY_HINT)).toBeDefined();
    expect(env.find("Create party")).toBeDefined();
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

  it("should grey every roster action and the invite inside an instance (FS-NCC9J R23)", () => {
    const env = setup({ world: "run" });
    env.store.getState().apply(update(ME));
    env.pressT();
    for (const label of ["Kick", "Transfer", "Leave party", "Invite"]) {
      expect(env.find(label)!.interactive).toBe(false);
      expect(env.find(label)!.alpha).toBeLessThan(1);
    }
    env.frame();
    expect(env.field.enabled).toBe(false);
  });
});

describe("PartyPanel (FS-R82NV R30: Create party)", () => {
  it("should send party_create from Create party in the hub, with no party", () => {
    const env = setup();
    env.pressT();
    const create = env.find("Create party")!;
    expect(create.interactive).toBe(true);
    create.onPress?.();
    expect(env.commands.create).toHaveBeenCalledTimes(1);
  });

  it("should send party_create from Create party in a field too (FS-NCC9J R23)", () => {
    const env = setup({ world: "field" });
    env.pressT();
    const create = env.find("Create party")!;
    expect(create.interactive).toBe(true);
    create.onPress?.();
    expect(env.commands.create).toHaveBeenCalledTimes(1);
  });

  it("should grey Create party in a run, and send nothing on a press (FS-NCC9J R23)", () => {
    const env = setup({ world: "run" });
    env.pressT();
    const create = env.find("Create party")!;
    expect(create.interactive).toBe(false);
    expect(create.alpha).toBeLessThan(1);
    create.onPress?.();
    expect(env.commands.create).not.toHaveBeenCalled();
  });

  it("should grey Create party when the player walks into a run (FS-NCC9J R23)", () => {
    const env = setup();
    env.pressT();
    env.state.world = "run";
    env.frame();
    expect(env.find("Create party")!.interactive).toBe(false);
  });

  it("should keep Create party live when the player walks out of the hub (FS-NCC9J R23)", () => {
    const env = setup();
    env.pressT();
    env.state.world = "field";
    env.frame();
    expect(env.find("Create party")!.interactive).toBe(true);
  });

  it("should not show Create party in a party", () => {
    const env = setup();
    env.store.getState().apply(update(ME));
    env.pressT();
    expect(env.find("Create party")).toBeUndefined();
  });
});

describe("PartyPanel (FS-R82NV R29: the Invite button)", () => {
  function withSocket(world: WorldType = "hub") {
    const sent: [string, unknown][] = [];
    const commands = partyCommands({
      sendMessage: (action, payload) => void sent.push([action, payload]),
    });
    return { sent, env: setup({ world, commands }) };
  }

  it("should send exactly what Enter sends, and clear the field", () => {
    const enter = withSocket();
    enter.env.pressT();
    enter.env.field.value = "  Wren ";
    enter.env.field.submit(enter.env.field.value);

    const button = withSocket();
    button.env.pressT();
    button.env.field.value = "  Wren ";
    const invite = button.env.find("Invite")!;
    expect(invite.interactive).toBe(true);
    invite.onPress?.();

    expect(button.sent).toEqual([["party_invite", { name: "Wren" }]]);
    expect(button.sent).toEqual(enter.sent);
    expect(button.env.field.value).toBe("");
  });

  it("should send nothing for a blank field", () => {
    const { sent, env } = withSocket();
    env.pressT();
    env.field.value = "   ";
    env.find("Invite")!.onPress?.();
    expect(sent).toEqual([]);
  });

  it("should send party_invite from the Invite button in a field too (FS-NCC9J R23)", () => {
    const { sent, env } = withSocket("field");
    env.pressT();
    env.field.value = "Wren";
    const invite = env.find("Invite")!;
    expect(invite.interactive).toBe(true);
    invite.onPress?.();
    expect(sent).toEqual([["party_invite", { name: "Wren" }]]);
  });

  it("should grey the Invite button in a run, and send nothing on a press (FS-NCC9J R23)", () => {
    const { sent, env } = withSocket("run");
    env.pressT();
    env.field.value = "Wren";
    const invite = env.find("Invite")!;
    expect(invite.interactive).toBe(false);
    invite.onPress?.();
    expect(sent).toEqual([]);
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

  it("should send party_invite on Enter in a field too (FS-NCC9J R23)", () => {
    const env = setup({ world: "field" });
    env.pressT();
    env.frame();
    expect(env.field.enabled).toBe(true);
    env.field.submit("Wren");
    expect(env.commands.invite).toHaveBeenCalledWith("Wren");
  });

  it("should disable the field in a run, for a player in no party, and send nothing (FS-NCC9J R23)", () => {
    const env = setup({ world: "run" });
    env.pressT();
    env.frame();
    expect(env.field.enabled).toBe(false);
    env.field.submit("Wren");
    expect(env.commands.invite).not.toHaveBeenCalled();
  });

  it("should disable the field for a member who does not lead, and send nothing", () => {
    const env = setup({ world: "field" });
    env.store.getState().apply(update(ALLY));
    env.pressT();
    env.frame();
    expect(env.field.enabled).toBe(false);
    env.field.submit("Osric");
    expect(env.commands.invite).not.toHaveBeenCalled();
  });

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

describe("PartyPanel at a render scale (FS-ZAJMH R15: Phaser's pointer.x/y are backing px)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1.5, 2])(
    "should keep the invite field focused on a press on the open panel at render scale %s, and let go off it",
    (rs) => {
      viewport.set({ width: 1080, height: 720, renderScale: rs });
      const env = setup();
      const blur = vi.fn();
      env.handle.blur = blur;
      env.pressT();
      // near the panel's right edge: its backing px, read as logical units, lie past it
      const left = partyPanelLeft(1080);
      const top = partyPanelTop(720);
      const onPanel = {
        x: left + PARTY_PANEL_W - 10,
        y: top + 20,
      };
      expect(env.panel.covers(onPanel.x, onPanel.y)).toBe(true);
      expect(env.panel.covers(onPanel.x * rs, onPanel.y * rs)).toBe(false);
      env.input.emit("pointerdown", { x: onPanel.x * rs, y: onPanel.y * rs });
      expect(blur).not.toHaveBeenCalled();
      // above and left of the centred panel: its backing px, read as logical units, lie on it
      const offPanel = { x: left - 90, y: top - 30 };
      expect(env.panel.covers(offPanel.x * rs, offPanel.y * rs)).toBe(true);
      env.input.emit("pointerdown", { x: offPanel.x * rs, y: offPanel.y * rs });
      expect(blur).toHaveBeenCalledTimes(1);
    },
  );
});

// FS-R82NV § Change: The party panel closes on its × and stands nearer the middle. I-R82NV-13.
describe("PartyPanel (FS-R82NV § Change C1: the × closes it)", () => {
  it("should draw an amber × at the panel's top right, and close the panel on a press", () => {
    const env = setup();
    env.pressT();
    const x = env.find("×")!;
    expect(x.interactive).toBe(true);
    expect(x.at).toEqual({ x: partyPanelLeft(1080) + 300 - 12 - 12, y: partyPanelTop(720) + 12 + 12 });
    x.onPress?.();
    expect(env.panel.isOpen()).toBe(false);
    expect(env.find("×")).toBeUndefined();
  });

  it("should brighten the × under the pointer", () => {
    const env = setup();
    env.pressT();
    const x = env.find("×")!;
    const before = x.colour;
    x.onOver?.();
    expect(x.colour).toBeDefined();
    expect(x.colour).not.toBe(before);
  });
});

describe("PartyPanel (FS-R82NV § Change C2: Esc closes it; FS-3EBCA R8: the Party icon toggles it)", () => {
  it("should report whether close() closed anything", () => {
    const env = setup();
    expect(env.panel.close()).toBe(false);
    env.pressT();
    expect(env.panel.close()).toBe(true);
    expect(env.panel.isOpen()).toBe(false);
  });

  it("should toggle on toggle() unless something else owns the screen, a focused text field or not", () => {
    const env = setup({ active: { tagName: "INPUT", type: "text" } });
    env.panel.toggle();
    expect(env.panel.isOpen()).toBe(true);
    env.panel.toggle();
    expect(env.panel.isOpen()).toBe(false);
    env.state.blocked = true;
    env.panel.toggle();
    expect(env.panel.isOpen()).toBe(false);
  });
});

describe("PartyPanel (FS-R82NV § Change C3–C5: centred, following the view)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should move the open panel and its invite field when the view widens", () => {
    const env = setup();
    env.pressT();
    expect(env.panel.covers(partyPanelLeft(1080) + 5, partyPanelTop(720) + 5)).toBe(true);
    const fieldAt = env.field.at!.x;
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.panel.relayout();
    expect(env.panel.covers(partyPanelLeft(1280) + 5, partyPanelTop(720) + 5)).toBe(true);
    expect(env.panel.covers(partyPanelLeft(1080) + 5, partyPanelTop(720) + 5)).toBe(false);
    expect(env.field.at!.x).toBe(fieldAt + 100);
    expect(env.find("×")!.at!.x).toBe(partyPanelLeft(1280) + 300 - 24);
  });
});

describe("PartyPanel's frame, shared (FS-R82NV § Change C1; FS-G4VMQ § Change C1)", () => {
  it("should draw its panel with the one frame drawing the menu and the gear overlay use", () => {
    const frame = vi.mocked(drawPanelFrame);
    frame.mockClear();
    const env = setup();
    env.pressT();
    expect(frame).toHaveBeenCalled();
    const [, , panel] = frame.mock.calls.at(-1)!;
    expect(panel.x).toBe(partyPanelLeft(1080));
    expect(panel.y).toBe(partyPanelTop(720));
    expect(panel.width).toBe(PARTY_PANEL_W);
  });
});

// FS-3EBCA R8 and FS-R82NV § Change C2, C8 (owner 2026-11-12: "開道具欄跟角色欄時開不了隊伍"): the
// party panel opens over the inventory and the character panel and is drawn above them.
describe("PartyPanel over the inventory and the character panel (FS-3EBCA R8; FS-R82NV § Change C8)", () => {
  it("should draw everything of the open panel above the gear overlay's panels and their ×, under the menu", () => {
    const env = setup({ world: "field" });
    env.store.getState().apply(update(ME));
    env.depths.length = 0;
    env.pressT();
    // the graphics and every text it drew
    expect(env.depths.length).toBeGreaterThanOrEqual(env.live().length + 1);
    // the overlay draws its panels at GEAR_OVERLAY_DEPTH and up to + 3 (the × zones)
    for (const d of env.depths) {
      expect(d).toBe(PARTY_PANEL_DEPTH);
    }
    expect(PARTY_PANEL_DEPTH).toBeGreaterThan(GEAR_OVERLAY_DEPTH + 3);
    expect(PARTY_PANEL_DEPTH).toBeLessThan(MENU_DEPTH);
  });

  it("should show the invite field, and still keep T a letter while it holds focus", () => {
    // the scene's rule no longer names the overlay: an open overlay leaves `blocked` false
    const env = setup({ world: "field" });
    env.pressT();
    env.frame();
    expect(env.field.shown).toBe(true);
    env.state.active = { tagName: "INPUT", type: "text" };
    env.pressT();
    expect(env.panel.isOpen()).toBe(true);
  });
});

// The owner, 2026-11-12: "開其他視窗時信箱會被關閉": opening the party panel closes the letter panel
// first (FS-R82NV § Change C9; FS-3EBCA R16). The panel asks its scene through `opening`.
describe("PartyPanel clears the letter panel as it opens (FS-R82NV § Change C9)", () => {
  it("should call `opening` before T or the Party icon opens it, never on a close or a refusal", () => {
    const opening = vi.fn();
    const env = setup({ opening });
    const openAt: boolean[] = [];
    opening.mockImplementation(() => openAt.push(env.panel.isOpen()));
    env.pressT();
    expect(env.panel.isOpen()).toBe(true);
    expect(openAt).toEqual([false]);
    env.pressT();
    env.panel.toggle();
    expect(openAt).toEqual([false, false]);
    env.panel.toggle();
    expect(opening).toHaveBeenCalledTimes(2);
    env.state.blocked = true;
    env.pressT();
    env.panel.toggle();
    env.state.blocked = false;
    env.state.active = { tagName: "INPUT", type: "text" };
    env.pressT();
    expect(opening).toHaveBeenCalledTimes(2);
    expect(env.panel.isOpen()).toBe(false);
  });
});
