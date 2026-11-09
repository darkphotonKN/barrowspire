import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ArtLibrary } from "@/render/art/library";
import type { ArtAnimation, ArtManifest } from "@/render/art/manifest";
import { MARKER_BAR, MARKER_DEPTH } from "@/render/markers";
import { CHIP_DRAIN_MS, CHIP_HOLD_MS } from "@/render/markers/healthBar";
import { palette, toCss } from "@/utils/canvasPalette";
import { worldDepth } from "@/render/iso/shapes";
import { worldToScreen } from "@/render/iso/projection";
import type { footprintHitArea } from "@/render/world/footprint";
import type { MonsterArchetype, MonsterState } from "@/types/gameState";
import {
  FALLBACK_LOOK,
  PLAYER_REFERENCE_SHEET,
  MonsterRoster,
  SIZE_TIERS,
  BODY_HALF_WIDTH,
  CHIP_BUDGET,
  OVERHEAD_BAR,
  bodyColumn,
  drawnLook,
  monsterLook,
  elitePlate,
  monsterClip,
  monsterScale,
  monsterTint,
  nameplate,
  type MonsterArtFetch,
  type MonsterEffects,
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

/** `clawed`: the demon's sheet carries the `claw` clip, as it will once baked (FS-VHGE7 §E). */
function fixtureArt({ clawed = false } = {}): ArtLibrary {
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
      creature_demon_base: clawed
        ? (() => {
            const sheet = creatureSheet("creatures-1", 110);
            return {
              ...sheet,
              animations: { ...sheet.animations, claw: clip(12, false, 4) },
            };
          })()
        : creatureSheet("creatures-1", 110),
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
function fakeStage(backing = { scale: 1 }) {
  const sprites: ReturnType<typeof fakeSprite>[] = [];
  const texts: ReturnType<typeof fakeText>[] = [];
  const bars: ReturnType<typeof fakeBar>[] = [];
  const stage: MonsterStage = {
    renderScale: () => backing.scale,
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
  return { stage, sprites, texts, bars, backing };
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
    displayOriginX: 0,
    displayOriginY: 0,
    texture: "",
    tint: null as number | null,
    frame: undefined as string | number | undefined,
    destroyed: false,
    visible: true,
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
    setOrigin(x: number, y: number) {
      // the fixture's creature frame is 200 x 180
      sprite.displayOriginX = x * 200;
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
    /** The clip's progress, as the animation advancing would have it. */
    at(index: number) {
      sprite.anims.currentFrame = frames[index];
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
    x: 0,
    y: 0,
    /** How many times it has been drawn: each draw starts with a clear. */
    draws: 0,
    fills: [] as { color: number; x: number; y: number; w: number; h: number }[],
    pendingColor: 0,
    clear() {
      bar.fills = [];
      bar.draws += 1;
      return bar;
    },
    fillStyle(color: number) {
      bar.pendingColor = color;
      return bar;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      bar.fills.push({ color: bar.pendingColor, x, y, w, h });
      return bar;
    },
    lineStyle() {
      return bar;
    },
    strokeRect() {
      return bar;
    },
    setPosition(x: number, y: number) {
      bar.x = x;
      bar.y = y;
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

  it("should draw an archetype it does not know as the troll", () => {
    expect(FALLBACK_LOOK.sheet).toBe("creature_troll_base");
    for (const unknown of ["wraith", "revenant", ""])
      expect(monsterLook(unknown)).toBe(FALLBACK_LOOK);
  });
});

describe("the Forlorn Forest's dead (FS-3QHQZ §C R29)", () => {
  it.each([
    ["zombie", "creature_zombie_base"],
    ["ghost", "creature_ghost_base"],
  ] as [MonsterArchetype, string][])(
    "should draw a %s from its own baked sheet, at fodder tier",
    (archetype, sheet) => {
      expect(monsterLook(archetype)).toEqual({ sheet, tier: "fodder" });
      expect(baked.has(sheet)).toBe(true);
    },
  );

  it("should play a ghost's clips from its own sheet, drawn as baked", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, baked);
    roster.sync([monster({ archetype: "ghost", name: "Ghost" })]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toMatch(/^creature_ghost_base\//);
    expect(sprites[0].tint).toBeNull();
  });
});

describe("the tower's own dead (FS-M8CSE §D R17, §H R37)", () => {
  it.each([
    ["barrow_thrall", "creature_barrow_thrall_base"],
    ["spire_wraith", "creature_spire_wraith_base"],
  ] as [MonsterArchetype, string][])(
    "should draw a %s from its own baked sheet, at fodder tier, with no tint",
    (archetype, sheet) => {
      expect(monsterLook(archetype)).toEqual({ sheet, tier: "fodder" });
      expect(baked.has(sheet)).toBe(true);
    },
  );

  it("should keep the elite wash on an elite tower monster", () => {
    const look = monsterLook("barrow_thrall");
    expect(monsterTint(look, { elite: true })).toBe(palette.eliteTint);
    expect(monsterTint(look, { elite: false })).toBeUndefined();
  });
});

describe("the boar and its elite (FS-X2F2H §H R61)", () => {
  const boar = (fields: Partial<MonsterState> = {}) =>
    monster({ archetype: "boar", name: "Boar", ...fields });

  it("should draw a boar from its own baked sheet at fodder tier, an elite one from the elite sheet", () => {
    const look = monsterLook("boar");
    expect(look.sheet).toBe("creature_boar_base");
    expect(look.elite).toBe("creature_boar_elite");
    expect(look.tier).toBe("fodder");
    expect(baked.has(look.sheet)).toBe(true);
    expect(baked.has(look.elite!)).toBe(true);
  });

  it("should play a common boar's clips from the base sheet and an elite boar's from the elite sheet", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, baked);
    roster.sync([
      boar({ entity_id: "a" }),
      boar({ entity_id: "b", name: "Scarred Boar", elite: true }),
    ]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toMatch(/^creature_boar_base\//);
    expect(sprites[1].anims.currentAnim?.key).toMatch(/^creature_boar_elite\//);
  });

  it("should draw the elite boar as baked: its sheet is its elite look, so no hostile wash over it", () => {
    const { stage, sprites } = fakeStage();
    new MonsterRoster(stage, baked).sync([
      boar({ name: "Old Boar", elite: true }),
    ]);
    expect(sprites[0].tint).toBeNull();
  });

  it("should still letter an elite boar's prefix apart, in the hostile accent", () => {
    const { stage, texts } = fakeStage();
    const roster = new MonsterRoster(stage, baked);
    roster.sync([boar({ name: "Great Boar", elite: true, level: 4 })]);
    roster.update(FRAME);
    expect(texts.map((t) => [t.content, t.color])).toEqual([
      ["Boar · Lv 4", toCss(palette.markerHostile)],
      ["Great", toCss(palette.markerElite)],
    ]);
  });

  it("should draw an elite ghoul as before: the ghoul sheet, washed in the elite tint", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, baked);
    roster.sync([
      monster({ archetype: "ghoul", name: "Hollow Ghoul", elite: true }),
    ]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toMatch(/^creature_ghoul_base\//);
    expect(sprites[0].tint).toBe(palette.eliteTint);
  });

  it("should lay a dead elite boar first seen on the elite sheet's last death frame", () => {
    const { stage, sprites } = fakeStage();
    new MonsterRoster(stage, baked).sync([
      boar({
        name: "Old Boar",
        elite: true,
        action: "dead",
        current_health: 0,
      }),
    ]);
    const last =
      baked.sheet("creature_boar_elite")!.animations.death.frames[0].length - 1;
    expect(sprites[0].plays.at(-1)?.key).toMatch(
      /^creature_boar_elite\/death\//,
    );
    expect(sprites[0].plays.at(-1)?.startFrame).toBe(last);
  });
});

describe("size reads as threat tier (req 35)", () => {
  /** Drawn head height over a player's, both off the baked manifest. */
  const heightOverPlayer = (archetype: string) => {
    const look = monsterLook(archetype);
    const crown = baked.sheet(look.sheet)!.crown!;
    const player = baked.sheet(PLAYER_REFERENCE_SHEET)!.crown!;
    return (crown * monsterScale(look, baked)) / player;
  };

  it.each([
    ["ghoul", SIZE_TIERS.fodder],
    ["zombie", SIZE_TIERS.fodder],
    ["ghost", SIZE_TIERS.fodder],
    ["barrow_thrall", SIZE_TIERS.fodder],
    ["spire_wraith", SIZE_TIERS.fodder],
    ["troll", SIZE_TIERS.brute],
    ["demon", SIZE_TIERS.boss],
    ["blood_demon", SIZE_TIERS.boss],
    ["daagon", SIZE_TIERS.boss],
  ])("should stand a %s inside its tier's band", (archetype, tier) => {
    const ratio = heightOverPlayer(archetype);
    expect(ratio).toBeGreaterThanOrEqual(tier.min);
    expect(ratio).toBeLessThanOrEqual(tier.max);
  });

  /**
   * A quadruped is measured by body length, not height (guideline "Size is a threat tier"): its
   * side-on length in screen px reads as cos 30° px of height.
   */
  const lengthOverPlayer = (archetype: string, elite = false) => {
    const look = monsterLook(archetype);
    const sheet = baked.sheet(elite ? look.elite! : look.sheet)!;
    const player = baked.sheet(PLAYER_REFERENCE_SHEET)!.crown!;
    return (
      (sheet.length! * Math.cos(Math.PI / 6) * monsterScale(look, baked)) /
      player
    );
  };

  it.each([false, true])(
    "should draw a boar (elite: %s) inside the fodder band by body length, shorter than a player is tall",
    (elite) => {
      expect(monsterLook("boar").measure).toBe("length");
      const ratio = lengthOverPlayer("boar", elite);
      expect(ratio).toBeGreaterThanOrEqual(SIZE_TIERS.fodder.min);
      expect(ratio).toBeLessThan(1);
    },
  );

  it("should measure a quadruped by its length, which no crown can stand in for", () => {
    const look = {
      sheet: "q",
      tier: "fodder" as const,
      measure: "length" as const,
    };
    const art = {
      sheet: (name: string) =>
        name === "q" ? { crown: 40, length: 100 } : { crown: 80 },
    };
    expect(monsterScale(look, art)).toBeCloseTo(
      (SIZE_TIERS.fodder.aim * 80) / (100 * Math.cos(Math.PI / 6)),
    );
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
    // the trough, then the HP fill at a quarter of the bar
    const trough = bars[0].fills.find((f) => f.color === MARKER_BAR.trough)!;
    const fill = bars[0].fills.find((f) => f.color === MARKER_BAR.hp)!;
    expect(trough.w).toBe(OVERHEAD_BAR.width);
    expect(fill.w).toBe(Math.round(OVERHEAD_BAR.width / 4));
  });

  it("should lay the overhead bar on a deep-red trough with no rim (FS-48CTQ §F.21, owner playtest 2026-11-07)", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 30, max_health: 120 })]);
    roster.update(FRAME);
    const fills = bars[0].fills;
    const trough = fills[0];
    expect(trough.color).toBe(palette.markerHpTrough);
    for (const f of fills) {
      expect(f.x).toBeGreaterThanOrEqual(trough.x);
      expect(f.y).toBeGreaterThanOrEqual(trough.y);
      expect(f.x + f.w).toBeLessThanOrEqual(trough.x + trough.w);
      expect(f.y + f.h).toBeLessThanOrEqual(trough.y + trough.h);
    }
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

  it("should stand a monster on its footprint, sorted like a player", () => {
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

// FS-VHGE7 §C R26–28, §E R41: the blood demon, drawn from its own baked sheet (I-VHGE7-6), which
// replaced I-VHGE7-3's placeholder (the green demon's sheet under an oxblood wash).
describe("the blood demon (FS-VHGE7 §C, §E R41)", () => {
  const bloodDemon = (fields: Partial<MonsterState> = {}) =>
    monster({
      entity_id: "blood",
      archetype: "blood_demon",
      name: "Blood Demon",
      boss: true,
      level: 9,
      ...fields,
    });

  it("should be a boss on its own baked sheet, untinted, not the troll fallback", () => {
    expect(monsterLook("blood_demon")).toEqual({
      sheet: "creature_blood_demon_base",
      tier: "boss",
    });
    expect(monsterLook("blood_demon")).not.toBe(FALLBACK_LOOK);
    expect(baked.has("creature_blood_demon_base")).toBe(true);
  });

  it("should draw it beside a green demon, each from its own sheet, both as baked and boss size", () => {
    const { stage, sprites, texts } = fakeStage();
    const roster = new MonsterRoster(stage, baked);
    roster.sync([
      monster({
        entity_id: "green",
        archetype: "demon",
        name: "Demon",
        boss: true,
        level: 9,
      }),
      bloodDemon(),
    ]);
    roster.update(FRAME);

    const [green, blood] = sprites;
    expect(green.anims.currentAnim?.key).toMatch(/^creature_demon_base\//);
    expect(blood.anims.currentAnim?.key).toMatch(
      /^creature_blood_demon_base\//,
    );
    expect(blood.scaleX).toBe(monsterScale(monsterLook("blood_demon"), baked));
    for (const s of [green, blood]) expect(s.tint).toBeNull();
    expect(texts.map((t) => t.content)).toEqual([
      "Demon · Lv 9",
      "Blood Demon · Lv 9",
    ]);
  });

  it("should return to its baked colours after a hit's flash", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, baked);
    roster.sync([bloodDemon()]);
    roster.sync([bloodDemon({ current_health: 10 })]);
    expect(sprites[0].tint).toBe(palette.damage);
    roster.update(1000);
    expect(sprites[0].tint).toBeNull();
  });
});

// FS-VHGE7 §F (I-VHGE7-7): the blood demon's art on its own group, fetched when one first appears.
describe("the blood demon's art on demand (FS-VHGE7 §F)", () => {
  const PAGE = "blood_demon-0";
  const clawed = (atlas: string, crown: number) => {
    const sheet = creatureSheet(atlas, crown);
    return {
      ...sheet,
      animations: { ...sheet.animations, claw: clip(12, false, 5) },
    };
  };
  const fixture = (logger = quiet) => {
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
        "boss-0": atlas("boss-0.png"),
        [PAGE]: atlas("blood_demon-0.png"),
      },
      sheets: {
        char_knight_base: creatureSheet("characters-1", 80),
        creature_demon_base: clawed("boss-0", 110),
        creature_blood_demon_base: clawed(PAGE, 140),
      },
    };
    return new ArtLibrary(manifest, logger, new Set(["characters-1", "boss-0"]));
  };
  const fetcher = () => {
    const asked: string[] = [];
    let landed = () => {};
    const fetch: MonsterArtFetch["fetch"] = (group, onLanded) => {
      asked.push(group);
      landed = onLanded;
    };
    return { fetch, asked, land: () => landed() };
  };
  /** As `onDemandArt` is: a group's later ask is dropped, and its callback with it. */
  const fetcherOnce = () => {
    const asked: string[] = [];
    let landed = () => {};
    const fetch: MonsterArtFetch["fetch"] = (group, onLanded) => {
      if (asked.includes(group)) return;
      asked.push(group);
      landed = onLanded;
    };
    return { fetch, asked, land: () => landed() };
  };
  const daagon = (fields: Partial<MonsterState> = {}) =>
    monster({
      entity_id: "daagon",
      archetype: "daagon",
      name: "Daa'gon",
      boss: true,
      level: 18,
      ...fields,
    });
  const bloodDemon = (fields: Partial<MonsterState> = {}) =>
    monster({
      entity_id: "blood",
      archetype: "blood_demon",
      name: "Blood Demon",
      boss: true,
      level: 9,
      ...fields,
    });
  /** A roster with one blood demon on stand-in; `land()` brings its art in. */
  const met = (fields: Partial<MonsterState> = {}, logger = quiet) => {
    const art = fixture(logger);
    const { stage, sprites, texts } = fakeStage();
    const source = fetcher();
    const roster = new MonsterRoster(stage, art, undefined, undefined, source);
    roster.sync([bloodDemon(fields)]);
    roster.update(FRAME);
    return {
      art,
      roster,
      sprites,
      texts,
      asked: source.asked,
      land: () => {
        art.admit([PAGE]);
        source.land();
      },
    };
  };

  it("should draw the stand-in look until the group is resident, and its own after (R46)", () => {
    const art = fixture();
    expect(drawnLook("blood_demon", art)).toEqual({
      sheet: "creature_demon_base",
      tier: "boss",
      tint: palette.bloodDemonStandIn,
    });
    art.admit([PAGE]);
    expect(drawnLook("blood_demon", art)).toEqual(monsterLook("blood_demon"));
    expect(drawnLook("demon", art)).toEqual(monsterLook("demon"));
  });

  it("should keep the stand-in's tint in the oxblood family (R46)", () => {
    expect(hue(palette.bloodDemonStandIn)).toBeLessThanOrEqual(hue(palette.ember));
    expect(hue(palette.bloodDemonStandIn)).toBeLessThan(hue(palette.interactable));
    expect(hue(palette.bloodDemonStandIn)).toBeLessThan(hue(palette.safe));
  });

  it("should draw the stand-in from the first frame it is listed: no placeholder, no warning (R46)", () => {
    const warn = vi.fn();
    const { art, sprites, texts } = met({}, { warn });

    expect(sprites[0].texture).not.toBe("art:placeholder");
    expect(sprites[0].anims.currentAnim?.key).toMatch(/^creature_demon_base\/idle\//);
    expect(sprites[0].tint).toBe(palette.bloodDemonStandIn);
    expect(sprites[0].scaleX).toBe(monsterScale(drawnLook("blood_demon", art), art));
    expect(texts[0].content).toBe("Blood Demon · Lv 9");
    expect(warn).not.toHaveBeenCalled();
  });

  it("should play the green sheet's claw as the stand-in (R46)", () => {
    const { roster, sprites } = met();
    roster.sync([bloodDemon({ action: "claw" })]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toMatch(/^creature_demon_base\/claw\//);
  });

  it("should ask for the group when a snapshot lists one, and not when none is listed (R44)", () => {
    const art = fixture();
    const { stage } = fakeStage();
    const { fetch, asked } = fetcher();
    const roster = new MonsterRoster(stage, art, undefined, undefined, { fetch });
    roster.sync([monster({ archetype: "demon" })]);
    expect(asked).toEqual([]);
    roster.sync([bloodDemon()]);
    expect(asked).toEqual(["blood_demon"]);
  });

  it("should ask for the group on a monster hidden by the dark: being listed is the trigger (R44)", () => {
    const { roster, sprites, asked } = met();
    roster.hideWhere(() => true);
    expect(sprites[0].visible).toBe(false);
    const before = asked.length;
    roster.sync([bloodDemon()]);
    expect(asked.length).toBe(before + 1);
  });

  it("should stop asking once the art is in (R44)", () => {
    const { roster, asked, land } = met();
    const before = asked.length;
    land();
    roster.sync([bloodDemon()]);
    expect(asked.length).toBe(before);
  });

  it("should re-dress each drawn blood demon on its own sprite when the group lands (R48)", () => {
    const { art, roster, sprites, land } = met({ action: "move" });
    const [sprite] = sprites;
    const texturesBefore = sprite.texture;

    land();

    expect(sprites).toEqual([sprite]);
    expect(sprite.destroyed).toBe(false);
    expect(sprite.visible).toBe(true);
    expect(sprite.texture).not.toBe(texturesBefore);
    expect(sprite.texture).toBe(`art:${PAGE}`);
    expect(sprite.tint).toBeNull();
    expect(sprite.anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\/walk\//);
    const size = monsterScale(monsterLook("blood_demon"), art);
    expect(sprite.scaleX).toBe(size);
    expect(size).not.toBe(monsterScale(drawnLook("demon", art), art));

    roster.update(FRAME);
    expect(sprite.anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\/walk\//);
  });

  it("should carry a running slam across the swap, at the frame it had reached (R48)", () => {
    const { roster, sprites, land } = met({ action: "attack" });
    const [sprite] = sprites;
    expect(sprite.plays.at(-1)?.key).toMatch(/^creature_demon_base\/attack\//);
    sprite.at(3);

    land();

    expect(sprite.plays.at(-1)).toEqual({
      key: expect.stringMatching(/^creature_blood_demon_base\/attack\//),
      startFrame: 3,
    });
    roster.update(FRAME);
    expect(sprite.plays.at(-1)?.startFrame).toBe(3);
  });

  it("should read the plate height from the new sheet's crown (R48)", () => {
    const { roster, sprites, texts, land } = met();
    const [sprite] = sprites;
    land();
    roster.update(FRAME);
    const scale = sprite.scaleY;
    expect(texts[0].visible).toBe(true);
    expect(texts[0].y).toBeLessThan(sprite.y - 140 * scale + 1);
  });

  it("should not replay a corpse's fall across the swap", () => {
    const { roster, sprites, land } = met({ action: "dead" });
    const [sprite] = sprites;
    const last = 6;
    sprite.at(last);
    land();
    roster.update(FRAME);
    expect(sprite.plays.at(-1)).toEqual({
      key: expect.stringMatching(/^creature_blood_demon_base\/death\//),
      startFrame: last,
    });
  });

  it("should lay a stand-in that dies unseen on the green sheet's last frame", () => {
    const { roster, sprites } = met();
    const [sprite] = sprites;
    roster.hideWhere(() => true);
    roster.sync([bloodDemon({ action: "dead" })]);
    roster.update(FRAME);
    expect(sprite.plays.at(-1)).toEqual({
      key: expect.stringMatching(/^creature_demon_base\/death\//),
      startFrame: 6,
    });
  });

  it("should let a damage flash finish, then wear its own colours, across the swap", () => {
    const { roster, sprites, land } = met();
    const [sprite] = sprites;
    roster.sync([bloodDemon({ current_health: 1 })]);
    expect(sprite.tint).toBe(palette.damage);
    land();
    expect(sprite.tint).toBe(palette.damage);
    roster.update(1000);
    expect(sprite.tint).toBeNull();
  });

  it("should leave a green demon on the floor alone at the swap, and keep the two distinct", () => {
    const art = fixture();
    const { stage, sprites } = fakeStage();
    const { fetch, land } = fetcher();
    const roster = new MonsterRoster(stage, art, undefined, undefined, { fetch });
    roster.sync([monster({ entity_id: "green", archetype: "demon" }), bloodDemon()]);
    roster.update(FRAME);
    const [green, blood] = sprites;
    expect(green.tint).toBeNull();
    expect(blood.tint).toBe(palette.bloodDemonStandIn);

    art.admit([PAGE]);
    land();

    expect(green.anims.currentAnim?.key).toMatch(/^creature_demon_base\//);
    expect(blood.anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\//);
  });

  // FS-M8CSE §H R41-R42: Daa'gon is a second archetype on the same group.
  it("should draw Daa'gon's look as the blood demon's sheet at boss size, stood in until the group is in", () => {
    const art = fixture();
    expect(monsterLook("daagon")).toEqual({ sheet: "creature_blood_demon_base", tier: "boss" });
    expect(drawnLook("daagon", art)).toEqual(drawnLook("blood_demon", art));
    art.admit([PAGE]);
    expect(drawnLook("daagon", art)).toEqual(monsterLook("daagon"));
  });

  it.each([
    ["the Blood Demon", () => [bloodDemon(), daagon()]],
    ["Daa'gon", () => [daagon(), bloodDemon()]],
  ])("should ask once for both, and redress both when the group lands, %s listed first (R42)", (_first, listed) => {
    const art = fixture();
    const { stage, sprites } = fakeStage();
    const { fetch, asked, land } = fetcherOnce();
    const roster = new MonsterRoster(stage, art, undefined, undefined, { fetch });
    roster.sync(listed());
    roster.sync(listed());
    roster.update(FRAME);
    expect(asked).toEqual(["blood_demon"]);
    for (const sprite of sprites) expect(sprite.tint).toBe(palette.bloodDemonStandIn);

    art.admit([PAGE]);
    land();

    for (const sprite of sprites) {
      expect(sprite.anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\//);
      expect(sprite.tint).toBeNull();
    }
  });

  it("should redress a Daa'gon met while a lower floor's Blood Demon fetch is still in flight (R42)", () => {
    const art = fixture();
    const { stage, sprites } = fakeStage();
    const { fetch, asked, land } = fetcherOnce();
    const roster = new MonsterRoster(stage, art, undefined, undefined, { fetch });
    roster.sync([bloodDemon()]);
    roster.update(FRAME);

    roster.sync([]); // the climb
    roster.sync([daagon()]);
    roster.update(FRAME);
    expect(asked).toEqual(["blood_demon"]);
    expect(sprites[1].tint).toBe(palette.bloodDemonStandIn);

    art.admit([PAGE]);
    land();

    expect(sprites[1].anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\//);
    expect(sprites[1].tint).toBeNull();
  });

  it("should draw a Daa'gon first listed after a Blood Demon landed the group from its sheet, with no new ask", () => {
    const { roster, sprites, asked, land } = met();
    land();
    const before = asked.length;

    roster.sync([daagon()]);
    roster.update(FRAME);

    expect(asked.length).toBe(before);
    expect(sprites[1].anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\//);
    expect(sprites[1].tint).toBeNull();
  });

  it("should draw a blood demon first listed after the group landed from its own sheet directly (R48)", () => {
    const { roster, sprites, land, art } = met();
    land();
    roster.sync([bloodDemon(), bloodDemon({ entity_id: "second" })]);
    roster.update(FRAME);
    expect(sprites[1].anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\//);
    expect(sprites[1].tint).toBeNull();
    expect(art.has("creature_blood_demon_base")).toBe(true);
  });

  it("should keep the art through a climb: the next floor's blood demon draws its own sheet, with no new ask (R49)", () => {
    const { roster, sprites, asked, land } = met();
    land();
    const before = asked.length;

    roster.sync([]);
    roster.sync([bloodDemon({ entity_id: "next_floor" })]);
    roster.update(FRAME);

    expect(sprites).toHaveLength(2);
    expect(sprites[1].anims.currentAnim?.key).toMatch(/^creature_blood_demon_base\//);
    expect(sprites[1].tint).toBeNull();
    expect(asked.length).toBe(before);
  });
});

describe("elitePlate", () => {
  it.each([
    ["Dread", "ghoul", "Dread Ghoul"],
    ["Grave-sworn", "ghoul", "Grave-sworn Ghoul"],
    ["Hollow", "troll", "Hollow Troll"],
    ["Barrow-cursed", "troll", "Barrow-cursed Troll"],
    // FS-M8CSE §D R21: each `_` in the archetype reads as a space
    ["Dread", "barrow_thrall", "Dread Barrow Thrall"],
    ["Hollow", "spire_wraith", "Hollow Spire Wraith"],
    // §D R22: the prefix's own "Barrow" is not the name
    ["Barrow-cursed", "barrow_thrall", "Barrow-cursed Barrow Thrall"],
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
    [
      "a blood demon, a boss and never an elite",
      { name: "Blood Demon", archetype: "blood_demon", elite: false },
    ],
    [
      "an elite whose two-word name has no prefix",
      { name: "Blood Demon", archetype: "blood_demon", elite: true },
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

describe("the drawn body is a target (FS-48CTQ §C.5, owner playtest 2026-11-06)", () => {
  type Sprite = ReturnType<typeof fakeSprite>;
  const TROLL = { entity_id: "t", archetype: "troll" as const, position: { x: 400, y: 300 } };
  // straight in front of the troll on screen: 16 px lower, so drawn over it
  const GHOUL = { entity_id: "g", archetype: "ghoul" as const, position: { x: 420, y: 320 } };

  function onFloor(...monsters: MonsterState[]) {
    const { stage, sprites } = fakeStage();
    const targeting = { strike: vi.fn(), hover: vi.fn() };
    const roster = new MonsterRoster(stage, fixtureArt(), targeting);
    roster.sync(monsters);
    roster.update(FRAME);
    return { roster, sprites, targeting };
  }

  /** Whether the sprite's hit area takes screen point (sx, sy), handed over frame-local as Phaser does. */
  const hits = (s: Sprite, sx: number, sy: number) =>
    s.interactive!.hitAreaCallback(
      {},
      (sx - s.x) / s.scaleX + s.displayOriginX,
      (sy - s.y) / s.scaleY + s.displayOriginY,
      s,
    );

  /**
   * The sprite Phaser's top-only input gives (sx, sy) to: of the shown ones whose hit area takes
   * it, the one drawn last, which is the deepest (`InputPlugin.sortGameObjects` by render order).
   */
  const picked = (all: Sprite[], sx: number, sy: number) =>
    all
      .filter((s) => s.visible && hits(s, sx, sy))
      .sort((a, b) => b.depth - a.depth)[0];

  /** Drawn height in screen px: the fixture's crown (troll 96, ghoul 72) at the sprite's scale. */
  const height = (s: Sprite, crown: number) => crown * s.scaleY;

  it.each([
    ["the head", 0, -0.97],
    ["the chest", 0, -0.6],
    ["a shoulder", 0.35, -0.8],
    ["the other flank", -0.35, -0.4],
  ])("should take the pointer on %s, for the hover and the click alike", (_, across, up) => {
    const { sprites, targeting } = onFloor(monster(TROLL));
    const [troll] = sprites;
    const h = height(troll, 96);
    expect(hits(troll, troll.x + across * h, troll.y + up * h)).toBe(true);
    // the hit area is the only gate Phaser has; the events it raises are answered as ever
    troll.emit("pointerover");
    troll.emit("pointerdown");
    expect(targeting.hover).toHaveBeenLastCalledWith(expect.objectContaining({ entity_id: "t" }));
    expect(targeting.strike).toHaveBeenCalledWith(expect.objectContaining({ entity_id: "t" }));
  });

  it("should still take the feet, and the footprint's ground beyond the body's width", () => {
    const { sprites } = onFloor(monster(TROLL));
    const [troll] = sprites;
    expect(hits(troll, troll.x, troll.y)).toBe(true);
    // 26 world px east: on the troll's 28 px footprint, below and beside the drawn body
    const ground = worldToScreen(426, 300);
    expect(hits(troll, ground.x, ground.y)).toBe(true);
  });

  it.each([
    ["beside the chest", 0.55, -0.5],
    ["beside the other side", -0.55, -0.5],
    ["over the head", 0, -1.06],
    ["far up and over", 0.3, -1.4],
  ])("should miss the empty space %s", (_, across, up) => {
    const { sprites } = onFloor(monster(TROLL));
    const [troll] = sprites;
    const h = height(troll, 96);
    expect(hits(troll, troll.x + across * h, troll.y + up * h)).toBe(false);
  });

  it("should give an overlap to the monster drawn in front, and a tall one behind only what shows of it", () => {
    const { sprites } = onFloor(monster(TROLL), monster(GHOUL));
    const [troll, ghoul] = sprites;
    expect(ghoul.depth).toBeGreaterThan(troll.depth);
    expect(ghoul.x).toBeCloseTo(troll.x);

    // the ghoul's chest stands over the troll's body: both take it, the ghoul in front wins
    const chest = { x: ghoul.x, y: ghoul.y - 0.6 * height(ghoul, 72) };
    expect(hits(troll, chest.x, chest.y)).toBe(true);
    expect(picked(sprites, chest.x, chest.y)).toBe(ghoul);
    expect(picked(sprites, ghoul.x, ghoul.y)).toBe(ghoul);

    // over the ghoul's head the troll's body shows, and is the troll's
    const above = { x: ghoul.x, y: ghoul.y - height(ghoul, 72) - 8 };
    expect(picked(sprites, above.x, above.y)).toBe(troll);
  });

  it("should never let a corpse in front take the pointer from the living monster behind it", () => {
    const { sprites } = onFloor(
      monster(TROLL),
      monster({ ...GHOUL, action: "dead", current_health: 0 }),
    );
    const [troll, corpse] = sprites;
    const chest = { x: corpse.x, y: corpse.y - 0.6 * height(corpse, 72) };
    expect(hits(corpse, chest.x, chest.y)).toBe(false);
    expect(hits(corpse, corpse.x, corpse.y)).toBe(false);
    expect(picked(sprites, chest.x, chest.y)).toBe(troll);
  });

  it("should never hit a hidden monster, by its body or its feet, and pass the overlap to the one shown", () => {
    const { roster, sprites } = onFloor(monster(TROLL), monster(GHOUL));
    const [troll, ghoul] = sprites;
    // the fog over the ghoul's ground only (FS-SRA9J §D.15)
    roster.hideWhere((at) => at.x === GHOUL.position.x);
    const chest = { x: ghoul.x, y: ghoul.y - 0.6 * height(ghoul, 72) };
    expect(hits(ghoul, chest.x, chest.y)).toBe(false);
    expect(hits(ghoul, ghoul.x, ghoul.y)).toBe(false);
    expect(picked(sprites, chest.x, chest.y)).toBe(troll);

    roster.hideWhere(() => true);
    expect(hits(troll, troll.x, troll.y - 0.6 * height(troll, 96))).toBe(false);
    expect(hits(troll, troll.x, troll.y)).toBe(false);
  });
});

describe("bodyColumn", () => {
  it("should stand a standing figure's column from its feet to its crown, at its drawn size", () => {
    const ghoul = baked.sheet("creature_ghoul_base")!;
    expect(bodyColumn(ghoul, 2)).toEqual({
      halfWidth: BODY_HALF_WIDTH * ghoul.crown! * 2,
      height: ghoul.crown! * 2,
    });
  });

  it("should widen a quadruped's column to half its body length", () => {
    const boar = baked.sheet("creature_boar_base")!;
    expect(bodyColumn(boar, 1)).toEqual({ halfWidth: boar.length! / 2, height: boar.crown! });
  });

  it("should have no column for a sheet that records no crown: the footprint alone answers", () => {
    expect(bodyColumn(undefined, 1)).toBeUndefined();
    expect(bodyColumn({ length: 80 }, 1)).toBeUndefined();
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

describe("the hide rule (FS-9PN7X §C.2)", () => {
  // a room the player is not in: x 0–100, y 0–100
  const inRoom = (at: { x: number; y: number }) => at.x <= 100 && at.y <= 100;

  it("should hide a monster where the rule says, its body, plate and bar, from its eased position", () => {
    const { stage, sprites, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([
      monster({ entity_id: "in", position: { x: 50, y: 50 } }),
      monster({ entity_id: "out", position: { x: 300, y: 300 } }),
    ]);
    roster.update(FRAME);
    roster.hideWhere(inRoom);
    expect(sprites.map((s) => s.visible)).toEqual([false, true]);
    expect(texts.map((t) => t.visible)).toEqual([false, true]);
    expect(bars.map((b) => b.visible)).toEqual([false, true]);
  });

  it("should hide an elite's prefix with its plate", () => {
    const { stage, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ elite: true, name: "Brutal Troll", position: { x: 50, y: 50 } })]);
    roster.update(FRAME);
    roster.hideWhere(inRoom);
    expect(texts).toHaveLength(2);
    expect(texts.every((t) => !t.visible)).toBe(true);
  });

  it("should show a monster again the frame it walks out, plate and bar seated by the frame", () => {
    const { stage, sprites, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ position: { x: 50, y: 50 } })]);
    roster.update(FRAME);
    roster.hideWhere(inRoom);
    roster.hideWhere(() => false);
    roster.update(FRAME);
    expect(sprites[0].visible).toBe(true);
    expect(texts[0].visible).toBe(true);
    expect(bars[0].visible).toBe(true);
  });

  it("should say where each body stands, for the blackout's mask: the body only, its plate and bar being over the dark", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([
      monster({ entity_id: "in", position: { x: 50, y: 50 } }),
      monster({ entity_id: "out", position: { x: 300, y: 300 } }),
    ]);
    roster.update(FRAME);
    expect(roster.standing()).toEqual([
      { parts: [sprites[0]], at: { x: 50, y: 50 } },
      { parts: [sprites[1]], at: { x: 300, y: 300 } },
    ]);
  });

  it("should read the eased position, not the broadcast's", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ position: { x: 50, y: 50 } })]);
    // the broadcast has it out of the room; it is still drawn inside, one frame on
    roster.sync([monster({ position: { x: 120, y: 50 } })]);
    roster.update(FRAME);
    roster.hideWhere(inRoom);
    expect(sprites[0].visible).toBe(false);
  });
});

describe("the frame marker mode (FS-48CTQ §B.3: no overhead plates on a frame floor)", () => {
  const elite = monster({
    entity_id: "e",
    archetype: "ghoul",
    name: "Hollow Ghoul",
    elite: true,
  });
  const boss = monster({ entity_id: "b", archetype: "demon", name: "Demon", boss: true });

  it("should draw no name, level or bar over any monster at full health, normal, elite or boss", () => {
    const { stage, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.setMarkerMode("frame");
    roster.sync([monster({ entity_id: "n" }), elite, boss]);
    roster.update(FRAME);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((t) => !t.visible)).toBe(true);
    expect(bars.every((b) => !b.visible && b.fills.length === 0)).toBe(true);
  });

  it("should keep the elite's hostile wash, which is the sprite and not a plate", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.setMarkerMode("frame");
    roster.sync([elite]);
    roster.update(FRAME);
    expect(sprites[0].tint).toBe(palette.eliteTint);
  });

  it("should keep the plate off when the hide rule shows the body", () => {
    const { stage, sprites, texts } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.setMarkerMode("frame");
    roster.sync([monster()]);
    roster.update(FRAME);
    roster.hideWhere(() => false);
    expect(sprites[0].visible).toBe(true);
    expect(texts[0].visible).toBe(false);
  });

  it("should draw plates as today on overhead, the default, and again when the mode goes back", () => {
    const { stage, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster()]);
    roster.update(FRAME);
    expect(texts[0].visible).toBe(true);
    expect(bars[0].visible).toBe(true);

    roster.setMarkerMode("frame");
    roster.update(FRAME);
    expect(texts[0].visible).toBe(false);

    roster.setMarkerMode("overhead");
    roster.update(FRAME);
    expect(texts[0].visible).toBe(true);
    expect(bars[0].fills.length).toBeGreaterThan(0);
  });
});

describe("what the target frame may name (FS-48CTQ §C.5, §C.7)", () => {
  it("should list the living monsters whose sprites are shown, as the latest broadcast has them", () => {
    const { stage } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([
      monster({ entity_id: "live", position: { x: 300, y: 300 } }),
      monster({ entity_id: "corpse", action: "dead", current_health: 0 }),
      monster({ entity_id: "hidden", position: { x: 50, y: 50 } }),
    ]);
    roster.update(FRAME);
    roster.hideWhere((at) => at.x <= 100 && at.y <= 100);
    expect(roster.targetable().map((m) => m.entity_id)).toEqual(["live"]);

    roster.sync([monster({ entity_id: "live", current_health: 7, position: { x: 300, y: 300 } })]);
    expect(roster.targetable()[0].current_health).toBe(7);
  });

  it("should say which living monster is under the pointer, and none once it leaves or falls", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ entity_id: "m7" })]);
    expect(roster.hoveredId).toBeUndefined();
    sprites[0].emit("pointerover");
    expect(roster.hoveredId).toBe("m7");
    sprites[0].emit("pointerout");
    expect(roster.hoveredId).toBeUndefined();

    sprites[0].emit("pointerover");
    roster.sync([monster({ entity_id: "m7", action: "dead", current_health: 0 })]);
    expect(roster.hoveredId).toBeUndefined();
  });
});

// On a dungeon floor a monster leaves the broadcast when the party walks off and comes back when
// it returns (FS-KE075 §H.48): it goes with nothing replayed, and comes back as it now is
describe("a monster that leaves the broadcast and comes back (FS-KE075 §H.48)", () => {
  const live = (sprites: ReturnType<typeof fakeStage>["sprites"]) => sprites.filter((s) => !s.destroyed);
  const deaths = (sprite: ReturnType<typeof fakeStage>["sprites"][number]) =>
    sprite.plays.filter((p) => p.key.includes("/death/"));

  it("should come back alive and hurt with no damage flash and no death clip", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 120 })]);
    roster.update(FRAME);
    roster.sync([]);
    expect(roster.size).toBe(0);
    roster.sync([monster({ current_health: 40 })]);
    roster.update(FRAME);

    expect(roster.size).toBe(1);
    const [back] = live(sprites);
    expect(back).not.toBe(sprites[0]);
    expect(back.tint).toBeNull();
    expect(deaths(back)).toEqual([]);
  });

  it.each([
    ["mid-fall", 3],
    ["long dead", 30],
  ])("should lay a corpse that left %s on its last death frame, never playing the fall again", (_, frames) => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster()]);
    roster.update(FRAME);
    for (let i = 0; i < frames; i++) {
      roster.sync([monster({ action: "dead", current_health: 0 })]);
      roster.update(FRAME);
    }
    roster.sync([]);
    for (let i = 0; i < 30; i++) {
      roster.sync([monster({ action: "dead", current_health: 0 })]);
      roster.update(FRAME);
    }

    const [back] = live(sprites);
    // the fixture's death clip has 7 frames
    expect(deaths(back)).toEqual([{ key: "creature_troll_base/death/4", startFrame: 6 }]);
  });

  it("should not spawn twice when it leaves and comes back again and again", () => {
    const { stage, sprites, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    for (let i = 0; i < 5; i++) {
      roster.sync([monster()]);
      roster.update(FRAME);
      roster.sync([]);
    }
    roster.sync([monster()]);
    expect(roster.size).toBe(1);
    expect(live(sprites)).toHaveLength(1);
    expect(texts.filter((t) => !t.destroyed)).toHaveLength(1);
    expect(bars.filter((b) => !b.destroyed)).toHaveLength(1);
  });

  it("should let go of the hover and the target frame's pick when the hovered one leaves", () => {
    const { stage, sprites } = fakeStage();
    const targeting = { strike: vi.fn(), hover: vi.fn() };
    const roster = new MonsterRoster(stage, fixtureArt(), targeting);
    roster.sync([monster({ entity_id: "m7" })]);
    sprites[0].emit("pointerover");
    roster.sync([]);
    expect(targeting.hover).toHaveBeenLastCalledWith(null);
    expect(roster.hoveredId).toBeUndefined();
    expect(roster.targetable()).toEqual([]);

    // back again under a still pointer: not hovered until the pointer comes onto it anew
    roster.sync([monster({ entity_id: "m7" })]);
    expect(roster.hoveredId).toBeUndefined();
  });
});

describe("a hidden monster (FS-SRA9J §D.15, §D.17; FS-9PN7X §C.2)", () => {
  const hideAll = () => true;
  function hiddenOne(fields: Partial<MonsterState> = {}) {
    const { stage, sprites, texts, bars } = fakeStage();
    const targeting = { strike: vi.fn(), hover: vi.fn() };
    const roster = new MonsterRoster(stage, fixtureArt(), targeting);
    roster.sync([monster(fields)]);
    roster.update(FRAME);
    return { roster, sprites, texts, bars, targeting };
  }

  it("should hide an elite's body, prefix, plate and bar, the elite wash going with the body", () => {
    const { roster, sprites, texts, bars } = hiddenOne({ elite: true, name: "Brutal Troll" });
    roster.hideWhere(hideAll);
    expect(sprites[0].visible).toBe(false);
    expect(texts.map((t) => t.visible)).toEqual([false, false]);
    expect(bars[0].visible).toBe(false);
  });

  it("should let go of the hover, the strike-mark with it, when the monster under the still pointer is hidden", () => {
    const { roster, sprites, targeting } = hiddenOne({ entity_id: "m7" });
    sprites[0].emit("pointerover");
    targeting.hover.mockClear();
    roster.hideWhere(hideAll);
    expect(targeting.hover).toHaveBeenCalledTimes(1);
    expect(targeting.hover).toHaveBeenCalledWith(null);
    expect(roster.hoveredId).toBeUndefined();
    // hidden again next frame: nothing more to let go of
    roster.hideWhere(hideAll);
    expect(targeting.hover).toHaveBeenCalledTimes(1);
  });

  it("should keep the hover on a monster the rule leaves shown", () => {
    const { roster, sprites, targeting } = hiddenOne({ entity_id: "m7" });
    sprites[0].emit("pointerover");
    roster.hideWhere(() => false);
    expect(roster.hoveredId).toBe("m7");
    expect(targeting.hover).toHaveBeenCalledTimes(1);
  });

  it("should neither strike nor report a hover for a hidden monster", () => {
    const { roster, sprites, targeting } = hiddenOne();
    roster.hideWhere(hideAll);
    sprites[0].emit("pointerover");
    sprites[0].emit("pointerdown");
    expect(targeting.strike).not.toHaveBeenCalled();
    expect(targeting.hover).not.toHaveBeenCalled();
    expect(roster.hoveredId).toBeUndefined();
    expect(roster.targetable()).toEqual([]);
  });

  it("should not flash a hit taken while hidden, so it does not flash when it reappears", () => {
    const { roster, sprites } = hiddenOne({ current_health: 120 });
    roster.hideWhere(hideAll);
    roster.sync([monster({ current_health: 90 })]);
    roster.update(FRAME);
    roster.hideWhere(() => false);
    expect(sprites[0].tint).toBeNull();
  });

  it("should end a flash the moment its monster is hidden", () => {
    const { roster, sprites } = hiddenOne({ current_health: 120 });
    roster.sync([monster({ current_health: 90 })]);
    expect(sprites[0].tint).toBe(palette.damage);
    roster.hideWhere(hideAll);
    roster.hideWhere(() => false);
    expect(sprites[0].tint).toBeNull();
  });

  it("should lay a monster that dies while hidden where it fell, so it reappears a corpse, never mid-fall", () => {
    const { roster, sprites } = hiddenOne({ action: "attack" });
    roster.hideWhere(hideAll);
    roster.sync([monster({ action: "dead", current_health: 0 })]);
    roster.update(FRAME);
    roster.hideWhere(() => false);
    for (let i = 0; i < 5; i++) roster.update(FRAME);
    // the fixture's death clip has 7 frames: only its last is ever played
    const deaths = sprites[0].plays.filter((p) => p.key.includes("/death/"));
    expect(deaths).toEqual([{ key: "creature_troll_base/death/4", startFrame: 6 }]);
  });

  it("should still play the fall of a monster that dies in sight", () => {
    const { roster, sprites } = hiddenOne({ action: "attack" });
    roster.hideWhere(() => false);
    roster.sync([monster({ action: "dead", current_health: 0 })]);
    roster.update(FRAME);
    const deaths = sprites[0].plays.filter((p) => p.key.includes("/death/"));
    expect(deaths).toEqual([{ key: "creature_troll_base/death/4", startFrame: 0 }]);
  });
});

describe("the overhead bar on a frame floor (FS-48CTQ §F.18–20, owner playtest 2026-11-07)", () => {
  const damaged = (fields: Partial<MonsterState> = {}) =>
    monster({ current_health: 60, max_health: 120, ...fields });
  const elite = (fields: Partial<MonsterState> = {}) =>
    damaged({ entity_id: "e", archetype: "ghoul", name: "Hollow Ghoul", elite: true, ...fields });

  function onFrame() {
    const parts = fakeStage();
    const roster = new MonsterRoster(parts.stage, fixtureArt());
    roster.setMarkerMode("frame");
    return { ...parts, roster };
  }

  it("should show the bar alone over a damaged monster: no name, no level", () => {
    const { roster, texts, bars } = onFrame();
    roster.sync([damaged()]);
    roster.update(FRAME);
    expect(bars[0].visible).toBe(true);
    expect(bars[0].fills.find((f) => f.color === MARKER_BAR.hp)!.w).toBe(OVERHEAD_BAR.width / 2);
    expect(texts.every((t) => !t.visible)).toBe(true);
  });

  it("should show it the frame a full-health monster first takes damage", () => {
    const { roster, bars } = onFrame();
    roster.sync([monster()]);
    roster.update(FRAME);
    expect(bars[0].visible).toBe(false);
    roster.sync([damaged()]);
    roster.update(FRAME);
    expect(bars[0].visible).toBe(true);
  });

  it("should hide it when the monster heals back to full", () => {
    const { roster, bars } = onFrame();
    roster.sync([damaged()]);
    roster.update(FRAME);
    roster.sync([monster()]);
    roster.update(FRAME);
    expect(bars[0].visible).toBe(false);
  });

  it("should hide it on death", () => {
    const { roster, bars } = onFrame();
    roster.sync([damaged()]);
    roster.update(FRAME);
    roster.sync([damaged({ action: "dead", current_health: 0 })]);
    roster.update(FRAME);
    expect(bars[0].visible).toBe(false);
  });

  it("should never show it over a monster the hide rule or the fog hides", () => {
    const { roster, bars } = onFrame();
    roster.sync([damaged()]);
    roster.update(FRAME);
    roster.hideWhere(() => true);
    expect(bars[0].visible).toBe(false);
    roster.update(FRAME);
    roster.hideWhere(() => true);
    expect(bars[0].visible).toBe(false);
  });

  it("should give an elite the bar alone, its prefix hidden and its hostile wash kept", () => {
    const { roster, sprites, texts, bars } = onFrame();
    roster.sync([elite()]);
    roster.update(FRAME);
    expect(bars[0].visible).toBe(true);
    expect(texts).toHaveLength(2);
    expect(texts.every((t) => !t.visible)).toBe(true);
    expect(sprites[0].tint).toBe(palette.eliteTint);
  });

  it("should give a damaged boss its bar too", () => {
    const { roster, bars } = onFrame();
    roster.sync([damaged({ entity_id: "b", archetype: "demon", name: "Demon", boss: true })]);
    roster.update(FRAME);
    expect(bars[0].visible).toBe(true);
  });

  it("should seat the bar where an overhead floor seats it, over the head", () => {
    const frame = onFrame();
    frame.roster.sync([damaged()]);
    frame.roster.update(FRAME);
    const overhead = fakeStage();
    const plated = new MonsterRoster(overhead.stage, fixtureArt());
    plated.sync([damaged()]);
    plated.update(FRAME);
    expect([frame.bars[0].x, frame.bars[0].y]).toEqual([overhead.bars[0].x, overhead.bars[0].y]);
    expect(frame.bars[0].y).toBeLessThan(frame.sprites[0].y);
  });
});

describe("floors 2–3 and fields keep their plates (FS-48CTQ §A.2, §F.20)", () => {
  it("should plate and bar every living monster at full health, as before", () => {
    const { stage, texts, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster(), monster({ entity_id: "m2", current_health: 30 })]);
    roster.update(FRAME);
    expect(texts.map((t) => t.visible)).toEqual([true, true]);
    expect(bars.map((b) => b.visible)).toEqual([true, true]);
  });

  it("should draw their bars in the same look as the frame floor's", () => {
    const overhead = fakeStage();
    const plated = new MonsterRoster(overhead.stage, fixtureArt());
    plated.sync([monster({ current_health: 60 })]);
    plated.update(FRAME);
    const frame = fakeStage();
    const barOnly = new MonsterRoster(frame.stage, fixtureArt());
    barOnly.setMarkerMode("frame");
    barOnly.sync([monster({ current_health: 60 })]);
    barOnly.update(FRAME);
    expect(overhead.bars[0].fills).toEqual(frame.bars[0].fills);
  });
});

describe("the overhead bar redraws only on a change (FS-48CTQ §F.23)", () => {
  it("should draw an idle bar once, however many frames pass", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 60 })]);
    for (let i = 0; i < 30; i++) roster.update(FRAME);
    expect(bars[0].draws).toBe(1);
  });

  it("should move a walking monster's bar without drawing it again", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 60 })]);
    roster.update(FRAME);
    const at = bars[0].x;
    roster.sync([monster({ current_health: 60, action: "move", position: { x: 500, y: 300 } })]);
    for (let i = 0; i < 10; i++) roster.update(FRAME);
    expect(bars[0].x).not.toBe(at);
    expect(bars[0].draws).toBe(1);
  });

  it("should draw it again when its health moves a backing px, and not for less", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 60, max_health: 1200 })]);
    roster.update(FRAME);
    // 1/1200 of a 40 px bar is no backing px: a heal that small draws nothing
    roster.sync([monster({ current_health: 61, max_health: 1200 })]);
    roster.update(FRAME);
    expect(bars[0].draws).toBe(1);
    roster.sync([monster({ current_health: 600, max_health: 1200 })]);
    roster.update(FRAME);
    expect(bars[0].draws).toBe(2);
  });

  it("should draw it again when the render scale changes", () => {
    const { stage, bars, backing } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 60 })]);
    roster.update(FRAME);
    backing.scale = 2;
    roster.update(FRAME);
    roster.update(FRAME);
    expect(bars[0].draws).toBe(2);
  });

  it("should not draw a hidden bar's frames at all on a frame floor at full health", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.setMarkerMode("frame");
    roster.sync([monster(), monster({ entity_id: "m2" })]);
    for (let i = 0; i < 10; i++) roster.update(FRAME);
    expect(bars.map((b) => b.draws)).toEqual([0, 0]);
  });

  it.each([1, 1.5, 2])("should seat the bar on a whole backing px at render scale %s", (scale) => {
    const { stage, bars } = fakeStage({ scale });
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 60, position: { x: 401.37, y: 299.21 } })]);
    roster.update(FRAME);
    for (const v of [bars[0].x, bars[0].y])
      expect(Math.abs(v * scale - Math.round(v * scale))).toBeLessThan(1e-9);
  });
});

describe("the overhead bar's damage chip (FS-48CTQ §F.22)", () => {
  const chipOf = (bar: ReturnType<typeof fakeBar>) => bar.fills.find((f) => f.color === MARKER_BAR.chip);

  it("should show the health a hit took as a chip, drain it, and stop drawing once it is gone", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster({ current_health: 120 })]);
    roster.update(FRAME);
    roster.sync([monster({ current_health: 60 })]);
    roster.update(FRAME);
    expect(chipOf(bars[0])).toMatchObject({ x: OVERHEAD_BAR.width / 2, w: OVERHEAD_BAR.width / 2 });

    const frames = Math.ceil((CHIP_HOLD_MS + CHIP_DRAIN_MS) / FRAME) + 2;
    for (let i = 0; i < frames; i++) roster.update(FRAME);
    expect(chipOf(bars[0])).toBeUndefined();
    const settled = bars[0].draws;
    for (let i = 0; i < 30; i++) roster.update(FRAME);
    expect(bars[0].draws).toBe(settled);
  });

  it("should chip the first hit on a frame floor, the bar appearing with it", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.setMarkerMode("frame");
    roster.sync([monster()]);
    roster.update(FRAME);
    roster.sync([monster({ current_health: 90 })]);
    roster.update(FRAME);
    expect(chipOf(bars[0])).toMatchObject({ w: OVERHEAD_BAR.width / 4 });
  });

  it("should give no chip to a hit taken unseen", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([monster()]);
    roster.update(FRAME);
    roster.hideWhere(() => true);
    roster.sync([monster({ current_health: 60 })]);
    roster.update(FRAME);
    expect(chipOf(bars[0])).toBeUndefined();
  });

  it(`should drain at most ${CHIP_BUDGET} chips at once; a hit past that snaps`, () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    const herd = (hp: number) =>
      Array.from({ length: CHIP_BUDGET + 3 }, (_, i) =>
        monster({ entity_id: `m${i}`, current_health: hp, position: { x: 300 + i * 40, y: 300 } }),
      );
    roster.sync(herd(120));
    roster.update(FRAME);
    roster.sync(herd(60));
    roster.update(FRAME);
    expect(bars.filter((b) => chipOf(b) !== undefined)).toHaveLength(CHIP_BUDGET);
  });

  it("should let a new chip start once an earlier one has drained", () => {
    const { stage, bars } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    const herd = (hp: number, last = hp) =>
      Array.from({ length: CHIP_BUDGET + 1 }, (_, i) =>
        monster({ entity_id: `m${i}`, current_health: i === CHIP_BUDGET ? last : hp }),
      );
    roster.sync(herd(120));
    roster.sync(herd(60, 120));
    roster.update(FRAME);
    for (let i = 0; i < Math.ceil((CHIP_HOLD_MS + CHIP_DRAIN_MS) / FRAME) + 2; i++) roster.update(FRAME);
    roster.sync(herd(60, 60));
    roster.update(FRAME);
    expect(chipOf(bars[CHIP_BUDGET])).toBeDefined();
  });
});

// FS-VHGE7 §D R31–33 (I-VHGE7-4): a demon's fire claw. The clip plays `claw` where the sheet has
// one and `attack` until it is baked (I-VHGE7-6); the flame plays once per turn into `claw`, only
// for a shown demon, and never on first sight (a reconnect, a demon coming back into interest).
describe("the fire claw (FS-VHGE7 §D)", () => {
  const demon = (fields: Partial<MonsterState> = {}) =>
    monster({
      entity_id: "boss",
      archetype: "demon",
      name: "Demon",
      boss: true,
      level: 7,
      ...fields,
    });

  /** A roster whose claw effects are recorded: the monster and the drawn point each played at. */
  function clawStage(art = fixtureArt()) {
    const { stage, sprites } = fakeStage();
    const played: { id: string; at: { x: number; y: number } }[] = [];
    const effects: MonsterEffects = {
      claw: (m, at) => played.push({ id: m.entity_id, at: { ...at } }),
    };
    const roster = new MonsterRoster(stage, art, undefined, effects);
    return { roster, sprites, played };
  }

  it("should map the claw action to the claw clip, and to the attack clip on a sheet without one", () => {
    const facing = { x: -1, y: 0 };
    expect(monsterClip({ action: "claw", facing }, "se").animation).toBe("claw");
    expect(
      monsterClip({ action: "claw", facing }, "se", 0, 1, (c) => c !== "claw")
        .animation,
    ).toBe("attack");
    // the fallback is the claw's alone: no other clip is swapped for a missing one
    expect(
      monsterClip({ action: "attack", facing }, "se", 0, 1, () => false)
        .animation,
    ).toBe("attack");
  });

  it("should play the attack clip for a claw on a demon sheet baked without a claw clip", () => {
    const { roster, sprites } = clawStage();
    roster.sync([demon({ action: "claw" })]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toBe(
      "creature_demon_base/attack/4",
    );
  });

  it("should play the claw clip, from its first frame, once the sheet carries one", () => {
    const { roster, sprites } = clawStage(fixtureArt({ clawed: true }));
    roster.sync([demon()]);
    roster.update(FRAME);
    roster.sync([demon({ action: "claw" })]);
    roster.update(FRAME);
    expect(sprites[0].plays.at(-1)).toEqual({
      key: "creature_demon_base/claw/4",
      startFrame: 0,
    });
  });

  it.each([
    ["demon", "Demon", "creature_demon_base"],
    ["blood_demon", "Blood Demon", "creature_blood_demon_base"],
  ] as const)(
    "should play the %s's own baked claw clip, not the attack (FS-VHGE7 §E R38)",
    (archetype, name, sheet) => {
      const { roster, sprites } = clawStage(baked);
      roster.sync([demon({ archetype, name })]);
      roster.update(FRAME);
      roster.sync([demon({ archetype, name, action: "claw" })]);
      roster.update(FRAME);
      expect(sprites[0].plays.at(-1)?.key).toMatch(
        new RegExp(`^${sheet}/claw/\\d$`),
      );
    },
  );

  it("should play the flame once on the turn into claw, not on every claw snapshot", () => {
    const { roster, played } = clawStage();
    roster.sync([demon()]);
    roster.update(FRAME);
    roster.sync([demon({ action: "claw" })]);
    roster.sync([demon({ action: "claw" })]);
    roster.update(FRAME);
    roster.sync([demon({ action: "claw" })]);
    expect(played).toEqual([{ id: "boss", at: { x: 400, y: 300 } }]);
  });

  it("should play it again for the next claw, after the demon has stood between swings", () => {
    const { roster, played } = clawStage();
    for (const action of ["move", "claw", "idle", "claw"] as const) {
      roster.sync([demon({ action })]);
      roster.update(FRAME);
    }
    expect(played).toHaveLength(2);
  });

  it("should play it at the demon's drawn position, eased toward the server's", () => {
    const { roster, played } = clawStage();
    roster.sync([demon({ position: { x: 400, y: 300 } })]);
    roster.update(FRAME);
    roster.sync([demon({ action: "claw", position: { x: 500, y: 300 } })]);
    expect(played[0].at).toEqual({ x: 400, y: 300 });
  });

  it("should play nothing for a demon the dark or the fog hides", () => {
    const { roster, played } = clawStage();
    roster.sync([demon()]);
    roster.update(FRAME);
    roster.hideWhere(() => true);
    roster.sync([demon({ action: "claw" })]);
    expect(played).toEqual([]);
  });

  it("should play nothing for a demon first seen mid-claw: a reconnect replays no stale flame", () => {
    const { roster, sprites, played } = clawStage(fixtureArt({ clawed: true }));
    roster.sync([demon({ action: "claw" })]);
    roster.update(FRAME);
    // the clip is shown from its start all the same
    expect(sprites[0].plays.at(-1)).toEqual({
      key: "creature_demon_base/claw/4",
      startFrame: 0,
    });
    // a reconnect: the roster is torn down and rebuilt from the next snapshot, still mid-claw
    roster.clear();
    roster.sync([demon({ action: "claw" })]);
    roster.update(FRAME);
    expect(played).toEqual([]);
  });

  it("should play nothing for a demon that falls, nor for a slam", () => {
    const { roster, played } = clawStage();
    for (const action of ["idle", "attack", "idle", "dead"] as const)
      roster.sync([demon({ action })]);
    expect(played).toEqual([]);
  });

  it("should draw without any effects handed in", () => {
    const { stage, sprites } = fakeStage();
    const roster = new MonsterRoster(stage, fixtureArt());
    roster.sync([demon()]);
    roster.sync([demon({ action: "claw" })]);
    roster.update(FRAME);
    expect(sprites[0].anims.currentAnim?.key).toBe(
      "creature_demon_base/attack/4",
    );
  });
});
