import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { AbilityBarView } from "./abilityBarView";
import { abilityBarFrame } from "./abilityBarLayout";
import { sweepPolygon } from "./abilityCooldown";
import { ABILITY_ICONS } from "./abilityIcons";
import { BRONZE, GREYED, GREYED_ALPHA, type KnockoutDeps } from "./knockout";
import type { Rect } from "./hudCornerLayout";
import { GLYPH_LINE_W } from "./MailboxEnvelope";

// FS-Q18Q3 §B, §C, §E, §L R41, R44: the bar as the UI scene draws it from the plain view the world hands,
// on a recording stand-in for the scene, with no world and no bridge (the slot's wiring is uiSceneHud's)

/** Every knockout the bar made, what it was made with and how it was last shown; `drawable` false, none stands. */
const knockouts: { deps: KnockoutDeps; shows: { f: Rect; hovered: boolean }[]; destroyed: boolean }[] = [];
let drawable = true;
vi.mock("./knockout", async (importOriginal) => {
  const real = await importOriginal<typeof import("./knockout")>();
  class FakeKnockout {
    private readonly rec: (typeof knockouts)[number];
    constructor(deps: KnockoutDeps) {
      this.rec = { deps, shows: [], destroyed: false };
      knockouts.push(this.rec);
    }
    show(f: Rect, hovered: boolean): boolean {
      this.rec.shows.push({ f, hovered });
      return drawable;
    }
    destroy(): void {
      this.rec.destroyed = true;
    }
  }
  return { ...real, Knockout: FakeKnockout };
});

const { AbilityBar } = await import("./AbilityBar");

interface Op {
  m: string;
  args: unknown[];
}
interface Made {
  kind: "graphics" | "text" | "zone";
  ops: Op[];
  words?: string;
  style?: Record<string, unknown>;
  x?: number;
  y?: number;
  origin?: [number, number];
  color?: string;
  depth?: number;
  scrollFactor?: number;
  interactive?: boolean;
  rect?: Rect;
  handlers: Record<string, () => void>;
  destroyed: boolean;
}

/** A text's size: 7 px a character, wrapped at its style's width into rows of its font size plus 4. */
function measure(m: Made): { width: number; height: number } {
  const chars = (m.words ?? "").length * 7;
  const wrap = (m.style?.wordWrap as { width: number } | undefined)?.width ?? Infinity;
  const rows = Math.max(1, Math.ceil(chars / wrap));
  return { width: Math.min(chars, wrap), height: rows * (parseInt(String(m.style?.fontSize ?? "12"), 10) + 4) };
}

function fakeScene() {
  const made: Made[] = [];
  /** How the scene's input polls the pointer: "always" while a tooltip is up, so a piece opening over a still pointer takes it. */
  const polls: string[] = [];
  /** The UI scene's clock and its per-frame listeners: `tick` moves the clock and runs one frame. */
  const time = { now: 0 };
  const updates: ((now: number, delta: number) => void)[] = [];
  const tick = (ms: number) => {
    time.now += ms;
    for (const fn of [...updates]) fn(time.now, ms);
  };
  const object = (m: Made) => {
    made.push(m);
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return undefined;
          // a text's measure, as a 7 px-wide face wrapping at its style's width would give it
          if (m.kind === "text" && (prop === "width" || prop === "height")) return measure(m)[prop];
          if (prop === "setDepth") return (d: number) => ((m.depth = d), self);
          if (prop === "setScrollFactor") return (s: number) => ((m.scrollFactor = s), self);
          if (prop === "setInteractive") return () => ((m.interactive = true), self);
          if (prop === "on") return (event: string, fn: () => void) => ((m.handlers[event] = fn), self);
          if (prop === "setText") return (w: string) => ((m.words = w), self);
          if (prop === "setColor") return (c: string) => ((m.color = c), self);
          if (prop === "setOrigin") return (ox: number, oy: number = ox) => ((m.origin = [ox, oy]), self);
          if (prop === "setPosition")
            return (x: number, y: number) => {
              m.x = x;
              m.y = y;
              if (m.rect) m.rect = { ...m.rect, x, y };
              return self;
            };
          if (prop === "clear") return () => ((m.ops = []), self);
          if (prop === "destroy") return () => void (m.destroyed = true);
          return (...args: unknown[]) => (m.ops.push({ m: String(prop), args }), self);
        },
      },
    );
    return self;
  };
  const scene = {
    add: {
      graphics: () => object({ kind: "graphics", ops: [], handlers: {}, destroyed: false }),
      text: (x: number, y: number, words: string, style: Record<string, unknown>) =>
        object({ kind: "text", ops: [], x, y, words, style, handlers: {}, destroyed: false }),
      zone: (x: number, y: number, width: number, height: number) =>
        object({ kind: "zone", ops: [], rect: { x, y, width, height }, handlers: {}, destroyed: false }),
    },
    input: {
      setPollAlways: () => void polls.push("always"),
      setPollOnMove: () => void polls.push("onMove"),
    },
    time,
    events: {
      on: (event: string, fn: (now: number, delta: number) => void) => void (event === "update" && updates.push(fn)),
      off: (event: string, fn: (now: number, delta: number) => void) =>
        void (event === "update" && updates.includes(fn) && updates.splice(updates.indexOf(fn), 1)),
    },
  } as unknown as Phaser.Scene;
  const live = () => made.filter((m) => !m.destroyed);
  const ops = () => live().filter((m) => m.kind === "graphics").flatMap((g) => g.ops);
  const texts = () => live().filter((m) => m.kind === "text");
  const zones = () => live().filter((m) => m.kind === "zone");
  /** The tooltip's objects: everything standing in the item-tip band. */
  const tip = () => live().filter((m) => m.depth === 2200);
  const tipTexts = () => tip().filter((m) => m.kind === "text");
  const tipOps = () => tip().filter((m) => m.kind === "graphics").flatMap((g) => g.ops);
  return { scene, made, live, ops, texts, zones, polls, tip, tipTexts, tipOps, time, updates, tick };
}

const VIEW: AbilityBarView = {
  potion: { count: 2, greyed: false, field: false },
  ability: { icon: "dash", greyed: false, active: false, cost: 25 },
  tree: { locked: true, ability: "earthbreaker", greyed: true, cost: null },
  costChannel: "stamina",
  cooldowns: { ability: null, tree: null },
};
/** The squares' grounds, left to right. */
const SQUARE = { potion: 0, ability: 1, tree: 2 } as const;
const view = (fields: Partial<AbilityBarView> = {}): AbilityBarView => ({ ...VIEW, ...fields });

const frame = () => abilityBarFrame(viewport);
/** The text standing at (x, y), as the bar set it there. */
const textAt = (texts: Made[], x: number, y: number) => texts.find((t) => t.x === x && t.y === y);
const plaqueCentre = (r: Rect) => [r.x + r.width / 2, r.y + r.height / 2] as const;
const costCentre = (r: Rect) => [r.x + r.width / 2, r.y + r.height / 2] as const;
/** The knockout standing for `icon`, the last made. */
const knockoutOf = (icon: keyof typeof ABILITY_ICONS) =>
  knockouts.filter((k) => !k.destroyed && k.deps.picture === ABILITY_ICONS[icon].picture).at(-1);

beforeEach(() => {
  knockouts.length = 0;
  drawable = true;
  viewport.set({ width: 1080, height: 720, renderScale: 1 });
});
afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

describe("AbilityBar: the squares (FS-Q18Q3 §C R13, R14)", () => {
  it("should draw three HUD-panel wells in a 1 px brass rim at the layout's rects, fixed to the screen at depth 1000", () => {
    const { scene, ops, live } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    const { squares } = frame();
    for (const s of ["potion", "ability", "tree"] as const) {
      const { x, y, width, height } = squares[s].well;
      expect(ops()).toContainEqual({ m: "fillRect", args: [x, y, width, height] });
      expect(ops()).toContainEqual({ m: "strokeRect", args: [x, y, width, height] });
    }
    expect(ops()).toContainEqual({ m: "fillStyle", args: [palette.hudPanel, 0.85] });
    expect(ops()).toContainEqual({ m: "lineStyle", args: [1, palette.frame, 0.6] });
    for (const m of live()) {
      expect(m.depth).toBe(1000);
      expect(m.scrollFactor).toBe(0);
    }
  });

  it("should set each plaque into its square's top edge: '1', the right-mouse glyph, '3', in the 12 px body serif", () => {
    const { scene, ops, texts } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    const { squares } = frame();
    const keyAt = (s: "potion" | "ability" | "tree") => textAt(texts(), ...plaqueCentre(squares[s].plaque));
    expect(keyAt("potion")).toMatchObject({ words: "1", color: toCss(palette.hudText), origin: [0.5, 0.5] });
    expect(keyAt("ability")?.words).toBe("");
    expect(keyAt("tree")?.words).toBe("3");
    expect(keyAt("potion")?.style).toMatchObject({ fontFamily: CANVAS_FONT.body, fontSize: "12px" });
    // the mouse, its right button filled, inside the right-click square's plaque
    const plaque = squares.ability.plaque;
    const mouse = ops().filter((o) => o.m === "strokeRoundedRect");
    expect(mouse).toHaveLength(1);
    const [mx, my, mw, mh] = mouse[0].args as number[];
    expect(mx).toBeGreaterThanOrEqual(plaque.x);
    expect(my).toBeGreaterThanOrEqual(plaque.y);
    expect(mx + mw).toBeLessThanOrEqual(plaque.x + plaque.width);
    expect(my + mh).toBeLessThanOrEqual(plaque.y + plaque.height);
    expect(ops().some((o) => o.m === "fillRoundedRect")).toBe(true);
  });

  it("should take its plaque keys from the run's action mapping, never typing them (R14, R31)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "AbilityBar.ts"), "utf8");
    expect(source).toMatch(/RUN_ACTIONS\.drinkPotion\.label/);
    expect(source).toMatch(/RUN_ACTIONS\.treeAbility\.label/);
    expect(source).not.toMatch(/key: "[13]"/);
  });
});

describe("AbilityBar: the right-click square (FS-Q18Q3 §C R15–R17, §E R22, R23, R27)", () => {
  it("should draw the ability's icon as a bronze knockout in its slot, lit", () => {
    const { scene } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    const dash = knockoutOf("dash")!;
    expect(dash.deps).toMatchObject({ ink: BRONZE, depth: 1000 });
    expect(dash.shows.at(-1)).toEqual({ f: frame().squares.ability.icon, hovered: false });
  });

  it("should set the cost under it, a bare stroked 12 px numeral in its resource bar's colour", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    const cost = textAt(texts(), ...costCentre(frame().squares.ability.cost));
    expect(cost).toMatchObject({ words: "25", color: toCss(palette.hudStamina) });
    expect(cost?.style).toMatchObject({ fontSize: "12px", stroke: toCss(palette.markerStroke), strokeThickness: 2 });
  });

  it.each([
    ["mana", palette.hudMana],
    ["parry", palette.hudParry],
    ["unknown", palette.hudText],
  ] as const)("should ink a %s cost in its channel's colour", (channel, ink) => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(view({ costChannel: channel }));
    expect(textAt(texts(), ...costCentre(frame().squares.ability.cost))?.color).toBe(toCss(ink));
  });

  it("should draw no cost for none (a cost of 0, or no resource on the wire)", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(view({ ability: { ...VIEW.ability, cost: null }, costChannel: null }));
    expect(textAt(texts(), ...costCentre(frame().squares.ability.cost))?.words).toBe("");
  });

  it("should grey it: the unavailable ink, the key and the cost faint", () => {
    const { scene, texts, ops } = fakeScene();
    new AbilityBar(scene).show(view({ ability: { ...VIEW.ability, greyed: true } }));
    expect(knockoutOf("dash")!.deps.ink).toBe(GREYED);
    expect(textAt(texts(), ...costCentre(frame().squares.ability.cost))?.color).toBe(toCss(palette.hudFaint));
    // the mouse in the faint vellum
    expect(ops()).toContainEqual({ m: "fillStyle", args: [palette.hudFaint, 1] });
  });

  it("should make the knockout anew in the other ink as it greys and lights, the old one taken down", () => {
    const { scene } = fakeScene();
    const bar = new AbilityBar(scene);
    bar.show(VIEW);
    const lit = knockoutOf("dash")!;
    bar.show(view({ ability: { ...VIEW.ability, greyed: true } }));
    expect(lit.destroyed).toBe(true);
    expect(knockoutOf("dash")!.deps.ink).toBe(GREYED);
  });

  it("should light the rim 2 px bright brass and show the icon in the hover ink while active (R17, R23)", () => {
    const { scene, ops } = fakeScene();
    new AbilityBar(scene).show(view({ ability: { ...VIEW.ability, active: true } }));
    expect(ops()).toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
    expect(knockoutOf("dash")!.shows.at(-1)?.hovered).toBe(true);
  });

  it("should draw active and greyed together: the rim lit, the icon grey", () => {
    const { scene, ops } = fakeScene();
    new AbilityBar(scene).show(view({ ability: { ...VIEW.ability, active: true, greyed: true } }));
    expect(ops()).toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
    expect(knockoutOf("dash")!.deps.ink).toBe(GREYED);
  });

  it("should draw an empty well with its plaque for a class with no row, and nothing fails (R27)", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(view({ ability: { icon: null, greyed: false, active: false, cost: null } }));
    expect(knockouts.map((k) => k.deps.picture)).toEqual([ABILITY_ICONS.potion.picture, ABILITY_ICONS.locked.picture]);
    expect(textAt(texts(), ...plaqueCentre(frame().squares.ability.plaque))).toBeDefined();
  });

  it("should draw the icon's line glyph where the knockout cannot be made, faint when greyed (ADR-0080)", () => {
    drawable = false;
    const { scene, ops } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    expect(ops()).toContainEqual({ m: "lineStyle", args: [GLYPH_LINE_W, palette.interactable, 0.85] });
    expect(ops()).toContainEqual({ m: "lineStyle", args: [GLYPH_LINE_W, palette.hudFaint, GREYED_ALPHA] });
  });
});

describe("AbilityBar: the potion square (FS-Q18Q3 §E R24)", () => {
  it("should draw the flask and the count in its bottom-right corner, stroked, with no cost", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    const { corner, cost } = frame().squares.potion;
    expect(knockoutOf("potion")!.deps.ink).toBe(BRONZE);
    expect(textAt(texts(), corner.x, corner.y)).toMatchObject({ words: "2", origin: [1, 1], color: toCss(palette.hudText) });
    expect(textAt(texts(), corner.x, corner.y)?.style).toMatchObject({ strokeThickness: 2 });
    expect(textAt(texts(), ...costCentre(cost))?.words).toBe("");
  });

  it("should stay at 0: the flask faint, a faint '0'", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(view({ potion: { count: 0, greyed: true, field: false } }));
    const { corner, plaque } = frame().squares.potion;
    expect(knockoutOf("potion")!.deps.ink).toBe(GREYED);
    expect(textAt(texts(), corner.x, corner.y)).toMatchObject({ words: "0", color: toCss(palette.hudFaint) });
    expect(textAt(texts(), ...plaqueCentre(plaque))?.color).toBe(toCss(palette.hudFaint));
  });
});

describe("AbilityBar: the 3 square, locked (FS-Q18Q3 §E R25)", () => {
  it("should draw the padlock in the unavailable ink, the key faint and a faint 'Lv 10' in its cost slot", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    const { plaque, cost } = frame().squares.tree;
    expect(knockoutOf("locked")!.deps.ink).toBe(GREYED);
    expect(textAt(texts(), ...plaqueCentre(plaque))).toMatchObject({ words: "3", color: toCss(palette.hudFaint) });
    expect(textAt(texts(), ...costCentre(cost))).toMatchObject({ words: "Lv 10", color: toCss(palette.hudFaint) });
    expect(knockoutOf("earthbreaker")).toBeUndefined();
  });
});

describe("AbilityBar: the 3 square, held (FS-Q18Q3 §E R26, §C R15–R17)", () => {
  const HELD: AbilityBarView["tree"] = { locked: false, ability: "earthbreaker", greyed: false, cost: 40 };
  const held = (fields: Partial<AbilityBarView["tree"]> = {}, rest: Partial<AbilityBarView> = {}) =>
    view({ tree: { ...HELD, ...fields }, ...rest });

  it("should draw the class's tree ability as a bronze knockout in its slot, no padlock, the key lit", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(held());
    const { icon, plaque } = frame().squares.tree;
    expect(knockoutOf("earthbreaker")!.deps).toMatchObject({ ink: BRONZE, depth: 1000 });
    expect(knockoutOf("earthbreaker")!.shows.at(-1)).toEqual({ f: icon, hovered: false });
    expect(knockoutOf("locked")).toBeUndefined();
    expect(textAt(texts(), ...plaqueCentre(plaque))).toMatchObject({ words: "3", color: toCss(palette.hudText) });
  });

  it.each([
    ["stamina", palette.hudStamina],
    ["mana", palette.hudMana],
    ["parry", palette.hudParry],
    ["unknown", palette.hudText],
  ] as const)("should set its cost under it, a bare stroked numeral in the %s channel's colour", (channel, ink) => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(held({}, { costChannel: channel }));
    const cost = textAt(texts(), ...costCentre(frame().squares.tree.cost));
    expect(cost).toMatchObject({ words: "40", color: toCss(ink) });
    expect(cost?.style).toMatchObject({ fontSize: "12px", strokeThickness: 2 });
  });

  it("should grey it: the unavailable ink, the key and the cost faint", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(held({ greyed: true }));
    const { plaque, cost } = frame().squares.tree;
    expect(knockoutOf("earthbreaker")!.deps.ink).toBe(GREYED);
    expect(textAt(texts(), ...plaqueCentre(plaque))?.color).toBe(toCss(palette.hudFaint));
    expect(textAt(texts(), ...costCentre(cost))).toMatchObject({ words: "40", color: toCss(palette.hudFaint) });
  });

  it("should draw no cost for none, and read a mercenary's 1 in the parry colour", () => {
    const none = fakeScene();
    new AbilityBar(none.scene).show(held({ cost: null }));
    expect(textAt(none.texts(), ...costCentre(frame().squares.tree.cost))?.words).toBe("");
    const merc = fakeScene();
    new AbilityBar(merc.scene).show(held({ ability: "settle_the_debt", cost: 1 }, { costChannel: "parry", ability: { ...VIEW.ability, icon: "parry", cost: null } }));
    expect(knockoutOf("settle_the_debt")).toBeDefined();
    expect(textAt(merc.texts(), ...costCentre(frame().squares.tree.cost))).toMatchObject({ words: "1", color: toCss(palette.hudParry) });
  });

  it("should draw an empty well with its plaque for a class with no tree ability, and nothing fails (R27)", () => {
    const { scene, texts } = fakeScene();
    new AbilityBar(scene).show(held({ ability: null, greyed: true, cost: null }));
    expect(knockouts.map((k) => k.deps.picture)).toEqual([ABILITY_ICONS.potion.picture, ABILITY_ICONS.dash.picture]);
    expect(textAt(texts(), ...plaqueCentre(frame().squares.tree.plaque))?.words).toBe("3");
  });

  it("should never draw it active: the rim stays 1 px brass (R26)", () => {
    const { scene, ops } = fakeScene();
    new AbilityBar(scene).show(held());
    expect(ops()).not.toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
  });

  it("should lift its lit bronze under the pointer", () => {
    const lit = fakeScene();
    new AbilityBar(lit.scene).show(held());
    lit.zones()[SQUARE.tree].handlers.pointerover();
    expect(knockoutOf("earthbreaker")!.shows.at(-1)?.hovered).toBe(true);
  });
});

describe("AbilityBar: the pointer (FS-Q18Q3 §C R17, §H R33)", () => {
  it("should lay an interactive ground over each square's column, the plaque to the cost slot, at its depth", () => {
    const { scene, zones } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    const f = frame();
    expect(zones().map((z) => z.rect)).toEqual(
      (["potion", "ability", "tree"] as const).map((s) => ({
        x: f.squares[s].well.x,
        y: f.top,
        width: 44,
        height: f.squares[s].cost.y + f.squares[s].cost.height - f.top,
      })),
    );
    for (const z of zones()) expect(z).toMatchObject({ interactive: true, depth: 1000 });
  });

  it("should take a press and start nothing: no press handler of its own (R33)", () => {
    const { scene, zones } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    for (const z of zones()) {
      expect(z.handlers.pointerdown).toBeUndefined();
      expect(z.handlers.pointerup).toBeUndefined();
    }
  });

  it("should lift a lit square's bronze under the pointer, and let it fall as the pointer leaves", () => {
    const { scene, zones } = fakeScene();
    new AbilityBar(scene).show(VIEW);
    zones()[1].handlers.pointerover();
    expect(knockoutOf("dash")!.shows.at(-1)?.hovered).toBe(true);
    zones()[1].handlers.pointerout();
    expect(knockoutOf("dash")!.shows.at(-1)?.hovered).toBe(false);
  });

  it("should never brighten a greyed square under the pointer: its ink is the unavailable one", () => {
    const { scene, zones } = fakeScene();
    new AbilityBar(scene).show(view({ potion: { count: 0, greyed: true, field: false } }));
    zones()[0].handlers.pointerover();
    expect(knockoutOf("potion")!.deps.ink).toBe(GREYED);
    expect(GREYED.hover).toEqual(GREYED.idle);
  });
});

describe("AbilityBar: shown, down and moved (FS-Q18Q3 §B R10, R12, §L R41)", () => {
  it("should redraw nothing for a view that changes nothing", () => {
    const { scene, made } = fakeScene();
    const bar = new AbilityBar(scene);
    bar.show(VIEW);
    const count = made.length;
    const g = made.find((m) => m.kind === "graphics")!;
    const before = g.ops.length;
    bar.show(JSON.parse(JSON.stringify(VIEW)));
    expect(made.length).toBe(count);
    expect(g.ops.length).toBe(before);
  });

  it("should say its top while it stands, and none once it comes down, every object with it", () => {
    const { scene, live } = fakeScene();
    const bar = new AbilityBar(scene);
    expect(bar.top()).toBeNull();
    bar.show(VIEW);
    expect(bar.top()).toBe(frame().top);
    bar.show(null);
    expect(bar.top()).toBeNull();
    expect(live()).toEqual([]);
    expect(knockouts.every((k) => k.destroyed)).toBe(true);
  });

  it("should draw nothing before its first view", () => {
    const { scene, made } = fakeScene();
    new AbilityBar(scene).show(null);
    expect(made).toEqual([]);
  });

  it("should take everything down for good", () => {
    const { scene, live } = fakeScene();
    const bar = new AbilityBar(scene);
    bar.show(VIEW);
    bar.destroy();
    expect(live()).toEqual([]);
    expect(bar.top()).toBeNull();
  });

  it.each([1, 2])("should follow a resize back over the XP bar, its words re-crispened at render scale %i", (renderScale) => {
    const { scene, texts, zones } = fakeScene();
    const bar = new AbilityBar(scene);
    bar.show(VIEW);
    viewport.set({ width: 1280, height: 720, renderScale });
    bar.relayout();
    const f = frame();
    expect(f.row.x).toBe(564);
    expect(zones()[0].rect).toMatchObject({ x: f.squares.potion.well.x, y: f.top });
    expect(textAt(texts(), ...plaqueCentre(f.squares.tree.plaque))?.words).toBe("3");
    expect(knockoutOf("dash")!.shows.at(-1)?.f).toEqual(f.squares.ability.icon);
    for (const t of texts()) expect(t.ops).toContainEqual({ m: "setResolution", args: [renderScale] });
  });
});

describe("AbilityBar: the tooltips (FS-Q18Q3 §F R28, §L R41)", () => {
  /** The bar shown with `v`, the pointer over square `s`. */
  const hovering = (s: keyof typeof SQUARE, v: AbilityBarView = VIEW) => {
    const fake = fakeScene();
    const bar = new AbilityBar(fake.scene);
    bar.show(v);
    fake.zones()[SQUARE[s]].handlers.pointerover();
    return { ...fake, bar };
  };
  const words = (texts: Made[]) => texts.map((t) => t.words);
  /** A text's ink: as set, else as made. */
  const ink = (t: Made | undefined) => t?.color ?? t?.style?.color;

  it("should show the square's name in the 16 px body serif in vellum and how it works in 13 px label, in the item-tip band", () => {
    const { tipTexts, tip } = hovering("ability");
    const [name, line] = tipTexts();
    expect(words(tipTexts())).toEqual(["Dash", "Charge a short way toward the cursor."]);
    expect(ink(name)).toBe(toCss(palette.hudText));
    expect(name.style).toMatchObject({ fontFamily: CANVAS_FONT.body, fontSize: "16px" });
    expect(ink(line)).toBe(toCss(palette.hudLabel));
    expect(line.style).toMatchObject({ fontFamily: CANVAS_FONT.body, fontSize: "13px" });
    for (const m of tip()) expect(m.scrollFactor).toBe(0);
  });

  it("should stand on the HUD panel at 0.85 in a 1 px brass rim, at most 240 px wide, its words wrapping inside it", () => {
    const { tipOps, tipTexts } = hovering("potion");
    const fill = tipOps().find((o) => o.m === "fillRect")!.args as number[];
    expect(tipOps()).toContainEqual({ m: "fillStyle", args: [palette.hudPanel, 0.85] });
    expect(tipOps()).toContainEqual({ m: "lineStyle", args: [1, palette.frame, 0.6] });
    expect(tipOps()).toContainEqual({ m: "strokeRect", args: fill });
    expect(fill[2]).toBeLessThanOrEqual(240);
    for (const t of tipTexts()) {
      expect(t.style?.wordWrap).toMatchObject({ width: expect.any(Number) });
      expect(t.x! + measure(t).width).toBeLessThanOrEqual(fill[0] + fill[2]);
      expect(t.x!).toBeGreaterThanOrEqual(fill[0]);
    }
  });

  it("should centre it over its square, above the bar, and keep the right-hand square's inside the view at 1080", () => {
    const f = frame();
    for (const s of ["ability", "tree"] as const) {
      const { tipOps } = hovering(s);
      const [x, y, w, h] = tipOps().find((o) => o.m === "fillRect")!.args as number[];
      expect(y + h).toBeLessThan(f.top);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(1080);
      if (s === "ability") expect(Math.abs(x + w / 2 - (f.squares.ability.well.x + 22))).toBeLessThanOrEqual(1);
    }
  });

  it("should carry the potion's third line in a field and with none worn, in the faint vellum", () => {
    const inField = hovering("potion", view({ potion: { count: 2, greyed: true, field: true } }));
    expect(words(inField.tipTexts())).toEqual([
      "Health Potion",
      "Drink to heal at once, from your first potion slot.",
      "Potions are drunk only in the Spire.",
    ]);
    expect(ink(inField.tipTexts()[2])).toBe(toCss(palette.hudFaint));
    expect(inField.tipTexts()[2].style).toMatchObject({ fontSize: "13px" });
    const none = hovering("potion", view({ potion: { count: 0, greyed: true, field: false } }));
    expect(none.tipTexts().at(-1)?.words).toBe("No health potion worn.");
  });

  it("should read the locked 3 square's tree ability, name and line, and its third line in the faint vellum", () => {
    const { tipTexts } = hovering("tree");
    expect(words(tipTexts())).toEqual([
      "Earthbreaker",
      "Slam the ground: strike and stun all around you.",
      "Learned at the skill tree's third tier, from level 10.",
    ]);
    expect(ink(tipTexts()[2])).toBe(toCss(palette.hudFaint));
  });

  it("should read the held 3 square's tree ability, name and line alone, greyed or lit (R28)", () => {
    for (const greyed of [false, true]) {
      const { tipTexts } = hovering("tree", view({ tree: { locked: false, ability: "blink", greyed, cost: 30 } }));
      expect(words(tipTexts())).toEqual(["Blink", "Step through the dark toward where you point, never past a wall."]);
    }
  });

  it("should show a greyed square's tooltip, its icon never brightening", () => {
    const { tipTexts } = hovering("ability", view({ ability: { ...VIEW.ability, greyed: true } }));
    expect(tipTexts()[0]?.words).toBe("Dash");
    expect(knockoutOf("dash")!.deps.ink).toBe(GREYED);
  });

  it("should show no tooltip for a class with no row (R27)", () => {
    const { tip } = hovering("ability", view({ ability: { icon: null, greyed: false, active: false, cost: null } }));
    expect(tip()).toEqual([]);
  });

  it("should go as the pointer leaves, and the next square's show as it enters", () => {
    const { zones, tip, tipTexts } = hovering("potion");
    zones()[SQUARE.potion].handlers.pointerout();
    expect(tip()).toEqual([]);
    zones()[SQUARE.ability].handlers.pointerover();
    expect(tipTexts()[0]?.words).toBe("Dash");
  });

  it("should go with the bar as it comes down, and as its world leaves", () => {
    const down = hovering("ability");
    down.bar.show(null);
    expect(down.tip()).toEqual([]);
    const left = hovering("ability");
    left.bar.destroy();
    expect(left.live()).toEqual([]);
  });

  it("should follow a change under the pointer: the last potion drunk adds the none-worn line", () => {
    const { bar, tipTexts } = hovering("potion");
    expect(tipTexts()).toHaveLength(2);
    bar.show(view({ potion: { count: 0, greyed: true, field: false } }));
    expect(tipTexts().at(-1)?.words).toBe("No health potion worn.");
    expect(tipTexts()).toHaveLength(3);
  });

  it("should follow a resize back over its square", () => {
    const { bar, tipOps } = hovering("ability");
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    bar.relayout();
    const [x, , w] = tipOps().find((o) => o.m === "fillRect")!.args as number[];
    expect(Math.abs(x + w / 2 - (frame().squares.ability.well.x + 22))).toBeLessThanOrEqual(1);
  });

  it("should poll the pointer while it shows, so a window or the menu opening over a still pointer takes it", () => {
    const { zones, polls } = hovering("ability");
    expect(polls.at(-1)).toBe("always");
    zones()[SQUARE.ability].handlers.pointerout();
    expect(polls.at(-1)).toBe("onMove");
  });

  it("should poll on the pointer's moves alone while no tooltip ever showed", () => {
    const { zones, polls } = hovering("ability", view({ ability: { icon: null, greyed: false, active: false, cost: null } }));
    zones()[SQUARE.ability].handlers.pointerout();
    expect(polls).toEqual([]);
  });
});

describe("AbilityBar: the cooldown sweep (FS-Q18Q3 §D R18–R21, §L R41)", () => {
  const cooling = (remaining: number, total = 1.2, fields: Partial<AbilityBarView> = {}) =>
    view({ ability: { ...VIEW.ability, greyed: true }, cooldowns: { ability: { remaining, total }, tree: null }, ...fields });
  /** The wedge as drawn now: the points of the last `fillPoints` on any graphics, or none. */
  const wedge = (ops: Op[]) => ops.filter((o) => o.m === "fillPoints").map((o) => o.args[0] as { x: number; y: number }[]);
  const shown = (v: AbilityBarView, now = 1000) => {
    const fake = fakeScene();
    fake.time.now = now;
    const bar = new AbilityBar(fake.scene);
    bar.show(v);
    return { ...fake, bar };
  };
  const well = () => frame().squares.ability.well;

  it("should cover remaining / total of the right-click well from 12 o'clock in the ink at 0.55", () => {
    const { ops } = shown(cooling(0.6));
    expect(ops()).toContainEqual({ m: "fillStyle", args: [palette.ink, 0.55] });
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.5)]);
  });

  it("should run down with the UI scene's clock between states, never below 0", () => {
    const { ops, tick } = shown(cooling(1.2));
    tick(600);
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.5)]);
    tick(900);
    expect(wedge(ops())).toEqual([]);
  });

  it("should be corrected by the next state, run on from the time it is heard", () => {
    const { ops, bar, tick, time } = shown(cooling(1.2));
    tick(300);
    time.now += 100;
    bar.show(cooling(0.6));
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.5)]);
    tick(300);
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.25)]);
  });

  it("should keep its stamp for a state that carries the same cooldown", () => {
    const { ops, bar, tick } = shown(cooling(1.2));
    tick(600);
    bar.show(cooling(1.2, 1.2, { potion: { count: 1, greyed: false, field: false } }));
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.5)]);
  });

  it.each([
    ["{0, 0}", { remaining: 0, total: 0 }],
    ["total 0 with remaining > 0", { remaining: 0.5, total: 0 }],
    ["none (an older server)", null],
  ])("should draw no sweep and tick nothing for %s", (_name, ability) => {
    const { ops, updates, tick } = shown(view({ cooldowns: { ability, tree: null } }));
    expect(wedge(ops())).toEqual([]);
    expect(updates).toEqual([]);
    tick(16);
    expect(wedge(ops())).toEqual([]);
  });

  it("should stop listening to the frames once the sweep is clear, so nothing redraws while nothing runs", () => {
    const { updates, tick, made } = shown(cooling(0.3));
    expect(updates).toHaveLength(1);
    tick(400);
    expect(updates).toEqual([]);
    const count = made.reduce((n, m) => n + m.ops.length, 0);
    tick(16);
    expect(made.reduce((n, m) => n + m.ops.length, 0)).toBe(count);
  });

  it("should listen once however many states arrive while it runs", () => {
    const { updates, bar } = shown(cooling(1.2));
    bar.show(cooling(1.1));
    bar.show(cooling(1.0));
    expect(updates).toHaveLength(1);
  });

  it("should sweep no wedge on the potion, and none on the locked 3 square", () => {
    const { ops } = shown(view({ cooldowns: { ability: null, tree: { remaining: 4, total: 8 } } }));
    expect(wedge(ops())).toEqual([]);
  });

  // FS-Q18Q3 R26: the held 3 square takes its own sweep, from `tree_ability_cooldown`
  describe("the held 3 square's", () => {
    const treeWell = () => frame().squares.tree.well;
    const treeCooling = (remaining: number, total = 8, ability: AbilityBarView["cooldowns"]["ability"] = null) =>
      view({
        tree: { locked: false, ability: "earthbreaker", greyed: true, cost: 40 },
        cooldowns: { ability, tree: { remaining, total } },
      });

    it("should cover remaining / total of the 3 well and run down with the clock, never below 0", () => {
      const { ops, tick } = shown(treeCooling(4));
      expect(wedge(ops())).toEqual([sweepPolygon(treeWell(), 0.5)]);
      tick(2000);
      expect(wedge(ops())).toEqual([sweepPolygon(treeWell(), 0.25)]);
      tick(3000);
      expect(wedge(ops())).toEqual([]);
    });

    it("should be corrected by the next state", () => {
      const { ops, bar, tick } = shown(treeCooling(4));
      tick(1000);
      bar.show(treeCooling(6));
      expect(wedge(ops())).toEqual([sweepPolygon(treeWell(), 0.75)]);
    });

    it("should run beside the right-click's, each on its own well, on one frame listener", () => {
      const { ops, updates } = shown(treeCooling(4, 8, { remaining: 0.6, total: 1.2 }));
      expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.5), sweepPolygon(treeWell(), 0.5)]);
      expect(updates).toHaveLength(1);
    });

    it("should draw none at {0, 0}", () => {
      const { ops, updates } = shown(treeCooling(0, 0));
      expect(wedge(ops())).toEqual([]);
      expect(updates).toEqual([]);
    });
  });

  it("should draw no seconds numeral (R20)", () => {
    const { texts } = shown(cooling(0.6));
    expect(texts().map((t) => t.words).filter((w) => w && /\d\.\d|s$/.test(w))).toEqual([]);
  });

  it("should draw active, greyed and swept at once: a Shadow Shot hold inside a running cooldown", () => {
    const { ops } = shown(cooling(0.6, 1.2, { ability: { icon: "shadow_shot", greyed: true, active: true, cost: 30 } }));
    expect(ops()).toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
    expect(knockoutOf("shadow_shot")!.deps.ink).toBe(GREYED);
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.5)]);
  });

  it("should lay the wedge over the well's ground and under its rim, its plaque and its icon", () => {
    const { made, ops } = shown(cooling(0.6, 1.2, { ability: { ...VIEW.ability, active: true } }));
    const graphics = made.filter((m) => m.kind === "graphics");
    const { x, y, width, height } = well();
    const at = (pred: (g: Made) => boolean) => graphics.findIndex(pred);
    const ground = at((g) => g.ops.some((o) => o.m === "fillRect" && o.args.join() === [x, y, width, height].join()));
    const sweep = at((g) => g.ops.some((o) => o.m === "fillPoints"));
    const face = at((g) => g.ops.some((o) => o.m === "strokeRoundedRect"));
    expect(ground).toBeGreaterThanOrEqual(0);
    expect(ground).toBeLessThan(sweep);
    expect(sweep).toBeLessThan(face);
    expect(ops()).toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
    expect(graphics[face].ops).toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
  });

  it("should hold no sweep once the bar is held at a death mid-cooldown, and stop ticking (FS-QPDKN R168)", () => {
    const { ops, bar, updates } = shown(cooling(1.2));
    bar.show(view({ ability: { ...VIEW.ability, greyed: true }, potion: { ...VIEW.potion, greyed: true } }));
    expect(wedge(ops())).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("should draw the next state's cooldown at once on a reconnect", () => {
    const { ops, bar, tick } = shown(VIEW);
    tick(5000);
    bar.show(cooling(0.9));
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.75)]);
  });

  it.each([
    ["as it comes down", (bar: InstanceType<typeof AbilityBar>) => bar.show(null)],
    ["as its world leaves", (bar: InstanceType<typeof AbilityBar>) => bar.destroy()],
  ])("should stop ticking %s, and a fresh bar starts its sweep fresh", (_name, leave) => {
    const { bar, updates, tick, live } = shown(cooling(1.2));
    leave(bar);
    expect(updates).toEqual([]);
    tick(16);
    expect(live()).toEqual([]);
    bar.show(cooling(1.2));
    tick(600);
    expect(wedge(live().flatMap((m) => m.ops))).toEqual([sweepPolygon(well(), 0.5)]);
  });

  it("should follow a resize back over its square", () => {
    const { ops, bar } = shown(cooling(0.6));
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    bar.relayout();
    expect(wedge(ops())).toEqual([sweepPolygon(well(), 0.5)]);
  });

  it("should not rebuild the tooltip with the frames while the pointer stands over a running sweep", () => {
    const { zones, made, tick, tipTexts } = shown(cooling(1.2));
    zones()[SQUARE.ability].handlers.pointerover();
    const count = made.length;
    tick(16);
    tick(16);
    expect(made.length).toBe(count);
    expect(tipTexts()[0]?.words).toBe("Dash");
  });
});
