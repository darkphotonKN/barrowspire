import { describe, expect, it } from "vitest";
import { ArtLibrary } from "@/render/art/library";
import type { ArtAnimation, ArtManifest } from "@/render/art/manifest";
import { directionIndex } from "@/render/art/manifest";
import { facingFrom } from "@/render/iso/facing";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { MARKER_DEPTH } from "@/render/markers";
import type { BookEffectState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import { HOUND_BAY } from "@/render/effects/houndBay";
import {
  HOUND_BAR,
  HOUND_FADE_MS,
  HOUND_FALL_MS,
  HOUND_SHEET,
  HoundSet,
  houndClip,
  type HoundStage,
} from "./hounds";

const quiet = { warn: () => {} };

/** An 8-way clip of `count` frames at `fps`. */
const clip = (fps: number, loop: boolean, count: number): ArtAnimation => ({
  fps,
  loop,
  frames: Array.from({ length: 8 }, (_, d) =>
    Array.from({ length: count }, (_, i) => ({ x: i * 10, y: d * 10 })),
  ),
});

/** The hound's sheet as the bake writes it: idle, walk (its run), attack (its bite), death (its fall). */
function fixtureArt(): ArtLibrary {
  const manifest: ArtManifest = {
    version: 1,
    tile: { width: 64, height: 32 },
    facings: ["e", "se", "s", "sw", "w", "nw", "n", "ne"],
    atlases: { "hound-0": { image: "hound-0.png", width: 512, height: 512, sha256: "a".repeat(64) } },
    sheets: {
      [HOUND_SHEET]: {
        atlas: "hound-0",
        frameWidth: 117,
        frameHeight: 90,
        anchor: { x: 0.44, y: 0.69 },
        directions: 8,
        animations: {
          idle: clip(5, true, 6),
          walk: clip(14, true, 8),
          attack: clip(12, false, 7),
          death: clip(9, false, 7),
        },
        crown: 40,
        length: 90,
        source: "authored: test",
        licence: "Barrowspire-original",
      },
    },
  };
  return new ArtLibrary(manifest, quiet);
}

function fakeSprite() {
  const frames = Array.from({ length: 8 }, (_, i) => ({ i }));
  const sprite = {
    x: 0,
    y: 0,
    depth: 0,
    alpha: 1,
    scaleY: 1,
    displayOriginY: 0,
    visible: true,
    destroyed: false,
    plays: [] as { key: string; startFrame?: number }[],
    anims: {
      currentAnim: null as { key: string; frames: unknown[] } | null,
      currentFrame: null as unknown,
      timeScale: 1,
    },
    setTexture: () => sprite,
    setOrigin: (_x: number, y: number) => {
      sprite.displayOriginY = y * 90;
      return sprite;
    },
    setScale: (s: number) => {
      sprite.scaleY = s;
      return sprite;
    },
    play(config: string | { key: string; startFrame?: number }) {
      const c = typeof config === "string" ? { key: config } : config;
      sprite.plays.push(c);
      sprite.anims.currentAnim = { key: c.key, frames };
      sprite.anims.currentFrame = frames[c.startFrame ?? 0];
      return sprite;
    },
    setPosition(x: number, y: number) {
      sprite.x = x;
      sprite.y = y;
      return sprite;
    },
    setDepth(d: number) {
      sprite.depth = d;
      return sprite;
    },
    setAlpha(a: number) {
      sprite.alpha = a;
      return sprite;
    },
    setVisible(v: boolean) {
      sprite.visible = v;
      return sprite;
    },
    destroy() {
      sprite.destroyed = true;
    },
  };
  return sprite;
}

function fakeGraphics() {
  const g = {
    x: 0,
    y: 0,
    depth: 0,
    alpha: 1,
    visible: true,
    destroyed: false,
    calls: [] as [string, ...number[]][],
    clear() {
      g.calls = [];
      return g;
    },
    fillStyle: (c: number, a?: number) => (g.calls.push(["fillStyle", c, a ?? 1]), g),
    lineStyle: (w: number, c: number, a?: number) => (g.calls.push(["lineStyle", w, c, a ?? 1]), g),
    fillRect: (x: number, y: number, w: number, h: number) => (g.calls.push(["fillRect", x, y, w, h]), g),
    strokeRect: (x: number, y: number, w: number, h: number) => (g.calls.push(["strokeRect", x, y, w, h]), g),
    fillEllipse: (x: number, y: number, w: number, h: number) => (g.calls.push(["fillEllipse", x, y, w, h]), g),
    strokeEllipse: (x: number, y: number, w: number, h: number) => (g.calls.push(["strokeEllipse", x, y, w, h]), g),
    setPosition(x: number, y: number) {
      g.x = x;
      g.y = y;
      return g;
    },
    setDepth(d: number) {
      g.depth = d;
      return g;
    },
    setAlpha(a: number) {
      g.alpha = a;
      return g;
    },
    setVisible(v: boolean) {
      g.visible = v;
      return g;
    },
    destroy() {
      g.destroyed = true;
    },
  };
  return g;
}

function fakeStage() {
  const sprites: ReturnType<typeof fakeSprite>[] = [];
  const bars: ReturnType<typeof fakeGraphics>[] = [];
  const rings: ReturnType<typeof fakeGraphics>[] = [];
  const houndBays: ReturnType<typeof fakeGraphics>[] = [];
  const stage: HoundStage = {
    sprite: () => {
      const s = fakeSprite();
      sprites.push(s);
      return s;
    },
    bar: () => {
      const g = fakeGraphics();
      bars.push(g);
      return g;
    },
    ring: () => {
      const g = fakeGraphics();
      rings.push(g);
      return g;
    },
    houndBay: () => {
      const g = fakeGraphics();
      houndBays.push(g);
      return g;
    },
  };
  return { stage, sprites, bars, rings, houndBays };
}

const hound = (fields: Partial<BookEffectState> = {}): BookEffectState => ({
  id: "h1",
  kind: "hound",
  x: 400,
  y: 300,
  remaining: 30,
  owner_id: "archer",
  health: 40,
  max_health: 40,
  action: "idle",
  ...fields,
});

/** The animation key a sprite last played. */
const playing = (s: ReturnType<typeof fakeSprite>) => s.anims.currentAnim?.key;

function onStage() {
  const fake = fakeStage();
  const set = new HoundSet(fake.stage, fixtureArt());
  return { ...fake, set };
}

describe("the hound's clips (FS-X2CMM §I R47)", () => {
  it.each([
    ["idle", "idle"],
    ["run", "walk"],
    ["bite", "attack"],
    ["dead", "death"],
  ])("should play the hound's %s as its baked %s clip", (action, animation) => {
    expect(houndClip(action)).toBe(animation);
  });

  it("should stand an action it does not know, or none, in its idle", () => {
    expect(houndClip(undefined)).toBe("idle");
    expect(houndClip("bay")).toBe("idle");
  });
});

describe("HoundSet: the archer's hound drawn from the book effects (FS-X2CMM §I R47)", () => {
  it("should draw a hound at its state position from its own sheet, and nothing for the other book effects", () => {
    const { set, sprites, rings, bars } = onStage();
    set.sync([hound(), { id: "w1", kind: "witchlight", x: 0, y: 0, remaining: 10 }]);
    set.update(16);
    expect(sprites).toHaveLength(1);
    expect(rings).toHaveLength(1);
    expect(bars).toHaveLength(1);
    const at = worldToScreen(400, 300);
    expect([sprites[0].x, sprites[0].y]).toEqual([at.x, at.y]);
    expect(sprites[0].depth).toBe(worldDepth(400, 300, 1));
    expect(playing(sprites[0])).toMatch(new RegExp(`^${HOUND_SHEET}/idle/`));
    expect(set.placed().map((h) => h.id)).toEqual(["h1"]);
  });

  it("should play its bite clip while it bites, and bite again each second it goes on biting", () => {
    const { set, sprites } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.sync([hound({ action: "bite" })]);
    set.update(16);
    expect(playing(sprites[0])).toMatch(new RegExp(`^${HOUND_SHEET}/attack/`));
    const bites = () => sprites[0].plays.filter((p) => p.key.includes("/attack/") && p.startFrame === 0).length;
    expect(bites()).toBe(1);
    set.update(500);
    expect(bites()).toBe(1);
    set.update(520);
    expect(bites()).toBe(2);
  });

  it("should run toward where it moves, facing its movement, and keep that facing once it stops", () => {
    const { set, sprites } = onStage();
    set.sync([hound({ x: 400, y: 300 })]);
    set.update(16);
    set.sync([hound({ x: 400, y: 380, action: "run" })]);
    for (let i = 0; i < 10; i++) set.update(16);
    const south = directionIndex(facingFrom(0, 1, "se"));
    expect(playing(sprites[0])).toBe(`${HOUND_SHEET}/walk/${south}`);

    set.sync([hound({ x: 400, y: 380, action: "idle" })]);
    for (let i = 0; i < 10; i++) set.update(16);
    expect(playing(sprites[0])).toBe(`${HOUND_SHEET}/idle/${south}`);
  });

  it("should ease toward a new state position rather than jump", () => {
    const { set, sprites } = onStage();
    set.sync([hound({ x: 400, y: 300 })]);
    set.update(16);
    set.sync([hound({ x: 500, y: 300, action: "run" })]);
    set.update(16);
    const start = worldToScreen(400, 300).x;
    const end = worldToScreen(500, 300).x;
    expect(sprites[0].x).toBeGreaterThan(start);
    expect(sprites[0].x).toBeLessThan(end);
  });

  it("should carry a small health bar over its head, filled to its health, and none once it falls", () => {
    const { set, bars } = onStage();
    set.sync([hound({ health: 20, max_health: 40 })]);
    set.update(16);
    const bar = bars[0];
    expect(bar.visible).toBe(true);
    expect(bar.depth).toBe(MARKER_DEPTH.bar);
    const fills = bar.calls.filter(([c]) => c === "fillRect").map(([, , , w]) => w);
    // the trough runs the bar's width; the fill half of it
    expect(Math.max(...fills)).toBeCloseTo(HOUND_BAR.width, 5);
    expect(fills).toContain(HOUND_BAR.width / 2);

    set.sync([hound({ health: 0, max_health: 40, action: "dead" })]);
    set.update(16);
    expect(bar.visible).toBe(false);
  });

  it("should carry no bar when the state gives it no health", () => {
    const { set, bars } = onStage();
    set.sync([hound({ health: undefined, max_health: undefined })]);
    set.update(16);
    expect(bars[0].visible).toBe(false);
  });

  it("should lay a faint verdigris ring on the floor under it, following it", () => {
    const { set, rings } = onStage();
    set.sync([hound()]);
    set.update(16);
    const ring = rings[0];
    const strokes = ring.calls.filter(([c]) => c === "lineStyle");
    expect(strokes.length).toBeGreaterThan(0);
    for (const [, , color, alpha] of strokes) {
      expect(color).toBe(palette.bookPigment.verdigris);
      expect(alpha).toBeLessThan(0.6);
    }
    expect(ring.calls.some(([c]) => c === "strokeEllipse")).toBe(true);
    const at = worldToScreen(400, 300);
    expect([ring.x, ring.y]).toEqual([at.x, at.y]);
  });

  it("should fall in its fall clip when it dies, and lie on its last frame when first seen dead", () => {
    const { set, sprites } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.sync([hound({ action: "dead", health: 0 })]);
    set.update(16);
    expect(playing(sprites[0])).toMatch(new RegExp(`^${HOUND_SHEET}/death/`));
    expect(sprites[0].plays.at(-1)?.startFrame ?? 0).toBe(0);

    const late = onStage();
    late.set.sync([hound({ action: "dead", health: 0 })]);
    late.set.update(16);
    expect(playing(late.sprites[0])).toMatch(new RegExp(`^${HOUND_SHEET}/death/`));
    expect(late.sprites[0].plays.at(-1)?.startFrame).toBe(6);
  });

  it("should fade out when it goes from the state, and be gone once faded", () => {
    const { set, sprites, bars, rings } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.sync([]);
    expect(sprites[0].destroyed).toBe(false);
    set.update(HOUND_FADE_MS / 2);
    expect(sprites[0].alpha).toBeGreaterThan(0);
    expect(sprites[0].alpha).toBeLessThan(1);
    expect(rings[0].alpha).toBeLessThan(1);
    expect(set.placed()).toEqual([]);
    set.update(HOUND_FADE_MS / 2 + 1);
    expect([sprites[0].destroyed, bars[0].destroyed, rings[0].destroyed]).toEqual([true, true, true]);
    expect(set.size).toBe(0);
  });

  // the server sends a fallen hound in one state only (R28): its fall is drawn out before it fades
  it("should finish its fall before it fades when it leaves the state the tick after it fell", () => {
    const { set, sprites } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.sync([hound({ action: "dead", health: 0 })]);
    set.update(16);
    set.sync([]);
    set.update(HOUND_FALL_MS - 100);
    expect(sprites[0].alpha).toBe(1);
    expect(sprites[0].destroyed).toBe(false);
    set.update(100 + HOUND_FADE_MS / 2);
    expect(sprites[0].alpha).toBeLessThan(1);
    set.update(HOUND_FADE_MS);
    expect(sprites[0].destroyed).toBe(true);
  });

  // I-X2CMM-23 item 12: a hound out of the state for a tick (the interest cut, a dropped frame) comes back whole
  it("should come back at full alpha when it returns mid-fade, its bar shown and never taken away", () => {
    const { set, sprites, bars, rings } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.sync([]);
    set.update(HOUND_FADE_MS / 2);
    expect(sprites[0].alpha).toBeLessThan(1);

    set.sync([hound()]);
    set.update(16);
    expect([sprites[0].alpha, rings[0].alpha, bars[0].alpha]).toEqual([1, 1, 1]);
    expect(bars[0].visible).toBe(true);
    set.update(HOUND_FADE_MS);
    expect(sprites[0].destroyed).toBe(false);
    expect(set.size).toBe(1);
  });

  it("should stand again, not lie, when it returns alive mid-fade after a fall", () => {
    const { set, sprites } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.sync([hound({ action: "dead", health: 0 })]);
    set.update(16);
    set.sync([]);
    set.update(HOUND_FALL_MS + HOUND_FADE_MS / 2);
    expect(sprites[0].alpha).toBeLessThan(1);

    set.sync([hound()]);
    set.update(16);
    expect(sprites[0].alpha).toBe(1);
    expect(playing(sprites[0])).toMatch(new RegExp(`^${HOUND_SHEET}/idle/`));
  });

  it("should draw a new hound that replaces the old one (a new call), the old one fading", () => {
    const { set, sprites } = onStage();
    set.sync([hound({ id: "h1" })]);
    set.update(16);
    set.sync([hound({ id: "h2", x: 600 })]);
    set.update(16);
    expect(sprites).toHaveLength(2);
    expect(sprites[0].alpha).toBeLessThan(1);
    expect(sprites[1].alpha).toBe(1);
  });

  it("should hide its body, bar and ring where the hide rule says, and show them again", () => {
    const { set, sprites, bars, rings } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.hideWhere(() => true);
    expect([sprites[0].visible, bars[0].visible, rings[0].visible]).toEqual([false, false, false]);
    set.update(16);
    expect(bars[0].visible).toBe(false);
    set.hideWhere(() => false);
    set.update(16);
    expect([sprites[0].visible, bars[0].visible, rings[0].visible]).toEqual([true, true, true]);
  });

  it("should take every hound away at once when the floor goes", () => {
    const { set, sprites, bars, rings } = onStage();
    set.sync([hound()]);
    set.update(16);
    set.clear();
    expect([sprites[0].destroyed, bars[0].destroyed, rings[0].destroyed]).toEqual([true, true, true]);
    expect(set.size).toBe(0);
  });
});

describe("HoundSet: the hound's bay, a mark at what it bays at (FS-X2CMM §J R49)", () => {
  const drawn = (g: ReturnType<typeof fakeGraphics>) => g.calls.some(([c]) => c === "strokeEllipse" || c === "fillEllipse");

  it("should draw no bay while the state gives none", () => {
    const { set, houndBays } = onStage();
    set.sync([hound()]);
    set.update(16);
    expect(houndBays).toHaveLength(1);
    expect(houndBays[0].visible).toBe(false);
    expect(drawn(houndBays[0])).toBe(false);
  });

  it("should ripple verdigris rings out on the floor at the point it bays toward, not at the hound", () => {
    const { set, houndBays } = onStage();
    set.sync([hound({ bay: { x: 640, y: 300 } })]);
    set.update(200);
    const houndBay = houndBays[0];
    const at = worldToScreen(640, 300);
    expect([houndBay.x, houndBay.y]).toEqual([at.x, at.y]);
    expect(houndBay.visible).toBe(true);
    expect(drawn(houndBay)).toBe(true);
    for (const [, , color] of houndBay.calls.filter(([c]) => c === "lineStyle")) expect(color).toBe(palette.bookEffect.houndBay);
  });

  it("should play one bay once, its ripple gone after its time though the state still names it", () => {
    const { set, houndBays } = onStage();
    set.sync([hound({ bay: { x: 640, y: 300 } })]);
    set.update(16);
    set.sync([hound({ bay: { x: 640, y: 300 } })]);
    set.update(HOUND_BAY.ms);
    expect(houndBays[0].visible).toBe(false);
  });

  it("should finish a bay's ripple when the state stops naming it, and play a new bay afresh", () => {
    const { set, houndBays } = onStage();
    set.sync([hound({ bay: { x: 640, y: 300 } })]);
    set.update(16);
    set.sync([hound()]);
    set.update(200);
    expect(houndBays[0].visible).toBe(true);
    set.update(HOUND_BAY.ms);
    expect(houndBays[0].visible).toBe(false);
    set.sync([hound({ bay: { x: 400, y: 500 } })]);
    set.update(16);
    const at = worldToScreen(400, 500);
    expect([houndBays[0].visible, houndBays[0].x, houndBays[0].y]).toEqual([true, at.x, at.y]);
  });

  it("should hide its bay with the hound where the hide rule says, and destroy it with the hound", () => {
    const { set, houndBays } = onStage();
    set.sync([hound({ bay: { x: 640, y: 300 } })]);
    set.update(16);
    set.hideWhere(() => true);
    set.update(16);
    expect(houndBays[0].visible).toBe(false);
    set.clear();
    expect(houndBays[0].destroyed).toBe(true);
  });
});
