import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
import { LIT_PLATE_ALPHA, LOCK_DEPTH, PICTURE_DEPTH, NO_TREE, PassiveTreeOverlay, TREE_DEPTH, TREE_HALO, TREE_LOOK, drawNodePlate, drawUnknownGlyph, haloDiscAlpha, nodePicture } from "./PassiveTreeOverlay";
import { GREYED, Knockout, TREE_BRONZE_MIX, TREE_INK, TREE_LIT_LIFT, treeLitInk, type KnockoutInk } from "./knockout";
import { PICTURE_MARGIN, fitIcon } from "./passiveIcons";
import { treeLayout } from "./passiveTreeLayout";
import { treeView, type TreeSource } from "./passiveTreeModel";
import type { World } from "./uiBridge";

// FS-8RZ51 §G R34, R36, R37, R41, R42 (I-8RZ51-7) and §Change: Tree v2 V23–V25, V27 (I-8RZ51-14,
// I-8RZ51-17): the overlay on a recording stand-in for the UI scene: its frame, title, header, the graph's
// links and plates, its lock marks and footer; its ground between the gear overlay and the party panel;
// its tooltips in the item tips' band; its × and its redraws; the side ask.

interface Made {
  kind: "text" | "graphics" | "zone" | "container";
  words?: string;
  depth?: number;
  rect?: number[];
  interactive?: boolean;
  children?: Made[];
  x?: number;
  y?: number;
  ops: string[];
  inks: number[];
  /** Each fill's colour and alpha, in order. */
  fills?: [number, number][];
  /** Each path point drawn (`moveTo`, `lineTo`). */
  pts?: [number, number][];
  /** Each filled circle's centre and radius, with the fill it was drawn in. */
  circles?: { x: number; y: number; r: number; fill?: [number, number] }[];
  destroyed: boolean;
}

function stage() {
  const made: Made[] = [];
  const recOf = new Map<unknown, Made>();
  /** Each zone as the scene handed it back. */
  const zones: unknown[] = [];
  const chain = (rec: Made, extra: Record<string, unknown> = {}) => {
    const self: Record<string, unknown> = new Proxy(extra, {
      get: (t, prop: string) => {
        if (prop in t) return t[prop];
        if (prop === "setDepth") return (d: number) => ((rec.depth = d), self);
        if (prop === "setPosition") return (x: number, y: number) => ((rec.x = x), (rec.y = y), self);
        if (prop === "setInteractive") return () => ((rec.interactive = true), self);
        // a container takes its children down with it, as Phaser's does
        if (prop === "destroy") return () => [rec, ...(rec.children ?? [])].forEach((m) => (m.destroyed = true));
        if (prop === "lineStyle") return (_w: number, ink: number) => (rec.inks.push(ink), rec.ops.push(prop), self);
        if (prop === "fillStyle") return (ink: number, alpha = 1) => ((rec.fills ??= []).push([ink, alpha]), rec.ops.push(prop), self);
        if (prop === "fillCircle")
          return (x: number, y: number, r: number) => ((rec.circles ??= []).push({ x, y, r, fill: rec.fills?.at(-1) }), rec.ops.push(prop), self);
        if (prop === "moveTo" || prop === "lineTo") return (x: number, y: number) => ((rec.pts ??= []).push([x, y]), rec.ops.push(prop), self);
        return () => (rec.ops.push(prop), self);
      },
    });
    recOf.set(self, rec);
    made.push(rec);
    return self;
  };
  const scene = {
    add: {
      graphics: () => chain({ kind: "graphics", ops: [], inks: [], destroyed: false }),
      text: (x: number, y: number, words: string) =>
        chain({ kind: "text", words, x, y, ops: [], inks: [], destroyed: false }, { width: words.length * 6, height: 14 }),
      zone: (x: number, y: number, w: number, h: number) => {
        const zone = chain({ kind: "zone", rect: [x, y, w, h], ops: [], inks: [], destroyed: false });
        zones.push(zone);
        return zone;
      },
      container: (_x: number, _y: number, children: unknown[] = []) =>
        chain({ kind: "container", children: children.map((c) => recOf.get(c)!).filter(Boolean), ops: [], inks: [], destroyed: false }),
    },
  };
  const live = () => made.filter((m) => !m.destroyed);
  const words = () => live().filter((m) => m.kind === "text").map((m) => m.words!);
  const depthOf = (word: string) => live().find((c) => c.kind === "container" && c.children?.some((t) => t.words === word))?.depth;
  return { scene: scene as never, made, live, words, depthOf, zones };
}

const warrior = (ranks: Record<string, number> = {}, points = 3, level = 8): TreeSource => ({ class: "warrior", level, passive_ranks: ranks, passive_points: points });
const held = (slots: string[]) => Object.fromEntries(slots.map((s) => [`warrior.${s}`, 1]));
/** The trunk and the upper side a's first node: Heavy Hand open, the upper side b locked. */
const TRUNK = held(["r1", "r2", "ua1"]);
/** The path to the specializations. */
const TO_M4 = held(["r1", "r2", "ua1", "m1", "m2", "t3", "m3", "la1", "m4"]);

function opened(world: World = "hub", source: TreeSource | undefined = warrior()) {
  const env = stage();
  const dismiss = vi.fn();
  const sent: [string, number][] = [];
  const overlay = new PassiveTreeOverlay(env.scene, { world, dismiss, spend: (id, rank) => (sent.push([id, rank]), true) });
  overlay.show(source);
  overlay.open();
  const view = treeView(source ?? { class: "" });
  const layout = treeLayout(viewport, view.nodes, view.links);
  /** The middle of a node's plate, by its slot. */
  const at = (slot: string) => {
    const p = layout.plates.find((q) => q.id === `${source?.class}.${slot}`)!.rect;
    return { x: p.x + p.width / 2, y: p.y + p.height / 2 };
  };
  /** A press on the plate of the node in `slot`. */
  const click = (slot: string) => {
    const p = at(slot);
    return overlay.pointerDown(p.x, p.y);
  };
  const hover = (slot: string) => {
    const p = at(slot);
    overlay.pointerMove(p.x, p.y);
  };
  const press = (box: { x: number; y: number }) => overlay.pointerDown(box.x + 2, box.y + 2);
  return { ...env, overlay, dismiss, layout, sent, click, hover, press };
}

describe("the passive tree overlay's panel (FS-8RZ51 R34, R35)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should draw nothing until it opens, and its title, header and every node's rank once open, with no tier", () => {
    const env = stage();
    const overlay = new PassiveTreeOverlay(env.scene, { world: "hub", dismiss: () => {}, spend: () => true });
    overlay.show(warrior({ ...TRUNK, "warrior.t2a": 2 }));
    expect(env.made).toEqual([]);
    overlay.open();
    const words = env.words();
    expect(words).toContain("PASSIVE TREE");
    expect(words).toContain("Warrior · 3 points");
    expect(words.filter((w) => /^\d \/ \d$/.test(w))).toHaveLength(31);
    expect(words).toContain("2 / 3");
    // the old tier rows' "or" and gate column are gone (I-8RZ51-17)
    expect(words).not.toContain("or");
    expect(words.some((w) => /tier|spent|gate/i.test(w))).toBe(false);
  });

  it("should stand its ground over its panel, and its frame and contents between the gear overlay and the party panel", () => {
    const { live, layout, depthOf } = opened();
    const ground = live().find((m) => m.kind === "zone")!;
    const { panel } = layout;
    expect(ground.rect).toEqual([panel.x, panel.y, panel.width, panel.height]);
    expect(ground.interactive).toBe(true);
    expect(ground.depth).toBe(TREE_DEPTH);
    for (const word of ["PASSIVE TREE", "Warrior · 3 points", "0 / 1"]) {
      expect(depthOf(word)).toBeGreaterThan(1103);
      expect(depthOf(word)).toBeLessThan(1110);
    }
  });

  it("should say points are spent in town outside the town, and nothing of it in the town (R38)", () => {
    expect(opened("hub").words()).not.toContain("Points are spent in town.");
    expect(opened("field").words()).toContain("Points are spent in town.");
    expect(opened("run").words()).toContain("Points are spent in town.");
  });

  it("should draw a class the client does not know as its header and a line, never throwing (R42)", () => {
    const { words } = opened("hub", { class: "necromancer", passive_points: 1 });
    expect(words()).toContain("Necromancer · 1 point");
    expect(words()).toContain(NO_TREE);
    expect(words().some((w) => w.startsWith("TIER"))).toBe(false);
  });

  it("should take everything down as it closes", () => {
    const { overlay, live } = opened();
    overlay.close();
    expect(live()).toEqual([]);
    expect(overlay.isOpen()).toBe(false);
  });
});

describe("the passive tree overlay's graph (FS-8RZ51 V23–V25, I-8RZ51-17)", () => {
  /** The content's graphics, in the order drawn: the links, then the plates. */
  const pens = (env: ReturnType<typeof opened>) => {
    const content = env.live().find((m) => m.kind === "container" && m.depth === TREE_DEPTH + 1)!;
    return content.children!.filter((c) => c.kind === "graphics");
  };
  const count = (ops: string[], op: string) => ops.filter((o) => o === op).length;

  it("should draw one link per requires edge, under the plates", () => {
    const [links, plates] = pens(opened());
    expect(count(links.ops, "lineBetween")).toBe(32);
    expect(count(plates.ops, "lineBetween")).toBe(0);
    expect(count(plates.ops, "fillCircle") + count(plates.ops, "fillRoundedRect")).toBeGreaterThanOrEqual(31);
  });

  it("should light a link only when both its ends are held", () => {
    const lit = (source: TreeSource) => pens(opened("hub", source))[0].inks.filter((ink) => ink === palette.frameBright).length;
    expect(lit(warrior())).toBe(0);
    // r1→r2 and r2→ua1; ua1→t2a and ua1→m1 have one end unheld
    expect(lit(warrior(TRUNK))).toBe(2);
  });

  it("should draw the 24 traversal plates round and the rest square", () => {
    const [, plates] = pens(opened());
    expect(count(plates.ops, "strokeRoundedRect")).toBe(7);
    // the ground under every plate, and a lit one's fill over it (V29): only the root is lit
    expect(count(plates.ops, "fillCircle")).toBe(24 + 1);
    expect(count(plates.ops, "fillRoundedRect")).toBe(7);
  });

  it("should draw a lock mark on each locked node, over its picture, and none where nothing is locked", () => {
    const marks = (env: ReturnType<typeof opened>) => env.live().find((m) => m.kind === "graphics" && m.depth === LOCK_DEPTH);
    const locked = opened("hub", warrior(TRUNK));
    // every upper:b node: ub1, t2b, ub2, ub3, ub4, each on its dark backing, its padlock in lines here
    expect(count(marks(locked)!.ops, "fillCircle")).toBe(5);
    expect(count(marks(locked)!.ops, "strokePath")).toBeGreaterThanOrEqual(5);
    expect(marks(locked)!.inks.every((ink) => ink === palette.hudText)).toBe(true);
    expect(LOCK_DEPTH).toBeGreaterThan(TREE_DEPTH + 1);
    expect(LOCK_DEPTH).toBeLessThan(1110);
    expect(marks(opened())!.ops).not.toContain("fillCircle");
  });

  it("should light a lit node's whole plate in its edge's token over the ground, and no other (V29)", () => {
    const fills = (env: ReturnType<typeof opened>) => pens(env)[1].fills!;
    const over = (env: ReturnType<typeof opened>, ink: number) => fills(env).filter(([c, a]) => c === ink && a === LIT_PLATE_ALPHA).length;
    // a fresh warrior with points: only the root is open, and it is spendable
    const fresh = opened("hub", warrior());
    expect(over(fresh, palette.interactable)).toBe(1);
    expect(fills(fresh).filter(([, a]) => a === LIT_PLATE_ALPHA)).toHaveLength(1);
    // with no point to spend, the open root is greyed, not lit
    expect(fills(opened("hub", warrior({}, 0))).filter(([, a]) => a === LIT_PLATE_ALPHA)).toHaveLength(0);
    // the trunk held, each at its one rank: three plates lit in bright brass; Heavy Hand and m1 open and spendable, in amber
    const trunk = opened("hub", warrior(TRUNK));
    expect(over(trunk, palette.frameBright)).toBe(3);
    expect(over(trunk, palette.interactable)).toBe(2);
    // a node held short of its last rank lit in brass
    expect(over(opened("hub", warrior({ ...TRUNK, "warrior.t2a": 1 })), palette.frame)).toBe(1);
  });

  it("should fit every picture inside its plate less the margin (V29)", () => {
    const env = opened("hub", warrior(TRUNK));
    const plates = env.layout.plates;
    for (const [x, y] of pens(env)[1].pts!) {
      const home = plates.find(({ rect }) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
      expect(home, `${x},${y} on no plate`).toBeDefined();
      const { rect, round } = home!;
      const [cx, cy, room] = [rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2 - PICTURE_MARGIN + 0.01];
      if (round) expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(room);
      else expect(Math.max(Math.abs(x - cx), Math.abs(y - cy))).toBeLessThanOrEqual(room);
    }
  });

  it("should draw the pictures' lines in the vellum ink, a greyed one in the faint grey (V29)", () => {
    const inks = pens(opened("hub", warrior(TRUNK)))[1].inks;
    expect(inks).toContain(palette.hudText);
    expect(inks).toContain(palette.hudFaint);
  });

  it("should ring a round plate round under the pointer", () => {
    const env = opened();
    env.hover("r1");
    const ring = env.live().find((m) => m.kind === "graphics" && m.depth === LOCK_DEPTH + 1)!;
    expect(ring.ops).toContain("strokeCircle");
    expect(ring.ops).not.toContain("strokeRoundedRect");
  });
});

describe("the passive tree overlay's redraws (FS-8RZ51 R41)", () => {
  it("should redraw as the ranks or the points change, and not on a tick that changes nothing", () => {
    const { overlay, made, words } = opened("hub", warrior({}, 3));
    const count = made.length;
    overlay.show(warrior({}, 3));
    expect(made.length).toBe(count);
    overlay.show(warrior({ "warrior.r1": 1 }, 2));
    expect(words()).toContain("Warrior · 2 points");
    expect(words()).toContain("1 / 1");
  });

  it("should draw the last state it was handed as it opens", () => {
    const env = stage();
    const overlay = new PassiveTreeOverlay(env.scene, { world: "run", dismiss: () => {}, spend: () => true });
    overlay.show(warrior({}, 5));
    overlay.close();
    overlay.open();
    expect(env.words()).toContain("Warrior · 5 points");
  });
});

describe("the passive tree overlay's tooltips and presses (FS-8RZ51 R37)", () => {
  it("should show a hovered node's tooltip in the item tips' band, and take it down off every node", () => {
    const { overlay, layout, live, depthOf, hover } = opened("hub", warrior(TRUNK));
    hover("t2a");
    const tip = live().filter((m) => m.kind === "text" && m.words?.includes("Heavy Hand"));
    expect(tip).toHaveLength(1);
    expect(depthOf("Heavy Hand")).toBe(2200);
    expect(live().some((m) => m.words?.includes("Rank 3 kicker:"))).toBe(true);
    overlay.pointerMove(layout.panel.x + 2, layout.panel.y + 60);
    expect(live().some((m) => m.words === "Heavy Hand")).toBe(false);
  });

  it("should mark the held ranks in its tooltip", () => {
    const { live, hover } = opened("hub", warrior({ ...TRUNK, "warrior.t2a": 1 }));
    hover("t2a");
    const lines = live().filter((m) => m.kind === "text").map((m) => m.words!);
    expect(lines).toContain("• Rank 1: +6% slash damage");
    expect(lines).toContain("  Rank 2: +6% slash damage");
  });

  it.each([
    ["a closed node what it needs", warrior(), "m1", "Not reachable yet: take Haste or Fleetness first."],
    ["a locked node the side chosen", warrior(TRUNK), "ub1", "Locked: you chose Heavy Hand."],
  ])("should say on %s (V25, V26)", (_what, source, slot, words) => {
    const { live, hover } = opened("hub", source);
    hover(slot);
    expect(live().some((m) => m.words === words)).toBe(true);
  });

  it("should close on its ×, take a press anywhere on its panel, and none off it", () => {
    const { overlay, dismiss, layout } = opened();
    const { panel } = layout;
    expect(overlay.pointerDown(panel.x + 10, panel.y + panel.height - 10)).toBe(true);
    expect(dismiss).not.toHaveBeenCalled();
    expect(overlay.pointerDown(panel.x - 10, panel.y)).toBe(false);
    // the × box: the frame's padding in from the top right
    expect(overlay.pointerDown(panel.x + panel.width - 12 - 12, panel.y + 12 + 12)).toBe(true);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("should own its ground and nothing else, and no ground once closed", () => {
    const { overlay, zones } = opened();
    expect(overlay.owns(zones[0])).toBe(true);
    expect(overlay.owns({})).toBe(false);
    overlay.close();
    expect(overlay.owns(zones[0])).toBe(false);
  });
});

describe("the passive tree overlay's spends (FS-8RZ51 R38)", () => {
  it("should send an available node's next rank once in town, and nothing on a second click", () => {
    const { click, sent } = opened("hub", warrior({ ...TRUNK, "warrior.t2a": 1 }));
    expect(click("t2a")).toBe(true);
    expect(click("t2a")).toBe(true);
    expect(sent).toEqual([["warrior.t2a", 2]]);
  });

  it("should take a click on the node again once the state shows the rank", () => {
    const { overlay, click, sent } = opened("hub", warrior(TRUNK));
    click("t2a");
    overlay.show(warrior({ ...TRUNK, "warrior.t2a": 1 }, 2));
    click("t2a");
    expect(sent).toEqual([
      ["warrior.t2a", 1],
      ["warrior.t2a", 2],
    ]);
  });

  it.each(["field", "run"] as const)("should take no node click in %s, its footer saying points are spent in town", (world) => {
    const { click, sent, words } = opened(world, warrior());
    expect(click("r1")).toBe(true);
    expect(sent).toEqual([]);
    expect(words()).toContain("Points are spent in town.");
  });

  it("should send nothing for a closed or a locked node", () => {
    const { click, sent } = opened("hub", warrior());
    click("r2");
    expect(sent).toEqual([]);
    const locked = opened("hub", warrior(TRUNK));
    locked.click("ub1");
    expect(locked.sent).toEqual([]);
  });

  it("should ask once in the panel on a specialization click, and send nothing on No", () => {
    const { click, press, sent, words, layout } = opened("hub", warrior(TO_M4, 2, 20));
    click("t6a");
    expect(sent).toEqual([]);
    expect(words()).toContain("Choose Guardian? Berserker is gone for good.");
    expect(words()).toEqual(expect.arrayContaining(["Yes", "No"]));
    expect(press(layout.answers.no)).toBe(true);
    expect(sent).toEqual([]);
    expect(words()).not.toContain("Choose Guardian? Berserker is gone for good.");
    expect(words()).not.toContain("Yes");
  });

  it("should send the specialization on Yes", () => {
    const { click, press, sent, layout } = opened("hub", warrior(TO_M4, 2, 20));
    click("t6b");
    press(layout.answers.yes);
    expect(sent).toEqual([["warrior.t6b", 1]]);
  });

  it("should ask once in the panel on the first node of a side, send it on Yes, and nothing on No (V27)", () => {
    const fork = warrior(held(["r1", "r2"]));
    const no = opened("hub", fork);
    no.click("ua1");
    expect(no.words()).toContain("Take Haste? Thick Skin's side is gone for good.");
    no.press(no.layout.answers.no);
    expect(no.sent).toEqual([]);
    const yes = opened("hub", fork);
    yes.click("ub1");
    expect(yes.words()).toContain("Take Fleetness? Heavy Hand's side is gone for good.");
    yes.press(yes.layout.answers.yes);
    expect(yes.sent).toEqual([["warrior.ub1", 1]]);
  });

  it("should show a refusal's reason in the panel until the next click, and until it closes", () => {
    const { overlay, click, words } = opened("hub", warrior());
    click("r1");
    overlay.refused("Leave the queue to spend points.");
    expect(words()).toContain("Leave the queue to spend points.");
    click("r1");
    expect(words()).not.toContain("Leave the queue to spend points.");
    overlay.refused("No points to spend.");
    overlay.close();
    overlay.open();
    expect(words()).not.toContain("No points to spend.");
  });

  it("should hear a refusal while closed without drawing, and not show it as it opens", () => {
    const { overlay, live, words } = opened("hub", warrior());
    overlay.close();
    overlay.refused("Unknown node.");
    expect(live()).toEqual([]);
    overlay.open();
    expect(words()).not.toContain("Unknown node.");
  });
});

describe("the fallback glyph (FS-8RZ51 R42)", () => {
  it("should draw a node the copy lacks in lines, nothing filled", () => {
    const calls: string[] = [];
    const inks: number[] = [];
    const g = new Proxy(
      {},
      {
        get: (_t, prop: string) => (...args: number[]) => {
          calls.push(prop);
          if (prop === "lineStyle") inks.push(args[1]);
        },
      },
    );
    drawUnknownGlyph(g as never, 0, 0, palette.frame, 1);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.some((c) => c.startsWith("fill"))).toBe(false);
    expect(inks).toEqual([palette.frame]);
  });
});

/** A colour in OKLab (Björn Ottosson's matrices, from sRGB). */
function okLab(color: number): [number, number, number] {
  const linear = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How far apart two colours are in OKLab: about 0.02 is the least an eye tells apart. */
function okLabDistance(a: number, b: number): number {
  const [p, q] = [okLab(a), okLab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The stand-in scene given what the game's has to make a knockout: each texture's tint and alpha recorded. */
function texturing() {
  const env = stage();
  const images: { tints: number[]; alpha?: number; depth?: number }[] = [];
  const chain = (rec: { tints: number[]; alpha?: number; depth?: number }, extra: Record<string, unknown> = {}): unknown => {
    const self: unknown = new Proxy(extra, {
      get: (t, prop: string) => {
        if (prop in t) return t[prop];
        if (prop === "setTint") return (...tints: number[]) => ((rec.tints = tints), self);
        if (prop === "setAlpha") return (a: number) => ((rec.alpha = a), self);
        if (prop === "setDepth") return (d: number) => ((rec.depth = d), self);
        return () => self;
      },
    });
    return self;
  };
  const scene = env.scene as unknown as Record<string, Record<string, unknown>>;
  scene.make = { graphics: () => chain({ tints: [] }) };
  scene.add.renderTexture = (_x: number, _y: number, width: number, height: number) => {
    const rec = { tints: [] as number[] };
    images.push(rec);
    return chain(rec, { width, height, texture: {} });
  };
  scene.add.image = () => chain({ tints: [] });
  scene.children = { moveBelow: () => {} };
  return { ...env, images };
}

describe("the node pictures through the one renderer (FS-8RZ51 R40, I-8RZ51-10, I-8RZ51-11)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });


  // the path to the specializations, and Guardian: Berserker is locked
  const GUARDIAN = { ...TO_M4, "warrior.t6a": 1 };

  it.each([
    ["a fresh warrior", warrior()],
    ["a warrior who took Guardian", warrior(GUARDIAN)],
    ["a mage", { class: "mage", level: 8, passive_ranks: {}, passive_points: 3 } as TreeSource],
    ["an archer", { class: "archer", level: 8, passive_ranks: {}, passive_points: 3 } as TreeSource],
    ["a mercenary", { class: "mercenary", level: 8, passive_ranks: {}, passive_points: 3 } as TreeSource],
  ])("should draw every node of %s as its knockout, none falling back to lines", (_who, source) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = texturing();
    const overlay = new PassiveTreeOverlay(env.scene, { world: "hub", dismiss: () => {}, spend: () => true });
    overlay.show(source);
    overlay.open();
    // a knockout for every plate, and one for each locked node's padlock
    expect(env.images).toHaveLength(31 + treeView(source).nodes.filter((n) => n.state === "locked").length);
    expect(warn).not.toHaveBeenCalled();
  });

  it("should draw each lock mark's padlock as its knockout in the vellum ink, over the plates (V25, V29)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = texturing();
    const overlay = new PassiveTreeOverlay(env.scene, { world: "hub", dismiss: () => {}, spend: () => true });
    overlay.show(warrior(TRUNK));
    overlay.open();
    // 31 plates, then the five upper:b padlocks
    expect(env.images).toHaveLength(36);
    for (const lock of env.images.slice(31)) expect(lock.tints).toEqual([palette.hudText]);
    // every picture over the plates' fills, every padlock over the pictures
    for (const picture of env.images.slice(0, 31)) {
      expect(picture.depth).toBe(PICTURE_DEPTH);
      expect(picture.depth).toBeGreaterThan(TREE_DEPTH + 1);
    }
    for (const lock of env.images.slice(31)) expect(lock.depth).toBe(LOCK_DEPTH);
    expect(LOCK_DEPTH).toBeGreaterThan(PICTURE_DEPTH);
    const marks = env.live().find((m) => m.kind === "graphics" && m.depth === LOCK_DEPTH)!;
    expect(marks.ops.filter((o) => o === "fillCircle")).toHaveLength(5);
    expect(marks.ops).not.toContain("strokePath");
    expect(warn).not.toHaveBeenCalled();
  });

  it("should draw a locked and a closed node greyed, flat in the faint grey at the greyed alpha, and an open one in the vellum tree ink (V25, V29)", () => {
    const env = texturing();
    const overlay = new PassiveTreeOverlay(env.scene, { world: "hub", dismiss: () => {}, spend: () => true });
    overlay.show(warrior(GUARDIAN, 1, 20));
    overlay.open();
    // drawn in the definition's order: Berserker where the view lays it, locked by Guardian
    const order = (source: TreeSource) => treeView(source).nodes.map((n) => n.id);
    const berserker = env.images[order(warrior(GUARDIAN, 1, 20)).indexOf("warrior.t6b")];
    expect(berserker.tints).toEqual([GREYED.idle.tint]);
    expect(berserker.alpha).toBe(GREYED.idle.alpha);
    const fresh = texturing();
    const other = new PassiveTreeOverlay(fresh.scene, { world: "hub", dismiss: () => {}, spend: () => true });
    other.show(warrior({}, 1));
    other.open();
    // a fresh warrior's root is open, the node it links to closed behind it
    expect(fresh.images[0].tints).toEqual([palette.hudText]);
    expect(fresh.images[0].alpha).toBe(TREE_INK.idle.alpha);
    expect(fresh.images[1].tints).toEqual([GREYED.idle.tint]);
    expect(fresh.images[1].alpha).toBe(GREYED.idle.alpha);
  });
});

describe("a lit node's own colour and its glow (FS-8RZ51 §Change: A lit node glows in its own colour, I-8RZ51-22)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
  });


  function show(source: TreeSource, env = texturing()) {
    const overlay = new PassiveTreeOverlay(env.scene, { world: "hub", dismiss: () => {}, spend: () => true });
    overlay.show(source);
    overlay.open();
    const view = treeView(source);
    const layout = treeLayout(viewport, view.nodes, view.links);
    const plates = env.live().find((m) => m.kind === "container" && m.depth === TREE_DEPTH + 1)!.children!.filter((c) => c.kind === "graphics")[1];
    const image = (id: string) => env.images[view.nodes.findIndex((n) => n.id === id)];
    return { ...env, overlay, view, layout, plates, image };
  }

  /** The corner tints a knockout of `id`'s picture shows in `ink` on its plate, on a scene of its own. */
  function inkOf(source: TreeSource, id: string, ink: KnockoutInk) {
    const view = treeView(source);
    const layout = treeLayout(viewport, view.nodes, view.links);
    const i = view.nodes.findIndex((n) => n.id === id);
    const plate = layout.plates[i].rect;
    const env = texturing();
    new Knockout({ scene: env.scene as never, depth: PICTURE_DEPTH, picture: fitIcon(nodePicture(view.nodes[i].icon)!, plate.width).picture, ink }).show(plate, false);
    return env.images[0];
  }

  /** The halo's discs on the plate graphics: the circles drawn at the halo's alpha. */
  const halos = (plates: { circles?: { x: number; y: number; r: number; fill?: [number, number] }[] }) =>
    (plates.circles ?? []).filter((c) => c.fill?.[1] === haloDiscAlpha());

  const TRUNK_HELD = warrior({ "warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1 });

  it("should draw a held Vitality's picture in the health lit ink, lit from above at full alpha", () => {
    const env = show(TRUNK_HELD);
    const vitality = env.image("warrior.r1");
    const want = inkOf(TRUNK_HELD, "warrior.r1", treeLitInk(palette.treeHue.health));
    expect(vitality.tints).toEqual(want.tints);
    expect(vitality.alpha).toBe(1);
    // lit from above: its top and foot differ, and its top is not the near-white
    expect(vitality.tints[0]).not.toBe(vitality.tints[2]);
    expect(vitality.tints).not.toContain(palette.hudText);
  });

  it("should draw each held node in its own hue's ink, and an open one in the near-white tree ink, as today", () => {
    const env = show(TRUNK_HELD);
    for (const node of env.view.nodes.filter((n) => n.state === "held" || n.state === "max")) {
      expect(env.image(node.id).tints, node.id).toEqual(inkOf(TRUNK_HELD, node.id, treeLitInk(palette.treeHue[node.hue!])).tints);
    }
    // Heavy Hand and m1 are open and spendable: V29's near-white, flat (the owner, 2026-11-23)
    for (const id of ["warrior.t2a", "warrior.m1"]) {
      expect(env.view.nodes.find((n) => n.id === id)!.state).toBe("available");
      expect(env.image(id).tints).toEqual([TREE_INK.idle.tint]);
      expect(env.image(id).alpha).toBe(TREE_INK.idle.alpha);
    }
  });

  it("should draw a kicker the same at 1/3 as at 3/3", () => {
    const at = (rank: number) => show(warrior({ ...TRUNK, "warrior.t2a": rank })).image("warrior.t2a");
    const [one, three] = [at(1), at(3)];
    expect(one.tints).toEqual(three.tints);
    expect(one.alpha).toBe(three.alpha);
    expect(one.tints).toEqual(inkOf(warrior({ ...TRUNK, "warrior.t2a": 1 }), "warrior.t2a", treeLitInk(palette.treeHue.power)).tints);
  });

  it("should draw a locked node greyed and unglowing whatever rank it holds", () => {
    // the upper side a taken, and the upper side b's kicker holding a rank it cannot have: drawn locked
    const env = show(warrior({ ...TRUNK, "warrior.t2b": 1 }));
    const i = env.view.nodes.findIndex((n) => n.id === "warrior.t2b");
    expect(env.view.nodes[i].state).toBe("locked");
    expect(env.view.nodes[i].rank).toBe(1);
    expect(env.image("warrior.t2b").tints).toEqual([GREYED.idle.tint]);
    const { rect } = env.layout.plates[i];
    expect(halos(env.plates).some((c) => c.x === rect.x + rect.width / 2 && c.y === rect.y + rect.height / 2)).toBe(false);
  });

  it("should glow each lit plate in its hue: stacked discs after its fill and edge, inside its edge line, brightest at the centre", () => {
    const env = show(TRUNK_HELD);
    const lit = env.view.nodes.map((n, i) => [n, env.layout.plates[i]] as const).filter(([n]) => n.state === "held" || n.state === "max");
    expect(lit).toHaveLength(3);
    const discs = halos(env.plates);
    expect(discs).toHaveLength(3 * TREE_HALO.discs);
    for (const [node, { rect }] of lit) {
      const [cx, cy] = [rect.x + rect.width / 2, rect.y + rect.height / 2];
      const mine = discs.filter((c) => c.x === cx && c.y === cy);
      expect(mine, node.id).toHaveLength(TREE_HALO.discs);
      for (const c of mine) expect(c.fill![0]).toBe(palette.treeHue[node.hue!]);
      // inside the edge line (a max node's is 2 px wide), shrinking to 0.4 of the first
      const radii = mine.map((c) => c.r);
      expect(radii[0]).toBeLessThanOrEqual(rect.width / 2 - 1);
      expect(radii.every((r, k) => k === 0 || r < radii[k - 1])).toBe(true);
      expect(radii.at(-1)! / radii[0]).toBeCloseTo(TREE_HALO.inner, 6);
    }
    // the stacked discs come to about the halo's alpha at the centre
    expect(1 - (1 - haloDiscAlpha()) ** TREE_HALO.discs).toBeCloseTo(TREE_HALO.alpha, 6);
    // each plate's halo after its edge: the plates' ops run fill, fill, stroke, then the discs
    const ops = env.plates.ops.filter((o) => o === "fillCircle" || o === "strokeCircle" || o === "fillRoundedRect" || o === "strokeRoundedRect");
    const r1 = env.view.nodes.findIndex((n) => n.id === "warrior.r1");
    expect(r1).toBe(0);
    expect(ops.slice(0, 3 + TREE_HALO.discs)).toEqual(["fillCircle", "fillCircle", "strokeCircle", ...Array(TREE_HALO.discs).fill("fillCircle")]);
  });

  it("should glow no open or greyed node, and never in amber or the edge's brass", () => {
    expect(halos(show(warrior()).plates)).toHaveLength(0);
    expect(halos(show(warrior({}, 0)).plates)).toHaveLength(0);
    for (const c of halos(show(TRUNK_HELD).plates)) {
      expect([palette.interactable, palette.interactableBright, palette.frame, palette.frameBright]).not.toContain(c.fill![0]);
    }
  });

  it("should glow every hue clear of the edge's brass and of amber, by a measured distance (L11)", () => {
    // a halo stands in its hue (the test above) just inside a held plate's brass edge or a max plate's
    // bright brass; it must not read as either, nor as amber. The floor is a little over the tightest
    // pair the tree's own lit inks keep (health and fire, 5.7 OKLab units, ADR-0089).
    const FLOOR = 0.06;
    const near = { frame: palette.frame, frameBright: palette.frameBright, interactable: palette.interactable, interactableBright: palette.interactableBright };
    for (const [hue, value] of Object.entries(palette.treeHue)) {
      for (const [token, other] of Object.entries(near)) expect(okLabDistance(value, other), `${hue} against ${token}`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  it("should draw a lit node's halo, and its lines in the lit tint, where the scene makes no textures", () => {
    // the plain stand-in makes no textures: every picture falls back to its lines
    const env = show(TRUNK_HELD, { ...stage(), images: [] });
    expect(halos(env.plates)).toHaveLength(3 * TREE_HALO.discs);
    for (const hue of ["health", "power", "speed"] as const) expect(env.plates.inks).toContain(treeLitInk(palette.treeHue[hue]).idle.tint);
    // the open nodes' lines stay near-white, the closed ones faint
    expect(env.plates.inks).toContain(palette.hudText);
    expect(env.plates.inks).toContain(palette.hudFaint);
  });

  it("should change no picture under the pointer, ring it, and make no new picture", () => {
    const env = show(TRUNK_HELD);
    const before = env.images.map((t) => [...t.tints, t.alpha]);
    const p = env.layout.plates[0].rect;
    env.overlay.pointerMove(p.x + p.width / 2, p.y + p.height / 2);
    expect(env.images.map((t) => [...t.tints, t.alpha])).toEqual(before);
    expect(env.images).toHaveLength(before.length);
    const ring = env.live().find((m) => m.kind === "graphics" && m.depth === LOCK_DEPTH + 1)!;
    expect(ring.ops).toContain("strokeCircle");
  });

  it("should add no filter to anything it draws", () => {
    const env = show(TRUNK_HELD);
    for (const m of env.made) expect(m.ops.some((o) => /filter|glow/i.test(o)), m.kind).toBe(false);
  });
});

describe("one node's plate drawn with a previewed look (FS-8RZ51 §Change: A lit node glows in its own colour, L13; I-8RZ51-23)", () => {
  const view = treeView(warrior({ "warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1 }));
  const layout = treeLayout(viewport, view.nodes, view.links);
  /** A node, by id, with its plate. */
  const nodeOf = (id: string) => {
    const i = view.nodes.findIndex((n) => n.id === id);
    return { node: view.nodes[i], plate: layout.plates[i] };
  };
  /** One node drawn on a fresh plate graphics with no textures, so its picture is in lines. */
  const draw = (id: string, look = TREE_LOOK) => {
    const env = stage();
    const g = (env.scene as unknown as { add: { graphics(): unknown } }).add.graphics();
    const { node, plate } = nodeOf(id);
    drawNodePlate(env.scene, g as never, node, plate, look);
    return env.made[0];
  };

  it("should draw the tree's tuned look by default", () => {
    expect(TREE_LOOK).toEqual({ hues: palette.treeHue, bronzeMix: TREE_BRONZE_MIX, lift: TREE_LIT_LIFT, halo: TREE_HALO });
    const plates = draw("warrior.r1");
    expect(plates.inks).toContain(treeLitInk(palette.treeHue.health).idle.tint);
    expect(plates.circles!.filter((c) => c.fill?.[0] === palette.treeHue.health)).toHaveLength(TREE_HALO.discs);
  });

  it("should recolour only the previewed hue's nodes, with the previewed mix and halo", () => {
    const hue = palette.treeHue.mana;
    const look = { ...TREE_LOOK, hues: { ...TREE_LOOK.hues, health: hue }, bronzeMix: 0.3, halo: { discs: 6, inner: 0.5, alpha: 0.7 } };
    const vitality = draw("warrior.r1", look);
    expect(vitality.inks).toContain(treeLitInk(hue, 0.3).idle.tint);
    const discs = vitality.circles!.filter((c) => c.fill?.[0] === hue);
    expect(discs).toHaveLength(6);
    expect(discs[0].fill![1]).toBeCloseTo(haloDiscAlpha(0.7, 6), 9);
    expect(discs.at(-1)!.r / discs[0].r).toBeCloseTo(0.5, 6);
    // Might wears power: its token, under the previewed mix
    const might = draw("warrior.r2", look);
    expect(might.inks).toContain(treeLitInk(palette.treeHue.power, 0.3).idle.tint);
    expect(might.circles!.filter((c) => c.fill?.[0] === palette.treeHue.power)).toHaveLength(6);
  });

  it("should leave an open and a greyed node's ink alone under any look", () => {
    const look = { ...TREE_LOOK, hues: { ...TREE_LOOK.hues, power: palette.treeHue.mana } };
    const open = draw("warrior.t2a", look);
    expect(nodeOf("warrior.t2a").node.state).toBe("available");
    expect(open.inks).toContain(TREE_INK.idle.tint);
    expect(open.circles?.some((c) => c.fill?.[0] === palette.treeHue.mana)).toBeFalsy();
  });
});
