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
const { viewport } = await import("@/render/viewport");

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
}

/** The menu with its sidebar built on a stage centred in a view 1280 wide at render scale 2. */
function sidebarOnStage() {
  viewport.set({ width: 1280, height: 720, renderScale: 2 });
  const handlers: Record<string, Handler> = {};
  const scene = new MainMenuScene() as unknown as SidebarScene &
    Record<string, unknown>;
  Object.assign(scene, {
    add: any,
    make: any,
    textures: any,
    time: any,
    tweens: any,
    // the stage (1080 wide) centred in the 1280 view: the camera looks 100 left of it
    cameras: { main: { scrollX: -100, scrollY: 0 } },
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
  return { scene, wheel };
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
