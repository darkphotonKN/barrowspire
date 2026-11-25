import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { hudPieces, mountHud } from "./hudPieces";
import type { HudBuild, HudKind } from "./uiSceneHud";
import { GameUiBridge, NO_FACTS, type World } from "./uiBridge";

// FS-TQZ5J § Change: Batch 5, R67, R68, R73: the UI scene's HUD, mounted over its game's bridge, draws
// the real pieces from what each world hands, and takes them down as the world leaves and with the scene

interface Made {
  kind: string;
  content?: unknown;
  destroyed: boolean;
}

function onScene() {
  const made: Made[] = [];
  const object = (kind: string, content?: unknown) => {
    const m: Made = { kind, content, destroyed: false };
    made.push(m);
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "destroy") return () => void (m.destroyed = true);
          if (prop === "setText") return (text: unknown) => ((m.content = text), self);
          if (prop === "width" || prop === "height") return 10;
          if (prop === "frame") return { width: 32, height: 32 };
          if (prop === "then") return undefined;
          return () => self;
        },
      },
    );
    return self;
  };
  const events = new EventEmitter();
  const tweens = { add: vi.fn(), killTweensOf: vi.fn() };
  const scene = {
    add: {
      graphics: () => object("graphics"),
      text: (_x: number, _y: number, content: unknown) => object("text", content),
      sprite: () => object("sprite"),
      zone: () => object("zone"),
    },
    tweens,
    events,
  } as unknown as Phaser.Scene;
  const bridge = new GameUiBridge();
  const report = (world: World) =>
    bridge.report({
      world,
      windows: () => ({ letter: false }),
      blockers: () => ({ dialogue: false }),
      facts: () => NO_FACTS,
      answer: () => {},
    });
  const live = (content: string) => made.some((m) => m.kind === "text" && m.content === content && !m.destroyed);
  const standing = () => made.filter((m) => !m.destroyed);
  return { scene, bridge, report, live, standing, events, tweens };
}

const BAR = {
  potion: { count: 2, greyed: false, field: false },
  ability: { icon: "dash", greyed: false, active: false, cost: 25 },
  tree: { locked: true, ability: "earthbreaker", greyed: true, cost: null },
  costChannel: "stamina",
  cooldowns: { ability: null, tree: null },
} as const;

describe("the UI scene's HUD, mounted (FS-TQZ5J § Change: Batch 5, R67, R68)", () => {
  it("should draw the ability bar and the level bar the run hands, in the UI scene (FS-Q18Q3 R41)", () => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    const { scene, bridge, report, live } = onScene();
    report("run");
    mountHud(scene, bridge, hudPieces(scene));
    bridge.hud({ world: "run", kind: "bar", bar: BAR });
    bridge.hud({ world: "run", kind: "progress", progress: { level: 7, experience: 150, level_floor: 100, next_level_at: 230 } });
    // the dash's cost and the locked 3 square's level (FS-Q18Q3 R15, R25)
    expect(live("25")).toBe(true);
    expect(live("Lv 10")).toBe(true);
    // the bar's end numerals, this level and the next (FS-77DVN §B.8)
    expect(live("7")).toBe(true);
    expect(live("8")).toBe(true);
  });

  it("should take them down as the run leaves, and draw nothing it hands after", () => {
    const { scene, bridge, report, live } = onScene();
    mountHud(scene, bridge, hudPieces(scene));
    report("run");
    bridge.hud({ world: "run", kind: "bar", bar: BAR });
    bridge.left("run");
    expect(live("Lv 10")).toBe(false);
    bridge.hud({ world: "run", kind: "bar", bar: BAR });
    expect(live("Lv 10")).toBe(false);
  });

  it("should draw no ability bar in the hub (FS-Q18Q3 R29)", () => {
    const { scene, bridge, report, live } = onScene();
    mountHud(scene, bridge, hudPieces(scene));
    report("hub");
    bridge.hud({ world: "hub", kind: "bar", bar: BAR });
    expect(live("Lv 10")).toBe(false);
  });

  it("should take a level-up cue still fading down with the town, and raise none for the next world's first state", () => {
    const { scene, bridge, report, live, tweens } = onScene();
    mountHud(scene, bridge, hudPieces(scene));
    report("hub");
    bridge.hud({ world: "hub", kind: "progress", progress: { level: 2, experience: 220, level_floor: 100, next_level_at: 230 } });
    bridge.hud({ world: "hub", kind: "progress", progress: { level: 3, experience: 240, level_floor: 230, next_level_at: 390 } });
    expect(live("Risen to level 3")).toBe(true);
    bridge.left("hub");
    expect(live("Risen to level 3")).toBe(false);
    expect(tweens.killTweensOf).toHaveBeenCalled();
    report("run");
    bridge.hud({ world: "run", kind: "progress", progress: { level: 4, experience: 400, level_floor: 390, next_level_at: 600 } });
    expect(live("Risen to level 4")).toBe(false);
    expect(live("4")).toBe(true);
  });

  // FS-5FZ4J §J R55 (I-5FZ4J-11): the Blessing mark, beside the run's own health bar
  it("should draw the status marks the run hands, and take them down as the run leaves", () => {
    const { scene, bridge, report, standing } = onScene();
    mountHud(scene, bridge, hudPieces(scene));
    report("run");
    bridge.hud({ world: "run", kind: "statusMarks", marks: ["blessed"] });
    expect(standing().filter((m) => m.kind === "zone")).toHaveLength(1);
    bridge.left("run");
    expect(standing()).toEqual([]);
  });

  // FS-7P736 R16 (I-7P736-2): the roll pip beside the ability bar, labelled from RUN_ACTIONS
  it("should draw the roll pip the run hands, labelled Space, and take it down as the run leaves", () => {
    const { scene, bridge, report, live } = onScene();
    mountHud(scene, bridge, hudPieces(scene));
    report("run");
    bridge.hud({ world: "run", kind: "roll", roll: { label: "Space", ready: true, cooldown: null } });
    expect(live("Space")).toBe(true);
    bridge.left("run");
    expect(live("Space")).toBe(false);
  });

  it("should take every piece down, and hear nothing more, with the scene", () => {
    const { scene, bridge, report, standing, events } = onScene();
    mountHud(scene, bridge, hudPieces(scene));
    report("run");
    bridge.hud({ world: "run", kind: "bars", bars: [{ channel: "health", label: "Health:", fill: 1 }] });
    bridge.hud({ world: "run", kind: "bar", bar: BAR });
    expect(standing().length).toBeGreaterThan(0);
    events.emit("shutdown");
    expect(standing()).toEqual([]);
    bridge.hud({ world: "run", kind: "bars", bars: [{ channel: "health", label: "Health:", fill: 1 }] });
    expect(standing()).toEqual([]);
  });

  // FS-TQZ5J § Change: Batch 6, R138: the relayout and the end through mountHud's own wiring
  it("should send each standing piece back to its anchor on a new logical view, and stop with the scene", () => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    const { scene, bridge, report, events } = onScene();
    const relaid: HudKind[] = [];
    const destroyed: HudKind[] = [];
    const piece = (kind: HudKind) => () => ({
      show: () => {},
      relayout: () => void relaid.push(kind),
      destroy: () => void destroyed.push(kind),
    });
    const build: HudBuild = {
      bar: () => ({ ...piece("bar")(), top: () => 612 }),
      bars: piece("bars"),
      progress: () => ({ ...piece("progress")(), cueOver: () => {} }),
      window: piece("window"),
      statusMarks: piece("statusMarks"),
      contract: piece("contract"),
      roll: piece("roll"),
    };
    mountHud(scene, bridge, build);
    report("run");
    bridge.hud({ world: "run", kind: "bar", bar: BAR });
    bridge.hud({ world: "run", kind: "bars", bars: [{ channel: "health", label: "Health:", fill: 1 }] });
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    expect(relaid).toEqual(["bar", "bars"]);
    events.emit("shutdown");
    expect(destroyed).toEqual(["bar", "bars"]);
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    expect(relaid).toEqual(["bar", "bars"]);
  });
});
