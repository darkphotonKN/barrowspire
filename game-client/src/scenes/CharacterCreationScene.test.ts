import { afterEach, describe, expect, it, vi } from "vitest";

// Only the confirm press is under test: a Phaser stand-in with the scene base class.
vi.mock("phaser", () => {
  class Scene {
    constructor(_config: unknown) {}
  }
  const phaser = { Scene };
  return { ...phaser, default: phaser };
});

const { CharacterCreationScene } = await import("./CharacterCreationScene");
const { useGameStore } = await import("@/stores/gameStore");
const { ApiError } = await import("@/utils/apiError");

/** The parts of the scene the confirm press reads and writes. */
interface ConfirmScene {
  characterName: string;
  refusalText?: { setText(text: string): unknown };
  sys: { settings: { active: boolean } };
  scene: { start(key: string): unknown };
  handleConfirmCreation(): Promise<void>;
}

function creationScene(name: string) {
  const scene = new CharacterCreationScene() as unknown as ConfirmScene;
  const refusal = { setText: vi.fn() };
  const start = vi.fn();
  scene.characterName = name;
  scene.refusalText = refusal;
  scene.sys = { settings: { active: true } };
  scene.scene = { start };
  return { scene, refusal, start };
}

function stubCreate(impl: () => Promise<unknown>) {
  const createCharacter = vi.fn(impl);
  vi.spyOn(useGameStore, "getState").mockReturnValue({
    ...useGameStore.getState(),
    createCharacter,
  } as ReturnType<typeof useGameStore.getState>);
  return createCharacter;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CharacterCreationScene confirm (FS-KCQ06 §Requirements 18)", () => {
  it.each([
    ["a space", "Dark Knight"],
    ["a tab", "Dark\tKnight"],
    ["an ideographic space", "Dark　Knight"],
    ["a newline", "Dark\nKnight"],
    ["a no-break space", "Dark Knight"],
  ])("should refuse a name with %s before sending", async (_label, name) => {
    const createCharacter = stubCreate(() => Promise.resolve({}));
    const { scene, refusal, start } = creationScene(name);

    await scene.handleConfirmCreation();

    expect(createCharacter).not.toHaveBeenCalled();
    expect(refusal.setText).toHaveBeenLastCalledWith(
      "A hero's name is one word.",
    );
    expect(start).not.toHaveBeenCalled();
  });

  it("should send a one-word name and go to the menu", async () => {
    const createCharacter = stubCreate(() => Promise.resolve({}));
    const { scene, start } = creationScene("Aldric");

    await scene.handleConfirmCreation();

    expect(createCharacter).toHaveBeenCalledWith("Aldric", "warrior");
    expect(start).toHaveBeenCalledWith("MainMenuScene");
  });

  it("should still show the server's refusal", async () => {
    stubCreate(() =>
      Promise.reject(
        new ApiError({
          status: 400,
          code: "VALIDATION_FAILED",
          detail: "invalid input",
          errors: [],
        }),
      ),
    );
    const { scene, refusal, start } = creationScene("Aldric");

    await scene.handleConfirmCreation();

    expect(refusal.setText).toHaveBeenLastCalledWith(
      expect.stringContaining("invalid input"),
    );
    expect(start).not.toHaveBeenCalled();
  });
});

const { artLoaderStandin, shippedManifest, RESIDENT_ART_PAGES } = await import("@/render/art/artLoader.standin");
const { atlasTextureKey } = await import("@/render/art/library");

// The menus draw only the class sheets: resident art, nothing scene-scoped (FS-C4JWH §A R4).
describe("CharacterCreationScene art loading (FS-C4JWH §B R7)", () => {
  it("should queue the manifest and the resident art only, when the menu is the first to load", () => {
    const art = artLoaderStandin({ manifest: shippedManifest() });
    const menu = Object.assign(new CharacterCreationScene(), art.scene) as unknown as { preload(): void };

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
    const menu = Object.assign(new CharacterCreationScene(), art.scene) as unknown as { preload(): void };

    menu.preload();

    expect(art.queued).toEqual([]);
  });

  it("should show no bar once the resident art is loaded (FS-C4JWH §D R17)", () => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const menu = Object.assign(new CharacterCreationScene(), art.scene) as unknown as { preload(): void };

    art.boot({ preload: () => menu.preload() });

    expect(art.drawn).toEqual([]);
  });
});
