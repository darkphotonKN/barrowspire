import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import type { BookPageState } from "@/types/gameState";
import { BOOK_DEPTH, ClassBookPanel } from "./ClassBookPanel";
import { bookLayout } from "./classBookLayout";
import type { BookSource, PageView } from "./classBookModel";
import { frameClose } from "./panelFrame";

// FS-X2CMM §G R36–R39 (I-X2CMM-10): the book's window on a recording stand-in for the UI scene: the
// windows' frame and title by class, the leaf and a roundel per offered page, captions for locked and
// spent pages, a cooldown sweep each frame, the hover tip, the × and a page's press handed on.

interface Made {
  kind: "text" | "graphics" | "zone" | "container";
  words?: string;
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
  const words = () => live().filter((m) => m.kind === "text").map((m) => m.words!);
  return { scene: scene as never, made, live, words };
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
const mage = (pages: BookPageState[], level = 20): BookSource => ({
  class: "mage",
  level,
  resource: { kind: "mana", current: 100, max: 100, ability_cost: 10 },
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
  const middle = (i: number) => ({ x: layout.pages[i].x + layout.pages[i].width / 2, y: layout.pages[i].y + layout.pages[i].height / 2 });
  return { ...env, panel, dismiss, picked, layout, middle };
}

describe("the class book's window (FS-X2CMM R36, R37)", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
  });

  it("should draw nothing until it opens, then the windows' title by class and its ×", () => {
    const env = stage();
    const panel = new ClassBookPanel(env.scene, { dismiss: () => {}, pick: () => {} });
    panel.show(mage([page("witchlight", 2, 20)]), 0);
    expect(env.made).toEqual([]);
    panel.open();
    expect(env.words()).toContain("SPELLBOOK");
    expect(env.words()).toContain("×");
  });

  it("should stand its interactive ground over its panel in the windows' band, so a press on it never reaches the world", () => {
    const { live, layout } = opened(mage([page("witchlight", 2, 20)]));
    const ground = live().find((m) => m.kind === "zone")!;
    const { panel } = layout;
    expect(ground.rect).toEqual([panel.x, panel.y, panel.width, panel.height]);
    expect(ground.interactive).toBe(true);
    expect(ground.depth).toBe(BOOK_DEPTH);
    expect(BOOK_DEPTH).toBeGreaterThanOrEqual(1100);
    expect(BOOK_DEPTH).toBeLessThan(1800);
  });

  it("should caption a locked page with its level and a spent one 'spent', and nothing under a ready one", () => {
    const { words } = opened(mage([page("witchlight", 2, 20), page("levitate", 9, 35), page("recall", 17, 50, { spent: true })], 10));
    expect(words()).toContain("Lv 17");
    expect(words()).not.toContain("Lv 2");
    // recall is locked at level 10: its level, not its spent use
    const spent = opened(mage([page("recall", 17, 50, { spent: true })], 20));
    expect(spent.words()).toContain("spent");
  });

  it("should read an empty Ledger as the spec words it", () => {
    const { words } = opened({ class: "mercenary", level: 20, book: { pages: [] } });
    expect(words()).toContain("THE LEDGER");
    expect(words()).toContain("The Ledger is not yet written.");
  });

  it("should draw again as a page's state changes, and not for a cooldown's seconds", () => {
    const env = opened(mage([page("witchlight", 2, 20, { cooldown: { remaining: 10, total: 45 } })]));
    const before = env.made.length;
    env.panel.show(mage([page("witchlight", 2, 20, { cooldown: { remaining: 9, total: 45 } })]), 1000);
    expect(env.made.length).toBe(before);
    env.panel.show(mage([page("witchlight", 2, 20)]), 2000);
    expect(env.made.length).toBeGreaterThan(before);
  });

  it("should sweep a recovering page each frame, and nothing over a ready one", () => {
    const env = opened(mage([page("witchlight", 2, 20, { cooldown: { remaining: 10, total: 45 } }), page("levitate", 9, 35)]));
    env.panel.frame(500);
    const sweeps = env.live().filter((m) => m.kind === "graphics" && m.depth === BOOK_DEPTH + 3);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].ops.filter((op) => op === "fillPoints")).toHaveLength(1);
    env.panel.show(mage([page("witchlight", 2, 20), page("levitate", 9, 35)]), 600);
    env.panel.frame(700);
    const now = env.live().filter((m) => m.kind === "graphics" && m.depth === BOOK_DEPTH + 3);
    expect(now[0].ops).not.toContain("fillPoints");
  });
});

describe("the class book's pointer (FS-X2CMM R37, R39)", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show a page's name, line, cost and cooldown under the pointer, and take it away off it", () => {
    const env = opened(mage([page("witchlight", 2, 20, { cooldown_length: 45 })]));
    const m = env.middle(0);
    env.panel.pointerMove(m.x, m.y);
    expect(env.words()).toContain("Witchlight");
    expect(env.words()).toContain("Cost: 20 mana");
    expect(env.words()).toContain("Cooldown: 45 s");
    env.panel.pointerMove(env.layout.panel.x + 4, env.layout.panel.y + 4);
    expect(env.words()).not.toContain("Witchlight");
  });

  it("should hand a page's press on, and take every press on its panel, never one off it", () => {
    const env = opened(mage([page("witchlight", 2, 20)]));
    const m = env.middle(0);
    expect(env.panel.pointerDown(m.x, m.y)).toBe(true);
    expect(env.picked.map((p) => p.id)).toEqual(["witchlight"]);
    expect(env.panel.pointerDown(env.layout.panel.x + 4, env.layout.panel.y + env.layout.panel.height - 4)).toBe(true);
    expect(env.picked).toHaveLength(1);
    expect(env.panel.pointerDown(2, 2)).toBe(false);
  });

  it("should close through its × and take the press", () => {
    const env = opened(mage([page("witchlight", 2, 20)]));
    const x = frameClose(env.layout.panel);
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
