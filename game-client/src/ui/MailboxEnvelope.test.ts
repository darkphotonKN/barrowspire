import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { createMailboxStore, type MailboxApi } from "@/stores/mailboxStore";
import { mix, palette, shade, toCss } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";
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
  scale?: number;
  x?: number;
  y?: number;
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

/** A render texture, as the knockout made it (FS-7TQN4 R12). */
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
  log: { m: "draw" | "erase" | "render"; g?: FakeGraphics }[];
  destroyed: boolean;
}
/** An image made with `add.image`: the envelope's shadow, on its texture's own texture (FS-S8Z2Y R1). */
interface FakeImage {
  x: number;
  y: number;
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
 * `add.renderTexture` that throws (FS-7TQN4 R15).
 */
type TextureMode = "none" | "ok" | "throws";

function fakeScene(charW = CHAR_W, texture: TextureMode = "none") {
  const graphics: FakeGraphics[] = [];
  const made: FakeGraphics[] = [];
  const textures: FakeTexture[] = [];
  const images: FakeImage[] = [];
  const textureOf = new Map<unknown, FakeTexture>();
  const attempts = { renderTexture: 0 };
  const recordOf = new Map<unknown, FakeGraphics>();
  /** The scene's display list, in drawing order: what `add` made, as Phaser's DisplayList keeps it. */
  const list: unknown[] = [];
  /** Each display-list object's record, to read the order by. */
  const objectOf = new Map<unknown, unknown>();
  const texts: FakeText[] = [];
  const zones: { x: number; y: number; handlers: Record<string, () => void> }[] = [];
  const tweens: Record<string, unknown>[] = [];
  const onList = (self: unknown, rec: unknown) => (list.push(self), objectOf.set(self, rec), self);
  const offList = (self: unknown) => list.includes(self) && list.splice(list.indexOf(self), 1);
  const newGraphics = (into: FakeGraphics[]) => {
    const rec: FakeGraphics = { ops: [], styled: [], alpha: 1, destroyed: false };
    into.push(rec);
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
    self.setScale = (sc: number) => ((rec.scale = sc), self);
    self.setPosition = (x: number, y: number) => ((rec.x = x), (rec.y = y), self);
    self.destroy = () => void ((rec.destroyed = true), offList(self));
    recordOf.set(self, rec);
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
  const add = {
    graphics: () => {
      const self = newGraphics(graphics);
      return onList(self, recordOf.get(self));
    },
    ...(texture === "none" ? {} : { renderTexture, image }),
    text: (x: number, y: number, words: string, style?: FakeText["style"]) => {
      const t: FakeText = { words, x, y, style, width: words.length * charW, destroyed: false };
      texts.push(t);
      const self: Record<string, unknown> = {
        width: t.width,
        setOrigin: (o: number) => ((t.origin = o), self),
        setScrollFactor: () => self,
        setDepth: () => self,
        setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
        destroy: () => void ((t.destroyed = true), offList(self)),
      };
      return onList(self, t);
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
  // Phaser's List.moveBelow (src/utils/array/MoveBelow.js): child1 to just under child2, if above it
  const children = {
    list,
    moveBelow: (child1: unknown, child2: unknown) => {
      const [at, base] = [list.indexOf(child1), list.indexOf(child2)];
      if (at < 0 || base < 0) throw new Error("Supplied items must be elements of the same array");
      if (at > base) list.splice(base, 0, ...list.splice(at, 1));
    },
  };
  const make = { graphics: () => newGraphics(made) };
  const scene = {
    add,
    ...(texture === "none" ? {} : { make, children }),
    tweens: { add: (config: Record<string, unknown>) => (tweens.push(config), { stop: () => undefined }) },
  } as unknown as Phaser.Scene;
  /** The drawing order of display-list objects, by their records. */
  const order = () => list.map((o) => objectOf.get(o));
  return { scene, graphics, made, textures, images, attempts, texts, zones, tweens, order };
}

function setup(charW?: number, texture: TextureMode = "none") {
  const api = {
    summary: vi.fn(async () => ({ unreadCount: 0, unclaimedCount: 0, waitingCount: 0 })),
    letters: vi.fn(async () => []),
    markRead: vi.fn(async () => undefined),
    claim: vi.fn(async (letterId: string) => ({ letterId, claimState: "claimed" as const, itemIds: [], gold: 0 })),
  } satisfies MailboxApi;
  const store = createMailboxStore({ api, storage: () => null, memberId: () => "me" });
  const stage = fakeScene(charW, texture);
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
    expect(centreOf(ground.args)).toEqual({ x: 831, y: 669 });
    // 14 px tall, its ends fully round; as wide as its count plus 4 px a side, never under 14
    const [, , w, h, radius] = ground.args;
    expect(h).toBe(14);
    expect(radius).toBe(7);
    expect(w).toBe(Math.max(14, CHAR_W + 8));
    const rim = env.rim();
    expect(rim.lines).toEqual(new Set([JSON.stringify([1, palette.interactableBright, 0.85])]));
    const rimCentre = centreOf(rim.box);
    expect(rimCentre.x).toBeCloseTo(831, 9);
    expect(rimCentre.y).toBeCloseTo(669, 9);

    const [count] = env.live();
    expect(count).toMatchObject({ words: "3", x: 831, y: 669, origin: 0.5 });
    expect(count.style).toMatchObject({ fontSize: "11px", fontStyle: "bold", color: toCss(palette.hudText) });
  });

  it("should stand the badge at (1031, 669) when the view is 1280 wide", () => {
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    const env = setup();
    env.waiting(3);
    expect(centreOf(env.badge()[0].args)).toEqual({ x: 1031, y: 669 });
    expect(env.live()[0]).toMatchObject({ x: 1031, y: 669 });
  });

  it("should follow the view to 1280 on a relayout", () => {
    const env = setup();
    env.waiting(3);
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.envelope.relayout();
    expect(env.badge().map((s) => centreOf(s.args))).toEqual([{ x: 1031, y: 669 }]);
    expect(env.live().map((t) => [t.words, t.x, t.y])).toEqual([["3", 1031, 669]]);
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
      expect(x).toBeGreaterThanOrEqual(786);
      expect(y).toBeGreaterThanOrEqual(658);
      expect(x + w).toBeLessThanOrEqual(786 + 54);
      expect(y + h).toBeLessThanOrEqual(658 + 46);
    }
    // just far enough: its right edge on the rect's
    expect(right).toBe(786 + 54);
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
    expect(env.rim().ops.map((s) => [s.m, ...s.args])).toEqual([["strokeCircle", 831, 669, 5.5]]);
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
    expect(rings).toContainEqual([785, 657, 56, 48, 7]);
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

describe("MailboxEnvelope (FS-QHN87 round 1: back to the plain envelope, in the row's line)", () => {
  // The owner, 2026-11-13: 「信箱有點怪 還是回到上一版好了」. The lines as at f779a9b0, at GLYPH_LINE_W,
  // the flap one path so its point is joined (R2).
  it("should draw only its edge, the flap down to its point as one path, and the two folds at its foot", () => {
    const env = setup();
    const f = envelopeFrame(viewport);
    const e = { x: f.x + (f.width - 36) / 2, y: f.y + 11, w: 36, h: 25 };
    const point = envelopeFlapPoint(f);
    const body = env.drawn().find((g) => g.ops.some((o) => o.m === "lineStyle" && o.args[0] === GLYPH_LINE_W))!;
    expect(body.ops).toEqual([
      { m: "lineStyle", args: [GLYPH_LINE_W, palette.interactable, 0.85] },
      { m: "strokeRoundedRect", args: [e.x, e.y, e.w, e.h, 2] },
      { m: "beginPath", args: [] },
      { m: "moveTo", args: [e.x + 1, e.y + 1] },
      { m: "lineTo", args: [point.x, point.y] },
      { m: "lineTo", args: [e.x + e.w - 1, e.y + 1] },
      { m: "strokePath", args: [] },
      { m: "lineBetween", args: [e.x + 1, e.y + e.h - 1, e.x + e.w * 0.36, e.y + e.h * 0.5] },
      { m: "lineBetween", args: [e.x + e.w - 1, e.y + e.h - 1, e.x + e.w * 0.64, e.y + e.h * 0.5] },
    ]);
  });

  it("should draw its lines with only the stroke methods the letter panel's stand-in knows (R11)", () => {
    const called = new Set<string>();
    const g: object = new Proxy({}, { get: (_, m: string) => () => (called.add(m), g) });
    drawEnvelopeLines(g as never, envelopeFrame(viewport), palette.interactable, 0.85);
    const allowed = ["lineStyle", "strokeRoundedRect", "strokeRect", "lineBetween", "beginPath", "moveTo", "lineTo", "arc", "closePath", "strokePath"];
    for (const m of called) expect(allowed).toContain(m);
  });
});

// FS-7TQN4 R7, R8, R10, R12–R16 (the owner, 2026-11-13: 「其他icon不是也要反白嗎」): the town envelope is
// a bronze knockout, the count badge over it and the glow under it. I-7TQN4-1.

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
 * toward the bright amber at the envelope's top and shaded 20% at its foot, within 1 per channel.
 */
function expectLit(t: FakeTexture, base: number) {
  const [tl, tr, bl, br] = t.tints!;
  expect(tr).toBe(tl);
  expect(br).toBe(bl);
  const ys = knockoutOf(t).fills.flat().map((p) => p.y);
  const within = (got: number[], want: number) =>
    got.forEach((c, i) => expect(Math.abs(c - rgbOf(want)[i])).toBeLessThanOrEqual(1));
  within(tintAt(t, Math.min(...ys)), mix(base, palette.interactableBright, 0.25));
  within(tintAt(t, Math.max(...ys)), shade(base, 0.2));
}

/** What the knockout holds, in logical px on the screen: its fills and its cut lines. */
function knockoutOf(t: FakeTexture) {
  const solid = t.log.find((e) => e.m === "draw")!.g!;
  const cut = t.log.find((e) => e.m === "erase")!.g!;
  const shown = (g: FakeGraphics) => (p: Pt): Pt => ({
    x: t.x + (p.x * (g.scale ?? 1) + (g.x ?? 0) - t.width / 2) * t.scale!,
    y: t.y + (p.y * (g.scale ?? 1) + (g.y ?? 0) - t.height / 2) * t.scale!,
  });
  const fills: Pt[][] = [];
  let path: Pt[] = [];
  for (const { m, args } of solid.ops) {
    if (m === "beginPath") path = [];
    else if (m === "moveTo" || m === "lineTo") path.push(shown(solid)({ x: args[0], y: args[1] }));
    else if (m === "fillPath") fills.push(path);
  }
  const cuts = strokesOf(cut.ops).map((k) => ({ ...k, pts: k.pts.map(shown(cut)) }));
  return { solid, cut, fills, cuts };
}

describe("MailboxEnvelope (FS-7TQN4 R7, R12: a solid letter in its own texture)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1, 1.5, 2])(
    "should make one texture at render scale %s on the envelope's slot: depth 1000, scroll factor 0, the slot × k, at 1/k, its body drawing nothing",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const k = 2 * renderScale;
      const env = setup(undefined, "ok");
      env.waiting(3);
      const f = envelopeFrame(viewport);
      expect(env.textures).toHaveLength(1);
      const [t] = env.textures;
      expect(t).toMatchObject({
        x: f.x + f.width / 2,
        y: f.y + f.height / 2,
        width: Math.round(f.width * k),
        height: Math.round(f.height * k),
        depth: 1000,
        scrollFactor: 0,
      });
      expect(t.scale).toBeCloseTo(1 / k, 12);
      // no lines left on any graphics: only the glow's fills and the badge
      for (const g of env.drawn()) expect(g.ops.filter((o) => o.m === "lineStyle" && o.args[0] === GLYPH_LINE_W)).toEqual([]);
      expect(env.drawn().filter((g) => g.ops.length > 0)).toEqual([env.badgeGraphics()]);
    },
  );

  it.each([1, 2])(
    "should fill one rounded rect equal to the envelope's rect, radius 2, white at 1, then erase only the flap through its point and the two folds, each on an unscaled graphics at lineStyle(1.6·k), at render scale %s",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const k = 2 * renderScale;
      const env = setup(undefined, "ok");
      const [t] = env.textures;
      expect(t.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
      const { solid, cut, fills, cuts } = knockoutOf(t);
      for (const o of solid.ops.filter((x) => x.m === "fillStyle")) expect(o.args).toEqual([TINT_IDENTITY, 1]);
      const f = envelopeFrame(viewport);
      const e = { x: f.x + (f.width - 36) / 2, y: f.y + 11, w: 36, h: 25 };
      expect(fills).toHaveLength(1);
      const xs = fills[0].map((p) => p.x);
      const ys = fills[0].map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(e.x, 9);
      expect(Math.max(...xs)).toBeCloseTo(e.x + e.w, 9);
      expect(Math.min(...ys)).toBeCloseTo(e.y, 9);
      expect(Math.max(...ys)).toBeCloseTo(e.y + e.h, 9);
      const corner = Math.min(...fills[0].map((p) => Math.hypot(p.x - e.x, p.y - e.y)));
      expect(corner).toBeCloseTo(2 * Math.SQRT2 - 2, 2);
      // the cuts: strokes alone, white at 1, unscaled at 1.6·k
      expect(cut.ops.map((o) => o.m).filter((m) => m.startsWith("fill") || m === "lineBetween")).toEqual([]);
      expect(cut.scale ?? 1).toBe(1);
      for (const o of cut.ops.filter((x) => x.m === "lineStyle")) {
        expect(o.args[0]).toBeCloseTo(1.6 * k, 9);
        expect(o.args.slice(1)).toEqual([TINT_IDENTITY, 1]);
      }
      expect(cuts).toHaveLength(3);
      const point = envelopeFlapPoint(f);
      const flaps = cuts.filter((c) => c.pts.length === 3 && near(c.pts[1], point, 1));
      expect(flaps).toHaveLength(1);
      expect(near(flaps[0].pts[0], { x: e.x + 1, y: e.y + 1 }, 1e-6)).toBe(true);
      expect(near(flaps[0].pts[2], { x: e.x + e.w - 1, y: e.y + 1 }, 1e-6)).toBe(true);
      const folds = cuts.filter((c) => c !== flaps[0]);
      expect(folds.map((c) => c.pts.length)).toEqual([2, 2]);
      expect(near(folds[0].pts[0], { x: e.x + 1, y: e.y + e.h - 1 }, 1e-6)).toBe(true);
      expect(near(folds[1].pts[0], { x: e.x + e.w - 1, y: e.y + e.h - 1 }, 1e-6)).toBe(true);
      expect(env.made.every((g) => g.destroyed)).toBe(true);
    },
  );

  it("should tint it bronze at 0.85, lifted at 1 under the pointer, back on leaving, building nothing (R10; lit from above, FS-S8Z2Y R4, R5)", () => {
    const env = setup(undefined, "ok");
    const [t] = env.textures;
    expectLit(t, BRONZE);
    expect(t.alpha).toBe(0.85);
    env.zones[0].handlers.pointerover();
    expectLit(t, BRONZE_LIT);
    expect(t.alpha).toBe(1);
    expect(env.live().map((x) => x.words)).toEqual(["Mailbox"]);
    env.zones[0].handlers.pointerout();
    expectLit(t, BRONZE);
    expect(t.alpha).toBe(0.85);
    expect(env.textures).toHaveLength(1);
    expect(env.made).toHaveLength(2);
    expect(t.log).toHaveLength(3);
  });
});

describe("MailboxEnvelope (FS-7TQN4 R8: the badge over the knockout, the glow under it)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  /** Whether the live image stands over the glow and under the badge's graphics and its count. */
  const ordered = (env: ReturnType<typeof setup>) => {
    const order = env.order();
    const image = env.textures.find((t) => !t.destroyed)!;
    const at = order.indexOf(image);
    expect(at).toBeGreaterThan(order.indexOf(env.glow()));
    expect(at).toBeLessThan(order.indexOf(env.badgeGraphics() ?? env.graphics[2]));
    for (const t of env.live()) expect(at).toBeLessThan(order.indexOf(t));
  };

  it("should stand the image between the glow and the badge after building, with letters waiting", () => {
    const env = setup(undefined, "ok");
    env.waiting(3);
    ordered(env);
  });

  it("should stand it there after the count goes from 0 to 3", () => {
    const env = setup(undefined, "ok");
    env.waiting(0);
    ordered(env);
    env.waiting(3);
    expect(env.live().map((t) => t.words)).toEqual(["3"]);
    ordered(env);
  });

  it("should stand it there after a rebuild at a new render scale, with no scene relayout", () => {
    const env = setup(undefined, "ok");
    env.waiting(3);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.textures).toHaveLength(2);
    ordered(env);
  });
});

describe("MailboxEnvelope (FS-7TQN4 R11, R13, R14: relayout, a new render scale, destroy)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should move the image to the slot's new centre on a relayout to 1280, building nothing", () => {
    const env = setup(undefined, "ok");
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.envelope.relayout();
    const f = envelopeFrame(viewport);
    expect(env.textures).toHaveLength(1);
    expect(env.textures[0]).toMatchObject({ x: f.x + f.width / 2, y: f.y + f.height / 2, destroyed: false });
  });

  it("should build anew at k = 4 when the render scale goes 1 → 2, with no relayout, destroying the old and keeping the pointer's tint; a width change alone builds nothing", () => {
    const env = setup(undefined, "ok");
    env.zones[0].handlers.pointerover();
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    const f = envelopeFrame(viewport);
    expect(env.textures).toHaveLength(2);
    const [old, now] = env.textures;
    expect(old.destroyed).toBe(true);
    expect(now).toMatchObject({ width: Math.round(f.width * 4), height: Math.round(f.height * 4), alpha: 1 });
    expectLit(now, BRONZE_LIT);
    expect(now.scale).toBeCloseTo(1 / 4, 12);
    viewport.set({ width: 1280, height: 720, renderScale: 2 });
    expect(env.textures).toHaveLength(2);
  });

  it("should destroy its image and stop watching on destroy: a later render-scale change makes nothing and throws nothing", () => {
    const env = setup(undefined, "ok");
    env.envelope.destroy();
    expect(env.textures[0].destroyed).toBe(true);
    expect(() => viewport.set({ width: 1080, height: 720, renderScale: 2 })).not.toThrow();
    expect(env.attempts.renderTexture).toBe(1);
  });
});

describe("MailboxEnvelope (FS-7TQN4 R15, R16: the fallback)", () => {
  afterEach(() => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    vi.restoreAllMocks();
  });

  it("should draw today's lines where making the texture throws, op for op as with no texture, and keep them on a later render-scale change", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const plain = setup();
    const thrown = setup(undefined, "throws");
    expect(thrown.textures).toEqual([]);
    const body = (env: ReturnType<typeof setup>) => env.graphics[1];
    expect(body(thrown).ops.length).toBeGreaterThan(0);
    expect(body(thrown).ops).toEqual(body(plain).ops);
    thrown.zones[0].handlers.pointerover();
    plain.zones[0].handlers.pointerover();
    expect(body(thrown).ops).toEqual(body(plain).ops);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(thrown.attempts.renderTexture).toBe(1);
    expect(body(thrown).ops).toEqual(body(plain).ops);
  });

  it.each(["none", "ok", "throws"] as const)("should keep the zone, the label and the press toggle (texture: %s)", (texture) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = setup(undefined, texture);
    const f = envelopeFrame(viewport);
    expect(env.zones[0]).toMatchObject({ x: f.x, y: f.y });
    env.zones[0].handlers.pointerover();
    expect(env.live().map((t) => t.words)).toEqual(["Mailbox"]);
    env.zones[0].handlers.pointerdown();
    expect(env.store.getState().panelOpen).toBe(true);
    env.zones[0].handlers.pointerdown();
    expect(env.store.getState().panelOpen).toBe(false);
  });
});

// FS-S8Z2Y (the owner, 2026-11-13: 「icon可以加一點浮凸的陰影或漸層嗎」, 「加上浮凸漸層」): the town envelope
// on its drop shadow, lit from above, the badge over both and the glow under both. I-S8Z2Y-1.

describe("MailboxEnvelope (FS-S8Z2Y R1–R3, R8: the shadow, between the glow and the envelope)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  /** glow, shadow, envelope, badge, count: the shadow just under the live image. */
  const stacked = (env: ReturnType<typeof setup>) => {
    const order = env.order();
    const image = env.textures.find((t) => !t.destroyed)!;
    const shadow = env.images.find((i) => !i.destroyed)!;
    expect(shadow.of).toBe(image);
    expect(order.indexOf(shadow)).toBe(order.indexOf(image) - 1);
    expect(order.indexOf(shadow)).toBeGreaterThan(order.indexOf(env.glow()));
    expect(order.indexOf(image)).toBeLessThan(order.indexOf(env.badgeGraphics() ?? env.graphics[2]));
    for (const t of env.live()) expect(order.indexOf(shadow)).toBeLessThan(order.indexOf(t));
  };

  it.each([1, 1.5, 2])(
    "should lay its own texture under it at render scale %s: palette.ink in FILL at 0.5, 1 px right and down, at 1/k, depth 1000, scroll factor 0",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const env = setup(undefined, "ok");
      env.waiting(3);
      const f = envelopeFrame(viewport);
      expect(env.images).toHaveLength(1);
      const [shadow] = env.images;
      expect(shadow).toMatchObject({
        x: f.x + f.width / 2 + 1,
        y: f.y + f.height / 2 + 1,
        depth: 1000,
        scrollFactor: 0,
        tintMode: 1,
        alpha: 0.5,
      });
      expect(shadow.tints).toEqual([palette.ink, palette.ink, palette.ink, palette.ink]);
      expect(shadow.scale).toBeCloseTo(1 / (2 * renderScale), 12);
      stacked(env);
    },
  );

  it("should stand glow, shadow, envelope, badge and count in that order after the count goes 0 → 3", () => {
    const env = setup(undefined, "ok");
    env.waiting(0);
    stacked(env);
    env.waiting(3);
    stacked(env);
  });

  it("should stand them so after a rebuild at a new render scale, the old shadow destroyed, with no scene relayout", () => {
    const env = setup(undefined, "ok");
    env.waiting(3);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.images).toHaveLength(2);
    expect(env.images[0].destroyed).toBe(true);
    stacked(env);
  });

  it("should leave the shadow be on hover, move it on a relayout, and take it down on destroy", () => {
    const env = setup(undefined, "ok");
    const [shadow] = env.images;
    const was = { ...shadow, tints: [...shadow.tints!] };
    env.zones[0].handlers.pointerover();
    env.zones[0].handlers.pointerout();
    expect(shadow).toEqual(was);
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    env.envelope.relayout();
    const f = envelopeFrame(viewport);
    expect(shadow).toMatchObject({ x: f.x + f.width / 2 + 1, y: f.y + f.height / 2 + 1 });
    env.envelope.destroy();
    expect(shadow.destroyed).toBe(true);
    expect(env.images).toHaveLength(1);
  });

  it.each(["none", "throws"] as const)("should lay no shadow under the line envelope (texture: %s)", (texture) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = setup(undefined, texture);
    expect(env.images).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("MailboxEnvelope's sounds (FS-WDM0X § Change: Menu, dialog and notice sounds, M5, M10, M16)", () => {
  /** The envelope with a recording play, refused while `blocked` says so. */
  function heardEnvelope() {
    const api = {
      summary: vi.fn(async () => ({ unreadCount: 0, unclaimedCount: 0, waitingCount: 0 })),
      letters: vi.fn(async () => []),
      markRead: vi.fn(async () => undefined),
      claim: vi.fn(async (letterId: string) => ({ letterId, claimState: "claimed" as const, itemIds: [], gold: 0 })),
    } satisfies MailboxApi;
    const store = createMailboxStore({ api, storage: () => null, memberId: () => "me" });
    const stage = fakeScene();
    const heard: string[] = [];
    const state = { blocked: false };
    new MailboxEnvelope(stage.scene, { store, blocked: () => state.blocked, play: (effect) => void heard.push(effect) });
    return { store, zone: stage.zones[0], heard, state };
  }

  it("should play menu_hover as the pointer comes onto it", () => {
    const t = heardEnvelope();

    t.zone.handlers.pointerover();
    t.zone.handlers.pointerout();
    t.zone.handlers.pointerover();

    expect(t.heard).toEqual(["menu_hover", "menu_hover"]);
  });

  it("should play menu_error for a press while a dialogue holds the screen, and nothing of its own for a press that opens", () => {
    const t = heardEnvelope();
    t.state.blocked = true;
    t.zone.handlers.pointerdown();
    expect(t.store.getState().panelOpen).toBe(false);
    expect(t.heard).toEqual(["menu_error"]);

    t.state.blocked = false;
    t.zone.handlers.pointerdown();
    expect(t.store.getState().panelOpen).toBe(true);
    expect(t.heard).toEqual(["menu_error"]);
  });

  it("should play notify as it glows for a newer letter", () => {
    const t = heardEnvelope();

    t.store.setState({ pulses: 1 });

    expect(t.heard).toEqual(["notify"]);
  });
});
