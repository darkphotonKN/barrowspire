import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { createMailboxStore, type MailboxApi } from "@/stores/mailboxStore";
import { palette, toCss } from "@/utils/canvasPalette";
import { envelopeFrame } from "./letterPanelLayout";
import { GLYPH_LINE_W, MailboxEnvelope, drawEnvelopeLines, envelopeFlapPoint } from "./MailboxEnvelope";

// FS-J1672 R1, R7–R10 (the owner, 2026-11-13: "信箱icon中間的圈圈有點怪拿掉"): the town envelope stands
// bare, with no plate and no seal; the count of letters waiting rides an ember badge at its
// top-right corner. I-J1672-1. Drawn on a recording stand-in for the Phaser scene.

interface Op {
  m: string;
  args: number[];
}
interface FakeGraphics {
  ops: Op[];
  /** The fill colour, line width and line colour each op was drawn with. */
  styled: { m: string; args: number[]; fill?: [number, number]; line?: [number, number, number] }[];
  alpha: number;
  destroyed: boolean;
}
interface FakeText {
  words: string;
  x: number;
  y: number;
  origin?: number;
  style?: { fontSize?: string; fontStyle?: string; color?: string };
  width: number;
  destroyed: boolean;
}

/** A character's width in the fake text: wide enough that "99" must move left to stay in the rect. */
const CHAR_W = 8;

function fakeScene(charW = CHAR_W) {
  const graphics: FakeGraphics[] = [];
  const texts: FakeText[] = [];
  const zones: { x: number; y: number; handlers: Record<string, () => void> }[] = [];
  const tweens: Record<string, unknown>[] = [];
  const add = {
    graphics: () => {
      const rec: FakeGraphics = { ops: [], styled: [], alpha: 1, destroyed: false };
      graphics.push(rec);
      let fill: [number, number] | undefined;
      let line: [number, number, number] | undefined;
      const self: Record<string, unknown> = {};
      for (const m of [
        "fillRect",
        "fillRoundedRect",
        "strokeRoundedRect",
        "strokeRect",
        "lineBetween",
        "fillCircle",
        "strokeCircle",
        "beginPath",
        "moveTo",
        "lineTo",
        "arc",
        "closePath",
        "strokePath",
        "fillPath",
        "fillTriangle",
      ])
        self[m] = (...args: number[]) => (
          rec.ops.push({ m, args }), rec.styled.push({ m, args, fill, line }), self
        );
      self.fillStyle = (c: number, a = 1) => ((fill = [c, a]), rec.ops.push({ m: "fillStyle", args: [c, a] }), self);
      self.lineStyle = (w: number, c: number, a = 1) => (
        (line = [w, c, a]), rec.ops.push({ m: "lineStyle", args: [w, c, a] }), self
      );
      self.clear = () => ((rec.ops = []), (rec.styled = []), self);
      self.setScrollFactor = () => self;
      self.setDepth = () => self;
      self.setAlpha = (a: number) => ((rec.alpha = a), self);
      self.destroy = () => void (rec.destroyed = true);
      return self;
    },
    text: (x: number, y: number, words: string, style?: FakeText["style"]) => {
      const t: FakeText = { words, x, y, style, width: words.length * charW, destroyed: false };
      texts.push(t);
      const self: Record<string, unknown> = {
        width: t.width,
        setOrigin: (o: number) => ((t.origin = o), self),
        setScrollFactor: () => self,
        setDepth: () => self,
        setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
        destroy: () => void (t.destroyed = true),
      };
      return self;
    },
    zone: (x: number, y: number) => {
      const z = { x, y, handlers: {} as Record<string, () => void> };
      zones.push(z);
      const self: Record<string, unknown> = {
        setOrigin: () => self,
        setScrollFactor: () => self,
        setDepth: () => self,
        setInteractive: () => self,
        setPosition: (nx: number, ny: number) => ((z.x = nx), (z.y = ny), self),
        on: (event: string, fn: () => void) => ((z.handlers[event] = fn), self),
        destroy: () => undefined,
      };
      return self;
    },
  };
  const scene = {
    add,
    tweens: { add: (config: Record<string, unknown>) => (tweens.push(config), { stop: () => undefined }) },
  } as unknown as Phaser.Scene;
  return { scene, graphics, texts, zones, tweens };
}

function setup(charW?: number) {
  const api = {
    summary: vi.fn(async () => ({ unreadCount: 0, unclaimedCount: 0, waitingCount: 0 })),
    letters: vi.fn(async () => []),
    markRead: vi.fn(async () => undefined),
    claim: vi.fn(async (letterId: string) => ({ letterId, claimState: "claimed" as const, itemIds: [], gold: 0 })),
  } satisfies MailboxApi;
  const store = createMailboxStore({ api, storage: () => null, memberId: () => "me" });
  const stage = fakeScene(charW);
  const envelope = new MailboxEnvelope(stage.scene, { store, blocked: () => false });
  const waiting = (waitingCount: number) =>
    store.setState({ summary: { unreadCount: waitingCount, unclaimedCount: 0, waitingCount } });
  const live = () => stage.texts.filter((t) => !t.destroyed);
  /** The torch glow: the graphics whose fills are all the torch's. */
  const glow = () =>
    stage.graphics.find((g) => g.styled.length > 0 && g.styled.every((s) => s.fill?.[0] === palette.torch))!;
  const drawn = () => stage.graphics.filter((g) => g !== glow());
  /** The badge's ember ground, if one is drawn. */
  const badge = () =>
    drawn()
      .flatMap((g) => g.styled)
      .filter((s) => s.m === "fillRoundedRect" && s.fill?.[0] === palette.ember);
  /** The badge's graphics: the one its ember ground is drawn on. */
  const badgeGraphics = () => drawn().find((g) => g.styled.some((s) => s.fill?.[0] === palette.ember));
  /** The badge's rim: its outlines in the rim's bright line, and the box round their points. */
  const rim = () => {
    const ops = (badgeGraphics()?.styled ?? []).filter((s) => s.line?.[1] === palette.interactableBright);
    const paths = outlines(ops);
    const all = paths.flat();
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    return { ops, paths, box, lines: new Set(ops.map((s) => JSON.stringify(s.line))) };
  };
  return { ...stage, store, envelope, waiting, live, glow, drawn, badge, badgeGraphics, rim };
}

type Pt = { x: number; y: number };

const near = (a: Pt, b: Pt, within: number) => Math.hypot(a.x - b.x, a.y - b.y) <= within;

/** A stroke as the renderer lays it: a path (closed or not), one line, or a circle, by its points. */
interface Stroke {
  kind: "path" | "line" | "circle";
  pts: Pt[];
  closed: boolean;
}

/**
 * Every stroke the ops lay down. Each `strokePath` gives one stroke per sub-path (`moveTo` starts
 * one), an arc sampled into the sub-path it continues, `closePath` adding the first point again.
 */
function strokesOf(ops: Op[]): Stroke[] {
  const out: Stroke[] = [];
  let subs: Pt[][] = [];
  let closed = false;
  const current = () => subs[subs.length - 1];
  const add = (p: Pt) => (subs.length ? current().push(p) : subs.push([p]));
  for (const { m, args } of ops) {
    if (m === "beginPath") {
      subs = [];
      closed = false;
    } else if (m === "moveTo") subs.push([{ x: args[0], y: args[1] }]);
    else if (m === "lineTo") add({ x: args[0], y: args[1] });
    else if (m === "arc") {
      const [x, y, r, a0, a1] = args;
      for (let i = 0; i <= 24; i++) {
        const a = a0 + ((a1 - a0) * i) / 24;
        add({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
    } else if (m === "closePath") {
      closed = true;
      if (subs.length) current().push(current()[0]);
    } else if (m === "strokePath") {
      for (const pts of subs) out.push({ kind: "path", pts, closed });
      subs = [];
    } else if (m === "lineBetween")
      out.push({ kind: "line", pts: [{ x: args[0], y: args[1] }, { x: args[2], y: args[3] }], closed: false });
    else if (m === "strokeCircle") out.push({ kind: "circle", pts: [{ x: args[0], y: args[1] }], closed: true });
    else if (m === "strokeRoundedRect") {
      const [x, y, w, h] = args;
      const pts = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      out.push({ kind: "path", pts: [...pts, pts[0]], closed: true });
    }
  }
  return out;
}

/** Every point along a stroke's segments, at most `step` apart. */
function sampled(s: Stroke, step = 0.2): Pt[] {
  const out: Pt[] = [s.pts[0]];
  for (let i = 1; i < s.pts.length; i++) {
    const [a, b] = [s.pts[i - 1], s.pts[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** How far `p` stands from the segment a–b. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Where segments a–b and c–d cross, strictly inside both, if they do. */
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | undefined {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return undefined;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return undefined;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The outlines a graphics' stroked paths make, point by point, as Phaser 4.2.1's
 * GraphicsWebGLRenderer builds them before its DrawLine strokes each segment between two points
 * (Commands.ARC: an arc opening a path starts it at the arc's start, and one after it adds its start
 * too, joining the last point; LINE_TO adds a point; CLOSE_PATH adds the first point again;
 * strokeCircle is an arc from 0 to TAU, and strokeRoundedRect the commands Graphics.js gives it).
 * Unlike the renderer, no repeated point is dropped, so a segment of no length shows as two equal
 * points in a row.
 */
function outlines(ops: { m: string; args: number[] }[]): Pt[][] {
  const stroked: Pt[][] = [];
  let open: Pt[][] = [];
  let last: Pt[] | null = null;
  const arc = (x: number, y: number, r: number, start: number, end: number, anticlockwise = false) => {
    let sweep = end - start;
    if (anticlockwise) sweep = sweep < -2 * Math.PI ? -2 * Math.PI : sweep > 0 ? -2 * Math.PI + (sweep % (2 * Math.PI)) : sweep;
    else sweep = sweep > 2 * Math.PI ? 2 * Math.PI : sweep < 0 ? 2 * Math.PI + (sweep % (2 * Math.PI)) : sweep;
    const at = (a: number) => ({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    let iteration = 0;
    if (last === null) {
      last = [at(start)];
      open.push(last);
      iteration += 0.01;
    }
    for (; iteration < 1; iteration += 0.01) last.push(at(sweep * iteration + start));
    last.push(at(sweep + start));
  };
  const roundedRect = ([x, y, w, h, radius = 20]: number[]) => {
    const r = Math.min(radius, Math.min(w, h) / 2);
    const q = Math.PI / 2;
    return [
      { m: "beginPath", args: [] },
      { m: "moveTo", args: [x + r, y] },
      { m: "lineTo", args: [x + w - r, y] },
      { m: "moveTo", args: [x + w - r, y] },
      { m: "arc", args: [x + w - r, y + r, r, -q, 0] },
      { m: "lineTo", args: [x + w, y + h - r] },
      { m: "moveTo", args: [x + w, y + h - r] },
      { m: "arc", args: [x + w - r, y + h - r, r, 0, q] },
      { m: "lineTo", args: [x + r, y + h] },
      { m: "moveTo", args: [x + r, y + h] },
      { m: "arc", args: [x + r, y + h - r, r, q, Math.PI] },
      { m: "lineTo", args: [x, y + r] },
      { m: "moveTo", args: [x, y + r] },
      { m: "arc", args: [x + r, y + r, r, -Math.PI, -q] },
      { m: "strokePath", args: [] },
    ];
  };
  for (const { m, args } of ops.flatMap((o) => (o.m === "strokeRoundedRect" ? roundedRect(o.args) : [o]))) {
    if (m === "beginPath") (open = []), (last = null);
    else if (m === "moveTo") open.push((last = [{ x: args[0], y: args[1] }]));
    else if (m === "lineTo") {
      if (last) last.push({ x: args[0], y: args[1] });
      else open.push((last = [{ x: args[0], y: args[1] }]));
    } else if (m === "arc") arc(args[0], args[1], args[2], args[3], args[4], Boolean(args[5]));
    else if (m === "closePath") last?.push(last[0]);
    else if (m === "strokePath") stroked.push(...open);
    else if (m === "strokeCircle") {
      open = [];
      last = null;
      arc(args[0], args[1], args[2], 0, 2 * Math.PI);
      stroked.push(...open);
    }
  }
  return stroked;
}

const SEAL_PARTS = ["fillCircle", "strokeCircle"];

describe("MailboxEnvelope (FS-J1672 R1, R7: bare, with no seal)", () => {
  it.each([0, 3])("should draw no plate and no seal with %s waiting: only its lines, and the badge", (n) => {
    const env = setup();
    env.waiting(n);
    const ops = env.drawn().flatMap((g) => g.styled);
    expect(ops.filter((s) => SEAL_PARTS.includes(s.m))).toEqual([]);
    // no ground but the badge's: the plate's grounds were umber and charcoal rounded rects
    expect(ops.filter((s) => s.m.startsWith("fill") && s.fill?.[0] !== palette.ember)).toEqual([]);
    // no brass rule: every line is the envelope's amber or the badge's rim
    const lines = new Set(ops.filter((s) => s.line).map((s) => s.line![1]));
    for (const colour of lines) expect([palette.interactable, palette.interactableBright]).toContain(colour);
  });

  it("should keep the flap lines meeting where the seal stood, as one path through that point (FS-QHN87 R6)", () => {
    const env = setup();
    const point = envelopeFlapPoint(envelopeFrame(viewport));
    const all = strokesOf(env.drawn().flatMap((g) => g.ops));
    const flaps = all.filter((s) => s.pts.length === 3 && near(s.pts[1], point, 1e-9));
    expect(flaps).toHaveLength(1);
    // the two flap lines meet there inside the one path, so neither is a line of its own
    expect(all.filter((s) => near(s.pts[0], point, 0.01) || near(s.pts[s.pts.length - 1], point, 0.01))).toEqual([]);
  });

  it("should brighten its lines under the pointer and leave the badge as it was", () => {
    const env = setup();
    env.waiting(3);
    const badgeBefore = env.badge();
    const zone = env.zones[0];
    zone.handlers.pointerover();
    const lines = env.drawn().flatMap((g) => g.styled.filter((s) => s.m === "lineBetween"));
    expect(new Set(lines.map((s) => s.line![1]))).toEqual(new Set([palette.interactableBright]));
    expect(new Set(lines.map((s) => s.line![2]))).toEqual(new Set([1]));
    expect(env.badge()).toEqual(badgeBefore);
    expect(env.live().map((t) => t.words)).toEqual(expect.arrayContaining(["3", "Mailbox"]));
  });
});

describe("MailboxEnvelope (FS-J1672 R8, R9: the count badge)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  const centreOf = ([x, y, w, h]: number[]) => ({ x: x + w / 2, y: y + h / 2 });

  it("should show no badge and no count while nothing waits", () => {
    const env = setup();
    expect(env.badge()).toEqual([]);
    expect(env.live()).toEqual([]);
  });

  it("should centre a badge reading the count on the envelope's top-right corner, in ember with the seal's rim and type", () => {
    const env = setup();
    env.waiting(3);
    const [ground] = env.badge();
    expect(env.badge()).toHaveLength(1);
    expect(ground.fill).toEqual([palette.ember, 1]);
    expect(centreOf(ground.args)).toEqual({ x: 789, y: 669 });
    // 14 px tall, its ends fully round; as wide as its count plus 4 px a side, never under 14
    const [, , w, h, radius] = ground.args;
    expect(h).toBe(14);
    expect(radius).toBe(7);
    expect(w).toBe(Math.max(14, CHAR_W + 8));
    const rim = env.rim();
    expect(rim.lines).toEqual(new Set([JSON.stringify([1, palette.interactableBright, 0.85])]));
    const rimCentre = centreOf(rim.box);
    expect(rimCentre.x).toBeCloseTo(789, 9);
    expect(rimCentre.y).toBeCloseTo(669, 9);

    const [count] = env.live();
    expect(count).toMatchObject({ words: "3", x: 789, y: 669, origin: 0.5 });
    expect(count.style).toMatchObject({ fontSize: "11px", fontStyle: "bold", color: toCss(palette.hudText) });
  });

  it("should stand the badge at (989, 669) when the view is 1280 wide", () => {
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    const env = setup();
    env.waiting(3);
    expect(centreOf(env.badge()[0].args)).toEqual({ x: 989, y: 669 });
    expect(env.live()[0]).toMatchObject({ x: 989, y: 669 });
  });

  it("should follow the view to 1280 on a relayout", () => {
    const env = setup();
    env.waiting(3);
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.envelope.relayout();
    expect(env.badge().map((s) => centreOf(s.args))).toEqual([{ x: 989, y: 669 }]);
    expect(env.live().map((t) => [t.words, t.x, t.y])).toEqual([["3", 989, 669]]);
  });

  it("should read 99 for more, and move left just far enough to keep the badge, rim included, in the rect", () => {
    const env = setup();
    env.waiting(120);
    const [count] = env.live();
    expect(count.words).toBe("99");
    // the ember ground's box, and the rim's widened by half its 1 px line
    const [rx, ry, rw, rh] = env.rim().box;
    const parts = [...env.badge().map((s) => s.args), [rx - 0.5, ry - 0.5, rw + 1, rh + 1]];
    const right = Math.max(...parts.map(([x, , w]) => x + w));
    for (const [x, y, w, h] of parts) {
      expect(x).toBeGreaterThanOrEqual(742);
      expect(y).toBeGreaterThanOrEqual(658);
      expect(x + w).toBeLessThanOrEqual(742 + 58);
      expect(y + h).toBeLessThanOrEqual(658 + 46);
    }
    // just far enough: its right edge on the rect's
    expect(right).toBe(742 + 58);
    expect(count.x).toBe(centreOf(env.badge()[0].args).x);
  });

  it("should follow a lowered count at once, and go at 0", () => {
    const env = setup();
    env.waiting(3);
    env.waiting(1);
    expect(env.live().map((t) => t.words)).toEqual(["1"]);
    expect(env.badge()).toHaveLength(1);
    env.waiting(0);
    expect(env.live()).toEqual([]);
    expect(env.badge()).toEqual([]);
  });
});

describe("MailboxEnvelope (FS-J1672 R9: the badge's rim strokes no line of no length)", () => {
  // The rim's radius is half its 11 px height, and with one digit half its width too: Phaser
  // 4.2.1's strokeRoundedRect then puts lines of no length in its path, and DrawLine divides by a
  // segment's length. A circle or a pill of two arcs has none.
  const segments = (paths: Pt[][]) =>
    paths.flatMap((p) => p.slice(1).map((b, i) => Math.hypot(b.x - p[i].x, b.y - p[i].y)));

  it.each([
    ["one digit, as square as the badge goes", 6, 3, 14],
    ["one wide digit", CHAR_W, 3, CHAR_W + 8],
    ["two digits", CHAR_W, 42, CHAR_W * 2 + 8],
  ])("should stroke the rim for %s with every segment of some length, 1.5 px inside the ember", (_, charW, n, w) => {
    const env = setup(charW);
    env.waiting(n);
    const [ground] = env.badge();
    expect(ground.args[2]).toBe(w);
    const rim = env.rim();
    expect(Math.min(...segments(rim.paths))).toBeGreaterThan(1e-6);
    // one unbroken outline
    expect(rim.paths).toHaveLength(1);
    // the same geometry as before: 1 px, inset 1.5 inside the ember ground, ends fully round
    expect(rim.lines).toEqual(new Set([JSON.stringify([1, palette.interactableBright, 0.85])]));
    const [x, y, gw, gh] = ground.args;
    const expected = [x + 1.5, y + 1.5, gw - 3, gh - 3];
    rim.box.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
  });

  it("should draw a one-digit rim as a circle of half the rim's height", () => {
    const env = setup(6);
    env.waiting(3);
    expect(env.rim().ops.map((s) => [s.m, ...s.args])).toEqual([["strokeCircle", 789, 669, 5.5]]);
  });
});

describe("MailboxEnvelope (FS-J1672 R10: the pulse stays)", () => {
  it("should glow three times round the icon's rect, then leave the badge in place", () => {
    const env = setup();
    env.waiting(3);
    env.store.setState({ pulses: 1 });
    expect(env.tweens).toHaveLength(1);
    const tween = env.tweens[0];
    expect(tween).toMatchObject({ yoyo: true, repeat: 2 });
    // the glow is drawn round the former plate's rect: its tightest ring one px outside it
    const rings = env.glow().ops.filter((o) => o.m === "fillRoundedRect").map((o) => o.args);
    expect(rings).toContainEqual([741, 657, 60, 48, 7]);
    (tween.onComplete as () => void)();
    expect(env.glow().alpha).toBe(0);
    expect(env.badge()).toHaveLength(1);
    expect(env.live().map((t) => t.words)).toEqual(["3"]);
  });
});

// FS-QHN87 (the owner, 2026-11-13: 「icon感覺有點空 不是指背包是所有icon」): the envelope drawn richer, in
// the row's one sturdier line. I-QHN87-1.
describe("MailboxEnvelope (FS-QHN87 R1: the row's line)", () => {
  it("should stroke its lines at GLYPH_LINE_W alone, idle and hovered, and keep the badge's 1 px rim", () => {
    const env = setup();
    env.waiting(3);
    const body = () => env.drawn().find((g) => g !== env.badgeGraphics() && g.ops.length > 0)!;
    const widths = () => new Set(body().ops.filter((o) => o.m === "lineStyle").map((o) => o.args[0]));
    expect(widths()).toEqual(new Set([GLYPH_LINE_W]));
    env.zones[0].handlers.pointerover();
    expect(widths()).toEqual(new Set([GLYPH_LINE_W]));
    expect(env.rim().lines).toEqual(new Set([JSON.stringify([1, palette.interactableBright, 0.85])]));
  });
});

describe("MailboxEnvelope (FS-QHN87 R6, R11: tied, folded, creased)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  /** The envelope's own rect: 11 px in from the icon's left, top and right, 10 px up from its foot. */
  const rectOf = () => {
    const f = envelopeFrame(viewport);
    return { x: f.x + 11, y: f.y + 11, w: f.width - 22, h: f.height - 21 };
  };
  const linesOf = (env: ReturnType<typeof setup>) =>
    strokesOf(env.drawn().find((g) => g.ops.some((o) => o.m === "lineStyle" && o.args[0] === GLYPH_LINE_W))!.ops);
  const onBorder = (p: Pt, e: ReturnType<typeof rectOf>) =>
    (Math.abs(p.x - e.x) < 0.5 || Math.abs(p.x - e.x - e.w) < 0.5 || Math.abs(p.y - e.y) < 0.5 || Math.abs(p.y - e.y - e.h) < 0.5) &&
    p.x > e.x - 0.5 && p.x < e.x + e.w + 0.5 && p.y > e.y - 0.5 && p.y < e.y + e.h + 0.5;
  /** The cord: the long diagonal line from one edge of the envelope to another. */
  const cordOf = (strokes: Stroke[], e: ReturnType<typeof rectOf>) =>
    strokes.filter((s) => {
      if (s.kind !== "line") return false;
      const [a, b] = s.pts;
      const angle = (Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180) / Math.PI;
      const slant = Math.min(angle, 180 - angle);
      return onBorder(a, e) && onBorder(b, e) && Math.hypot(b.x - a.x, b.y - a.y) >= 20 && slant > 15 && slant < 75;
    });
  /** The knot: the lines crossing the cord, where they cross each other, and the loose ends' path. */
  const knotOf = (strokes: Stroke[], cord: Stroke) => {
    const [a, b] = cord.pts;
    const across = strokes.filter((s) => s !== cord && s.kind === "line" && crossing(s.pts[0], s.pts[1], a, b));
    const at = across.length === 2 ? crossing(across[0].pts[0], across[0].pts[1], across[1].pts[0], across[1].pts[1]) : undefined;
    const ends = at && strokes.filter((s) => s.kind === "path" && s.pts.slice(1, -1).some((p) => near(p, at, 1)));
    return { across, at, ends: ends ?? [] };
  };

  it("should draw no circle and no arc closing on itself, waiting or not", () => {
    for (const n of [0, 3]) {
      const env = setup();
      env.waiting(n);
      const strokes = linesOf(env);
      expect(strokes.filter((s) => s.kind === "circle")).toEqual([]);
      const arcs = env.drawn().flatMap((g) => g.ops).filter((o) => o.m === "arc");
      for (const { args } of arcs) expect(Math.abs(args[4] - args[3])).toBeLessThan(Math.PI * 2 - 1e-6);
    }
  });

  it("should crease each flap line just inside it, near its top corner, well clear of the flap point", () => {
    const env = setup();
    const e = rectOf();
    const point = envelopeFlapPoint(envelopeFrame(viewport));
    const strokes = linesOf(env);
    const flap = strokes.find((s) => s.pts.length === 3 && near(s.pts[1], point, 1e-9))!;
    for (const corner of [flap.pts[0], flap.pts[2]]) {
      const length = Math.hypot(point.x - corner.x, point.y - corner.y);
      const along = { x: (point.x - corner.x) / length, y: (point.y - corner.y) / length };
      const creases = strokes.filter((s) => {
        if (s.kind !== "line") return false;
        const [a, b] = s.pts;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const parallel = Math.abs(((b.x - a.x) * along.x + (b.y - a.y) * along.y) / len) > Math.cos((12 * Math.PI) / 180);
        const off = [a, b].map((p) => Math.abs((p.x - corner.x) * along.y - (p.y - corner.y) * along.x));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          parallel &&
          off.every((d) => d >= 2 && d <= 5) &&
          len <= length / 3 &&
          Math.min(Math.hypot(a.x - point.x, a.y - point.y), Math.hypot(b.x - point.x, b.y - point.y)) >= 6 &&
          Math.hypot(mid.x - corner.x, mid.y - corner.y) < Math.hypot(mid.x - point.x, mid.y - point.y) &&
          mid.x > e.x && mid.x < e.x + e.w && mid.y > e.y && mid.y < e.y + e.h
        );
      });
      expect(creases).toHaveLength(1);
    }
  });

  it("should fold a bottom corner over: the corner cut by a short diagonal, the turned flap's edges inside it", () => {
    const env = setup();
    const e = rectOf();
    const strokes = linesOf(env);
    const points = strokes.flatMap((s) => sampled(s));
    const corners = [
      { x: e.x, y: e.y + e.h },
      { x: e.x + e.w, y: e.y + e.h },
    ];
    const folded = corners.filter((c) => !points.some((p) => near(p, c, 2)));
    expect(folded).toHaveLength(1);
    const [c] = folded;
    // the cut: a segment from the side edge to the bottom edge, both ends within 10 px of the corner
    const segs = strokes.flatMap((s) => s.pts.slice(1).map((b, i) => [s.pts[i], b] as const));
    const cut = segs.find(
      ([a, b]) =>
        [a, b].some((p) => Math.abs(p.x - c.x) < 0.5 && Math.abs(p.y - c.y) < 10 && Math.abs(p.y - c.y) > 2) &&
        [a, b].some((p) => Math.abs(p.y - c.y) < 0.5 && Math.abs(p.x - c.x) < 10 && Math.abs(p.x - c.x) > 2),
    );
    expect(cut).toBeDefined();
    // the turned flap: a path from one end of the cut to the other through a point inside the envelope
    const flap = strokes.find(
      (s) =>
        s.kind === "path" &&
        ((near(s.pts[0], cut![0], 0.01) && near(s.pts[s.pts.length - 1], cut![1], 0.01)) ||
          (near(s.pts[0], cut![1], 0.01) && near(s.pts[s.pts.length - 1], cut![0], 0.01))) &&
        s.pts.some((p) => p.x > e.x + 1.5 && p.x < e.x + e.w - 1.5 && p.y < e.y + e.h - 1.5),
    );
    expect(flap).toBeDefined();
  });

  it("should tie a cord across it on a diagonal, edge to edge, no nearer than 3 px to the flap point", () => {
    const env = setup();
    const e = rectOf();
    const point = envelopeFlapPoint(envelopeFrame(viewport));
    const cords = cordOf(linesOf(env), e);
    expect(cords).toHaveLength(1);
    expect(toSegment(point, cords[0].pts[0], cords[0].pts[1])).toBeGreaterThanOrEqual(3);
  });

  it("should knot the cord with crossing strokes and two loose ends, never a loop, 8 px or more from the flap point and the middle", () => {
    const env = setup();
    const e = rectOf();
    const point = envelopeFlapPoint(envelopeFrame(viewport));
    const strokes = linesOf(env);
    const [cord] = cordOf(strokes, e);
    const knot = knotOf(strokes, cord);
    expect(knot.across).toHaveLength(2);
    expect(knot.at).toBeDefined();
    expect(toSegment(knot.at!, cord.pts[0], cord.pts[1])).toBeLessThan(1);
    expect(Math.hypot(knot.at!.x - point.x, knot.at!.y - point.y)).toBeGreaterThanOrEqual(8);
    expect(Math.hypot(knot.at!.x - (e.x + e.w / 2), knot.at!.y - (e.y + e.h / 2))).toBeGreaterThanOrEqual(8);
    // the loose ends: one open path whose two ends hang below the knot
    expect(knot.ends).toHaveLength(1);
    const [ends] = knot.ends;
    expect(ends.closed).toBe(false);
    expect(near(ends.pts[0], ends.pts[ends.pts.length - 1], 1)).toBe(false);
    for (const p of [ends.pts[0], ends.pts[ends.pts.length - 1]]) expect(p.y).toBeGreaterThan(knot.at!.y + 2);
  });

  it("should leave the envelope's other lines undrawn under the cord, as if it lay on top", () => {
    const env = setup();
    const e = rectOf();
    const strokes = linesOf(env);
    const [cord] = cordOf(strokes, e);
    const knot = knotOf(strokes, cord);
    const [a, b] = cord.pts;
    const edge = strokes.reduce((x, y) => (sampled(y).length > sampled(x).length ? y : x));
    const others = strokes.filter((s) => s !== cord && s !== edge && !knot.across.includes(s) && !knot.ends.includes(s));
    for (const s of others) {
      // the cord's own width and the other line's: no part of it under the cord
      for (const p of sampled(s)) expect(toSegment(p, a, b)).toBeGreaterThanOrEqual(GLYPH_LINE_W);
    }
    // and some line is cut there: one of its ends stands at the cord's side
    const cut = others.some((s) =>
      [s.pts[0], s.pts[s.pts.length - 1]].some((p) => toSegment(p, a, b) < GLYPH_LINE_W + 1),
    );
    expect(cut).toBe(true);
  });

  it("should keep the cord, the knot and the folded corner out of the widest badge's box", () => {
    const env = setup();
    env.waiting(120);
    const e = rectOf();
    const [x, y, w, h] = env.badge()[0].args;
    const half = GLYPH_LINE_W / 2;
    const strokes = linesOf(env);
    const [cord] = cordOf(strokes, e);
    const knot = knotOf(strokes, cord);
    const bottomCorner = (p: Pt) => p.y > e.y + e.h - 10 && (p.x < e.x + 10 || p.x > e.x + e.w - 10);
    const fold = strokes.filter((s) => s.kind === "path" && s.pts.every(bottomCorner));
    const kept = [cord, ...knot.across, ...knot.ends, ...fold];
    expect(kept.length).toBeGreaterThanOrEqual(4);
    for (const p of kept.flatMap((s) => sampled(s))) {
      const inside = p.x + half > x && p.x - half < x + w && p.y + half > y && p.y - half < y + h;
      expect(inside).toBe(false);
    }
  });

  it("should draw its lines with only the stroke methods the letter panel's stand-in knows (R11)", () => {
    const called = new Set<string>();
    const g: object = new Proxy({}, { get: (_, m: string) => () => (called.add(m), g) });
    drawEnvelopeLines(g as never, envelopeFrame(viewport), palette.interactable, 0.85);
    const allowed = ["lineStyle", "strokeRoundedRect", "strokeRect", "lineBetween", "beginPath", "moveTo", "lineTo", "arc", "closePath", "strokePath"];
    for (const m of called) expect(allowed).toContain(m);
  });
});
