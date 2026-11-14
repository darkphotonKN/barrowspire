import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EventEmitter } from "eventemitter3";

// Only the UI scene's own config and its fit are under test: a Phaser stand-in whose Scene records
// the config it was made with, and the scene plugin base ViewportFit extends.
vi.mock("phaser", () => {
  class Scene {
    static configs: unknown[] = [];
    constructor(config: unknown) {
      Scene.configs.push(config);
    }
  }
  class ScenePlugin {
    systems: unknown;
    constructor(scene: { sys: unknown }) {
      this.systems = scene.sys;
    }
  }
  const phaser = {
    Scene,
    Plugins: { ScenePlugin },
    Scenes: { Events: { READY: "ready", DESTROY: "destroy", SHUTDOWN: "shutdown", SLEEP: "sleep", WAKE: "wake" } },
    Input: {
      Keyboard: {
        // Phaser's JustDown: true once per press, and reading it clears the press
        JustDown: (key: { justDown: boolean }) => {
          const pressed = key.justDown;
          key.justDown = false;
          return pressed;
        },
        KeyCodes: { ESC: 27, ENTER: 13, ONE: 49, TWO: 50, THREE: 51, LEFT: 37, RIGHT: 39, E: 69 },
      },
    },
  };
  return { ...phaser, default: phaser };
});

// The party panel itself is PartyPanel.test's: here a recording stand-in for what the UI scene mounts
// for each world (FS-TQZ5J § Change: Phase 2: the party, R36), its refusal, opening and wrapper kept.
const partyMounts = vi.hoisted(
  () =>
    [] as {
      blocked: () => boolean;
      opening?: () => void;
      wrapper?: { act(run: () => void): void };
      open: boolean;
      destroyed: boolean;
      keeps: boolean;
    }[],
);
vi.mock("@/ui/PartyPanel", () => ({
  mountPartyPanel: (_scene: unknown, blocked: () => boolean, opening?: () => void, wrapper?: { act(run: () => void): void }) => {
    const panel = { blocked, opening, wrapper, open: false, destroyed: false, keeps: false };
    partyMounts.push(panel);
    return {
      isOpen: () => panel.open,
      close: () => {
        const was = panel.open;
        panel.open = false;
        return was;
      },
      toggle: () => {
        if (!panel.blocked()) panel.open = !panel.open;
      },
      relayout: () => {},
      keepsField: () => panel.keeps,
      destroy: () => void (panel.destroyed = true),
    };
  },
}));

const Phaser = await import("phaser");
const { UIScene } = await import("./UIScene");
const { UI_SCENE } = await import("@/components/uiSceneLifecycle");
const { ViewportFit } = await import("@/render/viewport/ViewportFit");
const { fitGame, viewport } = await import("@/render/viewport");
const { Viewport } = await import("@/render/viewport/viewport");
const { GameUiBridge, NO_FACTS, lendUiBridge } = await import("@/ui/uiBridge");
const { cornerIconFrame } = await import("@/ui/hudCornerLayout");

/** A camera that records its size and zoom as the viewport fits it. */
function camera() {
  const fitted: string[] = [];
  const cam = {
    width: 0,
    height: 0,
    zoomX: 1,
    displayWidth: 1080,
    displayHeight: 720,
    scrollX: 0,
    scrollY: 0,
    roundPixels: true,
    renderRoundPixels: true,
    useBounds: false,
    setSize: (w: number, h: number) => void fitted.push(`size ${w}x${h}`),
    setZoom: (z: number) => void fitted.push(`zoom ${z}`),
    setOrigin: () => undefined,
    setBounds: () => undefined,
    setScroll: () => undefined,
    setFollowOffset: () => undefined,
    startFollow: () => undefined,
    clampX: (x: number) => x,
    clampY: (y: number) => y,
    preRender: () => undefined,
    getViewMatrix: () => ({ translate: () => undefined }),
    matrixCombined: { translate: () => undefined },
  };
  return { cam, fitted };
}

describe("UIScene (FS-TQZ5J R1, R6)", () => {
  const before = viewport.current();
  afterEach(() => viewport.set(before));

  it("should be the scene keyed UIScene, and name no scene plugins of its own: the game's, ViewportFit among them, are its (R1, R6)", () => {
    const configs = (Phaser.Scene as unknown as { configs: unknown[] }).configs;

    new UIScene();

    // a `plugins` list in a scene's config replaces the game's default scene plugins
    // (Phaser 4.2.1 scene/GetScenePlugins.js), so the UI scene would go unfitted
    expect(configs.at(-1)).toEqual({ key: UI_SCENE });
    expect(UI_SCENE).toBe("UIScene");
  });

  it("should have its camera fitted as it starts, and re-fitted on a render-scale change while it sleeps (R6)", () => {
    const { cam, fitted } = camera();
    const sys = { events: new EventEmitter(), cameras: { main: cam } };
    viewport.set({ width: 1080, height: 720, renderScale: 1.5 });
    new ViewportFit({ sys } as never, {} as never, "viewportFit").boot();

    sys.events.emit("ready");
    expect(fitted).toEqual(["size 1620x1080", "zoom 1.5"]);

    // fitGame re-fits every scene in the game's list, a sleeping one included (getScenes(false))
    const view = new Viewport();
    fitGame(
      {
        scale: { resize: () => undefined, setZoom: () => undefined },
        scene: {
          getScenes: (isActive: boolean) =>
            isActive ? [] : [{ sys: { settings: { status: 7 } }, cameras: { main: cam } }],
        },
      },
      view,
    );
    view.set({ width: 1080, height: 720, renderScale: 2 });

    expect(fitted.slice(2)).toEqual(["size 2160x1440", "zoom 2"]);
  });
});

// FS-TQZ5J R22: the game's one UiSounds is the UI scene's, made as it is created and lent to its
// game's UI bridge, which the worlds' player actions and their minimap's step reach it through
describe("the UI scene's interface sounds (FS-TQZ5J R22, FS-WDM0X S10–S13)", () => {
  /** The UI scene on its game: the registry with the bridge lent, the game's audio cache and sound. */
  function created() {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const added: string[] = [];
    const played: string[] = [];
    // the corner row it builds for the world reported, on a factory that makes anything
    const any: unknown = new Proxy(() => any, { get: (_t, prop) => (prop === "then" ? undefined : () => any) });
    const scene = Object.assign(new UIScene(), {
      registry,
      events: new EventEmitter(),
      add: any,
      cache: { audio: { exists: (key: string) => key.startsWith("sfx:") } },
      sound: {
        locked: false,
        context: { state: "running" },
        get: () => null,
        add: (key: string) => (added.push(key), { play: () => (played.push(key), true) }),
      },
    });
    scene.create();
    return { bridge, added, played };
  }

  it("should make the game's one player as it is created, lent to its game's bridge: a world's action and its minimap's step play on it", () => {
    const { bridge, played } = created();
    let open = false;
    const closed = { letter: false, character: false };
    bridge.report({
      world: "field",
      windows: () => ({ ...closed, inventory: open }),
      blockers: () => ({ dialogue: false }),
      facts: () => NO_FACTS,
      answer: () => {},
    });

    bridge.act(() => void (open = true));
    bridge.play("map_mode_switch");

    expect(played).toEqual(["sfx:inventory_open", "sfx:map_mode_switch"]);
  });
});

// FS-TQZ5J R8, R9 and the acceptance criterion "no scene calls another": each world scene reports
// its world as its create runs, and the UI scene knows only the bridge. Pinned from the source, as
// the world scenes' create order is pinned in their own tests.
describe("the worlds and the UI scene know only the UI bridge (FS-TQZ5J R8, R9)", () => {
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  const createOf = (file: string) =>
    source(file).match(/\n {2}create\(\): void \{\n([\s\S]*?)\n {2}\}\n/)?.[1] ?? "";

  it.each([
    ["./HubScene.ts", "hub"],
    ["./FieldScene.ts", "field"],
    ["./BarrowspireScene.ts", "run"],
  ])("should have %s report its world, %s, in create", (file, world) => {
    expect(createOf(file)).toContain(`this.ui = reportWorld(this, "${world}", this.worldSide());`);
  });

  // FS-TQZ5J § Acceptance Criteria: the world scenes no longer construct UiSounds (R22)
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s construct no UiSounds and keep no player of its own",
    (file) => {
      expect(source(file)).not.toMatch(/new UiSounds\(|mountUiSounds|this\.sounds\b/);
    },
  );

  // FS-TQZ5J R13, R15 and § Acceptance Criteria: the corner row is the UI scene's; no world builds it,
  // tests its rect in a click path, or leaves its Menu plate through its blocker
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s construct no HudCorner and read no corner row",
    (file) => {
      expect(source(file)).not.toMatch(/HudCorner|this\.corner\b|mountCorner/);
    },
  );

  // FS-TQZ5J R16, R21 and § Acceptance Criteria: the ESC menu, OPTIONS and Esc are the UI scene's; no
  // world builds them, binds Esc by event or by key, or settles a key's owner by stopping it
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s construct no menu panel or OPTIONS panel and bind no Esc",
    (file) => {
      const code = source(file);
      expect(code).not.toMatch(/showMenuPanel\(|openOptionsPanel\(|this\.menu\b|menuChoices|moveMenu/);
      expect(code).not.toMatch(/keydown-ESC|KeyCodes\.ESC/);
    },
  );

  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts", "./UIScene.ts", "../ui/uiSceneMenu.ts", "../ui/uiSceneDialogue.ts"])(
    "should have %s stop no key event to settle who answers it (R21)",
    (file) => {
      expect(source(file)).not.toMatch(/stopPropagation|stopImmediatePropagation/);
    },
  );

  // FS-TQZ5J A2 § Acceptance Criteria (I-TQZ5J-8): no world scene draws a notice of its own; each says it
  // through the bridge (the run's tone a backing colour, data)
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])("should have %s draw no notice of its own", (file) => {
    expect(source(file)).not.toMatch(/NOTICE_Y|NOTICE_MS|const notification = this\.add|this\.time\.delayedCall\(NOTICE/);
    expect(source(file)).toMatch(/this\.ui\.notice\(/);
  });

  // FS-TQZ5J A2 § Acceptance Criteria (I-TQZ5J-7): the town no longer draws its dialogue card
  it("should have the town draw no dialogue card of its own: it shows its dialogue through the bridge", () => {
    expect(source("./HubScene.ts")).not.toMatch(/showDialogueCard|npcDialogue/);
  });

  // FS-TQZ5J § Change: Phase 2: the party (I-TQZ5J-9): the party panel and T are the UI scene's; no world
  // mounts the panel, binds T or tests the panel's rect in a click or hover path
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s mount no party panel, bind no T and test no party panel's rect",
    (file) => {
      const code = source(file);
      expect(code).not.toMatch(/PartyPanel|mountPartyPanel|this\.partyPanel\b/);
      expect(code).not.toMatch(/keydown-T\b|KeyCodes\.T\b/);
    },
  );

  it("should have the UI scene build the party panel for each world it hears reported (§ Change: Phase 2: the party, R36)", () => {
    const code = source("./UIScene.ts");
    expect(code).toMatch(/new UiPartySlot\(/);
    expect(code).toMatch(/mountPartyPanel\(this,/);
    expect(code).toMatch(/party\.show\(report\)/);
  });

  it("should have the UI scene import no other scene", () => {
    const imports = source("./UIScene.ts").match(/from "[^"]+"/g) ?? [];
    expect(imports.filter((from) => /Scene"$/.test(from))).toEqual([]);
  });
});

// FS-TQZ5J §C R13–R15 (I-TQZ5J-3): the corner row is the UI scene's own, built as it is created from
// the world reported then, rebuilt on each world's report, taken down as the world leaves, and held
// each frame under the town's dialogue; the ESC menu, its own since I-TQZ5J-4, stands in the same scene.
describe("the UI scene's corner row (FS-TQZ5J R6, R13; I-TQZ5J-3)", () => {
  type Obj = Record<string, unknown>;
  interface Zone {
    x: number;
    y: number;
    handlers: Record<string, () => void>;
    enabled: boolean;
    destroyed: boolean;
  }
  interface Label {
    words: string;
    resolution: number;
    destroyed: boolean;
  }

  /** The UI scene on its game, on a stand-in for Phaser's factory that keeps a display list. */
  function created(world?: "hub" | "field" | "run") {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const windows = { letter: false, inventory: false, character: false };
    const blockers = { dialogue: false };
    const facts = { ...NO_FACTS };
    const asked: string[] = [];
    const report = (w: "hub" | "field" | "run") =>
      bridge.report({
        world: w,
        windows: () => windows,
        blockers: () => blockers,
        facts: () => facts,
        answer: (request) => void asked.push(request.kind === "pickDialogue" ? `pickDialogue ${request.id}` : request.kind),
      });
    if (world) report(world);
    const list: unknown[] = [];
    const zones: Zone[] = [];
    const labels: Label[] = [];
    /** Anything else it makes: every call returns it, chained. */
    const any = (): unknown => {
      const self: unknown = new Proxy(() => self, {
        get: (_t, prop) => (prop === "then" ? undefined : () => self),
      });
      list.push(self);
      return self;
    };
    const zone = (x: number, y: number) => {
      const z: Zone = { x, y, handlers: {}, enabled: false, destroyed: false };
      zones.push(z);
      const self: Obj = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "on") return (event: string, fn: () => void) => ((z.handlers[event] = fn), self);
            if (prop === "setInteractive") return () => ((z.enabled = true), self);
            if (prop === "disableInteractive") return () => ((z.enabled = false), self);
            if (prop === "setPosition") return (nx: number, ny: number) => ((z.x = nx), (z.y = ny), self);
            if (prop === "destroy") return () => void (z.destroyed = true);
            return () => self;
          },
        },
      );
      list.push(self);
      return self;
    };
    const text = (_x: number, _y: number, words: string) => {
      const l: Label = { words, resolution: 1, destroyed: false };
      labels.push(l);
      const self: Obj = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "width") return words.length * 6;
            if (prop === "style") return { resolution: l.resolution };
            if (prop === "setResolution") return (r: number) => ((l.resolution = r), self);
            if (prop === "destroy") return () => void ((l.destroyed = true), list.splice(list.indexOf(self), 1));
            return () => self;
          },
        },
      );
      list.push(self);
      return self;
    };
    const events = new EventEmitter();
    const sys = { settings: { status: 5 } };
    const timers: { ms: number; fn: () => void }[] = [];
    const tweens: object[] = [];
    // its keyboard: the keys it adds, each with whether it captured it, and the game's captures
    const keys = new Map<number, { justDown: boolean; captured: boolean }>();
    const captures = new Set<number>();
    const keyboard = {
      addKey: (code: number, capture = true) => {
        const key = { justDown: false, captured: capture };
        keys.set(code, key);
        if (capture) captures.add(code);
        return key;
      },
      addCapture: (code: number) => void captures.add(code),
      removeCapture: (code: number) => void captures.delete(code),
    };
    const scene = Object.assign(new UIScene(), {
      registry,
      events,
      sys,
      input: Object.assign(new EventEmitter(), { keyboard, manager: { pointers: [] } }),
      cameras: { cameras: [] },
      children: { list },
      add: new Proxy({}, { get: (_t, kind) => (kind === "zone" ? zone : kind === "text" ? text : any) }),
      // its own clock and tweens, which its notices keep time on (A2 R33)
      time: { delayedCall: (ms: number, fn: () => void) => (timers.push({ ms, fn }), { remove: () => {} }) },
      tweens: { add: (config: object) => (tweens.push(config), { remove: () => {} }) },
      cache: { audio: { exists: () => false } },
      sound: { locked: false, context: { state: "running" }, get: () => null, add: () => ({ play: () => true }) },
    });
    scene.create();
    const live = () => zones.filter((z) => !z.destroyed);
    const plate = (icon: "menu" | "inventory" | "character" | "party" | "mail") => {
      const f = cornerIconFrame(icon, viewport);
      return live().find((z) => z.x === f.x && z.y === f.y);
    };
    /** A key pressed since the last frame, then the frame. */
    const press = (code: number) => {
      keys.get(code)!.justDown = true;
      scene.update();
    };
    return { scene, bridge, report, windows, blockers, facts, asked, events, sys, live, plate, labels, keys, captures, press, timers, tweens };
  }

  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should build the row of the world reported as it is created: the town's four, no Mailbox of its own", () => {
    const { live, plate } = created("hub");

    expect(live()).toHaveLength(4);
    expect(plate("mail")).toBeUndefined();
  });

  it("should build each later world's row on its report, and take the row down as it leaves", () => {
    const { bridge, report, live, plate } = created("hub");
    bridge.left("hub");
    expect(live()).toEqual([]);

    report("field");

    expect(live()).toHaveLength(5);
    expect(plate("mail")).toBeDefined();
  });

  it("should build nothing as it is created with no world reported", () => {
    const { live } = created();

    expect(live()).toEqual([]);
  });

  it("should hold no icon while its own menu is open: the menu's blocker over the row takes them (FS-3EBCA R18)", () => {
    const { bridge, plate } = created("run");
    plate("menu")!.handlers.pointerdown();
    expect(bridge.ui.menuOpen).toBe(true);

    expect(plate("inventory")!.enabled).toBe(true);
    plate("menu")!.handlers.pointerdown();
    expect(bridge.ui.menuOpen).toBe(false);
  });

  it("should hold no icon on its update while the town reports a dialogue open: the card over the row takes its rows by depth (A2 R32)", () => {
    const { scene, blockers, live } = created("hub");
    blockers.dialogue = true;
    scene.update();

    expect(live().every((z) => z.enabled)).toBe(true);
  });

  it("should stop hearing the worlds with the game: a report after its destroy builds nothing (R4)", () => {
    const { bridge, report, events, live } = created("hub");
    events.emit("destroy");
    expect(live()).toEqual([]);
    bridge.left("hub");

    report("field");

    expect(live()).toEqual([]);
  });

  it("should stand the row in the new corner when the view widens (R6; FS-ZAJMH R13)", () => {
    const { plate } = created("field");

    viewport.set({ width: 1280, height: 720, renderScale: 1 });

    expect(plate("menu")?.x).toBe(1280 - 16 - 54);
  });

  // crispen walks every scene started and not stopped (50c41e6b): the row's label, left showing as
  // the UI scene is held under the disconnect notice or put to sleep, is rasterised again at a
  // render scale set meanwhile, so it is sharp as the scene resumes or wakes
  it.each([
    ["paused under the disconnect notice", 6],
    ["asleep", 7],
  ])("should have the row's label rasterised again at a new render scale while the UI scene is %s (R6)", (_how, status) => {
    const { scene, sys, plate, labels } = created("hub");
    plate("inventory")!.handlers.pointerover();
    expect(labels.filter((l) => !l.destroyed).map((l) => l.words)).toEqual(["Inventory (I)"]);
    sys.settings.status = status;
    const view = new Viewport();
    fitGame(
      {
        scale: { resize: () => undefined, setZoom: () => undefined },
        scene: { getScenes: () => [scene as never] },
      },
      view,
    );

    view.set({ width: 1080, height: 720, renderScale: 2 });

    expect(labels.find((l) => !l.destroyed)!.resolution).toBe(2);
  });

  // FS-TQZ5J §D R16–R21 (I-TQZ5J-4): the ESC menu, OPTIONS and the Fall confirm stand in the UI scene's
  // one slot (uiSceneMenu.ts holds its rules); the scene reads Esc and the menu's keys from its own key
  // objects once a frame in its update, never on a key event, and captures Esc only while awake.
  describe("the UI scene's menu slot and keys (FS-TQZ5J R16–R21; I-TQZ5J-4)", () => {
    const ESC = 27;
    const ENTER = 13;
    const ONE = 49;

    it("should add Esc captured, and Enter, 1–3, ←/→ and E uncaptured: the worlds that use those capture them (R21, A2 R31)", () => {
      const { keys } = created("hub");

      expect([...keys.entries()].map(([code, key]) => [code, key.captured])).toEqual([
        [ESC, true],
        [ENTER, false],
        [49, false],
        [50, false],
        [51, false],
        [37, false],
        [39, false],
        [69, false],
      ]);
    });

    it("should hand Esc's capture back as it sleeps and take it again as it wakes", () => {
      const { events, captures } = created("hub");

      events.emit("sleep");
      expect(captures.has(ESC)).toBe(false);
      events.emit("wake");
      expect(captures.has(ESC)).toBe(true);
    });

    it("should open the world's menu on an Esc read in its update, the slot reported filled (R10, R17)", () => {
      const { bridge, press } = created("field");

      press(ESC);

      expect(bridge.ui.menuOpen).toBe(true);
      press(ESC);
      expect(bridge.ui.menuOpen).toBe(false);
    });

    it("should ask the world for a row on its key while the menu is open, and act on none while it is shut (R18)", () => {
      const { asked, press } = created("hub");

      press(ENTER);
      press(ONE);
      expect(asked).toEqual([]);

      press(ESC);
      press(ONE);
      expect(asked).toEqual(["changeCharacter"]);
    });

    it("should yield its menu as the world reports the player's state changed (R20)", () => {
      const { bridge, facts, press } = created("run");
      press(ESC);

      facts.resolved = true;
      bridge.changed();

      expect(bridge.ui.menuOpen).toBe(false);
    });

    it("should close its menu as the world leaves, with the row", () => {
      const { bridge, press, plate } = created("hub");
      press(ESC);

      bridge.left("hub");

      expect(bridge.ui.menuOpen).toBe(false);
      expect(plate("menu")).toBeUndefined();
    });
  });

  // FS-TQZ5J Amendment A2 R29–R32 (I-TQZ5J-7): the town's NPC dialogue card is the UI scene's, drawn
  // from the data the town shows through the bridge (uiSceneDialogue.ts holds its rules); E, Enter and
  // 1–3 on a shown card are read here once a frame, as the menu's keys are; Esc's step dismisses it.
  describe("the UI scene's dialogue card and its keys (FS-TQZ5J A2 R29–R32; I-TQZ5J-7)", () => {
    const ENTER = 13;
    const TWO = 50;
    const E = 69;
    const ESC = 27;
    const door = {
      speaker: { name: "The Spire's door" },
      text: "The Spire's door stands open.",
      options: [
        { id: "solo", label: "Descend alone", register: "actionable" as const, enabled: true },
        { id: "queue", label: "Wait for company", register: "actionable" as const, enabled: true },
        { id: "dismiss", label: "Not yet", register: "cancel" as const, enabled: true },
      ],
    };

    it("should pick the shown card's first row on E or Enter read in its update, and its second on 2 (A2 R31)", () => {
      const { bridge, blockers, asked, press } = created("hub");
      bridge.showDialogue(door);
      blockers.dialogue = true;

      press(E);
      press(ENTER);
      press(TWO);

      expect(asked).toEqual(["pickDialogue solo", "pickDialogue solo", "pickDialogue queue"]);
    });

    it("should act on E, Enter or a number with no card shown not at all", () => {
      const { asked, press } = created("hub");

      press(E);
      press(ENTER);
      press(TWO);

      expect(asked).toEqual([]);
    });

    it("should ask the town to close its card on Esc, and open no menu (R17)", () => {
      const { bridge, blockers, asked, press } = created("hub");
      bridge.showDialogue(door);
      blockers.dialogue = true;

      press(ESC);

      expect(asked).toEqual(["close"]);
      expect(bridge.ui.menuOpen).toBe(false);
    });

    it("should take the card down as the town closes it, and as the town leaves: its keys then answer nothing", () => {
      const { bridge, report, asked, press } = created("hub");
      bridge.showDialogue(door);
      bridge.closeDialogue();
      press(E);
      bridge.showDialogue(door);
      bridge.left("hub");
      report("hub");

      press(E);

      expect(asked).toEqual([]);
    });
  });

  // FS-TQZ5J Amendment A2 R33, R34 (I-TQZ5J-8): the worlds' screen notices are the UI scene's, drawn as
  // each world says them through the bridge (uiSceneNotices.ts holds their look and timing), on its own
  // clock, and taken down as the world that said them leaves.
  describe("the UI scene's notices (FS-TQZ5J A2 R33, R34; I-TQZ5J-8)", () => {
    const shown = (labels: { words: string; destroyed: boolean }[]) => labels.filter((l) => !l.destroyed).map((l) => l.words);

    it("should draw a notice the world says, timed on its own clock and tweens", () => {
      const { bridge, labels, timers, tweens } = created("hub");

      bridge.notice({ text: "A line.", look: { world: "hub" } });
      bridge.notice({ text: "Escape door opened!", look: { world: "run", backing: 0x3a7d44 } });

      expect(shown(labels)).toEqual(["A line.", "Escape door opened!"]);
      expect(timers.map((t) => t.ms)).toEqual([3200]);
      expect(tweens).toHaveLength(1);
      timers[0].fn();
      expect(shown(labels)).toEqual(["Escape door opened!"]);
    });

    it("should take a world's notices down as it leaves: none is standing in the next world", () => {
      const { bridge, report, labels } = created("hub");
      bridge.notice({ text: "A line.", look: { world: "hub" } });

      bridge.left("hub");
      report("field");

      expect(shown(labels)).toEqual([]);
    });

    it("should stop hearing the worlds' notices with the game (R4)", () => {
      const { bridge, events, labels } = created("hub");
      events.emit("destroy");

      bridge.notice({ text: "A line.", look: { world: "hub" } });

      expect(shown(labels)).toEqual([]);
    });
  });
});

// FS-TQZ5J Amendment A1 (I-TQZ5J-6): the UI scene's pointer beside the worlds', wired to Phaser's own
// scene-wide events on its input. The rules are uiScenePointer.ts's; the harness proves them against
// real Phaser 4.2.1.
describe("the UI scene's pointer beside the worlds' (FS-TQZ5J A1 R25–R27)", () => {
  /** The UI scene on its game, its input and cameras stand-ins, a world reported that hears moves. */
  function created() {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const heard: string[] = [];
    bridge.report({
      world: "run",
      windows: () => ({ letter: false, inventory: false, character: false }),
      blockers: () => ({ dialogue: false }),
      facts: () => NO_FACTS,
      answer: () => {},
      hearMove: (_pointer, onUi) => void heard.push(onUi ? "over the UI" : "off it"),
    });
    const any: unknown = new Proxy(() => any, { get: (_t, prop) => (prop === "then" ? undefined : () => any) });
    const pointer = { x: 900, y: 680, isDown: false, event: {} as object };
    const input = Object.assign(new EventEmitter(), { manager: { pointers: [pointer] } });
    const cameras = { cameras: [{ inputEnabled: true }] };
    // the game's text field inside the frame, holding focus
    const field = { blurred: false, blur: () => void (field.blurred = true) };
    const holder = { contains: (el: unknown) => el === field };
    const body = {};
    vi.stubGlobal("document", { activeElement: field, body, documentElement: {} });
    const scene = Object.assign(new UIScene(), {
      registry,
      events: new EventEmitter(),
      add: any,
      input,
      cameras,
      game: { canvas: { parentElement: holder } },
      cache: { audio: { exists: () => false } },
      sound: { locked: false, context: { state: "running" }, get: () => null, add: () => ({ play: () => true }) },
    });
    scene.create();
    return { scene, input, cameras, pointer, field, heard };
  }

  afterEach(() => void vi.unstubAllGlobals());

  it("should take its cameras out of the hit test for a press begun in the world, and put them back as it ends (R25)", () => {
    const { input, cameras, pointer } = created();

    pointer.isDown = true;
    input.emit("pointerdown", pointer, []);
    expect(cameras.cameras[0].inputEnabled).toBe(false);

    pointer.isDown = false;
    input.emit("pointerup", pointer, []);
    expect(cameras.cameras[0].inputEnabled).toBe(true);

    pointer.isDown = true;
    input.emit("pointerdown", pointer, []);
    pointer.isDown = false;
    input.emit("pointerupoutside", pointer);
    expect(cameras.cameras[0].inputEnabled).toBe(true);
  });

  it("should put them back on a frame with no button down", () => {
    const { scene, input, cameras, pointer } = created();
    pointer.isDown = true;
    input.emit("pointerdown", pointer, []);
    pointer.isDown = false;

    scene.update();

    expect(cameras.cameras[0].inputEnabled).toBe(true);
  });

  // FS-TQZ5J § Change: Phase 2: the party, R42: the party panel keeps its own field by its own rule
  it("should keep the game's text field for a press the party panel says keeps it, and let it go for any other (R42)", () => {
    const { input, pointer, field } = created();
    const panel = partyMounts.at(-1)!;

    panel.keeps = true;
    input.emit("pointerdown", pointer, [{ name: "the party panel's ground" }]);
    expect(field.blurred).toBe(false);
    panel.keeps = false;
    input.emit("pointerdown", pointer, [{ name: "the Party icon" }]);

    expect(field.blurred).toBe(true);
  });

  it("should let go of the game's focused text field for a press on one of its pieces (R26)", () => {
    const { input, pointer, field } = created();

    input.emit("pointerdown", pointer, [{ name: "the Party icon" }]);

    expect(field.blurred).toBe(true);
  });

  it("should hand the reported world a move over one of its pieces, and one leaving it (R27)", () => {
    const { input, pointer, heard } = created();

    input.emit("pointermove", pointer, [{ name: "the Party icon" }]);
    pointer.event = {};
    input.emit("pointermove", pointer, []);
    input.emit("pointerout", pointer, [{ name: "the Party icon" }]);

    expect(heard).toEqual(["over the UI", "off it"]);
  });
});
