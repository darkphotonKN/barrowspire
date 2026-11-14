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
    overUi: false,
    report: (report) => void heard.push(`report ${report.world}`),
    left: (world: World) => void heard.push(`left ${world}`),
    reportUi: () => {},
    changed: () => {},
    act: (run) => run(),
    play: (effect) => void heard.push(`play ${effect}`),
    lendSounds: () => {},
    request: (request) => void heard.push(`request ${request.kind}`),
    moved: (_pointer, onUi) => void heard.push(`moved ${onUi ? "over the UI" : "off it"}`),
    claimPress: () => void heard.push("claimPress"),
    pressClaimed: () => false,
    onWorld: () => () => {},
    showDialogue: (dialogue) => void heard.push(`showDialogue ${dialogue.text}`),
    closeDialogue: () => void heard.push("closeDialogue"),
    notice: (notice) => void heard.push(`notice ${notice.text}`),
    partySeen: () => void heard.push("partySeen"),
    gear: (message) => void heard.push(`gear ${message.kind}`),
    container: (message) => void heard.push(`container ${message.kind}`),
    record: (shown) => void heard.push(`record ${shown ? "shown" : "none"}`),
    endPopped: () => void heard.push("endPopped"),
    abilityCard: () => void heard.push("abilityCard"),
    hud: (message) => void heard.push(`hud ${message.kind}`),
    confirmBurn: (altar) => void heard.push(`confirmBurn ${altar}`),
    onScreen: () => () => {},
  };
}

/** A world's windows, all shut. */
const shut = () => ({ letter: false });

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
    windows.letter = true;

    expect(bridge.world?.world).toBe("hub");
    expect(bridge.world?.windows().letter).toBe(true);
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
// does nothing. The ESC menu's and Esc's (I-TQZ5J-4), the gear's (§ Change: Phase 3, I-TQZ5J-14).
describe("the UI scene's requests and the world's blockers (FS-TQZ5J R9, R11)", () => {
  it("should hand a request to the world reported, answered before it returns", () => {
    const bridge = new GameUiBridge();
    const answered: UiRequest[] = [];
    bridge.report({ world: "field", ...side(), answer: (request) => void answered.push(request) });

    bridge.request({ kind: "close", window: "letter" });
    bridge.request({ kind: "fall" });

    expect(answered).toEqual([{ kind: "close", window: "letter" }, { kind: "fall" }]);
  });

  it("should hand a request to no world once it has left, nor before one is reported", () => {
    const bridge = new GameUiBridge();
    expect(() => bridge.request({ kind: "leaveRun" })).not.toThrow();
    const answered: UiRequest[] = [];
    bridge.report({ world: "hub", ...side(), answer: (request) => void answered.push(request) });
    bridge.left("hub");

    bridge.request({ kind: "equip", item: "sword-1" });

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
      close: { letter: () => void done.push("close letter"), dialogue: () => void done.push("close dialogue") },
      leaveQueue: () => void done.push("leave the queue"),
      changeCharacter: () => void done.push("change character"),
      musicLevel: (level) => void done.push(`music ${level}`),
    });

    answer({ kind: "close", window: "letter" });
    answer({ kind: "close", window: "record" });
    answer({ kind: "close", window: "dialogue" });
    answer({ kind: "leaveQueue" });
    answer({ kind: "changeCharacter" });
    answer({ kind: "leaveRun" });
    answer({ kind: "fall" });
    answer({ kind: "musicLevel", level: 4 });

    expect(done).toEqual([
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

  it("should carry only data: no function in the dialogue or its pick (ADR-0084)", () => {
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

// FS-TQZ5J Amendment A2 R33 (I-TQZ5J-8): a world says its screen notices through the bridge as plain
// data, its words and its look; the UI scene hears each at once.
describe("the notices the world says, told to the UI scene (FS-TQZ5J A2 R33)", () => {
  it("should tell each screen listener a notice said, at once, as plain data", () => {
    const bridge = new GameUiBridge();
    const told: unknown[] = [];
    bridge.onScreen({ notice: (n) => void told.push(n) });
    bridge.onScreen({ dialogue: () => {} });

    bridge.notice({ text: "Your bag is full.", look: { world: "field" } });
    bridge.notice({ text: "Escape door opened!", look: { world: "run", backing: 0x3a7d44 } });

    expect(told).toEqual([
      { text: "Your bag is full.", look: { world: "field" } },
      { text: "Escape door opened!", look: { world: "run", backing: 0x3a7d44 } },
    ]);
    expect(JSON.parse(JSON.stringify(told))).toEqual(told);
  });

  it("should hand a world its bridge to say a notice through, and a world lent none a notice that draws nothing", () => {
    const bridge = new GameUiBridge();
    const told: string[] = [];
    bridge.onScreen({ notice: (n) => void told.push(n.text) });
    const scene = { registry: registry(), events: new EventEmitter() };
    lendUiBridge(scene.registry, bridge);

    reportWorld(scene, "hub", side()).notice({ text: "A line.", look: { world: "hub" } });

    expect(told).toEqual(["A line."]);
    expect(() => NO_UI.notice({ text: "A line.", look: { world: "hub" } })).not.toThrow();
  });
});

// FS-TQZ5J § Change: Phase 2: the party, R38 (I-TQZ5J-11): each state tick a world showed reaches the
// UI scene's party frames through the bridge, as plain data
describe("the state ticks a world shows, told to the UI scene (FS-TQZ5J § Change: Phase 2: the party, R38)", () => {
  it("should tell each screen listener the tick, at once, and none once it stopped listening", () => {
    const bridge = new GameUiBridge();
    const told: unknown[] = [];
    const stop = bridge.onScreen({ partySeen: (state) => void told.push(state) });
    bridge.onScreen({ notice: () => {} });
    const tick = { current_player: { id: "me", current_health: 80, max_health: 100, level: 3 }, other_players: [] };

    reportWorld({ registry: registryWith(bridge), events: new EventEmitter() }, "run", side()).partySeen(tick);
    stop();
    bridge.partySeen(tick);

    expect(told).toEqual([tick]);
    expect(() => NO_UI.partySeen(tick)).not.toThrow();
  });
});

/** A registry with `bridge` lent. */
function registryWith(bridge: UiBridge) {
  const r = registry();
  lendUiBridge(r, bridge);
  return r;
}

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

  // § Change: Phase 2: the party, R41: a world piece that hovers by coordinates hears the move with
  // the pointer's coordinates; the bridge says, while it runs, that the pointer is over a UI piece
  it("should say overUi while the world hears a move over a UI piece, and only then (§ Change: Phase 2: the party, R41)", () => {
    const bridge = new GameUiBridge();
    const scene = worldScene(bridge);
    const seen: boolean[] = [];
    scene.input.update = () => (seen.push(bridge.overUi), false);
    reportWorld(scene, "run", side());

    expect(bridge.overUi).toBe(false);
    bridge.moved(pointer, true);
    expect(bridge.overUi).toBe(false);
    bridge.moved(pointer, false);

    expect(seen).toEqual([true, false]);
    expect(bridge.overUi).toBe(false);
  });

  it("should say overUi false again even when the world's pass throws", () => {
    const bridge = new GameUiBridge();
    const scene = worldScene(bridge);
    scene.input.update = () => {
      throw new Error("boom");
    };
    reportWorld(scene, "field", side());

    expect(() => bridge.moved(pointer, true)).toThrow("boom");
    expect(bridge.overUi).toBe(false);
  });

  it("should hand it to a world that reported without an input (a stand-in) as nothing at all", () => {
    const bridge = new GameUiBridge();
    const scene = { registry: registry(), events: new EventEmitter() };
    lendUiBridge(scene.registry, bridge);
    reportWorld(scene, "hub", side());

    expect(() => bridge.moved(pointer, true)).not.toThrow();
  });
});

// FS-TQZ5J § Change: Phase 3 (I-TQZ5J-13): the UI's state gains the gear's panels and the container
// view's entity, each piece reporting its own part; the world hears every change with what it was.
// FS-TQZ5J § Change: Batch 6, R129 (batch 6 review, LOW): a press the UI scene claims while its cameras stand
// aside for a world's press, kept by its DOM event for the world's handlers in the same pass
describe("a press the UI scene claims (FS-TQZ5J § Change: Batch 6, R129)", () => {
  it("should say the claimed press is claimed, by its DOM event, and no later one", () => {
    const bridge = new GameUiBridge();
    const pointer = { event: { type: "mousedown" } as object };
    expect(bridge.pressClaimed(pointer)).toBe(false);

    bridge.claimPress(pointer);
    expect(bridge.pressClaimed(pointer)).toBe(true);

    pointer.event = { type: "mousedown" };
    expect(bridge.pressClaimed(pointer)).toBe(false);
  });

  it("should claim nothing for a pointer with no event, nor answer for none", () => {
    const bridge = new GameUiBridge();
    bridge.claimPress({});
    expect(bridge.pressClaimed({})).toBe(false);
    expect(bridge.pressClaimed(undefined)).toBe(false);
    expect(NO_UI.pressClaimed({ event: {} })).toBe(false);
  });
});

describe("the UI's state in parts, heard with what it was (FS-TQZ5J § Change: Phase 3, R53)", () => {
  it("should merge a part into the UI's state and tell the world the change once, with the state before", () => {
    const bridge = new GameUiBridge();
    const heard: [unknown, unknown][] = [];
    bridge.report({ world: "run", ...side(), heardUi: (ui, was) => void heard.push([ui, was]) });

    bridge.reportUi({ inventory: true, character: false, stash: false });
    bridge.reportUi({ menuOpen: true });
    bridge.reportUi({ container: "chest-1" });
    bridge.reportUi({ container: "chest-1", inventory: true });

    expect(heard).toEqual([
      [
        { menuOpen: false, inventory: true, character: false, stash: false },
        { menuOpen: false },
      ],
      [
        { menuOpen: true, inventory: true, character: false, stash: false },
        { menuOpen: false, inventory: true, character: false, stash: false },
      ],
      [
        { menuOpen: true, inventory: true, character: false, stash: false, container: "chest-1" },
        { menuOpen: true, inventory: true, character: false, stash: false },
      ],
    ]);
    expect(bridge.ui.container).toBe("chest-1");
  });

  it("should tell a container closed as none, and a change back from none as a change", () => {
    const bridge = new GameUiBridge();
    const heard: (string | undefined)[] = [];
    bridge.report({ world: "field", ...side(), heardUi: (ui) => void heard.push(ui.container) });

    bridge.reportUi({ container: "pile-1" });
    bridge.reportUi({ container: undefined });
    bridge.reportUi({ container: undefined });

    expect(heard).toEqual(["pile-1", undefined]);
  });
});

// FS-TQZ5J § Change: Phase 3 (I-TQZ5J-13): the world hands the UI scene the gear's, the container's and
// the record's data, and that its run's end appeared, as plain data; the UI scene hears it at once.
describe("the gear's, the container's and the record's data, told to the UI scene (FS-TQZ5J § Change: Phase 3, R52)", () => {
  const item = { entity_id: "sword-1", name: "Sword" } as never;
  const view = { title: "THE DELVE IS OVER" } as never;

  it("should tell each screen listener every message at once, and none once it stopped listening", () => {
    const bridge = new GameUiBridge();
    const told: unknown[] = [];
    const stop = bridge.onScreen({
      gear: (message) => void told.push(["gear", message]),
      container: (message) => void told.push(["container", message]),
      record: (shown) => void told.push(["record", shown]),
      endPopped: () => void told.push(["endPopped"]),
    });
    bridge.onScreen({ notice: () => {} });
    const ui = reportWorld({ registry: registryWith(bridge), events: new EventEmitter() }, "run", side());

    ui.gear({ kind: "seen", carried: { inventory: [item] }, character: { level: 3 } as never });
    ui.gear({ kind: "level", level: 3 });
    ui.gear({ kind: "taken", item });
    ui.gear({ kind: "openStash" });
    ui.gear({ kind: "close" });
    ui.container({ kind: "open", entityId: "chest-1", container: "chest" });
    ui.container({ kind: "items", items: [item] });
    ui.container({ kind: "close", now: true });
    ui.record({ view, open: true });
    ui.record(null);
    ui.endPopped();
    stop();
    bridge.endPopped();

    expect(told).toEqual([
      ["gear", { kind: "seen", carried: { inventory: [item] }, character: { level: 3 } }],
      ["gear", { kind: "level", level: 3 }],
      ["gear", { kind: "taken", item }],
      ["gear", { kind: "openStash" }],
      ["gear", { kind: "close" }],
      ["container", { kind: "open", entityId: "chest-1", container: "chest" }],
      ["container", { kind: "items", items: [item] }],
      ["container", { kind: "close", now: true }],
      ["record", { view, open: true }],
      ["record", null],
      ["endPopped"],
    ]);
  });

  // FS-84N1G R4: the run's ability card up or not, plain data, for the controls badge
  it("should tell each screen listener whether the run's ability card is up, and a world lent no bridge nothing", () => {
    const bridge = new GameUiBridge();
    const told: boolean[] = [];
    bridge.onScreen({ abilityCard: (up) => void told.push(up) });
    const ui = reportWorld({ registry: registryWith(bridge), events: new EventEmitter() }, "run", side());
    ui.abilityCard(true);
    ui.abilityCard(false);
    expect(told).toEqual([true, false]);
    expect(() => NO_UI.abilityCard(true)).not.toThrow();
  });

  it("should hand a world lent no bridge calls that draw nothing", () => {
    expect(() => {
      NO_UI.gear({ kind: "close" });
      NO_UI.container({ kind: "close" });
      NO_UI.record(null);
      NO_UI.endPopped();
    }).not.toThrow();
  });
});

// FS-TQZ5J § Change: Phase 3 (I-TQZ5J-13): the UI scene asks the world for the gear's sends, a take and
// the record's close, as plain data; a world with no answer ignores them.
describe("the gear's, the container's and the record's requests (FS-TQZ5J § Change: Phase 3, R54)", () => {
  it("should hand equip, unequip, take and close: record to the world's answers, and ignore one it has none for", () => {
    const done: string[] = [];
    const item = { entity_id: "ring-1" } as never;
    const answer = answering({
      equip: (id) => void done.push(`equip ${id}`),
      unequip: (id) => void done.push(`unequip ${id}`),
      take: (taken) => void done.push(`take ${(taken as { entity_id: string }).entity_id}`),
      close: { record: () => void done.push("close record") },
    });

    answer({ kind: "equip", item: "sword-1" });
    answer({ kind: "unequip", item: "helm-1" });
    answer({ kind: "take", item });
    answer({ kind: "close", window: "record" });
    answering({})({ kind: "take", item });

    expect(done).toEqual(["equip sword-1", "unequip helm-1", "take ring-1", "close record"]);
  });

  it("should carry the world's part of the gear's refusal in its blockers, false where left out", () => {
    const bridge = new GameUiBridge();
    bridge.report({ world: "hub", ...side(), blockers: () => ({ dialogue: true, gear: true }) });
    expect(bridge.world?.blockers().gear).toBe(true);
    bridge.report({ world: "field", ...side() });
    expect(bridge.world?.blockers().gear ?? false).toBe(false);
  });
});

// FS-TQZ5J § Change: Batch 6, R127: while the player types in the UI scene's chat, the world reported has
// its keyboard reset and off, and after it as it was; one that leaves while the player types has it back
describe("the world's keyboard while the player types (FS-TQZ5J § Change: Batch 6, R127)", () => {
  function typingWorld(enabled = true) {
    const bridge = new GameUiBridge();
    const store = registry();
    lendUiBridge(store, bridge);
    const keyboard = { enabled, resets: 0, resetKeys: () => void keyboard.resets++ };
    const heard: boolean[] = [];
    const scene = { registry: store, events: new EventEmitter(), input: { keyboard } };
    reportWorld(scene, "field", { ...side(), heardUi: (ui) => void heard.push(!!ui.typing) });
    return { bridge, keyboard, scene, heard };
  }

  it("should reset the world's keyboard and turn it off while typing, then hand it back", () => {
    const { bridge, keyboard, heard } = typingWorld();
    bridge.reportUi({ typing: true });
    expect([keyboard.enabled, keyboard.resets]).toEqual([false, 1]);
    bridge.reportUi({ typing: false });
    expect(keyboard.enabled).toBe(true);
    // the world's own ear hears the change too
    expect(heard).toEqual([true, false]);
  });

  it("should hand back the keyboard as it was, off staying off", () => {
    const { bridge, keyboard } = typingWorld(false);
    bridge.reportUi({ typing: true });
    bridge.reportUi({ typing: false });
    expect(keyboard.enabled).toBe(false);
  });

  it("should turn on no keyboard it did not turn off: a late typing: false heard by the next world", () => {
    const { bridge } = typingWorld();
    bridge.reportUi({ typing: true });
    // the next world comes up while the old window still says the player types, its keyboard off of its own
    const store = registry();
    lendUiBridge(store, bridge);
    const next = { enabled: false, resetKeys: () => {} };
    reportWorld({ registry: store, events: new EventEmitter(), input: { keyboard: next } }, "run", side());
    bridge.reportUi({ typing: false });
    expect(next.enabled).toBe(false);
  });

  it("should hand the keyboard back as the world leaves while the player types", () => {
    const { bridge, keyboard, scene } = typingWorld();
    bridge.reportUi({ typing: true });
    scene.events.emit("shutdown");
    expect(keyboard.enabled).toBe(true);
  });

  it("should tell the world a typing change, a part of the UI's state", () => {
    const { bridge } = typingWorld();
    bridge.reportUi({ typing: true });
    expect(bridge.ui.typing).toBe(true);
  });
});
