import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ArtLibrary } from "@/render/art/library";
import type { ArtAnimation, ArtManifest } from "@/render/art/manifest";
import { MARKER_DEPTH } from "@/render/markers";
import { palette, toCss } from "@/utils/canvasPalette";
import { worldDepth } from "@/render/iso/shapes";
import { worldToScreen } from "@/render/iso/projection";
import type { footprintHitArea } from "@/render/world/footprint";
import type { MonsterState } from "@/types/gameState";
import {
  DELVER_REFERENCE_SHEET,
  MonsterRoster,
  SIZE_TIERS,
  monsterLook,
  elitePlate,
  monsterScale,
  nameplate,
  type MonsterStage,
} from "./monsters";

const quiet = { warn: () => {} };

/** An 8-way clip of `count` frames at `fps`. */
const clip = (fps: number, loop: boolean, count: number): ArtAnimation => ({
  fps,
  loop,
  frames: Array.from({ length: 8 }, (_, d) =>
    Array.from({ length: count }, (_, i) => ({ x: i * 10, y: d * 10 })),
  ),
});

const creatureSheet = (atlas: string, crown: number) => ({
  atlas,
  frameWidth: 200,
  frameHeight: 180,
  anchor: { x: 0.4, y: 0.76 },
  directions: 8 as const,
  animations: {
    idle: clip(5, true, 6),
    walk: clip(10, true, 8),
    attack: clip(12, false, 6),
    death: clip(9, false, 7),
  },
  crown,
  source: "authored: test",
  licence: "Barrowspire-original",
});

function fixtureArt(): ArtLibrary {
  const atlas = (image: string) => ({
    image,
    width: 1024,
    height: 1024,
    sha256: "a".repeat(64),
  });
  const manifest: ArtManifest = {
    version: 1,
    tile: { width: 64, height: 32 },
    facings: ["e", "se", "s", "sw", "w", "nw", "n", "ne"],
    atlases: {
      "characters-1": atlas("characters-1.png"),
      "creatures-0": atlas("creatures-0.png"),
      "creatures-1": atlas("creatures-1.png"),
    },
    sheets: {
      char_knight_base: creatureSheet("characters-1", 80),
      creature_ghoul_base: creatureSheet("creatures-1", 72),
      creature_troll_base: creatureSheet("creatures-0", 96),
      creature_demon_base: creatureSheet("creatures-1", 110),
    },
  };
  return new ArtLibrary(manifest, quiet);
}

/** The real baked manifest: size tiers are judged against the art as drawn. */
const baked = new ArtLibrary(
  JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  ) as ArtManifest,
  quiet,
);

/** A stand-in for the scene: records every object it hands out. */
function fakeStage() {
  const sprites: ReturnType<typeof fakeSprite>[] = [];
  const texts: ReturnType<typeof fakeText>[] = [];
  const bars: ReturnType<typeof fakeBar>[] = [];
  const stage: MonsterStage = {
    sprite: () => {
      const s = fakeSprite();
      sprites.push(s);
      return s;
    },
    text: (content, style) => {
      const t = fakeText(content, style.color);
      texts.push(t);
      return t;
    },
    graphics: () => {
      const g = fakeBar();
      bars.push(g);
      return g;
    },
  };
  return { stage, sprites, texts, bars };
}

/** The hit area a monster's sprite is given: Phaser calls the callback with frame-local points. */
interface Interactive {
  hitArea: object;
  hitAreaCallback: ReturnType<typeof footprintHitArea>;
}

function fakeSprite() {
  const frames = Array.from({ length: 8 }, (_, i) => ({ i }));
  const sprite = {
    x: 0,
    y: 0,
    depth: 0,
    scaleX: 1,
    scaleY: 1,
    displayOriginY: 0,
    texture: "",
    tint: null as number | null,
    frame: undefined as string | number | undefined,
    destroyed: false,
    plays: [] as { key: string; startFrame?: number }[],
    anims: {
      currentAnim: null as { key: string; frames: unknown[] } | null,
      currentFrame: null as unknown,
      timeScale: 1,
    },
    setTexture(key: string, frame?: string | number) {
      sprite.texture = key;
      sprite.frame = frame;
      return sprite;
    },
    setOrigin(_x: number, y: number) {
      sprite.displayOriginY = y * 180;
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
    setTint(t: number) {
      sprite.tint = t;
      return sprite;
    },
    clearTint() {
      sprite.tint = null;
      return sprite;
    },
    interactive: null as Interactive | null,
    setInteractive(config: Interactive) {
      sprite.interactive = config;
      return sprite;
    },
    handlers: {} as Record<string, () => void>,
    on(event: string, fn: () => void) {
      sprite.handlers[event] = fn;
      return sprite;
    },
    /** What Phaser does when the pointer meets the sprite's hit area. */
    emit(event: string) {
      sprite.handlers[event]?.();
    },
    setScale(s: number) {
      sprite.scaleX = s;
      sprite.scaleY = s;
      return sprite;
    },
    destroy() {
      sprite.destroyed = true;
    },
  };
  return sprite;
}

function fakeText(content: string, color = "") {
  const text = {
    content,
    color,
    /** Roughly what the 11px body face sets a glyph at. */
    get width() {
      return text.content.length * 6;
    },
    x: 0,
    y: 0,
    depth: 0,
    visible: true,
    destroyed: false,
    setText(t: string) {
      text.content = t;
      return text;
    },
    setPosition(x: number, y: number) {
      text.x = x;
      text.y = y;
      return text;
    },
    setVisible(v: boolean) {
      text.visible = v;
      return text;
    },
    setDepth(d: number) {
      text.depth = d;
      return text;
    },
    setOrigin() {
      return text;
    },
    destroy() {
      text.destroyed = true;
    },
  };
  return text;
}

function fakeBar() {
  const bar = {
    depth: 0,
    visible: true,
    destroyed: false,
    fills: [] as { color: number; w: number }[],
    pendingColor: 0,
    clear() {
      bar.fills = [];
      return bar;
    },
    fillStyle(color: number) {
      bar.pendingColor = color;
      return bar;
    },
    fillRect(_x: number, _y: number, w: number) {
      bar.fills.push({ color: bar.pendingColor, w });
      return bar;
    },
    lineStyle() {
      return bar;
    },
    strokeRect() {
      return bar;
    },
    setVisible(v: boolean) {
      bar.visible = v;
      return bar;
    },
    setDepth(d: number) {
      bar.depth = d;
      return bar;
    },
    destroy() {
      bar.destroyed = true;
    },
  };
  return bar;
}

const monster = (fields: Partial<MonsterState> = {}): MonsterState => ({
  entity_id: "m1",
  archetype: "troll",
  name: "Troll",
  level: 3,
  elite: false,
  boss: false,
  position: { x: 400, y: 300 },
  facing: { x: -1, y: 0 },
  action: "idle",
  current_health: 120,
  max_health: 120,
  ...fields,
});

const FRAME = 1000 / 60;

describe("MonsterRoster", () => {
  it("should draw a moving troll from the troll sheet, walking west, under its nameplate", () => {
    const { stage, sprites, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());

    roster.sync([monster({ action: "move" })]);
    roster.update(FRAME);

    expect(sprites).toHaveLength(1);
    expect(sprites[0].texture).toBe("art:creatures-0");
    // `w` is index 4 of the manifest's direction order
    expect(sprites[0].anims.currentAnim?.key).toBe(
      "creature_troll_base/walk/4",
    );
    expect(texts.map((t) => t.content)).toEqual(["Troll · Lv 3"]);
  });
});

describe("monsterLook", () => {
  it("should draw each archetype from its own baked sheet", () => {
    expect(monsterLook("ghoul").sheet).toBe("creature_ghoul_base");
    expect(monsterLook("troll").sheet).toBe("creature_troll_base");
    expect(monsterLook("demon").sheet).toBe("creature_demon_base");
  });

  it("should fall back to a sheet that exists rather than crash on an archetype it does not know", () => {
    for (const unknown of ["wraith", ""])
      expect(baked.has(monsterLook(unknown).sheet)).toBe(true);
  });
});

describe("size reads as threat tier (req 35)", () => {
  /** Drawn head height over a delver's, both off the baked manifest. */
  const heightOverDelver = (archetype: string) => {
    const look = monsterLook(archetype);
    const crown = baked.sheet(look.sheet)!.crown!;
    const delver = baked.sheet(DELVER_REFERENCE_SHEET)!.crown!;
    return (crown * monsterScale(look, baked)) / delver;
  };

  it.each([
    ["ghoul", SIZE_TIERS.fodder],
    ["troll", SIZE_TIERS.brute],
    ["demon", SIZE_TIERS.boss],
  ])("should stand a %s inside its tier's band", (archetype, tier) => {
    const ratio = heightOverDelver(archetype);
    expect(ratio).toBeGreaterThanOrEqual(tier.min);
    expect(ratio).toBeLessThanOrEqual(tier.max);
  });

  it("should put the sprite at that scale", () => {
    const { stage, sprites } = fakeStage();
    new MonsterRoster(stage, baked).sync([monster({ archetype: "ghoul" })]);
    expect(sprites[0].scaleY).toBeCloseTo(
      monsterScale(monsterLook("ghoul"), baked),
    );
  });
});

describe("nameplate", () => {
  it("should read name, then level", () => {
    expect(nameplate({ name: "Ghoul", level: 14 })).toBe("Ghoul · Lv 14");
  });
});

describe("MonsterRoster clips", () => {
  it.each([
    [{ x: 1, y: 0 }, 0],
    [{ x: 1, y: 1 }, 1],
    [{ x: 0, y: 1 }, 2],
    [{ x: -1, y: 1 }, 3],
    [{ x: -1, y: 0 }, 4],
    [{ x: -1, y: -1 }, 5],
    [{ x: 0, y: -1 }, 6],
    [{ x: 1, y: -1 }, 7],
  ])(
    "should face the server's facing %o (direction %i)",
    (facing, direction) => {
      const { stage, sprites } = fakeStage();
      const roster = new MonsterRoster(stage, fixtureArt());
      roster.sync([monster({ facing })]);
      roster.update(FRAME);
      expect(sprites[0].anims.currentAnim?.key).toBe(
        `creature_troll_base/idle/${direction}`,
      );
    },
  );

  it.each([
    ["idle", "idle"],
    ["move", "walk"],
    ["attack", "attack"],
    ["dead", "death"],
  ] as const)("should play %s as the %s clip", (action, clipName) => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ archetype: "ghoul", action })]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toBe(
      `creature_ghoul_base/${clipName}/4`,
    );
  });

  it("should keep its last facing when the server sends none", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ facing: { x: 0, y: 1 } })]);
    roster.update(FRAME);
    roster.sync([monster({ facing: { x: 0, y: 0 } })]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toBe(
      "creature_troll_base/idle/2",
    );
  });
});

describe("MonsterRoster death (req 36)", () => {
  it("should play the death clip once and hold it while the corpse stays in state", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ action: "attack" })]);
    roster.update(FRAME);
    for (let i = 1; i <= 30; i++) {
      roster.sync([monster({ action: "dead", current_health: 0 })]);
      roster.update(FRAME);
    }
    const deaths = sprites[0].plays.filter((p) => p.key.includes("/death/"));
    expect(deaths).toEqual([
      { key: "creature_troll_base/death/4", startFrame: 0 },
    ]);
    expect(sprites[0].destroyed).toBe(false);
  });

  it("should not roll a corpse over if a later tick turns its facing", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ action: "dead" })]);
    roster.update(FRAME);
    roster.sync([monster({ action: "dead", facing: { x: 1, y: 0 } })]);
    roster.update(FRAME);
    expect(sprites[0].plays).toHaveLength(1);
  });

  it("should lay a corpse it first sees already fallen, without replaying the fall (reconnect)", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ action: "dead", current_health: 0 })]);
    roster.update(FRAME);
    // the fixture's death clip has 7 frames
    expect(sprites[0].plays).toEqual([
      { key: "creature_troll_base/death/4", startFrame: 6 },
    ]);
  });

  it("should hide the nameplate and HP bar once dead", () => {
    const { stage, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster()]);
    roster.update(FRAME);
    expect(texts[0].visible).toBe(true);
    expect(bars[0].visible).toBe(true);

    roster.sync([monster({ action: "dead", current_health: 0 })]);
    roster.update(FRAME);
    expect(texts[0].visible).toBe(false);
    expect(bars[0].visible).toBe(false);
  });

  it("should destroy a monster, plate and bar included, once it is absent from state", () => {
    const { stage, sprites, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([
      monster({ entity_id: "a" }),
      monster({ entity_id: "b", action: "dead" }),
    ]);
    roster.sync([monster({ entity_id: "a" })]);
    expect(roster.size).toBe(1);
    expect([
      sprites[1].destroyed,
      texts[1].destroyed,
      bars[1].destroyed,
    ]).toEqual([true, true, true]);
    expect(sprites[0].destroyed).toBe(false);
  });

  it("should draw every live monster and corpse a reconnecting broadcast carries", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([
      monster({ entity_id: "a", archetype: "ghoul" }),
      monster({ entity_id: "b", action: "dead" }),
      monster({ entity_id: "c", action: "move" }),
    ]);
    roster.update(FRAME);
    expect(sprites.map((s) => s.anims.currentAnim?.key)).toEqual([
      "creature_ghoul_base/idle/4",
      "creature_troll_base/death/4",
      "creature_troll_base/walk/4",
    ]);
  });
});

describe("MonsterRoster markers (req 37)", () => {
  it("should draw the plate and HP bar as hostile markers, above the lighting", () => {
    const { stage, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 30, max_health: 120 })]);
    roster.update(FRAME);
    expect(texts[0].depth).toBe(MARKER_DEPTH.name);
    expect(bars[0].depth).toBe(MARKER_DEPTH.bar);
    // backing, then the HP fill at a quarter of the bar
    const fill = bars[0].fills.at(-1)!;
    expect(fill.w).toBe(Math.round(38 / 4));
  });

  it("should seat the plate over the head, and follow the level the server sends", () => {
    const { stage, sprites, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster()]);
    roster.update(FRAME);
    expect(texts[0].y).toBeLessThan(sprites[0].y - 96 * sprites[0].scaleY);

    roster.sync([monster({ level: 4 })]);
    roster.update(FRAME);
    expect(texts[0].content).toBe("Troll · Lv 4");
  });

  it("should stand a monster on its footprint, sorted like a delver", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ position: { x: 640, y: 200 } })]);
    expect(sprites[0].depth).toBe(worldDepth(640, 200, 1));
  });
});

describe("elite marker (req 38)", () => {
  const elite = (fields: Partial<MonsterState> = {}) =>
    monster({
      archetype: "ghoul",
      name: "Hollow Ghoul",
      elite: true,
      level: 5,
      ...fields,
    });

  it("should letter an elite's prefix apart from its name, in the hostile accent", () => {
    const { stage, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([elite()]);
    roster.update(FRAME);

    const prefix = texts.find((t) => t.content === "Hollow");
    const rest = texts.find((t) => t.content === "Ghoul · Lv 5");
    expect(prefix?.color).toBe(toCss(palette.markerElite));
    expect(rest?.color).toBe(toCss(palette.markerHostile));
    expect(palette.markerElite).not.toBe(palette.markerHostile);
  });

  it("should set the prefix just left of the rest, the pair centred over the head", () => {
    const { stage, sprites, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([elite()]);
    roster.update(FRAME);

    const [rest, prefix] = texts;
    const x = sprites[0].x;
    // prefix is right-anchored, the rest centre-anchored: both on one baseline
    const left = prefix.x - prefix.width;
    const right = rest.x + rest.width / 2;
    expect(prefix.x).toBeLessThan(rest.x - rest.width / 2);
    expect((left + right) / 2).toBeCloseTo(x, 0);
    expect(prefix.y).toBe(rest.y);
    expect(prefix.depth).toBe(MARKER_DEPTH.name);
  });

  it("should hide the prefix with the plate once dead, and destroy it with the monster", () => {
    const { stage, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([elite()]);
    roster.update(FRAME);
    roster.sync([elite({ action: "dead", current_health: 0 })]);
    roster.update(FRAME);
    expect(texts.map((t) => t.visible)).toEqual([false, false]);

    roster.sync([]);
    expect(texts.map((t) => t.destroyed)).toEqual([true, true]);
  });

  it("should leave a common monster's plate as one line in the plate ink", () => {
    const { stage, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ archetype: "ghoul", name: "Ghoul", level: 5 })]);
    roster.update(FRAME);
    expect(texts.map((t) => [t.content, t.color])).toEqual([
      ["Ghoul · Lv 5", toCss(palette.markerHostile)],
    ]);
  });
});

/** Hue in degrees of a 0xRRGGBB colour. */
function hue(color: number): number {
  const [r, g, b] = [16, 8, 0].map((s) => ((color >> s) & 0xff) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("hostile tint (req 38, 41)", () => {
  it.each([
    ["elite prefix", palette.markerElite],
    ["elite tint", palette.eliteTint],
  ])(
    "should keep the %s in the ember/oxblood family: never amber, never green",
    (_, ink) => {
      expect(hue(ink)).toBeLessThanOrEqual(hue(palette.ember));
      expect(hue(ink)).toBeLessThan(hue(palette.interactable));
      expect(hue(ink)).toBeLessThan(hue(palette.safe));
    },
  );

  it("should wash an elite in the hostile tint, and leave a common monster untinted", () => {
    const { stage, sprites } = fakeStage();
    new MonsterRoster(stage, fixtureArt()).sync([
      monster({ entity_id: "a", name: "Hollow Troll", elite: true }),
      monster({ entity_id: "b" }),
    ]);
    expect(sprites.map((s) => s.tint)).toEqual([palette.eliteTint, null]);
  });
});

describe("the demon (req 41)", () => {
  const demon = (fields: Partial<MonsterState> = {}) =>
    monster({
      archetype: "demon",
      name: "Demon",
      boss: true,
      level: 7,
      ...fields,
    });

  it("should draw a demon from its own baked sheet, as baked, at boss size", () => {
    const { stage, sprites, texts } = fakeStage();
    const roster = new MonsterRoster(stage, baked);
    roster.sync([demon()]);
    roster.update(FRAME);

    expect(monsterLook("demon")).toEqual({
      sheet: "creature_demon_base",
      tier: "boss",
    });
    expect(baked.has("creature_demon_base")).toBe(true);
    expect(sprites[0].anims.currentAnim?.key).toMatch(/^creature_demon_base\//);
    expect(sprites[0].tint).toBeNull();
    expect(SIZE_TIERS.boss.min).toBeGreaterThanOrEqual(1.8);
    expect(texts.map((t) => t.content)).toEqual(["Demon · Lv 7"]);
  });
});

describe("elitePlate", () => {
  it.each([
    ["Dread", "ghoul", "Dread Ghoul"],
    ["Grave-sworn", "ghoul", "Grave-sworn Ghoul"],
    ["Hollow", "troll", "Hollow Troll"],
    ["Barrow-cursed", "troll", "Barrow-cursed Troll"],
  ] as const)(
    "should take %s off an elite %s's name",
    (prefix, archetype, name) => {
      const base = name.slice(prefix.length + 1);
      expect(elitePlate({ name, archetype, level: 9, elite: true })).toEqual({
        prefix,
        rest: `${base} · Lv 9`,
      });
    },
  );

  it.each([
    ["a common monster", { name: "Ghoul", archetype: "ghoul", elite: false }],
    [
      "an elite with no prefix",
      { name: "Ghoul", archetype: "ghoul", elite: true },
    ],
    [
      "a name without its base name",
      { name: "Hollow Thing", archetype: "ghoul", elite: true },
    ],
  ] as const)("should set nothing apart for %s", (_, fields) => {
    expect(elitePlate({ level: 2, ...fields })).toBeNull();
  });
});

describe("targeting monsters (req 39)", () => {
  function targeted() {
    const { stage, sprites } = fakeStage();
    const targeting = { strike: vi.fn(), hover: vi.fn() };
    const roster = new MonsterRoster(stage, fixtureArt(), targeting);
    return { roster, sprites, targeting };
  }

  it("should strike a living monster clicked, by its entity id", () => {
    const { roster, sprites, targeting } = targeted();
    roster.sync([monster({ entity_id: "m7" })]);
    sprites[0].emit("pointerdown");
    expect(targeting.strike).toHaveBeenCalledTimes(1);
    expect(targeting.strike.mock.calls[0][0].entity_id).toBe("m7");
  });

  it("should strike with the monster as the latest broadcast has it", () => {
    const { roster, sprites, targeting } = targeted();
    roster.sync([monster()]);
    roster.sync([monster({ position: { x: 500, y: 320 } })]);
    sprites[0].emit("pointerdown");
    expect(targeting.strike.mock.calls[0][0].position).toEqual({
      x: 500,
      y: 320,
    });
  });

  it("should ignore a click or hover on a corpse", () => {
    const { roster, sprites, targeting } = targeted();
    roster.sync([monster({ action: "dead", current_health: 0 })]);
    sprites[0].emit("pointerover");
    sprites[0].emit("pointerdown");
    expect(targeting.strike).not.toHaveBeenCalled();
    expect(targeting.hover).not.toHaveBeenCalled();
  });

  it("should report the pointer coming onto a living monster and leaving it", () => {
    const { roster, sprites, targeting } = targeted();
    roster.sync([monster({ entity_id: "m7" })]);
    sprites[0].emit("pointerover");
    expect(targeting.hover).toHaveBeenLastCalledWith(
      expect.objectContaining({ entity_id: "m7" }),
    );
    sprites[0].emit("pointerout");
    expect(targeting.hover).toHaveBeenLastCalledWith(null);
  });

  it.each([
    ["dies", [monster({ action: "dead", current_health: 0 })]],
    ["is removed", []],
  ])(
    "should let go of the hover when the monster under the pointer %s",
    (_, next) => {
      const { roster, sprites, targeting } = targeted();
      roster.sync([monster()]);
      sprites[0].emit("pointerover");
      targeting.hover.mockClear();
      roster.sync(next);
      expect(targeting.hover).toHaveBeenCalledTimes(1);
      expect(targeting.hover).toHaveBeenCalledWith(null);
    },
  );

  it("should not report a hover it never had", () => {
    const { roster, targeting } = targeted();
    roster.sync([monster()]);
    roster.sync([]);
    expect(targeting.hover).not.toHaveBeenCalled();
  });

  it("should hit-test the ground the monster stands on, not its sprite's frame", () => {
    const { roster, sprites } = targeted();
    roster.sync([monster({ position: { x: 400, y: 300 } })]);
    const hit = sprites[0].interactive!.hitAreaCallback;
    const flat = {
      x: 0,
      y: 0,
      displayOriginX: 0,
      displayOriginY: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const under = (wx: number, wy: number) => {
      const at = worldToScreen(wx, wy);
      return hit({}, at.x, at.y, flat);
    };
    expect(under(400, 300)).toBe(true);
    expect(under(410, 305)).toBe(true);
    expect(under(400, 400)).toBe(false);
  });

  it("should give a brute a wider footprint than fodder", () => {
    const { roster, sprites } = targeted();
    roster.sync([
      monster({
        entity_id: "g",
        archetype: "ghoul",
        position: { x: 400, y: 300 },
      }),
      monster({
        entity_id: "t",
        archetype: "troll",
        position: { x: 400, y: 300 },
      }),
    ]);
    const flat = {
      x: 0,
      y: 0,
      displayOriginX: 0,
      displayOriginY: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const at = worldToScreen(425, 300);
    const [ghoul, troll] = sprites.map((s) =>
      s.interactive!.hitAreaCallback({}, at.x, at.y, flat),
    );
    expect(ghoul).toBe(false);
    expect(troll).toBe(true);
  });
});

describe("the damage flash (req 39)", () => {
  const FLASHED = 250;

  it("should flash a monster whose health drops, then return it to its baked look", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 120 })]);
    roster.sync([monster({ current_health: 100 })]);
    expect(sprites[0].tint).toBe(palette.damage);
    roster.update(FLASHED);
    expect(sprites[0].tint).toBeNull();
  });

  it("should return an elite to its hostile wash, not wipe it", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    const elite = (hp: number) =>
      monster({ name: "Hollow Troll", elite: true, current_health: hp });
    roster.sync([elite(120)]);
    roster.sync([elite(90)]);
    expect(sprites[0].tint).toBe(palette.damage);
    roster.update(FLASHED);
    expect(sprites[0].tint).toBe(palette.eliteTint);
  });

  it("should hold the flash for a moment, not clear it on the next frame", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 120 })]);
    roster.sync([monster({ current_health: 100 })]);
    roster.update(FRAME);
    expect(sprites[0].tint).toBe(palette.damage);
  });

  it("should not flash on first sight, or on health that holds or rises", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 50 })]);
    roster.sync([monster({ current_health: 50 })]);
    roster.sync([monster({ current_health: 60 })]);
    expect(sprites[0].tint).toBeNull();
  });
});
