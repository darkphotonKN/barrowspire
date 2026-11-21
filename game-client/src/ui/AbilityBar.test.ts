import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { AbilityBarView } from "./abilityBarView";
import { abilityBarFrame } from "./abilityBarLayout";
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

function fakeScene() {
  const made: Made[] = [];
  const object = (m: Made) => {
    made.push(m);
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return undefined;
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
  } as unknown as Phaser.Scene;
  const live = () => made.filter((m) => !m.destroyed);
  const ops = () => live().filter((m) => m.kind === "graphics").flatMap((g) => g.ops);
  const texts = () => live().filter((m) => m.kind === "text");
  const zones = () => live().filter((m) => m.kind === "zone");
  return { scene, made, live, ops, texts, zones };
}

const VIEW: AbilityBarView = {
  potion: { count: 2, greyed: false },
  ability: { icon: "dash", greyed: false, active: false, cost: 25 },
  tree: { locked: true },
  costChannel: "stamina",
  cooldowns: { ability: null, tree: null },
};
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
    new AbilityBar(scene).show(view({ potion: { count: 0, greyed: true } }));
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
    new AbilityBar(scene).show(view({ potion: { count: 0, greyed: true } }));
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
