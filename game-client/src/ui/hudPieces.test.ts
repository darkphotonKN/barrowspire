import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { ArtLibrary } from "@/render/art/library";
import { viewport } from "@/render/viewport";
import { mountHud } from "./hudPieces";
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

const art = () => ArtLibrary.empty({ warn: () => {} });

describe("the UI scene's HUD, mounted (FS-TQZ5J § Change: Batch 5, R67, R68)", () => {
  it("should draw the card and the level bar the run hands, in the UI scene", () => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    const { scene, bridge, report, live } = onScene();
    report("run");
    mountHud(scene, bridge, art);
    bridge.hud({ kind: "ability", card: { name: "Dash", line: "Charge.", greyed: false } });
    bridge.hud({ kind: "progress", progress: { level: 2, experience: 150, level_floor: 100, next_level_at: 230 } });
    expect(live("Dash")).toBe(true);
    expect(live("Level 2")).toBe(true);
  });

  it("should take them down as the run leaves, and draw nothing it hands after", () => {
    const { scene, bridge, report, live } = onScene();
    mountHud(scene, bridge, art);
    report("run");
    bridge.hud({ kind: "ability", card: { name: "Dash", line: "Charge.", greyed: false } });
    bridge.left("run");
    expect(live("Dash")).toBe(false);
    bridge.hud({ kind: "ability", card: { name: "Dash", line: "Charge.", greyed: false } });
    expect(live("Dash")).toBe(false);
  });

  it("should take a level-up cue still fading down with the town, and raise none for the next world's first state", () => {
    const { scene, bridge, report, live, tweens } = onScene();
    mountHud(scene, bridge, art);
    report("hub");
    bridge.hud({ kind: "progress", progress: { level: 2, experience: 220, level_floor: 100, next_level_at: 230 } });
    bridge.hud({ kind: "progress", progress: { level: 3, experience: 240, level_floor: 230, next_level_at: 390 } });
    expect(live("Risen to level 3")).toBe(true);
    bridge.left("hub");
    expect(live("Risen to level 3")).toBe(false);
    expect(tweens.killTweensOf).toHaveBeenCalled();
    report("run");
    bridge.hud({ kind: "progress", progress: { level: 4, experience: 400, level_floor: 390, next_level_at: 600 } });
    expect(live("Risen to level 4")).toBe(false);
    expect(live("Level 4")).toBe(true);
  });

  it("should take every piece down, and hear nothing more, with the scene", () => {
    const { scene, bridge, report, standing, events } = onScene();
    mountHud(scene, bridge, art);
    report("run");
    bridge.hud({ kind: "bars", bars: [{ channel: "health", label: "Health:", fill: 1 }] });
    bridge.hud({ kind: "potion", cell: { count: 1, keyLabel: "[1]", dimmed: false } });
    expect(standing().length).toBeGreaterThan(0);
    events.emit("shutdown");
    expect(standing()).toEqual([]);
    bridge.hud({ kind: "bars", bars: [{ channel: "health", label: "Health:", fill: 1 }] });
    expect(standing()).toEqual([]);
  });
});
