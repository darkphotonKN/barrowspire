import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";

// Each world scene's create() and the main menu's, run whole on absorbing systems (phaser.standin): what it reports, what
// it makes and in what order, read from the calls it made rather than from its source.
vi.mock("phaser", async () => (await import("./phaser.standin")).phaserStandIn({ absorbing: true }));
// the vignette draws on a DOM canvas, which node has none of
vi.mock("@/utils/atmosphere", () => ({ createAtmosphere: () => undefined }));
vi.mock("@/ui/uiBridge", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/ui/uiBridge")>();
  return { ...real, reportWorld: vi.fn(real.reportWorld) };
});
// the pointer look a scene asks for, watched: each hands back a look whose base is recorded
vi.mock("@/render/cursors", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/render/cursors")>();
  return { ...real, ensurePointerLook: vi.fn(() => ({ base: vi.fn() })) };
});
vi.mock("./fieldCombat", async (importOriginal) => {
  const real = await importOriginal<typeof import("./fieldCombat")>();
  return { ...real, fieldCombatOnScene: vi.fn(real.fieldCombatOnScene) };
});

const { absorbing, onAbsorbingSystems } = await import("./phaser.standin");
const { reportWorld } = await import("@/ui/uiBridge");
const { fieldCombatOnScene } = await import("./fieldCombat");
const { socketManager } = await import("@/utils/class/SocketManager");
const { HubScene } = await import("./HubScene");
const { FieldScene } = await import("./FieldScene");
const { BarrowspireScene } = await import("./BarrowspireScene");
const { MainMenuScene } = await import("./MainMenuScene");
const { CharacterCreationScene } = await import("./CharacterCreationScene");
const { ensurePointerLook } = await import("@/render/cursors");
const { ArrivalCard } = await import("@/ui/arrivalCard");
const { UiSounds } = await import("@/audio/uiSounds");
const { useGameStore } = await import("@/stores/gameStore");

type Created = Record<string, unknown> & { init?(data?: object): void; create(): void };

/** A world scene's create() run on absorbing systems, the scene's own steps watched as they run. */
function created(Scene: new () => object, steps: string[]) {
  // the run connects as it is created: no socket here
  // a scene's placeholder art warns once per missing sheet; the manifest is not loaded here
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(socketManager, "reconnect").mockImplementation(() => undefined as never);
  const { scene, bound } = onAbsorbingSystems(new Scene() as unknown as Created);
  const spies = Object.fromEntries(
    steps.map((step) => [step, vi.spyOn(scene as never, step as never) as MockInstance]),
  );
  scene.init?.({});
  scene.create();
  /** When a step first ran, in the order of every mock call made. */
  const when = (step: string) => {
    const mock = step === "reportWorld" ? vi.mocked(reportWorld).mock : spies[step].mock;
    expect(mock.invocationCallOrder.length, step).toBeGreaterThan(0);
    return mock.invocationCallOrder[0];
  };
  return { scene, bound, when };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(reportWorld).mockClear();
  vi.mocked(fieldCombatOnScene).mockClear();
  vi.mocked(ensurePointerLook).mockClear();
});

describe("the world scenes' create (FS-TQZ5J R3, R8, R9, R12)", () => {
  it.each([
    { name: "HubScene", Scene: HubScene, world: "hub", binds: "bindInput" },
    { name: "FieldScene", Scene: FieldScene, world: "field", binds: "bindInput" },
    { name: "BarrowspireScene", Scene: BarrowspireScene, world: "run", binds: "bindRunInput" },
  ] as const)("should have $name report its world, $world, before it binds its input", ({ Scene, world, binds }) => {
    const { scene, when } = created(Scene, [binds]);

    expect(vi.mocked(reportWorld)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportWorld).mock.calls[0][0]).toBe(scene);
    expect(vi.mocked(reportWorld).mock.calls[0][1]).toBe(world);
    expect(scene.ui).toBe(vi.mocked(reportWorld).mock.results[0].value);
    expect(when("reportWorld")).toBeLessThan(when(binds));
  });

  // the UI scene's keys are its own: Esc and its menu (FS-TQZ5J R16, R21; no run leaves on Esc, FS-QPDKN
  // req 13), T for the party (Phase 2, R36), H for the controls (Phase 3, R57), I, B, C, Q and F for the
  // gear and the coffer (Phase 3, R56); a world binds E alone of those it shares by state
  it.each([
    { name: "HubScene", Scene: HubScene },
    { name: "FieldScene", Scene: FieldScene },
    { name: "BarrowspireScene", Scene: BarrowspireScene },
  ] as const)("should have $name bind none of the UI scene's keys, by event or by key", ({ Scene }) => {
    const { bound } = created(Scene, []);

    // the recorder hears what a world does bind: M, its minimap key
    expect(bound).toContain("input.keyboard.on keydown-M");
    expect(bound.filter((call) => /keydown-(ESC|[THIBCQF])\b|addKey(s)? (27|ESC)\b/.test(call))).toEqual([]);
  });

  it("should have the town start its music and read the letter panel from the mailbox store (R1, R2; Batch 4, R103)", () => {
    const { scene, when } = created(HubScene, ["enterMusic"]);

    expect(when("enterMusic")).toBeGreaterThan(when("reportWorld"));
    expect(scene.mailbox).toEqual(expect.objectContaining({}));
    // the town makes no gameplay player: its gear sounds in the UI scene (FS-AND39 R7)
    expect(scene.gameplaySounds).toBeUndefined();
  });

  it("should have the field report itself before its gameplay player, its fight, its piles and its HUD keys (FS-AND39 R3, R4, R16)", () => {
    const { scene, when } = created(FieldScene, ["mountGameplaySounds", "createPiles", "bindHudKeys"]);
    const fight = vi.mocked(fieldCombatOnScene);

    expect(when("reportWorld")).toBeLessThan(when("mountGameplaySounds"));
    expect(when("mountGameplaySounds")).toBeLessThan(fight.mock.invocationCallOrder[0]);
    expect(when("reportWorld")).toBeLessThan(when("createPiles"));
    expect(when("reportWorld")).toBeLessThan(when("bindHudKeys"));
    // the fight takes the player as a value, so it is made first and handed over
    expect(scene.gameplaySounds).toBeDefined();
    expect(fight.mock.calls[0][3].sounds).toBe(scene.gameplaySounds);
  });

  it("should have the run report itself before it makes its gameplay player", () => {
    const { scene, when } = created(BarrowspireScene, ["mountGameplaySounds"]);

    expect(when("reportWorld")).toBeLessThan(when("mountGameplaySounds"));
    expect(scene.gameplaySounds).toBeDefined();
  });
});

// FS-PQ2TW R11, R37, R39 (ADR-0075 Decisions 3, 4): each world arrives through the one shared card, dark
// from its create on an arrival the switch decided; a return is not dark
describe("the world scenes' arrival (FS-PQ2TW R11, R37, R39)", () => {
  it.each([
    { name: "HubScene", Scene: HubScene, dark: "play" },
    { name: "FieldScene", Scene: FieldScene, dark: "play" },
    { name: "BarrowspireScene", Scene: BarrowspireScene, dark: "dark" },
  ] as const)("should have $name go dark through the shared card on an arrival, and not on a return", ({ Scene, dark }) => {
    const darkens = vi.spyOn(ArrivalCard.prototype, dark);
    for (const arrival of [true, false]) {
      darkens.mockClear();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(socketManager, "reconnect").mockImplementation(() => undefined as never);
      const { scene } = onAbsorbingSystems(new Scene() as unknown as Created);
      scene.init?.({ arrival });
      scene.create();

      expect(scene.arrivalCard).toBeInstanceOf(ArrivalCard);
      expect(darkens).toHaveBeenCalledTimes(arrival ? 1 : 0);
      if (arrival && dark === "play") expect(darkens.mock.calls[0][1]).toEqual({ built: false });
    }
  });
});

// FS-KYPQ9 § Change: The pressed hand (P7, P10): a scene with nothing hostile in it asks the one pointer
// look for the hand, with its own art
describe("the scenes' hand (FS-KYPQ9 § Change: The pressed hand, P7, P10)", () => {
  it.each([
    { name: "MainMenuScene", Scene: MainMenuScene },
    { name: "CharacterCreationScene", Scene: CharacterCreationScene },
    { name: "HubScene", Scene: HubScene },
  ] as const)("should have $name ask the pointer look for the hand with its art", ({ Scene }) => {
    vi.stubGlobal("WebSocket", absorbing());
    const { scene } = created(Scene, []);
    const look = vi.mocked(ensurePointerLook);

    expect(look).toHaveBeenCalledWith(scene, scene.art);
    expect(look.mock.results[0].value.base).toHaveBeenCalledWith("hand");
    vi.unstubAllGlobals();
  });
});

// FS-WDM0X § Change: Menu, dialog and notice sounds, M14 (I-WDM0X-6): the main menu has no UI scene, so
// it makes its own player as it is created and asks a hero's delete through it
describe("the main menu's delete confirm (FS-WDM0X § Change M11, M13, M14)", () => {
  /** The menu created, its heroes' cards drawn again on a stage that keeps each rectangle's press. */
  function menuWithHeroes() {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // no server: the heroes are the store's, and the menu's socket stands in absorbing
    vi.stubGlobal("WebSocket", absorbing());
    const deleteCharacter = vi.fn(() => Promise.resolve());
    vi.spyOn(useGameStore, "getState").mockReturnValue({
      ...useGameStore.getState(),
      characters: [{ id: "c0", name: "Hero", className: "warrior", level: 1 }],
      loadCharacters: () => Promise.resolve(),
      deleteCharacter,
    } as unknown as ReturnType<typeof useGameStore.getState>);
    const { scene } = onAbsorbingSystems(new MainMenuScene() as unknown as Created);
    scene.create();
    const presses: ((pointer: object) => void)[] = [];
    const any = absorbing();
    const rectangle = (): unknown => {
      const self: unknown = new Proxy(function () {}, {
        get: (_t, k) =>
          k === "then"
            ? undefined
            : k === Symbol.toPrimitive
              ? () => 0
              : k === "on"
                ? (event: string, fn: (pointer: object) => void) => (event === "pointerdown" && presses.push(fn), self)
                : () => self,
      });
      return self;
    };
    scene.add = new Proxy({}, { get: (_t, kind) => (kind === "rectangle" ? rectangle : () => any) });
    (scene as unknown as { createHeroRightSidebar(): void }).createHeroRightSidebar();
    const sounds = scene.sounds as InstanceType<typeof UiSounds>;
    const played = vi.spyOn(sounds, "play").mockImplementation(() => {});
    /** The hero's delete pressed, the browser's confirm answering `ok`. */
    const pressDelete = (ok: boolean) => {
      vi.stubGlobal("confirm", vi.fn(() => ok));
      for (const press of presses) press({ event: { stopPropagation: () => {} } });
    };
    return { sounds, played, deleteCharacter, pressDelete };
  }

  afterEach(() => void vi.unstubAllGlobals());

  it("should make its own player in create", () => {
    expect(menuWithHeroes().sounds).toBeInstanceOf(UiSounds);
  });

  it("should ask through the browser's confirm with its player, and delete nothing on Cancel", () => {
    const { played, deleteCharacter, pressDelete } = menuWithHeroes();
    pressDelete(false);
    expect(vi.mocked(confirm)).toHaveBeenCalledWith('Delete character "Hero"?');
    expect(played.mock.calls.map(([effect]) => effect)).toEqual(["dialog_open", "dialog_cancel"]);
    expect(deleteCharacter).not.toHaveBeenCalled();
  });

  it("should delete the hero on OK, with the heavy confirm", () => {
    const { played, deleteCharacter, pressDelete } = menuWithHeroes();
    pressDelete(true);
    expect(played.mock.calls.map(([effect]) => effect)).toEqual(["dialog_open", "dialog_confirm_heavy"]);
    expect(deleteCharacter).toHaveBeenCalledWith("c0");
  });
});
