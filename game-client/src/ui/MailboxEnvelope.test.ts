import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { createMailboxStore, type MailboxApi } from "@/stores/mailboxStore";
import { palette, toCss } from "@/utils/canvasPalette";
import { envelopeFrame } from "./letterPanelLayout";
import { MailboxEnvelope, envelopeFlapPoint } from "./MailboxEnvelope";

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

  it("should keep the flap lines meeting where the seal stood", () => {
    const env = setup();
    const point = envelopeFlapPoint(envelopeFrame(viewport));
    const meeting = env
      .drawn()
      .flatMap((g) => g.ops)
      .filter(
        ({ m, args }) =>
          m === "lineBetween" &&
          ((args[0] === point.x && args[1] === point.y) || (args[2] === point.x && args[3] === point.y)),
      );
    expect(meeting).toHaveLength(2);
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
