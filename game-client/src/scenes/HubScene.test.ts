import { afterEach, describe, expect, it, vi } from "vitest";

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
  return { ...real, addWalls: vi.fn(real.addWalls), addProp: vi.fn(real.addProp) };
});
vi.mock("@/render/iso", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/render/iso")>();
  return { ...real, addUprightBlock: vi.fn(real.addUprightBlock) };
});

const { HubScene, delveChoices, hubMenuChoices, WARDEN_TALE } = await import("./HubScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ActionType } = await import("@/assets/types/client");
const { palette, toCss } = await import("@/utils/canvasPalette");
const { BARROW_HEX } = await import("@/utils/theme");
const { MARKER_DEPTH } = await import("@/render/markers");

interface QueuePanelScene {
  queuePanel?: { active: boolean; setText(text: string): unknown };
  add: { text: (...args: unknown[]) => unknown };
  cameras: { main: { height: number } };
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
  x: number;
  y: number;
  width: number;
  height: number;
  children: Made[];
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
  const state = { open: false };
  return {
    get open() {
      return state.open;
    },
    set open(open: boolean) {
      state.open = open;
    },
    toggle: vi.fn(() => {
      state.open = !state.open;
    }),
    hide: vi.fn(() => {
      const was = state.open;
      state.open = false;
      return was;
    }),
    isOpen: () => state.open,
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
  leavingHub: boolean;
  scene: { start: ReturnType<typeof vi.fn> };
  time: { delayedCall: ReturnType<typeof vi.fn> };
  selfEntityID?: string;
  views: Map<string, unknown>;
  npcs: Map<string, unknown>;
  update(time: number, delta: number): void;
  offerConversation(): void;
  followGates(pos: { x: number; y: number }, gates: unknown[]): void;
  onFieldGate(destination: "forest" | "meadows"): void;
  renderState(state: unknown): void;
  listenForQueue(): void;
  release(): void;
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

  it("should raise an amber Leave button at the panel's right, in the HUD band, with the panel", () => {
    const { hub, reply, button } = queuedHubOnStage();
    expect(button()).toBeUndefined();

    reply("queue_status", { current: 1, total: 2 });

    const panel = hub.queuePanel as Made;
    const leave = button() as Made;
    expect(leave).toBeDefined();
    expect(leave.depth).toBe(1000);
    expect(leave.x).toBeGreaterThan(panel.x + panel.width);
    expect(leave.y).toBe(panel.y);
    const style = leave.args[3] as { color: string; fontSize: string; padding: unknown };
    const panelStyle = panel.args[3] as { color: string; fontSize: string; padding: unknown };
    expect(style.color).toBe(toCss(BARROW_HEX.amber));
    expect(style.fontSize).toBe(panelStyle.fontSize);
    expect(style.padding).toEqual(panelStyle.padding);
    expect(hub.leaveButton).toBe(leave);
  });

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

    hub.release();
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

    hub.release();

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
  };
  const gear = fakeGear();
  hub.add = stage.add;
  hub.gear = gear;
  hub.gearKeys = [keys.i, keys.b];
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
  position: { x: 40, y: 400 },
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

describe("delveChoices (FS-NSV3D §Requirements 1, 4; FS-0XMCP §Requirements 9)", () => {
  it.each([
    {
      queued: false,
      ids: ["solo", "queue", "dismiss"],
      registers: ["actionable", "actionable", "cancel"],
      // a door, not a keeper, and the warning kept
      line: "The Spire's door stands open. Few return whole,\nand fewer return twice.",
    },
    {
      queued: true,
      ids: ["dismiss"],
      registers: ["cancel"],
      line: "The delve is gathering. Wait, or leave the queue.",
    },
  ])("should offer $ids when queued is $queued", ({ queued, ids, registers, line }) => {
    const dialogue = delveChoices({ queued });

    expect(dialogue.line).toBe(line);
    expect(dialogue.choices.map((c) => c.id)).toEqual(ids);
    expect(dialogue.choices.map((c) => c.register)).toEqual(registers);
  });

  it("should label the three Descend alone, Wait for company, Not yet", () => {
    expect(delveChoices({ queued: false }).choices.map((c) => c.label)).toEqual([
      "Descend alone",
      "Wait for company",
      "Not yet",
    ]);
  });

  it("should hold the solo choice back while a start_solo is pending, and the others not", () => {
    const [solo, queue, dismiss] = delveChoices({ queued: false }).choices;

    expect(solo.enabled?.({ soloPending: true })).toBe(false);
    expect(solo.enabled?.({ soloPending: false })).toBe(true);
    expect(queue.enabled).toBeUndefined();
    expect(dismiss.enabled).toBeUndefined();
  });
});

describe("HubScene the Spire's door panel (FS-NSV3D §Requirements 1–6, FS-0XMCP §Requirements 8, 9)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show Descend alone, Wait for company and Not yet, amber and the cancel register", () => {
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
    expect((label("dismiss").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.arcane));
    // top to bottom down the card, in the spec's order
    expect(solo.y).toBeLessThan(queue.y);
    expect(queue.y).toBeLessThan(dismiss.y);
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

  it("should send find_game on Wait for company, as Descend did, and close", () => {
    const { hub, choice, atTheDoor, send } = queuedHubOnStage();
    atTheDoor();

    choice("queue")?.handlers.pointerup();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(ActionType.Find_Game);
    expect(hub.dialogue).toBeUndefined();
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

  it("should re-enable the choice and pass on the message as a passing notice when start_solo is refused", () => {
    const { hub, stage, choice, label, atTheDoor, send, refuse } = queuedHubOnStage();
    atTheDoor();
    const solo = choice("solo") as Made;
    solo.handlers.pointerup();

    refuse("start_solo", "Leave the queue first.");

    expect(hub.soloPending).toBe(false);
    expect(hub.dialogue).toBeDefined();
    expect(label("solo").color).toBe(toCss(BARROW_HEX.amber));
    const notice = stage.made.find(
      (m) => m.kind === "text" && m.args[2] === "Leave the queue first." && m.depth === 1000,
    ) as Made;
    expect(notice).toBeDefined();
    expect((notice.args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.vellum));
    expect(hub.time.delayedCall).toHaveBeenCalledTimes(1);

    solo.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should let a refusal with nothing pending change nothing", () => {
    const { hub, stage, refuse } = queuedHubOnStage();
    const drawn = stage.made.length;

    refuse("start_solo", "Leave the queue first.");

    expect(hub.soloPending).toBe(false);
    expect(stage.made.length).toBe(drawn);
  });

  it("should say in the client's words that the gear cannot be fetched when start_solo is refused for it", () => {
    const { hub, stage, choice, atTheDoor, refuse } = queuedHubOnStage();
    atTheDoor();
    choice("solo")?.handlers.pointerup();

    refuse("start_solo", "Your gear could not be fetched. Try again shortly.", "loadout_unavailable");

    expect(hub.soloPending).toBe(false);
    const notice = stage.made.find(
      (m) => m.kind === "text" && m.args[2] === "Your gear cannot be fetched. Try again shortly." && m.depth === 1000,
    );
    expect(notice).toBeDefined();
  });

  it("should pass on a refused find_game as a passing notice, gear in the client's words, and not queue", () => {
    const { hub, stage, choice, atTheDoor, refuse } = queuedHubOnStage();
    atTheDoor();
    choice("queue")?.handlers.pointerup();

    refuse("find_game", "Your gear could not be fetched. Try again shortly.", "loadout_unavailable");

    expect(hub.queued).toBe(false);
    const notice = stage.made.find(
      (m) => m.kind === "text" && m.args[2] === "Your gear cannot be fetched. Try again shortly." && m.depth === 1000,
    );
    expect(notice).toBeDefined();
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

    hub.release();

    expect(offError).toHaveBeenCalledWith("find_game");
  });

  it("should hand the start_solo refusals back and forget the pending send on release", () => {
    const { hub, choice, atTheDoor, offError } = queuedHubOnStage();
    atTheDoor();
    choice("solo")?.handlers.pointerup();

    hub.release();

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

  it("should ask to leave the hub on Change who you are, and start the main menu once it is left", () => {
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
    hub.release();

    expect(first?.destroyed).toBe(true);
    expect(hub.menu).toBeUndefined();

    press(keys.esc);
    expect(hub.menu).toBeDefined();
    expect(hub.menu).not.toBe(first);
  });
});

describe("HubScene changeCharacter leaves the hub (FS-G4VMQ §Requirements 25, 26)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The Change who you are row's label, whose colour says whether it can be pressed. */
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

    hub.release();

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

    hub.release();
    hub.followGates(SPIRE_GATE.position, HUB_GATES);

    // a fresh visit that starts inside the gate steps into it
    expect(doorIsOpen(choice)).toBe(true);
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

    hub.release();

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

    hub.release();
    hub.listenForQueue();
    standAt(MEADOWS_GATE.position);

    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("HubScene the Warden tells the story (FS-0XMCP §Requirements 24, 25)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const said = (stage: { made: Made[] }) =>
    stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));

  it("should tell up to three passages", () => {
    expect(WARDEN_TALE.length).toBeGreaterThan(0);
    expect(WARDEN_TALE.length).toBeLessThanOrEqual(3);
    // the last points a newcomer at the door
    expect(WARDEN_TALE[WARDEN_TALE.length - 1]).toMatch(/door/);
  });

  it("should go on through the passages, the last offering only Farewell", () => {
    const { hub, stage, keys, answer, choice, talkTo } = hubOnStage();
    talkTo("storyteller");

    WARDEN_TALE.forEach((passage, i) => {
      expect(said(stage)).toContain(passage);
      const last = i === WARDEN_TALE.length - 1;
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

    expect(said(stage)).not.toContain(WARDEN_TALE[0]);
    expect(choice("on")).toBeUndefined();
  });

  it("should go on with E, close on Farewell, and start again from the first passage", () => {
    const { hub, stage, keys, answer, choice, talkTo } = hubOnStage();
    talkTo("storyteller");
    answer(keys.e);
    expect(said(stage)).toContain(WARDEN_TALE[1]);

    choice("farewell")?.handlers.pointerup();
    expect(hub.dialogue).toBeUndefined();

    talkTo("storyteller");
    expect(said(stage)).toContain(WARDEN_TALE[0]);
    expect(said(stage)).not.toContain(WARDEN_TALE[1]);
    expect(said(stage)).toContain("Go on  [E]");
    expect(said(stage)).toContain("Farewell  [Esc]");
  });

  it.each([false, true])("should offer no queue, solo or leave choice when queued is %s", (queued) => {
    const { choice, talkTo, reply, send } = queuedHubOnStage();
    if (queued) reply("queue_status", { current: 1, total: 2 });

    talkTo("storyteller");
    for (let i = 0; i < WARDEN_TALE.length; i++) {
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
  it("should answer Change who you are on 1, with the number on its label", () => {
    const { hub, keys, press, stage, send, reply } = queuedHubOnStage();
    press(keys.esc);
    const labels = stage.made
      .filter((m) => m.kind === "text" && !m.destroyed)
      .map((m) => String(m.args[2]));
    expect(labels).toContain("Change who you are  [1]");

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

    hub.release();
    const rebuilt = { id: "sprite-2" };
    hub.keepCameraOn(rebuilt);

    expect(hub.cameras.main.startFollow).toHaveBeenCalledTimes(2);
    expect(hub.cameras.main.startFollow).toHaveBeenLastCalledWith(rebuilt, true, 0.1, 0.1);
  });

  it("should forget whose body it followed on release", () => {
    const { hub } = hubOnStage();
    hub.selfEntityID = "me";
    hub.release();
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
    hub.release();
    expect(hub.gear).toBeUndefined();
  });
});

const { readFileSync } = await import("node:fs");
const { ArtLibrary } = await import("@/render/art/library");
const world = await import("@/render/world");
const iso = await import("@/render/iso");

describe("HubScene the town buildings' interiors (FS-B0H2D R19–R22, R25)", () => {
  const { WALL_HEIGHT } = iso;

  const quiet = { warn: () => {} };
  const BAKED = new ArtLibrary(
    JSON.parse(readFileSync(new URL("../../public/art/manifest.json", import.meta.url), "utf8")),
    quiet,
  );
  const BARE = ArtLibrary.empty(quiet);

  /** The town as hub_map.go walls it (FS-B0H2D R1–R3, R9, R12): the Inn, the store, the smithy. */
  const BUILDINGS: [string, number, number, number, number][] = [
    ["inn", 470, 110, 400, 300],
    ["store", 1130, 150, 300, 240],
    ["smithy", 110, 50, 300, 240],
  ];
  const FURNISHINGS: [string, number, number, number, number][] = [
    ["inn", 715, 190, 25, 140],
    ["inn", 540, 185, 30, 40],
    ["inn", 540, 285, 30, 40],
    ["inn", 620, 240, 45, 40],
    ["smithy", 225, 120, 70, 35],
  ];
  const wall = (id: string, house: string, x: number, y: number, width: number, height: number) => ({
    entity_id: id,
    house_id: house,
    position: { x, y },
    width,
    height,
  });
  const BUILDING_WALLS = BUILDINGS.flatMap(([id, x, y, w, h]) => {
    const side = (w - 50) / 2;
    return [
      wall(`${id}-n`, id, x, y, w, 20),
      wall(`${id}-w`, id, x, y, 20, h),
      wall(`${id}-e`, id, x + w - 20, y, 20, h),
      wall(`${id}-sw`, id, x, y + h - 20, side, 20),
      wall(`${id}-se`, id, x + side + 50, y + h - 20, side, 20),
    ];
  });
  const FURNISHING_WALLS = FURNISHINGS.map(([house, x, y, w, h], i) => wall(`f${i}`, house, x, y, w, h));
  const TOWN = [...BUILDING_WALLS, ...FURNISHING_WALLS];

  const IN_INN = { x: 690, y: 370 };
  const IN_STORE = { x: 1280, y: 330 };
  const IN_SMITHY = { x: 260, y: 230 };
  const OUTDOORS = { x: 1000, y: 800 };

  interface InteriorHub {
    art: unknown;
    lightMap?: { add: ReturnType<typeof vi.fn> };
    selfEntityID: string | null;
    views: Map<string, unknown>;
    npcs: Map<string, { sprite: Made; name: Made; sigil?: Made; facing: string; pos: { x: number; y: number } }>;
    interiors: { house: { id: string }; parts: Made[]; lights: { source: { intensity: number } }[] }[];
    renderStructures(walls: unknown[]): void;
    renderNPCs(npcs: unknown[]): void;
    hideRoofOverhead(): void;
    hideWhoIsIndoors(): void;
  }

  /** The town drawn on the recording stage, with `art`, and the player standing at `at`. */
  function town(art: InstanceType<typeof ArtLibrary>) {
    vi.mocked(world.addWalls).mockClear();
    vi.mocked(world.addProp).mockClear();
    vi.mocked(iso.addUprightBlock).mockClear();
    const { hub: raw, stage } = hubOnStage();
    const hub = raw as unknown as InteriorHub;
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
      npc("drover", "Drover", "", { x: 590, y: 220 }),
      npc("smith", "Smith", "", { x: 260, y: 175 }),
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
    hub.selfEntityID = "me";
    hub.views = new Map<string, unknown>([
      ["me", self],
      ["rival", rival],
    ]);
    /** Puts the player at `at` and runs the frame's roof and indoor tests. */
    const standIn = (at: { x: number; y: number }) => {
      self.pos.x = at.x;
      self.pos.y = at.y;
      hub.hideRoofOverhead();
      hub.hideWhoIsIndoors();
    };
    const room = (id: string) => hub.interiors.find((r) => r.house.id === id)!;
    standIn(OUTDOORS);
    return { hub, stage, self, rival, standIn, room };
  }

  const sameRect = (args: unknown[], [, x, y, w, h]: [string, number, number, number, number]) =>
    args[1] === x && args[2] === y && args[3] === w && args[4] === h;

  it("should hand the wall pieces the building walls only, never a furnishing", () => {
    town(BAKED);
    const drawn = vi.mocked(world.addWalls).mock.calls[0][2] as readonly { entity_id: string }[];
    expect(drawn.map((w) => w.entity_id)).toEqual(BUILDING_WALLS.map((w) => w.entity_id));
  });

  it("should stand each furnishing's prop on the centre of its rect", () => {
    town(BAKED);
    const props = vi.mocked(world.addProp).mock.calls.map(([, , sheet, at, q]) => ({ sheet, at, animation: q?.animation }));
    expect(props).toEqual(
      expect.arrayContaining([
        { sheet: "counter", at: { x: 727.5, y: 260 }, animation: "y" },
        { sheet: "inn_table", at: { x: 555, y: 205 }, animation: "narrow" },
        { sheet: "inn_table", at: { x: 555, y: 305 }, animation: "narrow" },
        { sheet: "inn_table", at: { x: 642.5, y: 260 }, animation: "wide" },
        { sheet: "forge", at: { x: 260, y: 137.5 }, animation: undefined },
      ]),
    );
    expect(props.map((p) => p.sheet)).toEqual(expect.arrayContaining(["stool", "inn_hearth", "shelf", "anvil"]));
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
    for (const w of BUILDING_WALLS)
      expect(calls.some((c) => sameRect(c, ["", w.position.x, w.position.y, w.width, w.height]) && c[6] === undefined)).toBe(true);
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

  it("should light the hearth and the forge only while their roof is lifted (R22)", () => {
    const { hub, room, standIn } = town(BAKED);
    const forge = room("smithy").lights;
    const hearth = room("inn").lights;
    expect(forge).toHaveLength(1);
    expect(hearth).toHaveLength(1);
    expect(forge[0].source.intensity).toBe(0);
    const gate = hub.lightMap!.add.mock.calls.find(([source]) => source === forge[0].source)?.[1] as () => boolean;
    expect(gate()).toBe(false);

    standIn(IN_SMITHY);
    expect(forge[0].source.intensity).toBeGreaterThan(0);
    expect(hearth[0].source.intensity).toBe(0);
    expect(gate()).toBe(true);

    standIn(OUTDOORS);
    expect(forge[0].source.intensity).toBe(0);
    expect(gate()).toBe(false);
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
