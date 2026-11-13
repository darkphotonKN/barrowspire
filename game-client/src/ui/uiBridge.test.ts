import { describe, expect, it } from "vitest";
import { EventEmitter } from "eventemitter3";
import {
  GameUiBridge,
  NO_FACTS,
  NO_UI,
  answering,
  lendUiBridge,
  reportWorld,
  uiBridgeOf,
  type UiBridge,
  type UiRequest,
  type World,
  type WorldReport,
} from "./uiBridge";

/** A game's registry: the per-game store a scene reads as `this.registry`. */
function registry() {
  const held = new Map<string, unknown>();
  return {
    get: (key: string) => held.get(key),
    set: (key: string, value: unknown) => void held.set(key, value),
  };
}

/** A bridge that records what the worlds tell it. */
function recording(): UiBridge & { heard: string[] } {
  const heard: string[] = [];
  return {
    heard,
    world: null,
    ui: { menuOpen: false },
    report: (report) => void heard.push(`report ${report.world}`),
    left: (world: World) => void heard.push(`left ${world}`),
    reportUi: () => {},
    changed: () => {},
    act: (run) => run(),
    play: (effect) => void heard.push(`play ${effect}`),
    lendSounds: () => {},
    request: (request) => void heard.push(`request ${request.kind}`),
    moved: (_pointer, onUi) => void heard.push(`moved ${onUi ? "over the UI" : "off it"}`),
    onWorld: () => () => {},
    showDialogue: (dialogue) => void heard.push(`showDialogue ${dialogue.text}`),
    closeDialogue: () => void heard.push("closeDialogue"),
    onScreen: () => () => {},
  };
}

/** A world's windows, all shut. */
const shut = () => ({ letter: false, party: false, inventory: false, character: false });

/** What a world hands the bridge beside its name (R9, R11): its windows, no dialogue, no facts, no answers. */
const side = (windows: () => ReturnType<typeof shut> = shut) => ({
  windows,
  blockers: () => ({ dialogue: false }),
  facts: () => NO_FACTS,
  answer: () => {},
});

describe("the UI bridge lent through the game's registry (FS-TQZ5J R8)", () => {
  it("should hand a scene the bridge its game was lent", () => {
    const store = registry();
    const bridge = recording();

    lendUiBridge(store, bridge);

    expect(uiBridgeOf(store)).toBe(bridge);
  });

  it("should hand none where none was lent, or to a scene with no game", () => {
    expect(uiBridgeOf(registry())).toBeNull();
    expect(uiBridgeOf(undefined)).toBeNull();
  });
});

describe("a world scene reporting its world (FS-TQZ5J R3, R4, R9)", () => {
  /** A world scene as it runs create: its game's registry, its scene events. */
  function worldScene(bridge: UiBridge | null) {
    const store = registry();
    if (bridge) lendUiBridge(store, bridge);
    return { registry: store, events: new EventEmitter() };
  }

  it("should report its world at once, and that it has left on its stop", () => {
    const bridge = recording();
    const scene = worldScene(bridge);

    reportWorld(scene, "field", side());
    expect(bridge.heard).toEqual(["report field"]);

    scene.events.emit("shutdown");
    scene.events.emit("shutdown");

    expect(bridge.heard).toEqual(["report field", "left field"]);
  });

  it("should report each start again: a restarted world is a left, then an entered", () => {
    const bridge = recording();
    const scene = worldScene(bridge);

    reportWorld(scene, "run", side());
    scene.events.emit("shutdown");
    reportWorld(scene, "run", side());

    expect(bridge.heard).toEqual(["report run", "left run", "report run"]);
  });

  it("should tell nothing on the game's destroy: the UI scene goes with the game, and its manager is asked nothing (R4)", () => {
    const bridge = recording();
    const scene = worldScene(bridge);
    reportWorld(scene, "hub", side());

    scene.events.emit("destroy");
    scene.events.emit("shutdown");

    expect(bridge.heard).toEqual(["report hub"]);
  });

  it("should report the world's windows as they are when read, not as they were at create (R9, R12)", () => {
    const bridge = new GameUiBridge();
    const scene = worldScene(bridge);
    const windows = shut();

    reportWorld(scene, "hub", side(() => windows));
    windows.inventory = true;

    expect(bridge.world?.world).toBe("hub");
    expect(bridge.world?.windows().inventory).toBe(true);
  });

  it("should hand the world its game's bridge, for its player actions and its minimap's step (R12)", () => {
    const bridge = recording();
    const scene = worldScene(bridge);

    const ui = reportWorld(scene, "field", side());
    ui.play("map_mode_switch");

    expect(ui.act(() => 3)).toBe(3);
    expect(bridge.heard).toEqual(["report field", "play map_mode_switch"]);
  });

  it("should hand a world in a game lent no bridge actions that run as they are, and a step that plays nothing", () => {
    const ui = reportWorld(worldScene(null), "run", side());

    expect(ui.act(() => "ran")).toBe("ran");
    expect(() => ui.play("map_mode_switch")).not.toThrow();
  });

  it("should do nothing in a game lent no bridge", () => {
    const scene = worldScene(null);

    expect(() => reportWorld(scene, "hub", side())).not.toThrow();
    expect(scene.events.listenerCount("shutdown")).toBe(0);
  });
});

// The channel alone: it holds what the scenes said and tells whoever listens which world is up. What
// the UI scene's life does with that is its own (uiSceneLifecycle.ts), so later slices grow only this.
describe("the game's UI bridge, the channel (FS-TQZ5J R8–R12)", () => {
  it("should be made with nothing of the game's: no scene manager", () => {
    const bridge = new GameUiBridge();

    expect(bridge.world).toBeNull();
    expect(bridge.ui).toEqual({ menuOpen: false });
  });

  it("should tell each listener every world reported, and none on its leaving (R9)", () => {
    const bridge = new GameUiBridge();
    const heard: (WorldReport | null)[] = [];
    bridge.onWorld((report) => heard.push(report));

    const hub = { world: "hub" as const, ...side() };
    const run = { world: "run" as const, ...side() };
    bridge.report(hub);
    bridge.report(hub);
    bridge.left("hub");
    bridge.report(run);

    expect(heard).toEqual([hub, hub, null, run]);
  });

  it("should tell nothing of a left from a world no longer the one reported", () => {
    const bridge = new GameUiBridge();
    bridge.report({ world: "hub", ...side() });
    bridge.report({ world: "field", ...side() });
    const heard: (WorldReport | null)[] = [];
    bridge.onWorld((report) => heard.push(report));

    bridge.left("hub");

    expect(heard).toEqual([]);
    expect(bridge.world?.world).toBe("field");
  });

  it("should stop telling a listener once it lets go", () => {
    const bridge = new GameUiBridge();
    const heard: (WorldReport | null)[] = [];
    const stop = bridge.onWorld((report) => heard.push(report));

    stop();
    bridge.report({ world: "hub", ...side() });

    expect(heard).toEqual([]);
  });
});

// FS-TQZ5J R9, R11: the world's blockers and facts in its report, and the UI scene's requests answered
// by the world reported, synchronously; a request with no world, or one the world has no answer for,
// does nothing. The corner row's toggles (I-TQZ5J-3), and the ESC menu's and Esc's (I-TQZ5J-4).
describe("the UI scene's requests and the world's blockers (FS-TQZ5J R9, R11)", () => {
  it("should hand a request to the world reported, answered before it returns", () => {
    const bridge = new GameUiBridge();
    const answered: UiRequest[] = [];
    bridge.report({ world: "field", ...side(), answer: (request) => void answered.push(request) });

    bridge.request({ kind: "toggle", window: "inventory" });
    bridge.request({ kind: "fall" });

    expect(answered).toEqual([{ kind: "toggle", window: "inventory" }, { kind: "fall" }]);
  });

  it("should hand a request to no world once it has left, nor before one is reported", () => {
    const bridge = new GameUiBridge();
    expect(() => bridge.request({ kind: "leaveRun" })).not.toThrow();
    const answered: UiRequest[] = [];
    bridge.report({ world: "hub", ...side(), answer: (request) => void answered.push(request) });
    bridge.left("hub");

    bridge.request({ kind: "toggle", window: "party" });

    expect(answered).toEqual([]);
  });

  it("should hand the UI scene the world's blockers as they are when read (R9)", () => {
    const bridge = new GameUiBridge();
    const scene = { registry: registry(), events: new EventEmitter() };
    lendUiBridge(scene.registry, bridge);
    const blockers = { dialogue: false };

    reportWorld(scene, "hub", { ...side(), blockers: () => blockers });
    blockers.dialogue = true;

    expect(bridge.world?.blockers()).toEqual({ dialogue: true });
  });

  it("should answer each request with the world's own answer for it, and ignore one it has none for (R11)", () => {
    const done: string[] = [];
    const answer = answering({
      inventory: () => void done.push("inventory"),
      party: () => void done.push("party"),
      close: { letter: () => void done.push("close letter"), dialogue: () => void done.push("close dialogue") },
      leaveQueue: () => void done.push("leave the queue"),
      changeCharacter: () => void done.push("change character"),
      musicLevel: (level) => void done.push(`music ${level}`),
    });

    answer({ kind: "toggle", window: "inventory" });
    answer({ kind: "toggle", window: "character" });
    answer({ kind: "toggle", window: "party" });
    answer({ kind: "close", window: "letter" });
    answer({ kind: "close", window: "gear" });
    answer({ kind: "close", window: "dialogue" });
    answer({ kind: "leaveQueue" });
    answer({ kind: "changeCharacter" });
    answer({ kind: "leaveRun" });
    answer({ kind: "fall" });
    answer({ kind: "musicLevel", level: 4 });

    expect(done).toEqual([
      "inventory",
      "party",
      "close letter",
      "close dialogue",
      "leave the queue",
      "change character",
      "music 4",
    ]);
  });

  it("should hand the UI scene the world's facts as they are when read (R9)", () => {
    const bridge = new GameUiBridge();
    const facts = { ...NO_FACTS };
    bridge.report({ world: "run", ...side(), facts: () => facts });

    facts.fallPending = true;

    expect(bridge.world?.facts().fallPending).toBe(true);
  });
});

// FS-TQZ5J R9, R10: the UI's state reaches the world reported as it changes, synchronously, and a
// world's word that its report changed reaches the UI scene's listeners at once.
describe("the UI's state and the world's changes (FS-TQZ5J R9, R10)", () => {
  it("should tell the world reported each change of the UI's state, once, before it returns", () => {
    const bridge = new GameUiBridge();
    const heard: boolean[] = [];
    bridge.report({ world: "hub", ...side(), heardUi: (ui) => void heard.push(ui.menuOpen) });

    bridge.reportUi({ menuOpen: true });
    bridge.reportUi({ menuOpen: true });
    bridge.reportUi({ menuOpen: false });

    expect(heard).toEqual([true, false]);
    expect(bridge.ui).toEqual({ menuOpen: false });
  });

  it("should keep the UI's state with no world reported, and tell none", () => {
    const bridge = new GameUiBridge();

    expect(() => bridge.reportUi({ menuOpen: true })).not.toThrow();
    expect(bridge.ui.menuOpen).toBe(true);
  });

  it("should tell the listeners the world reported again on its word that the report changed, and nothing with none reported", () => {
    const bridge = new GameUiBridge();
    const told: (string | null)[] = [];
    bridge.onWorld((report) => void told.push(report?.world ?? null));
    bridge.changed();
    bridge.report({ world: "run", ...side() });

    bridge.changed();

    expect(told).toEqual(["run", "run"]);
  });

  it("should hand a world the UI's state through its bridge, and a world in a game lent none a menu never open", () => {
    const bridge = new GameUiBridge();
    const scene = { registry: registry(), events: new EventEmitter() };
    lendUiBridge(scene.registry, bridge);
    const ui = reportWorld(scene, "field", side());

    bridge.reportUi({ menuOpen: true });

    expect(ui.ui.menuOpen).toBe(true);
    expect(NO_UI.ui.menuOpen).toBe(false);
    expect(() => NO_UI.changed()).not.toThrow();
  });
});

// FS-TQZ5J Amendment A2 R29, R30 (I-TQZ5J-7): the town hands the UI scene its dialogue as plain data,
// and takes it down, through the bridge; the UI scene hears it at once.
describe("the dialogue the world shows, told to the UI scene (FS-TQZ5J A2 R29)", () => {
  const card = {
    speaker: { name: "The Spire's door" },
    text: "The Spire's door stands open.",
    options: [{ id: "dismiss", label: "Not yet", register: "cancel" as const, enabled: true }],
  };

  it("should tell each screen listener a dialogue shown and its close, at once, until it lets go", () => {
    const bridge = new GameUiBridge();
    const told: (string | null)[] = [];
    const stop = bridge.onScreen({ dialogue: (d) => void told.push(d?.text ?? null) });

    bridge.showDialogue(card);
    bridge.closeDialogue();
    stop();
    bridge.showDialogue(card);

    expect(told).toEqual(["The Spire's door stands open.", null]);
  });

  it("should hand a world its bridge to show a dialogue through, and a world lent none a show that draws nothing", () => {
    const bridge = new GameUiBridge();
    const told: (string | null)[] = [];
    bridge.onScreen({ dialogue: (d) => void told.push(d?.text ?? null) });
    const scene = { registry: registry(), events: new EventEmitter() };
    lendUiBridge(scene.registry, bridge);

    reportWorld(scene, "hub", side()).showDialogue(card);

    expect(told).toEqual(["The Spire's door stands open."]);
    expect(() => (NO_UI.showDialogue(card), NO_UI.closeDialogue())).not.toThrow();
  });

  it("should carry only data: no function in the dialogue or its pick (ADR-0081)", () => {
    const bridge = new GameUiBridge();
    const shown: unknown[] = [];
    bridge.onScreen({ dialogue: (d) => void shown.push(d) });
    const picked: UiRequest[] = [];
    bridge.report({ world: "hub", ...side(), answer: (r) => void picked.push(r) });

    bridge.showDialogue(card);
    bridge.request({ kind: "pickDialogue", id: "dismiss" });

    expect(JSON.parse(JSON.stringify([shown, picked]))).toEqual([shown, picked]);
  });
});

// FS-TQZ5J Amendment A1 R27: a move the UI scene took still reaches the world reported, through the
// world's own input pass (uiScenePointer.ts), over nothing of the world's while over a UI piece.
describe("a move the UI scene took, heard by the world reported (FS-TQZ5J A1 R27)", () => {
  /** A world scene as reportWorld reaches it: its registry, events, and its input's own pass and cameras. */
  function worldScene(bridge: UiBridge) {
    const scene = {
      registry: registry(),
      events: new EventEmitter(),
      passes: [] as string[],
      cameras: { cameras: [{ inputEnabled: true }] },
      input: {
        update(type: number, pointers: object[]) {
          scene.passes.push(`pass ${type} x${pointers.length} cameras ${scene.cameras.cameras[0].inputEnabled}`);
          return false;
        },
      },
    };
    lendUiBridge(scene.registry, bridge);
    return scene;
  }
  const pointer = { x: 900, y: 680, event: {}, camera: null };

  it("should run it through the reported world's own input pass, its cameras out over a UI piece", () => {
    const bridge = new GameUiBridge();
    const scene = worldScene(bridge);
    reportWorld(scene, "run", side());

    bridge.moved(pointer, true);
    bridge.moved(pointer, false);

    expect(scene.passes).toEqual(["pass 1 x1 cameras false", "pass 1 x1 cameras true"]);
  });

  it("should hand it to no world once it has left, nor before one is reported", () => {
    const bridge = new GameUiBridge();
    const scene = worldScene(bridge);

    bridge.moved(pointer, true);
    reportWorld(scene, "field", side());
    scene.events.emit("shutdown");
    bridge.moved(pointer, true);

    expect(scene.passes).toEqual([]);
  });

  it("should hand it to a world that reported without an input (a stand-in) as nothing at all", () => {
    const bridge = new GameUiBridge();
    const scene = { registry: registry(), events: new EventEmitter() };
    lendUiBridge(scene.registry, bridge);
    reportWorld(scene, "hub", side());

    expect(() => bridge.moved(pointer, true)).not.toThrow();
  });
});
