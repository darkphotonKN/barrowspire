import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
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
      const rec: FakeGraphics = { strokes: [], alphas: [], calls: [], ops: [], destroyed: false };
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

  it("should draw the Inventory icon's backpack apart from the Character icon's bust (R3; § Change: The inventory icon is an inked backpack)", () => {
    const env = setup([{ icon: "inventory" }, { icon: "character" }]);
    const [bag, bust] = env.graphics;
    expect(bag.strokes).toContain(palette.interactable);
    expect(bag.calls).not.toEqual(bust.calls);
    // a haversack: its parts are paths, its rope's ends lines, its ring and rivets small circles,
    // none of them a head's
    expect(bag.calls).toContain("lineBetween");
    const circles = bag.ops.filter(({ m }) => m === "strokeCircle").map(({ args }) => args[2]);
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

  it("should draw no plate and fill nothing under any icon, idle or under the pointer (R1, R3)", () => {
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

// FS-3EBCA § Change: The inventory icon is an inked backpack (the owner, 2026-11-13: 「道具藍幫我重做成一個背包的圖示」),
// as his second tweak round made it a line glyph (「是不是要改成符號線條比較好」). I-3EBCA-12, I-3EBCA-13.
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

describe("HudCorner (FS-3EBCA § Change: The inventory icon is an inked backpack, as a line haversack)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  const backpack = () => {
    const env = setup([{ icon: "inventory" }]);
    return { ...env, g: env.graphics[0] };
  };
  /** Its paths, each as the points it runs through. */
  const paths = (g: FakeGraphics) =>
    marks(g)
      .filter((k) => k.points.length > 2)
      .map((k) => k.points);
  const circles = (g: FakeGraphics) =>
    g.ops.filter(({ m }) => m === "strokeCircle").map(({ args: [x, y, r] }) => ({ x, y, r }));
  const span = (ps: { x: number; y: number }[]) => {
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  };
  /** A U: an open line whose two ends stand well above its lowest point. */
  const us = (g: FakeGraphics) =>
    paths(g)
      .filter((ps) => {
        const s = span(ps);
        const ends = Math.max(ps[0].y, ps[ps.length - 1].y);
        return s.right - s.left >= 10 && s.bottom - ends >= 5 && Math.abs(ps[0].y - ps[ps.length - 1].y) < 1;
      })
      .map(span);

  it("should draw in the other glyphs' lines alone, GLYPH_LINE_W wide, and brighten them under the pointer as they do (round 2; FS-QHN87 R1, R9)", () => {
    const { g, zoneAt } = backpack();
    const widths = () => g.ops.filter(({ m }) => m === "lineStyle").map(({ args }) => args[0]);
    expect(new Set(widths())).toEqual(new Set([GLYPH_LINE_W]));
    const idle = g.ops.filter(({ m }) => m !== "lineStyle");
    zoneAt("inventory").handlers.pointerover();
    expect(new Set(g.strokes)).toEqual(new Set([palette.interactableBright]));
    expect(new Set(g.alphas)).toEqual(new Set([1]));
    // only the ink changes: every line where it was
    expect(g.ops.filter(({ m }) => m !== "lineStyle")).toEqual(idle);
  });

  it("should draw a rounded flap with a tooled line just inside its edge (round 2)", () => {
    const { g } = backpack();
    const [edge, tooled] = us(g).sort((a, b) => b.right - b.left - (a.right - a.left));
    expect(edge).toBeDefined();
    expect(tooled).toBeDefined();
    // the tooled line inside the edge, a few px in, never touching it
    expect(tooled.left).toBeGreaterThan(edge.left + 1.5);
    expect(tooled.right).toBeLessThan(edge.right - 1.5);
    expect(edge.bottom - tooled.bottom).toBeGreaterThan(1.5);
    expect(edge.bottom - tooled.bottom).toBeLessThan(5);
  });

  it("should hang an iron hasp from the flap's point, shut on a ring, and set rivets in it (round 2)", () => {
    const { g } = backpack();
    const edge = us(g).sort((a, b) => b.right - b.left - (a.right - a.left))[0];
    const point = (edge.left + edge.right) / 2;
    const ring = circles(g).find(({ r }) => r >= 1.5 && r <= 2.5)!;
    expect(ring).toBeDefined();
    expect(ring.y - ring.r).toBeGreaterThan(edge.bottom);
    expect(Math.abs(ring.x - point)).toBeLessThan(1.5);
    // the hasp: a small line from the flap's point down to the ring
    const hasp = paths(g).map(span).find((s) => s.top >= edge.bottom - 1 && s.bottom <= ring.y && s.right - s.left < 5);
    expect(hasp).toBeDefined();
    expect(circles(g).filter(({ r }) => r < 1.2).length).toBeGreaterThanOrEqual(2);
  });

  it("should roll a blanket across the top, tied with rope whose short ends hang loose (round 2)", () => {
    const { g } = backpack();
    const all = span(paths(g).flat());
    const roll = paths(g).map(span).find((s) => s.top === all.top && s.right - s.left > 15)!;
    expect(roll).toBeDefined();
    // a tie: a short line round the roll, from its top to its bottom
    const ties = paths(g)
      .map(span)
      .filter((s) => s.right - s.left < 2 && Math.abs(s.top - roll.top) < 0.5 && Math.abs(s.bottom - roll.bottom) < 0.5);
    expect(ties).toHaveLength(2);
    // a loose end: a short line hanging from a tie's foot
    const ends = g.ops.filter(
      ({ m, args }) =>
        m === "lineBetween" && Math.abs(args[1] - roll.bottom) < 0.5 && args[3] > args[1] + 1.5 && args[3] < args[1] + 4,
    );
    expect(ends.length).toBeGreaterThanOrEqual(2);
  });

  it("should hang a small drawstring pouch at the side (round 2)", () => {
    const { g } = backpack();
    const edge = us(g).sort((a, b) => b.right - b.left - (a.right - a.left))[0];
    const pouch = paths(g)
      .map(span)
      // beside the flap, below its top, no taller than a third of the pack
      .find((s) => s.left > edge.right - 2 && s.top > edge.top + 4 && s.bottom - s.top > 4 && s.bottom - s.top < 9);
    expect(pouch).toBeDefined();
    // its drawstring: a short level line across its neck
    const string = g.ops.find(
      ({ m, args }) => m === "lineBetween" && args[1] === args[3] && Math.abs(args[1] - pouch!.top) < 0.5,
    );
    expect(string).toBeDefined();
  });

  it("should stand 32–36 px tall and at most 44 wide, in its slot, centred on it (R4)", () => {
    const { g } = backpack();
    const box = boxOf(marks(g));
    expect(box.height).toBeGreaterThanOrEqual(32);
    expect(box.height).toBeLessThanOrEqual(36);
    expect(box.width).toBeLessThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(954);
    expect(box.right).toBeLessThanOrEqual(954 + 54);
    expect(box.top).toBeGreaterThanOrEqual(658);
    expect(box.bottom).toBeLessThanOrEqual(658 + 46);
    expect(Math.abs((box.left + box.right) / 2 - 981)).toBeLessThanOrEqual(1);
    expect(Math.abs((box.top + box.bottom) / 2 - 681)).toBeLessThanOrEqual(1);
  });

  it("should move with its slot when the view widens (R4; FS-ZAJMH R13)", () => {
    const { g, corner } = backpack();
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    corner.relayout();
    const box = boxOf(marks(g));
    expect(Math.abs((box.left + box.right) / 2 - 1181)).toBeLessThanOrEqual(1);
    expect(Math.abs((box.top + box.bottom) / 2 - 681)).toBeLessThanOrEqual(1);
  });

  it("should keep the Inventory zone, hand cursor, press and label, and go with destroy (R7, R11)", () => {
    const env = setup([{ icon: "inventory", press: vi.fn() }]);
    const g = env.graphics[0];
    const z = env.zoneAt("inventory");
    expect(z).toMatchObject({ x: 954, y: 658, width: 54, height: 46, handCursor: true });
    expect(env.corner.covers(955, 659, "inventory")).toBe(true);
    z.handlers.pointerover();
    expect(env.liveTexts().map((t) => t.words)).toEqual(["Inventory (I)"]);
    env.corner.destroy();
    expect(g.destroyed).toBe(true);
    expect(env.liveTexts()).toHaveLength(0);
  });
});

// FS-QHN87 (the owner, 2026-11-13: 「icon感覺有點空 不是指背包是所有icon」): richer glyphs in one sturdier
// line. I-QHN87-1.
describe("HudCorner (FS-QHN87 R1: one line width)", () => {
  it("should name the width once, 2.25, over the renderer's 2 px join threshold", () => {
    expect(GLYPH_LINE_W).toBe(2.25);
  });

  it("should stroke every glyph of the row, the greyed Mailbox's included, at GLYPH_LINE_W alone, idle and hovered", () => {
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

  it("should draw no angled corner of the haversack as two lines meeting end to end (its other strokes are f779a9b0's, R9)", () => {
    const env = setup([{ icon: "inventory" }]);
    expect(notches(env.graphics[0], (l) => l.points.length === 2)).toEqual([]);
  });
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
