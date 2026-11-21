import { afterEach, describe, expect, it, vi } from "vitest";

// Only the heroes sidebar's own hit test is under test: a Phaser stand-in with what it reaches for.
vi.mock("phaser", () => {
  class Scene {
    constructor(_config: unknown) {}
  }
  class Rectangle {
    static Contains = () => false;
    constructor(..._args: unknown[]) {}
  }
  const phaser = {
    Scene,
    Geom: { Rectangle },
    Math: {
      Clamp: (v: number, lo: number, hi: number) =>
        Math.min(Math.max(v, lo), hi),
    },
  };
  return { ...phaser, default: phaser };
});

const { MainMenuScene } = await import("./MainMenuScene");
const { useGameStore } = await import("@/stores/gameStore");
const { fillMaskArea, viewport } = await import("@/render/viewport");
const { sceneSystems } = await import("./sceneEnd.standin");

/** Answers any call with itself; reads as 0 where a number is wanted. */
const any: unknown = new Proxy(function () {}, {
  get: (_t, key) =>
    key === Symbol.toPrimitive ? () => 0 : key === "then" ? undefined : any,
  apply: () => any,
});

type Handler = (...args: unknown[]) => void;

interface SidebarScene {
  sidebarScrollY: number;
  createHeroRightSidebar(): void;
  shutdown(): void;
}

/** A mask shape the sidebar drew (`make.graphics`): its rects and their alphas, as now. */
interface MaskShape {
  rects: number[][];
  alphas: number[];
  destroyed: boolean;
}

/** The menu with its sidebar built on a stage centred in a view 1280 wide at render scale 2. */
function sidebarOnStage(renderScale = 2) {
  viewport.set({ width: 1280, height: 720, renderScale });
  const handlers: Record<string, Handler> = {};
  const scene = new MainMenuScene() as unknown as SidebarScene &
    Record<string, unknown>;
  const maskShapes: MaskShape[] = [];
  let masksLaid = 0;
  /** A container that answers anything and counts the masks laid on it (`maskInView`). */
  const container = () =>
    new Proxy(function () {}, {
      get: (_t, key) =>
        key === "filters"
          ? { external: { addMask: () => (masksLaid++, any) } }
          : key === Symbol.toPrimitive
            ? () => 0
            : key === "then"
              ? undefined
              : any,
    });
  const graphics = () => {
    const m: MaskShape = { rects: [], alphas: [], destroyed: false };
    maskShapes.push(m);
    const self: Record<string, unknown> = {
      setScrollFactor: () => self,
      clear: () => ((m.rects = []), (m.alphas = []), self),
      fillStyle: (_c: number, alpha = 1) => (m.alphas.push(alpha), self),
      fillRect: (...r: number[]) => (m.rects.push(r), self),
      destroy: () => void (m.destroyed = true),
    };
    return self;
  };
  Object.assign(scene, {
    add: new Proxy(
      {},
      { get: (_t, key) => (key === "container" ? container : any) },
    ),
    make: { graphics },
    textures: any,
    time: any,
    tweens: any,
    // the stage (1080 wide) centred in the 1280 view: the camera looks 100 left of it
    cameras: { main: { scrollX: -100, scrollY: 0, originX: 0, originY: 0 } },
    input: {
      on: (event: string, fn: Handler) => (handlers[event] = fn),
      off: () => undefined,
    },
  });
  // enough heroes that the list scrolls
  const characters = Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`,
    name: `Hero ${i}`,
    className: "warrior",
  }));
  vi.spyOn(useGameStore, "getState").mockReturnValue({
    ...useGameStore.getState(),
    characters,
  } as unknown as ReturnType<typeof useGameStore.getState>);
  scene.createHeroRightSidebar();
  scene.sidebarScrollY = 0;
  /** A wheel turn at a backing-px point, as Phaser hands the pointer over. */
  const wheel = (x: number, y: number) =>
    handlers.pointerwheel({ x, y }, [], 0, 1);
  return { scene, wheel, maskShapes, masksLaid: () => masksLaid };
}

afterEach(() => {
  vi.restoreAllMocks();
  viewport.set({ width: 1080, height: 720, renderScale: 1 });
});

describe("MainMenuScene heroes sidebar on the centred stage (FS-ZAJMH R11, R15)", () => {
  // the panel stands at stage x 856–1056, y 100–540: screen x 956–1156 in the 1280 view
  it("should scroll the list for a wheel over the panel, at render scale 2 in a wider view", () => {
    const { scene, wheel } = sidebarOnStage();
    wheel(2 * 1000, 2 * 300);
    expect(scene.sidebarScrollY).toBeGreaterThan(0);
  });

  it("should ignore a wheel left of the panel, where the panel would be without the stage's offset", () => {
    const { scene, wheel } = sidebarOnStage();
    wheel(2 * 930, 2 * 300);
    expect(scene.sidebarScrollY).toBe(0);
  });
});

describe("MainMenuScene heroes sidebar clip (ADR-0057: clipped as Phaser 3.90 clipped)", () => {
  // the cards' clip on the stage: x 864–1048, y 144–499
  const clipAt = (rs: number) => {
    const rects: number[][] = [];
    const alphas: number[] = [];
    fillMaskArea(
      {
        fillStyle: (_c: number, a = 1) => alphas.push(a),
        fillRect: (...r: number[]) => rects.push(r),
      },
      { x: 864, y: 144, width: 184, height: 355 },
      0,
      rs,
    );
    return { rects, alphas };
  };
  const live = (shapes: MaskShape[]) => shapes.filter((m) => !m.destroyed);

  it.each([1, 1.25, 1.5, 2])(
    "should clip the cards at render scale %s by the share of each edge px the area covers",
    (rs) => {
      const { maskShapes } = sidebarOnStage(rs);
      const [mask] = live(maskShapes);
      expect({ rects: mask.rects, alphas: mask.alphas }).toEqual(clipAt(rs));
    },
  );

  it("should redraw the clip for a new render scale alone, on the same mask", () => {
    const { maskShapes, masksLaid } = sidebarOnStage(1);
    viewport.set({ width: 1280, height: 720, renderScale: 1.5 });
    expect(masksLaid()).toBe(1);
    const [mask] = live(maskShapes);
    expect(live(maskShapes)).toHaveLength(1);
    expect({ rects: mask.rects, alphas: mask.alphas }).toEqual(clipAt(1.5));
    expect(mask.alphas.some((a) => a < 1)).toBe(true);
  });

  it("should take down the old clip with the old cards when the sidebar is built again", () => {
    const { scene, maskShapes, masksLaid } = sidebarOnStage(1.5);
    scene.createHeroRightSidebar();
    expect(masksLaid()).toBe(2);
    expect(live(maskShapes)).toHaveLength(1);
    viewport.set({ width: 1280, height: 720, renderScale: 1.25 });
    expect(live(maskShapes)[0].rects).toEqual(clipAt(1.25).rects);
  });

  it("should stop following the render scale once the scene shuts down", () => {
    const real = viewport.onChange.bind(viewport);
    const held = new Set<object>();
    vi.spyOn(viewport, "onChange").mockImplementation((listener) => {
      const token = {};
      held.add(token);
      const off = real(listener);
      return () => (held.delete(token), off());
    });
    const { scene, maskShapes } = sidebarOnStage(1);
    expect(held.size).toBe(1);
    scene.shutdown();
    expect(held.size).toBe(0);
    expect(maskShapes.every((m) => m.destroyed)).toBe(true);
    expect(() =>
      viewport.set({ width: 1280, height: 720, renderScale: 1.25 }),
    ).not.toThrow();
    expect(maskShapes[0].rects).toEqual(clipAt(1).rects);
  });
});

// Leaving /game destroys the game: Phaser emits the scene's DESTROY only, never SHUTDOWN
// (sceneEnd.standin.ts), and the menu let go of the socket's connection status on SHUTDOWN alone,
// so the dead menu kept hearing it (review 2026-11-06).
describe("MainMenuScene ending (game destroy on leaving /game)", () => {
  it("should stop hearing the connection status on a game destroy, as on a stop", () => {
    for (const end of ["destroy", "shutdown"] as const) {
      const scene = new MainMenuScene() as unknown as {
        events: unknown;
        unsubscribeConnectionStatus?: () => void;
        listenForEnd(): void;
      };
      const systems = sceneSystems();
      scene.events = systems.scene.events;
      const unsubscribe = vi.fn();
      scene.unsubscribeConnectionStatus = unsubscribe;
      scene.listenForEnd();

      if (end === "destroy") systems.destroy();
      else systems.shutdown();

      expect(unsubscribe, end).toHaveBeenCalledTimes(1);
    }
  });
});

const { artLoaderStandin, shippedManifest, RESIDENT_ART_PAGES } = await import("@/render/art/artLoader.standin");
const { atlasTextureKey } = await import("@/render/art/library");

// The menus draw only the class sheets: resident art, nothing scene-scoped (FS-C4JWH §A R4).
describe("MainMenuScene art loading (FS-C4JWH §B R7)", () => {
  it("should queue the manifest and the resident art only, when the menu is the first to load", () => {
    const art = artLoaderStandin({ manifest: shippedManifest() });
    const menu = Object.assign(new MainMenuScene(), art.scene) as unknown as { preload(): void };

    menu.preload();
    art.scene.load.start();

    expect(art.queued.sort()).toEqual(RESIDENT_ART_PAGES.map(atlasTextureKey));
  });

  it("should queue nothing once the resident art is loaded", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const menu = Object.assign(new MainMenuScene(), art.scene) as unknown as { preload(): void };

    menu.preload();

    expect(art.queued).toEqual([]);
  });

  it("should show no bar once the resident art is loaded (FS-C4JWH §D R17)", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const menu = Object.assign(new MainMenuScene(), art.scene) as unknown as { preload(): void };

    art.boot({ preload: () => menu.preload() });

    expect(art.drawn).toEqual([]);
  });
});

const { socketManager } = await import("@/utils/class/SocketManager");
const { ActionType } = await import("@/assets/types/client");
const { arrivals } = await import("@/components/arrival");

// FS-PQ2TW R7. I-PQ2TW-2: entering from the main menu is always an arrival, so logging out and in
// again within one tab, into the same hub session, still plays the card.
describe("MainMenuScene ENTER THE TOWN forgets the kept place (FS-PQ2TW R7)", () => {
  it("should forget the kept place before enter_hub is sent", () => {
    const town = { world_type: "hub", session_id: "hub-a" } as const;
    arrivals.isArrival(town);
    arrivals.isArrival(town);
    vi.spyOn(useGameStore, "getState").mockReturnValue({
      ...useGameStore.getState(),
      rosterStatus: "ready",
      getActiveCharacter: () => ({ id: "c1", name: "Hero", className: "warrior" }),
    } as unknown as ReturnType<typeof useGameStore.getState>);
    const verdictAtSend: boolean[] = [];
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {
      verdictAtSend.push(arrivals.isArrival(town));
    });
    const menu = new MainMenuScene() as unknown as { handleStartGame(): void };

    menu.handleStartGame();

    expect(send).toHaveBeenCalledWith(ActionType.EnterHub, expect.objectContaining({ characterId: "c1" }));
    expect(verdictAtSend).toEqual([true]);
  });
});

const { usePartyStore } = await import("@/stores/partyStore");
const { useAuthStore } = await import("@/stores/authStore");
type PartyUpdatePayload = import("@/stores/partyStore").PartyUpdatePayload;

// FS-NCC9J §Change: Changing character leaves the party, C9-C12 (owner 2026-11-12: "村莊組的隊伍 換角色就算離隊
// 但在選角色時有辦法知道他某個角色正在組隊 選了會離隊的提示通知嗎 按確認就離隊").
describe("MainMenuScene roster: the party's character and the switch (FS-NCC9J C9-C12)", () => {
  const SELF = "11111111-1111-4111-8111-111111111111";
  /** This player's party as the roster's sync sends it, holding them as name. */
  const partyAs = (name: string, locked = false): PartyUpdatePayload => ({
    party_id: "33333333-3333-4333-8333-333333333333",
    leader_id: SELF,
    members: [
      { player_id: SELF, name, class: "warrior", joined_at: "2026-11-12T10:00:00Z", where: "" },
    ],
    size: 2,
    reason: "sync",
    subject_id: SELF,
    locked,
  });
  const brannoc = { id: "c-brannoc", name: "Brannoc", className: "archer" };
  const kaelen = { id: "c-kaelen", name: "Kaelen", className: "warrior" };

  /** The menu with active chosen, its sends and refusals recorded. */
  function menuChoosing(active: typeof kaelen) {
    useAuthStore.setState({ memberInfo: { id: SELF } } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
    vi.spyOn(useGameStore, "getState").mockReturnValue({
      ...useGameStore.getState(),
      rosterStatus: "ready",
      getActiveCharacter: () => active,
    } as unknown as ReturnType<typeof useGameStore.getState>);
    const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => undefined);
    const menu = new MainMenuScene() as unknown as {
      handleStartGame(): void;
      switchConfirm?: { leave(): void; cancel(): void };
      showRefusal(message: string): void;
    } & Record<string, unknown>;
    Object.assign(menu, { add: any, time: any, tweens: any, input: any, cameras: { main: any } });
    const refusals: string[] = [];
    menu.showRefusal = (message: string) => void refusals.push(message);
    return { menu, send, refusals };
  }

  afterEach(() => {
    usePartyStore.setState({ party: null });
    useAuthStore.setState({ memberInfo: null });
  });

  it("should mark the card of the character the party holds this player as, and no other (C9)", () => {
    useAuthStore.setState({ memberInfo: { id: SELF } } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
    usePartyStore.setState({ party: partyAs("Hero 2") });
    const { scene } = sidebarOnStage(1);
    const cards = (scene as unknown as { heroSidebarCards: { inParty: boolean }[] }).heroSidebarCards;
    expect(cards.map((c) => c.inParty)).toEqual([false, false, true, false, false, false, false, false]);
  });

  it("should mark no card with no party", () => {
    useAuthStore.setState({ memberInfo: { id: SELF } } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
    const { scene } = sidebarOnStage(1);
    const cards = (scene as unknown as { heroSidebarCards: { inParty: boolean }[] }).heroSidebarCards;
    expect(cards.some((c) => c.inParty)).toBe(false);
  });

  it("should enter at once as the party's own character, asking nothing (C10)", () => {
    usePartyStore.setState({ party: partyAs("Kaelen") });
    const { menu, send } = menuChoosing(kaelen);

    menu.handleStartGame();

    expect(menu.switchConfirm).toBeUndefined();
    expect(send).toHaveBeenCalledWith(ActionType.EnterHub, expect.objectContaining({ characterId: "c-kaelen" }));
  });

  it("should ask first as another character, sending nothing yet (C11)", () => {
    usePartyStore.setState({ party: partyAs("Kaelen") });
    const { menu, send } = menuChoosing(brannoc);

    menu.handleStartGame();

    expect(menu.switchConfirm).toBeDefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("should send nothing on Cancel, and close the confirm (C11)", () => {
    usePartyStore.setState({ party: partyAs("Kaelen") });
    const { menu, send } = menuChoosing(brannoc);
    menu.handleStartGame();

    menu.switchConfirm?.cancel();

    expect(menu.switchConfirm).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("should send enter_hub as the new character on Leave party, which the server makes the switch (C11)", () => {
    usePartyStore.setState({ party: partyAs("Kaelen") });
    const { menu, send } = menuChoosing(brannoc);
    menu.handleStartGame();

    menu.switchConfirm?.leave();

    expect(menu.switchConfirm).toBeUndefined();
    expect(send.mock.calls).toEqual([
      [ActionType.EnterHub, expect.objectContaining({ characterId: "c-brannoc" })],
    ]);
  });

  it("should show the refusal instead of the confirm while the party's run is under way (C12)", () => {
    usePartyStore.setState({ party: partyAs("Kaelen", true) });
    const { menu, send, refusals } = menuChoosing(brannoc);

    menu.handleStartGame();

    expect(menu.switchConfirm).toBeUndefined();
    expect(refusals).toEqual(["You cannot change character during a delve."]);
    expect(send).not.toHaveBeenCalled();
  });
});
