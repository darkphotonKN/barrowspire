import { describe, expect, it } from "vitest";
import { EventEmitter } from "eventemitter3";
import {
  GameUiBridge,
  lendUiBridge,
  reportWorld,
  uiBridgeOf,
  type UiBridge,
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
    act: (run) => run(),
  };
}

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

    reportWorld(scene, "field");
    expect(bridge.heard).toEqual(["report field"]);

    scene.events.emit("shutdown");
    scene.events.emit("shutdown");

    expect(bridge.heard).toEqual(["report field", "left field"]);
  });

  it("should report each start again: a restarted world is a left, then an entered", () => {
    const bridge = recording();
    const scene = worldScene(bridge);

    reportWorld(scene, "run");
    scene.events.emit("shutdown");
    reportWorld(scene, "run");

    expect(bridge.heard).toEqual(["report run", "left run", "report run"]);
  });

  it("should tell nothing on the game's destroy: the UI scene goes with the game, and its manager is asked nothing (R4)", () => {
    const bridge = recording();
    const scene = worldScene(bridge);
    reportWorld(scene, "hub");

    scene.events.emit("destroy");
    scene.events.emit("shutdown");

    expect(bridge.heard).toEqual(["report hub"]);
  });

  it("should do nothing in a game lent no bridge", () => {
    const scene = worldScene(null);

    expect(() => reportWorld(scene, "hub")).not.toThrow();
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

    bridge.report({ world: "hub" });
    bridge.report({ world: "hub" });
    bridge.left("hub");
    bridge.report({ world: "run" });

    expect(heard).toEqual([{ world: "hub" }, { world: "hub" }, null, { world: "run" }]);
  });

  it("should tell nothing of a left from a world no longer the one reported", () => {
    const bridge = new GameUiBridge();
    bridge.report({ world: "hub" });
    bridge.report({ world: "field" });
    const heard: (WorldReport | null)[] = [];
    bridge.onWorld((report) => heard.push(report));

    bridge.left("hub");

    expect(heard).toEqual([]);
    expect(bridge.world).toEqual({ world: "field" });
  });

  it("should stop telling a listener once it lets go", () => {
    const bridge = new GameUiBridge();
    const heard: (WorldReport | null)[] = [];
    const stop = bridge.onWorld((report) => heard.push(report));

    stop();
    bridge.report({ world: "hub" });

    expect(heard).toEqual([]);
  });
});
