import { beforeAll, describe, expect, it, vi } from "vitest";
import { ROUND_MODE, roundEveryObject } from "./rounding";

/**
 * The hook against the REAL Phaser 4.2.1 classes, not stand-ins: Phaser builds some classes by
 * copying `GameObject`'s methods onto their own prototype (`Layer`'s `Mixins`,
 * `gameobjects/layer/Layer.js`; `utils/Class.js` `extend`), so a fake class hierarchy with real
 * inheritance cannot show whether every class is reached.
 *
 * Phaser reads the browser as it loads (device detection, a blend-mode probe image); none of it
 * matters to the classes' prototypes, so the browser is stood in by an object that answers
 * anything.
 */
type GameObjects = Record<string, unknown> & {
  GameObject: { prototype: object };
};

let GameObjects: GameObjects;
/** The whole of Phaser, as the module exports it. */
let PhaserNamespace: object;

const anything = (): unknown =>
  new Proxy(function () {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => 0 : key === "then" ? undefined : anything(),
    apply: () => anything(),
    construct: () => anything() as object,
    set: () => true,
  });

beforeAll(async () => {
  vi.stubGlobal("navigator", { userAgent: "node", maxTouchPoints: 0 });
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", anything());
  vi.stubGlobal("Image", function () {
    return anything();
  });
  vi.stubGlobal("HTMLCanvasElement", function () {});
  vi.stubGlobal("screen", anything());
  const Phaser = await import("phaser");
  expect(Phaser.VERSION).toBe("4.2.1");
  GameObjects = Phaser.GameObjects as unknown as GameObjects;
  PhaserNamespace = Phaser;
  roundEveryObject(GameObjects);
});

/** An object of `Class` as Phaser's constructor leaves it: on the default mode. */
const made = (Class: unknown) =>
  Object.assign(Object.create((Class as { prototype: object }).prototype), {
    vertexRoundMode: "safeAuto",
  }) as {
    vertexRoundMode: string;
    willRoundVertices(camera: { roundPixels: boolean }, onlyTranslated: boolean): boolean;
  };

const rounding = { roundPixels: true };

describe("roundEveryObject on Phaser 4.2.1's own classes (ADR-0057: every object rounded)", () => {
  it.each(["Layer", "Container", "Image", "Sprite", "Text", "Graphics", "Rectangle", "RenderTexture"])(
    "should round a %s through a rounding camera at a render scale that is not 1",
    (name) => {
      const object = made(GameObjects[name]);
      // a quad zoomed by 1.5 is never "only translated"; Phaser's default would not round it
      expect(object.willRoundVertices(rounding, false)).toBe(true);
      expect(object.vertexRoundMode).toBe(ROUND_MODE);
    },
  );

  it("should reach every class in Phaser.GameObjects, however Phaser built it", () => {
    const missed = Object.entries(GameObjects)
      .filter(
        ([, Class]) =>
          typeof Class === "function" &&
          typeof (Class as { prototype?: { willRoundVertices?: unknown } }).prototype
            ?.willRoundVertices === "function",
      )
      .filter(([, Class]) => !made(Class).willRoundVertices(rounding, false))
      .map(([name]) => name);
    expect(missed).toEqual([]);
  });

  it("should reach every class anywhere in Phaser that owns its own willRoundVertices, not only in Phaser.GameObjects", () => {
    // every class reachable from the module's exports, nested namespaces and statics included
    const owners: [string, unknown][] = [];
    const seen = new Set<unknown>();
    const visit = (value: unknown, path: string): void => {
      if (value === null || (typeof value !== "object" && typeof value !== "function")) return;
      if (seen.has(value)) return;
      seen.add(value);
      if (typeof value === "function") {
        const prototype: unknown = value.prototype;
        if (
          typeof prototype === "object" &&
          prototype !== null &&
          Object.prototype.hasOwnProperty.call(prototype, "willRoundVertices")
        )
          owners.push([path, value]);
      }
      for (const key of Object.keys(value)) {
        if (key === "prototype") continue;
        let member: unknown;
        try {
          member = (value as Record<string, unknown>)[key];
        } catch {
          continue;
        }
        visit(member, `${path}.${key}`);
      }
    };
    visit(PhaserNamespace, "Phaser");
    // GameObject's own and Layer's copy at least: the walk found what it is looking for
    expect(owners.map(([path]) => path)).toEqual(
      expect.arrayContaining(["Phaser.GameObjects.GameObject", "Phaser.GameObjects.Layer"]),
    );
    const missed = owners
      .filter(([, Class]) => !made(Class).willRoundVertices(rounding, false))
      .map(([path]) => path);
    expect(missed).toEqual([]);
  });

  it("should reach a class Phaser built by copying GameObject's methods (a Layer owns its copy)", () => {
    const layer = (GameObjects.Layer as { prototype: object }).prototype;
    expect(Object.prototype.hasOwnProperty.call(layer, "willRoundVertices")).toBe(true);
    expect(made(GameObjects.Layer).willRoundVertices(rounding, false)).toBe(true);
  });

  it("should wrap each class once however often it is installed (the game and the gallery both install)", () => {
    const layer = GameObjects.Layer as { prototype: { willRoundVertices: unknown } };
    const base = GameObjects.GameObject as { prototype: { willRoundVertices: unknown } };
    const [layerWrap, baseWrap] = [layer.prototype.willRoundVertices, base.prototype.willRoundVertices];
    roundEveryObject(GameObjects);
    expect(layer.prototype.willRoundVertices).toBe(layerWrap);
    expect(base.prototype.willRoundVertices).toBe(baseWrap);
  });
});
