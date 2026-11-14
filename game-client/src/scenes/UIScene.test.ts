import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EventEmitter } from "eventemitter3";
import type { RecordView } from "@/ui/settlement";

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
        KeyCodes: { ESC: 27, ENTER: 13, ONE: 49, TWO: 50, THREE: 51, LEFT: 37, RIGHT: 39, E: 69, I: 73, B: 66, C: 67 },
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
      play?: (effect: string) => void;
      covered?: (field: { x: number; y: number; width: number; height: number }) => boolean;
    }[],
);
vi.mock("@/ui/PartyPanel", () => ({
  mountPartyPanel: (
    _scene: unknown,
    {
      blocked,
      opening,
      wrapper,
      play,
      covered,
    }: {
      blocked: () => boolean;
      opening?: () => void;
      wrapper?: { act(run: () => void): void };
      play?: (effect: string) => void;
      covered?: (field: { x: number; y: number; width: number; height: number }) => boolean;
    },
  ) => {
    const panel = { blocked, opening, wrapper, open: false, destroyed: false, keeps: false, play, covered };
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

// The invite prompt and the ready check themselves are their own tests': here recording stand-ins for
// what the UI scene mounts for each world (§ Change: Phase 2: the party, R36), their wiring kept.
const popupMounts = vi.hoisted(
  () =>
    [] as {
      kind: "prompt" | "ready";
      hidden: () => boolean;
      floor?: () => number | undefined;
      destroyed: boolean;
      play?: (effect: string) => void;
    }[],
);
vi.mock("@/ui/PartyInvitePrompt", () => ({
  mountPartyInvitePrompt: (
    _scene: unknown,
    hidden: () => boolean,
    floor?: () => number | undefined,
    play?: (effect: string) => void,
  ) => {
    const made = { kind: "prompt" as const, hidden, floor, destroyed: false, play };
    popupMounts.push(made);
    return { relayout: () => {}, destroy: () => void (made.destroyed = true) };
  },
}));
vi.mock("@/ui/PartyReadyCheck", () => ({
  mountPartyReadyCheck: (_scene: unknown, hidden: () => boolean, play?: (effect: string) => void) => {
    const made = { kind: "ready" as const, hidden, destroyed: false, play };
    popupMounts.push(made);
    return { relayout: () => {}, destroy: () => void (made.destroyed = true) };
  },
}));

// The party frames themselves are PartyFrames.test's: here a recording stand-in, the ticks it was shown kept.
const frameMounts = vi.hoisted(() => [] as { shown: unknown[]; destroyed: boolean; play?: (effect: string) => void }[]);
vi.mock("@/ui/PartyFrames", () => ({
  mountPartyFrames: (_scene: unknown, _art: unknown, play?: (effect: string) => void) => {
    const made = { shown: [] as unknown[], destroyed: false, play };
    frameMounts.push(made);
    return { show: (state: unknown) => void made.shown.push(state), destroy: () => void (made.destroyed = true) };
  },
}));

// The gear overlay, its source and the container view themselves are their own tests': here a recording
// stand-in for what the UI scene builds for each world (FS-TQZ5J § Change: Phase 3, R50), its wiring kept.
const gearMounts = vi.hoisted(
  () =>
    [] as {
      world: string;
      wiring: { wrapper: { act(run: () => void): void }; take(item: unknown): void };
      inventory: boolean;
      character: boolean;
      released: boolean;
      log: string[];
      container?: { open?: string; destroyed: boolean; ground: object; log: string[] };
    }[],
);
vi.mock("@/ui/gearPieces", () => ({
  mountGearPieces: (_scene: unknown, _art: unknown, world: string, wiring: (typeof gearMounts)[number]["wiring"]) => {
    const made: (typeof gearMounts)[number] = { world, wiring, inventory: false, character: false, released: false, log: [] };
    gearMounts.push(made);
    const gear = {
      isInventoryOpen: () => made.inventory,
      isCharacterOpen: () => made.character,
      stashOpen: () => false,
      toggle: () => (made.inventory = !made.inventory),
      toggleCharacter: () => (made.character = !made.character),
      hide: () => {
        const was = made.inventory || made.character;
        made.inventory = made.character = false;
        return was;
      },
      equipKey: () => (made.inventory ? (made.log.push("E"), true) : false),
      openStash: () => false,
      seen: () => void made.log.push("seen"),
      setCharacterLevel: () => {},
      taken: () => {},
      roomForOne: () => true,
      release: () => void (made.released = true),
    };
    if (world === "hub") return { gear };
    const box = { open: undefined as string | undefined, destroyed: false, ground: {}, log: [] as string[] };
    made.container = box;
    return {
      gear,
      container: {
        get isOpen() {
          return box.open !== undefined;
        },
        get entityId() {
          return box.open;
        },
        open: (id: string) => void (box.open = id),
        close: () => void (box.open = undefined),
        closeNow: () => void (box.open = undefined),
        setItems: () => {},
        lootFirst: () => void box.log.push("F"),
        pointerMove: (x: number, y: number) => void box.log.push(`move ${x},${y}`),
        pointerDown: (x: number, y: number) => (box.log.push(`down ${x},${y}`), true),
        owns: (o: unknown) => o === box.ground,
        relayout: () => {},
        destroy: () => void (box.destroyed = true),
      },
    };
  },
}));

// The mailbox itself is LetterPanel.test's and MailboxEnvelope.test's: here a recording stand-in for what
// the UI scene builds for the town (FS-TQZ5J § Change: Batch 4: the mailbox, R101), the scene it is built
// on and its wiring kept.
const mailboxMounts = vi.hoisted(
  () =>
    [] as {
      scene: unknown;
      wiring: {
        blocked(): boolean;
        opening(): void;
        level(): number | undefined;
        wrapper: { act(run: () => void): void };
        play(effect: string): void;
      };
      relayouts: number;
      destroyed: boolean;
    }[],
);
vi.mock("@/ui/mailboxHud", () => ({
  mountMailbox: (scene: unknown, _art: unknown, wiring: (typeof mailboxMounts)[number]["wiring"]) => {
    const made = { scene, wiring, relayouts: 0, destroyed: false };
    mailboxMounts.push(made);
    return { relayout: () => void made.relayouts++, destroy: () => void (made.destroyed = true) };
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
    bridge.report({
      world: "hub",
      windows: () => ({ letter: open }),
      blockers: () => ({ dialogue: false }),
      facts: () => NO_FACTS,
      answer: () => {},
    });

    bridge.act(() => void (open = true));
    bridge.play("map_mode_switch");

    expect(played).toEqual(["sfx:mailbox_open", "sfx:map_mode_switch"]);
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

  // § Change: Phase 2: the party (I-TQZ5J-10): the invite prompt and the ready check are the UI scene's;
  // no world mounts them or tests a prompt's rect
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s mount no invite prompt or ready check, and test no prompt's rect",
    (file) => {
      expect(source(file)).not.toMatch(/PartyInvitePrompt|PartyReadyCheck|mountPartyInvitePrompt|mountPartyReadyCheck|this\.invitePrompt\b|this\.readyCheck\b/);
    },
  );

  // § Change: Phase 2: the party (I-TQZ5J-11): the frames are the UI scene's; each world hands its state
  // ticks to the bridge
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s mount no party frames, and hand each state tick it shows to the bridge",
    (file) => {
      expect(source(file)).not.toMatch(/PartyFrames|mountPartyFrames|this\.partyFrames\b/);
      expect(source(file)).toMatch(/this\.ui\.partySeen\(state\);/);
    },
  );

  it("should have the UI scene build the party panel for each world it hears reported (§ Change: Phase 2: the party, R36)", () => {
    const code = source("./UIScene.ts");
    expect(code).toMatch(/new UiPartySlot\(/);
    expect(code).toMatch(/mountPartyPanel\(this,/);
    expect(code).toMatch(/party\.show\(report\)/);
  });

  // § Change: Phase 3 (I-TQZ5J-14): the gear overlay, its source and the container view are the UI
  // scene's; no world builds them, binds their keys or tests their rects in a click or hover path
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s build no gear overlay, gear source or container view, and bind none of their keys",
    (file) => {
      const code = source(file);
      expect(code).not.toMatch(/GearOverlay|new HubGear|HubGear\b|EquipmentHud|new ContainerView|ContainerContents|PurseReader/);
      expect(code).not.toMatch(/keydown-[IBCQF]"|KeyCodes\.[IBCQF]\b/);
      expect(code).not.toMatch(/this\.gear\b|this\.equipment\b|\.covers\(x, y\) \?\? false;\n.*equipment/);
    },
  );

  it("should have the UI scene build the gear and the container view for each world it hears reported (§ Change: Phase 3, R50)", () => {
    const code = source("./UIScene.ts");
    expect(code).toMatch(/new UiGearSlot\(/);
    expect(code).toMatch(/gear\.show\(report\)/);
  });

  // § Change: Phase 3 (I-TQZ5J-15): the settlement record and the controls panel are the UI scene's; the
  // run hands its record as data and binds no H
  it("should have the run build no settlement record or controls panel and bind no H", () => {
    const code = source("./BarrowspireScene.ts");
    expect(code).not.toMatch(/new SettlementRecord|controlsPanel|keydown-H/);
    expect(code).toMatch(/this\.ui\.record\(/);
  });

  it("should have the UI scene draw the record and the controls panel (§ Change: Phase 3, R57)", () => {
    const code = source("./UIScene.ts");
    expect(code).toMatch(/new UiRecordSlot\(/);
    expect(code).toMatch(/new UiControlsSlot\(/);
    expect(code).toMatch(/"keydown-H"/);
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
    const windows = { letter: false };
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
    const keyboard = Object.assign(new EventEmitter(), {
      addKey: (code: number, capture = true) => {
        const key = { justDown: false, captured: capture };
        keys.set(code, key);
        if (capture) captures.add(code);
        return key;
      },
      removeKey: (key: object) => keys.forEach((held, code) => held === key && keys.delete(code)),
      addCapture: (codes: number | number[]) => [codes].flat().forEach((code) => captures.add(code)),
      removeCapture: (codes: number | number[]) => [codes].flat().forEach((code) => captures.delete(code)),
    });
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
    return {
      scene,
      bridge,
      report,
      windows,
      blockers,
      facts,
      asked,
      events,
      sys,
      live,
      plate,
      labels,
      keys,
      keyboard,
      captures,
      press,
      timers,
      tweens,
    };
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
        [73, false],
        [66, false],
        [67, false],
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

// FS-TQZ5J § Change: Phase 3 (I-TQZ5J-14): the gear overlay and the container view on the UI scene, built
// for each world and fed through the bridge (uiSceneGear.ts holds the wiring, gearPieces.ts the building):
// here what the UI scene hands them, its keys and its pointer.
describe("the UI scene's gear and container view (FS-TQZ5J § Change: Phase 3, R50–R56, R60)", () => {
  const I = 73;
  const C = 67;

  /** The UI scene on its game, a world reported; its keyboard's events emitted as Phaser's would be. */
  function created(world: "hub" | "field" | "run") {
    gearMounts.length = 0;
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const asked: string[] = [];
    const report = (w: "hub" | "field" | "run") =>
      bridge.report({
        world: w,
        windows: () => ({ letter: false }),
        blockers: () => ({ dialogue: false }),
        facts: () => NO_FACTS,
        answer: (request) => void asked.push(request.kind),
      });
    report(world);
    const any = (): unknown => {
      const self: unknown = new Proxy(() => self, { get: (_t, prop) => (prop === "then" ? undefined : () => self) });
      return self;
    };
    // its keyboard as Phaser 4.2.1's: `addKey` hands back the Key held for a code, `removeKey` lets it go,
    // and a key down is told to the Key held for its code first, its `keydown-X` emitted only when no
    // Key is held for it or the Key was not down already: a held key's auto-repeat reaches no
    // `keydown-X` while the scene holds a Key for it (KeyboardPlugin.update, KeyboardPlugin.js 789–797)
    type HeldKey = { keyCode: number; isDown: boolean; justDown: boolean };
    const keys = new Map<number, HeldKey>();
    const captures = new Set<number>();
    const keyboard = Object.assign(new EventEmitter(), {
      addKey: (code: number) => {
        const key = keys.get(code) ?? { keyCode: code, isDown: false, justDown: false };
        keys.set(code, key);
        return key;
      },
      removeKey: (key: HeldKey | number) => void keys.delete(typeof key === "number" ? key : key.keyCode),
      addCapture: (codes: number | number[]) => [codes].flat().forEach((c) => captures.add(c)),
      removeCapture: (codes: number | number[]) => [codes].flat().forEach((c) => captures.delete(c)),
    });
    /** The browser's keydown for `name`, its first or (`repeat`) an auto-repeat while held, as Phaser hands it on. */
    const keydown = (name: "E" | "I" | "B" | "C") => {
      const key = keys.get(name.charCodeAt(0));
      const wasDown = key?.isDown ?? false;
      if (key && !wasDown) Object.assign(key, { isDown: true, justDown: true });
      if (!key || !wasDown) keyboard.emit(`keydown-${name}`);
    };
    /** `name` held: its first keydown and `repeats` auto-repeats, a frame of the UI scene after each, then its keyup. */
    const hold = (name: "E" | "I" | "B" | "C", repeats: number) => {
      for (let i = 0; i <= repeats; i++) {
        keydown(name);
        scene.update();
      }
      const key = keys.get(name.charCodeAt(0));
      if (key) Object.assign(key, { isDown: false, justDown: false });
    };
    const input = Object.assign(new EventEmitter(), { keyboard, manager: { pointers: [] } });
    const scene = Object.assign(new UIScene(), {
      registry,
      events: new EventEmitter(),
      sys: { settings: { status: 5 } },
      game: {},
      input,
      cameras: { cameras: [] },
      children: { list: [] },
      add: new Proxy({}, { get: () => any }),
      time: { delayedCall: () => ({ remove: () => {} }) },
      tweens: { add: () => ({ remove: () => {} }) },
      cache: { audio: { exists: () => false } },
      sound: { locked: false, context: { state: "running" }, get: () => null, add: () => ({ play: () => true }) },
    });
    scene.create();
    /** A key pressed since the last frame, where the scene holds a Key for it, then the frame. */
    const poll = (code: number) => {
      const key = keys.get(code);
      if (key) key.justDown = true;
      scene.update();
    };
    return { scene, bridge, report, asked, keyboard, captures, input, poll, keys, hold };
  }

  it("should build the gear in each world reported and the container view outside the town, letting each go as it leaves", () => {
    const { bridge, report } = created("hub");
    expect(gearMounts.map((m) => [m.world, !!m.container])).toEqual([["hub", false]]);
    bridge.left("hub");
    report("run");
    expect(gearMounts.map((m) => [m.world, !!m.container])).toEqual([
      ["hub", false],
      ["run", true],
    ]);
    expect(gearMounts[0].released).toBe(true);
  });

  it("should toggle the town's inventory on an I read in its update, and a field's on an I key event", () => {
    const town = created("hub");
    town.keyboard.emit("keydown-I");
    expect(gearMounts[0].inventory).toBe(false);
    town.poll(I);
    expect(gearMounts[0].inventory).toBe(true);
    expect(town.bridge.ui.inventory).toBe(true);

    const field = created("field");
    field.poll(I);
    expect(gearMounts[0].inventory).toBe(false);
    field.keyboard.emit("keydown-I");
    field.keyboard.emit("keydown-C");
    expect([gearMounts[0].inventory, gearMounts[0].character]).toEqual([true, true]);
    field.keyboard.emit("keydown-F");
    expect(gearMounts[0].container?.log).toEqual(["F"]);
  });

  it("should capture I, B and C while the town is reported, as its keys did, and let them go as it leaves", () => {
    const { bridge, report, captures } = created("hub");
    expect([73, 66, 67].every((c) => captures.has(c))).toBe(true);
    bridge.left("hub");
    report("field");
    expect([73, 66, 67].some((c) => captures.has(c))).toBe(false);
    void C;
  });

  // the review of phase 3 (MED-1): a field and the run heard their gear keys on key events, auto-repeat
  // included, as the town polled its own once a press; the UI scene's Keys for the town's polling must
  // not stand outside the town, where Phaser would drop a held key's repeats (§ Change: Phase 3, R56)
  it.each(["field", "run"] as const)("should repeat a held E over the open inventory, and a held I, B or C, in a %s", (world) => {
    const { hold } = created(world);
    hold("I", 0);
    expect(gearMounts[0].inventory).toBe(true);
    hold("E", 3);
    expect(gearMounts[0].log.filter((l) => l === "E")).toHaveLength(4);
    hold("I", 2);
    expect(gearMounts[0].inventory).toBe(false);
    hold("B", 1);
    expect(gearMounts[0].inventory).toBe(false);
    hold("C", 2);
    expect(gearMounts[0].character).toBe(true);
  });

  it("should act once on a held key in the town, polled once a press, as the town did", () => {
    const { hold } = created("hub");
    hold("I", 3);
    expect(gearMounts[0].inventory).toBe(true);
    hold("E", 3);
    expect(gearMounts[0].log.filter((l) => l === "E")).toHaveLength(1);
    hold("C", 2);
    expect(gearMounts[0].character).toBe(true);
  });

  it("should hold the town's E, I, B and C Keys only while the town is reported, so a field after it repeats again", () => {
    const { bridge, report, keys, hold } = created("hub");
    expect([69, 73, 66, 67].every((c) => keys.has(c))).toBe(true);
    bridge.left("hub");
    report("field");
    expect([69, 73, 66, 67].some((c) => keys.has(c))).toBe(false);
    hold("I", 0);
    hold("E", 2);
    expect(gearMounts.at(-1)!.log.filter((l) => l === "E")).toHaveLength(3);
    bridge.left("field");
    report("hub");
    expect([69, 73, 66, 67].every((c) => keys.has(c))).toBe(true);
  });

  it("should hand the gear its data and the container view its own, from the world through the bridge (R52)", () => {
    const { bridge } = created("run");
    bridge.gear({ kind: "seen", carried: {}, character: {} as never });
    bridge.container({ kind: "open", entityId: "chest-1", container: "chest" });
    expect(gearMounts[0].log).toEqual(["seen"]);
    expect(bridge.ui.container).toBe("chest-1");
    bridge.endPopped();
    expect(bridge.ui.container).toBeUndefined();
  });

  it("should hand the container view a press on its own ground, logical units, and not one under another piece (R60)", () => {
    const { bridge, input } = created("field");
    // the press lets go of no text field: none is focused (A1 R26)
    vi.stubGlobal("document", { activeElement: null, documentElement: {} });
    bridge.container({ kind: "open", entityId: "pile-1", container: "drop_pile" });
    const box = gearMounts[0].container!;
    input.emit("pointerdown", { x: 30, y: 40, button: 0 }, [box.ground]);
    input.emit("pointerdown", { x: 31, y: 41, button: 0 }, [{}]);
    vi.unstubAllGlobals();
    expect(box.log).toEqual(["down 30,40"]);
  });

  it("should ask the world for a take the container view made (R54)", () => {
    const { asked } = created("run");
    gearMounts[0].wiring.take({ entity_id: "ring-1" });
    expect(asked).toEqual(["take"]);
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

// FS-TQZ5J § Change: Phase 2: the party (I-TQZ5J-9, I-TQZ5J-10): the UI scene builds the party pieces for
// each world reported, the ready check in the town only, and takes them down as the world leaves; their
// wiring reads the world's report
describe("the UI scene's party pieces (FS-TQZ5J § Change: Phase 2: the party, R36, R38)", () => {
  function created() {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const any: unknown = new Proxy(() => any, { get: (_t, prop) => (prop === "then" ? undefined : () => any) });
    // its keyboard, for the run's H (§ Change: Phase 3, R56)
    const keyboard = Object.assign(new EventEmitter(), {
      addKey: () => ({ justDown: false }),
      removeKey: () => {},
      addCapture: () => {},
      removeCapture: () => {},
    });
    const scene = Object.assign(new UIScene(), {
      registry,
      events: new EventEmitter(),
      add: any,
      input: Object.assign(new EventEmitter(), { keyboard, manager: { pointers: [] } }),
      cameras: { cameras: [] },
      game: {},
      cache: { audio: { exists: () => false } },
      sound: { locked: false, context: { state: "running" }, get: () => null, add: () => ({ play: () => true }) },
    });
    scene.create();
    const blockers = { dialogue: false, party: false, popups: false };
    const report = (world: "hub" | "field" | "run", chatTop?: number) =>
      bridge.report({
        world,
        windows: () => ({ letter: false, inventory: false, character: false }),
        blockers: () => ({ ...blockers }),
        facts: () => NO_FACTS,
        layout: () => ({ chatTop }),
        answer: () => {},
      });
    return { bridge, report, blockers, keyboard };
  }
  const since = (n: number) => popupMounts.slice(n);

  it("should build the town's panel, invite prompt and ready check, and the field's and the run's panel and prompt alone", () => {
    const { bridge, report } = created();
    const panels = partyMounts.length;
    const popups = popupMounts.length;

    report("hub");
    expect(since(popups).map((m) => m.kind)).toEqual(["prompt", "ready"]);
    bridge.left("hub");
    report("field");
    bridge.left("field");
    report("run");

    expect(partyMounts.length - panels).toBe(3);
    expect(since(popups).map((m) => [m.kind, m.destroyed])).toEqual([
      ["prompt", true],
      ["ready", true],
      ["prompt", true],
      ["prompt", false],
    ]);
  });

  it("should hide the popups as the world's report says, and stack the invites above the chat top it reports", () => {
    const { report, blockers } = created();
    const popups = popupMounts.length;
    report("run", 540);
    const [prompt] = since(popups);

    expect(prompt.hidden()).toBe(false);
    blockers.popups = true;
    expect(prompt.hidden()).toBe(true);
    expect(prompt.floor?.()).toBe(540);
  });

  it("should build the frames for each world, show them the world's state ticks, and take them down as it leaves", () => {
    const { bridge, report } = created();
    const before = frameMounts.length;
    const tick = { current_player: { id: "me", current_health: 40, max_health: 100 } };

    report("hub");
    bridge.partySeen(tick);
    bridge.left("hub");
    bridge.partySeen(tick);
    report("run");

    const made = frameMounts.slice(before);
    expect(made.map((m) => [m.shown.length, m.destroyed])).toEqual([
      [1, true],
      [0, false],
    ]);
    expect(made[0].shown[0]).toBe(tick);
  });

  // FS-WDM0X § Pass 2: the party (I-WDM0X-8): every party piece plays on the game's one player
  it("should hand every party piece the UI scene's player for its sounds", () => {
    const { bridge, report } = created();
    const heard: string[] = [];
    bridge.lendSounds({ act: (run) => run(), play: (effect) => void heard.push(effect) });
    const popups = popupMounts.length;
    report("hub");

    partyMounts.at(-1)!.play?.("menu_click");
    for (const m of popupMounts.slice(popups)) m.play?.(m.kind === "prompt" ? "notify_important" : "dialog_open");
    frameMounts.at(-1)!.play?.("menu_hover");

    expect(heard).toEqual(["menu_click", "notify_important", "dialog_open", "menu_hover"]);
  });

  // the integrator's call on phase 3's review: the invite field is a DOM element above the canvas, so with
  // the run's controls panel (1200) open over the party panel (1110) its placeholder showed through; the
  // panel hears that its field is covered while the controls panel is open, and uncovered as it closes
  it("should tell the party panel its invite field is covered while the run's controls panel is open, and not after", () => {
    const { report, keyboard } = created();
    report("run");
    const panel = partyMounts.at(-1)!;

    // a field where the controls panel stands, at the view's centre (FS-84N1G R20: by the rects)
    const under = { x: viewport.centerX - 10, y: viewport.centerY - 10, width: 20, height: 20 };
    expect(panel.covered?.(under)).toBe(false);
    keyboard.emit("keydown-H");
    expect(panel.covered?.(under)).toBe(true);
    keyboard.emit("keydown-H");
    expect(panel.covered?.(under)).toBe(false);
  });

  // FS-84N1G R20: a window over the party panel covers the field only where their rects meet
  it("should leave the field uncovered by an open controls panel that does not meet it", () => {
    const { report, keyboard } = created();
    report("run");
    const panel = partyMounts.at(-1)!;
    keyboard.emit("keydown-H");
    expect(panel.covered?.({ x: 0, y: 0, width: 40, height: 20 })).toBe(false);
  });

  it("should refuse the panel as the world's report or the menu says", () => {
    const { bridge, report, blockers } = created();
    report("run");
    const panel = partyMounts.at(-1)!;

    expect(panel.blocked()).toBe(false);
    blockers.party = true;
    expect(panel.blocked()).toBe(true);
    blockers.party = false;
    bridge.reportUi({ menuOpen: true });
    expect(panel.blocked()).toBe(true);
  });
});

// FS-84N1G R16–R18 (I-84N1G-2): on the UI scene, another window opening closes the run's controls panel by
// the next update, with only its own sound; Esc and Q close the controls panel first
describe("the run's controls panel's close rules on the UI scene (FS-84N1G R16–R18)", () => {
  function created() {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const any: unknown = new Proxy(() => any, { get: (_t, prop) => (prop === "then" ? undefined : () => any) });
    // a Phaser object as deep as the settlement record reaches into one: every property and call another
    const deep: unknown = new Proxy(() => deep, {
      get: (_t, prop) => (prop === "then" || typeof prop === "symbol" ? undefined : deep),
    });
    const keys = new Map<number, { justDown: boolean }>();
    const keyboard = Object.assign(new EventEmitter(), {
      addKey: (code: number) => {
        const key = { justDown: false };
        keys.set(code, key);
        return key;
      },
      removeKey: () => {},
      addCapture: () => {},
      removeCapture: () => {},
    });
    const played: string[] = [];
    const scene = Object.assign(new UIScene(), {
      registry,
      events: new EventEmitter(),
      // the settlement record's scroll area masks its layer by a shape it makes, to the main camera
      add: new Proxy({}, { get: (_t, prop) => (prop === "layer" ? () => deep : any) }),
      make: deep,
      input: Object.assign(new EventEmitter(), { keyboard, manager: { pointers: [] } }),
      cameras: { cameras: [], main: deep },
      game: {},
      cache: { audio: { exists: (key: string) => key.startsWith("sfx:") } },
      sound: {
        locked: false,
        context: { state: "running" },
        get: () => null,
        add: (key: string) => ({ play: () => (played.push(key.replace("sfx:", "")), true) }),
      },
    });
    scene.create();
    bridge.report({
      world: "run",
      windows: () => ({ letter: false }),
      blockers: () => ({ dialogue: false }),
      facts: () => NO_FACTS,
      answer: () => {},
    });
    const controls = () => (scene as unknown as { controls: { isOpen(): boolean } }).controls;
    const esc = () => {
      keys.get(Phaser.Input.Keyboard.KeyCodes.ESC)!.justDown = true;
      scene.update();
    };
    return { scene, bridge, keyboard, played, controls, esc, gear: () => gearMounts.at(-1)!, panel: () => partyMounts.at(-1)! };
  }

  it("should close the open controls panel by the next update as the inventory opens, with inventory_open alone", () => {
    const { scene, keyboard, played, controls } = created();
    keyboard.emit("keydown-H");
    scene.update();
    keyboard.emit("keydown-I");
    scene.update();
    expect(controls().isOpen()).toBe(false);
    expect(played).toEqual(["dialog_open", "inventory_open"]);
  });

  it("should close it as the party panel or the menu opens", () => {
    const party = created();
    party.keyboard.emit("keydown-H");
    party.scene.update();
    party.panel().open = true;
    party.scene.update();
    expect(party.controls().isOpen()).toBe(false);

    const menu = created();
    menu.keyboard.emit("keydown-H");
    menu.scene.update();
    expect(menu.controls().isOpen()).toBe(true);
    menu.esc();
    expect(menu.controls().isOpen()).toBe(false);
    menu.esc();
    menu.scene.update();
    expect(menu.played.slice(-1)).toEqual(["settings_open"]);
  });

  // FS-84N1G R4, R8: the controls badge stands as the run says its ability card is up, and goes at the end
  it("should stand the controls badge while the run's ability card is up, and take it down as the run ends", () => {
    const { scene } = created();
    const bridge = (scene as unknown as { bridge(): { abilityCard(up: boolean): void; changed(): void } }).bridge();
    const badge = () => (scene as unknown as { badge: { isUp(): boolean } }).badge;
    expect(badge().isUp()).toBe(false);
    bridge.abilityCard(true);
    expect(badge().isUp()).toBe(true);
    bridge.abilityCard(false);
    expect(badge().isUp()).toBe(false);
  });

  it("should leave it open over the inventory it opened over", () => {
    const { scene, keyboard, controls } = created();
    keyboard.emit("keydown-I");
    scene.update();
    keyboard.emit("keydown-H");
    scene.update();
    expect(controls().isOpen()).toBe(true);
  });

  // the review of FS-84N1G: Phaser steps the scene list from the top, so the UI scene's update runs before
  // the world's, and a window the world opens in its own update is first seen on the next frame
  it("should keep the panel H opened over the container view the world opened in its update the frame before", () => {
    const { scene, bridge, keyboard, played, controls } = created();
    scene.update();
    // the world's update, after the UI scene's: E opens the container view
    bridge.container({ kind: "open", entityId: "chest-1", container: "chest" });
    // the next frame: H on its key event, then the UI scene's update
    keyboard.emit("keydown-H");
    scene.update();
    expect(controls().isOpen()).toBe(true);
    expect(played).toEqual(["dialog_open"]);
  });

  // the review of FS-84N1G: this frame's sync before its keys, so Esc never steps a panel the sync closes
  it("should hand Esc to the menu the Menu icon opened between frames, the panel closed silently first", () => {
    const { scene, bridge, keyboard, played, controls, esc } = created();
    keyboard.emit("keydown-H");
    scene.update();
    // the Menu icon's release, between frames
    (scene as unknown as { menu: { pressMenu(): void } }).menu.pressMenu();
    expect(bridge.ui.menuOpen).toBe(true);
    esc();
    expect(controls().isOpen()).toBe(false);
    expect(played).not.toContain("dialog_cancel");
    expect(bridge.ui.menuOpen).toBe(false);
  });

  // FS-84N1G Edge States: the panel and a window opening in the same frame, the window after H
  it("should close the panel H opened as the inventory opens in the same frame, with inventory_open alone after it", () => {
    const { scene, keyboard, played, controls } = created();
    scene.update();
    keyboard.emit("keydown-H");
    keyboard.emit("keydown-I");
    scene.update();
    expect(controls().isOpen()).toBe(false);
    expect(played).toEqual(["dialog_open", "inventory_open"]);
  });

  // FS-84N1G R16, end to end: the run's record, shown by the run in its own update, closes the open panel
  it("should close the open panel, silently, as the run shows its settlement record", () => {
    const { scene, bridge, keyboard, played, controls } = created();
    keyboard.emit("keydown-H");
    scene.update();
    const view: RecordView = { title: "Escaped the barrow", status: { text: "Settled.", tone: "settled" }, carried: [], lost: [], earned: "", delve: "" };
    bridge.record({ view, open: true });
    scene.update();
    expect(controls().isOpen()).toBe(false);
    expect(played).toEqual(["dialog_open"]);
  });

  it("should close it first on Esc and on Q, with dialog_cancel, the inventory under it left open", () => {
    const viaEsc = created();
    viaEsc.keyboard.emit("keydown-I");
    viaEsc.keyboard.emit("keydown-H");
    viaEsc.esc();
    expect(viaEsc.controls().isOpen()).toBe(false);
    expect(viaEsc.gear().inventory).toBe(true);
    expect(viaEsc.played).toEqual(["inventory_open", "dialog_open", "dialog_cancel"]);

    const viaQ = created();
    viaQ.keyboard.emit("keydown-I");
    viaQ.keyboard.emit("keydown-H");
    viaQ.keyboard.emit("keydown-Q");
    expect(viaQ.controls().isOpen()).toBe(false);
    expect(viaQ.gear().inventory).toBe(true);
    expect(viaQ.played).toEqual(["inventory_open", "dialog_open", "dialog_cancel"]);
  });
});

// FS-TQZ5J § Change: Batch 4: the mailbox (I-TQZ5J-40): the town's envelope and letter panel are the UI
// scene's, built on it as the town is reported and taken down as it leaves and with the game (R101,
// R110); the envelope's opening closes the UI scene's own gear overlay and party panel (R104); the letter
// panel's tips read the gear's last level (R102)
describe("the UI scene's mailbox (FS-TQZ5J § Change: Batch 4, R101–R104, R110)", () => {
  function created() {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const any: unknown = new Proxy(() => any, { get: (_t, prop) => (prop === "then" ? undefined : () => any) });
    const keyboard = Object.assign(new EventEmitter(), {
      addKey: () => ({ justDown: false }),
      removeKey: () => {},
      addCapture: () => {},
      removeCapture: () => {},
    });
    const events = new EventEmitter();
    const scene = Object.assign(new UIScene(), {
      registry,
      events,
      add: any,
      input: Object.assign(new EventEmitter(), { keyboard, manager: { pointers: [] } }),
      cameras: { cameras: [] },
      game: {},
      cache: { audio: { exists: () => false } },
      sound: { locked: false, context: { state: "running" }, get: () => null, add: () => ({ play: () => true }) },
    });
    scene.create();
    const blockers = { dialogue: false };
    const report = (world: "hub" | "field" | "run") =>
      bridge.report({
        world,
        windows: () => ({ letter: false }),
        blockers: () => ({ ...blockers }),
        facts: () => NO_FACTS,
        answer: () => {},
      });
    return { bridge, scene, events, report, blockers };
  }
  const since = (n: number) => mailboxMounts.slice(n);

  it("should build the town's mailbox on itself as the town is reported, keep it while the town stands, and build none in a field or the run", () => {
    const { bridge, scene, report } = created();
    const before = mailboxMounts.length;
    report("hub");
    bridge.changed();
    expect(since(before)).toHaveLength(1);
    expect(since(before)[0].scene).toBe(scene);
    bridge.left("hub");
    expect(since(before)[0].destroyed).toBe(true);
    report("field");
    bridge.left("field");
    report("run");
    expect(since(before)).toHaveLength(1);
  });

  it("should take the mailbox down with the game", () => {
    const { events, report } = created();
    report("hub");
    const made = mailboxMounts.at(-1)!;
    events.emit("destroy");
    expect(made.destroyed).toBe(true);
  });

  it("should refuse the envelope under the town's dialogue, and close its own gear overlay and party panel as it opens", () => {
    const { report, blockers } = created();
    report("hub");
    const { wiring } = mailboxMounts.at(-1)!;
    expect(wiring.blocked()).toBe(false);
    blockers.dialogue = true;
    expect(wiring.blocked()).toBe(true);
    blockers.dialogue = false;
    const gear = gearMounts.at(-1)!;
    const panel = partyMounts.at(-1)!;
    gear.inventory = gear.character = true;
    panel.open = true;
    wiring.opening();
    expect([gear.inventory, gear.character, panel.open]).toEqual([false, false, false]);
  });

  it("should hand the letter panel the level the world last handed the gear", () => {
    const { bridge, report } = created();
    report("hub");
    const { wiring } = mailboxMounts.at(-1)!;
    bridge.gear({ kind: "level", level: 9 });
    expect(wiring.level()).toBe(9);
  });
});
