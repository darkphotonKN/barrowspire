import { EventEmitter } from "events";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type Phaser from "phaser";

import type { SettlementPayload } from "@/assets/types/client";
import { palette } from "@/utils/canvasPalette";
import {
  RECORD_DEPTH,
  RECORD_W,
  SettlementRecord,
  recordAreaHeight,
  recordColumnRows,
  recordContentHeight,
  recordRowSpot,
  recordScroll,
  recordSectionHeight,
  recordThumb,
} from "./SettlementRecord";
import { drawPanelTitle } from "./panelFrame";

// The shared title drawing, watched (FS-3EBCA R20).
vi.mock("./panelFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("./panelFrame")>();
  return { ...real, drawPanelTitle: vi.fn(real.drawPanelTitle) };
});
import { settlementRecord } from "./settlement";
import { fillMaskArea, maskInView, viewport } from "@/render/viewport";

// The record's one mask, watched: laid on a stand-in, it is only counted (ADR-0057 §Masks).
vi.mock("@/render/viewport", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/render/viewport")>();
  return {
    ...real,
    maskInView: vi.fn(),
    fillMaskArea: vi.fn(real.fillMaskArea),
  };
});

// FS-GV8WN §G R21: the record as a scene draws it, on a recording stand-in for the Phaser scene.

interface Made {
  kind: string;
  args: unknown[];
  destroyed: boolean;
  /** Each method's last call. */
  calls: Record<string, unknown[]>;
  /** Every call, in order. */
  log: [string, unknown[]][];
  handlers: Record<string, (...a: unknown[]) => void>;
  name?: string;
  /** What a Layer holds (`add`). */
  children: unknown[];
  /** The object the record holds: the stand-in itself. */
  self?: unknown;
}

function fakeScene() {
  const made: Made[] = [];
  const make = (kind: string, args: unknown[]): unknown => {
    const rec: Made = {
      kind,
      args,
      destroyed: false,
      calls: {},
      log: [],
      handlers: {},
      children: [],
    };
    made.push(rec);
    const proxy: unknown = new Proxy(rec, {
      get(target, prop) {
        if (prop in target) return target[prop as keyof Made];
        if (prop === "then") return undefined;
        if (prop === "destroy")
          return () => {
            target.destroyed = true;
            if (kind === "container")
              (target.args[2] as Made[] | undefined)?.forEach(
                (c) => (c.destroyed = true),
              );
            // a Layer destroys what it holds (Phaser 4.2.1 Layer#destroy)
            if (kind === "layer")
              (target.children as Made[]).forEach((c) => (c.destroyed = true));
          };
        if (prop === "on")
          return (event: string, fn: (...a: unknown[]) => void) => {
            target.handlers[event] = fn;
            return proxy;
          };
        if (prop === "add" && kind === "layer")
          return (child: unknown) => {
            target.children.push(child);
            return proxy;
          };
        if (prop === "setText")
          return (content: string) => {
            target.args[2] = content;
            target.calls.setText = [content];
            return proxy;
          };
        if (prop === "setName")
          return (name: string) => {
            target.name = name;
            return proxy;
          };
        return (...a: unknown[]) => {
          target.calls[String(prop)] = a;
          target.log.push([String(prop), a]);
          return proxy;
        };
      },
    });
    rec.self = proxy;
    return proxy;
  };
  const add = new Proxy(
    {},
    {
      get:
        (_, kind) =>
        (...a: unknown[]) =>
          make(String(kind), a),
    },
  );
  const events = new EventEmitter();
  const camera = { originX: 0, originY: 0 };
  const scene = {
    add,
    make: { graphics: (...a: unknown[]) => make("maskShape", a) },
    cameras: { main: camera },
    events,
  } as unknown as Phaser.Scene;
  const live = () => made.filter((m) => !m.destroyed);
  const texts = () =>
    live()
      .filter((m) => m.kind === "text")
      .map((m) => String(m.args[2]));
  const textMade = (content: string) =>
    live().find((m) => m.kind === "text" && m.args[2] === content);
  const hit = (name: string) => live().find((m) => m.name === name);
  const layers = () => live().filter((m) => m.kind === "layer");
  /** Where an object stands on the screen now: in its container, or where it was put. */
  const at = (m: Made): [number, number] => {
    const [x, y] = (m.calls.setPosition ?? m.args.slice(0, 2)) as number[];
    const holder = live().find(
      (c) =>
        c.kind === "container" && (c.args[2] as unknown[]).includes(m.self),
    );
    if (!holder) return [x, y];
    const [hx, hy] = holder.args as number[];
    return [hx + x, hy + y];
  };
  /** Every live text and where it stands, in a fixed order. */
  const placed = () =>
    live()
      .filter((m) => m.kind === "text")
      .map((m) => [String(m.args[2]), ...at(m)] as const)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  /** A wheel over a hit area: `dy` down, and whether the event was stopped. */
  const wheel = (name: string, dy: number) => {
    const stop = vi.fn();
    hit(name)!.handlers.wheel?.({ x: 0, y: 0 }, 0, dy, 0, {
      stopPropagation: stop,
    });
    return stop;
  };
  return {
    scene,
    made,
    live,
    texts,
    textMade,
    hit,
    layers,
    at,
    placed,
    wheel,
    events,
    camera,
  };
}

const item = (name: string) => ({
  item_id: name,
  entity_id: name,
  name,
  quantity: 1,
});

const pending: SettlementPayload = {
  outcome: "died",
  carried: [item("Iron Blade"), { ...item("Bone Ring"), found: true }],
  lost: [
    { ...item("Runed Axe"), reason: "unsafe" },
    { ...item("Health Potion"), reason: "consumed" },
  ],
  experience_gained: 40,
  level_before: 2,
  level_after: 3,
  kills: 4,
  seconds_in_run: 95,
  status: "pending",
};
const confirmed: SettlementPayload = { ...pending, status: "confirmed" };

// Every record a test builds, closed after it: an open record keeps a listener on the one
// `viewport`, and would hear the next test's render scale.
const built: SettlementRecord[] = [];
afterEach(() => {
  built.splice(0).forEach((record) => record.close());
});

function tracked(...args: ConstructorParameters<typeof SettlementRecord>) {
  const record = new SettlementRecord(...args);
  built.push(record);
  return record;
}

function opened(onClose = vi.fn()) {
  const stage = fakeScene();
  const record = tracked(stage.scene, { x: 540, bottom: 454 }, onClose);
  record.set(settlementRecord(pending));
  record.open();
  return { ...stage, record, onClose };
}

// The owner, 2026-11-12: "每個ui視窗的標題都不同位置 都統一放在中間的樣式好了 大小顏色也一樣", "全大寫也統一":
// the record's heading is a window title like the others (FS-3EBCA R20, R22). I-3EBCA-9.
describe("SettlementRecord's title, shared (FS-3EBCA R20, R22)", () => {
  it("should title the record with the one title drawing, across its whole width, no blackletter", () => {
    const title = vi.mocked(drawPanelTitle);
    title.mockClear();
    const { texts } = opened();
    expect(title).toHaveBeenCalledTimes(1);
    const [, panel, words] = title.mock.calls[0];
    expect(panel).toMatchObject({ x: 0, y: 0, width: RECORD_W });
    expect(words).toBe("Fallen in the barrow");
    expect(texts()).not.toContain("Fallen in the barrow");
  });
});

describe("SettlementRecord (FS-GV8WN R21)", () => {
  it("should show the outcome, status, carried and lost with their marks, and what was earned", () => {
    const { texts, record } = opened();
    expect(record.isOpen()).toBe(true);
    for (const line of [
      // in the windows' one title style, in capitals (FS-3EBCA R20, R22)
      "FALLEN IN THE BARROW",
      "Settling…",
      "Iron Blade",
      "Bone Ring",
      "Found",
      "Runed Axe",
      "Kept by the barrow",
      "Health Potion",
      "Used up",
      "Experience +40 · Risen to level 3",
      "Slain 4 · 1:35 in the delve",
    ])
      expect(texts()).toContain(line);
  });

  it("should colour a find left in the barrow apart from an item used up", () => {
    const { textMade } = opened();
    const colour = (content: string) =>
      (textMade(content)!.args[3] as { color: string }).color;
    expect(colour("Kept by the barrow")).not.toBe(colour("Used up"));
    expect(colour("Found")).not.toBe(colour("Kept by the barrow"));
  });

  it("should stand clear above its anchor, in the popup band, fixed to the screen", () => {
    const { live } = opened();
    const panel = live().find((m) => m.kind === "container")!;
    const [, top] = panel.args as number[];
    expect(top).toBeGreaterThanOrEqual(0);
    expect(panel.calls.setDepth).toEqual([RECORD_DEPTH]);
    expect(panel.calls.setScrollFactor).toEqual([0]);
    const frame = live().find(
      (m) => m.kind === "graphics" && m.calls.lineStyle?.[1] === palette.frame,
    );
    expect(frame).toBeDefined();
  });

  it("should take its height from its content, its bottom on the anchor", () => {
    const { live } = opened();
    const panel = live().find((m) => m.kind === "container")!;
    const blocker = live().find((m) => m.name === "settlement-record")!;
    const [, centreY, , height] = blocker.args as number[];
    expect(centreY - height / 2).toBe(panel.args[1]);
    expect(centreY + height / 2).toBe(454);
  });

  it("should close on its amber Close button, and tell its owner", () => {
    const { hit, record, onClose, live } = opened();
    const close = hit("close-the-record")!;
    const face = live().find(
      (m) =>
        m.kind === "graphics" &&
        m.calls.fillStyle?.[0] === palette.interactable,
    );
    expect(face).toBeDefined();
    close.handlers.pointerdown();
    expect(onClose).toHaveBeenCalledTimes(1);
    record.close();
    expect(record.isOpen()).toBe(false);
    expect(live()).toHaveLength(0);
  });

  it("should swallow a click on its panel, so nothing under it answers", () => {
    const { live } = opened();
    const blocker = live().find(
      (m) => m.kind === "rectangle" && m.name === "settlement-record",
    )!;
    expect(blocker.calls.setInteractive).toBeDefined();
    expect(blocker.calls.setDepth).toEqual([RECORD_DEPTH]);
  });

  // R20: confirmation re-sends the same content; only the status line moves
  it("should change only the status line when the confirmed copy arrives while open", () => {
    const { record, made, texts, textMade } = opened();
    const before = made.length;
    const status = textMade("Settling…")!;
    record.set(settlementRecord(confirmed));
    expect(made.length).toBe(before);
    expect(status.args[2]).toBe("Settled");
    expect(texts()).not.toContain("Settling…");
  });

  it("should draw nothing while closed, and the latest copy when opened again", () => {
    const { record, texts } = opened();
    record.close();
    record.set(settlementRecord(confirmed));
    expect(texts()).toHaveLength(0);
    record.open();
    expect(texts()).toContain("Settled");
    expect(texts()).toContain("Iron Blade");
  });

  it("should open once, not stack a second panel", () => {
    const { record, live } = opened();
    record.open();
    expect(live().filter((m) => m.kind === "container")).toHaveLength(1);
  });

  it("should say so when nothing came home, and leave out an empty lost list", () => {
    const stage = fakeScene();
    const record = tracked(stage.scene, { x: 540, bottom: 454 }, vi.fn());
    record.set(settlementRecord({ ...pending, carried: [], lost: [] }));
    record.open();
    expect(stage.texts()).toContain("Nothing came home");
    expect(stage.texts().some((t) => /^LOST$/.test(t))).toBe(false);
  });
});

describe("SettlementRecord at another logical width (FS-ZAJMH R13)", () => {
  it("should stand an open record, and its hit areas, at its new anchor, still open with the same content", () => {
    const { record, live, hit, texts } = opened();
    const before = texts();
    record.relayout({ x: 640, bottom: 454 });
    expect(record.isOpen()).toBe(true);
    expect(texts()).toEqual(before);
    const panel = live().filter((m) => m.kind === "container");
    expect(panel).toHaveLength(1);
    expect(panel[0].args[0]).toBe(640 - RECORD_W / 2);
    const blocker = live().find((m) => m.kind === "rectangle")!;
    expect(blocker.args[0]).toBe(640);
    expect(hit("close-the-record")?.args[0]).toBe(640);
  });

  it("should take the new anchor while closed, and open there", () => {
    const { record, live } = opened();
    record.close();
    record.relayout({ x: 640, bottom: 454 });
    expect(record.isOpen()).toBe(false);
    record.open();
    expect(live().find((m) => m.kind === "rectangle")!.args[0]).toBe(640);
  });
});

// FS-GV8WN §Change: The settlement record scrolls S2–S4, S7: where the rows stand, how tall the
// scroll area is, and the thumb.
describe("the settlement record's layout (FS-GV8WN §Change: The settlement record scrolls)", () => {
  it.each([
    [0, 4],
    [3, 4],
    [8, 4],
    [9, 5],
    [11, 6],
    [20, 10],
  ])("should put %i rows' first column at %i rows", (n, first) => {
    expect(recordColumnRows(n)).toBe(first);
  });

  it("should fill the columns top to bottom, then the second", () => {
    const spots = (n: number) =>
      Array.from({ length: n }, (_, i) => recordRowSpot(i, n));
    expect(spots(9).map((s) => s.column)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1]);
    expect(spots(9).map((s) => s.row)).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3]);
    expect(spots(11).filter((s) => s.column === 0)).toHaveLength(6);
    expect(spots(11).filter((s) => s.column === 1)).toHaveLength(5);
    expect(spots(6).map((s) => [s.column, s.row])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
    ]);
  });

  it.each([
    // heading 20, the column's rows 20 each, 8 after; the empty line is one row
    [0, 48],
    [2, 68],
    [4, 108],
    [8, 108],
    [9, 128],
    [11, 148],
  ])("should make a section of %i rows %i px tall", (n, height) => {
    expect(recordSectionHeight(n)).toBe(height);
  });

  it("should leave an empty LOST out of the content, and keep the carried line", () => {
    const rows = (n: number) =>
      Array.from({ length: n }, () => ({ name: "x" }));
    expect(recordContentHeight({ carried: [], lost: [] })).toBe(48);
    expect(recordContentHeight({ carried: rows(8), lost: rows(8) })).toBe(216);
    expect(recordContentHeight({ carried: rows(11), lost: rows(3) })).toBe(
      148 + 88,
    );
  });

  it.each([
    // content, anchor bottom, area
    [48, 454, 48],
    [216, 454, 216],
    [400, 454, 216],
    // the panel would rise past 8 px from the top: 300 − 8 − 198
    [400, 300, 94],
    // never less than a row
    [400, 100, 20],
  ])(
    "should make the area of %i px content over an anchor at %i px %i px tall",
    (content, bottom, area) => {
      expect(recordAreaHeight(content, bottom)).toBe(area);
    },
  );

  it.each([
    [-24, 0],
    [0, 0],
    [24, 24],
    [100, 84],
    [500, 84],
  ])(
    "should clamp an offset of %i to %i, the content 300 in a 216 area",
    (offset, kept) => {
      expect(recordScroll(offset, 300, 216)).toBe(kept);
    },
  );

  it("should keep a fitting area at 0 whatever is asked", () => {
    expect(recordScroll(48, 216, 216)).toBe(0);
    expect(recordScroll(24, 48, 48)).toBe(0);
  });

  it("should draw no thumb while the content fits", () => {
    expect(recordThumb(216, 216, 0)).toBeNull();
    expect(recordThumb(48, 48, 0)).toBeNull();
  });

  it("should size and place the thumb by the share in view and the share scrolled, in the right padding", () => {
    const area = { top: 90, height: 216 };
    const top = recordThumb(area.height, 432, 0)!;
    expect(top.width).toBe(4);
    // clear of the marks, which end at RECORD_W − 24
    expect(top.x).toBeGreaterThanOrEqual(RECORD_W - 24);
    expect(top.x + top.width).toBeLessThanOrEqual(RECORD_W);
    expect(top).toMatchObject({ y: 0, height: 108 });
    expect(recordThumb(area.height, 432, 216)).toMatchObject({
      y: 108,
      height: 108,
    });
    expect(recordThumb(area.height, 432, 108)).toMatchObject({ y: 54 });
    // never shorter than 16 px
    expect(recordThumb(216, 216 * 40, 0)!.height).toBe(16);
    expect(recordThumb(216, 216 * 40, 216 * 39)!.y).toBe(200);
  });
});

/** A settlement of `carried` items home (every other one found) and `lost` left in the barrow. */
const listed = (carried: number, lost: number): SettlementPayload => ({
  ...pending,
  carried: Array.from({ length: carried }, (_, i) => ({
    ...item(`Carried ${i}`),
    found: i % 2 === 1,
  })),
  lost: Array.from({ length: lost }, (_, i) => ({
    ...item(`Lost ${i}`),
    reason: i % 2 === 0 ? ("unsafe" as const) : ("consumed" as const),
  })),
});

/**
 * Where the record drew each text, and how tall, before it scrolled (≤ 8 rows a section): the
 * fixed layout of FS-GV8WN R21, written out as it was, at an anchor of (540, 454).
 */
function before(payload: SettlementPayload) {
  const view = settlementRecord(payload);
  const out: [string, number, number][] = [];
  let y = 90;
  const section = (
    title: string,
    rows: typeof view.carried,
    empty?: string,
  ) => {
    out.push([title, 24, y]);
    y += 20;
    if (rows.length === 0) {
      out.push([empty!, 24, y]);
      y += 28;
      return;
    }
    rows.forEach((row, i) => {
      const x = 24 + Math.floor(i / 4) * 248;
      out.push([row.name, x, y + (i % 4) * 20]);
      if (row.mark) out.push([row.mark.text, x + 224, y + (i % 4) * 20 + 1]);
    });
    y += Math.min(rows.length, 4) * 20 + 8;
  };
  out.push(["Settling…", 260, 60]);
  section("CARRIED HOME", view.carried, "Nothing came home");
  if (view.lost.length > 0) section("LOST", view.lost);
  y += 4;
  out.push([view.earned, 260, y]);
  out.push([view.delve, 260, y + 22]);
  const closeY = y + 52 + 17;
  const height = closeY + 35;
  out.push(["CLOSE", 260, closeY]);
  out.push([view.title.toUpperCase(), 260, 14]);
  const top = 454 - height;
  return {
    height,
    texts: out
      .map(([t, x, ty]) => [t, 280 + x, top + ty] as const)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

describe("SettlementRecord of up to 8 rows a section (FS-GV8WN §Change: The settlement record scrolls S2)", () => {
  it.each([
    [0, 0],
    [2, 2],
    [3, 0],
    [4, 4],
    [6, 1],
    [8, 8],
  ])(
    "should draw a record of %i carried and %i lost exactly as before",
    (carried, lost) => {
      const stage = fakeScene();
      const record = tracked(stage.scene, { x: 540, bottom: 454 }, vi.fn());
      record.set(settlementRecord(listed(carried, lost)));
      record.open();
      const was = before(listed(carried, lost));
      expect(stage.placed()).toEqual(was.texts);
      const blocker = stage.hit("settlement-record")!;
      expect(blocker.args[3]).toBe(was.height);
    },
  );
});

describe("SettlementRecord of a long list (FS-GV8WN §Change: The settlement record scrolls S1–S3)", () => {
  function long(
    carried: number,
    lost: number,
    anchor = { x: 540, bottom: 454 },
  ) {
    const stage = fakeScene();
    const onClose = vi.fn();
    const record = tracked(stage.scene, anchor, onClose);
    record.set(settlementRecord(listed(carried, lost)));
    record.open();
    return { ...stage, record, onClose };
  }

  it("should draw all 14 names of 11 carried and 3 lost, their marks, and no count of the rest", () => {
    const { texts } = long(11, 3);
    for (let i = 0; i < 11; i++) expect(texts()).toContain(`Carried ${i}`);
    for (let i = 0; i < 3; i++) expect(texts()).toContain(`Lost ${i}`);
    expect(texts().filter((t) => t === "Found")).toHaveLength(5);
    expect(texts().filter((t) => t === "Kept by the barrow")).toHaveLength(2);
    expect(texts().filter((t) => t === "Used up")).toHaveLength(1);
    expect(texts().some((t) => /and \d+ more/.test(t))).toBe(false);
  });

  it.each([
    [9, 5],
    [11, 6],
  ])(
    "should lay %i rows in two columns, %i in the first, each top to bottom",
    (n, first) => {
      const { textMade, at } = long(n, 0);
      const spot = (i: number) => at(textMade(`Carried ${i}`)!);
      const [x0, y0] = spot(0);
      for (let i = 0; i < n; i++) {
        const [x, y] = spot(i);
        const column = i < first ? 0 : 1;
        expect(x).toBe(x0 + column * 248);
        expect(y).toBe(y0 + (i - column * first) * 20);
      }
    },
  );
});

describe("SettlementRecord's scroll area (FS-GV8WN §Change: The settlement record scrolls S4, S5)", () => {
  function long(
    carried: number,
    lost: number,
    anchor = { x: 540, bottom: 454 },
  ) {
    const stage = fakeScene();
    const record = tracked(stage.scene, anchor, vi.fn());
    record.set(settlementRecord(listed(carried, lost)));
    record.open();
    const blocker = stage.hit("settlement-record")!;
    const [, centreY, , height] = blocker.args as number[];
    return { ...stage, record, top: centreY - height / 2, height };
  }

  it("should never stand the panel taller than 414 px, its area at most 216, its bottom on the anchor", () => {
    const { top, height } = long(11, 3);
    expect(height).toBe(414);
    expect(top + height).toBe(454);
  });

  it("should keep the panel 8 px below the top of a short view, the area shorter", () => {
    const { top, height } = long(11, 3, { x: 540, bottom: 300 });
    expect(top).toBe(8);
    expect(top + height).toBe(300);
  });

  it("should hold the headings and rows in one Layer, masked once over the area, and leave the rest in the panel", () => {
    vi.mocked(maskInView).mockClear();
    vi.mocked(fillMaskArea).mockClear();
    const { layers, live, textMade, top, camera } = long(11, 3);
    expect(layers()).toHaveLength(1);
    const layer = layers()[0];
    const held = (t: string) => layer.children.includes(textMade(t)!.self);
    for (const t of [
      "CARRIED HOME",
      "LOST",
      "Carried 0",
      "Carried 10",
      "Lost 2",
      "Found",
      "Used up",
    ])
      expect(held(t)).toBe(true);
    for (const t of [
      "Settling…",
      "CLOSE",
      "FALLEN IN THE BARROW",
      "Slain 4 · 1:35 in the delve",
    ])
      expect(held(t)).toBe(false);
    expect(layer.calls.setDepth).toEqual([RECORD_DEPTH]);
    expect(layer.self).toMatchObject({ scrollFactorX: 0, scrollFactorY: 0 });
    for (const t of layer.children as Made[])
      expect(t.calls.setScrollFactor).toEqual([0]);

    const shape = live().find((m) => m.kind === "maskShape")!;
    expect(shape.args).toEqual([{}, false]);
    expect(maskInView).toHaveBeenCalledTimes(1);
    const [target, source, through] = vi.mocked(maskInView).mock.calls[0];
    expect(target).toBe(layer.self);
    expect(source).toBe(shape.self);
    expect(through).toBe(camera);
    const [filled, rect, , scale] = vi.mocked(fillMaskArea).mock.calls.at(-1)!;
    expect(filled).toBe(shape.self);
    expect(rect).toEqual({ x: 280, y: top + 90, width: RECORD_W, height: 216 });
    expect(scale).toBe(viewport.renderScale);
    // the panel itself is never masked: maskInView does not correct a camera-fixed Container
    const panel = live().find((m) => m.kind === "container")!;
    expect(panel.calls.enableFilters).toBeUndefined();
    // the Layer draws above the frame: made after the panel, at its depth
    expect(live().indexOf(layer)).toBeGreaterThan(live().indexOf(panel));
  });

  it("should take the Layer, its texts and the mask's shape down on close", () => {
    const { record, live } = long(11, 3);
    record.close();
    expect(live()).toHaveLength(0);
  });
});

describe("SettlementRecord under the wheel (FS-GV8WN §Change: The settlement record scrolls S6, S7)", () => {
  // 11 carried and 8 lost: 148 + 108 = 256 px of content in a 216 px area, 40 px to scroll
  function long(carried = 11, lost = 8) {
    const stage = fakeScene();
    const record = tracked(stage.scene, { x: 540, bottom: 454 }, vi.fn());
    record.set(settlementRecord(listed(carried, lost)));
    record.open();
    const thumb = () =>
      stage
        .live()
        .find((m) => m.kind === "graphics" && m.calls.setDepth !== undefined)!;
    const where = (t: string) => stage.at(stage.textMade(t)!);
    return { ...stage, record, thumb, where };
  }
  const fixed = [
    "FALLEN IN THE BARROW",
    "Settling…",
    "Experience +40 · Risen to level 3",
    "Slain 4 · 1:35 in the delve",
    "CLOSE",
  ];

  it("should move the headings and rows up 24 px a notch down, and leave the fixed parts", () => {
    const { wheel, where } = long();
    const rowsBefore = ["CARRIED HOME", "Carried 0", "LOST", "Lost 7"].map(
      where,
    );
    const fixedBefore = fixed.map(where);
    wheel("settlement-record", 100);
    expect(["CARRIED HOME", "Carried 0", "LOST", "Lost 7"].map(where)).toEqual(
      rowsBefore.map(([x, y]) => [x, y - 24]),
    );
    expect(fixed.map(where)).toEqual(fixedBefore);
  });

  it("should stop at the content's end and at the top", () => {
    const { wheel, where } = long();
    const [, y0] = where("Carried 0");
    wheel("settlement-record", 1);
    wheel("settlement-record", 1);
    wheel("settlement-record", 1);
    expect(where("Carried 0")[1]).toBe(y0 - 40);
    wheel("close-the-record", -1);
    expect(where("Carried 0")[1]).toBe(y0 - 16);
    wheel("settlement-record", -3);
    wheel("settlement-record", -3);
    expect(where("Carried 0")[1]).toBe(y0);
  });

  it.each([
    ["settlement-record", 1],
    ["close-the-record", 1],
    ["settlement-record", 0],
    ["close-the-record", -1],
  ])(
    "should stop every wheel on %s (dy %i), so nothing under the panel answers",
    (name, dy) => {
      const { wheel } = long();
      expect(wheel(name, dy)).toHaveBeenCalledTimes(1);
    },
  );

  it("should register nothing on the scene's wheel", () => {
    const { scene } = long();
    // the stand-in has no scene input: a record reaching for it would throw on open
    expect((scene as unknown as { input?: unknown }).input).toBeUndefined();
  });

  it("should move nothing in a record that fits, and draw no thumb, but still stop the wheel", () => {
    const { wheel, placed, thumb } = long(4, 4);
    const before = placed();
    expect(wheel("settlement-record", 1)).toHaveBeenCalledTimes(1);
    expect(placed()).toEqual(before);
    expect(thumb().calls.fillRoundedRect).toBeUndefined();
  });

  it("should draw a brass thumb in the right padding on overflow, following the offset, with no hit area", () => {
    const { wheel, thumb, hit } = long();
    const top = hit("settlement-record")!;
    const [, centreY, , height] = top.args as number[];
    const areaTop = centreY - height / 2 + 90;
    const drawn = () => thumb().calls.fillRoundedRect as number[];
    expect(thumb().calls.fillStyle).toEqual([palette.frame, 1]);
    const [x, y, w, h] = drawn();
    expect(x).toBe(280 + RECORD_W - 24 + 10);
    expect(w).toBe(4);
    expect(y).toBe(areaTop);
    expect(h).toBeCloseTo((216 * 216) / 256);
    wheel("settlement-record", 1);
    wheel("settlement-record", 1);
    expect(drawn()[1]).toBeCloseTo(areaTop + 216 - h);
    expect(thumb().calls.setInteractive).toBeUndefined();
    expect(Object.keys(thumb().handlers)).toHaveLength(0);
  });
});

describe("SettlementRecord's offset across updates (FS-GV8WN §Change: The settlement record scrolls S8)", () => {
  function scrolled(bottom = 454) {
    const stage = fakeScene();
    const record = tracked(stage.scene, { x: 540, bottom }, vi.fn());
    record.set(settlementRecord(listed(11, 8)));
    record.open();
    const y = () => stage.at(stage.textMade("Carried 0")!)[1];
    const top = y();
    return { ...stage, record, y, top };
  }

  it("should keep the offset when the confirmed copy lands", () => {
    const { record, wheel, y, top } = scrolled();
    wheel("settlement-record", 1);
    record.set(settlementRecord({ ...listed(11, 8), status: "confirmed" }));
    expect(y()).toBe(top - 24);
  });

  it("should open a settlement with new content at the top", () => {
    const { record, wheel, y, top } = scrolled();
    wheel("settlement-record", 1);
    record.set(settlementRecord({ ...listed(11, 8), kills: 9 }));
    expect(y()).toBe(top);
  });

  it("should keep the offset across a relayout, clamped to the new area", () => {
    const { record, wheel, at, textMade } = scrolled(300);
    const head = () => at(textMade("CARRIED HOME")!)[1];
    // 256 px in a 94 px area: 162 to scroll
    for (let i = 0; i < 3; i++) wheel("settlement-record", 1);
    record.relayout({ x: 640, bottom: 300 });
    expect(head()).toBe(8 + 90 - 72);
    for (let i = 0; i < 5; i++) wheel("settlement-record", 1);
    expect(head()).toBe(8 + 90 - 162);
    // back to a 216 px area: only 40 to scroll
    record.relayout({ x: 540, bottom: 454 });
    expect(head()).toBe(40 + 90 - 40);
  });

  it("should open at the top once closed and opened again", () => {
    const { record, wheel, y, top } = scrolled();
    wheel("settlement-record", 1);
    record.close();
    record.open();
    expect(y()).toBe(top);
  });
});

describe("SettlementRecord's clip at a new render scale (FS-GV8WN §Change: The settlement record scrolls S5)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  function opened11() {
    const stage = fakeScene();
    const record = tracked(stage.scene, { x: 540, bottom: 454 }, vi.fn());
    record.set(settlementRecord(listed(11, 3)));
    record.open();
    vi.mocked(maskInView).mockClear();
    vi.mocked(fillMaskArea).mockClear();
    const shape = stage.live().find((m) => m.kind === "maskShape")!;
    return { ...stage, record, shape };
  }

  it("should redraw the shape in place for a new render scale, with no second mask", () => {
    const { layers, shape } = opened11();
    viewport.set({ width: 1080, height: 720, renderScale: 1.5 });
    expect(fillMaskArea).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fillMaskArea).mock.calls[0][0]).toBe(shape.self);
    expect(vi.mocked(fillMaskArea).mock.calls[0][3]).toBe(1.5);
    expect(shape.calls.clear).toBeDefined();
    expect(maskInView).not.toHaveBeenCalled();
    expect(layers()).toHaveLength(1);
  });

  it("should stop watching the render scale once closed", () => {
    // close() also drops the area a leaked listener would redraw, so a quiet redraw alone
    // can't tell a removed listener from one left on the `viewport`: each `onChange` the
    // record makes hands back an unsubscribe that is watched here.
    const unsubscribes: (() => void)[] = [];
    const onChange = viewport.onChange.bind(viewport);
    const spy = vi.spyOn(viewport, "onChange").mockImplementation((listener) => {
      const unsubscribe = vi.fn(onChange(listener));
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    });
    onTestFinished(() => spy.mockRestore());
    const { record } = opened11();
    expect(unsubscribes).toHaveLength(1);
    record.close();
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    viewport.set({ width: 1080, height: 720, renderScale: 1.5 });
    expect(fillMaskArea).not.toHaveBeenCalled();
  });

  it.each(["shutdown", "destroy"])(
    "should stop watching the render scale at the scene's %s, which drops the record unclosed",
    (end) => {
      const { events } = opened11();
      events.emit(end);
      viewport.set({ width: 1080, height: 720, renderScale: 1.5 });
      expect(fillMaskArea).not.toHaveBeenCalled();
    },
  );

  it("should leave no scene-end hook behind once closed", () => {
    const { record, events } = opened11();
    record.close();
    expect(
      events.listenerCount("shutdown") + events.listenerCount("destroy"),
    ).toBe(0);
  });
});
