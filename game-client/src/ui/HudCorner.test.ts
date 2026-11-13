import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette, shade } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";
import { HudCorner, PARTY_BUSTS, drawBust, type BustDress, type CornerIconSpec } from "./HudCorner";
import { cornerIconFrame } from "./hudCornerLayout";
import { GLYPH_LINE_W, envelopeFlapPoint } from "./MailboxEnvelope";

// FS-3EBCA §A R3–R5, §B R6–R11. I-3EBCA-1: the corner row as a scene draws it, on a recording
// stand-in for the Phaser scene.

interface FakeZone {
  x: number;
  y: number;
  width: number;
  height: number;
  depth?: number;
  handCursor?: boolean;
  /** Whether Phaser would hand it the pointer: off after `disableInteractive`, on again after `setInteractive`. */
  enabled?: boolean;
  /** Whether its last `disableInteractive` asked for the cursor back. */
  cursorReset?: boolean;
  handlers: Record<string, () => void>;
  destroyed: boolean;
}
interface FakeGraphics {
  strokes: number[];
  /** Each line style's alpha, in step with `strokes`. */
  alphas: number[];
  /** Every drawing call, by name, since the last clear. */
  calls: string[];
  /** Every drawing call with its arguments, since the last clear. */
  ops: { m: string; args: number[] }[];
  depth?: number;
  /** Its scale and position, as `setScale` and `setPosition` left them. */
  scale?: number;
  x?: number;
  y?: number;
  destroyed: boolean;
}
/** A render texture, as the knockout made it (FS-3EBCA § Change: … a bronze knockout rucksack). */
interface FakeTexture {
  x: number;
  y: number;
  width: number;
  height: number;
  depth?: number;
  scrollFactor?: number;
  scale?: number;
  /** The top-left corner's tint, and all four corners' as `setTint` left them (one sets all four). */
  tint?: number;
  tints?: number[];
  alpha?: number;
  /** What was done to it, in order: each `draw` and `erase` with the graphics it took, and `render`. */
  log: { m: "draw" | "erase" | "render"; g?: FakeGraphics }[];
  destroyed: boolean;
}
/** An image made with `add.image`: a knockout's shadow, on its texture's own texture (FS-S8Z2Y R1). */
interface FakeImage {
  x: number;
  y: number;
  /** The render texture whose texture it shows. */
  of?: FakeTexture;
  depth?: number;
  scrollFactor?: number;
  scale?: number;
  tints?: number[];
  tintMode?: number;
  alpha?: number;
  destroyed: boolean;
}
/**
 * What the stand-in can make: `none` is the plain stand-in (no `make`, no `add.renderTexture`),
 * `ok` adds both, recording what they are given, and `throws` adds both with an
 * `add.renderTexture` that throws.
 */
type TextureMode = "none" | "ok" | "throws";
interface FakeText {
  words: string;
  x: number;
  y: number;
  destroyed: boolean;
}

function fakeScene(texture: TextureMode = "none") {
  const zones: FakeZone[] = [];
  const graphics: FakeGraphics[] = [];
  /** The graphics made off the display list (`make.graphics`), and whether each was to be added. */
  const made: FakeGraphics[] = [];
  const madeAdded: (boolean | undefined)[] = [];
  const textures: FakeTexture[] = [];
  const images: FakeImage[] = [];
  const attempts = { renderTexture: 0 };
  const texts: FakeText[] = [];
  const recordOf = new Map<unknown, FakeGraphics>();
  /** The textures and images in drawing order, as Phaser's display list keeps them. */
  const list: unknown[] = [];
  const objectOf = new Map<unknown, unknown>();
  const onList = <T>(self: T, rec: unknown) => (list.push(self), objectOf.set(self, rec), self);
  const offList = (self: unknown) => list.includes(self) && list.splice(list.indexOf(self), 1);
  const textureOf = new Map<unknown, FakeTexture>();
  const newGraphics = (into: FakeGraphics[]) => {
    const rec: FakeGraphics = { strokes: [], alphas: [], calls: [], ops: [], destroyed: false };
    into.push(rec);
    const self: Record<string, unknown> = {};
    recordOf.set(self, rec);
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
      "moveTo",
      "lineTo",
      "fillPoints",
      "strokePoints",
      "fillEllipse",
      "strokeEllipse",
      "setAlpha",
    ])
      self[m] = (...args: number[]) => (rec.calls.push(m), rec.ops.push({ m, args }), self);
    self.clear = () => ((rec.strokes = []), (rec.alphas = []), (rec.calls = []), (rec.ops = []), self);
    self.lineStyle = (w: number, colour: number, alpha: number) => (
      rec.strokes.push(colour), rec.alphas.push(alpha), rec.ops.push({ m: "lineStyle", args: [w, colour, alpha] }), self
    );
    self.setDepth = (d: number) => ((rec.depth = d), self);
    self.setScale = (sc: number) => ((rec.scale = sc), self);
    self.setPosition = (x: number, y: number) => ((rec.x = x), (rec.y = y), self);
    self.destroy = () => void (rec.destroyed = true);
    return self;
  };
  const renderTexture = (x: number, y: number, width: number, height: number) => {
    attempts.renderTexture++;
    if (texture === "throws") throw new Error("stand-in: no framebuffer");
    const t: FakeTexture = { x, y, width, height, log: [], destroyed: false };
    textures.push(t);
    const own = {};
    textureOf.set(own, t);
    const self: Record<string, unknown> = {
      width,
      height,
      texture: own,
      setScrollFactor: (sf: number) => ((t.scrollFactor = sf), self),
      setDepth: (d: number) => ((t.depth = d), self),
      setScale: (sc: number) => ((t.scale = sc), self),
      setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
      setTint: (...c: number[]) => ((t.tint = c[0]), (t.tints = c.length === 1 ? [c[0], c[0], c[0], c[0]] : c), self),
      setAlpha: (a: number) => ((t.alpha = a), self),
      draw: (e: unknown) => (t.log.push({ m: "draw", g: recordOf.get(e) }), self),
      erase: (e: unknown) => (t.log.push({ m: "erase", g: recordOf.get(e) }), self),
      render: () => (t.log.push({ m: "render" }), self),
      destroy: () => void ((t.destroyed = true), offList(self)),
    };
    return onList(self, t);
  };
  const image = (x: number, y: number, of: unknown) => {
    const i: FakeImage = { x, y, of: textureOf.get(of), destroyed: false };
    images.push(i);
    const self: Record<string, unknown> = {
      setScrollFactor: (sf: number) => ((i.scrollFactor = sf), self),
      setDepth: (d: number) => ((i.depth = d), self),
      setScale: (sc: number) => ((i.scale = sc), self),
      setPosition: (nx: number, ny: number) => ((i.x = nx), (i.y = ny), self),
      setTint: (...c: number[]) => ((i.tints = c.length === 1 ? [c[0], c[0], c[0], c[0]] : c), self),
      setTintMode: (v: number) => ((i.tintMode = v), self),
      setAlpha: (a: number) => ((i.alpha = a), self),
      destroy: () => void ((i.destroyed = true), offList(self)),
    };
    return onList(self, i);
  };
  // Phaser's List.moveBelow (src/utils/array/MoveBelow.js): child1 to just under child2, if above it
  const children = {
    list,
    moveBelow: (child1: unknown, child2: unknown) => {
      const [at, base] = [list.indexOf(child1), list.indexOf(child2)];
      if (at < 0 || base < 0) throw new Error("Supplied items must be elements of the same array");
      if (at > base) list.splice(base, 0, ...list.splice(at, 1));
    },
  };
  const add = {
    graphics: () => newGraphics(graphics),
    ...(texture === "none" ? {} : { renderTexture, image }),
    zone: (x: number, y: number, width: number, height: number) => {
      const z: FakeZone = { x, y, width, height, handlers: {}, destroyed: false };
      zones.push(z);
      const self: Record<string, unknown> = {
        setOrigin: () => self,
        setScrollFactor: () => self,
        setDepth: (d: number) => ((z.depth = d), self),
        // Phaser's setInteractive on an object already interactive only enables it again, its config kept
        // (Phaser 4.2.1 InputPlugin.enable)
        setInteractive: (o?: { useHandCursor?: boolean }) => (
          z.enabled === undefined && (z.handCursor = !!o?.useHandCursor), (z.enabled = true), self
        ),
        disableInteractive: (resetCursor?: boolean) => ((z.enabled = false), (z.cursorReset = !!resetCursor), self),
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
  const make = {
    graphics: (_config: object, addToScene?: boolean) => (madeAdded.push(addToScene), newGraphics(made)),
  };
  const scene = (texture === "none" ? { add } : { add, make, children }) as unknown as Phaser.Scene;
  const liveTexts = () => texts.filter((t) => !t.destroyed);
  /** The display list's records, in drawing order. */
  const order = () => list.map((o) => objectOf.get(o));
  return { scene, zones, graphics, made, madeAdded, textures, images, attempts, liveTexts, order };
}

function setup(icons?: CornerIconSpec[], texture: TextureMode = "none") {
  const stage = fakeScene(texture);
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
      expect(z.width).toBe(54);
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
    expect(env.zoneAt("menu").x).toBe(1280 - 16 - 54);
    expect(env.corner.covers(1230, 680)).toBe(true);
    // left of the leftmost plate drawn (Party, 1042–1096 at 1280)
    expect(env.corner.covers(1000, 680)).toBe(false);
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

  it("should draw the Inventory icon's rucksack apart from the Character icon's bust (R3; § Change: The inventory icon is a bronze knockout rucksack)", () => {
    const env = setup([{ icon: "inventory" }, { icon: "character" }]);
    const [bag, bust] = env.graphics;
    expect(bag.strokes).toContain(palette.interactable);
    expect(bag.calls).not.toEqual(bust.calls);
    // on a stand-in that cannot make its texture, the rucksack in lines: its ring a small circle,
    // never a head
    const circles = bag.ops.filter(({ m }) => m === "strokeCircle").map(({ args }) => args[2]);
    expect(circles.length).toBeGreaterThan(0);
    expect(circles.every((r) => r < 3)).toBe(true);
  });

  it("should say which points it covers, for the world's press to leave alone (R10)", () => {
    const env = setup();
    expect(env.corner.covers(1030, 680)).toBe(true);
    expect(env.corner.covers(800, 680)).toBe(false);
  });

  // FS-3EBCA R18 (owner 2026-11-12: "menu無法再按一次icon關閉"): the open menu's blocker lets the
  // Menu plate alone through, so the row says which points are that one plate's.
  it("should say which points one icon's plate covers, and no other's", () => {
    const env = setup();
    expect(env.corner.covers(1030, 680, "menu")).toBe(true);
    expect(env.corner.covers(1010, 658, "menu")).toBe(true);
    expect(env.corner.covers(969, 680, "menu")).toBe(false);
    expect(env.corner.covers(1002, 680, "menu")).toBe(false);
    expect(env.corner.covers(969, 680, "inventory")).toBe(true);
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

// FS-TQZ5J I-TQZ5J-3: the row stands in the UI scene, over what the world draws, so where the world
// keeps the screen the row holds the icons it names, as the world's own pieces over the row held them
// when the row was the world's: the town's dialogue every icon (its answers' hit areas lie under the
// row, until the dialogue moves, I-TQZ5J-7); the ESC menu, the UI scene's own since I-TQZ5J-4, holds
// them by its blocker in the same scene (FS-3EBCA R18). A held icon takes no hover,
// label, brightening or press, and Phaser hands its pointer on to the world under it.
describe("HudCorner held where the world keeps the screen (FS-3EBCA R18; FS-TQZ5J I-TQZ5J-3)", () => {
  const all = (): CornerIconSpec[] => [
    { icon: "menu", press: vi.fn() },
    { icon: "inventory", press: vi.fn() },
    { icon: "character", press: vi.fn() },
    { icon: "party", press: vi.fn() },
    { icon: "mail", greyed: true },
  ];
  const BUT_MENU = ["inventory", "character", "party", "mail"] as const;
  const EVERY = ["menu", ...BUT_MENU] as const;

  it("should hand Phaser's pointer on from each held icon, and take it back once let go", () => {
    const env = setup(all());
    env.corner.hold(BUT_MENU);
    for (const icon of BUT_MENU) expect(env.zoneAt(icon).enabled).toBe(false);
    expect(env.zoneAt("menu").enabled).toBe(true);

    env.corner.hold([]);
    for (const icon of EVERY) expect(env.zoneAt(icon).enabled).toBe(true);
    // the hand comes back with the plate: its config is kept
    expect(env.zoneAt("inventory").handCursor).toBe(true);
    expect(env.zoneAt("mail").handCursor).toBe(false);
  });

  it("should neither light, label nor press a held icon, and still light, label and press one not held", () => {
    const icons = all();
    const env = setup(icons);
    env.corner.hold(BUT_MENU);
    const strokes = () => env.graphics.flatMap((g) => g.strokes);

    env.zoneAt("inventory").handlers.pointerover();
    env.zoneAt("inventory").handlers.pointerdown();
    expect(strokes()).not.toContain(palette.interactableBright);
    expect(env.liveTexts()).toHaveLength(0);
    expect(icons[1].press).not.toHaveBeenCalled();

    env.zoneAt("menu").handlers.pointerover();
    env.zoneAt("menu").handlers.pointerdown();
    expect(strokes()).toContain(palette.interactableBright);
    expect(env.liveTexts().map((t) => t.words)).toEqual(["Menu (Esc)"]);
    expect(icons[0].press).toHaveBeenCalledTimes(1);
  });

  it("should hold Menu too when it is named: no hover, no label, no press, its pointer handed on", () => {
    const icons = all();
    const env = setup(icons);
    env.corner.hold(EVERY);

    env.zoneAt("menu").handlers.pointerover();
    env.zoneAt("menu").handlers.pointerdown();

    expect(env.zoneAt("menu").enabled).toBe(false);
    expect(env.liveTexts()).toHaveLength(0);
    expect(icons[0].press).not.toHaveBeenCalled();
  });

  it("should move the hold from one set to another: Menu let go as the rest stay held", () => {
    const env = setup(all());
    env.corner.hold(EVERY);
    env.corner.hold(BUT_MENU);

    expect(env.zoneAt("menu").enabled).toBe(true);
    expect(env.zoneAt("party").enabled).toBe(false);
  });

  it("should put out a lit icon and take its label down as the hold comes, the cursor given back for it alone", () => {
    const env = setup(all());
    env.zoneAt("party").handlers.pointerover();
    expect(env.liveTexts().map((t) => t.words)).toEqual(["Party (T)"]);

    env.corner.hold(BUT_MENU);

    expect(env.liveTexts()).toHaveLength(0);
    expect(env.graphics.flatMap((g) => g.strokes)).not.toContain(palette.interactableBright);
    expect(env.zoneAt("party").cursorReset).toBe(true);
    expect(env.zoneAt("inventory").cursorReset).toBe(false);
  });

  it("should answer a held icon again once let go", () => {
    const icons = all();
    const env = setup(icons);
    env.corner.hold(BUT_MENU);
    env.corner.hold([]);

    env.zoneAt("character").handlers.pointerover();
    env.zoneAt("character").handlers.pointerdown();

    expect(env.liveTexts().map((t) => t.words)).toEqual(["Character (C)"]);
    expect(icons[2].press).toHaveBeenCalledTimes(1);
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

// FS-J1672 (the owner, 2026-11-13: "把ui右下角的功能icon移除外匡"): the corner row's glyphs stand bare
// over the world, with no plate under them and nothing filled. I-J1672-1.
const FILLS = ["fillStyle", "fillRect", "fillRoundedRect", "fillCircle", "fillPath", "fillTriangle", "fillGradientStyle"];

describe("HudCorner (FS-J1672 R1–R3, R7: bare glyphs)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  const row = (): CornerIconSpec[] => [
    { icon: "menu" },
    { icon: "inventory" },
    { icon: "character" },
    { icon: "party" },
    { icon: "mail", greyed: true },
  ];

  it("should draw no plate and fill nothing under any icon, idle or under the pointer, on a stand-in with no texture (R1, R3)", () => {
    const env = setup(row());
    for (const icon of ["menu", "inventory", "character", "party", "mail"] as const) {
      env.zoneAt(icon).handlers.pointerover();
      env.zoneAt(icon).handlers.pointerout();
    }
    env.zoneAt("party").handlers.pointerover();
    for (const g of env.graphics) {
      expect(g.calls.filter((m) => FILLS.includes(m))).toEqual([]);
    }
  });

  // FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack, then FS-7TQN4 R1, R12 (the
  // whole row is knockout): each icon's silhouette is filled in its own texture and nowhere on the
  // row's graphics.
  it("should fill nothing on any icon's graphics where the row is knockout: each icon's fills only in what it draws into its own texture (R3; FS-7TQN4 R12)", () => {
    const env = setup(row(), "ok");
    for (const icon of ["menu", "inventory", "character", "party", "mail"] as const) {
      env.zoneAt(icon).handlers.pointerover();
      env.zoneAt(icon).handlers.pointerout();
    }
    for (const g of env.graphics) expect(g.calls.filter((m) => FILLS.includes(m))).toEqual([]);
    const solids = env.textures.map((t) => t.log.find((e) => e.m === "draw")!.g!);
    expect(env.textures).toHaveLength(5);
    for (const g of solids) expect(g.calls.some((m) => FILLS.includes(m))).toBe(true);
    expect(new Set(solids).size).toBe(5);
  });

  it("should stroke each graphics in its glyph's ink alone: no brass rule, no lit edge (R1, R2)", () => {
    const env = setup(row());
    const [menu, inventory, character, party, mail] = env.graphics;
    for (const g of [menu, inventory, character, party]) {
      expect(new Set(g.strokes)).toEqual(new Set([palette.interactable]));
      expect(new Set(g.alphas)).toEqual(new Set([0.85]));
    }
    expect(new Set(mail.strokes)).toEqual(new Set([palette.hudFaint]));
    expect(new Set(mail.alphas)).toEqual(new Set([0.6]));
  });

  it("should brighten a glyph to interactableBright at 1 under the pointer, and leave the greyed Mailbox as it was (R2)", () => {
    const env = setup(row());
    const [, , , party, mail] = env.graphics;
    env.zoneAt("party").handlers.pointerover();
    expect(new Set(party.strokes)).toEqual(new Set([palette.interactableBright]));
    expect(new Set(party.alphas)).toEqual(new Set([1]));
    const idleMail = [...mail.ops];
    env.zoneAt("mail").handlers.pointerover();
    expect(mail.ops).toEqual(idleMail);
  });

  it("should draw the greyed Mailbox with no seal, its flap lines meeting at the seal's old place as one path (R7; FS-QHN87 R6, R8)", () => {
    const env = setup([{ icon: "mail", greyed: true }]);
    const [mail] = env.graphics;
    const point = envelopeFlapPoint(cornerIconFrame("mail", viewport));
    expect(mail.calls).not.toContain("fillCircle");
    expect(mail.calls).not.toContain("strokeCircle");
    const at = (p: { x: number; y: number }) => p.x === point.x && p.y === point.y;
    const strokes = marks(mail).filter((k) => k.kind === "stroke");
    // the flap: one path, down to the point and up again, its point a vertex inside it
    expect(strokes.filter(({ points: ps }) => ps.length === 3 && at(ps[1]))).toHaveLength(1);
    expect(strokes.filter(({ points: ps }) => at(ps[0]) || at(ps[ps.length - 1]))).toEqual([]);
  });
});

// Helpers to read what a graphics lays down (first written for § Change: The inventory icon is an
// inked backpack, I-3EBCA-12).
interface Mark {
  kind: "fill" | "stroke";
  colour: number;
  alpha: number;
  /** The line's width; 0 for a fill. */
  width: number;
  points: { x: number; y: number }[];
}

/** What a graphics lays down, fill by fill and stroke by stroke, with the points each covers. */
function marks(g: FakeGraphics): Mark[] {
  const out: Mark[] = [];
  let line = { width: 1, colour: -1, alpha: 1 };
  let fill = { colour: -1, alpha: 1 };
  let path: { x: number; y: number }[] = [];
  const stroke = (points: { x: number; y: number }[]) =>
    out.push({ kind: "stroke", colour: line.colour, alpha: line.alpha, width: line.width, points });
  for (const { m, args } of g.ops) {
    if (m === "lineStyle") line = { width: args[0], colour: args[1], alpha: args[2] };
    else if (m === "fillStyle") fill = { colour: args[0], alpha: args[1] ?? 1 };
    else if (m === "beginPath") path = [];
    else if (m === "moveTo" || m === "lineTo") path.push({ x: args[0], y: args[1] });
    else if (m === "arc") {
      const [x, y, r, start, end] = args;
      for (let i = 0; i <= 32; i++) {
        const a = start + ((end - start) * i) / 32;
        path.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
    } else if (m === "fillPath") out.push({ kind: "fill", colour: fill.colour, alpha: fill.alpha, width: 0, points: [...path] });
    else if (m === "strokePath") stroke([...path]);
    else if (m === "lineBetween") stroke([{ x: args[0], y: args[1] }, { x: args[2], y: args[3] }]);
    else if (m === "strokeCircle") {
      const [x, y, r] = args;
      stroke([{ x: x - r, y: y - r }, { x: x + r, y: y + r }]);
    }
  }
  return out;
}

/** The box round everything drawn, a stroke's half width included. */
function boxOf(ms: Mark[]) {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { width, points } of ms) {
    for (const { x, y } of points) {
      left = Math.min(left, x - width / 2);
      right = Math.max(right, x + width / 2);
      top = Math.min(top, y - width / 2);
      bottom = Math.max(bottom, y + width / 2);
    }
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack (the owner, 2026-11-13:
// 「icon如果是實心 然後線條用穿透背景的方式呢」, 「背包我想改成那種比較圓的背包 目前有點太長」, 「背包兩側在加側袋」,
// then 「古銅反白好了」). I-3EBCA-14.
type P = { x: number; y: number };
const spanOf = (ps: P[]) => {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { left, right, top, bottom, width: right - left, height: bottom - top };
};
const inventorySlot = () => {
  const f = cornerIconFrame("inventory", viewport);
  return { f, cx: f.x + f.width / 2, cy: f.y + f.height / 2 };
};
const BRONZE = mix(palette.frame, palette.interactable, 0.5);
const BRONZE_LIT = mix(palette.frame, palette.interactableBright, 0.5);

const rgbOf = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
/** The colour an image's corner tints give at the screen height y: Phaser runs them across the quad. */
function tintAt(t: FakeTexture, y: number): number[] {
  const h = t.height * t.scale!;
  const u = (y - (t.y - h / 2)) / h;
  const [top, foot] = [rgbOf(t.tints![0]), rgbOf(t.tints![2])];
  return top.map((c, i) => c + u * (foot[i] - c));
}
/**
 * FS-S8Z2Y R4: the corner tints, the top two equal and the foot two equal, give `base` lifted 25%
 * toward the bright amber at the silhouette's top and shaded 20% at its foot, within 1 per channel.
 */
function expectLit(t: FakeTexture, base: number) {
  const [tl, tr, bl, br] = t.tints!;
  expect(tr).toBe(tl);
  expect(br).toBe(bl);
  const { box } = drawingOf(t);
  const within = (got: number[], want: number) =>
    got.forEach((c, i) => expect(Math.abs(c - rgbOf(want)[i])).toBeLessThanOrEqual(1));
  within(tintAt(t, box.top), mix(base, palette.interactableBright, 0.25));
  within(tintAt(t, box.bottom), shade(base, 0.2));
}
const FULL_ROW = (): CornerIconSpec[] => [
  { icon: "menu" },
  { icon: "inventory" },
  { icon: "character" },
  { icon: "party" },
  { icon: "mail", greyed: true },
];

/**
 * What was drawn into a texture, in logical px on the screen, as Phaser would show it: the image
 * centred on (t.x, t.y) at scale t.scale, each graphics at its own scale and position in it.
 */
function knockoutDrawing(t: FakeTexture) {
  const solid = t.log.find((e) => e.m === "draw")!.g!;
  const cut = t.log.find((e) => e.m === "erase")!.g!;
  const shown = (g: FakeGraphics) => (p: P): P => ({
    x: t.x + ((p.x * (g.scale ?? 1) + (g.x ?? 0)) - t.width / 2) * t.scale!,
    y: t.y + ((p.y * (g.scale ?? 1) + (g.y ?? 0)) - t.height / 2) * t.scale!,
  });
  const fills = marks(solid)
    .filter((k) => k.kind === "fill")
    .map((k) => k.points.map(shown(solid)));
  const cuts = linesOf(cut).map((l) => ({ closed: l.closed, points: l.points.map(shown(cut)) }));
  const rings = cut.ops
    .filter(({ m }) => m === "strokeCircle")
    .map(({ args: [x, y, r] }) => ({ ...shown(cut)({ x, y }), r: r * (cut.scale ?? 1) * t.scale! }));
  /** Each cut's line width in logical px. */
  const widths = cut.ops.filter(({ m }) => m === "lineStyle").map(({ args }) => args[0] * (cut.scale ?? 1) * t.scale!);
  // the silhouette's parts: the roll on top, a pocket at each side, the body the rest
  const box = spanOf(fills.flat());
  const spans = fills.map(spanOf);
  const roll = spans.find((s) => s.top === box.top)!;
  const pockets = spans.filter((s) => s !== roll && (s.left === box.left || s.right === box.right));
  const bodies = spans.filter((s) => s !== roll && !pockets.includes(s));
  return { solid, cut, fills, cuts, rings, widths, box, roll, pockets, bodies, body: bodies[0] };
}

describe("HudCorner (FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack, R1–R8)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  const knockout = (icons: CornerIconSpec[] = [{ icon: "inventory" }]) => {
    const env = setup(icons, "ok");
    const inventory = env.graphics[icons.findIndex((i) => i.icon === "inventory")];
    return { ...env, inventory };
  };

  it.each([1, 1.5, 2])(
    "should make Inventory's texture, one of the field row's five (FS-7TQN4 R12), at render scale %s: depth 1000, scroll factor 0, on the slot's centre, the slot × 2·renderScale, shown at 1/k (R6)",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const env = knockout(FULL_ROW());
      const { f, cx, cy } = inventorySlot();
      const k = 2 * renderScale;
      expect(env.textures).toHaveLength(5);
      const t = env.textures.find((x) => x.x === cx && x.y === cy)!;
      expect(t).toMatchObject({
        x: cx,
        y: cy,
        width: Math.round(f.width * k),
        height: Math.round(f.height * k),
        depth: 1000,
        scrollFactor: 0,
      });
      expect(t.scale).toBeCloseTo(1 / k, 12);
      // the icon's own graphics draws nothing while the texture stands
      expect(env.inventory.ops).toEqual([]);
    },
  );

  it("should fill the silhouette white at 1, then erase its cuts, every one 1.6 logical px, then render it once, and destroy what it drew with (R3, R4, R6)", () => {
    const env = knockout();
    const [t] = env.textures;
    expect(t.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
    const { solid, cut, widths } = knockoutDrawing(t);
    // the silhouette: fills alone, in TINT_IDENTITY at 1, no gradient, no line
    expect(new Set(solid.calls)).toEqual(new Set(["fillStyle", "beginPath", "moveTo", "lineTo", "closePath", "fillPath"]));
    for (const { args } of solid.ops.filter(({ m }) => m === "fillStyle")) expect(args).toEqual([TINT_IDENTITY, 1]);
    // the cuts: strokes alone, in TINT_IDENTITY at 1, each one stroke or one path, never a lineBetween
    expect(cut.calls.filter((m) => FILLS.includes(m))).toEqual([]);
    expect(cut.calls).not.toContain("lineBetween");
    expect(new Set(cut.strokes)).toEqual(new Set([TINT_IDENTITY]));
    expect(new Set(cut.alphas)).toEqual(new Set([1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeCloseTo(1.6, 9);
    // drawn off the display list, and gone once the texture is rendered
    expect(env.made).toEqual([solid, cut]);
    expect(env.madeAdded).toEqual([false, false]);
    expect(env.made.every((g) => g.destroyed)).toBe(true);
  });

  it("should be a round rucksack, wider than tall: 36–42 by 28–34, centred on its slot within 1 px, inside it (R1, R2)", () => {
    const env = knockout();
    const { f, cx, cy } = inventorySlot();
    const { box } = knockoutDrawing(env.textures[0]);
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.width).toBeLessThanOrEqual(42);
    expect(box.height).toBeGreaterThanOrEqual(28);
    expect(box.height).toBeLessThanOrEqual(34);
    expect(box.width).toBeGreaterThan(box.height);
    expect(Math.abs((box.left + box.right) / 2 - cx)).toBeLessThanOrEqual(1);
    expect(Math.abs((box.top + box.bottom) / 2 - cy)).toBeLessThanOrEqual(1);
    expect(box.left).toBeGreaterThanOrEqual(f.x);
    expect(box.right).toBeLessThanOrEqual(f.x + f.width);
    expect(box.top).toBeGreaterThanOrEqual(f.y);
    expect(box.bottom).toBeLessThanOrEqual(f.y + f.height);
  });

  it("should lay a bedroll across the top, half to all of the body's width, over a body with a low pocket at each side (R1)", () => {
    const env = knockout();
    const { fills, box, roll, pockets, bodies, body } = knockoutDrawing(env.textures[0]);
    expect(fills).toHaveLength(4);
    expect(bodies).toHaveLength(1);
    expect(roll.top).toBe(box.top);
    expect(roll.width).toBeGreaterThanOrEqual(body.width / 2);
    expect(roll.width).toBeLessThanOrEqual(body.width);
    // the pockets: the silhouette's left and right, low on the body, no taller than a third of it
    expect(pockets).toHaveLength(2);
    expect(pockets.map((p) => p.left === box.left || p.right === box.right)).toEqual([true, true]);
    expect(pockets.some((p) => p.left === box.left)).toBe(true);
    expect(pockets.some((p) => p.right === box.right)).toBe(true);
    for (const p of pockets) {
      expect(p.top).toBeGreaterThan((body.top + body.bottom) / 2);
      expect(p.height).toBeLessThanOrEqual(box.height / 3);
      // standing out past the body's side
      expect(p.left < body.left || p.right > body.right).toBe(true);
    }
  });

  it("should be mirror-symmetric, left for right, within 0.01 px (R1)", () => {
    const env = knockout();
    const { fills, box } = knockoutDrawing(env.textures[0]);
    const mid = (box.left + box.right) / 2;
    const points = fills.flat();
    for (const p of points) {
      expect(points.some((q) => Math.abs(q.x - (2 * mid - p.x)) < 0.01 && Math.abs(q.y - p.y) < 0.01)).toBe(true);
    }
  });

  it("should cut the flap's edge across the body, two roll ties, the roll's closed end and its seam with the body (R4)", () => {
    const env = knockout();
    const { cuts, roll, body } = knockoutDrawing(env.textures[0]);
    const open = cuts.filter((c) => !c.closed);
    // the flap: a curve from one side of the body to the other, lowest in the middle
    const flap = open.find((c) => {
      const s = spanOf(c.points);
      const [a, b] = [c.points[0], c.points[c.points.length - 1]];
      return Math.abs(a.y - b.y) < 0.01 && s.width >= 0.8 * body.width && s.bottom - a.y > 3;
    });
    expect(flap).toBeDefined();
    const lowest = flap!.points.reduce((a, b) => (b.y > a.y ? b : a));
    expect(Math.abs(lowest.x - (body.left + body.right) / 2)).toBeLessThan(0.5);
    // the ties: round the roll from its top to its bottom
    const ties = open.filter((c) => {
      const s = spanOf(c.points);
      return s.width < 2 && Math.abs(s.top - roll.top) < 0.01 && Math.abs(s.bottom - roll.bottom) < 0.01;
    });
    expect(ties).toHaveLength(2);
    // the rolled end: a closed oval at the roll's right, as tall as the roll
    const end = cuts.find((c) => {
      const s = spanOf(c.points);
      return c.closed && s.left > (roll.left + roll.right) / 2 && Math.abs(s.height - roll.height) < 0.1;
    });
    expect(end).toBeDefined();
    // the seam: level along the roll's foot, more than half its width
    const seam = open.find((c) => c.points.every((p) => Math.abs(p.y - roll.bottom) < 0.01) && spanOf(c.points).width > roll.width / 2);
    expect(seam).toBeDefined();
  });

  it("should cut a hasp from the flap's lowest point, shut on a ring of radius 1.5–2.5 below it (R4)", () => {
    const env = knockout();
    const { cuts, rings, body } = knockoutDrawing(env.textures[0]);
    const mid = (body.left + body.right) / 2;
    const flap = cuts
      .filter((c) => !c.closed)
      .map((c) => spanOf(c.points))
      .reduce((a, b) => (b.width > a.width ? b : a));
    const ring = rings.find((r) => r.r >= 1.5 && r.r <= 2.5)!;
    expect(ring).toBeDefined();
    expect(ring.y - ring.r).toBeGreaterThan(flap.bottom);
    expect(Math.abs(ring.x - mid)).toBeLessThan(0.5);
    const hasp = cuts
      .map((c) => spanOf(c.points))
      .find((s) => s.width < 5 && s.top >= flap.bottom - 1.5 && s.top < flap.bottom && s.bottom <= ring.y && Math.abs((s.left + s.right) / 2 - mid) < 0.5);
    expect(hasp).toBeDefined();
  });

  it("should cut each pocket's flap and its seam with the body (R4)", () => {
    const env = knockout();
    const { cuts, pockets } = knockoutDrawing(env.textures[0]);
    for (const p of pockets) {
      const within = cuts.filter((c) =>
        c.points.every((q) => q.x >= p.left - 0.5 && q.x <= p.right + 0.5 && q.y >= p.top - 0.5 && q.y <= p.bottom + 0.5),
      );
      expect(within.length).toBeGreaterThanOrEqual(2);
      // the flap across it, the seam the rest
      expect(within.some((c) => spanOf(c.points).width >= 0.8 * p.width)).toBe(true);
    }
  });

  it("should tint it bronze at 0.85, lifted toward the bright amber at 1 under the pointer, with no new texture and nothing drawn (R3, R5)", () => {
    const env = knockout([{ icon: "inventory", press: vi.fn() }]);
    const [t] = env.textures;
    // lit from above (FS-S8Z2Y R4, R5)
    expectLit(t, BRONZE);
    expect(t.alpha).toBe(0.85);
    env.zoneAt("inventory").handlers.pointerover();
    expectLit(t, BRONZE_LIT);
    expect(t.alpha).toBe(1);
    expect(env.liveTexts().map((x) => x.words)).toEqual(["Inventory (I)"]);
    env.zoneAt("inventory").handlers.pointerout();
    expectLit(t, BRONZE);
    expect(t.alpha).toBe(0.85);
    expect(env.textures).toHaveLength(1);
    expect(t.log).toHaveLength(3);
    expect(env.made).toHaveLength(2);
    expect(env.inventory.ops).toEqual([]);
  });

  it("should move to the slot's new centre on a relayout to 1280, with no new texture: a width change builds nothing (R2, R7)", () => {
    const env = knockout();
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.corner.relayout();
    const { cx, cy } = inventorySlot();
    expect(env.textures).toHaveLength(1);
    expect(env.textures[0]).toMatchObject({ x: cx, y: cy, destroyed: false });
    expect(env.made).toHaveLength(2);
  });

  it("should build anew at k = 4 when the render scale goes from 1 to 2, destroying the old, and keep the pointer's tint (R7)", () => {
    const env = knockout();
    env.zoneAt("inventory").handlers.pointerover();
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    const { f, cx, cy } = inventorySlot();
    expect(env.textures).toHaveLength(2);
    const [old, now] = env.textures;
    expect(old.destroyed).toBe(true);
    expect(now).toMatchObject({ x: cx, y: cy, width: Math.round(f.width * 4), height: Math.round(f.height * 4), depth: 1000 });
    expect(now.scale).toBeCloseTo(1 / 4, 12);
    expect(now.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
    expect(now.alpha).toBe(1);
    expectLit(now, BRONZE_LIT);
    expect(env.made.every((g) => g.destroyed)).toBe(true);
    expect(env.liveTexts().map((x) => x.words)).toEqual(["Inventory (I)"]);
    // the drawing is the same in logical px
    const was = knockoutDrawing(old);
    const is = knockoutDrawing(now);
    expect(is.box.width).toBeCloseTo(was.box.width, 9);
    expect(is.box.height).toBeCloseTo(was.box.height, 9);
    for (const w of is.widths) expect(w).toBeCloseTo(1.6, 9);
  });

  it("should take the texture down with the row and stop watching the view: a later render-scale change builds nothing (R8)", () => {
    const env = knockout();
    env.corner.destroy();
    expect(env.textures[0].destroyed).toBe(true);
    expect(() => viewport.set({ width: 1080, height: 720, renderScale: 2 })).not.toThrow();
    expect(env.textures).toHaveLength(1);
    expect(env.attempts.renderTexture).toBe(1);
  });
});

describe("HudCorner (FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack, R9: the fallback in lines)", () => {
  afterEach(() => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    vi.restoreAllMocks();
  });

  const lines = (texture: "none" | "throws") => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = setup([{ icon: "inventory", press: vi.fn() }], texture);
    return { ...env, g: env.graphics[0], warn };
  };

  it.each(["none", "throws"] as const)(
    "should stroke the rucksack in the row's lines alone, GLYPH_LINE_W wide, amber at 0.85, bright at 1 under the pointer with every point kept (texture: %s)",
    (texture) => {
      const { g, zoneAt, textures } = lines(texture);
      expect(textures).toEqual([]);
      expect(g.calls.filter((m) => FILLS.includes(m))).toEqual([]);
      expect(new Set(g.ops.filter(({ m }) => m === "lineStyle").map(({ args }) => args[0]))).toEqual(new Set([GLYPH_LINE_W]));
      expect(new Set(g.strokes)).toEqual(new Set([palette.interactable]));
      expect(new Set(g.alphas)).toEqual(new Set([0.85]));
      const idle = g.ops.filter(({ m }) => m !== "lineStyle");
      zoneAt("inventory").handlers.pointerover();
      expect(new Set(g.strokes)).toEqual(new Set([palette.interactableBright]));
      expect(new Set(g.alphas)).toEqual(new Set([1]));
      expect(g.ops.filter(({ m }) => m !== "lineStyle")).toEqual(idle);
    },
  );

  it.each(["none", "throws"] as const)("should draw a bedroll on top, a flap, a ring and a pocket at each side (texture: %s)", (texture) => {
    const { g } = lines(texture);
    const { cx } = inventorySlot();
    const all = linesOf(g);
    const box = spanOf(all.flatMap((l) => l.points));
    // the bedroll: a closed outline whose top is the drawing's top
    expect(all.some((l) => l.closed && spanOf(l.points).top === box.top && spanOf(l.points).width > 15)).toBe(true);
    // the flap: a wide curve, its two ends level and well above its lowest point
    expect(
      all.some((l) => {
        const s = spanOf(l.points);
        const [a, b] = [l.points[0], l.points[l.points.length - 1]];
        return !l.closed && s.width > 20 && Math.abs(a.y - b.y) < 0.01 && s.bottom - a.y > 3;
      }),
    ).toBe(true);
    const ring = g.ops.filter(({ m }) => m === "strokeCircle").map(({ args }) => args[2]);
    expect(ring.some((r) => r >= 1.5 && r <= 2.5)).toBe(true);
    // the pockets: lines standing out past the body at each side
    expect(all.some((l) => spanOf(l.points).left < cx - 16)).toBe(true);
    expect(all.some((l) => spanOf(l.points).right > cx + 16)).toBe(true);
  });

  it.each(["none", "throws"] as const)(
    "should stand 36–44 by 28–36, its line's half width included, centred on its slot within 1 px, before and after a relayout to 1280 (texture: %s)",
    (texture) => {
      const { g, corner } = lines(texture);
      for (const width of [1080, 1280]) {
        viewport.set({ width, height: 720, renderScale: 1 });
        corner.relayout();
        const { cx, cy } = inventorySlot();
        const box = boxOf(marks(g));
        expect(box.width).toBeGreaterThanOrEqual(36);
        expect(box.width).toBeLessThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(28);
        expect(box.height).toBeLessThanOrEqual(36);
        expect(Math.abs((box.left + box.right) / 2 - cx)).toBeLessThanOrEqual(1);
        expect(Math.abs((box.top + box.bottom) / 2 - cy)).toBeLessThanOrEqual(1);
      }
    },
  );

  it("should try the texture once where making it throws, say so, and keep the lines on a later render-scale change", () => {
    const { g, attempts, warn } = lines("throws");
    expect(attempts.renderTexture).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(attempts.renderTexture).toBe(1);
    expect(g.strokes.length).toBeGreaterThan(0);
    expect(g.calls.filter((m) => FILLS.includes(m))).toEqual([]);
  });
});

describe("HudCorner (FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack, R11, R12: the rest stays)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // FS-7TQN4 (the whole row is knockout) replaces R11 here: the four are knockouts too where the
  // scene can make their textures, and today's line glyphs where it cannot (R15).
  it("should draw Menu, Character, Party and the greyed Mailbox the same, op for op, where no texture can be made or making one throws (FS-7TQN4 R15)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const plain = setup(FULL_ROW(), "none");
    const thrown = setup(FULL_ROW(), "throws");
    for (const i of [0, 2, 3, 4]) {
      expect(thrown.graphics[i].ops).toEqual(plain.graphics[i].ops);
      expect(thrown.graphics[i].ops.length).toBeGreaterThan(0);
      expect(thrown.graphics[i].depth).toBe(1000);
    }
  });

  it.each(["none", "ok", "throws"] as const)(
    "should keep the Inventory zone, hand cursor, covers, press and label, and take everything down with destroy (texture: %s)",
    (texture) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const press = vi.fn();
      const env = setup([{ icon: "inventory", press }], texture);
      const f = cornerIconFrame("inventory", viewport);
      const z = env.zoneAt("inventory");
      expect(z).toMatchObject({ x: f.x, y: f.y, width: f.width, height: f.height, handCursor: true, depth: 1000 });
      expect(env.corner.covers(f.x + 1, f.y + 1, "inventory")).toBe(true);
      expect(env.corner.covers(f.x + f.width - 1, f.y + f.height - 1, "inventory")).toBe(true);
      z.handlers.pointerdown();
      expect(press).toHaveBeenCalledTimes(1);
      z.handlers.pointerover();
      expect(env.liveTexts().map((t) => t.words)).toEqual(["Inventory (I)"]);
      env.corner.destroy();
      expect(env.graphics.every((g) => g.destroyed)).toBe(true);
      expect(env.zones.every((zz) => zz.destroyed)).toBe(true);
      expect(env.textures.every((t) => t.destroyed)).toBe(true);
      expect(env.liveTexts()).toHaveLength(0);
    },
  );
});

// FS-QHN87 (the owner, 2026-11-13: 「icon感覺有點空 不是指背包是所有icon」): richer glyphs in one sturdier
// line. I-QHN87-1.
describe("HudCorner (FS-QHN87 R1: one line width)", () => {
  it("should name the width once, 2.25, over the renderer's 2 px join threshold", () => {
    expect(GLYPH_LINE_W).toBe(2.25);
  });

  it("should stroke every glyph of the row, the greyed Mailbox's and the Inventory's line fallback included, at GLYPH_LINE_W alone, idle and hovered", () => {
    const env = setup([
      { icon: "menu" },
      { icon: "inventory" },
      { icon: "character" },
      { icon: "party" },
      { icon: "mail", greyed: true },
    ]);
    const widths = () =>
      env.graphics.map((g) => new Set(g.ops.filter(({ m }) => m === "lineStyle").map(({ args }) => args[0])));
    for (const w of widths()) expect(w).toEqual(new Set([GLYPH_LINE_W]));
    for (const icon of ["menu", "inventory", "character", "party", "mail"] as const) env.zoneAt(icon).handlers.pointerover();
    for (const w of widths()) expect(w).toEqual(new Set([GLYPH_LINE_W]));
  });
});

/** A stroke's polyline, as `marks` reads it, and whether its path was closed. */
interface Line {
  points: { x: number; y: number }[];
  closed: boolean;
}

/** Every stroked polyline of a graphics: each path (closed or not) and each line; circles apart. */
function linesOf(g: FakeGraphics): Line[] {
  const out: Line[] = [];
  let path: { x: number; y: number }[] = [];
  let closed = false;
  for (const { m, args } of g.ops) {
    if (m === "beginPath") (path = []), (closed = false);
    else if (m === "moveTo" || m === "lineTo") path.push({ x: args[0], y: args[1] });
    else if (m === "arc") {
      const [x, y, r, start, end] = args;
      for (let i = 0; i <= 32; i++) {
        const a = start + ((end - start) * i) / 32;
        path.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
    } else if (m === "closePath") (closed = true), path.push(path[0]);
    else if (m === "strokePath") out.push({ points: path, closed }), (path = []);
    else if (m === "lineBetween") out.push({ points: [{ x: args[0], y: args[1] }, { x: args[2], y: args[3] }], closed: false });
  }
  return out;
}

/** Whether (x, y) lies inside the polygon `ps`. */
function inside(ps: { x: number; y: number }[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Today's (f779a9b0) bust box, half its 1.5 px line included, for a bust of scale s at (cx, cy). */
const bustBox = (cx: number, cy: number, s: number) => ({
  left: cx - 11 * s - 0.75,
  right: cx + 11 * s + 0.75,
  top: cy - 11 * s - 0.75,
  bottom: cy + 12 * s + 0.75,
});
const centreOf = (b: { left: number; right: number; top: number; bottom: number }) => ({
  x: (b.left + b.right) / 2,
  y: (b.top + b.bottom) / 2,
});

describe("HudCorner (FS-QHN87 R2: no notches)", () => {
  // Phaser 4.2.1 joins a path's segments when its line is over 2 px, never two separate strokes:
  // an angled corner made of two strokes meeting end to end shows a notch.
  const angle = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);
  /** At each open end of a stroke: the point, and the direction the stroke leaves it in. */
  const endsOf = (l: Line) => {
    const ps = l.points;
    if (l.closed || ps.length < 2) return [];
    return [
      { at: ps[0], dir: angle(ps[0], ps[1]) },
      { at: ps[ps.length - 1], dir: angle(ps[ps.length - 1], ps[ps.length - 2]) },
    ];
  };
  /** Pairs of open stroke ends meeting at one point at an angle: no straight run through it. */
  const notches = (g: FakeGraphics, only = (_l: Line) => true) => {
    const ends = linesOf(g).filter(only).flatMap((l, i) => endsOf(l).map((e) => ({ ...e, i })));
    const out: string[] = [];
    for (let a = 0; a < ends.length; a++) {
      for (let b = a + 1; b < ends.length; b++) {
        const [p, q] = [ends[a], ends[b]];
        if (Math.hypot(p.at.x - q.at.x, p.at.y - q.at.y) > 0.05) continue;
        // two ends running on straight through the point leave in opposite directions
        const turn = Math.abs(((p.dir - q.dir + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        if (turn > (15 * Math.PI) / 180) out.push(`${p.i}/${q.i} at ${p.at.x.toFixed(2)},${p.at.y.toFixed(2)}`);
      }
    }
    return out;
  };

  it("should draw no angled corner of Menu, Character, Party or either Mailbox as two strokes meeting end to end", () => {
    const env = setup([{ icon: "menu" }, { icon: "character" }, { icon: "party" }, { icon: "mail", greyed: true }]);
    for (const g of env.graphics) expect(notches(g)).toEqual([]);
  });

  // FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack, R9: the rucksack in lines,
  // where the scene cannot make its texture.
  it.each(["none", "throws"] as const)(
    "should draw no angled corner of the Inventory's line rucksack as two strokes meeting end to end (texture: %s)",
    (texture) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const env = setup([{ icon: "inventory" }], texture);
      expect(env.graphics[0].calls).not.toContain("lineBetween");
      expect(notches(env.graphics[0])).toEqual([]);
      warn.mockRestore();
    },
  );
});

describe("HudCorner (FS-QHN87 R3: a riveted gear)", () => {
  const gear = () => {
    const env = setup([{ icon: "menu" }]);
    const f = cornerIconFrame("menu", viewport);
    return { g: env.graphics[0], cx: f.x + f.width / 2, cy: f.y + f.height / 2 };
  };

  it("should draw eight bevelled teeth and the rim between them as one closed outline", () => {
    const { g, cx, cy } = gear();
    const outlines = linesOf(g).filter((l) => l.closed);
    expect(outlines).toHaveLength(1);
    const ps = outlines[0].points.slice(0, -1);
    const r = (p: { x: number; y: number }) => Math.hypot(p.x - cx, p.y - cy);
    const tip = Math.max(...ps.map(r));
    const root = Math.min(...ps.map(r));
    expect(tip - root).toBeGreaterThan(2.5);
    // the teeth: runs of the outline at its tip radius, two corners each, wider at the root
    const isTip = (p: { x: number; y: number }) => r(p) > tip - 0.01;
    const start = ps.findIndex((p) => !isTip(p));
    const round = [...ps.slice(start), ...ps.slice(0, start)];
    const teeth: number[][] = [];
    round.forEach((p, i) => {
      if (!isTip(p)) return;
      if (i > 0 && isTip(round[i - 1])) teeth[teeth.length - 1].push(i);
      else teeth.push([i]);
    });
    expect(teeth).toHaveLength(8);
    for (const t of teeth) {
      expect(t).toHaveLength(2);
      const [a, b] = [round[t[0]], round[t[1]]];
      const [ra, rb] = [round[t[0] - 1], round[(t[1] + 1) % round.length]];
      const width = Math.hypot(a.x - b.x, a.y - b.y);
      const rootWidth = Math.hypot(ra.x - rb.x, ra.y - rb.y);
      expect(width).toBeGreaterThan(0.5);
      expect(width).toBeLessThan(rootWidth);
      // the flanks come down to the rim
      expect(r(ra)).toBeLessThan(tip - 2.5);
      expect(r(rb)).toBeLessThan(tip - 2.5);
    }
  });

  it("should set an inner ring at the hub, a little larger than today's, with 4–6 rivets evenly spaced, centred on its line", () => {
    const { g, cx, cy } = gear();
    const circles = g.ops.filter(({ m }) => m === "strokeCircle").map(({ args: [x, y, r] }) => ({ x, y, r }));
    const rings = circles.filter((c) => Math.abs(c.x - cx) < 1e-9 && Math.abs(c.y - cy) < 1e-9 && c.r > 3.5 && c.r < 8);
    expect(rings).toHaveLength(1);
    const [ring] = rings;
    const rivets = circles.filter((c) => c !== ring);
    expect(rivets.length).toBeGreaterThanOrEqual(4);
    expect(rivets.length).toBeLessThanOrEqual(6);
    for (const v of rivets) {
      expect(v.r).toBeLessThan(2);
      expect(Math.hypot(v.x - cx, v.y - cy)).toBeCloseTo(ring.r, 9);
    }
    const angles = rivets.map((v) => Math.atan2(v.y - cy, v.x - cx)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => ((i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI) - a));
    for (const gap of gaps) expect(gap).toBeCloseTo((2 * Math.PI) / rivets.length, 9);
  });
});

// FS-QHN87 round 1 (the owner, 2026-11-13: 「組隊跟角色雖然是斗篷 但不知道的會覺得怪 不要斗篷了」): the
// Character icon is a bust again, a head over the shoulders, now with a pair of pauldrons and a
// collar; Party is two of them.

/** A bust's own geometry at scale s on (cx, cy), as today's (f779a9b0) bust stood it. */
const shouldersOf = (cx: number, cy: number, s: number) => ({ x: cx, y: cy + 12 * s, r: 11 * s });

/** A bust's parts, read from its strokes: head, shoulders' line, collar, strap, buckle and rivets. */
function bustParts(g: FakeGraphics, cx: number, cy: number, s: number) {
  const sh = shouldersOf(cx, cy, s);
  const off = (p: { x: number; y: number }) => Math.hypot(p.x - sh.x, p.y - sh.y) - sh.r;
  const circles = g.ops.filter(({ m }) => m === "strokeCircle").map(({ args: [x, y, r] }) => ({ x, y, r }));
  const heads = circles.filter((c) => c.r > 2);
  const rivets = circles.filter((c) => c.r <= 2);
  const lines = linesOf(g);
  const at = (p: { x: number; y: number }, x: number, y: number) => Math.hypot(p.x - x, p.y - y) < 0.05;
  // the shoulders' line: the one running from the left arm's foot to the right's
  const shoulder = lines.filter((l) => at(l.points[0], cx - sh.r, sh.y) && at(l.points[l.points.length - 1], cx + sh.r, sh.y));
  const straps = lines.filter((l) => !l.closed && l.points.length === 2);
  const buckles = lines.filter((l) => l.closed);
  const collars = lines.filter((l) => !shoulder.includes(l) && !straps.includes(l) && !buckles.includes(l));
  return { sh, off, heads, rivets, shoulder, straps, buckles, collars };
}

/** How far `p` stands from the line through a and b. */
const fromLine = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);

// FS-QHN87 round 2 (the owner, 2026-11-13: 「組隊畫三個上半身頭像 角色畫一個上半身頭像 加一點細節」).
describe("HudCorner (FS-QHN87 round 2: Character, one bust with a little more detail)", () => {
  const bust = () => {
    const env = setup([{ icon: "character" }]);
    const f = cornerIconFrame("character", viewport);
    const [cx, cy] = [f.x + f.width / 2, f.y + f.height / 2 + 1];
    return { g: env.graphics[0], cx, cy, parts: bustParts(env.graphics[0], cx, cy, 1) };
  };

  it("should draw a head over the shoulders' line, with nothing in the head: no face", () => {
    const { g, cx, parts } = bust();
    expect(parts.heads).toHaveLength(1);
    const [head] = parts.heads;
    expect(head.x).toBe(cx);
    expect(head.r).toBeGreaterThan(4);
    expect(head.r).toBeLessThan(6);
    // the head stands clear over the shoulders' top, a line's width and more
    expect(head.y + head.r + GLYPH_LINE_W).toBeLessThan(parts.sh.y - parts.sh.r + 1);
    // the shoulders: one line from arm to arm over the top of their curve
    expect(parts.shoulder).toHaveLength(1);
    expect(parts.shoulder[0].points.some((p) => Math.hypot(p.x - cx, p.y - (parts.sh.y - parts.sh.r)) < 0.05)).toBe(true);
    // no face: nothing else inside the head
    const points = linesOf(g).flatMap((l) => l.points);
    expect(points.filter((p) => Math.hypot(p.x - head.x, p.y - head.y) < head.r)).toEqual([]);
    expect(parts.rivets.filter((r) => Math.hypot(r.x - head.x, r.y - head.y) < head.r)).toEqual([]);
  });

  it("should round a pauldron over each shoulder: the shoulders' line standing out over each, one each side, mirrored", () => {
    const { cx, parts } = bust();
    const [line] = parts.shoulder;
    for (const side of [-1, 1]) {
      const plate = line.points.filter((p) => Math.sign(p.x - cx) === side && parts.off(p) > 0.05);
      expect(Math.max(...plate.map(parts.off))).toBeGreaterThanOrEqual(2.5);
      for (const p of plate) expect(Math.abs(p.x - cx)).toBeGreaterThan(3);
    }
    for (const p of line.points.filter((q) => Math.abs(q.x - cx) < 3)) expect(Math.abs(parts.off(p))).toBeLessThan(0.05);
    for (const p of line.points) {
      expect(line.points.some((q) => Math.hypot(2 * cx - p.x - q.x, p.y - q.y) < 1e-6)).toBe(true);
    }
  });

  it("should sling a strap from the left shoulder by the neck down across the chest to the foot", () => {
    const { cx, parts } = bust();
    expect(parts.straps).toHaveLength(1);
    const [from, to] = parts.straps[0].points.slice().sort((a, b) => a.y - b.y);
    // from the shoulders' line, left of the neck; to the foot, right of the middle
    expect(Math.abs(parts.off(from))).toBeLessThan(0.05);
    expect(from.x).toBeLessThan(cx - 3);
    expect(to.y).toBeCloseTo(parts.sh.y, 9);
    expect(to.x).toBeGreaterThan(cx + 3);
    const slant = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    expect(slant).toBeGreaterThan(25);
    expect(slant).toBeLessThan(60);
    // the strap takes the collar's place
    expect(parts.collars).toEqual([]);
  });

  it("should set a buckle on the strap: a small frame the ground shows through, on the strap's line", () => {
    const { parts } = bust();
    expect(parts.buckles).toHaveLength(1);
    const corners = parts.buckles[0].points.slice(0, -1);
    expect(corners).toHaveLength(4);
    const [a, b] = parts.straps[0].points;
    const mid = { x: corners.reduce((s, p) => s + p.x, 0) / 4, y: corners.reduce((s, p) => s + p.y, 0) / 4 };
    expect(fromLine(mid, a, b)).toBeLessThan(0.01);
    const sides = corners.map((p, i) => Math.hypot(p.x - corners[(i + 1) % 4].x, p.y - corners[(i + 1) % 4].y));
    // wide enough that a frame shows round a hole, small enough to be a buckle
    for (const side of sides) {
      expect(side).toBeGreaterThan(GLYPH_LINE_W + 1.5);
      expect(side).toBeLessThan(7);
    }
  });

  it("should set a rivet on each pauldron, just inside the shoulders' curve under it, mirrored", () => {
    const { cx, parts } = bust();
    expect(parts.rivets).toHaveLength(2);
    const [l, r] = parts.rivets.slice().sort((a, b) => a.x - b.x);
    expect(l.x - cx).toBeCloseTo(cx - r.x, 9);
    expect(l.y).toBeCloseTo(r.y, 9);
    for (const v of [l, r]) {
      expect(v.r).toBeLessThan(1);
      expect(Math.abs(v.x - cx)).toBeGreaterThan(6);
      expect(parts.off(v)).toBeLessThan(0);
      expect(parts.off(v)).toBeGreaterThan(-3);
    }
  });

  it("should fill nothing and keep today's bust's place and size: within 3 px each way, centred within 1 px", () => {
    const { g, cx, cy } = bust();
    expect(g.calls.filter((m) => FILLS.includes(m))).toEqual([]);
    const box = boxOf(marks(g));
    const was = bustBox(cx, cy, 1);
    expect(Math.abs(box.width - (was.right - was.left))).toBeLessThanOrEqual(3);
    expect(Math.abs(box.height - (was.bottom - was.top))).toBeLessThanOrEqual(3);
    expect(Math.abs(centreOf(box).x - centreOf(was).x)).toBeLessThanOrEqual(1);
    expect(Math.abs(centreOf(box).y - centreOf(was).y)).toBeLessThanOrEqual(1);
  });
});

describe("HudCorner (FS-QHN87 round 2: Party, three busts)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  const party = () => {
    const env = setup([{ icon: "party" }]);
    const f = cornerIconFrame("party", viewport);
    return { g: env.graphics[0], f, corner: env.corner, cx: f.x + f.width / 2, cy: f.y + f.height / 2 };
  };
  /** One bust drawn alone, through the row's own drawing, at (x, y) and scale s. */
  const alone = (x: number, y: number, s: number, dress?: BustDress) => {
    const rec = fakeScene();
    const g = rec.scene.add.graphics() as unknown as Parameters<typeof drawBust>[0];
    drawBust(g, x, y, s, palette.interactable, 0.85, dress);
    return rec.graphics[0];
  };
  const [frontAt, ...backAt] = [PARTY_BUSTS.front, ...PARTY_BUSTS.back];

  it("should stand one bust in front in the middle and two behind it, one each side, higher and smaller", () => {
    expect(frontAt.dx).toBe(0);
    expect(backAt).toHaveLength(2);
    expect(backAt.map((b) => Math.sign(b.dx)).sort()).toEqual([-1, 1]);
    expect(backAt[0].dx).toBe(-backAt[1].dx);
    for (const b of backAt) {
      expect(b.dy).toBeLessThan(frontAt.dy);
      expect(b.s).toBeLessThan(frontAt.s);
    }
  });

  it("should draw the front bust last and whole, with its collar", () => {
    const { g, cx, cy } = party();
    const front = alone(cx + frontAt.dx, cy + frontAt.dy, frontAt.s).ops;
    expect(g.ops.slice(g.ops.length - front.length)).toEqual(front);
    expect(bustParts(alone(cx, cy, frontAt.s), cx, cy, frontAt.s).collars).toHaveLength(1);
  });

  it("should leave the busts behind undrawn where the front one covers them, and draw the rest of them", () => {
    const { g, cx, cy } = party();
    const fx = cx + frontAt.dx;
    const fy = cy + frontAt.dy;
    const front = alone(fx, fy, frontAt.s);
    const frontParts = bustParts(front, fx, fy, frontAt.s);
    const [head] = frontParts.heads;
    const covered = (p: { x: number; y: number }) =>
      Math.hypot(p.x - head.x, p.y - head.y) < head.r || inside(frontParts.shoulder[0].points, p.x, p.y);
    const drawnBack = { ...g, ops: g.ops.slice(0, g.ops.length - front.ops.length) };
    const backPoints = linesOf(drawnBack).flatMap((l) => l.points);
    expect(backPoints.length).toBeGreaterThan(0);
    expect(backPoints.filter(covered)).toEqual([]);
    const frontPoints = linesOf(front).flatMap((l) => l.points);
    const clear = (p: { x: number; y: number }) =>
      !covered(p) && frontPoints.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 2 * GLYPH_LINE_W);
    for (const b of backAt) {
      // a bust behind wears no collar: it stands mostly hidden, where one would only be a speck
      const back = alone(cx + b.dx, cy + b.dy, b.s, { collar: false });
      const wanted = linesOf(back).flatMap((l) => l.points).filter(clear);
      expect(wanted.length).toBeGreaterThan(10);
      for (const p of wanted) expect(backPoints.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.5)).toBe(true);
      // its head, clear of the front one, stands whole
      expect(drawnBack.ops).toContainEqual(back.ops.find(({ m }) => m === "strokeCircle"));
    }
    expect(g.calls.filter((m) => FILLS.includes(m))).toEqual([]);
  });

  it("should stand inside its slot at the row's weight, centred on it within 1 px", () => {
    const { g, f, cx, cy } = party();
    const box = boxOf(marks(g));
    expect(box.left).toBeGreaterThanOrEqual(f.x);
    expect(box.right).toBeLessThanOrEqual(f.x + f.width);
    expect(box.top).toBeGreaterThanOrEqual(f.y);
    expect(box.bottom).toBeLessThanOrEqual(f.y + f.height);
    expect(box.height).toBeGreaterThanOrEqual(20);
    expect(box.height).toBeLessThanOrEqual(30);
    expect(Math.abs(centreOf(box).x - cx)).toBeLessThanOrEqual(1);
    expect(Math.abs(centreOf(box).y - cy)).toBeLessThanOrEqual(1);
  });

  it("should move all three with the corner when the view widens (FS-ZAJMH R13)", () => {
    const { g, corner } = party();
    const before = boxOf(marks(g));
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    corner.relayout();
    const after = boxOf(marks(g));
    expect(after.left - before.left).toBeCloseTo(200, 9);
    expect(after.top - before.top).toBeCloseTo(0, 9);
  });
});

// FS-7TQN4 (the owner, 2026-11-13, after the bronze knockout rucksack: 「其他icon不是也要反白嗎」 and
// 「目前反白前的肩胛有點怪在調整一下」): the whole corner row is knockout. I-7TQN4-1.

type Circ = { x: number; y: number; r: number };

/**
 * What a knockout texture holds, in logical px on the screen: its filled shapes, its cut lines,
 * rings and holes, and how its cut graphics was set up.
 */
function drawingOf(t: FakeTexture) {
  const solid = t.log.find((e) => e.m === "draw")!.g!;
  const cut = t.log.find((e) => e.m === "erase")!.g!;
  const shown = (g: FakeGraphics) => (p: P): P => ({
    x: t.x + ((p.x * (g.scale ?? 1) + (g.x ?? 0)) - t.width / 2) * t.scale!,
    y: t.y + ((p.y * (g.scale ?? 1) + (g.y ?? 0)) - t.height / 2) * t.scale!,
  });
  const len = (g: FakeGraphics) => (v: number) => v * (g.scale ?? 1) * t.scale!;
  const circles = (m: string): Circ[] =>
    cut.ops.filter((o) => o.m === m).map(({ args: [x, y, r] }) => ({ ...shown(cut)({ x, y }), r: len(cut)(r) }));
  const fills = marks(solid)
    .filter((k) => k.kind === "fill")
    .map((k) => k.points.map(shown(solid)));
  const cuts = linesOf(cut).map((l) => ({ closed: l.closed, points: l.points.map(shown(cut)) }));
  return { solid, cut, fills, cuts, rings: circles("strokeCircle"), holes: circles("fillCircle"), box: spanOf(fills.flat()) };
}

const near = (a: P, b: P, within = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) <= within;
/** How far p stands from the segment a–b. */
const toSeg = (p: P, a: P, b: P) => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};
/** How far p stands from the polyline ps (closed back to its first point when `closed`). */
const toLine = (p: P, ps: P[], closed = false) => {
  let best = Infinity;
  const n = closed ? ps.length : ps.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, toSeg(p, ps[i], ps[(i + 1) % ps.length]));
  return best;
};
/** The least distance between two outlines, closed. */
const apart = (a: P[], b: P[]) => Math.min(...a.map((p) => toLine(p, b, true)), ...b.map((p) => toLine(p, a, true)));
/** Whether the segments a–b and c–d cross; one ending on the other is not crossing it. */
const crosses = (a: P, b: P, c: P, d: P) => {
  const side = (p: P, q: P, r: P) => {
    const z = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return Math.abs(z) < 1e-9 ? 0 : Math.sign(z);
  };
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};
const linesCross = (a: P[], b: P[]) =>
  a.slice(1).some((p, i) => b.slice(1).some((q, j) => crosses(a[i], p, b[j], q)));
/** Whether a shape is a disc: every point the same distance from its middle. */
const discOf = (ps: P[]): Circ | undefined => {
  const s = spanOf(ps);
  const c = { x: (s.left + s.right) / 2, y: (s.top + s.bottom) / 2 };
  const rs = ps.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  return Math.max(...rs) - Math.min(...rs) < 0.01 ? { ...c, r: rs[0] } : undefined;
};
const slotOf = (icon: "menu" | "inventory" | "character" | "party" | "mail") => {
  const f = cornerIconFrame(icon, viewport);
  return { f, cx: f.x + f.width / 2, cy: f.y + f.height / 2 };
};
const TOWN_ROW = (): CornerIconSpec[] => [
  { icon: "menu", press: vi.fn() },
  { icon: "inventory", press: vi.fn() },
  { icon: "character", press: vi.fn() },
  { icon: "party", press: vi.fn() },
];
/** The live texture standing on an icon's slot. */
const textureOn = (env: ReturnType<typeof setup>, icon: "menu" | "inventory" | "character" | "party" | "mail") => {
  const { cx, cy } = slotOf(icon);
  const on = env.textures.filter((t) => !t.destroyed && t.x === cx && t.y === cy);
  expect(on).toHaveLength(1);
  return on[0];
};
const ICONS = ["menu", "inventory", "character", "party", "mail"] as const;

describe("HudCorner (FS-7TQN4 R1, R2, R12: every icon in its own texture)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1, 1.5, 2])(
    "should make four textures for a town row and five for a field row at render scale %s, each on its slot's centre, depth 1000, scroll factor 0, the slot × k, at 1/k, the icons' graphics drawing nothing",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const k = 2 * renderScale;
      expect(setup(TOWN_ROW(), "ok").textures).toHaveLength(4);
      const env = setup(FULL_ROW(), "ok");
      expect(env.textures).toHaveLength(5);
      for (const icon of ICONS) {
        const { f } = slotOf(icon);
        const t = textureOn(env, icon);
        expect(t).toMatchObject({ width: Math.round(f.width * k), height: Math.round(f.height * k), depth: 1000, scrollFactor: 0 });
        expect(t.scale).toBeCloseTo(1 / k, 12);
      }
      for (const g of env.graphics) expect(g.ops).toEqual([]);
    },
  );

  it.each([1, 1.5, 2])(
    "should fill each white at 1, then erase strokes and filled discs only, every cut on an unscaled graphics at lineStyle(1.6·k), then render, at render scale %s (the rucksack's included)",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const k = 2 * renderScale;
      const env = setup(FULL_ROW(), "ok");
      for (const t of env.textures) {
        expect(t.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
        const { solid, cut } = drawingOf(t);
        expect(new Set(solid.calls)).toEqual(new Set(["fillStyle", "beginPath", "moveTo", "lineTo", "closePath", "fillPath"]));
        for (const { args } of solid.ops.filter(({ m }) => m === "fillStyle")) expect(args).toEqual([TINT_IDENTITY, 1]);
        // the cuts: strokes, and filled discs for holes, white at 1
        const allowed = ["lineStyle", "fillStyle", "beginPath", "moveTo", "lineTo", "closePath", "strokePath", "strokeCircle", "fillCircle"];
        for (const m of cut.calls) expect(allowed).toContain(m);
        for (const { m, args } of cut.ops.filter(({ m }) => m === "fillStyle" || m === "lineStyle")) {
          expect(m === "fillStyle" ? args : args.slice(1)).toEqual([TINT_IDENTITY, 1]);
        }
        // in texel coordinates: unscaled, so the renderer joins every corner (over 2 px)
        expect(cut.scale ?? 1).toBe(1);
        const widths = cut.ops.filter(({ m }) => m === "lineStyle").map(({ args }) => args[0]);
        expect(widths.length).toBeGreaterThan(0);
        for (const w of widths) {
          expect(w).toBeCloseTo(1.6 * k, 9);
          expect(w).toBeGreaterThan(2);
        }
      }
      expect(env.made).toHaveLength(10);
      expect(env.made.every((g) => g.destroyed)).toBe(true);
      expect(env.madeAdded.every((a) => a === false)).toBe(true);
    },
  );

  it("should lay each silhouette inside its slot, centred where today's glyph is within 1 px (R11)", () => {
    const env = setup(FULL_ROW(), "ok");
    for (const icon of ["menu", "party"] as const) {
      const { f, cx, cy } = slotOf(icon);
      const { box } = drawingOf(textureOn(env, icon));
      expect(Math.abs((box.left + box.right) / 2 - cx)).toBeLessThanOrEqual(1);
      expect(Math.abs((box.top + box.bottom) / 2 - cy)).toBeLessThanOrEqual(1);
      expect(box.left).toBeGreaterThanOrEqual(f.x);
      expect(box.right).toBeLessThanOrEqual(f.x + f.width);
      expect(box.top).toBeGreaterThanOrEqual(f.y);
      expect(box.bottom).toBeLessThanOrEqual(f.y + f.height);
    }
  });
});

describe("HudCorner (FS-7TQN4 R3: Menu, a riveted solid gear)", () => {
  const gear = () => {
    const { cx, cy } = slotOf("menu");
    const plain = setup([{ icon: "menu" }]).graphics[0];
    return { cx, cy, plain, d: drawingOf(setup([{ icon: "menu" }], "ok").textures[0]) };
  };

  it("should fill today's gear outline, and nothing else", () => {
    const { plain, d } = gear();
    expect(d.fills).toHaveLength(1);
    const outline = linesOf(plain).filter((l) => l.closed)[0].points.slice(0, -1);
    expect(d.fills[0]).toHaveLength(outline.length);
    d.fills[0].forEach((p, i) => expect(near(p, outline[i], 1e-9)).toBe(true));
  });

  it("should cut a centre hole of radius 2–3.5, a ring round it at least 1.5 px clear, and four rivet holes at 45°, 135°, 225° and 315°, each at least 1 px clear of the ring and of the root circle", () => {
    const { cx, cy, d } = gear();
    expect(d.cuts).toEqual([]);
    expect(d.rings).toHaveLength(1);
    const [ring] = d.rings;
    expect(near(ring, { x: cx, y: cy }, 1e-9)).toBe(true);
    const centre = d.holes.filter((h) => near(h, { x: cx, y: cy }, 1e-9));
    expect(centre).toHaveLength(1);
    const [hole] = centre;
    expect(hole.r).toBeGreaterThanOrEqual(2);
    expect(hole.r).toBeLessThanOrEqual(3.5);
    expect(ring.r - 0.8 - hole.r).toBeGreaterThanOrEqual(1.5);
    const rivets = d.holes.filter((h) => h !== hole);
    expect(rivets).toHaveLength(4);
    const angles = rivets.map((v) => ((Math.atan2(v.y - cy, v.x - cx) * 180) / Math.PI + 360) % 360).sort((a, b) => a - b);
    [45, 135, 225, 315].forEach((a, i) => expect(angles[i]).toBeCloseTo(a, 9));
    for (const v of rivets) {
      const out = Math.hypot(v.x - cx, v.y - cy);
      expect(v.r).toBeGreaterThanOrEqual(0.9);
      expect(v.r).toBeLessThanOrEqual(1.4);
      expect(out - v.r - (ring.r + 0.8)).toBeGreaterThanOrEqual(1);
      expect(11 - (out + v.r)).toBeGreaterThanOrEqual(1);
    }
  });
});

/** The Character's knockout, its parts named. */
function character() {
  const { cx, cy } = slotOf("character");
  const d = drawingOf(setup([{ icon: "character" }], "ok").textures[0]);
  const head = d.fills.find((f) => discOf(f))!;
  const mass = d.fills.find((f) => f !== head)!;
  const ms = spanOf(mass);
  // the mass's upper outline: from the foot of its left side round over the top to the foot of its right
  const foot = ms.bottom;
  const onFoot = (p: P) => Math.abs(p.y - foot) < 1e-6;
  const start = mass.findIndex((p, i) => onFoot(p) && !onFoot(mass[(i + 1) % mass.length]));
  let upper = [...mass.slice(start), ...mass.slice(0, start)];
  upper = upper.slice(0, upper.findIndex((p, i) => i > 0 && onFoot(p)) + 1);
  if (upper[0].x > upper[upper.length - 1].x) upper.reverse();
  const inMass = (p: P) => inside(mass, p.x, p.y);
  const seams = d.cuts.filter((c) => !c.closed && c.points.every((p) => inMass(p) && toLine(p, mass, true) >= 2 && toLine(p, mass, true) <= 4));
  const buckles = d.cuts.filter((c) => c.closed);
  const straps = d.cuts.filter((c) => !seams.includes(c) && !buckles.includes(c));
  return { cx, cy: cy + 1, d, head, mass, ms, upper, seams, buckles, straps };
}

describe("HudCorner (FS-7TQN4 R4, R5: Character, a solid bust with its pauldrons drawn again)", () => {
  it("should fill a head disc and a shoulder mass, at least 1.6 px apart, and nothing else: no rivet, no collar", () => {
    const c = character();
    expect(c.d.fills).toHaveLength(2);
    expect(discOf(c.head)).toBeDefined();
    expect(Math.abs(discOf(c.head)!.x - c.cx)).toBeLessThan(1e-6);
    expect(apart(c.head, c.mass)).toBeGreaterThanOrEqual(1.6);
    expect(c.d.holes).toEqual([]);
    expect(c.d.rings).toEqual([]);
    expect(c.d.cuts).toHaveLength(c.seams.length + c.buckles.length + c.straps.length);
  });

  it("should run the mass's upper outline as one smooth convex curve: turning one way at every vertex, by at most 20°, mirror-symmetric within 0.01 px", () => {
    const { upper, mass, cx } = character();
    expect(upper.length).toBeGreaterThan(20);
    const turns = upper.slice(1, -1).map((p, i) => {
      const [a, b] = [upper[i], upper[i + 2]];
      const t = Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x);
      return (((t + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
    });
    const sign = Math.sign(turns.find((t) => Math.abs(t) > 1e-9)!);
    for (const t of turns) {
      expect(t * sign).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.abs(t)).toBeLessThanOrEqual(20);
    }
    for (const p of mass) expect(mass.some((q) => near(q, { x: 2 * cx - p.x, y: p.y }, 0.01))).toBe(true);
  });

  it("should flow each cap straight down into the arm: the silhouette's sides upright to the foot", () => {
    const { upper, ms } = character();
    for (const end of [upper.slice(0, 3), upper.slice(-3)]) for (const p of end) expect(Math.abs(Math.abs(p.x - (ms.left + ms.right) / 2) - ms.width / 2)).toBeLessThan(0.05);
  });

  it("should cut one plate seam per cap, 2–4 px inside the mass's edge, from the arm side up and in, ending outside the head's edge, mirrored", () => {
    const { seams, head, cx } = character();
    expect(seams).toHaveLength(2);
    const r = discOf(head)!.r;
    const [left, right] = seams.slice().sort((a, b) => spanOf(a.points).left - spanOf(b.points).left);
    expect(spanOf(left.points).right).toBeLessThan(cx);
    expect(spanOf(right.points).left).toBeGreaterThan(cx);
    for (const s of [left, right]) {
      const ends = [s.points[0], s.points[s.points.length - 1]].sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
      const [inner, outer] = ends;
      expect(Math.abs(inner.x - cx)).toBeGreaterThan(r);
      expect(outer.y).toBeGreaterThan(inner.y);
    }
    for (const p of left.points) expect(right.points.some((q) => near(q, { x: 2 * cx - p.x, y: p.y }, 0.01))).toBe(true);
  });

  it("should cut a baldric from inside the left seam's inner end down across the chest to the foot right of the middle, broken only by its buckle, crossing no other cut", () => {
    const { straps, seams, buckles, ms, cx, mass } = character();
    expect(straps.length).toBeGreaterThanOrEqual(1);
    const pts = straps.flatMap((s) => s.points).sort((a, b) => a.y - b.y);
    const [from, to] = [pts[0], pts[pts.length - 1]];
    // one straight strap: every piece on the line from its top to its foot
    for (const p of pts) expect(toSeg(p, from, to)).toBeLessThan(0.01);
    const leftSeam = seams.slice().sort((a, b) => spanOf(a.points).left - spanOf(b.points).left)[0];
    const innerEnd = leftSeam.points.reduce((a, b) => (Math.abs(b.x - cx) < Math.abs(a.x - cx) ? b : a));
    expect(from.x).toBeGreaterThan(innerEnd.x);
    expect(from.x).toBeLessThan(cx);
    expect(inside(mass, from.x, from.y) || toLine(from, mass, true) < 0.01).toBe(true);
    expect(to.y).toBeGreaterThanOrEqual(ms.bottom - 1e-6);
    expect(to.x).toBeGreaterThan(cx + 3);
    for (const s of straps) {
      for (const seam of seams) {
        expect(linesCross(s.points, seam.points)).toBe(false);
        expect(Math.min(...s.points.map((p) => toLine(p, seam.points)))).toBeGreaterThanOrEqual(CUT_W_LOGICAL);
      }
      for (const b of buckles) {
        expect(linesCross(s.points, b.points)).toBe(false);
        // no piece runs inside the buckle
        for (let i = 1; i < s.points.length; i++) {
          const mid = { x: (s.points[i - 1].x + s.points[i].x) / 2, y: (s.points[i - 1].y + s.points[i].y) / 2 };
          expect(inside(b.points, mid.x, mid.y)).toBe(false);
        }
      }
    }
  });

  it("should cut a closed four-sided buckle about 5 × 4.4 on the strap's line, about 0.7 of the way down, its long side along it", () => {
    const { straps, buckles } = character();
    expect(buckles).toHaveLength(1);
    const corners = buckles[0].points.slice(0, -1);
    expect(corners).toHaveLength(4);
    const pts = straps.flatMap((s) => s.points).sort((a, b) => a.y - b.y);
    const [from, to] = [pts[0], pts[pts.length - 1]];
    const mid = { x: corners.reduce((s, p) => s + p.x, 0) / 4, y: corners.reduce((s, p) => s + p.y, 0) / 4 };
    expect(toSeg(mid, from, to)).toBeLessThan(0.01);
    const along = Math.hypot(mid.x - from.x, mid.y - from.y) / Math.hypot(to.x - from.x, to.y - from.y);
    expect(along).toBeGreaterThanOrEqual(0.6);
    expect(along).toBeLessThanOrEqual(0.8);
    const sides = corners.map((p, i) => Math.hypot(p.x - corners[(i + 1) % 4].x, p.y - corners[(i + 1) % 4].y));
    const [long, wide] = [Math.max(...sides), Math.min(...sides)];
    expect(long).toBeGreaterThanOrEqual(4.5);
    expect(long).toBeLessThanOrEqual(5.5);
    expect(wide).toBeGreaterThanOrEqual(4);
    expect(wide).toBeLessThanOrEqual(4.8);
    // the long side runs along the strap
    const i = sides.indexOf(long);
    const [a, b] = [corners[i], corners[(i + 1) % 4]];
    const cos = Math.abs((b.x - a.x) * (to.x - from.x) + (b.y - a.y) * (to.y - from.y)) / (long * Math.hypot(to.x - from.x, to.y - from.y));
    expect(cos).toBeGreaterThan(0.99);
  });

  it("should keep the fallback bust's box within 3 px each way and its centre within 1 px", () => {
    const { d } = character();
    const was = boxOf(marks(setup([{ icon: "character" }]).graphics[0]));
    expect(Math.abs(d.box.width - was.width)).toBeLessThanOrEqual(3);
    expect(Math.abs(d.box.height - was.height)).toBeLessThanOrEqual(3);
    expect(Math.abs((d.box.left + d.box.right) / 2 - (was.left + was.right) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs((d.box.top + d.box.bottom) / 2 - (was.top + was.bottom) / 2)).toBeLessThanOrEqual(1);
  });
});

/** A cut's width in logical px (FS-7TQN4 R2). */
const CUT_W_LOGICAL = 1.6;

describe("HudCorner (FS-7TQN4 R6: Party, three solid busts)", () => {
  const party = () => {
    const { cx, cy } = slotOf("party");
    const d = drawingOf(setup([{ icon: "party" }], "ok").textures[0]);
    const one = character();
    // a Character part laid at a Party bust's place and scale
    const lay = (ps: P[], at: { dx: number; dy: number; s: number }) =>
      ps.map((p) => ({ x: cx + at.dx + (p.x - one.cx) * at.s, y: cy + at.dy + (p.y - one.cy) * at.s }));
    const same = (a: P[], b: P[]) => a.length === b.length && a.every((p, i) => near(p, b[i], 1e-6));
    const busts = [PARTY_BUSTS.front, ...PARTY_BUSTS.back].map((at) => ({
      at,
      head: d.fills.find((f) => same(f, lay(one.head, at))),
      mass: d.fills.find((f) => same(f, lay(one.mass, at))),
    }));
    return { cx, cy, d, one, lay, busts };
  };

  it("should fill three heads and three shoulder masses, the Character's own, at PARTY_BUSTS' places and scales, each head clear of its mass by 1.6 × its scale", () => {
    const { d, busts } = party();
    expect(d.fills).toHaveLength(6);
    for (const b of busts) {
      expect(b.head).toBeDefined();
      expect(b.mass).toBeDefined();
      expect(apart(b.head!, b.mass!)).toBeGreaterThanOrEqual(1.6 * b.at.s - 1e-9);
    }
  });

  it("should cut a gap along the front bust's outline wherever it lies over a bust behind, outside the front bust, so its whole outline reads", () => {
    const { d, busts } = party();
    const [front, ...back] = busts;
    const behind = back.flatMap((b) => [b.head!, b.mass!]);
    const outFront = (p: P) => !inside(front.head!, p.x, p.y) && !inside(front.mass!, p.x, p.y);
    const gaps = d.cuts.filter((c) => c.points.every(outFront));
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      for (const p of g.points) {
        const fromFront = Math.min(toLine(p, front.head!, true), toLine(p, front.mass!, true));
        expect(fromFront).toBeGreaterThan(CUT_W_LOGICAL / 2 - 0.05);
        expect(fromFront).toBeLessThan(CUT_W_LOGICAL / 2 + 0.05);
      }
    }
    // every point of the front outline over a bust behind lies on the gap's inner edge
    for (const outline of [front.head!, front.mass!]) {
      for (const p of outline) {
        if (!behind.some((s) => inside(s, p.x, p.y) && toLine(p, s, true) > 0.3)) continue;
        const toGap = Math.min(...gaps.map((g) => toLine(p, g.points)));
        expect(toGap).toBeLessThan(CUT_W_LOGICAL / 2 + 0.1);
      }
    }
  });

  // The gorget's arc (R6) is left out: with it, the front bust's two seams and the arc read as a face
  // at render scale 1 (I-7TQN4-1's screenshots); detail cut before mush.
  it("should cut the front bust's two seams, and no gorget and no baldric", () => {
    const { d, one, lay, busts } = party();
    const [front] = busts;
    const within = d.cuts.filter((c) => c.points.every((p) => inside(front.mass!, p.x, p.y)));
    expect(within).toHaveLength(2);
    for (const seam of one.seams) {
      const want = lay(seam.points, front.at);
      expect(within.some((c) => c.points.length === want.length && c.points.every((p, i) => near(p, want[i], 1e-6)))).toBe(true);
    }
    // no strap: nothing reaches the front bust's foot
    const foot = spanOf(front.mass!).bottom;
    expect(d.cuts.filter((c) => c.points.some((p) => Math.abs(p.y - foot) < 0.5))).toEqual([]);
    expect(d.holes).toEqual([]);
  });

  it("should be mirror-symmetric within 0.01 px, fills and cuts", () => {
    const { d, cx } = party();
    const fills = d.fills.flat();
    for (const p of fills) expect(fills.some((q) => near(q, { x: 2 * cx - p.x, y: p.y }, 0.01))).toBe(true);
    const cuts = d.cuts.flatMap((c) => c.points);
    for (const p of cuts) expect(cuts.some((q) => near(q, { x: 2 * cx - p.x, y: p.y }, 0.01))).toBe(true);
  });
});

describe("HudCorner (FS-7TQN4 R7, R9: the greyed Mailbox, the knockout envelope in the faint grey)", () => {
  it("should fill one rounded rect equal to the envelope's rect, radius 2, and cut only the flap through its point and the two foot folds", () => {
    const { f } = slotOf("mail");
    const d = drawingOf(setup([{ icon: "mail", greyed: true }], "ok").textures[0]);
    const e = { x: f.x + (f.width - 36) / 2, y: f.y + 11, w: 36, h: 25 };
    expect(d.fills).toHaveLength(1);
    const box = spanOf(d.fills[0]);
    for (const [a, b] of [
      [box.left, e.x],
      [box.top, e.y],
      [box.width, e.w],
      [box.height, e.h],
    ])
      expect(a).toBeCloseTo(b, 9);
    // rounded by 2 at each corner: no point nearer a corner than the radius allows
    for (const [x, y] of [
      [e.x, e.y],
      [e.x + e.w, e.y],
      [e.x + e.w, e.y + e.h],
      [e.x, e.y + e.h],
    ]) {
      const nearest = Math.min(...d.fills[0].map((p) => Math.hypot(p.x - x, p.y - y)));
      expect(nearest).toBeCloseTo(2 * Math.SQRT2 - 2, 2);
    }
    expect(d.rings).toEqual([]);
    expect(d.holes).toEqual([]);
    expect(d.cuts).toHaveLength(3);
    const point = envelopeFlapPoint(f);
    const flaps = d.cuts.filter((c) => c.points.length === 3 && near(c.points[1], point, 1));
    expect(flaps).toHaveLength(1);
    const folds = d.cuts.filter((c) => c !== flaps[0]);
    expect(folds.map((c) => c.points.length)).toEqual([2, 2]);
    for (const fold of folds) expect(Math.max(...fold.points.map((p) => p.y))).toBeCloseTo(e.y + e.h - 1, 9);
  });
});

describe("HudCorner (FS-7TQN4 R9, R10: bronze, lifted under the pointer; the greyed Mailbox never)", () => {
  it("should tint Menu, Inventory, Character and Party bronze at 0.85, lifted at 1 under the pointer, and back on leaving, building nothing", () => {
    const env = setup(FULL_ROW(), "ok");
    for (const icon of ["menu", "inventory", "character", "party"] as const) {
      const t = textureOn(env, icon);
      // lit from above (FS-S8Z2Y R4, R5)
      expectLit(t, BRONZE);
      expect(t.alpha).toBe(0.85);
      env.zoneAt(icon).handlers.pointerover();
      expectLit(t, BRONZE_LIT);
      expect(t.alpha).toBe(1);
      env.zoneAt(icon).handlers.pointerout();
      expectLit(t, BRONZE);
      expect(t.alpha).toBe(0.85);
    }
    expect(env.textures).toHaveLength(5);
    expect(env.made).toHaveLength(10);
    for (const t of env.textures) expect(t.log).toHaveLength(3);
    for (const g of env.graphics) expect(g.ops).toEqual([]);
  });

  it("should tint the greyed Mailbox hudFaint at 0.6, hovered or not, and name it \"Mailbox · town only\"", () => {
    const env = setup(FULL_ROW(), "ok");
    const t = textureOn(env, "mail");
    expect(t).toMatchObject({ tint: palette.hudFaint, alpha: 0.6 });
    env.zoneAt("mail").handlers.pointerover();
    expect(t).toMatchObject({ tint: palette.hudFaint, alpha: 0.6 });
    expect(env.liveTexts().map((x) => x.words)).toEqual(["Mailbox · town only"]);
    env.zoneAt("mail").handlers.pointerout();
    expect(t).toMatchObject({ tint: palette.hudFaint, alpha: 0.6 });
    expect(env.textures).toHaveLength(5);
  });
});

describe("HudCorner (FS-7TQN4 R11, R13, R14: relayout, a new render scale, destroy)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should move every image to its slot's new centre on a relayout to 1280, building nothing", () => {
    const env = setup(FULL_ROW(), "ok");
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.corner.relayout();
    expect(env.textures).toHaveLength(5);
    for (const icon of ICONS) textureOn(env, icon);
    expect(env.made).toHaveLength(10);
  });

  it("should build each knockout anew at k = 4 when the render scale goes 1 → 2, destroying each old one, and build nothing on a width change alone", () => {
    const env = setup(FULL_ROW(), "ok");
    env.zoneAt("party").handlers.pointerover();
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.textures).toHaveLength(10);
    expect(env.textures.slice(0, 5).every((t) => t.destroyed)).toBe(true);
    for (const icon of ICONS) {
      const { f } = slotOf(icon);
      const t = textureOn(env, icon);
      expect(t).toMatchObject({ width: Math.round(f.width * 4), height: Math.round(f.height * 4) });
      expect(t.scale).toBeCloseTo(1 / 4, 12);
      expect(t.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
    }
    expect(textureOn(env, "party").alpha).toBe(1);
    expectLit(textureOn(env, "party"), BRONZE_LIT);
    expect(textureOn(env, "menu").alpha).toBe(0.85);
    expectLit(textureOn(env, "menu"), BRONZE);
    viewport.set({ width: 1280, height: 720, renderScale: 2 });
    expect(env.textures).toHaveLength(10);
  });

  it("should destroy every image and stop watching on destroy: a later render-scale change makes nothing and throws nothing", () => {
    const env = setup(FULL_ROW(), "ok");
    env.corner.destroy();
    expect(env.textures.every((t) => t.destroyed)).toBe(true);
    expect(() => viewport.set({ width: 1080, height: 720, renderScale: 2 })).not.toThrow();
    expect(env.attempts.renderTexture).toBe(5);
  });
});

describe("HudCorner (FS-7TQN4 R15, R18: the fallback, and the rest stays)", () => {
  afterEach(() => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    vi.restoreAllMocks();
  });

  it.each(["none", "throws"] as const)("should draw every icon in today's lines, no slot empty (texture: %s)", (texture) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = setup(FULL_ROW(), texture);
    expect(env.textures).toEqual([]);
    for (const g of env.graphics) {
      expect(g.ops.length).toBeGreaterThan(0);
      expect(g.calls.filter((m) => FILLS.includes(m))).toEqual([]);
    }
    // today's Character and Party keep their old pauldrons, rivets and collar
    expect(env.graphics[2].calls).toContain("lineBetween");
  });

  it("should try once where making a texture throws, and keep the lines on a later render-scale change", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = setup(FULL_ROW(), "throws");
    const before = env.graphics.map((g) => [...g.ops]);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.graphics.map((g) => g.ops)).toEqual(before);
    expect(env.attempts.renderTexture).toBe(5);
  });

  it.each(["none", "ok", "throws"] as const)(
    "should keep every zone, hand cursor, covers, press and label, and take everything down with destroy (texture: %s)",
    (texture) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const env = setup(TOWN_ROW(), texture);
      const words = { menu: "Menu (Esc)", inventory: "Inventory (I)", character: "Character (C)", party: "Party (T)" };
      for (const icon of ["menu", "inventory", "character", "party"] as const) {
        const { f } = slotOf(icon);
        const z = env.zoneAt(icon);
        expect(z).toMatchObject({ x: f.x, y: f.y, width: 54, height: 46, handCursor: true, depth: 1000 });
        expect(env.corner.covers(f.x + 1, f.y + 1, icon)).toBe(true);
        z.handlers.pointerover();
        expect(env.liveTexts().map((t) => t.words)).toEqual([words[icon]]);
        z.handlers.pointerout();
      }
      env.corner.destroy();
      expect(env.textures.every((t) => t.destroyed)).toBe(true);
      expect(env.graphics.every((g) => g.destroyed)).toBe(true);
    },
  );
});

// FS-S8Z2Y (the owner, 2026-11-13: 「icon可以加一點浮凸的陰影或漸層嗎」, 「加上浮凸漸層」): every knockout of
// the row on a drop shadow, its bronze lit from above; the greyed Mailbox flat. I-S8Z2Y-1.

const SHADOW_OF = (env: ReturnType<typeof setup>, t: FakeTexture) => {
  const on = env.images.filter((i) => i.of === t);
  expect(on).toHaveLength(1);
  return on[0];
};

describe("HudCorner (FS-S8Z2Y R1–R3: a drop shadow under every knockout)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1, 1.5, 2])(
    "should lay a shadow under each of a town row's four and a field row's five at render scale %s: its own texture in palette.ink, FILL, alpha 0.5, 1 px right and down, at 1/k, just under it",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const k = 2 * renderScale;
      expect(setup(TOWN_ROW(), "ok").images).toHaveLength(4);
      const env = setup(FULL_ROW(), "ok");
      expect(env.images).toHaveLength(5);
      expect(env.textures).toHaveLength(5);
      for (const icon of ICONS) {
        const { cx, cy } = slotOf(icon);
        const t = textureOn(env, icon);
        const shadow = SHADOW_OF(env, t);
        expect(shadow).toMatchObject({ x: cx + 1, y: cy + 1, depth: 1000, scrollFactor: 0, tintMode: 1, alpha: 0.5 });
        expect(shadow.tints).toEqual([palette.ink, palette.ink, palette.ink, palette.ink]);
        expect(shadow.scale).toBeCloseTo(1 / k, 12);
        const order = env.order();
        expect(order.indexOf(shadow)).toBe(order.indexOf(t) - 1);
      }
    },
  );

  it("should leave every shadow as it was on hover and leave, making nothing", () => {
    const env = setup(FULL_ROW(), "ok");
    const was = env.images.map((i) => ({ ...i, tints: [...i.tints!] }));
    for (const icon of ICONS) {
      env.zoneAt(icon).handlers.pointerover();
      env.zoneAt(icon).handlers.pointerout();
    }
    env.zoneAt("party").handlers.pointerover();
    expect(env.images).toEqual(was);
  });

  it("should move each shadow with its slot on a relayout to 1280, making none", () => {
    const env = setup(FULL_ROW(), "ok");
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.corner.relayout();
    expect(env.images).toHaveLength(5);
    for (const icon of ICONS) {
      const { cx, cy } = slotOf(icon);
      expect(SHADOW_OF(env, textureOn(env, icon))).toMatchObject({ x: cx + 1, y: cy + 1, destroyed: false });
    }
  });

  it("should make a new shadow on each new texture when the render scale goes 1 → 2, destroying the old, and take them all down on destroy", () => {
    const env = setup(FULL_ROW(), "ok");
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.images).toHaveLength(10);
    expect(env.images.slice(0, 5).every((i) => i.destroyed)).toBe(true);
    for (const icon of ICONS) expect(SHADOW_OF(env, textureOn(env, icon)).scale).toBeCloseTo(1 / 4, 12);
    env.corner.destroy();
    expect(env.images.every((i) => i.destroyed)).toBe(true);
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    expect(env.images).toHaveLength(10);
  });

  it.each(["none", "throws"] as const)("should make no shadow and no gradient for the line glyphs (texture: %s)", (texture) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = setup(FULL_ROW(), texture);
    expect(env.images).toEqual([]);
    for (const g of env.graphics) expect(g.ops.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});

describe("HudCorner (FS-S8Z2Y R4–R6: lit from above; the greyed Mailbox flat)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1, 1.5, 2])(
    "should light Menu, Inventory, Character and Party from above at render scale %s: from the bronze at 0.85, from the lifted bronze at 1 under the pointer",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const env = setup(FULL_ROW(), "ok");
      for (const icon of ["menu", "inventory", "character", "party"] as const) {
        const t = textureOn(env, icon);
        expectLit(t, BRONZE);
        expect(t.alpha).toBe(0.85);
        env.zoneAt(icon).handlers.pointerover();
        expectLit(t, BRONZE_LIT);
        expect(t.alpha).toBe(1);
        env.zoneAt(icon).handlers.pointerout();
      }
      for (const t of env.textures) expect(t.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
    },
  );

  it("should keep the greyed Mailbox one flat faint grey at 0.6 on all four corners, hovered or not, on its shadow", () => {
    const env = setup(FULL_ROW(), "ok");
    const t = textureOn(env, "mail");
    const flat = [palette.hudFaint, palette.hudFaint, palette.hudFaint, palette.hudFaint];
    expect(t.tints).toEqual(flat);
    expect(t.alpha).toBe(0.6);
    env.zoneAt("mail").handlers.pointerover();
    expect(t.tints).toEqual(flat);
    expect(t.alpha).toBe(0.6);
    expect(SHADOW_OF(env, t)).toMatchObject({ alpha: 0.5, tintMode: 1 });
  });
});
