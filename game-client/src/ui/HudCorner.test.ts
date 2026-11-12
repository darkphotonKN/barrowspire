import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
import { HudCorner, type CornerIconSpec } from "./HudCorner";
import { cornerIconFrame } from "./hudCornerLayout";

// FS-3EBCA §A R3–R5, §B R6–R11. I-3EBCA-1: the corner row as a scene draws it, on a recording
// stand-in for the Phaser scene.

interface FakeZone {
  x: number;
  y: number;
  width: number;
  height: number;
  depth?: number;
  handCursor?: boolean;
  handlers: Record<string, () => void>;
  destroyed: boolean;
}
interface FakeGraphics {
  strokes: number[];
  /** Every drawing call after the plate, by name, since the last clear. */
  calls: string[];
  depth?: number;
  destroyed: boolean;
}
interface FakeText {
  words: string;
  x: number;
  y: number;
  destroyed: boolean;
}

function fakeScene() {
  const zones: FakeZone[] = [];
  const graphics: FakeGraphics[] = [];
  const texts: FakeText[] = [];
  const add = {
    graphics: () => {
      const rec: FakeGraphics = { strokes: [], calls: [], destroyed: false };
      graphics.push(rec);
      const self: Record<string, unknown> = {};
      for (const m of [
        "setScrollFactor",
        "fillStyle",
        "fillRect",
        "fillRoundedRect",
        "strokeRoundedRect",
        "strokeRect",
        "lineBetween",
        "fillCircle",
        "strokeCircle",
        "beginPath",
        "arc",
        "closePath",
        "strokePath",
        "fillPath",
        "fillTriangle",
        "fillGradientStyle",
        "setAlpha",
      ])
        self[m] = () => (rec.calls.push(m), self);
      self.clear = () => ((rec.strokes = []), (rec.calls = []), self);
      self.lineStyle = (_w: number, colour: number) => (rec.strokes.push(colour), self);
      self.setDepth = (d: number) => ((rec.depth = d), self);
      self.destroy = () => void (rec.destroyed = true);
      return self;
    },
    zone: (x: number, y: number, width: number, height: number) => {
      const z: FakeZone = { x, y, width, height, handlers: {}, destroyed: false };
      zones.push(z);
      const self: Record<string, unknown> = {
        setOrigin: () => self,
        setScrollFactor: () => self,
        setDepth: (d: number) => ((z.depth = d), self),
        setInteractive: (o?: { useHandCursor?: boolean }) => ((z.handCursor = !!o?.useHandCursor), self),
        setPosition: (nx: number, ny: number) => ((z.x = nx), (z.y = ny), self),
        on: (event: string, fn: () => void) => ((z.handlers[event] = fn), self),
        destroy: () => void (z.destroyed = true),
      };
      return self;
    },
    text: (x: number, y: number, words: string) => {
      const t: FakeText = { words, x, y, destroyed: false };
      texts.push(t);
      const self: Record<string, unknown> = {
        width: words.length * 6,
        setOrigin: () => self,
        setScrollFactor: () => self,
        setDepth: () => self,
        setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
        destroy: () => void (t.destroyed = true),
      };
      return self;
    },
  };
  const scene = { add } as unknown as Phaser.Scene;
  const liveTexts = () => texts.filter((t) => !t.destroyed);
  return { scene, zones, graphics, liveTexts };
}

function setup(icons?: CornerIconSpec[]) {
  const stage = fakeScene();
  const press = { menu: vi.fn(), inventory: vi.fn(), character: vi.fn(), party: vi.fn() };
  const corner = new HudCorner(stage.scene, {
    icons: icons ?? [
      { icon: "menu", press: press.menu },
      { icon: "inventory", press: press.inventory },
      { icon: "character", press: press.character },
      { icon: "party", press: press.party },
    ],
  });
  const zoneAt = (icon: "menu" | "inventory" | "character" | "party" | "mail") => {
    const f = cornerIconFrame(icon, viewport);
    return stage.zones.find((z) => !z.destroyed && z.x === f.x && z.y === f.y)!;
  };
  return { ...stage, press, corner, zoneAt };
}

describe("HudCorner (FS-3EBCA R2–R4: the plates)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should give each icon a pressable plate at its rect, in the HUD band, with a hand cursor", () => {
    const env = setup();
    for (const icon of ["menu", "inventory", "character", "party"] as const) {
      const z = env.zoneAt(icon);
      expect(z).toBeDefined();
      expect(z.width).toBe(58);
      expect(z.height).toBe(46);
      expect(z.depth).toBe(1000);
      expect(z.handCursor).toBe(true);
    }
    expect(env.graphics.every((g) => g.depth === 1000)).toBe(true);
  });

  it("should draw each glyph in the interactable amber, brighter under the pointer", () => {
    const env = setup();
    const strokes = () => env.graphics.flatMap((g) => g.strokes);
    expect(strokes()).toContain(palette.interactable);
    expect(strokes()).not.toContain(palette.interactableBright);
    env.zoneAt("party").handlers.pointerover();
    expect(strokes()).toContain(palette.interactableBright);
    env.zoneAt("party").handlers.pointerout();
    expect(strokes()).not.toContain(palette.interactableBright);
  });

  it("should move every plate to the corner when the view widens (FS-ZAJMH R13)", () => {
    const env = setup();
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.corner.relayout();
    expect(env.zoneAt("menu").x).toBe(1280 - 16 - 58);
    expect(env.corner.covers(1230, 680)).toBe(true);
    expect(env.corner.covers(1030, 680)).toBe(false);
  });
});

describe("HudCorner (FS-3EBCA R5: hover labels)", () => {
  it.each([
    ["menu", "Menu (Esc)"],
    ["inventory", "Inventory (I)"],
    ["character", "Character (C)"],
    ["party", "Party (T)"],
  ] as const)("should name %s under the pointer, and take the label down on leaving", (icon, words) => {
    const env = setup();
    env.zoneAt(icon).handlers.pointerover();
    const label = env.liveTexts().find((t) => t.words === words);
    expect(label).toBeDefined();
    expect(label!.y).toBe(658 - 6);
    env.zoneAt(icon).handlers.pointerout();
    expect(env.liveTexts().find((t) => t.words === words)).toBeUndefined();
  });
});

describe("HudCorner (FS-3EBCA R6–R8, R11: presses)", () => {
  it("should call each icon's press", () => {
    const env = setup();
    env.zoneAt("menu").handlers.pointerdown();
    env.zoneAt("inventory").handlers.pointerdown();
    env.zoneAt("character").handlers.pointerdown();
    env.zoneAt("party").handlers.pointerdown();
    expect(env.press.menu).toHaveBeenCalledTimes(1);
    expect(env.press.inventory).toHaveBeenCalledTimes(1);
    expect(env.press.character).toHaveBeenCalledTimes(1);
    expect(env.press.party).toHaveBeenCalledTimes(1);
  });

  it("should draw the Inventory icon's bag apart from the Character icon's bust (R3)", () => {
    const env = setup([{ icon: "inventory" }, { icon: "character" }]);
    const [bag, bust] = env.graphics;
    expect(bag.strokes).toContain(palette.interactable);
    expect(bag.calls).not.toEqual(bust.calls);
    // a pouch: its body and neck are paths, its cord a line, no circle for a head
    expect(bag.calls).toContain("lineBetween");
    expect(bag.calls).not.toContain("strokeCircle");
  });

  it("should say which points it covers, for the world's press to leave alone (R10)", () => {
    const env = setup();
    expect(env.corner.covers(1030, 680)).toBe(true);
    expect(env.corner.covers(800, 680)).toBe(false);
  });

  it("should take everything down on destroy", () => {
    const env = setup();
    env.zoneAt("party").handlers.pointerover();
    env.corner.destroy();
    expect(env.zones.every((z) => z.destroyed)).toBe(true);
    expect(env.graphics.every((g) => g.destroyed)).toBe(true);
    expect(env.liveTexts()).toHaveLength(0);
  });
});

describe("HudCorner (FS-3EBCA R9: the Mailbox greyed outside the town)", () => {
  function greyed() {
    const press = vi.fn();
    return { ...setup([{ icon: "mail", greyed: true, press }]), mailPress: press };
  }

  it("should draw the envelope in the faint HUD tone, never amber, with no hand cursor", () => {
    const env = greyed();
    const strokes = env.graphics.flatMap((g) => g.strokes);
    expect(strokes).toContain(palette.hudFaint);
    expect(strokes).not.toContain(palette.interactable);
    expect(env.zoneAt("mail").handCursor).toBe(false);
  });

  it("should not brighten under the pointer, and name itself \"Mailbox · town only\"", () => {
    const env = greyed();
    env.zoneAt("mail").handlers.pointerover();
    const strokes = env.graphics.flatMap((g) => g.strokes);
    expect(strokes).not.toContain(palette.interactableBright);
    expect(env.liveTexts().map((t) => t.words)).toContain("Mailbox · town only");
  });

  it("should answer no press", () => {
    const env = greyed();
    env.zoneAt("mail").handlers.pointerdown();
    expect(env.mailPress).not.toHaveBeenCalled();
  });
});
