import { afterEach, describe, expect, it, vi } from "vitest";

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
  // `import * as Phaser` reads the module namespace, so the stand-in is the module itself.
  const phaser = {
    Scene,
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
    Core: { Events: { BLUR: "blur", HIDDEN: "hidden" } },
    Animations: { Events: { ANIMATION_COMPLETE: "animationcomplete" } },
    GameObjects: { Sprite: class {} },
    BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
    Input: {
      Keyboard: {
        // Phaser's JustDown: true once per press, and reading it clears the press
        JustDown: (key: { justDown: boolean }) => {
          const pressed = key.justDown;
          key.justDown = false;
          return pressed;
        },
        KeyCodes: {},
      },
    },
    // interact range is measured between world positions
    Math: {
      Distance: {
        Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1),
      },
    },
  };
  return { ...phaser, default: phaser };
});

const { BarrowspireScene, projectileFlightOf } = await import("./BarrowspireScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { EffectsRuntime } = await import("@/render/effects/runtime");
const { HitFeedback } = await import("@/render/effects/hit");
const { fakeArt, fakeLights, fakeScene } = await import("@/render/effects/fakeScene");
const { ProjectileFlights } = await import("@/render/effects/projectile");
const { FIREBALL_FLIGHT } = await import("@/render/effects/fireball");
const { ARROW_FLIGHT } = await import("@/render/effects/arrow");
const { SHADOW_SHOT_FLIGHT } = await import("@/render/effects/shadowShot");
const { AimLine } = await import("@/render/effects/aimLine");
const { CUT_MS } = await import("@/render/effects/cut");
const { MENU_CONTROLS } = await import("./MainMenuScene");
const { PARRY_FLASH_MS } = await import("@/render/effects/parry");
const { RIPOSTE_MS } = await import("@/render/effects/riposte");
const { ArtLibrary } = await import("@/render/art/library");
const { MonsterRoster } = await import("@/render/creatures");
const { CANVAS_FONT, palette, toCss } = await import("@/utils/canvasPalette");
const { ActionType } = await import("@/assets/types/client");
const { WORLD_THEMES, TOWER_BANDS } = await import("@/render/world/worldTheme");
const { worldSeed } = await import("@/render/world/ground");
const await_iso = await import("@/render/iso");
const INTERACTABLE_RADIUS = (await import("@/render/world/floorLights")).interactablePool({ x: 0, y: 0 }, 0).radius;
const { useGameStore } = await import("@/stores/gameStore");
const { EquipmentHud } = await import("@/ui/EquipmentHud");
const { gearPanelLayout, overlayLayout } = await import("@/ui/gearOverlayLayout");
const { BAG_FULL_NOTICE } = await import("@/ui/bag");
const { EventEmitter } = await import("eventemitter3");
const { readdirSync } = await import("node:fs");
const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
type GameState = import("@/types/gameState").ClientGameState;

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
  monsters?: unknown;
  resolvedCard?: unknown;
  floorText?: unknown;
  shownFloorLabel: string | null;
  lastFloor?: number;
  stairs: {
    sync(stairs: { entity_id: string; position: { x: number; y: number } }[]): void;
    nearby(me: { x: number; y: number }): string | null;
  };
  add: unknown;
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
    run.monsters = {};
    run.resolvedCard = {};
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

  it("should forget the stopped run's world, so the next start rebuilds walls, roofs, players and monsters", () => {
    const { run } = startedRun();
    run.events.emit("shutdown");
    expect(run.walls.size).toBe(0);
    expect(run.buildings).toHaveLength(0);
    expect(run.serverBuildingsCreated).toBe(false);
    expect(run.otherPlayers.size).toBe(0);
    expect(run.player).toBeUndefined();
    expect(run.gameEndOverlay).toBeUndefined();
    expect(run.monsters).toBeUndefined();
    expect(run.resolvedCard).toBeUndefined();
  });

  it("should forget the stopped run's stairs and floor, so the next start shows the new ones", () => {
    const { run } = startedRun();
    const sprite = { setPosition: () => sprite, setDepth: () => sprite, destroy: vi.fn() };
    run.add = { sprite: () => sprite };
    run.stairs.sync([{ entity_id: "s1", position: { x: 100, y: 100 } }]);
    run.floorText = {};
    run.shownFloorLabel = "Floor 2 of 3";
    run.lastFloor = 2;
    expect(run.stairs.nearby({ x: 100, y: 100 })).toBe("s1");

    run.events.emit("shutdown");

    expect(run.stairs.nearby({ x: 100, y: 100 })).toBeNull();
    // Phaser has already destroyed the stopped run's objects
    expect(sprite.destroy).not.toHaveBeenCalled();
    expect(run.floorText).toBeUndefined();
    expect(run.shownFloorLabel).toBeNull();
    // the next start's first broadcast is the baseline: its floor is built with no transition
    expect(run.lastFloor).toBeUndefined();
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

  // Phaser keeps the scene's keyboard plugin across restarts and reads `enabled`
  // only at boot, so the end-of-run lock carried into the next run: the player
  // could not move until a page refresh built a new game.
  it("should give the next run back the keyboard the end-of-run overlay locked", () => {
    const { scene, run } = startedRun();
    const keyboard = { enabled: false };
    (run as unknown as { input: unknown }).input = { keyboard };

    run.events.emit("shutdown");
    scene.init();

    expect(keyboard.enabled).toBe(true);
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

describe("BarrowspireScene projectile kinds (FS-JTNPR req 20, 23)", () => {
  it.each([
    ["shadow_shot", "the shadow bolt", SHADOW_SHOT_FLIGHT],
    ["arrow", "the arrow", ARROW_FLIGHT],
    ["fireball", "the fireball", FIREBALL_FLIGHT],
    ["something_new", "the fireball, as drawn today", FIREBALL_FLIGHT],
    ["toString", "the fireball, as drawn today", FIREBALL_FLIGHT],
  ])("should fly a projectile of kind %s as %s", (type, _what, flight) => {
    expect(projectileFlightOf(type)).toBe(flight);
  });
});

describe("BarrowspireScene Mercenary placeholder (FS-MAMHR §G.31)", () => {
  it("should make the Mercenary's own placeholder at every facing, for this player and a teammate", () => {
    const scene = new BarrowspireScene();
    const made: string[] = [];
    const graphics = () => {
      const g: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_, prop) =>
            prop === "generateTexture" ? (key: string) => made.push(key) : () => g,
        },
      );
      return g;
    };
    Object.assign(scene, {
      make: { graphics },
      textures: { exists: () => false },
      cache: { json: { exists: () => false } },
      load: { once: () => {}, json: () => {} },
    });
    (scene as unknown as { preload(): void }).preload();
    for (const prefix of ["player_mercenary", "other_mercenary"])
      for (const facing of ["Down", "Up", "Left", "Right"]) expect(made).toContain(`${prefix}${facing}`);
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
    const projectiles = new ProjectileFlights(fake.scene, fakeArt, fx, projectileFlightOf);
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

/** A scene object as the stand-in stage made it: what kind, with what, and whether it is gone. */
interface Made {
  kind: string;
  args: unknown[];
  destroyed: boolean;
  children: Made[];
  /** The pointer handlers it was given, by event, as Phaser would call them. */
  handlers: Record<string, () => void>;
  /** Every other method called on it, by name, in order. */
  calls: string[];
}

/**
 * A stand-in for the slice of Phaser the state path draws with: every object it makes is recorded
 * by kind and answers any call, and destroying a container destroys what it holds, as Phaser does.
 */
function recordingStage() {
  const made: Made[] = [];
  const make = (kind: string, args: unknown[] = []): unknown => {
    const self = {
      kind,
      args,
      destroyed: false,
      active: true,
      children: [] as Made[],
      handlers: {} as Record<string, () => void>,
      calls: [] as string[],
    } as Made & { active: boolean; [k: string]: unknown };
    if (kind === "container" && Array.isArray(args[2])) self.children.push(...(args[2] as Made[]));
    // destroying runs what was hung on `destroy` (hit areas that go with their card)
    const kill = (m: Made & { active?: boolean }) => {
      if (m.destroyed) return;
      m.destroyed = true;
      m.active = false;
      m.children.forEach(kill);
      m.handlers.destroy?.();
    };
    const proxy: unknown = new Proxy(self, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === "then") return undefined;
        if (prop === "destroy") return () => kill(target);
        if (prop === "add")
          return (child: Made | Made[]) => {
            target.children.push(...[child].flat());
            return proxy;
          };
        if (prop === "getBounds") return () => ({ x: 0, y: 0, width: 10, height: 10 });
        // a text's content is what it shows now, not only what it was made with
        if (prop === "setText")
          return (content: unknown) => {
            target.args[2] = content;
            return proxy;
          };
        // a named object answers to its name, as the scene names what it can't otherwise tell apart
        if (prop === "setName")
          return (name: string) => {
            (target as { name?: string }).name = name;
            return proxy;
          };
        if (prop === "on" || prop === "once")
          return (event: string, fn: () => void) => {
            target.handlers[event] = fn;
            return proxy;
          };
        // no arcade body: the placeholder rig's collision circle is skipped
        if (prop === "body") return undefined;
        return () => {
          target.calls.push(String(prop));
          return proxy;
        };
      },
    });
    made.push(self);
    return proxy;
  };
  const add = new Proxy({}, { get: (_, kind) => (...args: unknown[]) => make(String(kind), args) });
  return { made, make, add };
}

/** The run state the floor rebuild works on, as the scene holds it. */
interface FloorRun {
  add: unknown;
  physics: unknown;
  tweens: unknown;
  time: unknown;
  cameras: unknown;
  art: unknown;
  input: unknown;
  monsters?: unknown;
  monsterTargeting: import("@/render/creatures").MonsterTargeting;
  lightMap?: unknown;
  projectiles?: unknown;
  groundLayer?: unknown;
  occluders: { size: number };
  handleGameStateUpdate(state: GameState): void;
  showGameEndOverlay(position: number, result?: string): void;
}

const at = (x: number, y: number) => ({ x, y });

/** A house of four walls with its top-left corner at (x, y). */
const house = (id: string, x: number, y: number, wallIds: string[]) =>
  wallIds.map((entity_id, i) => ({
    house_id: id,
    entity_id,
    position: [at(x, y), at(x, y + 160), at(x, y), at(x + 200, y)][i],
    width: i < 2 ? 200 : 10,
    height: i < 2 ? 10 : 160,
  }));

const monster = (entity_id: string, x: number, action: "idle" | "dead" = "idle") => ({
  entity_id,
  archetype: "ghoul" as const,
  name: "Ghoul",
  level: 1,
  elite: false,
  boss: false,
  position: at(x, 300),
  facing: at(1, 0),
  action,
  current_health: action === "dead" ? 0 : 10,
  max_health: 10,
});

/**
 * One floor's broadcast. Floor 2 reuses some of floor 1's entity ids on purpose: an ECS may
 * hand a cleared id out again, and a reused id must still be built fresh for the new floor.
 */
function floorState(
  floor: number,
  opts: { switchOn?: boolean; doorOpen?: boolean } = {},
): GameState {
  const x = floor === 1 ? 100 : 600;
  return {
    session_id: "run",
    world_type: "run",
    current_player: null,
    other_players: [],
    items: [],
    walls: house(`h${floor}`, x, 100, ["w1", "w2", `w3_${floor}`, `w4_${floor}`]),
    doors: [{ entity_id: "d1", position: at(x + 90, 260), width: 20, height: 10, is_open: false }],
    containers: [
      { container_id: "c", entity_id: "c1", kind: "chest", position: at(x + 50, 150), is_open: false, items: [] },
    ],
    escape_doors: [
      { entity_id: `e${floor}`, position: at(x, 600), is_open: !!opts.doorOpen, is_locked: !opts.doorOpen },
    ],
    switches: [
      { entity_id: `s${floor}`, position: at(x + 300, 600), switch_id: 1, is_activated: !!opts.switchOn },
    ],
    stairs: floor < 3 ? [{ entity_id: `st${floor}`, position: at(x + 400, 700) }] : [],
    projectiles: [
      { entity_id: "p1", projectile_type: "fireball", position: at(x, 400), velocity: { vx: 1, vy: 0 } },
    ],
    monsters: [monster("m1", x), monster(`m_dead_${floor}`, x + 50, "dead")],
    floor,
    floor_count: 3,
    escaped_count: 0,
  };
}

function sceneOnStage() {
  const scene = new BarrowspireScene();
  const run = scene as unknown as FloorRun;
  const stage = recordingStage();
  const logger = { warn: () => {} };
  const lights: unknown[] = [];
  const painted: { id: string }[][] = [];
  const grounds: unknown[] = [];
  run.add = stage.add;
  run.physics = {
    add: {
      staticGroup: () => stage.make("staticGroup"),
      sprite: (...args: unknown[]) => stage.make("sprite", args),
      collider: () => {},
    },
  };
  run.tweens = { add: vi.fn(), killTweensOf: vi.fn() };
  run.time = { delayedCall: vi.fn() };
  run.cameras = {
    main: { width: 800, height: 600, centerX: 400, centerY: 300, startFollow: vi.fn() },
  };
  const cursor = vi.fn();
  run.input = { setDefaultCursor: cursor };
  Object.assign(run, { defaultCursorCSS: "hand", crosshairCursorCSS: "strike-mark" });
  run.art = ArtLibrary.empty(logger);
  run.monsters = new MonsterRoster(
    {
      sprite: () => stage.make("sprite") as never,
      text: (content, style) => stage.make("text", [0, 0, content, style]) as never,
      graphics: () => stage.make("graphics") as never,
    },
    run.art as InstanceType<typeof ArtLibrary>,
    run.monsterTargeting,
  );
  run.lightMap = {
    add: (source: unknown) => lights.push(source),
    clear: () => lights.splice(0),
    clearTransient: () => {},
  };
  run.groundLayer = {
    paint: (houses: { id: string }[], floor?: unknown) => {
      painted.push(houses);
      if (floor) grounds.push(floor);
    },
  };
  // the satchel a coffer opens into, closed: the state path only asks what it shows
  Object.assign(run, {
    containerView: { entityId: null, isOpen: false, open: vi.fn(), close: vi.fn(), setItems: vi.fn() },
  });
  const texts = () =>
    stage.made.filter((m) => m.kind === "text").map((m) => ({ content: m.args[2], style: m.args[3] as { fontFamily?: string } }));
  return { run, stage, lights, painted, grounds, texts, cursor };
}

describe("BarrowspireScene floor change (FS-F6F88 req 32, 33)", () => {
  it("should leave nothing of the old floor standing once the party has climbed", () => {
    const { run, stage, lights, painted } = sceneOnStage();
    // projectiles fly in the effects runtime (FS-KYPQ9 §E): the climb drops them without impact
    const projectiles = { sync: vi.fn(), clear: vi.fn() };
    run.projectiles = projectiles;
    run.handleGameStateUpdate(floorState(1));
    run.handleGameStateUpdate(floorState(1));
    // a floor-1 wall sconce, as the baked walls would have lit it
    (run.lightMap as { add(s: unknown): void }).add({ x: 100, y: 100 });
    const floorOne = stage.made.filter((m) => !m.destroyed);
    const kindsOnFloorOne = new Set(floorOne.map((m) => m.kind));
    expect(kindsOnFloorOne).toEqual(
      new Set(["graphics", "container", "staticGroup", "rectangle", "sprite", "text"]),
    );
    expect(run.occluders.size).toBe(1);

    run.handleGameStateUpdate(floorState(2));

    const survivors = floorOne.filter((m) => !m.destroyed);
    expect(survivors.map((m) => m.kind)).toEqual([]);
    expect(lights).toHaveLength(0);
    expect(projectiles.clear).toHaveBeenCalledTimes(1);
    // the ground is painted again with the new floor's houses only
    expect(painted.at(-1)?.map((h) => h.id)).toEqual(["h2"]);
    // only the new floor's escape door fades over the player
    expect(run.occluders.size).toBe(1);
  });

  it("should build the new floor from the very broadcast that carries the climb", () => {
    const { run, stage } = sceneOnStage();
    run.handleGameStateUpdate(floorState(1));
    const before = stage.made.length;

    run.handleGameStateUpdate(floorState(2));

    const built = stage.made.slice(before).filter((m) => !m.destroyed);
    const kinds = new Set(built.map((m) => m.kind));
    for (const kind of ["graphics", "container", "staticGroup", "rectangle", "sprite"])
      expect(kinds).toContain(kind);
  });

  it("should play the floor card in the body serif when the floor goes up", () => {
    const { run, texts } = sceneOnStage();
    run.handleGameStateUpdate(floorState(1));
    run.handleGameStateUpdate(floorState(2));

    const card = texts().find((t) => t.content === "The Second Floor");
    expect(card).toBeDefined();
    expect(card?.style.fontFamily).toBe(CANVAS_FONT.body);
  });

  it("should let the new floor's switch and escape-door notices fire again", () => {
    const { run, texts } = sceneOnStage();
    const notices = () => texts().filter((t) => /unlocked|opened/i.test(String(t.content))).length;
    run.handleGameStateUpdate(floorState(1, { switchOn: true, doorOpen: true }));
    expect(notices()).toBe(2);

    run.handleGameStateUpdate(floorState(2, { switchOn: true, doorOpen: true }));

    expect(notices()).toBe(4);
  });

  it("should build a floor joined mid-run directly, with no transition", () => {
    const { run, stage, texts } = sceneOnStage();
    run.handleGameStateUpdate(floorState(2));
    run.handleGameStateUpdate(floorState(2));

    expect(texts().some((t) => t.content === "The Second Floor")).toBe(false);
    expect(stage.made.filter((m) => m.destroyed && m.kind === "staticGroup")).toHaveLength(0);
  });

  it("should play no transition while the party stays on its floor", () => {
    const { run, stage, texts } = sceneOnStage();
    run.handleGameStateUpdate(floorState(1));
    const built = stage.made.filter((m) => !m.destroyed).length;
    run.handleGameStateUpdate(floorState(1));

    expect(texts().some((t) => /Floor$/.test(String(t.content)))).toBe(false);
    expect(stage.made.filter((m) => !m.destroyed).length).toBe(built);
  });
});

/** A player as the broadcast lists them, at `x` on the row the ghoul stands on. */
const player = (
  id: string,
  username: string,
  x: number,
  fields: { escape?: boolean; current_health?: number } = {},
) => ({
  id,
  entity_id: `e_${id}`,
  username,
  class: "warrior",
  position: at(x, 300),
  direction: { vx: 0, vy: 0, speed: 0 },
  escape: false,
  current_health: 100,
  max_health: 100,
  ...fields,
});

/** Floor 1 with this client's player at `meX` and an ally beside the living ghoul at x 100. */
function partyState(
  me: ReturnType<typeof player> | null = player("me", "Aldric", 130),
  ally = player("ally", "Wenna", 160),
): GameState {
  return {
    ...floorState(1),
    current_player: me,
    other_players: [ally],
  } as GameState;
}

function onStage() {
  const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
  const scene = sceneOnStage();
  const sprites = () => scene.stage.made.filter((m) => m.kind === "sprite");
  /** The roster's sprites, in broadcast order: made bare, where players are made at a texture. */
  const monsters = () => sprites().filter((m) => m.args.length === 0);
  /** Player sprites, in the order the broadcast built them: this client's first. */
  const players = () => sprites().filter((m) => m.args.length > 0);
  return { ...scene, sent, monsters, players };
}

describe("BarrowspireScene co-op combat (FS-77AB6 req 39, 40)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send attack with a living monster's entity id when it is clicked", () => {
    const { run, sent, monsters } = onStage();
    run.handleGameStateUpdate(partyState());
    monsters()[0].handlers.pointerdown();
    expect(sent).toHaveBeenCalledWith(ActionType.Attack, { enemy_entity_id: "m1" });
  });

  it("should ignore a click on a corpse", () => {
    const { run, sent, monsters } = onStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 160)));
    monsters()[1].handlers.pointerdown();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should not swing at a monster out of reach", () => {
    const { run, sent, monsters } = onStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 400)));
    monsters()[0].handlers.pointerdown();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should show the strike-mark over a living monster, and the hand once the pointer leaves", () => {
    const { run, monsters, cursor } = onStage();
    run.handleGameStateUpdate(partyState());
    monsters()[0].handlers.pointerover();
    expect(cursor).toHaveBeenLastCalledWith("strike-mark");
    monsters()[0].handlers.pointerout();
    expect(cursor).toHaveBeenLastCalledWith("hand");
  });

  it.each([
    ["escaped", { escape: true }],
    ["fallen", { current_health: 0 }],
  ])("should not let an %s player strike", (_, fields) => {
    const { run, sent, monsters } = onStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, fields)));
    monsters()[0].handlers.pointerdown();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should never click-attack another player, nor show the strike-mark over one", () => {
    const { run, sent, players, cursor } = onStage();
    run.handleGameStateUpdate(partyState());
    const ally = players()[1];
    ally.handlers.pointerover?.();
    ally.handlers.pointerdown?.();
    expect(sent).not.toHaveBeenCalled();
    expect(cursor).not.toHaveBeenCalledWith("strike-mark");
  });

  it("should letter another player's name in the ally channel, never the hostile one", () => {
    const { run, texts } = onStage();
    run.handleGameStateUpdate(partyState());
    const name = texts().find((t) => t.content === "Wenna");
    const color = (name?.style as { color?: string } | undefined)?.color;
    expect(color).toBe(toCss(palette.markerAlly));
    expect(color).not.toBe(toCss(palette.markerHostile));
  });

});

describe("BarrowspireScene teammate health bars (FS-8AY7S req 27, 28)", () => {
  interface Bars {
    teammateHealthBars: Map<string, { graphics: Made; fill: number | null }>;
  }
  /** What a bar's graphics drew since it was last cleared: a drawn bar ends in its fill. */
  const drawn = (g: Made) => g.calls.slice(g.calls.lastIndexOf("clear") + 1);

  function barsOnStage() {
    const scene = onStage();
    const bars = (scene.run as unknown as Bars).teammateHealthBars;
    const bar = (id: string) => bars.get(id);
    return { ...scene, bars, bar };
  }

  it("should draw a health-only bar over a living teammate in a run, filled by their health", () => {
    const { run, bar } = barsOnStage();
    run.handleGameStateUpdate(partyState(undefined, player("ally", "Wenna", 160, { current_health: 25 })));
    const ally = bar("ally")!;
    expect(ally.fill).toBe(0.25);
    expect(ally.graphics.kind).toBe("graphics");
    expect(ally.graphics.calls).toContain("setDepth");
    // backing, rim and one health fill: no resource half
    expect(drawn(ally.graphics).filter((c) => c === "fillRect")).toHaveLength(2);
  });

  it("should follow the teammate's health from state to state", () => {
    const { run, bar } = barsOnStage();
    run.handleGameStateUpdate(partyState());
    run.handleGameStateUpdate(partyState(undefined, player("ally", "Wenna", 160, { current_health: 50 })));
    expect(bar("ally")!.fill).toBe(0.5);
  });

  it("should draw none over the player's own head", () => {
    const { run, bars } = barsOnStage();
    run.handleGameStateUpdate(partyState());
    expect([...bars.keys()]).toEqual(["ally"]);
  });

  it.each([
    ["dead", { current_health: 0 }],
    ["escaped", { escape: true }],
  ])("should draw none over a teammate who is %s", (_, fields) => {
    const { run, bar } = barsOnStage();
    run.handleGameStateUpdate(partyState());
    run.handleGameStateUpdate(partyState(undefined, player("ally", "Wenna", 160, fields)));
    expect(bar("ally")!.fill).toBeNull();
    expect(drawn(bar("ally")!.graphics)).not.toContain("fillRect");
  });

  it("should take the bar with a teammate who leaves, leaving no stale graphics", () => {
    const { run, bars } = barsOnStage();
    run.handleGameStateUpdate(partyState());
    const graphics = bars.get("ally")!.graphics;
    run.handleGameStateUpdate({ ...partyState(), other_players: [] } as GameState);
    expect(bars.size).toBe(0);
    expect(graphics.destroyed).toBe(true);
  });

  it("should draw none in the hub", () => {
    const { run, bar } = barsOnStage();
    run.handleGameStateUpdate({ ...partyState(), world_type: "hub" } as GameState);
    expect(drawn(bar("ally")!.graphics)).not.toContain("fillRect");
  });

  it("should forget every bar on a restart", () => {
    const { run, bars } = barsOnStage();
    run.handleGameStateUpdate(partyState());
    (run as unknown as { resetRun(): void }).resetRun();
    expect(bars.size).toBe(0);
  });
});

describe("BarrowspireScene resolved player card and spectating (FS-QPDKN req 1, 3–9, 11–12)", () => {
  /** What the scene holds for a resolved player: the card, whose eyes they watch through. */
  interface Spectating {
    otherPlayers: Map<string, unknown>;
    watchedPlayerId?: string;
    resolvedCard?: unknown;
    spectateHud?: unknown;
    tabKey?: unknown;
    cycleWatched(): void;
    canSendMove(): boolean;
    resetRun(): void;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };

  function resolvedOnStage(me: ReturnType<typeof player>, allies = [player("ally", "Wenna", 160)]) {
    const stage = onStage();
    const run = stage.run as unknown as Spectating;
    const state = (...others: ReturnType<typeof player>[]) =>
      ({ ...partyState(me), other_players: others } as GameState);
    stage.run.handleGameStateUpdate(state(...allies));
    const live = (test: (content: string) => boolean) =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed && test(String(m.args[2])));
    const watchButtons = () => live((t) => /watch the delve/i.test(t));
    const cardTitles = () => live((t) => /barrow keeps you|out of the barrow/i.test(t));
    const watching = () => live((t) => /^Watching /.test(t)).map((m) => m.args[2]);
    const hints = () => live((t) => /Tab: next player/i.test(t));
    const pressWatch = () => {
      const hit = stage.stage.made.find((m) => (m as { name?: string }).name === "watch-the-delve");
      hit?.handlers.pointerdown();
    };
    const follow = stage.run.cameras as { main: { startFollow: ReturnType<typeof vi.fn> } };
    const followed = () => follow.main.startFollow.mock.calls.at(-1)?.[0];
    const own = () => (run as unknown as { player: unknown }).player;
    return { ...stage, run, state, watchButtons, cardTitles, watching, hints, pressWatch, followed, own };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["dead", dead, /barrow keeps you/i],
    ["escaped", escaped, /out of the barrow/i],
  ])("should show a %s player the card with Watch the delve while the ally is still in it", (_, me, copy) => {
    const { run, state, watchButtons, cardTitles } = resolvedOnStage(player("me", "Aldric", 130, me));
    // the card survives the next broadcast unchanged: one card, not one per tick
    (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160)));
    expect(cardTitles()).toHaveLength(1);
    expect(String(cardTitles()[0].args[2])).toMatch(copy);
    expect(watchButtons()).toHaveLength(1);
  });

  it("should show no card while this player is still in the delve", () => {
    const { watchButtons, cardTitles } = resolvedOnStage(player("me", "Aldric", 130));
    expect(cardTitles()).toHaveLength(0);
    expect(watchButtons()).toHaveLength(0);
  });

  it("should show no card once nobody is left in play: the end is coming", () => {
    const { watchButtons } = resolvedOnStage(player("me", "Aldric", 130, dead), [
      player("ally", "Wenna", 160, escaped),
    ]);
    expect(watchButtons()).toHaveLength(0);
  });

  it("should keep the camera on the player's own body until Watch is pressed", () => {
    const { run, followed, own, watching } = resolvedOnStage(player("me", "Aldric", 130, dead));
    expect(own()).toBeDefined();
    expect(followed()).toBe(own());
    expect(run.watchedPlayerId).toBeUndefined();
    expect(watching()).toEqual([]);
  });

  it("should do nothing on Tab while the card is still up", () => {
    const { run, followed, own } = resolvedOnStage(player("me", "Aldric", 130, dead));
    run.cycleWatched();
    expect(followed()).toBe(own());
    expect(run.watchedPlayerId).toBeUndefined();
  });

  it("should follow a teammate in play once Watch is pressed, and say whose eyes, with the Tab hint", () => {
    const { run, pressWatch, followed, watching, hints, watchButtons } = resolvedOnStage(
      player("me", "Aldric", 130, dead),
    );
    pressWatch();
    expect(run.watchedPlayerId).toBe("ally");
    expect(followed()).toBe(run.otherPlayers.get("ally"));
    expect(watching()).toEqual(["Watching Wenna"]);
    expect(hints()).toHaveLength(1);
    expect(watchButtons()).toHaveLength(0);
  });

  it("should letter the spectate HUD in vellum on the HUD panel, never amber", () => {
    const { stage, pressWatch, watching, hints } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    const made = (test: (t: string) => boolean) =>
      stage.made.find((m) => m.kind === "text" && !m.destroyed && test(String(m.args[2])))!;
    for (const text of [made((t) => watching().includes(t)), hints()[0]]) {
      const style = text.args[3] as { color?: string; backgroundColor?: string };
      expect(style.color).toBe(toCss(palette.hudText));
      expect(style.backgroundColor).toBe(toCss(palette.hudPanel));
      expect(style.color).not.toBe(toCss(palette.interactable));
    }
  });

  it("should cycle the watched player on Tab, never through the player's own body", () => {
    const { run, pressWatch, followed, own, watching } = resolvedOnStage(player("me", "Aldric", 130, dead), [
      player("ally", "Wenna", 160),
      player("brom", "Brom", 200),
    ]);
    pressWatch();
    expect(watching()).toEqual(["Watching Wenna"]);
    const seen: (string | undefined)[] = [run.watchedPlayerId];
    for (let i = 0; i < 3; i++) {
      run.cycleWatched();
      seen.push(run.watchedPlayerId);
      expect(followed()).toBe(run.otherPlayers.get(run.watchedPlayerId!));
      expect(followed()).not.toBe(own());
    }
    expect(seen).toEqual(["ally", "brom", "ally", "brom"]);
    expect(watching()).toEqual(["Watching Brom"]);
  });

  it("should keep the hint with only one teammate in play, and Tab keeps watching them", () => {
    const { run, pressWatch, hints } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    run.cycleWatched();
    expect(run.watchedPlayerId).toBe("ally");
    expect(hints()).toHaveLength(1);
  });

  it("should move on to another teammate in play when the watched player resolves", () => {
    const { run, state, pressWatch, followed, watching } = resolvedOnStage(player("me", "Aldric", 130, dead), [
      player("ally", "Wenna", 160),
      player("brom", "Brom", 200),
    ]);
    pressWatch();
    expect(run.watchedPlayerId).toBe("ally");
    (run as unknown as FloorRun).handleGameStateUpdate(
      state(player("ally", "Wenna", 160, escaped), player("brom", "Brom", 200)),
    );
    expect(run.watchedPlayerId).toBe("brom");
    expect(followed()).toBe(run.otherPlayers.get("brom"));
    expect(watching()).toEqual(["Watching Brom"]);
  });

  // Phaser's startFollow snaps the camera onto its target every time it is called, so calling
  // it per tick would throw away the lerp: the view must latch onto a teammate once, and again
  // only when the teammate changes.
  it("should start following once, not on every broadcast", () => {
    const { run, state, pressWatch, followed } = resolvedOnStage(player("me", "Aldric", 130, dead));
    const follow = run as unknown as { cameras: { main: { startFollow: ReturnType<typeof vi.fn> } } };
    pressWatch();
    const calls = follow.cameras.main.startFollow.mock.calls.length;
    for (let i = 0; i < 3; i++) {
      (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160 - i)));
    }
    expect(follow.cameras.main.startFollow.mock.calls.length).toBe(calls);
    expect(followed()).toBe(run.otherPlayers.get("ally"));
  });

  it("should latch onto the watched player once their sprite exists, if it was not there yet", () => {
    const { run, state, pressWatch, followed } = resolvedOnStage(player("me", "Aldric", 130, dead), [
      player("ally", "Wenna", 160),
      player("brom", "Brom", 200),
    ]);
    pressWatch();
    expect(run.watchedPlayerId).toBe("ally");
    // the watched player resolves while the next one's sprite is not drawn yet
    const brom = run.otherPlayers.get("brom");
    run.otherPlayers.delete("brom");
    (run as unknown as FloorRun).handleGameStateUpdate(
      state(player("ally", "Wenna", 160, escaped), player("brom", "Brom", 200)),
    );
    expect(run.watchedPlayerId).toBe("brom");
    run.otherPlayers.set("brom", brom);
    (run as unknown as FloorRun).handleGameStateUpdate(
      state(player("ally", "Wenna", 160, escaped), player("brom", "Brom", 200)),
    );
    expect(followed()).toBe(brom);
  });

  it("should send no move while spectating, nor once out of the delve", () => {
    const inPlay = resolvedOnStage(player("me", "Aldric", 130));
    expect(inPlay.run.canSendMove()).toBe(true);
    const { run, pressWatch } = resolvedOnStage(player("me", "Aldric", 130, dead));
    expect(run.canSendMove()).toBe(false);
    pressWatch();
    expect(run.canSendMove()).toBe(false);
  });

  it("should take the card down when end_game arrives, and not raise it again", () => {
    const { run, state, watchButtons } = resolvedOnStage(player("me", "Aldric", 130, escaped));
    (run as unknown as FloorRun).showGameEndOverlay(1, "escaped");
    expect(watchButtons()).toHaveLength(0);
    (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160)));
    expect(watchButtons()).toHaveLength(0);
  });

  it("should take the spectate HUD down when end_game arrives", () => {
    const { run, pressWatch, watching, hints } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    (run as unknown as FloorRun).showGameEndOverlay(2, "eliminated");
    expect(watching()).toEqual([]);
    expect(hints()).toHaveLength(0);
  });

  it("should forget the watched player, the follow, the Tab key, the card and the HUD on a restart", () => {
    const { run, pressWatch } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    const removeKey = vi.fn();
    const tabKey = {};
    run.tabKey = tabKey;
    (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeKey } };

    run.resetRun();

    expect(removeKey).toHaveBeenCalledWith(tabKey, true, true);
    expect(run.tabKey).toBeUndefined();
    expect(run.watchedPlayerId).toBeUndefined();
    expect(run.resolvedCard).toBeUndefined();
    expect(run.spectateHud).toBeUndefined();
  });
});

describe("BarrowspireScene leave the barrow (FS-QPDKN req 2, 10, 13, 14; edge state: Leaving)", () => {
  /** What the scene holds for a dead player's way out. */
  interface Leaving {
    leavePending: boolean;
    leaveButton?: unknown;
    gameEndOverlay?: unknown;
    leaveRefused(): void;
    resetRun(): void;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };

  function leavingOnStage(me: ReturnType<typeof player>) {
    const stage = onStage();
    const run = stage.run as unknown as Leaving;
    stage.run.handleGameStateUpdate(partyState(me));
    const live = (test: (content: string) => boolean) =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed && test(String(m.args[2])));
    const leaveLabels = () => live((t) => /leave the barrow/i.test(t));
    const watchLabels = () => live((t) => /watch the delve/i.test(t));
    const hit = (name: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
    const press = (name: string) => hit(name)?.handlers.pointerdown();
    const leavesSent = () => stage.sent.mock.calls.filter(([action]) => action === ActionType.LeaveRun);
    return { ...stage, run, leaveLabels, watchLabels, hit, press, leavesSent };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should give the dead player Leave the barrow beside Watch the delve, and the escaped player Watch alone", () => {
    const fallen = leavingOnStage(player("me", "Aldric", 130, dead));
    expect(fallen.watchLabels()).toHaveLength(1);
    expect(fallen.leaveLabels()).toHaveLength(1);

    const out = leavingOnStage(player("me", "Aldric", 130, escaped));
    expect(out.watchLabels()).toHaveLength(1);
    expect(out.leaveLabels()).toHaveLength(0);
  });

  it("should send leave_run once, with no payload, and nothing on a second press before the answer", () => {
    const { press, leavesSent, hit } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("leave-the-barrow");
    press("leave-the-barrow");

    expect(leavesSent()).toEqual([[ActionType.LeaveRun, {}]]);
    expect(hit("leave-the-barrow")?.calls).toContain("disableInteractive");
  });

  it("should hand the button back when the server refuses, with the card up", () => {
    const { run, press, leavesSent, hit, leaveLabels } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("leave-the-barrow");
    const before = hit("leave-the-barrow")?.calls.length ?? 0;

    run.leaveRefused();

    expect(run.leavePending).toBe(false);
    expect(leaveLabels()).toHaveLength(1);
    expect(hit("leave-the-barrow")?.calls.slice(before)).toContain("setInteractive");
    press("leave-the-barrow");
    expect(leavesSent()).toHaveLength(2);
  });

  it("should ignore a refusal once the end-of-run overlay is up: the run ended first", () => {
    const { run, press, leaveLabels } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("leave-the-barrow");
    (run as unknown as FloorRun).showGameEndOverlay(2, "eliminated");

    run.leaveRefused();

    expect(run.leavePending).toBe(true);
    expect(leaveLabels()).toHaveLength(0);
  });

  it("should keep the dead spectator's button in the bottom-right corner, clear of the spectate HUD", () => {
    const { run, press, hit, leaveLabels, leavesSent } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("watch-the-delve");

    expect(leaveLabels()).toHaveLength(1);
    const corner = hit("leave-the-barrow")!;
    const [x, y, w, h] = corner.args as number[];
    // the recording camera is 800 x 600; the HUD runs along the top edge, the watched player sits at the centre
    expect(x - w / 2).toBeGreaterThan(400 + 100);
    expect(y - h / 2).toBeGreaterThan(300 + 100);
    expect(x + w / 2).toBeLessThanOrEqual(800);
    expect(y + h / 2).toBeLessThanOrEqual(600);
    press("leave-the-barrow");
    expect(leavesSent()).toHaveLength(1);
    expect(run.leavePending).toBe(true);
  });

  it("should give the escaped spectator no leave button", () => {
    const { press, leaveLabels, hit } = leavingOnStage(player("me", "Aldric", 130, escaped));
    press("watch-the-delve");
    expect(leaveLabels()).toHaveLength(0);
    expect(hit("leave-the-barrow")).toBeUndefined();
  });

  it("should take the corner button down with the spectate HUD when end_game arrives", () => {
    const { run, press, leaveLabels, hit } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("watch-the-delve");
    (run as unknown as FloorRun).showGameEndOverlay(2, "eliminated");

    expect(leaveLabels()).toHaveLength(0);
    expect(hit("leave-the-barrow")).toBeUndefined();
    expect(run.leaveButton).toBeUndefined();
  });

  it("should forget the button, the pending send and the refusal listener on a restart", () => {
    const offError = vi.spyOn(socketManager, "offError");
    const off = vi.spyOn(socketManager, "off");
    const { run, press } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("leave-the-barrow");
    (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeKey: vi.fn() } };

    run.resetRun();

    expect(run.leavePending).toBe(false);
    expect(run.leaveButton).toBeUndefined();
    expect(offError).toHaveBeenCalledWith("leave_run");
    expect(off).toHaveBeenCalledWith("leave_run");
  });
});

describe("BarrowspireScene resource bars (FS-8AY7S req 20–26)", () => {
  type Resource = { kind: string; current: number; max: number; ability_cost: number };
  const mana: Resource = { kind: "mana", current: 30, max: 120, ability_cost: 30 };
  const me = (fields: { resource?: Resource; escape?: boolean; current_health?: number } = {}) => ({
    ...player("me", "Aldric", 130),
    class: "mage",
    resource: mana,
    ...fields,
  });
  const withMe = (self: ReturnType<typeof me>, ally = player("ally", "Wenna", 160)): GameState =>
    ({ ...floorState(1), current_player: self, other_players: [ally] }) as GameState;

  function barsOnStage() {
    const scene = sceneOnStage();
    const cam = (scene.run.cameras as { main: { width: number; height: number } }).main;
    const live = () => scene.stage.made.filter((m) => m.kind === "text" && !m.destroyed);
    const labels = () =>
      live()
        .map((m) => String(m.args[2]))
        .filter((t) => /^(Health|Mana|Stamina|Parry):$/.test(t));
    const label = (content: string) => live().find((m) => m.args[2] === content);
    return { ...scene, cam, labels, label };
  }

  it("should show Health: and Mana: at the bottom left in a run, in the body serif", () => {
    const { run, cam, labels, label } = barsOnStage();
    run.handleGameStateUpdate(withMe(me()));
    expect(labels()).toEqual(["Health:", "Mana:"]);
    for (const name of ["Health:", "Mana:"]) {
      const text = label(name)!;
      expect(text.args[0] as number).toBeLessThan(cam.width / 2);
      expect(text.args[1] as number).toBeGreaterThan(cam.height / 2);
      expect((text.args[3] as { fontFamily?: string }).fontFamily).toBe(CANVAS_FONT.body);
    }
    // the resource bar sits under the health bar
    expect(label("Mana:")!.args[1] as number).toBeGreaterThan(label("Health:")!.args[1] as number);
  });

  it("should label a stamina resource Stamina:, and parry charges Parry:", () => {
    const { run, labels } = barsOnStage();
    run.handleGameStateUpdate(withMe(me({ resource: { kind: "stamina", current: 5, max: 10, ability_cost: 5 } })));
    expect(labels()).toEqual(["Health:", "Stamina:"]);
    run.handleGameStateUpdate(withMe(me({ resource: { kind: "parry_charges", current: 2, max: 3, ability_cost: 0 } })));
    expect(labels()).toEqual(["Health:", "Parry:"]);
  });

  it("should show the health bar alone when the state carries no resource", () => {
    const { run, labels } = barsOnStage();
    run.handleGameStateUpdate(withMe(me({ resource: undefined })));
    expect(labels()).toEqual(["Health:"]);
  });

  it.each([
    ["dies", { current_health: 0 }],
    ["escapes", { escape: true }],
  ])("should take the bars down when the player %s, and keep them down", (_, fields) => {
    const { run, labels } = barsOnStage();
    run.handleGameStateUpdate(withMe(me()));
    run.handleGameStateUpdate(withMe(me(fields)));
    expect(labels()).toEqual([]);
    run.handleGameStateUpdate(withMe(me(fields)));
    expect(labels()).toEqual([]);
  });

  it("should draw no bar over the player's own head, health or resource", () => {
    const { run, stage } = barsOnStage();
    /** World-space graphics framing a bar (a filled, stroked rect), as the overhead bars draw. */
    const overheadBars = () =>
      stage.made.filter(
        (m) =>
          m.kind === "graphics" &&
          !m.destroyed &&
          !m.calls.includes("setScrollFactor") &&
          m.calls.includes("fillRect") &&
          m.calls.includes("strokeRect"),
      );
    const alone = (ally?: ReturnType<typeof player>) =>
      ({ ...withMe(me()), other_players: ally ? [ally] : [], monsters: [] }) as GameState;

    run.handleGameStateUpdate(alone());
    expect(overheadBars()).toHaveLength(0);
    // the same probe finds a teammate's bar, so the empty answer above is not vacuous
    run.handleGameStateUpdate(alone(player("ally", "Wenna", 160)));
    expect(overheadBars()).toHaveLength(1);
  });

  it("should build the bars afresh after a restart", () => {
    const { run, labels } = barsOnStage();
    run.handleGameStateUpdate(withMe(me()));
    (run as unknown as { resetRun(): void }).resetRun();
    run.handleGameStateUpdate(withMe(me()));
    expect(labels().filter((l) => l === "Health:").length).toBeGreaterThanOrEqual(1);
  });
});

describe("BarrowspireScene ability card (FS-8AY7S req 29–33)", () => {
  type Resource = { kind: string; current: number; max: number; ability_cost: number };
  const stamina = (current: number): Resource => ({ kind: "stamina", current, max: 100, ability_cost: 25 });
  const me = (fields: { class?: string; resource?: Resource; escape?: boolean; current_health?: number } = {}) => ({
    ...player("me", "Aldric", 130),
    resource: stamina(100),
    ...fields,
  });
  const withMe = (self: ReturnType<typeof me>): GameState =>
    ({ ...floorState(1), current_player: self, other_players: [player("ally", "Wenna", 160)] }) as GameState;

  interface Carded {
    abilityHud?: { shown: { name: string; greyed: boolean } | null };
    leaveButton?: unknown;
    bindRunInput(): void;
    resetRun(): void;
  }

  function cardOnStage() {
    const stage = onStage();
    const carded = stage.run as unknown as Carded;
    const cam = (stage.run.cameras as { main: { width: number; height: number } }).main;
    const pointerHandlers: Record<string, (...args: unknown[]) => void> = {};
    Object.assign(stage.run, {
      input: {
        setDefaultCursor: vi.fn(),
        keyboard: { on: vi.fn() },
        on: (event: string, fn: () => void) => (pointerHandlers[event] = fn),
      },
    });
    // a click off the satchel: it takes none
    Object.assign((stage.run as unknown as { containerView: object }).containerView, { pointerDown: vi.fn(() => false) });
    const live = () => stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed);
    const text = (content: string) => live().find((m) => m.args[2] === content);
    const shown = () => carded.abilityHud?.shown ?? null;
    const rightClick = () =>
      pointerHandlers.pointerdown({
        x: 10,
        y: 10,
        button: 2,
        worldX: 400,
        worldY: 300,
        leftButtonDown: () => false,
        rightButtonDown: () => true,
      });
    const delayed = () =>
      (stage.run.time as { delayedCall: ReturnType<typeof vi.fn> }).delayedCall.mock.calls as [number, () => void][];
    return { ...stage, carded, cam, live, text, shown, rightClick, delayed };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["warrior", "Dash", "Charge a short way toward the cursor."],
    ["mage", "Triple Fireball", "Hurl three fireballs in a spread toward the cursor."],
    ["archer", "Shadow Shot", "Hold to aim, release to loose one slow, heavy bolt."],
  ])("should show the %s's card at the bottom right in a run, in the body serif", (cls, name, line) => {
    const { run, cam, text } = cardOnStage();
    run.handleGameStateUpdate(withMe(me({ class: cls })));
    for (const content of [name, line]) {
      const t = text(content)!;
      expect(t).toBeDefined();
      expect(t.args[0] as number).toBeGreaterThan(cam.width / 2);
      expect(t.args[1] as number).toBeGreaterThan(cam.height / 2);
      expect((t.args[3] as { fontFamily?: string }).fontFamily).toBe(CANVAS_FONT.body);
    }
  });

  it("should grey the card with the pool one short of the cost, and light it at the cost", () => {
    const { run, shown } = cardOnStage();
    run.handleGameStateUpdate(withMe(me({ resource: stamina(24) })));
    expect(shown()?.greyed).toBe(true);
    run.handleGameStateUpdate(withMe(me({ resource: stamina(25) })));
    expect(shown()?.greyed).toBe(false);
  });

  it("should show the card lit with no resource on the wire", () => {
    const { run, shown } = cardOnStage();
    run.handleGameStateUpdate(withMe(me({ resource: undefined })));
    expect(shown()).toMatchObject({ name: "Dash", greyed: false });
  });

  it("should grey the card for the lockout after a right-click, and light it once the lockout ends", () => {
    const { run, carded, sent, shown, rightClick, delayed } = cardOnStage();
    run.handleGameStateUpdate(withMe(me()));
    carded.bindRunInput();
    rightClick();
    expect(sent.mock.calls.some(([action]) => action === ActionType.CastSkill)).toBe(true);
    expect(shown()?.greyed).toBe(true);

    const lockout = delayed().find(([ms]) => ms === 400);
    lockout![1]();
    expect(shown()?.greyed).toBe(false);
  });

  it("should show no card for a class with no row", () => {
    const { run, shown } = cardOnStage();
    run.handleGameStateUpdate(withMe(me({ class: "necromancer" })));
    expect(shown()).toBeNull();
  });

  it("should show no card in the hub", () => {
    const { run, shown, text } = cardOnStage();
    run.handleGameStateUpdate({ ...withMe(me()), world_type: "hub" } as GameState);
    expect(shown()).toBeNull();
    expect(text("Dash")).toBeUndefined();
  });

  it.each([
    ["dies", { current_health: 0 }],
    ["escapes", { escape: true }],
  ])("should take the card down when the player %s", (_, fields) => {
    const { run, shown, text } = cardOnStage();
    run.handleGameStateUpdate(withMe(me()));
    expect(text("Dash")).toBeDefined();
    run.handleGameStateUpdate(withMe(me(fields)));
    expect(shown()).toBeNull();
    expect(text("Dash")).toBeUndefined();
  });

  it("should never be up with the leave button", () => {
    const { run, carded, text } = cardOnStage();
    run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
    expect(carded.leaveButton).toBeDefined();
    expect(text("Dash")).toBeUndefined();
  });

  it("should build the card afresh after a restart", () => {
    const { run, carded, text } = cardOnStage();
    run.handleGameStateUpdate(withMe(me()));
    carded.resetRun();
    run.handleGameStateUpdate(withMe(me()));
    expect(text("Dash")).toBeDefined();
  });

  it.each(["warrior", "mage", "archer", "mercenary"])("should show the %s's card with no MP on it", (cls) => {
    const { run, live, shown } = cardOnStage();
    run.handleGameStateUpdate(withMe(me({ class: cls })));
    expect(shown()).not.toBeNull();
    expect(live().map((t) => String(t.args[2])).filter((t) => /\bMP\b/.test(t))).toEqual([]);
  });

  it("should price nothing in MP on the main menu's controls line", () => {
    expect(MENU_CONTROLS).not.toMatch(/\bMP\b/);
    expect(MENU_CONTROLS).toContain("R-Click Class Ability");
  });
});

describe("BarrowspireScene level and experience (FS-BDA7X req 42, 43)", () => {
  const me = (level: number, experience: number, level_floor: number, next_level_at?: number) => ({
    id: "me",
    entity_id: "e_me",
    username: "Aldric",
    class: "warrior",
    position: at(130, 300),
    direction: { vx: 0, vy: 0, speed: 0 },
    escape: false,
    current_health: 100,
    max_health: 100,
    level,
    experience,
    level_floor,
    ...(next_level_at === undefined ? {} : { next_level_at }),
  });
  const withMe = (self: ReturnType<typeof me>): GameState =>
    ({ ...floorState(1), current_player: self }) as GameState;

  function onStage() {
    const scene = sceneOnStage();
    const cues = () =>
      scene.texts().filter((t) => /^Risen to level/.test(String(t.content)));
    const shown = (content: string) => scene.texts().some((t) => t.content === content);
    return { ...scene, cues, shown };
  }

  it("should show the player's level and experience on the HUD in the body serif", () => {
    const { run, texts, shown } = onStage();
    run.handleGameStateUpdate(withMe(me(2, 150, 100, 230)));
    expect(shown("Level 2")).toBe(true);
    expect(shown("50 / 130")).toBe(true);
    const label = texts().find((t) => t.content === "Level 2");
    expect(label?.style.fontFamily).toBe(CANVAS_FONT.body);
  });

  it("should mark the cap when the server sends no next level", () => {
    const { run, shown } = onStage();
    run.handleGameStateUpdate(withMe(me(20, 40000, 38530)));
    expect(shown("Level 20 · Cap")).toBe(true);
  });

  it("should show the level-up cue once when the level rises, and not again while it holds", () => {
    const { run, cues } = onStage();
    run.handleGameStateUpdate(withMe(me(2, 220, 100, 230)));
    run.handleGameStateUpdate(withMe(me(3, 240, 230, 390)));
    run.handleGameStateUpdate(withMe(me(3, 250, 230, 390)));
    expect(cues().map((c) => c.content)).toEqual(["Risen to level 3"]);
  });

  it("should raise no cue for the level a player arrives with", () => {
    const { run, cues } = onStage();
    run.handleGameStateUpdate(withMe(me(7, 1300, 1210, 1650)));
    expect(cues()).toHaveLength(0);
  });

  it("should treat the first state after a restart as the baseline again", () => {
    const { run, cues } = onStage();
    run.handleGameStateUpdate(withMe(me(2, 150, 100, 230)));
    (run as unknown as { resetRun(): void }).resetRun();
    run.handleGameStateUpdate(withMe(me(4, 400, 390, 600)));
    expect(cues()).toHaveLength(0);
  });
});

describe("BarrowspireScene drop piles (FS-4R9M9 req 46, 61)", () => {
  const blade = { item_id: "i1", entity_id: "ie1", name: "Notched Blade", quantity: 1, attack_power: 6 };
  const pile = (items: (typeof blade)[], x = 400) => ({
    container_id: "pc",
    entity_id: "pile1",
    kind: "drop_pile" as const,
    position: at(x, 300),
    is_open: true,
    items,
  });
  const withPile = (p: ReturnType<typeof pile> | null): GameState => {
    const state = floorState(1);
    return { ...state, containers: p ? [...state.containers, p] : state.containers };
  };

  function onStage() {
    const scene = sceneOnStage();
    const heaps = () => scene.stage.made.filter((m) => m.kind === "sprite" && m.args[2] === "drop_pile");
    const live = () => heaps().filter((m) => !m.destroyed);
    const chests = () =>
      scene.stage.made.filter((m) => m.kind === "sprite" && String(m.args[2]).startsWith("chest_"));
    return { ...scene, heaps, live, chests };
  }

  it("should not draw an emptied pile", () => {
    const { run, heaps } = onStage();
    run.handleGameStateUpdate(withPile(pile([])));
    expect(heaps()).toHaveLength(0);
  });

  it("should draw a heap, not a chest, where a pile with loot lies", () => {
    const { run, live, chests } = onStage();
    run.handleGameStateUpdate(withPile(pile([blade])));
    expect(live()).toHaveLength(1);
    // the floor's chest is the only coffer drawn as a chest
    expect(chests()).toHaveLength(1);
  });

  it("should take the heap down once the pile is emptied, and keep it down", () => {
    const { run, heaps, live } = onStage();
    run.handleGameStateUpdate(withPile(pile([blade])));
    run.handleGameStateUpdate(withPile(pile([])));
    run.handleGameStateUpdate(withPile(pile([])));
    expect(live()).toHaveLength(0);
    expect(heaps()).toHaveLength(1);
  });

  it("should take the heap down when the pile leaves state", () => {
    const { run, live } = onStage();
    run.handleGameStateUpdate(withPile(pile([blade])));
    run.handleGameStateUpdate(withPile(null));
    expect(live()).toHaveLength(0);
  });

  it("should clear the heap with the floor it lay on", () => {
    const { run, live } = onStage();
    run.handleGameStateUpdate(withPile(pile([blade])));
    run.handleGameStateUpdate(floorState(2));
    expect(live()).toHaveLength(0);
  });

  it("should open the pile in the container view when a player beside it interacts", () => {
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const { run } = onStage();
    const view = { entityId: null as string | null, open: vi.fn(), close: vi.fn(), setItems: vi.fn() };
    const scene = run as unknown as {
      containerView: typeof view;
      player?: unknown;
      playerPos?: { x: number; y: number };
      getNearbyChest(): { entityId: string } | null;
      toggleChest(id: string): void;
    };
    scene.containerView = view;
    scene.player = {};
    scene.playerPos = at(410, 300);
    run.handleGameStateUpdate(withPile(pile([blade])));

    const near = scene.getNearbyChest();
    expect(near?.entityId).toBe("pile1");
    scene.toggleChest(near!.entityId);

    expect(view.open).toHaveBeenCalledWith("pile1");
    expect(view.setItems).toHaveBeenCalledWith([blade]);
    vi.restoreAllMocks();
  });

  it("should not offer an emptied pile to the interact key", () => {
    const { run } = onStage();
    const scene = run as unknown as {
      player?: unknown;
      playerPos?: { x: number; y: number };
      getNearbyChest(): { entityId: string } | null;
    };
    scene.player = {};
    scene.playerPos = at(410, 300);
    run.handleGameStateUpdate(withPile(pile([])));
    expect(scene.getNearbyChest()).toBeNull();
  });
});

describe("BarrowspireScene burning trails (FS-4R9M9 req 36, 56, 61)", () => {
  const trail = (entity_id: string, remaining = 3) => ({
    entity_id,
    from: at(200, 300),
    to: at(320, 300),
    half_width: 30,
    remaining,
  });
  const withTrails = (trails?: ReturnType<typeof trail>[], floor = 1): GameState =>
    ({ ...floorState(floor), ...(trails ? { trails } : {}) }) as GameState;

  function onStage() {
    const scene = sceneOnStage();
    const marks = (id: string) =>
      scene.stage.made.filter((m) => (m as Made & { name?: string }).name?.startsWith(`trail:${id}`));
    const live = (id: string) => marks(id).filter((m) => !m.destroyed);
    return { ...scene, marks, live };
  }

  it("should burn a trail in state along its path", () => {
    const { run, live } = onStage();
    run.handleGameStateUpdate(withTrails([trail("t1")]));
    expect(live("t1")).toHaveLength(2);
  });

  it("should keep one trail's marks while it burns down, not build more", () => {
    const { run, marks } = onStage();
    run.handleGameStateUpdate(withTrails([trail("t1", 3)]));
    run.handleGameStateUpdate(withTrails([trail("t1", 2)]));
    run.handleGameStateUpdate(withTrails([trail("t1", 1)]));
    expect(marks("t1")).toHaveLength(2);
  });

  it("should put the trail out once it leaves state, the key gone with it", () => {
    const { run, live } = onStage();
    run.handleGameStateUpdate(withTrails([trail("t1"), trail("t2")]));
    run.handleGameStateUpdate(withTrails([trail("t2")]));
    expect(live("t1")).toHaveLength(0);
    expect(live("t2")).toHaveLength(2);
    run.handleGameStateUpdate(withTrails(undefined));
    expect(live("t2")).toHaveLength(0);
  });

  it("should put out every trail with the floor it burnt on", () => {
    const { run, live } = onStage();
    run.handleGameStateUpdate(withTrails([trail("t1")]));
    run.handleGameStateUpdate(withTrails(undefined, 2));
    expect(live("t1")).toHaveLength(0);
  });

  describe("under a roof (guideline \"Lighting\"), in the exterior world theme", () => {
    // house h1 stands at (100, 100), 200 × 160: this trail burns inside it
    const indoors = (entity_id: string) => ({ ...trail(entity_id), from: at(150, 150), to: at(250, 150) });
    /** Whether the trail's glow is painted now: filled since it was last cleared. */
    const glowing = (live: (id: string) => Made[], id: string) => {
      const glow = live(id).find((m) => (m as Made & { name?: string }).name === `trail:${id}:glow`)!;
      return glow.calls.lastIndexOf("fillPoints") > glow.calls.lastIndexOf("clear");
    };

    /** A run drawn in the exterior world theme, the only one with roofs. */
    const outdoors = () => {
      const stage = onStage();
      Object.assign(stage.run, { worldLook: WORLD_THEMES.exterior });
      return stage;
    };

    it("should not glow through the roof of a house the player is outside of", () => {
      const { run, live } = outdoors();
      run.handleGameStateUpdate(withTrails([indoors("t1")]));
      expect(glowing(live, "t1")).toBe(false);
    });

    it("should glow once the player is inside that house, its roof off", () => {
      const { run, live } = outdoors();
      run.handleGameStateUpdate(withTrails([indoors("t1")]));
      const scene = run as unknown as { buildings: unknown[]; currentBuilding: unknown };
      scene.currentBuilding = scene.buildings[0];
      run.handleGameStateUpdate(withTrails([indoors("t1")]));
      expect(glowing(live, "t1")).toBe(true);
    });

    it("should glow in the open, under no roof", () => {
      const { run, live } = outdoors();
      run.handleGameStateUpdate(withTrails([trail("t1")]));
      expect(glowing(live, "t1")).toBe(true);
    });

    it("should glow in a tower room, which has no roof to hide it (FS-8RBQY §B.3)", () => {
      const { run, live } = onStage();
      run.handleGameStateUpdate(withTrails([indoors("t1")]));
      expect(glowing(live, "t1")).toBe(true);
    });
  });

  it("should forget the stopped run's trails, so the next start burns them fresh", () => {
    const { run, marks } = onStage();
    run.handleGameStateUpdate(withTrails([trail("t1")]));
    (run as unknown as { resetRun(): void }).resetRun();
    run.handleGameStateUpdate(withTrails([trail("t1")]));
    // Phaser destroyed the stopped run's marks; the new run makes its own
    expect(marks("t1")).toHaveLength(4);
  });
});

describe("BarrowspireScene world theme (FS-8RBQY §A, §B)", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../public/art/manifest.json"), "utf8"),
  );
  interface ThemedRun extends FloorRun {
    worldLook: unknown;
    perimeter?: Made[];
    buildings: { roof: unknown[] }[];
    currentBuilding: unknown;
    player?: unknown;
    playerPos?: { x: number; y: number };
    events: { emit(event: string): boolean };
    checkBuildingStatus(): void;
    createUI(): void;
  }
  /** A run on stage in a world theme, with the baked art or with none. */
  function themed(theme: "exterior" | "tower", baked = false) {
    const stage = sceneOnStage();
    const run = stage.run as unknown as ThemedRun;
    run.worldLook = WORLD_THEMES[theme];
    if (baked) run.art = new ArtLibrary(manifest, { warn: () => {} });
    return { ...stage, run };
  }
  const slits = (lights: unknown[]) =>
    lights.filter((l) => (l as { radius: number }).radius === 120).length;

  it("should ring a tower floor with its outer wall, and stamp each arrow slit's cold light", () => {
    const { run, lights } = themed("tower", true);
    run.handleGameStateUpdate(floorState(1));
    run.handleGameStateUpdate(floorState(1));
    // 36 + 24 tiles along each pair of sides, a pier at each corner: built once, not per broadcast
    expect(run.perimeter).toHaveLength(2 * 36 + 2 * 24 + 4);
    expect(slits(lights)).toBe(10);
  });

  it("should take the outer wall and its lights down on a climb, and raise the next floor's", () => {
    const { run, lights } = themed("tower", true);
    run.handleGameStateUpdate(floorState(1));
    const floorOne = run.perimeter!;

    run.handleGameStateUpdate(floorState(2));

    expect(floorOne.every((m) => m.destroyed)).toBe(true);
    expect(run.perimeter).not.toBe(floorOne);
    expect(run.perimeter!.every((m) => !m.destroyed)).toBe(true);
    // the old floor's slit lights went with the light-map's fixed sources; the new floor's are in
    expect(slits(lights)).toBe(10);
  });

  it("should leave the outer wall out without its art, keeping the floor playable (§B.8)", () => {
    const { run } = themed("tower");
    run.handleGameStateUpdate(floorState(1));
    expect(run.perimeter).toEqual([]);
  });

  it("should build no outer wall in the exterior world theme", () => {
    const { run, lights } = themed("exterior", true);
    run.handleGameStateUpdate(floorState(1));
    expect(run.perimeter).toBeUndefined();
    expect(slits(lights)).toBe(0);
  });

  it("should roof no tower room, baked or placeholder (R1)", () => {
    for (const baked of [false, true]) {
      const { run } = themed("tower", baked);
      run.handleGameStateUpdate(floorState(1));
      expect(run.buildings).toHaveLength(1);
      expect(run.buildings[0].roof).toEqual([]);
    }
  });

  it("should still roof an exterior house", () => {
    const { run } = themed("exterior");
    run.handleGameStateUpdate(floorState(1));
    expect(run.buildings[0].roof).toHaveLength(1);
  });

  it("should never take a player in a tower room for indoors: no mask, no change", () => {
    const { run } = themed("tower");
    run.handleGameStateUpdate(floorState(1));
    Object.assign(run, { player: {}, playerPos: { x: 200, y: 180 } });
    run.checkBuildingStatus();
    expect(run.currentBuilding).toBeNull();
  });

  it("should still mask the world outside an exterior house the player enters", () => {
    const { run } = themed("exterior");
    run.handleGameStateUpdate(floorState(1));
    const mask = { setVisible: vi.fn(), clear: vi.fn(), fillStyle: vi.fn(), fillPoints: vi.fn() };
    Object.assign(run, { player: {}, playerPos: { x: 200, y: 180 }, indoorMask: mask });
    run.checkBuildingStatus();
    expect(run.currentBuilding).toBe(run.buildings[0]);
    expect(mask.setVisible).toHaveBeenCalledWith(true);
  });

  it.each(["tower", "exterior"] as const)(
    "should lay the %s floor without art as plain stone: no metal tiles, windows, stars or hull lights",
    (theme) => {
      const { run, stage } = themed(theme);
      (run as unknown as { createMapBackground(): void }).createMapBackground();
      expect(stage.made.some((m) => m.kind === "tileSprite")).toBe(false);
      expect(stage.made.filter((m) => m.kind === "graphics")).toHaveLength(1);
      expect((run.tweens as { add: ReturnType<typeof vi.fn> }).add).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["tower", "X: 200 Y: 180"],
    ["exterior", "X: 200 Y: 180 | Outdoor"],
  ] as const)("should show the %s world theme's position line as %j", (theme, line) => {
    const { run, texts } = themed(theme);
    run.createUI();
    Object.assign(run, { player: {}, playerPos: { x: 200, y: 180 } });
    run.events.emit("update");
    expect(texts().some((t) => t.content === line)).toBe(true);
  });
});

describe("BarrowspireScene floor bands, run dressing, light budget and stairs (FS-8RBQY §C, §E)", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../public/art/manifest.json"), "utf8"),
  );
  const { worldToScreen } = await_iso;
  interface BandRun extends FloorRun {
    worldLook: unknown;
    dressing?: (Made & { calls: string[] })[];
    stairs: { drawn: Map<string, { sprite: Made }> };
    occluders: { size: number; items: { sprite: unknown }[] };
  }
  function banded(theme: "exterior" | "tower", baked = true) {
    const stage = sceneOnStage();
    const run = stage.run as unknown as BandRun;
    run.worldLook = WORLD_THEMES[theme];
    if (baked) run.art = new ArtLibrary(manifest, { warn: () => {} });
    return { ...stage, run };
  }
  /** Sprites drawn from a sheet: their frame names start with it. */
  const drawnFrom = (made: Made[], sheet: string) =>
    made.filter((m) => m.kind === "sprite" && String(m.args[3] ?? "").startsWith(`${sheet}/`));
  const DRESSING = ["rubble", "bone_pile", "broken_crate", "roots", "chains", "brazier"];
  /** The stairs' pool: the manifest's radius, a touch brighter than a prop light. */
  const stairsPool = (lights: unknown[]) =>
    lights.filter((l) => {
      const { radius, intensity } = l as { radius: number; intensity: number };
      return radius === manifest.sheets.stairs_spiral.light.radius && intensity > 0.7;
    });

  it("should strew a tower floor with dressing once, never interactive and never in physics (§C.4)", () => {
    const { run, stage } = banded("tower");
    run.handleGameStateUpdate(floorState(1));
    const dressing = run.dressing!;
    expect(dressing.length).toBeGreaterThan(0);
    expect(dressing.length).toBeLessThanOrEqual(16);
    run.handleGameStateUpdate(floorState(1));
    expect(run.dressing).toBe(dressing);
    const strewn = DRESSING.flatMap((sheet) => drawnFrom(stage.made, sheet));
    expect(strewn).toHaveLength(dressing.length);
    for (const m of strewn) {
      expect(m.calls).not.toContain("setInteractive");
      expect(Object.keys(m.handlers)).toEqual([]);
    }
    const bodies = stage.made.filter((m) => m.kind === "staticGroup").flatMap((g) => g.children);
    expect(bodies.some((b) => strewn.includes(b))).toBe(false);
  });

  it("should take a floor's dressing down on a climb, and strew the next band's", () => {
    const { run } = banded("tower");
    run.handleGameStateUpdate(floorState(1));
    const floorOne = run.dressing!;
    run.handleGameStateUpdate(floorState(2));
    expect(floorOne.every((m) => m.destroyed)).toBe(true);
    expect(run.dressing).not.toBe(floorOne);
    expect(run.dressing!.length).toBeGreaterThan(0);
  });

  it("should strew nothing in the exterior world theme, nor without art (§A.3, §B.8)", () => {
    const exterior = banded("exterior");
    exterior.run.handleGameStateUpdate(floorState(1));
    expect(exterior.run.dressing ?? []).toEqual([]);
    const bare = banded("tower", false);
    bare.run.handleGameStateUpdate(floorState(1));
    expect(bare.run.dressing ?? []).toEqual([]);
  });

  it("should paint each floor's own ground: built directly on a reconnect, rebuilt on a climb (§C.7)", () => {
    const reconnect = banded("tower");
    reconnect.run.handleGameStateUpdate(floorState(3));
    expect((reconnect.grounds.at(-1) as { look: { hall: string } }).look.hall).toBe("ground_dressed");

    const climb = banded("tower");
    climb.run.handleGameStateUpdate(floorState(1));
    const one = climb.grounds.at(-1) as { look: { patches?: unknown }; seed: number };
    expect(one.look.patches).toBeDefined();
    climb.run.handleGameStateUpdate(floorState(2));
    const two = climb.grounds.at(-1) as { look: { patches?: unknown }; seed: number };
    expect(two.look.patches).toBeUndefined();
    expect(two.seed).not.toBe(one.seed);
  });

  it("should paint the exterior's ground as it always was, on every floor", () => {
    const { run, grounds } = banded("exterior");
    run.handleGameStateUpdate(floorState(1));
    run.handleGameStateUpdate(floorState(2));
    for (const g of grounds as { look: unknown; seed: number }[])
      expect(g).toEqual({ look: WORLD_THEMES.exterior.ground, seed: worldSeed("run") });
  });

  it.each(["tower", "exterior"] as const)(
    "should draw the %s floor's stairs as the baked spiral at the server position, an occluder in its own pool (§E)",
    (theme) => {
      const { run, stage, lights } = banded(theme);
      run.handleGameStateUpdate(floorState(1));
      const spiral = drawnFrom(stage.made, "stairs_spiral");
      expect(spiral).toHaveLength(1);
      const s = worldToScreen(500, 700);
      expect(spiral[0].args.slice(0, 2)).toEqual([s.x, s.y]);
      const sprite = run.stairs.drawn.get("st1")!.sprite;
      expect(run.occluders.items.some((o) => o.sprite === sprite)).toBe(true);
      expect(stairsPool(lights)).toHaveLength(1);
      // stamped once per floor build, not per broadcast
      run.handleGameStateUpdate(floorState(1));
      expect(stairsPool(lights)).toHaveLength(1);
    },
  );

  it("should fall back to the stairs_up placeholder without art, and draw no stairs on the top floor", () => {
    const { run, stage, lights } = banded("tower", false);
    run.handleGameStateUpdate(floorState(1));
    expect(stage.made.filter((m) => m.kind === "sprite" && m.args[2] === "stairs_up")).toHaveLength(1);
    expect(stairsPool(lights)).toHaveLength(0);
    const top = banded("tower");
    top.run.handleGameStateUpdate(floorState(3));
    expect(drawnFrom(top.stage.made, "stairs_spiral")).toHaveLength(0);
    expect(stairsPool(top.lights)).toHaveLength(0);
  });

  it("should stamp no more than 24 fixed lights on a crowded floor, dropping slits first and keeping the stairs pool (§C.6)", () => {
    const { run, lights } = banded("tower");
    const sconces = { ...TOWER_BANDS.lower.walls, back: [[100, "sconce"]] };
    run.worldLook = {
      ...WORLD_THEMES.tower,
      bands: { ...TOWER_BANDS, lower: { ...TOWER_BANDS.lower, walls: sconces } },
    };
    const state = floorState(1);
    // a long north wall of sconces: 30 pieces, more than the budget holds with the slits
    state.walls = [
      ...state.walls,
      { house_id: "big", entity_id: "bn", position: at(100, 400), width: 1200, height: 10 },
      { house_id: "big", entity_id: "bs", position: at(100, 900), width: 1200, height: 10 },
    ];
    run.handleGameStateUpdate(state);
    expect(lights).toHaveLength(24);
    expect(stairsPool(lights)).toHaveLength(1);
    expect(lights.filter((l) => (l as { radius: number }).radius === 120)).toHaveLength(0);
  });

  /** Faint amber pools on the things a player uses, as `interactablePool` makes them. */
  const pools = (lights: unknown[]) =>
    lights.filter((l) => (l as { radius: number }).radius === INTERACTABLE_RADIUS);

  it("should stand the chest and the switch in faint amber pools on a tower floor, once per floor", () => {
    const { run, lights } = banded("tower");
    run.handleGameStateUpdate(floorState(1));
    run.handleGameStateUpdate(floorState(1));
    const chest = worldToScreen(150, 150);
    const lever = worldToScreen(400, 600);
    expect(pools(lights)).toHaveLength(2);
    expect(pools(lights).map((l) => [(l as { x: number }).x, (l as { y: number }).y])).toEqual(
      expect.arrayContaining([
        [chest.x, chest.y - 12],
        [lever.x, lever.y - 12],
      ]),
    );
  });

  it("should light no pool under an exterior chest, a drop pile, or anything without art", () => {
    const exterior = banded("exterior");
    exterior.run.handleGameStateUpdate(floorState(1));
    expect(pools(exterior.lights)).toHaveLength(0);
    const bare = banded("tower", false);
    bare.run.handleGameStateUpdate(floorState(1));
    expect(pools(bare.lights)).toHaveLength(0);
    const pile = banded("tower");
    const state = floorState(1);
    state.containers = [{ ...state.containers[0], kind: "drop_pile", items: [{} as never] }];
    pile.run.handleGameStateUpdate(state);
    expect(pools(pile.lights)).toHaveLength(1);
  });
});

describe("BarrowspireScene result card hold (FS-QPDKN req 15, 16, 17)", () => {
  const hub = { session_id: "hub-1", world_type: "hub" as const };

  function onStage() {
    const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const scene = sceneOnStage();
    const start = vi.fn();
    const run = scene.run as FloorRun & { resultHold: import("@/components/resultHold").ResultHold };
    Object.assign(run, { scene: { start } });
    const buttons = () =>
      scene.stage.made.filter((m) => m.kind === "rectangle" && m.handlers.pointerdown && !m.destroyed);
    return { ...scene, run, sent, start, buttons };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should put up one button, Return to the hub, and neither legacy one", () => {
    const { run, texts, buttons } = onStage();
    run.showGameEndOverlay(1, "escaped");

    expect(buttons()).toHaveLength(1);
    const labels = texts().map((t) => String(t.content));
    expect(labels.filter((l) => /return to the hub/i.test(l))).toHaveLength(1);
    expect(labels.some((l) => /delve again|withdraw/i.test(l))).toBe(false);
  });

  it("should hold the hub world behind the card and apply it when the button is pressed", () => {
    const { run, sent, start, buttons } = onStage();
    run.showGameEndOverlay(3, "eliminated");
    const apply = vi.fn();

    expect(run.resultHold.hold(hub, apply)).toBe(true);
    expect(apply).not.toHaveBeenCalled();

    buttons()[0].handlers.pointerdown();

    expect(apply).toHaveBeenCalledWith(hub);
    // client-only: nothing goes to the server, and the switch is the handler's, not the scene's
    expect(sent).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("should forget the held world when the scene stops, so the next run gets no stale switch", () => {
    const { run } = onStage();
    (run as unknown as { init(): void }).init();
    run.showGameEndOverlay(2, "survived");
    const apply = vi.fn();
    run.resultHold.hold(hub, apply);

    (run as unknown as RunState).events.emit("shutdown");

    run.resultHold.release();
    expect(apply).not.toHaveBeenCalled();
    expect(run.resultHold.hold(hub, apply)).toBe(false);
  });
});


describe("no way out of a run on ESC (reported 2026-10-29)", () => {
  // ESC used to start MainMenuScene from inside a run. The server keeps the body in the
  // world regardless, so the player stood there being killed while looking at the roster;
  // the only early exit is the dead player's Leave the barrow (FS-QPDKN req 13).
  it("should bind no ESC handler that leaves the run, nor list one in the controls", () => {
    const source = readFileSync(join(__dirname, "BarrowspireScene.ts"), "utf8");
    expect(source).not.toMatch(/keydown-ESC/);
    expect(source).not.toMatch(/\["ESC",\s*"Main Menu"\]/);
  });
});

describe("state from another world is not drawn (reported 2026-10-29)", () => {
  // A member can briefly have a body in two worlds (a stale run and a new one, or a run and
  // the hub); both broadcast to the same socket. The scene draws only the run it was started
  // for, so the player is not snapped between two positions every tick.
  interface Filtered {
    lastGameState?: unknown;
    sessionID?: string;
    acceptsFrame(s: { session_id: string }): boolean;
    handleGameStateUpdate(s: unknown): void;
    resetRun(): void;
  }

  it("should accept only frames of the session the scene was started for", () => {
    const scene = new BarrowspireScene();
    const run = scene as unknown as Filtered;
    scene.init({ sessionID: "run-a" });
    expect(run.acceptsFrame({ session_id: "run-a" })).toBe(true);
    expect(run.acceptsFrame({ session_id: "run-b" })).toBe(false);
  });

  it("should drop a foreign frame before it touches anything", () => {
    const scene = new BarrowspireScene();
    const run = scene as unknown as Filtered;
    scene.init({ sessionID: "run-a" });
    run.handleGameStateUpdate({ session_id: "run-b", current_player: null });
    expect(run.lastGameState).toBeUndefined();
  });

  it("should accept everything when started without a session, and forget the session on reset", () => {
    const scene = new BarrowspireScene();
    const run = scene as unknown as Filtered;
    scene.init();
    expect(run.acceptsFrame({ session_id: "whatever" })).toBe(true);

    scene.init({ sessionID: "run-a" });
    run.resetRun();
    expect(run.sessionID).toBeUndefined();
    expect(run.acceptsFrame({ session_id: "run-b" })).toBe(true);
  });
});

describe("BarrowspireScene ESC menu and Fall where you stand (FS-9K8EZ req 1–8; edge states: Menu)", () => {
  interface FakeKey {
    justDown: boolean;
    isDown: boolean;
  }
  const key = (): FakeKey => ({ justDown: false, isDown: false });

  /** What the scene holds for the run's menu. */
  interface Menued {
    menu?: unknown;
    menuChoices?: unknown;
    fallPending: boolean;
    leavePending: boolean;
    controlsPanel?: unknown;
    dismissKey?: FakeKey;
    confirmKey?: FakeKey;
    choiceKeys: FakeKey[];
    offerMenu(): void;
    openMenu(): void;
    bindRunInput(): void;
    sendMovementIntent(vx: number, vy: number): void;
    canSendMove(): boolean;
    toggleControlsPanel(): void;
    fallRefused(info: { message?: string }): void;
    showGameEndOverlay(position: number, result?: string): void;
    resetRun(): void;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };

  function menuOnStage(me: ReturnType<typeof player> | null = player("me", "Aldric", 130)) {
    const stage = onStage();
    const run = stage.run as unknown as Menued;
    const keys = { esc: key(), enter: key(), one: key(), two: key() };
    run.dismissKey = keys.esc;
    run.confirmKey = keys.enter;
    run.choiceKeys = [keys.one, keys.two];
    const keyHandlers: Record<string, (...args: unknown[]) => void> = {};
    const pointerHandlers: Record<string, (...args: unknown[]) => void> = {};
    Object.assign(stage.run, {
      input: {
        setDefaultCursor: vi.fn(),
        keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) },
        on: (event: string, fn: () => void) => (pointerHandlers[event] = fn),
      },
    });
    stage.run.handleGameStateUpdate(partyState(me));
    const press = (k: FakeKey) => {
      k.justDown = true;
      run.offerMenu();
    };
    const option = (id: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === `menu-${id}` && !m.destroyed);
    const pick = (id: string) => option(id)?.handlers.pointerup();
    const labels = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    const sentOf = (action: string) => stage.sent.mock.calls.filter(([a]) => a === action);
    const hit = (name: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
    return { ...stage, run, keys, keyHandlers, pointerHandlers, press, option, pick, labels, sentOf, hit };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should open the menu on ESC, with Fall where you stand and Back for a player in play", () => {
    const { run, keys, press, option, labels } = menuOnStage();
    press(keys.esc);

    expect(run.menu).toBeDefined();
    expect(option("fall")).toBeDefined();
    expect(option("back")).toBeDefined();
    expect(labels()).toContain("Fall where you stand  [1]");
    expect(labels()).toContain("Back  [Esc]");
  });

  it("should close the menu on a second ESC, and on Back, taking its hit areas with it", () => {
    const { run, keys, press, option, pick } = menuOnStage();
    press(keys.esc);
    const fall = option("fall");
    press(keys.esc);
    expect(run.menu).toBeUndefined();
    expect(fall?.destroyed).toBe(true);

    press(keys.esc);
    pick("back");
    expect(run.menu).toBeUndefined();
    expect(option("fall")).toBeUndefined();
  });

  it.each([
    ["dead", dead, ["leave", "back"], "Leave the barrow  [1]"],
    ["escaped", escaped, ["back"], "Back  [Esc]"],
  ])("should offer a %s player %j", (_, me, ids, label) => {
    const { keys, press, option, labels } = menuOnStage(player("me", "Aldric", 130, me));
    press(keys.esc);
    for (const id of ["fall", "leave", "back"])
      expect(option(id) !== undefined).toBe(ids.includes(id));
    expect(labels()).toContain(label);
  });

  it("should do nothing on ESC once the result card is up", () => {
    const { run, keys, press } = menuOnStage();
    run.showGameEndOverlay(1, "escaped");
    press(keys.esc);
    expect(run.menu).toBeUndefined();
  });

  it("should list ESC as the menu in the controls panel", () => {
    const { run, labels } = menuOnStage();
    run.toggleControlsPanel();
    expect(labels()).toContain("ESC");
    expect(labels()).toContain("Menu");
  });

  it("should swap the rows for the confirm on Fall where you stand, and send nothing until Fall", () => {
    const { keys, press, option, labels, sent } = menuOnStage();
    press(keys.esc);
    press(keys.one);

    expect(labels()).toContain("The barrow keeps its dead. Fall here?");
    expect(option("fall-now")).toBeDefined();
    expect(option("not-yet")).toBeDefined();
    expect(option("fall")).toBeUndefined();
    expect(labels()).toContain("Fall  [1]");
    expect(labels()).toContain("Not yet  [Esc]");
    expect(sent).not.toHaveBeenCalled();
  });

  it.each([
    ["Not yet", (s: ReturnType<typeof menuOnStage>) => s.pick("not-yet")],
    ["Esc", (s: ReturnType<typeof menuOnStage>) => s.press(s.keys.esc)],
  ])("should return to the run on %s with nothing sent", (_, back) => {
    const s = menuOnStage();
    s.press(s.keys.esc);
    s.pick("fall");
    back(s);
    expect(s.run.menu).toBeUndefined();
    expect(s.option("fall-now")).toBeUndefined();
    expect(s.sent).not.toHaveBeenCalled();
    expect(s.run.fallPending).toBe(false);
  });

  it("should send forfeit_run once on Fall, with no payload, and nothing on a second press", () => {
    const { run, keys, press, pick, sentOf, option } = menuOnStage();
    press(keys.esc);
    pick("fall");
    pick("fall-now");
    pick("fall-now");
    press(keys.one);
    press(keys.enter);

    expect(sentOf(ActionType.ForfeitRun)).toEqual([[ActionType.ForfeitRun, {}]]);
    expect(run.fallPending).toBe(true);
    // the confirm stays up, Fall dimmed, until the server answers
    expect(option("fall-now")).toBeDefined();
  });

  it("should answer Fall where you stand on Enter, then Fall on Enter", () => {
    const { keys, press, sentOf } = menuOnStage();
    press(keys.esc);
    press(keys.enter);
    press(keys.enter);
    expect(sentOf(ActionType.ForfeitRun)).toHaveLength(1);
  });

  it("should send leave_run through the card's path from a dead player's menu, once", () => {
    const { run, keys, press, pick, sentOf, hit } = menuOnStage(player("me", "Aldric", 130, dead));
    press(keys.esc);
    pick("leave");
    expect(sentOf(ActionType.LeaveRun)).toEqual([[ActionType.LeaveRun, {}]]);
    expect(run.leavePending).toBe(true);
    expect(run.menu).toBeUndefined();
    // the card's own button is pending too: one send between them
    expect(hit("leave-the-barrow")?.calls).toContain("disableInteractive");
    hit("leave-the-barrow")?.handlers.pointerdown();
    press(keys.esc);
    pick("leave");
    expect(sentOf(ActionType.LeaveRun)).toHaveLength(1);
  });

  it("should send no move while the menu is open, stopping a stride it interrupts once", () => {
    const { run, keys, press, sentOf } = menuOnStage();
    run.sendMovementIntent(0, -1);
    expect(sentOf(ActionType.Move)).toEqual([[ActionType.Move, { vx: 0, vy: -1 }]]);

    press(keys.esc);
    expect(run.canSendMove()).toBe(false);
    run.sendMovementIntent(0, -1);
    run.sendMovementIntent(0, -1);
    run.sendMovementIntent(1, 0);
    expect(sentOf(ActionType.Move).slice(1)).toEqual([[ActionType.Move, { vx: 0, vy: 0 }]]);

    // closing resumes
    press(keys.esc);
    run.sendMovementIntent(1, 0);
    expect(sentOf(ActionType.Move).at(-1)).toEqual([ActionType.Move, { vx: 1, vy: 0 }]);
  });

  it("should send no stop when the menu opens over a player standing still", () => {
    const { run, keys, press, sentOf } = menuOnStage();
    run.sendMovementIntent(0, 0);
    press(keys.esc);
    run.sendMovementIntent(0, 0);
    expect(sentOf(ActionType.Move)).toHaveLength(0);
  });

  it("should drop E, F, I, Q and H while the menu is open, and answer them again once it closes", () => {
    const s = menuOnStage();
    s.run.bindRunInput();
    const containerView = (s.run as unknown as { containerView: { close: ReturnType<typeof vi.fn>; lootFirst: ReturnType<typeof vi.fn> } }).containerView;
    containerView.lootFirst = vi.fn();
    s.press(s.keys.esc);

    s.keyHandlers["keydown-H"]();
    s.keyHandlers["keydown-Q"]();
    s.keyHandlers["keydown-F"]();
    s.keyHandlers["keydown-E"]();
    s.keyHandlers["keydown-I"]();
    expect(s.run.controlsPanel).toBeUndefined();
    expect(containerView.close).not.toHaveBeenCalled();
    expect(containerView.lootFirst).not.toHaveBeenCalled();
    expect(s.sent).not.toHaveBeenCalled();

    s.pick("back");
    s.keyHandlers["keydown-H"]();
    expect(s.run.controlsPanel).toBeDefined();
  });

  it("should drop pointer attacks and skills while the menu is open", () => {
    const s = menuOnStage();
    s.run.bindRunInput();
    const pointerDown = vi.fn(() => false);
    Object.assign((s.run as unknown as { containerView: object }).containerView, { pointerDown });
    s.press(s.keys.esc);

    s.pointerHandlers.pointerdown({ x: 10, y: 10, button: 0, worldX: 130, worldY: 300, leftButtonDown: () => true, rightButtonDown: () => false });
    s.monsters()[0].handlers.pointerdown();

    expect(s.sent).not.toHaveBeenCalled();
    expect(pointerDown).not.toHaveBeenCalled();
  });

  it("should take the menu and its confirm down when the next state shows the player dead, and show the dead card", () => {
    const { run, keys, press, pick, option, labels } = menuOnStage();
    press(keys.esc);
    pick("fall");
    pick("fall-now");
    expect(run.fallPending).toBe(true);

    (run as unknown as FloorRun).handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));

    expect(run.menu).toBeUndefined();
    expect(option("fall-now")).toBeUndefined();
    expect(run.fallPending).toBe(false);
    expect(labels().some((l) => /barrow keeps you/i.test(l))).toBe(true);
  });

  it("should keep a dead player's menu up across the states that keep showing them dead", () => {
    const { run, keys, press, option } = menuOnStage(player("me", "Aldric", 130, dead));
    press(keys.esc);
    (run as unknown as FloorRun).handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));
    expect(run.menu).toBeDefined();
    expect(option("leave")).toBeDefined();
  });

  it("should take the menu down when end_game arrives", () => {
    const { run, keys, press, option } = menuOnStage();
    press(keys.esc);
    run.showGameEndOverlay(1, "eliminated");
    expect(run.menu).toBeUndefined();
    expect(option("fall")).toBeUndefined();
  });

  it("should hand Fall back on a refusal and say why in passing", () => {
    const { run, keys, press, pick, sentOf, option, labels } = menuOnStage();
    press(keys.esc);
    pick("fall");
    pick("fall-now");
    const before = option("fall-now")?.calls.length ?? 0;

    run.fallRefused({ message: "You are not in a delve." });

    expect(run.fallPending).toBe(false);
    expect(labels()).toContain("You are not in a delve.");
    expect(option("fall-now")?.calls.slice(before)).not.toContain("destroy");
    pick("fall-now");
    expect(sentOf(ActionType.ForfeitRun)).toHaveLength(2);
  });

  it("should forget the menu, the confirm, the pending send and the refusal listener on a restart", () => {
    const offError = vi.spyOn(socketManager, "offError");
    const { run, keys, press, pick } = menuOnStage();
    press(keys.esc);
    pick("fall");
    pick("fall-now");
    (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeKey: vi.fn() } };

    run.resetRun();

    expect(run.menu).toBeUndefined();
    expect(run.menuChoices).toBeUndefined();
    expect(run.fallPending).toBe(false);
    expect(offError).toHaveBeenCalledWith("forfeit_run");
  });
});

describe("BarrowspireScene gear and bag overlay (FS-HRH2J §A R4–R11, §B R20–22)", () => {
  interface Overlaid {
    equipment?: InstanceType<typeof EquipmentHud>;
    menu?: unknown;
    controlsPanel?: unknown;
    dismissKey?: { justDown: boolean; isDown: boolean };
    confirmKey?: { justDown: boolean; isDown: boolean };
    choiceKeys: { justDown: boolean; isDown: boolean }[];
    combat: { aiming: boolean };
    bindRunInput(): void;
    offerMenu(): void;
    composeEquipment(): InstanceType<typeof EquipmentHud>;
    bagHasRoom(): boolean;
    lootChestItem(item: unknown): void;
    toggleControlsPanel(): void;
    handleGameStateUpdate(state: GameState): void;
    sendMovementIntent(vx: number, vy: number): void;
  }

  const sword = { entity_id: "sword", name: "Iron Sword", weapon_type: "sword", attack_power: 10 };
  const bag = (n: number) => Array.from({ length: n }, (_, i) => ({ entity_id: `i${i}`, name: `Relic ${i}` }));
  /** The run's camera is 800 × 600: the right panel's middle, and the clear band's. */
  const layout = overlayLayout(800, 600);
  const OVER_PANEL = { x: layout.right.x + layout.right.w / 2, y: 300 };
  const IN_BAND = { x: layout.band.x + layout.band.w / 2, y: 300 };

  function overlayOnStage(cls = "warrior", inventory: unknown[] = [sword]) {
    const stage = onStage();
    vi.spyOn(useGameStore.getState(), "getActiveCharacter").mockReturnValue({ className: cls } as never);
    const run = stage.run as unknown as Overlaid;
    const esc = { justDown: false, isDown: false };
    run.dismissKey = esc;
    run.confirmKey = { justDown: false, isDown: false };
    run.choiceKeys = [];
    const keyHandlers: Record<string, () => void> = {};
    const input = Object.assign(new EventEmitter(), {
      setDefaultCursor: vi.fn(),
      keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) },
      activePointer: { button: 0, positionToCamera: () => ({ x: 400, y: 300 }) },
    });
    Object.assign(stage.run, { input, game: { events: new EventEmitter() } });
    Object.assign((stage.run as unknown as { containerView: object }).containerView, {
      pointerDown: vi.fn(() => false),
      pointerMove: vi.fn(),
    });
    run.equipment = run.composeEquipment();
    run.handleGameStateUpdate(partyState({ ...player("me", "Aldric", 130), class: cls, inventory } as ReturnType<typeof player>));
    run.bindRunInput();
    (stage.run as unknown as { time: { now: number } }).time.now = 1000;
    const key = (name: string) => keyHandlers[`keydown-${name}`]();
    const pressEsc = () => {
      esc.justDown = true;
      run.offerMenu();
    };
    const pointer = (at: { x: number; y: number }, button: number) => ({
      ...at,
      button,
      worldX: 400,
      worldY: 300,
      leftButtonDown: () => button === 0,
      rightButtonDown: () => button === 2,
    });
    const press = (at: { x: number; y: number }, button: number) => {
      input.activePointer.button = button;
      input.emit("pointermove", pointer(at, button));
      input.emit("pointerdown", pointer(at, button));
    };
    const sentOf = (action: string) => stage.sent.mock.calls.filter(([a]) => a === action);
    const shown = (content: string) => stage.texts().some((t) => t.content === content);
    return { ...stage, run, key, pressEsc, press, sentOf, shown };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show the player's class, name and health on the stats panel, live while open (FS-HRH2J R24–30)", () => {
    const { run, key, shown } = overlayOnStage();
    key("I");
    expect(shown("WARRIOR")).toBe(true);
    expect(shown("Aldric")).toBe(true);
    expect(shown("100 / 100")).toBe(true);

    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, { current_health: 61 })));

    expect(shown("61 / 100")).toBe(true);
  });

  it("should toggle the overlay on I and on B, and close it on Q (R4)", () => {
    const { run, key } = overlayOnStage();
    key("I");
    expect(run.equipment?.isOpen()).toBe(true);
    key("B");
    expect(run.equipment?.isOpen()).toBe(false);
    key("B");
    expect(run.equipment?.isOpen()).toBe(true);
    key("I");
    expect(run.equipment?.isOpen()).toBe(false);
    key("B");
    key("Q");
    expect(run.equipment?.isOpen()).toBe(false);
  });

  it("should close the overlay on one ESC and leave the menu closed; the next ESC opens the menu (R5)", () => {
    const { run, key, pressEsc } = overlayOnStage();
    key("I");
    pressEsc();
    expect(run.equipment?.isOpen()).toBe(false);
    expect(run.menu).toBeUndefined();
    pressEsc();
    expect(run.menu).toBeDefined();
  });

  it("should keep walking with the overlay open: nothing pauses (R7)", () => {
    const { run, key, sentOf } = overlayOnStage();
    key("I");
    run.sendMovementIntent(1, 0);
    expect(sentOf(ActionType.Move).at(-1)).toEqual([ActionType.Move, { vx: 1, vy: 0 }]);
  });

  it("should ignore I and B while the ESC menu is open (R6)", () => {
    const { run, key, pressEsc } = overlayOnStage();
    pressEsc();
    key("I");
    key("B");
    expect(run.equipment?.isOpen()).toBe(false);
  });

  it("should send no cast for a left or right press over a panel, and cast for one in the clear band (R8)", () => {
    const { key, press, sentOf } = overlayOnStage("warrior", []);
    key("I");
    press(OVER_PANEL, 0);
    press(OVER_PANEL, 2);
    expect(sentOf(ActionType.CastSkill)).toHaveLength(0);

    press(IN_BAND, 2);
    expect(sentOf(ActionType.CastSkill)).toEqual([[ActionType.CastSkill, expect.objectContaining({ skill_id: "dash" })]]);
  });

  it("should start no Shadow Shot hold on a right-press over a panel, and start one in the clear band (R8)", () => {
    const { run, key, press } = overlayOnStage("archer", []);
    key("I");
    press(OVER_PANEL, 2);
    expect(run.combat.aiming).toBe(false);
    press(IN_BAND, 2);
    expect(run.combat.aiming).toBe(true);
  });

  it("should send equip for a right-click on a hovered bag item, and E over it while open owns E (R10, R16)", () => {
    const { key, press, sentOf } = overlayOnStage();
    key("I");
    const cell = gearPanelLayout(layout.right, 1).cells[0].rect;
    press({ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 }, 2);
    expect(sentOf(ActionType.Equip)).toEqual([[ActionType.Equip, { item_entity_id: "sword" }]]);
    expect(sentOf(ActionType.CastSkill)).toHaveLength(0);
  });

  it("should list I / B for the overlay in the controls help (R11)", () => {
    const { run, shown } = overlayOnStage();
    run.toggleControlsPanel();
    expect(shown("I / B")).toBe(true);
    expect(shown("I")).toBe(false);
  });

  it("should refuse a pickup into a full bag with the refused notice, pending takes counted (R21, R22)", () => {
    const { run, shown } = overlayOnStage("warrior", bag(29));
    expect(run.bagHasRoom()).toBe(true);
    run.lootChestItem({ entity_id: "coin", name: "coin" });
    expect(shown(BAG_FULL_NOTICE)).toBe(false);
    expect(run.bagHasRoom()).toBe(false);
    expect(shown(BAG_FULL_NOTICE)).toBe(true);
  });
});

describe("BarrowspireScene Shadow Shot hold (FS-JTNPR req 8–17; ADR-0030)", () => {
  interface Aimed {
    time: { now: number; delayedCall: ReturnType<typeof vi.fn> };
    fx?: unknown;
    playerAnim?: { attack(...args: unknown[]): void; holdAim(aim: unknown): void };
    abilityHud?: { shown: { name: string; greyed: boolean } | null };
    /** The class kit as drawn, shared with the field scene. */
    kit: { aimLine?: { drawn: boolean } };
    equipment?: unknown;
    menu?: unknown;
    bindRunInput(): void;
    resetRun(): void;
    leaveFloor(): void;
    openMenu(): void;
    showGameEndOverlay(position: number, result?: string): void;
    toggleInventory(): void;
    aimFrame(): void;
    sendMovementIntent(vx: number, vy: number): void;
    handleGameStateUpdate(state: GameState): void;
  }

  const ME_X = 130;
  const ME_Y = 300;
  const as = (cls: string, fields: { current_health?: number } = {}) => ({
    ...player("me", "Aldric", ME_X, fields),
    class: cls,
  });

  function aimOnStage(cls = "archer") {
    const stage = onStage();
    vi.spyOn(useGameStore.getState(), "getActiveCharacter").mockReturnValue({ className: cls } as never);
    const run = stage.run as unknown as Aimed;
    const pointerHandlers: Record<string, (...args: unknown[]) => void> = {};
    const keyHandlers: Record<string, (...args: unknown[]) => void> = {};
    const game = { events: new EventEmitter() };
    const cursor = { x: 400, y: 300 };
    Object.assign(stage.run, {
      game,
      input: {
        setDefaultCursor: vi.fn(),
        keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) },
        on: (event: string, fn: () => void) => (pointerHandlers[event] = fn),
        activePointer: { button: 0, positionToCamera: () => ({ ...cursor }) },
      },
    });
    Object.assign((stage.run as unknown as { containerView: object }).containerView, { pointerDown: vi.fn(() => false) });
    run.handleGameStateUpdate(partyState(as(cls) as ReturnType<typeof player>));
    run.bindRunInput();
    run.time.now = 1000;
    const fxPlay = vi.fn();
    run.fx = { play: fxPlay, clearAll: vi.fn() };
    const attack = vi.spyOn(run.playerAnim!, "attack");
    const holdAim = vi.spyOn(run.playerAnim!, "holdAim");

    const pointer = (button: number, worldX = 400, worldY = 300) => ({
      x: 10,
      y: 10,
      button,
      worldX,
      worldY,
      leftButtonDown: () => button === 0,
      rightButtonDown: () => button === 2,
    });
    // Phaser hands a sprite its pointerdown before the scene's, on the same active pointer
    const active = (stage.run as unknown as { input: { activePointer: { button: number } } }).input.activePointer;
    const press = () => {
      active.button = 2;
      pointerHandlers.pointerdown(pointer(2));
    };
    const leftClick = () => {
      active.button = 0;
      pointerHandlers.pointerdown(pointer(0));
    };
    const onMonster = (button: number) => {
      active.button = button;
      stage.monsters()[0].handlers.pointerdown();
    };
    const release = (at: number, worldX = 400, worldY = 300) => {
      run.time.now = at;
      pointerHandlers.pointerup({ ...pointer(2, worldX, worldY), rightButtonDown: () => false });
    };
    const casts = () => stage.sent.mock.calls.filter(([action]) => action === ActionType.CastSkill);
    const moves = () => stage.sent.mock.calls.filter(([action]) => action === ActionType.Move);
    const lineUp = () => run.kit.aimLine?.drawn === true;
    const delayed = () => run.time.delayedCall.mock.calls as [number, () => void][];
    return { ...stage, run, game, cursor, keyHandlers, pointerHandlers, press, leftClick, onMonster, release, casts, moves, lineUp, fxPlay, attack, holdAim, delayed };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send nothing on an archer's right-press, and start aiming with the line up", () => {
    const s = aimOnStage();
    s.press();
    expect(s.sent).not.toHaveBeenCalled();
    expect(s.lineUp()).toBe(true);
  });

  it.each([
    ["warrior", "dash"],
    ["mage", "triple_fireball"],
  ])("should leave the %s's right-click as it was: %s sent on the press", (cls, skill) => {
    const s = aimOnStage(cls);
    s.press();
    expect(s.casts()).toEqual([[ActionType.CastSkill, { skill_id: skill, target_x: expect.any(Number), target_y: expect.any(Number) }]]);
    expect(s.lineUp()).toBe(false);
  });

  it("should send exactly one shadow_shot at the cursor's world point on a release held 0.3 s, with the Shadow Shot release and attack clip", () => {
    const s = aimOnStage();
    s.press();
    s.release(1300, 520, 410);

    const target = await_iso.screenToWorld(520, 410);
    expect(s.casts()).toEqual([
      [ActionType.CastSkill, { skill_id: "shadow_shot", target_x: target.x, target_y: target.y }],
    ]);
    expect(s.fxPlay).toHaveBeenCalledTimes(1);
    expect(s.fxPlay.mock.calls[0][1]).toBe("shadowShotRelease");
    expect(s.attack).toHaveBeenCalledWith(1300, { x: target.x - ME_X, y: target.y - ME_Y });
    expect(s.lineUp()).toBe(false);
  });

  it("should send and play nothing on a release under 0.3 s, and leave no line", () => {
    const s = aimOnStage();
    s.press();
    s.release(1299);
    expect(s.sent).not.toHaveBeenCalled();
    expect(s.fxPlay).not.toHaveBeenCalled();
    expect(s.attack).not.toHaveBeenCalled();
    expect(s.lineUp()).toBe(false);
  });

  it("should send nothing on a release inside 1.2 s of the last sent shot, and fire again after", () => {
    const s = aimOnStage();
    s.press();
    s.release(1300);
    s.press();
    s.release(2499);
    expect(s.casts()).toHaveLength(1);
    expect(s.fxPlay).toHaveBeenCalledTimes(1);
    // held from 2499: ready at 2799, a full 1.2 s after the shot sent at 1300
    s.press();
    s.release(2799);
    expect(s.casts()).toHaveLength(2);
  });

  it("should start no cooldown on a quick tap", () => {
    const s = aimOnStage();
    s.press();
    s.release(1100);
    s.press();
    s.release(1400);
    expect(s.casts()).toHaveLength(1);
  });

  it("should grey the ability card from a fired shot until the 1.2 s cooldown is over, and not for a hold", () => {
    const s = aimOnStage();
    s.press();
    expect(s.run.abilityHud?.shown?.greyed).toBe(false);
    s.release(1300);
    expect(s.run.abilityHud?.shown?.greyed).toBe(true);
    const cooldown = s.delayed().find(([ms]) => ms === 1200);
    expect(cooldown).toBeDefined();
    cooldown![1]();
    expect(s.run.abilityHud?.shown?.greyed).toBe(false);
  });

  it("should allow a hold to begin during the left-click's own lockout", () => {
    const s = aimOnStage();
    s.leftClick();
    s.press();
    s.release(1300);
    expect(s.casts().map(([, body]) => (body as { skill_id: string }).skill_id)).toEqual(["arrow", "shadow_shot"]);
  });

  it("should stop a stride once as the hold begins, send no move while aiming, and resume from the keys after", () => {
    const s = aimOnStage();
    s.run.sendMovementIntent(1, 0);
    expect(s.moves()).toEqual([[ActionType.Move, { vx: 1, vy: 0 }]]);
    s.press();
    s.run.sendMovementIntent(1, 0);
    s.run.sendMovementIntent(0, 1);
    s.keyHandlers.keyup({ code: "KeyD" });
    expect(s.moves()).toEqual([
      [ActionType.Move, { vx: 1, vy: 0 }],
      [ActionType.Move, { vx: 0, vy: 0 }],
    ]);
    s.release(1300);
    s.run.sendMovementIntent(1, 0);
    expect(s.moves().at(-1)).toEqual([ActionType.Move, { vx: 1, vy: 0 }]);
  });

  it("should send no stop when a hold begins over a player standing still", () => {
    const s = aimOnStage();
    s.press();
    s.run.sendMovementIntent(0, 0);
    expect(s.moves()).toHaveLength(0);
  });

  it("should drop a left-click during a hold, and keep the hold", () => {
    const s = aimOnStage();
    s.press();
    s.leftClick();
    expect(s.sent).not.toHaveBeenCalled();
    s.release(1300);
    expect(s.casts()).toHaveLength(1);
  });

  it("should strike no monster on a click during a hold", () => {
    const s = aimOnStage();
    s.press();
    s.onMonster(0);
    s.leftClick();
    expect(s.sent).not.toHaveBeenCalled();
  });

  it("should strike no monster on an archer's right-press, which only starts the hold", () => {
    const s = aimOnStage();
    s.onMonster(2);
    s.press();
    expect(s.sent).not.toHaveBeenCalled();
    expect(s.lineUp()).toBe(true);
  });

  it("should still strike a monster on an archer's left-click outside a hold", () => {
    const s = aimOnStage();
    s.onMonster(0);
    expect(s.sent.mock.calls.filter(([a]) => a === ActionType.Attack)).toHaveLength(1);
  });

  it("should turn the archer's idle clip to the cursor and draw the line each frame, faint until ready, then let the facing go", () => {
    const s = aimOnStage();
    s.press();
    const cursorWorld = await_iso.screenToWorld(s.cursor.x, s.cursor.y);
    s.run.aimFrame();
    expect(s.holdAim).toHaveBeenLastCalledWith({ x: cursorWorld.x - ME_X, y: cursorWorld.y - ME_Y });
    s.cursor.x = 600;
    s.run.aimFrame();
    const moved = await_iso.screenToWorld(600, s.cursor.y);
    expect(s.holdAim).toHaveBeenLastCalledWith({ x: moved.x - ME_X, y: moved.y - ME_Y });

    const line = s.stage.made.filter((m) => m.kind === "graphics" && !m.destroyed).at(-1)!;
    expect(line.calls).toContain("lineBetween");
    s.release(1300);
    expect(s.holdAim).toHaveBeenLastCalledWith(undefined);
    expect(line.destroyed).toBe(true);
  });

  it("should do nothing each frame with no hold running", () => {
    const s = aimOnStage();
    s.run.aimFrame();
    expect(s.holdAim).not.toHaveBeenCalled();
    expect(s.lineUp()).toBe(false);
  });

  const cancels: [string, (s: ReturnType<typeof aimOnStage>) => void][] = [
    ["the player dying", (s) => s.run.handleGameStateUpdate(partyState(as("archer", { current_health: 0 }) as ReturnType<typeof player>))],
    ["the party leaving the floor", (s) => s.run.leaveFloor()],
    ["the ESC menu opening", (s) => s.run.openMenu()],
    ["the run ending", (s) => s.run.showGameEndOverlay(1, "escaped")],
    [
      "the equipment panel opening",
      (s) => {
        s.run.equipment = { toggle: vi.fn(), isOpen: () => true };
        s.run.toggleInventory();
      },
    ],
    ["the right button released outside the canvas", (s) => s.pointerHandlers.pointerupoutside({ button: 2 })],
    ["the window losing focus", (s) => s.game.events.emit("blur")],
    ["the tab going hidden", (s) => s.game.events.emit("hidden")],
    ["the scene tearing down", (s) => s.run.resetRun()],
  ];

  it.each(cancels)("should end a hold on %s with nothing sent and no line left", (_, cancel) => {
    const s = aimOnStage();
    s.press();
    cancel(s);
    expect(s.lineUp()).toBe(false);
    s.release(1500);
    expect(s.casts()).toHaveLength(0);
    expect(s.fxPlay).not.toHaveBeenCalled();
  });

  it("should send nothing on a release once the run has ended, even from a hold begun after", () => {
    const s = aimOnStage();
    s.run.showGameEndOverlay(1, "escaped");
    s.press();
    s.release(1500);
    expect(s.casts()).toHaveLength(0);
    expect(s.fxPlay).not.toHaveBeenCalled();
    expect(s.lineUp()).toBe(false);
  });

  it("should not cancel a hold on the left button released outside the canvas", () => {
    const s = aimOnStage();
    s.press();
    s.pointerHandlers.pointerupoutside({ button: 0 });
    s.release(1300);
    expect(s.casts()).toHaveLength(1);
  });

  it("should stop hearing window blur once the scene tears down", () => {
    const s = aimOnStage();
    s.run.resetRun();
    expect(s.game.events.listenerCount("blur")).toBe(0);
    expect(s.game.events.listenerCount("hidden")).toBe(0);
  });

  it("should not let a dead player start a hold", () => {
    const s = aimOnStage();
    s.run.handleGameStateUpdate(partyState(as("archer", { current_health: 0 }) as ReturnType<typeof player>));
    s.press();
    expect(s.lineUp()).toBe(false);
    s.release(1500);
    expect(s.sent.mock.calls.filter(([a]) => a === ActionType.CastSkill)).toHaveLength(0);
  });

  describe("short of stamina (FS-JTNPR req 18; edge state: Short of stamina)", () => {
    const stamina = (current: number) => ({ kind: "stamina", current, max: 100, ability_cost: 90 });
    const withStamina = (s: ReturnType<typeof aimOnStage>, current: number) =>
      s.run.handleGameStateUpdate(partyState({ ...as("archer"), resource: stamina(current) } as ReturnType<typeof player>));
    /** Whether the last aim line drawn was at full strength. */
    const lineReady = (draw: { mock: { calls: unknown[][] } }) => draw.mock.calls.at(-1)?.[2];

    it("should send and play nothing on a ready-length, off-cooldown release at stamina 89, the line faint throughout", () => {
      const s = aimOnStage();
      const draw = vi.spyOn(AimLine.prototype, "draw");
      withStamina(s, 89);
      s.press();
      s.run.time.now = 1300;
      s.run.aimFrame();
      expect(lineReady(draw)).toBe(false);
      s.release(1300);
      expect(s.casts()).toHaveLength(0);
      expect(s.fxPlay).not.toHaveBeenCalled();
      expect(s.attack).not.toHaveBeenCalled();
      expect(s.lineUp()).toBe(false);
    });

    it("should start no cooldown on a release it cancels for want of stamina", () => {
      const s = aimOnStage();
      withStamina(s, 89);
      s.press();
      s.release(1300);
      expect(s.run.abilityHud?.shown?.greyed).toBe(true);
      withStamina(s, 90);
      expect(s.run.abilityHud?.shown?.greyed).toBe(false);
      s.press();
      s.release(1600);
      expect(s.casts()).toHaveLength(1);
    });

    it("should fire once stamina regained during the hold reaches 90", () => {
      const s = aimOnStage();
      const draw = vi.spyOn(AimLine.prototype, "draw");
      withStamina(s, 80);
      s.press();
      s.run.time.now = 1300;
      s.run.aimFrame();
      expect(lineReady(draw)).toBe(false);
      withStamina(s, 90);
      s.run.aimFrame();
      expect(lineReady(draw)).toBe(true);
      s.release(1300);
      expect(s.casts()).toEqual([[ActionType.CastSkill, expect.objectContaining({ skill_id: "shadow_shot" })]]);
    });

    it("should draw the line ready exactly where the card is lit, for every stamina value", () => {
      const s = aimOnStage();
      const draw = vi.spyOn(AimLine.prototype, "draw");
      s.press();
      s.run.time.now = 1300;
      for (let current = 0; current <= 100; current++) {
        withStamina(s, current);
        s.run.aimFrame();
        expect(lineReady(draw)).toBe(s.run.abilityHud?.shown?.greyed === false);
      }
    });
  });

  describe("a Mercenary's left-click (FS-MAMHR §G.32)", () => {
    it("should send cut at the cursor's world point, with the class attack clip", () => {
      const s = aimOnStage("mercenary");
      s.leftClick();
      const target = await_iso.screenToWorld(400, 300);
      expect(s.casts()).toEqual([
        [ActionType.CastSkill, { skill_id: "cut", target_x: target.x, target_y: target.y }],
      ]);
      expect(s.attack).toHaveBeenCalledWith(1000, { x: target.x - ME_X, y: target.y - ME_Y });
    });

    it("should play the cut at once, and no other class's effect", () => {
      const s = aimOnStage("mercenary");
      const before = s.stage.made.length;
      s.leftClick();
      const drawn = s.stage.made.slice(before).filter((m) => m.kind === "graphics");
      expect(drawn.some((g) => g.calls.includes("fillPoints"))).toBe(true);
      const tweens = (s.run as unknown as { tweens: { add: ReturnType<typeof vi.fn> } }).tweens.add;
      expect(tweens).toHaveBeenCalledWith(expect.objectContaining({ duration: CUT_MS }));
      expect(s.fxPlay).not.toHaveBeenCalled();
    });

    it("should take a cut still fading down with the run on a restart", () => {
      const s = aimOnStage("mercenary");
      const before = s.stage.made.length;
      s.leftClick();
      const live = () => s.stage.made.slice(before).filter((m) => m.kind === "graphics" && !m.destroyed);
      expect(live().length).toBeGreaterThan(0);
      s.run.resetRun();
      expect(live()).toHaveLength(0);
    });

    it("should hold the left-click's own lockout: a second click inside it sends nothing", () => {
      const s = aimOnStage("mercenary");
      s.leftClick();
      s.leftClick();
      expect(s.casts()).toHaveLength(1);
    });
  });

  describe("a Mercenary's parry (FS-MAMHR §G.35–38)", () => {
    type ParryFields = { parry_open?: boolean; parry_lockout?: number; parries?: number };
    const merc = (fields: ParryFields = {}) =>
      ({
        ...as("mercenary"),
        resource: { kind: "parry_charges", current: 0, max: 3, ability_cost: 0 },
        parry_open: false,
        parry_lockout: 0,
        parries: 0,
        ...fields,
      }) as unknown as ReturnType<typeof player>;
    const parryOnStage = (fields: ParryFields = {}) => {
      const s = aimOnStage("mercenary");
      s.run.handleGameStateUpdate(partyState(merc(fields)));
      return s;
    };
    const stance = (s: ReturnType<typeof aimOnStage>) =>
      (s.run as unknown as { kit: { parry?: { stanceShown: boolean } } }).kit.parry?.stanceShown === true;
    const flashes = (s: ReturnType<typeof aimOnStage>) =>
      (s.run as unknown as { tweens: { add: ReturnType<typeof vi.fn> } }).tweens.add.mock.calls.filter(
        ([config]) => (config as { duration?: number }).duration === PARRY_FLASH_MS,
      ).length;

    it("should send parry on a right-click and raise the stance tell, with no attack clip", () => {
      const s = parryOnStage();
      s.press();
      expect(s.casts()).toEqual([[ActionType.CastSkill, { skill_id: "parry", target_x: expect.any(Number), target_y: expect.any(Number) }]]);
      expect(stance(s)).toBe(true);
      expect(s.attack).not.toHaveBeenCalled();
      expect(s.lineUp()).toBe(false);
    });

    it.each([
      ["the stance is open", { parry_open: true }],
      ["the whiff lockout runs", { parry_lockout: 0.98333 }],
    ])("should send nothing on a right-click while %s", (_, fields) => {
      const s = parryOnStage(fields);
      s.press();
      expect(s.casts()).toEqual([]);
    });

    it("should send parry again once the latest state shows the lockout over", () => {
      const s = parryOnStage({ parry_lockout: 0.5 });
      s.press();
      s.run.handleGameStateUpdate(partyState(merc({ parry_lockout: 0 })));
      s.press();
      expect(s.casts()).toEqual([[ActionType.CastSkill, { skill_id: "parry", target_x: expect.any(Number), target_y: expect.any(Number) }]]);
    });

    it("should not hold the parry behind the cut's own lockout", () => {
      const s = parryOnStage();
      s.leftClick();
      s.press();
      expect(s.casts().map(([, p]) => (p as { skill_id: string }).skill_id)).toEqual(["cut", "parry"]);
    });

    it("should hold the tell while the server reports the stance open, and clear it when it closes", () => {
      const s = parryOnStage();
      s.press();
      s.run.handleGameStateUpdate(partyState(merc({ parry_open: true })));
      s.run.time.now = 2000; // long past the click: the server's word alone holds it
      s.run.handleGameStateUpdate(partyState(merc({ parry_open: true })));
      expect(stance(s)).toBe(true);
      s.run.handleGameStateUpdate(partyState(merc({ parry_open: false, parry_lockout: 1 })));
      expect(stance(s)).toBe(false);
    });

    it("should flash on a rise in parries, at 3 parry charges too, and not on the first state", () => {
      const s = aimOnStage("mercenary");
      s.run.resetRun();
      s.run.handleGameStateUpdate(partyState(merc({ parries: 7 })));
      expect(flashes(s)).toBe(0);
      s.run.handleGameStateUpdate(partyState(merc({ parries: 8, parry_open: true })));
      expect(flashes(s)).toBe(1);
      s.run.handleGameStateUpdate(partyState(merc({ parries: 9, parry_open: true })));
      expect(flashes(s)).toBe(2);
    });

    it("should take the stance tell and a fading flash down with the run on a restart", () => {
      const s = parryOnStage({ parries: 1 });
      const before = s.stage.made.length;
      s.run.handleGameStateUpdate(partyState(merc({ parries: 2, parry_open: true })));
      const live = () => s.stage.made.slice(before).filter((m) => m.kind === "graphics" && !m.destroyed);
      expect(live().length).toBeGreaterThanOrEqual(2);
      s.run.resetRun();
      expect(live()).toHaveLength(0);
    });

    it("should take the first state after a restart (a reconnect) as the baseline", () => {
      const s = parryOnStage({ parries: 1 });
      s.run.resetRun();
      s.run.handleGameStateUpdate(partyState(merc({ parries: 4 })));
      expect(flashes(s)).toBe(0);
    });

    it("should draw nothing for a teammate's parry", () => {
      const s = parryOnStage();
      const ally = (parries: number) =>
        ({ ...player("ally", "Wenna", 160), class: "mercenary", parry_open: true, parries }) as ReturnType<typeof player>;
      s.run.handleGameStateUpdate(partyState(merc(), ally(0)));
      s.run.handleGameStateUpdate(partyState(merc(), ally(3)));
      expect(flashes(s)).toBe(0);
      expect(stance(s)).toBe(false);
    });

    it("should grey the Parry card while parry_lockout is above 0, and light it at 0", () => {
      const s = parryOnStage({ parry_lockout: 0.98333 });
      expect(s.run.abilityHud?.shown).toMatchObject({ name: "Parry", greyed: true });
      s.run.handleGameStateUpdate(partyState(merc({ parry_lockout: 0 })));
      expect(s.run.abilityHud?.shown).toMatchObject({ name: "Parry", greyed: false });
    });
  });

  describe("a Mercenary's riposte (FS-MAMHR §G.33, §G.34, §G.38)", () => {
    const merc = (current: number) =>
      ({
        ...as("mercenary"),
        resource: { kind: "parry_charges", current, max: 3, ability_cost: 0 },
        parry_open: false,
        parry_lockout: 0,
        parries: 0,
      }) as unknown as ReturnType<typeof player>;
    const atCharges = (current: number) => {
      const s = aimOnStage("mercenary");
      s.run.handleGameStateUpdate(partyState(merc(current)));
      return s;
    };
    const played = (s: ReturnType<typeof aimOnStage>) =>
      (s.run as unknown as { tweens: { add: ReturnType<typeof vi.fn> } }).tweens.add.mock.calls.map(
        ([config]) => (config as { duration?: number }).duration,
      );
    const armed = (s: ReturnType<typeof aimOnStage>) =>
      (s.run as unknown as { kit: { riposte?: { armedShown: boolean } } }).kit.riposte?.armedShown === true;

    it("should send cut at 3 parry charges and play the riposte slice, not the cut, with the attack clip", () => {
      const s = atCharges(3);
      s.leftClick();
      const target = await_iso.screenToWorld(400, 300);
      expect(s.casts()).toEqual([
        [ActionType.CastSkill, { skill_id: "cut", target_x: target.x, target_y: target.y }],
      ]);
      expect(played(s)).toContain(RIPOSTE_MS);
      expect(played(s)).not.toContain(CUT_MS);
      expect(s.attack).toHaveBeenCalledWith(1000, { x: target.x - ME_X, y: target.y - ME_Y });
      expect(s.fxPlay).not.toHaveBeenCalled();
    });

    it.each([0, 1, 2])("should play the cut, not the riposte, at %i parry charges", (n) => {
      const s = atCharges(n);
      s.leftClick();
      expect(played(s)).toContain(CUT_MS);
      expect(played(s)).not.toContain(RIPOSTE_MS);
    });

    it("should play the cut once the latest state shows the charges spent", () => {
      const s = atCharges(3);
      s.leftClick();
      s.run.handleGameStateUpdate(partyState(merc(0)));
      s.delayed().forEach(([, fn]) => fn()); // the left-click's own lockout runs out
      s.leftClick();
      expect(played(s).filter((d) => d === RIPOSTE_MS)).toHaveLength(1);
      expect(played(s)).toContain(CUT_MS);
    });

    it("should show the armed tell at 3 parry charges and clear it when the count drops", () => {
      const s = atCharges(2);
      expect(armed(s)).toBe(false);
      s.run.handleGameStateUpdate(partyState(merc(3)));
      expect(armed(s)).toBe(true);
      s.run.handleGameStateUpdate(partyState(merc(0)));
      expect(armed(s)).toBe(false);
    });

    it("should draw nothing for a teammate's riposte", () => {
      const s = atCharges(0);
      const ally = {
        ...player("ally", "Wenna", 160),
        class: "mercenary",
        resource: { kind: "parry_charges", current: 3, max: 3, ability_cost: 0 },
      } as ReturnType<typeof player>;
      s.run.handleGameStateUpdate(partyState(merc(0), ally));
      expect(armed(s)).toBe(false);
      expect(played(s)).not.toContain(RIPOSTE_MS);
    });

    it("should take the slice and the tell down with the run on a restart", () => {
      const s = atCharges(2);
      const before = s.stage.made.length;
      s.run.handleGameStateUpdate(partyState(merc(3)));
      s.leftClick();
      const live = () => s.stage.made.slice(before).filter((m) => m.kind === "graphics" && !m.destroyed);
      expect(live().length).toBeGreaterThan(0);
      s.run.resetRun();
      expect(armed(s)).toBe(false);
      expect(live()).toHaveLength(0);
    });
  });

  it("should leave no code that sends triple_arrow or multishot_arrow", () => {
    const SRC = join(__dirname, "..");
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const path = join(dir, d.name);
        if (d.isDirectory()) return sources(path);
        return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [path] : [];
      });
    const offenders = sources(SRC).filter((f) => /triple_arrow|multishot_arrow/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
