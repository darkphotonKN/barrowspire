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
const { EffectsRuntime } = await import("@/render/effects/runtime");
const { HitFeedback } = await import("@/render/effects/hit");
const { fakeArt, fakeLights, fakeScene } = await import("@/render/effects/fakeScene");
const { ProjectileFlights } = await import("@/render/effects/projectile");
const { FIREBALL_FLIGHT } = await import("@/render/effects/fireball");
const { ARROW_FLIGHT } = await import("@/render/effects/arrow");

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
  fx?: unknown;
  hits?: unknown;
  lightMap?: unknown;
  projectiles?: unknown;
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

describe("BarrowspireScene effect teardown (FS-KYPQ9 §B.9, §C.4)", () => {
  /** A started run with effects playing: a slash, a rival's escape, an entrance glow, a hit. */
  function runWithEffects() {
    const scene = new BarrowspireScene();
    const run = scene as unknown as RunState;
    scene.init();
    const fake = fakeScene();
    const lights = fakeLights();
    const lightMap = {
      ...lights.lights,
      clearTransient: () => lights.added.forEach((l) => (l.removed = true)),
    };
    const fx = new EffectsRuntime(fake.scene, fakeArt, lightMap, { warn: () => {} });
    const hits = new HitFeedback(fake.scene);
    run.fx = fx;
    run.hits = hits;
    run.lightMap = lightMap;

    fx.play("self", "slash", { x: 10, y: 10 }, { rotation: 0 });
    fx.play("p2", "escape", { x: 40, y: 40 });
    fx.play("entrance:server_building_0", "entranceBreath", { x: 80, y: 90 });
    // a short-lived light the runtime does not own: only the light-map's clear removes it
    lightMap.addTransient({ x: 0, y: 0, radius: 50, color: 1, intensity: 1 }, 400);
    const struck = {
      active: true,
      setTint: vi.fn(),
      clearTint: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
    };
    hits.play(struck);
    return { scene, run, fake, lights, fx, hits };
  }

  it.each(["shutdown", "destroy"])(
    "should leave no effect object, tween, timer or short-lived light after %s",
    (event) => {
      const { run, fake, lights, fx, hits } = runWithEffects();
      expect(fake.live().length).toBeGreaterThan(0);
      run.events.emit(event);
      expect(fake.live()).toEqual([]);
      expect(fake.tweens.every((t) => t.stopped)).toBe(true);
      expect(fake.timers.every((t) => t.removed)).toBe(true);
      expect(lights.alive()).toEqual([]);
      expect(fx.playing()).toBe(0);
      expect(hits.playing()).toBe(0);
      expect(run.fx).toBeUndefined();
      expect(run.hits).toBeUndefined();
      expect(run.lightMap).toBeUndefined();
    },
  );

  it("should not pile up teardown listeners when restarted with effects", () => {
    const { scene, run } = runWithEffects();
    for (let i = 0; i < 3; i++) {
      run.events.emit("shutdown");
      scene.init();
    }
    expect(run.events.listenerCount("shutdown")).toBe(1);
    expect(run.events.listenerCount("destroy")).toBe(1);
  });
});

describe("BarrowspireScene projectile teardown (FS-KYPQ9 §B.9, edge state: resetRun mid-flight)", () => {
  /** A started run with a fireball and an arrow in flight, the fireball's light riding on it. */
  function runInFlight() {
    const scene = new BarrowspireScene();
    const run = scene as unknown as RunState;
    scene.init();
    const fake = fakeScene();
    const lights = fakeLights();
    const lightMap = {
      ...lights.lights,
      clearTransient: () => lights.added.forEach((l) => (l.removed = true)),
    };
    const fx = new EffectsRuntime(fake.scene, fakeArt, lightMap, { warn: () => {} });
    const projectiles = new ProjectileFlights(fake.scene, fakeArt, fx, (type) =>
      type === "arrow" ? ARROW_FLIGHT : FIREBALL_FLIGHT,
    );
    run.fx = fx;
    run.lightMap = lightMap;
    run.projectiles = projectiles;
    projectiles.sync([
      { entity_id: "f1", projectile_type: "fireball", position: { x: 300, y: 200 }, velocity: { vx: 300, vy: 0 } },
      { entity_id: "a1", projectile_type: "arrow", position: { x: 100, y: 100 }, velocity: { vx: 0, vy: 400 } },
    ]);
    return { run, fake, lights, fx, projectiles };
  }

  it.each(["shutdown", "destroy"])(
    "should play no impact and leave no tracked projectile, body, trail or light after %s",
    (event) => {
      const { run, fake, lights, fx, projectiles } = runInFlight();
      expect(lights.alive()).toHaveLength(1);
      const made = fake.made.length;
      run.events.emit(event);
      // nothing new was drawn: no flare, scorch, embers or puff for a cleared projectile
      expect(fake.made.length).toBe(made);
      expect(fake.live()).toEqual([]);
      expect(lights.alive()).toEqual([]);
      expect(projectiles.tracked()).toBe(0);
      expect(fx.playing()).toBe(0);
      expect(run.projectiles).toBeUndefined();
    },
  );
});
