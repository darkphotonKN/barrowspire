import { describe, expect, it } from "vitest";
import { ROUND_MODE, roundEveryObject } from "./rounding";

/**
 * Phaser 4.2.1's `GameObject` where rounding is decided (`gameobjects/GameObject.js`): the
 * constructor sets `vertexRoundMode = "safeAuto"`, and `willRoundVertices` is the one method
 * every WebGL transformer (and the filter pass) asks. A fresh class per test, so one test's
 * install never leaks into the next.
 */
function phaserGameObject() {
  class GameObject {
    vertexRoundMode = "safeAuto";
    willRoundVertices(
      camera: { roundPixels: boolean },
      onlyTranslated: boolean,
    ): boolean {
      switch (this.vertexRoundMode) {
        case "safe":
          return onlyTranslated;
        case "safeAuto":
          return onlyTranslated && camera.roundPixels;
        case "full":
          return true;
        case "fullAuto":
          return camera.roundPixels;
        default:
          return false;
      }
    }
  }
  /** An Image, a Sprite, a Text: a subclass that leaves rounding to its base. */
  class Image extends GameObject {}
  /** A Container: its children are GameObjects too, added without any scene event. */
  class Container extends GameObject {
    list: GameObject[] = [];
    add(child: GameObject) {
      this.list.push(child);
      return this;
    }
  }
  /**
   * A Layer: Phaser's class factory copies GameObject's methods onto its own prototype
   * (`Mixins`, utils/Class.js `extend`), so it owns a copy rather than inheriting the method.
   */
  class Layer {
    vertexRoundMode = "safeAuto";
  }
  Object.defineProperty(Layer.prototype, "willRoundVertices", {
    value: GameObject.prototype.willRoundVertices,
    writable: true,
    configurable: true,
  });
  /** A nested namespace (Phaser.GameObjects.Particles). */
  class ParticleEmitter {
    vertexRoundMode = "safeAuto";
  }
  Object.defineProperty(ParticleEmitter.prototype, "willRoundVertices", {
    value: GameObject.prototype.willRoundVertices,
    writable: true,
    configurable: true,
  });
  const GameObjects = { GameObject, Image, Container, Layer, Particles: { ParticleEmitter } };
  return { ...GameObjects, GameObjects };
}

type Decides = { vertexRoundMode: string; willRoundVertices(c: object, o: boolean): boolean };

const rounding = { roundPixels: true };
const notRounding = { roundPixels: false };

describe("roundEveryObject (ADR-0057: every object rounded to the backing px, set once)", () => {
  it("should round a scaled or zoomed object through a rounding camera, which Phaser's default does not", () => {
    const { GameObjects, Image } = phaserGameObject();
    const before = new Image();
    // Phaser's default: a quad under a zoom of 1.5 is never "only translated", so never rounded
    expect(before.willRoundVertices(rounding, false)).toBe(false);

    roundEveryObject(GameObjects);
    const image = new Image();
    expect(image.willRoundVertices(rounding, false)).toBe(true);
    expect(image.vertexRoundMode).toBe(ROUND_MODE);
  });

  it("should leave an object unrounded through a camera that does not round (a render texture's, by choice)", () => {
    const { GameObjects, Image } = phaserGameObject();
    roundEveryObject(GameObjects);
    expect(new Image().willRoundVertices(notRounding, true)).toBe(false);
  });

  it("should reach every object however it was made: added, made without being added, a container's child, made before the install", () => {
    const { GameObjects, GameObject, Image, Container } = phaserGameObject();
    const early = new Image();
    roundEveryObject(GameObjects);
    const added = new Image();
    const made = new GameObject(); // make.*(…, false): never on a display list
    const child = new Image();
    new Container().add(child); // Container.addHandler: addedToScene(), no scene event
    for (const object of [early, added, made, child]) {
      expect(object.willRoundVertices(rounding, false)).toBe(true);
      expect(object.vertexRoundMode).toBe("fullAuto");
    }
  });

  it("should honour an object deliberately set to another mode (an opt-out made in the viewport)", () => {
    const { GameObjects, Image } = phaserGameObject();
    roundEveryObject(GameObjects);
    const spinning = new Image();
    spinning.vertexRoundMode = "off";
    expect(spinning.willRoundVertices(rounding, false)).toBe(false);
    expect(spinning.vertexRoundMode).toBe("off");
  });

  it("should wrap the method once however often it is installed (a scene per boot)", () => {
    const { GameObjects, GameObject, Layer } = phaserGameObject();
    roundEveryObject(GameObjects);
    const wrapped = [GameObject.prototype.willRoundVertices, (Layer.prototype as Decides).willRoundVertices];
    roundEveryObject(GameObjects);
    expect([GameObject.prototype.willRoundVertices, (Layer.prototype as Decides).willRoundVertices]).toEqual(wrapped);
    expect(new GameObject().willRoundVertices(rounding, false)).toBe(true);
  });

  it("should reach a class that owns a copy of the method rather than inheriting it, nested namespaces too", () => {
    const { GameObjects, Layer, Particles } = phaserGameObject();
    roundEveryObject(GameObjects);
    for (const object of [new Layer(), new Particles.ParticleEmitter()] as unknown as Decides[]) {
      expect(object.willRoundVertices(rounding, false)).toBe(true);
      expect(object.vertexRoundMode).toBe(ROUND_MODE);
    }
  });
});
