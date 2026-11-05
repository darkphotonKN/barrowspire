import { describe, expect, it, vi } from "vitest";

// Only what the game bridge does as it loads is under test: a Phaser stand-in with Phaser
// 4.2.1's rounding decision (gameobjects/GameObject.js) and bare classes for the rest.
vi.mock("phaser", async () => {
  class GameObject {
    vertexRoundMode = "safeAuto";
    willRoundVertices(camera: { roundPixels: boolean }, onlyTranslated: boolean) {
      if (this.vertexRoundMode === "fullAuto") return camera.roundPixels;
      return this.vertexRoundMode === "safeAuto" && onlyTranslated && camera.roundPixels;
    }
  }
  class Scene {
    constructor(_config: unknown) {}
  }
  class ScenePlugin {}
  // `import * as Phaser` reads the module namespace, so the stand-in is the module itself.
  const phaser = { Scene, Plugins: { ScenePlugin }, GameObjects: { GameObject } };
  return { ...phaser, default: phaser };
});

describe("the dev gallery's effects panel (ADR-0057: rounded as the game is, whatever page came first)", () => {
  it("should round every game object as soon as it is loaded, before any game or scene exists", async () => {
    await import("./EffectsPanel");
    const { GameObjects } = (await import("phaser")) as unknown as {
      GameObjects: { GameObject: new () => { willRoundVertices(c: object, o: boolean): boolean } };
    };
    // a quad zoomed by 1.25 is never "only translated"
    expect(new GameObjects.GameObject().willRoundVertices({ roundPixels: true }, false)).toBe(true);
  });
});
