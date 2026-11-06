import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", async () => {
  // Phaser 4.2.1's GameObject where rounding is decided (gameobjects/GameObject.js)
  class GameObject {
    vertexRoundMode = "safeAuto";
    willRoundVertices(camera: { roundPixels: boolean }, onlyTranslated: boolean) {
      if (this.vertexRoundMode === "fullAuto") return camera.roundPixels;
      if (this.vertexRoundMode === "safeAuto")
        return onlyTranslated && camera.roundPixels;
      return this.vertexRoundMode === "full";
    }
  }
  class ScenePlugin {
    systems: unknown;
    constructor(scene: { sys: unknown }) {
      this.systems = scene.sys;
    }
  }
  // `import * as Phaser` reads the module namespace, so the stand-in is the module itself.
  return {
    Plugins: { ScenePlugin },
    Scenes: { Events: { READY: "ready", DESTROY: "destroy" } },
    GameObjects: { GameObject },
  };
});

import * as Phaser from "phaser";
import { ViewportFit } from "./ViewportFit";

type Fake = { willRoundVertices(camera: object, onlyTranslated: boolean): boolean };
const { GameObject } = Phaser.GameObjects as unknown as {
  GameObject: (new () => Fake) & { prototype: Fake };
};

describe("ViewportFit (ADR-0056: every scene camera fitted as it starts)", () => {
  it("should fit the main camera when the scene is ready, and leave game objects' rounding to the game's configuration (ADR-0057)", async () => {
    const { EventEmitter } = await import("eventemitter3");
    const main = {
      setSize: vi.fn(),
      setZoom: vi.fn(),
      setOrigin: vi.fn(),
      preRender: vi.fn(),
      roundPixels: true,
    };
    const sys = { events: new EventEmitter(), cameras: { main } };
    const decide = GameObject.prototype.willRoundVertices;
    const plugin = new ViewportFit({ sys } as never, {} as never, "viewportFit");
    plugin.boot();

    // a scene plugin's boot patches no global prototype: rounding does not hang on which scene,
    // or which page, booted first
    expect(GameObject.prototype.willRoundVertices).toBe(decide);

    sys.events.emit("ready");
    expect(main.setOrigin).toHaveBeenCalledWith(0, 0);
  });
});
