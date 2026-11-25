import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { palette, toCss } from "@/utils/canvasPalette";
import { sweepPolygon } from "./abilityCooldown";
import { RollPip } from "./RollPip";
import { rollPipFrame, type RollPipView } from "./rollPipView";

// FS-7P736 §B R16: the roll pip as the UI scene draws it from the plain view the run hands, on a recording
// stand-in for the scene: lit when ready, swept from `roll_cooldown` and run down between states as
// FS-Q18Q3's squares are

interface Op {
  m: string;
  args: unknown[];
}
interface Made {
  kind: "graphics" | "text";
  ops: Op[];
  destroyed: boolean;
}

const VIEW = { width: 1280, height: 720 };

function fakeScene() {
  const made: Made[] = [];
  const time = { now: 0 };
  const updates: (() => void)[] = [];
  const object = (kind: Made["kind"]) => {
    const m: Made = { kind, ops: [], destroyed: false };
    made.push(m);
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return undefined;
          if (prop === "destroy") return () => void (m.destroyed = true);
          if (prop === "clear")
            return () => {
              m.ops = [];
              return self;
            };
          return (...args: unknown[]) => {
            m.ops.push({ m: String(prop), args });
            return self;
          };
        },
      },
    );
    return self;
  };
  const scene = {
    add: { graphics: () => object("graphics"), text: () => object("text") },
    time,
    events: {
      on: (event: string, fn: () => void) => void (event === "update" && updates.push(fn)),
      off: (event: string, fn: () => void) => void (event === "update" && updates.includes(fn) && updates.splice(updates.indexOf(fn), 1)),
    },
  } as unknown as Phaser.Scene;
  const tick = (ms: number) => {
    time.now += ms;
    for (const fn of [...updates]) fn();
  };
  const ops = () => made.filter((m) => !m.destroyed).flatMap((m) => m.ops);
  const wedges = () => ops().filter((o) => o.m === "fillPoints").map((o) => o.args[0]);
  const label = () => made.find((m) => m.kind === "text" && !m.destroyed);
  return { scene, made, time, updates, tick, ops, wedges, label };
}

const READY: RollPipView = { label: "Space", ready: true, cooldown: null };
const cooling = (remaining: number): RollPipView => ({ label: "Space", ready: false, cooldown: { remaining, total: 3 } });

describe("RollPip (FS-7P736 R16)", () => {
  const well = () => rollPipFrame(VIEW).well;

  it("should stand lit when ready: the bright brass rim and pip, the label Space in vellum, no sweep", () => {
    const { scene, ops, wedges, label, updates } = fakeScene();
    new RollPip(scene, VIEW).show(READY);
    expect(ops()).toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
    expect(ops()).toContainEqual({ m: "fillStyle", args: [palette.frameBright, 1] });
    expect(label()?.ops).toContainEqual({ m: "setText", args: ["Space"] });
    expect(label()?.ops).toContainEqual({ m: "setColor", args: [toCss(palette.hudText)] });
    expect(wedges()).toEqual([]);
    expect(updates).toHaveLength(0);
  });

  it("should stand at its frame beside the ability bar", () => {
    const { scene, ops } = fakeScene();
    new RollPip(scene, VIEW).show(READY);
    const w = well();
    expect(ops()).toContainEqual({ m: "fillRect", args: [w.x, w.y, w.width, w.height] });
  });

  it("should sweep the wire's cooldown and dim while it runs", () => {
    const { scene, wedges, label } = fakeScene();
    new RollPip(scene, VIEW).show(cooling(1.5));
    expect(wedges()).toEqual([sweepPolygon(well(), 0.5)]);
    expect(label()?.ops).toContainEqual({ m: "setColor", args: [toCss(palette.hudFaint)] });
  });

  it("should run the sweep down between states on the scene's own frames, and the next state correct it", () => {
    const { scene, wedges, tick } = fakeScene();
    const pip = new RollPip(scene, VIEW);
    pip.show(cooling(1.5));
    tick(750);
    expect(wedges()).toEqual([sweepPolygon(well(), 0.25)]);
    pip.show(cooling(1.2));
    expect(wedges()).toEqual([sweepPolygon(well(), 0.4)]);
  });

  it("should stop listening to the frames once the sweep has run out, and light again on a ready state", () => {
    const { scene, wedges, tick, updates, ops } = fakeScene();
    const pip = new RollPip(scene, VIEW);
    pip.show(cooling(0.3));
    expect(updates).toHaveLength(1);
    tick(400);
    expect(wedges()).toEqual([]);
    expect(updates).toHaveLength(0);
    pip.show(READY);
    expect(ops()).toContainEqual({ m: "lineStyle", args: [2, palette.frameBright, 1] });
  });

  it("should redraw nothing for a state that changes nothing", () => {
    const { scene, made } = fakeScene();
    const pip = new RollPip(scene, VIEW);
    pip.show(READY);
    const count = made.length;
    const ops = made.map((m) => m.ops.length);
    pip.show({ ...READY });
    expect(made).toHaveLength(count);
    expect(made.map((m) => m.ops.length)).toEqual(ops);
  });

  it("should take everything down for none, and with the piece, ticking nothing", () => {
    const { scene, made, updates } = fakeScene();
    const pip = new RollPip(scene, VIEW);
    pip.show(cooling(1.5));
    pip.show(null);
    expect(made.every((m) => m.destroyed)).toBe(true);
    expect(updates).toHaveLength(0);
    pip.show(cooling(1.5));
    pip.destroy();
    expect(made.every((m) => m.destroyed)).toBe(true);
    expect(updates).toHaveLength(0);
  });
});
