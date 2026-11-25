import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { STATUS_MARK_SIZE, STATUS_MARKS_AT } from "./statusMarks";
import { STATUS_TIP_DEPTH, StatusMarksHud } from "./StatusMarksHud";

interface Made {
  kind: "graphics" | "text" | "zone";
  args: unknown[];
  depth?: number;
  handlers: Record<string, () => void>;
  destroyed: boolean;
}

/** A scene that records each object made on it and the handlers its zones hear. */
function onScene() {
  const made: Made[] = [];
  const object = (kind: Made["kind"], args: unknown[]) => {
    const m: Made = { kind, args, handlers: {}, destroyed: false };
    made.push(m);
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "destroy") return () => void (m.destroyed = true);
          if (prop === "on") return (event: string, fn: () => void) => ((m.handlers[event] = fn), self);
          if (prop === "setDepth") return (d: number) => ((m.depth = d), self);
          if (prop === "width" || prop === "height") return 10;
          if (prop === "then") return undefined;
          return () => self;
        },
      },
    );
    return self;
  };
  const scene = {
    add: {
      graphics: (...args: unknown[]) => object("graphics", args),
      text: (...args: unknown[]) => object("text", args),
      zone: (...args: unknown[]) => object("zone", args),
    },
    input: { setPollAlways: () => {}, setPollOnMove: () => {} },
  } as unknown as Phaser.Scene;
  const live = () => made.filter((m) => !m.destroyed);
  const words = () => live().filter((m) => m.kind === "text").map((m) => m.args[2]);
  return { scene, made, live, words };
}

// FS-5FZ4J §J R55 (I-5FZ4J-11)
describe("StatusMarksHud: the Blessing mark beside the health bar (FS-5FZ4J §J R55)", () => {
  it("should draw one mark with its own hover ground at its place, and no words until hovered", () => {
    const { scene, live, words } = onScene();
    const hud = new StatusMarksHud(scene, STATUS_MARKS_AT.x, STATUS_MARKS_AT.y);
    hud.show(["blessed"]);
    const [zone] = live().filter((m) => m.kind === "zone");
    expect(zone.args).toEqual([STATUS_MARKS_AT.x, STATUS_MARKS_AT.y, STATUS_MARK_SIZE, STATUS_MARK_SIZE]);
    expect(live().some((m) => m.kind === "graphics")).toBe(true);
    expect(words()).toEqual([]);
  });

  it("should show the hover line over the windows while the pointer is over the mark, and take it down on leave", () => {
    const { scene, live, words } = onScene();
    const hud = new StatusMarksHud(scene, STATUS_MARKS_AT.x, STATUS_MARKS_AT.y);
    hud.show(["blessed"]);
    const [zone] = live().filter((m) => m.kind === "zone");
    zone.handlers.pointerover();
    expect(words()).toEqual(["Blessed: better finds, quicker resource"]);
    expect(live().find((m) => m.kind === "text")?.depth).toBe(STATUS_TIP_DEPTH);
    zone.handlers.pointerout();
    expect(words()).toEqual([]);
  });

  it("should take every mark and its line down when the Blessing goes", () => {
    const { scene, live } = onScene();
    const hud = new StatusMarksHud(scene, STATUS_MARKS_AT.x, STATUS_MARKS_AT.y);
    hud.show(["blessed"]);
    live().find((m) => m.kind === "zone")!.handlers.pointerover();
    hud.show([]);
    expect(live()).toEqual([]);
  });

  it("should redraw nothing for the same marks again", () => {
    const { scene, made } = onScene();
    const hud = new StatusMarksHud(scene, STATUS_MARKS_AT.x, STATUS_MARKS_AT.y);
    hud.show(["blessed"]);
    const count = made.length;
    hud.show(["blessed"]);
    expect(made).toHaveLength(count);
  });

  it("should take everything down with destroy", () => {
    const { scene, live } = onScene();
    const hud = new StatusMarksHud(scene, STATUS_MARKS_AT.x, STATUS_MARKS_AT.y);
    hud.show(["blessed"]);
    live().find((m) => m.kind === "zone")!.handlers.pointerover();
    hud.destroy();
    expect(live()).toEqual([]);
  });

  // FS-4EC7Z §G R34 (I-4EC7Z-6)
  it("should draw Contract Settled beside the Blessing, each with its own ground and hover line", () => {
    const { scene, live, words } = onScene();
    const hud = new StatusMarksHud(scene, STATUS_MARKS_AT.x, STATUS_MARKS_AT.y);
    hud.show(["blessed", "contract_settled"]);
    const zones = live().filter((m) => m.kind === "zone");
    expect(zones).toHaveLength(2);
    expect(Number(zones[1].args[0])).toBeGreaterThan(Number(zones[0].args[0]));
    zones[1].handlers.pointerover();
    expect(words()).toEqual(["Contract Settled: +15% damage"]);
  });
});
