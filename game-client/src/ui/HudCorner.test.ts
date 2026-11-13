import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
import { HudCorner, type CornerIconSpec } from "./HudCorner";
import { cornerIconFrame } from "./hudCornerLayout";
import { envelopeFlapPoint } from "./MailboxEnvelope";

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
        "setAlpha",
      ])
        self[m] = (...args: number[]) => (rec.calls.push(m), rec.ops.push({ m, args }), self);
      self.clear = () => ((rec.strokes = []), (rec.alphas = []), (rec.calls = []), (rec.ops = []), self);
      self.lineStyle = (_w: number, colour: number, alpha: number) => (
        rec.strokes.push(colour), rec.alphas.push(alpha), self
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
    // left of the leftmost plate drawn (Party, 1008–1066 at 1280)
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

  // FS-3EBCA R18 (owner 2026-11-12: "menu無法再按一次icon關閉"): the open menu's blocker lets the
  // Menu plate alone through, so the row says which points are that one plate's.
  it("should say which points one icon's plate covers, and no other's", () => {
    const env = setup();
    expect(env.corner.covers(1030, 680, "menu")).toBe(true);
    expect(env.corner.covers(1006, 658, "menu")).toBe(true);
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
type Point = { x: number; y: number; centre: string };

/** Every point a graphics strokes, sampled, tagged with the centre of the circle or arc it lies on. */
function strokedPoints(g: FakeGraphics): Point[] {
  const out: Point[] = [];
  const onCircle = (x: number, y: number, r: number, start: number, sweep: number) => {
    for (let i = 0; i <= 90; i++) {
      const a = start + (sweep * i) / 90;
      out.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, centre: `${x},${y}` });
    }
  };
  let path: number[][] = [];
  for (const { m, args } of g.ops) {
    if (m === "beginPath") path = [];
    else if (m === "arc") path.push(args);
    else if (m === "strokePath") {
      for (const [x, y, r, start, end, anticlockwise] of path) {
        // the sweep as Phaser's renderer takes it (GraphicsWebGLRenderer, Commands.ARC)
        let sweep = end - start;
        if (anticlockwise) sweep = sweep < -2 * Math.PI ? -2 * Math.PI : sweep > 0 ? -2 * Math.PI + (sweep % (2 * Math.PI)) : sweep;
        else sweep = sweep > 2 * Math.PI ? 2 * Math.PI : sweep < 0 ? 2 * Math.PI + (sweep % (2 * Math.PI)) : sweep;
        onCircle(x, y, r, start, sweep);
      }
      path = [];
    } else if (m === "strokeCircle") onCircle(args[0], args[1], args[2], 0, 2 * Math.PI);
  }
  return out;
}

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

  it("should draw the greyed Mailbox with no seal, its flap lines meeting at the seal's old place (R7)", () => {
    const env = setup([{ icon: "mail", greyed: true }]);
    const [mail] = env.graphics;
    const point = envelopeFlapPoint(cornerIconFrame("mail", viewport));
    expect(mail.calls).not.toContain("fillCircle");
    expect(mail.calls).not.toContain("strokeCircle");
    const meeting = mail.ops.filter(
      ({ m, args }) =>
        m === "lineBetween" &&
        ((args[2] === point.x && args[3] === point.y) || (args[0] === point.x && args[1] === point.y)),
    );
    expect(meeting).toHaveLength(2);
  });

  it("should leave the Party glyph's back bust undrawn where the front bust stands, and draw the rest of it (R3)", () => {
    const env = setup([{ icon: "party" }]);
    const [party] = env.graphics;
    const f = cornerIconFrame("party", viewport);
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    // the front bust as drawParty stands it: scale 0.85 at (cx + 5, cy + 2); the back at 0.8, (cx - 6, cy - 2)
    const front = { x: cx + 5, headY: cy + 2 - 6 * 0.85, headR: 5 * 0.85, shoulderY: cy + 2 + 12 * 0.85, shoulderR: 11 * 0.85 };
    const back = { x: cx - 6, headY: cy - 2 - 6 * 0.8, headR: 5 * 0.8, shoulderY: cy - 2 + 12 * 0.8, shoulderR: 11 * 0.8 };
    const frontOwn = new Set([`${front.x},${front.headY}`, `${front.x},${front.shoulderY}`]);
    const inFront = ({ x, y }: Point) =>
      Math.hypot(x - front.x, y - front.headY) < front.headR ||
      (y <= front.shoulderY && Math.hypot(x - front.x, y - front.shoulderY) < front.shoulderR);
    const points = strokedPoints(party);
    const backPoints = points.filter((p) => !frontOwn.has(p.centre));

    expect(backPoints.filter(inFront)).toEqual([]);
    const near = (x: number, y: number) => backPoints.some((p) => Math.hypot(p.x - x, p.y - y) < 0.5);
    // the back bust's head, whole, and its shoulders from their left end over their top
    expect(near(back.x, back.headY - back.headR)).toBe(true);
    expect(near(back.x - back.headR, back.headY)).toBe(true);
    expect(near(back.x - back.shoulderR, back.shoulderY)).toBe(true);
    expect(near(back.x, back.shoulderY - back.shoulderR)).toBe(true);
    // the front bust, whole: its head and the top of its shoulders
    expect(points.some((p) => p.centre === `${front.x},${front.headY}`)).toBe(true);
    expect(points.some((p) => p.centre === `${front.x},${front.shoulderY}`)).toBe(true);
  });
});
