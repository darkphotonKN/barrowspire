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
const { UI_EFFECTS } = await import("@/audio/uiSounds");
const { GAMEPLAY_EFFECTS } = await import("@/audio/gameplaySounds");

/** The same dust every run: a small LCG in place of Math.random. */
function steadyRandom() {
  let seed = 7;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  });
}

/** A Web Audio context, as far as the gameplay effects' install reaches it. */
function webAudio(sampleRate = 48000) {
  return {
    sampleRate,
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
  };
}

/**
 * The boot scene on a stand-in stage, its load held until `finish`; its sound manager has `context`
 * (Web Audio) or none (HTML5 audio), and what is added to its audio cache by hand is kept in `added`.
 */
function bootScreen(context?: ReturnType<typeof webAudio>) {
  const art = artLoaderStandin({ manifest: shippedManifest() });
  const added = new Map<string, unknown>();
  const audio = { ...art.scene.cache.audio, add: (key: string, data: unknown) => added.set(key, data) };
  const scene = Object.assign(new PreloadScene(), art.scene, {
    scene: { start: vi.fn() },
    sound: { context },
    cache: { ...art.scene.cache, audio },
  });
  art.boot(scene, undefined, { hold: true });
  return { art, scene, added };
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

  it("should queue the 27 interface effects behind the same torch bar, each under its key as [m4a, ogg] (FS-WDM0X S20, S21)", () => {
    const { art, scene } = bootScreen();

    expect(art.queuedAudio).toEqual(
      UI_EFFECTS.map((name) => ({
        key: `sfx:${name}`,
        url: [`/audio/sfx/${name}.m4a`, `/audio/sfx/${name}.ogg`],
      })),
    );
    expect(art.queuedAudio).toHaveLength(27);

    art.finish();

    expect(UI_EFFECTS.every((name) => art.audio.has(`sfx:${name}`))).toBe(true);
    expect(scene.scene.start).toHaveBeenCalledWith("MainMenuScene");
  });
});

describe("PreloadScene's gameplay effects (FS-AND39 R12)", () => {
  it("should install the 11 gameplay effects on a Web Audio stage before the main menu starts (FS-AND39 R12)", () => {
    const { art, scene, added } = bootScreen(webAudio());
    scene.scene.start.mockImplementation(() => expect(added.size).toBe(11));

    art.finish();

    expect([...added.keys()]).toEqual(GAMEPLAY_EFFECTS.map((name) => `sfx:${name}`));
    expect(scene.scene.start).toHaveBeenCalledWith("MainMenuScene");
    expect(UI_EFFECTS.every((name) => art.audio.has(`sfx:${name}`))).toBe(true);
  });

  it("should install nothing without Web Audio, and still go on to the main menu (FS-AND39 R12)", () => {
    const { art, scene, added } = bootScreen(undefined);

    art.finish();

    expect(added.size).toBe(0);
    expect(scene.scene.start).toHaveBeenCalledWith("MainMenuScene");
  });
});
