import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { CLASS_LORE, type ClassKey } from "@/data/classLore";
import { characterSheet } from "./animationSelect";
import { ArtLibrary, PLACEHOLDER_TEXTURE } from "./library";
import { directionIndex, type ArtAnimation, type ArtManifest } from "./manifest";
import {
  MAX_MENU_SCALE,
  MENU_FACING,
  MIN_MENU_SCALE,
  MenuFigure,
} from "./menuFigure";

const quiet = { warn: () => {} };

const clip = (fps: number, loop: boolean, count: number): ArtAnimation => ({
  fps,
  loop,
  frames: Array.from({ length: 8 }, (_, d) =>
    Array.from({ length: count }, (_, i) => ({ x: i * 10, y: d * 10 })),
  ),
});

const sheet = (atlas: string) => ({
  atlas,
  frameWidth: 160,
  frameHeight: 146,
  anchor: { x: 0.45, y: 0.74 },
  directions: 8 as const,
  animations: {
    idle: clip(5, true, 6),
    walk: clip(10, true, 8),
    attack: clip(12, false, 6), // 500 ms
    death: clip(9, false, 7),
  },
  crown: 83,
  source: "authored: test",
  licence: "Barrowspire-original",
});

function library(): ArtLibrary {
  const manifest: ArtManifest = {
    version: 1,
    tile: { width: 64, height: 32 },
    facings: ["e", "se", "s", "sw", "w", "nw", "n", "ne"],
    atlases: {
      "characters-0": {
        image: "c0.png",
        width: 2048,
        height: 2048,
        sha256: "a".repeat(64),
      },
      "characters-1": {
        image: "c1.png",
        width: 2048,
        height: 2048,
        sha256: "b".repeat(64),
      },
    },
    sheets: {
      char_knight_base: sheet("characters-0"),
      char_wizard_base: sheet("characters-1"),
    },
  };
  return new ArtLibrary(manifest, quiet);
}

/** A scene with just enough surface for a figure: records sprites and update listeners. */
function fakeScene() {
  const sprites: ReturnType<typeof fakeSprite>[] = [];
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  const chain = () =>
    new Proxy({}, { get: (_t, _p, self) => () => self }) as Record<
      string,
      unknown
    >;

  function fakeSprite(texture: string) {
    const destroyers: (() => void)[] = [];
    const s = {
      texture,
      frame: undefined as string | number | undefined,
      scale: 1,
      crop: undefined as number[] | undefined,
      plays: [] as { key: string; startFrame?: number }[],
      anims: {
        currentAnim: null as { key: string; frames: unknown[] } | null,
        currentFrame: null as unknown,
        timeScale: 1,
      },
      x: 0,
      y: 0,
      setTexture(key: string, frame?: string | number) {
        s.texture = key;
        s.frame = frame;
        return s;
      },
      setOrigin: () => s,
      setScale(v: number) {
        s.scale = v;
        return s;
      },
      setPosition(x: number, y: number) {
        s.x = x;
        s.y = y;
        return s;
      },
      setCrop(...r: number[]) {
        s.crop = r.length ? r : undefined;
        return s;
      },
      play(c: { key: string; startFrame?: number }) {
        s.plays.push(c);
        s.anims.currentAnim = { key: c.key, frames: [0, 1, 2, 3, 4, 5] };
        s.anims.currentFrame = 0;
        return s;
      },
      once(event: string, fn: () => void) {
        if (event === "destroy") destroyers.push(fn);
        return s;
      },
      destroy() {
        destroyers.forEach((fn) => fn());
      },
    };
    return s;
  }

  const container = () => {
    const destroyers: (() => void)[] = [];
    const children: { destroy(): void }[] = [];
    const c = {
      add(items: { destroy(): void } | { destroy(): void }[]) {
        children.push(...(Array.isArray(items) ? items : [items]));
        return c;
      },
      setDepth: () => c,
      setPosition: () => c,
      once(event: string, fn: () => void) {
        if (event === "destroy") destroyers.push(fn);
        return c;
      },
      destroy() {
        children.forEach((ch) => ch.destroy());
        destroyers.forEach((fn) => fn());
      },
    };
    return c;
  };

  const scene = {
    time: { now: 0 },
    textures: { exists: () => true },
    add: {
      container,
      graphics: () => Object.assign(chain(), { destroy() {} }),
      image: () => Object.assign(chain(), { destroy() {} }),
      sprite: (_x: number, _y: number, texture: string) => {
        const s = fakeSprite(texture);
        sprites.push(s);
        return s;
      },
    },
    events: {
      on(event: string, fn: (...a: unknown[]) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
      },
      once(event: string, fn: (...a: unknown[]) => void) {
        scene.events.on(event, fn);
      },
      off(event: string, fn: (...a: unknown[]) => void) {
        listeners.get(event)?.delete(fn);
      },
    },
    /** Runs one frame at `now`. */
    frame(now: number) {
      scene.time.now = now;
      listeners.get("update")?.forEach((fn) => fn(now, 16));
    },
    listening: (event: string) => listeners.get(event)?.size ?? 0,
    sprites,
  };
  return scene;
}

const asScene = (s: ReturnType<typeof fakeScene>) =>
  s as unknown as Phaser.Scene;

describe("MenuFigure", () => {
  it("faces the viewer: se on the 2:1 iso camera", () => {
    expect(MENU_FACING).toBe("se");
    expect(directionIndex(MENU_FACING)).toBe(1);
  });

  it("draws the class's baked sheet idle, facing the viewer, and never turns", () => {
    const scene = fakeScene();
    new MenuFigure(asScene(scene), library(), 0, 0, "warrior");
    const sprite = scene.sprites[0];

    expect(sprite.texture).toBe("art:characters-0");
    for (let now = 0; now <= 30_000; now += 250) scene.frame(now);
    expect(new Set(sprite.plays.map((p) => p.key))).toEqual(
      new Set(["char_knight_base/idle/1"]),
    );
  });

  it("plays the attack once on selection, facing the viewer, then idles again", () => {
    const scene = fakeScene();
    const figure = new MenuFigure(asScene(scene), library(), 0, 0, "warrior");
    const sprite = scene.sprites[0];
    scene.frame(0);

    scene.time.now = 100;
    figure.flourish();
    scene.frame(100);
    expect(sprite.plays.at(-1)).toEqual({
      key: "char_knight_base/attack/1",
      startFrame: 0,
    });
    scene.frame(599);
    expect(sprite.plays.at(-1)?.key).toBe("char_knight_base/attack/1");
    scene.frame(600);
    expect(sprite.plays.at(-1)?.key).toBe("char_knight_base/idle/1");
  });

  it("switching class swaps to that class's sheet and plays its attack", () => {
    const scene = fakeScene();
    const figure = new MenuFigure(asScene(scene), library(), 0, 0, "warrior");
    const sprite = scene.sprites[0];
    scene.frame(0);

    figure.setClass("mage");
    scene.frame(10);
    expect(sprite.texture).toBe("art:characters-1");
    expect(sprite.plays.at(-1)?.key).toBe("char_wizard_base/attack/1");
  });

  it("clamps its scale to the 1x-1.5x the baked frame allows", () => {
    const big = fakeScene();
    new MenuFigure(asScene(big), library(), 0, 0, "warrior", { scale: 3 });
    expect(big.sprites[0].scale).toBe(MAX_MENU_SCALE);

    const small = fakeScene();
    new MenuFigure(asScene(small), library(), 0, 0, "warrior", { scale: 0.4 });
    expect(small.sprites[0].scale).toBe(MIN_MENU_SCALE);
    expect([MIN_MENU_SCALE, MAX_MENU_SCALE]).toEqual([1, 1.5]);
  });

  it("a portrait crops to head and shoulders at 1x, facing the viewer", () => {
    const scene = fakeScene();
    new MenuFigure(asScene(scene), library(), 0, 0, "warrior", {
      portrait: { width: 50, height: 60 },
      scale: 1.5,
    });
    const sprite = scene.sprites[0];
    expect(sprite.scale).toBe(1);
    // anchor at (72, 108) px in the frame; the crown 83 px above it
    expect(sprite.crop).toEqual([47, 21, 50, 60]);
    scene.frame(0);
    scene.frame(10_000);
    expect(new Set(sprite.plays.map((p) => p.key))).toEqual(
      new Set(["char_knight_base/idle/1"]),
    );
  });

  it("with no art, stands a neutral placeholder and never throws", () => {
    const scene = fakeScene();
    const figure = new MenuFigure(
      asScene(scene),
      ArtLibrary.empty(quiet),
      0,
      0,
      "archer",
    );
    const sprite = scene.sprites[0];
    expect(sprite.texture).toBe(PLACEHOLDER_TEXTURE);
    expect(figure.baked).toBe(false);

    expect(() => {
      scene.frame(0);
      figure.flourish();
      figure.setClass("mage");
      scene.frame(5000);
    }).not.toThrow();
    expect(sprite.plays).toEqual([]);
  });

  it("stops listening for frames once destroyed, directly or with its parent", () => {
    const scene = fakeScene();
    const figure = new MenuFigure(asScene(scene), library(), 0, 0, "warrior");
    expect(scene.listening("update")).toBe(1);
    figure.destroy();
    expect(scene.listening("update")).toBe(0);

    const other = new MenuFigure(asScene(scene), library(), 0, 0, "warrior");
    other.container.destroy();
    expect(scene.listening("update")).toBe(0);
  });
});

describe("menus pick exactly the sheet that walks", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  ) as ArtManifest;

  it.each(Object.keys(CLASS_LORE) as ClassKey[])(
    "the %s class key names a baked 8-way sheet with idle and attack",
    (key) => {
      const sheet = manifest.sheets[characterSheet(key)];
      expect(sheet).toBeDefined();
      expect(sheet.directions).toBe(8);
      expect(sheet.animations.idle.frames).toHaveLength(8);
      expect(sheet.animations.attack.frames).toHaveLength(8);
    },
  );

  it("each class key has its own sheet, the Mercenary's included", () => {
    // FS-MAMHR §H.42: once approved, the merc draws from its own sheet, not the knight's
    const sheets = (Object.keys(CLASS_LORE) as ClassKey[]).map(characterSheet);
    expect(new Set(sheets).size).toBe(sheets.length);
    expect(characterSheet("mercenary")).toBe("char_mercenary_base");
  });

  it("the stored class name, in any case, draws the same sheet as its key", () => {
    expect(characterSheet("Mage")).toBe(characterSheet("mage"));
    expect(characterSheet("WARRIOR")).toBe(characterSheet("warrior"));
  });
});
