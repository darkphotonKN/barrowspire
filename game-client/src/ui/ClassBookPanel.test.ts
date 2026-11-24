import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import type { BookPageState } from "@/types/gameState";
import { BOOK_DEPTH, ClassBookPanel } from "./ClassBookPanel";
import { bookLayout } from "./classBookLayout";
import type { BookSource, PageView } from "./classBookModel";

// FS-X2CMM §G R36–R39 (I-X2CMM-10) and §Change: Illuminated pages and the open tome C3–C7 (I-X2CMM-25):
// the book's open tome on a recording stand-in for the UI scene: the title by class, a row per offered
// page with its mark, the right page showing the hovered page or the first ready one, a cooldown sweep
// each frame, the ×, a row's press handed on, and a state flip drawn in place, never built again.

interface Made {
  kind: "text" | "graphics" | "zone" | "container";
  words?: string;
  alpha?: number;
  depth?: number;
  rect?: number[];
  interactive?: boolean;
  children?: Made[];
  ops: string[];
  destroyed: boolean;
}

function stage() {
  const made: Made[] = [];
  const recOf = new Map<unknown, Made>();
  const chain = (rec: Made, extra: Record<string, unknown> = {}) => {
    const self: Record<string, unknown> = new Proxy(extra, {
      get: (t, prop: string) => {
        if (prop in t) return t[prop];
        if (prop === "setDepth") return (d: number) => ((rec.depth = d), self);
        if (prop === "setInteractive") return () => ((rec.interactive = true), self);
        if (prop === "setText") return (w: string) => ((rec.words = w), self);
        if (prop === "setAlpha") return (a: number) => ((rec.alpha = a), self);
        if (prop === "destroy") return () => [rec, ...(rec.children ?? [])].forEach((m) => (m.destroyed = true));
        if (prop === "clear") return () => ((rec.ops = []), self);
        return () => (rec.ops.push(prop), self);
      },
    });
    recOf.set(self, rec);
    made.push(rec);
    return self;
  };
  const scene = {
    add: {
      graphics: () => chain({ kind: "graphics", ops: [], destroyed: false }),
      text: (_x: number, _y: number, words: string) => chain({ kind: "text", words, ops: [], destroyed: false }, { width: words.length * 6, height: 14 }),
      zone: (x: number, y: number, w: number, h: number) => chain({ kind: "zone", rect: [x, y, w, h], ops: [], destroyed: false }),
      container: (_x: number, _y: number, children: unknown[] = []) =>
        chain({ kind: "container", children: children.map((c) => recOf.get(c)!).filter(Boolean), ops: [], destroyed: false }),
    },
  };
  const live = () => made.filter((m) => !m.destroyed);
  const texts = () => live().filter((m) => m.kind === "text" && m.words);
  const words = () => texts().map((m) => m.words!);
  return { scene: scene as never, made, live, texts, words };
}

const page = (id: string, unlock_level: number, cost: number, over: Partial<BookPageState> = {}): BookPageState => ({
  id,
  unlock_level,
  cost,
  cooldown: { remaining: 0, total: 0 },
  spent: false,
  cooldown_length: 0,
  ...over,
});
const mage = (pages: BookPageState[], level = 20, current = 100): BookSource => ({
  class: "mage",
  level,
  resource: { kind: "mana", current, max: 100, ability_cost: 10 },
  book: { pages },
});

function opened(source: BookSource | undefined) {
  const env = stage();
  const dismiss = vi.fn();
  const picked: PageView[] = [];
  const panel = new ClassBookPanel(env.scene, { dismiss, pick: (p) => void picked.push(p) });
  panel.show(source, 0);
  panel.open();
  const layout = bookLayout(viewport, source?.book?.pages.length ?? 0);
  const middle = (i: number) => ({ x: layout.rows[i].box.x + layout.rows[i].box.width / 2, y: layout.rows[i].box.y + layout.rows[i].box.height / 2 });
  return { ...env, panel, dismiss, picked, layout, middle };
}

describe("the class book's open tome (FS-X2CMM R36; §Change: the open tome C3, C4)", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
  });

  it("should draw nothing until it opens, then the book's title by class and its ×", () => {
    const env = stage();
    const panel = new ClassBookPanel(env.scene, { dismiss: () => {}, pick: () => {} });
    panel.show(mage([page("witchlight", 2, 20)]), 0);
    expect(env.made).toEqual([]);
    panel.open();
    expect(env.words()).toContain("Spellbook");
    expect(env.words()).toContain("×");
  });

  it("should stand its interactive ground over the whole spread in the windows' band, so a press on it never reaches the world", () => {
    const { live, layout } = opened(mage([page("witchlight", 2, 20)]));
    const ground = live().find((m) => m.kind === "zone")!;
    const { panel } = layout;
    expect(ground.rect).toEqual([panel.x, panel.y, panel.width, panel.height]);
    expect(ground.interactive).toBe(true);
    expect(ground.depth).toBe(BOOK_DEPTH);
    expect(BOOK_DEPTH).toBeGreaterThanOrEqual(1100);
    expect(BOOK_DEPTH).toBeLessThan(1800);
  });

  it("should write a row per page: its name, and its cost, its level while locked (faint) or 'spent'", () => {
    const env = opened(mage([page("witchlight", 2, 20), page("levitate", 9, 35), page("recall", 17, 50, { spent: true })], 10));
    expect(env.words()).toEqual(expect.arrayContaining(["Witchlight", "20 mana", "Levitate", "35 mana", "Recall", "Lv 17"]));
    expect(env.texts().find((t) => t.words === "Lv 17")!.alpha).toBeCloseTo(0.55, 2);
    expect(env.texts().find((t) => t.words === "Recall")!.alpha).toBeCloseTo(0.55, 2);
    expect(env.texts().find((t) => t.words === "Levitate")!.alpha).toBe(1);
    const spent = opened(mage([page("recall", 17, 50, { spent: true })], 20));
    expect(spent.words()).toContain("spent");
  });

  it("should read an empty Ledger as the spec words it, its right page blank", () => {
    const { words } = opened({ class: "mercenary", level: 20, book: { pages: [] } });
    expect(words()).toEqual(expect.arrayContaining(["The Ledger", "The Ledger is not yet written."]));
    expect(words().some((w) => w.startsWith("Click"))).toBe(false);
  });

  it("should sweep a recovering page each frame, its row's roundel and the right page's, and nothing over a ready one", () => {
    const env = opened(mage([page("witchlight", 2, 20, { cooldown: { remaining: 10, total: 45 } }), page("levitate", 9, 35)]));
    // the right page shows the first ready page, levitate: only witchlight's row is swept
    env.panel.frame(500);
    const sweep = () => env.live().find((m) => m.kind === "graphics" && m.depth === BOOK_DEPTH + 3)!;
    expect(sweep().ops.filter((op) => op === "fillPoints")).toHaveLength(1);
    env.panel.pointerMove(env.middle(0).x, env.middle(0).y);
    env.panel.frame(600);
    expect(sweep().ops.filter((op) => op === "fillPoints")).toHaveLength(2);
    env.panel.show(mage([page("witchlight", 2, 20), page("levitate", 9, 35)]), 700);
    env.panel.frame(800);
    expect(sweep().ops).not.toContain("fillPoints");
  });
});

describe("the open tome's right page (§Change: the open tome C5)", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => void vi.restoreAllMocks());

  it("should show the first ready page with no hover, and the hovered page in full under the pointer", () => {
    const env = opened(mage([page("witchlight", 2, 20, { cooldown: { remaining: 5, total: 45 }, cooldown_length: 45 }), page("levitate", 9, 35, { cooldown_length: 90 })]));
    expect(env.words()).toEqual(expect.arrayContaining(["35 mana · 90 s cooldown", "Click to arm, then pick an ally or yourself."]));
    env.panel.pointerMove(env.middle(0).x, env.middle(0).y);
    expect(env.words()).toEqual(
      expect.arrayContaining(["A pale flame hung where you point. The dark gives back what it hid.", "20 mana · 45 s cooldown", "Recovering."]),
    );
    expect(env.words()).not.toContain("35 mana · 90 s cooldown");
    env.panel.pointerMove(env.layout.panel.x + 4, env.layout.panel.y + 4);
    expect(env.words()).toContain("35 mana · 90 s cooldown");
  });

  it("should give a Scar its scar and where it was earned", () => {
    const env = opened({ class: "warrior", level: 20, resource: { kind: "stamina", current: 100, max: 100, ability_cost: 10 }, book: { pages: [page("hardened", 9, 30)] } });
    expect(env.words()).toEqual(expect.arrayContaining(["Scars", "Hardened", "Scar of the Pit", "Got in the stake pit under Low Cairn. The stakes broke first.", "Click to cast."]));
  });

  it("should show the first page while every page is locked, with the level it is learned at", () => {
    const env = opened(mage([page("levitate", 9, 35), page("recall", 17, 50)], 3));
    expect(env.words()).toContain("Learned at level 9.");
  });

  it("should stand blank while no page is ready and none is hovered", () => {
    const env = opened(mage([page("witchlight", 2, 20, { cooldown: { remaining: 5, total: 45 } }), page("recall", 17, 50)], 3));
    expect(env.words().filter((w) => w.includes("·"))).toEqual([]);
  });
});

describe("the open tome redraws a state flip in place (§Change: the open tome C7)", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => void vi.restoreAllMocks());

  it("should make and take down nothing as a page's state flips, a cooldown ending, a cast, the resource crossing a cost", () => {
    const env = opened(mage([page("witchlight", 2, 20, { cooldown: { remaining: 10, total: 45 } }), page("levitate", 9, 35)], 8));
    const before = env.made.length;
    // a cooldown's tick, then its end, then the resource under a cost, then a level crossing an unlock
    env.panel.show(mage([page("witchlight", 2, 20, { cooldown: { remaining: 9, total: 45 } }), page("levitate", 9, 35)], 8), 1000);
    env.panel.show(mage([page("witchlight", 2, 20), page("levitate", 9, 35)], 8), 2000);
    env.panel.show(mage([page("witchlight", 2, 20), page("levitate", 9, 35)], 8, 5), 3000);
    env.panel.show(mage([page("witchlight", 2, 20), page("levitate", 9, 35)], 9), 4000);
    expect(env.made.length).toBe(before);
    expect(env.made.filter((m) => m.destroyed)).toEqual([]);
    // and what it shows is the new state's
    expect(env.words()).toContain("35 mana");
    expect(env.words()).not.toContain("Lv 9");
    expect(env.texts().find((t) => t.words === "Levitate")!.alpha).toBe(1);
  });

  it("should make and take down nothing as the pointer moves from row to row", () => {
    const env = opened(mage([page("witchlight", 2, 20), page("levitate", 9, 35)]));
    const before = env.made.length;
    env.panel.pointerMove(env.middle(1).x, env.middle(1).y);
    env.panel.pointerMove(env.middle(0).x, env.middle(0).y);
    env.panel.pointerMove(2, 2);
    expect(env.made.length).toBe(before);
    expect(env.made.filter((m) => m.destroyed)).toEqual([]);
  });

  it("should build again only as the pages it holds change", () => {
    const env = opened(mage([page("witchlight", 2, 20)]));
    const before = env.made.length;
    env.panel.show(mage([page("witchlight", 2, 20), page("levitate", 9, 35)]), 1000);
    expect(env.made.length).toBeGreaterThan(before);
    expect(env.words()).toContain("Levitate");
  });
});

describe("the open tome's pointer (FS-X2CMM R39; §Change: the open tome C6)", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => void vi.restoreAllMocks());

  it("should hand a row's press on, and take every press on the spread, never one off it", () => {
    const env = opened(mage([page("witchlight", 2, 20), page("levitate", 9, 35)]));
    expect(env.panel.pointerDown(env.middle(1).x, env.middle(1).y)).toBe(true);
    expect(env.picked.map((p) => p.id)).toEqual(["levitate"]);
    // the right page, and the binding, take the press and hand nothing on
    expect(env.panel.pointerDown(env.layout.right.x + 40, env.layout.right.y + env.layout.right.height - 20)).toBe(true);
    expect(env.panel.pointerDown(env.layout.panel.x + 3, env.layout.panel.y + 3)).toBe(true);
    expect(env.picked).toHaveLength(1);
    expect(env.panel.pointerDown(2, 2)).toBe(false);
  });

  it("should close through its × and take the press", () => {
    const env = opened(mage([page("witchlight", 2, 20)]));
    const x = env.layout.close;
    expect(env.panel.pointerDown(x.x + 4, x.y + 4)).toBe(true);
    expect(env.dismiss).toHaveBeenCalledOnce();
    expect(env.picked).toEqual([]);
  });

  it("should take everything down as it closes", () => {
    const env = opened(mage([page("witchlight", 2, 20)]));
    env.panel.pointerMove(env.middle(0).x, env.middle(0).y);
    env.panel.close();
    expect(env.live()).toEqual([]);
    expect(env.panel.isOpen()).toBe(false);
  });
});
