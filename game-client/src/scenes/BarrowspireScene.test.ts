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
  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
      GameObjects: { Sprite: class {} },
      BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
      // interact range is measured between world positions
      Math: {
        Distance: {
          Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1),
        },
      },
    },
  };
});

const { BarrowspireScene } = await import("./BarrowspireScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ArtLibrary } = await import("@/render/art/library");
const { MonsterRoster } = await import("@/render/creatures");
const { CANVAS_FONT, palette, toCss } = await import("@/utils/canvasPalette");
const { ActionType } = await import("@/assets/types/client");
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
  monsters?: unknown;
  delveNoticeText?: unknown;
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
    run.delveNoticeText = {};
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

  it("should forget the stopped run's world, so the next start rebuilds walls, roofs, delvers and monsters", () => {
    const { run } = startedRun();
    run.events.emit("shutdown");
    expect(run.walls.size).toBe(0);
    expect(run.buildings).toHaveLength(0);
    expect(run.serverBuildingsCreated).toBe(false);
    expect(run.otherPlayers.size).toBe(0);
    expect(run.player).toBeUndefined();
    expect(run.gameEndOverlay).toBeUndefined();
    expect(run.monsters).toBeUndefined();
    expect(run.delveNoticeText).toBeUndefined();
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
    const kill = (m: Made & { active?: boolean }) => {
      m.destroyed = true;
      m.active = false;
      m.children.forEach(kill);
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
        if (prop === "on")
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
  };
  run.groundLayer = { paint: (houses: { id: string }[]) => painted.push(houses) };
  // the satchel a coffer opens into, closed: the state path only asks what it shows
  Object.assign(run, {
    containerView: { entityId: null, isOpen: false, open: vi.fn(), close: vi.fn(), setItems: vi.fn() },
  });
  const texts = () =>
    stage.made.filter((m) => m.kind === "text").map((m) => ({ content: m.args[2], style: m.args[3] as { fontFamily?: string } }));
  return { run, stage, lights, painted, texts, cursor };
}

describe("BarrowspireScene floor change (FS-F6F88 req 32, 33)", () => {
  it("should leave nothing of the old floor standing once the party has climbed", () => {
    const { run, stage, lights, painted } = sceneOnStage();
    run.handleGameStateUpdate(floorState(1));
    run.handleGameStateUpdate(floorState(1));
    // a floor-1 wall sconce, as the baked walls would have lit it
    (run.lightMap as { add(s: unknown): void }).add({ x: 100, y: 100 });
    const floorOne = stage.made.filter((m) => !m.destroyed);
    const kindsOnFloorOne = new Set(floorOne.map((m) => m.kind));
    expect(kindsOnFloorOne).toEqual(
      new Set(["graphics", "container", "staticGroup", "rectangle", "sprite", "text", "circle"]),
    );
    expect(run.occluders.size).toBe(1);

    run.handleGameStateUpdate(floorState(2));

    const survivors = floorOne.filter((m) => !m.destroyed);
    expect(survivors.map((m) => m.kind)).toEqual([]);
    expect(lights).toHaveLength(0);
    // the ground is painted again with the new floor's houses only
    expect(painted.at(-1)?.map((h) => h.id)).toEqual(["h2"]);
    // only the new floor's escape door fades over the delver
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

describe("BarrowspireScene co-op combat (FS-77AB6 req 39, 40, 42)", () => {
  const delver = (
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

  /** Floor 1 with this client's delver at `meX` and an ally beside the living ghoul at x 100. */
  function partyState(
    me: ReturnType<typeof delver> | null = delver("me", "Aldric", 130),
    ally = delver("ally", "Wenna", 160),
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
    /** The roster's sprites, in broadcast order: made bare, where delvers are made at a texture. */
    const monsters = () => sprites().filter((m) => m.args.length === 0);
    /** Delver sprites, in the order the broadcast built them: this client's first. */
    const delvers = () => sprites().filter((m) => m.args.length > 0);
    const notices = () =>
      scene.stage.made.filter(
        (m) => m.kind === "text" && /delve goes on/i.test(String(m.args[2])) && !m.destroyed,
      );
    return { ...scene, sent, monsters, delvers, notices };
  }

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
    run.handleGameStateUpdate(partyState(delver("me", "Aldric", 160)));
    monsters()[1].handlers.pointerdown();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should not swing at a monster out of reach", () => {
    const { run, sent, monsters } = onStage();
    run.handleGameStateUpdate(partyState(delver("me", "Aldric", 400)));
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
  ])("should not let an %s delver strike", (_, fields) => {
    const { run, sent, monsters } = onStage();
    run.handleGameStateUpdate(partyState(delver("me", "Aldric", 130, fields)));
    monsters()[0].handlers.pointerdown();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should never click-attack another delver, nor show the strike-mark over one", () => {
    const { run, sent, delvers, cursor } = onStage();
    run.handleGameStateUpdate(partyState());
    const ally = delvers()[1];
    ally.handlers.pointerover?.();
    ally.handlers.pointerdown?.();
    expect(sent).not.toHaveBeenCalled();
    expect(cursor).not.toHaveBeenCalledWith("strike-mark");
  });

  it("should letter another delver's name in the ally channel, never the hostile one", () => {
    const { run, texts } = onStage();
    run.handleGameStateUpdate(partyState());
    const name = texts().find((t) => t.content === "Wenna");
    const color = (name?.style as { color?: string } | undefined)?.color;
    expect(color).toBe(toCss(palette.markerAlly));
    expect(color).not.toBe(toCss(palette.markerHostile));
  });

  it.each([
    ["escaped", { escape: true }],
    ["fallen", { current_health: 0 }],
  ])("should tell an %s delver the delve goes on while the ally is still in it", (_, fields) => {
    const { run, notices } = onStage();
    run.handleGameStateUpdate(partyState(delver("me", "Aldric", 130, fields)));
    run.handleGameStateUpdate(partyState(delver("me", "Aldric", 130, fields)));
    expect(notices()).toHaveLength(1);
  });

  it("should say nothing while this delver is still in the delve", () => {
    const { run, notices } = onStage();
    run.handleGameStateUpdate(partyState());
    expect(notices()).toHaveLength(0);
  });

  it("should take the notice down when end_game arrives, and not raise it again", () => {
    const { run, notices } = onStage();
    const escaped = () => partyState(delver("me", "Aldric", 130, { escape: true }));
    run.handleGameStateUpdate(escaped());
    run.showGameEndOverlay(1, "escaped");
    expect(notices()).toHaveLength(0);
    run.handleGameStateUpdate(escaped());
    expect(notices()).toHaveLength(0);
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
  const withMe = (player: ReturnType<typeof me>): GameState =>
    ({ ...floorState(1), current_player: player }) as GameState;

  function onStage() {
    const scene = sceneOnStage();
    const cues = () =>
      scene.texts().filter((t) => /^Risen to level/.test(String(t.content)));
    const shown = (content: string) => scene.texts().some((t) => t.content === content);
    return { ...scene, cues, shown };
  }

  it("should show the delver's level and experience on the HUD in the body serif", () => {
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

  it("should raise no cue for the level a delver arrives with", () => {
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

  it("should open the pile in the container view when a delver beside it interacts", () => {
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

  describe("under a roof (guideline \"Lighting\")", () => {
    // house h1 stands at (100, 100), 200 × 160: this trail burns inside it
    const indoors = (entity_id: string) => ({ ...trail(entity_id), from: at(150, 150), to: at(250, 150) });
    /** Whether the trail's glow is painted now: filled since it was last cleared. */
    const glowing = (live: (id: string) => Made[], id: string) => {
      const glow = live(id).find((m) => (m as Made & { name?: string }).name === `trail:${id}:glow`)!;
      return glow.calls.lastIndexOf("fillPoints") > glow.calls.lastIndexOf("clear");
    };

    it("should not glow through the roof of a house the delver is outside of", () => {
      const { run, live } = onStage();
      run.handleGameStateUpdate(withTrails([indoors("t1")]));
      expect(glowing(live, "t1")).toBe(false);
    });

    it("should glow once the delver is inside that house, its roof off", () => {
      const { run, live } = onStage();
      run.handleGameStateUpdate(withTrails([indoors("t1")]));
      const scene = run as unknown as { buildings: unknown[]; currentBuilding: unknown };
      scene.currentBuilding = scene.buildings[0];
      run.handleGameStateUpdate(withTrails([indoors("t1")]));
      expect(glowing(live, "t1")).toBe(true);
    });

    it("should glow in the open, under no roof", () => {
      const { run, live } = onStage();
      run.handleGameStateUpdate(withTrails([trail("t1")]));
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
