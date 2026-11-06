import { afterEach, describe, expect, it, vi } from "vitest";

// Only the boot screen is under test: a Phaser stand-in with the scene base class.
vi.mock("phaser", () => {
  class Scene {
    constructor(_config: unknown) {}
  }
  const phaser = { Scene };
  return { ...phaser, default: phaser };
});

const { PreloadScene } = await import("./PreloadScene");
const { artLoaderStandin, shippedManifest, RESIDENT_ART_PAGES } = await import("@/render/art/artLoader.standin");
const { atlasTextureKey } = await import("@/render/art/library");

/** The same dust every run: a small LCG in place of Math.random. */
function steadyRandom() {
  let seed = 7;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  });
}

/** The boot scene on a stand-in stage, its load held until `finish`. */
function bootScreen() {
  const art = artLoaderStandin({ manifest: shippedManifest() });
  const scene = Object.assign(new PreloadScene(), art.scene, { scene: { start: vi.fn() } });
  art.boot(scene, undefined, { hold: true });
  return { art, scene };
}

/** What is on the stage: each object's kind, how it was added, every call on it, and whether it is gone. */
const stage = (art: ReturnType<typeof artLoaderStandin>) => ({
  objects: art.drawn.map(({ kind, args, calls, destroyed }) => ({ kind, args, calls, destroyed })),
  camera: { scroll: [art.camera.scrollX, art.camera.scrollY], background: art.camera.background },
});

describe("PreloadScene's boot screen (FS-C4JWH §D R18: unchanged)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Recorded on local main 6812be5a's PreloadScene, before the torch bar moved to shared code.
  it("should draw the backdrop, the torch pool, the trough, the bar and both lines as it always has", () => {
    steadyRandom();
    const { art } = bootScreen();

    expect(stage(art)).toMatchSnapshot("while loading");

    art.finish();

    expect(stage(art)).toMatchSnapshot("loaded");
  });

  it("should load the manifest and the resident art, and go on to the main menu", () => {
    const { art, scene } = bootScreen();

    art.finish();

    expect(art.queued.sort()).toEqual(RESIDENT_ART_PAGES.map(atlasTextureKey));
    expect(scene.scene.start).toHaveBeenCalledWith("MainMenuScene");
  });
});
