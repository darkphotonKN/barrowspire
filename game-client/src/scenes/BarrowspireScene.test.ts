import { describe, expect, it, vi } from "vitest";

/** Phaser's scene events are an eventemitter3 emitter: `once(event, fn, context)`. */
interface Emitter {
  emit(event: string): boolean;
  listenerCount(event: string): number;
}

// Only the scene's lifecycle is under test: a Phaser stand-in with the scene events it uses,
// on the same emitter Phaser builds them from.
vi.mock("phaser", async () => {
  const { EventEmitter } = await import("eventemitter3");
  class Scene {
    events = new EventEmitter();
    constructor(_config: unknown) {}
  }
  return {
    default: { Scene, Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } } },
  };
});

const { BarrowspireScene } = await import("./BarrowspireScene");
const { socketManager } = await import("@/utils/class/SocketManager");

/** The run state a started scene has built, as the reconnect path finds it. */
interface RunState {
  events: Emitter;
  gameStateUnsubscribe?: () => void;
  walls: Map<string, unknown>;
  buildings: unknown[];
  serverBuildingsCreated: boolean;
  otherPlayers: Map<string, unknown>;
  player?: unknown;
  gameEndOverlay?: unknown;
}

describe("BarrowspireScene restart (reconnect mid-run)", () => {
  function startedRun() {
    const scene = new BarrowspireScene();
    const run = scene as unknown as RunState;
    scene.init();
    const broadcasts = vi.fn();
    run.gameStateUnsubscribe = socketManager.onGameStateUpdate(broadcasts);
    run.walls.set("w1", { pieces: [], entityId: "w1" });
    run.buildings.push({ id: "server_building_0" });
    run.serverBuildingsCreated = true;
    run.otherPlayers.set("p2", {});
    run.player = {};
    run.gameEndOverlay = {};
    return { scene, run, broadcasts };
  }

  it("should stop hearing game state once stopped", () => {
    const { run, broadcasts } = startedRun();
    run.events.emit("shutdown");
    (socketManager as unknown as { handleGameStateUpdate(s: unknown): void }).handleGameStateUpdate(
      { current_player: null },
    );
    expect(broadcasts).not.toHaveBeenCalled();
  });

  it("should forget the stopped run's world, so the next start rebuilds walls, roofs and delvers", () => {
    const { run } = startedRun();
    run.events.emit("shutdown");
    expect(run.walls.size).toBe(0);
    expect(run.buildings).toHaveLength(0);
    expect(run.serverBuildingsCreated).toBe(false);
    expect(run.otherPlayers.size).toBe(0);
    expect(run.player).toBeUndefined();
    expect(run.gameEndOverlay).toBeUndefined();
  });

  it("should reset again on every stop, not just the first", () => {
    const { scene, run } = startedRun();
    run.events.emit("shutdown");
    scene.init();
    run.serverBuildingsCreated = true;
    run.events.emit("shutdown");
    expect(run.serverBuildingsCreated).toBe(false);
  });

  it("should also let go when the game is torn down mid-run, without a stop", () => {
    const { run, broadcasts } = startedRun();
    run.events.emit("destroy");
    (socketManager as unknown as { handleGameStateUpdate(s: unknown): void }).handleGameStateUpdate(
      { current_player: null },
    );
    expect(broadcasts).not.toHaveBeenCalled();
    expect(run.walls.size).toBe(0);
  });

  it("should not pile up teardown listeners across restarts", () => {
    const { scene, run } = startedRun();
    for (let i = 0; i < 3; i++) {
      run.events.emit("shutdown");
      scene.init();
    }
    expect(run.events.listenerCount("shutdown")).toBe(1);
    expect(run.events.listenerCount("destroy")).toBe(1);
  });
});
