import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";

import type { SettlementPayload } from "@/assets/types/client";
import { palette } from "@/utils/canvasPalette";
import { RECORD_DEPTH, RECORD_W, SettlementRecord } from "./SettlementRecord";
import { drawPanelTitle } from "./panelFrame";

// The shared title drawing, watched (FS-3EBCA R20).
vi.mock("./panelFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("./panelFrame")>();
  return { ...real, drawPanelTitle: vi.fn(real.drawPanelTitle) };
});
import { settlementRecord } from "./settlement";

// FS-GV8WN §G R21: the record as a scene draws it, on a recording stand-in for the Phaser scene.

interface Made {
  kind: string;
  args: unknown[];
  destroyed: boolean;
  calls: Record<string, unknown[]>;
  handlers: Record<string, () => void>;
  name?: string;
}

function fakeScene() {
  const made: Made[] = [];
  const make = (kind: string, args: unknown[]): unknown => {
    const rec: Made = { kind, args, destroyed: false, calls: {}, handlers: {} };
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
          };
        if (prop === "on")
          return (event: string, fn: () => void) => {
            target.handlers[event] = fn;
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
          return proxy;
        };
      },
    });
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
  const scene = { add } as unknown as Phaser.Scene;
  const live = () => made.filter((m) => !m.destroyed);
  const texts = () =>
    live()
      .filter((m) => m.kind === "text")
      .map((m) => String(m.args[2]));
  const textMade = (content: string) =>
    live().find((m) => m.kind === "text" && m.args[2] === content);
  const hit = (name: string) => live().find((m) => m.name === name);
  return { scene, made, live, texts, textMade, hit };
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

function opened(onClose = vi.fn()) {
  const stage = fakeScene();
  const record = new SettlementRecord(
    stage.scene,
    { x: 540, bottom: 454 },
    onClose,
  );
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
    const record = new SettlementRecord(
      stage.scene,
      { x: 540, bottom: 454 },
      vi.fn(),
    );
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
