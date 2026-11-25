import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorldUi } from "@/ui/uiBridge";
import { resetHeldForTests } from "@/audio/sfxSetting";

// node has no window, so an effects level a test sets is held for the module's life: each test starts a new visit
afterEach(() => resetHeldForTests());

/** Phaser's scene events are an eventemitter3 emitter: `once(event, fn, context)`. */
interface Emitter {
  emit(event: string): boolean;
  listenerCount(event: string): number;
}

// The camera's fit, bounds and follow under the render scale are the viewport's (camera.test.ts);
// here the stub camera only records what it was asked to follow.
vi.mock("@/render/viewport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/render/viewport")>()),
  boundCamera: () => {},
  // the world's closer camera and its HUD's are worldView.test.ts's; the stub has one camera
  zoomWorldView: () => {},
  followWith: (cam: { startFollow(target: unknown): void }, target: unknown) => cam.startFollow(target),
  // the stub camera keeps who hears its frames; a test sets a frame up by calling them
  afterFrameSetUp: (cam: { frames?: Set<(scroll: { x: number; y: number }) => void> }, listener: (scroll: { x: number; y: number }) => void) => {
    const frames = (cam.frames ??= new Set());
    frames.add(listener);
    return () => frames.delete(listener);
  },
}));


// The shared OPTIONS panel, watched: the run opens it and draws none of its own (FS-28DDG § Change C13).
vi.mock("@/ui/optionsPanel", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/ui/optionsPanel")>();
  return { ...real, openOptionsPanel: vi.fn(real.openOptionsPanel) };
});

// A Phaser stand-in: the scene base class on Phaser's event emitter, its key poll, math and geometry.
vi.mock("phaser", async () => (await import("./phaser.standin")).phaserStandIn());

const { BarrowspireScene, keepBodySize, projectileFlightOf, TOP_RIGHT_EDGE } = await import("./BarrowspireScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ChunkVisibility } = await import("@/render/world/chunks");
const { anchorAt, viewport } = await import("@/render/viewport");
const { EffectsRuntime } = await import("@/render/effects/runtime");
const { HitFeedback } = await import("@/render/effects/hit");
const { fakeArt, fakeLights, fakeScene } = await import("@/render/effects/fakeScene");
const { ProjectileFlights, shooterOf } = await import("@/render/effects/projectile");
const { FIREBALL_FLIGHT } = await import("@/render/effects/fireball");
const { ARROW_FLIGHT } = await import("@/render/effects/arrow");
const { sceneSystems } = await import("./sceneEnd.standin");
const { absorbing } = await import("./phaser.standin");
const { recordingStage: recordingStandIn } = await import("./recordingStage.standin");
type Made = import("./recordingStage.standin").Made;
const { lookGame } = await import("@/render/cursors/pointerLook.standin");
const { SHADOW_SHOT_FLIGHT } = await import("@/render/effects/shadowShot");
const { HEAVY_SHOT_FLIGHT } = await import("@/render/effects/heavyShot");
const { AimLine } = await import("@/render/effects/aimLine");
const { CUT_MS } = await import("@/render/effects/cut");
const { ATTACK_PIN_MS } = await import("@/render/combat/playerCombat");
const { MENU_CONTROLS } = await import("./MainMenuScene");
const { PARRY_FLASH_MS } = await import("@/render/effects/parry");
const { RIPOSTE_MS } = await import("@/render/effects/riposte");
const { ArtLibrary } = await import("@/render/art/library");
const { HoundSet, MonsterRoster, phaserHoundStage } = await import("@/render/creatures");
const { TRAIL_BED_DEPTH } = await import("@/render/world");
const { MARKER_BAR, MARKER_DEPTH, markerBase } = await import("@/render/markers");
const { CANVAS_FONT, palette, rgba, toCss } = await import("@/utils/canvasPalette");
const { RESOURCE_HUD_AT } = await import("@/ui/ResourceHud");
const { ARRIVAL_CARD } = await import("@/ui/arrivalCard");
const { ActionType } = await import("@/assets/types/client");
const { RUN_ACTIONS } = await import("./runActions");
const { WORLD_THEMES, TOWER_BANDS } = await import("@/render/world/worldTheme");
const { worldSeed } = await import("@/render/world/ground");
const { BlackoutMask } = await import("@/render/world/blackoutMask");
const await_targetFrame = await import("@/ui/targetFrame");
const await_floorArt = await import("@/render/art/floorArt");
const await_minimap = await import("@/ui/minimap");
const await_minimapMode = await import("@/ui/minimapMode");
const { GAMEPLAY_EFFECTS } = await import("@/audio/gameplaySounds");
const await_topRightColumn = await import("@/ui/topRightColumn");
const await_positionReadout = await import("@/ui/positionReadout");
const await_minimapName = await import("@/ui/minimapName");
const await_progressHud = await import("@/ui/ProgressHud");
const { ProgressHud: ProgressHudClass } = await_progressHud;
const await_resourceHud = await import("@/ui/ResourceHud");
const await_partyFramesLayout = await import("@/ui/partyFramesLayout");
type MaskLook = import("@/render/world/blackoutMask").MaskLook;
type MarkerModes = import("@/render/creatures/markerMode").MarkerModes;
const await_iso = await import("@/render/iso");
const { TRAP_FAINT } = await import("@/render/world/sealLooks");
const INTERACTABLE_RADIUS = (await import("@/render/world/floorLights")).interactablePool({ x: 0, y: 0 }, 0).radius;
const { useGameStore } = await import("@/stores/gameStore");
const { mountGearPieces } = await import("@/ui/gearPieces");
const { gearPanelLayout, overlayLayout, panelClose } = await import("@/ui/gearOverlayLayout");
const { cornerIconFrame } = await import("@/ui/hudCornerLayout");
const { cornerRowOn } = await import("@/ui/uiSceneCorner.standin");
const { gearOver, menuOver, partyPanelOver, uiSceneOn } = await import("@/ui/uiSceneMenu.standin");
const { UiChatSlot, chatWiring } = await import("@/ui/uiSceneChat");
const { ChatWindow } = await import("@/ui/ChatWindow");
const { createChatStore } = await import("@/stores/chatStore");
/** Whether the UI scene's chat may take the keys over the run (FS-TQZ5J § Change: Batch 6, R126). */
const chatMayOpen = (run: object) => chatWiring(uiSceneOn(run, "run", { row: false }).bridge).mayOpen();
/** The player typing in the UI scene's chat over the run, or not (FS-TQZ5J § Change: Batch 6, R127). */
const typeInChat = (run: object, on = true) => uiSceneOn(run, "run", { row: false }).bridge.reportUi({ typing: on });
const { barShownOver, hudOver } = await import("@/ui/uiSceneHud.standin");
const { GameUiBridge, NO_UI, worldContainer } = await import("@/ui/uiBridge");
const { ANTIDOTE_LOOK } = await import("@/render/effects/shimmer");
const { merchantLantern } = await import("@/render/world/merchant");

/**
 * The lore lines the run says through the UI bridge (FS-XWHZP; FS-TQZ5J § Change: Merge with main, the
 * owner's 2026-11-14 call): each line said handed to `said`, each floor-change clear to `cleared`. A run
 * lent no bridge says them to a copy of `NO_UI`, so the shared one is never spied on.
 */
function loreOf(run: object) {
  const scene = run as { ui: WorldUi };
  if (scene.ui === NO_UI) scene.ui = { ...NO_UI };
  const said = vi.fn((_line: { text: string; tone: string }) => {});
  const cleared = vi.fn();
  vi.spyOn(scene.ui, "lore").mockImplementation((message) => {
    expect(message.world).toBe("run");
    if (message.kind === "say") said(message.line);
    else cleared();
  });
  return { said, cleared };
}
const { UiRecordSlot } = await import("@/ui/uiSceneRecord");
const { SettlementRecord } = await import("@/ui/SettlementRecord");
const { recordAnchor } = await import("@/ui/resolvedRow");

/**
 * The UI scene's settlement record over the run (FS-TQZ5J § Change: Phase 3, R57), as the UI scene builds
 * it: drawn from what the run hands through the bridge, a real SettlementRecord at its anchor, on the
 * run's own stage so a test finds its words and its Close where it found the run's; Close plays
 * menu_click, then asks the run to close it.
 */
function recordOverRun(run: object): void {
  const { bridge } = uiSceneOn(run, "run", { row: false });
  const slot = new UiRecordSlot(
    bridge,
    (anchor, onClose, onHovered) => new SettlementRecord(run as never, anchor, onClose, onHovered),
    () => recordAnchor(viewport),
  );
  bridge.onScreen({ record: (shown) => slot.show(shown, "run") });
}

/** A key as both scenes' key objects stand in for it here: pressed since the last frame, or not. */
interface PressedKey {
  justDown: boolean;
}

/**
 * One frame of the UI scene over the run, before the run's own (FS-TQZ5J R21): Esc and the menu's
 * keys read once each, as `UIScene.readKeys` reads its own key objects; the menu slot drawn on the
 * run's stage (`uiSceneOn`). The test's fake keys stand in for the UI scene's.
 */
function uiFrame(run: object, keys: Partial<Record<"esc" | "enter" | "one" | "two" | "three" | "left" | "right", PressedKey>>): void {
  const down = (k?: PressedKey) => {
    const was = !!k?.justDown;
    if (k) k.justDown = false;
    return was;
  };
  const esc = down(keys.esc);
  const enter = down(keys.enter);
  const numbered = [keys.one, keys.two, keys.three].map(down).indexOf(true);
  const left = down(keys.left);
  const right = down(keys.right);
  uiSceneOn(run, "run", { row: false }).frame({ esc, enter, numbered, nudge: left === right ? undefined : left ? -1 : 1 });
}

/**
 * Whether a drawn text is the spectate switcher's words (FS-QPDKN § Change: The party death flow and the spectate
 * switcher, R159): the watched name alone since the owner's 「觀看時中間名字不用顯示watching了」 (2026-11-14), so
 * told from a name plate by its look, 14 px in watchedName, and its depth, one over the switcher's.
 */
function isSwitcherWords(m: { args: unknown[]; depth?: number }): boolean {
  const style = m.args[3] as { fontSize?: string; color?: string } | undefined;
  return style?.fontSize === "14px" && style.color === toCss(palette.watchedName) && m.depth === 1001;
}

/** The UI scene's menu slot filled (or emptied) over the run (FS-TQZ5J R10), as every guard of the run's reads it. */
function menuUpOver(run: object, open = true): void {
  uiSceneOn(run, "run", { row: false }).bridge.reportUi({ menuOpen: open });
}
const { BAG_CAPACITY, BAG_FULL_NOTICE } = await import("@/ui/bag");
const { EventEmitter } = await import("eventemitter3");
const { usePartyStore } = await import("@/stores/partyStore");
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
  runEnded?: boolean;
  fx?: unknown;
  hits?: unknown;
  lightMap?: unknown;
  projectiles?: unknown;
  monsters?: unknown;
  resolvedCard?: unknown;
  floorText?: unknown;
  shownFloor: number | undefined;
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
    run.runEnded = true;
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
    expect(run.runEnded).toBe(false);
    expect(run.monsters).toBeUndefined();
    expect(run.resolvedCard).toBeUndefined();
  });

  it("should forget the stopped run's stairs and floor, so the next start shows the new ones", () => {
    const { run } = startedRun();
    const sprite = { setPosition: () => sprite, setDepth: () => sprite, destroy: vi.fn() };
    run.add = { sprite: () => sprite };
    run.stairs.sync([{ entity_id: "s1", position: { x: 100, y: 100 } }]);
    run.floorText = {};
    run.shownFloor = 2;
    run.lastFloor = 2;
    expect(run.stairs.nearby({ x: 100, y: 100 })).toBe("s1");

    run.events.emit("shutdown");

    expect(run.stairs.nearby({ x: 100, y: 100 })).toBeNull();
    // Phaser has already destroyed the stopped run's objects
    expect(sprite.destroy).not.toHaveBeenCalled();
    expect(run.floorText).toBeUndefined();
    expect(run.shownFloor).toBeUndefined();
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
  it("should give the next run back the keyboard the run's end locked", () => {
    const { scene, run } = startedRun();
    const keyboard = { enabled: false };
    (run as unknown as { input: unknown }).input = { keyboard };

    run.events.emit("shutdown");
    scene.init();

    expect(keyboard.enabled).toBe(true);
  });

  it("should not pile up teardown listeners across restarts", () => {
    const { scene, run } = startedRun();
    // one per thing that lets go at the end (the run's teardown, its held one-shots): the same
    // number after every restart
    const ends = [run.events.listenerCount("shutdown"), run.events.listenerCount("destroy")];
    for (let i = 0; i < 3; i++) {
      run.events.emit("shutdown");
      scene.init();
    }
    expect([run.events.listenerCount("shutdown"), run.events.listenerCount("destroy")]).toEqual(ends);
    expect(ends).toEqual([2, 2]);
  });
});

// Leaving /game mid-run destroys the game: Phaser emits the scene's DESTROY only, after every plugin
// has destroyed itself (sceneEnd.standin.ts). The run must still let go of what outlives the game,
// and ask the dead plugins nothing: in the hub the same teardown threw on the input (asked 2026-11-06).
describe("BarrowspireScene ending (game destroy on leaving /game)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should let the run go on a game destroy without asking the destroyed plugins anything", () => {
    const scene = new BarrowspireScene();
    const run = scene as unknown as RunState & { tabKey?: object };
    // the plugins boot before the scene's init runs, so they hear DESTROY first
    const systems = sceneSystems();
    Object.assign(scene, systems.scene);
    scene.init();
    run.tabKey = { keyCode: 9 };
    run.player = {};
    const off = vi.spyOn(socketManager, "off");

    systems.destroy();

    expect(systems.touched).toEqual([]);
    expect(off).toHaveBeenCalledWith("end_game");
    expect(run.player).toBeUndefined();
  });

  it("should still give the next run back the keyboard the run's end locked, on a stop", () => {
    const scene = new BarrowspireScene();
    const systems = sceneSystems();
    Object.assign(scene, systems.scene);
    scene.init();
    systems.input.keyboard.enabled = false;

    systems.shutdown();

    expect(systems.input.keyboard.enabled).toBe(true);
  });

  // the menus wear the bone hand too: a stop leaves the hand, not a monster's strike-mark, as the
  // field's does (FS-KYPQ9 § Change: The pressed hand, and the hand on the menus, P7)
  it("should leave the bone hand, not the strike-mark, on a stop", () => {
    const scene = new BarrowspireScene();
    const systems = sceneSystems();
    Object.assign(scene, systems.scene);
    const page = lookGame();
    page.look().base("strike");
    // the run lets go of the game's focus events as it stops
    Object.assign(scene, { game: { ...page.game, events: new EventEmitter() } });
    scene.init();

    systems.shutdown();

    expect(page.now()).toBe("hand");
  });

  // Phaser's stop destroys the run's keys before the run's own handler (KeyboardPlugin.shutdown →
  // removeAllKeys(true)) and keeps their captures, the game's: removeKey then found no Tab, and
  // Tab's default stayed prevented in the hub and its DOM overlays until the game died (review
  // 2026-11-06).
  it("should hand back the Tab capture on a stop, though Phaser destroyed the key first", () => {
    const scene = new BarrowspireScene();
    const run = scene as unknown as { tabKey?: object };
    const systems = sceneSystems();
    Object.assign(scene, systems.scene);
    scene.init();
    run.tabKey = systems.input.keyboard.addKey(9, true);

    systems.shutdown();

    expect(systems.input.manager?.captures).not.toContain(9);
  });

  it("should hand back the captures every key it binds made, on a stop", () => {
    const scene = new BarrowspireScene();
    const systems = sceneSystems();
    Object.assign(scene, systems.scene);
    scene.init();
    (scene as unknown as { bindKeys(): void }).bindKeys();
    expect(systems.input.manager?.captures).toContain(87);

    systems.shutdown();

    expect(systems.input.manager?.captures).toEqual([]);
  });

  // Tab is the game frame's to keep (keepTab, src/components/gameFocus.ts), and only while nothing on
  // the page holds focus: a capture here held it on a focused header link or the fullscreen button
  // too, so a keyboard player there could not Tab on (reported 2026-11-12).
  it("should hear Tab without capturing it", () => {
    const scene = new BarrowspireScene();
    const systems = sceneSystems();
    Object.assign(scene, systems.scene);
    scene.init();
    (scene as unknown as { bindKeys(): void }).bindKeys();

    expect(systems.input.manager?.captures).not.toContain(9);
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
    // one per thing that lets go at the end (the run's teardown, its held one-shots): the same
    // number after every restart
    const ends = [run.events.listenerCount("shutdown"), run.events.listenerCount("destroy")];
    for (let i = 0; i < 3; i++) {
      run.events.emit("shutdown");
      scene.init();
    }
    expect([run.events.listenerCount("shutdown"), run.events.listenerCount("destroy")]).toEqual(ends);
    expect(ends).toEqual([2, 2]);
  });
});

describe("BarrowspireScene projectile kinds (FS-JTNPR req 20, 23; FS-1J1CB §F R41)", () => {
  it.each([
    // with no archer standing by it: every archer's but a Shadow Ranger's (FS-1J1CB §F R41)
    ["shadow_shot", "the Heavy Shot", HEAVY_SHOT_FLIGHT],
    ["arrow", "the arrow", ARROW_FLIGHT],
    ["fireball", "the fireball", FIREBALL_FLIGHT],
    ["something_new", "the fireball, as drawn today", FIREBALL_FLIGHT],
    ["toString", "the fireball, as drawn today", FIREBALL_FLIGHT],
  ])("should fly a projectile of kind %s as %s", (type, _what, flight) => {
    expect(projectileFlightOf(type)).toBe(flight);
  });

  it("should fly the shadow bolt for a shadow_shot first seen beside a Shadow Ranger in the run's state", () => {
    const { run } = sceneOnStage();
    const sync = vi.fn();
    run.projectiles = { sync, clear: vi.fn() };
    const ranger = { ...player("ally", "Wenna", 160), class: "archer", specialization: "shadow_ranger" };
    const shot = { entity_id: "s1", projectile_type: "shadow_shot", position: at(170, 300), velocity: { vx: 260, vy: 0 } };
    const state = { ...floorState(1), other_players: [ranger], projectiles: [shot] } as GameState;
    run.handleGameStateUpdate(state);
    const [sightings, bystanders] = sync.mock.calls.at(-1)!;
    expect(sightings).toEqual([shot]);
    expect(bystanders).toEqual([ranger]);
    expect(projectileFlightOf("shadow_shot", shooterOf(shot.position, bystanders))).toBe(SHADOW_SHOT_FLIGHT);
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
      // the manifest cached and unreadable: nothing to download, so no torch bar (FS-C4JWH §D)
      cache: { json: { exists: () => true, get: () => undefined } },
      load: { on: () => {}, once: () => {}, json: () => {}, audio: () => {} },
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

/** The run's button labels as the game's EB Garamond measures them, 13 px bold, letter-spaced 1 (R122). */
const LABEL_WIDTHS: Record<string, number> = { WATCH: 56, LEAVE: 46, SETTLEMENT: 96 };
const measuredWidth = (words: string) => LABEL_WIDTHS[words] ?? words.length * 7;
const recordingStage = () => recordingStandIn({ textWidth: measuredWidth, placed: false, records: true });

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
  hounds?: unknown;
  monsterTargeting: import("@/render/creatures").MonsterTargeting;
  lightMap?: unknown;
  projectiles?: unknown;
  groundLayer?: unknown;
  occluders: { size: number };
  handleGameStateUpdate(state: GameState): void;
  endRun(): void;
}

const at = (x: number, y: number) => ({ x, y });

/**
 * The player's body as drawn at `pos`: what the inside test and the silhouette read of it, sorted
 * by its footprint, with the 10 px bounds every recorded object reports.
 */
const drawnPlayer = (pos: { x: number; y: number }) => ({
  visible: true,
  setVisible: () => {},
  getBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }),
  depth: await_iso.worldDepth(pos.x, pos.y),
  texture: { key: "art:warrior" },
  frame: { name: "warrior/idle/0/0" },
  x: pos.x,
  y: pos.y,
  originX: 0.5,
  originY: 0.9,
  scaleX: 1,
  scaleY: 1,
  flipX: false,
  parentContainer: null,
});

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
    escaped_count: 0,
  };
}

/** A counter tween run to its end at once: the fog's fade (FS-SRA9J §C.13) as the state path sees it. */
function finishAtOnce(config: { onUpdate?: (t: { getValue(): number }) => void; onComplete?: () => void }) {
  config.onUpdate?.({ getValue: () => 1 });
  config.onComplete?.();
  return { stop: vi.fn() };
}

function sceneOnStage() {
  const scene = new BarrowspireScene();
  const run = scene as unknown as FloorRun;
  const stage = recordingStage();
  const logger = { warn: () => {} };
  const lights: unknown[] = [];
  /** Each fixed light's halo gate, as the scene handed it over. */
  const gates = new Map<unknown, () => boolean>();
  const painted: { id: string }[][] = [];
  const grounds: unknown[] = [];
  run.add = stage.add;
  // no run's map is held until the server sends one (FS-KE075 §H.40)
  useGameStore.setState({ floorMap: null });
  // the server's part (FS-KE075 §F.32): a floor's map goes before its first state, so a fixture
  // state's walls become that floor's map and the state itself carries none, as a run's never does
  const apply = run.handleGameStateUpdate.bind(run);
  run.handleGameStateUpdate = (state: GameState) => {
    const { walls, ...frame } = state;
    const held = useGameStore.getState().floorMap;
    if (walls && state.floor !== undefined && (held?.floor !== state.floor || held.session_id !== state.session_id))
      useGameStore.getState().receiveFloorMap({ session_id: state.session_id, floor: state.floor, width: 1440, height: 960, walls });
    apply(frame as GameState);
  };
  run.physics = {
    world: { setBounds: vi.fn() },
    add: {
      staticGroup: () => stage.make("staticGroup"),
      sprite: (...args: unknown[]) => stage.make("sprite", args),
      collider: () => {},
    },
  };
  run.tweens = { add: vi.fn(), killTweensOf: vi.fn(), addCounter: vi.fn(finishAtOnce) };
  run.time = { delayedCall: vi.fn() };
  // the fog of war's canvas textures (FS-SRA9J §C.13): each one paints, refreshes and goes; and the
  // minimap's vignette (FS-56CKV §A.2), a gradient painted once its key is asked for
  (run as unknown as { textures: unknown }).textures = {
    exists: () => false,
    createCanvas: (_key: string, w: number, h: number) => ({
      getContext: () => ({
        createImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        createLinearGradient: () => ({ addColorStop: vi.fn() }),
        fillRect: vi.fn(),
      }),
      putData: vi.fn(),
      refresh: vi.fn(),
      setFilter: vi.fn(),
      destroy: vi.fn(),
    }),
    // the scratch a chunk's wall shadows are drawn into (FS-V8FT3 §E): recorded, and gone after
    addDynamicTexture: (key: string, w: number, h: number) => stage.make("dynamicTexture", [key, w, h]),
  };
  // what the ground draws off the display list: its wall shadows' shapes and cuts (FS-V8FT3 §E)
  (run as unknown as { make: unknown }).make = { graphics: () => stage.make("graphics", ["off the display list"]) };
  // the HUD lays out in the logical view, which the viewport owns (FS-ZAJMH R2)
  viewport.set({ width: 800, height: 600, renderScale: 1 });
  run.cameras = {
    main: { width: 800, height: 600, centerX: 400, centerY: 300, startFollow: vi.fn() },
  };
  // the game's pointer look, whose base the run sets (FS-KYPQ9 § Change: The pressed hand, P5)
  const cursor = vi.fn();
  run.input = {};
  Object.assign(run, { pointerLook: { base: cursor } });
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
  // the archers' hounds (FS-X2CMM §I R47), through the scene's own stage builder
  run.hounds = new HoundSet(
    phaserHoundStage(
      {
        add: {
          sprite: (...args: unknown[]) => stage.make("sprite", args),
          graphics: () => stage.make("graphics"),
        },
      } as never,
      TRAIL_BED_DEPTH,
    ),
    run.art as InstanceType<typeof ArtLibrary>,
  );
  // made with the world theme's ambient, as the scene makes it; each later change recorded with
  // whether the floor's fog stood when it came (FS-SRA9J §Change: Lighter fog and lit regions, F8)
  const lit = {
    ambient: (run as unknown as { worldLook: { ambient: number } }).worldLook.ambient,
    ambients: [] as { ambient: number; fog: boolean }[],
  };
  run.lightMap = {
    add: (source: unknown, gate?: () => boolean) => {
      lights.push(source);
      if (gate) gates.set(source, gate);
    },
    remove: (source: unknown) => {
      const at = lights.indexOf(source);
      if (at >= 0) lights.splice(at, 1);
      gates.delete(source);
    },
    clear: () => lights.splice(0),
    clearTransient: () => {},
    // a short-lived pool (a book effect's, FS-X2CMM R47): kept off the fixed lights' list
    addTransient: (spec: object) => ({ ...spec, alive: true, remove: () => {} }),
    get ambient() {
      return lit.ambient;
    },
    ambients: lit.ambients,
    setAmbient: (ambient: number) => {
      lit.ambient = ambient;
      lit.ambients.push({ ambient, fog: !!(run as unknown as { dungeon?: { fog?: unknown } }).dungeon?.fog });
    },
  };
  run.groundLayer = {
    paint: (houses: { id: string }[], floor?: unknown) => {
      painted.push(houses);
      if (floor) grounds.push(floor);
    },
    // the walls' shadows laid over it, and forgotten on a climb (FS-V8FT3 §E, §F): not under test here
    shade: () => {},
    unshade: () => {},
  };
  // the satchel a coffer opens into, closed: the state path only asks what it shows
  Object.assign(run, {
    containerView: { entityId: null, isOpen: false, open: vi.fn(), close: vi.fn(), setItems: vi.fn() },
  });
  const texts = () =>
    stage.made.filter((m) => m.kind === "text").map((m) => ({ content: m.args[2], style: m.args[3] as { fontFamily?: string; fontSize?: string; stroke?: string } }));
  // the UI scene up over the run, as the run's report brings it up: its notices drawn on the run's
  // stage, on the run's clock and tweens (FS-TQZ5J A2 R33), and its settlement record (§ Change: Phase 3, R57)
  uiSceneOn(run, "run", { row: false });
  recordOverRun(run);
  // and its HUD: the bars, the potion cell, the level bar and the ability card, drawn on the run's stage
  // from what the run hands through the bridge (FS-TQZ5J § Change: Batch 5, R67, R68)
  hudOver(run, "run");
  return { run, stage, lights, gates, painted, grounds, texts, cursor };
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

    // the run's blackout outlives its floors: cleared and hidden here, drawn afresh on the next
    const blackout = (run as unknown as { view?: { blackout: { dark: Made } } }).view!.blackout.dark;
    // (the scene holds the recorded object behind its proxy: the same record, one level down)
    const survivors = floorOne.filter((m) => !m.destroyed && m.calls !== blackout.calls);
    expect(survivors.map((m) => m.kind)).toEqual([]);
    expect(blackout.shown).toBe(false);
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

  it("should take the card's line from the stairs, not the floor number (FS-M8CSE R9)", () => {
    const stair = [{ entity_id: "st4", position: { x: 1000, y: 700 } }];
    const shows = (line: string, climb: GameState) => {
      const { run, texts } = sceneOnStage();
      run.handleGameStateUpdate(floorState(1));
      run.handleGameStateUpdate(climb);
      expect(texts().some((t) => t.content === line)).toBe(true);
    };

    shows("The dead walk heavier here.", { ...floorState(4), stairs: stair });
    shows("No stair climbs higher. Only the way out remains.", { ...floorState(2), stairs: [] });
  });

  // FS-XWHZP R16, R22, R23 (I-XWHZP-3): hope lines on a flip only; each floor's first broadcast is
  // its baseline
  it("should say the switch and the escape door as hope lines when they turn, never on a floor's first broadcast", () => {
    const { run } = sceneOnStage();
    const said = loreOf(run).said;
    const lines = () => said.mock.calls.map(([line]) => line);
    const seal = { text: "The seal breaks. Somewhere, a door gives.", tone: "hope" };
    const open = { text: "The way out stands open.", tone: "hope" };

    run.handleGameStateUpdate(floorState(1, { switchOn: true, doorOpen: true }));
    expect(lines()).toEqual([]);

    run.handleGameStateUpdate(floorState(2));
    run.handleGameStateUpdate(floorState(2, { switchOn: true }));
    expect(lines()).toEqual([seal]);
    run.handleGameStateUpdate(floorState(2, { switchOn: true, doorOpen: true }));
    run.handleGameStateUpdate(floorState(2, { switchOn: true, doorOpen: true }));
    expect(lines()).toEqual([seal, open]);
  });

  it("should raise no HUD notice for the switch or the door (FS-XWHZP R16)", () => {
    const { run, texts } = sceneOnStage();
    const { said } = loreOf(run);
    run.handleGameStateUpdate(floorState(1));
    run.handleGameStateUpdate(floorState(1, { switchOn: true, doorOpen: true }));
    expect(texts().filter((t) => /unlocked|opened/i.test(String(t.content)))).toHaveLength(0);
    // the seal's lore line, said to the UI scene, which draws it (FS-TQZ5J § Change: Merge with main, 2026-11-14)
    expect(said.mock.calls.filter(([line]) => line.text === "The seal breaks. Somewhere, a door gives.")).toHaveLength(1);
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

/** What the scene built of a floor: its walls, its perimeter and dressing once done, its size. */
interface MapRun extends FloorRun {
  walls: Map<string, unknown>;
  perimeter?: unknown[];
  dressing?: unknown[];
  lastFloor?: number;
  /** The shared arrival card (FS-PQ2TW R37): the dark first, then the card, while one is up. */
  arrivalCard: { parts: unknown[] };
  mapWidth: number;
  mapHeight: number;
  subscribeFloorMap(): void;
  floorMapUnsubscribe?: () => void;
}

/** `state` as the server sends a run's: no walls key (FS-KE075 §F.34). */
const bare = (state: GameState): GameState => {
  const { walls: _walls, ...frame } = state;
  return frame as GameState;
};

/** The floor map of `state`'s floor, its walls the fixture's. */
const mapOf = (state: GameState, size = { width: 1440, height: 960 }) => ({
  session_id: state.session_id,
  floor: state.floor!,
  ...size,
  walls: state.walls!,
});

describe("BarrowspireScene floor map (FS-KE075 §H.40–§H.43)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState({ floorMap: null });
  });

  function mapStage() {
    const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const scene = sceneOnStage();
    const run = scene.run as unknown as MapRun;
    // the real state path, without the harness' map-first shim
    const handle = (Object.getPrototypeOf(run) as FloorRun).handleGameStateUpdate.bind(run);
    const clock = { now: 0 };
    run.time = { delayedCall: vi.fn(), get now() { return clock.now; } };
    const asks = () => sent.mock.calls.filter(([action]) => action === "request_floor_map").length;
    return { ...scene, run, handle, clock, asks };
  }

  it("builds the floor from a map held before the first snapshot, once", () => {
    const { run, handle } = mapStage();
    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));

    handle(bare(floorState(2)));
    const built = run.walls.size;
    handle(bare(floorState(2)));
    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
    handle(bare(floorState(2)));

    expect(built).toBe(4);
    expect(run.walls.size).toBe(4);
    expect(run.perimeter).toBeDefined();
    expect(run.dressing).toBeDefined();
  });

  it("applies a snapshot whose floor has no map for its entities, and builds the floor when the map comes", () => {
    const { run, handle, stage } = mapStage();
    run.subscribeFloorMap();

    handle(bare(floorState(2)));
    expect(run.walls.size).toBe(0);
    expect(run.perimeter).toBeUndefined();
    expect(run.dressing).toBeUndefined();
    // the dynamic entities stand: the chest, the doors, the monsters
    expect(stage.made.some((m) => m.kind === "sprite")).toBe(true);

    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
    expect(run.walls.size).toBe(4);
    expect(run.perimeter).toBeDefined();
    expect(run.dressing).toBeDefined();

    const made = stage.made.length;
    handle(bare(floorState(2)));
    expect(stage.made.length).toBe(made);
    run.floorMapUnsubscribe?.();
  });

  it("asks for a withheld map after a second, then every second, and stops once it comes", () => {
    const { run, handle, clock, asks } = mapStage();
    run.subscribeFloorMap();
    for (clock.now = 0; clock.now <= 3100; clock.now += 50) handle(bare(floorState(2)));
    expect(asks()).toBe(3);

    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
    for (; clock.now <= 6000; clock.now += 50) handle(bare(floorState(2)));
    expect(asks()).toBe(3);
    expect(run.walls.size).toBe(4);
    run.floorMapUnsubscribe?.();
  });

  it("drops a late snapshot of the floor below the map's, and never climbs back down", () => {
    const { run, handle } = mapStage();
    useGameStore.getState().receiveFloorMap(mapOf(floorState(1)));
    handle(bare(floorState(1)));
    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));

    handle(bare(floorState(1)));
    expect(run.lastFloor).toBe(1);
    expect(run.arrivalCard.parts).toHaveLength(0);

    handle(bare(floorState(2)));
    expect(run.lastFloor).toBe(2);
    expect(run.walls.has("w3_2")).toBe(true);
  });

  it("keeps the climb's veil up until the new floor's map is built", () => {
    const { run, handle } = mapStage();
    run.subscribeFloorMap();
    useGameStore.getState().receiveFloorMap(mapOf(floorState(1)));
    handle(bare(floorState(1)));
    const tweens = (run.tweens as { add: ReturnType<typeof vi.fn> }).add;
    const veilFades = () => tweens.mock.calls.filter(([t]) => t.targets === run.arrivalCard.parts[0] && t.alpha === 0).length;

    handle(bare(floorState(2)));
    expect(run.arrivalCard.parts.length).toBeGreaterThan(0);
    expect(run.walls.size).toBe(0);
    expect(veilFades()).toBe(0);

    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
    expect(run.walls.size).toBe(4);
    expect(veilFades()).toBe(1);
    run.floorMapUnsubscribe?.();
  });

  it("lifts the veil on time when the new floor's map came first", () => {
    const { run, handle } = mapStage();
    useGameStore.getState().receiveFloorMap(mapOf(floorState(1)));
    handle(bare(floorState(1)));
    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
    const tweens = (run.tweens as { add: ReturnType<typeof vi.fn> }).add;

    handle(bare(floorState(2)));

    const fade = tweens.mock.calls.find(([t]) => t.targets === run.arrivalCard.parts[0] && t.alpha === 0);
    expect(fade).toBeDefined();
  });

  it("takes the map's size for the floor, not a fixed one", () => {
    const { run, handle } = mapStage();
    useGameStore.getState().receiveFloorMap(mapOf(floorState(2), { width: 2880, height: 1920 }));

    handle(bare(floorState(2)));

    expect([run.mapWidth, run.mapHeight]).toEqual([2880, 1920]);
    const bounds = (run.physics as { world: { setBounds: ReturnType<typeof vi.fn> } }).world.setBounds;
    const projected = await_iso.projectedBounds(2880, 1920, 0);
    expect(bounds.mock.calls.at(-1)![2]).toBeGreaterThan(projected.width - 1);
  });

  it("never reads walls from a run snapshot", () => {
    const { run, handle } = mapStage();
    handle(floorState(2));
    expect(run.walls.size).toBe(0);
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

/**
 * A real party panel on a bare stand-in scene, refused by `refused`: the scene's own rule for T
 * and the Party icon (FS-R82NV R28; FS-3EBCA R8). Its invite field is a silent stand-in.
 */
const { partyPanelOn: panelOn } = await import("@/ui/partyPanel.standin");
const partyPanelOn = (
  refused: () => boolean,
  wrapper?: { act(run: () => void): void },
  store?: import("@/ui/partyPanel.standin").PanelStore,
) => panelOn(refused, { wrapper, store });

const { hearWorld } = await import("@/ui/uiSceneSounds.standin");

/**
 * The run's interface sounds, as the UI scene plays them (FS-TQZ5J R22): its game lent a UI bridge with the
 * UI scene's player on a recording stand-in for the game's sound (every effect cached, the context
 * running, the level the default), and the world reported as create reports it. Returns the effects
 * played since the last read, by name (FS-WDM0X S10).
 */
function hearOn(scene: Record<string, unknown>): () => string[] {
  return hearWorld(scene, "run");
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

// FS-C8VM7 §G R42-R43 (I-C8VM7-8): the scene's seam only. What is fetched and evicted for a
// pool is FloorPoolArt's (floorArt.test.ts); how, onDemandArt's (phaser.test.ts).
describe("BarrowspireScene a floor's pool art (FS-C8VM7 §G R42-R43, ADR-0081)", () => {
  const { FloorPoolArt } = await_floorArt;
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState({ floorMap: null });
  });

  function poolStage() {
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const scene = sceneOnStage();
    const run = scene.run as unknown as MapRun & { poolArt?: unknown; monsters: InstanceType<typeof MonsterRoster> };
    const handle = (Object.getPrototypeOf(run) as FloorRun).handleGameStateUpdate.bind(run);
    run.time = { delayedCall: vi.fn(), now: 0 };
    const holding = new Set<string>();
    const calls: string[] = [];
    let monstersAtRelease = -1;
    const art = {
      prefetch: vi.fn((groups: readonly string[]) => {
        calls.push(`prefetch ${groups.join(",")}`);
        for (const group of groups) holding.add(group);
      }),
      release: vi.fn((groups: readonly string[]) => {
        calls.push(`release ${groups.join(",")}`);
        monstersAtRelease = run.monsters.size;
        for (const group of groups) holding.delete(group);
      }),
      holding: () => [...holding],
    };
    run.poolArt = new FloorPoolArt(art, vi.fn());
    run.subscribeFloorMap();
    const pooled = (floor: number, enemy_pool?: string[]) =>
      useGameStore.getState().receiveFloorMap({ ...mapOf(floorState(floor)), ...(enemy_pool ? { enemy_pool } : {}) });
    return { run, handle, art, calls, holding, pooled, monstersAtRelease: () => monstersAtRelease };
  }

  it("should fetch a climb's pool as its map comes, and evict the last floor's groups once its monsters are gone", () => {
    const { run, handle, calls, holding, pooled, monstersAtRelease } = poolStage();
    pooled(1, ["ghoul", "shade"]);
    handle(bare(floorState(1)));
    expect(calls).toEqual(["prefetch shade"]);

    // the climb's map, before the new floor's first snapshot: fetched at once, nothing evicted
    pooled(2, ["ghast", "ogre"]);
    expect(calls).toEqual(["prefetch shade", "prefetch ghast,ogre"]);
    expect([...holding].sort()).toEqual(["ghast", "ogre", "shade"]);

    handle(bare(floorState(2)));
    expect(calls.at(-1)).toBe("release shade");
    expect(monstersAtRelease()).toBe(0);
    expect(run.monsters.size).toBeGreaterThan(0);
    run.floorMapUnsubscribe?.();
  });

  it("should neither fetch nor evict for a map without enemy_pool", () => {
    const { handle, art, pooled, run } = poolStage();
    pooled(1);
    handle(bare(floorState(1)));
    pooled(2);
    handle(bare(floorState(2)));
    expect(art.prefetch).not.toHaveBeenCalled();
    expect(art.release).not.toHaveBeenCalled();
    run.floorMapUnsubscribe?.();
  });

  it("should not refetch or evict for a re-sent map of the same floor (ADR-0060)", () => {
    const { handle, calls, pooled, run } = poolStage();
    pooled(2, ["ghast"]);
    handle(bare(floorState(2)));
    pooled(2, ["ghast"]);
    handle(bare(floorState(2)));
    expect(calls).toEqual(["prefetch ghast"]);
    run.floorMapUnsubscribe?.();
  });
});

// FS-X2CMM §H R40–R44a (I-X2CMM-11): the book asks, the run arms, draws the reticle and sends the cast;
// while armed a left-click never attacks and a right-click disarms without the class ability; Esc
// disarms first; the book closing disarms.
describe("BarrowspireScene class book pages (FS-X2CMM §H R40–R44a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function bookStage() {
    const stage = onStage();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    Object.assign(stage.run, {
      input: {
        setDefaultCursor: vi.fn(),
        keyboard: { on: vi.fn() },
        on: (event: string, fn: () => void) => (handlers[event] = fn),
      },
    });
    (stage.run as unknown as { bindRunInput(): void }).bindRunInput();
    const ui = uiSceneOn(stage.run, "run", { row: false });
    /** A press at the world point `world`, with the left (0) or the right (2) button. */
    const click = (world: { x: number; y: number }, button = 0) => {
      const screen = await_iso.worldToScreen(world.x, world.y);
      handlers.pointerdown({
        x: 10,
        y: 10,
        button,
        worldX: screen.x,
        worldY: screen.y,
        leftButtonDown: () => button === 0,
        rightButtonDown: () => button === 2,
      });
    };
    const casts = () => stage.sent.mock.calls.filter(([action]) => action === ActionType.CastSkill).map(([, payload]) => payload);
    const mage = { ...player("me", "Aldric", 130), class: "mage" } as ReturnType<typeof player>;
    stage.run.handleGameStateUpdate(partyState(mage));
    // the book is open: arming happens in it
    ui.bridge.reportUi({ book: true });
    return { ...stage, ...ui, click, casts };
  }

  it("should arm Witchlight on the book's ask, and send cast_skill with the page and the point on a click 5 cells off", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    expect(t.casts()).toEqual([]);
    expect(t.bridge.world?.facts().armed).toBe(true);

    t.click({ x: 130 + 5 * 80, y: 300 });
    expect(t.casts()).toHaveLength(1);
    const [cast] = t.casts() as { skill_id: string; target_x: number; target_y: number }[];
    expect(cast.skill_id).toBe("witchlight");
    expect(cast.target_x).toBeCloseTo(530);
    expect(cast.target_y).toBeCloseTo(300);
    expect(t.bridge.world?.facts().armed).toBe(false);
  });

  it("should send nothing, and attack nothing, on a click beyond the page's range: the page stays armed", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    t.click({ x: 130 + 9 * 80, y: 300 });
    expect(t.sent).not.toHaveBeenCalled();
    expect(t.bridge.world?.facts().armed).toBe(true);
  });

  it("should disarm on a right-click with no class ability, and on Esc before anything else", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    t.click({ x: 300, y: 300 }, 2);
    expect(t.sent).not.toHaveBeenCalled();
    expect(t.bridge.world?.facts().armed).toBe(false);

    t.bridge.request({ kind: "page", page: "witchlight" });
    t.menu.escape();
    expect(t.bridge.world?.facts().armed).toBe(false);
    expect(t.menu.isOpen()).toBe(false);
    expect(t.sent).not.toHaveBeenCalled();
  });

  it("should cast Hardened at once on the ask", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "hardened" });
    expect(t.casts()).toEqual([{ skill_id: "hardened", target_x: 130, target_y: 300 }]);
    expect(t.bridge.world?.facts().armed).toBe(false);
  });

  it("should snap Levitate under the teammate in reach and send the teammate's id", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "levitate" });
    t.click({ x: 165, y: 305 });
    expect(t.casts()).toEqual([{ skill_id: "levitate", target_x: 160, target_y: 300, target_id: "ally" }]);
  });

  it("should disarm as the book closes", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    t.bridge.reportUi({ book: false });
    expect(t.bridge.world?.facts().armed).toBe(false);
  });

  // I-X2CMM-23 item 9: every other way R41 names to disarm, nothing sent by any
  const mage = (fields: { current_health?: number } = {}) =>
    ({ ...player("me", "Aldric", 130, fields), class: "mage" }) as ReturnType<typeof player>;

  it("should disarm on death", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    t.run.handleGameStateUpdate(partyState(mage({ current_health: 0 })));
    expect(t.bridge.world?.facts().armed).toBe(false);
    expect(t.casts()).toEqual([]);
  });

  it("should disarm on a floor change", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    t.run.handleGameStateUpdate({ ...partyState(mage()), floor: 2 } as GameState);
    expect(t.bridge.world?.facts().armed).toBe(false);
    expect(t.casts()).toEqual([]);
  });

  it("should disarm as the run ends", () => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    (t.run as unknown as FloorRun).endRun();
    expect(t.bridge.world?.facts().armed).toBe(false);
    expect(t.casts()).toEqual([]);
  });

  it.each([
    ["the bag", { inventory: true }],
    ["the character sheet", { character: true }],
    ["the tree", { tree: true }],
    ["the menu", { menuOpen: true }],
  ])("should disarm as %s opens", (_, opened) => {
    const t = bookStage();
    t.bridge.request({ kind: "page", page: "witchlight" });
    t.bridge.reportUi({ book: true, ...opened });
    expect(t.bridge.world?.facts().armed).toBe(false);
    expect(t.casts()).toEqual([]);
  });

  it("should hear the owner's own cast on the cast bar, and none while watching a teammate", () => {
    const t = bookStage();
    const castBar = (t.run as unknown as { castBar: { hear(casting: unknown, now: number): void } }).castBar;
    const hear = vi.spyOn(castBar, "hear");
    const casting = { page: "witchlight", remaining: 0.5, total: 1 };
    const withCast = (me: ReturnType<typeof player>) =>
      ({ ...partyState({ ...me, book: { pages: [], casting } } as ReturnType<typeof player>) }) as GameState;

    t.run.handleGameStateUpdate(withCast(mage()));
    expect(hear.mock.calls.at(-1)?.[0]).toEqual(casting);

    t.run.handleGameStateUpdate(withCast(mage({ current_health: 0 })));
    (t.run as unknown as { startWatching(): void }).startWatching();
    expect((t.run as unknown as { watchedPlayerId?: string }).watchedPlayerId).toBe("ally");
    t.run.handleGameStateUpdate(withCast(mage({ current_health: 0 })));
    expect(hear.mock.calls.at(-1)?.[0]).toBeUndefined();
  });
});

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

  it.each([
    { clicked: "a corpse", x: 160, monster: 1 },
    { clicked: "a monster out of reach", x: 400, monster: 0 },
  ])("should not swing at $clicked", ({ x, monster }) => {
    const { run, sent, monsters } = onStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", x)));
    monsters()[monster].handlers.pointerdown();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should show the strike-mark over a living monster, and the hand once the pointer leaves", () => {
    const { run, monsters, cursor } = onStage();
    run.handleGameStateUpdate(partyState());
    monsters()[0].handlers.pointerover();
    expect(cursor).toHaveBeenLastCalledWith("strike");
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
    expect(cursor).not.toHaveBeenCalledWith("strike");
  });

  // FS-E1ZDG §K.41: a second, smaller line under every player's name with their title, own and others'
  it("should draw the title line under the own name and another's for a player who holds a spec, none without", () => {
    const { run, texts } = onStage();
    run.handleGameStateUpdate(
      partyState(
        { ...player("me", "Aldric", 130), specialization: "guardian" } as ReturnType<typeof player>,
        { ...player("ally", "Wenna", 160), class: "archer", specialization: "shadow_ranger" } as ReturnType<typeof player>,
      ),
    );
    const words = texts().map((t) => t.content);
    expect(words).toEqual(expect.arrayContaining(["Guardian", "Shadow Ranger"]));
  });

  it("should draw no title line for a player with no spec", () => {
    const { run, texts } = onStage();
    run.handleGameStateUpdate(partyState());
    expect(texts().some((t) => /^(Warrior|Mage|Archer|Mercenary) · /.test(String(t.content)))).toBe(false);
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

describe("BarrowspireScene gameplay player (FS-AND39 R13, R16)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // the interface effects are the UI scene's (FS-TQZ5J R22); the gameplay player stays the run's own
  // (merge with main, 2026-11-14)
  it("should make the run's gameplay player on the run's own sound", () => {
    const { run } = sceneOnStage();
    const played: string[] = [];
    Object.assign(run, {
      cache: { audio: { exists: (key: string) => GAMEPLAY_EFFECTS.some((e) => key === `sfx:${e}`) } },
      sound: {
        locked: false,
        context: { state: "running" },
        get: () => null,
        add: (key: string) => ({ volume: 1, play: () => (played.push(key.replace(/^sfx:/, "")), true) }),
      },
    });
    const scene = run as unknown as { mountGameplaySounds(): void; monsterEffects: { hit(m: unknown): void } };
    scene.mountGameplaySounds();
    scene.monsterEffects.hit(monster("m1", 100));
    expect(played).toEqual(["hit_monster"]);
  });

});

describe("BarrowspireScene combat sounds (FS-AND39 R2–R4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The run on stage, its gameplay sounds a recording stand-in for the one create makes. */
  function hearingRun() {
    const staged = onStage();
    const play = vi.fn();
    Object.assign(staged.run, { gameplaySounds: { play } });
    const run = staged.run as unknown as typeof staged.run & {
      monsterEffects: { hit(m: ReturnType<typeof monster>): void };
      combat: { cast(button: "primary" | "special", cls: string, from: { x: number; y: number }, to: { x: number; y: number }): boolean };
    };
    return { run, play };
  }

  it("should play hit_player on a drop in the player's own health, and nothing on the first state", () => {
    const { run, play } = hearingRun();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, { current_health: 100 })));
    expect(play).not.toHaveBeenCalled();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, { current_health: 70 })));
    expect(play.mock.calls).toEqual([["hit_player"]]);
  });

  it("should play nothing for a teammate's drop, or for the player's own rise", () => {
    const { run, play } = hearingRun();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, { current_health: 50 })));
    run.handleGameStateUpdate(
      partyState(player("me", "Aldric", 130, { current_health: 90 }), player("ally", "Wenna", 160, { current_health: 20 })),
    );
    expect(play).not.toHaveBeenCalled();
  });

  it("should play hit_monster for a monster's hit", () => {
    const { run, play } = hearingRun();
    run.monsterEffects.hit(monster("m1", 100));
    expect(play.mock.calls).toEqual([["hit_monster"]]);
  });

  it("should play the mage's Triple Fireball as it is sent, and nothing for the primary fireball", () => {
    const { run, play } = hearingRun();
    run.combat.cast("primary", "mage", at(100, 300), at(200, 300));
    expect(play).not.toHaveBeenCalled();
    (run.time as { delayedCall: ReturnType<typeof vi.fn> }).delayedCall.mock.calls.forEach(([, fn]) => fn());
    run.combat.cast("special", "mage", at(100, 300), at(200, 300));
    expect(play.mock.calls).toEqual([["triple_fireball"]]);
  });
});

describe("BarrowspireScene coffer and pickup sounds (FS-AND39 R5, R7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const blade = { entity_id: "i1", name: "Blade" };
  type TimedOpen = { entity_id: string; elapsed: number; duration: number };
  /** Floor 1's container as `kind`, shut or open, with this client's player by it (it is at 150, 150). */
  const floor = (kind: string, is_open = false, timed_open?: TimedOpen): GameState => {
    const state = floorState(1);
    return {
      ...state,
      current_player: { ...player("me", "Aldric", 150), position: at(150, 150), ...(timed_open ? { timed_open } : {}) },
      containers: [{ ...state.containers[0], kind, is_open, items: is_open ? [blade] : [] }],
    } as GameState;
  };

  /**
   * The run on stage with the UI scene's gear over it (FS-TQZ5J § Change: Phase 3, R50): the real
   * `mountGearPieces`, its coffer view a real `ContainerView` on a Phaser stand-in, the run's coffer the
   * bridge's (`worldContainer`). The UI scene's gameplay player (its coffer opens) and the run's own (a
   * take sent) record into one list, as both play on the game's one sound (merge with main, 2026-11-14).
   */
  function hearingRun(room = true) {
    const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const { run } = sceneOnStage();
    const play = vi.fn();
    const numbers: Record<string, number> = { x: 0, y: 0, scaleX: 1, scaleY: 1, alpha: 1, width: 64, height: 64, now: 0 };
    const stub: unknown = new Proxy(function () {}, {
      get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : typeof key === "string" && key in numbers ? numbers[key] : stub),
      apply: () => stub,
    });
    const scene = run as unknown as FloorRun & {
      ui: import("@/ui/uiBridge").WorldUi;
      gameplaySounds: { play: typeof play };
      toggleChest(id: string): void;
      chestRefused(): void;
    };
    scene.gameplaySounds = { play };
    Object.assign(scene, { containerView: worldContainer(() => scene.ui) });
    let view!: { lootFirst(): void; setItems(items: unknown[]): void };
    gearOver(run, "run", (w, wiring) => {
      const pieces = mountGearPieces(stub as never, () => stub as never, w, { ...wiring, sounds: { play } });
      view = pieces.container as never;
      return pieces;
    });
    run.time = { delayedCall: vi.fn(), now: 1000 };
    // without room, a full bag: the coffer view's take is pre-checked by the gear's bag (FS-HRH2J R21)
    const full = Array.from({ length: BAG_CAPACITY }, (_, i) => ({ entity_id: `bag-${i}`, name: "Stone" }));
    const carried = (state: GameState): GameState =>
      room ? state : ({ ...state, current_player: { ...state.current_player, inventory: full } } as GameState);
    return { run: scene, play, sent, view: () => view, carried };
  }

  it.each([
    ["chest", "chest_open"],
    ["sack", "loot_open"],
  ])("should play nothing at the reach for a shut %s, and %s once on the state that answers it", (kind, effect) => {
    const { run, play } = hearingRun();
    run.handleGameStateUpdate(floor(kind));
    run.toggleChest("c1");
    run.handleGameStateUpdate(floor(kind));
    expect(play).not.toHaveBeenCalled();

    run.handleGameStateUpdate(floor(kind, true));
    run.handleGameStateUpdate(floor(kind, true));
    run.handleGameStateUpdate(floor(kind, true));
    expect(play.mock.calls).toEqual([[effect]]);
  });

  it.each([
    ["chest", "chest_open"],
    ["sack", "loot_open"],
    ["drop_pile", "loot_open"],
  ])("should play at once for a %s the last state already showed open: %s", (kind, effect) => {
    const { run, play } = hearingRun();
    run.handleGameStateUpdate(floor(kind, true));
    run.toggleChest("c1");
    run.handleGameStateUpdate(floor(kind, true));
    expect(play.mock.calls).toEqual([[effect]]);
  });

  it("should play a timed open at the open, not at its start (FS-MQYEX)", () => {
    const { run, play } = hearingRun();
    const opening = (elapsed: number): TimedOpen => ({ entity_id: "c1", elapsed, duration: 1.5 });
    run.handleGameStateUpdate(floor("chest"));
    run.toggleChest("c1");
    run.handleGameStateUpdate(floor("chest", false, opening(0.03)));
    run.handleGameStateUpdate(floor("chest", false, opening(0.75)));
    expect(play).not.toHaveBeenCalled();

    run.handleGameStateUpdate(floor("chest", true));
    expect(play.mock.calls).toEqual([["chest_open"]]);
  });

  it("should play nothing for a cancelled timed open, even once another opens the chest", () => {
    const { run, play } = hearingRun();
    run.handleGameStateUpdate(floor("chest"));
    run.toggleChest("c1");
    run.handleGameStateUpdate(floor("chest", false, { entity_id: "c1", elapsed: 0.3, duration: 1.5 }));
    run.handleGameStateUpdate(floor("chest"));
    run.handleGameStateUpdate(floor("chest", true));
    expect(play).not.toHaveBeenCalled();
  });

  it("should play nothing for a refused reach, or for a chest another player opens", () => {
    const { run, play } = hearingRun();
    run.handleGameStateUpdate(floor("chest"));
    run.toggleChest("c1");
    run.chestRefused();
    run.handleGameStateUpdate(floor("chest", true));
    run.handleGameStateUpdate(floor("chest"));
    run.handleGameStateUpdate(floor("sack", true));
    expect(play).not.toHaveBeenCalled();
  });

  it("should play nothing as the player closes the coffer", () => {
    const { run, play } = hearingRun();
    run.handleGameStateUpdate(floor("chest", true));
    run.toggleChest("c1");
    run.toggleChest("c1");
    expect(play.mock.calls).toEqual([["chest_open"]]);
  });

  it("should play item_pickup as a take from the open coffer is sent, by F or a click", () => {
    const { run, play, sent, view } = hearingRun();
    run.handleGameStateUpdate(floor("chest", true));
    run.toggleChest("c1");
    play.mockClear();

    view().lootFirst();
    expect(play.mock.calls).toEqual([["item_pickup"]]);
    expect(sent).toHaveBeenLastCalledWith(ActionType.Interact, { entity_id: "i1" });
  });

  it("should play nothing for a take a full bag refuses, or with nothing left to take", () => {
    const { run, play, sent, view, carried } = hearingRun(false);
    run.handleGameStateUpdate(carried(floor("chest", true)));
    run.toggleChest("c1");
    play.mockClear();
    sent.mockClear();

    view().lootFirst();
    view().setItems([]);
    view().lootFirst();
    expect(play).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });
});

describe("BarrowspireScene other players' names, no overhead bars (FS-CH21F R13, R14)", () => {
  interface Marks {
    teammateHealthBars: Map<string, unknown>;
    otherPlayersAnim: Map<string, { crown?: number }>;
  }
  /** The name text over another player, by the name it shows. */
  const nameOf = (stage: ReturnType<typeof recordingStage>, username: string) =>
    stage.made.find((m) => m.kind === "text" && m.args[2] === username)!;
  const shown = (m: Made) => m.last.setVisible?.[0];

  it("should show another player's name over them with no hover", () => {
    const { run, stage } = onStage();
    run.handleGameStateUpdate(partyState());
    expect(shown(nameOf(stage, "Wenna"))).toBe(true);
    run.handleGameStateUpdate(partyState());
    expect(shown(nameOf(stage, "Wenna"))).toBe(true);
  });

  /** The ally on stage wearing a baked sheet with its head `crown` px over feet at y 300. */
  function bakedAlly() {
    const scene = onStage();
    scene.run.handleGameStateUpdate(partyState());
    const sprite = scene.players()[1] as Made & Record<string, number>;
    Object.assign(sprite, { x: 160, y: 300, scaleY: 1, displayOriginY: 0 });
    (scene.run as unknown as Marks).otherPlayersAnim.set("ally", { crown: 40 });
    return { ...scene, sprite };
  }

  it("should place the name at the marker base, with no bar to lift it", () => {
    const { run, stage, sprite } = bakedAlly();
    run.handleGameStateUpdate(partyState());
    const base = markerBase(sprite as never, 40, false)!;
    expect(nameOf(stage, "Wenna").last.setPosition).toEqual([160, base - 5]);
  });

  it("should lift the name clear of the bar while the bars are switched on", () => {
    const { run, stage, sprite } = bakedAlly();
    (run as unknown as { showTeammateBars: boolean }).showTeammateBars = true;
    run.handleGameStateUpdate(partyState());
    const base = markerBase(sprite as never, 40, false)!;
    const [, y] = nameOf(stage, "Wenna").last.setPosition as number[];
    expect(y).toBeLessThan(base - 5);
    expect(shown(nameOf(stage, "Wenna"))).toBe(true);
  });

  it("should let the switch alone decide: a bar left over while it is off is not drawn", () => {
    const { run, stage, sprite } = bakedAlly();
    const switchable = run as unknown as { showTeammateBars: boolean };
    switchable.showTeammateBars = true;
    run.handleGameStateUpdate(partyState());
    const bar = (run as unknown as { teammateHealthBars: Map<string, { graphics: Made }> })
      .teammateHealthBars.get("ally")!;
    const drawnBefore = bar.graphics.calls.length;

    switchable.showTeammateBars = false;
    run.handleGameStateUpdate(partyState());
    expect(bar.graphics.calls.length).toBe(drawnBefore);
    const base = markerBase(sprite as never, 40, false)!;
    expect(nameOf(stage, "Wenna").last.setPosition).toEqual([160, base - 5]);
  });

  it("should hide the name over a baked corpse", () => {
    const { run, stage } = bakedAlly();
    run.handleGameStateUpdate(partyState(undefined, player("ally", "Wenna", 160, { current_health: 0 })));
    expect(shown(nameOf(stage, "Wenna"))).toBe(false);
  });

  it("should draw no overhead bar over another living player", () => {
    const { run, stage } = onStage();
    run.handleGameStateUpdate({ ...partyState(), monsters: [] } as GameState);
    expect((run as unknown as Marks).teammateHealthBars.size).toBe(0);
    // world-space graphics framing a bar, as the overhead bars draw; the HUD's are screen-space
    const overhead = stage.made.filter(
      (m) =>
        m.kind === "graphics" &&
        !m.destroyed &&
        !m.calls.includes("setScrollFactor") &&
        m.calls.includes("fillRect") &&
        m.calls.includes("strokeRect") &&
        // a bar's rim is a 1 px line; the placeholder roofs (FS-9PN7X) are world-space rects too
        m.last.lineStyle?.[0] === 1,
    );
    expect(overhead).toHaveLength(0);
  });

  it("should leave the player's own name as it was", () => {
    const { run, stage } = onStage();
    run.handleGameStateUpdate(partyState());
    const own = nameOf(stage, "Aldric");
    expect(own).toBeDefined();
    expect(own.calls).not.toContain("setVisible");
  });
});

// FS-8AY7S req 27's bars are switched off by FS-CH21F R14, not deleted: their drawing is kept
// working with the switch on, for the day they come back.
describe("BarrowspireScene teammate health bars, switched on (FS-8AY7S req 27, 28)", () => {
  interface Bars {
    teammateHealthBars: Map<string, { graphics: Made; fill: number | null }>;
    showTeammateBars: boolean;
  }
  /** What a bar's graphics drew since it was last cleared: a drawn bar ends in its fill. */
  const drawn = (g: Made) => g.calls.slice(g.calls.lastIndexOf("clear") + 1);

  function barsOnStage() {
    const scene = onStage();
    (scene.run as unknown as Bars).showTeammateBars = true;
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

  // FS-5FZ4J §J R55 (I-5FZ4J-10)
  it("should draw a poisoned teammate's health fill in the poison tint while poisoned_for is set, and health's own after", () => {
    const { run, bar } = barsOnStage();
    run.handleGameStateUpdate(partyState(undefined, { ...player("ally", "Wenna", 160), poisoned_for: 4 } as ReturnType<typeof player>));
    expect(bar("ally")!.graphics.last.fillStyle).toEqual([palette.poisoned, 1]);
    run.handleGameStateUpdate(partyState());
    expect(bar("ally")!.graphics.last.fillStyle).toEqual([MARKER_BAR.hp, 1]);
  });

  it("should forget every bar on a restart", () => {
    const { run, bars } = barsOnStage();
    run.handleGameStateUpdate(partyState());
    (run as unknown as { resetRun(end: "shutdown" | "destroy"): void }).resetRun("shutdown");
    expect(bars.size).toBe(0);
  });
});

describe("BarrowspireScene resolved player card and spectating (FS-QPDKN req 1, 3–9, 11–12)", () => {
  /** What the scene holds for a resolved player: the card, whose eyes they watch through. */
  interface Spectating {
    otherPlayers: Map<string, unknown>;
    watchedPlayerId?: string;
    resolvedCard?: unknown;
    switcher?: unknown;
    tabKey?: unknown;
    cycleWatched(step: 1 | -1): void;
    canSendMove(): boolean;
    resetRun(end: "shutdown" | "destroy"): void;
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
    const watchButtons = () => live((t) => t === "WATCH");
    const cardTitles = () => live((t) => /barrow keeps you|out of the barrow/i.test(t));
    // the switcher's words: the watched name alone (the owner, 2026-11-14), in watchedName over its arrows
    const watching = () =>
      stage.stage.made
        .filter((m) => m.kind === "text" && !m.destroyed && isSwitcherWords(m))
        .map((m) => m.args[2]);
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

  it("should show a dead player the card with Watch the delve while the ally is still in it", () => {
    const { run, state, watchButtons, cardTitles } = resolvedOnStage(player("me", "Aldric", 130, dead));
    // the card survives the next broadcast unchanged: one card, not one per tick
    (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160)));
    expect(cardTitles()).toHaveLength(1);
    expect(String(cardTitles()[0].args[2])).toMatch(/barrow keeps you/i);
    expect(watchButtons()).toHaveLength(1);
  });

  // FS-QPDKN req 3, amended 2026-11-02 (charter): the escaped player gets no card, only the button
  describe("an escaped player with a teammate still in play (req 3, 12, amended)", () => {
    const watchHit = (stage: ReturnType<typeof resolvedOnStage>["stage"]) =>
      stage.made.find((m) => (m as { name?: string }).name === "watch-the-delve" && !m.destroyed);

    it("should show no card, only one Watch the delve button at the bottom centre, Leave beside it", () => {
      const { run, state, stage, watchButtons, cardTitles } = resolvedOnStage(
        player("me", "Aldric", 130, escaped),
      );
      (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160)));
      expect(cardTitles()).toHaveLength(0);
      expect(watchButtons()).toHaveLength(1);
      const [x, y, w, h] = watchHit(stage)!.args as number[];
      // the recording camera is 800 x 600: the first of two about the centre (Leave beside it,
      // FS-GV8WN R25), lifted 200 px off the bottom edge's margin (asked 2026-11-02, Nick); at this narrow
      // view the row starts 12 right of the open chat window (FS-TQZ5J § Change: Batch 6, R123)
      expect(x - w / 2).toBe(418);
      expect(y + h / 2).toBe(600 - 16 - 200);
      expect(w).toBeGreaterThan(0);
    });

    it("should draw the button in the HUD band, amber while it can be pressed", () => {
      const { stage } = resolvedOnStage(player("me", "Aldric", 130, escaped));
      const hit = watchHit(stage)!;
      expect(hit.last.setDepth?.[0]).toBeGreaterThanOrEqual(1000);
      expect(hit.last.setDepth?.[0]).toBeLessThan(1500);
      const face = stage.made.find(
        (m) => m.kind === "graphics" && !m.destroyed && m.last.fillStyle?.[0] === palette.interactable,
      );
      expect(face?.last.setScrollFactor).toEqual([0]);
    });

    // FS-QPDKN § Change: The party death flow and the spectate switcher, R159, R163: the switcher names them
    // over the spectate row; nothing at the top
    it("should follow a teammate in play once pressed, name them in the switcher, and take the button down", () => {
      const { run, pressWatch, followed, watching, hints, watchButtons, stage } = resolvedOnStage(
        player("me", "Aldric", 130, escaped),
        [player("ally", "Wenna", 160), player("brom", "Brom", 200)],
      );
      pressWatch();
      expect(run.watchedPlayerId).toBe("ally");
      expect(followed()).toBe(run.otherPlayers.get("ally"));
      expect(watching()).toEqual(["Wenna"]);
      expect(hints()).toHaveLength(0);
      expect(watchButtons()).toHaveLength(0);
      expect(watchHit(stage)).toBeUndefined();
      run.cycleWatched(1);
      expect(watching()).toEqual(["Brom"]);
    });

    it("should do nothing on Tab while the button is still up", () => {
      const { run, followed, own, watchButtons } = resolvedOnStage(player("me", "Aldric", 130, escaped));
      run.cycleWatched(1);
      expect(run.watchedPlayerId).toBeUndefined();
      expect(followed()).toBe(own());
      expect(watchButtons()).toHaveLength(1);
    });

    it("should show no button once nobody is left in play", () => {
      const { watchButtons } = resolvedOnStage(player("me", "Aldric", 130, escaped), [
        player("ally", "Wenna", 160, dead),
      ]);
      expect(watchButtons()).toHaveLength(0);
    });

    // FS-XWHZP R16, R23, R24 (I-XWHZP-3): a hope line, once; a first broadcast says nothing
    it("should walk the player out of the dark once, and not for an escape already on the first broadcast", () => {
      const { run, state, stage } = resolvedOnStage(player("me", "Aldric", 130, escaped));
      (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160)));
      const lines = () => stage.made.filter((m) => m.kind === "text" && /out of the dark|escaped successfully/.test(String(m.args[2])));
      expect(lines()).toHaveLength(0);
    });

    it("should forget the button on a restart, and the rebuilt run raises it again, not spectating", () => {
      const { run, stage, state } = resolvedOnStage(player("me", "Aldric", 130, escaped));
      const before = watchHit(stage)!;
      (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeCapture: vi.fn() } };

      run.resetRun("shutdown");
      expect((run as unknown as { watchButton?: unknown }).watchButton).toBeUndefined();
      expect(run.watchedPlayerId).toBeUndefined();
      expect(run.switcher).toBeUndefined();

      // Phaser destroyed the old button with the scene; the next state draws a fresh one
      before.destroyed = true;
      (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160)));
      expect(watchHit(stage)).toBeDefined();
      expect(watchHit(stage)).not.toBe(before);
      expect(run.watchedPlayerId).toBeUndefined();
    });
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
    run.cycleWatched(1);
    expect(followed()).toBe(own());
    expect(run.watchedPlayerId).toBeUndefined();
  });

  it("should follow a teammate in play once Watch is pressed, and say whose eyes in the switcher, no Tab hint (R163)", () => {
    const { run, pressWatch, followed, watching, hints, watchButtons } = resolvedOnStage(
      player("me", "Aldric", 130, dead),
    );
    pressWatch();
    expect(run.watchedPlayerId).toBe("ally");
    expect(followed()).toBe(run.otherPlayers.get("ally"));
    expect(watching()).toEqual(["Wenna"]);
    expect(hints()).toHaveLength(0);
    expect(watchButtons()).toHaveLength(0);
  });

  // FS-QPDKN § Change: The party death flow and the spectate switcher, R159, as the owner restyled it on 2026-11-14
  // (「樣式可以不用加底色 直接顯示黃色名字」): the name in bright brass with no backing, never amber
  it("should letter the switcher's name in the watched name's bright brass with no backing, never amber", () => {
    const { stage, pressWatch, watching } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    expect(watching()).toEqual(["Wenna"]);
    const name = stage.made.find((m) => m.kind === "text" && !m.destroyed && isSwitcherWords(m))!;
    const style = name.args[3] as { color?: string; backgroundColor?: string };
    expect(style.color).toBe(toCss(palette.watchedName));
    expect(style.color).not.toBe(toCss(palette.interactable));
    expect(style.backgroundColor).toBeUndefined();
    const backing = stage.made.find(
      (m) => m.kind === "graphics" && !m.destroyed && m.calls.includes("fillRoundedRect") && m.calls.includes("fillTriangle"),
    );
    expect(backing).toBeUndefined();
  });

  it("should cycle the watched player on Tab, never through the player's own body", () => {
    const { run, pressWatch, followed, own, watching } = resolvedOnStage(player("me", "Aldric", 130, dead), [
      player("ally", "Wenna", 160),
      player("brom", "Brom", 200),
    ]);
    pressWatch();
    expect(watching()).toEqual(["Wenna"]);
    const seen: (string | undefined)[] = [run.watchedPlayerId];
    for (let i = 0; i < 3; i++) {
      run.cycleWatched(1);
      seen.push(run.watchedPlayerId);
      expect(followed()).toBe(run.otherPlayers.get(run.watchedPlayerId!));
      expect(followed()).not.toBe(own());
    }
    expect(seen).toEqual(["ally", "brom", "ally", "brom"]);
    expect(watching()).toEqual(["Brom"]);
  });

  it("should keep watching the one teammate in play on Tab", () => {
    const { run, pressWatch, watching } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    run.cycleWatched(1);
    expect(run.watchedPlayerId).toBe("ally");
    expect(watching()).toEqual(["Wenna"]);
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
    expect(watching()).toEqual(["Brom"]);
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
    (run as unknown as FloorRun).endRun();
    expect(watchButtons()).toHaveLength(0);
    (run as unknown as FloorRun).handleGameStateUpdate(state(player("ally", "Wenna", 160)));
    expect(watchButtons()).toHaveLength(0);
  });

  it("should take the spectate HUD down when end_game arrives", () => {
    const { run, pressWatch, watching, hints } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    (run as unknown as FloorRun).endRun();
    expect(watching()).toEqual([]);
    expect(hints()).toHaveLength(0);
  });

  it("should forget the watched player, the follow, the Tab key, the card and the HUD on a restart", () => {
    const { run, pressWatch } = resolvedOnStage(player("me", "Aldric", 130, dead));
    pressWatch();
    const removeCapture = vi.fn();
    run.tabKey = { keyCode: 9 };
    (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeCapture } };

    run.resetRun("shutdown");

    // Phaser's stop has destroyed the key already; the capture is handed back by its code
    expect(removeCapture).toHaveBeenCalledWith(expect.arrayContaining([9]));
    expect(run.tabKey).toBeUndefined();
    expect(run.watchedPlayerId).toBeUndefined();
    expect(run.resolvedCard).toBeUndefined();
    expect(run.switcher).toBeUndefined();
  });
});

// FS-QPDKN req 24 keeps an escaped player's own state coming, with `escape: true`, where it used to
// stop (`current_player: null`): their body stays hidden either way (I-QPDKN-7)
describe("BarrowspireScene the escaped player's own body (FS-QPDKN req 3, 24)", () => {
  /** A run with effects to record, and the player's own sprite, legs and name as drawn. */
  function ownBodyOnStage() {
    const stage = onStage();
    const play = vi.fn();
    Object.assign(stage.run, { fx: { play, release: vi.fn() } });
    const own = () => stage.players()[0];
    const legs = () => (stage.run as unknown as { playerLegs: Made }).playerLegs;
    const name = () => stage.stage.made.find((m) => m.kind === "text" && m.args[2] === "Aldric")!;
    const hidden = () => [own(), legs(), name()].map((m) => m.last.setVisible?.[0]);
    const escapes = () => play.mock.calls.filter(([owner, kind]) => owner === "self" && kind === "escape");
    return { ...stage, own, hidden, escapes };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["sent with escape: true", player("me", "Aldric", 130, { escape: true })],
    ["no longer sent", null],
  ])("should hide the player's sprite, legs and name once their own state is %s", (_, after) => {
    const { run, hidden, escapes } = ownBodyOnStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130)));
    expect(hidden()).toEqual([undefined, undefined, undefined]);

    run.handleGameStateUpdate(partyState(after));
    run.handleGameStateUpdate(partyState(after));

    expect(hidden()).toEqual([false, false, false]);
    expect(escapes()).toHaveLength(1);
  });

  it("should draw an escaped player who reconnects hidden, with no escape played again", () => {
    const { run, hidden, escapes } = ownBodyOnStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, { escape: true })));
    expect(hidden()).toEqual([false, false, false]);
    expect(escapes()).toHaveLength(0);
  });
});

describe("BarrowspireScene leave the barrow (FS-QPDKN req 2, 10, 13, 14; edge state: Leaving)", () => {
  /** What the scene holds for a dead player's way out. */
  interface Leaving {
    leavePending: boolean;
    leaveButton?: unknown;
    runEnded?: boolean;
    leaveRefused(): void;
    resetRun(end: "shutdown" | "destroy"): void;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };

  function leavingOnStage(me: ReturnType<typeof player>) {
    const stage = onStage();
    const run = stage.run as unknown as Leaving;
    stage.run.handleGameStateUpdate(partyState(me));
    const live = (test: (content: string) => boolean) =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed && test(String(m.args[2])));
    // the owner's words (FS-TQZ5J § Change: Batch 6, R120)
    const leaveLabels = () => live((t) => t === "LEAVE");
    const watchLabels = () => live((t) => t === "WATCH");
    const hit = (name: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
    const press = (name: string) => hit(name)?.handlers.pointerdown();
    const leavesSent = () => stage.sent.mock.calls.filter(([action]) => action === ActionType.LeaveRun);
    // the UI scene's one player, by which a dimmed Leave says no (FS-WDM0X § Pass 2b E6)
    const heard = hearOn(stage.run as unknown as Record<string, unknown>);
    return { ...stage, run, leaveLabels, watchLabels, hit, press, leavesSent, heard };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // FS-TQZ5J § Change: Batch 6, R120–R124: WATCH, LEAVE, SETTLEMENT in 13 px bold letter-spaced 1, each
  // button its label's width plus 24 a side; the row from 418 at this 800-wide view (layout B), the card's
  // two centred on it 8 apart, the corner LEAVE's right edge on the corner margin
  describe("the run's buttons, re-laid off the chat (FS-TQZ5J § Change: Batch 6, R120–R124)", () => {
    const labelled = (stage: ReturnType<typeof leavingOnStage>, words: string) =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed && m.args[2] === words);
    const box = (stage: ReturnType<typeof leavingOnStage>, name: string) => {
      const [x, y, width, height] = stage.hit(name)!.args as number[];
      return { left: x - width / 2, x, y, width, height };
    };

    it("should word the escaped player's row WATCH and LEAVE in 13 px bold, letter-spaced 1 (R120, R121)", () => {
      const out = leavingOnStage(player("me", "Aldric", 130, escaped));
      for (const words of ["WATCH", "LEAVE"]) {
        const [label] = labelled(out, words);
        expect(label, words).toBeDefined();
        expect(label.args[3]).toMatchObject({ fontSize: "13px", fontStyle: "bold", letterSpacing: 1 });
      }
      expect(labelled(out, "WATCH THE DELVE")).toHaveLength(0);
      expect(labelled(out, "LEAVE THE BARROW")).toHaveLength(0);
    });

    it("should make each button its label's width plus 24 a side, and stand the row from 418 at this view (R122, R123)", () => {
      const out = leavingOnStage(player("me", "Aldric", 130, escaped));
      const watch = box(out, "watch-the-delve");
      const leave = box(out, "leave-the-barrow");
      expect([watch.width, leave.width]).toEqual([104, 94]);
      expect([watch.left, leave.left]).toEqual([418, 530]);
      expect([watch.height, leave.height]).toEqual([38, 38]);
    });

    it("should centre the dead player's card buttons on the card, 8 apart, worded WATCH and LEAVE (R120, R124)", () => {
      const fallen = leavingOnStage(player("me", "Aldric", 130, dead));
      const watch = box(fallen, "watch-the-delve");
      const leave = box(fallen, "leave-the-barrow");
      expect([watch.width, leave.width]).toEqual([104, 94]);
      expect([watch.left, leave.left]).toEqual([400 - 103, 400 + 9]);
      expect(labelled(fallen, "WATCH")).toHaveLength(1);
      expect(labelled(fallen, "LEAVE")).toHaveLength(1);
    });

    // FS-QPDKN § Change: The party death flow and the spectate switcher, R158: the corner LEAVE folds into the
    // spectate row, its bottom 70 above the view's bottom, from 418 at this 800-wide view
    it("should stand the dead spectator's LEAVE in the spectate row, not in the corner (R158)", () => {
      const fallen = leavingOnStage(player("me", "Aldric", 130, dead));
      fallen.press("watch-the-delve");
      const leave = box(fallen, "leave-the-barrow");
      expect(leave.width).toBe(94);
      expect(leave.left).toBe(418);
      expect(leave.y + leave.height / 2).toBe(600 - 70);
      expect(labelled(fallen, "LEAVE")).toHaveLength(1);
    });
  });

  it("should give the dead player and the escaped player Leave the barrow beside Watch the delve", () => {
    const fallen = leavingOnStage(player("me", "Aldric", 130, dead));
    expect(fallen.watchLabels()).toHaveLength(1);
    expect(fallen.leaveLabels()).toHaveLength(1);

    // FS-GV8WN R25: the escaped may leave too
    const out = leavingOnStage(player("me", "Aldric", 130, escaped));
    expect(out.watchLabels()).toHaveLength(1);
    expect(out.leaveLabels()).toHaveLength(1);
  });

  it("should send leave_run once, with no payload, and nothing on a second press before the answer", () => {
    const { press, leavesSent, heard } = leavingOnStage(player("me", "Aldric", 130, dead));
    heard();
    press("leave-the-barrow");
    press("leave-the-barrow");

    expect(leavesSent()).toEqual([[ActionType.LeaveRun, {}]]);
    // dimmed, it takes the second press only to say no (FS-WDM0X § Pass 2b E6)
    expect(heard()).toEqual(["menu_click", "menu_error"]);
  });

  it("should hand the button back when the server refuses, with the card up", () => {
    const { run, press, leavesSent, leaveLabels, heard } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("leave-the-barrow");

    run.leaveRefused();

    expect(run.leavePending).toBe(false);
    expect(leaveLabels()).toHaveLength(1);
    heard();
    press("leave-the-barrow");
    expect(leavesSent()).toHaveLength(2);
    // live again: an ordinary press (FS-WDM0X § Pass 2b E5)
    expect(heard()).toEqual(["menu_click"]);
  });

  it("should ignore a refusal once the run has ended: it ended first", () => {
    const { run, press, leaveLabels } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("leave-the-barrow");
    (run as unknown as FloorRun).endRun();

    run.leaveRefused();

    expect(run.leavePending).toBe(true);
    expect(leaveLabels()).toHaveLength(0);
  });

  it("should keep the dead spectator's LEAVE in the spectate row at the bottom, under the watched player", () => {
    const { run, press, hit, leaveLabels, leavesSent } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("watch-the-delve");

    expect(leaveLabels()).toHaveLength(1);
    const [, y, , h] = hit("leave-the-barrow")!.args as number[];
    // the recording camera is 800 x 600; the watched player sits at the centre
    expect(y - h / 2).toBeGreaterThan(300 + 100);
    expect(y + h / 2).toBe(600 - 70);
    press("leave-the-barrow");
    expect(leavesSent()).toHaveLength(1);
    expect(run.leavePending).toBe(true);
  });

  it("should stand the escaped spectator's Leave in the spectate row, as every spectator's (R158)", () => {
    const { press, leaveLabels, hit } = leavingOnStage(player("me", "Aldric", 130, escaped));
    press("watch-the-delve");
    expect(leaveLabels()).toHaveLength(1);
    // the recording camera is 800 x 600: alone in the row, 12 right of the open chat window at this narrow
    // view (FS-TQZ5J § Change: Batch 6, R123), its bottom 70 above the view's (FS-QPDKN § Change: The party
    // death flow and the spectate switcher, R158)
    const [x, y, w, h] = hit("leave-the-barrow")!.args as number[];
    expect(x - w / 2).toBe(418);
    expect(y + h / 2).toBe(600 - 70);
  });

  // FS-GV8WN R25: the escaped player's Leave, beside Watch in the bottom-centre row
  describe("an escaped player's Leave (FS-GV8WN R25)", () => {
    it("should stand beside Watch the delve, the two 8 apart on one line", () => {
      const { hit } = leavingOnStage(player("me", "Aldric", 130, escaped));
      const watch = hit("watch-the-delve")!.args as number[];
      const leave = hit("leave-the-barrow")!.args as number[];
      // left to right, 8 apart (FS-TQZ5J § Change: Batch 6, R123)
      expect(leave[0] - leave[2] / 2).toBe(watch[0] + watch[2] / 2 + 8);
      expect(leave[1]).toBe(watch[1]);
    });

    it("should send leave_run once, as the dead player's does, and dim until the answer", () => {
      const { run, press, leavesSent, heard } = leavingOnStage(player("me", "Aldric", 130, escaped));
      heard();
      press("leave-the-barrow");
      press("leave-the-barrow");

      expect(leavesSent()).toEqual([[ActionType.LeaveRun, {}]]);
      expect(run.leavePending).toBe(true);
      // dimmed, it takes the second press only to say no (FS-WDM0X § Pass 2b E6)
      expect(heard()).toEqual(["menu_click", "menu_error"]);
    });

    it("should come back dimmed when the row is redrawn while the leave is pending", () => {
      const { run, press, hit, leavesSent, heard } = leavingOnStage(player("me", "Aldric", 130, escaped));
      press("leave-the-barrow");
      const first = hit("leave-the-barrow");
      // the last teammate falls: Watch goes, and the row is drawn again around Leave alone
      (run as unknown as FloorRun).handleGameStateUpdate(
        partyState(player("me", "Aldric", 130, escaped), player("ally", "Wenna", 160, dead)),
      );
      const redrawn = hit("leave-the-barrow")!;
      expect(redrawn).not.toBe(first);
      heard();
      press("leave-the-barrow");
      expect(leavesSent()).toHaveLength(1);
      // drawn dimmed: the press says no (FS-WDM0X § Pass 2b E6)
      expect(heard()).toEqual(["menu_error"]);
    });

    it("should hand the button back on a refusal and keep the player in the run", () => {
      const { run, press, leavesSent, leaveLabels, watchLabels, heard } = leavingOnStage(
        player("me", "Aldric", 130, escaped),
      );
      press("leave-the-barrow");

      run.leaveRefused();

      expect(run.leavePending).toBe(false);
      expect(leaveLabels()).toHaveLength(1);
      expect(watchLabels()).toHaveLength(1);
      heard();
      press("leave-the-barrow");
      expect(leavesSent()).toHaveLength(2);
      // live again: an ordinary press (FS-WDM0X § Pass 2b E5)
      expect(heard()).toEqual(["menu_click"]);
    });

    it("should show Leave without Watch once no teammate is left in play", () => {
      const { run, leaveLabels, watchLabels, hit } = leavingOnStage(player("me", "Aldric", 130, escaped));
      (run as unknown as FloorRun).handleGameStateUpdate(
        partyState(player("me", "Aldric", 130, escaped), player("ally", "Wenna", 160, dead)),
      );
      expect(watchLabels()).toHaveLength(0);
      expect(leaveLabels()).toHaveLength(1);
      expect((hit("leave-the-barrow")!.args as number[])[0]).toBe(418 + 94 / 2);
    });

    it("should keep Leave once the broadcast no longer sends an escaped player's own state", () => {
      const { run, leaveLabels } = leavingOnStage(player("me", "Aldric", 130, escaped));
      expect(leaveLabels()).toHaveLength(1);
      (run as unknown as FloorRun).handleGameStateUpdate(partyState(null));
      expect(leaveLabels()).toHaveLength(1);
    });

    // a transient null own state is not an escape: Leave stands only once the player was seen escaped
    it("should give no Leave to a player never seen escaped when their own state goes missing", () => {
      const { run, leaveLabels } = leavingOnStage(player("me", "Aldric", 130));
      (run as unknown as FloorRun).handleGameStateUpdate(partyState(null));
      expect(leaveLabels()).toHaveLength(0);
      (run as unknown as FloorRun).handleGameStateUpdate(partyState(player("me", "Aldric", 130)));
      expect(leaveLabels()).toHaveLength(0);
    });

    it("should forget the escape on a restart, so the next run starts with no Leave", () => {
      const { run, stage } = leavingOnStage(player("me", "Aldric", 130, escaped));
      (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeCapture: vi.fn() } };
      run.resetRun("shutdown");
      // the old run's buttons went down with the scene; only what is drawn after the reset counts
      const before = stage.made.length;
      (run as unknown as FloorRun).handleGameStateUpdate(partyState(null));
      const drawn = stage.made.slice(before);
      expect(drawn.some((m) => m.kind === "text" && String(m.args[2]) === "LEAVE")).toBe(false);
    });

    it("should give a player still in the delve no Leave", () => {
      const { leaveLabels } = leavingOnStage(player("me", "Aldric", 130));
      expect(leaveLabels()).toHaveLength(0);
    });

    it("should take the button down when end_game arrives", () => {
      const { run, leaveLabels, hit } = leavingOnStage(player("me", "Aldric", 130, escaped));
      (run as unknown as FloorRun).endRun();
      expect(leaveLabels()).toHaveLength(0);
      expect(hit("leave-the-barrow")).toBeUndefined();
    });
  });

  it("should take the corner button down with the spectate HUD when end_game arrives", () => {
    const { run, press, leaveLabels, hit } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("watch-the-delve");
    (run as unknown as FloorRun).endRun();

    expect(leaveLabels()).toHaveLength(0);
    expect(hit("leave-the-barrow")).toBeUndefined();
    expect(run.leaveButton).toBeUndefined();
  });

  it("should forget the button, the pending send and the refusal listener on a restart", () => {
    const offError = vi.spyOn(socketManager, "offError");
    const off = vi.spyOn(socketManager, "off");
    const { run, press } = leavingOnStage(player("me", "Aldric", 130, dead));
    press("leave-the-barrow");
    (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeCapture: vi.fn() } };

    run.resetRun("shutdown");

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

  it("should show Health: and Mana: at the very top left in a run, in the body serif", () => {
    const { run, cam, labels, label } = barsOnStage();
    run.handleGameStateUpdate(withMe(me()));
    expect(labels()).toEqual(["Health:", "Mana:"]);
    for (const name of ["Health:", "Mana:"]) {
      const text = label(name)!;
      expect(text.args[0] as number).toBeLessThan(cam.width / 2);
      expect(text.args[1] as number).toBeLessThan(cam.height / 2);
      expect(text.args[1] as number).toBeGreaterThanOrEqual(RESOURCE_HUD_AT.run.y);
      expect((text.args[3] as { fontFamily?: string }).fontFamily).toBe(CANVAS_FONT.body);
    }
    // the resource bar sits under the health bar
    expect(label("Mana:")!.args[1] as number).toBeGreaterThan(label("Health:")!.args[1] as number);
  });

  // FS-5FZ4J §J R55 (I-5FZ4J-10)
  it("should hand the HUD the health bar poisoned while poisoned_for is set, and plain once it runs out", () => {
    const { run } = barsOnStage();
    const hud = vi.spyOn((run as unknown as { ui: { hud(m: unknown): void } }).ui, "hud");
    const healthOf = () => {
      const bars = hud.mock.calls.map(([m]) => m as { kind: string; bars?: { channel: string; poisoned?: boolean }[] }).filter((m) => m.kind === "bars");
      return bars.at(-1)?.bars?.find((b) => b.channel === "health");
    };
    run.handleGameStateUpdate(withMe({ ...me(), poisoned_for: 3 } as ReturnType<typeof me>));
    expect(healthOf()?.poisoned).toBe(true);
    run.handleGameStateUpdate(withMe(me()));
    expect(healthOf()?.poisoned).toBeUndefined();
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

  // the owner, 2026-11-14: 「左上角的個人血量魔量不用隱藏 就顯示死亡時的狀態就好了」 (FS-QPDKN § Change: The party
  // death flow and the spectate switcher, R168): the bars stay up, frozen at the state that showed the player out
  describe("out of the delve, frozen (FS-QPDKN § Change: The party death flow and the spectate switcher, R168; I-QPDKN-14)", () => {
    type HudMessage = import("@/ui/uiSceneHud").HudMessage;
    type Bar = { channel: string; fill: number };
    function heardHud(run: object) {
      const told: HudMessage[] = [];
      uiSceneOn(run, "run", { row: false }).bridge.onScreen({ hud: (m) => void told.push(m) });
      const last = <K extends HudMessage["kind"]>(kind: K) =>
        told.filter((m): m is Extract<HudMessage, { kind: K }> => m.kind === kind).at(-1);
      const bars = () => ((last("bars") as { bars?: Bar[] } | undefined)?.bars ?? []).map((b) => [b.channel, b.fill]);
      const bar = () => (last("bar") as { bar?: unknown } | undefined)?.bar;
      return { bars, bar };
    }
    const potion = { item_id: "p1", entity_id: "ep1", name: "Lesser Heal Potion", quantity: 1, item_type: "consumable", healing_amount: 25 };
    const carrying = (n: number) => ({ consumable_1: n > 0 ? potion : null, consumable_2: n > 1 ? potion : null, consumable_3: null });

    it.each([
      ["dies", { current_health: 0 }, [["health", 0], ["mana", 0.25]]],
      ["escapes", { escape: true, current_health: 70 }, [["health", 0.7], ["mana", 0.25]]],
    ] as const)("should keep the bars up when the player %s, as that state drew them", (_, fields, want) => {
      const { run, labels } = barsOnStage();
      const hud = heardHud(run);
      run.handleGameStateUpdate(withMe(me()));
      run.handleGameStateUpdate(withMe(me(fields)));
      expect(labels()).toEqual(["Health:", "Mana:"]);
      expect(hud.bars()).toEqual(want);
      // later states, whatever they say, change nothing
      run.handleGameStateUpdate(withMe(me({ ...fields, resource: { ...mana, current: 120 } })));
      expect(labels()).toEqual(["Health:", "Mana:"]);
      expect(hud.bars()).toEqual(want);
    });

    it("should keep them frozen through a state that drops the escaped player's own", () => {
      const { run, labels } = barsOnStage();
      const hud = heardHud(run);
      run.handleGameStateUpdate(withMe(me()));
      run.handleGameStateUpdate(withMe(me({ escape: true })));
      run.handleGameStateUpdate({ ...floorState(1), current_player: null, other_players: [player("ally", "Wenna", 160)] } as GameState);
      expect(labels()).toEqual(["Health:", "Mana:"]);
      expect(hud.bars()).toEqual([["health", 1], ["mana", 0.25]]);
    });

    it("should keep the player's own while they watch a teammate", () => {
      const { run, stage } = barsOnStage();
      const hud = heardHud(run);
      run.handleGameStateUpdate(withMe(me()));
      run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
      stage.made.find((m) => (m as { name?: string }).name === "watch-the-delve" && !m.destroyed)?.handlers.pointerdown();
      expect((run as unknown as { watchedPlayerId?: string }).watchedPlayerId).toBe("ally");
      run.handleGameStateUpdate(withMe(me({ current_health: 0 }), { ...player("ally", "Wenna", 160), current_health: 40 }));
      expect(hud.bars()).toEqual([["health", 0], ["mana", 0.25]]);
    });

    // FS-Q18Q3 R30: the ability bar is held with them, every square greyed, its potion count kept
    it("should keep the ability bar with them, held greyed with its count", () => {
      const { run } = barsOnStage();
      const hud = heardHud(run);
      run.handleGameStateUpdate(withMe({ ...me(), equipment: carrying(2) } as never));
      run.handleGameStateUpdate(withMe({ ...me({ current_health: 0 }), equipment: carrying(2) } as never));
      const atDeath = hud.bar();
      expect(atDeath).toMatchObject({ potion: { count: 2, greyed: true }, ability: { greyed: true, active: false } });
      run.handleGameStateUpdate(withMe({ ...me({ current_health: 0 }), equipment: carrying(0) } as never));
      expect(hud.bar()).toEqual(atDeath);
    });

    it("should build them afresh, unfrozen, after a restart", () => {
      const { run } = barsOnStage();
      const hud = heardHud(run);
      run.handleGameStateUpdate(withMe(me()));
      run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
      (run as unknown as { resetRun(end: "shutdown" | "destroy"): void }).resetRun("shutdown");
      run.handleGameStateUpdate(withMe(me({ current_health: 50 })));
      expect(hud.bars()).toEqual([["health", 0.5], ["mana", 0.25]]);
    });
  });

  it("should draw no bar over the player's own head, health or resource", () => {
    const { run, stage } = barsOnStage();
    /**
     * World-space graphics framing a bar (a filled, stroked rect), as the overhead bars draw. Not
     * one laid on a world plane: a room's placeholder cap is a framed slab too (FS-9PN7X §B.7).
     */
    // (a container holds its children behind their proxies: the same records, by their calls)
    const onPlanes = () =>
      new Set(stage.made.flatMap((m) => (m.kind === "container" ? m.children.map((c) => c.calls) : [])));
    const overheadBars = () =>
      stage.made.filter(
        (m) =>
          m.kind === "graphics" &&
          !m.destroyed &&
          !onPlanes().has(m.calls) &&
          !m.calls.includes("setScrollFactor") &&
          m.calls.includes("fillRect") &&
          m.calls.includes("strokeRect"),
      );
    const alone = (ally?: ReturnType<typeof player>) =>
      ({ ...withMe(me()), other_players: ally ? [ally] : [], monsters: [] }) as GameState;

    run.handleGameStateUpdate(alone());
    expect(overheadBars()).toHaveLength(0);
    // the same probe finds a teammate's bar (switched on, FS-CH21F R14), so the empty answer
    // above is not vacuous
    (run as unknown as { showTeammateBars: boolean }).showTeammateBars = true;
    run.handleGameStateUpdate(alone(player("ally", "Wenna", 160)));
    expect(overheadBars()).toHaveLength(1);
  });

  it("should build the bars afresh after a restart", () => {
    const { run, labels } = barsOnStage();
    run.handleGameStateUpdate(withMe(me()));
    (run as unknown as { resetRun(end: "shutdown" | "destroy"): void }).resetRun("shutdown");
    run.handleGameStateUpdate(withMe(me()));
    expect(labels().filter((l) => l === "Health:").length).toBeGreaterThanOrEqual(1);
  });
});

describe("BarrowspireScene ability bar (FS-Q18Q3 §E, §G, §L)", () => {
  type Resource = { kind: string; current: number; max: number; ability_cost: number; tree_ability_cost?: number };
  type Cooldown = { remaining: number; total: number };
  const stamina = (current: number): Resource => ({ kind: "stamina", current, max: 100, ability_cost: 25 });
  const me = (
    fields: {
      class?: string;
      resource?: Resource;
      escape?: boolean;
      current_health?: number;
      ability_cooldown?: Cooldown;
      passive_ranks?: Record<string, number>;
      tree_ability_cooldown?: Cooldown;
    } = {},
  ) => ({
    ...player("me", "Aldric", 130),
    resource: stamina(100),
    ...fields,
  });
  const withMe = (self: ReturnType<typeof me>): GameState =>
    ({ ...floorState(1), current_player: self, other_players: [player("ally", "Wenna", 160)] }) as GameState;

  interface Carded {
    leaveButton?: unknown;
    bindRunInput(): void;
    resetRun(end: "shutdown" | "destroy"): void;
  }

  function barOnStage() {
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
    const live = () => stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed);
    /** The live text showing `words` now (the stage keeps a text's content as it is set). */
    const said = (words: string) => live().find((m) => m.args[2] === words);
    const shown = () => barShownOver(carded);
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
    return { ...stage, carded, cam, live, said, shown, rightClick, delayed };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["warrior", "dash"],
    ["mage", "triple_fireball"],
    ["archer", "shadow_shot"],
    ["mercenary", "parry"],
  ])("should show the %s's ability on the bar at the bottom middle in a run", (cls, icon) => {
    const { run, cam, said, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ class: cls })));
    expect(shown()?.ability.icon).toBe(icon);
    // the locked 3 square's "Lv 10", under the bar's right square, low on the screen and right of centre
    const locked = said("Lv 10")!;
    expect(locked).toBeDefined();
    expect(locked.last.setPosition[0] as number).toBeGreaterThan(cam.width / 2);
    expect(locked.last.setPosition[0] as number).toBeLessThan(cam.width / 2 + 100);
    expect(locked.last.setPosition[1] as number).toBeGreaterThan(cam.height / 2);
  });

  it.each([1, 2])(
    "should put the bar back over the XP bar and the escaped count at its corner when the view widens, at render scale %s (FS-Q18Q3 R10; FS-ZAJMH R12, R13)",
    (renderScale) => {
      const { run, said, live } = barOnStage();
      const hud = run as unknown as { createUI(): void; relayoutHud(): void };
      // the satchel's own re-layout is ContainerView's test
      Object.assign((run as unknown as { containerView: object }).containerView, { relayout: vi.fn() });
      hud.createUI();
      run.handleGameStateUpdate(withMe(me()));
      const locked = said("Lv 10")!;
      const lockedX = locked.last.setPosition[0] as number;
      const escaped = live().find((m) => m.args[2] === "Escaped: 0") as Made;
      expect(escaped.args[0]).toBe(800 - 10);

      // the harness's view is 800 wide; 200 more, as from 1080 to 1280
      viewport.set({ width: 1000, height: 600, renderScale });
      hud.relayoutHud();
      // the bar is the UI scene's, back over the XP bar on the UI scene's own relayout (FS-TQZ5J § Change: Batch 5, R73)
      hudOver(run, "run").relayout();
      expect(locked.last.setPosition[0]).toBe(lockedX + 100);
      expect(escaped.last.setX).toEqual([1000 - 10]);
      // moved, so rasterised again at the render scale of now (R5)
      expect(escaped.last.setResolution).toEqual([renderScale]);
      expect(locked.last.setResolution).toEqual([renderScale]);
      viewport.set({ width: 800, height: 600, renderScale: 1 });
    },
  );

  it("should grey the right-click square with the pool one short of the cost, and light it at the cost", () => {
    const { run, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ resource: stamina(24) })));
    expect(shown()?.ability.greyed).toBe(true);
    run.handleGameStateUpdate(withMe(me({ resource: stamina(25) })));
    expect(shown()?.ability.greyed).toBe(false);
  });

  it("should show the square lit with no resource on the wire, and no cost", () => {
    const { run, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ resource: undefined })));
    expect(shown()?.ability).toMatchObject({ icon: "dash", greyed: false, cost: null });
  });

  it("should grey it while the server's cooldown runs, and light it once it is over (FS-Q18Q3 R22)", () => {
    const { run, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ ability_cooldown: { remaining: 0.3, total: 0.4 } })));
    expect(shown()?.ability.greyed).toBe(true);
    run.handleGameStateUpdate(withMe(me({ ability_cooldown: { remaining: 0, total: 0 } })));
    expect(shown()?.ability.greyed).toBe(false);
  });

  it("should grey it for the lockout after a right-click, and light it once the lockout ends", () => {
    const { run, carded, sent, shown, rightClick, delayed } = barOnStage();
    run.handleGameStateUpdate(withMe(me()));
    carded.bindRunInput();
    rightClick();
    expect(sent.mock.calls.some(([action]) => action === ActionType.CastSkill)).toBe(true);
    expect(shown()?.ability.greyed).toBe(true);

    const lockout = delayed().find(([ms]) => ms === 400);
    lockout![1]();
    expect(shown()?.ability.greyed).toBe(false);
  });

  it("should draw an empty well for a class with no row, the bar up (FS-Q18Q3 R27)", () => {
    const { run, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ class: "necromancer" })));
    expect(shown()?.ability.icon).toBeNull();
  });

  it("should show no bar in the hub", () => {
    const { run, shown, said } = barOnStage();
    run.handleGameStateUpdate({ ...withMe(me()), world_type: "hub" } as GameState);
    expect(shown()).toBeNull();
    expect(said("Lv 10")).toBeUndefined();
  });

  it("should show no bar before the first state", () => {
    const { shown } = barOnStage();
    expect(shown()).toBeNull();
  });

  // FS-Q18Q3 R30 (FS-QPDKN R168): out of the delve the bar is held with the bars, every square greyed
  it.each([
    ["dies", { current_health: 0 }],
    ["escapes", { escape: true }],
  ])("should hold the bar greyed when the player %s, nothing active and no sweep", (_, fields) => {
    const { run, shown, said } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ ability_cooldown: { remaining: 0.2, total: 0.4 } })));
    run.handleGameStateUpdate(withMe(me({ ...fields, ability_cooldown: { remaining: 0.2, total: 0.4 } })));
    expect(shown()).toMatchObject({
      potion: { greyed: true },
      ability: { icon: "dash", greyed: true, active: false, cost: 25 },
      cooldowns: { ability: null, tree: null },
    });
    expect(said("Lv 10")).toBeDefined();
  });

  // FS-Q18Q3 R26, R40: the held 3 square rides the run's bar message, greyed by cost and cooldown by the
  // gate key 3's send reads, and held greyed with the rest at a death (R30)
  describe("the held 3 square (FS-Q18Q3 R26)", () => {
    const holding = (fields: Parameters<typeof me>[0] = {}) =>
      me({
        passive_ranks: { "warrior.t3": 1 },
        tree_ability_cooldown: { remaining: 0, total: 8 },
        resource: { ...stamina(100), tree_ability_cost: 40 },
        ...fields,
      });

    it("should send the warrior's Earthbreaker with its cost once tree_ability_cooldown is on the wire, the padlock gone", () => {
      const { run, shown, said } = barOnStage();
      run.handleGameStateUpdate(withMe(holding()));
      expect(shown()?.tree).toEqual({ locked: false, ability: "earthbreaker", greyed: false, cost: 40 });
      expect(shown()?.cooldowns.tree).toEqual({ remaining: 0, total: 8 });
      expect(said("Lv 10")).toBeUndefined();
      expect(said("40")).toBeDefined();
    });

    it.each([
      ["short of its cost", { resource: { ...stamina(30), tree_ability_cost: 40 } }],
      ["cooling down", { tree_ability_cooldown: { remaining: 3, total: 8 } }],
    ])("should grey it %s", (_, fields) => {
      const { run, shown } = barOnStage();
      run.handleGameStateUpdate(withMe(holding(fields)));
      expect(shown()?.tree).toMatchObject({ locked: false, greyed: true, cost: 40 });
    });

    it("should hold it greyed with the rest at a death mid-cooldown, no sweep", () => {
      const { run, shown } = barOnStage();
      run.handleGameStateUpdate(withMe(holding({ tree_ability_cooldown: { remaining: 3, total: 8 } })));
      run.handleGameStateUpdate(withMe(holding({ current_health: 0, tree_ability_cooldown: { remaining: 3, total: 8 } })));
      expect(shown()?.tree).toEqual({ locked: false, ability: "earthbreaker", greyed: true, cost: 40 });
      expect(shown()?.cooldowns.tree).toBeNull();
    });
  });

  it("should hand the bar to the UI scene, then tell the badge it is live, and build none (FS-Q18Q3 R40–R42)", () => {
    const { run, carded } = barOnStage();
    const told: string[] = [];
    uiSceneOn(run, "run", { row: false }).bridge.onScreen({
      hud: (message) =>
        void (message.kind === "bar" && told.push(`bar ${message.bar === null ? "none" : message.bar.ability.greyed ? "grey" : "lit"}`)),
      abilityBar: (live) => void told.push(`live ${live}`),
    });
    run.handleGameStateUpdate(withMe(me()));
    run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
    expect(told).toEqual(["bar lit", "live true", "bar grey", "live false"]);
    expect((carded as unknown as Record<string, unknown>).abilityBar).toBeUndefined();
  });

  it("should hand the bar as plain data, no ability card and no potion cell (FS-Q18Q3 R34, R35, R40)", () => {
    const { run } = barOnStage();
    const kinds: string[] = [];
    let bar: unknown;
    uiSceneOn(run, "run", { row: false }).bridge.onScreen({
      hud: (message) => {
        kinds.push(message.kind);
        if (message.kind === "bar") bar = message.bar;
      },
    });
    run.handleGameStateUpdate(withMe(me()));
    expect(kinds).toContain("bar");
    // the status marks beside the health bar are the HUD's too (FS-5FZ4J §J R55)
    expect(kinds.filter((k) => !["bars", "bar", "progress", "statusMarks"].includes(k))).toEqual([]);
    expect(JSON.parse(JSON.stringify(bar))).toEqual(bar);
    expect(bar).toMatchObject({ potion: { count: 0, greyed: true } });
  });

  // FS-QPDKN § Change: The party death flow and the spectate switcher, R158: the dead spectator's LEAVE is the
  // spectate row's; nothing takes the old card's corner
  it("should give the dead spectator no corner LEAVE", () => {
    const { run, live } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
    (run as unknown as { startWatching(): void }).startWatching();
    const labels = live().filter((m) => m.args[2] === "LEAVE");
    expect(labels).toHaveLength(1);
    expect(labels[0].args[0]).toBeLessThan(viewport.width - 16 - 94 / 2);
  });

  // FS-3EBCA R10, now FS-TQZ5J R7, R15: a press on the corner row is the UI scene's, above the run,
  // and never reaches it, so the run's click path reads no rect of the row; FS-Q18Q3 R33: nor the bar's
  it("should read no corner row and no bar in its click path: both are the UI scene's (FS-TQZ5J R15; FS-Q18Q3 R33)", () => {
    const { run, carded, sent, rightClick } = barOnStage();
    run.handleGameStateUpdate(withMe(me()));
    carded.bindRunInput();
    (run as unknown as { corner: unknown }).corner = { covers: () => true };
    sent.mockClear();
    rightClick();
    expect(sent.mock.calls.some(([action]) => action === ActionType.CastSkill)).toBe(true);
  });

  it("should test no rect of the bar and bind no key for it (FS-Q18Q3 R32, R33)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const scene of ["BarrowspireScene", "FieldScene"]) {
      const source = readFileSync(join(__dirname, `${scene}.ts`), "utf8");
      expect(source, scene).not.toMatch(/abilityBarFrame\(|from "@\/ui\/abilityBarLayout"/);
      expect(source, scene).not.toMatch(/RUN_ACTIONS\.treeAbility/);
    }
  });

  // FS-84N1G R4; FS-Q18Q3 R42: the run tells the UI scene whether its bar is live, for the controls badge,
  // on each change: held at a death, it is no longer live
  it("should tell the UI scene its bar is live, and not at a death though it stays held, once each change", () => {
    const { run } = barOnStage();
    const told: boolean[] = [];
    (run as unknown as { ui: object }).ui = { ...NO_UI, abilityBar: (live: boolean) => void told.push(live) };
    run.handleGameStateUpdate(withMe(me()));
    run.handleGameStateUpdate(withMe(me()));
    run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
    run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
    expect(told).toEqual([true, false]);
  });

  it("should tell the next start's bar afresh after a restart", () => {
    const { run, carded } = barOnStage();
    const told: boolean[] = [];
    (run as unknown as { ui: object }).ui = { ...NO_UI, abilityBar: (live: boolean) => void told.push(live) };
    run.handleGameStateUpdate(withMe(me()));
    carded.resetRun("shutdown");
    run.handleGameStateUpdate(withMe(me()));
    expect(told).toEqual([true, true]);
  });

  it("should hold the bar greyed while the leave button is up", () => {
    const { run, carded, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
    expect(carded.leaveButton).toBeDefined();
    expect(shown()?.ability.greyed).toBe(true);
  });

  it("should build the bar afresh, live, after a restart", () => {
    const { run, carded, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ current_health: 0 })));
    carded.resetRun("shutdown");
    run.handleGameStateUpdate(withMe(me()));
    expect(shown()?.ability.greyed).toBe(false);
  });

  it.each(["warrior", "mage", "archer", "mercenary"])("should show the %s's bar with no MP on it", (cls) => {
    const { run, live, shown } = barOnStage();
    run.handleGameStateUpdate(withMe(me({ class: cls })));
    expect(shown()).not.toBeNull();
    const words = live().map((t) => String(t.args[2]));
    expect(words.filter((t) => /\bMP\b/.test(t))).toEqual([]);
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
    /** The bar's own end numeral reading `content`: 12 px, stroked in the marker stroke (§B.8). */
    const numeral = (content: string) =>
      scene
        .texts()
        .find(
          (t) =>
            t.content === content &&
            t.style.fontSize === "12px" &&
            t.style.stroke === toCss(palette.markerStroke),
        );
    return { ...scene, cues, shown, numeral };
  }

  it("should show the player's level and the next at the bar's ends, in the body serif, with no count (FS-77DVN §B.8, §B.10)", () => {
    const { run, shown, numeral } = onStage();
    run.handleGameStateUpdate(withMe(me(2, 150, 100, 230)));
    expect(numeral("2")).toBeDefined();
    expect(numeral("3")).toBeDefined();
    expect(shown("50 / 130")).toBe(false);
    expect(shown("Level 2")).toBe(false);
    expect(numeral("2")?.style.fontFamily).toBe(CANVAS_FONT.body);
  });

  it("should mark the cap at the right end when the server sends no next level (FS-77DVN §B.9)", () => {
    const { run, numeral } = onStage();
    run.handleGameStateUpdate(withMe(me(20, 40000, 38530)));
    expect(numeral("20")).toBeDefined();
    expect(numeral("Cap")).toBeDefined();
  });

  it.each([
    ["dead", { current_health: 0 }],
    ["escaped", { escape: true }],
  ])("should keep the player's own bar while %s (FS-77DVN §C.14)", (_case, change) => {
    const show = vi.spyOn(ProgressHudClass.prototype, "show");
    const { run } = onStage();
    run.handleGameStateUpdate(withMe(me(2, 150, 100, 230)));
    run.handleGameStateUpdate(withMe({ ...me(2, 160, 100, 230), ...change }));
    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenLastCalledWith({ level: 2, experience: 160, level_floor: 100, next_level_at: 230 });
    show.mockRestore();
  });

  it("should keep the player's own bar, never the watched player's, while spectating (FS-77DVN §C.14)", () => {
    const show = vi.spyOn(ProgressHudClass.prototype, "show");
    const { run } = onStage();
    const ally = { ...me(9, 5000, 4000, 6000), id: "ally", entity_id: "e_ally", username: "Wenna" };
    (run as unknown as { watchedPlayerId?: string }).watchedPlayerId = "ally";
    run.handleGameStateUpdate({
      ...withMe({ ...me(2, 150, 100, 230), current_health: 0 }),
      other_players: [ally],
    } as GameState);
    expect(show).toHaveBeenLastCalledWith({ level: 2, experience: 150, level_floor: 100, next_level_at: 230 });
    show.mockRestore();
  });

  // the bar is the UI scene's: its HUD slot places it again on a new view (FS-TQZ5J § Change: Batch 5;
  // merge with main, 2026-11-14), and the run's own relayout leaves it be
  it("should place the bar again when the view changes (FS-77DVN §A.4)", () => {
    const relayout = vi.spyOn(ProgressHudClass.prototype, "relayout").mockImplementation(() => {});
    const { run } = onStage();
    run.handleGameStateUpdate(withMe(me(2, 150, 100, 230)));
    hudOver(run, "run").relayout();
    expect(relayout).toHaveBeenCalledTimes(1);
    relayout.mockRestore();
  });

  it("should hand its progress and its bars to the UI scene through the bridge, and build neither (FS-TQZ5J § Change: Batch 5, R67, R68)", () => {
    const { run } = onStage();
    const told: { kind: string }[] = [];
    uiSceneOn(run, "run", { row: false }).bridge.onScreen({ hud: (message) => void told.push(message) });
    run.handleGameStateUpdate(withMe(me(2, 150, 100, 230)));
    expect(told).toContainEqual({ world: "run", kind: "progress", progress: { level: 2, experience: 150, level_floor: 100, next_level_at: 230 } });
    expect(told).toContainEqual({ world: "run", kind: "bars", bars: [expect.objectContaining({ label: "Health:" })] });
    const fields = run as unknown as Record<string, unknown>;
    expect([fields.progressHud, fields.resourceHud]).toEqual([undefined, undefined]);
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
    (run as unknown as { resetRun(end: "shutdown" | "destroy"): void }).resetRun("shutdown");
    // the restart, as the UI scene hears it: the run leaves and reports again, and the UI scene's level
    // bar is a new one (FS-TQZ5J § Change: Batch 5, R67)
    const { bridge } = uiSceneOn(run, "run", { row: false });
    const report = bridge.world!;
    bridge.left("run");
    bridge.report(report);
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

  it.each([
    { when: "the pile leaves state", next: () => withPile(null) },
    { when: "the floor it lay on is left", next: () => floorState(2) },
  ])("should take the heap down when $when", ({ next }) => {
    const { run, live } = onStage();
    run.handleGameStateUpdate(withPile(pile([blade])));
    run.handleGameStateUpdate(next());
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

    expect(view.open).toHaveBeenCalledWith("pile1", "drop_pile");
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

describe("BarrowspireScene sacks (FS-1D6BX §Requirements 12, 13, D2, D3)", () => {
  /** Floor 1 with its chest made a sack, or some kind this client does not know. */
  const withKind = (kind: string, is_open = false, items: unknown[] = []): GameState => {
    const state = floorState(1);
    return { ...state, containers: [{ ...state.containers[0], kind, is_open, items }] } as GameState;
  };
  function onStage() {
    const scene = sceneOnStage();
    const drawn = (prefix: string) =>
      scene.stage.made.filter((m) => m.kind === "sprite" && String(m.args[2]).startsWith(prefix));
    return { ...scene, drawn };
  }

  it("should draw a sack as a sack, closed or open from is_open on every state", () => {
    const { run, drawn } = onStage();
    run.handleGameStateUpdate(withKind("sack"));
    expect(drawn("chest_")).toHaveLength(0);
    expect(drawn("sack_")).toHaveLength(1);
    expect(drawn("sack_")[0].texture).toBe("sack_closed");

    run.handleGameStateUpdate(withKind("sack", true, [{ entity_id: "i1" }]));
    expect(drawn("sack_")[0].texture).toBe("sack_open");
  });

  it("should keep an emptied sack drawn open", () => {
    const { run, drawn } = onStage();
    run.handleGameStateUpdate(withKind("sack", true, [{ entity_id: "i1" }]));
    run.handleGameStateUpdate(withKind("sack", true, []));
    const live = drawn("sack_").filter((m) => !m.destroyed);
    expect(live).toHaveLength(1);
    expect(live[0].texture).toBe("sack_open");
  });

  it("should offer a sack to the interact key and open it in the container view, as a chest", () => {
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
    scene.playerPos = at(150, 150);
    run.handleGameStateUpdate(withKind("sack"));

    expect(scene.getNearbyChest()?.entityId).toBe("c1");
    scene.toggleChest("c1");
    run.handleGameStateUpdate(withKind("sack", true));
    expect(view.open).toHaveBeenCalledWith("c1", "sack");
    vi.restoreAllMocks();
  });

  it.each([
    ["chest", "chest"],
    ["reliquary", "chest"],
  ])("should open a %s in the container view as a %s (FS-1D6BX §Requirements 15, D2)", (kind, opensAs) => {
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const { run } = onStage();
    const view = { entityId: null as string | null, open: vi.fn(), close: vi.fn(), setItems: vi.fn() };
    const scene = run as unknown as { containerView: typeof view; toggleChest(id: string): void };
    scene.containerView = view;
    run.handleGameStateUpdate(withKind(kind));

    scene.toggleChest("c1");
    run.handleGameStateUpdate(withKind(kind, true));
    expect(view.open).toHaveBeenCalledWith("c1", opensAs);
    vi.restoreAllMocks();
  });

  // The coffer waits for the server: a shut container shows nothing until a state says it opened,
  // so a refused reach (a guarded chest) never flashes the coffer open and shut (FS-KE075 §J R60).
  describe("reaching for a shut container (FS-KE075 §J R60)", () => {
    const blade = { entity_id: "i1", name: "Blade" };
    /** The same state with the player in it, where the server has them: at `x` on the chest's row (the chest is at x 150). */
    const standing = (state: GameState, x: number): GameState =>
      ({ ...state, current_player: { ...player("me", "Aldric", x), position: at(x, 150) } }) as GameState;
    /** The chest reached for; `standingAt` puts the player in that first state, at that x. */
    function reached(is_open = false, standingAt?: number) {
      vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
      const { run } = onStage();
      const view = { entityId: null as string | null, open: vi.fn(), close: vi.fn(), setItems: vi.fn() };
      view.open.mockImplementation((id: string) => void (view.entityId = id));
      const scene = run as unknown as {
        containerView: typeof view;
        toggleChest(id: string): void;
        chestRefused(): void;
      };
      scene.containerView = view;
      const first = withKind("chest", is_open, is_open ? [blade] : []);
      run.handleGameStateUpdate(standingAt === undefined ? first : standing(first, standingAt));
      scene.toggleChest("c1");
      return { run, scene, view };
    }
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should not open the coffer before the server says the chest opened", () => {
      const { run, view } = reached();
      expect(view.open).not.toHaveBeenCalled();
      run.handleGameStateUpdate(withKind("chest"));
      expect(view.open).not.toHaveBeenCalled();
    });

    it("should open the coffer with its contents on the state that shows the chest open", () => {
      const { run, view } = reached();
      run.handleGameStateUpdate(withKind("chest", true, [blade]));
      expect(view.open).toHaveBeenCalledTimes(1);
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
      expect(view.setItems).toHaveBeenCalledWith([blade]);
    });

    it("should open at once a container the server already shows open", () => {
      const { view } = reached(true);
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
      expect(view.setItems).toHaveBeenCalledWith([blade]);
    });

    it("should give up the reach once the player walks off, so another's opening it later shows no coffer", () => {
      // the server drops an interact sent too soon after another without a word, so no refusal
      // ends that reach: walking out of reach of the chest does (FS-MQYEX R26)
      const { run, view } = reached(false, 150);
      run.handleGameStateUpdate(standing(withKind("chest"), 150));
      run.handleGameStateUpdate(standing(withKind("chest"), 211));
      run.handleGameStateUpdate(standing(withKind("chest", true, [blade]), 211));
      expect(view.open).not.toHaveBeenCalled();
    });

    it("should keep the reach through a frame, and give it up on the state that shows the player has walked off, with no coffer open", () => {
      // where the player stands is the server's word: a frame between states judges nothing, and
      // the state that moved them ends the reach whether or not a coffer is open (FS-MQYEX R26)
      const { run, scene, view } = reached(false, 150);
      const up = { isDown: false };
      const keys = { left: up, right: up, up, down: up };
      Object.assign(run, {
        cursors: keys,
        wasd: keys,
        kit: new Proxy({}, { get: (_kit, key) => (key === "guarding" ? false : vi.fn()) }),
        updateLighting: vi.fn(),
        updateOtherPlayersSmooth: vi.fn(),
        checkBuildingStatus: vi.fn(),
        sendMovementIntent: vi.fn(),
        // drawn, so the frame runs on past its "escaped" early return
        player: new Proxy({ visible: true }, { get: (drawn, key) => (key === "visible" ? drawn.visible : vi.fn()) }),
      });
      Object.assign(view, { isOpen: false });
      const reach = scene as unknown as { reaching?: string };

      (run as unknown as { update(time: number, delta: number): void }).update(0, 16);
      expect(reach.reaching).toBe("c1");

      run.handleGameStateUpdate(standing(withKind("chest"), 600));
      expect(reach.reaching).toBeUndefined();
      run.handleGameStateUpdate(standing(withKind("chest", true, [blade]), 600));
      expect(view.open).not.toHaveBeenCalled();
    });

    it("should keep the reach while the player stays by the chest", () => {
      const { run, view } = reached(false, 150);
      run.handleGameStateUpdate(standing(withKind("chest"), 150));
      run.handleGameStateUpdate(standing(withKind("chest", true, [blade]), 150));
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
    });

    it("should never open the coffer for a refused reach, even once another opens the chest", () => {
      const { run, scene, view } = reached();
      scene.chestRefused();
      run.handleGameStateUpdate(withKind("chest", true, [blade]));
      expect(view.open).not.toHaveBeenCalled();
    });
  });

  it("should draw a kind it does not know as a chest", () => {
    const { run, drawn } = onStage();
    run.handleGameStateUpdate(withKind("reliquary", true));
    expect(drawn("sack_")).toHaveLength(0);
    expect(drawn("chest_")).toHaveLength(1);
    expect(drawn("chest_")[0].texture).toBe("chest_open");
  });

  it("should make the sack's placeholder frames with the chest's", () => {
    const scene = new BarrowspireScene();
    const made: string[] = [];
    const graphics = () => {
      const g: Record<string, unknown> = new Proxy(
        {},
        { get: (_, prop) => (prop === "generateTexture" ? (key: string) => made.push(key) : () => g) },
      );
      return g;
    };
    Object.assign(scene, {
      make: { graphics },
      textures: { exists: () => false },
      // the manifest cached and unreadable: nothing to download, so no torch bar (FS-C4JWH §D)
      cache: { json: { exists: () => true, get: () => undefined } },
      load: { on: () => {}, once: () => {}, json: () => {}, audio: () => {} },
    });
    (scene as unknown as { preload(): void }).preload();
    expect(made).toEqual(expect.arrayContaining(["chest_closed", "chest_open", "sack_closed", "sack_open"]));
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
      // the player steps into the house: the frame's inside test makes it theirs, its roof off
      Object.assign(run, { player: drawnPlayer(at(200, 150)), playerPos: { x: 200, y: 150 } });
      (run as unknown as { checkBuildingStatus(): void }).checkBuildingStatus();
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
    (run as unknown as { resetRun(end: "shutdown" | "destroy"): void }).resetRun("shutdown");
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

  it("should roof an exterior house with one placeholder, not piece by piece, when the art lacks roof_slope", () => {
    const baked = themed("exterior", true).run;
    baked.handleGameStateUpdate(floorState(1));
    expect(baked.buildings[0].roof.length).toBeGreaterThan(1);

    const { run } = themed("exterior");
    const { roof_slope: _slope, ...sheets } = manifest.sheets as Record<string, unknown>;
    run.art = new ArtLibrary({ ...manifest, sheets }, { warn: () => {} });
    run.handleGameStateUpdate(floorState(1));
    expect(run.buildings[0].roof).toHaveLength(1);
    expect((run.buildings[0].roof[0] as Made).kind).not.toBe("sprite");
  });

  it.each(["tower", "exterior"] as const)(
    "should darken the world outside a %s room the player enters, with the shared blackout (FS-9PN7X §D.5)",
    (theme) => {
      const { run } = themed(theme);
      run.handleGameStateUpdate(floorState(1));
      Object.assign(run, { player: drawnPlayer(at(200, 180)), playerPos: { x: 200, y: 180 } });
      run.checkBuildingStatus();
      expect(run.currentBuilding).toBe(run.buildings[0]);
      const view = (run as unknown as { view?: { building?: { id: string } } }).view;
      expect(view?.building?.id).toBe((run.buildings[0] as unknown as { id: string }).id);
      expect("indoorMask" in run).toBe(false);
    },
  );

  it("should lift an exterior house's roof while the player is in it, and put it back as they leave", () => {
    const { run } = themed("exterior");
    run.handleGameStateUpdate(floorState(1));
    const roof = run.buildings[0].roof[0] as Made;
    Object.assign(run, { player: drawnPlayer(at(200, 180)), playerPos: { x: 200, y: 180 } });
    run.checkBuildingStatus();
    expect(roof.shown).toBe(false);
    Object.assign(run, { player: drawnPlayer(at(200, 400)), playerPos: { x: 200, y: 400 } });
    run.checkBuildingStatus();
    expect(roof.shown).toBe(true);
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

describe("BarrowspireScene Spire rooms: the blackout, the hide rule and room lights (FS-9PN7X §C, §D)", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../public/art/manifest.json"), "utf8"),
  );
  type Point = { x: number; y: number };
  interface RoomRun extends FloorRun {
    worldLook: unknown;
    buildings: { id: string }[];
    currentBuilding?: { id: string };
    view?: { building?: { id: string } };
    player?: unknown;
    playerPos?: Point;
    watchedPlayerId?: string;
    fx?: unknown;
    chests: Map<string, { sprite: Made }>;
    switches: Map<string, { sprite: Made }>;
    escapeDoors: Map<string, { sprite: Made }>;
    stairs: { drawn: Map<string, { sprite: Made }> };
    otherPlayers: Map<string, Made>;
    otherPlayersLegs: Map<string, Made>;
    otherPlayersNameTexts: Map<string, Made>;
    teammateHealthBars: Map<string, { graphics: Made }>;
    events: { emit(event: string): boolean };
    checkBuildingStatus(): void;
    createUI(): void;
  }
  // floor 1's room (house h1) spans x 100–310, y 100–270; floor 2's, x 600–810
  const IN_ROOM = at(200, 180);
  const IN_HALL = at(200, 400);

  /** A tower run on stage, with the baked art or with none. */
  function spire(theme: "tower" | "exterior" = "tower", baked = false) {
    const stage = sceneOnStage();
    const run = stage.run as unknown as RoomRun;
    run.worldLook = WORLD_THEMES[theme];
    if (baked) run.art = new ArtLibrary(manifest, { warn: () => {} });
    return { ...stage, run };
  }
  /** The player stands at `pos`, drawn there, and the frame's inside test runs. */
  const standAt = (run: RoomRun, pos: Point) => {
    Object.assign(run, { player: drawnPlayer(pos), playerPos: { ...pos } });
    run.checkBuildingStatus();
  };
  /** Floor 1, its ghouls and an ally where asked. */
  const peopled = (monsters: Point[], ally?: Point): GameState => ({
    ...floorState(1),
    monsters: monsters.map((p, i) => ({ ...monster(`m${i}`, 0), position: p })),
    other_players: ally ? [{ ...player("ally", "Wenna", 0), position: ally }] : [],
  }) as GameState;

  it("should hide a monster standing in a room from a player in the halls, plate and all, with no blackout", () => {
    const { run, stage } = spire();
    run.handleGameStateUpdate(peopled([IN_ROOM, IN_HALL]));
    standAt(run, IN_HALL);

    const [inRoom, inHall] = stage.made.filter((m) => m.kind === "sprite" && m.args.length === 0);
    expect(inRoom.shown).toBe(false);
    expect(inHall.shown).toBe(true);
    const plates = stage.made.filter((m) => m.kind === "text" && String(m.args[2]).includes("Ghoul"));
    expect(plates[0].shown).toBe(false);
    expect(run.currentBuilding).toBeUndefined();
    expect(run.view?.building).toBeUndefined();
  });

  it("should darken everything but the room the player stands in, and hide the monster in the halls", () => {
    const { run, stage } = spire();
    run.handleGameStateUpdate(peopled([IN_ROOM, IN_HALL]));
    standAt(run, IN_ROOM);

    const [inRoom, inHall] = stage.made.filter((m) => m.kind === "sprite" && m.args.length === 0);
    expect(inRoom.shown).toBe(true);
    expect(inHall.shown).toBe(false);
    expect(run.currentBuilding).toBe(run.buildings[0]);
    expect(run.view?.building?.id).toBe(run.buildings[0].id);
  });

  it("should hide a teammate by the same rule: body, legs and name (§C.4)", () => {
    const { run } = spire();
    run.handleGameStateUpdate(peopled([], IN_ROOM));
    standAt(run, IN_HALL);
    expect(run.otherPlayers.get("ally")!.shown).toBe(false);
    expect(run.otherPlayersLegs.get("ally")!.shown).toBe(false);
    expect(run.otherPlayersNameTexts.get("ally")!.shown).toBe(false);
    // overhead player bars are off (FS-CH21F R14): there is no health bar to hide
    expect(run.teammateHealthBars.get("ally")).toBeUndefined();

    standAt(run, IN_ROOM);
    expect(run.otherPlayers.get("ally")!.shown).toBe(true);
    expect(run.otherPlayersLegs.get("ally")!.shown).toBe(true);
  });

  it("should hide the chest in a room from the halls, and the switch, escape door and stairs in the halls from the room", () => {
    const { run } = spire();
    run.handleGameStateUpdate(floorState(1));
    standAt(run, IN_HALL);
    expect(run.chests.get("c1")!.sprite.shown).toBe(false);
    expect(run.switches.get("s1")!.sprite.shown).toBe(true);
    expect(run.escapeDoors.get("e1")!.sprite.shown).toBe(true);
    expect(run.stairs.drawn.get("st1")!.sprite.shown).toBe(true);

    standAt(run, IN_ROOM);
    expect(run.chests.get("c1")!.sprite.shown).toBe(true);
    expect(run.switches.get("s1")!.sprite.shown).toBe(false);
    expect(run.escapeDoors.get("e1")!.sprite.shown).toBe(false);
    expect(run.stairs.drawn.get("st1")!.sprite.shown).toBe(false);
  });

  it("should hide a projectile and a world effect in a room from the halls", () => {
    const { run } = spire();
    const fake = fakeScene();
    const fx = new EffectsRuntime(fake.scene, fakeArt, fakeLights().lights, { warn: () => {} });
    run.fx = fx;
    run.projectiles = new ProjectileFlights(fake.scene, fakeArt, fx, projectileFlightOf);
    const state = floorState(1);
    state.projectiles = [{ entity_id: "p1", projectile_type: "fireball", position: IN_ROOM, velocity: { vx: 1, vy: 0 } }];
    run.handleGameStateUpdate(state);
    fx.play("p2", "escape", IN_HALL);

    standAt(run, IN_HALL);
    const veiled = fake.live().filter((m) => m.calls.setVisible?.[0] === false);
    const inSight = fake.live().filter((m) => m.calls.setVisible?.[0] === true);
    // the fireball's body and its trail, in the room; the escape column, in the halls
    expect(veiled.length).toBeGreaterThan(0);
    expect(veiled.some((m) => m.kind === "image")).toBe(true);
    expect(inSight.length).toBeGreaterThan(0);

    standAt(run, IN_ROOM);
    expect(veiled.every((m) => m.calls.setVisible?.[0] === true)).toBe(true);
    expect(inSight.every((m) => m.calls.setVisible?.[0] === false)).toBe(true);
  });

  it("should mask the dark with the room's own px under WebGL: its walls and whoever and whatever stands in it, never the halls", () => {
    const show = vi.spyOn(BlackoutMask.prototype, "show").mockImplementation(() => {});
    const { run, stage } = spire();
    const scene = run as unknown as Record<string, unknown>;
    scene.renderer = { type: 2 };
    scene.make = { graphics: () => (run.add as unknown as { graphics(): unknown }).graphics() };
    run.handleGameStateUpdate(peopled([IN_ROOM, IN_HALL], IN_ROOM));
    standAt(run, IN_ROOM);

    const look = show.mock.calls.at(-1)?.[0] as MaskLook;
    expect(look.house.id).toBe(run.buildings[0].id);
    const stamps = new Set(look.stamps as unknown[]);
    const view = run.view as unknown as { drawn: { house: { id: string }; shared: unknown[]; interior: unknown[] }[] };
    const room = view.drawn.find((b) => b.house.id === look.house.id)!;
    for (const p of [...room.shared, ...room.interior]) expect(stamps.has(p)).toBe(true);
    const [inRoom, inHall] = stage.made.filter((m) => m.kind === "sprite" && m.args.length === 0);
    // the stage records the objects behind the proxies the scene holds: matched by their call log
    const drawsOf = (m: Made) => [...stamps].some((s) => (s as Made).calls === m.calls);
    expect(drawsOf(inRoom)).toBe(true);
    expect(drawsOf(inHall)).toBe(false);
    expect(stamps.has(run.player)).toBe(true);
    expect(stamps.has(run.otherPlayers.get("ally"))).toBe(true);
    expect(stamps.has(run.otherPlayersLegs.get("ally"))).toBe(true);
    // the plates and bars stand over the dark
    expect(stamps.has(run.otherPlayersNameTexts.get("ally"))).toBe(false);
    expect(stamps.has(run.teammateHealthBars.get("ally")?.graphics)).toBe(false);
    expect(stamps.has(run.chests.get("c1")!.sprite)).toBe(true);
    expect(stamps.has(run.switches.get("s1")!.sprite)).toBe(false);
    expect(stamps.has(run.escapeDoors.get("e1")!.sprite)).toBe(false);
    expect(stamps.has(run.stairs.drawn.get("st1")!.sprite)).toBe(false);

    standAt(run, IN_HALL);
    expect(show).toHaveBeenLastCalledWith(undefined);
    show.mockRestore();
  });

  it("should never hide the player, who is in the room they stand in", () => {
    const { run } = spire();
    run.handleGameStateUpdate(floorState(1));
    const me = { ...drawnPlayer(IN_ROOM), setVisible: vi.fn() };
    Object.assign(run, { player: me, playerPos: { ...IN_ROOM } });
    run.checkBuildingStatus();
    expect(me.setVisible).not.toHaveBeenCalled();
  });

  it("should take no room for the player's once they have escaped: no blackout", () => {
    const { run } = spire();
    run.handleGameStateUpdate(floorState(1));
    Object.assign(run, { player: { visible: false }, playerPos: { ...IN_ROOM } });
    run.checkBuildingStatus();
    expect(run.currentBuilding).toBeUndefined();
    expect(run.view?.building).toBeUndefined();
  });

  // the owner, 「觀看時應該會跟被觀看的人一模壹樣的視野狀態」 (2026-11-14; FS-QPDKN § Change: The party death flow and
  // the spectate switcher): a spectator sees through the watched teammate's eyes, their room and all. It overrules
  // the old "player gone" rule that took no room while spectating (review round 1, I-9PN7X-3).
  it("should follow the watched teammate into their room: their building, them shown, the halls' monster hidden", () => {
    const { run, stage } = spire();
    run.handleGameStateUpdate(peopled([IN_HALL], IN_ROOM));
    Object.assign(run, { player: drawnPlayer(IN_HALL), playerPos: { ...IN_HALL }, watchedPlayerId: "ally" });
    run.checkBuildingStatus();
    expect(run.view?.building?.id).toBe("h1");
    expect(run.currentBuilding).toBe(run.buildings[0]);
    expect(run.otherPlayers.get("ally")!.shown).not.toBe(false);
    const [inHall] = stage.made.filter((m) => m.kind === "sprite" && m.args.length === 0);
    expect(inHall.shown).toBe(false);
  });

  it("should take the watched teammate's halls, not the room the player's own body lies in", () => {
    const { run, stage } = spire();
    run.handleGameStateUpdate(peopled([IN_ROOM], IN_HALL));
    Object.assign(run, { player: drawnPlayer(IN_ROOM), playerPos: { ...IN_ROOM }, watchedPlayerId: "ally" });
    run.checkBuildingStatus();
    expect(run.view?.building).toBeUndefined();
    const [inRoom] = stage.made.filter((m) => m.kind === "sprite" && m.args.length === 0);
    expect(inRoom.shown).toBe(false);
  });

  it("should take no room before WATCH: a dead player watching nobody has no building (edge state: player gone)", () => {
    const { run } = spire();
    run.handleGameStateUpdate({ ...peopled([], IN_HALL), current_player: player("me", "Aldric", 130, { current_health: 0 }) } as GameState);
    Object.assign(run, { player: drawnPlayer(IN_ROOM), playerPos: { ...IN_ROOM } });
    run.checkBuildingStatus();
    expect(run.view?.building).toBeUndefined();
  });

  it("should clear the blackout on a climb and raise it around the new floor's room (§D.8)", () => {
    const { run } = spire();
    run.handleGameStateUpdate(floorState(1));
    standAt(run, IN_ROOM);
    expect(run.view?.building?.id).toBe("h1");

    run.handleGameStateUpdate(floorState(2));
    // the new floor starts with the player outside every room
    expect(run.currentBuilding).toBeUndefined();
    expect(run.view?.building).toBeUndefined();

    standAt(run, at(700, 180));
    expect(run.view?.building?.id).toBe("h2");
    expect(run.currentBuilding).toBe(run.buildings[0]);
  });

  it("should let go of the blackout with the run, so the next start makes its own", () => {
    const { run } = spire();
    run.handleGameStateUpdate(floorState(1));
    standAt(run, IN_ROOM);
    (run as unknown as { resetRun(end: "shutdown" | "destroy"): void }).resetRun("shutdown");
    expect(run.view).toBeUndefined();
    expect(run.currentBuilding).toBeUndefined();
  });

  /** Faint amber pools on the things a player uses, as `interactablePool` makes them. */
  const pools = (lights: unknown[]) =>
    (lights as { radius: number; x: number; y: number; intensity: number }[]).filter(
      (l) => l.radius === INTERACTABLE_RADIUS,
    );

  // the owner's addition 1, carried to the Spire's halls in review round 1 (I-9PN7X-3/-6): inside a
  // room every light outside it goes dark, as the hub's street lights do
  it("should light the room's chest pool only while the player is in the room, and the hall's switch pool only from the halls (§D.6)", () => {
    const { run, lights } = spire("tower", true);
    run.handleGameStateUpdate(floorState(1));
    const chest = await_iso.worldToScreen(150, 150);
    const inRoom = pools(lights).find((l) => l.x === chest.x)!;
    const inHall = pools(lights).find((l) => l.x !== chest.x)!;
    const lit = inHall.intensity;
    expect(lit).toBeGreaterThan(0);

    standAt(run, IN_HALL);
    expect(inRoom.intensity).toBe(0);
    expect(inHall.intensity).toBe(lit);

    standAt(run, IN_ROOM);
    expect(inRoom.intensity).toBeGreaterThan(0);
    expect(inHall.intensity).toBe(0);

    standAt(run, IN_HALL);
    expect(inHall.intensity).toBe(lit);
  });

  it("should light a room's back-wall sconces only while the player is in the room (§D.6)", () => {
    const { run, lights } = spire("tower", true);
    const sconces = { ...TOWER_BANDS.lower.walls, back: [[100, "sconce"]] };
    run.worldLook = {
      ...WORLD_THEMES.tower,
      bands: { ...TOWER_BANDS, lower: { ...TOWER_BANDS.lower, walls: sconces } },
    };
    run.handleGameStateUpdate(floorState(1));
    const all = lights as { intensity: number }[];
    standAt(run, IN_HALL);
    const dark = all.filter((l) => l.intensity === 0);
    const lit = all.filter((l) => l.intensity > 0);
    // the room's sconces and its chest pool
    expect(dark.length).toBeGreaterThan(1);

    standAt(run, IN_ROOM);
    expect(dark.every((l) => l.intensity > 0)).toBe(true);
    // and every light of the halls goes out (the owner's addition 1)
    expect(lit.every((l) => l.intensity === 0)).toBe(true);
  });

  it.each([
    ["tower", "X: 200 Y: 180"],
    ["exterior", "X: 200 Y: 180 | Indoor"],
  ] as const)("should keep the %s world theme's position line inside a room as %j (§D.7)", (theme, line) => {
    const { run, texts } = spire(theme);
    run.handleGameStateUpdate(floorState(1));
    run.createUI();
    standAt(run, IN_ROOM);
    run.events.emit("update");
    expect(texts().some((t) => t.content === line)).toBe(true);
  });
});

describe("BarrowspireScene Spire closed rooms: exteriors, caps, room doors and the silhouette (FS-9PN7X §B, §E)", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../public/art/manifest.json"), "utf8"),
  );
  type Point = { x: number; y: number };
  interface ClosedRun extends FloorRun {
    worldLook: unknown;
    buildings: { id: string }[];
    currentBuilding?: { id: string };
    perimeter?: Made[];
    player?: unknown;
    playerPos?: Point;
    watchedPlayerId?: string;
    lastGameState?: GameState;
    occluders: { size: number; items: { sprite: Made }[] };
    view: { drawn: { house: { id: string }; shared: Made[]; interior: Made[]; exterior: Made[] }[] };
    walls: Map<string, { pieces: Made[] }>;
    serverDoors: Map<string, { sprite?: Made }>;
    checkBuildingStatus(): void;
  }
  // room r1 spans x 100–340, y 100–300 in 20 px walls, an 80 px door gap in its south wall, as the
  // server builds a room (`AddBuilding`); room r2 stands beside it, and a wall of no room in the halls
  const IN_ROOM = at(220, 200);
  const IN_HALL = at(220, 420);
  const BEHIND = at(220, 60);
  // nearer the viewer than every room's footprint: nothing of them can cover the player
  const IN_FRONT = at(400, 800);
  const room = (id: string, x: number, prefix: string) => {
    const side = (240 - 80) / 2;
    return [
      { entity_id: `${prefix}n`, house_id: id, position: at(x, 100), width: 240, height: 20 },
      { entity_id: `${prefix}w`, house_id: id, position: at(x, 100), width: 20, height: 200 },
      { entity_id: `${prefix}e`, house_id: id, position: at(x + 220, 100), width: 20, height: 200 },
      { entity_id: `${prefix}sl`, house_id: id, position: at(x, 280), width: side, height: 20 },
      { entity_id: `${prefix}sr`, house_id: id, position: at(x + side + 80, 280), width: side, height: 20 },
    ];
  };
  const HALL_WALL = { entity_id: "hall", house_id: "", position: at(100, 500), width: 300, height: 20 };
  /** A floor of two closed rooms, r1's door open or shut, r2's shut. */
  const rooms = (open: boolean, floor = 1): GameState => {
    const x = floor === 1 ? 100 : 600;
    return {
      ...floorState(floor),
      walls: [...room(`r1_${floor}`, x, `a${floor}`), ...room(`r2_${floor}`, x + 400, `b${floor}`), HALL_WALL],
      doors: [
        { entity_id: `d1_${floor}`, position: at(x + 80, 280), width: 80, height: 20, is_open: open },
        { entity_id: `d2_${floor}`, position: at(x + 480, 280), width: 80, height: 20, is_open: false },
      ],
    } as GameState;
  };

  function spire() {
    const stage = sceneOnStage();
    const run = stage.run as unknown as ClosedRun;
    run.worldLook = WORLD_THEMES.tower;
    run.art = new ArtLibrary(manifest, { warn: () => {} });
    const sheetOf = (m: Made) => String(m.args[3] ?? "").split("/")[0];
    /** Live sprites drawn from sheets the test matches. */
    const drawn = (match: RegExp) =>
      stage.stage.made.filter((m) => m.kind === "sprite" && !m.destroyed && match.test(sheetOf(m)));
    return { ...stage, run, drawn, sheetOf };
  }
  /** The player drawn at `pos`, as a body the silhouette can copy, and the frame's inside test. */
  const standAt = (run: ClosedRun, pos: Point) => {
    Object.assign(run, { player: drawnPlayer(pos), playerPos: { ...pos } });
    run.checkBuildingStatus();
  };
  const shown = (ms: Made[]) => ms.length > 0 && ms.every((m) => m.shown !== false);
  const hiddenAll = (ms: Made[]) => ms.length > 0 && ms.every((m) => m.shown === false);

  it("should close every room from the halls: full-height exterior fronts under a stone cap, nothing of the cut-away", () => {
    const { run, drawn } = spire();
    run.handleGameStateUpdate(rooms(false));
    standAt(run, IN_HALL);
    expect(shown(drawn(/^tower_wall_exterior_/))).toBe(true);
    expect(shown(drawn(/^tower_cap$/))).toBe(true);
    expect(hiddenAll(drawn(/^tower_wall_front_/))).toBe(true);
    expect(hiddenAll(drawn(/^tower_post_front$/))).toBe(true);
    // the back walls stand in both looks
    expect(shown(drawn(/^tower_wall_back_/))).toBe(true);
  });

  it("should show each room door from the halls in its own state, shut or open, never a dark opening (§B.5, amended 2026-11-03)", () => {
    const { run, drawn } = spire();
    run.handleGameStateUpdate(rooms(true));
    standAt(run, IN_HALL);
    const frameOf = (m: Made) => String(m.args[3] ?? "").split("/")[1];
    const open = run.serverDoors.get("d1_1")!.sprite!;
    const shut = run.serverDoors.get("d2_1")!.sprite!;
    expect([frameOf(open), frameOf(shut)]).toEqual(["open", "unlocked"]);
    expect(drawn(/^door_x$/).filter((m) => m.shown !== false)).toEqual([open, shut]);
    expect(drawn(/dark/)).toHaveLength(0);
    // each room's wall carried on over its door's lintel to the coping, open door or shut
    const heads = drawn(/^tower_door_head_x$/);
    expect(heads.filter((m) => m.shown !== false)).toHaveLength(2);
    expect(heads.map((m) => m.args.slice(0, 2))).toEqual([open, shut].map((m) => m.args.slice(0, 2)));

    // the door shuts while the player is outside: still shown, its frame follows the state
    run.handleGameStateUpdate(rooms(false));
    run.checkBuildingStatus();
    expect(open.calls).toContain("setTexture");
    expect(drawn(/^door_x$/).filter((m) => m.shown !== false)).toHaveLength(2);

    // and opens again
    run.handleGameStateUpdate(rooms(true));
    run.checkBuildingStatus();
    expect(drawn(/^door_x$/).filter((m) => m.shown !== false)).toHaveLength(2);
    expect(drawn(/dark/)).toHaveLength(0);
  });

  it("should count a room door as cover from the halls, open or shut (§E.1)", () => {
    const { run } = spire();
    run.handleGameStateUpdate(rooms(true));
    standAt(run, IN_HALL);
    const cover = (run as unknown as { coverBesideRooms(): { part: unknown }[] }).coverBesideRooms();
    const parts = cover.map((c) => (c.part as Made).calls);
    for (const id of ["d1_1", "d2_1"]) expect(parts).toContain(run.serverDoors.get(id)!.sprite!.calls);
  });

  it("should snap the room to its cut-away look in the frame the player steps in, and back as they leave", () => {
    const { run, drawn } = spire();
    run.handleGameStateUpdate(rooms(true));
    standAt(run, IN_HALL);
    const exterior = drawn(/^tower_wall_exterior_/);
    const caps = drawn(/^tower_cap$/);

    standAt(run, IN_ROOM);
    expect(run.currentBuilding?.id).toBe("r1_1");
    // the room's own: cut-away fronts and their posts, no cap, the open door's own frame
    const own = run.view.drawn.find((r) => r.house.id === "r1_1")!;
    expect(shown(own.interior)).toBe(true);
    expect(shown(own.shared)).toBe(true);
    expect(run.serverDoors.get("d1_1")!.sprite!.shown).toBe(true);
    expect(drawn(/dark/)).toHaveLength(0);
    // the heads are the rooms' exteriors: none shows from inside
    expect(hiddenAll(drawn(/^tower_door_head_/))).toBe(true);
    // everything outside the room hides: the other room's walls and cap too (owner's addition 1)
    expect(hiddenAll(caps)).toBe(true);
    expect(hiddenAll(exterior)).toBe(true);

    standAt(run, IN_HALL);
    expect(shown(exterior)).toBe(true);
    expect(shown(caps)).toBe(true);
    expect(hiddenAll(drawn(/^tower_wall_front_/))).toBe(true);
  });

  it("should hide all scenery outside the player's room by footprint: other rooms, their doors, hall walls, the perimeter", () => {
    const { run, drawn } = spire();
    run.handleGameStateUpdate(rooms(false));
    standAt(run, IN_HALL);
    const hall = run.walls.get("hall")!.pieces;
    expect(shown(hall)).toBe(true);
    expect(shown(run.perimeter!)).toBe(true);

    standAt(run, IN_ROOM);
    expect(hiddenAll(hall)).toBe(true);
    expect(hiddenAll(run.perimeter!)).toBe(true);
    // r2's shut door is outside the room; r1's is in its wall and shows
    const doors = drawn(/^door_x$/);
    expect(doors.filter((m) => m.shown !== false)).toHaveLength(1);
  });

  it("should put no room piece, cap or room door among the occluders, and keep the hall wall's", () => {
    const { run, drawn } = spire();
    run.handleGameStateUpdate(rooms(true));
    standAt(run, IN_HALL);
    // (the scene holds each record behind its proxy: the same record, by its calls)
    const fading = new Set(run.occluders.items.map((i) => i.sprite.calls));
    const roomParts = [
      ...run.view.drawn.flatMap((r) => [...r.shared, ...r.interior, ...r.exterior]),
      ...drawn(/^door_x$/),
    ];
    expect(roomParts.some((m) => /^tower_cap/.test(String(m.args[3])))).toBe(true);
    for (const part of roomParts) expect(fading.has(part.calls)).toBe(false);
    const hall = run.walls.get("hall")!.pieces;
    expect(hall.length).toBeGreaterThan(0);
    for (const piece of hall) expect(fading.has(piece.calls)).toBe(true);
  });

  it("should silhouette the player behind a room, and never inside one or once dead", () => {
    const { run, stage } = spire();
    run.handleGameStateUpdate(rooms(false));
    const silhouette = () => stage.made.filter((m) => m.kind === "image" && m.args[2] === "__DEFAULT");

    standAt(run, BEHIND);
    expect(silhouette()).toHaveLength(1);
    expect(silhouette()[0].shown).toBe(true);

    standAt(run, IN_FRONT);
    expect(silhouette()[0].shown).toBe(false);

    standAt(run, IN_ROOM);
    expect(silhouette()[0].shown).toBe(false);

    run.lastGameState = { ...rooms(false), current_player: { ...player("me", "Aldric", 0), current_health: 0 } } as GameState;
    standAt(run, BEHIND);
    expect(silhouette()[0].shown).toBe(false);
  });

  // I-9PN7X-5: half behind a room the head over the cap went brass too; the silhouette is masked
  // to the room pieces covering the player, drawn into its mask texture each frame
  it("should mask the silhouette to the room pieces covering the player", () => {
    const { run, stage } = spire();
    run.handleGameStateUpdate(rooms(false));
    standAt(run, BEHIND);
    const [image] = stage.made.filter((m) => m.kind === "image" && m.args[2] === "__DEFAULT");
    const [mask] = stage.made.filter((m) => m.kind === "renderTexture");
    expect(image.calls).toContain("addMask");
    expect(mask.calls).toContain("clear");
    expect(mask.calls.filter((c) => c === "draw").length).toBeGreaterThan(0);
  });

  it("should rebuild the rooms, caps and doors with the floor on a climb", () => {
    const { run, drawn } = spire();
    run.handleGameStateUpdate(rooms(true, 1));
    standAt(run, IN_HALL);
    const floorOne = [...drawn(/^tower_wall_exterior_|^tower_cap$|^door_x$/)];
    expect(floorOne.length).toBeGreaterThan(0);

    run.handleGameStateUpdate(rooms(true, 2));
    standAt(run, at(720, 420));

    expect(floorOne.every((m) => m.destroyed)).toBe(true);
    expect(drawn(/^tower_cap$/).length).toBeGreaterThan(0);
    expect(drawn(/^door_x$/).filter((m) => m.shown !== false)).toHaveLength(2);
    expect(run.buildings.map((b) => b.id)).toEqual(["r1_2", "r2_2"]);
  });

  /** The closed-rooms floor in a band whose back walls all carry sconces. */
  const lit = () => {
    const t = spire();
    const sconces = { ...TOWER_BANDS.lower.walls, back: [[100, "sconce"]] };
    t.run.worldLook = {
      ...WORLD_THEMES.tower,
      bands: { ...TOWER_BANDS, lower: { ...TOWER_BANDS.lower, walls: sconces } },
    };
    return t;
  };
  type Light = { intensity: number };

  // the owner's addition 1 (inside a building, everything outside goes dark), carried to the
  // Spire's halls in review round 1 (I-9PN7X-3/-6), as the hub's street lights follow it
  it("should put out every light outside the player's room, pool and halo: hall sconces, slits, stairs and pools", () => {
    const { run, lights, gates } = lit();
    run.handleGameStateUpdate(rooms(false));
    standAt(run, IN_HALL);
    const all = lights as Light[];
    const hall = all.filter((l) => l.intensity > 0);
    // the hall wall's sconces, the perimeter's slits, the stairs and the switch's pools at least
    expect(hall.length).toBeGreaterThan(3);
    expect(hall.every((l) => gates.get(l)?.() !== false)).toBe(true);

    standAt(run, IN_ROOM);
    expect(hall.every((l) => l.intensity === 0)).toBe(true);
    expect(hall.every((l) => gates.get(l)?.() === false)).toBe(true);
    // only the room's own lights are on: r1's sconces; r2's stay out
    const on = all.filter((l) => l.intensity > 0);
    expect(on.length).toBeGreaterThan(0);
    expect(on.some((l) => hall.includes(l))).toBe(false);
    expect(all.filter((l) => l.intensity === 0).length).toBeGreaterThan(hall.length);

    standAt(run, IN_HALL);
    expect(hall.every((l) => l.intensity > 0)).toBe(true);
    expect(hall.every((l) => gates.get(l)?.() !== false)).toBe(true);
  });

  it("should take a redrawn room's old wall lights off the light-map, so the cap counts its sconces once", () => {
    const { run, lights } = lit();
    run.handleGameStateUpdate(rooms(false));
    const before = [...lights];
    const stamped = (run as unknown as { stampedLights: number }).stampedLights;
    expect(stamped).toBe(before.length);

    // one of r1's walls goes: the room is redrawn from the walls left, its sconces with it. A run's
    // walls come once per floor from its map (FS-KE075 §H.43), so the redraw is driven directly
    const state = rooms(false);
    const redrawn = run as unknown as { updateWalls(walls: unknown[]): void; stampLights(floor?: number): void };
    redrawn.updateWalls(state.walls!.filter((w) => w.entity_id !== "a1sl"));
    redrawn.stampLights(state.floor);
    const run1 = run as unknown as { roomLights: { room: string; source: unknown; hung: boolean }[]; stampedLights: number };
    expect(run1.stampedLights).toBe(lights.length);
    // every r1 wall light is on the light-map once, and none of the old ones is left behind
    const hung = run1.roomLights.filter((l) => l.room === "r1_1" && l.hung);
    expect(hung.length).toBeGreaterThan(0);
    expect(new Set(lights).size).toBe(lights.length);
    for (const l of hung) expect(lights.filter((x) => x === l.source)).toHaveLength(1);
    const oldR1 = before.filter((l) => !lights.includes(l));
    expect(oldR1.length).toBeGreaterThan(0);
    expect(run1.roomLights.some((l) => oldR1.includes(l.source))).toBe(false);
  });

  it("should close a room without its art: placeholder sides and slab, never the open room (§B.7)", () => {
    const { run, stage } = spire();
    run.art = ArtLibrary.empty({ warn: () => {} });
    run.handleGameStateUpdate(rooms(true));
    standAt(run, IN_HALL);
    // a slab on a lifted plane per room, shown from the halls
    const slabs = stage.made.filter((m) => m.kind === "container" && !m.destroyed && m.shown === true);
    expect(slabs.length).toBeGreaterThanOrEqual(2);
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
    run.handleGameStateUpdate(floorState(3));
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
    reconnect.run.handleGameStateUpdate(floorState(6));
    expect((reconnect.grounds.at(-1) as { look: { hall: string } }).look.hall).toBe("ground_dressed");

    const climb = banded("tower");
    climb.run.handleGameStateUpdate(floorState(1));
    const one = climb.grounds.at(-1) as { look: { patches?: unknown }; seed: number };
    expect(one.look.patches).toBeDefined();
    climb.run.handleGameStateUpdate(floorState(3));
    const three = climb.grounds.at(-1) as { look: { patches?: unknown }; seed: number };
    expect(three.look.patches).toBeUndefined();
    expect(three.seed).not.toBe(one.seed);
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
    // a long north wall of sconces: 30 pieces, more than the budget holds with the slits; the
    // room it walls stands clear of the stairs, whose pool would otherwise be the room's (FS-9PN7X §D.6)
    state.walls = [
      ...state.walls!,
      { house_id: "big", entity_id: "bn", position: at(100, 750), width: 1200, height: 10 },
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

  it("should stand a sack in a faint amber pool as it does a chest (FS-1D6BX §Requirements 14)", () => {
    const { run, lights } = banded("tower");
    const state = floorState(1);
    state.containers = [{ ...state.containers[0], kind: "sack" }];
    run.handleGameStateUpdate(state);
    const sack = worldToScreen(150, 150);
    expect(pools(lights).map((l) => [(l as { x: number }).x, (l as { y: number }).y])).toContainEqual([
      sack.x,
      sack.y - 12,
    ]);
    expect(pools(lights)).toHaveLength(2);
  });

  // FS-KE075 §H.48: on a dungeon floor a container leaves the snapshot when the party walks off
  // and comes back when it returns; it is the same chest, not a new one
  describe("a container that leaves the snapshot and comes back (FS-KE075 §H.48)", () => {
    const opened = (state: GameState): GameState => ({
      ...state,
      containers: state.containers.map((c) => ({ ...c, is_open: true })),
    });
    const without = (state: GameState): GameState => ({ ...state, containers: [] });

    it("should stand it in one pool, not one more each time it comes back", () => {
      const { run, lights } = banded("tower");
      run.handleGameStateUpdate(floorState(1));
      run.handleGameStateUpdate(without(floorState(1)));
      run.handleGameStateUpdate(floorState(1));
      run.handleGameStateUpdate(without(floorState(1)));
      run.handleGameStateUpdate(floorState(1));
      // the chest's and the switch's
      expect(pools(lights)).toHaveLength(2);
    });

    it("should draw an opened chest coming back open, one chest", () => {
      const { run, stage } = banded("tower", false);
      run.handleGameStateUpdate(floorState(1));
      run.handleGameStateUpdate(without(floorState(1)));
      run.handleGameStateUpdate(opened(floorState(1)));
      const chests = stage.made.filter((m) => m.kind === "sprite" && String(m.args[2]).startsWith("chest_"));
      const live = chests.filter((m) => !m.destroyed);
      expect(live).toHaveLength(1);
      expect(live[0].texture).toBe("chest_open");
    });

    it("should still pool the next floor's chest, though it has the old floor's entity id", () => {
      const { run, lights } = banded("tower");
      run.handleGameStateUpdate(floorState(1));
      run.handleGameStateUpdate(floorState(2));
      const chest = worldToScreen(650, 150);
      expect(pools(lights).map((l) => (l as { x: number }).x)).toContain(chest.x);
    });
  });
});

describe("BarrowspireScene settlement record (FS-GV8WN R21–R24)", () => {
  const hub = { session_id: "hub-1", world_type: "hub" as const };
  type SettlementPayload = import("@/assets/types/client").SettlementPayload;

  const settlement = (fields: Partial<SettlementPayload> = {}): SettlementPayload => ({
    outcome: "escaped",
    carried: [{ item_id: "i1", entity_id: "e1", name: "Iron Blade", quantity: 1, found: true }],
    lost: [{ item_id: "i2", entity_id: "e2", name: "Health Potion", quantity: 1, reason: "consumed" }],
    experience_gained: 40,
    level_before: 2,
    level_after: 2,
    kills: 3,
    seconds_in_run: 80,
    status: "pending",
    ...fields,
  });

  /** What the scene holds for a settled player's record and the run's end. */
  interface Settling {
    resultHold: import("@/components/resultHold").ResultHold;
    record?: unknown;
    showSettlement(payload: SettlementPayload): void;
    endRun(): void;
    leaveRefused(): void;
    init(): void;
    events: Emitter;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };

  function settlingOnStage(me = player("me", "Aldric", 130, escaped)) {
    const stage = onStage();
    const start = vi.fn();
    Object.assign(stage.run, { scene: { start } });
    stage.run.handleGameStateUpdate(partyState(me));
    const run = stage.run as unknown as Settling;
    const live = () => stage.stage.made.filter((m) => !m.destroyed);
    const shown = () => live().filter((m) => m.kind === "text").map((m) => String(m.args[2]));
    const hit = (name: string) => live().find((m) => (m as { name?: string }).name === name);
    const press = (name: string) => hit(name)?.handlers.pointerdown();
    const held = () => {
      const apply = vi.fn();
      const isHeld = run.resultHold.hold(hub, apply);
      return { isHeld, apply };
    };
    return { ...stage, run, start, shown, hit, press, held };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // the server names the run a record settles; a late confirmation of an earlier run, landing in
  // this one, is not this run's record (FS-GV8WN R20)
  it("should ignore a settlement naming another run, and take one naming this run", () => {
    const { run } = settlingOnStage();
    (run as unknown as { sessionID?: string }).sessionID = "run-2";
    run.showSettlement(settlement({ run_id: "run-1" }));
    expect(run.record).toBeUndefined();
    run.showSettlement(settlement({ run_id: "run-2" }));
    expect(run.record).toBeDefined();
  });

  // FS-TQZ5J § Change: Phase 3 (I-TQZ5J-15, R52, R57): the UI scene draws the record; the run hands it
  // its view and open state through the bridge, and answers its Close
  it("should hand the UI scene its record as data, up on the first and down on its Close's request", () => {
    const { run } = settlingOnStage();
    const { bridge } = uiSceneOn(run, "run", { row: false });
    const told: { view: { status: { text: string } }; open: boolean }[] = [];
    bridge.onScreen({ record: (shown) => void (shown && told.push(shown as never)) });

    run.showSettlement(settlement());
    run.showSettlement(settlement({ status: "confirmed" }));
    bridge.request({ kind: "close", window: "record" });

    expect(told.map((t) => [t.view.status.text, t.open])).toEqual([
      ["Settling…", true],
      ["Settled", true],
      ["Settled", false],
    ]);
  });

  it("should open the record at once on settlement, with what was carried, lost and earned", () => {
    const { run, shown } = settlingOnStage();
    run.showSettlement(settlement());
    for (const line of ["ESCAPED THE BARROW", "Settling…", "Iron Blade", "Found", "Health Potion", "Used up"])
      expect(shown()).toContain(line);
    expect(shown()).toContain("Experience +40 · Level 2");
    expect(shown()).toContain("Slain 3 · 1:20 in the delve");
  });

  it("should change only the status when the confirmed copy arrives", () => {
    const { run, shown } = settlingOnStage();
    run.showSettlement(settlement());
    const before = shown().filter((t) => t !== "Settling…");
    run.showSettlement(settlement({ status: "confirmed" }));
    expect(shown()).toContain("Settled");
    expect(shown()).not.toContain("Settling…");
    expect(shown().filter((t) => t !== "Settled")).toEqual(before);
  });

  it("should leave a closed record closed when the confirmed copy arrives, and show it on reopening", () => {
    const { run, shown, press } = settlingOnStage();
    run.showSettlement(settlement());
    press("close-the-record");
    run.showSettlement(settlement({ status: "confirmed" }));
    expect(shown()).not.toContain("Settled");
    press("settlement");
    expect(shown()).toContain("Settled");
  });

  it("should put the Settlement button after Watch the delve and Leave in the bottom-centre row", () => {
    const { run, hit } = settlingOnStage();
    run.showSettlement(settlement());
    const watch = hit("watch-the-delve")!.args as number[];
    const leave = hit("leave-the-barrow")!.args as number[];
    const record = hit("settlement")!.args as number[];
    // the recording camera is 800 x 600: three buttons left to right 8 apart from 418, the open chat
    // window's clearance at this narrow view, on the Watch button's line (FS-TQZ5J § Change: Batch 6, R123)
    expect([watch, leave, record].map(([x, , w]) => x - w / 2)).toEqual([418, 530, 632]);
    expect([leave[1], record[1]]).toEqual([watch[1], watch[1]]);
    expect(record[1] + record[3] / 2).toBe(600 - 16 - 200);
  });

  it("should keep Leave and the Settlement button as a pair, once Watch is pressed", () => {
    const { run, hit, press } = settlingOnStage();
    run.showSettlement(settlement());
    press("close-the-record");
    press("watch-the-delve");
    expect(hit("watch-the-delve")).toBeUndefined();
    const [leave, , leaveW] = hit("leave-the-barrow")!.args as number[];
    const [record, , recordW] = hit("settlement")!.args as number[];
    expect([leave - leaveW / 2, record - recordW / 2]).toEqual([418, 520]);
  });

  // FS-QPDKN § Change: The party death flow and the spectate switcher, R154: no SETTLEMENT by the dead
  // player's card; it comes with the spectate controls (R158)
  it("should give a dead player no Settlement button while the card's Watch and Leave stand", () => {
    const { run, hit, shown } = settlingOnStage(player("me", "Aldric", 130, dead));
    run.showSettlement(settlement({ outcome: "died" }));
    expect(hit("settlement")).toBeUndefined();
    expect(hit("watch-the-delve")).toBeDefined();
    expect(hit("leave-the-barrow")).toBeDefined();
    expect(shown()).toContain("FALLEN IN THE BARROW");
  });

  it("should close from its Close button and reopen from the Settlement button", () => {
    const { run, shown, press } = settlingOnStage();
    run.showSettlement(settlement());
    press("close-the-record");
    expect(shown()).not.toContain("Iron Blade");
    press("settlement");
    expect(shown()).toContain("Iron Blade");
    // the button toggles: pressed again with the record up, it closes it
    press("settlement");
    expect(shown()).not.toContain("Iron Blade");
  });

  // R23: the run's end (end_game + world_entered(hub)) waits on an open record
  it("should hold the hub at the run's end while the record is open, until it is closed", () => {
    const { run, press, held, sent, start } = settlingOnStage();
    run.showSettlement(settlement());
    run.endRun();
    const { isHeld, apply } = held();
    expect(isHeld).toBe(true);
    expect(apply).not.toHaveBeenCalled();

    press("close-the-record");

    expect(apply).toHaveBeenCalledWith(hub);
    // client-only: nothing goes to the server, and the switch is the handler's, not the scene's
    expect(sent).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("should let the hub in at once at the run's end when the record is closed", () => {
    const { run, press, held } = settlingOnStage();
    run.showSettlement(settlement());
    press("close-the-record");
    run.endRun();
    expect(held().isHeld).toBe(false);
  });

  it("should hold the hub again once the record is reopened", () => {
    const { run, press, held } = settlingOnStage();
    run.showSettlement(settlement());
    press("close-the-record");
    press("settlement");
    expect(held().isHeld).toBe(true);
  });

  it("should not hold the hub a Leave asks for, with the record open", () => {
    const { run, press, held, sent } = settlingOnStage(player("me", "Aldric", 130, dead));
    run.showSettlement(settlement({ outcome: "died" }));
    press("leave-the-barrow");
    expect(sent).toHaveBeenCalledWith(ActionType.LeaveRun, {});
    expect(held().isHeld).toBe(false);
  });

  // R23: reopening the record while a Leave is on its way must not hold the town the player chose
  it("should not hold the hub a pending Leave asks for when the record is reopened", () => {
    const { run, press, held } = settlingOnStage();
    run.showSettlement(settlement());
    press("close-the-record");
    press("leave-the-barrow");
    press("settlement");
    expect(held().isHeld).toBe(false);
  });

  it("should not hold the hub a dead player's pending Leave asks for when the record is reopened", () => {
    const { run, press, held } = settlingOnStage(player("me", "Aldric", 130, dead));
    run.showSettlement(settlement({ outcome: "died" }));
    press("leave-the-barrow");
    press("settlement");
    press("settlement");
    expect(held().isHeld).toBe(false);
  });

  it("should hold the hub again if the Leave is refused while the record is open", () => {
    const { run, press, held } = settlingOnStage(player("me", "Aldric", 130, dead));
    run.showSettlement(settlement({ outcome: "died" }));
    press("leave-the-barrow");
    run.leaveRefused();
    expect(held().isHeld).toBe(true);
  });

  // FS-GV8WN R23, R25: the escaped player's Leave lets the town in as the dead player's does
  it("should not hold the hub an escaped player's Leave asks for, with the record open", () => {
    const { run, press, held, sent } = settlingOnStage();
    run.showSettlement(settlement());
    press("leave-the-barrow");
    expect(sent).toHaveBeenCalledWith(ActionType.LeaveRun, {});
    expect(held().isHeld).toBe(false);
  });

  it("should hold the hub again, and keep the record up, if an escaped player's Leave is refused", () => {
    const { run, press, held, shown, start } = settlingOnStage();
    run.showSettlement(settlement());
    press("leave-the-barrow");
    run.leaveRefused();
    expect(held().isHeld).toBe(true);
    expect(shown()).toContain("Iron Blade");
    expect(start).not.toHaveBeenCalled();
  });

  it("should let a hub held after a refused Leave in from the record's Close once the run has ended", () => {
    const { run, press, held, sent } = settlingOnStage();
    run.showSettlement(settlement());
    press("leave-the-barrow");
    run.leaveRefused();
    run.endRun();
    const { isHeld, apply } = held();
    expect(isHeld).toBe(true);
    // the row is down with the run's end: the record's Close is the way through
    press("close-the-record");
    expect(apply).toHaveBeenCalledWith(hub);
    expect(sent.mock.calls.filter(([action]) => action === ActionType.LeaveRun)).toHaveLength(1);
  });

  // The held hub a Leave lets in is applied through switchWorld, whose stop is synchronous: the
  // scene has stopped (resetRun) before the release returns, and the Leave must not then send
  // leave_run from the hub or leave its pending flag on the stopped scene for the next run.
  it("should send nothing and leave no Leave pending when the Leave's release stops the scene", () => {
    const { run, held, sent } = settlingOnStage(player("me", "Aldric", 130, dead));
    run.init();
    run.showSettlement(settlement({ outcome: "died" }));
    run.endRun();
    held();
    const stopped = vi.fn(() => run.events.emit("shutdown"));
    run.resultHold.hold(hub, stopped);

    // the menu's Leave, or the dead player's card
    (run as unknown as { leaveTheBarrow(): void }).leaveTheBarrow();

    expect(stopped).toHaveBeenCalledWith(hub);
    expect(sent.mock.calls.filter(([action]) => action === ActionType.LeaveRun)).toEqual([]);
    expect((run as unknown as { leavePending: boolean }).leavePending).toBe(false);
  });

  // a run still loading has not heard its end (end_game is held until create), so only the hub the
  // release let in says the Leave is done
  it("should send no leave_run when the Leave lets a held hub in before the run knows it ended", () => {
    const { run, sent } = settlingOnStage();
    run.init();
    run.resultHold.raise();
    run.resultHold.hold(hub, () => run.events.emit("shutdown"));

    (run as unknown as { leaveTheBarrow(): void }).leaveTheBarrow();

    expect(sent.mock.calls.filter(([action]) => action === ActionType.LeaveRun)).toEqual([]);
    expect((run as unknown as { leavePending: boolean }).leavePending).toBe(false);
  });

  it("should start each run with no Leave pending, whatever the last one left", () => {
    const { run } = settlingOnStage();
    (run as unknown as { leavePending: boolean }).leavePending = true;

    run.init();

    expect((run as unknown as { leavePending: boolean }).leavePending).toBe(false);
  });

  // R24: the record replaces the FS-QPDKN result card
  it("should put up no result card when the run ends", () => {
    const { run, shown, stage } = settlingOnStage();
    const before = stage.made.length;
    run.endRun();
    expect(stage.made.length).toBe(before);
    expect(shown().some((t) => /escaped!|you fell|you live|return to the hub/i.test(t))).toBe(false);
  });

  it("should hold nothing at the run's end when no record came", () => {
    const { run, held } = settlingOnStage();
    run.endRun();
    expect(held().isHeld).toBe(false);
  });

  // R22: entering any other world stops the run scene, and the record goes with it
  it("should forget the record and the held world when the scene stops", () => {
    const { run } = settlingOnStage();
    run.init();
    run.showSettlement(settlement());
    run.endRun();
    const apply = vi.fn();
    run.resultHold.hold(hub, apply);

    run.events.emit("shutdown");

    run.resultHold.release();
    expect(apply).not.toHaveBeenCalled();
    expect(run.resultHold.hold(hub, vi.fn())).toBe(false);
    expect(run.record).toBeUndefined();
  });
});

// The run's end pops up with the ESC menu's popup sound, and its buttons sound as the menus' do
// (FS-WDM0X § Change: Menu, dialog and notice sounds, § Pass 2b: the run's end, E1–E7; I-WDM0X-9)
describe("BarrowspireScene the run's end sounds (FS-WDM0X § Pass 2b, I-WDM0X-9)", () => {
  type SettlementPayload = import("@/assets/types/client").SettlementPayload;
  const settlement = (fields: Partial<SettlementPayload> = {}): SettlementPayload => ({
    outcome: "died",
    carried: [{ item_id: "i1", entity_id: "e1", name: "Iron Blade", quantity: 1, found: true }],
    lost: [],
    experience_gained: 40,
    level_before: 2,
    level_after: 2,
    kills: 3,
    seconds_in_run: 80,
    status: "pending",
    ...fields,
  });

  /** What the scene holds for the run's end. */
  interface Ending {
    sessionID?: string;
    showSettlement(payload: SettlementPayload): void;
    endRun(): void;
    leaveRefused(): void;
    relayoutHud(): void;
    containerView: object;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };
  const me = (fields: { escape?: boolean; current_health?: number }) => player("me", "Aldric", 130, fields);
  const ally = (fields: { escape?: boolean; current_health?: number } = {}) => player("ally", "Wenna", 160, fields);

  function endOnStage() {
    const stage = onStage();
    Object.assign(stage.run, { scene: { start: vi.fn() } });
    const run = stage.run as unknown as Ending;
    // the satchel's own re-layout is ContainerView's test
    Object.assign(run.containerView, { relayout: vi.fn() });
    const heard = hearOn(stage.run as unknown as Record<string, unknown>);
    /** A tick with this player as `mine` and the rest of the party as `others`. */
    const tick = (mine: ReturnType<typeof player>, ...others: ReturnType<typeof player>[]) =>
      stage.run.handleGameStateUpdate({ ...partyState(mine), other_players: others } as GameState);
    const hit = (name: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
    const press = (name: string) => hit(name)!.handlers.pointerdown();
    const over = (name: string) => hit(name)!.handlers.pointerover();
    const shown = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    /** A resize: the HUD laid out again at a new width, and back. */
    const resize = () => {
      viewport.set({ width: 1000, height: 600, renderScale: 1 });
      run.relayoutHud();
      viewport.set({ width: 800, height: 600, renderScale: 1 });
      run.relayoutHud();
    };
    return { ...stage, run, heard, tick, hit, press, over, shown, resize };
  }

  afterEach(() => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    vi.restoreAllMocks();
  });

  describe("dialog_open as the end pops up (E1, E2)", () => {
    it.each([
      ["a solo death", dead, "died"],
      ["a solo escape", escaped, "escaped"],
    ] as const)("should chime once as the record opens on %s, and not on its copy, a tick or a resize", (_case, fields, outcome) => {
      const { run, heard, tick, resize } = endOnStage();
      tick(me(fields));
      heard();
      run.showSettlement(settlement({ outcome }));
      expect(heard()).toEqual(["dialog_open"]);

      run.showSettlement(settlement({ outcome, status: "confirmed" }));
      tick(me(fields));
      resize();
      expect(heard()).toEqual([]);
    });

    it("should chime once for a death with a teammate in play, the card first and the record after it", () => {
      const { run, heard, tick, resize, shown } = endOnStage();
      tick(me({}), ally());
      heard();
      tick(me(dead), ally());
      expect(shown().some((t) => /barrow keeps you/i.test(t))).toBe(true);
      expect(heard()).toEqual(["dialog_open"]);

      run.showSettlement(settlement());
      tick(me(dead), ally());
      resize();
      expect(heard()).toEqual([]);
    });

    // FS-QPDKN § Change: The party death flow and the spectate switcher, R151–R153: the card waits for the
    // record's CLOSE, which is heard as the card's dialog_open
    it("should chime once for a death with a teammate in play, the record first, and the card's dialog_open on its CLOSE", () => {
      const { run, heard, tick, press, shown } = endOnStage();
      tick(me({}), ally());
      heard();
      run.showSettlement(settlement());
      expect(heard()).toEqual(["dialog_open"]);

      tick(me(dead), ally());
      tick(me(dead), ally());
      expect(heard()).toEqual([]);
      expect(shown().some((t) => /barrow keeps you/i.test(t))).toBe(false);
      press("close-the-record");
      expect(shown().some((t) => /barrow keeps you/i.test(t))).toBe(true);
      expect(heard()).toEqual(["dialog_open"]);
    });

    it("should chime nothing for a settlement naming another run", () => {
      const { run, heard, tick } = endOnStage();
      tick(me(dead));
      run.sessionID = "run-2";
      heard();
      run.showSettlement(settlement({ run_id: "run-1" }));
      expect(heard()).toEqual([]);
    });

    it("should chime nothing as the run ends under the record", () => {
      const { run, heard, tick } = endOnStage();
      tick(me(dead), ally());
      run.showSettlement(settlement());
      heard();
      run.endRun();
      expect(heard()).toEqual([]);
    });

    it("should chime once for a settlement held while the run loaded, as create hands it over", () => {
      const listeners = new Map<string, (payload: unknown) => void>();
      vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
      vi.spyOn(socketManager, "onError").mockImplementation(() => {});
      vi.spyOn(socketManager, "off").mockImplementation(() => {});
      vi.spyOn(socketManager, "isConnected").mockReturnValue(true);
      vi.spyOn(socketManager, "onConnectionStatusChange").mockReturnValue(() => {});
      vi.spyOn(socketManager, "onGameStateUpdate").mockReturnValue(() => {});
      const { run, heard } = endOnStage();
      const loading = run as unknown as { init(data?: object): void; connectToServer(): void; openHeldMessages(): void };
      loading.init({ sessionID: "run-a" });
      listeners.get("settlement")?.(settlement({ run_id: "run-a" }));
      heard();

      loading.connectToServer();
      loading.openHeldMessages();
      expect(heard()).toEqual(["dialog_open"]);
    });
  });

  describe("SETTLEMENT brings the record back (E3)", () => {
    it("should play dialog_open bringing the record back and menu_click taking it down", () => {
      const { run, heard, tick, press, shown } = endOnStage();
      tick(me(escaped));
      run.showSettlement(settlement({ outcome: "escaped" }));
      press("close-the-record");
      heard();

      press("settlement");
      expect(shown()).toContain("Iron Blade");
      expect(heard()).toEqual(["dialog_open"]);
      press("settlement");
      expect(shown()).not.toContain("Iron Blade");
      expect(heard()).toEqual(["menu_click"]);
    });
  });

  describe("the end's buttons (E4–E6)", () => {
    it.each([
      ["the card's WATCH THE DELVE", dead, "watch-the-delve"],
      ["the card's LEAVE THE BARROW", dead, "leave-the-barrow"],
      ["the row's WATCH THE DELVE", escaped, "watch-the-delve"],
      ["the row's LEAVE THE BARROW", escaped, "leave-the-barrow"],
      ["the row's SETTLEMENT", escaped, "settlement"],
      ["the record's CLOSE", escaped, "close-the-record"],
    ] as const)("should play menu_hover as the pointer comes onto %s", (_case, fields, name) => {
      const { run, heard, tick, over } = endOnStage();
      tick(me(fields), ally());
      run.showSettlement(settlement({ outcome: fields === dead ? "died" : "escaped" }));
      heard();
      over(name);
      expect(heard()).toEqual(["menu_hover"]);
    });

    it.each([
      ["the card's WATCH THE DELVE", dead, "watch-the-delve", ActionType.LeaveRun, 0],
      ["the card's LEAVE THE BARROW", dead, "leave-the-barrow", ActionType.LeaveRun, 1],
      ["the row's WATCH THE DELVE", escaped, "watch-the-delve", ActionType.LeaveRun, 0],
      ["the row's LEAVE THE BARROW", escaped, "leave-the-barrow", ActionType.LeaveRun, 1],
    ] as const)("should play menu_click once on a press of %s, beside what it does", (_case, fields, name, action, sends) => {
      const { heard, tick, press, sent } = endOnStage();
      tick(me(fields), ally());
      heard();
      press(name);
      expect(heard()).toEqual(["menu_click"]);
      expect(sent.mock.calls.filter(([a]) => a === action)).toHaveLength(sends);
    });

    it("should play menu_click on the record's CLOSE, the record taken down", () => {
      const { run, heard, tick, press, shown } = endOnStage();
      tick(me(escaped));
      run.showSettlement(settlement({ outcome: "escaped" }));
      heard();
      press("close-the-record");
      expect(shown()).not.toContain("Iron Blade");
      expect(heard()).toEqual(["menu_click"]);
    });

    it("should give the dead watcher's corner LEAVE THE BARROW its hover and its click", () => {
      const { heard, tick, press, over } = endOnStage();
      tick(me(dead), ally());
      press("watch-the-delve");
      heard();
      over("leave-the-barrow");
      press("leave-the-barrow");
      expect(heard()).toEqual(["menu_hover", "menu_click"]);
    });

    it.each([
      ["the card's", dead],
      ["the row's", escaped],
    ] as const)("should give %s dimmed LEAVE THE BARROW no hover, and menu_error alone for its press", (_case, fields) => {
      const { heard, tick, press, over, sent } = endOnStage();
      tick(me(fields), ally());
      press("leave-the-barrow");
      heard();
      over("leave-the-barrow");
      press("leave-the-barrow");
      expect(heard()).toEqual(["menu_error"]);
      expect(sent.mock.calls.filter(([a]) => a === ActionType.LeaveRun)).toHaveLength(1);
    });

    // the owner, 2026-11-14: 「所有hover鼠標都要維持骨手」 (FS-KYPQ9 § Change: Every hover keeps the bone
    // hand). No cursor of its own, so none is left behind over a Leave dimmed under the pointer.
    it.each([
      ["the card's", dead],
      ["the row's", escaped],
    ] as const)("should keep the bone hand over %s LEAVE THE BARROW, live, dimmed and handed back", (_case, fields) => {
      const { run, tick, press, hit } = endOnStage();
      tick(me(fields), ally());
      const leave = hit("leave-the-barrow") as unknown as Made & { input: { cursor: unknown } };
      Object.assign(leave, { input: { cursor: false } });
      expect(JSON.stringify(leave.last["setInteractive"] ?? [])).not.toMatch(/useHandCursor|cursor/);

      press("leave-the-barrow");
      expect(leave.input.cursor).toBe(false);
      run.leaveRefused();
      expect(leave.input.cursor).toBe(false);
    });
  });

  // the owner, 2026-11-14 (「Auto-close the party panel when the card appears」): the panel draws over the
  // end's pieces now, so the end's first popup shuts it, silently (FS-WDM0X S4)
  describe("the run's end closes the party panel (FS-TQZ5J § Change: Phase 2, Amendment B1, R47)", () => {
    /** The run's end on stage with the UI scene's party panel over it, on the app's party store, open. */
    function endWithPanel() {
      const env = endOnStage();
      const party = partyPanelOver(env.run, "run", (w) => partyPanelOn(w.blocked, w.wrapper, usePartyStore));
      party.pressT();
      expect(party.panel.isOpen()).toBe(true);
      env.heard();
      return { ...env, party };
    }

    afterEach(() => usePartyStore.setState({ panelOpen: false }));

    it.each([
      ["a solo death", dead, "died"],
      ["a solo escape", escaped, "escaped"],
    ] as const)("should close it as the record opens on %s, with the end's dialog_open alone", (_case, fields, outcome) => {
      const { run, heard, tick, party } = endWithPanel();
      tick(me(fields));
      run.showSettlement(settlement({ outcome }));
      expect(party.panel.isOpen()).toBe(false);
      expect(heard()).toEqual(["dialog_open"]);
    });

    it("should close it as the card appears for a death with a teammate in play, the record after it closing nothing", () => {
      const { run, heard, tick, party } = endWithPanel();
      tick(me({}), ally());
      tick(me(dead), ally());
      expect(party.panel.isOpen()).toBe(false);
      expect(heard()).toEqual(["dialog_open"]);

      // reopened between the card and the record: the end popped up once
      party.pressT();
      expect(heard()).toEqual(["party_open"]);
      run.showSettlement(settlement());
      expect(party.panel.isOpen()).toBe(true);
      expect(heard()).toEqual([]);
    });

    it("should close it as the record comes first for a death with a teammate in play", () => {
      const { run, heard, tick, party } = endWithPanel();
      tick(me({}), ally());
      run.showSettlement(settlement());
      expect(party.panel.isOpen()).toBe(false);
      expect(heard()).toEqual(["dialog_open"]);
    });

    it("should let T reopen it while the run goes on, a copy, a resize and SETTLEMENT leaving it open", () => {
      const { run, heard, tick, party, press, resize } = endWithPanel();
      tick(me(escaped), ally());
      run.showSettlement(settlement({ outcome: "escaped" }));
      party.pressT();
      expect(party.panel.isOpen()).toBe(true);
      heard();

      run.showSettlement(settlement({ outcome: "escaped", status: "confirmed" }));
      resize();
      press("close-the-record");
      press("settlement");
      expect(party.panel.isOpen()).toBe(true);
      expect(heard()).toEqual(["menu_click", "dialog_open"]);
    });

    it("should refuse T after the run ends, as before", () => {
      const { run, tick, party } = endWithPanel();
      tick(me(dead));
      run.showSettlement(settlement());
      run.endRun();
      party.pressT();
      expect(party.panel.isOpen()).toBe(false);
    });

    it("should change nothing as the end pops up with the panel shut", () => {
      const { run, heard, tick, party } = endWithPanel();
      party.pressT();
      heard();
      tick(me(dead));
      run.showSettlement(settlement());
      expect(party.panel.isOpen()).toBe(false);
      expect(heard()).toEqual(["dialog_open"]);
    });

    // § Change: Phase 3, R58 (the review of phase 3, MED-3): the run asks the UI scene to clear its moved
    // windows as the end pops up, so their grounds take no press meant for the end's buttons; silently
    // (FS-WDM0X S4), once
    describe("and the moved windows with it (FS-TQZ5J § Change: Phase 3, R58)", () => {
      /** The run's end on stage with the UI scene's gear overlay, container view and controls panel open over it. */
      function endWithWindows() {
        const env = endWithPanel();
        const open = { inventory: false, character: false, container: undefined as string | undefined };
        gearOver(env.run, "run", () => ({
          gear: {
            isInventoryOpen: () => open.inventory,
            isCharacterOpen: () => open.character,
            stashOpen: () => false,
            toggle: () => (open.inventory = !open.inventory),
            toggleCharacter: () => (open.character = !open.character),
            hide: () => {
              const was = open.inventory || open.character;
              open.inventory = open.character = false;
              return was;
            },
            equipKey: () => false,
            openStash: () => false,
            seen: () => {},
            setCharacterLevel: () => {},
            taken: () => {},
            roomForOne: () => true,
            release: () => {},
          },
          container: {
            get isOpen() {
              return open.container !== undefined;
            },
            get entityId() {
              return open.container;
            },
            open: (id: string) => void (open.container = id),
            close: () => void (open.container = undefined),
            closeNow: () => void (open.container = undefined),
            setItems: () => {},
            lootFirst: () => {},
            pointerMove: () => {},
            pointerDown: () => false,
            owns: () => false,
            relayout: () => {},
            destroy: () => {},
          },
        }));
        const side = uiSceneOn(env.run, "run", { row: false });
        /** The gear's two panels, the container view and the controls panel, opened as the player opens them. */
        const reopen = () => {
          side.gearKey("inventory");
          side.gearKey("character");
          side.bridge.container({ kind: "open", entityId: "chest-1", container: "chest" });
          side.controls.toggle();
        };
        const standing = () => ({
          inventory: side.gear.isInventoryOpen(),
          character: side.gear.isCharacterOpen(),
          container: side.bridge.ui.container,
          controls: side.controls.isOpen(),
        });
        const ALL_OPEN = { inventory: true, character: true, container: "chest-1", controls: true };
        const NONE_OPEN = { inventory: false, character: false, container: undefined, controls: false };
        return { ...env, reopen, standing, ALL_OPEN, NONE_OPEN };
      }

      it.each([
        ["a solo death", dead, "died"],
        ["a solo escape", escaped, "escaped"],
      ] as const)("should close them as the record opens on %s, with the end's dialog_open alone", (_case, fields, outcome) => {
        const { run, heard, tick, reopen, standing, ALL_OPEN, NONE_OPEN } = endWithWindows();
        tick(me(fields));
        reopen();
        expect(standing()).toEqual(ALL_OPEN);
        heard();
        run.showSettlement(settlement({ outcome }));
        expect(standing()).toEqual(NONE_OPEN);
        expect(heard()).toEqual(["dialog_open"]);
      });

      it("should close them as the card appears for a death with a teammate in play, the record after it closing nothing", () => {
        const { run, heard, tick, reopen, standing, ALL_OPEN, NONE_OPEN } = endWithWindows();
        tick(me({}), ally());
        reopen();
        heard();
        tick(me(dead), ally());
        expect(standing()).toEqual(NONE_OPEN);
        expect(heard()).toEqual(["dialog_open"]);

        // reopened between the card and the record: the end popped up once
        reopen();
        heard();
        run.showSettlement(settlement());
        tick(me(dead), ally());
        expect(standing()).toEqual(ALL_OPEN);
        expect(heard()).toEqual([]);
      });

      // the review of phase 3 (MED-2): an escaped player whose teammate is still in play is offered
      // WATCH THE DELVE and LEAVE THE BARROW in the row with no card and no record yet: the windows open
      // at the door step aside then too, playing nothing; dialog_open waits for the end. FS-84N1G R21 (the
      // integrator): the party panel closes there too, silently, as R47 closes it at the end
      it("should close them and the party panel as an escape with a teammate in play offers WATCH and LEAVE, silently", () => {
        const { tick, heard, reopen, standing, party, NONE_OPEN } = endWithWindows();
        tick(me({}), ally());
        reopen();
        heard();
        tick(me(escaped), ally());
        expect(standing()).toEqual(NONE_OPEN);
        expect(party.panel.isOpen()).toBe(false);
        expect(heard()).toEqual([]);
      });

      it("should let T reopen the party panel at the door, the ticks after it leaving it open", () => {
        const { tick, party } = endWithWindows();
        tick(me({}), ally());
        tick(me(escaped), ally());
        party.pressT();
        tick(me(escaped), ally());
        expect(party.panel.isOpen()).toBe(true);
      });

      it("should close them once at the door, each tick after it closing nothing; the record then pops the end up once", () => {
        const { run, tick, heard, reopen, standing, party, ALL_OPEN, NONE_OPEN } = endWithWindows();
        tick(me({}), ally());
        tick(me(escaped), ally());
        reopen();
        heard();
        tick(me(escaped), ally());
        tick(me(escaped), ally());
        expect(standing()).toEqual(ALL_OPEN);
        expect(heard()).toEqual([]);

        run.showSettlement(settlement({ outcome: "escaped" }));
        expect(standing()).toEqual(NONE_OPEN);
        expect(party.panel.isOpen()).toBe(false);
        expect(heard()).toEqual(["dialog_open"]);
      });

      it("should leave them reopened through a copy, a tick and a resize after the end", () => {
        const { run, heard, tick, reopen, standing, ALL_OPEN, resize } = endWithWindows();
        tick(me(escaped));
        run.showSettlement(settlement({ outcome: "escaped" }));
        reopen();
        heard();
        run.showSettlement(settlement({ outcome: "escaped", status: "confirmed" }));
        tick(me(escaped));
        resize();
        expect(standing()).toEqual(ALL_OPEN);
        expect(heard()).toEqual([]);
      });
    });
  });
});


// The owner, 2026-11-14: a player who dies while a teammate is still in play sees only the settlement record;
// its CLOSE brings the card with WATCH and LEAVE, and no SETTLEMENT stands while it is up (FS-QPDKN § Change:
// The party death flow and the spectate switcher, R150–R156; I-QPDKN-12)
describe("BarrowspireScene the party death flow (FS-QPDKN § Change: The party death flow and the spectate switcher)", () => {
  type SettlementPayload = import("@/assets/types/client").SettlementPayload;
  const settlement = (fields: Partial<SettlementPayload> = {}): SettlementPayload => ({
    outcome: "died",
    carried: [{ item_id: "i1", entity_id: "e1", name: "Iron Blade", quantity: 1, found: true }],
    lost: [],
    experience_gained: 40,
    level_before: 2,
    level_after: 2,
    kills: 3,
    seconds_in_run: 80,
    status: "pending",
    ...fields,
  });

  interface Dying {
    showSettlement(payload: SettlementPayload): void;
    endRun(): void;
    relayoutHud(): void;
    resultHold: import("@/components/resultHold").ResultHold;
    watchedPlayerId?: string;
    cycleWatched(step: 1 | -1): void;
    containerView: object;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };
  const me = (fields: { escape?: boolean; current_health?: number } = {}) => player("me", "Aldric", 130, fields);
  const ally = (fields: { escape?: boolean; current_health?: number } = {}) => player("ally", "Wenna", 160, fields);
  const brom = (fields: { escape?: boolean; current_health?: number } = {}) => player("brom", "Brom", 200, fields);

  function dyingOnStage() {
    const stage = onStage();
    Object.assign(stage.run, { scene: { start: vi.fn() } });
    const run = stage.run as unknown as Dying;
    Object.assign(run.containerView, { relayout: vi.fn() });
    const heard = hearOn(stage.run as unknown as Record<string, unknown>);
    const tick = (mine: ReturnType<typeof player>, ...others: ReturnType<typeof player>[]) =>
      stage.run.handleGameStateUpdate({ ...partyState(mine), other_players: others } as GameState);
    const hit = (name: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
    const press = (name: string) => hit(name)!.handlers.pointerdown();
    const release = (name: string) => hit(name)!.handlers.pointerup();
    const over = (name: string) => hit(name)!.handlers.pointerover();
    const shown = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    const card = () => shown().some((t) => /barrow keeps you/i.test(t));
    const record = () => shown().includes("FALLEN IN THE BARROW") || shown().includes("ESCAPED THE BARROW");
    /** The death as the server sends it: the record on the tick, the state that shows it after (FS-GV8WN R19). */
    const die = (...others: ReturnType<typeof player>[]) => {
      tick(me(), ...others);
      heard();
      run.showSettlement(settlement());
      tick(me(dead), ...others);
    };
    return { ...stage, run, heard, tick, hit, press, release, over, shown, card, record, die };
  }

  afterEach(() => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    vi.restoreAllMocks();
  });

  describe("the record first, its CLOSE brings the card (R151–R156; I-QPDKN-12)", () => {
    it("should show the record alone on the death: one dialog_open, no card and no button", () => {
      const { die, heard, card, record, hit } = dyingOnStage();
      die(ally());
      expect(record()).toBe(true);
      expect(card()).toBe(false);
      for (const name of ["watch-the-delve", "leave-the-barrow", "settlement"]) expect(hit(name)).toBeUndefined();
      expect(heard()).toEqual(["dialog_open"]);
    });

    it("should bring the card with WATCH and LEAVE on CLOSE, heard as dialog_open alone, and no SETTLEMENT by it", () => {
      const { die, heard, press, card, record, hit, tick } = dyingOnStage();
      die(ally());
      heard();
      press("close-the-record");
      expect(record()).toBe(false);
      expect(card()).toBe(true);
      expect(hit("watch-the-delve")).toBeDefined();
      expect(hit("leave-the-barrow")).toBeDefined();
      expect(hit("settlement")).toBeUndefined();
      expect(heard()).toEqual(["dialog_open"]);
      // the ticks after it change nothing and play nothing
      tick(me(dead), ally());
      expect(card()).toBe(true);
      expect(hit("settlement")).toBeUndefined();
      expect(heard()).toEqual([]);
    });

    it("should leave the barrow from the card's LEAVE, as today", () => {
      const { die, press, sent, heard } = dyingOnStage();
      die(ally());
      press("close-the-record");
      heard();
      press("leave-the-barrow");
      expect(sent).toHaveBeenCalledWith(ActionType.LeaveRun, {});
      expect(heard()).toEqual(["menu_click"]);
    });

    it("should put the card up at once, chiming the end, when the death shows before any record", () => {
      const { tick, heard, card, run, press, shown } = dyingOnStage();
      tick(me(), ally());
      heard();
      tick(me(dead), ally());
      expect(card()).toBe(true);
      expect(heard()).toEqual(["dialog_open"]);
      // the late record opens over it, silently; its close brings nothing more
      run.showSettlement(settlement());
      expect(shown()).toContain("FALLEN IN THE BARROW");
      expect(heard()).toEqual([]);
      press("close-the-record");
      expect(heard()).toEqual(["menu_click"]);
      expect(card()).toBe(true);
    });

    it("should bring no card on CLOSE once nobody is left in play, nor once the run has ended", () => {
      const lonely = dyingOnStage();
      lonely.die(ally());
      lonely.tick(me(dead), ally(escaped));
      lonely.heard();
      lonely.press("close-the-record");
      expect(lonely.card()).toBe(false);
      expect(lonely.heard()).toEqual(["menu_click"]);

      const ended = dyingOnStage();
      ended.die(ally());
      ended.run.endRun();
      ended.heard();
      ended.press("close-the-record");
      expect(ended.card()).toBe(false);
      expect(ended.heard()).toEqual(["menu_click"]);
    });

    it.each([
      ["a solo death", dead, "died"],
      ["a solo escape", escaped, "escaped"],
    ] as const)("should keep %s as today: the record alone, its CLOSE menu_click and no card", (_case, fields, outcome) => {
      const { tick, run, heard, press, card, record } = dyingOnStage();
      tick(me());
      heard();
      run.showSettlement(settlement({ outcome }));
      tick(me(fields));
      expect(record()).toBe(true);
      expect(heard()).toEqual(["dialog_open"]);
      press("close-the-record");
      expect(card()).toBe(false);
      expect(heard()).toEqual(["menu_click"]);
    });

    it("should keep the escaped player's offer as today: WATCH, LEAVE and SETTLEMENT 200 above the bottom margin", () => {
      const { tick, run, hit, press } = dyingOnStage();
      tick(me(), ally());
      run.showSettlement(settlement({ outcome: "escaped" }));
      tick(me(escaped), ally());
      press("close-the-record");
      const rects = ["watch-the-delve", "leave-the-barrow", "settlement"].map((n) => hit(n)!.args as number[]);
      expect(rects.map(([x, , w]) => x - w / 2)).toEqual([418, 530, 632]);
      for (const [, y, , h] of rects) expect(y + h / 2).toBe(600 - 16 - 200);
    });
  });

  describe("the spectate controls (R157–R167; I-QPDKN-13)", () => {
    /** The death, its record closed, the card's WATCH pressed: spectating `first` of `others`. */
    function watching(...others: ReturnType<typeof player>[]) {
      const env = dyingOnStage();
      const party = others.length ? others : [ally()];
      env.die(...party);
      env.press("close-the-record");
      env.press("watch-the-delve");
      return { ...env, party };
    }
    const rect = (env: ReturnType<typeof dyingOnStage>, name: string) => {
      const [x, y, width, height] = env.hit(name)!.args as number[];
      return { x: x - width / 2, y: y - height / 2, width, height };
    };
    const switcherAt = (env: ReturnType<typeof dyingOnStage>) =>
      (env.run as unknown as { switcher?: { piece: { rect(): { x: number; y: number; width: number; height: number } } } }).switcher?.piece.rect();
    const names = (env: ReturnType<typeof dyingOnStage>) =>
      env.stage.made.filter((m) => m.kind === "text" && !m.destroyed && isSwitcherWords(m)).map((m) => String(m.args[2]));

    it("should walk the whole flow: death, the record alone, CLOSE, the card without SETTLEMENT, WATCH, the row and the switcher", () => {
      const env = dyingOnStage();
      env.die(ally());
      expect([env.record(), env.card(), env.hit("settlement")]).toEqual([true, false, undefined]);
      env.press("close-the-record");
      expect([env.record(), env.card(), env.hit("settlement")]).toEqual([false, true, undefined]);
      env.heard();
      env.press("watch-the-delve");
      expect(env.heard()).toEqual(["menu_click"]);
      expect(env.card()).toBe(false);
      expect(env.run.watchedPlayerId).toBe("ally");
      // LEAVE then SETTLEMENT, side by side, their bottom 70 above the view's (800 x 600 here)
      const leave = rect(env, "leave-the-barrow");
      const settle = rect(env, "settlement");
      expect([leave.x, settle.x]).toEqual([418, 418 + 94 + 8]);
      expect([leave.y + leave.height, settle.y + settle.height]).toEqual([600 - 70, 600 - 70]);
      // the switcher 8 over them, naming the watched teammate; nothing at the top centre
      expect(names(env)).toEqual(["Wenna"]);
      const sw = switcherAt(env)!;
      expect(sw.y + sw.height).toBe(leave.y - 8);
      expect(env.shown().some((t) => /Tab: next/i.test(t))).toBe(false);
      expect(env.hit("watch-previous")).toBeDefined();
      expect(env.hit("watch-next")).toBeDefined();
      // one LEAVE only: the corner button is gone
      expect(env.stage.made.filter((m) => !m.destroyed && (m as { name?: string }).name === "leave-the-barrow")).toHaveLength(1);
    });

    it("should reopen the record from SETTLEMENT and, closed, return to spectating with no card", () => {
      const env = watching();
      const before = switcherAt(env);
      env.heard();
      env.press("settlement");
      expect(env.record()).toBe(true);
      expect(env.heard()).toEqual(["dialog_open"]);
      env.press("close-the-record");
      expect(env.heard()).toEqual(["menu_click"]);
      expect([env.record(), env.card()]).toEqual([false, false]);
      expect(env.run.watchedPlayerId).toBe("ally");
      // SETTLEMENT's own close too
      env.press("settlement");
      env.press("settlement");
      expect(env.card()).toBe(false);
      expect(env.heard()).toEqual(["dialog_open", "menu_click"]);
      expect(names(env)).toEqual(["Wenna"]);
      expect(switcherAt(env)).toEqual(before);
      expect(env.hit("leave-the-barrow")).toBeDefined();
    });

    it("should go to the next teammate on ► and Tab, the previous on ◄, round at either end", () => {
      const env = watching(ally(), brom(), player("cora", "Cora", 240));
      const seen = () => env.run.watchedPlayerId;
      expect(seen()).toBe("ally");
      env.release("watch-next");
      expect(seen()).toBe("brom");
      expect(names(env)).toEqual(["Brom"]);
      env.run.cycleWatched(1);
      expect(seen()).toBe("cora");
      env.release("watch-next");
      expect(seen()).toBe("ally");
      env.release("watch-previous");
      expect(seen()).toBe("cora");
      env.release("watch-previous");
      expect(seen()).toBe("brom");
    });

    it("should play menu_hover on a live arrow and menu_click on its release, once each; Tab plays nothing", () => {
      const env = watching(ally(), brom());
      env.heard();
      env.over("watch-next");
      env.release("watch-next");
      env.over("watch-previous");
      env.release("watch-previous");
      expect(env.heard()).toEqual(["menu_hover", "menu_click", "menu_hover", "menu_click"]);
      env.run.cycleWatched(1);
      expect(env.heard()).toEqual([]);
    });

    it("should grey both arrows with one teammate in play: no hover, menu_error on a press, nothing changes", () => {
      const env = watching(ally(), brom(dead));
      env.heard();
      for (const name of ["watch-next", "watch-previous"]) {
        env.hit(name)!.handlers.pointerover?.();
        env.release(name);
      }
      expect(env.heard()).toEqual(["menu_error", "menu_error"]);
      expect(env.run.watchedPlayerId).toBe("ally");
      // live again once two are in play
      env.tick(me(dead), ally(), brom());
      env.heard();
      env.release("watch-next");
      expect(env.heard()).toEqual(["menu_click"]);
      expect(env.run.watchedPlayerId).toBe("brom");
    });

    it("should draw the watched name over everything else the switcher draws (the owner, 「箭頭中間沒看到觀看者的名字」)", () => {
      const env = watching(ally(), brom());
      const from = env.stage.made.length;
      env.release("watch-next");
      const drawn = env.stage.made.slice(from).filter((m) => !m.destroyed);
      // the order Phaser renders them in: DisplayList.depthSort, a stable sort by depth, ties in the order made
      const order = drawn
        .map((m, i) => ({ m, i, depth: (m as { depth?: number }).depth ?? 0 }))
        .sort((a, b) => a.depth - b.depth || a.i - b.i)
        .map(({ m }) => m);
      const name = order.findIndex((m) => m.kind === "text" && String(m.args[2]) === "Brom" && isSwitcherWords(m));
      expect(name).toBeGreaterThanOrEqual(0);
      const paints = order.flatMap((m, i) => (m.kind === "graphics" ? [i] : []));
      expect(paints.length).toBeGreaterThan(0);
      for (const at of paints) expect(at).toBeLessThan(name);
    });

    it("should draw it bare: the name in watchedName, the arrows amber triangles with no backing or outline, bright under the pointer (the owner, 2026-11-14)", () => {
      const env = watching(ally(), brom());
      const from = env.stage.made.length;
      env.release("watch-next");
      const drawn = env.stage.made.slice(from).filter((m) => !m.destroyed);
      const name = drawn.find((m) => m.kind === "text" && String(m.args[2]) === "Brom" && isSwitcherWords(m))!;
      expect((name.args[3] as { color: string }).color).toBe(toCss(palette.watchedName));
      const paints = drawn.filter((m) => m.kind === "graphics");
      expect(paints).toHaveLength(2);
      for (const g of paints) {
        expect(g.calls).not.toContain("fillRoundedRect");
        expect(g.calls).not.toContain("strokeRoundedRect");
        expect(g.calls).not.toContain("fillRect");
        expect(g.calls).toContain("fillTriangle");
        expect(g.last["fillStyle"]).toEqual([palette.interactable, 1]);
      }
      // each press area the framed arrow's size: 28 by the switcher's 28
      for (const n of ["watch-previous", "watch-next"]) {
        const zone = env.hit(n)!;
        expect(zone.kind).toBe("zone");
        expect(zone.args.slice(2)).toEqual([28, 28]);
      }
      env.over("watch-next");
      expect(paints.map((g) => g.last["fillStyle"])).toContainEqual([palette.interactableBright, 1]);
      env.hit("watch-next")!.handlers.pointerout();
      for (const g of paints) expect(g.last["fillStyle"]).toEqual([palette.interactable, 1]);
    });

    it("should draw greyed arrows faint, with no outline", () => {
      const env = watching(ally(), brom(dead));
      const paints = env.stage.made.filter((m) => m.kind === "graphics" && !m.destroyed && m.calls.includes("fillTriangle") && m.depth === 1000);
      const greyed = paints.filter((g) => JSON.stringify(g.last["fillStyle"]) === JSON.stringify([palette.hudFaint, 0.45]));
      expect(greyed).toHaveLength(2);
      for (const g of greyed) expect(g.calls).not.toContain("strokeRoundedRect");
    });

    // the owner, 「觀看時沒有燈光很暗 但被觀看的玩家本身是有燈光的」 and 「觀看時應該會跟被觀看的人一模壹樣的視野狀態」
    // (2026-11-14): the torch and the occluders' fade ride on the watched teammate, and jump on a switch
    describe("through the watched teammate's eyes", () => {
      const lit = (env: ReturnType<typeof dyingOnStage>) => {
        const run = env.run as unknown as {
          lightMap?: unknown;
          occluders: { update(figure: unknown, delta: number): void };
          otherPlayersPos: Map<string, { x: number; y: number }>;
          otherPlayers: Map<string, unknown>;
          updateLighting(time: number, delta: number): void;
        };
        const carry = vi.fn();
        run.lightMap = { carry, update: vi.fn() };
        const fade = vi.spyOn(run.occluders, "update").mockImplementation(() => {});
        return { run, carry, fade };
      };

      it("should carry the torch and fade the occluders at the watched teammate's drawn position, and jump to the next on ►", () => {
        const env = watching(ally(), brom());
        const { run, carry, fade } = lit(env);
        // the drawn position is the world position's iso projection, never the world position itself:
        // the torch rides on the figure as drawn, as the player's own does (`self.x`, `self.y`)
        const drawnAt = (id: string, x: number, y: number) =>
          Object.assign(run.otherPlayers.get(id) as { x: number; y: number }, { x, y });
        drawnAt("ally", 412, 233);
        drawnAt("brom", 655, 301);
        run.updateLighting(0, 16);
        expect(carry).toHaveBeenLastCalledWith({ x: 412, y: 233 });
        expect(carry).not.toHaveBeenCalledWith(run.otherPlayersPos.get("ally"));
        const figure = fade.mock.calls.at(-1)![0] as { bounds: unknown; depth: unknown } | null;
        expect(figure).not.toBeNull();
        env.release("watch-next");
        drawnAt("brom", 655, 301);
        run.updateLighting(16, 16);
        expect(carry).toHaveBeenLastCalledWith({ x: 655, y: 301 });
        expect(carry).not.toHaveBeenCalledWith(null);
      });

      it("should let the torch fade before WATCH, with nobody watched", () => {
        const env = dyingOnStage();
        env.die(ally());
        const { run, carry } = lit(env);
        (run as unknown as { player?: { visible: boolean } }).player = { visible: false } as never;
        run.updateLighting(0, 16);
        expect(carry).toHaveBeenLastCalledWith(null);
      });
    });

    it("should keep no cursor of their own on the arrows: the bone hand stays", () => {
      const env = watching(ally(), brom());
      for (const name of ["watch-next", "watch-previous"])
        expect(JSON.stringify(env.hit(name)!.last["setInteractive"] ?? [])).not.toMatch(/useHandCursor|cursor/);
    });

    it.each([
      // the name alone, "Wenna" 35 wide on the stand-in, + 76 (the owner, 「觀看時中間名字不用顯示watching了」, 2026-11-14)
      [1080, { leave: [418, 612], settle: [520, 612], switcher: [486, 576, 111] }],
      [1280, { leave: [517, 612], settle: [619, 612], switcher: [585, 576, 111] }],
    ] as const)("should stand the row and the switcher at logical width %i as pinned, clear of the chat (R158, R159, R167)", (width, at) => {
      const env = watching();
      viewport.set({ width, height: 720, renderScale: 1 });
      env.run.relayoutHud();
      const leave = rect(env, "leave-the-barrow");
      const settle = rect(env, "settlement");
      const sw = switcherAt(env)!;
      expect([leave.x, leave.y, leave.width, leave.height]).toEqual([...at.leave, 94, 38]);
      expect([settle.x, settle.y, settle.width, settle.height]).toEqual([...at.settle, 144, 38]);
      expect([sw.x, sw.y, sw.width, sw.height]).toEqual([...at.switcher, 28]);
      for (const r of [leave, settle, sw]) expect(r.x).toBeGreaterThanOrEqual(418);
    });

    it("should take the row and the switcher down at the run's end, playing nothing", () => {
      const env = watching(ally(), brom());
      env.heard();
      env.run.endRun();
      expect(names(env)).toEqual([]);
      for (const name of ["leave-the-barrow", "settlement", "watch-next", "watch-previous"]) expect(env.hit(name)).toBeUndefined();
      expect(env.heard()).toEqual([]);
    });

    it("should dim the row's LEAVE while a leave is pending, menu_error on a second press", () => {
      const env = watching();
      env.press("leave-the-barrow");
      env.heard();
      env.press("leave-the-barrow");
      expect(env.heard()).toEqual(["menu_error"]);
      expect(env.sent.mock.calls.filter(([a]) => a === ActionType.LeaveRun)).toHaveLength(1);
    });
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
    resetRun(end: "shutdown" | "destroy"): void;
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
    run.resetRun("shutdown");
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
    fallPending: boolean;
    leavePending: boolean;
    bindRunInput(): void;
    sendMovementIntent(vx: number, vy: number): void;
    canSendMove(): boolean;
    fallRefused(info: { message?: string }): void;
    endRun(): void;
    resetRun(end: "shutdown" | "destroy"): void;
  }

  const dead = { current_health: 0 };
  const escaped = { escape: true };

  function menuOnStage(me: ReturnType<typeof player> | null = player("me", "Aldric", 130)) {
    const stage = onStage();
    const run = stage.run as unknown as Menued;
    const keys = { esc: key(), enter: key(), one: key(), two: key() };
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
    /** One frame of the UI scene: the keys pressed since the last, the arrows the run's own cursors stand in for. */
    const frame = () => {
      const arrows = (run as unknown as { cursors?: Record<"left" | "right", FakeKey> }).cursors;
      uiFrame(run, { ...keys, left: arrows?.left, right: arrows?.right });
    };
    const press = (k: FakeKey) => {
      k.justDown = true;
      frame();
    };
    const option = (id: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === `menu-${id}` && !m.destroyed);
    const pick = (id: string) => option(id)?.handlers.pointerup();
    const labels = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    const sentOf = (action: string) => stage.sent.mock.calls.filter(([a]) => a === action);
    const hit = (name: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
    return { ...stage, run, keys, keyHandlers, pointerHandlers, frame, press, option, pick, labels, sentOf, hit };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should open the menu on ESC, with Fall where you stand and Back for a player in play", () => {
    const { run, keys, press, option, labels } = menuOnStage();
    press(keys.esc);

    expect(menuOver(run)).toBeDefined();
    expect(option("fall")).toBeDefined();
    expect(option("back")).toBeDefined();
    expect(labels()).toContain("Fall where you stand  [1]");
    expect(labels()).toContain("Back  [Esc]");
  });

  it("should close an open party panel on ESC before it opens the menu (FS-R82NV § Change C2)", () => {
    const { run, keys, press } = menuOnStage();
    let open = true;
    // the party panel is the UI scene's (FS-TQZ5J § Change: Phase 2: the party, R39)
    partyPanelOver(run, "run", () => ({
      isOpen: () => open,
      close: () => {
        const was = open;
        open = false;
        return was;
      },
      toggle: vi.fn(),
      relayout: vi.fn(),
      keepsField: () => false,
      destroy: vi.fn(),
    }));
    press(keys.esc);
    expect(open).toBe(false);
    expect(menuOver(run)).toBeUndefined();
    press(keys.esc);
    expect(menuOver(run)).toBeDefined();
  });

  it("should close the menu on a second ESC, and on Back, taking its hit areas with it", () => {
    const { run, keys, press, option, pick } = menuOnStage();
    press(keys.esc);
    const fall = option("fall");
    press(keys.esc);
    expect(menuOver(run)).toBeUndefined();
    expect(fall?.destroyed).toBe(true);

    press(keys.esc);
    pick("back");
    expect(menuOver(run)).toBeUndefined();
    expect(option("fall")).toBeUndefined();
  });

  it.each([
    ["dead", dead, ["leave", "back"], "Leave the barrow  [1]"],
    // an escaped player may leave too: settled at their escape (FS-GV8WN R16)
    ["escaped", escaped, ["leave", "back"], "Leave the barrow  [1]"],
  ])("should offer a %s player %j", (_, me, ids, label) => {
    const { keys, press, option, labels } = menuOnStage(player("me", "Aldric", 130, me));
    press(keys.esc);
    for (const id of ["fall", "leave", "back"])
      expect(option(id) !== undefined).toBe(ids.includes(id));
    expect(labels()).toContain(label);
  });

  it("should do nothing on ESC once the run has ended", () => {
    const { run, keys, press } = menuOnStage();
    run.endRun();
    press(keys.esc);
    expect(menuOver(run)).toBeUndefined();
  });


  // FS-3EBCA R23 (owner 2026-11-12: "menu目前沒標題也加上"): the run's menu reads MENU.
  it("should title the run's menu and its Fall confirm MENU", () => {
    const { keys, press, labels } = menuOnStage();
    press(keys.esc);
    expect(labels()).toContain("MENU");
    press(keys.one);
    expect(labels().filter((l) => l === "MENU")).toHaveLength(1);
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
    expect(menuOver(s.run)).toBeUndefined();
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
    expect(menuOver(run)).toBeUndefined();
    // the card's own button is pending too: one send between them
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

  // Reported 2026-11-12: dying with a movement key held left the player running on in the town.
  // The run's end moves the player's record to the town, and the server routes a move by it, so a
  // stride the run sends after its end walks the town body. The end locks the keyboard, which
  // freezes a held key as held, and a player whose death the client never saw still reads in play:
  // the run sent a stride each frame while the settlement record held the town back.
  it("should send no stride once the run has ended, stopping one it interrupts once", () => {
    const { run, sentOf } = menuOnStage();
    run.sendMovementIntent(1, 0);
    expect(sentOf(ActionType.Move)).toEqual([[ActionType.Move, { vx: 1, vy: 0 }]]);

    run.endRun();
    run.sendMovementIntent(1, 0);
    run.sendMovementIntent(1, 0);

    expect(run.canSendMove()).toBe(false);
    expect(sentOf(ActionType.Move).slice(1)).toEqual([[ActionType.Move, { vx: 0, vy: 0 }]]);
  });

  it("should send nothing once the run has ended over a player standing still", () => {
    const { run, sentOf } = menuOnStage();
    run.sendMovementIntent(0, 0);
    run.endRun();
    run.sendMovementIntent(1, 0);
    expect(sentOf(ActionType.Move)).toHaveLength(0);
  });

  // I, B, C, Q, F and H are the UI scene's since the gear, the satchel and the controls panel moved,
  // refused there under its menu (FS-TQZ5J § Change: Phase 3, R56; uiSceneGear.test.ts,
  // uiSceneRecord.test.ts): the run binds none of them
  it("should drop E while the menu is open; bind no I, B, C, Q, F or H", () => {
    const s = menuOnStage();
    s.run.bindRunInput();
    const containerView = (s.run as unknown as { containerView: { close: ReturnType<typeof vi.fn> } }).containerView;
    s.press(s.keys.esc);

    s.keyHandlers["keydown-E"]();
    expect(["keydown-I", "keydown-B", "keydown-C", "keydown-Q", "keydown-F", "keydown-H"].filter((k) => k in s.keyHandlers)).toEqual([]);
    expect(containerView.close).not.toHaveBeenCalled();
    expect(s.sent).not.toHaveBeenCalled();
  });

  it("should drop pointer attacks and skills while the menu is open", () => {
    const s = menuOnStage();
    s.run.bindRunInput();
    s.press(s.keys.esc);

    s.pointerHandlers.pointerdown({ x: 10, y: 10, button: 0, worldX: 130, worldY: 300, leftButtonDown: () => true, rightButtonDown: () => false });
    s.monsters()[0].handlers.pointerdown();

    expect(s.sent).not.toHaveBeenCalled();
  });

  it("should take the menu and its confirm down when the next state shows the player dead, and show the dead card", () => {
    const { run, keys, press, pick, option, labels } = menuOnStage();
    press(keys.esc);
    pick("fall");
    pick("fall-now");
    expect(run.fallPending).toBe(true);

    (run as unknown as FloorRun).handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));

    expect(menuOver(run)).toBeUndefined();
    expect(option("fall-now")).toBeUndefined();
    expect(run.fallPending).toBe(false);
    expect(labels().some((l) => /barrow keeps you/i.test(l))).toBe(true);
  });

  it("should keep a dead player's menu up across the states that keep showing them dead", () => {
    const { run, keys, press, option } = menuOnStage(player("me", "Aldric", 130, dead));
    press(keys.esc);
    (run as unknown as FloorRun).handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));
    expect(menuOver(run)).toBeDefined();
    expect(option("leave")).toBeDefined();
  });

  it("should take the menu down when end_game arrives", () => {
    const { run, keys, press, option } = menuOnStage();
    press(keys.esc);
    run.endRun();
    expect(menuOver(run)).toBeUndefined();
    expect(option("fall")).toBeUndefined();
  });

  it("should hand Fall back on a refusal and say why in passing", () => {
    const { run, keys, press, pick, sentOf, option } = menuOnStage();
    press(keys.esc);
    pick("fall");
    pick("fall-now");
    const before = option("fall-now")?.calls.length ?? 0;

    const said = loreOf(run).said;
    run.fallRefused({ message: "You are not in a delve." });

    expect(run.fallPending).toBe(false);
    // the barrow's refusal, as a lore line, which the UI scene draws (FS-XWHZP R16)
    expect(said).toHaveBeenCalledWith({ text: "You are not in a delve.", tone: "lore" });
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
    (run as unknown as { input: unknown }).input = { keyboard: { enabled: true, removeCapture: vi.fn() } };

    // the run stops: its leaving takes the UI scene's menu down (FS-TQZ5J R20), its reset the rest
    (run as unknown as { events: { emit(event: string): void } }).events.emit("shutdown");
    run.resetRun("shutdown");

    expect(menuOver(run)).toBeUndefined();
    expect(run.fallPending).toBe(false);
    expect(offError).toHaveBeenCalledWith("forfeit_run");
  });

  describe("the run's Options and the shared OPTIONS panel (FS-28DDG § Change: Music volume in an Options panel, C1, C13, C14, C17)", () => {
    const MUSIC_KEY = "barrowspire_music";

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** The run's menu on stage, the arrows bound, this browser's store holding `held` under the music's key. */
    function optionsOnStage(me: ReturnType<typeof player> | null = player("me", "Aldric", 130), held: string | null = null) {
      const kept = new Map<string, string>(held === null ? [] : [[MUSIC_KEY, held]]);
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (k: string) => kept.get(k) ?? null,
          setItem: (k: string, v: string) => void kept.set(k, v),
          removeItem: (k: string) => void kept.delete(k),
        },
      });
      const s = menuOnStage(me);
      const arrows = { left: key(), right: key(), up: key(), down: key() };
      (s.run as unknown as { cursors: unknown }).cursors = arrows;
      const panelOpen = () => s.stage.made.some((m) => (m as { name?: string }).name === "options-music-up" && !m.destroyed);
      const find = (name: string) => s.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
      return { ...s, kept, arrows, panelOpen, find };
    }

    /** The panel opened from the run's menu by `how`. */
    function inThePanel(how: "number" | "click" = "number", me?: ReturnType<typeof player> | null, held?: string | null) {
      const s = optionsOnStage(me, held);
      s.press(s.keys.esc);
      if (how === "number") s.press(s.keys.two);
      else s.pick("options");
      return s;
    }

    it.each(["number", "click"] as const)(
      "should close the run's menu and open the shared panel in its slot on Options (a %s) (C3, C8, C13)",
      async (how) => {
        const { openOptionsPanel } = await import("@/ui/optionsPanel");
        const open = vi.mocked(openOptionsPanel);
        open.mockClear();
        const { run, panelOpen, option, labels } = inThePanel(how);

        expect(open).toHaveBeenCalledTimes(1);
        const [, spec] = open.mock.calls[0];
        expect(spec.tones.actionable).toBe(palette.interactable);
        expect(spec.tones.cancel).toBe(palette.safe);
        // the Menu icon's plate, in the UI scene with the panel, left to the icon (FS-3EBCA R18)
        expect(spec.through).toBeTypeOf("function");
        expect(panelOpen()).toBe(true);
        expect(option("fall")).toBeUndefined();
        expect(menuOver(run)).toBeDefined();
        expect(labels()).toEqual(expect.arrayContaining(["OPTIONS", "Music", "Back  [Esc]"]));
      },
    );

    it("should number Options [2] after Fall where you stand, and after Leave the barrow once resolved (C1)", () => {
      const living = optionsOnStage();
      living.press(living.keys.esc);
      expect(living.labels()).toContain("Options  [2]");

      const fallen = optionsOnStage(player("me", "Aldric", 130, dead));
      fallen.press(fallen.keys.esc);
      expect(fallen.labels()).toContain("Options  [2]");
      fallen.press(fallen.keys.two);
      expect(fallen.panelOpen()).toBe(true);
    });

    it("should hand the panel the fullscreen the page lent its game, so OPTIONS has the Fullscreen row (FS-T3DWX R11, R12)", async () => {
      const { openOptionsPanel } = await import("@/ui/optionsPanel");
      const { lendFullscreen } = await import("@/ui/gameFullscreen");
      const open = vi.mocked(openOptionsPanel);
      open.mockClear();
      const s = optionsOnStage();
      const held = new Map<string, unknown>();
      const registry = { get: (k: string) => held.get(k), set: (k: string, v: unknown) => void held.set(k, v) };
      const fullscreen = { active: () => false, toggle: vi.fn(), watch: () => () => {} };
      lendFullscreen(registry, fullscreen);
      Object.assign(s.run, { registry });
      s.press(s.keys.esc);
      s.press(s.keys.two);

      expect(open.mock.calls[0][1].fullscreen).toBe(fullscreen);
      expect(s.labels()).toEqual(expect.arrayContaining(["Music", "Sound effects", "Fullscreen", "Off", "On"]));
      s.find("options-fullscreen")!.handlers.pointerup();
      expect(fullscreen.toggle).toHaveBeenCalledTimes(1);
    });

    it("should store the level on → and ←, one a press, clamped, and on a click of a step or an arrow, playing nothing (C5, C6, C14)", () => {
      const { run, arrows, kept, find } = inThePanel();
      const offer = () => uiFrame(run, arrows);

      arrows.right.justDown = true;
      offer();
      expect(kept.get(MUSIC_KEY)).toBe("4");
      for (let i = 0; i < 3; i++) {
        arrows.right.justDown = true;
        offer();
      }
      expect(kept.get(MUSIC_KEY)).toBe("5");
      arrows.left.justDown = true;
      offer();
      expect(kept.get(MUSIC_KEY)).toBe("4");

      find("options-music-step-1")!.handlers.pointerup();
      expect(kept.get(MUSIC_KEY)).toBe("1");
      find("options-music-down")!.handlers.pointerup();
      expect(kept.get(MUSIC_KEY)).toBe("0");
      expect((run as unknown as { sound?: { add?: unknown } }).sound?.add).toBeUndefined();
    });

    it("should drive the run's playing music from the panel: → ramps it at once, and 0 fades it out (FS-28DDG § Change: The tower's music on every floor of a run, W6)", () => {
      const s = optionsOnStage();
      const music = withTowerSound(s.run);
      (s.run as unknown as Musical).enterMusic();
      music.step(MUSIC_FADE_IN_MS);
      s.press(s.keys.esc);
      s.press(s.keys.two);
      const offer = () => uiFrame(s.run, s.arrows);

      s.arrows.right.justDown = true;
      offer();
      music.step(MUSIC_LEVEL_RAMP_MS);
      expect(music.sound.volumes.at(-1)).toBeCloseTo(0.8, 12);
      expect(s.kept.get(MUSIC_KEY)).toBe("4");

      s.find("options-music-step-1")!.handlers.pointerup();
      s.find("options-music-down")!.handlers.pointerup();
      music.step(MUSIC_FADE_OUT_MS + 16);
      expect(music.sound.volumes.at(-1)).toBe(0);
      expect(music.sound.calls).toEqual(["play", "stop"]);
      expect(music.add).toHaveBeenCalledOnce();
    });

    it("should open at the stored level, and at 0 for a browser that silenced the town (C15; Edge States: Old setting)", () => {
      const { arrows, kept, frame } = inThePanel("number", undefined, "off");
      arrows.right.justDown = true;
      frame();
      expect(kept.get(MUSIC_KEY)).toBe("1");
    });

    it("should read a → pressed in play as walking, not as a level change once the panel opens (C6)", () => {
      const { keys, press, pick, arrows, kept, panelOpen, frame } = optionsOnStage();
      arrows.right.justDown = true;
      arrows.right.isDown = true;
      frame();
      press(keys.esc);
      // a click opens the panel between frames, so no key read of that frame takes the press
      pick("options");
      expect(panelOpen()).toBe(true);
      frame();

      expect(kept.get(MUSIC_KEY)).toBeUndefined();
    });

    it("should do nothing on Enter or a number while the panel is open (C6)", () => {
      const { run, keys, press, kept, panelOpen, sent } = inThePanel();
      for (const k of [keys.enter, keys.one, keys.two]) press(k);

      expect(kept.get(MUSIC_KEY)).toBeUndefined();
      expect(panelOpen()).toBe(true);
      expect(sent).not.toHaveBeenCalled();
      expect(run.fallPending).toBe(false);
    });

    it("should reopen the run's ESC menu on Esc, on Back and on the ×, never closing everything (C7)", () => {
      const { run, keys, press, pick, panelOpen, option, find } = inThePanel();

      press(keys.esc);
      expect(panelOpen()).toBe(false);
      expect(option("fall")).toBeDefined();

      pick("options");
      find("options-back")!.handlers.pointerup();
      expect(panelOpen()).toBe(false);
      expect(option("fall")).toBeDefined();

      pick("options");
      find("options-close")!.handlers.pointerup();
      expect(panelOpen()).toBe(false);
      expect(option("fall")).toBeDefined();
      expect(menuOver(run)).toBeDefined();
    });

    it("should close the panel and open nothing on the corner's Menu icon (C7)", () => {
      const { run, panelOpen, option } = inThePanel();

      // the Menu icon's press, the UI scene's menu slot's (FS-TQZ5J R14, R16)
      uiSceneOn(run, "run").menu.pressMenu();

      expect(menuOver(run)).toBeUndefined();
      expect(panelOpen()).toBe(false);
      expect(option("fall")).toBeUndefined();
    });

    it("should send no move while the panel is open, stopping a stride it interrupts once (C8)", () => {
      const s = optionsOnStage();
      s.run.sendMovementIntent(1, 0);
      s.press(s.keys.esc);
      s.press(s.keys.two);
      expect(s.run.canSendMove()).toBe(false);
      s.run.sendMovementIntent(1, 0);
      s.run.sendMovementIntent(0, 1);
      expect(s.sentOf(ActionType.Move)).toEqual([
        [ActionType.Move, { vx: 1, vy: 0 }],
        [ActionType.Move, { vx: 0, vy: 0 }],
      ]);
    });

    it("should drop E while the panel is open (I, Q, F and H the UI scene's, FS-TQZ5J § Change: Phase 3, R56)", () => {
      const s = inThePanel();
      s.run.bindRunInput();
      s.keyHandlers["keydown-E"]();
      expect("keydown-H" in s.keyHandlers).toBe(false);
      expect(s.sent).not.toHaveBeenCalled();
    });

    it("should centre the open panel again when the view changes (C8, FS-ZAJMH R13)", () => {
      const { run } = inThePanel();
      const panel = menuOver(run) as unknown as Made;
      panel.last["setPosition"] = [];
      // the UI scene's relayout, its menu slot's panel with it (FS-TQZ5J R6)
      uiSceneOn(run, "run").menu.relayout();
      expect(panel.last["setPosition"]).toEqual([viewport.centerX, viewport.centerY]);
    });

    it("should take the panel down when the next state shows the player dead, and show the dead card (C17)", () => {
      const { run, panelOpen, labels } = inThePanel();

      (run as unknown as FloorRun).handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));

      expect(menuOver(run)).toBeUndefined();
      expect(panelOpen()).toBe(false);
      expect(labels().some((l) => /barrow keeps you/i.test(l))).toBe(true);
    });

    it("should keep a dead player's panel up across the states that keep showing them dead (C17)", () => {
      const { run, panelOpen } = inThePanel("number", player("me", "Aldric", 130, dead));
      (run as unknown as FloorRun).handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));
      expect(panelOpen()).toBe(true);
    });

    it("should take the panel down when end_game arrives, and open nothing on Esc after (C17)", () => {
      const { run, keys, press, panelOpen } = inThePanel();
      run.endRun();
      expect(menuOver(run)).toBeUndefined();
      expect(panelOpen()).toBe(false);
      press(keys.esc);
      expect(menuOver(run)).toBeUndefined();
    });
  });
});

describe("BarrowspireScene drink key (FS-P9G8R R27–R29; edge state: menu open)", () => {
  interface FakeKey {
    justDown: boolean;
    isDown: boolean;
  }
  const key = (): FakeKey => ({ justDown: false, isDown: false });

  interface Drinking {
    menu?: unknown;
    bindRunInput(): void;
  }

  const potion = { item_id: "p1", entity_id: "pe1", name: "Lesser Heal Potion", quantity: 1, item_type: "consumable", healing_amount: 25 };
  const mana = { ...potion, item_id: "m1", name: "Mana Potion", healing_amount: 0, mana_amount: 30 };
  const wearing = (slot: object, fields: { current_health?: number } = {}) => ({
    ...player("me", "Aldric", 130, fields),
    equipment: { consumable_1: null, consumable_2: null, consumable_3: null, ...slot },
  });

  /** A run in play, its keys bound, this player wearing `me`'s potions. */
  function drinkOnStage(me = wearing({ consumable_1: potion })) {
    const stage = onStage();
    const run = stage.run as unknown as Drinking;
    const keys = { esc: key(), enter: key(), one: key(), two: key() };
    const keyHandlers: Record<string, (event?: { repeat?: boolean }) => void> = {};
    Object.assign(stage.run, {
      input: {
        setDefaultCursor: vi.fn(),
        keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) },
        on: vi.fn(),
      },
    });
    stage.run.handleGameStateUpdate(partyState(me as ReturnType<typeof player>));
    run.bindRunInput();
    /**
     * One press of 1 as Phaser delivers it: the run's keydown event, as the DOM event comes, then the
     * UI scene's frame reading its own key (FS-TQZ5J R21).
     */
    const pressOne = (event: { repeat?: boolean } = {}) => {
      keys.one.justDown = true;
      keyHandlers["keydown-ONE"]?.(event);
      uiFrame(run, keys);
    };
    const press = (k: FakeKey) => {
      k.justDown = true;
      uiFrame(run, keys);
    };
    const drinks = () => stage.sent.mock.calls.filter(([a]) => a === ActionType.DrinkPotion);
    const labels = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    return { ...stage, run, keys, keyHandlers, pressOne, press, drinks, labels };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should bind the drink to the keydown event the mapping names", () => {
    const { keyHandlers } = drinkOnStage();
    expect(keyHandlers[`keydown-${RUN_ACTIONS.drinkPotion.key}`]).toBeTypeOf("function");
  });

  it("should send one drink_potion with an empty payload on a press of 1", () => {
    const { pressOne, drinks } = drinkOnStage();
    pressOne();
    expect(drinks()).toEqual([[ActionType.DrinkPotion, {}]]);
  });

  it("should send one drink_potion for a held 1, whatever the key repeats", () => {
    const { pressOne, drinks } = drinkOnStage();
    pressOne();
    pressOne({ repeat: true });
    pressOne({ repeat: true });
    expect(drinks()).toHaveLength(1);
  });

  it("should leave the menu shut when 1 drinks", () => {
    const { run, pressOne } = drinkOnStage();
    pressOne();
    expect(menuOver(run)).toBeUndefined();
  });

  it("should let 1 pick the menu's row, and send no drink_potion, while the menu is open", () => {
    const { pressOne, press, keys, drinks, labels } = drinkOnStage();
    press(keys.esc);
    pressOne();
    // 1 picked Fall where you stand: the confirm is up
    expect(labels()).toContain("The barrow keeps its dead. Fall here?");
    expect(drinks()).toHaveLength(0);
  });

  // FS-Q18Q3 R32: the keys stay the world's, guarded by the UI's open menu; the bar shows no change from a press
  it("should leave the ability bar as it was on a press of 1 while the menu is open", () => {
    const { pressOne, press, keys, run } = drinkOnStage();
    const before = JSON.stringify(barShownOver(run));
    press(keys.esc);
    pressOne();
    expect(JSON.stringify(barShownOver(run))).toBe(before);
    expect(barShownOver(run)?.potion).toEqual({ count: 1, greyed: false, field: false });
  });

  it("should send no drink_potion on 1 while the menu's confirm is open", () => {
    const { pressOne, press, keys, drinks, sent } = drinkOnStage();
    press(keys.esc);
    pressOne();
    pressOne();
    expect(drinks()).toHaveLength(0);
    // the confirm's 1 is Fall: that is the menu's send, not a drink
    expect(sent.mock.calls.map(([a]) => a)).toEqual([ActionType.ForfeitRun]);
  });

  it.each([
    ["no health potion is worn", wearing({ consumable_1: mana })],
    ["no consumable is worn", wearing({})],
    ["the player is dead", wearing({ consumable_1: potion }, { current_health: 0 })],
  ])("should send nothing on 1 when %s", (_, me) => {
    const { pressOne, drinks } = drinkOnStage(me);
    pressOne();
    expect(drinks()).toHaveLength(0);
  });

});

describe("BarrowspireScene key 3, the tree ability (FS-04EEA §G R35–R37)", () => {
  interface FakeKey {
    justDown: boolean;
    isDown: boolean;
  }
  const key = (): FakeKey => ({ justDown: false, isDown: false });

  interface Keyed {
    bindRunInput(): void;
    endRun(): void;
  }

  /** A `cls` player in play holding their tree's ability, off cooldown, with `resource`. */
  const holder = (cls: string, fields: Record<string, unknown> = {}) => ({
    ...player("me", "Aldric", 130),
    class: cls,
    passive_ranks: { [`${cls}.t3`]: 1 },
    tree_ability_cooldown: { remaining: 0, total: 10 },
    resource: { kind: "stamina", current: 100, max: 100, ability_cost: 25, tree_ability_cost: 40 },
    ...fields,
  });

  /** The cursor's world point: the pointer at screen (400, 300) under the run's camera. */
  const CURSOR = await_iso.screenToWorld(400, 300);

  /** A run in play, its keys bound, this player `me` of class `cls`. */
  function keyOnStage(cls = "warrior", me: object = holder(cls)) {
    const stage = onStage();
    vi.spyOn(useGameStore.getState(), "getActiveCharacter").mockReturnValue({ className: cls } as never);
    const run = stage.run as unknown as Keyed;
    const keys = { esc: key(), enter: key(), one: key(), two: key(), three: key() };
    const keyHandlers: Record<string, (event?: { repeat?: boolean }) => void> = {};
    Object.assign(stage.run, {
      input: {
        setDefaultCursor: vi.fn(),
        // chat typing turns the run's keyboard off (FS-TQZ5J § Change: Batch 6, R127)
        keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn), enabled: true, resetKeys: vi.fn() },
        on: vi.fn(),
        activePointer: { button: 0, positionToCamera: () => ({ x: 400, y: 300 }) },
      },
    });
    stage.run.handleGameStateUpdate(partyState(me as ReturnType<typeof player>));
    run.bindRunInput();
    /** One press of 3 as Phaser delivers it: the run's keydown event, then the UI scene's frame reading its own key. */
    const pressThree = (event: { repeat?: boolean } = {}) => {
      keys.three.justDown = true;
      keyHandlers[`keydown-${RUN_ACTIONS.treeAbility.key}`]?.(event);
      uiFrame(run, keys);
    };
    const press = (k: FakeKey) => {
      k.justDown = true;
      uiFrame(run, keys);
    };
    const casts = () => stage.sent.mock.calls.filter(([a]) => a === ActionType.CastSkill);
    return { ...stage, run, keys, keyHandlers, pressThree, press, casts };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should bind the cast to the keydown event the mapping names", () => {
    const { keyHandlers } = keyOnStage();
    expect(keyHandlers[`keydown-${RUN_ACTIONS.treeAbility.key}`]).toBeTypeOf("function");
  });

  it.each([
    ["warrior", "earthbreaker"],
    ["mage", "blink"],
  ])("should send one cast_skill for a %s's %s at the cursor's world point", (cls, skill) => {
    const { pressThree, casts } = keyOnStage(cls);
    pressThree();
    expect(casts()).toEqual([[ActionType.CastSkill, { skill_id: skill, target_x: CURSOR.x, target_y: CURSOR.y }]]);
  });

  it("should send one settle_the_debt for a mercenary holding parry charges, and none at 0", () => {
    const charged = (current: number) =>
      holder("mercenary", { resource: { kind: "parry_charges", current, max: 3, ability_cost: 0, tree_ability_cost: 1 } });
    const at2 = keyOnStage("mercenary", charged(2));
    at2.pressThree();
    expect(at2.casts().map(([, p]) => (p as { skill_id: string }).skill_id)).toEqual(["settle_the_debt"]);
    vi.restoreAllMocks();

    const at0 = keyOnStage("mercenary", charged(0));
    at0.pressThree();
    expect(at0.casts()).toHaveLength(0);
  });

  it("should send one cast for a held 3, whatever the key repeats", () => {
    const { pressThree, casts } = keyOnStage();
    pressThree();
    pressThree({ repeat: true });
    pressThree({ repeat: true });
    expect(casts()).toHaveLength(1);
  });

  // ADR-0084 Decision 4: while the menu is open 1–3 are its rows; the run's has two to pick (Fall, Options),
  // so 3 picks nothing there, and the world still sends nothing
  it("should leave 3 to the menu, and send no cast, while the menu is open", () => {
    const { run, pressThree, press, keys, casts, sent } = keyOnStage();
    press(keys.esc);
    const menu = menuOver(run);
    expect(menu).toBeDefined();
    pressThree();
    expect(menuOver(run)).toBe(menu);
    expect(casts()).toHaveLength(0);
    expect(sent).not.toHaveBeenCalledWith(ActionType.ForfeitRun, expect.anything());
  });

  it.each([
    ["chat is typing", { typing: true }],
    ["the inventory is open", { inventory: true }],
    ["the character panel is open", { character: true }],
    ["the passive tree is open", { tree: true }],
  ])("should send nothing on 3 while %s", (_, ui) => {
    const { run, pressThree, casts } = keyOnStage();
    uiSceneOn(run, "run", { row: false }).bridge.reportUi(ui);
    pressThree();
    expect(casts()).toHaveLength(0);
  });

  it.each([
    ["the player is dead", holder("warrior", { current_health: 0 })],
    ["the player has escaped", holder("warrior", { escape: true })],
    ["the tree ability is not held", holder("warrior", { passive_ranks: {} })],
    ["it is on cooldown", holder("warrior", { tree_ability_cooldown: { remaining: 3, total: 10 } })],
    [
      "it is not affordable",
      holder("warrior", { resource: { kind: "stamina", current: 10, max: 100, ability_cost: 25, tree_ability_cost: 40 } }),
    ],
  ])("should send nothing on 3 when %s", (_, me) => {
    const { pressThree, casts } = keyOnStage("warrior", me);
    pressThree();
    expect(casts()).toHaveLength(0);
  });

  it("should send nothing on 3 once the run has ended", () => {
    const { run, pressThree, casts } = keyOnStage();
    run.endRun();
    pressThree();
    expect(casts()).toHaveLength(0);
  });
});

// FS-04EEA §H R42–R46: each tree ability's look is the run's own kit's, on its send
describe("BarrowspireScene tree-ability looks (FS-04EEA §H R42–R46)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const holding = (cls: string, resource: Record<string, unknown> = {}) => ({
    passive_ranks: { [`${cls}.t3`]: 1 },
    tree_ability_cooldown: { remaining: 0, total: 10 },
    resource: { kind: "stamina", current: 100, max: 100, ability_cost: 0, tree_ability_cost: 1, ...resource },
  });

  it.each([
    ["warrior", "earthbreaker", undefined],
    ["mage", "blink", undefined],
    ["mercenary", "settleTheDebt", 3],
  ])("should draw a %s's tree ability through the kit as it is sent: %s", (cls, hook, charges) => {
    const { run } = onStage();
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const r = run as unknown as {
      kit: Record<string, (...a: unknown[]) => void>;
      lastGameState: unknown;
      combat: { treeAbility(cls: string, me: unknown, target: unknown): boolean };
    };
    const drawn = vi.spyOn(r.kit, hook).mockImplementation(() => {});
    r.lastGameState = { current_player: holding(cls, { current: 3 }) };
    expect(r.combat.treeAbility(cls, { x: 100, y: 100 }, { x: 200, y: 100 })).toBe(true);
    expect(drawn).toHaveBeenCalledTimes(1);
    expect(drawn.mock.calls[0]?.[0]).toEqual({ x: 100, y: 100 });
    // the flurry is weighed by the parry charges the latest state shows at the send
    if (charges !== undefined) expect(drawn.mock.calls[0]?.[1]).toBe(charges);
  });

  it("should rain through the kit on an archer's release", () => {
    const { run } = onStage();
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const r = run as unknown as {
      kit: { arrowRain(from: unknown, centre: unknown): void };
      lastGameState: unknown;
      combat: {
        treeAbility(cls: string, me: unknown, target: unknown): boolean;
        releaseTreeAbility(cls: string, me: unknown, cursor: unknown): boolean;
      };
    };
    const rain = vi.spyOn(r.kit, "arrowRain").mockImplementation(() => {});
    r.lastGameState = { current_player: holding("archer") };
    r.combat.treeAbility("archer", { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(r.combat.releaseTreeAbility("archer", { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
    expect(rain).toHaveBeenCalledWith({ x: 0, y: 0 }, { x: 100, y: 0 });
  });
});

// FS-04EEA R41: a body whose reported position moves over 60 world px between two states is placed there,
// the own body and every other, so the next frame draws it there; a walk still glides
describe("BarrowspireScene a body that jumps (FS-04EEA R41)", () => {
  interface Drawn {
    playerPos?: { x: number; y: number };
    otherPlayersPos: Map<string, { x: number; y: number }>;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The run having seen the party at its first state, then at `meX` and `allyX` on the next. */
  function moved(meX: number, allyX: number) {
    const { run } = onStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130), player("ally", "Wenna", 160)));
    run.handleGameStateUpdate(partyState(player("me", "Aldric", meX), player("ally", "Wenna", allyX)));
    return run as unknown as Drawn;
  }

  it("should place the own body and a teammate's at once at a state position 61 px on", () => {
    const run = moved(130 + 61, 160 + 61);
    expect(run.playerPos).toEqual(at(191, 300));
    expect(run.otherPlayersPos.get("ally")).toEqual(at(221, 300));
  });

  it("should leave a 40 px move to the glide, own and teammate's", () => {
    const run = moved(130 + 40, 160 + 40);
    expect(run.playerPos).toEqual(at(130, 300));
    expect(run.otherPlayersPos.get("ally")).toEqual(at(160, 300));
  });

  // R44: the own Blink lands where the jump places the own body; a teammate's jump, or a walk, lands none
  it.each([
    ["the own body's jump", 130 + 61, 160, [{ x: 191, y: 300 }]],
    ["a teammate's jump alone", 130, 160 + 61, []],
    ["a walk", 130 + 40, 160 + 40, []],
  ])("should hand the kit only %s as a landing", (_, meX, allyX, want) => {
    const { run } = onStage();
    const landed = vi.spyOn((run as unknown as { kit: { landed(at: unknown, now: number): void } }).kit, "landed");
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130), player("ally", "Wenna", 160)));
    run.handleGameStateUpdate(partyState(player("me", "Aldric", meX), player("ally", "Wenna", allyX)));
    expect(landed.mock.calls.map(([where]) => ({ ...(where as object) }))).toEqual(want);
  });
});

describe("BarrowspireScene gear and bag overlay (FS-HRH2J §A R4–R11, §B R20–22)", () => {
  interface Overlaid {
    menu?: unknown;
    combat: { aiming: boolean };
    containerView: ReturnType<typeof worldContainer>;
    bindRunInput(): void;
    handleGameStateUpdate(state: GameState): void;
    sendMovementIntent(vx: number, vy: number): void;
  }

  const sword = { entity_id: "sword", name: "Iron Sword", weapon_type: "sword", attack_power: 10 };
  const bag = (n: number) => Array.from({ length: n }, (_, i) => ({ entity_id: `i${i}`, name: `Relic ${i}` }));
  /** The run's camera is 800 × 600: the right panel's middle, and the clear band's. */
  const layout = overlayLayout(800, 600);
  const OVER_PANEL = { x: layout.right.x + layout.right.w / 2, y: 300 };
  const IN_BAND = { x: layout.band.x + layout.band.w / 2, y: 300 };

  /** The run's keys the UI scene hears since the gear and the satchel moved (FS-TQZ5J § Change: Phase 3, R56). */
  const GEAR_KEYS: Record<string, "inventory" | "character" | "close" | "take"> = {
    I: "inventory",
    B: "inventory",
    C: "character",
    Q: "close",
    F: "take",
  };

  /**
   * The run on stage with the UI scene over it, as the UI scene builds its gear for the run (FS-TQZ5J
   * § Change: Phase 3, R50): the real overlay, `EquipmentHud` and container view on a stand-in UI scene
   * of their own input, drawing on the run's recording stage, fed the run's state through the bridge;
   * the run's satchel the bridge's (`worldContainer`). A press goes to the UI scene first: on one of its
   * grounds (the overlay's panels, their ×) it is the UI scene's, Phaser stopping it there (R7, R59);
   * anywhere else the run hears it too. Every move reaches both (A1 R27).
   */
  function overlayOnStage(cls = "warrior", inventory: unknown[] = [sword]) {
    const stage = onStage();
    vi.spyOn(useGameStore.getState(), "getActiveCharacter").mockReturnValue({ className: cls } as never);
    const run = stage.run as unknown as Overlaid & { ui: import("@/ui/uiBridge").WorldUi };
    const esc = { justDown: false, isDown: false };
    const keyHandlers: Record<string, () => void> = {};
    const removeKey = vi.fn();
    const input = Object.assign(new EventEmitter(), {
      setDefaultCursor: vi.fn(),
      keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) },
      activePointer: { button: 0, positionToCamera: () => ({ x: 400, y: 300 }) },
    });
    Object.assign(stage.run, { input, game: { events: new EventEmitter() }, containerView: worldContainer(() => run.ui) });
    const sceneParts = stage.run as unknown as Record<string, unknown>;
    const uiInput = Object.assign(new EventEmitter(), {
      // the overlay's Shift, while open (FS-NV54P R4); closing must not remove it
      keyboard: { addKey: () => ({ isDown: false }), removeKey },
    });
    const uiScene = {
      add: stage.stage.add,
      make: sceneParts.make,
      // the satchel's, the coffer's and the heap's faces baked already, as the UI scene's are at its first world
      textures: { ...(sceneParts.textures as object), exists: () => true },
      time: sceneParts.time,
      tweens: sceneParts.tweens,
      cameras: sceneParts.cameras,
      input: uiInput,
      scale: new EventEmitter(),
      events: new EventEmitter(),
    };
    gearOver(run, "run", (w, wiring) => mountGearPieces(uiScene as never, () => sceneParts.art as never, w, wiring));
    run.handleGameStateUpdate(partyState({ ...player("me", "Aldric", 130), class: cls, inventory } as ReturnType<typeof player>));
    run.bindRunInput();
    (stage.run as unknown as { time: { now: number } }).time.now = 1000;
    const ui = () => uiSceneOn(run, "run", { row: false });
    /** A key both scenes' keyboards hear: the run's own (E, H) and the UI scene's (I, B, C, Q, F, and E for an open inventory). */
    const key = (name: string) => {
      if (name === "E") ui().gearKey("equip");
      const gear = GEAR_KEYS[name];
      if (gear) ui().gearKey(gear);
      else keyHandlers[`keydown-${name}`]?.();
    };
    /** Whether either gear panel is open: the UI scene's gear (R55). */
    const gearOpen = () => ui().gear.isOpen();
    // Esc is the UI scene's (FS-TQZ5J R17)
    const pressEsc = () => {
      esc.justDown = true;
      uiFrame(run, { esc });
    };
    const pointer = (at: { x: number; y: number }, button: number) => ({
      ...at,
      button,
      worldX: 400,
      worldY: 300,
      leftButtonDown: () => button === 0,
      rightButtonDown: () => button === 2,
    });
    /** What Phaser lists under the pointer in the UI scene, top first: a live ground or × of a window. */
    const uiOver = (at: { x: number; y: number }) => {
      const hit = stage.stage.made.filter((m) => {
        const z = m as Made & { depth?: number };
        if (z.kind !== "zone" || z.destroyed || !z.calls.includes("setInteractive") || (z.depth ?? 0) < 1100) return false;
        const [x, y, w, h] = z.args as number[];
        return at.x >= x && at.x <= x + w && at.y >= y && at.y <= y + h;
      }) as (Made & { depth?: number })[];
      const top = hit.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0)).at(-1);
      return top ? [stage.stage.held(top)] : [];
    };
    const move = (at: { x: number; y: number }, over: unknown[] = uiOver(at)) => {
      uiInput.emit("pointermove", pointer(at, 0), over);
      input.emit("pointermove", pointer(at, 0));
    };
    const press = (at: { x: number; y: number }, button: number) => {
      input.activePointer.button = button;
      const over = uiOver(at);
      move(at, over);
      uiInput.emit("pointerdown", pointer(at, button), over);
      // a press on a UI piece never reaches the run (FS-TQZ5J R7)
      if (over.length === 0) input.emit("pointerdown", pointer(at, button));
    };
    const sentOf = (action: string) => stage.sent.mock.calls.filter(([a]) => a === action);
    const shown = (content: string) => stage.texts().some((t) => t.content === content);
    return { ...stage, run, ui, key, gearOpen, pressEsc, move, press, sentOf, shown, removeKey };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show the player's class, name and health on the stats panel, live while open (FS-HRH2J R24–30)", () => {
    const { run, key, shown } = overlayOnStage();
    key("C");
    expect(shown("WARRIOR")).toBe(true);
    expect(shown("Aldric")).toBe(true);
    expect(shown("100 / 100")).toBe(true);

    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, { current_health: 61 })));

    expect(shown("61 / 100")).toBe(true);
  });

  it("should toggle the overlay on I and on B, and close it on Q (R4)", () => {
    const { run, key, removeKey } = overlayOnStage();
    key("I");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
    key("B");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    key("B");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
    key("I");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    key("B");
    key("Q");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    expect(removeKey).not.toHaveBeenCalled();
  });

  it("should close the overlay on one ESC and leave the menu closed; the next ESC opens the menu (R5)", () => {
    const { run, key, pressEsc } = overlayOnStage();
    key("I");
    pressEsc();
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    expect(menuOver(run)).toBeUndefined();
    pressEsc();
    expect(menuOver(run)).toBeDefined();
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
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
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


  // FS-HRH2J § Change: Character and inventory apart (C1–C4, C14). I-3EBCA-4.
  it("should open the inventory alone on I and the character panel alone on C (§ Change C1, C2, C14)", () => {
    const { run, key, shown } = overlayOnStage();
    key("I");
    expect(shown("INVENTORY")).toBe(true);
    expect(shown("WARRIOR")).toBe(false);
    key("C");
    expect(shown("WARRIOR")).toBe(true);
    // I closes the inventory alone: the character panel stays over the run
    key("I");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
    expect(uiSceneOn(run, "run").gear.isInventoryOpen()).toBe(false);
    key("C");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
  });

  it("should ignore C while the ESC menu is open (§ Change C2)", () => {
    const { run, key, pressEsc } = overlayOnStage();
    pressEsc();
    key("C");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
  });

  it("should close both panels on one ESC, the menu left closed, and on Q (§ Change C3)", () => {
    const { run, key, pressEsc } = overlayOnStage();
    key("I");
    key("C");
    pressEsc();
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    expect(menuOver(run)).toBeUndefined();
    key("I");
    key("C");
    key("Q");
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
  });

  it("should close the inventory alone on its ×, sending no attack for the press (§ Change C4)", () => {
    const { run, key, press, sent } = overlayOnStage("warrior", []);
    key("I");
    key("C");
    const box = panelClose(layout.right);
    const stageSends = () => sent.mock.calls.length;
    const before = stageSends();
    press({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, 0);
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
    expect(stageSends()).toEqual(before);
    const left = panelClose(layout.left);
    press({ x: left.x + left.w / 2, y: left.y + left.h / 2 }, 0);
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    expect(stageSends()).toEqual(before);
  });

  // FS-3EBCA R1, R7, R11 (the owner's decision of 2026-11-12: the row of five, the row answering
  // while the inventory is open). I-3EBCA-5.
  it("should open the inventory on the Inventory icon and the character panel on the Character icon, the row answering while the inventory is open (FS-3EBCA R7, R11)", () => {
    const { run, stage } = overlayOnStage();
    cornerRowOn(run, "run");
    const plate = (icon: "inventory" | "character" | "menu") => {
      const f = cornerIconFrame(icon, viewport);
      return stage.made.find((m) => m.kind === "zone" && !m.destroyed && m.args[0] === f.x && m.args[1] === f.y)!;
    };
    plate("inventory").handlers.pointerdown();
    expect(uiSceneOn(run, "run").gear.isInventoryOpen()).toBe(true);
    // the inventory is open over the run: the row still answers
    plate("character").handlers.pointerdown();
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
    plate("inventory").handlers.pointerdown();
    expect(uiSceneOn(run, "run").gear.isInventoryOpen()).toBe(false);
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
    plate("character").handlers.pointerdown();
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    plate("inventory").handlers.pointerdown();
    // the Menu icon opens the menu at once, the inventory closing with it (FS-3EBCA R17)
    plate("menu").handlers.pointerdown();
    expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
    expect(menuOver(run)).toBeDefined();
  });

  // FS-3EBCA R8 and FS-R82NV § Change C2, C8 (owner 2026-11-12: "開道具欄跟角色欄時開不了隊伍": with the
  // inventory or the character panel open the party panel would not open). I-3EBCA-7.
  describe("the party panel over the inventory and the character panel (FS-3EBCA R8)", () => {
    function partyOverOverlay() {
      const env = overlayOnStage();
      const run = env.run as unknown as Overlaid;
      const party = partyPanelOver(run, "run", (w) => partyPanelOn(w.blocked, w.wrapper));
      cornerRowOn(run, "run");
      const f = cornerIconFrame("party", viewport);
      const icon = () =>
        env.stage.made.find((m) => m.kind === "zone" && !m.destroyed && m.args[0] === f.x && m.args[1] === f.y)!;
      return { ...env, party, pressIcon: () => icon().handlers.pointerdown() };
    }

    it.each([
      ["the inventory", ["I"]],
      ["the character panel", ["C"]],
      ["both panels", ["I", "C"]],
    ] as const)("should open and close the party panel on T and on the Party icon with %s open", (_open, keys) => {
      const { run, key, party, pressIcon } = partyOverOverlay();
      keys.forEach(key);
      expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
      party.pressT();
      expect(party.panel.isOpen()).toBe(true);
      party.pressT();
      expect(party.panel.isOpen()).toBe(false);
      pressIcon();
      expect(party.panel.isOpen()).toBe(true);
      pressIcon();
      expect(party.panel.isOpen()).toBe(false);
      // the overlay stays as it was
      expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
    });

    it("should still refuse T while the ESC menu is open", () => {
      const { run, party, pressEsc } = partyOverOverlay();
      pressEsc();
      expect(menuOver(run)).toBeDefined();
      party.pressT();
      expect(party.panel.isOpen()).toBe(false);
    });

    it("should close the party panel, drawn over the overlay, on the first ESC, and the overlay on the second", () => {
      const { run, key, party, pressEsc } = partyOverOverlay();
      key("I");
      key("C");
      party.pressT();
      pressEsc();
      expect(party.panel.isOpen()).toBe(false);
      expect(uiSceneOn(run, "run").gear.isOpen()).toBe(true);
      pressEsc();
      expect(uiSceneOn(run, "run").gear.isOpen()).toBe(false);
      expect(menuOver(run)).toBeUndefined();
    });

    // the party panel and the overlay are both the UI scene's: a piece over the overlay is the top
    // object under the pointer, and the overlay gives way to it on a move (FS-TQZ5J § Change: Phase 3,
    // R60): its point stands off its panels, so nothing under it tips
    it("should keep the overlay under another UI piece from tipping there on a move", () => {
      const env = overlayOnStage();
      env.key("I");
      const cell = gearPanelLayout(layout.right, 1).cells[0].rect;
      const at = { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
      env.move(at, [{ name: "party-panel-ground" }]);
      expect(env.shown("Iron Sword")).toBe(false);
      env.move(at);
      expect(env.shown("Iron Sword")).toBe(true);
    });
  });

  // The owner, 2026-11-12: "開menu時其他視窗也會關閉 然後menu開啟時其他都不能按". In a run the windows are the
  // inventory, the character panel and the party panel (the mailbox is the town's): FS-3EBCA R17,
  // R18; FS-G4VMQ § Change C4.
  describe("the windows give way to the menu (FS-3EBCA R17, R18)", () => {
    type Windowed = Overlaid & {
      runEnded: boolean;
    };
    function runWindows() {
      const env = overlayOnStage();
      const run = env.run as unknown as Windowed;
      const party = partyPanelOver(run, "run", (w) => partyPanelOn(w.blocked, w.wrapper));
      cornerRowOn(run, "run");
      const pressIcon = (icon: "menu" | "inventory" | "character" | "party") => {
        const f = cornerIconFrame(icon, viewport);
        env.stage.made.find((m) => m.kind === "zone" && !m.destroyed && m.args[0] === f.x && m.args[1] === f.y)!.handlers.pointerdown();
      };
      const open = () => ({ gear: uiSceneOn(run, "run").gear.isOpen(), party: party.panel.isOpen() });
      return { ...env, run, party, pressIcon, open };
    }
    const NONE = { gear: false, party: false };

    it("should keep Esc's one press, one thing: the party panel, then the overlay, then the menu (R17)", () => {
      const { run, key, party, pressEsc, open } = runWindows();
      key("I");
      party.pressT();
      pressEsc();
      expect(open()).toEqual({ gear: true, party: false });
      pressEsc();
      expect(menuOver(run)).toBeUndefined();
      pressEsc();
      expect(menuOver(run)).toBeDefined();
    });

    it("should open the menu at once on the Menu icon, closing every window (R17)", () => {
      const { run, key, party, pressIcon, open } = runWindows();
      key("I");
      key("C");
      party.pressT();
      pressIcon("menu");
      expect(open()).toEqual(NONE);
      expect(menuOver(run)).toBeDefined();
    });

    it("should only close every window on the Menu icon once the run has ended: there is no menu (R17)", () => {
      const { run, key, party, pressIcon, open } = runWindows();
      key("I");
      key("C");
      party.pressT();
      run.runEnded = true;
      pressIcon("menu");
      expect(open()).toEqual(NONE);
      expect(menuOver(run)).toBeUndefined();
    });

    it("should answer no corner icon but Menu, no I, B, C or T while the menu is open (R18)", () => {
      const { run, key, party, pressEsc, pressIcon, open } = runWindows();
      pressEsc();
      const menu = menuOver(run);
      for (const icon of ["inventory", "character", "party"] as const) pressIcon(icon);
      key("I");
      key("B");
      key("C");
      party.pressT();
      expect(menuOver(run)).toBe(menu);
      expect(open()).toEqual(NONE);
    });

    // owner 2026-11-12: "menu無法再按一次icon關閉"
    it("should close the menu on the Menu icon, as its × and Back do, and open it again on the next press (R6, R18)", () => {
      const { run, pressEsc, pressIcon, open } = runWindows();
      pressEsc();
      pressIcon("menu");
      expect(menuOver(run)).toBeUndefined();
      expect(open()).toEqual(NONE);
      pressIcon("menu");
      expect(menuOver(run)).toBeDefined();
    });

    it("should close the Fall confirm on the Menu icon, as its × and Not yet do: the whole menu goes, nothing sent (R18)", () => {
      const { run, pressEsc, pressIcon, stage, sent } = runWindows();
      pressEsc();
      stage.made.find((m) => (m as { name?: string }).name === "menu-fall" && !m.destroyed)!.handlers.pointerup();
      expect(stage.made.some((m) => (m as { name?: string }).name === "menu-fall-now" && !m.destroyed)).toBe(true);
      const before = sent.mock.calls.length;
      pressIcon("menu");
      expect(menuOver(run)).toBeUndefined();
      expect(stage.made.some((m) => (m as { name?: string }).name === "menu-fall-now" && !m.destroyed)).toBe(false);
      expect(sent.mock.calls.length).toBe(before);
    });

    it("should take the whole view with the menu's blocker but the Menu icon's plate, the row and the menu one scene (R18; FS-TQZ5J R16)", () => {
      const { pressEsc, stage } = runWindows();
      pressEsc();
      const blocker = stage.made.find((m) => (m as { name?: string }).name === "menu-blocker" && !m.destroyed)!;
      const test = (blocker.last["setInteractive"] ?? []).find((a) => typeof a === "function") as
        | ((area: unknown, x: number, y: number, object: unknown) => boolean)
        | undefined;
      expect(test, "the blocker's own hit test").toBeTypeOf("function");
      const takes = (x: number, y: number) => test!({}, x, y, blocker);
      const plate = cornerIconFrame("menu", viewport);
      const bag = cornerIconFrame("inventory", viewport);
      // the whole view but the Menu plate, which it leaves to the icon under it in the same scene, so
      // a press there closes the menu (FS-3EBCA R18, as when both were the run's)
      expect(takes(plate.x + plate.width / 2, plate.y + plate.height / 2)).toBe(false);
      expect(takes(plate.x - 4, plate.y + plate.height / 2)).toBe(true);
      expect(takes(bag.x + bag.width / 2, bag.y + bag.height / 2)).toBe(true);
    });

    it("should give the chat input no focus while the menu is open (R18)", () => {
      const { run, pressEsc } = runWindows();
      expect(chatMayOpen(run)).toBe(true);
      pressEsc();
      expect(chatMayOpen(run)).toBe(false);
    });
  });

  // FS-WDM0X § Acceptance Criteria "The run": as the field, with the Fall confirm counted as part of
  // the menu (S5), and every window the game closes on its own silent (S4). I-WDM0X-3.
  describe("interface sounds (FS-WDM0X S1–S9; I-WDM0X-3)", () => {
    type Heard = Overlaid & {
      runEnded: boolean;
      ui: { act(run: () => void): void };
      endRun(): void;
      resetRun(end: "shutdown" | "destroy"): void;
    };
    const dead = { current_health: 0 };

    /** The run's windows on stage, its player made as create makes it, the overlay handed its wrapper. */
    function heardRun() {
      const env = overlayOnStage();
      const run = env.run as unknown as Heard;
      const heard = hearOn(env.run as unknown as Record<string, unknown>);
      // the UI scene's player lent to its bridge as it is created, the overlay's × through its act (R22)
      run.handleGameStateUpdate(partyState({ ...player("me", "Aldric", 130), inventory: [sword] } as ReturnType<typeof player>));
      const party = partyPanelOver(run, "run", (w) => partyPanelOn(w.blocked, w.wrapper));
      cornerRowOn(run, "run");
      const pressIcon = (icon: "menu" | "inventory" | "character" | "party" | "mail") => {
        const f = cornerIconFrame(icon, viewport);
        env.stage.made.find((m) => m.kind === "zone" && !m.destroyed && m.args[0] === f.x && m.args[1] === f.y)?.handlers.pointerdown?.();
      };
      const find = (name: string) => env.stage.made.find((m) => (m as { name?: string }).name === name && !m.destroyed);
      const pick = (name: string) => find(name)!.handlers.pointerup();
      /** A gear panel's ×: the inventory's on the right panel, the character panel's on the left. */
      const closeX = (side: "inventory" | "character") => {
        const box = panelClose(side === "inventory" ? layout.right : layout.left);
        env.press({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, 0);
      };
      const open = () => ({
        menu: menuOver(run) !== undefined,
        party: party.panel.isOpen(),
        gear: uiSceneOn(run, "run").gear.isOpen(),
      });
      heard();
      return { ...env, run, heard, party, pressIcon, find, pick, closeX, open };
    }
    type Run = ReturnType<typeof heardRun>;

    /** The Fall confirm open, from the menu's Fall row. */
    function inFallConfirm() {
      const r = heardRun();
      r.pressEsc();
      r.pick("menu-fall");
      expect(r.find("menu-not-yet")).toBeDefined();
      r.heard();
      return r;
    }

    /** OPTIONS open, from the menu's Options row. */
    function inOptions() {
      const r = heardRun();
      r.pressEsc();
      r.pick("menu-options");
      expect(r.find("options-back")).toBeDefined();
      r.heard();
      return r;
    }

    it("should play dialog_open as the Fall confirm opens from the menu, and settings_close alone on its Not yet (§ Change M11; owner listening check)", () => {
      const r = heardRun();
      r.pressEsc();
      expect(r.heard()).toEqual(["settings_open"]);
      r.pick("menu-fall");
      expect(r.find("menu-not-yet")).toBeDefined();
      expect(r.heard()).toEqual(["dialog_open"]);
      r.pick("menu-not-yet");
      expect(menuOver(r.run)).toBeUndefined();
      expect(r.heard()).toEqual(["settings_close"]);
    });

    it.each<[string, (r: Run) => void]>([
      ["Esc", (r) => r.pressEsc()],
      ["the ×", (r) => r.pick("menu-close")],
    ])("should play settings_close alone as %s closes the whole menu from the Fall confirm (S5; owner listening check)", (_input, input) => {
      const r = inFallConfirm();
      input(r);
      expect(menuOver(r.run)).toBeUndefined();
      expect(r.heard()).toEqual(["settings_close"]);
    });

    it("should play settings_close as the Menu icon closes the whole menu from the Fall confirm (S5)", () => {
      const r = inFallConfirm();
      r.pressIcon("menu");
      expect(menuOver(r.run)).toBeUndefined();
      expect(r.heard()).toEqual(["settings_close"]);
    });

    it("should play dialog_confirm_heavy on the Fall confirm's Fall, which sends and leaves the confirm up (§ Change M13)", () => {
      const r = inFallConfirm();
      r.pick("menu-fall-now");
      expect(r.sentOf(ActionType.ForfeitRun)).toHaveLength(1);
      expect(menuOver(r.run)).toBeDefined();
      expect(r.heard()).toEqual(["dialog_confirm_heavy"]);
    });

    it("should play settings_close on Leave the barrow, which closes the menu in the same press", () => {
      const r = heardRun();
      r.run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));
      r.pressEsc();
      expect(r.find("menu-leave")).toBeDefined();
      r.heard();
      r.pick("menu-leave");
      expect(r.sentOf(ActionType.LeaveRun)).toHaveLength(1);
      expect(menuOver(r.run)).toBeUndefined();
      expect(r.heard()).toEqual(["settings_close"]);
    });

    it.each<[string, (r: Run) => void, string, string]>([
      ["I", (r) => r.key("I"), "inventory_open", "inventory_close"],
      ["B", (r) => r.key("B"), "inventory_open", "inventory_close"],
      ["the Inventory icon", (r) => r.pressIcon("inventory"), "inventory_open", "inventory_close"],
      ["C", (r) => r.key("C"), "character_open", "character_close"],
      ["the Character icon", (r) => r.pressIcon("character"), "character_open", "character_close"],
      ["T", (r) => r.party.pressT(), "party_open", "party_close"],
      ["the Party icon", (r) => r.pressIcon("party"), "party_open", "party_close"],
    ])("should open and close on %s, each with its own one sound", (_input, input, opened, closed) => {
      const r = heardRun();
      input(r);
      expect(r.heard()).toEqual([opened]);
      input(r);
      expect(r.heard()).toEqual([closed]);
    });

    it.each<["inventory" | "character", string, string]>([
      ["inventory", "I", "inventory_close"],
      ["character", "C", "character_close"],
    ])("should play its close on the %s panel's ×, through the wrapper the run hands the overlay", (side, opening, closed) => {
      const r = heardRun();
      r.key(opening);
      r.heard();
      r.closeX(side);
      expect(uiSceneOn(r.run, "run").gear.isOpen()).toBe(false);
      expect(r.heard()).toEqual([closed]);
    });

    it("should play party_close on the party panel's ×, through the wrapper the run hands the panel", () => {
      const r = heardRun();
      r.party.pressT();
      r.heard();
      const x = r.party.panel as unknown as { deps: { wrapper?: { act(run: () => void): void } }; close(): boolean };
      x.deps.wrapper!.act(() => void x.close());
      expect(r.heard()).toEqual(["party_close"]);
    });

    it.each<[string, (r: Run) => void]>([
      ["Esc", (r) => r.pressEsc()],
      ["Q", (r) => r.key("Q")],
    ])("should close both gear panels with one inventory_close on %s", (_k, press) => {
      const r = heardRun();
      r.key("I");
      r.key("C");
      r.heard();
      press(r);
      expect(r.open()).toEqual({ menu: false, party: false, gear: false });
      expect(r.heard()).toEqual(["inventory_close"]);
    });

    it("should close the party panel with party_close on Esc, then the overlay, then open the menu with settings_open", () => {
      const r = heardRun();
      r.key("C");
      r.party.pressT();
      r.heard();
      r.pressEsc();
      expect(r.heard()).toEqual(["party_close"]);
      r.pressEsc();
      expect(r.heard()).toEqual(["character_close"]);
      r.pressEsc();
      expect(r.heard()).toEqual(["settings_open"]);
    });

    it("should play settings_open alone as the Menu icon opens the menu over every window", () => {
      const r = heardRun();
      r.key("I");
      r.key("C");
      r.party.pressT();
      r.heard();
      r.pressIcon("menu");
      expect(r.open()).toEqual({ menu: true, party: false, gear: false });
      expect(r.heard()).toEqual(["settings_open"]);
    });

    it.each<[string, (r: Run) => void]>([
      ["Back", (r) => r.pick("menu-back")],
      ["Esc", (r) => r.pressEsc()],
      ["the ×", (r) => r.pick("menu-close")],
      ["the Menu icon", (r) => r.pressIcon("menu")],
    ])("should play settings_close as the menu's %s closes it", (_input, input) => {
      const r = heardRun();
      r.pressEsc();
      r.heard();
      input(r);
      expect(menuOver(r.run)).toBeUndefined();
      expect(r.heard()).toEqual(["settings_close"]);
    });

    describe("the menu and OPTIONS, one settings space (S5)", () => {
      it("should play menu_click alone as Options opens OPTIONS in the menu's place (§ Change M6)", () => {
        const r = heardRun();
        r.pressEsc();
        r.heard();
        r.pick("menu-options");
        expect(r.find("options-back")).toBeDefined();
        expect(r.heard()).toEqual(["menu_click"]);
      });

      it.each<[string, (r: Run) => void]>([
        ["Back", (r) => r.pick("options-back")],
        ["Esc", (r) => r.pressEsc()],
        ["the ×", (r) => r.pick("options-close")],
      ])("should play menu_back alone as OPTIONS' %s goes back to the menu (§ Change M7)", (_input, input) => {
        const r = inOptions();
        input(r);
        expect(r.find("menu-fall")).toBeDefined();
        expect(r.heard()).toEqual(["menu_back"]);
      });

      it("should play settings_close as the Menu icon closes the whole menu from OPTIONS", () => {
        const r = inOptions();
        r.pressIcon("menu");
        expect(menuOver(r.run)).toBeUndefined();
        expect(r.heard()).toEqual(["settings_close"]);
      });
    });

    it.each<[string, (r: Run) => void]>([
      ["I", (r) => r.key("I")],
      ["B", (r) => r.key("B")],
      ["C", (r) => r.key("C")],
      ["Q", (r) => r.key("Q")],
      ["T", (r) => r.party.pressT()],
    ])("should play nothing on %s refused while the menu is open (S6)", (_press, refused) => {
      const r = heardRun();
      r.pressEsc();
      r.heard();
      refused(r);
      expect(r.open()).toEqual({ menu: true, party: false, gear: false });
      expect(r.heard()).toEqual([]);
    });

    it.each<[string, (r: Run) => void]>([
      ["the Inventory icon", (r) => r.pressIcon("inventory")],
      ["the Character icon", (r) => r.pressIcon("character")],
      ["the Party icon", (r) => r.pressIcon("party")],
    ])("should play menu_error on %s refused while the menu is open (§ Change M10)", (_press, refused) => {
      const r = heardRun();
      r.pressEsc();
      r.heard();
      refused(r);
      expect(r.open()).toEqual({ menu: true, party: false, gear: false });
      expect(r.heard()).toEqual(["menu_error"]);
    });

    it("should play nothing on T refused while a chest is open, and menu_error on the Party icon the run turns away (S6; § Change M10)", () => {
      const r = heardRun();
      // the run opens its coffer through the bridge; the UI scene's view reports it open (R52, R53)
      r.run.containerView.open("chest-1", "chest");
      r.heard();
      r.party.pressT();
      expect(r.heard()).toEqual([]);
      r.pressIcon("party");
      expect(r.party.panel.isOpen()).toBe(false);
      expect(r.heard()).toEqual(["menu_error"]);
    });

    it("should play menu_error on the greyed envelope (§ Change M10)", () => {
      const r = heardRun();
      r.pressIcon("mail");
      expect(r.heard()).toEqual(["menu_error"]);
    });

    describe("what the game closes on its own plays nothing (S4)", () => {
      it.each<[string, () => Run]>([
        ["the menu", heardRun],
        ["OPTIONS", inOptions],
        ["the Fall confirm", inFallConfirm],
      ])("should play nothing as %s yields to the player's death", (_open, opened) => {
        const r = opened();
        if (!menuOver(r.run)) r.pressEsc();
        r.heard();
        r.run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));
        expect(menuOver(r.run)).toBeUndefined();
        // the yield plays no close; what plays is the resolved card popping up (FS-WDM0X § Pass 2b E1)
        expect(r.heard()).toEqual(["dialog_open"]);
      });

      it("should play nothing as the Fall confirm yields to the death its Fall asked for", () => {
        const r = inFallConfirm();
        r.pick("menu-fall-now");
        r.heard();
        r.run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, dead)));
        expect(menuOver(r.run)).toBeUndefined();
        // Fall's dialog_confirm_heavy was its press's; the card that follows chimes (§ Pass 2b E1, E7)
        expect(r.heard()).toEqual(["dialog_open"]);
      });

      it("should play nothing as the run's end closes the menu", () => {
        const r = heardRun();
        r.pressEsc();
        r.heard();
        r.run.endRun();
        expect(menuOver(r.run)).toBeUndefined();
        expect(r.heard()).toEqual([]);
      });

      it("should play nothing as the party climbs to the next floor with every window open", () => {
        const r = heardRun();
        r.key("I");
        r.party.pressT();
        r.heard();
        const me = { ...player("me", "Aldric", 130), inventory: [sword] } as ReturnType<typeof player>;
        r.run.handleGameStateUpdate({ ...floorState(2), current_player: me, other_players: [] } as GameState);
        expect(r.heard()).toEqual([]);
      });

      it.each<[string, (r: Run) => void]>([
        ["the inventory, the character panel and the party panel", (r) => (r.key("I"), r.key("C"), r.party.pressT())],
        ["the menu", (r) => r.pressEsc()],
        ["OPTIONS", (r) => (r.pressEsc(), r.pick("menu-options"))],
      ])("should play nothing as the scene stops or is destroyed with %s open", (_open, open) => {
        for (const end of ["shutdown", "destroy"] as const) {
          const r = heardRun();
          // a stop hands the keyboard back (handBackKeyboard)
          Object.assign((r.run as unknown as { input: { keyboard: object } }).input.keyboard, { removeCapture: vi.fn() });
          open(r);
          r.heard();
          // a stop is the run leaving, which takes the UI scene's menu down (FS-TQZ5J R20); a destroy
          // takes the UI scene down with the game, its slot emptied as it ends (UIScene's onSceneEnd)
          (r.run as unknown as { events: { emit(event: string): void } }).events.emit(end);
          if (end === "destroy") uiSceneOn(r.run, "run").menu.close();
          r.run.resetRun(end);
          expect(menuOver(r.run)).toBeUndefined();
          expect(r.heard()).toEqual([]);
        }
      });
    });

    it("should still play a window's sound on a corner icon press after the run's end: the icons work then", () => {
      const r = heardRun();
      r.run.endRun();
      r.pressIcon("inventory");
      expect(r.heard()).toEqual(["inventory_open"]);
      r.pressIcon("character");
      expect(r.heard()).toEqual(["character_open"]);
      r.pressIcon("character");
      expect(r.heard()).toEqual(["character_close"]);
      // the Menu icon only closes the windows now: there is no menu
      r.pressIcon("menu");
      expect(r.open()).toEqual({ menu: false, party: false, gear: false });
      expect(r.heard()).toEqual(["inventory_close"]);
    });

  });

  // the take and the bag's pre-check stay in the UI scene, the run sending the loot asked of it
  // (FS-TQZ5J § Change: Phase 3, R54): F takes the open coffer's first item
  it("should refuse a pickup into a full bag with the refused notice, pending takes counted (R21, R22)", () => {
    const { run, key, shown, sentOf } = overlayOnStage("warrior", bag(29));
    run.containerView.open("chest-1", "chest");
    run.containerView.setItems([
      { entity_id: "coin", name: "coin" },
      { entity_id: "gem", name: "gem" },
    ] as never);
    key("F");
    expect(sentOf(ActionType.Interact)).toEqual([[ActionType.Interact, { entity_id: "coin" }]]);
    expect(shown(BAG_FULL_NOTICE)).toBe(false);
    key("F");
    expect(sentOf(ActionType.Interact)).toHaveLength(1);
    expect(shown(BAG_FULL_NOTICE)).toBe(true);
  });
});

describe("BarrowspireScene Shadow Shot hold (FS-JTNPR req 8–17; ADR-0030)", () => {
  interface Aimed {
    time: { now: number; delayedCall: ReturnType<typeof vi.fn> };
    fx?: unknown;
    playerAnim?: { attack(...args: unknown[]): void; holdAim(aim: unknown): void };
    /** The class kit as drawn, shared with the field scene. */
    kit: { aimLine?: { drawn: boolean } };
    menu?: unknown;
    bindRunInput(): void;
    resetRun(end: "shutdown" | "destroy"): void;
    leaveFloor(): void;
    openMenu(): void;
    endRun(): void;
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

  function aimOnStage(cls = "archer", specialization?: string) {
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
    run.handleGameStateUpdate(partyState({ ...as(cls), ...(specialization && { specialization }) } as ReturnType<typeof player>));
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

  // FS-TQZ5J § Change: Batch 6, R129 (batch 6 review, LOW): left held on a monster, a right press over the
  // UI scene's chat window reaches the run (the UI scene's cameras stand aside, A1 R25); the UI scene claims
  // it, and the run refuses it: no attack, no cast, no hold, and no strike on a monster under the window
  describe("a press the UI scene claimed: the chat window's, during a held world press (FS-TQZ5J § Change: Batch 6, R129)", () => {
    function claimedOnStage(cls: string) {
      const s = aimOnStage(cls);
      const bridge = new GameUiBridge();
      (s.run as unknown as { ui: unknown }).ui = bridge;
      const active = (s.run as unknown as { input: { activePointer: { button: number; event?: object } } }).input.activePointer;
      /** Right pressed with left held, over the chat window: its DOM event claimed by the UI scene, or not. */
      const rightOverChat = (claimed: boolean) => {
        const pointer = { x: 10, y: 10, button: 2, worldX: 400, worldY: 300, leftButtonDown: () => true, rightButtonDown: () => true, event: {} };
        active.button = 2;
        active.event = pointer.event;
        if (claimed) bridge.claimPress(pointer);
        s.pointerHandlers.pointerdown(pointer);
      };
      return { ...s, bridge, active, rightOverChat };
    }

    it.each(["archer", "mage", "warrior"])("should send nothing and start no hold for the %s's claimed press", (cls) => {
      const s = claimedOnStage(cls);
      s.rightOverChat(true);
      expect(s.sent).not.toHaveBeenCalled();
      expect(s.lineUp()).toBe(false);

      s.rightOverChat(false);
      expect(s.sent).toHaveBeenCalled();
    });

    it("should strike no monster under the window on a claimed press", () => {
      const s = claimedOnStage("warrior");
      // Phaser hands the monster its pointerdown before the run's, on the same active pointer
      s.active.event = {};
      s.bridge.claimPress(s.active as never);
      s.onMonster(0);
      expect(s.sent).not.toHaveBeenCalled();

      s.active.event = {};
      s.onMonster(0);
      expect(s.sent).toHaveBeenCalled();
    });
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

  it("should send exactly one shadow_shot at the cursor's world point on a release held 0.3 s, with the Heavy Shot release and attack clip", () => {
    const s = aimOnStage();
    s.press();
    s.release(1300, 520, 410);

    const target = await_iso.screenToWorld(520, 410);
    expect(s.casts()).toEqual([
      [ActionType.CastSkill, { skill_id: "shadow_shot", target_x: target.x, target_y: target.y }],
    ]);
    expect(s.fxPlay).toHaveBeenCalledTimes(1);
    // no specialization: the Heavy Shot, the shadow is a Shadow Ranger's alone (FS-1J1CB §F R41)
    expect(s.fxPlay.mock.calls[0][1]).toBe("heavyShotRelease");
    expect(s.attack).toHaveBeenCalledWith(1300, { x: target.x - ME_X, y: target.y - ME_Y });
    expect(s.lineUp()).toBe(false);
  });

  it.each([
    ["shadow_ranger", "shadowShotRelease", true],
    ["hunter", "heavyShotRelease", false],
  ])("should play a %s's own release as %s, its aim line drawn with the shadow: %s (FS-1J1CB §F R41, R42)", (spec, release, shadow) => {
    const s = aimOnStage("archer", spec);
    const aim = vi.spyOn(s.run.kit as unknown as { aim(...args: unknown[]): void }, "aim");
    s.press();
    expect(aim.mock.calls.at(-1)?.[3]).toBe(shadow);
    s.release(1300, 520, 410);
    expect(s.fxPlay).toHaveBeenCalledTimes(1);
    expect(s.fxPlay.mock.calls[0][1]).toBe(release);
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

  it("should grey the right-click square from a fired shot until the 1.2 s cooldown is over, and not for a hold", () => {
    const s = aimOnStage();
    s.press();
    expect(barShownOver(s.run)?.ability.greyed).toBe(false);
    s.release(1300);
    expect(barShownOver(s.run)?.ability.greyed).toBe(true);
    const cooldown = s.delayed().find(([ms]) => ms === 1200);
    expect(cooldown).toBeDefined();
    cooldown![1]();
    expect(barShownOver(s.run)?.ability.greyed).toBe(false);
  });

  // FS-Q18Q3 R23: the right-click square is active while the hold lasts, lit as it begins and down as it ends
  it("should light the right-click square while the hold lasts, and let it fall as the hold ends", () => {
    const s = aimOnStage();
    expect(barShownOver(s.run)?.ability.active).toBe(false);
    s.press();
    expect(barShownOver(s.run)?.ability.active).toBe(true);
    s.release(1100);
    expect(barShownOver(s.run)?.ability.active).toBe(false);
  });

  // the left-click's attack pin gates the release, not the press (FS-JS7C8 R63)
  it("should allow a hold to begin during the left-click's own lockout", () => {
    const s = aimOnStage();
    s.leftClick();
    s.press();
    s.release(1000 + ATTACK_PIN_MS);
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
    // the UI scene's menu opening, heard by the run (FS-TQZ5J R10)
    ["the ESC menu opening", (s) => menuUpOver(s.run)],
    ["the run ending", (s) => s.run.endRun()],
    // the UI scene's gear panel opening, heard by the run in the UI's state (FS-TQZ5J § Change: Phase 3, R53)
    ["the equipment panel opening", (s) => uiSceneOn(s.run, "run", { row: false }).bridge.reportUi({ inventory: true })],
    [
      "the character panel opening (FS-HRH2J § Change C5)",
      (s) => uiSceneOn(s.run, "run", { row: false }).bridge.reportUi({ character: true }),
    ],
    ["the right button released outside the canvas", (s) => s.pointerHandlers.pointerupoutside({ button: 2 })],
    ["the window losing focus", (s) => s.game.events.emit("blur")],
    ["the tab going hidden", (s) => s.game.events.emit("hidden")],
    ["the scene tearing down", (s) => s.run.resetRun("shutdown")],
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
    s.run.endRun();
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
    s.run.resetRun("shutdown");
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
      expect(barShownOver(s.run)?.ability.greyed).toBe(true);
      withStamina(s, 90);
      expect(barShownOver(s.run)?.ability.greyed).toBe(false);
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

    it("should draw the line ready exactly where the right-click square is lit, for every stamina value", () => {
      const s = aimOnStage();
      const draw = vi.spyOn(AimLine.prototype, "draw");
      s.press();
      s.run.time.now = 1300;
      for (let current = 0; current <= 100; current++) {
        withStamina(s, current);
        s.run.aimFrame();
        expect(lineReady(draw)).toBe(barShownOver(s.run)?.ability.greyed === false);
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
      s.run.resetRun("shutdown");
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
      s.run.resetRun("shutdown");
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
      s.run.resetRun("shutdown");
      expect(live()).toHaveLength(0);
    });

    it("should take the first state after a restart (a reconnect) as the baseline", () => {
      const s = parryOnStage({ parries: 1 });
      s.run.resetRun("shutdown");
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

    it("should grey the Parry square while parry_lockout is above 0, and light it at 0", () => {
      const s = parryOnStage({ parry_lockout: 0.98333 });
      expect(barShownOver(s.run)?.ability).toMatchObject({ icon: "parry", greyed: true });
      s.run.handleGameStateUpdate(partyState(merc({ parry_lockout: 0 })));
      expect(barShownOver(s.run)?.ability).toMatchObject({ icon: "parry", greyed: false });
    });

    // FS-Q18Q3 R23: the square is active while the stance is open, and greyed then too (a parry is refused)
    it("should light the Parry square's rim while the stance is open", () => {
      const s = parryOnStage({ parry_open: true });
      expect(barShownOver(s.run)?.ability).toMatchObject({ active: true, greyed: true });
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
      s.run.time.now += ATTACK_PIN_MS; // and its attack pin (FS-JS7C8 R62)
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
      s.run.resetRun("shutdown");
      expect(armed(s)).toBe(false);
      expect(live()).toHaveLength(0);
    });
  });

});

const { HEAL_LOOK } = await import("@/render/effects/shimmer");

describe("BarrowspireScene heal shimmer (FS-KZC92 §G R33–R38, §D R23, R26)", () => {
  const potion = {
    item_id: "i",
    entity_id: "e_potion",
    name: "Lesser Heal Potion",
    quantity: 1,
    item_type: "consumable",
    healing_amount: 25,
  };
  const worn = (potions: number) => ({
    weapon: null,
    head: null,
    chest: null,
    gloves: null,
    legs: null,
    ring_1: null,
    ring_2: null,
    consumable_1: potions > 0 ? potion : null,
    consumable_2: potions > 1 ? potion : null,
    consumable_3: potions > 2 ? potion : null,
  });
  const drinker = (id: string, name: string, x: number, potions: number, hp: number) => ({
    ...player(id, name, x, { current_health: hp }),
    equipment: worn(potions),
  });
  const ally = (potions: number, hp: number) => drinker("ally", "Wenna", 160, potions, hp);
  const state = (me: ReturnType<typeof drinker> | null, others = [ally(2, 60)]): GameState =>
    ({ ...floorState(1), current_player: me, other_players: others }) as GameState;
  const me = (potions: number, hp: number) => drinker("me", "Aldric", 130, potions, hp);

  /** A run on stage with a recording shimmer standing in for the baked one. */
  function onStage() {
    const scene = sceneOnStage();
    const shimmers = { playGranted: vi.fn(), follow: vi.fn(), forget: vi.fn(), playing: 0 };
    const run = scene.run as unknown as FloorRun & {
      shimmers?: typeof shimmers;
      playerAnim?: { crown?: number };
      player?: unknown;
      playerPos?: { x: number; y: number };
      targetPosition?: { x: number; y: number };
      events: Emitter;
      init(): void;
      update(time: number, delta: number): void;
    };
    run.shimmers = shimmers;
    return { run, shimmers };
  }

  it("should play one heal shimmer on the local player's drink, at their sheet's crown", () => {
    const { run, shimmers } = onStage();
    run.handleGameStateUpdate(state(me(2, 60)));
    // the sheet's crown, pinned: the empty art library has none, and undefined would pass anything
    const CROWN = 83;
    expect(run.playerAnim).toBeDefined();
    Object.defineProperty(run.playerAnim, "crown", { get: () => CROWN });
    run.handleGameStateUpdate(state(me(1, 85)));
    expect(shimmers.playGranted).toHaveBeenCalledTimes(1);
    expect(shimmers.playGranted).toHaveBeenCalledWith(HEAL_LOOK, CROWN);
  });

  it("should carry the shimmers with the player's drawn feet each frame (R23)", () => {
    const { run, shimmers } = onStage();
    run.handleGameStateUpdate(state(me(2, 60)));
    // one frame, with no key down and nothing else on stage to draw
    const up = { isDown: false };
    const keys = { left: up, right: up, up, down: up };
    Object.assign(run, {
      cursors: keys,
      wasd: keys,
      kit: { follow: vi.fn(), guarding: false },
      updateLighting: vi.fn(),
      updateOtherPlayersSmooth: vi.fn(),
      checkBuildingStatus: vi.fn(),
      sendMovementIntent: vi.fn(),
      playerPos: { x: 130, y: 0 },
      targetPosition: { x: 150, y: 20 },
    });
    expect(run.player).toBeDefined(); // the state drew the player
    shimmers.follow.mockClear();

    run.update(0, 16);

    expect(shimmers.follow).toHaveBeenCalledTimes(1);
    const [feet] = shimmers.follow.mock.calls[0];
    expect(feet).toBe(run.playerPos);
    // where the body was just drawn this frame, eased toward the server's position
    expect(feet).toEqual({ x: 136, y: 6 });
  });

  it("should play nothing for the first state, an unequip, or a teammate's drink", () => {
    const { run, shimmers } = onStage();
    run.handleGameStateUpdate(state(me(2, 60)));
    // an unequip: the count drops, health holds
    run.handleGameStateUpdate(state(me(1, 60)));
    // the ally drinks: only other_players changes
    run.handleGameStateUpdate(state(me(1, 60), [ally(1, 85)]));
    expect(shimmers.playGranted).not.toHaveBeenCalled();
  });

  it("should play twice for two drinks a cooldown apart", () => {
    const { run, shimmers } = onStage();
    run.handleGameStateUpdate(state(me(3, 40)));
    run.handleGameStateUpdate(state(me(2, 65)));
    run.handleGameStateUpdate(state(me(2, 65)));
    run.handleGameStateUpdate(state(me(1, 90)));
    expect(shimmers.playGranted).toHaveBeenCalledTimes(2);
  });

  it("should take a fresh baseline after a state with no current_player", () => {
    const { run, shimmers } = onStage();
    run.handleGameStateUpdate(state(me(2, 60)));
    run.handleGameStateUpdate(state(null));
    run.handleGameStateUpdate(state(me(1, 85)));
    expect(shimmers.playGranted).not.toHaveBeenCalled();
  });

  it.each(["shutdown", "destroy"])(
    "should take every live shimmer down on %s, and treat the next run's first state as a baseline",
    (event) => {
      const { run, shimmers } = onStage();
      run.init();
      run.handleGameStateUpdate(state(me(2, 60)));
      run.events.emit(event);
      expect(shimmers.forget).toHaveBeenCalledTimes(1);
      expect(run.shimmers).toBeUndefined();

      // the next run's shimmer, and a state that would be a drink against the old run's baseline
      const next = { playGranted: vi.fn(), follow: vi.fn(), forget: vi.fn(), playing: 0 };
      run.shimmers = next;
      run.handleGameStateUpdate(state(me(1, 85)));
      expect(next.playGranted).not.toHaveBeenCalled();
    },
  );

});

// FS-JS7C8 §D R22, §E R47: the own character and every other player face their drawn movement.
// Nothing turns a figure from outside its own motion (the animator a scene drives is stepped and
// shown, as on main), a `facing` on a state entry is never read, and nothing about facing is sent.
describe("BarrowspireScene facing from movement, nothing on the wire (FS-JS7C8 §D R22, §E R47)", () => {
  type Run = {
    handleGameStateUpdate(state: GameState): void;
    update(time: number, delta: number): void;
    updateOtherPlayersSmooth(time: number, delta: number): void;
    otherPlayersAnim: Map<string, unknown>;
    playerPos?: { x: number; y: number };
  };

  /** A baked animator's surface as the scene drives it: stepped from the drawn motion and shown. */
  const animator = () => ({
    baked: true,
    facing: "se",
    guard: vi.fn(),
    step: vi.fn(() => ({ animation: "run", facing: "e", direction: 0, timeScale: 1 })),
    show: vi.fn(),
  });

  it("should step the own character from where it is drawn, turn it by nothing else and send no face", () => {
    const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const run = sceneOnStage().run as unknown as Run;
    // an echo of a facing on the own entry, as a server built from slice 2 would send
    const me = { ...player("me", "Aldric", 130), facing: "w" };
    run.handleGameStateUpdate({ ...floorState(1), current_player: me, other_players: [] } as GameState);
    const anim = animator();
    const up = { isDown: false };
    const keys = { left: up, right: up, up, down: up };
    Object.assign(run, {
      cursors: keys,
      wasd: keys,
      kit: { follow: vi.fn(), guarding: false },
      combat: { aiming: false, aimFrame: vi.fn() },
      updateLighting: vi.fn(),
      updateOtherPlayersSmooth: vi.fn(),
      checkBuildingStatus: vi.fn(),
      sendMovementIntent: vi.fn(),
      playerPos: { x: 130, y: 0 },
      targetPosition: { x: 130, y: 0 },
      playerAnim: anim,
    });

    run.update(0, 16);
    run.update(200, 16);

    expect(anim.step).toHaveBeenCalledWith(run.playerPos, 200, 16, false);
    expect(sent.mock.calls.filter(([action]) => (action as string) === "face")).toEqual([]);
  });

  it("should draw another player by their movement, never by a facing their entry carries", () => {
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const run = sceneOnStage().run as unknown as Run;
    run.handleGameStateUpdate({
      ...floorState(1),
      current_player: player("me", "Aldric", 130),
      other_players: [{ ...player("ally", "Wenna", 160), facing: "w" }],
    } as unknown as GameState);
    const ally = animator();
    run.otherPlayersAnim.set("ally", ally);

    run.updateOtherPlayersSmooth(0, 16);

    expect(ally.step).toHaveBeenCalledTimes(1);
    expect(ally.show).toHaveBeenCalledTimes(1);
  });

  it("should leave no face sender behind (R47)", () => {
    expect(existsSync(join(__dirname, "faceWire.ts"))).toBe(false);
    expect(existsSync(join(__dirname, "faceWire.test.ts"))).toBe(false);
  });
});

// FS-T3DWX §Change: The top-right HUD fills the button's spot, G1, G5: no button keeps the corner
// any more, so the run's column starts at the corner's own inset, 10 px from the top and the right.
describe("the run's top-right HUD in the corner (FS-T3DWX G1, G5)", () => {
  it.each([1080, 1180, 1280])("should start at the corner's inset at logical width %i", (width) => {
    expect(anchorAt(TOP_RIGHT_EDGE, { width, height: 720 })).toEqual({ x: width - 10, y: 10 });
  });
});

// FS-SRA9J §E.20–21 (I-SRA9J-3), re-ordered by FS-56CKV §B.9 and §B.13 (which supersede §E.20 in
// part): the minimap is the column's first part, 216 × 108 at its top, the floor indicator and
// the escaped count under it, right-aligned at TOP_RIGHT_EDGE's x, as FS-48CTQ's target frame test
// assumes; with no minimap the two lines close up to the top.
describe("the run's minimap in the top-right column (FS-SRA9J §E.20, §E.21; FS-56CKV §B)", () => {
  const { MINIMAP } = await_minimap;
  const { TARGET_FRAME, TARGET_BOSS_FRAME, targetFrameRect } = await_targetFrame;
  const { topRightColumn } = await_topRightColumn;
  type Box = { x: number; y: number; width: number; height: number };
  /** A 12 px HUD line in its 3 px padding (the escaped count, the floor indicator), at its largest. */
  const LINE = { width: 160, height: 21 };
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  it.each([1080, 1280])(
    "should sit in the very corner with the floor indicator 6 px under it, right-aligned, within 216 × 108, clear of the rest of the top HUD at logical width %i (FS-56CKV §Change C1, C7; FS-T3DWX G2, G4, G5)",
    (width) => {
      const view = { width, height: 720 };
      const corner = anchorAt(TOP_RIGHT_EDGE, view);
      type Shown = "normal" | "overlay" | "none";
      const column = (shown: Shown) =>
        topRightColumn({
          view,
          minimap: shown === "normal" ? { ...MINIMAP, mode: "normal" } : shown === "overlay" ? { mode: "overlay" } : null,
          floorHeight: shown === "overlay" ? null : LINE.height,
          escapedHeight: LINE.height,
        });
      const { minimap, floor: floorAt } = column("normal");
      const map = minimap!;
      expect(map).toEqual({ x: corner.x - 216, y: 10, width: 216, height: 108 });
      expect(floorAt.y).toBe(map.y + map.height + 6);
      expect([MINIMAP.width, MINIMAP.height]).toEqual([216, 108]);
      if (width === 1080) expect(map.x).toBeGreaterThanOrEqual(854);
      // a top-centre notice (20 px text in 10 px padding, centred on y 100) up to 600 px wide;
      // either target frame
      const notice = { x: width / 2 - 300, y: 100 - 22, width: 600, height: 44 };
      const frames = [targetFrameRect(width / 2, TARGET_FRAME), targetFrameRect(width / 2, TARGET_BOSS_FRAME)];
      // with the minimap, under the overlay's icon row, and closed up to the top without either:
      // no part over another, nor over the rest
      for (const shown of ["normal", "overlay", "none"] as const) {
        const c = column(shown);
        const others = [notice, ...frames];
        const line = (p: { x: number; y: number }) => ({ x: p.x - LINE.width, y: p.y, ...LINE });
        const parts: Box[] = [
          ...(c.minimap ? [c.minimap] : []),
          ...(shown === "overlay" ? [c.modeIcon!.hit] : [line(c.floor)]),
          line(c.escaped),
        ];
        for (const part of parts) for (const other of others) expect(overlaps(part, other)).toBe(false);
        for (const [i, a] of parts.entries()) for (const b of parts.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      }
      expect(map.x).toBeGreaterThan(0);
      expect(map.y + map.height).toBeLessThan(720 / 2);
    },
  );

  // FS-1SEF0 §B.12: the enlarged minimap, 324 × 162 at the same corner, and the lines under it;
  // FS-56CKV §Change C3, C7; FS-T3DWX G3: in the very corner, y 10, nothing at its left
  it.each([
    [1080, 412],
    [1280, 612],
  ])(
    "should stand the enlarged minimap in the very corner, the map and the lines under it clear of either target frame and a notice up to its clear width at logical width %i, %i px (FS-1SEF0 §B.12; FS-56CKV §Change C3, C7; FS-T3DWX G3)",
    (width, clearNotice) => {
      const { minimapPanel } = await_minimap;
      const view = { width, height: 720 };
      const corner = anchorAt(TOP_RIGHT_EDGE, view);
      const c = topRightColumn({ view, minimap: { ...minimapPanel("enlarged"), mode: "enlarged" }, floorHeight: LINE.height, escapedHeight: LINE.height });
      const map = c.minimap!;
      expect(map).toEqual({ x: corner.x - 324, y: 10, width: 324, height: 162 });
      if (width === 1080) {
        expect(map.x).toBe(746);
        expect(targetFrameRect(width / 2, TARGET_BOSS_FRAME).x + TARGET_BOSS_FRAME.width).toBe(729);
      }
      expect(c.floor.y).toBe(178);
      const line = (p: { x: number; y: number }) => ({ x: p.x - LINE.width, y: p.y, ...LINE });
      const parts: Box[] = [map, line(c.floor), line(c.escaped)];
      const notice = (w: number) => ({ x: width / 2 - w / 2, y: 100 - 22, width: w, height: 44 });
      for (const part of parts)
        for (const other of [notice(clearNotice), targetFrameRect(width / 2, TARGET_FRAME), targetFrameRect(width / 2, TARGET_BOSS_FRAME)])
          expect(overlaps(part, other)).toBe(false);
      // the clear width is the widest: 2 px more and the notice's right end lies over the map (Edge States)
      expect(overlaps(map, notice(clearNotice + 2))).toBe(true);
      for (const [i, a] of parts.entries()) for (const b of parts.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    },
  );
});

// FS-77DVN §E.17, §E.20 (superseding FS-56CKV §D.20's XP bar at (10, 16), bars at (10, 56) and
// frames from 132 in part): with the XP bar gone to the bottom middle (§A), the run's top left
// closes up as a field's, the bars at (10, 16) and the frames from y 92; nothing at the top of a
// run may stand over it.
describe("the run's top-left stack, closed up (FS-77DVN §E)", () => {
  const { TARGET_FRAME, TARGET_BOSS_FRAME, targetFrameRect } = await_targetFrame;
  const { topRightColumn } = await_topRightColumn;
  const { positionReadoutPlace } = await_positionReadout;
  const { minimapNameBox } = await_minimapName;
  const { HUD_COLUMN_W, resourceHudHeight } = await_resourceHud;
  const { PARTY_FRAMES_PLACEMENT, partyFramesFrame } = await_partyFramesLayout;
  type Box = { x: number; y: number; width: number; height: number };
  /** A 12 px HUD line in its 3 px padding, at its largest, as the top-right column's test takes it. */
  const LINE = { width: 160, height: 21 };
  /** The dev readout at its widest ("X: 5760 Y: 3840 | Outdoor", 10 px), generously. */
  const READOUT = { width: 200, height: 19 };
  /** The widest floor name on its plate ("The Seventh Floor", 11 px letter-spaced 1), generously. */
  const NAME = { width: 140, height: 21 };
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  /**
   * The spectate HUD at its widest (`showSpectateHud`): "Watching <a long name>" at 14 px and the
   * "Tab: next player" hint 30 px under it, centred from y 10, generously.
   */
  const spectateHud = (width: number): Box => ({ x: width / 2 - 150, y: 10, width: 300, height: 56 });

  /** The stack: the bars at their tallest, four frames under them (the potion cell beside them is gone, FS-Q18Q3 R35, R36). */
  function stack(): Box[] {
    const bars = { ...RESOURCE_HUD_AT.run, width: HUD_COLUMN_W, height: resourceHudHeight(2) };
    const { x, top } = PARTY_FRAMES_PLACEMENT.run;
    return [bars, ...partyFramesFrame(4, x, top).map((f) => f.row)];
  }

  it("should stand the bars at (10, 16), as a field's, and the frames from y 92", () => {
    expect(RESOURCE_HUD_AT.run).toEqual({ x: 10, y: 16 });
    expect(PARTY_FRAMES_PLACEMENT.run).toEqual({ x: 10, top: 92 });
  });

  it.each([1080, 1280])(
    "should keep the stack inside the canvas and clear of either target frame, the spectate HUD, the top-right column and the dev readout at logical width %i",
    (width) => {
      const view = { width, height: 720 };
      const corner = anchorAt(TOP_RIGHT_EDGE, view);
      // the top centre: either target frame and the spectate HUD
      const centred = [
        targetFrameRect(width / 2, TARGET_FRAME),
        targetFrameRect(width / 2, TARGET_BOSS_FRAME),
        spectateHud(width),
      ];
      const parts = stack();
      // the minimap normal, enlarged (FS-1SEF0 §B), or none in the corner (no regions, the overlay)
      const panels = [
        { ...await_minimap.minimapPanel("normal"), mode: "normal" as const },
        { ...await_minimap.minimapPanel("enlarged"), mode: "enlarged" as const },
        { mode: "overlay" as const },
        null,
      ];
      for (const panel of panels) {
        const c = topRightColumn({ view, minimap: panel, floorHeight: LINE.height, escapedHeight: LINE.height });
        const line = (p: { x: number; y: number }) => ({ x: p.x - LINE.width, y: p.y, ...LINE });
        // in the map, normal or enlarged, or under the column (FS-56CKV §Change: Map name, E8; §Change: The
        // enlarged map keeps its labels inside, F2)
        const name = c.name && minimapNameBox(c.name, NAME);
        const at = positionReadoutPlace({ minimap: c.minimap, column: { right: corner.x, bottom: c.bottom } });
        const readout = { x: at.x - at.origin.x * READOUT.width, y: at.y - at.origin.y * READOUT.height, ...READOUT };
        const icons = [...(c.modeIcon ? [c.modeIcon.hit] : []), ...(name ? [name] : [])];
        const others = [...centred, ...(c.minimap ? [c.minimap] : []), ...icons, line(c.floor), line(c.escaped), readout];
        for (const part of parts) for (const other of others) expect(overlaps(part, other)).toBe(false);
      }
      for (const part of parts) {
        expect(part.x).toBeGreaterThanOrEqual(10);
        expect(part.y).toBeGreaterThanOrEqual(16);
        expect(part.y + part.height).toBeLessThan(view.height);
      }
    },
  );
});

// No floor uses the frame in the shipped table (FS-48CTQ § Change: Floor 1 carries overhead markers; no
// floor uses the target frame, 24–26; I-48CTQ-4), so these tests name their own `frame` floor: a later
// floor opts in by one table entry (26).
describe("BarrowspireScene target frame on a frame floor (FS-48CTQ §A–§C, §E; I-48CTQ-1, I-48CTQ-4)", () => {
  const { TARGET_FRAME, TARGET_FRAME_TOP, targetFrameRect } = await_targetFrame;
  /** The floor these tests opt in, and the table that does it. */
  const FRAME_FLOOR = 2;
  const FRAMED: MarkerModes = { run: { [FRAME_FLOOR]: "frame" } };

  interface FrameRun {
    time: { now: number; delayedCall: ReturnType<typeof vi.fn> };
    createUI(): void;
    updateTargetFrame(deltaMs: number): void;
    relayoutHud(): void;
    resetRun(end: "shutdown" | "destroy"): void;
    targetFrame?: { texts(): Made[] };
    /** The marker-mode table the run reads: the shipped one unless a test names its own. */
    markerModes: MarkerModes;
    watchedPlayerId?: string;
    /** The shared arrival card (FS-PQ2TW R37): the dark first, then the card, while one is up. */
    arrivalCard: { parts: unknown[] };
    events: Emitter;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The run on `floor` with its HUD up, at scene time 0, reading `table`: the test's own entry, or
   * the shipped table the scene starts with.
   */
  function framed(floor = FRAME_FLOOR, table: MarkerModes | "shipped" = FRAMED) {
    const stage = onStage();
    const run = stage.run as unknown as FrameRun & FloorRun;
    run.time.now = 0;
    if (table !== "shipped") run.markerModes = table;
    run.createUI();
    const state = (fields: Partial<ReturnType<typeof monster>> = {}) =>
      ({
        ...floorState(floor),
        current_player: player("me", "Aldric", 130),
        other_players: [player("ally", "Wenna", 160)],
        monsters: [{ ...monster("m1", 100), ...fields }],
      }) as GameState;
    run.handleGameStateUpdate(state());
    /** What the frame names now, or null while it is hidden. */
    const named = () => {
      const lines = run.targetFrame!.texts().filter((t) => t.shown && t.args[2] !== "");
      return lines.length ? lines.map((t) => t.args[2]).join(" ") : null;
    };
    const tick = (ms: number) => {
      run.time.now += ms;
      run.updateTargetFrame(ms);
    };
    /** The roster's own plate texts: the 11px plate in the hostile ink. */
    const plates = () =>
      stage.stage.made.filter((m) => {
        const style = m.args[3] as { fontSize?: string; color?: string } | undefined;
        return m.kind === "text" && style?.fontSize === "11px" && style.color === toCss(palette.markerHostile);
      });
    return { ...stage, run, state, named, tick, plates };
  }

  it("should draw no overhead plate over the opted-in floor's monsters, and plates on the floor beside it", () => {
    const opted = framed();
    (opted.run.monsters as InstanceType<typeof MonsterRoster>).update(16);
    expect(opted.plates().length).toBeGreaterThan(0);
    expect(opted.plates().every((p) => p.shown === false)).toBe(true);

    const beside = framed(FRAME_FLOOR + 1);
    (beside.run.monsters as InstanceType<typeof MonsterRoster>).update(16);
    expect(beside.plates().some((p) => p.shown === true)).toBe(true);
  });

  // § Change: Floor 1 carries overhead markers; no floor uses the target frame (24)
  it.each([1, 2, 3])("should draw the plate over floor %i's monsters under the shipped table", (floor) => {
    const { run, plates } = framed(floor, "shipped");
    (run.monsters as InstanceType<typeof MonsterRoster>).update(16);
    const shown = plates().filter((p) => p.shown === true);
    expect(shown.map((p) => p.args[2])).toContain("Ghoul · Lv 1");
  });

  // § Change (25): hovered, struck or engaged, floor 1's monsters take no frame; the demon keeps its plate
  it("should show no frame on floor 1 for a hovered monster, a struck one or an engaged boss", () => {
    const { run, monsters, named, tick, state, plates } = framed(1, "shipped");
    monsters()[0].handlers.pointerover();
    tick(120);
    expect(named()).toBeNull();

    monsters()[0].handlers.pointerdown();
    run.time.now += 280;
    run.handleGameStateUpdate(state({ current_health: 6 }));
    tick(120);
    expect(named()).toBeNull();

    monsters()[0].handlers.pointerout();
    run.handleGameStateUpdate(state({ boss: true, current_health: 4 } as Partial<ReturnType<typeof monster>>));
    tick(120);
    expect(named()).toBeNull();
    (run.monsters as InstanceType<typeof MonsterRoster>).update(16);
    expect(plates().some((p) => p.shown === true)).toBe(true);
  });

  it("should name the hovered monster at the top centre, and let go when the pointer leaves", () => {
    const { monsters, named, tick } = framed();
    tick(16);
    expect(named()).toBeNull();
    monsters()[0].handlers.pointerover();
    tick(120);
    expect(named()).toBe("Ghoul · Lv 1");
    monsters()[0].handlers.pointerout();
    tick(200);
    expect(named()).toBeNull();
  });

  it("should show no frame on the floor beside the opted-in one, where the plates are", () => {
    const { monsters, named, tick } = framed(FRAME_FLOOR + 1);
    monsters()[0].handlers.pointerover();
    tick(120);
    expect(named()).toBeNull();
  });

  // FS-48CTQ §D.10, I-48CTQ-2: the run's players, the local one among them, are who it may be
  // fighting
  it.each([
    ["hurt", { boss: true, current_health: 4 }, "Ghoul · Lv 1"],
    ["moving near the party at full health", { boss: true, action: "move" }, "Ghoul · Lv 1"],
    ["idle at full health", { boss: true }, null],
    ["hurt but not a boss", { current_health: 4 }, null],
  ] as const)("should hold the frame on an engaged boss with nothing hovered or hit: %s", (_, fields, want) => {
    const { run, named, tick, state } = framed();
    run.handleGameStateUpdate(state(fields as Partial<ReturnType<typeof monster>>));
    tick(120);
    expect(named()).toBe(want);
  });

  it("should not take a boss moving at full health for engaged when every player is out of play", () => {
    const { run, named, tick, state } = framed();
    const out = { ...state({ boss: true, action: "move" } as unknown as Partial<ReturnType<typeof monster>>) } as GameState;
    out.current_player = player("me", "Aldric", 130, { current_health: 0 }) as GameState["current_player"];
    out.other_players = [player("ally", "Wenna", 160, { escape: true })] as GameState["other_players"];
    run.handleGameStateUpdate(out);
    tick(120);
    expect(named()).toBeNull();
  });

  it("should name the monster the player strikes, then let go 3 s after the last own hit", () => {
    const { run, monsters, named, tick, state, sent } = framed();
    monsters()[0].handlers.pointerdown();
    expect(sent).toHaveBeenCalledWith(ActionType.Attack, { enemy_entity_id: "m1" });
    tick(120);
    expect(named()).toBe("Ghoul · Lv 1");

    // the hit lands 400 ms after the intent: the 3 s run from it
    run.time.now += 280;
    run.handleGameStateUpdate(state({ current_health: 6 }));
    tick(2900);
    expect(named()).toBe("Ghoul · Lv 1");
    tick(100);
    tick(200);
    expect(named()).toBeNull();
  });

  it("should not hold on a teammate's hit, more than 1 s after the player's intent", () => {
    const { run, monsters, named, tick, state } = framed();
    monsters()[0].handlers.pointerdown();
    run.time.now += 1500;
    run.handleGameStateUpdate(state({ current_health: 6 }));
    tick(1500);
    tick(200);
    expect(named()).toBeNull();
  });

  it("should let go when the monster it names dies", () => {
    const { run, monsters, named, tick, state } = framed();
    monsters()[0].handlers.pointerdown();
    tick(120);
    run.handleGameStateUpdate(state({ action: "dead", current_health: 0 }));
    tick(200);
    expect(named()).toBeNull();
  });

  it("should never name a party member the pointer is over", () => {
    const { players, named, tick } = framed();
    players()[1].handlers.pointerover?.();
    tick(120);
    expect(named()).toBeNull();
  });

  it("should hide while the floor-change veil holds the top centre", () => {
    const { run, monsters, named, tick } = framed();
    monsters()[0].handlers.pointerover();
    tick(120);
    run.arrivalCard.parts = [{}];
    tick(16);
    expect(named()).toBeNull();
  });

  // FS-QPDKN § Change: The party death flow and the spectate switcher, R164: nothing holds the top centre while
  // spectating, so the frame follows its own rules
  it("should stay up while the player spectates", () => {
    const { run, monsters, named, tick } = framed();
    monsters()[0].handlers.pointerover();
    tick(120);
    Object.assign(run, { watchedPlayerId: "ally", switcher: { piece: { destroy() {} }, key: "" } });
    tick(16);
    expect(named()).not.toBeNull();
  });

  it("should re-anchor at the new centre on a resize", () => {
    const { run, monsters, tick } = framed();
    Object.assign((run as unknown as { containerView: object }).containerView, { relayout: vi.fn() });
    monsters()[0].handlers.pointerover();
    tick(120);
    const line = () => run.targetFrame!.texts().find((t) => t.shown)!;
    expect(line().last.setPosition[0]).toBe(400);
    viewport.set({ width: 1000, height: 600, renderScale: 1 });
    run.relayoutHud();
    expect(line().last.setPosition[0]).toBe(500);
    viewport.set({ width: 800, height: 600, renderScale: 1 });
  });

  it("should let the frame go with the run", () => {
    const { run } = framed();
    expect(run.targetFrame).toBeDefined();
    run.resetRun("shutdown");
    expect(run.targetFrame).toBeUndefined();
  });

  // §E.14: at the view's two ends, clear of the notice band, the top-right column (the escaped
  // count, the floor indicator and FS-SRA9J's 216 px minimap) and the top-left
  // column (180 wide from x 10)
  it.each([1080, 1280])("should stand clear of the rest of the top HUD at logical width %i", (width) => {
    const view = { width, height: 720 };
    const r = targetFrameRect(width / 2);
    expect(r.y).toBe(10);
    expect(r.width).toBeLessThanOrEqual(280);
    expect(r.height).toBeLessThanOrEqual(52);
    expect(TARGET_FRAME.height + TARGET_FRAME_TOP).toBeLessThan(100 - 22);
    const minimapLeft = anchorAt(TOP_RIGHT_EDGE, view).x - 216;
    expect(r.x + r.width).toBeLessThan(minimapLeft);
    expect(r.x).toBeGreaterThan(10 + 180 + 10);
  });
});

describe("keepBodySize (FS-HF0WW)", () => {
  /** An arcade body's setSize: the source size, times the sprite's scale. */
  const spriteAt = (scale: number) => {
    const body = {
      sourceWidth: 60,
      sourceHeight: 60,
      width: 60 * scale,
      height: 60 * scale,
      setSize(w: number, h: number) {
        this.sourceWidth = w;
        this.sourceHeight = h;
        this.width = w * scale;
        this.height = h * scale;
      },
    };
    return { body } as unknown as Parameters<typeof keepBodySize>[0] & { body: typeof body };
  };

  it("should keep a 2x sheet's body at the 1x size, however often it is called", () => {
    const sprite = spriteAt(0.5);
    keepBodySize(sprite, 0.5);
    keepBodySize(sprite, 0.5);
    expect([sprite.body.width, sprite.body.height]).toEqual([60, 60]);
  });

  it("should keep a 1.5x sheet's body at the 1x size too (ADR-0076)", () => {
    const sprite = spriteAt(1 / 1.5);
    keepBodySize(sprite, 1 / 1.5);
    keepBodySize(sprite, 1 / 1.5);
    expect(sprite.body.width).toBeCloseTo(60, 9);
    expect(sprite.body.height).toBeCloseTo(60, 9);
  });

  it("should leave a 1x sheet's body alone", () => {
    const sprite = spriteAt(1);
    keepBodySize(sprite, 1);
    expect(sprite.body.sourceWidth).toBe(60);
  });
});

const { artLoaderStandin, shippedManifest, RESIDENT_ART_PAGES } = await import("@/render/art/artLoader.standin");
const { atlasTextureKey } = await import("@/render/art/library");

// The run loads its creatures and the boss at entry, for every floor (FS-C4JWH §B R9).
const { withSpecLooks } = await import("@/render/art/artLoader.standin");

// FS-1J1CB R20 (ADR-0088 Decision 3): the player's own spec look comes with the run's preload.
describe("BarrowspireScene spec looks (FS-1J1CB R20)", () => {
  const enterAs = (specialization?: string) =>
    useGameStore.setState({
      characters: [
        { id: "c1", name: "Wren", className: "archer", level: 20, experience: 0, levelFloor: 0, specialization, createdAt: "" },
      ],
      activeCharacterId: "c1",
    });
  afterEach(() => useGameStore.setState({ characters: [], activeCharacterId: null }));

  it.each([
    ["hunter", ["archer_hunter-0"]],
    [undefined, []],
  ])("should queue a character's own look (%s) with the creatures and the boss, and no other look", (spec, look) => {
    enterAs(spec);
    const art = artLoaderStandin({
      manifest: withSpecLooks(shippedManifest(), "archer_hunter", "knight_berserker"),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const anything: Record<string, unknown> = new Proxy({}, { get: () => () => anything });
    const run = Object.assign(new BarrowspireScene(), art.scene, {
      make: { graphics: () => anything },
    }) as unknown as { preload(): void };

    run.preload();

    const own = ["boss-0", "boss-1", "boss-2", "creatures-0", "creatures-1", "creatures-2", "creatures-3", "creatures-4"];
    expect(art.queued.sort()).toEqual([...own, ...look].map(atlasTextureKey).sort());
  });
});

describe("BarrowspireScene art loading (FS-C4JWH §B R7, R9)", () => {
  it("should queue the creatures and the boss and nothing else, the resident art being loaded", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const anything: Record<string, unknown> = new Proxy({}, { get: () => () => anything });
    const run = Object.assign(new BarrowspireScene(), art.scene, {
      make: { graphics: () => anything },
    }) as unknown as { preload(): void };

    run.preload();

    expect(art.queued.sort()).toEqual(["boss-0", "boss-1", "boss-2", "creatures-0", "creatures-1", "creatures-2", "creatures-3", "creatures-4"].map(atlasTextureKey));
  });

  it("should show the torch bar over creatures and boss still downloading at 300 ms, gone before create, then fade the run in (FS-C4JWH §D R17, A1)", () => {
    vi.useFakeTimers();
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const anything: Record<string, unknown> = new Proxy({}, { get: () => () => anything });
    const run = Object.assign(new BarrowspireScene(), art.scene, {
      make: { graphics: () => anything },
    }) as unknown as { preload(): void };
    let atCreate: boolean[] = [];

    art.boot({ preload: () => run.preload(), create: () => (atCreate = art.drawn.map((d) => d.destroyed)) }, undefined, {
      hold: true,
    });
    vi.advanceTimersByTime(300);
    art.finish();
    vi.runAllTimers();
    vi.useRealTimers();

    expect(atCreate.length).toBeGreaterThan(0);
    expect(atCreate.every(Boolean)).toBe(true);
    expect(art.camera.fades.at(-2)).toBe("fadeIn(200, 18, 18, 18)");
  });
});

// A floor-1 chest whose guards still stand is refused by the server: the coffer never opened (it
// waits for the server), and the notice says only that it will not open (FS-KE075 §J R60).
// FS-XWHZP R16, R19, R23, R24 (I-XWHZP-3): escapes and the server's one-shot as hope lines.
describe("BarrowspireScene escapes and the exit door's one-shot as lore lines (FS-XWHZP §E)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function speaking() {
    const s = onStage();
    const run = s.run as unknown as FloorRun;
    const said = loreOf(run).said;
    return { ...s, run, said, lines: () => said.mock.calls.map(([line]) => line) };
  }

  it("should walk each player out of the dark once, the player themself as you", () => {
    const { run, lines, stage } = speaking();
    run.handleGameStateUpdate(partyState());
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130), player("ally", "Wenna", 160, { escape: true })));
    run.handleGameStateUpdate(
      partyState(player("me", "Aldric", 130, { escape: true }), player("ally", "Wenna", 160, { escape: true })),
    );
    run.handleGameStateUpdate(
      partyState(player("me", "Aldric", 130, { escape: true }), player("ally", "Wenna", 160, { escape: true })),
    );

    expect(lines()).toEqual([
      { text: "Wenna walks out of the dark.", tone: "hope" },
      { text: "You walk out of the dark.", tone: "hope" },
    ]);
    expect(stage.made.filter((m) => m.kind === "text" && /escaped successfully/.test(String(m.args[2])))).toHaveLength(0);
  });

  it("should replay no escape after a reconnect: the first broadcast is the baseline", () => {
    const { run, lines } = speaking();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130), player("ally", "Wenna", 160, { escape: true })));
    expect(lines()).toEqual([]);
  });

  it("should play the server's exit_door_unlocked as the switch's hope line, never its words", () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
    vi.spyOn(socketManager, "onError").mockImplementation(() => {});
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "isConnected").mockReturnValue(true);
    vi.spyOn(socketManager, "onConnectionStatusChange").mockReturnValue(() => {});
    vi.spyOn(socketManager, "onGameStateUpdate").mockReturnValue(() => {});
    const run = new BarrowspireScene() as unknown as {
      init(data?: object): void;
      connectToServer(): void;
      showNotification(message: string, color: string): void;
    };
    run.init({ sessionID: "run-a" });
    const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
    const said = loreOf(run).said;
    run.connectToServer();

    listeners.get("exit_door_unlocked")?.({ message: "Exit door unlocked! Run to escape!" });

    expect(said).toHaveBeenCalledWith({ text: "The seal breaks. Somewhere, a door gives.", tone: "hope" });
    expect(notified).not.toHaveBeenCalled();
  });
});

// FS-XWHZP R15 (I-XWHZP-2): the lines belong to the floor they were said on.
describe("BarrowspireScene lore lines on a floor change (FS-XWHZP R15)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // FS-04EEA R45: a rain falls with its floor; a Blink waiting to land lands nowhere on the next
  it("should let the kit's rain and waiting Blink go with the floor", () => {
    const { run } = onStage();
    const left = vi.spyOn((run as unknown as { kit: { leaveFloor(): void } }).kit, "leaveFloor");
    (run as unknown as { leaveFloor(): void }).leaveFloor();
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("should take the old floor's lore lines down when the party leaves it", () => {
    const { run } = onStage();
    const floor = run as unknown as { leaveFloor(): void };
    const cleared = loreOf(floor).cleared;

    floor.leaveFloor();

    expect(cleared).toHaveBeenCalledTimes(1);
  });

  // FS-TQZ5J § Change: Merge with main, the owner's 2026-11-14 call: the lines are the UI scene's, told
  // through the bridge as plain data; the dread line's tremor still shakes the run's camera, at the UI
  // scene's request as the line starts (FS-XWHZP R10)
  it("should tell the UI scene's lines through the bridge, and tremble its own camera when a dread line asks", () => {
    const { run } = onStage();
    const shake = vi.fn();
    const cameras = run.cameras as unknown as { main: Record<string, unknown> };
    cameras.main = { ...cameras.main, shake };
    const { bridge } = uiSceneOn(run, "run", { row: false });
    const told: unknown[] = [];
    bridge.onScreen({ lore: (message) => void told.push(message) });

    (run as unknown as { leaveFloor(): void }).leaveFloor();
    bridge.request({ kind: "tremor", durationMs: 220, intensity: 0.002 });

    expect(told).toEqual([{ world: "run", kind: "clear" }]);
    expect(shake).toHaveBeenCalledWith(220, 0.002);
  });
});

describe("BarrowspireScene a guarded chest's refusal (FS-KE075 §J R60)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function connected() {
    const listeners = new Map<string, (payload: unknown) => void>();
    vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
    vi.spyOn(socketManager, "onError").mockImplementation(() => {});
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "isConnected").mockReturnValue(true);
    vi.spyOn(socketManager, "onConnectionStatusChange").mockReturnValue(() => {});
    vi.spyOn(socketManager, "onGameStateUpdate").mockReturnValue(() => {});
    const run = new BarrowspireScene() as unknown as {
      init(data?: object): void;
      connectToServer(): void;
      showNotification(message: string, backing: number): void;
      containerView: { entityId: string | null; close: ReturnType<typeof vi.fn> };
      reaching?: string;
    };
    run.init({ sessionID: "run-a" });
    run.containerView = { entityId: null, close: vi.fn() };
    run.reaching = "chest-1";
    const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
    const said = loreOf(run).said;
    run.connectToServer();
    return {
      run,
      notified,
      said,
      reply: (payload: unknown) => listeners.get("interact")?.(payload),
      equip: (payload: unknown) => listeners.get("equip")?.(payload),
      buy: (payload: unknown) => listeners.get("buy")?.(payload),
      useItem: (payload: unknown) => listeners.get("use_item")?.(payload),
    };
  }

  // FS-4EC7Z §F R27, §G R31 (I-4EC7Z-6): the encounters' refusals are HUD notices, never lore lines
  it("should say the cage's refusal as a HUD notice in the client's words, and no lore line", () => {
    const { notified, said, reply } = connected();
    reply({ success: false, message: "the cage is locked", reason: "cage_locked" });
    reply({ success: false, message: "too many follow you already", reason: "too_many_allies" });
    expect(notified.mock.calls).toEqual([
      ["Locked. Find the key.", palette.damageBright],
      ["Too many follow you already.", palette.damageBright],
    ]);
    expect(said).not.toHaveBeenCalled();
  });

  // FS-9JV5K §F R23, R24 (I-9JV5K-5): the purchase's and the drink's replies reach the run
  it("should hear the buy and use_item replies, each in plain words as a notice", () => {
    const { notified, buy, useItem } = connected();
    buy({ success: false, reason: "wallet_unavailable", message: "your purse can't be reached" });
    useItem({ success: false, reason: "not_poisoned", message: "you are not poisoned" });
    expect(notified.mock.calls).toEqual([
      ["Your purse can't be reached. Nothing was taken.", palette.damageBright],
      ["You are not poisoned.", palette.damageBright],
    ]);
  });

  // FS-XWHZP R16: the world's reply is a lore line, in the client's words, never a HUD notice
  it("should give up the reach and say it will not open, as a lore line", () => {
    const { run, notified, said, reply } = connected();
    reply({ success: false, message: "its guards still stand", reason: "container_guarded" });

    expect(run.reaching).toBeUndefined();
    expect(said).toHaveBeenCalledTimes(1);
    expect(said).toHaveBeenCalledWith({ text: "It will not open.", tone: "lore" });
    expect(notified).not.toHaveBeenCalled();
  });

  it("should give up the reach on a chest out of reach too, the server's words a lore line (FS-XWHZP R17)", () => {
    const { run, said, notified, reply } = connected();
    reply({ success: false, message: "too far away to interact" });

    expect(run.reaching).toBeUndefined();
    expect(said).toHaveBeenCalledWith({ text: "too far away to interact", tone: "lore" });
    expect(notified).not.toHaveBeenCalled();
  });

  it("should say the stair's wait and the tome's line as lore lines (FS-XWHZP R16)", () => {
    const { said, notified, reply } = connected();
    reply({ success: false, message: "the party has not gathered at the stairs", reason: "party_not_gathered", missing: 2 });
    reply({ success: true, message: "", reason: "tome_taken" });
    reply({ success: false, message: "burned", reason: "altar_burned" });

    expect(said.mock.calls.map(([line]) => line)).toEqual([
      { text: "The stair waits. 2 of your party are not yet with you.", tone: "lore" },
      { text: "Wonder if I can burn it.", tone: "lore" },
    ]);
    expect(notified).not.toHaveBeenCalled();
  });

  it("should keep a refused equip a HUD notice: it is the interface's (FS-XWHZP R20)", () => {
    const { said, notified, equip } = connected();
    equip({ success: false, message: "You cannot wear that yet." });

    expect(notified).toHaveBeenCalledTimes(1);
    expect(notified.mock.calls[0][0]).toBe("You cannot wear that yet.");
    expect(said).not.toHaveBeenCalled();
  });

  it("should keep the reach, and an open coffer, through the empty frame that follows a reply", () => {
    const { run, reply } = connected();
    reply({ success: false, message: "" });

    expect(run.reaching).toBe("chest-1");
    expect(run.containerView.close).not.toHaveBeenCalled();
  });
});

// The server counts a timed open and says so on the player's own state, every tick; the client only
// draws it. Built against the FS's wire shape with fixture states (FS-MQYEX R18).
describe("BarrowspireScene the open bar (FS-MQYEX §D R21–R25; I-MQYEX-4)", () => {
  type TimedOpen = { entity_id: string; elapsed: number; duration: number };
  const blade = { entity_id: "i1", name: "Blade" };
  /** The player's own timed open on floor 1's chest, `elapsed` seconds into its 1.5. */
  const opening = (elapsed: number, entity_id = "c1"): TimedOpen => ({ entity_id, elapsed, duration: 1.5 });
  /** Floor 1 as this player's state: their timed open if any, and the chest shut or open. */
  const state = (
    timed_open?: TimedOpen,
    chest: { is_open?: boolean; items?: unknown[] } = {},
    others: unknown[] = [],
  ): GameState => {
    const floor = floorState(1);
    return {
      ...floor,
      // by the chest, which is at (150, 150)
      current_player: { ...player("me", "Aldric", 150), position: at(150, 150), ...(timed_open ? { timed_open } : {}) },
      other_players: others,
      containers: [{ ...floor.containers[0], is_open: false, items: [], ...chest }],
    } as GameState;
  };
  // every recorded sprite reports 10 px bounds at the origin: the bar over one is centred on x 5,
  // its foot 10 px above y 0
  const BAR = { x: -17, y: -17, width: 44, height: 7 };

  function onStage() {
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const scene = sceneOnStage();
    const view = { entityId: null as string | null, isOpen: false, open: vi.fn(), close: vi.fn(), setItems: vi.fn() };
    view.open.mockImplementation((id: string) => void (view.entityId = id));
    const clock = { delayedCall: vi.fn(), now: 1000 };
    const run = scene.run as unknown as FloorRun & {
      containerView: typeof view;
      watchedPlayerId?: string;
      events: Emitter;
      init(): void;
      toggleChest(id: string): void;
      showNotification(message: string, backing: number): void;
      update(time: number, delta: number): void;
    };
    run.containerView = view;
    run.time = clock;
    const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
    /** Every open bar the scene made, and those still up and showing. */
    const made = () => scene.stage.made.filter((m) => m.kind === "graphics" && (m as { name?: string }).name === "open-bar");
    const bars = () => made().filter((m) => !m.destroyed && m.shown !== false);
    /** The bar's fill as last drawn: the latest rectangle filled. */
    const fill = () => {
      const [x, y, width, height] = bars()[0].last.fillRect as number[];
      return { x, y, width, height };
    };
    const chestSprite = () =>
      scene.stage.made.find((m) => m.kind === "sprite" && String(m.args[2]).startsWith("chest_")) as Made & {
        visible?: boolean;
      };
    /** One frame, no key down, with nothing else on stage to draw. */
    const frame = (ms: number) => {
      const up = { isDown: false };
      const keys = { left: up, right: up, up, down: up };
      Object.assign(run, {
        cursors: keys,
        wasd: keys,
        kit: { follow: vi.fn(), guarding: false, sync: vi.fn() },
        updateLighting: vi.fn(),
        updateOtherPlayersSmooth: vi.fn(),
        checkBuildingStatus: vi.fn(),
        updateTargetFrame: vi.fn(),
        sendMovementIntent: vi.fn(),
      });
      clock.now += ms;
      run.update(clock.now, ms);
    };
    return { run, view, clock, notified, made, bars, fill, chestSprite, frame };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should draw the bar over the container at elapsed / duration, in the world's marker band", () => {
    const { run, bars, fill } = onStage();
    run.handleGameStateUpdate(state(opening(0.75)));

    expect(bars()).toHaveLength(1);
    expect(bars()[0].depth).toBe(MARKER_DEPTH.bar);
    expect(bars()[0].last.strokeRect).toEqual([BAR.x, BAR.y, BAR.width, BAR.height]);
    // half full, from the left end
    expect(fill()).toEqual({ ...BAR, width: 22 });
  });

  it("should draw nothing while the state carries no timed open", () => {
    const { run, made } = onStage();
    run.handleGameStateUpdate(state());
    run.handleGameStateUpdate(state());
    expect(made()).toHaveLength(0);
  });

  it("should move the one bar with the next state", () => {
    const { run, made, bars, fill } = onStage();
    run.handleGameStateUpdate(state(opening(0.75)));
    run.handleGameStateUpdate(state(opening(1.2)));

    expect(made()).toHaveLength(1);
    expect(bars()).toHaveLength(1);
    expect(fill().width).toBeCloseTo(35.2);
  });

  it("should take the bar down, with no notice, on a state without the timed open", () => {
    const { run, bars, notified } = onStage();
    run.handleGameStateUpdate(state(opening(0.75)));
    notified.mockClear();
    run.handleGameStateUpdate(state());

    expect(bars()).toHaveLength(0);
    expect(notified).not.toHaveBeenCalled();
  });

  it("should open no view on the E key or while the bar fills, then open it and drop the bar on the state that shows the container open", () => {
    const { run, view, bars } = onStage();
    run.handleGameStateUpdate(state());
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(opening(0.75)));
    run.handleGameStateUpdate(state(opening(1.47)));
    expect(view.open).not.toHaveBeenCalled();
    expect(bars()).toHaveLength(1);

    run.handleGameStateUpdate(state(undefined, { is_open: true, items: [blade] }));
    expect(view.open).toHaveBeenCalledTimes(1);
    expect(view.open).toHaveBeenCalledWith("c1", "chest");
    expect(bars()).toHaveLength(0);
  });

  it("should draw no bar over a container the same state shows open", () => {
    const { run, view, bars } = onStage();
    run.handleGameStateUpdate(state());
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(opening(1.5), { is_open: true, items: [blade] }));

    expect(bars()).toHaveLength(0);
    expect(view.open).toHaveBeenCalledWith("c1", "chest");
  });

  it("should stop at full and open nothing, whatever the state's times say", () => {
    const { run, view, fill } = onStage();
    run.handleGameStateUpdate(state());
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(opening(1.5)));
    expect(fill().width).toBe(44);
    run.handleGameStateUpdate(state(opening(9)));
    expect(fill().width).toBe(44);
    expect(view.open).not.toHaveBeenCalled();
  });

  it("should run the fill on with real time between states, never past full, and let the next state correct it", () => {
    const { run, view, bars, fill, frame } = onStage();
    run.handleGameStateUpdate(state());
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(opening(0.75)));

    // 0.3 s on with no state: 1.05 s of 1.5 s
    frame(300);
    expect(fill().width).toBeCloseTo(30.8);
    // the states stop coming: the bar fills, waits, and opens nothing
    frame(5_000);
    expect(fill()).toEqual({ ...BAR, width: 44 });
    expect(bars()).toHaveLength(1);
    expect(view.open).not.toHaveBeenCalled();

    // the server's count is the truth, even when it is behind the bar
    run.handleGameStateUpdate(state(opening(0.9)));
    expect(fill().width).toBeCloseTo(26.4);
  });

  it("should draw no bar from another player's state", () => {
    const { run, made } = onStage();
    const ally = { ...player("ally", "Wenna", 160), timed_open: opening(0.75) };
    run.handleGameStateUpdate(state(undefined, {}, [ally]));
    expect(made()).toHaveLength(0);
  });

  it("should draw no bar while spectating, and take down one that was up", () => {
    const { run, bars } = onStage();
    run.handleGameStateUpdate(state(opening(0.75)));
    expect(bars()).toHaveLength(1);

    run.watchedPlayerId = "ally";
    run.handleGameStateUpdate(state(opening(0.9)));
    expect(bars()).toHaveLength(0);
  });

  it("should draw no bar for a container the client is not drawing", () => {
    const { run, bars } = onStage();
    // one the snapshot never held
    run.handleGameStateUpdate(state(opening(0.75, "elsewhere")));
    expect(bars()).toHaveLength(0);

    // one that leaves the snapshot mid-open
    run.handleGameStateUpdate(state(opening(0.75)));
    expect(bars()).toHaveLength(1);
    run.handleGameStateUpdate({ ...state(opening(0.9)), containers: [] });
    expect(bars()).toHaveLength(0);
  });

  it("should hide the bar while the container's sprite is hidden, and show it again with it", () => {
    const { run, bars, chestSprite, frame } = onStage();
    run.handleGameStateUpdate(state(opening(0.3)));
    chestSprite().visible = false;
    frame(16);
    expect(bars()).toHaveLength(0);

    chestSprite().visible = true;
    frame(16);
    expect(bars()).toHaveLength(1);
  });

  it("should open an already-open container's view at once on the E key, with no bar", () => {
    const { run, view, made } = onStage();
    run.handleGameStateUpdate(state(undefined, { is_open: true, items: [blade] }));
    run.toggleChest("c1");

    expect(view.open).toHaveBeenCalledWith("c1", "chest");
    expect(made()).toHaveLength(0);
  });

  it.each(["shutdown", "destroy"])("should hold no bar past %s: the next run draws its own", (event) => {
    const { run, made, bars } = onStage();
    run.init();
    run.handleGameStateUpdate(state(opening(0.75)));
    run.events.emit(event);

    run.handleGameStateUpdate(state(opening(0.3)));
    expect(made()).toHaveLength(2);
    expect(bars().at(-1)).toBe(made()[1]);
  });

  // A cancel affects only the player it happened to: their reach ends with their timed open, so a
  // teammate opening the container later opens no view for them (FS-MQYEX R26, D13).
  describe("giving up the reach (FS-MQYEX §D R26; I-MQYEX-5)", () => {
    const opened = { is_open: true, items: [blade] };
    /** The same state with the player at `x` on the chest's row, as the server has them; the chest is at x 150. */
    const movedTo = (moved: GameState, x: number): GameState =>
      ({ ...moved, current_player: { ...moved.current_player, position: at(x, 150) } }) as GameState;
    /** The player standing by the shut chest, having pressed E on it. */
    function reached() {
      const stage = onStage();
      stage.run.handleGameStateUpdate(state());
      stage.run.toggleChest("c1");
      return stage;
    }

    it("should give up the reach when the timed open a state showed is gone with the container still shut", () => {
      const { run, view, bars, notified } = reached();
      run.handleGameStateUpdate(state(opening(0.3)));
      run.handleGameStateUpdate(state());

      expect(bars()).toHaveLength(0);
      expect(notified).not.toHaveBeenCalled();
      // a teammate finishes later: the chest is drawn open, and no view opens
      run.handleGameStateUpdate(state(undefined, opened));
      expect(view.open).not.toHaveBeenCalled();
    });

    it("should give up the reach when the timed open has moved to another container", () => {
      const { run, view } = reached();
      run.handleGameStateUpdate(state(opening(0.3)));
      run.handleGameStateUpdate(state(opening(0.1, "elsewhere")));

      run.handleGameStateUpdate(state(undefined, opened));
      expect(view.open).not.toHaveBeenCalled();
    });

    it("should open the view on the state that both drops the timed open and shows the container open", () => {
      // the player's own finished, or a teammate's did while theirs ran
      const { run, view, bars } = reached();
      run.handleGameStateUpdate(state(opening(0.9)));
      run.handleGameStateUpdate(state(undefined, opened));

      expect(view.open).toHaveBeenCalledTimes(1);
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
      expect(view.setItems).toHaveBeenCalledWith([blade]);
      expect(bars()).toHaveLength(0);
    });

    it("should keep a reach no state has answered yet through states without a timed open", () => {
      // the reply is still on its way
      const { run, view, frame } = reached();
      run.handleGameStateUpdate(state());
      frame(16);
      run.handleGameStateUpdate(state());

      run.handleGameStateUpdate(state(opening(0.03)));
      run.handleGameStateUpdate(state(undefined, opened));
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
    });

    it("should open the view for a reach made before the held state showed the player stopped", () => {
      // E pressed within a round trip of stopping: the state held at the press is older than the stop
      const stage = onStage();
      stage.run.handleGameStateUpdate(movedTo(state(), 140));
      stage.run.toggleChest("c1");
      const { run, view } = stage;

      // the server's answer: the player where they stopped, their timed open on the chest
      run.handleGameStateUpdate(state(opening(0.03)));
      run.handleGameStateUpdate(state(opening(0.5)));
      run.handleGameStateUpdate(state(opening(1.47)));
      run.handleGameStateUpdate(state(undefined, opened));

      expect(view.open).toHaveBeenCalledTimes(1);
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
      expect(view.setItems).toHaveBeenCalledWith([blade]);
    });

    it("should judge no change of position before a state shows the timed open", () => {
      const { run, view } = reached();
      // still in reach of the chest, and no answer yet
      run.handleGameStateUpdate(movedTo(state(), 151));
      run.handleGameStateUpdate(movedTo(state(), 152));

      run.handleGameStateUpdate(movedTo(state(opening(0.03)), 152));
      run.handleGameStateUpdate(movedTo(state(undefined, opened), 152));
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
    });

    it("should give up the reach when the player's own position changes from the first state that showed the timed open", () => {
      const stage = onStage();
      stage.run.handleGameStateUpdate(movedTo(state(), 140));
      stage.run.toggleChest("c1");
      const { run, view } = stage;
      run.handleGameStateUpdate(state(opening(0.03)));
      run.handleGameStateUpdate(state(opening(0.3)));
      // one step, the chest as near as before, the timed open still showing
      run.handleGameStateUpdate(movedTo(state(opening(0.33)), 151));

      run.handleGameStateUpdate(state(undefined, opened));
      expect(view.open).not.toHaveBeenCalled();
    });

    it.each([
      ["keep", "in reach of the container, at its edge", 210, 1],
      ["give up", "out of reach of the container", 211, 0],
    ])("should %s a reach no state answered once the state has the player %s", (_what, _where, x, views) => {
      // the request was dropped and nothing ever comes: walking out of reach (60 px) ends the reach
      const { run, view } = reached();
      run.handleGameStateUpdate(movedTo(state(), x));

      run.handleGameStateUpdate(movedTo(state(undefined, opened), x));
      expect(view.open).toHaveBeenCalledTimes(views);
    });

    it("should read the container open before the position: a state that shows both opens the view", () => {
      const { run, view } = reached();
      run.handleGameStateUpdate(state(opening(0.9)));
      run.handleGameStateUpdate(movedTo(state(undefined, opened), 151));

      expect(view.open).toHaveBeenCalledWith("c1", "chest");
    });

    it("should give up the reach when its container has left the state", () => {
      const { run, view } = reached();
      run.handleGameStateUpdate({ ...state(), containers: [] });

      run.handleGameStateUpdate(state(undefined, opened));
      expect(view.open).not.toHaveBeenCalled();
    });

    it("should take a new reach after one was given up, and open the view for it", () => {
      const { run, view } = reached();
      run.handleGameStateUpdate(state(opening(0.3)));
      run.handleGameStateUpdate(state());

      run.toggleChest("c1");
      run.handleGameStateUpdate(state(opening(0.03)));
      run.handleGameStateUpdate(state(undefined, opened));
      expect(view.open).toHaveBeenCalledTimes(1);
    });
  });
});

// A hit that costs the player health closes the container view they have open: read from their own
// health in two states in a row, with no notice, and E opens it again at once. Fixture states only.
describe("BarrowspireScene a hit closes the container view (FS-1D6BX §Change: The container view closes when its player is hit; I-1D6BX-5)", () => {
  type TimedOpen = { entity_id: string; elapsed: number; duration: number };
  type Me = { max_health?: number; parries?: number; escape?: boolean; timed_open?: TimedOpen };
  const blade = { entity_id: "i1", name: "Blade" };
  const opening = (elapsed: number): TimedOpen => ({ entity_id: "c1", elapsed, duration: 1.5 });
  /**
   * A floor as this player's state, with `health`: they stand at its container `c1`, which is
   * open with a blade in it unless `chest` says otherwise, beside a slain monster's pile `p1`.
   */
  const state = (health: number, me: Me = {}, chest: { is_open?: boolean; kind?: string; items?: unknown[] } = {}, floor = 1): GameState => {
    const base = floorState(floor);
    const c1 = base.containers[0];
    return {
      ...base,
      current_player: { ...player("me", "Aldric", 150, { current_health: health }), position: c1.position, ...me },
      containers: [
        { ...c1, is_open: true, items: [blade], ...chest },
        { container_id: "pc", entity_id: "p1", kind: "drop_pile", position: at(c1.position.x + 10, 150), is_open: true, items: [blade] },
      ],
    } as GameState;
  };

  function onStage() {
    const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const scene = sceneOnStage();
    // the view as the scene sees it: open on a container until it is closed
    const view = {
      entityId: null as string | null,
      get isOpen() {
        return this.entityId !== null;
      },
      open: vi.fn(),
      close: vi.fn(),
      setItems: vi.fn(),
    };
    view.open.mockImplementation((id: string) => void (view.entityId = id));
    view.close.mockImplementation(() => void (view.entityId = null));
    const run = scene.run as unknown as FloorRun & {
      containerView: typeof view;
      events: Emitter;
      init(): void;
      toggleChest(id: string): void;
      showNotification(message: string, backing: number): void;
    };
    run.containerView = view;
    run.time = { delayedCall: vi.fn(), now: 1000 };
    const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
    /** The open bars still up (FS-MQYEX R22). */
    const bars = () =>
      scene.stage.made.filter((m) => m.kind === "graphics" && (m as { name?: string }).name === "open-bar" && !m.destroyed);
    return { run, view, sent, notified, bars };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["coffer", "c1", "chest"],
    ["satchel", "c1", "sack"],
    ["bone heap", "p1", "drop_pile"],
  ])("should close the %s on a state with the player's health lower, with no notice and nothing sent", (_face, id, kind) => {
    const { run, view, sent, notified } = onStage();
    run.handleGameStateUpdate(state(100, {}, { kind }));
    run.toggleChest(id);
    expect(view.open).toHaveBeenCalledWith(id, kind);
    sent.mockClear();
    notified.mockClear();

    run.handleGameStateUpdate(state(90, {}, { kind }));

    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);
    expect(notified).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should leave the view open through a parried strike that costs nothing, and through a heal", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(60));
    run.toggleChest("c1");

    run.handleGameStateUpdate(state(60, { parries: 1 }));
    run.handleGameStateUpdate(state(80));
    run.handleGameStateUpdate(state(80));

    expect(view.isOpen).toBe(true);
    expect(view.close).not.toHaveBeenCalled();
  });

  it("should open the view again at once on E, and close it each time a state costs health", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(100));
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(95));
    expect(view.isOpen).toBe(false);

    // the container is open: no reach, no timed open, the view is up on the key
    run.toggleChest("c1");
    expect(view.open).toHaveBeenCalledTimes(2);
    expect(view.isOpen).toBe(true);
    // a burn's next tick
    run.handleGameStateUpdate(state(90));
    expect(view.isOpen).toBe(false);

    run.toggleChest("c1");
    run.handleGameStateUpdate(state(90));
    expect(view.isOpen).toBe(true);
    expect(view.close).toHaveBeenCalledTimes(2);
  });

  it("should close nothing on the first state of a start, whatever the health in it", () => {
    const { run, view } = onStage();
    view.open("c1");
    run.handleGameStateUpdate(state(40));

    expect(view.isOpen).toBe(true);
  });

  it.each(["shutdown", "destroy"])("should close nothing on the first state after a %s and a new start (a reconnect), with the health lower than before it", (end) => {
    const { run, view } = onStage();
    run.init();
    run.handleGameStateUpdate(state(100));
    run.events.emit(end);

    view.open("c1");
    run.handleGameStateUpdate(state(60));
    expect(view.isOpen).toBe(true);
    // the same start's next state is judged
    run.handleGameStateUpdate(state(50));
    expect(view.isOpen).toBe(false);
  });

  it("should close the view once on a floor change with the health lower, and leave one opened on the new floor alone", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(100));
    run.toggleChest("c1");

    run.handleGameStateUpdate(state(80, {}, {}, 2));
    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);

    run.toggleChest("c1");
    run.handleGameStateUpdate(state(80, {}, {}, 2));
    expect(view.isOpen).toBe(true);
  });

  it("should leave the view open when health fell only as far as max health did (gear taken off), and close it when it fell further", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(100, { max_health: 100 }));
    run.toggleChest("c1");

    run.handleGameStateUpdate(state(80, { max_health: 80 }));
    expect(view.isOpen).toBe(true);

    // 10 health gone with 5 max health: a hit
    run.handleGameStateUpdate(state(70, { max_health: 75 }));
    expect(view.isOpen).toBe(false);
  });

  it("should close the view on a hit in the same state as gear coming off below full health: health is clamped, not lowered by as much", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(60, { max_health: 100 }));
    run.toggleChest("c1");

    // 20 max health gone, 10 health gone: the gear alone would have left 60
    run.handleGameStateUpdate(state(50, { max_health: 80 }));
    expect(view.isOpen).toBe(false);
  });

  it("should close nothing when no view is open: a hit, the killing hit, an escaped player, a state with no player", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(100));
    run.handleGameStateUpdate(state(90));
    run.handleGameStateUpdate(state(0));
    run.handleGameStateUpdate(state(0, { escape: true }));
    run.handleGameStateUpdate({ ...state(0), current_player: null });

    expect(view.close).not.toHaveBeenCalled();
  });

  it("should keep the last health seen through a state with no player", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(100));
    run.toggleChest("c1");
    run.handleGameStateUpdate({ ...state(100), current_player: null });
    expect(view.isOpen).toBe(true);

    run.handleGameStateUpdate(state(90));
    expect(view.isOpen).toBe(false);
  });

  it("should close the view on the killing hit", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(10));
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(0));

    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);
  });

  // the gear overlay is the UI scene's: the run tells it no close for a hit (FS-TQZ5J § Change: Phase 3, R52)
  it("should leave the gear and bag overlay as it is", () => {
    const { run, view } = onStage();
    const told: string[] = [];
    uiSceneOn(run, "run", { row: false }).bridge.onScreen({ gear: (message) => void told.push(message.kind) });
    run.handleGameStateUpdate(state(100));
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(90));

    expect(view.isOpen).toBe(false);
    expect(told).not.toContain("close");
  });

  // The server cancels the timed open the hit landed on; the client only follows `timed_open`
  // (FS-MQYEX R23, R26). The hit itself touches neither the open bar nor the pending reach.
  describe("during a timed open (FS-MQYEX §D R22, R23, R26)", () => {
    const shut = { is_open: false, items: [] };
    /** The pile's view open, and a reach for the shut chest beside it that the server has answered. */
    function midOpen() {
      const stage = onStage();
      stage.run.handleGameStateUpdate(state(100, {}, shut));
      stage.run.toggleChest("p1");
      stage.run.toggleChest("c1");
      stage.run.handleGameStateUpdate(state(100, { timed_open: opening(0.3) }, shut));
      expect(stage.view.entityId).toBe("p1");
      expect(stage.bars()).toHaveLength(1);
      return stage;
    }

    it("should close the view and leave the bar and the reach while the state still sends the timed open", () => {
      const { run, view, bars } = midOpen();
      run.handleGameStateUpdate(state(90, { timed_open: opening(0.33) }, shut));
      expect(view.isOpen).toBe(false);
      expect(bars()).toHaveLength(1);

      // the reach is still pending: the container opening opens its view
      run.handleGameStateUpdate(state(90));
      expect(view.open).toHaveBeenLastCalledWith("c1", "chest");
      expect(view.isOpen).toBe(true);
      expect(bars()).toHaveLength(0);
    });

    it("should follow the server's cancel as before: the bar gone and the reach given up, by the state and not by the hit", () => {
      const { run, view, bars, notified } = midOpen();
      run.handleGameStateUpdate(state(90, {}, shut));
      expect(view.isOpen).toBe(false);
      expect(bars()).toHaveLength(0);
      expect(notified).not.toHaveBeenCalled();

      // a teammate finishes later: no view opens
      run.handleGameStateUpdate(state(90));
      expect(view.isOpen).toBe(false);
      expect(view.open).toHaveBeenCalledTimes(1);
    });

    it("should leave a view the same state opens for the reach: it was not open when the hit landed", () => {
      const { run, view } = midOpen();
      run.handleGameStateUpdate(state(90));

      expect(view.entityId).toBe("c1");
      // the next hit closes it
      run.handleGameStateUpdate(state(85));
      expect(view.isOpen).toBe(false);
    });

    it("should touch nothing with no view open: the bar and the reach go on", () => {
      const stage = onStage();
      const { run, view, bars } = stage;
      run.handleGameStateUpdate(state(100, {}, shut));
      run.toggleChest("c1");
      run.handleGameStateUpdate(state(100, { timed_open: opening(0.3) }, shut));
      run.handleGameStateUpdate(state(90, { timed_open: opening(0.33) }, shut));

      expect(view.close).not.toHaveBeenCalled();
      expect(bars()).toHaveLength(1);
      run.handleGameStateUpdate(state(90));
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
    });
  });
});

describe("BarrowspireScene a move closes the container view (FS-1D6BX §Change: The container view closes when its player moves; I-1D6BX-6)", () => {
  type TimedOpen = { entity_id: string; elapsed: number; duration: number };
  type Me = { current_health?: number; timed_open?: TimedOpen };
  const blade = { entity_id: "i1", name: "Blade" };
  const opening = (elapsed: number): TimedOpen => ({ entity_id: "c1", elapsed, duration: 1.5 });
  /**
   * Floor 1 as this player's state, the server having them at `pos` (by the container `c1` at
   * 150, 150 unless said otherwise). `c1` is open with a blade in it unless `chest` says otherwise,
   * beside a slain monster's pile `p1`.
   */
  const state = (pos = at(150, 150), chest: { is_open?: boolean; kind?: string; items?: unknown[] } = {}, me: Me = {}, floor = 1): GameState => {
    const base = floorState(floor);
    const c1 = base.containers[0];
    return {
      ...base,
      current_player: { ...player("me", "Aldric", pos.x), position: pos, ...me },
      containers: [
        { ...c1, is_open: true, items: [blade], ...chest },
        { container_id: "pc", entity_id: "p1", kind: "drop_pile", position: at(c1.position.x + 10, 150), is_open: true, items: [blade] },
      ],
    } as GameState;
  };
  const shut = { is_open: false, items: [] };

  function onStage() {
    const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const scene = sceneOnStage();
    // the view as the scene sees it: open on a container until it is closed
    const view = {
      entityId: null as string | null,
      get isOpen() {
        return this.entityId !== null;
      },
      open: vi.fn(),
      close: vi.fn(),
      setItems: vi.fn(),
    };
    view.open.mockImplementation((id: string) => void (view.entityId = id));
    view.close.mockImplementation(() => void (view.entityId = null));
    const run = scene.run as unknown as FloorRun & {
      containerView: typeof view;
      playerPos?: { x: number; y: number };
      toggleChest(id: string): void;
      showNotification(message: string, backing: number): void;
      update(time: number, delta: number): void;
    };
    run.containerView = view;
    run.time = { delayedCall: vi.fn(), now: 1000 };
    const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
    /** The open bars still up (FS-MQYEX R22). */
    const bars = () =>
      scene.stage.made.filter((m) => m.kind === "graphics" && (m as { name?: string }).name === "open-bar" && !m.destroyed);
    /** The view opened on `id` by E, the last state having the player at `pos`. */
    const openedAt = (id: string, pos = at(150, 150), chest = {}) => {
      run.handleGameStateUpdate(state(pos, chest));
      run.toggleChest(id);
      expect(view.entityId).toBe(id);
    };
    return { run, view, sent, notified, bars, openedAt };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["coffer", "c1", "chest"],
    ["satchel", "c1", "sack"],
    ["bone heap", "p1", "drop_pile"],
  ])("should close the %s on a state with the player 5 px from where the view opened, with no notice and nothing sent (R26)", (_face, id, kind) => {
    const { run, view, sent, notified, openedAt } = onStage();
    openedAt(id, at(150, 150), { kind });
    sent.mockClear();

    run.handleGameStateUpdate(state(at(155, 150), { kind }));

    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);
    expect(notified).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it("should leave the view open on a state exactly 4 px from the baseline (R29)", () => {
    const { run, view, openedAt } = onStage();
    openedAt("c1");
    run.handleGameStateUpdate(state(at(150, 154)));

    expect(view.isOpen).toBe(true);
  });

  it("should close the view on the first of 2 px steps past 4 px: drift is measured from the baseline (R29)", () => {
    const { run, view, openedAt } = onStage();
    openedAt("c1");
    run.handleGameStateUpdate(state(at(152, 150)));
    run.handleGameStateUpdate(state(at(154, 150)));
    expect(view.isOpen).toBe(true);

    run.handleGameStateUpdate(state(at(156, 150)));
    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);
  });

  it("should take the baseline from the state held at the press for E on an open container (R27, M2)", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(at(140, 150)));
    run.handleGameStateUpdate(state(at(150, 150)));
    run.toggleChest("c1");

    run.handleGameStateUpdate(state(at(154, 150)));
    expect(view.isOpen).toBe(true);
    run.handleGameStateUpdate(state(at(155, 150)));
    expect(view.isOpen).toBe(false);
  });

  it("should take the baseline from the state a reach's view opens on, though it is more than 4 px from the press (R27, M2, M3)", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(at(150, 150), shut));
    run.toggleChest("c1");
    expect(view.isOpen).toBe(false);

    run.handleGameStateUpdate(state(at(160, 150)));
    expect(view.entityId).toBe("c1");
    run.handleGameStateUpdate(state(at(164, 150)));
    expect(view.isOpen).toBe(true);

    run.handleGameStateUpdate(state(at(165, 150)));
    expect(view.isOpen).toBe(false);
  });

  it("should take the baseline from the state a timed open's view opens on (R27, M2)", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(at(150, 150), shut));
    run.toggleChest("c1");
    run.handleGameStateUpdate(state(at(150, 150), shut, { timed_open: opening(0.3) }));
    run.handleGameStateUpdate(state(at(150, 150)));
    expect(view.entityId).toBe("c1");

    run.handleGameStateUpdate(state(at(150, 154)));
    expect(view.isOpen).toBe(true);
    run.handleGameStateUpdate(state(at(150, 155)));
    expect(view.isOpen).toBe(false);
  });

  it.each([
    ["a Blink placed at once", [at(150, 220)]],
    ["a charge's states", [at(162, 150), at(174, 150)]],
    ["a knock-back", [at(144, 147)]],
  ])("should close the view on %s: whatever moved the body (R28)", (_what, moves) => {
    const { run, view, openedAt } = onStage();
    openedAt("c1");
    for (const pos of moves) run.handleGameStateUpdate(state(pos));

    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);
  });

  it("should judge the states' position, never the drawn body still easing toward it (M1)", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate(state(at(140, 150)));
    run.handleGameStateUpdate(state(at(150, 150)));
    // the drawn body trails the state's position, as a walk that just stopped leaves it
    expect(run.playerPos?.x).toBe(140);
    run.toggleChest("c1");

    // frames with no new state: the drawn body eases on to 150
    const up = { isDown: false };
    const keys = { left: up, right: up, up, down: up };
    Object.assign(run, {
      cursors: keys,
      wasd: keys,
      updateLighting: vi.fn(),
      updateOtherPlayersSmooth: vi.fn(),
      checkBuildingStatus: vi.fn(),
      sendMovementIntent: vi.fn(),
    });
    for (let frame = 0; frame < 5; frame++) run.update(frame * 16, 16);
    expect(run.playerPos?.x).toBeGreaterThan(145);
    expect(view.isOpen).toBe(true);

    run.handleGameStateUpdate(state(at(150, 150)));
    expect(view.isOpen).toBe(true);
  });

  it("should open the view again at once on E after a move closed it, with a new baseline (R27, R30)", () => {
    const { run, view, openedAt } = onStage();
    openedAt("c1");
    run.handleGameStateUpdate(state(at(160, 150)));
    expect(view.isOpen).toBe(false);

    run.toggleChest("c1");
    expect(view.open).toHaveBeenCalledTimes(2);
    expect(view.isOpen).toBe(true);
    run.handleGameStateUpdate(state(at(160, 150)));
    expect(view.isOpen).toBe(true);

    run.handleGameStateUpdate(state(at(165, 150)));
    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(2);
  });

  it("should close nothing on a state with no player (escaped) and keep the baseline (M4)", () => {
    const { run, view, openedAt } = onStage();
    openedAt("c1");
    run.handleGameStateUpdate({ ...state(), current_player: null });
    expect(view.isOpen).toBe(true);

    run.handleGameStateUpdate(state(at(155, 150)));
    expect(view.isOpen).toBe(false);
  });

  it("should take the baseline from the next state with a position when the view opened with none seen (M4)", () => {
    const { run, view } = onStage();
    run.handleGameStateUpdate({ ...state(), current_player: null });
    run.toggleChest("c1");
    expect(view.isOpen).toBe(true);

    run.handleGameStateUpdate(state(at(150, 150)));
    expect(view.isOpen).toBe(true);
    run.handleGameStateUpdate(state(at(155, 150)));
    expect(view.isOpen).toBe(false);
  });

  it("should close the view once when one state both hits and moves the player", () => {
    const { run, view, openedAt } = onStage();
    openedAt("c1");
    run.handleGameStateUpdate(state(at(170, 150), {}, { current_health: 80 }));

    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);
  });

  it("should close the view once on a floor change and never compare the new floor's position with the old baseline", () => {
    const { run, view, openedAt } = onStage();
    openedAt("c1");
    run.handleGameStateUpdate(state(at(650, 150), {}, {}, 2));
    expect(view.isOpen).toBe(false);
    expect(view.close).toHaveBeenCalledTimes(1);

    run.toggleChest("c1");
    run.handleGameStateUpdate(state(at(650, 150), {}, {}, 2));
    expect(view.isOpen).toBe(true);
  });

  // the gear overlay is the UI scene's: the run tells it no close for a move (A5, R31)
  it("should leave the gear and bag overlay as it is (A5)", () => {
    const { run, view, openedAt } = onStage();
    const told: string[] = [];
    uiSceneOn(run, "run", { row: false }).bridge.onScreen({ gear: (message) => void told.push(message.kind) });
    openedAt("c1");
    run.handleGameStateUpdate(state(at(160, 150)));

    expect(view.isOpen).toBe(false);
    expect(told).not.toContain("close");
  });

  // with no view open, the reach and the open bar are FS-MQYEX R26's alone (R31)
  describe("with no view open, during a reach or a timed open (FS-MQYEX R26)", () => {
    it("should keep a reach no state has answered through a move within reach, and open its view", () => {
      const { run, view } = onStage();
      run.handleGameStateUpdate(state(at(150, 150), shut));
      run.toggleChest("c1");
      run.handleGameStateUpdate(state(at(170, 150), shut));

      run.handleGameStateUpdate(state(at(170, 150)));
      expect(view.close).not.toHaveBeenCalled();
      expect(view.open).toHaveBeenCalledWith("c1", "chest");
    });

    it("should give up a timed open's reach on a move as before, the bar following the state", () => {
      const { run, view, bars } = onStage();
      run.handleGameStateUpdate(state(at(150, 150), shut));
      run.toggleChest("c1");
      run.handleGameStateUpdate(state(at(150, 150), shut, { timed_open: opening(0.3) }));
      run.handleGameStateUpdate(state(at(156, 150), shut, { timed_open: opening(0.33) }));
      expect(bars()).toHaveLength(1);

      run.handleGameStateUpdate(state(at(156, 150)));
      expect(bars()).toHaveLength(0);
      expect(view.open).not.toHaveBeenCalled();
      expect(view.close).not.toHaveBeenCalled();
    });

    it("should close nothing on a move with no view open", () => {
      const { run, view } = onStage();
      run.handleGameStateUpdate(state(at(150, 150)));
      run.handleGameStateUpdate(state(at(170, 150)));
      run.handleGameStateUpdate(state(at(190, 150)));

      expect(view.close).not.toHaveBeenCalled();
    });
  });
});

// The hurt flash reads the same record of the player's own health as the container view's hit
// (FS-KYPQ9 §G.1; FS-1D6BX §Change E2): it flashes on any fall in health, gear coming off too.
describe("BarrowspireScene the local player's hurt flash (FS-KYPQ9 §G.1; I-1D6BX-5)", () => {
  const state = (health: number, max?: number): GameState => {
    const base = floorState(1);
    return {
      ...base,
      current_player: { ...player("me", "Aldric", 150, { current_health: health }), ...(max === undefined ? {} : { max_health: max }) },
    } as GameState;
  };

  function onStage() {
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const { run } = sceneOnStage();
    const hits = { play: vi.fn(), clearAll: vi.fn() };
    const scene = run as unknown as FloorRun & { hits: typeof hits; player?: unknown };
    scene.hits = hits;
    /** How many times the flash played on the local player's own body. */
    const flashes = () => hits.play.mock.calls.filter(([target]) => target !== undefined && target === scene.player).length;
    return { run: scene, flashes };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not flash on the first state of a start, whatever the health in it", () => {
    const { run, flashes } = onStage();
    run.handleGameStateUpdate(state(40, 100));

    expect(run.player).toBeDefined();
    expect(flashes()).toBe(0);
  });

  it.each([
    ["a hit", [100, 100], [90, 100], 1],
    ["the same health", [100, 100], [100, 100], 0],
    ["a heal", [60, 100], [80, 100], 0],
    ["gear off, health down with max health", [100, 100], [80, 80], 1],
    ["gear off below the new max health, health unchanged", [60, 100], [60, 80], 0],
  ])("should flash %s: %j → %j", (_what, [h0, m0], [h1, m1], times) => {
    const { run, flashes } = onStage();
    run.handleGameStateUpdate(state(h0, m0));
    run.handleGameStateUpdate(state(h1, m1));

    expect(flashes()).toBe(times);
  });
});

// A refresh into a run: the menu evicted its creatures, so the run downloads them again, and an
// end_game or a settlement sent meanwhile must still reach it (FS-C4JWH Edge States).
describe("BarrowspireScene messages while its art downloads (FS-C4JWH Edge States)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should end the run on an end_game that arrived before create, once create is done", () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
    vi.spyOn(socketManager, "onError").mockImplementation(() => {});
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "isConnected").mockReturnValue(true);
    vi.spyOn(socketManager, "onConnectionStatusChange").mockReturnValue(() => {});
    vi.spyOn(socketManager, "onGameStateUpdate").mockReturnValue(() => {});
    const run = new BarrowspireScene() as unknown as {
      init(data?: object): void;
      connectToServer(): void;
      openHeldMessages(): void;
      endRun(): void;
    };
    const endRun = vi.spyOn(run, "endRun").mockImplementation(() => {});

    run.init({ sessionID: "run-a" });
    listeners.get("end_game")?.({});
    expect(endRun).not.toHaveBeenCalled();
    run.connectToServer();
    run.openHeldMessages();

    expect(endRun).toHaveBeenCalledTimes(1);
  });
});

// A run that ends while it still downloads: end_game, its settlement and the hub arrive before
// create. The record will open once create hands the settlement over, so the hub waits behind it,
// as it does when the run has loaded (FS-GV8WN R23; FS-C4JWH Edge States).
describe("BarrowspireScene a run that ends while its art downloads (FS-C4JWH Edge States, FS-GV8WN R23)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function runBeforeCreate(sessionID: string) {
    const listeners = new Map<string, (payload: unknown) => void>();
    vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    const run = new BarrowspireScene() as unknown as {
      init(data?: object): void;
      resultHold: { hold(world: object, apply: (world: object) => void): boolean };
    };
    run.init({ sessionID });
    return { run, send: (action: string, payload: unknown) => listeners.get(action)?.(payload) };
  }

  it("should hold the hub behind the record its own held settlement will open", () => {
    const { run, send } = runBeforeCreate("run-a");
    send("end_game", {});
    send("settlement", { run_id: "run-a" });

    expect(run.resultHold.hold({ world_type: "hub" }, () => undefined)).toBe(true);
  });

  it.each([
    ["no settlement", []],
    ["another run's settlement", [["settlement", { run_id: "run-b" }]]],
  ] as const)("should let the hub in at once with %s held", (_case, more) => {
    const { run, send } = runBeforeCreate("run-a");
    send("end_game", {});
    for (const [action, payload] of more) send(action, payload);

    expect(run.resultHold.hold({ world_type: "hub" }, () => undefined)).toBe(false);
  });
});

const fixture = (await import("@/render/world/dungeon.fixture.json")).default;
const await_dungeon = await import("@/render/world/dungeon");
const await_walls = await import("@/render/world/walls");
const await_bake = await import("@/render/world/bake");
const await_wallShadows = await import("@/render/world/wallShadows");
const await_buildingLooks = await import("@/render/world/buildingLooks");
const { RegionGrid } = await_dungeon;
const { ChunkGrid, CHUNK_MAX, DUNGEON_CHUNK } = await import("@/render/world/chunks");
const { FIXED_LIGHT_CAP } = await import("@/render/world/floorLights");
const { GROUND_DEPTH, GROUND_MARGIN, GroundLayer } = await import("@/render/world/scene");
const await_fog = await import("@/render/world/fog");
const await_exploration = await import("@/render/world/exploration");
const await_lighting = await import("@/render/lighting/lighting");

describe("BarrowspireScene dungeon floor look (FS-KE075 §H.44–§H.47)", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "../../public/art/manifest.json"), "utf8"));
  const { projectedBounds, screenToWorld } = await_iso;
  type Dungeon = import("@/render/world/dungeon").DungeonMap;
  const grid = new RegionGrid(fixture as Dungeon);

  interface DungeonRun extends MapRun {
    worldLook: unknown;
    buildings: unknown[];
    view?: unknown;
    showNearChunks(): void;
  }

  /** The golden's floor as floor 1's map, and floor 1's snapshot with no walls, its chest in room 1. */
  const dungeonMap = { session_id: "run", floor: 1, ...(fixture as Dungeon & { walls: GameState["walls"] }) };
  /** Who stands on the floor: this client's player and the rest of the party (none by default). */
  type Party = Pick<GameState, "current_player" | "other_players">;
  const dungeonState = (party: Partial<Party> = {}): GameState => ({
    ...bare(floorState(1)),
    ...party,
    doors: [],
    containers: [{ container_id: "c", entity_id: "c1", kind: "chest", position: at(4120, 1800), is_open: false, items: [] }],
    escape_doors: [{ entity_id: "e1", position: at(4000, 1200), is_open: false, is_locked: true }],
    switches: [{ entity_id: "s1", position: at(3000, 900), switch_id: 1, is_activated: false }],
    stairs: [{ entity_id: "st1", position: at(1000, 1200) }],
  });

  /**
   * The fixture floor on stage: its map, then its first snapshot (or, `late`, the snapshot first
   * and the map after it), `extra` laid over the snapshot.
   */
  function dungeonStage(
    party: Partial<Party> = {},
    extra: Partial<GameState> = {},
    {
      late = false,
      without,
      map = dungeonMap,
      arrival = false,
      spy,
    }: { late?: boolean; without?: string; map?: typeof dungeonMap; arrival?: boolean; spy?: (run: unknown) => void } = {},
  ) {
    const scene = sceneOnStage();
    const { stage } = scene;
    const run = scene.run as unknown as DungeonRun;
    run.worldLook = WORLD_THEMES.tower;
    // a start that is an arrival (FS-PQ2TW R8), not a return; and what a test watches before the first broadcast
    (run as unknown as { arrival: boolean }).arrival = arrival;
    spy?.(run);
    // `without`: the manifest's sheets whose name starts so are missing (a bake without them)
    const sheets = Object.fromEntries(Object.entries(manifest.sheets).filter(([name]) => !without || !name.startsWith(without)));
    run.art = new ArtLibrary({ ...manifest, sheets }, { warn: () => {} });
    // the ground is the scene's own, painted in the stage's render textures
    run.groundLayer = undefined;
    const camera = run.cameras as { main: Record<string, unknown> };
    Object.assign(camera.main, { scrollX: 0, scrollY: 0, displayWidth: 1280, displayHeight: 720, setBackgroundColor: vi.fn() });
    const handle = (Object.getPrototypeOf(run) as FloorRun).handleGameStateUpdate.bind(run);
    // every stamp into each render texture the stage makes (it keeps only the last call's args)
    const stamped = new Map<Made, unknown[][]>();
    const add = run.add as Record<string, (...a: unknown[]) => unknown>;
    run.add = new Proxy(add, {
      get: (target, kind) => {
        if (kind !== "renderTexture") return target[kind as string];
        return (...args: unknown[]) => {
          const rt = target.renderTexture(...args) as Record<string, (...a: unknown[]) => unknown>;
          const list: unknown[][] = [];
          stamped.set(stage.made.at(-1)!, list);
          return new Proxy(rt, {
            get: (o, prop) => (prop === "stamp" ? (...a: unknown[]) => (list.push(a), o) : o[prop as string]),
          });
        };
      },
    });
    if (late) {
      (run as unknown as { subscribeFloorMap(): void }).subscribeFloorMap();
      handle({ ...dungeonState(party), ...extra });
    }
    useGameStore.getState().receiveFloorMap(map as never);
    if (!late) handle({ ...dungeonState(party), ...extra });
    /** Looks at a screen point: the camera's view centred on it, and what stands near it shown. */
    const look = (x: number, y: number) => {
      Object.assign(camera.main, { scrollX: x - 640, scrollY: y - 360 });
      run.showNearChunks();
    };
    return { ...scene, run, handle, look, camera, stamped };
  }

  afterEach(() => useGameStore.setState({ floorMap: null }));

  const chunks = new ChunkGrid(projectedBounds(4800, 3200, GROUND_MARGIN), DUNGEON_CHUNK);
  /** The sprites a sheet name starts with: its frame name is `{sheet}/…`. */
  const drawn = (made: Made[], prefix: string) =>
    made.filter((m) => m.kind === "sprite" && !m.destroyed && String(m.args[3] ?? "").startsWith(prefix));
  const chunkOf = (m: Made) => chunks.indexAt({ x: m.args[0] as number, y: m.args[1] as number });
  /** Whether a recorded object is shown: as made, until setVisible says otherwise. */
  const shownNow = (m: Made) => (m as Made & { visible?: boolean }).visible !== false;

  it("should stand no building, roof, stone cap, blackout or perimeter wall on a dungeon floor", () => {
    const { run, stage } = dungeonStage();
    expect(run.walls.size).toBe(dungeonMap.walls!.length);
    expect(run.buildings).toEqual([]);
    expect(run.view).toBeUndefined();
    expect(run.perimeter ?? []).toEqual([]);
    for (const sheet of ["tower_cap", "tower_perimeter", "tower_wall_exterior", "roof_"])
      expect(drawn(stage.made, sheet)).toEqual([]);
    expect(drawn(stage.made, "tower_wall_").length).toBeGreaterThan(1000);
  });

  it("should paint the ground in chunks no larger than 2048 px, under every tile of every walkable cell and no tile of a wall cell or the void (FS-XK2B6 §E)", () => {
    const { stage, stamped } = dungeonStage();
    const rts = stage.made.filter((m) => m.kind === "renderTexture" && m.depth === GROUND_DEPTH);
    expect(rts.length).toBeGreaterThan(1);
    for (const rt of rts) expect(Math.max(rt.args[2] as number, rt.args[3] as number)).toBeLessThanOrEqual(CHUNK_MAX);
    // each stamp back to the world tile it was laid for: the frame's top-left plus its anchor
    const sheet = manifest.sheets.ground_flags;
    const tiles = new Set<string>();
    const offFloor: string[] = [];
    for (const rt of rts)
      // the tiles' stamps: a chunk's wall shadows are stamped in too, as one scratch (FS-V8FT3 §E)
      for (const [, , x, y] of (stamped.get(rt) ?? []).filter(([key]) => key !== "ground-wall-shadows")) {
        const sx = (rt.args[0] as number) + (x as number) + sheet.anchor.x * sheet.frameWidth;
        const sy = (rt.args[1] as number) + (y as number) + sheet.anchor.y * sheet.frameHeight;
        const at = screenToWorld(sx, sy);
        const { cx, cy } = grid.cellOf(at);
        if (!grid.walkable(cx, cy)) offFloor.push(`${cx},${cy}`);
        tiles.add(`${Math.floor(at.x / 40)},${Math.floor(at.y / 40)}`);
      }
    // no piece laid by a point on a wall cell or the void
    expect(offFloor).toEqual([]);
    // and every walkable cell's four tiles, each once
    const walkable = new Set<string>();
    for (let cx = 0; cx < grid.cols; cx++)
      for (let cy = 0; cy < grid.rows; cy++) {
        if (!grid.walkable(cx, cy)) continue;
        for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [1, 1]]) walkable.add(`${cx * 2 + tx},${cy * 2 + ty}`);
      }
    expect([...tiles].sort()).toEqual([...walkable].sort());
  });

  it("should leave void to the camera's background, the darkest ink", () => {
    const { camera } = dungeonStage();
    expect(camera.main.setBackgroundColor).toHaveBeenLastCalledWith(palette.inkDeep);
  });

  it("should build floor 2 as a floor of buildings after a climb from the dungeon, the dungeon gone", () => {
    const { run, stage, handle, camera } = dungeonStage();
    const dungeonWalls = drawn(stage.made, "tower_wall_");
    const ground = () => stage.made.filter((m) => m.kind === "renderTexture" && m.depth === GROUND_DEPTH && !m.destroyed);
    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
    handle(bare(floorState(2)));

    expect(dungeonWalls.every((m) => m.destroyed)).toBe(true);
    expect((run as unknown as { dungeon?: unknown }).dungeon).toBeUndefined();
    expect(run.perimeter!.length).toBeGreaterThan(0);
    expect(run.buildings).toHaveLength(1);
    expect(run.view).toBeDefined();
    // one ground texture over the whole of floor 2, as before chunks
    const b = projectedBounds(1440, 960, GROUND_MARGIN);
    expect(ground().map((m) => m.args)).toEqual([[b.x, b.y, Math.ceil(b.width), Math.ceil(b.height)]]);
    expect(camera.main.setBackgroundColor).toHaveBeenLastCalledWith(palette.mapEdge);
  });

  /** A chest standing at a world point, as a snapshot carries it. */
  const chestAt = (id: string, p: { x: number; y: number }) =>
    ({ container_id: id, entity_id: id, kind: "chest", position: at(p.x, p.y), is_open: false, items: [] }) as GameState["containers"][number];
  interface Dressed {
    piece: { at: { x: number; y: number } };
    sprites: Made[];
    gone: boolean;
  }
  const dressedOf = (run: unknown) => (run as { dungeon: { dressed: Dressed[] } }).dungeon.dressed;
  const placesOf = (run: unknown) => dressedOf(run).map(({ piece: { at: p } }) => `${p.x},${p.y}`);

  it("should strew a dungeon floor's dressing from its map alone, the same whatever containers a member's snapshot holds (review M1)", () => {
    const bare = dungeonStage({}, { containers: [] });
    const plan = placesOf(bare.run);
    expect(plan.length).toBeGreaterThan(16);
    // another member's first snapshot holds chests, one of them right where a piece would stand
    const [first, second] = dressedOf(bare.run).map((d) => d.piece.at);
    const crowded = dungeonStage({}, { containers: [chestAt("x1", first), chestAt("x2", { x: second.x + 30, y: second.y })] });
    expect(placesOf(crowded.run)).toEqual(plan);
  });

  it("should dress a room the floor map names quiet with a brazier, and the same room unnamed with none (FS-KE075 §Change: Room variety R85)", () => {
    // the dungeon fixture's tower band is the lower: it strews no brazier of its own
    const regionOf = (p: { x: number; y: number }) => grid.region(Math.floor(p.x / grid.cell), Math.floor(p.y / grid.cell));
    const braziersIn = (run: unknown, id: number) =>
      dressedOf(run).filter((d) => (d.piece as unknown as { sheet: string }).sheet === "brazier" && regionOf(d.piece.at) === id).length;
    const rooms = grid.regions.filter((r) => r.kind === "room").map((r) => r.id);
    const lit = rooms.find((id) => braziersIn(dungeonStage({}, {}, { map: { ...dungeonMap, quiet_rooms: [id] } as typeof dungeonMap }).run, id) > 0);
    expect(lit).toBeDefined();
    expect(braziersIn(dungeonStage().run, lit!)).toBe(0);
  });

  it("should take a dressing piece away for good once a container is seen standing by it, its flame with it (review M1)", () => {
    const { run, handle, look, lights } = dungeonStage(everyRegion(), { containers: [] });
    const dressed = dressedOf(run);
    const piece = dressed[0];
    const others = dressed.filter((d) => d !== piece && Math.hypot(d.piece.at.x - piece.piece.at.x, d.piece.at.y - piece.piece.at.y) > 200);
    // the container comes into interest a snapshot later, as a member walks up to it
    handle({ ...dungeonState(everyRegion()), containers: [chestAt("x1", piece.piece.at)] });
    expect(piece.gone).toBe(true);
    expect(piece.sprites.every((m) => !shownNow(m))).toBe(true);
    expect(run.dressing).not.toContain(piece.sprites[0]);
    // the camera over it brings its chunk back, but not the piece
    const s = await_iso.worldToScreen(piece.piece.at.x, piece.piece.at.y);
    look(s.x, s.y);
    expect(piece.sprites.every((m) => !shownNow(m))).toBe(true);
    expect(others.every((d) => !d.gone)).toBe(true);
    // a brazier's flame goes off the floor's lights with it
    const flamed = dressed.find((d) => d.piece !== piece.piece && (d as Dressed & { lights: unknown[] }).lights.length > 0) as (Dressed & { lights: unknown[] }) | undefined;
    if (flamed) {
      const p = flamed.piece.at;
      const fs = await_iso.worldToScreen(p.x, p.y);
      look(fs.x, fs.y);
      handle({ ...dungeonState(everyRegion()), containers: [chestAt("x1", piece.piece.at), chestAt("x2", p)] });
      const floor = (run as unknown as { dungeon: { lights: { all: { light: { source: unknown } }[] } } }).dungeon;
      expect(floor.lights.all.some((l) => flamed.lights.includes(l.light.source))).toBe(false);
      expect(lights.some((l) => flamed.lights.includes(l))).toBe(false);
    }
  });

  it("should light a dungeon floor's interactables in its chunks, under the fog, when its map comes after its first snapshot (review M2)", () => {
    const { run } = dungeonStage(everyRegion(), {}, { late: true });
    const floor = (run as unknown as { dungeon: { lights: { all: { kind: string }[] } }; hallLights: unknown[]; builtFloor?: number }).dungeon;
    expect((run as unknown as { builtFloor?: number }).builtFloor).toBe(1);
    // the chest's and the switch's pools wait in their chunks with the floor's other fixed lights
    expect(floor.lights.all.filter((l) => l.kind === "interactable").length).toBeGreaterThanOrEqual(2);
    // none was stamped as a light of the halls before the floor stood
    expect((run as unknown as { hallLights: unknown[] }).hallLights).toEqual([]);
  });

  it("should build floor 2 as a floor of buildings when a reconnect's scene was sized by the store's floor-1 map (review M3)", () => {
    // the store still holds floor 1's map: the scene's create sizes the run by it
    useGameStore.getState().receiveFloorMap(dungeonMap as never);
    const scene = sceneOnStage();
    const run = scene.run as unknown as DungeonRun & { dungeon?: unknown; create?: () => void };
    const fit = (Object.getPrototypeOf(run) as { fitFloor(map: unknown): void }).fitFloor.bind(run);
    run.worldLook = WORLD_THEMES.tower;
    run.art = new ArtLibrary(manifest, { warn: () => {} });
    run.groundLayer = undefined;
    const camera = run.cameras as { main: Record<string, unknown> };
    Object.assign(camera.main, { scrollX: 0, scrollY: 0, displayWidth: 1280, displayHeight: 720, setBackgroundColor: vi.fn() });
    fit(dungeonMap);
    expect(run.dungeon).toBeDefined();
    // the party is on floor 2: its map and its snapshot
    useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
    run.handleGameStateUpdate(floorState(2));
    expect(run.dungeon).toBeUndefined();
    expect(run.buildings).toHaveLength(1);
    expect(run.view).toBeDefined();
    expect(camera.main.setBackgroundColor).toHaveBeenLastCalledWith(palette.mapEdge);
  });

  it("should make no ground texture for a chunk no walkable cell falls in (review M4, FS-XK2B6 §E)", () => {
    const { stage, stamped } = dungeonStage();
    const rts = stage.made.filter((m) => m.kind === "renderTexture" && m.depth === GROUND_DEPTH);
    // every texture made is painted, and the floor's empty chunks have none
    for (const rt of rts) expect((stamped.get(rt) ?? []).length).toBeGreaterThan(0);
    expect(rts.length).toBeLessThan(chunks.rects.length);
    // each chunk a walkable cell's diamond falls in has its texture
    const made = new Set(rts.map((rt) => `${rt.args[0]},${rt.args[1]}`));
    for (let cx = 0; cx < grid.cols; cx++)
      for (let cy = 0; cy < grid.rows; cy++) {
        if (!grid.walkable(cx, cy)) continue;
        const c = await_iso.worldToScreen(cx * 80 + 40, cy * 80 + 40);
        const r = chunks.rects[chunks.indexAt(c)];
        expect(made.has(`${r.x},${r.y}`)).toBe(true);
      }
    // the count on the sample floor, pinned: 44 of its 91 chunks, so a chunk only wall cells fall
    // in has none
    expect([rts.length, chunks.rects.length]).toEqual([44, 91]);
  });

  describe("its wall shadows (FS-V8FT3 §E)", () => {
    const { dungeonWalls: wallsOf, wallPlan } = await_dungeon;
    const { dungeonShadows, planWallShadows } = await_wallShadows;
    const { MASONRY_WALLS, thicknessPx } = await_walls;
    const { BAKE } = await_bake;
    const thick = thicknessPx(MASONRY_WALLS);
    const drawnWalls = wallsOf(wallPlan(dungeonMap.walls!, grid, thick), grid, 1, MASONRY_WALLS);
    /** The shadow stamps laid on a ground texture: the scratch, at the catcher's opacity. */
    const shadowStamps = (stamped: Map<Made, unknown[][]>, rt: Made) =>
      (stamped.get(rt) ?? []).filter(([key]) => key === "ground-wall-shadows");

    it("should hand the ground one shape per edge run and per post as the walls are built, cut to the walkable cells", () => {
      const shade = vi.spyOn(GroundLayer.prototype, "shade");
      try {
        dungeonStage();
        expect(shade).toHaveBeenCalledTimes(1);
        const [shadows] = shade.mock.calls[0];
        expect(shadows.shapes).toEqual(planWallShadows(drawnWalls, thick));
        expect(shadows).toEqual(dungeonShadows(drawnWalls, thick, grid));
      } finally {
        shade.mockRestore();
      }
    });

    it("should lay them on the ground once, in the same 44 chunks, each scratch and graphics gone after", () => {
      const { stage, stamped } = dungeonStage();
      const rts = stage.made.filter((m) => m.kind === "renderTexture" && m.depth === GROUND_DEPTH);
      expect(rts).toHaveLength(44);
      const scratches = stage.made.filter((m) => m.kind === "dynamicTexture");
      expect(scratches.length).toBeGreaterThan(0);
      expect(scratches.every((m) => m.destroyed)).toBe(true);
      // each chunk a shadow falls in takes it once, at the catcher's opacity
      const laid = rts.flatMap((rt) => shadowStamps(stamped, rt));
      expect(laid).toHaveLength(scratches.length);
      for (const rt of rts) expect(shadowStamps(stamped, rt).length).toBeLessThanOrEqual(1);
      for (const [, , , , config] of laid) expect(config).toEqual({ alpha: BAKE.SHADOW_OPACITY, originX: 0, originY: 0 });
      // the shapes and cuts were drawn off the display list, and went
      const offList = stage.made.filter((m) => m.kind === "graphics" && m.args[0] === "off the display list");
      expect(offList.length).toBeGreaterThan(0);
      expect(offList.every((m) => m.destroyed)).toBe(true);
    });

    it("should lay no shadow without the wall art: the placeholder walls never had one", () => {
      const { stage, stamped } = dungeonStage({}, {}, { without: "tower_wall_" });
      const rts = stage.made.filter((m) => m.kind === "renderTexture" && m.depth === GROUND_DEPTH);
      expect(rts.length).toBeGreaterThan(0);
      expect(stage.made.filter((m) => m.kind === "dynamicTexture")).toEqual([]);
      for (const rt of rts) expect(shadowStamps(stamped, rt)).toEqual([]);
    });
  });

  describe("a floor of buildings' wall shadows (FS-V8FT3 §F R29)", () => {
    const { buildingShadows, planWallShadows } = await_wallShadows;
    const { MASONRY_WALLS, planWalls, thicknessPx } = await_walls;
    const { doorGaps, planBuildings } = await_buildingLooks;
    const thick = thicknessPx(MASONRY_WALLS);
    const wallOf = (entity_id: string, house_id: string | undefined, x: number, y: number, width: number, height: number) => ({
      entity_id,
      house_id,
      position: at(x, y),
      width,
      height,
    });
    // a room with a door gap in its south wall from x 720 to 780, and a wall of no room in the hall
    const ROOM = [
      wallOf("rn", "r", 600, 100, 300, 20),
      wallOf("rw", "r", 600, 100, 20, 200),
      wallOf("re", "r", 880, 100, 20, 200),
      wallOf("rs1", "r", 600, 280, 120, 20),
      wallOf("rs2", "r", 780, 280, 120, 20),
    ];
    const HALL = [wallOf("hall", undefined, 1000, 500, 200, 20)];
    /** A polygon's corners in a fixed order, rounded, so two outlines of one shape compare equal. */
    const corners = (shape: readonly { x: number; y: number }[]) =>
      shape
        .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
        .sort()
        .join(" ");

    /** Floor 2 of the tower, a floor of buildings, on stage with `walls`, the manifest's art less `without`. */
    function buildingsStage(without?: string) {
      const scene = sceneOnStage();
      const { stage } = scene;
      const run = scene.run as unknown as DungeonRun;
      run.worldLook = WORLD_THEMES.tower;
      const sheets = Object.fromEntries(Object.entries(manifest.sheets).filter(([name]) => !without || !name.startsWith(without)));
      run.art = new ArtLibrary({ ...manifest, sheets }, { warn: () => {} });
      run.groundLayer = undefined;
      const camera = run.cameras as { main: Record<string, unknown> };
      Object.assign(camera.main, { scrollX: 0, scrollY: 0, displayWidth: 1280, displayHeight: 720, setBackgroundColor: vi.fn() });
      const state = { ...floorState(2), walls: [...ROOM, ...HALL] };
      useGameStore.getState().receiveFloorMap(mapOf(state));
      run.handleGameStateUpdate(bare(state));
      return { run, stage, state };
    }

    it("should hand the ground its rooms' and hall walls' shadows once, after the rooms' floors: a room as a village building, a wall of no room full height", () => {
      const paint = vi.spyOn(GroundLayer.prototype, "paint");
      const shade = vi.spyOn(GroundLayer.prototype, "shade");
      try {
        const { run, stage, state } = buildingsStage();
        expect(shade).toHaveBeenCalledTimes(1);
        // over the rooms' floors: the paint with the room comes before it
        const floors = paint.mock.calls.findIndex(([houses]) => houses.length > 0);
        expect(floors).toBeGreaterThanOrEqual(0);
        expect(paint.mock.invocationCallOrder[floors]).toBeLessThan(shade.mock.invocationCallOrder[0]);
        const [room] = planBuildings(ROOM, 1, MASONRY_WALLS);
        const { outside, inside } = buildingShadows(room, doorGaps(ROOM), thick);
        const expected = [...planWallShadows(planWalls(HALL, 1, MASONRY_WALLS), thick), ...outside, ...inside];
        const [handed] = shade.mock.calls[0];
        expect(handed.shapes.map(corners).sort()).toEqual(expected.map(corners).sort());
        expect(handed.cuts).toEqual([]);
        // laid in, its scratch gone; the same walls again hand it nothing more
        const scratches = stage.made.filter((m) => m.kind === "dynamicTexture");
        expect(scratches.length).toBeGreaterThan(0);
        expect(scratches.every((m) => m.destroyed)).toBe(true);
        run.handleGameStateUpdate(bare(state));
        expect(shade).toHaveBeenCalledTimes(1);
      } finally {
        paint.mockRestore();
        shade.mockRestore();
      }
    });

    it("should carry no wall shadow onto the next floor of buildings of the same size: its tiles painted once, its own shadows laid once (Edge States, A new floor)", () => {
      type Laying = { draw(pieces: unknown): void; layShadows(): void };
      const draws = vi.spyOn(GroundLayer.prototype as unknown as Laying, "draw");
      const lays = vi.spyOn(GroundLayer.prototype as unknown as Laying, "layShadows");
      const shade = vi.spyOn(GroundLayer.prototype, "shade");
      try {
        const { run } = buildingsStage();
        const ground = (run as unknown as { groundLayer?: unknown }).groundLayer;
        expect(ground).toBeDefined();
        draws.mockClear();
        lays.mockClear();
        shade.mockClear();
        // the climb to floor 3, a floor of buildings the same size: the ground is kept
        const next = floorState(3);
        useGameStore.getState().receiveFloorMap(mapOf(next));
        run.handleGameStateUpdate(bare(next));
        expect((run as unknown as { groundLayer?: unknown }).groundLayer).toBe(ground);
        expect(shade).toHaveBeenCalledTimes(1);
        // floor 3's tiles once, and floor 3's shadows once over them: none of floor 2's on the way
        expect(draws).toHaveBeenCalledTimes(1);
        expect(lays).toHaveBeenCalledTimes(1);
        expect(lays.mock.instances[0]).toBe(ground);
        expect(draws.mock.invocationCallOrder[0]).toBeLessThan(lays.mock.invocationCallOrder[0]);
        expect(shade.mock.invocationCallOrder[0]).toBeLessThan(lays.mock.invocationCallOrder[0]);
      } finally {
        draws.mockRestore();
        lays.mockRestore();
        shade.mockRestore();
      }
    });

    it("should hand the ground no wall shadow without the wall art: placeholder walls never had one", () => {
      const shade = vi.spyOn(GroundLayer.prototype, "shade");
      // each missing sheet is reported once; not under test here
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const { stage } = buildingsStage("tower_wall_");
        expect(shade.mock.calls.flatMap(([shadows]) => shadows.shapes)).toEqual([]);
        expect(stage.made.filter((m) => m.kind === "dynamicTexture")).toEqual([]);
      } finally {
        shade.mockRestore();
        warn.mockRestore();
      }
    });
  });

  it("should paint a dungeon floor's ground once as it is built, and not again as the party leaves it (review L13)", () => {
    const draws = vi.spyOn(GroundLayer.prototype as unknown as { draw(pieces: unknown): void }, "draw");
    try {
      const { handle } = dungeonStage();
      expect(draws).toHaveBeenCalledTimes(1);
      draws.mockClear();
      useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
      handle(bare(floorState(2)));
      // floor 2's own ground, made and painted with its houses; nothing on floor 1's on the way
      expect(draws).toHaveBeenCalledTimes(2);
    } finally {
      draws.mockRestore();
    }
  });

  it("should lay the placeholder floor without its art under walkable cells only, wall cells and void left to the background (review L13, FS-XK2B6 §E)", () => {
    const scene = sceneOnStage();
    const run = scene.run as unknown as DungeonRun;
    run.worldLook = WORLD_THEMES.tower;
    run.groundLayer = undefined;
    const camera = run.cameras as { main: Record<string, unknown> };
    Object.assign(camera.main, { scrollX: 0, scrollY: 0, displayWidth: 1280, displayHeight: 720, setBackgroundColor: vi.fn() });
    useGameStore.getState().receiveFloorMap(dungeonMap as never);
    (Object.getPrototypeOf(run) as FloorRun).handleGameStateUpdate.call(run, dungeonState());
    // the flagged stone: filled and jointed (the minimap's panel is filled too, never jointed)
    const stone = scene.stage.made.filter((m) => m.kind === "graphics" && m.calls.includes("fillRect") && m.calls.includes("lineBetween"));
    expect(stone).toHaveLength(1);
    let cells = 0;
    for (let cx = 0; cx < grid.cols; cx++)
      for (let cy = 0; cy < grid.rows; cy++) if (grid.walkable(cx, cy)) cells++;
    expect(stone[0].calls.filter((c) => c === "fillRect")).toHaveLength(cells);
  });

  /** A party member in every region, so the fog of war (FS-SRA9J) hides nothing. */
  const everyRegion = (): Partial<Party> => ({
    other_players: grid.regions.map(({ id, cells: [{ x, y }] }) => ({
      ...player(`m${id}`, `M${id}`, 0),
      position: at((x + 0.5) * 80, (y + 0.5) * 80),
    })) as GameState["other_players"],
  });

  it("should show wall pieces, dressing and wall lights only within one chunk of the view, as the camera pans", () => {
    const { run, stage, lights, look } = dungeonStage(everyRegion());
    const walls = drawn(stage.made, "tower_wall_");
    const dressing = (run.dressing ?? []) as unknown as Made[];
    expect(dressing.length).toBeGreaterThan(16);
    const sconces = () =>
      (lights as { x: number; y: number; radius: number }[]).filter((l) => l.radius === manifest.sheets.tower_wall_back_sconce_x.light.radius);
    let lit = 0;
    for (const [x, y] of [[0, 600], [-2400, 1400], [2400, 1400], [600, 2800], [-600, 3400], [3000, 2000]]) {
      look(x, y);
      const near = new Set(chunks.near({ x: x - 640, y: y - 360, width: 1280, height: 720 }));
      for (const m of [...walls, ...dressing]) expect(shownNow(m)).toBe(near.has(chunkOf(m)));
      for (const l of sconces()) expect(near.has(chunks.indexAt(l))).toBe(true);
      expect(lights.length).toBeLessThanOrEqual(FIXED_LIGHT_CAP);
      lit += sconces().length;
    }
    // some of the floor's wall lights were lit along the way, never all of them at once
    expect(lit).toBeGreaterThan(0);
    expect(walls.filter(shownNow).length).toBeLessThan(walls.length);
  });

  describe("its walls on their wall edges (FS-XK2B6 §A–§D)", () => {
    const { wallPlan, dungeonWalls } = await_dungeon;
    const { thicknessPx } = await_walls;
    const { BAKE } = await_bake;
    type Point = { x: number; y: number };
    const { worldToScreen, worldDepth, boxFaces, WALL_HEIGHT } = await_iso;
    type EdgedRun = DungeonRun & {
      currentFloorLook(): { seed: number; walls: import("@/render/world/walls").WallSheets };
      occluders: { size: number; items: { sprite: Made }[] };
      dungeon: { lights: { all: { kind: string; region: number; light: { at?: Point } }[] } };
    };
    /** The floor's walls as the plan cuts them, in the look the staged floor has. */
    const planned = (run: EdgedRun) => {
      const look = run.currentFloorLook();
      const plan = wallPlan(dungeonMap.walls!, grid, thicknessPx(look.walls));
      return { plan, look, ...dungeonWalls(plan, grid, look.seed, look.walls) };
    };
    const screenKey = (p: Point) => {
      const s = worldToScreen(p.x, p.y);
      return `${s.x},${s.y}`;
    };
    const placeOf = (m: Made) => `${m.args[0]},${m.args[1]}`;

    it("should stand a sprite for every piece and post of the wall plan where it stands, sorted by the point the plan names, the back ones among the occluders", () => {
      const { run, stage } = dungeonStage();
      const { pieces, posts } = planned(run as EdgedRun);
      const walls = drawn(stage.made, "tower_wall_");
      const stood = drawn(stage.made, "tower_post_");
      expect(walls.map(placeOf).sort()).toEqual(pieces.map((p) => screenKey(p.at)).sort());
      expect(stood.map(placeOf).sort()).toEqual(posts.map((p) => screenKey(p.at)).sort());
      const depthAt = new Map(pieces.map((p) => [screenKey(p.at), worldDepth(p.depthAt.x, p.depthAt.y)]));
      for (const m of walls) expect(m.depth).toBe(depthAt.get(placeOf(m)));
      // none through a wall cell's middle: every piece is half a thickness from a cell line
      for (const p of pieces) expect([p.at.x % 80, p.at.y % 80]).not.toContain(40);
      // every full-height piece and post fades over the player, and no cut-away one
      const tall = [...pieces, ...posts].filter((p) => p.height === "back");
      const fading = new Set((run as EdgedRun).occluders.items.map((i) => i.sprite.calls));
      for (const m of [...walls, ...stood]) expect(fading.has(m.calls)).toBe(String(m.args[3]).includes("_back"));
      expect([...walls, ...stood].filter((m) => fading.has(m.calls))).toHaveLength(tall.length);
    });

    it("should queue a wall light where its piece stands, for the region its edge faces: only a room's", () => {
      const { run } = dungeonStage();
      const { plan, look } = planned(run as EdgedRun);
      const lights = (run as EdgedRun).dungeon.lights.all.filter((l) => l.kind === "sconce");
      const want: { at: Point; region: number }[] = [];
      for (const edge of plan.runs)
        for (const p of dungeonWalls({ edges: [], runs: [edge], posts: [] }, grid, look.seed, look.walls).pieces) {
          if (!p.sheet.includes("sconce")) continue;
          const { cx, cy } = grid.cellOf(p.at);
          // the cell the edge faces: one step off the wall cell, away from the side it lies on
          const [dx, dy] = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] }[edge.wallSide];
          expect(grid.kind(cx + dx, cy + dy)).toBe("room");
          expect(edge.height).toBe("back");
          want.push({ at: p.at, region: grid.region(cx + dx, cy + dy) });
        }
      expect(want.length).toBeGreaterThan(0);
      const key = (l: { at?: Point; region: number }) => `${l.at!.x},${l.at!.y}:${l.region}`;
      expect(lights.map((l) => key({ at: l.light.at, region: l.region })).sort()).toEqual(want.map(key).sort());
    });

    it("should stand a placeholder block on every edge without the wall art, as thick as the material and as tall as its run, and one at every post", () => {
      const scene = sceneOnStage();
      const run = scene.run as unknown as EdgedRun;
      run.worldLook = WORLD_THEMES.tower;
      run.groundLayer = undefined;
      const camera = run.cameras as { main: Record<string, unknown> };
      Object.assign(camera.main, { scrollX: 0, scrollY: 0, displayWidth: 1280, displayHeight: 720, setBackgroundColor: vi.fn() });
      useGameStore.getState().receiveFloorMap(dungeonMap as never);
      (Object.getPrototypeOf(run) as FloorRun).handleGameStateUpdate.call(run, dungeonState());
      const { pieces, posts, look } = planned(run);
      const thick = thicknessPx(look.walls);
      const low = (WALL_HEIGHT * BAKE.WALL_FRONT) / BAKE.WALL_BACK;
      const tops = (p: { height: string }, x: number, y: number, w: number, h: number) =>
        JSON.stringify(boxFaces(x, y, w, h, p.height === "back" ? WALL_HEIGHT : low).top);
      const want = [
        ...pieces.map((p) =>
          p.axis === "x" ? tops(p, p.at.x - 20, p.at.y - thick / 2, 40, thick) : tops(p, p.at.x - thick / 2, p.at.y - 20, thick, 40),
        ),
        ...posts.map((p) => tops(p, p.at.x - thick / 2, p.at.y - thick / 2, thick, thick)),
      ];
      // an upright block: three filled faces, the top the last
      const blocks = scene.stage.made.filter((m) => m.kind === "graphics" && m.calls.filter((c) => c === "fillPoints").length === 3);
      expect(blocks.map((m) => JSON.stringify(m.last.fillPoints[0])).sort()).toEqual([...want].sort());
      // sorted as the baked pieces are (ADR-0074)
      const depthAt = new Map(pieces.map((p, i) => [want[i], worldDepth(p.depthAt.x, p.depthAt.y)]));
      for (const m of blocks) {
        const depth = depthAt.get(JSON.stringify(m.last.fillPoints[0]));
        if (depth !== undefined) expect(m.depth).toBe(depth);
      }
      expect(run.walls.size).toBe(dungeonMap.walls!.length);
    });
  });

  describe("the fog of war (FS-SRA9J §B, §C)", () => {
    const { Fog: FogClass, FOG } = await_fog;
    const { regionAt } = await_exploration;
    type Seen = { state(region: number): string };
    interface FoggedRun extends DungeonRun {
      dungeon?: {
        seen: Seen;
        fog?: InstanceType<typeof FogClass>;
        lights: { all: { light: { source: unknown }; region: number }[]; lit: ReadonlySet<unknown> };
      };
      chests: Map<string, { sprite: Made }>;
      escapeDoors: Map<string, { sprite: Made }>;
      switches: Map<string, { sprite: Made }>;
      stairs: { placed(): Iterable<{ sprite: Made }> };
      checkBuildingStatus(): void;
    }
    // room 1 (cells 47–54 × 20–26, a pillar at 49,22), the chest's: this client's player stands in it
    const ROOM = 1;
    const inRoom = { current_player: { ...player("me", "Aldric", 0), position: at(4280, 1880) } } as Partial<Party>;
    const stageIn = (party: Partial<Party>) => {
      const staged = dungeonStage(party);
      return { ...staged, run: staged.run as unknown as FoggedRun };
    };
    /** The fixed objects' regions in the fixture: none in room 1 but the chest. */
    const placedAt = { chest: at(4120, 1800), door: at(4000, 1200), lever: at(3000, 900), stairs: at(1000, 1200) };

    it("should place the fixture's fixed objects so that only the chest is in room 1", () => {
      expect(regionAt(grid, placedAt.chest)).toBe(ROOM);
      for (const p of [placedAt.door, placedAt.lever, placedAt.stairs]) expect([0, ROOM]).not.toContain(regionAt(grid, p));
    });

    it("should hide the escape door, switch and stairs in unexplored regions and show the chest in the region the player stands in", () => {
      const { run } = stageIn(inRoom);
      run.checkBuildingStatus();
      expect(run.dungeon!.seen.state(ROOM)).toBe("visible");
      expect(shownNow(run.chests.get("c1")!.sprite)).toBe(true);
      expect(shownNow(run.escapeDoors.get("e1")!.sprite)).toBe(false);
      expect(shownNow(run.switches.get("s1")!.sprite)).toBe(false);
      expect([...run.stairs.placed()].map((s) => shownNow(s.sprite))).toEqual([false]);
    });

    it("should show them once a party member has uncovered their regions, the local player elsewhere", () => {
      const { run, handle } = stageIn(inRoom);
      const ally = (id: string, p: { x: number; y: number }) => ({ ...player(id, id, 0), position: p });
      handle(dungeonState({ ...inRoom, other_players: [ally("a", placedAt.door), ally("b", placedAt.stairs)] as GameState["other_players"] }));
      run.checkBuildingStatus();
      expect(shownNow(run.escapeDoors.get("e1")!.sprite)).toBe(true);
      expect([...run.stairs.placed()].map((s) => shownNow(s.sprite))).toEqual([true]);
      expect(shownNow(run.switches.get("s1")!.sprite)).toBe(false);
    });

    it("should draw every wall piece near the view, tinted as dense as the unexplored veil unless it borders the player's room (owner playtest 2026-11-06)", () => {
      const { stage, look } = stageIn(inRoom);
      const { x, y } = await_iso.worldToScreen(4280, 1880);
      look(x, y);
      const walls = drawn(stage.made, "tower_wall_");
      const near = new Set(chunks.near({ x: x - 640, y: y - 360, width: 1280, height: 720 }));
      const nearWalls = walls.filter((m) => near.has(chunkOf(m)));
      // a piece's cell, from where it stands on screen; whether a region around it is room 1
      const bordersRoom = (m: Made) => {
        const w = await_iso.screenToWorld(m.args[0] as number, m.args[1] as number);
        const cx = Math.floor(w.x / 80);
        const cy = Math.floor(w.y / 80);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (grid.region(cx + dx, cy + dy) === ROOM) return true;
        return false;
      };
      expect(nearWalls.length).toBeGreaterThan(0);
      expect(nearWalls.every(shownNow)).toBe(true);
      // tinted now: its last tint call set the unexplored veil's, none cleared it since
      const tinted = (m: Made) => m.calls.lastIndexOf("setTint") > m.calls.lastIndexOf("clearTint") && m.last["setTint"]?.[0] === FOG.unexplored.tint;
      const plain = nearWalls.filter((m) => !tinted(m));
      expect(plain.length).toBeGreaterThan(0);
      expect(plain.length).toBeLessThan(nearWalls.length);
      for (const m of plain) expect(bordersRoom(m)).toBe(true);
    });

    it("should light only the fixed lights in a visible region", () => {
      const { run, look } = stageIn(inRoom);
      const { x, y } = await_iso.worldToScreen(4280, 1880);
      look(x, y);
      const dungeon = run.dungeon!;
      const lit = dungeon.lights.all.filter((l) => dungeon.lights.lit.has(l.light.source));
      for (const l of lit) expect(l.region === 0 || dungeon.seen.state(l.region) === "visible").toBe(true);
      // the same view with every region visible lights more
      const all = stageIn({ ...inRoom, ...everyRegion() });
      all.look(x, y);
      expect(all.run.dungeon!.lights.lit.size).toBeGreaterThan(dungeon.lights.lit.size);
    });

    it("should draw the fog at the blackout's depth, redraw it only when a region's state changes, and take it down with the floor", () => {
      const { run, stage, handle } = stageIn(inRoom);
      const fog = run.dungeon!.fog!;
      const layers = stage.made.filter((m) => m.kind === "image" && m.depth === FOG.depth && !m.destroyed);
      expect(layers.length).toBeGreaterThan(0);
      const drawn = fog.redraws;
      for (let i = 0; i < 3; i++) handle(dungeonState(inRoom));
      expect(fog.redraws).toBe(drawn);
      // the climb to floor 2, a floor of buildings: no fog there
      useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
      handle(bare(floorState(2)));
      expect(layers.every((m) => m.destroyed)).toBe(true);
      expect(run.dungeon).toBeUndefined();
    });

    describe("the fog floor's ambient (FS-SRA9J §Change: Lighter fog and lit regions, F7, F8)", () => {
      const { FOG_FLOOR_AMBIENT, TOWER_AMBIENT } = await_lighting;
      type Lit = { ambient: number; ambients: { ambient: number; fog: boolean }[] };
      const lit = (run: unknown) => (run as { lightMap: Lit }).lightMap;

      it("should lift the light-map to the fog floor's ambient when floor 1's fog stands, never before it", () => {
        // the snapshot before its map: no fog yet, the tower's ambient, then the map's fog and the lift
        const { run } = dungeonStage(inRoom, {}, { late: true });
        expect((run as unknown as FoggedRun).dungeon?.fog).toBeDefined();
        expect(lit(run).ambient).toBe(FOG_FLOOR_AMBIENT);
        expect(lit(run).ambients).toEqual([{ ambient: FOG_FLOOR_AMBIENT, fog: true }]);
      });

      it("should return the tower's ambient at once on a climb to a floor without fog", () => {
        const { run, handle } = stageIn(inRoom);
        expect(lit(run).ambient).toBe(FOG_FLOOR_AMBIENT);
        useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
        handle(bare(floorState(2)));
        expect(run.dungeon).toBeUndefined();
        expect(lit(run).ambient).toBe(TOWER_AMBIENT);
        // and floor 3 keeps it
        useGameStore.getState().receiveFloorMap(mapOf(floorState(3)));
        handle(bare(floorState(3)));
        expect(lit(run).ambient).toBe(TOWER_AMBIENT);
      });

      it("should leave floors 2 and 3 at the tower's ambient, never lifting it, on a fresh scene", () => {
        const { run } = sceneOnStage();
        run.handleGameStateUpdate(floorState(2));
        run.handleGameStateUpdate(floorState(3));
        expect(lit(run).ambient).toBe(TOWER_AMBIENT);
        expect(lit(run).ambients).toEqual([]);
      });
    });

    // FS-X2CMM §I R48 (I-X2CMM-12): a witchlight lifts every viewer's fog in its cells, as a delver would,
    // and what it lit stays explored once it goes
    it("should lift the fog round a witchlight in the state, no member near, and leave its region explored when it goes", () => {
      const { run, handle } = stageIn(inRoom);
      const doorRegion = regionAt(grid, placedAt.door);
      const light = { id: "w1", kind: "witchlight", x: placedAt.door.x, y: placedAt.door.y, remaining: 20 };
      handle({ ...dungeonState(inRoom), book_effects: [light] } as GameState);
      run.checkBuildingStatus();
      expect(run.dungeon!.seen.state(doorRegion)).toBe("visible");
      expect(shownNow(run.escapeDoors.get("e1")!.sprite)).toBe(true);
      handle(dungeonState(inRoom));
      expect(run.dungeon!.seen.state(doorRegion)).toBe("explored");
    });

    it("should start a new dungeon floor unexplored, the party's regions visible at once", () => {
      const { run, handle } = stageIn(inRoom);
      const stairsRoom = regionAt(grid, placedAt.stairs);
      // the player walks to the stairs' region on floor 1, room 1 left explored
      handle(dungeonState({ current_player: { ...player("me", "Aldric", 0), position: placedAt.stairs } as Party["current_player"] }));
      expect(run.dungeon!.seen.state(ROOM)).toBe("explored");
      // floor 2 laid out as floor 1 was, the player arriving in room 1
      useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 2 } as never);
      handle({ ...dungeonState(inRoom), floor: 2 });
      expect(run.dungeon!.seen.state(stairsRoom)).toBe("unexplored");
      expect(run.dungeon!.seen.state(ROOM)).toBe("visible");
    });

    describe("monsters and drop piles (FS-SRA9J §D)", () => {
      const ME = at(4280, 1880);
      const { Exploration } = await_exploration;
      /** A cell's middle in a region the player's look leaves not visible, within 380 px of them. */
      const near = (() => {
        const seen = new Exploration(grid);
        seen.see([ME]);
        for (let cy = 0; cy < grid.rows; cy++)
          for (let cx = 0; cx < grid.cols; cx++) {
            const id = grid.region(cx, cy);
            const p = at((cx + 0.5) * 80, (cy + 0.5) * 80);
            if (id && seen.state(id) !== "visible" && Math.hypot(p.x - ME.x, p.y - ME.y) < 380) return p;
          }
        throw new Error("the fixture has no region beside room 1");
      })();
      /** Far off in an unexplored region: the escape door's. */
      const far = placedAt.door;
      const inRoomAt = at(4120, 1850);
      const beast = (entity_id: string, p: { x: number; y: number }, fields: Record<string, unknown> = {}) => ({
        ...monster(entity_id, 0),
        position: p,
        ...fields,
      });
      const elite = { elite: true, name: "Hollow Ghoul" };
      interface MonsterRun extends FoggedRun {
        monsters: InstanceType<typeof MonsterRoster>;
        projectiles?: unknown;
        fx?: unknown;
        trails: { placed(): Iterable<{ bed: Made; glow: Made }> };
        time: { now: number; delayedCall: unknown };
        createUI(): void;
        updateTargetFrame(deltaMs: number): void;
        targetFrame?: { texts(): Made[] };
        /** The marker-mode table the run reads: the shipped one unless a test names its own. */
        markerModes: MarkerModes;
      }
      const stageWith = (party: Partial<Party> = inRoom) => {
        const staged = stageIn(party);
        const run = staged.run as unknown as MonsterRun;
        /** One broadcast with these monsters and containers, then a frame: eased, then hidden. */
        const frame = (fields: Partial<GameState>, who: Partial<Party> = party) => {
          staged.handle({ ...dungeonState(who), ...fields } as GameState);
          run.monsters.update(16);
          run.checkBuildingStatus();
        };
        const shownMonsters = () => run.monsters.standing().map((m) => shownNow(m.parts[0] as unknown as Made));
        return { ...staged, run, frame, shownMonsters };
      };

      it("should show a monster in the player's room or within 400 px of them, and hide one beyond, plate, prefix and bar with it", () => {
        const { run, stage, handle, shownMonsters } = stageWith();
        // floor 1 itself: its plates are overhead (FS-48CTQ § Change: Floor 1 carries overhead markers, 24)
        handle({
          ...dungeonState(inRoom),
          monsters: [beast("room", inRoomAt), beast("near", near, elite), beast("far", far, elite)],
        } as GameState);
        run.monsters.update(16);
        run.checkBuildingStatus();
        expect(shownMonsters()).toEqual([true, true, false]);
        const plates = stage.made.filter(
          (m) => m.kind === "text" && !m.destroyed && ["Ghoul · Lv 1", "Hollow"].includes(m.args[2] as string),
        );
        expect(plates.map(shownNow)).toEqual([true, true, true, false, false]);
        // each monster's bar is the first bar made after its name
        const bars = plates
          .filter((m) => m.args[2] !== "Hollow")
          .map((name) => stage.made.slice(stage.made.indexOf(name)).find((m) => m.kind === "graphics" && m.depth === MARKER_DEPTH.bar)!);
        expect(bars.map(shownNow)).toEqual([true, true, false]);
        expect(run.monsters.targetable().map((m) => m.entity_id)).toEqual(["room", "near"]);
      });

      it("should hide a monster in an explored region once no member is within 400 px of it", () => {
        const { frame, shownMonsters, run } = stageWith();
        frame({ monsters: [beast("room", inRoomAt)] });
        expect(shownMonsters()).toEqual([true]);
        // the player walks to the stairs' region: room 1 is left explored, far behind them
        frame({ monsters: [beast("room", inRoomAt)] }, { current_player: { ...player("me", "Aldric", 0), position: placedAt.stairs } as Party["current_player"] });
        expect(run.dungeon!.seen.state(ROOM)).toBe("explored");
        expect(shownMonsters()).toEqual([false]);
        expect(run.monsters.targetable()).toEqual([]);
      });

      it("should name no hidden monster in the target frame, not even an engaged boss, and name a shown one", () => {
        const { run, frame } = stageWith();
        // the dungeon floor opted in by the test's own entry: the shipped table names no floor
        // (FS-48CTQ § Change: Floor 1 carries overhead markers; no floor uses the target frame, 26)
        run.markerModes = { run: { 1: "frame" } };
        run.time.now = 0;
        run.createUI();
        const named = () => {
          const lines = run.targetFrame!.texts().filter((t) => t.shown && t.args[2] !== "");
          return lines.length ? lines.map((t) => t.args[2]).join(" ") : null;
        };
        // a demon below its maximum health is engaged (FS-48CTQ §D.10), wherever it stands
        const boss = (id: string, p: { x: number; y: number }) =>
          beast(id, p, { archetype: "demon", name: "Demon", boss: true, current_health: 50, max_health: 100 });
        frame({ monsters: [boss("hidden", far)] });
        run.updateTargetFrame(200);
        expect(named()).toBeNull();
        frame({ monsters: [boss("hidden", far), boss("shown", inRoomAt)] });
        run.updateTargetFrame(200);
        expect(named()).toBe("Demon · Lv 1");
      });

      it("should give a hidden monster no strike-mark and no attack, and drop the strike-mark when the hovered one is hidden", () => {
        const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
        const { run, frame, cursor } = stageWith();
        frame({ monsters: [beast("room", inRoomAt), beast("far", far)] });
        const [room, hidden] = run.monsters.standing().map((m) => m.parts[0] as unknown as Made);
        hidden.handlers.pointerover();
        hidden.handlers.pointerdown();
        expect(cursor).not.toHaveBeenCalledWith("strike");
        expect(sent).not.toHaveBeenCalledWith(ActionType.Attack, expect.anything());
        // the pointer rests on the room's monster while the player walks off and it goes dark
        room.handlers.pointerover();
        expect(cursor).toHaveBeenLastCalledWith("strike");
        frame({ monsters: [beast("room", inRoomAt), beast("far", far)] }, { current_player: { ...player("me", "Aldric", 0), position: placedAt.stairs } as Party["current_player"] });
        expect(cursor).toHaveBeenLastCalledWith("hand");
        expect(run.monsters.hoveredId).toBeUndefined();
        sent.mockRestore();
      });

      it("should show a drop pile by the monster rule, while a chest in an explored region stays drawn", () => {
        const { run, frame } = stageWith();
        const item = { item_id: "i1", entity_id: "ie1", name: "Notched Blade", quantity: 1, attack_power: 6 };
        const heap = (entity_id: string, p: { x: number; y: number }) => ({
          container_id: entity_id,
          entity_id,
          kind: "drop_pile" as const,
          position: p,
          is_open: true,
          items: [item],
        });
        const piles = [heap("p_room", inRoomAt), heap("p_near", near), heap("p_far", far)];
        const shownPiles = () => ["p_room", "p_near", "p_far"].map((id) => shownNow(run.chests.get(id)!.sprite));
        const containers = (extra: unknown[]) => [...dungeonState().containers, ...extra] as GameState["containers"];
        frame({ containers: containers(piles) });
        expect(shownPiles()).toEqual([true, true, false]);
        // room 1 left explored, the player far off at the stairs
        frame({ containers: containers(piles) }, { current_player: { ...player("me", "Aldric", 0), position: placedAt.stairs } as Party["current_player"] });
        expect(shownPiles()).toEqual([false, false, false]);
        expect(shownNow(run.chests.get("c1")!.sprite)).toBe(true);
      });

      it("should hide projectiles, effects and burning trails in an unexplored region, and leave them in an explored one", () => {
        const { run, frame } = stageWith();
        const hidden = { projectiles: vi.fn(), fx: vi.fn() };
        run.projectiles = { sync: vi.fn(), clear: vi.fn(), standing: () => [], hideWhere: hidden.projectiles };
        run.fx = { standing: () => [], hideWhere: hidden.fx, clearAll: vi.fn(), release: vi.fn() };
        const trail = (entity_id: string, from: { x: number; y: number }) => ({
          entity_id,
          from,
          to: at(from.x + 40, from.y),
          half_width: 12,
          remaining: 1,
        });
        // the player at the stairs, room 1 explored behind them
        frame(
          { trails: [trail("t_room", inRoomAt), trail("t_far", far)] },
          { current_player: { ...player("me", "Aldric", 0), position: placedAt.stairs } as Party["current_player"] },
        );
        expect(run.dungeon!.seen.state(ROOM)).toBe("explored");
        for (const rule of [hidden.projectiles, hidden.fx]) {
          const hides = rule.mock.lastCall![0] as (p: { x: number; y: number }) => boolean;
          expect([hides(far), hides(inRoomAt), hides(placedAt.stairs)]).toEqual([true, false, false]);
        }
        const trails = [...run.trails.placed()];
        expect(trails.map((t) => [shownNow(t.bed), shownNow(t.glow)])).toEqual([
          [true, true],
          [false, false],
        ]);
      });
    });

    describe("the minimap (FS-SRA9J §E, I-SRA9J-3)", () => {
      const { Minimap, minimapRect } = await_minimap;
      type Map = InstanceType<typeof Minimap>;
      interface MappedRun extends FoggedRun {
        dungeon?: FoggedRun["dungeon"] & { minimap?: Map };
        floorText?: object;
        escapedCountText?: object;
        positionReadout?: object;
        menu?: unknown;
        minimapMode: string;
        createUI(): void;
        relayoutHud(): void;
        bindRunInput(): void;
        resetRun(end: "shutdown" | "destroy"): void;
        updateFloorIndicator(state: Pick<GameState, "floor">): void;
      }
      type Key = (event?: { repeat?: boolean }) => void;
      const { Exploration } = await_exploration;
      /** What the party sees with only this client's player in room 1: the room and any tiny segment seen with it. */
      const roomOnly = (() => {
        const seen = new Exploration(grid);
        seen.see([at(4280, 1880)]);
        return grid.regions.filter((r) => seen.state(r.id) !== "unexplored").map((r) => [r.id, seen.state(r.id)]);
      })();
      /** The floor indicator's height: 21 px, as a 12 px line in 3 px padding is (FS-56CKV §B.10). */
      const FLOOR_LINE = { height: 21 };
      /** Where a column text was last stood: its x and its top (origin 1, 0). */
      const standing = (text: object | undefined) => {
        const { last } = text as Made;
        return [last.setX?.[0], last.setY?.[0]];
      };

      afterEach(() => {
        vi.restoreAllMocks();
        viewport.set({ width: 800, height: 600, renderScale: 1 });
      });

      /** This browser's store for the minimap's mode (FS-1SEF0 §A.4): what it holds, and what was written. */
      const browserStore = (held: string | null = null) => {
        const store = { held, writes: [] as string[] };
        const kv = {
          getItem: (key: string) => (key === await_minimapMode.MINIMAP_MODE_KEY ? store.held : null),
          setItem: (key: string, value: string) => {
            if (key !== await_minimapMode.MINIMAP_MODE_KEY) return;
            store.held = value;
            store.writes.push(value);
          },
          removeItem: vi.fn(),
        };
        return Object.assign(store, { read: () => kv });
      };

      /** Floor 1 with the run's HUD up and its keys bound, then a broadcast with `party`; the mode kept in `store`. */
      const mapped = (party: Partial<Party> = inRoom, store = browserStore()) => {
        const placed = vi.spyOn(Minimap.prototype, "place");
        const dots = vi.spyOn(Minimap.prototype, "party");
        const staged = stageIn(party);
        const run = staged.run as unknown as MappedRun;
        const keys: Record<string, Key> = {};
        /** The scene's own pointer listeners, by event, as Phaser calls them. */
        const pointers: Record<string, (pointer?: object) => void> = {};
        Object.assign(run, {
          minimapStore: store.read,
          input: {
            setDefaultCursor: vi.fn(),
            // as Phaser's: the UI scene's chat turns it off while typing (FS-TQZ5J § Change: Batch 6, R127)
            keyboard: { enabled: true, resetKeys: () => {}, on: (event: string, fn: Key) => (keys[event] = fn) },
            on: (event: string, fn: (pointer?: object) => void) => (pointers[event] = fn),
          },
        });
        run.createUI();
        run.bindRunInput();
        Object.assign(run.floorText!, FLOOR_LINE);
        Object.assign(run.escapedCountText!, FLOOR_LINE);
        const view = (width: number) => {
          viewport.set({ width, height: 720, renderScale: 1 });
          run.relayoutHud();
        };
        view(1080);
        const frame = (who: Partial<Party> = party, fields: Partial<GameState> = {}) =>
          staged.handle({ ...dungeonState(who), ...fields } as GameState);
        frame();
        const map = () => run.dungeon?.minimap;
        /** M pressed until the minimap is in `mode` (FS-1SEF0 §A.2). */
        const pressTo = (mode: string) => {
          for (let i = 0; i < 3 && map()?.mode !== mode; i++) keys["keydown-M"]();
          expect(map()?.mode).toBe(mode);
        };
        return { ...staged, run, keys, pointers, view, frame, map, placed, dots, store, pressTo };
      };
      const ally = (id: string, p: { x: number; y: number }, fields: { escape?: boolean; current_health?: number } = {}) => ({
        ...player(id, id, 0, fields),
        position: p,
      });

      // FS-56CKV §B.9 and §B.12 supersede §E.20 in part: the minimap at the column's top, the floor
      // indicator 6 px under it, the escaped count 4 px under that; the floor line gone while the
      // map name names the floor, the escaped count in its place (§Change: Map name, E9 as amended
      // 2026-11-12, owner: "地城樓層顯示兩次 拿掉下面的")
      it("should show the minimap on floor 1 by default at the column's top, the escaped count under it in the floor line's place, right-aligned, and move them with the view", () => {
        const { run, map, view, placed } = mapped();
        expect(map()).toBeDefined();
        expect(map()!.mode).toBe("normal");
        expect(placed).toHaveBeenLastCalledWith(minimapRect(1070, 10));
        expect((run.floorText as Made).shown).toBe(false);
        expect(standing(run.escapedCountText)).toEqual([1070, 124]);
        view(1280);
        expect(placed).toHaveBeenLastCalledWith(minimapRect(1270, 10));
        expect(minimapRect(1270, 10)).toMatchObject({ x: 1054, y: 10 });
        expect(standing(run.escapedCountText)).toEqual([1270, 124]);
        // moved, so rasterised again at the render scale of now (FS-ZAJMH R5)
        for (const text of [run.floorText, run.escapedCountText]) expect((text as Made).last.setResolution).toEqual([1]);
      });

      it("should draw the floor indicator and the escaped count at 12 px in 8 × 3 padding, their colours, backings and face unchanged (FS-56CKV §B.10)", () => {
        const { run } = mapped();
        const style = (text: object | undefined) => (text as Made).args[3];
        const line = { fontFamily: CANVAS_FONT.body, fontSize: "12px", backgroundColor: toCss(palette.hudPanel), padding: { x: 8, y: 3 } };
        expect(style(run.floorText)).toEqual({ ...line, color: toCss(palette.hudText) });
        expect(style(run.escapedCountText)).toEqual({ ...line, color: toCss(palette.frameBright) });
      });

      // FS-1SEF0 §C.20, §D.21: the overlay leaves the corner to its icon's row and the lines under it
      // (FS-T3DWX G4, the owner's option A: the column from y 31)
      it("should close the column up under the icon's row in the overlay mode, and open it again on M back to normal (FS-1SEF0 §D.21; FS-56CKV §B.11; FS-T3DWX G4)", () => {
        const { run, keys, pressTo } = mapped();
        pressTo("overlay");
        expect(standing(run.escapedCountText)).toEqual([1070, 31]);
        keys["keydown-M"]();
        expect(standing(run.escapedCountText)).toEqual([1070, 124]);
      });

      // FS-1SEF0 §B.8, §B.11: the enlarged minimap at the column's top, everything under it moved
      // down; at the very top, y 10, by FS-56CKV §Change C3, C5 as amended 2026-11-12
      it("should stand the enlarged minimap at the column's top, y 10, and the escaped count under it, at 1080 and 1280 (FS-1SEF0 §B.11; FS-56CKV §Change C3, C5)", () => {
        const { run, view, placed, pressTo } = mapped();
        const enlarged = await_minimap.minimapPanel("enlarged");
        pressTo("enlarged");
        expect(placed).toHaveBeenLastCalledWith(minimapRect(1070, 10, enlarged));
        expect(standing(run.escapedCountText)).toEqual([1070, 178]);
        view(1280);
        expect(placed).toHaveBeenLastCalledWith(minimapRect(1270, 10, enlarged));
        expect(standing(run.escapedCountText)).toEqual([1270, 178]);
        pressTo("normal");
        expect(placed).toHaveBeenLastCalledWith(minimapRect(1270, 10));
        expect(standing(run.escapedCountText)).toEqual([1270, 124]);
      });

      // FS-T3DWX §Change: The top-right HUD fills the button's spot (owner 2026-11-13: 「空出來的就補上」,
      // the overlay 「1.A」): the map in the very corner, nothing beside it; the overlay's icon in the
      // corner and the column under its row; with no map the column from the top
      describe("the corner with no button's spot (FS-T3DWX §Change: The top-right HUD fills the button's spot)", () => {
        it.each([1080, 1280])(
          "should stand the normal map in the very corner and the column's first shown line at the map's bottom + 6, at logical width %i (G2)",
          (width) => {
            const { run, view, placed } = mapped();
            view(width);
            const map = minimapRect(width - 10, 10);
            expect(placed).toHaveBeenLastCalledWith(map);
            expect(standing(run.escapedCountText)).toEqual([width - 10, map.y + map.height + 6]);
            expect(run).not.toHaveProperty("fullscreenButton");
          },
        );

        it.each([1080, 1280])("should step the corner on M: the enlarged map in the corner, the overlay's icon in the corner with the column at y 31, the map back at normal, at width %i (G2–G4)", (width) => {
          const { run, view, keys, placed } = mapped();
          view(width);
          keys["keydown-M"]();
          const enlarged = minimapRect(width - 10, 10, await_minimap.minimapPanel("enlarged"));
          expect(enlarged).toEqual({ x: width - 334, y: 10, width: 324, height: 162 });
          expect(placed).toHaveBeenLastCalledWith(enlarged);
          expect(standing(run.escapedCountText)).toEqual([width - 10, 10 + 162 + 6]);
          keys["keydown-M"]();
          expect((run.dungeon as { modeIcon?: { shownAt: { box: unknown } | null } } | undefined)?.modeIcon?.shownAt?.box).toEqual({ x: width - 19, y: 10, width: 9, height: 9 });
          expect(standing(run.escapedCountText)).toEqual([width - 10, 31]);
          keys["keydown-M"]();
          expect(standing(run.escapedCountText)).toEqual([width - 10, 124]);
        });
      });

      it("should stand the escaped count where the floor indicator would while it has no label, and step it down once it has, on a floor without a minimap (FS-56CKV §B.11)", () => {
        const { run, handle } = mapped();
        useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
        handle(bare(floorState(2)));
        run.updateFloorIndicator({ floor: undefined });
        expect((run.floorText as Made).shown).toBe(false);
        expect(standing(run.escapedCountText)).toEqual([1070, 10]);
        run.updateFloorIndicator({ floor: 2 });
        expect((run.floorText as Made).shown).toBe(true);
        expect(standing(run.floorText)).toEqual([1070, 10]);
        expect(standing(run.escapedCountText)).toEqual([1070, 35]);
      });

      it("should close the column up on a dungeon floor before its map is in, the floor line shown, and drop the line under the minimap once it is built (FS-56CKV §B.11; §Change: Map name, E9)", () => {
        const { run, map, handle } = mapped();
        // the party climbs to floor 2; its map has not come yet
        handle({ ...dungeonState(inRoom), floor: 2 });
        expect(map()).toBeUndefined();
        expect((run.floorText as Made).shown).toBe(true);
        expect((run.floorText as Made).args[2]).toBe("Floor 2");
        expect(standing(run.floorText)).toEqual([1070, 10]);
        expect(standing(run.escapedCountText)).toEqual([1070, 35]);
        useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 2 } as never);
        handle({ ...dungeonState(inRoom), floor: 2 });
        expect(map()).toBeDefined();
        expect((run.floorText as Made).shown).toBe(false);
        expect(standing(run.escapedCountText)).toEqual([1070, 124]);
      });

      it("should cycle it on M, normal, enlarged, overlay and round again, never off, and leave it alone while the menu is open, while typing in chat, and on a held key's repeats (FS-1SEF0 §A.2)", () => {
        const { run, keys, map, store } = mapped();
        const modes: string[] = [];
        for (let i = 0; i < 4; i++) {
          keys["keydown-M"]();
          modes.push(map()!.mode);
        }
        expect(modes).toEqual(["enlarged", "overlay", "normal", "enlarged"]);
        expect(store.writes).toEqual(modes);
        keys["keydown-M"]({ repeat: true });
        expect(map()!.mode).toBe("enlarged");
        menuUpOver(run);
        keys["keydown-M"]();
        expect(map()!.mode).toBe("enlarged");
        menuUpOver(run, false);
        typeInChat(run);
        keys["keydown-M"]();
        expect(map()!.mode).toBe("enlarged");
        typeInChat(run, false);
        expect(store.writes).toHaveLength(4);
      });

      // FS-WDM0X S7: each step the player makes, by M or the map mode icon, plays the mode switch;
      // one refused, one on a floor with no minimap, or the map built in the kept mode plays nothing
      it("should play map_mode_switch on each step by M and by the map mode icon, and nothing as the map is built, on a refused M or where there is no minimap (FS-WDM0X S7)", () => {
        const { run, keys, pointers, map, handle } = mapped();
        const heard = hearOn(run as unknown as Record<string, unknown>);
        expect(map()).toBeDefined();
        expect(heard()).toEqual([]);
        keys["keydown-M"]();
        expect(heard()).toEqual(["map_mode_switch"]);
        // the enlarged map's icon, in its bottom-left (the map mode icon's own test)
        pointers.pointerdown({ x: 754, y: 163, button: 0, worldX: 754, worldY: 163, leftButtonDown: () => true, rightButtonDown: () => false });
        expect(map()!.mode).toBe("overlay");
        expect(heard()).toEqual(["map_mode_switch"]);
        keys["keydown-M"]({ repeat: true });
        menuUpOver(run);
        keys["keydown-M"]();
        menuUpOver(run, false);
        typeInChat(run);
        keys["keydown-M"]();
        typeInChat(run, false);
        expect(heard()).toEqual([]);
        // a floor of buildings: no minimap to step
        useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
        handle(bare(floorState(2)));
        expect(run.dungeon?.minimap).toBeUndefined();
        keys["keydown-M"]();
        expect(heard()).toEqual([]);
      });

      it("should have no off step left: no minimapOn, and no switch on the minimap to hide it (FS-1SEF0 §A.7)", () => {
        const { run, map } = mapped();
        expect("minimapOn" in run).toBe(false);
        expect("setShown" in map()!).toBe(false);
        expect("shown" in map()!).toBe(false);
      });

      it("should change nothing on M where there is no minimap: a floor of buildings, a dungeon floor before its map (FS-1SEF0 §A.3)", () => {
        const { run, keys, handle, store } = mapped();
        useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
        handle(bare(floorState(2)));
        keys["keydown-M"]();
        handle({ ...dungeonState(inRoom), floor: 3 });
        expect(run.dungeon?.minimap).toBeUndefined();
        keys["keydown-M"]();
        expect(store.writes).toEqual([]);
        expect(run.minimapMode).toBe("normal");
        expect((run.floorText as Made).shown).toBe(true);
        expect(standing(run.floorText)).toEqual([1070, 10]);
      });

      it("should build the minimap in the mode this browser kept, and an old off or anything unknown as normal (FS-1SEF0 §A.4, §A.5)", () => {
        const kept = mapped(inRoom, browserStore("overlay"));
        expect(kept.map()!.mode).toBe("overlay");
        expect(standing(kept.run.escapedCountText)).toEqual([1070, 31]);
        for (const held of ["off", "huge", null]) expect(mapped(inRoom, browserStore(held)).map()!.mode).toBe("normal");
      });

      it("should start at normal and still cycle where this browser's storage throws (FS-1SEF0 §A.5)", () => {
        const blocked = Object.assign(browserStore(), {
          read: () => {
            throw new Error("SecurityError");
          },
        });
        const { keys, map } = mapped(inRoom, blocked);
        expect(map()!.mode).toBe("normal");
        expect(() => keys["keydown-M"]()).not.toThrow();
        expect(map()!.mode).toBe("enlarged");
      });

      it("should bind M as a keydown event, never a captured key, so a stop has no capture of it to hand back", () => {
        const scene = sceneOnStage();
        const run = scene.run as unknown as MappedRun & { bindKeys(): void };
        const added: number[] = [];
        const heard: string[] = [];
        const key = (code: number) => ({ keyCode: code, on: vi.fn() });
        Object.assign(run, {
          input: {
            setDefaultCursor: vi.fn(),
            on: vi.fn(),
            keyboard: {
              createCursorKeys: () => ({}),
              addKey: (code: number) => (added.push(code), key(code)),
              addCapture: vi.fn(),
              on: (event: string) => heard.push(event),
            },
          },
        });
        run.bindKeys();
        run.bindRunInput();
        expect(heard).toContain("keydown-M");
        expect(added).not.toContain(77);
      });

      it("should keep the mode across a floor change, and read it again from this browser for the next run scene (FS-1SEF0 §A.4, §A.6)", () => {
        const { run, map, handle, store, pressTo } = mapped();
        const first = map()!;
        pressTo("overlay");
        // floor 2 laid out as floor 1 was: a new floor, a new minimap, in the same mode
        useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 2 } as never);
        handle({ ...dungeonState(inRoom), floor: 2 });
        expect(map()).toBeDefined();
        expect(map()).not.toBe(first);
        expect(map()!.mode).toBe("overlay");
        expect(store.held).toBe("overlay");
        run.resetRun("shutdown");
        store.held = "enlarged";
        run.createUI();
        expect(run.minimapMode).toBe("enlarged");
      });

      // FS-56CKV §Change: Map mode icon (owner 2026-11-12: "右上角地圖左下角多加小icon hover顯示可以切換大小或
      // 是模式(M)"): the icon in the map's bottom-left, a press doing what M does
      describe("the map mode icon (FS-56CKV §Change: Map mode icon; I-56CKV-8)", () => {
        type IconRun = MappedRun & { combat: { cast: (...args: unknown[]) => void } };
        type Icon = { shownAt: { box: { x: number; y: number; width: number; height: number } } | null; hovered: boolean };
        const iconOf = (run: MappedRun) => (run.dungeon as { modeIcon?: Icon } | undefined)?.modeIcon;
        /** A press at logical (x, y), render scale 1: the primary button unless `button` says. */
        const pointerAt = (x: number, y: number, button = 0) => ({
          x,
          y,
          button,
          worldX: x,
          worldY: y,
          leftButtonDown: () => button === 0,
          rightButtonDown: () => button === 2,
        });

        it.each([
          [1080, "normal", { x: 858, y: 105 }],
          [1280, "normal", { x: 1058, y: 105 }],
          [1080, "enlarged", { x: 750, y: 159 }],
          [1280, "enlarged", { x: 950, y: 159 }],
          [1080, "overlay", { x: 1061, y: 10 }],
          [1280, "overlay", { x: 1261, y: 10 }],
        ])("should stand its 9 × 9 box at width %i in the %s mode: the map's bottom-left, or the very corner in the overlay (D2, D3; FS-T3DWX G4)", (width, mode, at) => {
          const { run, view, pressTo } = mapped();
          view(width);
          pressTo(mode);
          expect(iconOf(run)?.shownAt?.box).toEqual({ ...at, width: 9, height: 9 });
        });

        it("should step the mode on a press in its hit area as M does, written to this browser, never an attack (D6)", () => {
          const { run, pointers, map, store } = mapped();
          const cast = vi.spyOn((run as IconRun).combat, "cast");
          pointers.pointerdown(pointerAt(862, 109));
          expect(map()!.mode).toBe("enlarged");
          expect(store.writes).toEqual(["enlarged"]);
          // the corner re-laid as on M: the icon in the enlarged map's bottom-left
          expect(iconOf(run)?.shownAt?.box).toMatchObject({ x: 750, y: 159 });
          pointers.pointerdown(pointerAt(754, 163));
          // in the very corner, as the overlay is up (FS-T3DWX G4)
          pointers.pointerdown(pointerAt(1065, 14));
          expect(map()!.mode).toBe("normal");
          expect(store.writes).toEqual(["enlarged", "overlay", "normal"]);
          // a right press on it is its too: no class ability at the corner, and no step
          pointers.pointerdown(pointerAt(862, 109, 2));
          expect(map()!.mode).toBe("normal");
          expect(cast).not.toHaveBeenCalled();
        });

        it("should do nothing with a press while the menu is open or chat is typing, M's guards (D6)", () => {
          const { run, pointers, map, store } = mapped();
          const cast = vi.spyOn((run as IconRun).combat, "cast");
          menuUpOver(run);
          pointers.pointerdown(pointerAt(862, 109));
          menuUpOver(run, false);
          typeInChat(run);
          pointers.pointerdown(pointerAt(862, 109));
          expect(map()!.mode).toBe("normal");
          expect(store.writes).toEqual([]);
          expect(cast).not.toHaveBeenCalled();
        });

        // FS-3EBCA R10 with D5, now FS-TQZ5J R7, R15: a press on the corner row is the UI scene's,
        // above the run, and never reaches it, so the run's pointer reads no rect of the row
        it("should read no corner row on the icon's press: the row is the UI scene's (FS-TQZ5J R15; D5)", () => {
          const { run, pointers, map } = mapped();
          (run as unknown as { corner?: unknown }).corner = { covers: () => true, destroy: vi.fn() };
          pointers.pointerdown(pointerAt(862, 109));
          expect(map()!.mode).toBe("enlarged");
        });

        it("should leave a press 1 px outside its hit area to the game, the map's own ground included (D5)", () => {
          const { run, pointers, map } = mapped();
          const cast = vi.spyOn((run as IconRun).combat, "cast");
          // the hit area x 856–869, y 103–116
          pointers.pointerdown(pointerAt(855, 109));
          pointers.pointerdown(pointerAt(862, 117));
          expect(map()!.mode).toBe("normal");
          expect(cast).toHaveBeenCalledTimes(2);
        });

        it("should light up under the pointer and go dark as it leaves, or leaves the canvas (D7)", () => {
          const { run, pointers } = mapped();
          pointers.pointermove(pointerAt(862, 109));
          expect(iconOf(run)?.hovered).toBe(true);
          pointers.pointermove(pointerAt(900, 109));
          expect(iconOf(run)?.hovered).toBe(false);
          pointers.pointermove(pointerAt(862, 109));
          pointers.gameout();
          expect(iconOf(run)?.hovered).toBe(false);
        });

        it("should be gone with its floor, and none on a floor without regions or before a floor's map (D4)", () => {
          const { run, handle, pointers, store } = mapped();
          const first = iconOf(run) as unknown as { covers(x: number, y: number): boolean };
          expect(first.covers(862, 109)).toBe(true);
          useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
          handle(bare(floorState(2)));
          expect(run.dungeon).toBeUndefined();
          expect(first.covers(862, 109)).toBe(false);
          pointers.pointerdown(pointerAt(862, 109));
          expect(store.writes).toEqual([]);
          handle({ ...dungeonState(inRoom), floor: 3 });
          expect(iconOf(run)).toBeUndefined();
          useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 3 } as never);
          handle({ ...dungeonState(inRoom), floor: 3 });
          expect(iconOf(run)?.shownAt?.box).toMatchObject({ x: 858, y: 105 });
        });

        it("should follow the corner on resize (D2)", () => {
          const { run, view } = mapped();
          view(1280);
          expect(iconOf(run)?.shownAt?.box).toMatchObject({ x: 1058, y: 105 });
        });
      });

      // FS-1SEF0 §C.14: the overlay stands about the figure the camera follows, each frame
      describe("the map overlay (FS-1SEF0 §C, I-1SEF0-3)", () => {
        type Followed = MappedRun & {
          playerPos?: { x: number; y: number };
          watchedPlayerId?: string;
          otherPlayersPos: { set(id: string, at: { x: number; y: number }): unknown };
          followMapOverlay(): void;
          update(time: number, delta: number): void;
        };

        it("should follow the player's drawn position, and the watched teammate's while spectating, with the party's dots where their figures are drawn", () => {
          const { run, pressTo } = mapped({
            ...inRoom,
            other_players: [ally("a", at(4000, 1200)), ally("dead", placedAt.lever, { current_health: 0 })] as GameState["other_players"],
          });
          const follow = vi.spyOn(Minimap.prototype, "follow");
          const r = run as Followed;
          pressTo("overlay");
          r.playerPos = { x: 2570, y: 3090 };
          r.otherPlayersPos.set("a", { x: 3990, y: 1205 });
          r.followMapOverlay();
          // the drawn positions, never the broadcast's; the dead have no dot
          const drawn = { self: { x: 2570, y: 3090 }, allies: [{ x: 3990, y: 1205 }] };
          expect(follow).toHaveBeenLastCalledWith({ x: 2570, y: 3090 }, drawn);
          // watching, the dots as the watched teammate's own minimap draws them (the owner, 2026-11-14)
          r.watchedPlayerId = "a";
          r.followMapOverlay();
          expect(follow).toHaveBeenLastCalledWith({ x: 3990, y: 1205 }, { self: { x: 3990, y: 1205 }, allies: [{ x: 2570, y: 3090 }] });
        });

        it("should stand it each frame after the figures moved, playing or watching, without redrawing its map", () => {
          const { run, map, pressTo } = mapped();
          const r = run as Followed;
          pressTo("overlay");
          const redraws = map()!.redraws;
          const order: string[] = [];
          const up = { isDown: false };
          const keys = { left: up, right: up, up, down: up };
          Object.assign(run, {
            cursors: keys,
            wasd: keys,
            kit: { follow: vi.fn(), guarding: false },
            updateLighting: vi.fn(),
            updateOtherPlayersSmooth: () => order.push("figures"),
            checkBuildingStatus: vi.fn(),
            sendMovementIntent: vi.fn(),
            updateTargetFrame: vi.fn(),
            followMapOverlay: () => order.push("overlay"),
            playerPos: { x: 4280, y: 1880 },
            targetPosition: { x: 4290, y: 1880 },
          });
          r.update(0, 16);
          // watching: the player hidden, only the others move
          const player = (run as unknown as { player: { visible: boolean } }).player;
          expect(player.visible).toBe(true);
          player.visible = false;
          r.update(16, 16);
          expect(order).toEqual(["figures", "overlay", "figures", "overlay"]);
          expect(map()!.redraws).toBe(redraws);
        });

        // the owner, 2026-11-12: "全畫面地圖人物的座標會一直抖動". Played as the game plays it: the
        // server's broadcasts at 30 Hz walking 200 world px a second, the scene at 60 fps easing
        // the drawn position toward each. The camera's scroll moves the world and the overlay
        // alike, so what the eye sees is where the dot and the map stand against the figure.
        it("should keep the player's dot on the figure and slide the map one way under it as the player walks, and hold both still once stopped (§C.14, §C.19)", () => {
          const { run, map, frame, pressTo } = mapped();
          const r = run as Followed;
          pressTo("overlay");
          const still = { isDown: false };
          const keys = { left: still, right: still, up: still, down: still };
          Object.assign(run, {
            cursors: keys,
            wasd: keys,
            updateLighting: vi.fn(),
            updateOtherPlayersSmooth: vi.fn(),
            checkBuildingStatus: vi.fn(),
            sendMovementIntent: vi.fn(),
            updateTargetFrame: vi.fn(),
          });
          const layers = map() as unknown as { map: Made; dots: Made };
          const figure = (run as unknown as { player: Made }).player;
          const sample = () => {
            const [fx, fy] = figure.last.setPosition as number[];
            const [mx, my] = layers.map.last.setPosition as number[];
            const [dx, dy] = layers.dots.last.setPosition as number[];
            // the self's dot is drawn last, over the allies'
            const [sx, sy] = layers.dots.last.fillCircle as number[];
            // the figure's point as drawn, on whole px (zoom 1, scroll on whole px)
            const f = at(Math.round(fx), Math.round(fy));
            return { dot: at(dx + sx - f.x, dy + sy - f.y), map: at(mx - f.x, my - f.y) };
          };
          const at30Hz = (p: { x: number; y: number }) =>
            frame({ current_player: { ...player("me", "Aldric", 0), position: p } as Party["current_player"] });
          // room 1's west half: the walk east stays in the room
          let server = at(3980, 1880);
          let t = 0;
          const tick = () => r.update((t += 1000 / 60), 1000 / 60);
          // settled on the start
          for (let i = 0; i < 120; i++) {
            if (i % 2 === 0) at30Hz(server);
            tick();
          }
          const walk: ReturnType<typeof sample>[] = [];
          for (let i = 0; i < 60; i++) {
            if (i % 2 === 0) at30Hz((server = at(server.x + 200 / 30, server.y)));
            tick();
            walk.push(sample());
          }
          // the dot lies on the figure, frame after frame, within the overlay's own whole px
          for (const s of walk) {
            expect(Math.abs(s.dot.x)).toBeLessThanOrEqual(0.5);
            expect(Math.abs(s.dot.y)).toBeLessThanOrEqual(0.5);
          }
          // walking +x in the world is right and down on screen: the map slides left and up under
          // the figure, at 1/8 of its pace, and never steps back
          for (let i = 1; i < walk.length; i++) {
            expect(walk[i].map.x).toBeLessThanOrEqual(walk[i - 1].map.x);
            expect(walk[i].map.y).toBeLessThanOrEqual(walk[i - 1].map.y);
          }
          // stopped: the drawn position eases in, and then nothing in the overlay moves
          for (let i = 0; i < 120; i++) {
            if (i % 2 === 0) at30Hz(server);
            tick();
          }
          const settled = sample();
          const [redraws, dotRedraws] = [map()!.redraws, map()!.dotRedraws];
          for (let i = 0; i < 30; i++) {
            if (i % 2 === 0) at30Hz(server);
            tick();
            expect(sample()).toEqual(settled);
          }
          expect([map()!.redraws, map()!.dotRedraws]).toEqual([redraws, dotRedraws]);
        });

        // the owner, 2026-11-12, again: "還是有抖動感 可以加一些平滑效果嗎". At render scale 1.5 and 2
        // the figure is drawn on whole backing px, finer than a logical px, so the overlay must
        // stand on that grid too or the map steps back and forth under the figure.
        it.each([1.5, 2])(
          "should slide the map one way under the walking player and keep the dot on the figure's backing px at render scale %s (§C.14, §C.19)",
          (rs) => {
            const { run, map, frame, pressTo, view } = mapped();
            const r = run as Followed;
            pressTo("overlay");
            viewport.set({ width: 1080, height: 720, renderScale: rs });
            try {
              const still = { isDown: false };
              const keys = { left: still, right: still, up: still, down: still };
              Object.assign(run, {
                cursors: keys,
                wasd: keys,
                updateLighting: vi.fn(),
                updateOtherPlayersSmooth: vi.fn(),
                checkBuildingStatus: vi.fn(),
                sendMovementIntent: vi.fn(),
                updateTargetFrame: vi.fn(),
              });
              const layers = map() as unknown as { map: Made; dots: Made };
              const figure = (run as unknown as { player: Made }).player;
              const backing = (v: number) => Math.round(v * rs) / rs;
              const sample = () => {
                const [fx, fy] = figure.last.setPosition as number[];
                const [mx, my] = layers.map.last.setPosition as number[];
                const [dx, dy] = layers.dots.last.setPosition as number[];
                const [sx, sy] = layers.dots.last.fillCircle as number[];
                // the figure's point as drawn, on whole backing px (fullAuto, scroll on the 1/rs grid)
                const f = at(backing(fx), backing(fy));
                return { dot: at(dx + sx - f.x, dy + sy - f.y), map: at(mx - f.x, my - f.y) };
              };
              const at30Hz = (p: { x: number; y: number }) =>
                frame({ current_player: { ...player("me", "Aldric", 0), position: p } as Party["current_player"] });
              // room 1's west half: the walk east stays in the room
              let server = at(3980, 1880);
              let t = 0;
              const tick = () => r.update((t += 1000 / 60), 1000 / 60);
              for (let i = 0; i < 120; i++) {
                if (i % 2 === 0) at30Hz(server);
                tick();
              }
              const walk: ReturnType<typeof sample>[] = [];
              for (let i = 0; i < 90; i++) {
                if (i % 2 === 0) at30Hz((server = at(server.x + 200 / 30, server.y)));
                tick();
                walk.push(sample());
              }
              for (const s of walk) {
                expect(s.dot.x).toBeCloseTo(0, 9);
                expect(s.dot.y).toBeCloseTo(0, 9);
              }
              for (let i = 1; i < walk.length; i++) {
                expect(walk[i].map.x).toBeLessThanOrEqual(walk[i - 1].map.x + 1e-9);
                expect(walk[i].map.y).toBeLessThanOrEqual(walk[i - 1].map.y + 1e-9);
              }
            } finally {
              view(1080);
            }
          },
        );

        // the owner, 2026-11-12: "最大的全螢幕還是會有震動感", "人在左右移動時地圖點位不是直線 會鋸齒狀上下移動".
        // The figure dances a backing px each way on screen against the camera's floored scroll;
        // the map, held against the screen from each frame's scroll, does not dance with it.
        it("should hold the map against the screen from the main camera's frames, the dots left on the figure, and stop hearing them with the floor's minimap (§C.19)", () => {
          const { run, map, pressTo } = mapped();
          const r = run as Followed;
          pressTo("overlay");
          r.playerPos = { x: 2570, y: 3090 };
          r.followMapOverlay();
          const layers = map() as unknown as { map: Made; dots: Made };
          const stood = layers.map.last.setPosition as number[];
          const cam = (run as unknown as { cameras: { main: { frames?: Set<(scroll: { x: number; y: number }) => void> } } }).cameras.main;
          const frameAt = (x: number, y: number) => {
            for (const listener of [...(cam.frames ?? [])]) listener({ x, y });
          };
          frameAt(1000, 800);
          expect(layers.map.last.setPosition).toEqual(stood);
          // the camera a px on: on screen the figure's point steps a px back; the map holds there
          r.followMapOverlay();
          frameAt(1001, 800);
          expect(layers.map.last.setPosition).toEqual([stood[0] + 1, stood[1]]);
          expect(layers.dots.last.setPosition).toEqual(stood);
          map()!.destroy();
          expect(cam.frames?.size).toBe(0);
        });
      });

      it("should rebuild it on a floor change, the new floor unexplored, and take the old one down", () => {
        const { map, handle } = mapped({ current_player: { ...player("me", "Aldric", 0), position: placedAt.stairs } as Party["current_player"] });
        const first = map()!;
        const destroyed = vi.spyOn(first, "destroy");
        const stairsRoom = regionAt(grid, placedAt.stairs);
        expect(first.content.regions.map((r) => r.id)).toContain(stairsRoom);
        useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 2 } as never);
        handle({ ...dungeonState(inRoom), floor: 2 });
        expect(destroyed).toHaveBeenCalled();
        expect(map()!.content.regions.map((r) => [r.id, r.state])).toEqual(roomOnly);
        expect(roomOnly).toContainEqual([ROOM, "visible"]);
      });

      it("should show explored and visible regions and the party's living dots, nothing for monsters or containers", () => {
        const { map, frame, dots } = mapped();
        const monsters = [monster("m_room", 0), monster("m_far", 0)].map((m, i) => ({ ...m, position: [at(4120, 1850), placedAt.door][i] }));
        frame(
          {
            ...inRoom,
            other_players: [
              ally("near", at(4320, 1900)),
              ally("dead", placedAt.lever, { current_health: 0 }),
              ally("gone", placedAt.lever, { escape: true }),
            ] as GameState["other_players"],
          },
          { monsters },
        );
        expect(map()!.content.regions.map((r) => [r.id, r.state])).toEqual(roomOnly);
        // the chest in room 1 and the monsters are never on it; the lever's region the dead and the
        // escaped stand in is not uncovered
        expect(map()!.content.fixtures).toEqual([]);
        expect(dots).toHaveBeenLastCalledWith({ self: at(4280, 1880), allies: [at(4320, 1900)] });
      });

      it("should mark the switch, escape door and stairs once a member has uncovered their regions", () => {
        const { map, frame } = mapped();
        frame({ ...inRoom, other_players: [ally("a", placedAt.door), ally("b", placedAt.stairs)] as GameState["other_players"] });
        expect(map()!.content.fixtures).toEqual([
          { kind: "escape-door", at: placedAt.door },
          { kind: "stairs", at: placedAt.stairs },
        ]);
        // they walk on: the regions stay explored, the marks stay
        frame(inRoom);
        expect(map()!.content.fixtures.map((f) => f.kind)).toEqual(["escape-door", "stairs"]);
        frame({ ...inRoom, other_players: [ally("c", placedAt.lever)] as GameState["other_players"] });
        expect(map()!.content.fixtures.map((f) => f.kind)).toEqual(["switch", "escape-door", "stairs"]);
      });

      it("should keep it for a dead player watching the party, the living's dots only", () => {
        const { map, frame, dots } = mapped();
        frame({
          current_player: { ...player("me", "Aldric", 0, { current_health: 0 }), position: at(4280, 1880) } as Party["current_player"],
          other_players: [ally("a", placedAt.stairs)] as GameState["other_players"],
        });
        expect(map()).toBeDefined();
        expect(map()!.mode).toBe("normal");
        expect(dots).toHaveBeenLastCalledWith({ self: undefined, allies: [placedAt.stairs] });
        expect(map()!.content.regions.map((r) => r.id)).toContain(regionAt(grid, placedAt.stairs));
      });

      // the owner, 「觀看時應該會跟被觀看的人一模壹樣的視野狀態」 (2026-11-14): the regions are the party's already; the
      // dots as the watched teammate's own minimap draws them, theirs the self's and the rest allies
      it("should draw the watched teammate's dot as the self's while watching, the other living as allies", () => {
        const { run, frame, dots } = mapped();
        Object.assign(run, { watchedPlayerId: "a" });
        frame({
          current_player: { ...player("me", "Aldric", 0, { current_health: 0 }), position: at(4280, 1880) } as Party["current_player"],
          other_players: [ally("a", placedAt.stairs), ally("b", placedAt.door)] as GameState["other_players"],
        });
        expect(dots).toHaveBeenLastCalledWith({ self: placedAt.stairs, allies: [placedAt.door] });
      });

      it("should redraw its map only when a region's state changes, as a member walks across the floor", () => {
        const { map, frame } = mapped();
        const once = map()!.redraws;
        for (const dx of [0, 40, 80]) frame({ current_player: { ...player("me", "Aldric", 0), position: at(4280 + dx, 1880) } as Party["current_player"] });
        expect(map()!.redraws).toBe(once);
        frame({ current_player: { ...player("me", "Aldric", 0), position: placedAt.stairs } as Party["current_player"] });
        expect(map()!.redraws).toBe(once + 1);
      });

      it("should take it down on a climb to a floor of buildings, and build none on floors 2 and 3", () => {
        const { run, map, handle } = mapped();
        const first = map()!;
        const destroyed = vi.spyOn(first, "destroy");
        const shown = vi.spyOn(Minimap.prototype, "show");
        for (const floor of [2, 3]) {
          useGameStore.getState().receiveFloorMap(mapOf(floorState(floor)));
          handle(bare(floorState(floor)));
          expect(run.dungeon).toBeUndefined();
          // no minimap: the column closes up to its top, the floor line back (FS-56CKV §B.11; §Change: Map name, E9)
          expect((run.floorText as Made).shown).toBe(true);
          expect(standing(run.floorText)).toEqual([1070, 10]);
          expect(standing(run.escapedCountText)).toEqual([1070, 35]);
        }
        expect(destroyed).toHaveBeenCalled();
        expect(shown).not.toHaveBeenCalled();
      });

      // FS-56CKV §Change: Map name (owner 2026-11-12: "小地圖右上角顯示目前地圖的名字"): the floor's name
      // with its minimap; inside the enlarged map too (§Change: The enlarged map keeps its labels
      // inside, owner 2026-11-14: 「小地圖1.5倍時 區域名稱跟座標也要放在地圖內跟1倍時的位置一樣」)
      describe("the map name (FS-56CKV §Change: Map name; I-56CKV-9)", () => {
        type NameRun = MappedRun & { updateTargetFrame(deltaMs: number): void; targetFrame?: unknown };
        type Name = { words: string; shown: boolean };
        const nameOf = (run: MappedRun) => (run.dungeon as { mapName?: Name } | undefined)?.mapName;
        /** The name's text as the stage made it: 11 px, on its plate; the latest of its words. */
        const textOf = (made: Made[], words: string) =>
          made.filter((m) => m.kind === "text" && m.args[2] === words && (m.args[3] as { fontSize?: string })?.fontSize === "11px").at(-1);
        /** The text 80 × 17, as Phaser would measure it, and the corner laid out again. */
        const measured = (run: MappedRun, text: Made | undefined) => {
          Object.assign(text!, { width: 80, height: 17 });
          run.relayoutHud();
        };

        it("should name floor 1 \"The First Floor\" with its minimap, in the name's look, over the map (E1, E2, E6)", () => {
          const { run, stage } = mapped();
          expect(nameOf(run)?.words).toBe("The First Floor");
          const text = textOf(stage.made, "The First Floor");
          expect(text).toBeDefined();
          expect(text!.args[3]).toMatchObject({ fontFamily: CANVAS_FONT.body, fontSize: "11px", color: toCss(palette.hudText), letterSpacing: 1 });
          expect(text!.depth).toBeGreaterThan(await_minimap.MINIMAP.depth);
        });

        it.each([
          [1080, "normal", [1066 - 80, 14]],
          [1280, "normal", [1266 - 80, 14]],
          [1080, "enlarged", [1066 - 80, 14]],
          [1280, "enlarged", [1266 - 80, 14]],
          [1080, "overlay", [1055 - 80, 6]],
          [1280, "overlay", [1255 - 80, 6]],
        ])("should stand it at width %i in the %s mode: inside the map's top-right, normal or enlarged, left of the icon in the corner (E3, E5, F1; FS-T3DWX G4)", (width, mode, at) => {
          const { run, stage, view, pressTo } = mapped();
          measured(run, textOf(stage.made, "The First Floor"));
          view(width);
          pressTo(mode);
          expect(textOf(stage.made, "The First Floor")!.last.setPosition).toEqual(at);
          expect(nameOf(run)?.shown).toBe(true);
        });

        it("should name the floor anew on a climb, and none on a floor without a minimap (E6)", () => {
          const { run, stage, handle } = mapped();
          const first = textOf(stage.made, "The First Floor")!;
          useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
          handle(bare(floorState(2)));
          expect(first.destroyed).toBe(true);
          expect(nameOf(run)).toBeUndefined();
          useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 3 } as never);
          handle({ ...dungeonState(inRoom), floor: 3 });
          expect(nameOf(run)?.words).toBe("The Third Floor");
          expect(textOf(stage.made, "The Third Floor")?.destroyed).toBe(false);
        });

        // E9 as amended 2026-11-12 (owner: "地城樓層顯示兩次 拿掉下面的"): the floor said once, by the name
        it.each([
          [1080, "normal", 124],
          [1280, "normal", 124],
          [1080, "enlarged", 178],
          [1280, "enlarged", 178],
          [1080, "overlay", 31],
          [1280, "overlay", 31],
        ])("should drop the floor line while the name names floor 1, at width %i in the %s mode, the escaped count at y %i in its place (E9)", (width, mode, y) => {
          const { run, view, pressTo } = mapped();
          view(width);
          pressTo(mode);
          expect(nameOf(run)?.words).toBe("The First Floor");
          expect((run.floorText as Made).args[2]).toBe("Floor 1");
          expect((run.floorText as Made).shown).toBe(false);
          expect(standing(run.escapedCountText)).toEqual([width - 10, y]);
        });

        it("should bring the floor line back once the name goes, on a floor of buildings, and drop it again with the next floor's name (E9)", () => {
          const { run, handle } = mapped();
          useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
          handle(bare(floorState(2)));
          expect(nameOf(run)).toBeUndefined();
          expect((run.floorText as Made).shown).toBe(true);
          expect((run.floorText as Made).args[2]).toBe("Floor 2");
          useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 3 } as never);
          handle({ ...dungeonState(inRoom), floor: 3 });
          expect(nameOf(run)?.words).toBe("The Third Floor");
          expect((run.floorText as Made).shown).toBe(false);
        });

        it("should keep it shown inside the enlarged map at 1080 while the boss frame stands, and hide it only while a frame meets it (E7, F4)", () => {
          const { run, stage, pressTo } = mapped();
          measured(run, textOf(stage.made, "The First Floor"));
          pressTo("enlarged");
          const frame = { rect: null as object | null, update: vi.fn(), relayout: vi.fn(), texts: () => [], shownRect: () => frame.rect };
          (run as NameRun).targetFrame = frame;
          // the boss frame at 1080, x 351–729: short of the map, which starts at x 746
          frame.rect = { x: 351, y: 10, width: 378, height: 54 };
          (run as NameRun).updateTargetFrame(16);
          expect(nameOf(run)?.shown).toBe(true);
          // the rule stands: a frame laid over the name (x 986–1066, y 14–31) hides it
          frame.rect = { x: 1000, y: 10, width: 50, height: 54 };
          (run as NameRun).updateTargetFrame(16);
          expect(nameOf(run)?.shown).toBe(false);
          frame.rect = null;
          (run as NameRun).updateTargetFrame(16);
          expect(nameOf(run)?.shown).toBe(true);
        });
      });

      describe("the dev position readout (FS-56CKV §C, I-56CKV-3)", () => {
        type ReadoutRun = MappedRun & { updateTargetFrame(deltaMs: number): void; targetFrame?: unknown };
        /** Where the readout was last stood, and on which corner of its box. */
        const readoutAt = (run: MappedRun) => {
          const { last } = run.positionReadout as Made;
          return { at: last.setPosition, origin: last.setOrigin };
        };
        /** The readout 90 × 19, the name 80 × 17, as Phaser would measure them, and the corner laid out again. */
        const measured = (run: MappedRun, stage: { made: Made[] }) => {
          Object.assign(run.positionReadout!, { width: 90, height: 19 });
          const name = stage.made.filter((m) => m.kind === "text" && (m.args[3] as { fontSize?: string })?.fontSize === "11px").at(-1);
          if (name) Object.assign(name, { width: 80, height: 17 });
          run.relayoutHud();
        };
        /**
         * Under the column: `lines` 21 px lines 4 px apart from `top`, then 4 px. The column starts at
         * y 10 with no map, and at y 31 under the overlay's icon row (FS-T3DWX G4, G5).
         */
        const underColumn = (right: number, lines = 2, top = 10) => ({ at: [right, top + lines * 21 + (lines - 1) * 4 + 4], origin: [1, 0] });
        // FS-56CKV §Change: Map name, E8 as amended 2026-11-12 (owner: "有小地圖時 x y座標不是要顯示在
        // 地圖框框內右下角嗎"): inside the map's bottom-right, 4 px in; the enlarged map's too, 162 tall
        // (§Change: The enlarged map keeps its labels inside, F2)
        const inMap = (right: number, height = 108) => ({ at: [right - 4, 10 + height - 4], origin: [1, 1] });

        afterEach(() => {
          vi.unstubAllEnvs();
        });

        it("should draw it at 10 px in vellum on the map name's plate, at full ink, over the minimap's depth (§C.16; §Change: Map name, E8)", () => {
          const { run } = mapped();
          const readout = run.positionReadout as Made;
          expect(readout.args[3]).toEqual({
            fontFamily: CANVAS_FONT.body,
            fontSize: "10px",
            color: toCss(palette.hudText),
            backgroundColor: rgba(palette.hudPanel, 0.75),
            padding: { x: 4, y: 2 },
          });
          expect(readout.last.setAlpha).toBeUndefined();
          expect(readout.last.setScrollFactor).toEqual([0]);
          expect(readout.depth).toBeGreaterThan(await_minimap.MINIMAP.depth);
        });

        it("should stand it inside the normal map's bottom-right, 4 px in, and follow the map on resize, re-crispened (§C.19; §Change: Map name, E8)", () => {
          const { run, stage, view } = mapped();
          measured(run, stage);
          expect(readoutAt(run)).toEqual(inMap(1070));
          expect(inMap(1070).at).toEqual([1066, 114]);
          viewport.set({ width: 1280, height: 720, renderScale: 2 });
          run.relayoutHud();
          expect(readoutAt(run)).toEqual(inMap(1270));
          expect((run.positionReadout as Made).last.setResolution).toEqual([2]);
          view(1080);
        });

        it.each([1080, 1280])("should keep it clear of the map mode icon and the name inside the normal map at width %i (E8)", (width) => {
          const { run, stage, view } = mapped();
          measured(run, stage);
          view(width);
          const [x, y] = readoutAt(run).at as number[];
          const box = { x: x - 90, y: y - 19, width: 90, height: 19 };
          const overlaps = (a: typeof box, b: typeof box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          const dungeon = run.dungeon as { modeIcon?: { place?: unknown }; mapName?: { box: typeof box | null } };
          expect(overlaps(box, dungeon.mapName!.box!)).toBe(false);
          const map = minimapRect(width - 10, 10);
          const icon = { x: map.x + 4 - 2, y: map.y + map.height - 4 - 9 - 2, width: 13, height: 13 };
          expect(overlaps(box, icon)).toBe(false);
        });

        it("should never stand it at the top left, in a run on a floor with a minimap or without one", () => {
          const { run, handle } = mapped();
          const left = () => (readoutAt(run).at![0] as number) < viewport.width / 2;
          expect(left()).toBe(false);
          useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
          handle(bare(floorState(2)));
          expect(left()).toBe(false);
        });

        it("should stand it 4 px under the column's last line, right-aligned, in the overlay mode, and back in the map on M (§C.18; FS-1SEF0 §D.22; §Change: Map name, E8)", () => {
          const { run, stage, keys, pressTo } = mapped();
          measured(run, stage);
          pressTo("overlay");
          // the escaped count alone under the icon's row, the floor line dropped (E9; FS-T3DWX G4)
          expect(readoutAt(run)).toEqual(underColumn(1070, 1, 31));
          keys["keydown-M"]();
          expect(readoutAt(run)).toEqual(inMap(1070));
        });

        it.each([1080, 1280])("should stand it inside the enlarged map's bottom-right, 4 px in, as on the normal map, at width %i (F2)", (width) => {
          const { run, stage, view, pressTo } = mapped();
          measured(run, stage);
          view(width);
          pressTo("enlarged");
          expect(readoutAt(run)).toEqual(inMap(width - 10, 162));
          expect(inMap(width - 10, 162).at).toEqual([width - 14, 168]);
          expect((run.positionReadout as Made).args[3]).toMatchObject({ fontSize: "10px" });
          pressTo("normal");
          expect(readoutAt(run)).toEqual(inMap(width - 10));
        });

        it("should keep it shown inside the enlarged map at 1080 while the boss frame stands, and hide it only while a frame meets it (F4)", () => {
          const { run, stage, pressTo } = mapped();
          measured(run, stage);
          pressTo("enlarged");
          const frame = { rect: null as object | null, update: vi.fn(), relayout: vi.fn(), texts: () => [], shownRect: () => frame.rect };
          (run as ReadoutRun).targetFrame = frame;
          frame.rect = { x: 351, y: 10, width: 378, height: 54 };
          (run as ReadoutRun).updateTargetFrame(16);
          // never hidden (the stand-in reads undefined until setVisible is called)
          expect((run.positionReadout as Made).last.setVisible?.[0]).not.toBe(false);
          // the rule stands: over the readout (x 976–1066, y 149–168) but short of the name (y 14–31)
          frame.rect = { x: 1000, y: 140, width: 50, height: 20 };
          (run as ReadoutRun).updateTargetFrame(16);
          expect((run.positionReadout as Made).shown).toBe(false);
          expect((run.dungeon as { mapName?: { shown: boolean } }).mapName?.shown).toBe(true);
          frame.rect = null;
          (run as ReadoutRun).updateTargetFrame(16);
          expect((run.positionReadout as Made).shown).toBe(true);
        });

        it("should follow the column as the floor indicator's label goes and comes, with no minimap shown (§C.18)", () => {
          const { run, handle } = mapped();
          useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
          handle(bare(floorState(2)));
          run.updateFloorIndicator({ floor: undefined });
          expect(readoutAt(run)).toEqual(underColumn(1070, 1));
          run.updateFloorIndicator({ floor: 2 });
          expect(readoutAt(run)).toEqual(underColumn(1070));
        });

        it("should stand it under the column on a floor without regions, on a dungeon floor before its map, and in the map once it is built (§C.18, §C.19; §Change: Map name, E8)", () => {
          const { run, stage, handle } = mapped();
          useGameStore.getState().receiveFloorMap(mapOf(floorState(2)));
          handle(bare(floorState(2)));
          expect(run.dungeon).toBeUndefined();
          expect(readoutAt(run)).toEqual(underColumn(1070));
          // floor 3 laid out as floor 1: before its map, then with it
          handle({ ...dungeonState(inRoom), floor: 3 });
          expect(readoutAt(run)).toEqual(underColumn(1070));
          useGameStore.getState().receiveFloorMap({ ...dungeonMap, floor: 3 } as never);
          handle({ ...dungeonState(inRoom), floor: 3 });
          expect(run.dungeon?.minimap).toBeDefined();
          measured(run, stage);
          expect(readoutAt(run)).toEqual(inMap(1070));
        });

        it("should refresh it every frame without redrawing either of the minimap's layers (§C.16, FS-SRA9J §E.23)", () => {
          const { run, map } = mapped();
          const [redraws, dotRedraws] = [map()!.redraws, map()!.dotRedraws];
          Object.assign(run, { player: (run as { player?: object }).player ?? {} });
          for (const x of [200, 240, 280]) {
            Object.assign(run, { playerPos: { x, y: 180 } });
            (run as unknown as { events: Emitter }).events.emit("update");
            expect((run.positionReadout as Made).args[2]).toBe(`X: ${x} Y: 180`);
          }
          expect([map()!.redraws, map()!.dotRedraws]).toEqual([redraws, dotRedraws]);
        });

        it("should make none in a production build, and the column lays out without it (§C.19)", () => {
          vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", "false");
          const { run, stage, pressTo } = mapped();
          expect(run.positionReadout).toBeUndefined();
          expect(stage.made.some((m) => m.kind === "text" && (m.args[3] as { fontSize?: string })?.fontSize === "10px")).toBe(false);
          pressTo("overlay");
          expect(standing(run.escapedCountText)).toEqual([1070, 31]);
        });
      });

    });
  });

  // FS-5FZ4J §J R51–R53, R56 (I-5FZ4J-9): a sealed floor's pieces, gate and pits, E at them, and its lines
  describe("a sealed floor (FS-5FZ4J §J)", () => {
    interface SealedRun {
      checkBuildingStatus(): void;
      showNotification(text: string, backing: number): void;
      bindRunInput(): void;
      seal: { placed(): { sprite: Made; pos: { x: number; y: number } }[] };
      ui: { hud(message: unknown): void };
    }
    /** This client's player in room 1, at (4280, 1880). */
    const ME = at(4280, 1880);
    const inRoom = { current_player: { ...player("me", "Aldric", 0), position: ME } } as Partial<Party>;
    const cellAt = (x: number, y: number) => at((x + 0.5) * 80, (y + 0.5) * 80);
    const lever = (active = false) => ({ entity_id: "lever-1", kind: "lever", position: ME, cell: { x: 53, y: 23 }, glyph: "crow", active });
    /** A mural far off, by the stairs, in a region the party has not seen. */
    const mural = { entity_id: "mural-1", kind: "mural", position: at(1000, 1200), cell: { x: 12, y: 15 }, active: false };
    const gate = { entity_id: "gate-1", kind: "gate", cells: [{ x: 30, y: 37 }], open: false };
    const sealOf = (over: Partial<NonNullable<GameState["seal"]>> = {}) => ({ kind: "lever_order", stage: 1, stages: 1, broken: false, ...over });
    const sealed = (over: Partial<GameState> = {}): Partial<GameState> => ({
      seal: sealOf(),
      seal_pieces: [lever(), mural],
      barriers: [gate],
      ...over,
    });
    const sealedStage = () => {
      const staged = dungeonStage(inRoom, sealed());
      const run = staged.run as unknown as SealedRun;
      const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
      const next = (over: Partial<GameState> = {}) => staged.handle({ ...dungeonState(inRoom), ...sealed(over) });
      return { ...staged, run, notified, next };
    };

    it("should draw each piece and gate cell from the sealed sheets in the frame its state names", () => {
      const { stage, next } = sealedStage();
      expect(drawn(stage.made, "seal_lever/up/")).toHaveLength(1);
      expect(drawn(stage.made, "seal_lever/glyph_crow/")).toHaveLength(1);
      expect(drawn(stage.made, "mural/default/")).toHaveLength(1);
      const [shut] = drawn(stage.made, "gate_");
      expect(String(shut.args[3])).toMatch(/^gate_[xy]\/shut\//);
      const { x, y } = await_iso.worldToScreen(cellAt(30, 37).x, cellAt(30, 37).y);
      expect(shut.args.slice(0, 2)).toEqual([x, y]);
      next({ seal_pieces: [lever(true), mural], barriers: [{ ...gate, open: true }] });
      const [pulled] = drawn(stage.made, "seal_lever/up/");
      expect(String(pulled.last.setTexture?.[1])).toMatch(/^seal_lever\/down\//);
      expect(String(shut.last.setTexture?.[1])).toMatch(/^gate_[xy]\/open\//);
    });

    it("should hide a piece standing in an unexplored region, and show the one where the player stands", () => {
      const { run } = sealedStage();
      run.checkBuildingStatus();
      const shown = run.seal.placed().map(({ sprite, pos }) => [pos.x === ME.x ? "here" : pos.x === 1000 ? "far" : "gate", shownNow(sprite)]);
      expect(shown).toContainEqual(["here", true]);
      expect(shown).toContainEqual(["far", false]);
    });

    it("should send one interact for the lever E reaches", () => {
      const { run } = sealedStage();
      const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
      const keyHandlers: Record<string, () => void> = {};
      Object.assign(run, {
        input: { setDefaultCursor: vi.fn(), keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) }, on: vi.fn() },
        playerPos: ME,
      });
      run.bindRunInput();
      keyHandlers["keydown-E"]();
      const interacts = sent.mock.calls.filter(([a]) => a === ActionType.Interact);
      sent.mockRestore();
      expect(interacts).toEqual([[ActionType.Interact, { entity_id: "lever-1" }]]);
    });

    // the review's fix round 1: E reaches the nearest of a seal piece, a respite and a chest
    it("should send the interact for the nearest in reach of a seal piece, the hallowed altar and a chest", () => {
      const pressAt = (playerPos: { x: number; y: number }) => {
        const staged = dungeonStage(inRoom, sealed({ containers: [chestAt("chest-1", at(ME.x + 50, ME.y))], hallowed_altar: { entity_id: "altar-1", position: at(ME.x, ME.y + 50), prayed: false } }));
        const run = staged.run as unknown as SealedRun;
        const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
        const keyHandlers: Record<string, () => void> = {};
        Object.assign(run, {
          input: { setDefaultCursor: vi.fn(), keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) }, on: vi.fn() },
          playerPos,
        });
        run.bindRunInput();
        keyHandlers["keydown-E"]();
        const interacts = sent.mock.calls.filter(([a]) => a === ActionType.Interact).map(([, p]) => (p as { entity_id: string }).entity_id);
        sent.mockRestore();
        return interacts;
      };
      // the lever stands where ME is, the chest 50 px east, the altar 50 px south
      expect(pressAt(at(ME.x + 40, ME.y))).toEqual(["chest-1"]);
      expect(pressAt(at(ME.x, ME.y + 40))).toEqual(["altar-1"]);
      expect(pressAt(at(ME.x + 5, ME.y + 5))).toEqual(["lever-1"]);
    });

    // the review's fix round 1: floor 1's seal was never said
    it("should name the floor's seal on an arrival's first broadcast, and nothing on a return's (R53)", () => {
      const said = (arrival: boolean) => {
        const lines: unknown[][] = [];
        dungeonStage(inRoom, sealed({ seal: sealOf({ kind: "weighted_plates" }) }), {
          arrival,
          spy: (run) => void vi.spyOn(run as SealedRun, "showNotification").mockImplementation((...a) => void lines.push(a)),
        });
        return lines;
      };
      expect(said(true)).toEqual([["The stairs are sealed: Weighted Plates.", palette.hudPanel]]);
      expect(said(false)).toEqual([]);
    });

    // the review's fix round 1: one owner of the floor's lights, and no flame held for a piece gone
    it("should light a lit seal brazier among the floor's lights as a brazier, and forget its flame once the piece goes", () => {
      const brazier = (active: boolean) => ({ entity_id: "brazier-1", kind: "brazier", position: ME, cell: { x: 53, y: 23 }, active });
      const { run, next } = sealedStage();
      const floor = run as unknown as { dungeon: { lights: { all: readonly { kind: string; light: { at?: { x: number } } }[] } }; sealLights: Map<unknown, unknown> };
      next({ seal_pieces: [brazier(true)] });
      expect(floor.dungeon.lights.all.filter((l) => l.light.at?.x === ME.x).map((l) => l.kind)).toEqual(["brazier"]);
      expect(floor.sealLights.size).toBe(1);
      next({ seal_pieces: [] });
      expect(floor.dungeon.lights.all.filter((l) => l.light.at?.x === ME.x)).toEqual([]);
      expect(floor.sealLights.size).toBe(0);
    });

    it("should say the seal breaks on the broadcast it breaks, and nothing on the first", () => {
      const { notified, next } = sealedStage();
      expect(notified).not.toHaveBeenCalled();
      next({ seal: sealOf({ broken: true }) });
      next({ seal: sealOf({ broken: true }) });
      expect(notified.mock.calls).toEqual([["The seal breaks.", palette.safe]]);
    });

    it("should hand the HUD the Braziers window's countdown while it runs, and none once it ends", () => {
      const { run, next } = sealedStage();
      const hud = vi.spyOn(run.ui, "hud");
      next({ seal: sealOf({ kind: "braziers", window_ends_in: 10 }) });
      next({ seal: sealOf({ kind: "braziers" }) });
      const windows = hud.mock.calls.map(([m]) => m as { kind: string; window?: unknown }).filter((m) => m.kind === "window");
      expect(windows.map((m) => m.window)).toEqual([{ seconds: 10, fraction: 1 }, null]);
    });
  });

  // FS-5FZ4J §J R51, R52, R54, R56 (I-5FZ4J-10): traps, a secret door and its hidden room, the floor map re-sent
  describe("traps and a secret door (FS-5FZ4J §J)", () => {
    type Region = (typeof dungeonMap.regions)[number];
    interface HiddenRun {
      bindRunInput(): void;
      showNotification(text: string, backing: number): void;
      dungeon: { grid: InstanceType<typeof RegionGrid>; seen: { state(id: number): string }; minimap?: unknown };
      timedOpen?: { label?: Made };
    }
    /** This client's player in room 1, at (4280, 1880). */
    const ME = at(4280, 1880);
    const inRoom = (p = ME) => ({ current_player: { ...player("me", "Aldric", 0), position: p } }) as Partial<Party>;
    /** The hidden room: room 16, and the door the corridor cells next to it (4-adjacent), as the server's barrier. */
    const HIDDEN = 16;
    const cellsOf = (r: Region) => r.cells.flatMap((c) => Array.from({ length: c.w * c.h }, (_, i) => ({ x: c.x + (i % c.w), y: c.y + Math.floor(i / c.w) })));
    const room = dungeonMap.regions.find((r) => r.id === HIDDEN)!;
    const roomCells = new Set(cellsOf(room).map((c) => `${c.x},${c.y}`));
    const doorCells = dungeonMap.regions
      .filter((r) => r.kind === "corridor")
      .flatMap(cellsOf)
      .filter((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roomCells.has(`${c.x + dx},${c.y + dy}`)));
    const doorKeys = new Set(doorCells.map((c) => `${c.x},${c.y}`));
    /** The floor's map with the door shut: the room left out, the door's cells cut from their corridor (FS-5FZ4J §F R37). */
    const shutMap = {
      ...dungeonMap,
      regions: dungeonMap.regions
        .filter((r) => r.id !== HIDDEN)
        .map((r) => (r.kind !== "corridor" ? r : { ...r, cells: cellsOf(r).filter((c) => !doorKeys.has(`${c.x},${c.y}`)).map((c) => ({ ...c, w: 1, h: 1 })) })),
    };
    const door = (open = false) => ({ entity_id: "door-1", kind: "secret_door", cells: doorCells, open });
    const trap = (over: Record<string, unknown> = {}) => ({ entity_id: "trap-1", kind: "spike_plate", cell: { x: 53, y: 23 }, armed: true, revealed: false, ...over });
    const hiddenStage = (party = inRoom()) => {
      const staged = dungeonStage(party, { barriers: [door()] }, { map: shutMap });
      const run = staged.run as unknown as HiddenRun;
      const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
      return { ...staged, run, notified };
    };

    it("should find the hidden room's door: corridor cells beside the room", () => {
      expect(doorCells.length).toBeGreaterThan(0);
    });

    it("should draw a listed trap faint, and play its spring once when armed falls", () => {
      const { stage, handle } = hiddenStage();
      handle({ ...dungeonState(inRoom()), traps: [trap()] } as GameState);
      const [drawnTrap] = drawn(stage.made, "trap_spike_plate/armed/");
      expect(drawnTrap.last.setAlpha?.[0]).toBe(TRAP_FAINT);
      handle({ ...dungeonState(inRoom()), traps: [trap({ armed: false })] } as GameState);
      expect(String(drawnTrap.last.setTexture?.[1])).toMatch(/^trap_spike_plate\/sprung\//);
      expect(drawnTrap.last.setAlpha?.[0]).toBe(1);
      handle({ ...dungeonState(inRoom()), traps: [] } as GameState);
      expect(drawnTrap.destroyed).toBe(true);
    });

    it("should draw the shut door's cell as wall with the cracks laid over it, and none where the map is whole", () => {
      const { stage } = hiddenStage();
      const cracks = drawn(stage.made, "secret_cracks/");
      expect(cracks.length).toBeGreaterThan(0);
      for (const c of cracks) {
        const w = await_iso.screenToWorld(c.args[0] as number, c.args[1] as number);
        expect(doorKeys.has(`${Math.floor(w.x / 80)},${Math.floor(w.y / 80)}`)).toBe(true);
      }
    });

    it("should send one interact for the secret door E reaches, the Search (R52)", () => {
      const { run } = hiddenStage();
      const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
      const keyHandlers: Record<string, () => void> = {};
      // on a corridor cell beside the door's first cell
      const beside = doorCells
        .flatMap((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })))
        .find((c) => run.dungeon.grid.walkable(c.x, c.y))!;
      Object.assign(run, {
        input: { setDefaultCursor: vi.fn(), keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) }, on: vi.fn() },
        playerPos: at((beside.x + 0.5) * 80, (beside.y + 0.5) * 80),
      });
      run.bindRunInput();
      keyHandlers["keydown-E"]();
      const interacts = sent.mock.calls.filter(([a]) => a === ActionType.Interact);
      sent.mockRestore();
      expect(interacts).toEqual([[ActionType.Interact, { entity_id: "door-1" }]]);
    });

    it("should show the search's progress on the open bar over the cracks, labelled Searching… (R54)", () => {
      const { run, stage, handle } = hiddenStage();
      const me = { ...player("me", "Aldric", 0), position: ME, timed_open: { entity_id: "door-1", target_kind: "search", elapsed: 1, duration: 2 } };
      handle({ ...dungeonState({ current_player: me } as Partial<Party>), barriers: [door()] } as GameState);
      const bar = stage.made.find((m) => m.name === "open-bar" && !m.destroyed);
      expect(bar).toBeDefined();
      expect(run.timedOpen?.label?.args[2]).toBe("Searching…");
      // the door opens: the bar and its label go
      handle({ ...dungeonState(inRoom()), barriers: [door(true)] } as GameState);
      expect(bar!.destroyed).toBe(true);
      expect(stage.made.filter((m) => m.name === "open-bar-label").every((m) => m.destroyed)).toBe(true);
    });

    it("should draw the floor again from its map re-sent for the same floor: the room in, the door a doorway, what was explored kept (R56)", () => {
      // the player stands in room 1, then in room 9: room 1 explored
      const elsewhere = inRoom(at(31 * 80 + 40, 33 * 80 + 40));
      const { run, stage, handle } = hiddenStage();
      handle({ ...dungeonState(elsewhere), barriers: [door()] } as GameState);
      expect(run.dungeon.seen.state(1)).toBe("explored");
      const before = drawn(stage.made, "tower_wall_");
      const minimap = run.dungeon.minimap;
      const [roomCell] = cellsOf(room);
      expect(run.dungeon.grid.walkable(roomCell.x, roomCell.y)).toBe(false);
      // the door opened: the server sends the map whole again, then the door open
      useGameStore.getState().receiveFloorMap({ ...dungeonMap } as never);
      handle({ ...dungeonState(elsewhere), barriers: [door(true)] } as GameState);
      expect(run.dungeon.grid.walkable(roomCell.x, roomCell.y)).toBe(true);
      expect(doorCells.every((c) => run.dungeon.grid.walkable(c.x, c.y))).toBe(true);
      expect(before.every((m) => m.destroyed)).toBe(true);
      expect(drawn(stage.made, "tower_wall_").length).toBeGreaterThan(1000);
      expect(run.dungeon.minimap).toBeDefined();
      expect(run.dungeon.minimap).not.toBe(minimap);
      expect(run.dungeon.seen.state(1)).toBe("explored");
      expect(run.dungeon.seen.state(9)).toBe("visible");
      expect(run.dungeon.seen.state(HIDDEN)).toBe("unexplored");
      expect(drawn(stage.made, "secret_cracks/")).toEqual([]);
    });

    // the review's fix round 1: a redraw makes the chunks again, so whatever registers in them must be laid again
    it("should register in the redrawn floor's chunks from every site that registered in the first build's (R56)", () => {
      /** The scene's own code that registered a part: the innermost of the known sites on the stack. */
      const SITES = ["createGround", "buildDungeonWalls", "standDressing", "Fog"] as const;
      const siteOf = (stack: string) => {
        for (const line of stack.split("\n").slice(1)) {
          if (/\bnew Fog\b/.test(line)) return "Fog";
          const named = SITES.find((name) => name !== "Fog" && line.includes(`.${name} `));
          if (named) return named;
        }
        return `unknown: ${stack.split("\n").slice(2, 5).join(" | ")}`;
      };
      const sites = new Map<unknown, Set<string>>();
      const add = ChunkVisibility.prototype.add;
      const spied = vi.spyOn(ChunkVisibility.prototype, "add").mockImplementation(function (this: unknown, ...args) {
        const own = sites.get(this) ?? new Set<string>();
        sites.set(this, own);
        own.add(siteOf(new Error().stack ?? ""));
        return add.apply(this as InstanceType<typeof ChunkVisibility>, args);
      });
      const { handle } = hiddenStage();
      useGameStore.getState().receiveFloorMap({ ...dungeonMap } as never);
      handle({ ...dungeonState(inRoom()), barriers: [door(true)] } as GameState);
      spied.mockRestore();
      const [first, redrawn] = [...sites.values()].map((own) => [...own].sort());
      // a new site of registration must be laid again by redrawDungeon, and pinned here
      expect(first).toEqual([...SITES].sort());
      expect(redrawn).toEqual(first);
    });

    it("should draw nothing again for the same map re-sent (a reconnect's ask)", () => {
      const { stage, handle } = hiddenStage();
      const walls = drawn(stage.made, "tower_wall_");
      useGameStore.getState().receiveFloorMap({ ...shutMap } as never);
      handle({ ...dungeonState(inRoom()), barriers: [door()] } as GameState);
      expect(walls.some((m) => m.destroyed)).toBe(false);
    });

    it("should draw the floor again when the re-sent map comes after the snapshot, through the store", () => {
      const { run, handle } = hiddenStage();
      (run as unknown as { subscribeFloorMap(): void }).subscribeFloorMap();
      handle({ ...dungeonState(inRoom()), barriers: [door(true)] } as GameState);
      useGameStore.getState().receiveFloorMap({ ...dungeonMap } as never);
      const [roomCell] = cellsOf(room);
      expect(run.dungeon.grid.walkable(roomCell.x, roomCell.y)).toBe(true);
      (run as unknown as { floorMapUnsubscribe?: () => void }).floorMapUnsubscribe?.();
    });

    it("should say Poisoned. once when the player is first poisoned, and not on a first broadcast", () => {
      const poisoned = (s: number) => ({ current_player: { ...player("me", "Aldric", 0), position: ME, poisoned_for: s } }) as Partial<Party>;
      const { notified, handle } = hiddenStage(poisoned(5));
      handle({ ...dungeonState(poisoned(4)) } as GameState);
      expect(notified).not.toHaveBeenCalled();
      handle({ ...dungeonState(inRoom()) } as GameState);
      handle({ ...dungeonState(poisoned(6)) } as GameState);
      handle({ ...dungeonState(poisoned(5)) } as GameState);
      expect(notified.mock.calls).toEqual([["Poisoned.", palette.damageBright]]);
    });
  });

  // FS-5FZ4J §J R51–R55 (I-5FZ4J-11): the healing fountain, the hallowed altar and Pray, and the Blessing
  describe("the respites and the Blessing (FS-5FZ4J §J)", () => {
    interface RespiteRun {
      bindRunInput(): void;
      checkBuildingStatus(): void;
      showNotification(text: string, backing: number): void;
      respites: { placed(): { sprite: Made; pos: { x: number; y: number } }[] };
      dungeon: { lights: { all: readonly { kind: string; light: { at?: { x: number; y: number } } }[] } };
      timedOpen?: { label?: Made };
      ui: { hud(message: unknown): void };
    }
    /** This client's player in room 1, at (4280, 1880). */
    const ME = at(4280, 1880);
    const mine = (over: Record<string, unknown> = {}) =>
      ({ current_player: { ...player("me", "Aldric", 0), position: ME, ...over } }) as Partial<Party>;
    /** The altar where the player stands; the fountain far off past the stairs, in a region not yet seen. */
    const altar = (prayed = false) => ({ entity_id: "altar-1", position: ME, prayed });
    const fountain = (dry = false) => ({ entity_id: "fountain-1", position: at(440, 1400), dry });
    const respiteStage = (party = mine(), extra: Partial<GameState> = {}) => {
      const staged = dungeonStage(party, { fountain: fountain(), hallowed_altar: altar(), ...extra });
      const run = staged.run as unknown as RespiteRun;
      const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
      const next = (over: Partial<GameState> = {}, me = mine()) =>
        staged.handle({ ...dungeonState(me), fountain: fountain(), hallowed_altar: altar(), ...over } as GameState);
      return { ...staged, run, notified, next };
    };
    const pressE = (run: RespiteRun, playerPos: { x: number; y: number }) => {
      const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
      const keyHandlers: Record<string, () => void> = {};
      Object.assign(run, {
        input: { setDefaultCursor: vi.fn(), keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) }, on: vi.fn() },
        playerPos,
      });
      run.bindRunInput();
      keyHandlers["keydown-E"]();
      const interacts = sent.mock.calls.filter(([a]) => a === ActionType.Interact);
      sent.mockRestore();
      return interacts;
    };

    it("should draw the fountain full and the altar dormant from the sealed sheets, then dry and prayed in place (R51)", () => {
      const { stage, next } = respiteStage();
      const [basin] = drawn(stage.made, "healing_fountain/full/");
      const [stone] = drawn(stage.made, "hallowed_altar/dormant/");
      expect(basin).toBeDefined();
      expect(stone).toBeDefined();
      next({ fountain: fountain(true), hallowed_altar: altar(true) });
      expect(String(basin.last.setTexture?.[1])).toMatch(/^healing_fountain\/dry\//);
      expect(String(stone.last.setTexture?.[1])).toMatch(/^hallowed_altar\/prayed\//);
      expect(drawn(stage.made, "hallowed_altar/")).toHaveLength(1);
    });

    it("should light the altar's candles among the floor's lights while it is dormant, and put them out once prayed", () => {
      const { run, next } = respiteStage();
      const candles = () => run.dungeon.lights.all.filter((l) => l.light.at?.x === ME.x && l.light.at?.y === ME.y);
      expect(candles()).toHaveLength(1);
      // its own kind of fixed light, never a brazier's (FS-8RBQY §C.6)
      expect(candles()[0].kind).toBe("hallowed_altar");
      next({ hallowed_altar: altar(true) });
      expect(candles()).toHaveLength(0);
    });

    it("should hide a respite standing in an unexplored region, and show the one where the player stands", () => {
      const { run } = respiteStage();
      run.checkBuildingStatus();
      const shown = run.respites.placed().map(({ sprite, pos }) => [pos.x === ME.x ? "here" : "far", shownNow(sprite)]);
      expect(shown).toEqual([["far", false], ["here", true]]);
    });

    it("should send one interact for the dormant altar E reaches, the Pray (R52)", () => {
      const { run } = respiteStage();
      expect(pressE(run, ME)).toEqual([[ActionType.Interact, { entity_id: "altar-1" }]]);
    });

    it("should make neither the fountain nor a prayed altar an E target (R52)", () => {
      const { run, next } = respiteStage();
      next({ hallowed_altar: altar(true) });
      expect(pressE(run, ME)).toEqual([]);
      expect(pressE(run, at(440, 1400))).toEqual([]);
    });

    it("should show the prayer's progress on the open bar over the altar, labelled Praying…, gone when it is prayed (R54)", () => {
      const { run, stage, next } = respiteStage();
      next({}, mine({ timed_open: { entity_id: "altar-1", target_kind: "pray", elapsed: 1, duration: 2 } }));
      const bar = stage.made.find((m) => m.name === "open-bar" && !m.destroyed);
      expect(bar).toBeDefined();
      expect(run.timedOpen?.label?.args[2]).toBe("Praying…");
      next({ hallowed_altar: altar(true) }, mine({ blessed: true }));
      expect(bar!.destroyed).toBe(true);
    });

    it("should say Blessed. once when blessed turns true, and nothing on a first broadcast that finds it so (R53)", () => {
      const first = respiteStage(mine({ blessed: true }));
      first.next({}, mine({ blessed: true }));
      expect(first.notified).not.toHaveBeenCalled();
      const { notified, next } = respiteStage();
      next({ hallowed_altar: altar(true) }, mine({ blessed: true }));
      next({ hallowed_altar: altar(true) }, mine({ blessed: true }));
      expect(notified.mock.calls).toEqual([["Blessed.", palette.safe]]);
    });

    it("should hand the UI scene the Blessing mark while blessed, and none without it (R55)", () => {
      const { run, next } = respiteStage();
      const hud = vi.spyOn(run.ui, "hud");
      next({}, mine({ blessed: true }));
      next({}, mine());
      const marks = hud.mock.calls.map(([m]) => m as { kind: string; marks?: unknown }).filter((m) => m.kind === "statusMarks");
      expect(marks.map((m) => m.marks)).toEqual([["blessed"], []]);
    });
  });

  // FS-9JV5K §F R21–R24 (I-9JV5K-5): the wandering merchant, his wares panel, buying and drinking
  describe("the wandering merchant and his wares (FS-9JV5K §F)", () => {
    interface MerchantRun {
      bindRunInput(): void;
      checkBuildingStatus(): void;
      showNotification(text: string, backing: number): void;
      worldSide(): import("@/ui/uiBridge").WorldSide;
      merchant: { placed(): { sprite: Made; pos: { x: number; y: number } }[] };
      dungeon: { lights: { all: readonly { kind: string }[] } };
      ui: WorldUi;
      shimmers?: { playGranted: ReturnType<typeof vi.fn> };
      waresAnswered(reply: unknown): void;
      itemUsed(reply: unknown): void;
      endRun(): void;
    }
    /** This client's player in room 1, at (4280, 1880). */
    const ME = at(4280, 1880);
    const mine = (over: Record<string, unknown> = {}) =>
      ({ current_player: { ...player("me", "Aldric", 0), position: ME, ...over } }) as Partial<Party>;
    const wares = (antidotes = 3) => [
      { ware: "health_potion", price: 60, left: 3, item: { name: "Lesser Heal Potion", item_type: "consumable", healing_amount: 30 } },
      { ware: "antidote", price: 40, left: antidotes, item: { name: "Antidote", item_type: "consumable" } },
    ];
    /** He stands beside the player; or far off past the stairs, in a region not yet seen. */
    const merchant = (where = at(ME.x + 30, ME.y), antidotes = 3) => ({ entity_id: "merchant-1", position: where, wares: wares(antidotes) });
    const merchantStage = (extra: Partial<GameState> = { merchant: merchant() }) => {
      const staged = dungeonStage(mine(), extra);
      const run = staged.run as unknown as MerchantRun;
      const told: { kind: string; wares?: { rows: { action: string; left: string }[]; line?: string } }[] = [];
      run.ui = { ...NO_UI, wares: (message) => void told.push(message as (typeof told)[number]) };
      const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
      const next = (over: Partial<GameState> = { merchant: merchant() }, me = mine()) => staged.handle({ ...dungeonState(me), ...over } as GameState);
      const answer = (request: import("@/ui/uiBridge").UiRequest) => run.worldSide().answer(request);
      return { ...staged, run, told, notified, next, answer };
    };
    const pressE = (run: MerchantRun, playerPos: { x: number; y: number }) => {
      const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
      const keyHandlers: Record<string, () => void> = {};
      Object.assign(run, {
        input: { setDefaultCursor: vi.fn(), keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) }, on: vi.fn() },
        playerPos,
      });
      run.bindRunInput();
      keyHandlers["keydown-E"]();
      const calls = [...sent.mock.calls];
      sent.mockRestore();
      return calls;
    };
    const sending = () => vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    /** The bodies dressed in a sheet whose name starts so: the frame set on them is `{sheet}/…`. */
    const dressed = (made: Made[], prefix: string) =>
      made.filter((m) => m.kind === "sprite" && !m.destroyed && String(m.last.setTexture?.[1] ?? m.args[3] ?? "").startsWith(prefix));

    it("should draw him from his own sheet with his nameplate, and his lantern among the floor's lights (R21)", () => {
      const { run, stage } = merchantStage();
      expect(dressed(stage.made, "npc_merchant/")).toHaveLength(1);
      expect(stage.made.some((m) => m.kind === "text" && !m.destroyed && m.args[2] === "Wandering Merchant")).toBe(true);
      expect(run.dungeon.lights.all.filter((l) => l.kind === "merchant_lantern")).toHaveLength(1);
    });

    it("should hang his lantern's light at the lit glass, lifted from his sheet's crown (R21)", () => {
      const { run } = merchantStage();
      const crown = shippedManifest().sheets.npc_merchant.crown!;
      const [lantern] = run.dungeon.lights.all.filter((l) => l.kind === "merchant_lantern") as unknown as { at: { y: number } }[];
      const feet = await_iso.worldToScreen(ME.x + 30, ME.y);
      expect(lantern.at.y).toBe(merchantLantern(feet, 0, crown).y);
      expect(lantern.at.y).not.toBe(merchantLantern(feet, 0).y);
    });

    it("should draw his stand-in under its wash while his sheet is not in", () => {
      const { stage } = dungeonStage(mine(), { merchant: merchant() }, { without: "npc_merchant" });
      const [body] = dressed(stage.made, "char_mercenary_base/");
      expect(body).toBeDefined();
      expect(body.tint).toBe(palette.merchantStandIn);
    });

    it("should take him, his nameplate and his lantern down when he leaves the state", () => {
      const { run, stage, next } = merchantStage();
      next({});
      expect(dressed(stage.made, "npc_merchant/")).toHaveLength(0);
      expect(stage.made.some((m) => m.kind === "text" && !m.destroyed && m.args[2] === "Wandering Merchant")).toBe(false);
      expect(run.dungeon.lights.all.filter((l) => l.kind === "merchant_lantern")).toHaveLength(0);
    });

    it("should hide him and his nameplate in a region not yet seen", () => {
      const { run, stage } = merchantStage({ merchant: merchant(at(440, 1400)) });
      run.checkBuildingStatus();
      expect(shownNow(run.merchant.placed()[0].sprite)).toBe(false);
      const plate = stage.made.find((m) => m.kind === "text" && m.args[2] === "Wandering Merchant")!;
      expect(shownNow(plate)).toBe(false);
    });

    it("should open his wares panel on E in reach, sending nothing to the server (R21, R22)", () => {
      const { run, told } = merchantStage();
      expect(pressE(run, ME)).toEqual([]);
      expect(told.map((m) => m.kind)).toEqual(["show"]);
      expect(told[0].wares!.rows.map((r) => r.left)).toEqual(["3 left", "3 left"]);
    });

    it("should not open it out of reach, nor for a player out of the delve", () => {
      const far = merchantStage({ merchant: merchant(at(ME.x + 200, ME.y)) });
      pressE(far.run, ME);
      expect(far.told).toEqual([]);
      const dead = dungeonStage(mine({ current_health: 0 }), { merchant: merchant() });
      const told: unknown[] = [];
      (dead.run as unknown as MerchantRun).ui = { ...NO_UI, wares: (m) => void told.push(m) };
      pressE(dead.run as unknown as MerchantRun, ME);
      expect(told).toEqual([]);
    });

    it("should follow his stock while open, and close, sending nothing, as the player walks out of reach", () => {
      const { run, told, next } = merchantStage();
      pressE(run, ME);
      next({ merchant: merchant(undefined, 0) });
      expect(told.at(-1)!.wares!.rows[1].left).toBe("Sold out");
      const sent = sending();
      Object.assign(run, { playerPos: at(ME.x + 300, ME.y) });
      next();
      expect(told.at(-1)!.kind).toBe("close");
      expect(sent).not.toHaveBeenCalled();
    });

    it("should close it as he leaves the state, and as the menu opens over it", () => {
      const a = merchantStage();
      pressE(a.run, ME);
      a.next({});
      expect(a.told.at(-1)!.kind).toBe("close");
      const b = merchantStage();
      pressE(b.run, ME);
      b.run.worldSide().heardUi?.({ menuOpen: true }, { menuOpen: false });
      expect(b.told.at(-1)!.kind).toBe("close");
    });

    it("should close it on the UI scene's close: wares", () => {
      const { run, told, answer } = merchantStage();
      pressE(run, ME);
      answer({ kind: "close", window: "wares" });
      expect(told.map((m) => m.kind)).toEqual(["show", "close"]);
    });

    it("should send one buy for the open panel's merchant and show Paying… until the reply (R23)", () => {
      const { run, told, answer } = merchantStage();
      pressE(run, ME);
      const sent = sending();
      answer({ kind: "buy", ware: "antidote" });
      answer({ kind: "buy", ware: "health_potion" });
      expect(sent.mock.calls).toEqual([[ActionType.Buy, { merchant_id: "merchant-1", ware: "antidote" }]]);
      expect(told.at(-1)!.wares!.rows.map((r) => r.action)).toEqual(["Buy", "Paying…"]);
    });

    it("should say Bought: on a success and have the purse read again (R23)", () => {
      const { run, told, notified, answer } = merchantStage();
      pressE(run, ME);
      sending();
      answer({ kind: "buy", ware: "antidote" });
      run.waresAnswered({ success: true, ware: "antidote" });
      expect(notified.mock.calls).toEqual([["Bought: Antidote.", palette.safe]]);
      expect(told.map((m) => m.kind)).toContain("answered");
      expect(told.at(-1)!.wares!.rows.map((r) => r.action)).toEqual(["Buy", "Buy"]);
    });

    it("should show a refusal's line on the open panel, in plain words (R23)", () => {
      const { run, told, notified, answer } = merchantStage();
      pressE(run, ME);
      sending();
      answer({ kind: "buy", ware: "antidote" });
      run.waresAnswered({ success: false, reason: "not_enough_gold", message: "not enough gold" });
      expect(told.at(-1)!.wares!.line).toBe("Not enough gold.");
      expect(notified).not.toHaveBeenCalled();
    });

    it("should show an unknown outcome's line on the open panel and have the purse read again (R23, amended 2026-11-25)", () => {
      const { run, told, answer } = merchantStage();
      pressE(run, ME);
      sending();
      answer({ kind: "buy", ware: "antidote" });
      run.waresAnswered({ success: false, reason: "outcome_unknown" });
      expect(told.map((m) => m.kind)).toContain("answered");
      expect(told.at(-1)!.wares!.line).toBe("Your purse did not answer. Check your gold before you buy again.");
    });

    it("should send use_item for the gear's Drink (R24)", () => {
      const { answer } = merchantStage();
      const sent = sending();
      answer({ kind: "drink", item: "antidote-1" });
      expect(sent.mock.calls).toEqual([[ActionType.UseItem, { item_entity_id: "antidote-1" }]]);
    });

    it("should send one use_item for Drink pressed twice, and again once the state drops it or a refusal answers (R24)", () => {
      const { run, answer, next } = merchantStage();
      const antidote = { entity_id: "antidote-1", item_id: "a", name: "Antidote", quantity: 1, item_type: "consumable" };
      next(undefined, mine({ inventory: [antidote] }));
      const sent = sending();
      answer({ kind: "drink", item: "antidote-1" });
      next(undefined, mine({ inventory: [antidote] }));
      answer({ kind: "drink", item: "antidote-1" });
      expect(sent).toHaveBeenCalledTimes(1);
      run.itemUsed({ success: false, reason: "not_poisoned" });
      answer({ kind: "drink", item: "antidote-1" });
      expect(sent).toHaveBeenCalledTimes(2);
      next(undefined, mine({ inventory: [] }));
      answer({ kind: "drink", item: "antidote-2" });
      expect(sent).toHaveBeenCalledTimes(3);
    });

    it("should say You are not poisoned. on that refusal, and play the antidote's shimmer on a success (R24)", () => {
      const { run, notified } = merchantStage();
      const shimmers = { playGranted: vi.fn() };
      run.shimmers = shimmers;
      run.itemUsed({ success: false, reason: "not_poisoned", message: "you are not poisoned" });
      expect(notified.mock.calls).toEqual([["You are not poisoned.", palette.damageBright]]);
      expect(shimmers.playGranted).not.toHaveBeenCalled();
      run.itemUsed({ success: true });
      expect(shimmers.playGranted).toHaveBeenCalledWith(ANTIDOTE_LOOK, expect.anything());
    });
  });

  // FS-4EC7Z §G R29–R35 (I-4EC7Z-6): the encounters, the cage, hostile humans, the contract and the revealed door
  describe("the dungeon encounters (FS-4EC7Z §G)", () => {
    interface EncounterRun {
      bindRunInput(): void;
      checkBuildingStatus(): void;
      showNotification(text: string, backing: number): void;
      stepEncounters(time: number): void;
      encounters: { placed(): { sprite: Made; pos: { x: number; y: number } }[] };
      cages: { placed(): { sprite: Made; pos: { x: number; y: number } }[] };
      ui: WorldUi;
      dungeon: { minimap?: { show(...args: unknown[]): void } };
      time: { now: number };
      fetchEncounterArt(): void;
      onDemand?: { fetch(group: string, landed: () => void): void };
    }
    const ME = at(4280, 1880);
    const mine = (over: Record<string, unknown> = {}) =>
      ({ current_player: { ...player("me", "Aldric", 0), position: ME, ...over } }) as Partial<Party>;
    const npc = (over: Record<string, unknown> = {}) => ({
      entity_id: "npc-1",
      kind: "pilgrim",
      look: "pilgrim_b",
      position: at(ME.x + 30, ME.y),
      facing: { x: 0, y: 1 },
      health: 40,
      max_health: 40,
      stance: "peaceful",
      action: "cower",
      ...over,
    });
    const encounterStage = (extra: Partial<GameState> = { encounter_npcs: [npc()] } as Partial<GameState>, opts: { without?: string } = {}) => {
      const staged = dungeonStage(mine(), extra, opts);
      const run = staged.run as unknown as EncounterRun;
      const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
      const next = (over: Record<string, unknown> = {}, me = mine()) => staged.handle({ ...dungeonState(me), ...over } as GameState);
      return { ...staged, run, notified, next };
    };
    const pressE = (run: EncounterRun, playerPos: { x: number; y: number }) => {
      const sent = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
      const keyHandlers: Record<string, () => void> = {};
      Object.assign(run, {
        input: { setDefaultCursor: vi.fn(), keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) }, on: vi.fn() },
        playerPos,
      });
      run.bindRunInput();
      keyHandlers["keydown-E"]();
      const interacts = sent.mock.calls.filter(([a]) => a === ActionType.Interact);
      sent.mockRestore();
      return interacts;
    };
    const dressed = (made: Made[], prefix: string) =>
      made.filter((m) => m.kind === "sprite" && !m.destroyed && String(m.last.setTexture?.[1] ?? m.args[3] ?? "").startsWith(prefix));
    const texts = (made: Made[], words: string) => made.filter((m) => m.kind === "text" && !m.destroyed && (m.args[2] === words || m.last.setText?.[0] === words));

    it("should draw an encounter NPC from its look, with its kind's plate in the neutral ink (R29)", () => {
      const { run, stage } = encounterStage();
      run.stepEncounters(0);
      expect(dressed(stage.made, "npc_pilgrim/")).toHaveLength(1);
      const [plate] = texts(stage.made, "Pilgrim");
      expect(plate).toBeDefined();
      expect(plate.color).toBe(toCss(palette.markerEncounter));
    });

    it("should draw its stand-in under the wash while the encounters' group is not in", () => {
      const { stage } = encounterStage(undefined, { without: "npc_" });
      const [body] = dressed(stage.made, "char_mercenary_base/");
      expect(body).toBeDefined();
      expect(body.tint).toBe(palette.encounterStandIn);
    });

    it("should plate an ally in the ally ink over its health bar (R29)", () => {
      const { run, stage } = encounterStage({ encounter_npcs: [npc({ kind: "cutthroat", look: "cutthroat_a", stance: "ally", hirer_id: "me", action: "idle", health: 20 })] } as Partial<GameState>);
      run.stepEncounters(0);
      const [plate] = texts(stage.made, "Cutthroat");
      expect(plate.color).toBe(toCss(palette.markerAlly));
      const bar = stage.made.find((m) => m.kind === "graphics" && !m.destroyed && m.calls.includes("fillRect") && m.depth === MARKER_DEPTH.bar);
      expect(bar).toBeDefined();
    });

    it("should send one interact for the NPC E reaches: a talk (R29)", () => {
      const { run } = encounterStage();
      expect(pressE(run, ME)).toEqual([[ActionType.Interact, { entity_id: "npc-1" }]]);
    });

    it("should show a line said over the NPC's head for 4 s, and none on a first broadcast (R30)", () => {
      const { run, stage, next } = encounterStage({ encounter_npcs: [npc({ line: "pilgrim_plea", line_at: 3 })] } as Partial<GameState>);
      expect(texts(stage.made, "Please, they're coming!")).toHaveLength(0);
      run.time.now = 1000;
      next({ encounter_npcs: [npc({ line: "pilgrim_plea", line_at: 8 })] });
      run.stepEncounters(1016);
      const [line] = texts(stage.made, "Please, they're coming!");
      expect(line).toBeDefined();
      expect(shownNow(line)).toBe(true);
      run.stepEncounters(1000 + 4000);
      expect(line.destroyed).toBe(true);
    });

    it("should keep the cutthroats' turn line where they stood once they become monsters (R30, amended)", () => {
      const cut = (over: Record<string, unknown> = {}) => npc({ kind: "cutthroat", look: "cutthroat_a", action: "idle", ...over });
      const { run, stage, next } = encounterStage({ encounter_npcs: [cut()] } as Partial<GameState>);
      run.time.now = 500;
      next({ encounter_npcs: [cut({ line: "cutthroat_turn", line_at: 4 })] });
      const placed = vi.spyOn((run as unknown as { encounterBodies: { place(...a: unknown[]): void } }).encounterBodies, "place");
      run.stepEncounters(516);
      const [line] = texts(stage.made, "Bad luck for you.");
      const where = placed.mock.calls.at(-1)![1];
      next({
        monsters: [{ entity_id: "m-1", archetype: "cutthroat", look: "cutthroat_a", name: "Cutthroat", level: 4, elite: false, boss: false, position: at(ME.x + 30, ME.y), facing: { x: 0, y: 1 }, action: "idle", current_health: 50, max_health: 50 }],
      });
      run.stepEncounters(1500);
      expect(line.destroyed).toBe(false);
      expect(placed.mock.calls.at(-1)![1]).toBe(where);
    });

    it("should draw the cage shut and its key where it lies; E takes the key, then opens the cage (R31)", () => {
      const cage = (open = false) => ({ entity_id: "cage-1", position: at(ME.x + 200, ME.y), open });
      const key = { entity_id: "key-1", position: at(ME.x + 20, ME.y) };
      const { run, stage, next } = encounterStage({ cages: [cage()], encounter_keys: [key] } as Partial<GameState>);
      expect(dressed(stage.made, "cage/shut_back/")).toHaveLength(1);
      expect(dressed(stage.made, "cage/shut_front/")).toHaveLength(1);
      expect(dressed(stage.made, "cage_key/")).toHaveLength(1);
      expect(pressE(run, ME)).toEqual([[ActionType.Interact, { entity_id: "key-1" }]]);
      next({ cages: [cage()], cage_key_carried: true });
      expect(dressed(stage.made, "cage_key/")).toHaveLength(0);
      expect(pressE(run, at(ME.x + 160, ME.y))).toEqual([[ActionType.Interact, { entity_id: "cage-1" }]]);
    });

    it("should say The cage key. when it is carried, Locked. Find the key. on cage_locked, and The pilgrims are lost. (R31, R33)", () => {
      const { notified, next } = encounterStage({ encounter_npcs: [npc()] } as Partial<GameState>);
      next({ encounter_npcs: [npc()], cage_key_carried: true });
      next({ encounter_npcs: [npc({ action: "dead", health: 0 })], cage_key_carried: true });
      expect(notified.mock.calls).toEqual([
        ["The cage key.", palette.hudPanel],
        ["The pilgrims are lost.", palette.damageBright],
      ]);
    });

    it("should hand the UI scene the contract's heading while active, and say its end, once (R34)", () => {
      const { run, notified, next } = encounterStage({}, {});
      const hud = vi.spyOn(run.ui, "hud");
      next({}, mine({ contract: { state: "active", heading: "east" } }));
      next({}, mine({ contract: { state: "active", heading: "east" } }));
      next({}, mine({ contract: { state: "active", heading: "north" } }));
      next({}, mine({ contract: { state: "settled" }, contract_settled: true }));
      const lines = hud.mock.calls.map(([m]) => m as { kind: string; line?: unknown; marks?: unknown });
      expect(lines.filter((m) => m.kind === "contract").map((m) => m.line)).toEqual([
        "Mark: last seen to the east",
        "Mark: last seen to the north",
        null,
      ]);
      expect(lines.filter((m) => m.kind === "statusMarks").at(-1)?.marks).toEqual(["contract_settled"]);
      expect(notified.mock.calls).toEqual([["Contract Settled.", palette.safe]]);
    });

    it("should say Contract lost. when it is lost, and nothing of a contract a first broadcast finds settled (R34)", () => {
      const a = encounterStage({}, {});
      a.next({}, mine({ contract: { state: "active", heading: "east" } }));
      a.next({}, mine({ contract: { state: "lost" } }));
      expect(a.notified.mock.calls).toEqual([["Contract lost.", palette.damageBright]]);
      const b = dungeonStage(mine({ contract: { state: "settled" } }));
      const told = vi.spyOn(b.run as unknown as EncounterRun, "showNotification").mockImplementation(() => {});
      b.handle({ ...dungeonState(mine({ contract: { state: "settled" } })) } as GameState);
      expect(told).not.toHaveBeenCalled();
    });

    it("should hand the minimap a revealed shut secret door as its door glyph, told of, explored or not (R35)", () => {
      const door = (open = false) => ({ entity_id: "door-1", kind: "secret_door", cells: [{ x: 0, y: 0 }], open, revealed: true });
      const { run, next } = encounterStage({ barriers: [door()] } as Partial<GameState>);
      const show = vi.spyOn(run.dungeon.minimap!, "show");
      next({ barriers: [door()] });
      const fixtures = show.mock.calls.at(-1)![1] as { kind: string }[];
      // told of: marked whether or not the ground by it is explored (R35, §D R14)
      expect(fixtures.filter((f) => f.kind === "secret-door")).toEqual([expect.objectContaining({ told: true })]);
      next({ barriers: [door(true)] });
      expect((show.mock.calls.at(-1)![1] as { kind: string }[]).filter((f) => f.kind === "secret-door")).toHaveLength(0);
    });

    it("should fetch the encounters' group once for its NPCs and its hostile humans, and dress both as it lands (§H R36)", () => {
      const { run } = encounterStage();
      const asked: string[] = [];
      let land = () => {};
      run.onDemand = { fetch: (group, landed) => void (asked.push(group), (land = landed)) } as EncounterRun["onDemand"];
      const npcs = vi.spyOn(run.encounters as unknown as { landed(): void }, "landed");
      const redress = vi.fn();
      (run as unknown as { monsters: { redress(group: string): void } }).monsters = { redress } as never;
      run.fetchEncounterArt();
      land();
      expect(asked).toEqual(["encounter"]);
      expect(npcs).toHaveBeenCalledTimes(1);
      expect(redress).toHaveBeenCalledWith("encounter");
    });

    it("should take the encounters down with their floor", () => {
      const { run, stage } = encounterStage({ encounter_npcs: [npc()], cages: [{ entity_id: "cage-1", position: ME, open: true }] } as Partial<GameState>);
      (run as unknown as { leaveFloor(): void }).leaveFloor();
      expect(dressed(stage.made, "npc_pilgrim/")).toHaveLength(0);
      expect(dressed(stage.made, "cage/")).toHaveLength(0);
      expect(texts(stage.made, "Pilgrim")).toHaveLength(0);
      expect(run.encounters.placed()).toEqual([]);
    });
  });
});

// FS-PQ2TW §A R2, R5, R9; §B R11–R14; §C R19, R21, R22; FS-KE075 §H.41. I-PQ2TW-3: entering a run
// plays the first floor's card; a return plays nothing.
describe("BarrowspireScene arrival card (FS-PQ2TW §A–§C; I-PQ2TW-3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState({ floorMap: null });
  });

  type ArrivingRun = MapRun & { init(data?: object): void; create(): void; connectToServer(): void };

  /** A run scene started by a world switch that told it an arrival, or a return. */
  function startedAs(arrival: boolean) {
    const scene = sceneOnStage();
    const run = scene.run as unknown as ArrivingRun;
    const clock = { now: 0 };
    run.time = { delayedCall: vi.fn(), get now() { return clock.now; } };
    run.init({ sessionID: "run", arrival });
    // the real state path, without the harness' map-first shim (FS-KE075 §H.41)
    const handle = (Object.getPrototypeOf(run) as FloorRun).handleGameStateUpdate.bind(run);
    /** The words on screen now. */
    const words = () =>
      scene.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    /** Every card title ever drawn, gone or not. */
    const titles = () => scene.texts().map((t) => String(t.content)).filter((t) => /Floor$/.test(t));
    const veilFades = () =>
      (run.tweens as { add: ReturnType<typeof vi.fn> }).add.mock.calls.filter(
        ([t]) => t.targets === run.arrivalCard.parts[0] && t.alpha === 0,
      ).length;
    return { ...scene, run, clock, handle, words, titles, veilFades };
  }

  /** Runs `create` up to the run's connect, which stands in for everything create builds after. */
  function createUpToConnect(run: ArrivingRun): void {
    run.connectToServer = () => {
      throw new Error("the rest of create");
    };
    expect(() => run.create()).toThrow("the rest of create");
  }

  it("should put the dark up first thing at create on an arrival, before anything of the floor (R11)", () => {
    const { run, stage } = startedAs(true);

    createUpToConnect(run);

    expect(stage.made.map((m) => [m.kind, m.args])).toEqual([["rectangle", [0, 0, 800, 600, palette.inkDeep, 1]]]);
    expect(stage.made[0].last.setDepth).toEqual([ARRIVAL_CARD.depth]);
  });

  it("should put no dark up at create on a return (R5)", () => {
    const { run, stage } = startedAs(false);

    createUpToConnect(run);

    expect(stage.made).toEqual([]);
  });

  it("should play The First Floor at an arrival's first broadcast, over the dark from create (R2, R13, R19)", () => {
    const { run, stage, words } = startedAs(true);
    createUpToConnect(run);
    expect(words()).toEqual([]);

    run.handleGameStateUpdate(floorState(1));

    expect(words()).toEqual(expect.arrayContaining(["The First Floor", "The barrow takes you in."]));
    // one dark, whole: the card's own, standing where the dark from create stood
    expect(stage.made.filter((m) => m.kind === "rectangle" && m.args[4] === palette.inkDeep && !m.destroyed)).toHaveLength(1);
  });

  it("should lift the dark on today's schedule when floor 1's map came first (R12)", () => {
    const { run, veilFades } = startedAs(true);

    run.handleGameStateUpdate(floorState(1));

    expect(veilFades()).toBe(1);
  });

  it("should hold the dark until floor 1 is built from its map, when the map comes late (R12; FS-KE075 §H.41)", () => {
    vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
    const { run, handle, words, veilFades } = startedAs(true);
    run.subscribeFloorMap();

    handle(bare(floorState(1)));
    expect(words()).toContain("The First Floor");
    expect(run.walls.size).toBe(0);
    expect(veilFades()).toBe(0);

    useGameStore.getState().receiveFloorMap(mapOf(floorState(1)));
    expect(run.walls.size).toBe(4);
    expect(veilFades()).toBe(1);
    run.floorMapUnsubscribe?.();
  });

  it("should play the arrival once, never again on its floor's next broadcasts", () => {
    const { run, titles } = startedAs(true);

    for (let i = 0; i < 3; i++) run.handleGameStateUpdate(floorState(1));

    expect(titles()).toEqual(["The First Floor"]);
  });

  it("should give an arrival that lands above floor 1 that floor's climb card (R22)", () => {
    const { run, words } = startedAs(true);

    run.handleGameStateUpdate(floorState(2));

    expect(words()).toEqual(expect.arrayContaining(["The Second Floor", "The dead walk heavier here."]));
  });

  it.each([
    [1, "The Second Floor"],
    [2, "The Third Floor"],
    [3, undefined],
  ])("should play nothing on a return to floor %i, and the next climb's card after it (R5)", (floor, next) => {
    const { run, titles, words } = startedAs(false);

    run.handleGameStateUpdate(floorState(floor));
    run.handleGameStateUpdate(floorState(floor));

    expect(titles()).toEqual([]);
    expect(words()).not.toContain("The barrow takes you in.");
    expect(run.arrivalCard.parts).toHaveLength(0);
    if (!next) return;
    run.handleGameStateUpdate(floorState(floor + 1));
    expect(titles()).toEqual([next]);
  });

  it("should replace the arrival's card with the climb's when the party climbs under it (R9)", () => {
    const { run, words } = startedAs(true);
    run.handleGameStateUpdate(floorState(1));
    expect(words()).toContain("The First Floor");

    run.handleGameStateUpdate(floorState(2));

    expect(words()).toContain("The Second Floor");
    expect(words()).not.toContain("The First Floor");
    expect(words()).not.toContain("The barrow takes you in.");
  });

  it("should apply the state under the card: the floor built, the player made (R14)", () => {
    const { run } = startedAs(true);

    run.handleGameStateUpdate(partyState());

    expect(run.arrivalCard.parts.length).toBeGreaterThan(0);
    expect(run.walls.size).toBe(4);
    expect((run as unknown as { player?: unknown }).player).toBeDefined();
  });
});

const { TOWER_TRACK, MUSIC_FADE_IN_MS, MUSIC_FADE_OUT_MS, MUSIC_LEVEL_RAMP_MS } = await import("@/audio/worldMusic");

/**
 * The run's game as its music reaches it (FS-28DDG § Change: The tower's music on every floor of a
 * run): the tower track in the audio cache, a sound recording its volumes, plays, stops and destroy,
 * the game's step (which goes on past the scene's stop), and the scene's status.
 */
function withTowerSound(run: object) {
  const audio = new Set([TOWER_TRACK.key]);
  const sound = {
    volumes: [] as number[],
    calls: [] as string[],
    set volume(value: number) {
      sound.volumes.push(value);
    },
    play: () => (sound.calls.push("play"), true),
    stop: () => (sound.calls.push("stop"), true),
    destroy: () => void sound.calls.push("destroy"),
  };
  const add = vi.fn((_key: string, _config: unknown) => sound);
  const events = new EventEmitter();
  const settings = { status: 5 };
  Object.assign(run, {
    cache: {
      audio: {
        exists: (key: string) => audio.has(key),
        remove: (key: string) => void audio.delete(key),
      },
    },
    sound: { add, locked: false, context: { state: "running" } },
    game: { events },
    sys: { settings },
  });
  /** The game steps on, in 16 ms frames. */
  const step = (ms: number) => {
    for (let t = 0; t < ms; t += 16) events.emit("step", t, 16);
  };
  return { audio, sound, add, step, settings, events };
}

/** The run's music, as the scene's wiring reaches it. */
interface Musical {
  enterMusic(): void;
  resetRun(end: "shutdown" | "destroy"): void;
  leaveFloor(): void;
  endRun(): void;
  handleGameStateUpdate(state: unknown): void;
  input: unknown;
}

// The tower's music: loaded by the run, entered at its create, played on every floor and through a
// death, the run's end and the record, and let go at the run's end (FS-28DDG § Change: The tower's
// music on every floor of a run, W2–W4, W7, W9).
describe("BarrowspireScene the tower's music (FS-28DDG § Change: The tower's music on every floor of a run)", () => {
  /** The default level's gain under the tower's own ceiling of 1.0: what the run plays at with no setting kept (Tunes FS-28DDG). */
  const FULL = 0.6;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The run on stage, its music entered and faded in. */
  function playing() {
    const s = onStage();
    const run = s.run as unknown as Musical;
    const music = withTowerSound(run);
    run.handleGameStateUpdate(partyState());
    run.enterMusic();
    music.step(MUSIC_FADE_IN_MS);
    return { ...s, run, ...music };
  }

  it("should queue the tower track, m4a first, beside the creatures and the boss (W8, W9)", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const anything: Record<string, unknown> = new Proxy({}, { get: () => () => anything });
    const run = Object.assign(new BarrowspireScene(), art.scene, {
      make: { graphics: () => anything },
    }) as unknown as { preload(): void };

    run.preload();

    expect(art.queuedAudio).toEqual([{ key: TOWER_TRACK.key, url: ["/audio/music/tower.m4a", "/audio/music/tower.ogg"] }]);
  });

  it("should skip the download while the tower track is still cached (W9)", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
      audio: [TOWER_TRACK.key],
    });
    const anything: Record<string, unknown> = new Proxy({}, { get: () => () => anything });
    const run = Object.assign(new BarrowspireScene(), art.scene, {
      make: { graphics: () => anything },
    }) as unknown as { preload(): void };

    run.preload();

    expect(art.queuedAudio).toEqual([]);
  });

  it("should add the tower track looping at silence on entering the run and fade it in over 2000 ms (W2, W4)", () => {
    const { add, sound } = playing();

    expect(add).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(TOWER_TRACK.key, { loop: true, volume: 0 });
    expect(sound.calls).toEqual(["play"]);
    expect(sound.volumes.at(-1)).toBeCloseTo(FULL, 12);
  });

  it("should play on through every floor: a climb neither stops, restarts nor dips it (W3)", () => {
    const { run, sound, step } = playing();
    const heard = sound.volumes.length;

    run.leaveFloor();
    step(MUSIC_FADE_OUT_MS);

    expect(sound.calls).toEqual(["play"]);
    expect(sound.volumes.length).toBe(heard);
  });

  it("should play on through a death and the run's end (W7)", () => {
    const { run, sound, step } = playing();
    const heard = sound.volumes.length;

    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130, { current_health: 0 })));
    (run as unknown as { input: { keyboard: unknown } }).input = { keyboard: { enabled: true } };
    run.endRun();
    step(MUSIC_FADE_OUT_MS);

    expect(sound.calls).toEqual(["play"]);
    expect(sound.volumes.length).toBe(heard);
  });

  it("should fall away over 1000 ms on the game's step once the run stops, then be stopped and freed (W4, W9)", () => {
    const { run, sound, step, settings, audio } = playing();
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});
    run.input = { keyboard: { enabled: true, removeCapture: vi.fn() } };

    run.resetRun("shutdown");
    settings.status = 8;
    step(MUSIC_FADE_OUT_MS / 2);
    expect(sound.volumes.at(-1)).toBeCloseTo(FULL / 2, 1);
    step(MUSIC_FADE_OUT_MS);

    expect(sound.volumes.at(-1)).toBe(0);
    expect(sound.calls).toEqual(["play", "stop", "destroy"]);
    expect(audio.has(TOWER_TRACK.key)).toBe(false);
  });

  it("should take the same sound back up when the run starts again during the fall, with no second sound (Edge States: Reconnect mid-run)", () => {
    const { run, sound, step, add } = playing();
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});
    run.input = { keyboard: { enabled: true, removeCapture: vi.fn() } };

    run.resetRun("shutdown");
    step(MUSIC_FADE_OUT_MS / 2);
    run.enterMusic();
    step(MUSIC_FADE_IN_MS);

    expect(add).toHaveBeenCalledOnce();
    expect(sound.calls).toEqual(["play"]);
    expect(sound.volumes.at(-1)).toBeCloseTo(FULL, 12);
  });

  it("should ask nothing of the sound when the game is destroyed (R21)", () => {
    const { run, sound, step, events } = playing();
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});
    const calls = [...sound.calls];

    run.resetRun("destroy");
    step(MUSIC_FADE_OUT_MS);

    expect(sound.calls).toEqual(calls);
    expect(events.listenerCount("step")).toBe(0);
  });

  it("should do nothing when the run is stopped during its first preload, before any create made the music (W9)", () => {
    const scene = new BarrowspireScene();
    const run = scene as unknown as Musical;
    scene.init();
    const { add, sound, events, audio } = withTowerSound(run);
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});

    expect(() => run.resetRun("shutdown")).not.toThrow();

    expect(add).not.toHaveBeenCalled();
    expect(sound.calls).toEqual([]);
    expect(events.listenerCount("step")).toBe(0);
    expect(audio.has(TOWER_TRACK.key)).toBe(true);
  });

  it("should fade a held, stopped sound from 0 and free it once SHUTDOWN when a later visit is stopped during its preload (W9, R13)", () => {
    const { run, sound, step, settings, audio, add } = playing();
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "offError").mockImplementation(() => {});
    run.input = { keyboard: { enabled: true, removeCapture: vi.fn() } };

    // the first visit ends while the next one already loads: stopped, but held for it
    run.resetRun("shutdown");
    settings.status = 2;
    step(MUSIC_FADE_OUT_MS + 16);
    expect(sound.calls).toEqual(["play", "stop"]);
    expect(audio.has(TOWER_TRACK.key)).toBe(true);
    const heard = sound.volumes.length;

    // that visit is stopped during its preload, before its create entered the music
    run.resetRun("shutdown");
    settings.status = 8;
    step(MUSIC_FADE_OUT_MS + 16);

    expect(sound.volumes.length).toBeGreaterThan(heard);
    expect(sound.volumes.slice(heard).every((v) => v === 0)).toBe(true);
    expect(sound.calls).toEqual(["play", "stop", "destroy"]);
    expect(audio.has(TOWER_TRACK.key)).toBe(false);
    expect(add).toHaveBeenCalledOnce();
  });

  it("should play nothing, and throw nothing, when the tower track failed to load (R14)", () => {
    const s = onStage();
    const run = s.run as unknown as Musical;
    const { audio, add } = withTowerSound(run);
    audio.clear();

    expect(() => run.enterMusic()).not.toThrow();
    expect(add).not.toHaveBeenCalled();
  });
});

// FS-WDM0X § Change: Menu, dialog and notice sounds, owner listening check 2026-11-14: the run's
// notification is its words and its look, nothing marked important, so none chimes; a fall refused too.
describe("BarrowspireScene notices carry no importance (FS-WDM0X § Change, owner listening check)", () => {
  afterEach(() => void vi.restoreAllMocks());

  // a refused fall is a lore line since FS-XWHZP (merge with main, 2026-11-14): no notice at all
  it("should say the run's news as words and look, nothing marked important", () => {
    const { run } = onStage();
    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130)));
    const told: unknown[] = [];
    uiSceneOn(run, "run", { row: false }).bridge.onScreen({ notice: (n) => void told.push(n) });
    const say = (run as unknown as { showNotification(message: string, backing: number): void }).showNotification.bind(run);

    say("Escape door opened!", palette.safe);

    expect(told).toEqual([{ text: "Escape door opened!", look: { world: "run", backing: palette.safe } }]);
    expect(told.map((n) => Object.keys(n as object))).toEqual([["text", "look"]]);
  });
});

// FS-TQZ5J § Change: Phase 2: the party (I-TQZ5J-9, I-TQZ5J-10): the party pieces are the UI scene's; the
// run reports what they read of it: the panel turned away at its end or with a chest open, the popups
// hidden at its end, the invites stacked above its chat window (FS-R82NV R28; FS-NCC9J R24; R38)
describe("BarrowspireScene what the party pieces read of it (FS-TQZ5J § Change: Phase 2: the party, R38)", () => {
  it("should turn the panel and the chat away at the run's end or with a container open, and hide the popups at its end", () => {
    const run = new BarrowspireScene() as unknown as {
      worldSide(): import("@/ui/uiBridge").WorldSide;
      runEnded: boolean;
      containerView?: { isOpen: boolean };
    };
    run.containerView = { isOpen: false };
    const side = run.worldSide();

    // the UI scene's chat is turned away by the run's end and an open chest (FS-TQZ5J § Change: Batch 6, R126)
    expect(side.blockers()).toMatchObject({ party: false, popups: false, chat: false });
    run.containerView.isOpen = true;
    expect(side.blockers()).toMatchObject({ party: true, popups: false, chat: true });
    run.containerView.isOpen = false;
    run.runEnded = true;
    expect(side.blockers()).toMatchObject({ party: true, popups: true, chat: true });
  });

  // batch 6 review (LOW): the world says, in its report, that its invites stack above the chat window
  it("should report its invites stacked above the UI scene's chat window (FS-TQZ5J § Change: Batch 6, R132)", () => {
    const run = new BarrowspireScene() as unknown as { worldSide(): import("@/ui/uiBridge").WorldSide };
    expect(run.worldSide().invitesAboveChat).toBe(true);
  });
});

// FS-TQZ5J § Change: Phase 2: the party (I-TQZ5J-11): the party frames are the UI scene's; the run hands
// each state of its own world it shows to the bridge, as plain data (FS-R82NV R34, R35; R38)
describe("BarrowspireScene the party frames' state ticks (FS-TQZ5J § Change: Phase 2: the party, R38)", () => {
  it("should hand the bridge each state it shows, its players as the frames read them", () => {
    const { run } = onStage();
    const seen: unknown[] = [];
    (run as unknown as { ui: object }).ui = { ...NO_UI, partySeen: (state: unknown) => void seen.push(state) };
    const first = partyState();
    const next = partyState(player("me", "Aldric", 130, { current_health: 25 }));

    run.handleGameStateUpdate(first);
    run.handleGameStateUpdate(next);

    const players = (s: unknown) => {
      const { current_player, other_players } = s as GameState;
      return { current_player, other_players };
    };
    expect(seen.map(players)).toEqual([first, next].map(players));
  });
});

// FS-TQZ5J § Change: Batch 6, R128 (batch 6 review, LOW): the run's end while the player types, end to end
// through the real pieces: the UI scene's real ChatWindow and its real ChatInput, the real bridge and its
// typing guard, the run's real endRun. Only the drawing and the DOM field are stand-ins.
describe("BarrowspireScene's end while the player types in the UI scene's chat (FS-TQZ5J § Change: Batch 6, R128)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A scene keyboard that writes each switch into `order`, as `<name> on` or `<name> off`. */
  function keyboardOf(name: string, order: string[]) {
    let on = true;
    // an accessor on the emitter itself: Object.assign would copy the getter's value, not the setter
    const keys = Object.assign(new EventEmitter(), { resetKeys: () => {}, removeCapture: () => {} });
    Object.defineProperty(keys, "enabled", {
      get: () => on,
      set: (value: boolean) => {
        on = value;
        order.push(`${name} ${value ? "on" : "off"}`);
      },
    });
    return keys as typeof keys & { enabled: boolean };
  }

  it("should cancel the line, hand both keyboards back, and only then turn the run's off: ChatWindow → ChatInput → endRun", () => {
    const { run } = onStage();
    const order: string[] = [];
    const runKeys = keyboardOf("run", order);
    Object.assign(run, { input: { keyboard: runKeys } });
    const { bridge } = uiSceneOn(run, "run", { row: false });
    // the UI scene, as the window draws on it: any drawing call answered, its own keyboard
    const any = absorbing();
    const uiKeys = keyboardOf("ui", order);
    const uiScene = {
      add: any,
      make: any,
      events: new EventEmitter(),
      scale: new EventEmitter(),
      cameras: { main: { originX: 0, originY: 0 } },
      input: Object.assign(new EventEmitter(), { keyboard: uiKeys }),
    } as unknown as ConstructorParameters<typeof ChatWindow>[0];
    // the DOM field: its focus and blur told to the input, as the browser's are
    const field = { value: "", channel: "area" as const, focused: false };
    const slot = new UiChatSlot(bridge, (wiring) =>
      new ChatWindow(uiScene, createChatStore(), 10, 700, {
        input: {
          mayOpen: wiring.mayOpen,
          keepsDraft: wiring.keepsDraft,
          send: () => {},
          makeField: (_scene, _rect, events) => ({
            get value() {
              return field.value;
            },
            set value(v: string) {
              field.value = v;
            },
            channel: field.channel,
            focus: () => ((field.focused = true), events.focused()),
            blur: () => ((field.focused = false), events.blurred()),
            moveTo: () => {},
            show: () => {},
            hide: () => {},
            destroy: () => {},
          }),
        },
        typing: wiring.typing,
        play: wiring.play,
      }),
    );
    slot.show(bridge.world);
    bridge.onWorld((report) => slot.show(report));

    // Enter on the UI scene's keyboard opens the input; the player types half a line
    uiKeys.emit("keydown-ENTER");
    field.value = "half a line";
    expect(bridge.ui.typing).toBe(true);
    expect(order).toEqual(["ui off", "run off"]);

    (run as unknown as { endRun(): void }).endRun();

    expect(order).toEqual(["ui off", "run off", "ui on", "run on", "run off"]);
    expect([field.focused, field.value, bridge.ui.typing]).toEqual([false, "", false]);
    expect([uiKeys.enabled, runKeys.enabled]).toEqual([true, false]);
  });
});

// FS-3103M §I R24-R28 as amended by A1 (I-3103M-7): the tome, the altar and the burn.
describe("BarrowspireScene the tome, the altar and the burn (FS-3103M §I)", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "../../public/art/manifest.json"), "utf8"));
  const { worldToScreen } = await_iso;
  interface Summoned {
    bindRunInput(): void;
    showNotification(message: string, color: string): void;
    leaveFloor(): void;
  }

  /** This client's player at (130, 300); the tome and the altar beside them unless placed. */
  const tome = (x = 140, y = 300) => ({ entity_id: "tome-1", position: at(x, y) });
  const altar = (burned = false, x = 130, y = 340) => ({ entity_id: "altar-1", position: at(x, y), burned });
  const withTome = (fields: Partial<GameState> = {}): GameState => ({ ...partyState(), ...fields }) as GameState;

  function summoningOnStage(baked = true) {
    const stage = onStage();
    const run = stage.run as unknown as FloorRun & Summoned;
    if (baked) (run as unknown as { art: unknown }).art = new ArtLibrary(manifest, { warn: () => {} });
    // the menu slot is the UI scene's, drawn on the run's stage (FS-TQZ5J §D; merge with main, 2026-11-14)
    uiSceneOn(run, "run", { row: false });
    const keyHandlers: Record<string, () => void> = {};
    Object.assign(run, {
      input: {
        setDefaultCursor: vi.fn(),
        keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) },
        on: vi.fn(),
      },
    });
    run.bindRunInput();
    const said = loreOf(run).said;
    const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
    const option = (id: string) =>
      stage.stage.made.find((m) => (m as { name?: string }).name === `menu-${id}` && !m.destroyed);
    const labels = () =>
      stage.stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    const interacts = () => stage.sent.mock.calls.filter(([a]) => a === ActionType.Interact);
    return {
      ...stage,
      run,
      said,
      notified,
      option,
      labels,
      interacts,
      pressE: () => keyHandlers["keydown-E"](),
      pressEsc: () => uiFrame(run, { esc: { justDown: true } }),
      pick: (id: string) => option(id)?.handlers.pointerup(),
    };
  }

  /** Sprites drawn from a sheet: their frame names start with it. */
  const drawnFrom = (made: Made[], sheet: string) =>
    made.filter((m) => m.kind === "sprite" && String(m.args[3] ?? "").startsWith(`${sheet}/`));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("drawing (R27)", () => {
    it("should draw the tome and the altar at their positions from their sheets, the altar dormant", () => {
      const { run, stage } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ tome: tome(400, 500), altar: altar(false, 700, 600) }));
      const [book] = drawnFrom(stage.made, "tome");
      const [stone] = drawnFrom(stage.made, "altar");
      const s = worldToScreen(400, 500);
      expect(book.args.slice(0, 2)).toEqual([s.x, s.y]);
      expect(String(book.args[3])).toMatch(/^tome\/default\//);
      const a = worldToScreen(700, 600);
      expect(stone.args.slice(0, 2)).toEqual([a.x, a.y]);
      expect(String(stone.args[3])).toMatch(/^altar\/dormant\//);
    });

    it("should turn the altar to its burned frame when it burns, and take the tome away once taken", () => {
      const { run, stage } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ tome: tome(), altar: altar() }));
      run.handleGameStateUpdate(withTome({ altar: altar(true), tome_carried: false }));
      const [book] = drawnFrom(stage.made, "tome");
      const [stone] = drawnFrom(stage.made, "altar");
      expect(book.destroyed).toBe(true);
      expect(stone.destroyed).toBe(false);
      expect(String(stone.last.setTexture?.[1])).toMatch(/^altar\/burned\//);
    });

    it("should draw neither on a floor without them, and take both down on a climb", () => {
      const { run, stage } = summoningOnStage();
      run.handleGameStateUpdate(partyState());
      expect(drawnFrom(stage.made, "tome")).toHaveLength(0);
      expect(drawnFrom(stage.made, "altar")).toHaveLength(0);
      run.handleGameStateUpdate(withTome({ tome: tome(), altar: altar() }));
      run.handleGameStateUpdate({ ...floorState(2), current_player: player("me", "Aldric", 630) } as GameState);
      expect([...drawnFrom(stage.made, "tome"), ...drawnFrom(stage.made, "altar")].every((m) => m.destroyed)).toBe(true);
    });
  });

  describe("E at the tome and the altar (R25, R27)", () => {
    it("should take a listed tome with E: one interact for it", () => {
      const { run, pressE, interacts } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ tome: tome() }));
      pressE();
      expect(interacts()).toEqual([[ActionType.Interact, { entity_id: "tome-1" }]]);
    });

    it("should send the interact at once at an unburned altar without the tome", () => {
      const { run, pressE, interacts } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ altar: altar() }));
      pressE();
      expect(interacts()).toEqual([[ActionType.Interact, { entity_id: "altar-1" }]]);
      expect(menuOver(run)).toBeUndefined();
    });

    it("should ask Burn tome? at an unburned altar while the tome is carried, sending nothing", () => {
      const { run, pressE, interacts, labels, option } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ altar: altar(), tome_carried: true }));
      pressE();
      expect(menuOver(run)).toBeDefined();
      expect(labels()).toContain("Burn tome?");
      expect(labels()).toContain("Burn  [1]");
      expect(labels()).toContain("Not yet  [Esc]");
      expect(option("burn")).toBeDefined();
      expect(interacts()).toEqual([]);
    });

    it("should send one interact for the altar on Burn, and take the confirm down", () => {
      const { run, pressE, pick, interacts } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ altar: altar(), tome_carried: true }));
      pressE();
      pick("burn");
      pick("burn");
      expect(interacts()).toEqual([[ActionType.Interact, { entity_id: "altar-1" }]]);
      expect(menuOver(run)).toBeUndefined();
    });

    it("should send nothing on Not yet, nor on Esc", () => {
      const notYet = summoningOnStage();
      notYet.run.handleGameStateUpdate(withTome({ altar: altar(), tome_carried: true }));
      notYet.pressE();
      notYet.pick("not-yet");
      expect(menuOver(notYet.run)).toBeUndefined();
      expect(notYet.interacts()).toEqual([]);

      const esc = summoningOnStage();
      esc.run.handleGameStateUpdate(withTome({ altar: altar(), tome_carried: true }));
      esc.pressE();
      esc.pressEsc();
      expect(menuOver(esc.run)).toBeUndefined();
      expect(esc.interacts()).toEqual([]);
    });

    it("should not reach a burned altar with E", () => {
      const { run, pressE, interacts } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ altar: altar(true) }));
      pressE();
      expect(interacts()).toEqual([]);
      expect(menuOver(run)).toBeUndefined();
    });
  });

  describe("the burn heard (R26 as amended by A1)", () => {
    const HELL = { text: "You hear a sound from hell", tone: "dread" };

    it("should play the hell line as a dread lore line on the altar's unburned-to-burned flip, never a HUD notice", () => {
      const { run, said, notified } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ altar: altar() }));
      run.handleGameStateUpdate(withTome({ altar: altar(true) }));
      run.handleGameStateUpdate(withTome({ altar: altar(true) }));
      expect(said.mock.calls.map(([line]) => line)).toEqual([HELL]);
      expect(notified).not.toHaveBeenCalled();
    });

    it("should take a first state as the baseline: nothing on a reconnect after the burn", () => {
      const { run, said } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ altar: altar(true) }));
      expect(said).not.toHaveBeenCalled();
    });

    it("should take a new floor's first state as the baseline", () => {
      const { run, said } = summoningOnStage();
      run.handleGameStateUpdate(withTome({ altar: altar() }));
      run.leaveFloor();
      run.handleGameStateUpdate(withTome({ altar: altar(true) }));
      expect(said).not.toHaveBeenCalled();
    });
  });

  describe("the tome and altar replies (R24 as amended by A1, R28)", () => {
    function replying() {
      const listeners = new Map<string, (payload: unknown) => void>();
      vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
      vi.spyOn(socketManager, "onError").mockImplementation(() => {});
      vi.spyOn(socketManager, "off").mockImplementation(() => {});
      vi.spyOn(socketManager, "isConnected").mockReturnValue(true);
      vi.spyOn(socketManager, "onConnectionStatusChange").mockReturnValue(() => {});
      vi.spyOn(socketManager, "onGameStateUpdate").mockReturnValue(() => {});
      const run = new BarrowspireScene() as unknown as Summoned & {
        init(data?: object): void;
        connectToServer(): void;
        reaching?: string;
      };
      run.init({ sessionID: "run-a" });
      run.reaching = "chest-1";
      const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
      const said = loreOf(run).said;
      run.connectToServer();
      return { run, notified, said, reply: (payload: unknown) => listeners.get("interact")?.(payload) };
    }

    it("should play tome_taken and altar_without_tome as lore lines, never HUD notices", () => {
      const { said, notified, reply } = replying();
      reply({ success: true, reason: "tome_taken" });
      reply({ success: false, message: "a tome was burned here once", reason: "altar_without_tome" });
      expect(said.mock.calls.map(([line]) => line)).toEqual([
        { text: "Wonder if I can burn it.", tone: "lore" },
        { text: "A tome was burned here once, they say, to insult a demon.", tone: "lore" },
      ]);
      expect(notified).not.toHaveBeenCalled();
    });

    it("should say nothing for altar_burned, and let a refusal give up a coffer reach as any refusal does", () => {
      const { run, said, notified, reply } = replying();
      reply({ success: false, message: "the altar is burned", reason: "altar_burned" });
      expect(said).not.toHaveBeenCalled();
      expect(notified).not.toHaveBeenCalled();
      expect(run.reaching).toBeUndefined();
    });
  });
});

// FS-1J1CB §E R35: the run's bodies carry their auras, the player's own and every rival's: hidden
// with the body, stopped from the death clip until it rises.
describe("BarrowspireScene auras (FS-1J1CB R35)", () => {
  it("should follow each body alive and drawn, and none hidden, escaped or dead", () => {
    const scene = new BarrowspireScene() as unknown as Record<string, unknown> & { followAuras(time: number): void };
    const follow = vi.fn();
    const ownPos = { x: 100, y: 120 };
    Object.assign(scene, {
      auras: { follow },
      player: { visible: true },
      playerPos: ownPos,
      playerAnim: { crown: 76 },
      lastGameState: { current_player: { current_health: 40 } },
      otherPlayers: new Map([
        ["alive", { visible: true }],
        ["hidden", { visible: false }],
        ["dead", { visible: true }],
      ]),
      otherPlayersPos: new Map([
        ["alive", { x: 1, y: 2 }],
        ["hidden", { x: 3, y: 4 }],
        ["dead", { x: 5, y: 6 }],
      ]),
      otherPlayersPrevHp: new Map([
        ["alive", 30],
        ["dead", 0],
      ]),
      otherPlayersAnim: new Map([["alive", { crown: 80 }]]),
    });

    scene.followAuras(900);
    // the player falls: their own aura stops with the death clip
    (scene.lastGameState as { current_player: { current_health: number } }).current_player.current_health = 0;
    scene.followAuras(916);

    expect(follow.mock.calls).toEqual([
      ["self", ownPos, 76, 900],
      ["alive", { x: 1, y: 2 }, 80, 900],
      ["hidden", null, undefined, 900],
      ["dead", null, undefined, 900],
      ["self", null, 76, 916],
      ["alive", { x: 1, y: 2 }, 80, 916],
      ["hidden", null, undefined, 916],
      ["dead", null, undefined, 916],
    ]);
  });
});

// FS-X2CMM §I R47–R48 (I-X2CMM-12): the run draws the book's witchlights, runes and draughts and every body's
// book states from the state, for every viewer; E drinks a draught in reach by its id; a witchlight lifts the
// fog (exploration.test.ts, bookEffects.test.ts and bookStates.test.ts hold the rules).
describe("BarrowspireScene the class book's world effects and states (FS-X2CMM §I R47–R48)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type Effect = import("@/types/gameState").BookEffectState;
  const effect = (id: string, kind: string, x: number, y = 300): Effect => ({ id, kind, x, y, remaining: 10 });

  function bookOnStage() {
    const stage = onStage();
    const run = stage.run as unknown as FloorRun & { bindRunInput(): void; leaveFloor(): void };
    const keyHandlers: Record<string, () => void> = {};
    Object.assign(run, {
      input: {
        setDefaultCursor: vi.fn(),
        keyboard: { on: (event: string, fn: () => void) => (keyHandlers[event] = fn) },
        on: vi.fn(),
      },
    });
    run.bindRunInput();
    const named = (prefix: string) =>
      stage.stage.made.filter((m) => String((m as { name?: string }).name ?? "").startsWith(prefix));
    const live = (prefix: string) => named(prefix).filter((m) => !m.destroyed);
    const interacts = () => stage.sent.mock.calls.filter(([a]) => a === ActionType.Interact);
    return { ...stage, run, named, live, interacts, pressE: () => keyHandlers["keydown-E"]() };
  }

  it("should draw a witchlight, a rune and a draught from the state, and take each away the state it goes", () => {
    const { run, live, named } = bookOnStage();
    run.handleGameStateUpdate({
      ...partyState(),
      book_effects: [effect("w1", "witchlight", 400), effect("r1", "rune", 500), effect("d1", "draught", 600)],
    } as GameState);
    expect(live("book:w1:").map((m) => (m as { name?: string }).name)).toEqual(["book:w1:body", "book:w1:halo"]);
    expect(live("book:r1:").map((m) => (m as { name?: string }).name)).toEqual(["book:r1:ground", "book:r1:halo"]);
    expect(live("book:d1:").map((m) => (m as { name?: string }).name)).toEqual(["book:d1:body"]);

    run.handleGameStateUpdate({ ...partyState(), book_effects: [effect("r1", "rune", 500)] } as GameState);
    expect(named("book:w1:").every((m) => m.destroyed)).toBe(true);
    expect(named("book:d1:").every((m) => m.destroyed)).toBe(true);
    expect(live("book:r1:")).toHaveLength(2);

    run.leaveFloor();
    expect(named("book:r1:").every((m) => m.destroyed)).toBe(true);
  });

  it("should drink a draught within the interact reach with E, by its id, and send nothing for one past it", () => {
    const near = bookOnStage();
    near.run.handleGameStateUpdate({ ...partyState(), book_effects: [effect("d1", "draught", 140)] } as GameState);
    near.pressE();
    expect(near.interacts()).toEqual([[ActionType.Interact, { entity_id: "d1" }]]);
    vi.restoreAllMocks();

    const far = bookOnStage();
    far.run.handleGameStateUpdate({ ...partyState(), book_effects: [effect("d1", "draught", 230)] } as GameState);
    far.pressE();
    expect(far.interacts().filter(([, p]) => (p as { entity_id: string }).entity_id === "d1")).toEqual([]);
  });

  // FS-X2CMM §I R47 (I-X2CMM-13): the hound is a body drawn by its own set (hounds.test.ts holds its rules)
  it("should draw a hound from the state as a body with its bar and ring, not as a book effect's layers, and take it away with the floor", () => {
    const { run, live, named } = bookOnStage();
    const hound = { ...effect("h1", "hound", 400), owner_id: "me", health: 40, max_health: 40, action: "run" as const };
    run.handleGameStateUpdate({ ...partyState(), book_effects: [hound] } as GameState);
    expect(live("book:h1:")).toEqual([]);
    expect(live("hound:").map((m) => (m as { name?: string }).name).sort()).toEqual(["hound:bar", "hound:bay", "hound:body", "hound:ring"]);
    expect(live("hound:ring")[0].depth).toBe(TRAIL_BED_DEPTH);
    // its bay's mark lies on the floor as its ring does (FS-X2CMM §J R49)
    expect(live("hound:bay")[0].depth).toBe(TRAIL_BED_DEPTH);

    run.leaveFloor();
    expect(named("hound:").every((m) => m.destroyed)).toBe(true);
  });

  it("should draw the player's and a teammate's book states on their bodies, and take them away when they go", () => {
    const { run, live, named } = bookOnStage();
    const me = { ...player("me", "Aldric", 130), book_states: [{ name: "afloat", remaining: 8 }] };
    const ally = { ...player("ally", "Wenna", 160), book_states: [{ name: "hardened", remaining: 10 }] };
    run.handleGameStateUpdate(partyState(me, ally));
    expect(live("book:self:afloat:")).toHaveLength(1);
    expect(live("book:ally:hardened:")).toHaveLength(1);

    run.handleGameStateUpdate(partyState(player("me", "Aldric", 130), player("ally", "Wenna", 160)));
    expect(named("book:self:afloat:").every((m) => m.destroyed)).toBe(true);
    expect(named("book:ally:hardened:").every((m) => m.destroyed)).toBe(true);
  });
});

// FS-5FZ4J §I R49, §J R53 (I-5FZ4J-9): a sealed floor's replies are HUD notices in their tones, never lore lines.
describe("BarrowspireScene a sealed floor's replies (FS-5FZ4J §J R53)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function replying() {
    const listeners = new Map<string, (payload: unknown) => void>();
    vi.spyOn(socketManager, "on").mockImplementation((action, cb) => void listeners.set(action, cb));
    vi.spyOn(socketManager, "onError").mockImplementation(() => {});
    vi.spyOn(socketManager, "off").mockImplementation(() => {});
    vi.spyOn(socketManager, "isConnected").mockReturnValue(true);
    vi.spyOn(socketManager, "onConnectionStatusChange").mockReturnValue(() => {});
    vi.spyOn(socketManager, "onGameStateUpdate").mockReturnValue(() => {});
    const run = new BarrowspireScene() as unknown as {
      init(data?: object): void;
      connectToServer(): void;
      showNotification(text: string, backing: number): void;
      lastGameState?: Partial<GameState>;
    };
    run.init({ sessionID: "run-a" });
    const notified = vi.spyOn(run, "showNotification").mockImplementation(() => {});
    const said = loreOf(run).said;
    run.connectToServer();
    return { run, notified, said, reply: (payload: unknown) => listeners.get("interact")?.(payload) };
  }

  it("should say a sealed stair's refusal by the seal's kind as a refused notice, and no lore line", () => {
    const { run, notified, said, reply } = replying();
    run.lastGameState = { seal: { kind: "hidden_key", stage: 1, stages: 1, broken: false } };
    reply({ success: false, message: "the stairs are sealed", reason: "stairs_sealed" });
    expect(notified.mock.calls).toEqual([["Sealed. The Hidden Key holds it.", palette.damageBright]]);
    expect(said).not.toHaveBeenCalled();
  });

  // FS-5FZ4J §G R43 (I-5FZ4J-11)
  it("should say nothing, notice or lore, for a hallowed altar already prayed at", () => {
    const { notified, said, reply } = replying();
    reply({ success: false, message: "the altar has been prayed at", reason: "altar_prayed" });
    expect(notified).not.toHaveBeenCalled();
    expect(said).not.toHaveBeenCalled();
  });

  it("should read the mural's glyphs, and turn the shrine's line with each reading", () => {
    const { notified, reply } = replying();
    reply({ success: true, reason: "mural", glyphs: ["eye", "key"] });
    reply({ success: true, reason: "shrine" });
    reply({ success: true, reason: "shrine" });
    const [mural, first, second] = notified.mock.calls;
    expect(mural).toEqual(["The mural shows: Eye, Key.", palette.hudPanel]);
    expect(first[0]).not.toBe(second[0]);
  });
});
