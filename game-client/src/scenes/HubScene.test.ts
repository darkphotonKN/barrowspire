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

const { HubScene, delveChoices, hubMenuChoices } = await import("./HubScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ActionType } = await import("@/assets/types/client");
const { toCss } = await import("@/utils/canvasPalette");
const { BARROW_HEX } = await import("@/utils/theme");

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
  handlers: Record<string, () => void>;
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
  const refuse = (action: string, message: string) =>
    errorListeners.get(action)?.({ action, error: message, message });
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

    button()?.handlers.pointerup();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.LeaveQueue, {});
    expect(hub.leavePending).toBe(true);

    button()?.handlers.pointerup();
    press(keys.esc);
    option("leave")?.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(1);
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
    button()?.handlers.pointerup();

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

    button()?.handlers.pointerup();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should let a reply that arrives after the join already failed change nothing", () => {
    const { hub, stage, reply, refuse, button } = queuedHubOnStage();
    reply("queue_status", { current: 2, total: 2 });
    button()?.handlers.pointerup();
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
  };
  hub.add = stage.add;
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
  return { hub, stage, keys, press, option, choice, label, talkTo, answer };
}

describe("delveChoices (FS-NSV3D §Requirements 1, 4)", () => {
  it.each([
    {
      queued: false,
      ids: ["solo", "queue", "dismiss"],
      registers: ["actionable", "actionable", "cancel"],
      line: "I keep the way into the Spire. Few return whole,\nand fewer return twice. Still set on descending?",
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

describe("HubScene delve NPC dialogue (FS-NSV3D §Requirements 1–6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show Descend alone, Wait for company and Not yet, amber and the cancel register", () => {
    const { hub, choice, label, talkTo } = queuedHubOnStage();

    talkTo("delve");

    expect(hub.dialogue).toBeDefined();
    const solo = choice("solo") as Made;
    const queue = choice("queue") as Made;
    const dismiss = choice("dismiss") as Made;
    expect(solo).toBeDefined();
    expect(queue).toBeDefined();
    expect(dismiss).toBeDefined();
    expect((label("solo").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.amber));
    expect((label("queue").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.amber));
    expect((label("dismiss").args[3] as { color: string }).color).toBe(toCss(BARROW_HEX.arcane));
    // left to right, in the spec's order
    expect(solo.x).toBeLessThan(queue.x);
    expect(queue.x).toBeLessThan(dismiss.x);
  });

  it("should keep the storekeeper's two choices as before", () => {
    const { choice, talkTo } = queuedHubOnStage();

    talkTo("storekeeper");

    expect(choice("pack")).toBeDefined();
    expect(choice("later")).toBeDefined();
    expect(choice("solo")).toBeUndefined();
  });

  it("should send find_game on Wait for company, as Descend did, and close", () => {
    const { hub, choice, talkTo, send } = queuedHubOnStage();
    talkTo("delve");

    choice("queue")?.handlers.pointerup();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(ActionType.Find_Game);
    expect(hub.dialogue).toBeUndefined();
  });

  it("should send one start_solo on Descend alone, keep the dialogue open and grey the choice until the reply", () => {
    const { hub, choice, label, talkTo, send } = queuedHubOnStage();
    talkTo("delve");
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
    const { keys, answer, talkTo, send } = queuedHubOnStage();
    talkTo("delve");

    answer(keys.enter);
    answer(keys.enter);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.StartSolo, {});
  });

  it("should dismiss on ESC and on Not yet, sending nothing", () => {
    const { hub, keys, answer, choice, talkTo, send } = queuedHubOnStage();
    talkTo("delve");
    answer(keys.esc);
    expect(hub.dialogue).toBeUndefined();

    talkTo("delve");
    choice("dismiss")?.handlers.pointerup();
    expect(hub.dialogue).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("should show the queued line and a dismiss only while queued", () => {
    const { hub, stage, keys, answer, choice, talkTo, send, reply } = queuedHubOnStage();
    reply("queue_status", { current: 1, total: 2 });

    talkTo("delve");

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
    const { hub, stage, choice, label, talkTo, send, refuse } = queuedHubOnStage();
    talkTo("delve");
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

  it("should hand the start_solo refusals back and forget the pending send on release", () => {
    const { hub, choice, talkTo, offError } = queuedHubOnStage();
    talkTo("delve");
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
          state: { entity_id: "keeper", name: "Keeper", function: "delve", position: { x: 10, y: 0 } },
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
    expect(stage.made.some((m) => m.kind === "text" && m.args[2] === "Keeper")).toBe(true);
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

describe("dialogue choices by mouse and by number (reported 2026-10-29)", () => {
  // Phaser hit-tests a container's child with the child's own scroll factor, not the
  // camera-fixed parent's, so once the camera had followed the player a click on a choice
  // landed beside it. The hit area lives outside the dialogue, camera-fixed, and dies with it.
  it("should press a choice through a camera-fixed hit area outside the dialogue", () => {
    const { hub, stage, choice, talkTo } = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    talkTo("delve");

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
    const { stage, keys, talkTo, answer } = hubOnStage();
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    talkTo("delve");
    const labels = stage.made
      .filter((m) => m.kind === "text" && !m.destroyed)
      .map((m) => String(m.args[2]));
    expect(labels).toContain("Descend alone  [1]");
    expect(labels).toContain("Wait for company  [2]");
    expect(labels).toContain("Not yet  [Esc]");

    answer(keys.two);
    expect(send).toHaveBeenLastCalledWith("find_game", expect.anything());

    talkTo("delve");
    answer(keys.one);
    expect(send).toHaveBeenLastCalledWith("start_solo", expect.anything());
    send.mockRestore();
  });

  it("should keep [E] on a dialogue with one choice, and E still means the first", () => {
    const { stage, keys, talkTo, answer, hub } = hubOnStage();
    talkTo("storekeeper");
    const labels = stage.made
      .filter((m) => m.kind === "text" && !m.destroyed)
      .map((m) => String(m.args[2]));
    expect(labels).toContain("Open pack  [E]");
    answer(keys.e);
    expect((hub.scene as { start: ReturnType<typeof vi.fn> }).start).toHaveBeenCalledWith("LoadoutScene");
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
  // restart while every sprite was rebuilt: back from the loadout, or re-entering as the same
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
