import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";

/** Phaser's scene events are an eventemitter3 emitter: `once(event, fn, context)`. */
interface Emitter {
  emit(event: string): boolean;
}

/** A keyboard key as the scene polls it: held, or pressed since the last poll. */
interface FakeKey {
  isDown: boolean;
  justDown: boolean;
}

// Only the hub's chrome and keyboard are under test: a Phaser stand-in with the scene base class,
// the key poll and the geometry the dialogue options are built with.
vi.mock("phaser", async () => {
  const { EventEmitter } = await import("eventemitter3");
  class Scene {
    events = new EventEmitter();
    constructor(_config: unknown) {}
  }
  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
    static Contains(): boolean {
      return true;
    }
  }
  const phaser = {
    Scene,
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
    BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
    Geom: { Rectangle },
    Input: {
      Keyboard: {
        // Phaser's JustDown: true once per press, and reading it clears the press
        JustDown: (key: FakeKey) => {
          const pressed = key.justDown;
          key.justDown = false;
          return pressed;
        },
        KeyCodes: {},
      },
    },
    Math: {
      Linear: (a: number, b: number, t: number) => a + (b - a) * t,
      Distance: {
        Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1),
      },
    },
  };
  return { ...phaser, default: phaser };
});

// The interiors' drawing is watched through these, called through to the real helpers: which walls
// go to the wall pieces, which props stand where, and which footprints get a placeholder block.
vi.mock("@/render/world", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/render/world")>();
  return {
    ...real,
    addWalls: vi.fn(real.addWalls),
    addBuildings: vi.fn(real.addBuildings),
    addProp: vi.fn(real.addProp),
  };
});
vi.mock("@/render/iso", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/render/iso")>();
  return { ...real, addUprightBlock: vi.fn(real.addUprightBlock) };
});

// The camera's fit, bounds and follow under the render scale are the viewport's (camera.test.ts);
// here the stub camera only records what it was asked to follow.
vi.mock("@/render/viewport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/render/viewport")>()),
  boundCamera: () => {},
  followWith: (cam: { startFollow(target: unknown): void }, target: unknown) => cam.startFollow(target),
}));
const { HubScene, delveChoices, hubMenuChoices, ELDER_TALE } = await import("./HubScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ActionType } = await import("@/assets/types/client");
const { palette, rgba, toCss } = await import("@/utils/canvasPalette");
const { BARROW_HEX } = await import("@/utils/theme");
const { usePartyStore } = await import("@/stores/partyStore");
const { useAuthStore } = await import("@/stores/authStore");
const { useMailboxStore } = await import("@/stores/mailboxStore");
const { MARKER_DEPTH } = await import("@/render/markers");
const { HUB_STASH_CHEST, STASH_NAME } = await import("@/render/world/hubStash");
const { HUB_TOWN_GOLDEN } = await import("@/render/world/hubTownGolden");
const { townOutline } = await import("@/render/world/hubTown.fixture");
const interiors = await import("@/render/world/hubInteriors");
const walls_ = await import("@/render/world/walls");
const { sceneSystems } = await import("./sceneEnd.standin");
const { EventEmitter } = await import("eventemitter3");
const { PartyPanel } = await import("@/ui/PartyPanel");
const { createPartyStore } = await import("@/stores/partyStore");
const { cornerIconFrame } = await import("@/ui/hudCornerLayout");

interface QueuePanelScene {
  queuePanel?: { active: boolean; setText(text: string): unknown };
  add: { text: (...args: unknown[]) => unknown };
  cameras: { main: { height: number; width?: number } };
  showQueueProgress(current: number, total: number): void;
}

interface FakeText {
  active: boolean;
  x: number;
  y: number;
  width: number;
  setText(text: string): FakeText;
  setScrollFactor(): FakeText;
  setDepth(): FakeText;
  setInteractive(): FakeText;
  setPosition(): FakeText;
  setVisible(): FakeText;
  setColor(): FakeText;
  setOrigin(x: number, y: number): FakeText;
  on(): FakeText;
}

function fakeText(): FakeText {
  const text: FakeText = {
    active: true,
    x: 24,
    y: 556,
    width: 160,
    setText: vi.fn((_text: string) => text),
    setScrollFactor: () => text,
    setDepth: () => text,
    setInteractive: () => text,
    setPosition: () => text,
    setVisible: () => text,
    setColor: () => text,
    setOrigin: vi.fn((_x: number, _y: number) => text),
    on: () => text,
  };
  return text;
}

describe("HubScene queue panel (FS-29KSH §Requirements 25, 27)", () => {
  // Phaser reuses the scene instance when the player comes home from a run. The
  // panel from the first visit was destroyed with that visit, and writing to it
  // shows nothing: the second queue looked like it never started.
  it("should show queue progress on a live panel after the hub was left and re-entered", () => {
    const hub = new HubScene() as unknown as QueuePanelScene;
    const stale = { active: false, setText: vi.fn() };
    const made: FakeText[] = [];
    hub.queuePanel = stale;
    hub.add = {
      text: vi.fn(() => {
        const text = fakeText();
        made.push(text);
        return text;
      }),
    };
    hub.cameras = { main: { height: 600 } };

    hub.showQueueProgress(1, 2);

    expect(stale.setText).not.toHaveBeenCalled();
    expect(hub.queuePanel).toBe(made[0]);
  });

  it("should reuse the panel while it is still on screen", () => {
    const hub = new HubScene() as unknown as QueuePanelScene;
    const live = fakeText();
    hub.queuePanel = live;
    hub.add = { text: vi.fn(() => fakeText()) };
    hub.cameras = { main: { height: 600 } };

    hub.showQueueProgress(2, 2);

    expect(hub.queuePanel).toBe(live);
    expect(live.setText).toHaveBeenCalledWith("Gathering the delve  2/2");
  });

  // At the bottom left it sat under the chat window (FS-WJGFJ): it moved to the top centre, on no
  // ground of its own, an outline keeping it legible over the town. Asked by the user 2026-10-31.
  it("should sit at the top centre with no background", () => {
    const hub = new HubScene() as unknown as QueuePanelScene;
    const made = fakeText();
    const add = vi.fn((..._args: unknown[]) => made);
    hub.add = { text: add };
    hub.cameras = { main: { height: 720, width: 1080 } };

    hub.showQueueProgress(1, 4);

    const [x, y, , style] = add.mock.calls[0] as [number, number, string, Record<string, unknown>];
    expect(x).toBe(540);
    expect(y).toBeLessThan(72);
    expect(made.setOrigin).toHaveBeenCalledWith(0.5, 0);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.stroke).toBeDefined();
  });
});

describe("hubMenuChoices (FS-G4VMQ §Requirements 3)", () => {
  it("should offer changing character and going back when not queued", () => {
    expect(hubMenuChoices({ queued: false }).map((c) => c.id)).toEqual(["change", "back"]);
  });

  it("should offer leaving the queue between them while queued", () => {
    expect(hubMenuChoices({ queued: true }).map((c) => c.id)).toEqual(["change", "leave", "back"]);
  });
});

/** A scene object as the stand-in stage made it: what kind, with what, and whether it is gone. */
interface Made {
  kind: string;
  args: unknown[];
  destroyed: boolean;
  active: boolean;
  visible: boolean;
  name?: string;
  depth?: number;
  /** The colour a text was last set to; its style's colour until then. */
  color?: string;
  /** The tint a sprite was last given. */
  tint?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  children: Made[];
  /** What a text was last rasterised again at (`setResolution`); undefined while never. */
  resolution?: number;
  /** The pointer handlers it was given, by event, as Phaser would call them. */
  handlers: Record<string, (pointer?: { x: number; y: number }) => void>;
}

/**
 * A stand-in for the slice of Phaser the hub's chrome draws with: every object it makes is
 * recorded by kind and answers any call, and destroying a container destroys what it holds.
 */
function recordingStage() {
  const made: Made[] = [];
  const make = (kind: string, args: unknown[] = []): unknown => {
    const self = {
      kind,
      args,
      destroyed: false,
      active: true,
      visible: true,
      x: typeof args[0] === "number" ? args[0] : 0,
      y: typeof args[1] === "number" ? args[1] : 0,
      width: 160,
      height: 32,
      children: [] as Made[],
      handlers: {} as Record<string, () => void>,
    } as Made & { [k: string]: unknown };
    if (kind === "container" && Array.isArray(args[2])) self.children.push(...(args[2] as Made[]));
    const kill = (m: Made) => {
      if (m.destroyed) return;
      m.destroyed = true;
      m.active = false;
      m.children.forEach(kill);
      // what was hung on the object's destroy goes with it, as in Phaser
      (m.handlers as Record<string, (() => void) | undefined>).destroy?.();
    };
    const proxy: unknown = new Proxy(self, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === "then") return undefined;
        if (prop === "destroy") return () => kill(target);
        if (prop === "setDepth")
          return (depth: number) => {
            target.depth = depth;
            return proxy;
          };
        if (prop === "setVisible")
          return (visible: boolean) => {
            target.visible = visible;
            return proxy;
          };
        if (prop === "setText")
          return (content: unknown) => {
            target.args[2] = content;
            return proxy;
          };
        if (prop === "setName")
          return (name: string) => {
            target.name = name;
            return proxy;
          };
        if (prop === "setScrollFactor")
          return (factor: number) => {
            target.scrollFactor = factor;
            return proxy;
          };
        if (prop === "setColor")
          return (color: string) => {
            target.color = color;
            return proxy;
          };
        // moved, as Phaser moves it: a re-layout reads back where it went (FS-ZAJMH R13)
        if (prop === "setPosition")
          return (x: number, y: number) => {
            target.x = x;
            target.y = y;
            return proxy;
          };
        if (prop === "setX")
          return (x: number) => {
            target.x = x;
            return proxy;
          };
        if (prop === "setResolution")
          return (resolution: number) => {
            target.resolution = resolution;
            return proxy;
          };
        if (prop === "setTint")
          return (tint: number) => {
            target.tint = tint;
            return proxy;
          };
        // Phaser 4's mask filter (`maskInView`): what the object is masked by
        if (prop === "filters")
          return {
            external: {
              addMask: (source: unknown) => {
                target.maskedBy = source;
                return { setGameObject: (next: unknown) => void (target.maskedBy = next), invert: false };
              },
            },
          };
        if (prop === "getByName")
          return (name: string) => target.children.find((c) => c.name === name) ?? null;
        if (prop === "on" || prop === "once")
          return (event: string, fn: () => void) => {
            target.handlers[event] = fn;
            return proxy;
          };
        return () => proxy;
      },
    });
    // the proxy, so what a test finds here is what the scene holds
    made.push(proxy as Made);
    return proxy;
  };
  const add = new Proxy({}, { get: (_, kind) => (...args: unknown[]) => make(String(kind), args) });
  return { made, add };
}

const key = (): FakeKey => ({ isDown: false, justDown: false });

/** Where a press on the queue's Leave lands, as Phaser hands its pointer to the handler. */
const AT_LEAVE = { x: 200, y: 556 };

/** The hub's gear overlay as the scene drives it (FS-HRH2J §E): open or not, and what it was handed. */
function fakeGear() {
  const state = { open: false, stash: false, character: false };
  return {
    /** The character panel (FS-HRH2J § Change C1). */
    get character() {
      return state.character;
    },
    toggleCharacter: vi.fn(() => {
      if (state.stash) return false;
      state.character = !state.character;
      return state.character;
    }),
    get open() {
      return state.open;
    },
    set open(open: boolean) {
      state.open = open;
    },
    toggle: vi.fn(() => {
      state.open = !state.open;
      state.stash = false;
    }),
    hide: vi.fn(() => {
      const was = state.open || state.character;
      state.open = false;
      state.character = false;
      state.stash = false;
      return was;
    }),
    isOpen: () => state.open || state.character,
    /** Opened at the stash chest (FS-VPD8Y R34): only from closed. */
    openStash: vi.fn(() => {
      if (state.open) return false;
      state.character = false;
      state.open = true;
      state.stash = true;
      return true;
    }),
    stashOpen: () => state.open && state.stash,
    /** While open, the panels are over the screen's left half, where the queue's Leave sits. */
    covers: vi.fn((x: number) => state.open && x < 400),
    equipKey: vi.fn(() => state.open),
    updateCharacter: vi.fn(),
    setCharacterLevel: vi.fn(),
  };
}

/** The hub as the keyboard and the queue reach it. */
interface MenuHub {
  events: Emitter;
  menu?: Made;
  dialogue?: unknown;
  dialogueChoices?: { confirm(): void; dismiss(): void };
  dismissKey?: FakeKey;
  interactKey?: FakeKey;
  confirmKey?: FakeKey;
  choiceKeys?: FakeKey[];
  keepCameraOn(sprite: unknown): void;
  cameras: { main: { width: number; height: number; startFollow: ReturnType<typeof vi.fn> } };
  cursors: Record<"up" | "down" | "left" | "right", FakeKey>;
  wasd: Record<"up" | "down" | "left" | "right", FakeKey>;
  queuePanel?: Made;
  leaveButton?: Made;
  queued: boolean;
  leavePending: boolean;
  soloPending: boolean;
  enterPending: boolean;
  leavingHub: boolean;
  scene: { start: ReturnType<typeof vi.fn> };
  time: { delayedCall: ReturnType<typeof vi.fn> };
  selfEntityID?: string;
  views: Map<string, unknown>;
  npcs: Map<string, unknown>;
  update(time: number, delta: number): void;
  offerConversation(): void;
  followGates(pos: { x: number; y: number }, gates: unknown[]): void;
  onFieldGate(destination: "forest" | "meadows" | "dev_test_room"): void;
  renderState(state: unknown): void;
  listenForQueue(): void;
  release(end: "shutdown" | "destroy"): void;
}

type Listener = (payload: unknown) => void;

/** The hub with its queue subscriptions up, and the server's replies as the socket would hand them over. */
function queuedHubOnStage() {
  const stage = hubOnStage();
  const listeners = new Map<string, Listener>();
  const errorListeners = new Map<string, Listener>();
  vi.spyOn(socketManager, "on").mockImplementation((action, cb) => {
    listeners.set(action, cb);
  });
  vi.spyOn(socketManager, "onError").mockImplementation((action, cb) => {
    errorListeners.set(action, cb as Listener);
  });
  const off = vi.spyOn(socketManager, "off").mockImplementation(() => {});
  const offError = vi.spyOn(socketManager, "offError").mockImplementation(() => {});
  const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
  // a visit under way: its first frame, which says the body stands still, is behind it
  stage.hub.update(0, 16);
  send.mockClear();
  stage.hub.listenForQueue();
  const reply = (action: string, payload: unknown = {}) => listeners.get(action)?.(payload);
  const refuse = (action: string, message: string, reason?: string) =>
    errorListeners.get(action)?.({ action, error: message, message, reason });
  const button = () => stage.stage.made.find((m) => m.kind === "text" && m.args[2] === "Leave" && !m.destroyed);
  return { ...stage, listeners, reply, refuse, button, send, off, offError };
}

describe("HubScene queue flag and Leave button (FS-G4VMQ §Requirements 11, 15, 16, 19)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should start not queued, and be queued after any queue_status", () => {
    const { hub, reply } = queuedHubOnStage();
    expect(hub.queued).toBe(false);

    reply("queue_status", { current: 1, total: 2 });

    expect(hub.queued).toBe(true);
  });

  it("should be queued after a find_game reply without error", () => {
    const { hub, reply } = queuedHubOnStage();

    reply("find_game", { message: "Successfully joined matchmaking queue" });

    expect(hub.queued).toBe(true);
  });

  // The panel is centred at the top with no ground of its own (asked 2026-10-31, it sat under the
  // chat window): Leave follows it at its right edge, centred on it, the same size, still amber.
  it("should raise an amber Leave button just past the centred panel's right edge, centred on it", () => {
    const { hub, reply, button } = queuedHubOnStage();
    expect(button()).toBeUndefined();

    reply("queue_status", { current: 1, total: 2 });

    const panel = hub.queuePanel as Made;
    const leave = button() as Made;
    expect(leave).toBeDefined();
    expect(leave.depth).toBe(1000);
    expect(leave.x).toBeGreaterThan(panel.x + panel.width / 2);
    expect(leave.y).toBe(panel.y + panel.height / 2);
    const style = leave.args[3] as { color: string; fontSize: string; backgroundColor: string };
    const panelStyle = panel.args[3] as { color: string; fontSize: string };
    expect(style.color).toBe(toCss(BARROW_HEX.amber));
    // see-through like the chat window's panel, not a solid block (asked 2026-10-31)
    expect(style.backgroundColor).toBe(rgba(palette.chatPanel, 0.85));
    expect(style.fontSize).toBe(panelStyle.fontSize);
    expect(hub.leaveButton).toBe(leave);
  });

  it.each([1, 2])(
    "should centre the queue panel, its Leave and the open ESC menu again when the view widens, at render scale %s (FS-ZAJMH R12, R13)",
    (renderScale) => {
      const { hub, keys, press, option, reply } = queuedHubOnStage();
      const relayout = () => (hub as unknown as { relayoutHud(): void }).relayoutHud();
      Object.assign(hub, { invitePrompt: undefined, readyCheck: undefined, mailbox: undefined });
      viewport.set({ width: 1080, height: 720, renderScale });
      reply("queue_status", { current: 1, total: 2 });
      press(keys.esc);
      const panel = hub.queuePanel as Made;
      const leave = hub.leaveButton as Made;
      const menu = hub.menu as Made;
      const hit = option("leave") as Made;
      expect([panel.x, menu.x]).toEqual([540, 540]);
      const leaveOffset = leave.x - panel.x;
      const hitOffset = hit.x - menu.x;

      viewport.set({ width: 1280, height: 720, renderScale });
      relayout();
      expect(panel.x).toBe(640);
      expect(leave.x - panel.x).toBe(leaveOffset);
      // moved, so rasterised again at the render scale of now (R5)
      expect(panel.resolution).toBe(renderScale);
      expect(leave.resolution).toBe(renderScale);
      expect(menu.x).toBe(640);
      expect(option("leave")!.x - menu.x).toBe(hitOffset);
      viewport.set({ width: 1080, height: 720, renderScale: 1 });
    },
  );

  it("should show Leave the queue in the ESC menu while queued", () => {
    const { hub, keys, press, option, reply } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });

    press(keys.esc);

    expect(option("leave")).toBeDefined();
    expect(hub.menu?.depth).toBe(2000);
  });

  it("should hide the button while joining the delve, and drop it with the queue when the join fails", () => {
    const { hub, reply, button } = queuedHubOnStage();
    reply("queue_status", { current: 2, total: 2 });
    const leave = button() as Made;

    reply("world_handoff", { addr: "ws://elsewhere", session_id: "run" });
    expect(leave.visible).toBe(false);
    expect(hub.queued).toBe(true);

    reply("world_handoff_failed", { session_id: "run", code: 4002 });
    expect(hub.queued).toBe(false);
    expect(hub.leaveButton).toBeUndefined();
    expect(leave.destroyed).toBe(true);
    expect((hub.queuePanel as Made).args[2]).toBe("The delve could not be joined.");
  });

  it("should forget the button and the flags on release, and build a fresh button on the next visit", () => {
    const { hub, reply, button } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });
    const first = button() as Made;

    hub.release("shutdown");
    expect(hub.queued).toBe(false);
    expect(hub.leaveButton).toBeUndefined();

    // Phaser destroyed the first visit's display list with the scene
    first.active = false;
    reply("queue_status", { current: 1, total: 2 });
    expect(hub.leaveButton).toBeDefined();
    expect(hub.leaveButton).not.toBe(first);
  });
});

describe("HubScene leaveQueue (FS-G4VMQ §Requirements 12–14, 17, 19)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send leave_queue once from either entry, and nothing more while the reply is pending", () => {
    const { hub, keys, press, option, reply, button, send } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });

    button()?.handlers.pointerup(AT_LEAVE);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.LeaveQueue, {});
    expect(hub.leavePending).toBe(true);

    button()?.handlers.pointerup(AT_LEAVE);
    press(keys.esc);
    option("leave")?.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should not leave from a press on Leave through the open gear overlay's panel (FS-HRH2J R8)", () => {
    const { hub, gear, reply, button, send } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });
    const leave = button() as Made;
    gear.open = true;
    // Leave moved to the top centre (2026-10-31); this overlay's panel is over it there
    gear.covers.mockImplementation((x: number) => gear.isOpen() && x >= leave.x);

    leave.handlers.pointerup({ x: leave.x, y: leave.y });

    expect(gear.covers).toHaveBeenCalledWith(leave.x, leave.y);
    expect(send).not.toHaveBeenCalled();
    expect(hub.leavePending).toBe(false);

    // closed, the same press leaves
    gear.open = false;
    leave.handlers.pointerup({ x: leave.x, y: leave.y });
    expect(send).toHaveBeenCalledWith(ActionType.LeaveQueue, {});
  });

  it("should take the panel and button down, clear the flags and close the menu on the success reply", () => {
    const { hub, keys, press, option, reply, button } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });
    const panel = hub.queuePanel as Made;
    const leave = button() as Made;
    press(keys.esc);
    option("leave")?.handlers.pointerup();

    reply("leave_queue", { message: "Left the queue", player_id: "p1" });

    expect(panel.destroyed).toBe(true);
    expect(hub.queuePanel).toBeUndefined();
    expect(leave.destroyed).toBe(true);
    expect(hub.leaveButton).toBeUndefined();
    expect(hub.queued).toBe(false);
    expect(hub.leavePending).toBe(false);
    expect(hub.menu).toBeUndefined();

    // the next menu is a fresh one with two choices
    press(keys.esc);
    expect(option("change")).toBeDefined();
    expect(option("leave")).toBeUndefined();
  });

  it("should keep everything and pass on the server's message on the error reply, then send again", () => {
    const { hub, stage, reply, refuse, button, send } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });
    button()?.handlers.pointerup(AT_LEAVE);

    refuse("leave_queue", "Could not leave the queue, please try again.");

    expect(hub.queued).toBe(true);
    expect(hub.leavePending).toBe(false);
    expect((hub.queuePanel as Made).destroyed).toBe(false);
    expect(button()).toBeDefined();
    const notice = stage.made.find(
      (m) => m.kind === "text" && m.args[2] === "Could not leave the queue, please try again.",
    ) as Made;
    expect(notice).toBeDefined();
    expect(notice.depth).toBe(1000);
    expect((notice.args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.vellum));
    // passing: it goes on its own
    expect(hub.time.delayedCall).toHaveBeenCalledTimes(1);
    (hub.time.delayedCall.mock.calls[0][1] as () => void)();
    expect(notice.destroyed).toBe(true);

    button()?.handlers.pointerup(AT_LEAVE);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should let a reply that arrives after the join already failed change nothing", () => {
    const { hub, stage, reply, refuse, button } = queuedHubOnStage();
    reply("queue_status", { current: 2, total: 2 });
    button()?.handlers.pointerup(AT_LEAVE);
    reply("world_handoff_failed", { session_id: "run", code: 4002 });
    const panel = hub.queuePanel as Made;
    const drawn = stage.made.length;

    reply("leave_queue", { message: "Left the queue", player_id: "p1" });
    refuse("leave_queue", "Could not leave the queue, please try again.");

    expect(hub.queuePanel).toBe(panel);
    expect(panel.destroyed).toBe(false);
    expect(panel.args[2]).toBe("The delve could not be joined.");
    expect(stage.made.length).toBe(drawn);
  });

  it("should hand the leave_queue replies back on release, with the queue's other listeners", () => {
    const { hub, off, offError } = queuedHubOnStage();

    hub.release("shutdown");

    expect(off).toHaveBeenCalledWith("leave_queue");
    expect(offError).toHaveBeenCalledWith("leave_queue");
    expect(off).toHaveBeenCalledWith("find_game");
    expect(off).toHaveBeenCalledWith("queue_status");
  });
});

function hubOnStage() {
  const hub = new HubScene() as unknown as MenuHub & Record<string, unknown>;
  const stage = recordingStage();
  const keys = {
    esc: key(),
    e: key(),
    enter: key(),
    w: key(),
    one: key(),
    two: key(),
    three: key(),
    i: key(),
    b: key(),
    c: key(),
  };
  const gear = fakeGear();
  hub.add = stage.add;
  hub.gear = gear;
  hub.gearKeys = [keys.i, keys.b];
  hub.characterKey = keys.c;
  hub.choiceKeys = [keys.one, keys.two, keys.three];
  hub.cameras = { main: { width: 800, height: 600, startFollow: vi.fn() } };
  hub.scene = { start: vi.fn() };
  hub.time = { delayedCall: vi.fn() };
  hub.input = { setDefaultCursor: vi.fn() };
  hub.dismissKey = keys.esc;
  hub.interactKey = keys.e;
  hub.confirmKey = keys.enter;
  hub.cursors = { up: key(), down: key(), left: key(), right: key() };
  hub.wasd = { up: keys.w, down: key(), left: key(), right: key() };
  const press = (k: FakeKey) => {
    k.justDown = true;
    hub.update(0, 16);
  };
  const option = (id: string) => stage.made.find((m) => m.name === `menu-${id}` && !m.destroyed);
  /** A drawn dialogue choice, by id, while its dialogue is up. */
  const choice = (id: string) => stage.made.find((m) => m.name === `choice-${id}` && !m.destroyed);
  /** The label text of a drawn choice: the choice itself is its camera-fixed hit area. */
  const label = (id: string) =>
    stage.made.find((m) => m.name === `choice-${id}-label` && !m.destroyed)?.children[0] as Made;
  /** Stands the player beside the NPC with this function and presses to talk. */
  const talkTo = (fn: string) => {
    hub.selfEntityID = "me";
    hub.views = new Map([["me", { pos: { x: 0, y: 0 } }]]);
    hub.npcs = new Map([
      [
        fn,
        {
          state: { entity_id: fn, name: fn, function: fn, position: { x: 10, y: 0 } },
          pos: { x: 10, y: 0 },
        },
      ],
    ]);
    answer(keys.e);
  };
  /** A key read by the dialogue alone: the views above are too bare to ease each frame. */
  const answer = (k: FakeKey) => {
    k.justDown = true;
    hub.offerConversation();
  };
  /** Where the server says the player stands, as each hub state reports it. */
  const standAt = (pos: { x: number; y: number }) => hub.followGates(pos, HUB_GATES);
  /** Walks up to the Spire's door from outside it, as the server reports the steps. */
  const atTheDoor = () => {
    standAt(AWAY);
    standAt(SPIRE_GATE.position);
  };
  return { hub, stage, keys, gear, press, option, choice, label, talkTo, answer, standAt, atTheDoor };
}

/** The hub's gates as the server sends them (FS-0XMCP §Requirements 2, 6). */
const SPIRE_GATE = {
  entity_id: "spire-gate",
  destination: "spire" as const,
  position: { x: 1000, y: 50 },
  range: 80,
};
const FOREST_GATE = {
  entity_id: "forest-gate",
  destination: "forest" as const,
  position: { x: 40, y: 580 },
  range: 80,
};
const MEADOWS_GATE = {
  entity_id: "meadows-gate",
  destination: "meadows" as const,
  position: { x: 1960, y: 360 },
  range: 80,
};
const HUB_GATES = [SPIRE_GATE, FOREST_GATE, MEADOWS_GATE];
/** The middle of the hub: at no gate. */
const AWAY = { x: 1000, y: 500 };

describe("delveChoices (FS-NSV3D §Requirements 1, 4; FS-0XMCP §Requirements 9; FS-BJNYC R20, R21)", () => {
  const OPEN_LINE = "The Spire's door stands open. Few return whole,\nand fewer return twice.";
  /** Nothing in flight. */
  const IDLE = { soloPending: false, enterPending: false, queuePending: false };

  it("should show only the fact and a dismiss while queued", () => {
    const dialogue = delveChoices({ queued: true, party: "none" });

    expect(dialogue.line).toBe("The delve is gathering. Wait, or leave the queue.");
    expect(dialogue.choices.map((c) => c.id)).toEqual(["dismiss"]);
    expect(dialogue.choices.map((c) => c.register)).toEqual(["cancel"]);
  });

  it.each([
    // one fixed order for everyone: Enter as a party third (FS-BJNYC R21, amended 2026-11-02, Nick)
    { party: "leader" as const, ids: ["solo", "queue", "enter", "dismiss"] },
    { party: "member" as const, ids: ["solo", "queue", "enter", "dismiss"] },
    { party: "none" as const, ids: ["solo", "queue", "enter", "dismiss"] },
  ])("should offer $party every choice, in the order $ids, with the one opening line", ({ party, ids }) => {
    const dialogue = delveChoices({ queued: false, party });
    const label = { enter: "Enter as a party", solo: "Descend alone", queue: "Wait for company", dismiss: "Not yet" };

    expect(dialogue.line).toBe(OPEN_LINE);
    expect(dialogue.choices.map((c) => c.id)).toEqual(ids);
    expect(dialogue.choices.map((c) => c.label)).toEqual(ids.map((id) => label[id as keyof typeof label]));
    expect(dialogue.choices.map((c) => c.register)).toEqual(["actionable", "actionable", "actionable", "cancel"]);
    // none greyed for the player's party standing: with nothing in flight, every choice can be pressed
    for (const choice of dialogue.choices) expect(choice.enabled?.(IDLE) ?? true).toBe(true);
  });

  it.each(["none", "member", "leader"] as const)(
    "should keep the door up after each of the three for %s, and hold each back only while its own send is unanswered",
    (party) => {
      const byId = Object.fromEntries(delveChoices({ queued: false, party }).choices.map((c) => [c.id, c]));

      for (const id of ["enter", "solo", "queue"]) expect(byId[id].stays).toBe(true);
      expect(byId.solo.enabled?.({ ...IDLE, soloPending: true })).toBe(false);
      expect(byId.enter.enabled?.({ ...IDLE, enterPending: true })).toBe(false);
      expect(byId.queue.enabled?.({ ...IDLE, queuePending: true })).toBe(false);
      // one send in flight holds back only its own choice
      expect(byId.solo.enabled?.({ ...IDLE, enterPending: true, queuePending: true })).toBe(true);
      expect(byId.enter.enabled?.({ ...IDLE, soloPending: true, queuePending: true })).toBe(true);
      expect(byId.queue.enabled?.({ ...IDLE, soloPending: true, enterPending: true })).toBe(true);
      expect(byId.dismiss.enabled).toBeUndefined();
      expect(byId.dismiss.stays).toBeUndefined();
    },
  );

  it("should speak a refusal in place of the opening line, every choice still offered", () => {
    const dialogue = delveChoices({ queued: false, party: "none" }, "Form a party first.");

    expect(dialogue.line).toBe("Form a party first.");
    expect(dialogue.choices.map((c) => c.id)).toEqual(["solo", "queue", "enter", "dismiss"]);
  });
});

describe("HubScene the Spire's door for every party standing (FS-BJNYC §Requirements R20–R22)", () => {
  const AMBER = toCss(BARROW_HEX.amber);
  const OPEN_LINE = "The Spire's door stands open. Few return whole,\nand fewer return twice.";
  const member = (player_id: string, name: string, joined_at: string) => ({
    player_id,
    name,
    class: "warrior",
    joined_at,
    where: "hub",
  });
  /** A party of just its leader, this player: still a party. */
  const PARTY_OF_ONE = {
    party_id: "p1",
    leader_id: "self",
    members: [member("self", "Aldric", "2026-11-02T00:00:00Z")],
    size: 4,
    reason: "created",
    subject_id: "self",
  };
  /** Wren leads; this player is a member. */
  const LED_BY_WREN = {
    ...PARTY_OF_ONE,
    leader_id: "wren",
    members: [member("wren", "Wren", "2026-11-02T00:00:00Z"), member("self", "Aldric", "2026-11-02T00:01:00Z")],
    reason: "joined",
  };
  /** The same two, this player leading now. */
  const LED_BY_SELF = { ...LED_BY_WREN, leader_id: "self", reason: "transferred" };
  const STANDINGS = [
    { standing: "no party", party: null, order: ["solo", "queue", "enter", "dismiss"] },
    { standing: "a member", party: LED_BY_WREN, order: ["solo", "queue", "enter", "dismiss"] },
    { standing: "the leader", party: LED_BY_SELF, order: ["solo", "queue", "enter", "dismiss"] },
    { standing: "a party of one", party: PARTY_OF_ONE, order: ["solo", "queue", "enter", "dismiss"] },
  ];
  /** Whether the door's card says `text` now (a redrawn card's old words are destroyed with it). */
  const says = (stage: { made: Made[] }, text: string) =>
    stage.made.some((m) => m.kind === "text" && !m.destroyed && m.args[2] === text);
  /** Whether `text` passed by as a notice in the hub, off the door's card. */
  const passing = (stage: { made: Made[] }, text: string) =>
    stage.made.some((m) => m.kind === "text" && m.args[2] === text && m.depth === 1000);
  /** A choice's colour as it now shows: retoned since drawn, or as drawn. */
  const toneOf = (label: (id: string) => Made, id: string) => {
    const text = label(id);
    // an unset prop on the stage's proxy answers as a method: no colour set since drawn
    return typeof text.color === "string" ? text.color : (text.args[3] as { color: string }).color;
  };
  /** The drawn choices, top to bottom. */
  const drawnOrder = (choice: (id: string) => Made | undefined) =>
    ["enter", "solo", "queue", "dismiss"]
      .map((id) => ({ id, y: (choice(id) as Made).y }))
      .sort((p, q) => p.y - q.y)
      .map((p) => p.id);

  beforeEach(() => {
    useAuthStore.setState({ memberInfo: { id: "self" } as never });
  });
  afterEach(() => {
    usePartyStore.setState({ party: null });
    useAuthStore.setState({ memberInfo: null });
    vi.restoreAllMocks();
  });

  it.each(STANDINGS)("should show $standing all four choices, the three amber, in order, with the one opening line", ({ party, order }) => {
    usePartyStore.setState({ party });
    const { stage, choice, label, atTheDoor } = queuedHubOnStage();

    atTheDoor();

    expect(says(stage, OPEN_LINE)).toBe(true);
    expect(drawnOrder(choice)).toEqual(order);
    for (const id of ["enter", "solo", "queue"]) expect(toneOf(label, id)).toBe(AMBER);
  });

  it.each(STANDINGS)("should send each of the three for $standing, once while unanswered, the door staying up", ({ party }) => {
    usePartyStore.setState({ party });
    const { hub, choice, atTheDoor, send } = queuedHubOnStage();
    atTheDoor();

    for (const id of ["enter", "solo", "queue"]) {
      choice(id)?.handlers.pointerup();
      choice(id)?.handlers.pointerup();
    }

    expect(send.mock.calls.map((c) => c[0])).toEqual([ActionType.PartyEnter, ActionType.StartSolo, ActionType.Find_Game]);
    expect(hub.dialogue).toBeDefined();
  });

  it("should send the leader's Enter as a party on key 3, its place for everyone, and once only", () => {
    usePartyStore.setState({ party: PARTY_OF_ONE });
    const { atTheDoor, send, keys, answer } = queuedHubOnStage();
    atTheDoor();

    answer(keys.three);
    answer(keys.three);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.PartyEnter, {});
  });

  it.each([
    { standing: "no party", party: null, notice: { code: "not_member" }, words: "Form a party first." },
    { standing: "a member", party: LED_BY_WREN, notice: { code: "not_leader" }, words: "Only your leader can lead the party in." },
    { standing: "a party of one", party: PARTY_OF_ONE, notice: { code: "too_few" }, words: "Your party needs at least two players." },
    { standing: "the leader", party: LED_BY_SELF, notice: { code: "locked" }, words: "Not while delving." },
    { standing: "the leader", party: LED_BY_SELF, notice: { code: "checking" }, words: "Your party is already being asked." },
    { standing: "the leader", party: LED_BY_SELF, notice: { code: "not_at_gate" }, words: "Walk to the Spire's door first." },
    { standing: "the leader", party: LED_BY_SELF, notice: { code: "not_in_town", names: ["Wren"] }, words: "Wren is not in the town." },
    { standing: "the leader", party: LED_BY_SELF, notice: { code: "unavailable" }, words: "The party cannot be changed right now." },
  ])("should say $words in the door's panel when Enter as a party is refused $notice.code for $standing", ({ party, notice, words }) => {
    usePartyStore.setState({ party });
    const { hub, stage, choice, label, atTheDoor, send, reply } = queuedHubOnStage();
    atTheDoor();
    choice("enter")?.handlers.pointerup();

    reply("party_notice", notice);

    expect(hub.enterPending).toBe(false);
    expect(hub.dialogue).toBeDefined();
    expect(says(stage, words)).toBe(true);
    expect(says(stage, OPEN_LINE)).toBe(false);
    // the door stays, every choice offered and pressable, so the player can pick another
    for (const id of ["enter", "solo", "queue"]) expect(toneOf(label, id)).toBe(AMBER);
    expect(choice("dismiss")).toBeDefined();
    choice("enter")?.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    { id: "solo", action: "start_solo" },
    { id: "queue", action: "find_game" },
  ])("should say the server's words in the door's panel when a member's $action is refused", ({ id, action }) => {
    usePartyStore.setState({ party: LED_BY_WREN });
    const { hub, stage, choice, label, atTheDoor, send, refuse } = queuedHubOnStage();
    atTheDoor();
    choice(id)?.handlers.pointerup();

    refuse(action, "Your party enters together.");

    expect(hub.dialogue).toBeDefined();
    expect(says(stage, "Your party enters together.")).toBe(true);
    expect(passing(stage, "Your party enters together.")).toBe(false);
    expect(hub.soloPending).toBe(false);
    expect(hub.queuePending).toBe(false);
    expect(hub.queued).toBe(false);
    for (const each of ["enter", "solo", "queue"]) expect(toneOf(label, each)).toBe(AMBER);
    choice(id)?.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should say an unreadable gear refusal at the door in the client's words", () => {
    const { stage, choice, atTheDoor, refuse } = queuedHubOnStage();
    atTheDoor();
    choice("solo")?.handlers.pointerup();

    refuse("start_solo", "Your gear could not be fetched. Try again shortly.", "loadout_unavailable");

    expect(says(stage, "Your gear cannot be fetched. Try again shortly.")).toBe(true);
  });

  it("should hand the door over to the queue's panel once the queue takes the player", () => {
    const { hub, choice, atTheDoor, reply } = queuedHubOnStage();
    atTheDoor();
    choice("queue")?.handlers.pointerup();

    reply("find_game", { message: "Successfully joined matchmaking queue" });

    expect(hub.queued).toBe(true);
    expect(hub.queuePending).toBe(false);
    expect(hub.dialogue).toBeUndefined();
  });

  it("should keep waiting through a notice that is no answer to the press", () => {
    usePartyStore.setState({ party: LED_BY_SELF });
    const { hub, stage, choice, atTheDoor, reply } = queuedHubOnStage();
    atTheDoor();
    choice("enter")?.handlers.pointerup();

    reply("party_notice", { code: "accepted", name: "Mira" });

    expect(hub.enterPending).toBe(true);
    expect(says(stage, OPEN_LINE)).toBe(true);
  });

  it("should leave the door's line alone for a refusal code when no party_enter is unanswered", () => {
    const { stage, atTheDoor, reply } = queuedHubOnStage();
    atTheDoor();

    reply("party_notice", { code: "not_member" });

    expect(says(stage, OPEN_LINE)).toBe(true);
    expect(says(stage, "Form a party first.")).toBe(false);
  });

  it("should stop waiting once the ready check opens", () => {
    usePartyStore.setState({ party: LED_BY_SELF });
    const { hub, choice, atTheDoor, reply } = queuedHubOnStage();
    atTheDoor();
    choice("enter")?.handlers.pointerup();

    reply("party_ready_check", { check_id: "c1", outcome: "open", expires_in_ms: 30000, members: [] });

    expect(hub.enterPending).toBe(false);
  });

  it("should leave a party_enter refusal to the chat once the door has closed, drawing nothing at the gate", () => {
    const { hub, stage, choice, atTheDoor, keys, answer, reply } = queuedHubOnStage();
    atTheDoor();
    choice("enter")?.handlers.pointerup();
    answer(keys.esc);
    const drawn = stage.made.length;

    reply("party_notice", { code: "not_member" });

    expect(hub.enterPending).toBe(false);
    expect(hub.dialogue).toBeUndefined();
    expect(stage.made.length).toBe(drawn);
  });

  it.each([
    { id: "solo", action: "start_solo" },
    { id: "queue", action: "find_game" },
  ])("should show a $action refusal in passing once the door has closed", ({ id, action }) => {
    usePartyStore.setState({ party: LED_BY_WREN });
    const { hub, stage, choice, atTheDoor, keys, answer, refuse } = queuedHubOnStage();
    atTheDoor();
    choice(id)?.handlers.pointerup();
    answer(keys.esc);

    refuse(action, "Your party enters together.");

    expect(hub.dialogue).toBeUndefined();
    expect(passing(stage, "Your party enters together.")).toBe(true);
  });

  it("should forget the pending sends with the visit, and hand the replies back", () => {
    usePartyStore.setState({ party: PARTY_OF_ONE });
    const { hub, choice, atTheDoor, off } = queuedHubOnStage();
    atTheDoor();
    choice("enter")?.handlers.pointerup();
    choice("queue")?.handlers.pointerup();

    hub.release("shutdown");

    expect(hub.enterPending).toBe(false);
    expect(hub.queuePending).toBe(false);
    expect(off).toHaveBeenCalledWith("party_notice");
    expect(off).toHaveBeenCalledWith("party_ready_check");
  });

  it("should redraw the open door when the player's place in the party changes, the opening line back, the order unchanged", () => {
    usePartyStore.setState({ party: LED_BY_WREN });
    const { stage, choice, atTheDoor, reply } = queuedHubOnStage();
    atTheDoor();
    choice("enter")?.handlers.pointerup();
    reply("party_notice", { code: "not_leader" });
    expect(drawnOrder(choice)).toEqual(["solo", "queue", "enter", "dismiss"]);

    // the lead handed to this player while they stand at the door: the refusal no longer holds
    usePartyStore.setState({ party: LED_BY_SELF });
    expect(drawnOrder(choice)).toEqual(["solo", "queue", "enter", "dismiss"]);
    expect(says(stage, OPEN_LINE)).toBe(true);
    expect(says(stage, "Only your leader can lead the party in.")).toBe(false);

    // a change that leaves them leading draws nothing new
    const drawn = stage.made.length;
    usePartyStore.setState({ party: { ...LED_BY_SELF, reason: "presence" } });
    expect(stage.made.length).toBe(drawn);

    usePartyStore.setState({ party: null });
    expect(drawnOrder(choice)).toEqual(["solo", "queue", "enter", "dismiss"]);
    expect(says(stage, OPEN_LINE)).toBe(true);
  });

  it("should keep Enter as a party third each time the door opens, whatever the party", () => {
    const { choice, atTheDoor, keys, answer } = queuedHubOnStage();

    for (const party of [null, PARTY_OF_ONE, LED_BY_WREN, null]) {
      usePartyStore.setState({ party });
      atTheDoor();
      expect(drawnOrder(choice)).toEqual(["solo", "queue", "enter", "dismiss"]);
      answer(keys.esc);
    }
  });

  it("should open on the opening line again after a refusal and walking away", () => {
    const { stage, choice, atTheDoor, keys, answer, reply } = queuedHubOnStage();
    atTheDoor();
    choice("enter")?.handlers.pointerup();
    reply("party_notice", { code: "not_member" });
    answer(keys.esc);

    atTheDoor();

    expect(says(stage, OPEN_LINE)).toBe(true);
    expect(says(stage, "Form a party first.")).toBe(false);
  });

  // A random match called off on the host (FS-988SM R8a) is refused as find_game after queue_status:
  // the match already took the player out of the queue, so the panel comes down (R24).
  const MATCH_FAILED = "The match failed. Queue again.";

  it("should take the queue down and say why when a match is called off, Wait for company pressable again", () => {
    const { hub, stage, choice, atTheDoor, reply, refuse, button, send } = queuedHubOnStage();
    reply("find_game", { message: "Successfully joined matchmaking queue" });
    reply("queue_status", { current: 2, total: 2 });
    const panel = hub.queuePanel as Made;
    const leave = button() as Made;

    refuse("find_game", MATCH_FAILED);

    expect(hub.queued).toBe(false);
    expect(panel.destroyed).toBe(true);
    expect(hub.queuePanel).toBeUndefined();
    expect(leave.destroyed).toBe(true);
    expect(hub.leaveButton).toBeUndefined();
    expect(passing(stage, MATCH_FAILED)).toBe(true);

    atTheDoor();
    expect(says(stage, OPEN_LINE)).toBe(true);
    choice("queue")?.handlers.pointerup();
    expect(send).toHaveBeenCalledWith(ActionType.Find_Game, expect.anything());
  });

  it("should redraw an open door's queued line with every choice when a match is called off", () => {
    const { hub, stage, choice, atTheDoor, reply, refuse, send } = queuedHubOnStage();
    reply("queue_status", { current: 2, total: 2 });
    atTheDoor();
    expect(says(stage, "The delve is gathering. Wait, or leave the queue.")).toBe(true);

    refuse("find_game", MATCH_FAILED);

    expect(hub.queued).toBe(false);
    expect(hub.dialogue).toBeDefined();
    expect(says(stage, MATCH_FAILED)).toBe(true);
    expect(says(stage, "The delve is gathering. Wait, or leave the queue.")).toBe(false);
    choice("queue")?.handlers.pointerup();
    expect(send).toHaveBeenCalledWith(ActionType.Find_Game, expect.anything());
  });
});

describe("HubScene the Spire's door panel (FS-NSV3D §Requirements 1–6, FS-0XMCP §Requirements 8, 9)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show Descend alone, Wait for company, Enter as a party and Not yet, amber and the cancel register", () => {
    const { hub, stage, choice, label, atTheDoor } = queuedHubOnStage();

    atTheDoor();

    expect(hub.dialogue).toBeDefined();
    // the door speaks, not a keeper: the card letters its name, under no role
    expect(stage.made.some((m) => m.kind === "text" && m.args[2] === "THE SPIRE'S DOOR")).toBe(true);
    expect(stage.made.some((m) => m.kind === "text" && /keeper/i.test(String(m.args[2])))).toBe(false);
    const solo = choice("solo") as Made;
    const queue = choice("queue") as Made;
    const dismiss = choice("dismiss") as Made;
    expect(solo).toBeDefined();
    expect(queue).toBeDefined();
    expect(dismiss).toBeDefined();
    expect((label("solo").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.amber));
    expect((label("queue").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.amber));
    expect((label("enter").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.amber));
    expect((label("dismiss").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.arcane));
    // top to bottom down the card, in the spec's order
    expect(solo.y).toBeLessThan(queue.y);
    expect(queue.y).toBeLessThan((choice("enter") as Made).y);
    expect((choice("enter") as Made).y).toBeLessThan(dismiss.y);
  });

  it("should give the storekeeper one dismiss choice and no Open pack (FS-HRH2J R45)", () => {
    const { hub, stage, choice, talkTo } = queuedHubOnStage();

    talkTo("storekeeper");

    const texts = stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    expect(texts.some((t) => /pack/i.test(t))).toBe(false);
    expect(texts).toContain("Keeper of the stores");
    expect(choice("pack")).toBeUndefined();
    expect(choice("solo")).toBeUndefined();
    expect(choice("farewell")).toBeDefined();
    expect(stage.made.filter((m) => typeof m.name === "string" && m.name.startsWith("choice-") && !m.name.endsWith("-label") && !m.destroyed)).toHaveLength(1);

    choice("farewell")?.handlers.pointerup();
    expect(hub.dialogue).toBeUndefined();
    expect(hub.scene.start).not.toHaveBeenCalled();
  });

  it("should send one find_game on Wait for company and keep the door up until it is answered", () => {
    const { hub, choice, label, atTheDoor, send } = queuedHubOnStage();
    atTheDoor();

    choice("queue")?.handlers.pointerup();
    choice("queue")?.handlers.pointerup();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(ActionType.Find_Game);
    expect(hub.queuePending).toBe(true);
    expect(hub.dialogue).toBeDefined();
    expect(label("queue").color).not.toBe(toCss(BARROW_HEX.amber));
  });

  it("should send one start_solo on Descend alone, keep the dialogue open and grey the choice until the reply", () => {
    const { hub, choice, label, atTheDoor, send } = queuedHubOnStage();
    atTheDoor();
    const solo = choice("solo") as Made;

    solo.handlers.pointerup();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.StartSolo, {});
    expect(hub.soloPending).toBe(true);
    expect(hub.dialogue).toBeDefined();
    expect(solo.destroyed).toBe(false);
    expect(label("solo").color).not.toBe(toCss(BARROW_HEX.amber));

    solo.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should confirm Descend alone on Enter, and once only", () => {
    const { keys, answer, atTheDoor, send } = queuedHubOnStage();
    atTheDoor();

    answer(keys.enter);
    answer(keys.enter);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.StartSolo, {});
  });

  it("should dismiss on ESC and on Not yet, sending nothing", () => {
    const { hub, keys, answer, choice, atTheDoor, send } = queuedHubOnStage();
    atTheDoor();
    answer(keys.esc);
    expect(hub.dialogue).toBeUndefined();

    atTheDoor();
    choice("dismiss")?.handlers.pointerup();
    expect(hub.dialogue).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("should show the queued line and a dismiss only while queued", () => {
    const { hub, stage, keys, answer, choice, atTheDoor, send, reply } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });

    atTheDoor();

    expect(hub.dialogue).toBeDefined();
    expect(choice("solo")).toBeUndefined();
    expect(choice("queue")).toBeUndefined();
    expect(choice("dismiss")).toBeDefined();
    expect(
      stage.made.some(
        (m) => m.kind === "text" && m.args[2] === "The delve is gathering. Wait, or leave the queue.",
      ),
    ).toBe(true);

    // nothing to confirm: Enter and E close it like ESC, and nothing is sent
    answer(keys.enter);
    expect(hub.dialogue).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("should re-enable the choice and say the message in the door's panel when start_solo is refused", () => {
    const { hub, stage, choice, label, atTheDoor, send, refuse } = queuedHubOnStage();
    atTheDoor();
    const solo = choice("solo") as Made;
    solo.handlers.pointerup();

    refuse("start_solo", "Leave the queue first.");

    expect(hub.soloPending).toBe(false);
    expect(hub.dialogue).toBeDefined();
    expect((label("solo").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.amber));
    expect(stage.made.some((m) => m.kind === "text" && !m.destroyed && m.args[2] === "Leave the queue first.")).toBe(true);
    // said by the door, not in passing
    expect(hub.time.delayedCall).not.toHaveBeenCalled();

    choice("solo")?.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should let a refusal with nothing pending change nothing", () => {
    const { hub, stage, refuse } = queuedHubOnStage();
    const drawn = stage.made.length;

    refuse("start_solo", "Leave the queue first.");

    expect(hub.soloPending).toBe(false);
    expect(stage.made.length).toBe(drawn);
  });

  it("should say a refused find_game in the door's panel, gear in the client's words, and not queue", () => {
    const { hub, stage, choice, atTheDoor, refuse } = queuedHubOnStage();
    atTheDoor();
    choice("queue")?.handlers.pointerup();

    refuse("find_game", "Your gear could not be fetched. Try again shortly.", "loadout_unavailable");

    expect(hub.queued).toBe(false);
    expect(hub.dialogue).toBeDefined();
    expect(
      stage.made.some(
        (m) => m.kind === "text" && !m.destroyed && m.args[2] === "Your gear cannot be fetched. Try again shortly.",
      ),
    ).toBe(true);
  });

  it("should pass on any other refused find_game in the server's words", () => {
    const { stage, refuse } = queuedHubOnStage();

    refuse("find_game", "Walk to the Spire's door first.");

    const notice = stage.made.find(
      (m) => m.kind === "text" && m.args[2] === "Walk to the Spire's door first." && m.depth === 1000,
    );
    expect(notice).toBeDefined();
  });

  it("should hand the find_game refusals back on release", () => {
    const { hub, offError } = queuedHubOnStage();

    hub.release("shutdown");

    expect(offError).toHaveBeenCalledWith("find_game");
  });

  it("should hand the start_solo refusals back and forget the pending send on release", () => {
    const { hub, choice, atTheDoor, offError } = queuedHubOnStage();
    atTheDoor();
    choice("solo")?.handlers.pointerup();

    hub.release("shutdown");

    expect(offError).toHaveBeenCalledWith("start_solo");
    expect(hub.soloPending).toBe(false);
    expect(hub.dialogue).toBeUndefined();
  });
});

describe("HubScene ESC menu (FS-G4VMQ §Requirements 1–5, 19, 20)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should open the menu in the popup band when ESC is pressed with no dialogue open", () => {
    const { hub, keys, press, option } = hubOnStage();

    press(keys.esc);

    expect(hub.menu).toBeDefined();
    expect(hub.menu?.depth).toBe(2000);
    expect(option("change")).toBeDefined();
    expect(option("back")).toBeDefined();
  });

  it("should leave ESC to the dialogue while one is open", () => {
    const { hub, keys, press } = hubOnStage();
    const dismiss = vi.fn();
    hub.dialogue = {};
    hub.dialogueChoices = { confirm: vi.fn(), dismiss };

    press(keys.esc);

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(hub.menu).toBeUndefined();
  });

  it("should close the menu on a second ESC, and on Back", () => {
    const { hub, keys, press, option } = hubOnStage();

    press(keys.esc);
    const first = hub.menu;
    press(keys.esc);
    expect(hub.menu).toBeUndefined();
    expect(first?.destroyed).toBe(true);

    press(keys.esc);
    option("back")?.handlers.pointerup();
    expect(hub.menu).toBeUndefined();
  });

  it("should send no move for WASD while the menu is open, and stop a stride it interrupts", () => {
    const { hub, keys, press } = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});

    keys.w.isDown = true;
    hub.update(0, 16);
    expect(send).toHaveBeenLastCalledWith(ActionType.Move, { vx: 0, vy: -1 });

    press(keys.esc);
    // the body was walking: one stop, so it does not walk on under the menu
    expect(send).toHaveBeenLastCalledWith(ActionType.Move, { vx: 0, vy: 0 });
    const sent = send.mock.calls.length;

    keys.w.isDown = false;
    hub.update(0, 16);
    keys.w.isDown = true;
    hub.update(0, 16);
    expect(send.mock.calls.length).toBe(sent);
  });

  it("should not open a dialogue on E while the menu is open", () => {
    const { hub, stage, keys, press, option } = hubOnStage();
    press(keys.esc);
    // the player stands beside the keeper of the way
    hub.selfEntityID = "me";
    hub.views = new Map([["me", { pos: { x: 0, y: 0 } }]]);
    hub.npcs = new Map([
      [
        "keeper",
        {
          state: { entity_id: "keeper", name: "Keeper", function: "storyteller", position: { x: 10, y: 0 } },
          pos: { x: 10, y: 0 },
        },
      ],
    ]);

    keys.e.justDown = true;
    hub.offerConversation();
    expect(hub.dialogue).toBeUndefined();

    // and with the menu closed the same press talks, so the guard is the menu's
    option("back")?.handlers.pointerup();
    keys.e.justDown = true;
    hub.offerConversation();
    expect(hub.dialogue).toBeDefined();
    // the card sets the speaker's name in capitals
    expect(stage.made.some((m) => m.kind === "text" && m.args[2] === "KEEPER")).toBe(true);
  });

  it("should ask to leave the hub on Change character, and start the main menu once it is left", () => {
    const { hub, keys, press, option, reply, send } = queuedHubOnStage();

    press(keys.esc);
    option("change")?.handlers.pointerup();

    expect(send).toHaveBeenCalledWith("leave_hub", {});
    expect(hub.scene.start).not.toHaveBeenCalled();

    reply("world_left", {});
    expect(hub.scene.start).toHaveBeenCalledWith("MainMenuScene");
  });

  it("should forget the menu on release, so the next visit opens a fresh one", () => {
    const { hub, keys, press } = hubOnStage();

    press(keys.esc);
    const first = hub.menu;
    hub.release("shutdown");

    expect(first?.destroyed).toBe(true);
    expect(hub.menu).toBeUndefined();

    press(keys.esc);
    expect(hub.menu).toBeDefined();
    expect(hub.menu).not.toBe(first);
  });
});

// FS-R82NV § Change C2 and FS-3EBCA R6, R7: one Esc press, the Menu icon's, and the Character
// icon's toggle under I's guards. I-3EBCA-1.
describe("HubScene one Esc press and the corner row's presses (FS-R82NV § Change C2; FS-3EBCA R6, R7)", () => {
  type Pressing = { pressEscape(): void; toggleGear(): void; toggleCharacter(): void; partyPanel?: unknown };
  function withParty(open = true) {
    const env = hubOnStage();
    const state = { open };
    (env.hub as unknown as Pressing).partyPanel = {
      isOpen: () => state.open,
      close: () => {
        const was = state.open;
        state.open = false;
        return was;
      },
      destroy: vi.fn(),
    };
    return { ...env, party: state, pressing: env.hub as unknown as Pressing };
  }

  it("should close an open party panel on ESC before it opens the menu", () => {
    const { hub, keys, press, party } = withParty();
    press(keys.esc);
    expect(party.open).toBe(false);
    expect(hub.menu).toBeUndefined();
    press(keys.esc);
    expect(hub.menu).toBeDefined();
  });

  // the party panel is drawn over the gear overlay (FS-3EBCA R8; FS-R82NV § Change C2, C8)
  it("should close the party panel, drawn over the gear overlay, before the overlay", () => {
    const { keys, press, party, gear } = withParty();
    gear.toggle();
    gear.toggleCharacter();
    press(keys.esc);
    expect(party.open).toBe(false);
    expect(gear.isOpen()).toBe(true);
    press(keys.esc);
    expect(gear.isOpen()).toBe(false);
  });

  it("should do on the Menu icon exactly what one ESC does: open, then close the menu", () => {
    const { hub, pressing } = withParty(false);
    pressing.pressEscape();
    expect(hub.menu).toBeDefined();
    pressing.pressEscape();
    expect(hub.menu).toBeUndefined();
  });

  it("should do nothing on the Menu icon while a dialogue is open", () => {
    const { hub, pressing } = withParty(false);
    hub.dialogue = {};
    pressing.pressEscape();
    expect(hub.menu).toBeUndefined();
  });

  it("should toggle the gear overlay on the Character icon, not while the menu or a dialogue is open", () => {
    const { hub, gear, pressing } = withParty(false);
    pressing.toggleGear();
    expect(gear.isOpen()).toBe(true);
    pressing.toggleGear();
    expect(gear.isOpen()).toBe(false);
    hub.dialogue = {};
    pressing.toggleGear();
    expect(gear.isOpen()).toBe(false);
  });

  it("should toggle the character panel as C does, not while the menu or a dialogue is open (FS-HRH2J § Change C2)", () => {
    const { hub, gear, pressing } = withParty(false);
    pressing.toggleCharacter();
    expect(gear.character).toBe(true);
    pressing.toggleCharacter();
    expect(gear.character).toBe(false);
    hub.dialogue = {};
    pressing.toggleCharacter();
    expect(gear.character).toBe(false);
  });
});

describe("HubScene changeCharacter leaves the hub (FS-G4VMQ §Requirements 25, 26)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The Change character row's label, whose colour says whether it can be pressed. */
  const changeLabel = (stage: { made: Made[] }) =>
    stage.made.find((m) => m.name === "menu-change-label" && !m.destroyed)?.children[0] as Made;

  it("should send one leave_hub, dim the row and ignore a second press until the reply", () => {
    const { hub, stage, keys, press, option, send } = queuedHubOnStage();

    press(keys.esc);
    option("change")?.handlers.pointerup();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("leave_hub", {});
    expect(hub.leavingHub).toBe(true);
    expect(hub.scene.start).not.toHaveBeenCalled();
    expect(changeLabel(stage).color).toBe(toCss(BARROW_HEX.vellumDark));

    option("change")?.handlers.pointerup();
    press(keys.one);
    press(keys.enter);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should start the main menu on world_left", () => {
    const { hub, keys, press, option, reply } = queuedHubOnStage();
    press(keys.esc);
    option("change")?.handlers.pointerup();

    reply("world_left", {});

    expect(hub.scene.start).toHaveBeenCalledWith("MainMenuScene");
  });

  /** An invite to this player, waiting in the store's prompts. */
  const inviteWaiting = () => {
    usePartyStore.setState({ invites: [] });
    usePartyStore.getState().receiveInvite({
      invite_id: "44444444-4444-4444-8444-444444444444",
      party_id: "55555555-5555-4555-8555-555555555555",
      party_pod_addr: "",
      leader_name: "Wren",
      member_count: 1,
      size: 2,
      expires_at: "2026-11-12T12:01:00Z",
    });
    expect(usePartyStore.getState().invites).toHaveLength(1);
  };

  it("should let go of every invite prompt on world_left, as the server spent them with the switch (FS-NCC9J §Change: Changing character leaves the party, C2)", () => {
    const { keys, press, option, reply } = queuedHubOnStage();
    inviteWaiting();
    press(keys.esc);
    option("change")?.handlers.pointerup();

    reply("world_left", {});

    expect(usePartyStore.getState().invites).toEqual([]);
  });

  it("should keep the invite prompts when the switch is refused", () => {
    const { keys, press, option, refuse } = queuedHubOnStage();
    inviteWaiting();
    press(keys.esc);
    option("change")?.handlers.pointerup();

    refuse("leave_hub", "Not while delving.");

    expect(usePartyStore.getState().invites).toHaveLength(1);
    usePartyStore.setState({ invites: [] });
  });

  it("should stay, re-enable the row and pass on the server's message on the error reply, then send again", () => {
    const { hub, stage, keys, press, option, refuse, send } = queuedHubOnStage();
    press(keys.esc);
    option("change")?.handlers.pointerup();

    refuse("leave_hub", "Leave the queue first.");

    expect(hub.scene.start).not.toHaveBeenCalled();
    expect(hub.leavingHub).toBe(false);
    expect(changeLabel(stage).color).toBe(toCss(BARROW_HEX.amber));
    const notice = stage.made.find((m) => m.kind === "text" && m.args[2] === "Leave the queue first.") as Made;
    expect(notice).toBeDefined();
    expect(notice.depth).toBe(1000);
    expect((notice.args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.vellum));
    // passing: it goes on its own
    expect(hub.time.delayedCall).toHaveBeenCalledTimes(1);
    (hub.time.delayedCall.mock.calls[0][1] as () => void)();
    expect(notice.destroyed).toBe(true);

    option("change")?.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should let a refusal with nothing pending change nothing", () => {
    const { hub, stage, refuse } = queuedHubOnStage();
    const drawn = stage.made.length;

    refuse("leave_hub", "You are not in the hub.");

    expect(hub.leavingHub).toBe(false);
    expect(stage.made.length).toBe(drawn);
  });

  it("should hand both replies back and forget the pending leave on release", () => {
    const { hub, keys, press, option, off, offError } = queuedHubOnStage();
    press(keys.esc);
    option("change")?.handlers.pointerup();
    expect(hub.leavingHub).toBe(true);

    hub.release("shutdown");

    expect(off).toHaveBeenCalledWith("world_left");
    expect(offError).toHaveBeenCalledWith("leave_hub");
    expect(hub.leavingHub).toBe(false);
  });
});

describe("HubScene the Spire gate trigger (FS-0XMCP §Requirements 10, 22)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The door's panel is the one up: its three choices are drawn. */
  const doorIsOpen = (choice: (id: string) => Made | undefined) =>
    choice("solo") !== undefined && choice("queue") !== undefined;

  it("should open the door's panel once on stepping in, and not again while lingering after a dismiss", () => {
    const { hub, keys, answer, choice, standAt, atTheDoor } = hubOnStage();

    atTheDoor();
    expect(doorIsOpen(choice)).toBe(true);

    answer(keys.esc);
    standAt(SPIRE_GATE.position);
    standAt({ x: 1010, y: 60 });
    expect(hub.dialogue).toBeUndefined();
  });

  it("should reopen it on stepping out and back in", () => {
    const { hub, keys, answer, choice, standAt } = hubOnStage();
    standAt(SPIRE_GATE.position);
    answer(keys.esc);

    standAt(AWAY);
    standAt(SPIRE_GATE.position);

    expect(hub.dialogue).toBeDefined();
    expect(doorIsOpen(choice)).toBe(true);
  });

  it("should reopen it on E inside the gate, and E away from it opens nothing", () => {
    const { hub, keys, answer, choice, standAt, atTheDoor } = hubOnStage();
    atTheDoor();
    choice("dismiss")?.handlers.pointerup();

    answer(keys.e);
    expect(doorIsOpen(choice)).toBe(true);

    answer(keys.esc);
    standAt(AWAY);
    answer(keys.e);
    expect(hub.dialogue).toBeUndefined();
  });

  it("should close the panel on walking out, and let a start_solo already sent complete", () => {
    const { hub, choice, standAt, atTheDoor, send } = queuedHubOnStage();
    atTheDoor();
    choice("solo")?.handlers.pointerup();

    standAt(AWAY);

    expect(hub.dialogue).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.StartSolo, {});
    // the reply is still waited for, and handled as before
    expect(hub.soloPending).toBe(true);
  });

  it("should never queue anyone by walking in, out or past", () => {
    const { standAt, atTheDoor, send } = queuedHubOnStage();

    atTheDoor();
    standAt(AWAY);
    atTheDoor();
    standAt({ x: 1000, y: 140 });

    expect(send).not.toHaveBeenCalled();
  });

  it("should not open over the Esc menu, nor when the menu closes inside the gate", () => {
    const { hub, keys, press, option, choice, standAt, answer } = hubOnStage();
    standAt(AWAY);
    press(keys.esc);

    standAt(SPIRE_GATE.position);
    expect(hub.menu).toBeDefined();
    expect(hub.dialogue).toBeUndefined();

    option("back")?.handlers.pointerup();
    standAt(SPIRE_GATE.position);
    expect(hub.dialogue).toBeUndefined();

    // E is the way in from there
    answer(keys.e);
    expect(doorIsOpen(choice)).toBe(true);
  });

  it("should not stack over another dialogue, nor close it on walking out", () => {
    const { hub, choice, standAt, talkTo } = hubOnStage();
    standAt(AWAY);
    talkTo("storekeeper");

    standAt(SPIRE_GATE.position);
    expect(choice("farewell")).toBeDefined();
    expect(choice("solo")).toBeUndefined();

    standAt(AWAY);
    expect(hub.dialogue).toBeDefined();
    expect(choice("farewell")).toBeDefined();
  });

  it("should open nothing at a field gate", () => {
    const { hub, standAt } = hubOnStage();
    standAt(AWAY);

    standAt(FOREST_GATE.position);

    expect(hub.dialogue).toBeUndefined();
  });

  it("should show the queued line at the door while queued", () => {
    const { stage, choice, reply, atTheDoor } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });

    atTheDoor();

    expect(choice("solo")).toBeUndefined();
    expect(
      stage.made.some(
        (m) => m.kind === "text" && m.args[2] === "The delve is gathering. Wait, or leave the queue.",
      ),
    ).toBe(true);
  });

  it("should measure from the server-reported position and the state's gates, not the drawn one", () => {
    const { hub, choice } = hubOnStage();
    Object.assign(hub, {
      placePlayer: vi.fn(),
      renderStructures: vi.fn(),
      drawScenery: vi.fn(),
      renderNPCs: vi.fn(),
    });
    // the sprite is still easing in from the middle of the hub
    hub.views = new Map([["me", { pos: { ...AWAY } }]]);
    const state = (position: { x: number; y: number }, gates = HUB_GATES) => ({
      world_type: "hub",
      current_player: { entity_id: "me", position },
      other_players: [],
      walls: [],
      gates,
    });

    hub.renderState(state(AWAY));
    hub.renderState(state(SPIRE_GATE.position));
    expect(doorIsOpen(choice)).toBe(true);

    hub.renderState(state(AWAY));
    expect(hub.dialogue).toBeUndefined();

    // a gate the server moved is where the client looks for it
    const moved = { ...SPIRE_GATE, position: { x: 1000, y: 500 } };
    hub.renderState(state(AWAY, [moved]));
    expect(doorIsOpen(choice)).toBe(true);
  });

  it("should forget which gate the player stood in on release", () => {
    const { hub, choice, atTheDoor } = hubOnStage();
    atTheDoor();

    hub.release("shutdown");
    hub.followGates(SPIRE_GATE.position, HUB_GATES);

    // a fresh visit that starts inside the gate steps into it
    expect(doorIsOpen(choice)).toBe(true);
  });
});

describe("HubScene the dev test room's gate (FS-BDRTJ §Requirements 2, 3, 5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const DEV_GATE = {
    entity_id: "dev-gate",
    destination: "dev_test_room" as const,
    position: { x: 120, y: 900 },
    range: 80,
  };
  const ON = [...HUB_GATES, DEV_GATE];

  /** A hub whose states are rendered whole, with only the gates in them left to act on. */
  function hubWithStates() {
    const stage = queuedHubOnStage();
    Object.assign(stage.hub, {
      placePlayer: vi.fn(),
      renderStructures: vi.fn(),
      drawScenery: vi.fn(),
      renderNPCs: vi.fn(),
    });
    stage.hub.views = new Map([["me", { pos: { ...AWAY } }]]);
    const render = (position: { x: number; y: number }, gates: unknown[] = ON) =>
      stage.hub.renderState({
        world_type: "hub",
        current_player: { entity_id: "me", position },
        other_players: [],
        walls: [],
        gates,
      });
    const label = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed && m.args[2] === "Dev Test Room");
    return { ...stage, render, label };
  }

  it("should stand one plain label at the gate's server position while the gate is in the state", () => {
    const { render, label } = hubWithStates();
    const foot = iso.worldToScreen(DEV_GATE.position.x, DEV_GATE.position.y);

    render(AWAY);
    render(AWAY);
    expect(label()).toHaveLength(1);
    expect(label()[0].args.slice(0, 2)).toEqual([foot.x, foot.y]);

    render(AWAY, HUB_GATES);
    expect(label()).toHaveLength(0);
  });

  it("should send enter_field for the room on stepping in, raising no field-name sign", () => {
    const { render, label, send } = hubWithStates();

    render(AWAY);
    render(DEV_GATE.position);

    expect(send.mock.calls).toEqual([[ActionType.EnterField, { field: "dev_test_room" }]]);
    // the label alone: the sign would stand a second name over the Forest's post
    expect(label()).toHaveLength(1);
  });

  it("should neither label the gate nor send anything from it in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { render, label, send } = hubWithStates();

    render(AWAY);
    render(DEV_GATE.position);

    expect(label()).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("should drop the label on release", () => {
    const { hub, render, label } = hubWithStates();

    render(AWAY);
    hub.release("shutdown");

    expect(label()).toHaveLength(0);
  });
});

describe("HubScene field gates (FS-0XMCP §Requirements 21, 22)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The destination's name hanging over a signpost, while it is up. */
  const marker = (stage: { made: Made[] }) =>
    stage.made.filter(
      (m) => m.kind === "text" && !m.destroyed && /Forlorn Forest|Gentle Meadows/.test(String(m.args[2])),
    );

  it.each([
    { gate: FOREST_GATE, name: "The Forlorn Forest" },
    { gate: MEADOWS_GATE, name: "Gentle Meadows" },
  ])("should name $name over its signpost on stepping in, and drop it on stepping out", ({ gate, name }) => {
    const { stage, standAt } = hubOnStage();
    standAt(AWAY);

    standAt(gate.position);
    const shown = marker(stage);
    expect(shown.map((m) => m.args[2])).toEqual([name]);
    // a marker: amber, for a place to walk into, above the light-map
    expect((shown[0].args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.amber));
    expect(shown[0].depth).toBe(MARKER_DEPTH.name);

    standAt({ x: gate.position.x, y: gate.position.y + 10 });
    expect(marker(stage)).toHaveLength(1);

    standAt(AWAY);
    expect(marker(stage)).toHaveLength(0);
  });

  it("should fire the seam once per entry with the gate's field, not while lingering, and not at the Spire", () => {
    const { hub, standAt, atTheDoor } = hubOnStage();
    const onFieldGate = vi.fn();
    hub.onFieldGate = onFieldGate;

    standAt(AWAY);
    standAt(FOREST_GATE.position);
    standAt({ x: 50, y: 410 });
    expect(onFieldGate.mock.calls).toEqual([["forest"]]);

    standAt(AWAY);
    standAt(MEADOWS_GATE.position);
    standAt(AWAY);
    standAt(FOREST_GATE.position);
    expect(onFieldGate.mock.calls).toEqual([["forest"], ["meadows"], ["forest"]]);

    atTheDoor();
    expect(onFieldGate).toHaveBeenCalledTimes(3);
  });

  it("should send enter_field for the Forest on stepping into its gate, and leave the switch to world_entered (FS-3QHQZ)", () => {
    const { hub, standAt, send } = queuedHubOnStage();

    standAt(AWAY);
    standAt(FOREST_GATE.position);

    expect(send.mock.calls).toEqual([[ActionType.EnterField, { field: "forlorn_forest" }]]);
    expect(hub.scene.start).not.toHaveBeenCalled();
    expect(hub.dialogue).toBeUndefined();
  });

  it("should drop the name on release, so a fresh visit starts without it", () => {
    const { hub, stage, standAt } = hubOnStage();
    standAt(AWAY);
    standAt(FOREST_GATE.position);

    hub.release("shutdown");

    expect(marker(stage)).toHaveLength(0);
  });
});

describe("HubScene walking into Gentle Meadows (FS-X2F2H §Requirements 9, 11, 57, 60)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Lines the hub said in passing. */
  const said = (stage: { made: Made[] }, text: string) =>
    stage.made.some((m) => m.kind === "text" && m.args[2] === text);

  it("should send enter_field once on stepping into the Meadows gate, and leave the switch to world_entered", () => {
    const { hub, standAt, send } = queuedHubOnStage();

    standAt(AWAY);
    standAt(MEADOWS_GATE.position);

    expect(send.mock.calls).toEqual([[ActionType.EnterField, { field: "gentle_meadows" }]]);
    expect(hub.scene.start).not.toHaveBeenCalled();
  });

  it("should send nothing more while the first is unanswered, however often the gate is crossed", () => {
    const { standAt, send } = queuedHubOnStage();

    standAt(AWAY);
    standAt(MEADOWS_GATE.position);
    standAt(AWAY);
    standAt(MEADOWS_GATE.position);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should say why in its own words on a refusal, never the code, and let the next step in ask again", () => {
    const { stage, standAt, send, refuse } = queuedHubOnStage();
    standAt(AWAY);
    standAt(MEADOWS_GATE.position);

    refuse(ActionType.EnterField, "Leave the queue first.", "queued");

    expect(said(stage, "The delve is gathering. Leave the queue first.")).toBe(true);
    expect(stage.made.some((m) => m.kind === "text" && m.args[2] === "queued")).toBe(false);

    standAt(AWAY);
    standAt(MEADOWS_GATE.position);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should not walk out while the Esc menu or a dialogue is open, as the Spire's door does not open", () => {
    const { hub, keys, press, standAt, send, talkTo } = queuedHubOnStage();
    standAt(AWAY);
    press(keys.esc);

    standAt(MEADOWS_GATE.position);
    expect(hub.menu).toBeDefined();
    expect(send).not.toHaveBeenCalled();

    press(keys.esc);
    standAt(AWAY);
    talkTo("storekeeper");
    standAt(MEADOWS_GATE.position);
    expect(send).not.toHaveBeenCalled();
  });

  it("should forget an unanswered entry on release, so a fresh visit can walk out", () => {
    const { hub, standAt, send } = queuedHubOnStage();
    standAt(AWAY);
    standAt(MEADOWS_GATE.position);

    hub.release("shutdown");
    hub.listenForQueue();
    standAt(MEADOWS_GATE.position);

    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("HubScene the Elder tells the story (FS-0XMCP §Requirements 24, 25)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const said = (stage: { made: Made[] }) =>
    stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));

  it("should tell up to three passages", () => {
    expect(ELDER_TALE.length).toBeGreaterThan(0);
    expect(ELDER_TALE.length).toBeLessThanOrEqual(3);
    // the last points a newcomer at the door
    expect(ELDER_TALE[ELDER_TALE.length - 1]).toMatch(/door/);
  });

  it("should go on through the passages, the last offering only Farewell", () => {
    const { hub, stage, keys, answer, choice, talkTo } = hubOnStage();
    talkTo("storyteller");

    ELDER_TALE.forEach((passage, i) => {
      expect(said(stage)).toContain(passage);
      const last = i === ELDER_TALE.length - 1;
      expect(choice("farewell")).toBeDefined();
      expect(choice("on") !== undefined).toBe(!last);
      if (!last) choice("on")?.handlers.pointerup();
    });

    answer(keys.e);
    expect(hub.dialogue).toBeUndefined();
  });

  it("should leave the Warden's old function name unanswered: a stranger with a resident's line", () => {
    const { stage, choice, talkTo } = hubOnStage();
    // the server sends storyteller since I-0XMCP-4; the retired alias is gone (R25)
    talkTo("delve");

    expect(said(stage)).not.toContain(ELDER_TALE[0]);
    expect(choice("on")).toBeUndefined();
  });

  it("should go on with E, close on Farewell, and start again from the first passage", () => {
    const { hub, stage, keys, answer, choice, talkTo } = hubOnStage();
    talkTo("storyteller");
    answer(keys.e);
    expect(said(stage)).toContain(ELDER_TALE[1]);

    choice("farewell")?.handlers.pointerup();
    expect(hub.dialogue).toBeUndefined();

    talkTo("storyteller");
    expect(said(stage)).toContain(ELDER_TALE[0]);
    expect(said(stage)).not.toContain(ELDER_TALE[1]);
    expect(said(stage)).toContain("Go on  [E]");
    expect(said(stage)).toContain("Farewell  [Esc]");
  });

  it.each([false, true])("should offer no queue, solo or leave choice when queued is %s", (queued) => {
    const { choice, talkTo, reply, send } = queuedHubOnStage();
    if (queued) reply("queue_status", { current: 1, total: 2 });

    talkTo("storyteller");
    for (let i = 0; i < ELDER_TALE.length; i++) {
      for (const id of ["solo", "queue", "dismiss", "leave"]) expect(choice(id)).toBeUndefined();
      choice("on")?.handlers.pointerup();
    }

    expect(send).not.toHaveBeenCalled();
  });
});

describe("dialogue choices by mouse and by number (reported 2026-10-29)", () => {
  // Phaser hit-tests a container's child with the child's own scroll factor, not the
  // camera-fixed parent's, so once the camera had followed the player a click on a choice
  // landed beside it. The hit area lives outside the dialogue, camera-fixed, and dies with it.
  it("should press a choice through a camera-fixed hit area outside the dialogue", () => {
    const { hub, stage, choice, atTheDoor } = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    atTheDoor();

    const queue = choice("queue") as Made & { kind: string; scrollFactor?: number };
    expect(queue.kind).toBe("rectangle");
    expect(queue.scrollFactor).toBe(0);
    const dialogue = hub.dialogue as Made;
    expect(dialogue.children.map((c) => c.name)).not.toContain("choice-queue");
    expect(stage.made.filter((m) => m.name === "choice-queue" && !m.destroyed)).toHaveLength(1);

    queue.handlers.pointerup();
    expect(send).toHaveBeenCalledWith("find_game", expect.anything());
    // the door waits for the answer (FS-BJNYC R21); its hit areas go down with it when it closes
    expect(queue.destroyed).toBe(false);
    (choice("dismiss") as Made).handlers.pointerup();
    expect(queue.destroyed).toBe(true);
    send.mockRestore();
  });

  it("should press a menu choice the same way", () => {
    const { hub, keys, press, option } = hubOnStage();
    press(keys.esc);
    const back = option("back") as Made & { kind: string; scrollFactor?: number };
    expect(back.kind).toBe("rectangle");
    expect(back.scrollFactor).toBe(0);
    back.handlers.pointerup();
    expect(hub.menu).toBeUndefined();
    expect(back.destroyed).toBe(true);
  });

  // Wait for company had no key at all: E and Enter meant the first choice, Descend alone.
  it("should answer Descend alone on 1 and Wait for company on 2, with those keys on the labels", () => {
    const { stage, keys, atTheDoor, answer } = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    atTheDoor();
    const labels = stage.made
      .filter((m) => m.kind === "text" && !m.destroyed)
      .map((m) => String(m.args[2]));
    expect(labels).toContain("Descend alone  [1]");
    expect(labels).toContain("Wait for company  [2]");
    expect(labels).toContain("Not yet  [Esc]");

    answer(keys.two);
    expect(send).toHaveBeenLastCalledWith("find_game", expect.anything());

    atTheDoor();
    answer(keys.one);
    expect(send).toHaveBeenLastCalledWith("start_solo", expect.anything());
    send.mockRestore();
  });

  it("should keep [E] on a dialogue with one choice, and E still means the first", () => {
    const { stage, keys, talkTo, answer, hub } = hubOnStage();
    talkTo("villager");
    const labels = stage.made
      .filter((m) => m.kind === "text" && !m.destroyed)
      .map((m) => String(m.args[2]));
    expect(labels).toContain("Leave  [E]");
    answer(keys.e);
    expect(hub.dialogue).toBeUndefined();
  });
});

describe("ESC menu by keyboard (reported 2026-10-29)", () => {
  // The menu's choices had no keys at all: ESC opened and closed it, and only a click could
  // pick Change who you are. With the mouse broken too, nothing led to the roster.
  it("should answer Change character on 1, with the number on its label", () => {
    const { hub, keys, press, stage, send, reply } = queuedHubOnStage();
    press(keys.esc);
    const labels = stage.made
      .filter((m) => m.kind === "text" && !m.destroyed)
      .map((m) => String(m.args[2]));
    expect(labels).toContain("Change character  [1]");

    press(keys.one);

    expect(send).toHaveBeenCalledWith("leave_hub", {});
    reply("world_left", {});
    expect(hub.scene.start).toHaveBeenCalledWith("MainMenuScene");
  });

  it("should answer the first choice on Enter", () => {
    const { hub, keys, press, send, reply } = queuedHubOnStage();
    press(keys.esc);
    press(keys.enter);
    expect(send).toHaveBeenCalledWith("leave_hub", {});
    reply("world_left", {});
    expect(hub.scene.start).toHaveBeenCalledWith("MainMenuScene");
  });

  it("should number Leave the queue 2 while queued", () => {
    const { hub, keys, press, stage } = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    hub.queued = true;
    press(keys.esc);
    const labels = stage.made
      .filter((m) => m.kind === "text" && !m.destroyed)
      .map((m) => String(m.args[2]));
    expect(labels).toContain("Leave the queue  [2]");
    press(keys.two);
    expect(send).toHaveBeenCalledWith("leave_queue", {});
    send.mockRestore();
  });
});

describe("camera on the player across visits (reported 2026-10-29)", () => {
  // The camera latched on when the player's entity id changed, and the id survived a scene
  // restart while every sprite was rebuilt: back from a run, or re-entering as the same
  // character, the camera sat where it was and the player walked off screen.
  it("should latch onto a new sprite after release, even for the same player", () => {
    const { hub } = hubOnStage();
    const first = { id: "sprite-1" };
    hub.keepCameraOn(first);
    hub.keepCameraOn(first);
    expect(hub.cameras.main.startFollow).toHaveBeenCalledTimes(1);

    hub.release("shutdown");
    const rebuilt = { id: "sprite-2" };
    hub.keepCameraOn(rebuilt);

    expect(hub.cameras.main.startFollow).toHaveBeenCalledTimes(2);
    expect(hub.cameras.main.startFollow).toHaveBeenLastCalledWith(rebuilt);
  });

  it("should forget whose body it followed on release", () => {
    const { hub } = hubOnStage();
    hub.selfEntityID = "me";
    hub.release("shutdown");
    expect(hub.selfEntityID).toBeNull();
  });
});

describe("HubScene the gear and bag overlay (FS-HRH2J §A R4–7, R10; §E R40)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should toggle the overlay on I and on B, staying in the hub", () => {
    const { hub, keys, gear, press } = hubOnStage();

    press(keys.i);
    expect(gear.open).toBe(true);
    press(keys.i);
    expect(gear.open).toBe(false);
    press(keys.b);
    expect(gear.open).toBe(true);
    press(keys.b);
    expect(gear.open).toBe(false);

    expect(hub.scene.start).not.toHaveBeenCalled();
    expect(hub.menu).toBeUndefined();
  });

  it("should keep walking with WASD while the overlay is open (R7)", () => {
    const { hub, keys, press } = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    press(keys.i);

    keys.w.isDown = true;
    hub.update(0, 16);

    expect(send).toHaveBeenLastCalledWith(ActionType.Move, { vx: 0, vy: -1 });
  });

  it("should close the overlay on ESC without opening the menu, and open the menu on the next (R5)", () => {
    const { hub, keys, gear, press } = hubOnStage();
    press(keys.i);

    press(keys.esc);
    expect(gear.open).toBe(false);
    expect(hub.menu).toBeUndefined();

    press(keys.esc);
    expect(hub.menu).toBeDefined();
  });

  it("should close a dialogue before the overlay on ESC (R5)", () => {
    const { hub, keys, gear, press, atTheDoor } = hubOnStage();
    press(keys.i);
    // walking into the Spire's gate with the overlay open raises the door's panel over it
    atTheDoor();
    expect(hub.dialogue).toBeDefined();

    press(keys.esc);
    expect(hub.dialogue).toBeUndefined();
    expect(gear.open).toBe(true);

    press(keys.esc);
    expect(gear.open).toBe(false);
    expect(hub.menu).toBeUndefined();
  });

  it("should do nothing on I or B while the ESC menu or a dialogue is open (R6)", () => {
    const { hub, keys, gear, press, talkTo } = hubOnStage();
    press(keys.esc);
    press(keys.i);
    press(keys.b);
    expect(gear.toggle).not.toHaveBeenCalled();

    press(keys.esc);
    talkTo("storekeeper");
    expect(hub.dialogue).toBeDefined();
    // the views talkTo stands up are too bare to ease each frame
    hub.views = new Map();
    hub.npcs = new Map();
    press(keys.i);
    press(keys.b);
    expect(gear.toggle).not.toHaveBeenCalled();
    // and the press is spent, not left to open the overlay once the dialogue closes
    press(keys.esc);
    hub.update(0, 16);
    expect(gear.open).toBe(false);
  });

  // FS-HRH2J § Change: Character and inventory apart (C2, C3, C7, C9). I-3EBCA-4.
  it("should toggle the character panel alone on C, staying in the hub (§ Change C2)", () => {
    const { hub, keys, gear, press } = hubOnStage();
    press(keys.c);
    expect(gear.toggleCharacter).toHaveBeenCalledTimes(1);
    expect(gear.toggle).not.toHaveBeenCalled();
    expect(gear.character).toBe(true);
    press(keys.i);
    expect(gear.open).toBe(true);
    expect(gear.character).toBe(true);
    press(keys.c);
    expect(gear.character).toBe(false);
    expect(gear.open).toBe(true);
    expect(hub.scene.start).not.toHaveBeenCalled();
  });

  it("should do nothing on C while the ESC menu or a dialogue is open, the press spent (§ Change C2)", () => {
    const { hub, keys, gear, press, talkTo } = hubOnStage();
    press(keys.esc);
    press(keys.c);
    expect(gear.toggleCharacter).not.toHaveBeenCalled();
    press(keys.esc);
    talkTo("storekeeper");
    hub.views = new Map();
    hub.npcs = new Map();
    press(keys.c);
    expect(gear.toggleCharacter).not.toHaveBeenCalled();
    press(keys.esc);
    hub.update(0, 16);
    expect(gear.character).toBe(false);
  });

  it("should close both panels on one ESC without opening the menu (§ Change C3)", () => {
    const { hub, keys, gear, press } = hubOnStage();
    press(keys.c);
    press(keys.i);
    press(keys.esc);
    expect(gear.isOpen()).toBe(false);
    expect(hub.menu).toBeUndefined();
  });

  it("should reach for the NPC beside the player on E while only the character panel is open (§ Change C7)", () => {
    const { hub, keys, gear, press, answer } = hubOnStage();
    press(keys.c);
    gear.equipKey.mockImplementation(() => false);
    hub.selfEntityID = "me";
    hub.views = new Map([["me", { pos: { x: 0, y: 0 } }]]);
    hub.npcs = new Map([
      [
        "keeper",
        {
          state: { entity_id: "keeper", name: "Keeper", function: "storyteller", position: { x: 10, y: 0 } },
          pos: { x: 10, y: 0 },
        },
      ],
    ]);
    answer(keys.e);
    expect(hub.dialogue).toBeDefined();
  });

  it("should give E to the overlay while it is open, reaching for no one beside the player (R10)", () => {
    const { hub, keys, gear, press, answer } = hubOnStage();
    press(keys.i);
    hub.selfEntityID = "me";
    hub.views = new Map([["me", { pos: { x: 0, y: 0 } }]]);
    hub.npcs = new Map([
      [
        "keeper",
        {
          state: { entity_id: "keeper", name: "Keeper", function: "storyteller", position: { x: 10, y: 0 } },
          pos: { x: 10, y: 0 },
        },
      ],
    ]);

    answer(keys.e);
    expect(gear.equipKey).toHaveBeenCalledTimes(1);
    expect(hub.dialogue).toBeUndefined();

    gear.open = false;
    answer(keys.e);
    expect(hub.dialogue).toBeDefined();
  });

  it("should hand the player's hub state and level to the stats panel on every state (R24)", () => {
    const { hub, gear } = hubOnStage();
    Object.assign(hub, {
      placePlayer: vi.fn(),
      renderStructures: vi.fn(),
      drawScenery: vi.fn(),
      renderNPCs: vi.fn(),
    });
    const me = { entity_id: "me", username: "Ignis", class: "mage", level: 3, position: AWAY };

    hub.renderState({ world_type: "hub", current_player: me, other_players: [], walls: [], gates: [] });

    expect(gear.updateCharacter).toHaveBeenCalledWith(me);
    expect(gear.setCharacterLevel).toHaveBeenCalledWith(3);
  });

  it("should forget the overlay on release, so the next visit composes a fresh one", () => {
    const { hub } = hubOnStage();
    hub.release("shutdown");
    expect(hub.gear).toBeUndefined();
  });
});

describe("HubScene reads the purse after a gold Take (FS-7TGZ3 R9)", () => {
  /** A gold Take, as the mailbox store records one. */
  const goldTake = () => useMailboxStore.setState({ goldTaken: useMailboxStore.getState().goldTaken + 1 });
  const withPurse = (hub: Record<string, unknown>) => {
    const refreshPurse = vi.fn();
    hub.gear = { ...fakeGear(), refreshPurse };
    return refreshPurse;
  };

  it("should read once per gold Take, and nothing for a mailbox change that is not one", () => {
    const { hub } = hubOnStage();
    const refreshPurse = withPurse(hub);
    (hub.watchGoldTakes as () => void)();

    goldTake();
    expect(refreshPurse).toHaveBeenCalledTimes(1);
    useMailboxStore.setState({ pulses: useMailboxStore.getState().pulses + 1 });
    expect(refreshPurse).toHaveBeenCalledTimes(1);
    hub.release("shutdown");
  });

  it("should stop listening on release, and a second visit's one Take reads exactly once", () => {
    const { hub } = hubOnStage();
    withPurse(hub);
    (hub.watchGoldTakes as () => void)();
    hub.release("shutdown");

    // a later visit's overlay, before that visit listens: the first visit's watch must be gone
    const second = withPurse(hub);
    goldTake();
    expect(second).not.toHaveBeenCalled();

    (hub.watchGoldTakes as () => void)();
    goldTake();
    expect(second).toHaveBeenCalledTimes(1);
    hub.release("shutdown");
  });
});

describe("HubScene the party popups under the letter panel (FS-1GZGD R40; FS-R82NV R32, FS-BJNYC R23)", () => {
  it("should hide the invite prompt and the ready check under the letter panel, as under the gear overlay and the menu", () => {
    const { hub, keys, gear, press } = hubOnStage();
    let letters = false;
    hub.mailbox = { isOpen: () => letters, close: vi.fn() };
    const covered = () => (hub.coversPopups as () => boolean)();

    expect(covered()).toBe(false);
    letters = true;
    expect(covered()).toBe(true);
    letters = false;
    gear.open = true;
    expect(covered()).toBe(true);
    gear.open = false;
    press(keys.esc);
    expect(hub.menu).toBeDefined();
    expect(covered()).toBe(true);
  });
});

describe("HubScene the stash chest's E (FS-VPD8Y R34, R43–44)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const CHEST_AT = HUB_STASH_CHEST.at;
  const QM_AT = { x: 1280, y: 270 };
  /** The Quartermaster's store as the scene's roofs hold it (hub_map.go's rect, walls included). */
  const golden = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Quartermaster's store")!;
  const STORE = { id: "store", x: golden.x, y: golden.y, width: golden.w, height: golden.h };
  /** The town's houses known to the scene, as once its walls are drawn. */
  const walled = (hub: Record<string, unknown>) => {
    hub.roofs = [{ house: STORE, baked: false, parts: [] }];
  };

  /** The player at `me`, the Quartermaster at his spot (or `qm`), and E pressed. */
  function pressAtTheChest(me: { x: number; y: number }, qm: { x: number; y: number } | null = QM_AT) {
    const stage = hubOnStage();
    const { hub, keys, answer } = stage;
    walled(hub);
    hub.selfEntityID = "me";
    hub.views = new Map([["me", { pos: me }]]);
    hub.npcs = new Map(
      qm
        ? [
            [
              "qm",
              {
                state: { entity_id: "qm", name: "Quartermaster", function: "storekeeper", position: qm },
                pos: qm,
              },
            ],
          ]
        : [],
    );
    answer(keys.e);
    return stage;
  }

  it("should open the overlay in stash mode on E within talk range of the chest", () => {
    const { gear, hub } = pressAtTheChest({ x: CHEST_AT.x + 30, y: CHEST_AT.y }, null);
    expect(gear.openStash).toHaveBeenCalledTimes(1);
    expect(gear.stashOpen()).toBe(true);
    expect(hub.dialogue).toBeUndefined();
  });

  it("should open the stash on E just inside the store's west wall (FS-B0H2D R14)", () => {
    const me = { x: STORE.x + 20 + 12, y: CHEST_AT.y };
    const { gear } = pressAtTheChest(me, null);
    expect(gear.openStash).toHaveBeenCalledTimes(1);
  });

  it("should offer nothing on E from the road west of the store, though the chest is in range (FS-B0H2D R14)", () => {
    const me = { x: STORE.x - 15, y: CHEST_AT.y };
    // within talk range of the chest, the store's west wall between
    expect(Math.hypot(me.x - CHEST_AT.x, me.y - CHEST_AT.y)).toBeLessThanOrEqual(80);
    const { gear, hub } = pressAtTheChest(me, null);
    expect(gear.openStash).not.toHaveBeenCalled();
    expect(hub.dialogue).toBeUndefined();
  });

  it("should offer nothing on E before the town's walls are drawn", () => {
    const stage = hubOnStage();
    const { hub, keys, gear, answer } = stage;
    hub.selfEntityID = "me";
    hub.views = new Map([["me", { pos: { ...CHEST_AT } }]]);
    hub.npcs = new Map();
    answer(keys.e);
    expect(gear.openStash).not.toHaveBeenCalled();
  });

  it("should open nothing on E out of the chest's range", () => {
    const { gear, hub } = pressAtTheChest({ x: CHEST_AT.x + 81, y: CHEST_AT.y }, null);
    expect(gear.openStash).not.toHaveBeenCalled();
    expect(hub.dialogue).toBeUndefined();
  });

  it("should give E to the Quartermaster when he is nearer than the chest", () => {
    const me = { x: QM_AT.x - 30, y: QM_AT.y };
    // in range of both, nearer him
    expect(Math.hypot(me.x - CHEST_AT.x, me.y - CHEST_AT.y)).toBeLessThanOrEqual(80);
    const { gear, hub } = pressAtTheChest(me);
    expect(gear.openStash).not.toHaveBeenCalled();
    expect(hub.dialogue).toBeDefined();
  });

  it("should give E to the chest when it is nearer than the Quartermaster", () => {
    const me = { x: CHEST_AT.x + 40, y: CHEST_AT.y };
    expect(Math.hypot(me.x - QM_AT.x, me.y - QM_AT.y)).toBeLessThanOrEqual(80);
    const { gear, hub } = pressAtTheChest(me);
    expect(gear.openStash).toHaveBeenCalledTimes(1);
    expect(hub.dialogue).toBeUndefined();
  });

  it("should leave E to the open overlay, opening no stash over it (FS-HRH2J R10)", () => {
    const stage = hubOnStage();
    const { hub, keys, gear, press, answer } = stage;
    walled(hub);
    press(keys.i);
    hub.selfEntityID = "me";
    hub.views = new Map([["me", { pos: { ...CHEST_AT } }]]);
    hub.npcs = new Map();
    answer(keys.e);
    expect(gear.equipKey).toHaveBeenCalledTimes(1);
    expect(gear.openStash).not.toHaveBeenCalled();
  });

  it("should not open the stash while the ESC menu or a dialogue is open (FS-HRH2J R6)", () => {
    const stage = hubOnStage();
    const { hub, keys, gear, press, answer, talkTo } = stage;
    walled(hub);
    const atTheChest = () => {
      hub.selfEntityID = "me";
      hub.views = new Map([["me", { pos: { ...CHEST_AT } }]]);
      hub.npcs = new Map();
    };
    press(keys.esc);
    atTheChest();
    answer(keys.e);
    expect(gear.openStash).not.toHaveBeenCalled();
    // the views above are too bare to ease each frame
    hub.views = new Map();
    press(keys.esc);
    expect(hub.menu).toBeUndefined();

    talkTo("storekeeper");
    expect(hub.dialogue).toBeDefined();
    atTheChest();
    answer(keys.e);
    expect(gear.openStash).not.toHaveBeenCalled();
  });

  it("should end stash mode with the overlay's keys, the next I opening the plain overlay (R37)", () => {
    const { hub, gear, keys, press } = pressAtTheChest({ ...CHEST_AT }, null);
    // the views above are too bare to ease each frame
    hub.views = new Map();
    expect(gear.stashOpen()).toBe(true);
    press(keys.esc);
    expect(gear.open).toBe(false);
    press(keys.i);
    expect(gear.open).toBe(true);
    expect(gear.stashOpen()).toBe(false);
  });

  it("should compose no stash mode outside the hub, and leave the Quartermaster as he was (R43–44)", () => {
    for (const scene of ["BarrowspireScene", "FieldScene", "../ui/EquipmentHud"]) {
      const source = readFileSync(new URL(`./${scene}.ts`, import.meta.url), "utf8");
      expect(source, scene).not.toMatch(/openStash|updateStash|STASH/);
    }
    expect(ELDER_TALE).toBeDefined();
  });
});

const { readFileSync } = await import("node:fs");
const { ArtLibrary } = await import("@/render/art/library");
const world = await import("@/render/world");
const { BLACKOUT } = world;
const iso = await import("@/render/iso");
const { BlackoutMask } = await import("@/render/world/blackoutMask");
type MaskLook = import("@/render/world/blackoutMask").MaskLook;

describe("HubScene the town buildings' interiors (FS-B0H2D R19–R22, R25)", () => {
  const { WALL_HEIGHT } = iso;

  const quiet = { warn: () => {} };
  const BAKED = new ArtLibrary(
    JSON.parse(readFileSync(new URL("../../public/art/manifest.json", import.meta.url), "utf8")),
    quiet,
  );
  const BARE = ArtLibrary.empty(quiet);

  /**
   * The town as hub_map.go walls it (FS-B0H2D R1–R3, R9, R12), from its golden: the Inn, the
   * store, the smithy, the Inn's partition across it and every furnishing.
   */
  const IDS = ["inn", "store", "smithy"];
  type Rect5 = [string, number, number, number, number];
  const BUILDINGS: Rect5[] = HUB_TOWN_GOLDEN.buildings.map((b, i) => [IDS[i], b.x, b.y, b.w, b.h]);
  const PARTITIONS: Rect5[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
    b.partitions.map((p): Rect5 => [IDS[i], p.x, p.y, p.w, p.h]),
  );
  const FURNISHINGS: Rect5[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
    b.furnishings.map((f): Rect5 => [IDS[i], f.x, f.y, f.w, f.h]),
  );
  const wall = (id: string, house: string, x: number, y: number, width: number, height: number) => ({
    entity_id: id,
    house_id: house,
    position: { x, y },
    width,
    height,
  });
  const SIDES = ["n", "w", "e", "sw", "se"];
  const BUILDING_WALLS = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
    townOutline(b).map(([x, y, w, h], k) => wall(`${IDS[i]}-${SIDES[k]}`, IDS[i], x, y, w, h)),
  );
  const PARTITION_WALLS = PARTITIONS.map(([house, x, y, w, h], i) => wall(`p${i}`, house, x, y, w, h));
  const FURNISHING_WALLS = FURNISHINGS.map(([house, x, y, w, h], i) => wall(`f${i}`, house, x, y, w, h));
  const TOWN = [...BUILDING_WALLS, ...PARTITION_WALLS, ...FURNISHING_WALLS];

  /** In the Inn's taproom, on the open floor before the bar. */
  const IN_INN = { x: 690, y: 370 };
  /** In the Inn's great hall, through the partition's door. */
  const IN_GREAT_HALL = { x: 460, y: 300 };
  /** In the Inn's door gap, in its south wall: inside, by the inclusive inside test (§A.2). */
  const IN_INN_DOORWAY = { x: 550, y: 480 };
  const IN_STORE = { x: 1280, y: 330 };
  const IN_SMITHY = { x: 1630, y: 230 };
  const OUTDOORS = { x: 1000, y: 800 };
  const ON_THE_STREET = { x: 900, y: 600 };

  interface InteriorHub {
    art: unknown;
    lightMap?: { add: ReturnType<typeof vi.fn> };
    selfEntityID: string | null;
    views: Map<string, unknown>;
    npcs: Map<string, { sprite: Made; name: Made; sigil?: Made; facing: string; pos: { x: number; y: number } }>;
    interiors: { house: { id: string }; parts: Made[]; lights: { source: { intensity: number } }[] }[];
    renderStructures(walls: unknown[]): void;
    renderNPCs(npcs: unknown[]): void;
    updateBuildings(): void;
    hideWhoIsElsewhere(): void;
  }

  /** The town drawn on the recording stage, with `art`, and the player standing at `at`. */
  function town(art: InstanceType<typeof ArtLibrary>, renderer?: { type: number }) {
    vi.mocked(world.addWalls).mockClear();
    vi.mocked(world.addBuildings).mockClear();
    vi.mocked(world.addProp).mockClear();
    vi.mocked(iso.addUprightBlock).mockClear();
    const { hub: raw, stage } = hubOnStage();
    const hub = raw as unknown as InteriorHub;
    if (renderer) {
      // a WebGL hub: the blackout masks with the house's own px (its drawing is stubbed by the test)
      const scene = hub as unknown as Record<string, unknown>;
      scene.renderer = renderer;
      scene.make = stage.add;
    }
    hub.art = art;
    hub.lightMap = { add: vi.fn() };
    // the placeholder villagers' textures, as though already made
    (hub as unknown as Record<string, unknown>).textures = { exists: () => true, get: (key: string) => ({ key }) };
    hub.renderStructures(TOWN);
    const npc = (entity: string, name: string, fn: string, at: { x: number; y: number }) => ({
      entity_id: entity,
      name,
      function: fn,
      appearance: "rust_trousers",
      position: at,
    });
    hub.renderNPCs([
      npc("drover", "Drover", "", { x: 418, y: 223 }),
      npc("smith", "Smith", "", { x: 1630, y: 175 }),
      npc("qm", "Quartermaster", "storekeeper", { x: 1280, y: 270 }),
      npc("cottar", "Cottar", "", { x: 600, y: 600 }),
    ]);
    const add = stage.add as Record<string, (...args: unknown[]) => Made>;
    const player = (pos: { x: number; y: number }) => ({
      pos,
      sprite: add.container(0, 0, []),
      name: add.text(0, 0, ""),
      legs: add.graphics(),
    });
    const self = player({ ...OUTDOORS });
    const rival = player({ ...IN_INN });
    // a teammate out on the street: the hide rule knows no party (FS-9PN7X §C.4)
    const mate = player({ ...ON_THE_STREET });
    hub.selfEntityID = "me";
    hub.views = new Map<string, unknown>([
      ["me", self],
      ["rival", rival],
      ["mate", mate],
    ]);
    /** Puts the player at `at` and runs the frame's roof and indoor tests. */
    const standIn = (at: { x: number; y: number }) => {
      self.pos.x = at.x;
      self.pos.y = at.y;
      hub.updateBuildings();
      hub.hideWhoIsElsewhere();
    };
    const room = (id: string) => hub.interiors.find((r) => r.house.id === id)!;
    standIn(OUTDOORS);
    return { hub, stage, self, rival, mate, standIn, room };
  }

  const sameRect = (args: unknown[], [, x, y, w, h]: [string, number, number, number, number]) =>
    args[1] === x && args[2] === y && args[3] === w && args[4] === h;

  it("should hand the buildings the building walls only, never a furnishing or the partition, with a door for each gap", () => {
    town(BAKED);
    const calls = vi.mocked(world.addBuildings).mock.calls;
    const drawn = calls.flatMap((call) => call[2] as readonly { entity_id: string }[]);
    expect(drawn.map((w) => w.entity_id).sort()).toEqual(BUILDING_WALLS.map((w) => w.entity_id).sort());
    // the hub has no DoorState: a town door gap holds a drawn door, shut outside, open inside (§B.5)
    for (const call of calls) expect(call[4]).toMatchObject({ doors: world.doorGaps });
  });

  it("should build each house's walls in the sheets its look names: the Inn's with no torch or lit window, every other house's in plain timber", () => {
    const { hub } = town(BAKED);
    const calls = vi.mocked(world.addBuildings).mock.calls;
    const innCall = calls.find((call) => (call[2] as readonly { house_id?: string }[]).some((w) => w.house_id === "inn"))!;
    const sheets = (innCall[4] as { sheets?: { lit?: string[]; back: [number, string][] } }).sheets!;
    expect(sheets.lit).toEqual([]);
    expect(sheets.back.map(([, kind]) => kind)).not.toEqual(expect.arrayContaining(["torch"]));
    expect((innCall[2] as readonly { house_id?: string }[]).every((w) => w.house_id === "inn")).toBe(true);
    for (const call of calls.filter((c) => c !== innCall)) {
      expect((call[4] as { sheets?: unknown }).sheets).toBe(walls_.TIMBER_WALLS);
      expect((call[2] as readonly { house_id?: string }[]).some((w) => w.house_id === "inn")).toBe(false);
    }
    const inn = (hub as unknown as { buildingLights: { house: { id: string } }[] }).buildingLights;
    expect(inn.filter((l) => l.house.id === "inn")).toEqual([]);
  });

  it("should draw the Inn's partition as low interior masonry inside the room, hidden with it under the roof", () => {
    const { room, standIn } = town(BAKED);
    const [call] = vi.mocked(world.addWalls).mock.calls.filter((c) => (c[2] as readonly { house_id?: string }[]).some((w) => w.house_id === "inn"));
    expect(call).toBeDefined();
    const walls = call[2] as { entity_id: string; position: { x: number; y: number }; width: number; height: number }[];
    // each segment trimmed to the inner faces of the north and south walls, the door gap between
    expect(walls.map((w) => [w.entity_id, w.position.x, w.position.y, w.width, w.height])).toEqual([
      ["p0", 505, 70, 20, 160],
      ["p1", 505, 310, 20, 160],
    ]);
    expect(call[4]).toBe(walls_.MASONRY_WALLS);
    expect(call[5]).toBe(walls_.INTERIOR_PARTITION);
    // drawn no other way: never as a furnishing's block, never as a building wall
    const blocks = vi.mocked(iso.addUprightBlock).mock.calls;
    expect(blocks.filter((c) => PARTITIONS.some((p) => sameRect(c, p)))).toHaveLength(0);
    standIn(IN_GREAT_HALL);
    expect(room("inn").parts.every((p) => p.visible)).toBe(true);
  });

  it("should floor the Inn in planks once its sheet is baked, and every other house in flagstone", () => {
    const floorOf = (art: InstanceType<typeof ArtLibrary>, house: { id: string; x: number; y: number; width: number; height: number }) => {
      const { hub } = hubOnStage();
      (hub as unknown as { art: unknown }).art = art;
      return (hub as unknown as { townGround(): import("@/render/world/ground").GroundLook }).townGround().floorFor?.(house);
    };
    const [, x, y, w, h] = BUILDINGS[0];
    const inn = { id: "inn", x, y, width: w, height: h };
    const [, sx, sy, sw, sh] = BUILDINGS[1];
    const store = { id: "store", x: sx, y: sy, width: sw, height: sh };
    expect(floorOf(BAKED, inn)).toBe(BAKED.has("ground_plank_floor") ? "ground_plank_floor" : undefined);
    expect(floorOf(BAKED, store)).toBeUndefined();
    // without the sheet the Inn keeps the flagstone, never bare ground
    expect(floorOf(BARE, inn)).toBeUndefined();
  });

  it("should draw the Inn's partition as a low stone placeholder without art, never a wall-high block", () => {
    town(BARE);
    const blocks = vi.mocked(iso.addUprightBlock).mock.calls;
    const inside: [string, number, number, number, number][] = [
      ["inn", 505, 70, 20, 160],
      ["inn", 505, 310, 20, 160],
    ];
    for (const r of inside) {
      const mine = blocks.filter((c) => sameRect(c, r));
      expect(mine, `${r}`).toHaveLength(1);
      expect(mine[0][5]).toBe(world.PLACEHOLDER_STONE);
      expect(mine[0][6]).toBeLessThan(WALL_HEIGHT);
    }
  });

  it("should stand each furnishing's prop on the centre of its rect", () => {
    town(BAKED);
    const props = vi.mocked(world.addProp).mock.calls.map(([, , sheet, at, q]) => ({ sheet, at, animation: q?.animation }));
    expect(props).toEqual(
      expect.arrayContaining([
        { sheet: "counter", at: { x: 727.5, y: 260 }, animation: "y" },
        { sheet: "inn_table", at: { x: 615, y: 150 }, animation: "narrow" },
        { sheet: "inn_table", at: { x: 622.5, y: 320 }, animation: "wide" },
        { sheet: "forge", at: { x: 1630, y: 137.5 }, animation: undefined },
      ]),
    );
    expect(props.map((p) => p.sheet)).toEqual(expect.arrayContaining(["stool", "shelf", "anvil"]));
  });

  it("should stand the great hall's long table and hearth as their props, or low placeholders until baked", () => {
    town(BAKED);
    const props = vi.mocked(world.addProp).mock.calls.map(([, , sheet, at, q]) => ({ sheet, at, animation: q?.animation }));
    const blocks = vi.mocked(iso.addUprightBlock).mock.calls;
    const cases: [string, Rect5, { x: number; y: number }, string | undefined][] = [
      ["long_table", ["inn", 352, 175, 50, 240], { x: 377, y: 295 }, "y"],
      ["hall_hearth", ["inn", 300, 70, 144, 48], { x: 372, y: 94 }, undefined],
    ];
    for (const [sheet, rect, at, animation] of cases) {
      if (BAKED.has(sheet)) expect(props).toContainEqual({ sheet, at, animation });
      else {
        const mine = blocks.filter((c) => sameRect(c, rect));
        expect(mine, sheet).toHaveLength(1);
        expect(mine[0][6]).toBeLessThan(WALL_HEIGHT);
      }
    }
  });

  it("should draw a low placeholder block on a furnishing the mirror does not know", () => {
    vi.mocked(iso.addUprightBlock).mockClear();
    const { hub } = hubOnStage() as unknown as { hub: InteriorHub };
    hub.art = BAKED;
    hub.renderStructures([...TOWN, wall("odd", "inn", 520, 350, 30, 20)]);
    const calls = vi.mocked(iso.addUprightBlock).mock.calls;
    expect(calls.filter((c) => sameRect(c, ["inn", 520, 350, 30, 20]))).toHaveLength(1);
    expect(calls.find((c) => sameRect(c, ["inn", 520, 350, 30, 20]))?.[6]).toBeLessThan(WALL_HEIGHT);
  });

  it("should draw every furnishing as a low placeholder block, never a wall, without art", () => {
    town(BARE);
    const calls = vi.mocked(iso.addUprightBlock).mock.calls;
    for (const f of FURNISHINGS) {
      const mine = calls.filter((c) => sameRect(c, f));
      expect(mine, `${f}`).toHaveLength(1);
      expect(mine[0][6]).toBeLessThan(WALL_HEIGHT);
    }
    // a building still closes: each wall a full-height placeholder block (FS-9PN7X §B.7)
    for (const w of BUILDING_WALLS)
      expect(calls.some((c) => sameRect(c, ["", w.position.x, w.position.y, w.width, w.height]) && c[6] === WALL_HEIGHT)).toBe(true);
  });

  it("should hide every room, and whoever is in one, while its roof is on", () => {
    const { hub, rival, room } = town(BAKED);
    for (const id of ["inn", "store", "smithy"]) {
      expect(room(id).parts.length, id).toBeGreaterThan(0);
      expect(room(id).parts.every((p) => !p.visible), id).toBe(true);
    }
    const drover = hub.npcs.get("drover")!;
    expect([drover.sprite.visible, drover.name.visible]).toEqual([false, false]);
    expect([rival.sprite.visible, rival.name.visible, rival.legs.visible]).toEqual([false, false, false]);
    expect(hub.npcs.get("cottar")!.sprite.visible).toBe(true);
  });

  describe("the walls' shadows on the ground (FS-V8FT3 §F)", () => {
    // a wall of no house, out on the street
    const LOOSE = { entity_id: "fence", house_id: undefined, position: { x: 1000, y: 700 }, width: 200, height: 20 };
    /** A polygon's corners in a fixed order, rounded, so two outlines of one shape compare equal. */
    const corners = (shape: readonly { x: number; y: number }[]) =>
      shape
        .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
        .sort()
        .join(" ");

    /** The town drawn on the stage with `art`, its ground a recorder of what it was handed. */
    function shadedTown(art: InstanceType<typeof ArtLibrary>) {
      const { hub: raw } = hubOnStage();
      const hub = raw as unknown as InteriorHub & { groundLayer?: unknown };
      const order: string[] = [];
      const ground = {
        paint: vi.fn(() => order.push("paint")),
        shade: vi.fn((_shadows: { shapes: { x: number; y: number }[][]; cuts: unknown[] }) => order.push("shade")),
      };
      hub.groundLayer = ground;
      hub.art = art;
      hub.lightMap = { add: vi.fn() };
      (hub as unknown as Record<string, unknown>).textures = { exists: () => true, get: (key: string) => ({ key }) };
      hub.renderStructures([...TOWN, LOOSE]);
      return { hub, ground, order };
    }

    it("should hand the ground every baked wall's shadow once, with the houses' floors: the street's wall full height, each house by its two looks, the Inn's partition low inside it", async () => {
      const { buildingShadows, planWallShadows, shadowsWithin } = await import("@/render/world/wallShadows");
      const { hub, ground, order } = shadedTown(BAKED);
      // the houses' floors first, then the shadows over them; drawn once, never again
      expect(order).toEqual(["paint", "shade"]);
      hub.renderStructures([...TOWN, LOOSE]);
      expect(ground.shade).toHaveBeenCalledTimes(1);

      const seed = world.worldSeed("hub");
      const { MASONRY_WALLS, TIMBER_WALLS, INTERIOR_PARTITION, planWalls, thicknessPx } = walls_;
      const houses = world.housesFrom(TOWN);
      const expected = [
        // a wall of no house casts as a back wall (R28)
        ...planWallShadows(planWalls([LOOSE], seed), thicknessPx(TIMBER_WALLS)),
        // each house outside by its exterior, inside by its interior, in its look's sheets (R26, R27)
        ...houses.flatMap((house) => {
          const own = BUILDING_WALLS.filter((w) => w.house_id === house.id);
          const { sheets } = interiors.townHouseLook(house);
          const [plan] = world.planBuildings(own, seed, sheets);
          const { outside, inside } = buildingShadows(plan, world.doorGaps(own), thicknessPx(sheets));
          return [...outside, ...inside];
        }),
        // the Inn's partition, low masonry, inside the Inn (R25)
        ...houses.flatMap((house) => {
          const inside = PARTITION_WALLS.filter((w) => w.house_id === house.id).map((w) => interiors.partitionInside(w, house));
          return shadowsWithin(planWalls(inside, seed, MASONRY_WALLS, INTERIOR_PARTITION), thicknessPx(MASONRY_WALLS), house);
        }),
      ];
      const [handed] = ground.shade.mock.calls[0];
      // nothing else: no roof, gable, door leaf, door head or furnishing casts
      expect(handed.shapes.map(corners).sort()).toEqual(expected.map(corners).sort());
      expect(handed.cuts).toEqual([]);
    });

    it("should cast each wall's shadow from the wall as drawn: drawn in another sheet or by another rule, its shadow follows the drawing", async () => {
      const real = await vi.importActual<typeof import("@/render/world")>("@/render/world");
      const { planWallShadows, shadowsWithin } = await import("@/render/world/wallShadows");
      const { MASONRY_WALLS, TIMBER_WALLS, INTERIOR_PARTITION, planWalls, thicknessPx } = walls_;
      // not the hub's own draw calls: the street's wall in masonry, the Inn's partition full height
      const fullHeight = { height: () => "back" as const, lit: () => false };
      vi.mocked(world.addWalls).mockImplementation((scene, art, walls, seed, sheets, rule) =>
        sheets === MASONRY_WALLS
          ? real.addWalls(scene, art, walls, seed, sheets, fullHeight)
          : real.addWalls(scene, art, walls, seed, MASONRY_WALLS, rule),
      );
      try {
        const { ground } = shadedTown(BAKED);
        const handed = ground.shade.mock.calls[0][0].shapes.map(corners);
        const seed = world.worldSeed("hub");
        const masonry = thicknessPx(MASONRY_WALLS);
        const [inn] = world.housesFrom(TOWN).filter((h) => h.id === "inn");
        const inside = PARTITION_WALLS.map((w) => interiors.partitionInside(w, inn));
        const drawn = [
          ...planWallShadows(planWalls([LOOSE], seed, MASONRY_WALLS), masonry),
          ...shadowsWithin(planWalls(inside, seed, MASONRY_WALLS, fullHeight), masonry, inn),
        ];
        for (const shape of drawn) expect(handed).toContain(corners(shape));
        // and not as the hub would have drawn them (a post's square is the same in either material)
        const same = new Set(drawn.map(corners));
        const planned = [
          ...planWallShadows(planWalls([LOOSE], seed), thicknessPx(TIMBER_WALLS)),
          ...shadowsWithin(planWalls(inside, seed, MASONRY_WALLS, INTERIOR_PARTITION), masonry, inn),
        ].filter((shape) => !same.has(corners(shape)));
        expect(planned.length).toBeGreaterThan(0);
        for (const shape of planned) expect(handed).not.toContain(corners(shape));
      } finally {
        vi.mocked(world.addWalls).mockImplementation(real.addWalls);
      }
    });

    it("should hand the ground no wall shadow without the wall art: placeholder walls never had one", () => {
      const { ground } = shadedTown(BARE);
      expect(ground.shade.mock.calls.flatMap(([shadows]) => shadows.shapes)).toEqual([]);
    });
  });

  describe("the stash chest (FS-VPD8Y R31–33)", () => {
    const chestSprite = (stage: { made: Made[] }) =>
      stage.made.filter((m) => m.kind === "sprite" && String(m.args[2]).startsWith("chest_"));
    const stashName = (stage: { made: Made[] }) =>
      stage.made.find((m) => m.kind === "text" && m.args[2] === STASH_NAME);

    it.each([
      ["with art", BAKED],
      ["without art", BARE],
    ] as const)("should stand one tinted run chest in the store, %s, hidden with its roof", (_how, art) => {
      const { stage, room, standIn } = town(art);
      const sprites = chestSprite(stage);
      expect(sprites).toHaveLength(1);
      const [chest] = sprites;
      expect(chest.tint).toBe(palette.stashChestTint);
      expect(room("store").parts).toContain(chest);
      expect(chest.visible).toBe(false);
      standIn(IN_STORE);
      expect(chest.visible).toBe(true);
      expect(room("store").parts.length).toBeGreaterThan(1);
    });

    it("should mark it with the amber Stash nameplate and sigil at marker depth, in sight over the roof (R33)", () => {
      const { stage } = town(BAKED);
      const name = stashName(stage)!;
      expect(name).toBeDefined();
      expect((name.args[3] as { color: string }).color).toBe(toCss(palette.markerFunction));
      expect(name.depth).toBe(MARKER_DEPTH.name);
      expect(name.visible).toBe(true);
    });

    it("should stand it open while this player's stash is open, and closed again after (R32)", () => {
      const { hub } = town(BAKED);
      const scene = hub as unknown as {
        gear: ReturnType<typeof fakeGear>;
        stashChest: { frame: string };
        showStashChest(): void;
      };
      scene.showStashChest();
      expect(scene.stashChest.frame).toBe("closed");
      scene.gear.openStash();
      scene.showStashChest();
      expect(scene.stashChest.frame).toBe("open");
      scene.gear.hide();
      scene.showStashChest();
      expect(scene.stashChest.frame).toBe("closed");
    });
  });

  it("should keep the Quartermaster's plate and sigil in sight over his roof, his body hidden (R21)", () => {
    const { hub } = town(BAKED);
    const qm = hub.npcs.get("qm")!;
    expect(qm.sprite.visible).toBe(false);
    expect(qm.name.visible).toBe(true);
    expect(qm.sigil?.visible).toBe(true);
  });

  it("should show the room and who is in it when the player walks in, and hide them again on the way out", () => {
    const { hub, rival, room, standIn } = town(BAKED);
    standIn(IN_INN);
    expect(room("inn").parts.every((p) => p.visible)).toBe(true);
    expect(room("smithy").parts.every((p) => !p.visible)).toBe(true);
    expect(hub.npcs.get("drover")!.sprite.visible).toBe(true);
    expect(hub.npcs.get("drover")!.name.visible).toBe(true);
    expect([rival.sprite.visible, rival.name.visible]).toEqual([true, true]);
    // the smith is in another house, still under its roof
    expect(hub.npcs.get("smith")!.sprite.visible).toBe(false);

    standIn(IN_STORE);
    expect(hub.npcs.get("qm")!.sprite.visible).toBe(true);
    expect(room("inn").parts.every((p) => !p.visible)).toBe(true);

    standIn(OUTDOORS);
    expect(room("store").parts.every((p) => !p.visible)).toBe(true);
    expect(rival.sprite.visible).toBe(false);
  });

  it("should light the Inn's hearth, candelabra and lanterns and the forge only while their roof is lifted (R22)", () => {
    const { hub, room, standIn } = town(BAKED);
    const forge = room("smithy").lights;
    const inn = room("inn").lights;
    expect(forge).toHaveLength(1);
    // one light for each of the Inn's lit pieces whose sheet is baked with its light
    const lit = (sheet: string) => BAKED.has(sheet) && !!BAKED.sheet(sheet)?.light;
    const innLit = [
      ...interiors.HUB_INDOOR_DRESSING.filter((s) => s.at.x < 870 && s.at.y < 490).map((s) => s.sheet),
      ...interiors.HUB_FURNISHINGS.filter((f) => f.rect.x < 870).map((f) => f.sheet),
    ].filter(lit);
    expect(inn).toHaveLength(innLit.length);
    expect(forge[0].source.intensity).toBe(0);
    const gate = hub.lightMap!.add.mock.calls.find(([source]) => source === forge[0].source)?.[1] as () => boolean;
    expect(gate()).toBe(false);

    standIn(IN_SMITHY);
    expect(forge[0].source.intensity).toBeGreaterThan(0);
    expect(inn.every((l) => l.source.intensity === 0)).toBe(true);
    expect(gate()).toBe(true);

    standIn(IN_INN);
    expect(inn.every((l) => l.source.intensity > 0)).toBe(true);
    expect(forge[0].source.intensity).toBe(0);

    standIn(OUTDOORS);
    expect(forge[0].source.intensity).toBe(0);
    expect(gate()).toBe(false);
  });

  describe("the indoor blackout and the one hide rule (FS-9PN7X §A.4, §C, §D)", () => {
    /** The blackout's Graphics: the one thing the hub draws at its depth. */
    const blackoutOf = (stage: { made: Made[] }) => {
      const dark = stage.made.filter((m) => m.kind === "graphics" && m.depth === BLACKOUT.depth);
      expect(dark).toHaveLength(1);
      return dark[0];
    };
    const stashMarks = (stage: { made: Made[] }) => {
      const at = stage.made.findIndex((m) => m.kind === "text" && m.args[2] === STASH_NAME);
      const sigil = stage.made.slice(at + 1).find((m) => m.kind === "graphics" && m.depth === MARKER_DEPTH.name)!;
      return [stage.made[at], sigil];
    };
    const shows = (who: { sprite: Made; name: Made; legs?: Made; sigil?: Made }) =>
      [who.sprite, who.name, who.legs, who.sigil].filter((m) => m !== undefined).map((m) => m!.visible);

    it("should stand over the light-map and halos, under the vignette and markers", () => {
      expect(BLACKOUT.depth).toBeGreaterThan(136);
      expect(BLACKOUT.depth).toBeLessThan(902);
      expect(BLACKOUT.depth).toBeLessThan(MARKER_DEPTH.name);
    });

    it("should snap on around the building the frame the player steps in, and off the frame they leave", () => {
      const { hub, stage, standIn } = town(BAKED);
      const dark = blackoutOf(stage);
      const view = (hub as unknown as { view: { building?: { id: string } } }).view;
      expect(dark.visible).toBe(false);
      standIn(IN_INN);
      expect(dark.visible).toBe(true);
      expect(view.building?.id).toBe("inn");
      standIn(IN_STORE);
      expect(view.building?.id).toBe("store");
      standIn(OUTDOORS);
      expect(dark.visible).toBe(false);
      expect(view.building).toBeUndefined();
    });

    // FS-PQ2TW R4; ADR-0015: a town building adds no world, so no world_entered and no arrival
    it("should play no arrival card stepping into and out of the Inn and the store", () => {
      const play = vi.spyOn(ArrivalCard.prototype, "play");
      const dark = vi.spyOn(ArrivalCard.prototype, "dark");
      const { hub, standIn } = town(BAKED);
      standIn(IN_INN);
      standIn(OUTDOORS);
      standIn(IN_STORE);
      standIn(OUTDOORS);
      expect(play).not.toHaveBeenCalled();
      expect(dark).not.toHaveBeenCalled();
      expect((hub as unknown as MenuHub).scene.start).not.toHaveBeenCalled();
      play.mockRestore();
      dark.mockRestore();
    });

    it("should snap on at the door gap, the threshold being inside", () => {
      const { stage, standIn } = town(BARE);
      standIn({ x: 550, y: 485 });
      expect(blackoutOf(stage).visible).toBe(true);
    });

    it("should hide everyone outside the player's building, the teammate too, body, legs and plate", () => {
      const { hub, self, rival, mate, standIn } = town(BAKED);
      standIn(IN_INN);
      expect(shows(mate)).toEqual([false, false, false]);
      expect(shows(hub.npcs.get("cottar")!)).toEqual([false, false]);
      expect(shows(hub.npcs.get("smith")!)).toEqual([false, false]);
      // whoever shares the building stays, and the player always
      expect(shows(rival)).toEqual([true, true, true]);
      expect(shows(hub.npcs.get("drover")!)).toEqual([true, true]);
      expect(shows(self)).toEqual([true, true, true]);
    });

    it("should show the street again, the teammate too, once the player walks out", () => {
      const { hub, self, mate, standIn } = town(BAKED);
      standIn(IN_INN);
      standIn(OUTDOORS);
      expect(shows(mate)).toEqual([true, true, true]);
      expect(shows(hub.npcs.get("cottar")!)).toEqual([true, true]);
      expect(shows(self)).toEqual([true, true, true]);
    });

    it("should hide the Quartermaster's and the Stash markers while the player is in another building", () => {
      const { hub, stage, standIn } = town(BAKED);
      const qm = hub.npcs.get("qm")!;
      const [name, sigil] = stashMarks(stage);
      standIn(IN_INN);
      expect(shows(qm)).toEqual([false, false, false]);
      expect([name.visible, sigil.visible]).toEqual([false, false]);
    });

    it("should keep the Quartermaster's and the Stash markers over the store from the street and inside it", () => {
      const { hub, stage, standIn } = town(BAKED);
      const qm = hub.npcs.get("qm")!;
      const [name, sigil] = stashMarks(stage);
      expect(shows(qm)).toEqual([false, true, true]);
      expect([name.visible, sigil.visible]).toEqual([true, true]);
      standIn(IN_STORE);
      expect(shows(qm)).toEqual([true, true, true]);
      expect([name.visible, sigil.visible]).toEqual([true, true]);
    });

    it("should mask the dark with the house's own px under WebGL: its walls, its room and who stands in it, never the street", () => {
      const show = vi.spyOn(BlackoutMask.prototype, "show").mockImplementation(() => {});
      const { hub, rival, mate, self, standIn, room } = town(BAKED, { type: 2 });
      const view = (hub as unknown as { view: { drawn: { house: { id: string }; shared: Made[]; interior: Made[] }[] } }).view;
      standIn(IN_INN);
      const look = show.mock.calls.at(-1)?.[0] as MaskLook;
      expect(look.house.id).toBe("inn");
      expect(look.wall).toBe(20);
      const stamps = new Set(look.stamps as unknown as Made[]);
      const inn = view.drawn.find((b) => b.house.id === "inn")!;
      const store = view.drawn.find((b) => b.house.id === "store")!;
      for (const p of [...inn.shared, ...inn.interior]) expect(stamps.has(p)).toBe(true);
      for (const p of [...store.shared, ...store.interior]) expect(stamps.has(p)).toBe(false);
      for (const p of room("inn").parts) expect(stamps.has(p)).toBe(true);
      for (const p of room("store").parts) expect(stamps.has(p)).toBe(false);
      // who stands in the Inn, the player too, body and legs; their plates stand over the dark
      for (const who of [self, rival]) {
        expect(stamps.has(who.sprite)).toBe(true);
        expect(stamps.has(who.legs)).toBe(true);
        expect(stamps.has(who.name)).toBe(false);
      }
      expect(stamps.has(hub.npcs.get("drover")!.sprite)).toBe(true);
      expect(stamps.has(mate.sprite)).toBe(false);
      expect(stamps.has(hub.npcs.get("cottar")!.sprite)).toBe(false);
      expect(stamps.has(hub.npcs.get("qm")!.sprite)).toBe(false);
      standIn(OUTDOORS);
      expect(show).toHaveBeenLastCalledWith(undefined);
      show.mockRestore();
    });

    it("should keep the geometric dark, and no mask, under the canvas renderer", () => {
      const show = vi.spyOn(BlackoutMask.prototype, "show");
      const { stage, standIn } = town(BAKED, { type: 1 });
      standIn(IN_INN);
      expect(show).not.toHaveBeenCalled();
      expect(blackoutOf(stage).visible).toBe(true);
      show.mockRestore();
    });

    it("should let the blackout go with the visit", () => {
      const { hub } = town(BAKED);
      (hub as unknown as { release(end: "shutdown"): void }).release("shutdown");
      expect((hub as unknown as { view?: unknown }).view).toBeUndefined();
    });
  });

  describe("closed buildings from outside, and the silhouette (FS-9PN7X §B, §E, I-9PN7X-5)", () => {
    interface ClosedHub {
      view: { drawn: { house: { id: string }; shared: Made[]; interior: Made[]; exterior: Made[] }[] };
      roofs: { house: { id: string }; parts: Made[] }[];
      occluders: { items: { sprite: Made }[] };
      drawScenery(walls: unknown[]): void;
    }
    const sheetOf = (m: Made) => String(m.args[3] ?? "").split("/")[0];
    /** The state frame a door was drawn showing. */
    const frameOf = (m: Made) => String(m.args[3] ?? "").split("/")[1];
    const drawn = (stage: { made: Made[] }, match: RegExp) =>
      stage.made.filter((m) => m.kind === "sprite" && !m.destroyed && match.test(sheetOf(m)));
    const shown = (ms: Made[]) => ms.length > 0 && ms.every((m) => m.visible);
    const hiddenAll = (ms: Made[]) => ms.length > 0 && ms.every((m) => !m.visible);
    const closed = (hub: unknown) => hub as ClosedHub;
    const building = (hub: unknown, id: string) => closed(hub).view.drawn.find((b) => b.house.id === id)!;
    const roof = (hub: unknown, id: string) => closed(hub).roofs.find((r) => r.house.id === id)!.parts;

    it("should close every building from the street: full-height exterior fronts, roof and gables, a shut door in each door gap", () => {
      const { stage } = town(BAKED);
      expect(shown(drawn(stage, /^wall_exterior_/))).toBe(true);
      expect(shown(drawn(stage, /^roof_(slope|ridge)$/))).toBe(true);
      expect(shown(drawn(stage, /^roof_gable_[xy]$/))).toBe(true);
      const doors = drawn(stage, /^door_x$/).filter((m) => m.visible);
      expect(doors).toHaveLength(BUILDINGS.length);
      // shut with no lock: a town door can't be acted on, so nothing amber on it
      expect(doors.every((m) => frameOf(m) === "shut")).toBe(true);
      // and the wall carried on over each door's lintel to the wall top: nothing of the room above it
      const heads = drawn(stage, /^door_head_x$/).filter((m) => m.visible);
      expect(heads).toHaveLength(BUILDINGS.length);
      expect(heads.map((m) => m.args.slice(0, 2))).toEqual(doors.map((m) => m.args.slice(0, 2)));
      // no dark opening is drawn anywhere (amended 2026-11-03)
      expect(drawn(stage, /dark/)).toHaveLength(0);
      // nothing of the cut-away: its fronts and their low posts are hidden
      expect(hiddenAll(drawn(stage, /^wall_front_/))).toBe(true);
      expect(hiddenAll(drawn(stage, /^post_front$/))).toBe(true);
      // the back walls stand in both looks
      expect(shown(drawn(stage, /^wall_back_/))).toBe(true);
    });

    it("should snap the player's building to its interior look in the frame they step in, and hide every other building whole", () => {
      const { hub, standIn } = town(BAKED);
      standIn(IN_INN);
      const inn = building(hub, "inn");
      expect(shown(inn.interior)).toBe(true);
      expect(shown(inn.shared)).toBe(true);
      expect(hiddenAll(inn.exterior)).toBe(true);
      expect(hiddenAll(roof(hub, "inn"))).toBe(true);
      // the store, its roof and its gables are outside the Inn: hidden by footprint (owner's addition 1)
      const store = building(hub, "store");
      expect(hiddenAll([...store.shared, ...store.interior, ...store.exterior])).toBe(true);
      expect(hiddenAll(roof(hub, "store"))).toBe(true);

      standIn(OUTDOORS);
      expect(shown(inn.exterior)).toBe(true);
      expect(hiddenAll(inn.interior)).toBe(true);
      expect(shown(store.exterior)).toBe(true);
      expect(shown(roof(hub, "inn"))).toBe(true);
      expect(shown(roof(hub, "store"))).toBe(true);
    });

    it("should open the door of the building the player stands in, from its doorway in, and shut it as they leave (§B.5, amended 2026-11-03)", () => {
      const { hub, stage, standIn } = town(BAKED);
      const doorOf = (id: string, look: "exterior" | "interior") =>
        building(hub, id)[look].filter((m) => sheetOf(m) === "door_x");
      const [innShut] = doorOf("inn", "exterior");
      const [innOpen] = doorOf("inn", "interior");
      expect(frameOf(innShut)).toBe("shut");
      const [innHead] = building(hub, "inn").exterior.filter((m) => sheetOf(m) === "door_head_x");
      expect(innHead.visible).toBe(true);
      expect(frameOf(innOpen)).toBe("open");
      expect([innShut.visible, innOpen.visible]).toEqual([true, false]);

      // standing in the gap is inside: the door is open the frame they step into it
      for (const spot of [IN_INN_DOORWAY, IN_INN]) {
        standIn(spot);
        expect([innShut.visible, innOpen.visible]).toEqual([false, true]);
        // the head is the exterior's: inside, the cut-away shows the open door alone
        expect(innHead.visible).toBe(false);
        // the other buildings' doors are outside the Inn: hidden whole, shut or open
        expect(hiddenAll([...doorOf("store", "exterior"), ...doorOf("store", "interior")])).toBe(true);
        const open = drawn(stage, /^door_x$/).filter((m) => m.visible);
        expect(open.map(frameOf)).toEqual(["open"]);
        expect(open[0].args.slice(0, 2)).toEqual(innOpen.args.slice(0, 2));
      }

      standIn(OUTDOORS);
      expect([innShut.visible, innOpen.visible]).toEqual([true, false]);
      expect(drawn(stage, /^door_x$/).filter((m) => m.visible).every((m) => frameOf(m) === "shut")).toBe(true);
      expect(innHead.visible).toBe(true);
    });

    it("should draw a building with no door gap closed, with no door (§B.5)", () => {
      const { hub: raw, stage } = hubOnStage();
      const hub = raw as unknown as InteriorHub;
      hub.art = BAKED;
      hub.lightMap = { add: vi.fn() };
      hub.renderStructures([
        wall("n", "shed", 300, 500, 200, 20),
        wall("w", "shed", 300, 500, 20, 160),
        wall("e", "shed", 480, 500, 20, 160),
        wall("s", "shed", 300, 640, 200, 20),
      ]);
      expect(drawn(stage, /^door_/)).toHaveLength(0);
      expect(shown(drawn(stage, /^wall_exterior_/))).toBe(true);
      expect(shown(drawn(stage, /^roof_gable_/))).toBe(true);
    });

    it("should put no building piece, roof, gable or chimney among the occluders; trees and tall props keep the fade", () => {
      const { hub } = town(BAKED);
      closed(hub).drawScenery(TOWN);
      const fading = new Set(closed(hub).occluders.items.map((i) => i.sprite));
      const parts = [
        ...closed(hub).view.drawn.flatMap((b) => [...b.shared, ...b.interior, ...b.exterior]),
        ...closed(hub).roofs.flatMap((r) => r.parts),
      ];
      expect(parts.some((m) => sheetOf(m) === "chimney")).toBe(true);
      for (const part of parts) expect(fading.has(part), sheetOf(part)).toBe(false);
      const trees = [...fading].filter((m) => /^tree_/.test(sheetOf(m)));
      expect(trees.length).toBeGreaterThan(0);
    });

    describe("the silhouette, the player only (§E.1–§E.3, §E.5)", () => {
      /** The player's body, its drawn bounds spanning the town so only depth decides what covers. */
      function withBody(t: ReturnType<typeof town>, at: { x: number; y: number }) {
        const add = t.stage.add as Record<string, (...args: unknown[]) => Made>;
        const body = add.sprite(0, 0, "art:characters-2", "knight/idle/0/0");
        (body as unknown as Record<string, unknown>).getBounds = () => ({ x: -1e5, y: -1e5, width: 2e5, height: 2e5 });
        (body as unknown as { name: string }).name = "body";
        t.self.sprite.children.push(body);
        const place = (pos: { x: number; y: number }) => {
          t.self.sprite.depth = iso.worldDepth(pos.x, pos.y);
          t.standIn(pos);
        };
        place(at);
        const [image] = t.stage.made.filter((m) => m.kind === "image" && m.args[2] === "__DEFAULT");
        const [mask] = t.stage.made.filter((m) => m.kind === "renderTexture");
        return { place, image, mask };
      }
      const BEHIND_INN = { x: 670, y: 30 };
      // nearer the viewer than every building's footprint
      const FAR_FRONT = { x: 1950, y: 980 };

      it("should show behind a building, masked to the pieces covering the player, and hide in front and inside", () => {
        const t = town(BAKED);
        const { place, image, mask } = withBody(t, FAR_FRONT);
        expect(image).toBeDefined();
        expect(image.visible).toBe(false);

        const draw = vi.fn(() => mask);
        (mask as unknown as Record<string, unknown>).draw = draw;
        place(BEHIND_INN);
        expect(image.visible).toBe(true);
        const masked = draw.mock.calls.map((c) => (c as unknown[])[0] as Made);
        expect(masked.length).toBeGreaterThan(0);
        // only what stands from outside: exterior and back walls, roofs and gables, never the cut-away
        const inside = new Set(closed(t.hub).view.drawn.flatMap((b) => b.interior));
        expect(masked.some((m) => inside.has(m))).toBe(false);
        expect(masked.some((m) => /^roof_/.test(sheetOf(m)))).toBe(true);

        place(FAR_FRONT);
        expect(image.visible).toBe(false);
        place(IN_INN);
        expect(image.visible).toBe(false);
      });

      // review round 1 (I-9PN7X-5): a placeholder roof covers the player as the baked pieces do
      it("should show through a placeholder roof without art, as through a baked one", () => {
        const t = town(BARE);
        const { place, image, mask } = withBody(t, FAR_FRONT);
        const draw = vi.fn(() => mask);
        (mask as unknown as Record<string, unknown>).draw = draw;
        place(BEHIND_INN);
        expect(image.visible).toBe(true);
        const masked = draw.mock.calls.map((c) => (c as unknown[])[0] as Made);
        const [slab] = roof(t.hub, "inn");
        expect(slab.kind).toBe("container");
        expect(masked).toContain(slab);
      });

      it("should make one silhouette, for the player, never for an NPC or another player", () => {
        const t = town(BAKED);
        const { place } = withBody(t, BEHIND_INN);
        place({ x: 1000, y: 60 });
        expect(t.stage.made.filter((m) => m.kind === "image" && m.args[2] === "__DEFAULT")).toHaveLength(1);
      });
    });

    describe("the street hides while the player is indoors (owner's addition 1)", () => {
      /** Props placed from these sheets, out of every building (indoor dressing shares sheets). */
      const placed = (sheets: RegExp) =>
        vi
          .mocked(world.addProp)
          .mock.calls.map((call, i) => ({ sheet: call[2] as string, at: call[3] as { x: number; y: number }, i }))
          .filter((c) => sheets.test(c.sheet))
          .filter((c) => !BUILDINGS.some(([, x, y, w, h]) => c.at.x >= x && c.at.x <= x + w && c.at.y >= y && c.at.y <= y + h))
          .map((c) => vi.mocked(world.addProp).mock.results[c.i].value as { sprite: Made; light?: { intensity: number } });

      it("should hide every outdoor object by its footprint, lamps and their glow too, and keep the room's own", () => {
        const t = town(BAKED);
        closed(t.hub).drawScenery(TOWN);
        const outdoor = placed(/^(lamp_post|tree_|bush|brazier|barrel|cart|stall|crate|well|fence)/);
        const lamps = placed(/^lamp_post$/);
        expect(outdoor.length).toBeGreaterThan(5);
        expect(lamps.length).toBeGreaterThan(0);
        const glow = lamps[0].light!;
        const lit = glow.intensity;
        expect(lit).toBeGreaterThan(0);
        const halo = t.hub.lightMap!.add.mock.calls.find(([source]) => source === glow)?.[1] as () => boolean;
        expect(halo()).toBe(true);

        t.standIn(IN_INN);
        expect(outdoor.every((o) => !o.sprite.visible)).toBe(true);
        expect(glow.intensity).toBe(0);
        expect(halo()).toBe(false);
        // the Inn's own furnishings and indoor dressing stay
        expect(t.room("inn").parts.every((p) => p.visible)).toBe(true);

        t.standIn(OUTDOORS);
        expect(outdoor.every((o) => o.sprite.visible)).toBe(true);
        expect(glow.intensity).toBe(lit);
        expect(halo()).toBe(true);
      });

      it("should light a building's wall flames only while the player is inside it (§D.6)", () => {
        const t = town(BAKED);
        const flames = t.hub.lightMap!.add.mock.calls.filter(([, when]) => typeof when === "function");
        const walls = closed(t.hub).view.drawn.flatMap((b) => [...b.shared, ...b.interior]);
        expect(walls.length).toBeGreaterThan(0);
        // the store and the smithy keep their wall flames; the Inn's walls carry none
        const lights = (t.hub as unknown as { buildingLights: { house: { id: string }; source: { intensity: number } }[] })
          .buildingLights;
        const [id, inside, other] = lights.some((l) => l.house.id === "store")
          ? (["store", IN_STORE, IN_SMITHY] as const)
          : (["smithy", IN_SMITHY, IN_STORE] as const);
        const own = lights.filter((l) => l.house.id === id);
        expect(own.length).toBeGreaterThan(0);
        expect(own.every((l) => l.source.intensity === 0)).toBe(true);
        t.standIn(inside);
        expect(own.every((l) => l.source.intensity > 0)).toBe(true);
        const gate = flames.find(([source]) => source === own[0].source)?.[1] as () => boolean;
        expect(gate()).toBe(true);
        t.standIn(other);
        expect(own.every((l) => l.source.intensity === 0)).toBe(true);
        expect(gate()).toBe(false);
      });
    });
  });

  it("should face the fixed residents their work, and everyone else the viewer (R25)", () => {
    const { hub } = town(BAKED);
    expect(hub.npcs.get("smith")!.facing).toBe("n");
    expect(hub.npcs.get("drover")!.facing).toBe("w");
    expect(hub.npcs.get("cottar")!.facing).toBe("se");
  });

  it("should give the fixed residents the ambient plate and no sigil (R21)", () => {
    const { hub } = town(BAKED);
    for (const id of ["drover", "smith"]) {
      expect(hub.npcs.get(id)!.sigil).toBeUndefined();
      expect(hub.npcs.get(id)!.name.args[3]).toMatchObject({ color: toCss(palette.markerHub) });
    }
  });
});

const { TOWN_LINES } = await import("./townLines");

describe("HubScene the town folk talk (FS-B0H2D R27–R29)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const said = (stage: { made: Made[] }) =>
    stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
  const ROLES = Object.values(TOWN_LINES).flatMap((l) => (l.role ? [l.role] : []));

  /** An NPC as the server sends it: a fixed resident has no function. */
  const npc = (id: string, name: string, fn: string, x: number, y = 0) => [
    id,
    { state: { entity_id: id, name, function: fn, position: { x, y } }, pos: { x, y } },
  ] as const;

  /** Stands the player at the origin among these NPCs, in this order, and presses to talk. */
  function talkAmong(...npcs: ReturnType<typeof npc>[]) {
    const scene = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    scene.hub.selfEntityID = "me";
    scene.hub.views = new Map([["me", { pos: { x: 0, y: 0 } }]]);
    scene.hub.npcs = new Map(npcs);
    scene.answer(scene.keys.e);
    return { ...scene, send };
  }

  it.each(Object.entries(TOWN_LINES))(
    "should let the %s tell their passages in order, the last offering only Farewell",
    (name, { role, passages }) => {
      const { hub, stage, keys, answer, choice } = talkAmong(npc("folk", name, "", 10));

      passages.forEach((passage, i) => {
        expect(said(stage)).toContain(passage);
        // only the passage now showing, never the one before or after
        for (const other of passages) if (other !== passage) expect(said(stage)).not.toContain(other);
        const last = i === passages.length - 1;
        expect(choice("farewell")).toBeDefined();
        expect(choice("on") !== undefined).toBe(!last);
        if (!last) answer(keys.e);
      });

      for (const r of ROLES) expect(said(stage).includes(r)).toBe(r === role);
      answer(keys.e);
      expect(hub.dialogue).toBeUndefined();
    },
  );

  it.each([
    ["Alewife", "Keeper of the Inn"],
    ["Smith", "Keeper of the forge"],
  ])("should name the %s's work on the card: %s", (name, role) => {
    const { stage } = talkAmong(npc("folk", name, "", 10));
    expect(said(stage)).toContain(role);
  });

  it.each(["Drover", "Gravedigger", "Pilgrim"])("should give the patron %s no role", (name) => {
    const { stage } = talkAmong(npc("folk", name, "", 10));
    for (const role of [...ROLES, "Speaker for the town", "Keeper of the stores"])
      expect(said(stage)).not.toContain(role);
  });

  it("should start every telling at the first passage", () => {
    const { hub, stage, keys, answer, choice } = talkAmong(npc("folk", "Alewife", "", 10));
    const { passages } = TOWN_LINES.Alewife;
    answer(keys.e);
    expect(said(stage)).toContain(passages[1]);

    choice("farewell")?.handlers.pointerup();
    expect(hub.dialogue).toBeUndefined();

    answer(keys.e);
    expect(said(stage)).toContain(passages[0]);
    expect(said(stage)).not.toContain(passages[1]);
    expect(said(stage)).toContain("Go on  [E]");
    expect(said(stage)).toContain("Farewell  [Esc]");
  });

  it("should give a name with no lines a resident's line and Leave, as before", () => {
    const { stage, choice } = talkAmong(npc("folk", "Cottar", "", 10));

    expect(choice("leave")).toBeDefined();
    expect(choice("on")).toBeUndefined();
    for (const { passages } of Object.values(TOWN_LINES))
      for (const passage of passages) expect(said(stage)).not.toContain(passage);
  });

  it("should keep the Elder and the Quartermaster as they were, whatever their name", () => {
    const warden = talkAmong(npc("w", "Alewife", "storyteller", 10));
    expect(said(warden.stage)).toContain(ELDER_TALE[0]);
    expect(said(warden.stage)).toContain("Speaker for the town");

    const quartermaster = talkAmong(npc("q", "Smith", "storekeeper", 10));
    expect(said(quartermaster.stage)).toContain("Keeper of the stores");
    expect(quartermaster.choice("on")).toBeUndefined();
  });

  it("should let the nearest NPC in range answer, not the first found (R28)", () => {
    const { stage } = talkAmong(
      npc("far", "Drover", "", 70),
      npc("out", "Pilgrim", "", 200),
      npc("near", "Alewife", "", 0, -30),
    );

    expect(said(stage)).toContain("ALEWIFE");
    expect(said(stage)).toContain(TOWN_LINES.Alewife.passages[0]);
    expect(said(stage)).not.toContain(TOWN_LINES.Drover.passages[0]);
  });

  it("should open nothing when no one stands in range", () => {
    const { hub } = talkAmong(npc("out", "Pilgrim", "", 81));
    expect(hub.dialogue).toBeUndefined();
  });

  it("should send nothing to the server to talk or to turn a page (R29)", () => {
    const { keys, answer, choice, send } = talkAmong(npc("folk", "Alewife", "", 10));
    answer(keys.e);
    answer(keys.e);
    choice("farewell")?.handlers.pointerup();

    expect(send).not.toHaveBeenCalled();
  });
});

// Leaving /game (the header's Trade link) destroys the game in the town: Phaser emits the scene's
// DESTROY only, after every plugin has destroyed itself (sceneEnd.standin.ts), and release's
// `this.input.setDefaultCursor("")` threw a TypeError on the input's nulled manager, which stopped
// the rest of the game's destroy (asked 2026-11-06).
describe("HubScene ending (game destroy on leaving /game)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A queued hub on Phaser's stand-in, its end wired by `listenForEnd`, the call create() makes:
   * the plugins booted first, so they hear each end before the hub does.
   */
  function hubToEnd() {
    const queued = queuedHubOnStage();
    const { hub } = queued;
    const { add, cameras, time, scene } = hub as unknown as Record<string, object>;
    const systems = sceneSystems({ add, cameras, time, scene });
    Object.assign(hub, systems.scene);
    (hub as unknown as { listenForEnd(): void }).listenForEnd();
    return { ...queued, systems };
  }

  it("should let the visit go on a game destroy without asking the destroyed plugins anything", () => {
    const { systems, off } = hubToEnd();

    expect(() => systems.destroy()).not.toThrow();
    expect(systems.touched).toEqual([]);
    // what lives past the game is still handed back
    expect(off).toHaveBeenCalledWith("queue_status");
    expect(off).toHaveBeenCalledWith("world_left");
  });

  it("should still hand the cursor back to the page on a stop", () => {
    const { systems } = hubToEnd();
    systems.input.manager!.defaultCursor = "pointer";

    systems.shutdown();

    expect(systems.input.manager?.defaultCursor).toBe("");
  });

  // Phaser's stop destroys the hub's keys and keeps their captures, the game's: E, I, B, 3 and the
  // rest would have their default prevented on the page through the next world (sceneEnd.ts).
  it("should hand back the captures its keys made on a stop", () => {
    const { hub, systems } = hubToEnd();
    (hub as unknown as { bindInput(): void }).bindInput();
    expect(systems.input.manager?.captures.length).toBeGreaterThan(0);

    systems.shutdown();

    expect(systems.input.manager?.captures).toEqual([]);
  });

});

// Reported 2026-11-12: a player who died in a run with a movement key held ran on by themselves in
// the town, no key held. The server routes a move by the player's record, and the run's end moves
// the record to the town before the client hears of it: the run's last frames, sent while the key
// was held and the death was on its way, walk the town body. The town sent only on a change from
// what it last sent, which on its first frame is "still", so with no key held it never stopped it.
describe("HubScene the first frame of a visit (stuck walking after a death with a key held)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A start of the town, its socket wired as the server reads it: the body walks the last move. */
  function visit() {
    vi.spyOn(socketManager, "on").mockImplementation(() => {});
    const stage = hubOnStage();
    const hub = stage.hub as unknown as MenuHub & { init(data?: { arrival?: boolean }): void };
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const moves = () => send.mock.calls.filter(([action]) => action === ActionType.Move);
    /** What the town body walks: the last move on the wire, whichever world sent it. */
    const body = () => moves().at(-1)?.[1];
    /** The run's last frames with the key held, landing on the town body after the run's end. */
    const runStride = () => socketManager.sendMessage(ActionType.Move, { vx: 1, vy: 0 });
    return { ...stage, hub, send, moves, body, runStride };
  }

  it("should stop the body on its first frame with no key held, after a stride the run sent", () => {
    const { hub, body, runStride } = visit();
    runStride();

    hub.init({ arrival: false });
    hub.update(0, 16);

    expect(body()).toEqual({ vx: 0, vy: 0 });
  });

  it("should stop it on a return too, though the visit before ended standing still", () => {
    const { hub, keys, body, runStride } = visit();
    // the visit before: a walk, stopped, then into the Spire
    keys.w.isDown = true;
    hub.update(0, 16);
    keys.w.isDown = false;
    hub.update(0, 16);
    hub.release("shutdown");
    runStride();

    hub.init({ arrival: false });
    hub.update(0, 16);

    expect(body()).toEqual({ vx: 0, vy: 0 });
  });

  it("should send that stop once, and nothing more while no key is held", () => {
    const { hub, moves, runStride } = visit();
    runStride();

    hub.init({ arrival: false });
    hub.update(0, 16);
    hub.update(0, 16);
    hub.update(0, 16);

    expect(moves().slice(1)).toEqual([[ActionType.Move, { vx: 0, vy: 0 }]]);
  });

  it("should send a key held into the visit as its first move, once", () => {
    const { hub, keys, moves, runStride } = visit();
    runStride();

    hub.init({ arrival: false });
    keys.w.isDown = true;
    hub.update(0, 16);
    hub.update(0, 16);

    expect(moves().slice(1)).toEqual([[ActionType.Move, { vx: 0, vy: -1 }]]);
  });
});

const { artLoaderStandin, shippedManifest, RESIDENT_ART_PAGES } = await import("@/render/art/artLoader.standin");
const { atlasTextureKey } = await import("@/render/art/library");

describe("HubScene art loading (FS-C4JWH §B R7)", () => {

  it("should queue the folk and nothing else, the resident art being loaded", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const hub = Object.assign(new HubScene(), art.scene) as unknown as { preload(): void };

    hub.preload();

    expect(art.queued).toEqual([atlasTextureKey("folk-0")]);
  });

  it("should evict the run's creatures and boss once its load completes (FS-C4JWH §C R11)", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: [...RESIDENT_ART_PAGES, "creatures-0", "creatures-1", "boss-0", "boss-1"].map(atlasTextureKey),
    });
    const hub = Object.assign(new HubScene(), art.scene) as unknown as { preload(): void };

    art.boot({ preload: () => hub.preload() });

    expect(art.textures.removed.sort()).toEqual(["boss-0", "boss-1", "creatures-0", "creatures-1"].map(atlasTextureKey));
    expect(art.textures.exists(atlasTextureKey("folk-0"))).toBe(true);
  });

  it("should show the torch bar over folk still downloading at 300 ms, gone before create, then fade the hub in (FS-C4JWH §D R17, A1)", () => {
    vi.useFakeTimers();
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const hub = Object.assign(new HubScene(), art.scene) as unknown as { preload(): void };
    let atCreate: boolean[] = [];

    art.boot({ preload: () => hub.preload(), create: () => (atCreate = art.drawn.map((d) => d.destroyed)) }, undefined, {
      hold: true,
    });
    vi.advanceTimersByTime(299);
    expect(art.drawn).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(art.drawn.filter((d) => d.kind === "text").map((d) => d.args[2])).toEqual([
      "LIGHTING THE TORCH",
      "THE SPIRE IS WAITING",
    ]);
    art.finish();
    vi.runAllTimers();
    vi.useRealTimers();

    expect(atCreate.length).toBeGreaterThan(0);
    expect(atCreate.every(Boolean)).toBe(true);
    expect(art.camera.fades.filter((f) => f.startsWith("fade"))).toEqual([
      "fadeIn(150, 18, 18, 18)",
      "fadeOut(150, 18, 18, 18)",
      "fadeIn(200, 18, 18, 18)",
    ]);
  });

  it("should show no bar over folk that come within 300 ms, and fade the hub in (FS-C4JWH A1.1, A1.4)", () => {
    vi.useFakeTimers();
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const hub = Object.assign(new HubScene(), art.scene) as unknown as { preload(): void };
    const create = vi.fn();

    art.boot({ preload: () => hub.preload(), create }, undefined, { hold: true });
    vi.advanceTimersByTime(120);
    art.finish();
    vi.runAllTimers();
    vi.useRealTimers();

    expect(art.drawn).toEqual([]);
    expect(create).toHaveBeenCalledOnce();
    expect(art.camera.fades).toEqual(["fadeIn(200, 18, 18, 18)", "reset"]);
  });

  it("should show no bar when the folk are already loaded (FS-C4JWH §D R17)", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: [...RESIDENT_ART_PAGES, "folk-0"].map(atlasTextureKey),
    });
    const hub = Object.assign(new HubScene(), art.scene) as unknown as { preload(): void };

    art.boot({ preload: () => hub.preload() });

    expect(art.drawn).toEqual([]);
  });
});

// The hub's server-sent one-shots can arrive while its folk download, before create has subscribed
// to them: they are held from init and handed over once create is done (FS-C4JWH Edge States).
describe("HubScene messages while its art downloads (FS-C4JWH Edge States)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show a queue_status that arrived before create, once create is done", () => {
    const stage = hubOnStage();
    const listeners = new Map<string, Listener>();
    vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
    vi.spyOn(socketManager, "onError").mockImplementation(() => {});
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});
    const hub = stage.hub as unknown as { queued: boolean; listenForQueue(): void; init(): void; openHeldMessages(): void };

    hub.init();
    listeners.get("queue_status")?.({ current: 2, total: 5 });
    expect(hub.queued).toBe(false);
    hub.listenForQueue();
    hub.openHeldMessages();

    expect(hub.queued).toBe(true);
  });

  it("should let go of the held messages when the hub stops before create", () => {
    const stage = hubOnStage();
    vi.spyOn(socketManager, "on").mockImplementation(() => {});
    const off = vi.spyOn(socketManager, "off").mockImplementation(() => {});
    const hub = stage.hub as unknown as { init(): void; events: Emitter };

    hub.init();
    hub.events.emit("shutdown");

    expect(off.mock.calls.map(([action]) => action)).toEqual(
      expect.arrayContaining(["queue_status", "world_handoff", "world_handoff_failed", "party_ready_check", "party_notice"]),
    );
  });
});

// FS-PQ2TW R8; ADR-0075 Decision 4. I-PQ2TW-2: the switch's verdict reaches the town with its start.
describe("HubScene arrival from its start (FS-PQ2TW R5–R8)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([true, false])("should keep the arrival %s its start was handed", (arrival) => {
    vi.spyOn(socketManager, "on").mockImplementation(() => {});
    const hub = hubOnStage().hub as unknown as { init(data?: { arrival?: boolean }): void; arrival: boolean };

    hub.init({ arrival });

    expect(hub.arrival).toBe(arrival);
  });

  it("should read a start with no verdict as no arrival, and not keep the last start's", () => {
    vi.spyOn(socketManager, "on").mockImplementation(() => {});
    const hub = hubOnStage().hub as unknown as { init(data?: { arrival?: boolean }): void; arrival: boolean };

    hub.init({ arrival: true });
    hub.init();

    expect(hub.arrival).toBe(false);
  });
});

const { ArrivalCard, ARRIVAL_CARD } = await import("@/ui/arrivalCard");

// FS-PQ2TW §A R2, R4, R5; §B R11, R12, R15; §C R19, R20. I-PQ2TW-4: coming into the town plays its
// card through the shared piece; a return plays nothing.
describe("HubScene arrival card (FS-PQ2TW; I-PQ2TW-4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type ArrivingHub = MenuHub &
    Record<string, unknown> & { init(data?: object): void; create(): void; relayoutHud(): void };

  /** A town started by a world switch that told it an arrival, or a return. */
  function startedAs(arrival: boolean) {
    vi.spyOn(socketManager, "on").mockImplementation(() => {});
    const stage = hubOnStage();
    const hub = stage.hub as unknown as ArrivingHub;
    const tweens = { add: vi.fn() };
    Object.assign(hub, {
      tweens,
      time: { delayedCall: vi.fn(), now: 0 },
      placePlayer: vi.fn(),
      renderStructures: vi.fn(),
      drawScenery: vi.fn(),
      renderNPCs: vi.fn(),
    });
    hub.views = new Map([["me", { pos: { ...AWAY } }]]);
    hub.init({ arrival });
    /** The words on screen now. */
    const words = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    /** The dark: the first thing the card stands up. */
    const veil = () => stage.stage.made.find((m) => m.kind === "rectangle" && m.depth === ARRIVAL_CARD.depth);
    const lifts = () => tweens.add.mock.calls.filter(([t]) => t.targets === veil() && t.alpha === 0).length;
    const render = (worldType = "hub") =>
      hub.renderState({
        world_type: worldType,
        current_player: { entity_id: "me", position: AWAY },
        other_players: [],
        walls: [],
        gates: [],
      });
    return { ...stage, hub, tweens, words, veil, lifts, render };
  }

  /** Runs `create` up to its camera, which stands in for everything create builds after. */
  function createUpToCamera(hub: ArrivingHub): void {
    const camera = {
      width: 800,
      height: 600,
      startFollow: vi.fn(),
      setBackgroundColor: () => {
        throw new Error("the rest of create");
      },
    };
    Object.assign(hub, { cameras: { main: camera } });
    expect(() => hub.create()).toThrow("the rest of create");
  }

  it("should put the dark up first thing at create on an arrival, with The Town's card over it (R11, R19, R20)", () => {
    const { hub, stage, words } = startedAs(true);

    createUpToCamera(hub);

    expect(stage.made[0].kind).toBe("rectangle");
    // the whole view, before the camera or anything of the town
    expect(stage.made[0].args).toEqual([0, 0, viewport.width, viewport.height, palette.inkDeep, 1]);
    expect(stage.made[0].depth).toBe(ARRIVAL_CARD.depth);
    expect(words()).toEqual(["The Town", "The Spire's shadow lies on every roof."]);
  });

  it("should bring the card in after the dark hold: the name is known at create (R13)", () => {
    const { hub, tweens, stage } = startedAs(true);

    createUpToCamera(hub);

    const cardIn = tweens.add.mock.calls.find(([t]) => t.alpha === 1);
    expect(cardIn?.[0].delay).toBe(ARRIVAL_CARD.darkHoldMs);
    // the heading, the rule and the line: everything made but the dark
    const card = cardIn?.[0].targets as Made[];
    expect(card).toHaveLength(3);
    card.forEach((part, i) => expect(part).toBe(stage.made[i + 1]));
  });

  it("should put nothing up at create on a return (R5)", () => {
    const { hub, stage } = startedAs(false);

    createUpToCamera(hub);

    expect(stage.made).toEqual([]);
  });

  it("should hold the dark until the town's first state is drawn, then lift it once (R12)", () => {
    const { hub, lifts, render } = startedAs(true);
    createUpToCamera(hub);
    expect(lifts()).toBe(0);

    render("run");
    expect(lifts()).toBe(0);

    render();
    render();
    expect(lifts()).toBe(1);
  });

  it("should play nothing on a return's states (R5)", () => {
    const { hub, stage, render, words } = startedAs(false);
    createUpToCamera(hub);

    render();

    expect(stage.made.filter((m) => m.kind === "rectangle")).toEqual([]);
    expect(words()).not.toContain("The Town");
  });

  it("should re-cover the view with the dark when the view changes (R16)", () => {
    const relayout = vi.spyOn(ArrivalCard.prototype, "relayout");
    const { hub } = startedAs(true);
    createUpToCamera(hub);

    hub.relayoutHud();

    expect(relayout).toHaveBeenCalled();
  });
});

// FS-JS7C8 §D R22, §E R47: every figure in the town faces its drawn movement; nothing turns one
// from outside its own motion, a `facing` on a state entry is never read, and no `face` is sent
describe("HubScene facing from movement, nothing on the wire (FS-JS7C8 §D R22, §E R47)", () => {
  type Hub = {
    views: Map<string, unknown>;
    selfEntityID: string | null;
    placeName(view: unknown): void;
    updateAppearance(view: unknown, player: unknown): void;
    placePlayer(player: unknown, isSelf: boolean): void;
    easeTowardServerPositions(time: number, delta: number): void;
  };
  /** A view whose baked animator is stepped and shown, as on main: nothing else turns it. */
  const view = (x: number) => ({
    sprite: { setPosition: vi.fn(), setDepth: vi.fn(), getByName: () => ({ displayHeight: 60 }) },
    pos: { x, y: 0 },
    target: { x, y: 0 },
    anim: { baked: true, facing: "se", step: vi.fn(), show: vi.fn() },
  });

  function onHub() {
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const hub = new HubScene() as unknown as Hub;
    const me = view(100);
    const them = view(300);
    hub.views = new Map([
      ["me", me],
      ["them", them],
    ]);
    hub.selfEntityID = "me";
    hub.placeName = vi.fn();
    return { hub, me, them, send };
  }

  it("should step the own body and every other from where it is drawn, and send no face", () => {
    const { hub, me, them, send } = onHub();

    hub.easeTowardServerPositions(0, 16);
    hub.easeTowardServerPositions(200, 16);

    expect(me.anim.step).toHaveBeenCalledWith(me.pos, 200, 16, false);
    expect(them.anim.step).toHaveBeenCalledWith(them.pos, 200, 16, false);
    expect(send.mock.calls.filter(([action]) => (action as string) === "face")).toEqual([]);
  });

  it("should keep no facing from a state entry, the own echo or another's", () => {
    const { hub, me, them } = onHub();
    hub.updateAppearance = vi.fn();
    const entry = (entity_id: string) => ({
      entity_id,
      position: { x: 1, y: 2 },
      direction: { vx: 0, vy: 0, speed: 0 },
      facing: "ne",
    });

    hub.placePlayer(entry("me"), true);
    hub.placePlayer(entry("them"), false);

    expect(Object.keys(me)).not.toContain("wireFacing");
    expect(Object.keys(them)).not.toContain("wireFacing");
  });
});

const { MINIMAP: TOWN_MINIMAP, WorldMinimap } = await import("@/ui/minimap");
const { TOP_RIGHT_HUD } = await import("@/ui/topRightColumn");
const { FULLSCREEN_BUTTON, anchorAt } = await import("@/render/viewport");
const { FullscreenButtonPlace } = await import("@/render/viewport/fullscreenButton");
/** The fullscreen button in the canvas's corner (FS-ZAJMH R18). */
const BUTTON_CORNER = { top: FULLSCREEN_BUTTON.inset, right: FULLSCREEN_BUTTON.inset };

// FS-P0HSP §A, §B, §E, §G (I-P0HSP-1): the town's minimap at the top of the top-right column.
describe("HubScene the town's minimap (FS-P0HSP; I-P0HSP-1)", () => {
  /** A Graphics or image as the minimap's stage makes it: where it stands, and what it drew. */
  function layer() {
    const calls: { name: string; args: unknown[] }[] = [];
    const l = { calls, x: 0, y: 0, depth: 0, visible: true, destroyed: false };
    const record = (name: string) => (...args: unknown[]) => (calls.push({ name, args }), l);
    return Object.assign(l, {
      clear: record("clear"),
      fillStyle: record("fillStyle"),
      fillRect: record("fillRect"),
      fillPoints: record("fillPoints"),
      fillCircle: record("fillCircle"),
      lineStyle: record("lineStyle"),
      strokeRect: record("strokeRect"),
      beginPath: record("beginPath"),
      moveTo: record("moveTo"),
      lineTo: record("lineTo"),
      closePath: record("closePath"),
      strokePath: record("strokePath"),
      setPosition: (x: number, y: number) => ((l.x = x), (l.y = y), l),
      setDepth: (d: number) => ((l.depth = d), l),
      setScrollFactor: () => l,
      setVisible: (v: boolean) => ((l.visible = v), l),
      destroy: () => void (l.destroyed = true),
    });
  }
  /** The town's walls as hub_map.go walls them, each with its house's id. */
  const TOWN_WALLS = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
    townOutline(b).map(([x, y, width, height], j) => ({
      entity_id: `house-${i}-wall-${j}`,
      house_id: `house-${i}`,
      position: { x, y },
      width,
      height,
    })),
  );

  type MapHub = MenuHub & Record<string, unknown> & { relayoutHud(): void };

  /** A hub whose states are rendered whole, its minimap's stage at hand, as create wires it. */
  function townWithMap() {
    const stage = hubOnStage();
    const hub = stage.hub as unknown as MapHub;
    const layers: ReturnType<typeof layer>[] = [];
    Object.assign(hub, {
      placePlayer: vi.fn(),
      renderStructures: vi.fn(),
      drawScenery: vi.fn(),
      renderNPCs: vi.fn(),
      minimapStage: {
        graphics: () => {
          const l = layer();
          layers.push(l);
          return l;
        },
        canvasImage: () => {
          const l = layer();
          layers.push(l);
          return l;
        },
      },
    });
    hub.views = new Map([["me", { pos: { ...AWAY } }]]);
    const render = (
      position = AWAY,
      others: { id: string; entity_id: string; position: { x: number; y: number } }[] = [],
      walls: unknown[] = TOWN_WALLS,
      npcs: unknown[] = [],
    ) =>
      hub.renderState({
        world_type: "hub",
        current_player: { id: "self", entity_id: "me", position },
        other_players: others,
        walls,
        gates: HUB_GATES,
        npcs,
      });
    const map = () => (hub.minimap as { map: InstanceType<typeof WorldMinimap> } | undefined)?.map;
    /** The dot layer, the last made. */
    const dots = () => layers[layers.length - 1];
    return { ...stage, hub, layers, render, map, dots };
  }

  beforeEach(() => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    useAuthStore.setState({ memberInfo: { id: "self" } as never });
  });
  afterEach(() => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    usePartyStore.setState({ party: null });
    useAuthStore.setState({ memberInfo: null });
    vi.restoreAllMocks();
  });

  it("should build no map before a state carries the town's walls, then one with the first that does", () => {
    const { render, map, layers } = townWithMap();
    render(AWAY, [], []);
    expect(map()).toBeUndefined();
    expect(layers).toHaveLength(0);
    render();
    expect(map()).toBeInstanceOf(WorldMinimap);
    render();
    // one minimap: map, two vignettes, marks, dots
    expect(layers).toHaveLength(5);
  });

  // FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C1, C2, C5 (owner 2026-11-12:
  // "地圖移動到最上面 全螢幕按鈕移動到地圖左側", "其他文字也要跟著往上移動"): nothing stands under the
  // town's map (FS-P0HSP §G.36), so only the map and the button move
  it.each([1080, 1280])(
    "should stand at the very top at logical width %i: right edge on TOP_RIGHT_HUD's x, top at y 10, the fullscreen button 6 px to its left on its top (§G.35; FS-56CKV §Change C1, C2)",
    (width) => {
      viewport.set({ width, height: 720, renderScale: 1 });
      const { hub, render, layers } = townWithMap();
      const button = new FullscreenButtonPlace();
      hub.fullscreenButton = button;
      render();
      const corner = anchorAt(TOP_RIGHT_HUD);
      expect(corner.x).toBe(width - 10);
      for (const l of layers) expect({ x: l.x, y: l.y }).toEqual({ x: corner.x - TOWN_MINIMAP.width, y: 10 });
      expect(button.current).toEqual({ top: 10, right: width - (corner.x - TOWN_MINIMAP.width - TOWN_MINIMAP.gap) });
    },
  );

  it("should follow its corner when the view changes (§G.35)", () => {
    const { hub, render, layers } = townWithMap();
    render();
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    hub.relayoutHud();
    for (const l of layers) expect([l.x, l.y]).toEqual([1270 - TOWN_MINIMAP.width, 10]);
  });

  it("should redraw the map on a change of the town only, never as the player walks (§A.4)", () => {
    const { render, map } = townWithMap();
    render({ x: 1000, y: 500 });
    render({ x: 1010, y: 500 });
    render({ x: 1200, y: 600 });
    expect(map()!.redraws).toBe(1);
    expect(map()!.dotRedraws).toBe(3);
    // a building's walls arriving late (never in practice): once more
    render({ x: 1200, y: 600 }, [], TOWN_WALLS.slice(0, 5));
    expect(map()!.redraws).toBe(2);
  });

  // review round 1: an unchanged town's plan is not built again on every 30 Hz state
  it("should hand the map the one plan it built while the town is unchanged (§A.4, §C.20)", () => {
    const { render, map } = townWithMap();
    render({ x: 1000, y: 500 });
    const show = vi.spyOn(map()!, "show");
    render({ x: 1010, y: 500 });
    render({ x: 1020, y: 500 });
    expect(show).toHaveBeenCalledTimes(2);
    expect(show.mock.calls[1][0]).toBe(show.mock.calls[0][0]);
  });

  // FS-P0HSP §C (I-P0HSP-2): the marks from the state's gates and function NPCs, redrawn only on a change
  it("should mark the gates, the stash and the Quartermaster, never the Elder, and redraw them only when they change (§C.14, §C.20)", () => {
    const { render, map, layers } = townWithMap();
    const resident = (x: number) => ({ entity_id: "r1", name: "Resident", function: "", position: { x, y: 700 } });
    const NPCS = [
      { entity_id: "elder", name: "Elder", function: "storyteller", position: { x: 1140, y: 680 } },
      { entity_id: "qm", name: "Quartermaster", function: "storekeeper", position: { x: 1280, y: 270 } },
    ];
    render(AWAY, [], TOWN_WALLS, [...NPCS, resident(600)]);
    render({ x: 1010, y: 500 }, [], TOWN_WALLS, [...NPCS, resident(640)]);
    render({ x: 1020, y: 500 }, [], TOWN_WALLS, [...NPCS, resident(680)]);
    expect(map()!.redraws).toBe(1);
    // the marks layer: one glyph a mark, each begun on its ring: tower, two teleports, chest, bag;
    // none for the Elder, who only tells a story (Nick, 2026-11-12)
    const marks = layers[3].calls.filter((c) => c.name === "fillStyle" && c.args[0] === palette.markerStroke);
    expect(marks).toHaveLength(5);
    // the Elder gone changes nothing the map shows; the Quartermaster gone does
    render({ x: 1020, y: 500 }, [], TOWN_WALLS, [NPCS[1], resident(680)]);
    expect(map()!.redraws).toBe(1);
    render({ x: 1020, y: 500 }, [], TOWN_WALLS, [resident(680)]);
    expect(map()!.redraws).toBe(2);
  });

  it("should dot the player and their party, no one else (§E.29, §E.30)", () => {
    usePartyStore.setState({
      party: {
        party_id: "p1",
        leader_id: "self",
        members: [
          { player_id: "self", name: "Aldric", class: "warrior", joined_at: "", where: "hub" },
          { player_id: "wren", name: "Wren", class: "archer", joined_at: "", where: "hub" },
        ],
        size: 4,
        reason: "joined",
        subject_id: "wren",
      } as never,
    });
    const { render, dots } = townWithMap();
    render(AWAY, [
      { id: "wren", entity_id: "e-wren", position: { x: 400, y: 300 } },
      { id: "stranger", entity_id: "e-stranger", position: { x: 1600, y: 800 } },
    ]);
    const radii = dots()
      .calls.slice(dots().calls.map((c) => c.name).lastIndexOf("clear") + 1)
      .filter((c) => c.name === "fillCircle")
      .map((c) => c.args[2]);
    // the ally's ring and dot, then the player's over it; the stranger draws nothing
    expect(radii).toEqual([3, 2, 4, 3]);
  });

  it("should draw the player's dot alone with no party (§E.30)", () => {
    const { render, dots } = townWithMap();
    render(AWAY, [{ id: "stranger", entity_id: "e-stranger", position: { x: 1600, y: 800 } }]);
    expect(dots().calls.filter((c) => c.name === "fillCircle").map((c) => c.args[2])).toEqual([4, 3]);
  });

  it("should go with the visit (§A.4)", () => {
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});
    const { hub, render, layers, map } = townWithMap();
    render();
    hub.release("destroy");
    expect(layers.every((l) => l.destroyed)).toBe(true);
    expect(map()).toBeUndefined();
  });

  // §G.37: the map clear of the fullscreen button, the queue line, the arrival card, the party
  // panel and the XP bar, and of a notice up to 628 px wide at 1080 (828 at 1280)
  it.each([
    [1080, 628],
    [1280, 828],
  ])("should keep clear of the HUD around it at logical width %i (§G.37)", (width, notice) => {
    const corner = anchorAt(TOP_RIGHT_HUD, { width, height: 720 });
    const left = corner.x - TOWN_MINIMAP.width;
    // the button beside the enlarged map too (FS-56CKV §Change C3, C7 as amended 2026-11-12): its
    // foot at y 30 above the notice band, its left edge (720 at 1080) never left of the arrival
    // card's widest line's right end nor over the party panel
    const enlargedButtonLeft = corner.x - 324 - TOWN_MINIMAP.gap - FULLSCREEN_BUTTON.height;
    if (width === 1080) expect(enlargedButtonLeft).toBe(720);
    expect(720).toBeLessThanOrEqual(enlargedButtonLeft);
    // the button beside the normal map (§Change C2, C7): its foot at y 30, above the notice band
    // (a 14 px line in 8 px padding centred on y 72) and the arrival card; its left edge right of
    // the arrival card's widest line and the party panel
    const buttonLeft = left - TOWN_MINIMAP.gap - FULLSCREEN_BUTTON.height;
    expect(10 + FULLSCREEN_BUTTON.height).toBeLessThan(72 - 15);
    expect(720).toBeLessThan(buttonLeft);
    // a notice centred on the view, on y 72, ends at the map's left edge
    expect(width / 2 + notice / 2).toBeLessThanOrEqual(left);
    // the arrival card's widest line (x 360–720) and the party panel (x 280–580) left of the map
    expect(720).toBeLessThan(left);
  });
});

// FS-P0HSP §F, §G (I-P0HSP-3): M steps the town's minimap through the run's three modes.
describe("HubScene the town's minimap modes (FS-P0HSP §F; I-P0HSP-3)", () => {
  function layer() {
    const l = { x: 0, y: 0, depth: 0, visible: true, destroyed: false, scrollFactor: 0 };
    const self: Record<string, unknown> = new Proxy(l as Record<string, unknown>, {
      get: (t, key) => {
        if (key in t) return t[key as string];
        if (key === "setPosition") return (x: number, y: number) => ((l.x = x), (l.y = y), self);
        if (key === "setDepth") return (d: number) => ((l.depth = d), self);
        if (key === "setScrollFactor") return (f: number) => ((l.scrollFactor = f), self);
        if (key === "setVisible") return (v: boolean) => ((l.visible = v), self);
        if (key === "destroy") return () => void (l.destroyed = true);
        return () => self;
      },
    });
    return { l, self };
  }
  /** A text the stage makes, measured 80 × 17. */
  function measuredText() {
    const { l, self } = layer();
    Object.assign(l, { width: 80, height: 17 });
    return self;
  }
  const WALLS = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
    townOutline(b).map(([x, y, width, height], j) => ({
      entity_id: `h${i}-${j}`,
      house_id: `h${i}`,
      position: { x, y },
      width,
      height,
    })),
  );

  function townWithModes(held: string | null = null) {
    const stage = hubOnStage();
    const hub = stage.hub as unknown as MenuHub & Record<string, unknown> & { relayoutHud(): void };
    const layers: ReturnType<typeof layer>["l"][] = [];
    const make = () => {
      const { l, self } = layer();
      layers.push(l);
      return self;
    };
    Object.assign(hub, {
      placePlayer: vi.fn(),
      renderStructures: vi.fn(),
      drawScenery: vi.fn(),
      renderNPCs: vi.fn(),
      minimapStage: { graphics: make, canvasImage: make },
      // the map mode icon's own objects, kept apart from the map's layers (FS-56CKV §Change: Map mode icon)
      // its texts measured 80 × 17, as Phaser would (the map name's among them, FS-56CKV §Change: Map name)
      modeIconStage: { graphics: () => layer().self, text: () => measuredText() },
    });
    hub.views = new Map([["me", { pos: { ...AWAY } }]]);
    const store = { held, writes: [] as string[] };
    const button = new FullscreenButtonPlace();
    hub.fullscreenButton = button;
    hub.minimapStore = () => ({
      getItem: () => store.held,
      setItem: (_key: string, value: string) => void store.writes.push(value),
      removeItem: () => {},
    });
    const keys: Record<string, (event?: Partial<KeyboardEvent>) => void> = {};
    const pointers: Record<string, (pointer?: { x: number; y: number; button?: number }) => void> = {};
    hub.input = {
      setDefaultCursor: vi.fn(),
      keyboard: { on: (name: string, fn: () => void) => void (keys[name] = fn) },
      on: (name: string, fn: () => void) => void (pointers[name] = fn),
    };
    (hub as unknown as { bindMinimapKey(): void }).bindMinimapKey();
    const pressM = (event: Partial<KeyboardEvent> = {}) => keys["keydown-M"]?.(event);
    const render = (others: unknown[] = []) =>
      hub.renderState({
        world_type: "hub",
        current_player: { id: "self", entity_id: "me", position: AWAY },
        other_players: others,
        walls: WALLS,
        gates: HUB_GATES,
        npcs: [],
      });
    const map = () => (hub.minimap as { map: InstanceType<typeof WorldMinimap> } | undefined)?.map;
    return { ...stage, hub, layers, store, pressM, render, map, button, pointers };
  }

  beforeEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));
  afterEach(() => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    usePartyStore.setState({ party: null });
    vi.restoreAllMocks();
  });

  it("should step normal, enlarged, overlay and round again on M, keeping each in this browser (§F.31, §F.32)", () => {
    const { pressM, render, map, store } = townWithModes();
    render();
    expect(map()!.mode).toBe("normal");
    pressM();
    expect(map()!.mode).toBe("enlarged");
    pressM();
    expect(map()!.mode).toBe("overlay");
    pressM();
    expect(map()!.mode).toBe("normal");
    expect(store.writes).toEqual(["enlarged", "overlay", "normal"]);
  });

  it("should change nothing on M before the map is built (§F.33)", () => {
    const { pressM, store, map } = townWithModes();
    pressM();
    expect(map()).toBeUndefined();
    expect(store.writes).toEqual([]);
  });

  type Arrange = (hub: Record<string, unknown>) => void;
  const GUARDS: [string, Arrange, Partial<KeyboardEvent>][] = [
    ["a held key's repeat", () => {}, { repeat: true }],
    ["chat typing", (hub) => void (hub.chatWindow = { isTyping: () => true }), {}],
    ["the menu panel up", (hub) => void (hub.menu = {}), {}],
    ["a dialogue card up", (hub) => void (hub.dialogue = {}), {}],
    ["the letter panel open", (hub) => void (hub.mailbox = { isOpen: () => true }), {}],
  ];
  it.each(GUARDS)("should change nothing on M with %s (§F.33)", (_what, arrange, event) => {
    const { hub, pressM, render, map, store } = townWithModes();
    render();
    arrange(hub as Record<string, unknown>);
    pressM(event);
    expect(map()!.mode).toBe("normal");
    expect(store.writes).toEqual([]);
  });

  // FS-56CKV §Change: Map mode icon (owner 2026-11-12: "右上角地圖左下角多加小icon hover顯示可以切換大小或是
  // 模式(M)"): a press on the icon in the map's bottom-left does what M does
  describe("the map mode icon (FS-56CKV §Change: Map mode icon; I-56CKV-8)", () => {
    const press = (x: number, y: number, button = 0) => ({ x, y, button });

    it("should step the mode on a press on the icon as M does, in the map's bottom-left and then the enlarged map's, kept in this browser (D2, D6)", () => {
      const { hub, render, map, store, pointers } = townWithModes();
      (hub as unknown as { bindMinimapPointer(): void }).bindMinimapPointer();
      render();
      pointers.pointerdown!(press(862, 109));
      expect(map()!.mode).toBe("enlarged");
      pointers.pointerdown!(press(754, 163));
      expect(map()!.mode).toBe("overlay");
      // beside the fullscreen button in its corner, as the overlay is up
      pointers.pointerdown!(press(1043, 16));
      expect(map()!.mode).toBe("normal");
      expect(store.writes).toEqual(["enlarged", "overlay", "normal"]);
    });

    it.each(GUARDS.slice(1))("should do nothing with a press on the icon with %s, M's guards (D6)", (_what, arrange) => {
      const { hub, render, map, store, pointers } = townWithModes();
      (hub as unknown as { bindMinimapPointer(): void }).bindMinimapPointer();
      render();
      arrange(hub as Record<string, unknown>);
      pointers.pointerdown!(press(862, 109));
      expect(map()!.mode).toBe("normal");
      expect(store.writes).toEqual([]);
    });

    it("should leave a press under the open gear overlay to it, and one off the icon to the town (D5)", () => {
      const { hub, render, map, pointers } = townWithModes();
      (hub as unknown as { bindMinimapPointer(): void }).bindMinimapPointer();
      render();
      hub.gear = { covers: () => true, isOpen: () => true };
      pointers.pointerdown!(press(862, 109));
      expect(map()!.mode).toBe("normal");
      hub.gear = undefined;
      pointers.pointerdown!(press(855, 109));
      expect(map()!.mode).toBe("normal");
    });

    // integration of FS-3EBCA R10 with D5: a press or hover on the corner row is the row's alone
    it("should leave a press on the corner row to the row, never stepping the mode (FS-3EBCA R10; D5)", () => {
      const { hub, render, map, store, pointers } = townWithModes();
      (hub as unknown as { bindMinimapPointer(): void }).bindMinimapPointer();
      render();
      (hub as Record<string, unknown>).corner = { covers: () => true, destroy: vi.fn(), relayout: vi.fn() };
      pointers.pointerdown!(press(862, 109));
      expect(map()!.mode).toBe("normal");
      expect(store.writes).toEqual([]);
    });

    // integration of FS-R82NV § Change C8 with D5: the party panel is drawn over the overlay and
    // the row, so a press or hover on it is the panel's alone
    it("should leave a press on the open party panel to the panel, never stepping the mode (FS-R82NV § Change C8; D5)", () => {
      const { hub, render, map, store, pointers } = townWithModes();
      (hub as unknown as { bindMinimapPointer(): void }).bindMinimapPointer();
      render();
      (hub as Record<string, unknown>).partyPanel = { covers: () => true, isOpen: () => true };
      pointers.pointerdown!(press(862, 109));
      expect(map()!.mode).toBe("normal");
      expect(store.writes).toEqual([]);
    });

    it("should have no icon before the map is built, and take no press for it (D4)", () => {
      const { hub, map, store, pointers } = townWithModes();
      (hub as unknown as { bindMinimapPointer(): void }).bindMinimapPointer();
      expect(() => pointers.pointerdown!(press(862, 109))).not.toThrow();
      expect(map()).toBeUndefined();
      expect(store.writes).toEqual([]);
    });
  });

  // FS-56CKV §Change: Map name (owner 2026-11-12: "小地圖右上角顯示目前地圖的名字", then
  // "兩倍地圖時地圖名稱顯示在全螢幕icon的左邊"): the town's name, giving way to the queue line
  describe("the map name (FS-56CKV §Change: Map name; I-56CKV-9)", () => {
    const nameOf = (hub: Record<string, unknown>) => (hub.minimap as { mapName?: { words: string; shown: boolean } } | undefined)?.mapName;
    const clear = (hub: Record<string, unknown>) => (hub as unknown as { keepMapNameClear(): void }).keepMapNameClear();
    const line = (bounds: object, visible = true) => ({ active: true, visible, getBounds: () => bounds });

    it("should name the town \"The Town\" on its minimap, as its arrival card does (E1, E6)", () => {
      const { hub, render } = townWithModes();
      expect(nameOf(hub)).toBeUndefined();
      render();
      expect(nameOf(hub)?.words).toBe("The Town");
      expect(nameOf(hub)?.shown).toBe(true);
    });

    it("should hide it while the queue line or its Leave button meets it beside the enlarged map, and show it once they go (E7)", () => {
      const { hub, render, pressM } = townWithModes();
      render();
      pressM();
      clear(hub);
      expect(nameOf(hub)?.shown).toBe(true);
      // the 80 × 17 name stands at x 634–714, y 12–29, left of the button: the line runs over it
      Object.assign(hub, { queuePanel: line({ x: 600, y: 10, width: 200, height: 20 }) });
      clear(hub);
      expect(nameOf(hub)?.shown).toBe(false);
      Object.assign(hub, { queuePanel: line({ x: 600, y: 10, width: 200, height: 20 }, false), leaveButton: line({ x: 700, y: 10, width: 60, height: 20 }) });
      clear(hub);
      expect(nameOf(hub)?.shown).toBe(false);
      Object.assign(hub, { leaveButton: undefined, queuePanel: undefined });
      clear(hub);
      expect(nameOf(hub)?.shown).toBe(true);
    });
  });

  it("should build the map in the mode this browser kept, from a run or an earlier visit (§F.32)", () => {
    const { render, map, layers } = townWithModes("enlarged");
    render();
    expect(map()!.mode).toBe("enlarged");
    // the enlarged panel at the column's top, y 10, right-aligned (FS-56CKV §Change C3 as amended 2026-11-12)
    expect([layers[0].x, layers[0].y]).toEqual([1070 - 324, 10]);
  });

  // FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C2–C4 (owner 2026-11-12,
  // amended: "1.5倍地圖時全螢幕按鈕一樣要在地圖左側", replacing "地圖變2倍蛇才移動到右上角")
  it.each([1080, 1280])("should move the fullscreen button on M: beside the enlarged map at its left, to the corner for the overlay, beside the map back at normal, at width %i (FS-56CKV §Change C2–C4)", (width) => {
    viewport.set({ width, height: 720, renderScale: 1 });
    const { pressM, render, layers, button } = townWithModes();
    render();
    expect(button.current).toEqual({ top: 10, right: 232 });
    pressM();
    expect([layers[0].x, layers[0].y]).toEqual([width - 10 - 324, 10]);
    expect(button.current).toEqual({ top: 10, right: 10 + 324 + 6 });
    pressM();
    expect(button.current).toEqual(BUTTON_CORNER);
    pressM();
    expect(button.current).toEqual({ top: 10, right: 232 });
    expect([layers[0].x, layers[0].y]).toEqual([width - 10 - 216, 10]);
  });

  it("should hand the button's corner back when the visit ends (FS-56CKV §Change C6)", () => {
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});
    const { hub, render, button } = townWithModes();
    render();
    expect(button.current).toEqual({ top: 10, right: 232 });
    (hub as unknown as { release(end: string): void }).release("destroy");
    expect(button.current).toEqual(BUTTON_CORNER);
  });

  it("should leave the corner empty as the overlay, and stand it about the player each frame (§F.31, §G.35)", () => {
    usePartyStore.setState({
      party: {
        party_id: "p1",
        leader_id: "self",
        members: [
          { player_id: "self", name: "Aldric", class: "warrior", joined_at: "", where: "hub" },
          { player_id: "wren", name: "Wren", class: "archer", joined_at: "", where: "hub" },
        ],
        size: 4,
        reason: "joined",
        subject_id: "wren",
      } as never,
    });
    const { hub, pressM, render, map } = townWithModes("overlay");
    render([{ id: "wren", entity_id: "e-wren", position: { x: 400, y: 300 } }]);
    expect(map()!.panel).toBeNull();
    const follow = vi.spyOn(map()!, "follow");
    hub.selfEntityID = "me";
    hub.views = new Map([
      ["me", { pos: { x: 1010, y: 505 } }],
      ["e-wren", { pos: { x: 410, y: 300 } }],
    ]);
    (hub as unknown as { followMapOverlay(): void }).followMapOverlay();
    expect(follow).toHaveBeenCalledWith({ x: 1010, y: 505 }, { self: { x: 1010, y: 505 }, allies: [{ x: 410, y: 300 }] });
    pressM();
    expect(map()!.panel).toEqual({ width: 216, height: 108 });
  });

  it("should follow the overlay from update, after the figures are eased", () => {
    const { hub } = townWithModes();
    const order: string[] = [];
    for (const step of ["offerMenu", "offerGear", "sendMovementIntent", "easeTowardServerPositions", "offerConversation", "updateBuildings", "hideWhoIsElsewhere", "showStashChest", "carryTheTorch", "followMapOverlay"])
      hub[step] = () => void order.push(step);
    hub.update(0, 16);
    expect(order.indexOf("followMapOverlay")).toBeGreaterThan(order.indexOf("easeTowardServerPositions"));
  });
});

/**
 * A real party panel on a bare stand-in scene, refused by `refused`: the scene's own rule for T
 * and the Party icon (FS-R82NV R28; FS-3EBCA R8). Its invite field is a silent stand-in.
 */
function partyPanelOn(refused: () => boolean) {
  const any: unknown = new Proxy(() => any, { get: () => any, apply: () => any });
  const keyboard = new EventEmitter();
  const scene = {
    add: { graphics: () => any, text: () => any },
    input: Object.assign(new EventEmitter(), { keyboard }),
    events: new EventEmitter(),
  } as unknown as ConstructorParameters<typeof PartyPanel>[0];
  const panel = new PartyPanel(scene, {
    store: createPartyStore({ selfId: () => "me" }),
    world: () => null,
    selfId: () => "me",
    commands: { create: vi.fn(), invite: vi.fn(), kick: vi.fn(), transfer: vi.fn(), leave: vi.fn() },
    makeField: () => ({
      value: "",
      setEnabled: vi.fn(),
      moveTo: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      blur: vi.fn(),
      destroy: vi.fn(),
    }),
    activeElement: () => null,
    blocked: refused,
  });
  return { panel, pressT: () => keyboard.emit("keydown-T") };
}

// FS-3EBCA R8 and FS-R82NV § Change C2, C8 (owner 2026-11-12: "開道具欄跟角色欄時開不了隊伍": with the
// inventory or the character panel open the party panel would not open). I-3EBCA-7.
describe("HubScene the party panel over the inventory and the character panel (FS-3EBCA R8)", () => {
  type Partied = { partyPanel?: unknown; refusesParty(): boolean; mountCorner(): void };
  function partyInTown() {
    const env = hubOnStage();
    const hub = env.hub as unknown as typeof env.hub & Partied;
    const party = partyPanelOn(() => hub.refusesParty());
    hub.partyPanel = party.panel;
    hub.mountCorner();
    const f = cornerIconFrame("party", viewport);
    const icon = () =>
      env.stage.made.find((m) => m.kind === "zone" && !m.destroyed && m.args[0] === f.x && m.args[1] === f.y)!;
    return { ...env, hub, party, pressIcon: () => icon().handlers.pointerdown() };
  }

  it.each([
    ["the inventory", (gear: ReturnType<typeof fakeGear>) => gear.toggle()],
    ["the character panel", (gear: ReturnType<typeof fakeGear>) => gear.toggleCharacter()],
    [
      "both panels",
      (gear: ReturnType<typeof fakeGear>) => {
        gear.toggle();
        gear.toggleCharacter();
      },
    ],
  ])("should open and close the party panel on T and on the Party icon with %s open", (_open, open) => {
    const { gear, party, pressIcon } = partyInTown();
    open(gear);
    expect(gear.isOpen()).toBe(true);
    party.pressT();
    expect(party.panel.isOpen()).toBe(true);
    party.pressT();
    expect(party.panel.isOpen()).toBe(false);
    pressIcon();
    expect(party.panel.isOpen()).toBe(true);
    pressIcon();
    expect(party.panel.isOpen()).toBe(false);
    expect(gear.isOpen()).toBe(true);
  });

  it.each([
    ["a dialogue", (hub: Record<string, unknown>) => void (hub.dialogue = {})],
    ["the ESC menu", (hub: Record<string, unknown>) => void (hub.menu = {})],
    ["the letter panel", (hub: Record<string, unknown>) => void (hub.mailbox = { isOpen: () => true, close: vi.fn() })],
  ])("should still refuse T and the Party icon while %s owns the screen, the inventory open or not", (_owner, own) => {
    const { hub, gear, party, pressIcon } = partyInTown();
    gear.toggle();
    own(hub as unknown as Record<string, unknown>);
    party.pressT();
    pressIcon();
    expect(party.panel.isOpen()).toBe(false);
  });
});
