import { describe, expect, it, vi } from "vitest";

// Only the scene before it starts is under test: a Phaser stand-in with a bare Scene.
vi.mock("phaser", async () => {
  class Scene {
    constructor(_config: unknown) {}
  }
  // `import * as Phaser` reads the module namespace, so the stand-in is the module itself.
  const phaser = { Scene, Scenes: { Events: { SHUTDOWN: "shutdown" } } };
  return { ...phaser, default: phaser };
});

const { GalleryScene } = await import("./GalleryScene");
const { EFFECT_CARDS } = await import("./effects");

// FS-1819Q R11: the panel holds the scene from the moment it is built, so a click can land while
// the art is still loading, before create() has wired the runtime and the figure.
describe("GalleryScene before it has started", () => {
  const playable = EFFECT_CARDS.filter((c) => c.demo !== null);

  it("ignores a card played before create()", () => {
    const scene = new GalleryScene();
    expect(() => scene.play(playable[0])).not.toThrow();
  });

  it("ignores play all in turn before create()", () => {
    const scene = new GalleryScene();
    expect(() => scene.playAll(EFFECT_CARDS)).not.toThrow();
  });
});
