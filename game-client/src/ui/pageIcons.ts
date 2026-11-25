/**
 * The class books' page pictures (FS-X2CMM §I R45, ADR-0094): the 14 pages of the Spellbook, the
 * Hunter's Journal, The Ledger and Scars, each a glyph for the page roundel (`pageRoundel.ts`) in its
 * page's main pigment, by what the page does, never by its class: light and finding ochre, movement
 * and air lapis, binding and blood madder, growth, beasts and cures verdigris.
 *
 * Each glyph is a flat filled picture with its inner lines cut through to the ground (the knockout's
 * language, ADR-0080), and a few bone strokes and fills laid on it for highlights and detail; bone
 * lies on the body, so a locked page's bone reads as cuts. In local px about the roundel's centre, x
 * to the right and y down, drawn in the ability bar's 30 px box and kept inside its round (r 15), then
 * fitted to a roundel (`fitGlyph`). Built for Ultima Online's fidelity at 44 px and to still read at
 * 28: bold silhouettes, no feature under about 3 px, a little texture from the bone. Data only. Tweak
 * rounds from the owner's contact sheet (R46) land here.
 */

import { bend, oval, type Circle, type KnockoutCut, type KnockoutPicture, type Pt } from "./knockout";
import { circle, crescent, gapOver, linesOf, place, roundedBox, type Shape } from "./abilityIcons";
import type { PageGlyph, PageIcon } from "./pageRoundel";

/** Every page, in book order: the Spellbook, the Hunter's Journal, The Ledger, Scars (FS-X2CMM §B). */
export const PAGE_IDS = [
  "witchlight",
  "far_hand",
  "levitate",
  "binding_glyph",
  "recall",
  "trackers_eye",
  "brew",
  "call_the_hound",
  "pick_the_lock",
  "strike_a_deal",
  "take_a_contract",
  "heave",
  "hardened",
  "long_night",
] as const;

/** A page's id, as the server names it (FS-X2CMM R9–R12). */
export type PageId = (typeof PAGE_IDS)[number];

// ── Geometry, in local px ─────────────────────────────────────────────────────────────────────────

/**
 * A stroke as a filled shape: the line through `path`, `w` wide, or as wide as `w(t)` at the fraction
 * `t` along it, each side offset along the line's normal there. A brush's stroke when its width tapers.
 */
function ribbon(path: readonly Pt[], w: number | ((t: number) => number)): Shape {
  const width = typeof w === "number" ? () => w : w;
  const [left, right]: [Pt[], Pt[]] = [[], []];
  path.forEach((p, i) => {
    const [a, b] = [path[Math.max(0, i - 1)], path[Math.min(path.length - 1, i + 1)]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const h = width(i / (path.length - 1)) / 2;
    left.push([p[0] + nx * h, p[1] + ny * h]);
    right.push([p[0] - nx * h, p[1] - ny * h]);
  });
  return [...left, ...right.reverse()];
}

/** A width `w` that tapers to a point at both ends: a brush's stroke. */
const brush =
  (w: number, floor = 0.2) =>
  (t: number) =>
    w * Math.max(floor, Math.sin(Math.PI * t) ** 0.6);
/** A width `w` that tapers to a point at its end only: a ray, a flame, a blade. */
const toPoint =
  (w: number, floor = 0.1) =>
  (t: number) =>
    w * Math.max(floor, 1 - t ** 1.6);

/** A capsule: the segment a→b, `w` wide, with round ends. */
function capsule(a: Pt, b: Pt, w: number, steps = 6): Shape {
  const t = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const r = w / 2;
  return [...oval(b[0], b[1], r, r, t - Math.PI / 2, t + Math.PI / 2, steps), ...oval(a[0], a[1], r, r, t + Math.PI / 2, t + 1.5 * Math.PI, steps)];
}

/** A ring from `ri` to `ro` about (cx, cy), as short quads round it, so no fill sees a hole. */
function ring(cx: number, cy: number, ro: number, ri: number, steps = 40): Shape[] {
  return Array.from({ length: steps }, (_, i) => {
    const [a, b] = [(i / steps) * 2 * Math.PI, ((i + 1.15) / steps) * 2 * Math.PI];
    return [
      [cx + Math.cos(a) * ro, cy + Math.sin(a) * ro],
      [cx + Math.cos(b) * ro, cy + Math.sin(b) * ro],
      [cx + Math.cos(b) * ri, cy + Math.sin(b) * ri],
      [cx + Math.cos(a) * ri, cy + Math.sin(a) * ri],
    ] as Shape;
  });
}

/** The points of the polyline a → … each bent through its pull: `bend` chained, its first point kept. */
function curve(first: Pt, ...legs: [Pt, Pt][]): Pt[] {
  const out: Pt[] = [first];
  for (const [pull, to] of legs) out.push(...bend(out[out.length - 1], pull, to, 8));
  return out;
}

/** A glyph from its body and its bone; its lines the body's outlines, its cuts and its holes' rings. */
function glyph(body: KnockoutPicture, bone: readonly Shape[] = [], lines?: readonly KnockoutCut[]): PageGlyph {
  const rings: KnockoutCut[] = (body.holes ?? []).map((hole: Circle) => ({ ring: hole }));
  return {
    body,
    bone: { silhouette: bone, cuts: [] },
    lines: lines ?? [...linesOf(body.silhouette as Shape[], body.cuts), ...rings],
  };
}

// ── The Spellbook (mage) ──────────────────────────────────────────────────────────────────────────

/** Witchlight: a small flame-globe, a flame's tongue rising from it, eight rays about it, a bone core. */
const WITCHLIGHT: PageGlyph = (() => {
  const globe = circle(0, 2.4, 6.4, 36);
  const tongue: Shape = curve([-4.6, -0.8], [[-3.4, -5.6], [0, -10.6]], [[3.4, -5.6], [4.6, -0.8]]);
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * 2 * Math.PI - Math.PI / 2;
    const [from, to] = i === 0 ? [12.2, 14.6] : [9.8, 14.4];
    return ribbon(
      [0, 0.5, 1].map((u) => [Math.cos(a) * (from + (to - from) * u), Math.sin(a) * (from + (to - from) * u)] as Pt),
      (t) => 2.6 * (1 - 0.75 * t),
    );
  });
  // the core: a small flame inside the globe, its tip up
  const core: Shape = curve([0, 6.6], [[-3.6, 6.2], [-2.2, 2.4]], [[-1.2, -0.6], [0, -3.4]], [[1.2, -0.6], [2.2, 2.4]], [[3.6, 6.2], [0, 6.6]]);
  return glyph({ silhouette: [globe, tongue, ...rays], cuts: [] }, [core]);
})();

/** Far Hand: an open hand reaching up and right, a line of its reach trailing from the wrist. */
const FAR_HAND: PageGlyph = (() => {
  const at = { x: 2.6, y: -1.2, a: 0.32, s: 1.05 };
  const palm = place(roundedBox(-5.4, -1.6, 5.4, 7.4, 2.6), at);
  const fingers = [
    [-3.9, -9.6],
    [-1.3, -11.4],
    [1.3, -10.8],
    [3.9, -8.2],
  ].map(([x, top]) => place(capsule([x, -0.5], [x, top], 2.9), at));
  const thumb = place(capsule([-4.4, 4.6], [-9.2, -0.4], 3.2), at);
  // the parting between the fingers, down to the palm's top
  const parts: KnockoutCut[] = [-2.6, 0, 2.6].map((x) => ({ path: place([[x, -1.2], [x, -7.4]], at) }));
  const trail = ribbon(curve([-2.4, 9.4], [[-6.2, 13.8], [-12.4, 7.6]]), toPoint(3.0, 0.15));
  const trail2 = ribbon(curve([-6.6, 7.2], [[-9.4, 9.2], [-13.2, 3.4]]), toPoint(1.9, 0.15));
  // the palm's life line, a bone brush stroke
  const crease = ribbon(place(curve([-3.0, 0.6], [[-3.8, 4.6], [1.2, 6.2]]), at), brush(1.7));
  return glyph({ silhouette: [palm, ...fingers, thumb, trail, trail2], cuts: [...parts, ...gapOver(thumb, [palm])] }, [crease]);
})();

/** Levitate: a robed figure, arms spread, lifted over two wave-lines of air. */
const LEVITATE: PageGlyph = (() => {
  const head = circle(0, -10.8, 2.9, 20);
  const robe: Shape = [
    [-3.4, -6.8],
    [3.4, -6.8],
    ...bend([3.4, -6.8], [3.4, -1], [5.4, 4.2], 6),
    ...bend([5.4, 4.2], [0, 5.6], [-5.4, 4.2], 6),
    ...bend([-5.4, 4.2], [-3.4, -1], [-3.4, -6.8], 6).slice(0, -1),
  ];
  const arms = [1, -1].map((m) => capsule([m * 2.6, -5.6], [m * 9.2, -1.4], 2.5));
  const wave = (y: number, half: number, w: number) =>
    ribbon(
      Array.from({ length: 25 }, (_, i) => {
        const x = -half + (2 * half * i) / 24;
        return [x, y + 1.3 * Math.sin((x / half) * 2 * Math.PI)] as Pt;
      }),
      brush(w, 0.25),
    );
  const fold = ribbon(curve([-1.2, -5.2], [[-2.4, -1.4], [-3.2, 3.6]]), brush(1.6));
  return glyph({ silhouette: [head, robe, ...arms, wave(8.8, 11, 2.4), wave(12.2, 7.4, 2.1)], cuts: arms.flatMap((a) => gapOver(a, [robe])) }, [fold]);
})();

/** Binding Glyph: a rune ringed, three strokes crossing at its heart, the ring notched like a seal. */
const BINDING_GLYPH: PageGlyph = (() => {
  const band = ring(0, 0, 13.6, 10.6);
  const strokes = [Math.PI / 2, Math.PI / 6, -Math.PI / 6].map((a) => {
    const [c, s] = [Math.cos(a) * 8.4, Math.sin(a) * 8.4];
    return capsule([-c, -s], [c, s], 3);
  });
  const notches: KnockoutCut[] = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * 2 * Math.PI;
    return { path: [[Math.cos(a) * 10, Math.sin(a) * 10], [Math.cos(a) * 14.2, Math.sin(a) * 14.2]] };
  });
  const heart = circle(0, 0, 1.9, 14);
  const gleam = ribbon(oval(0, 0, 12.1, 12.1, Math.PI * 1.08, Math.PI * 1.42, 10), brush(1.4));
  return glyph({ silhouette: [...band, ...strokes], cuts: notches }, [heart, gleam], [
    { ring: { x: 0, y: 0, r: 13.6 } },
    { ring: { x: 0, y: 0, r: 10.6 } },
    ...linesOf(strokes),
  ]);
})();

/** Recall: three arrows wheeling in to the point they meet at. */
const RECALL: PageGlyph = (() => {
  const arrows = [0, 1, 2].flatMap((k) => {
    const a0 = (k * 2 * Math.PI) / 3 - Math.PI / 2;
    const path = Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      const [r, a] = [13.4 - 7 * t, a0 + 1.75 * t];
      return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
    });
    const shaft = ribbon(path, (t) => 2.2 + 0.8 * t);
    const [p, q] = [path[path.length - 2], path[path.length - 1]];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const [dx, dy] = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    const head: Shape = [
      [q[0] + dx * 4.2, q[1] + dy * 4.2],
      [q[0] - dy * 3.2 - dx * 0.6, q[1] + dx * 3.2 - dy * 0.6],
      [q[0] + dy * 3.2 - dx * 0.6, q[1] - dx * 3.2 - dy * 0.6],
    ];
    return [shaft, head];
  });
  const point = circle(0, 0, 2.2, 16);
  const streaks = [0, 1, 2].map((k) => {
    const a0 = (k * 2 * Math.PI) / 3 - Math.PI / 2;
    return ribbon(
      Array.from({ length: 8 }, (_, i) => {
        const t = i / 7;
        const [r, a] = [13.4 - 3.6 * t, a0 + 0.1 + 0.8 * t];
        return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
      }),
      brush(0.9),
    );
  });
  return glyph({ silhouette: [...arrows, point], cuts: [] }, [circle(0, 0, 1.1, 10), ...streaks]);
})();

// ── The Hunter's Journal (archer) ─────────────────────────────────────────────────────────────────

/** Tracker's Eye: a wide eye, its iris ringed and its pupil dark, over a beast's paw print. */
const TRACKERS_EYE: PageGlyph = (() => {
  const cy = -5.8;
  const eye: Shape = curve([-12.6, cy], [[0, cy - 10.4], [12.6, cy]], [[0, cy + 9.6], [-12.6, cy]]).slice(0, -1);
  const pad: Shape = [
    ...bend([0, 6.6], [4.8, 6.4], [4.4, 10.6], 6),
    ...bend([4.4, 10.6], [3.8, 13.4], [0, 12.6], 6),
    ...bend([0, 12.6], [-3.8, 13.4], [-4.4, 10.6], 6),
    ...bend([-4.4, 10.6], [-4.8, 6.4], [0, 6.6], 6).slice(0, -1),
  ];
  const toes = [
    [-6.4, 4.6, -0.45],
    [-2.3, 2.4, -0.15],
    [2.3, 2.4, 0.15],
    [6.4, 4.6, 0.45],
  ].map(([x, y, a]) => place(oval(0, 0, 1.75, 2.3, 0, 2 * Math.PI, 14).slice(0, -1), { x, y, a }));
  const lid = ribbon(curve([-8.8, cy - 1.6], [[0, cy - 7.8], [8.8, cy - 1.6]]), brush(1.3));
  const glint = circle(1.5, cy - 1.5, 0.95, 10);
  return glyph({ silhouette: [eye, pad, ...toes], cuts: [{ ring: { x: 0, y: cy, r: 4.7 } }], holes: [{ x: 0, y: cy, r: 2.3 }] }, [lid, glint]);
})();

/** Brew: a round-bellied flask, stoppered, its draught's surface across it, bubbles rising. */
const BREW: PageGlyph = (() => {
  const belly = circle(0, 5.2, 8.4, 40);
  const neck = roundedBox(-2.8, -7.2, 2.8, -1.4, 0.6);
  const lip = roundedBox(-4, -8.8, 4, -6.8, 0.9);
  const stopper = roundedBox(-2.7, -12.8, 2.7, -9.2, 1.1);
  const bubbles = [circle(8.4, -5.2, 2.1, 16), circle(10.2, -9.4, 1.5, 14), circle(6.2, -11.4, 1.2, 12)];
  const surface: KnockoutCut = { path: curve([-9, 3.4], [[0, 5.4], [9, 3.4]]) };
  const seat: KnockoutCut = { path: [[-4.4, -9], [4.4, -9]] };
  const shine = ribbon(oval(0, 5.2, 5.6, 5.6, Math.PI * 0.95, Math.PI * 1.32, 10), brush(1.9));
  const fleck = circle(-2.6, 8.8, 1.1, 10);
  return glyph({ silhouette: [belly, neck, lip, stopper, ...bubbles], cuts: [surface, seat] }, [shine, fleck]);
})();

/**
 * Call the Wolf (§Change: The archer's wolf W2; `call_the_hound` in code): a wolf's head in profile,
 * facing right, a long muzzle, its ear pricked up from the crown, the ruff standing in tufts down
 * the back of its neck and under its throat, a slanting eye.
 */
const CALL_THE_HOUND: PageGlyph = (() => {
  const head: Shape = [
    [14, 0.2],
    ...bend([14, 0.2], [14.2, -1.2], [13.4, -1.6], 3),
    // the long muzzle's bridge, the stop, the brow and the crown
    ...bend([13.4, -1.6], [10, -2], [6.5, -3], 4),
    ...bend([6.5, -3], [4.2, -3.6], [2.6, -5.6], 4),
    ...bend([2.6, -5.6], [0, -7.6], [-2.6, -7.8], 4),
    ...bend([-2.6, -7.8], [-6.2, -7.6], [-8.6, -4.6], 4),
    // the ruff down the back of the neck, in tufts
    [-10.2, -3.4],
    [-9.6, -1.2],
    [-12, 0.4],
    [-10.8, 2.6],
    [-13, 4.6],
    [-11.4, 6.6],
    [-12.2, 8.6],
    [-10.2, 10],
    ...bend([-10.2, 10], [-7, 12], [-4.4, 11.6], 4),
    // the ruff under the throat, in tufts, and the jaw to the chin
    [-3.6, 9.4],
    [-1.2, 10.4],
    [0.2, 7.8],
    [2.4, 8.2],
    ...bend([2.4, 8.2], [5.6, 5.4], [9.6, 3.4], 5),
    ...bend([9.6, 3.4], [11.6, 3.2], [12.6, 1.4], 3),
    ...bend([12.6, 1.4], [13.6, 0.6], [14, 0.2], 3).slice(0, -1),
  ];
  // the pricked ear: a broad-based triangle standing up from the crown, its tip a little back
  const ear: Shape = [
    [0, -6.6],
    ...bend([0, -6.6], [-1.4, -11.2], [-4.2, -14.2], 4),
    ...bend([-4.2, -14.2], [-6.8, -10.4], [-7.8, -4.2], 4),
    ...bend([-7.8, -4.2], [-3.8, -6.4], [0, -6.6], 3).slice(0, -1),
  ];
  const mouth: KnockoutCut = { path: curve([14.1, 0.3], [[10.6, 1], [6.4, 1.6]]) };
  // the cheek ruff's edge, a brushed line from behind the eye down to the throat
  const ruff = ribbon(curve([-3.4, -3.6], [[-6.2, 1.4], [-4.8, 7.6]]), brush(1.5));
  const eye = place(oval(0, 0, 1.7, 0.95, 0, 2 * Math.PI, 12).slice(0, -1), { x: 3, y: -4.2, a: -0.35 });
  return glyph({ silhouette: [head, ear], cuts: [mouth, ...gapOver(ear, [head])] }, [ruff, eye]);
})();

// ── The Ledger (mercenary) ────────────────────────────────────────────────────────────────────────

/** Pick the Lock: an iron lock plate, its keyhole cut through, a pick set in it from below right. */
const PICK_THE_LOCK: PageGlyph = (() => {
  const [kx, ky] = [-2.4, -4.2];
  const plate = roundedBox(-9.2, -12, 4.4, 7.6, 2.6);
  const pick = ribbon([[kx + 0.4, ky + 5.8], [kx + 2.2, ky + 6.4], [7.2, 8.2]], 2.1);
  const grip = capsule([6.4, 7.4], [9, 9.8], 4.2);
  const slot: KnockoutCut[] = [-0.75, 0.75].map((dx) => ({ path: [[kx + dx * 0.7, ky + 1], [kx + dx * 1.3, ky + 7.2]] }));
  const rivets = [
    [-6.6, -9.4],
    [1.8, -9.4],
    [-6.6, 5],
  ].map(([x, y]) => circle(x, y, 1.3, 10));
  const gleam = ribbon([[-7.4, -5.4], [-7.4, 2.2]], brush(1.4));
  return glyph(
    { silhouette: [plate, pick, grip], cuts: [...slot, ...gapOver(pick, [plate]), ...gapOver(grip, [plate])], holes: [{ x: kx, y: ky, r: 2.9 }] },
    [...rivets, gleam],
  );
})();

/**
 * Strike a Deal: two hands clasped, each from its sleeve at a lower corner; the right hand's four
 * fingers wrap round the left's, whose thumb lies over them, a bone cuff at each wrist.
 */
const STRIKE_A_DEAL: PageGlyph = (() => {
  const sleeve = (m: 1 | -1): Shape => capsule([m * 10.4, 6.4], [m * 6.2, 1.4], 6, 4);
  const [left, right] = [sleeve(-1), sleeve(1)];
  const back = roundedBox(-6.4, -5.6, 7.2, 1.8, 2.6);
  const fingers = [-5.4, -2.6, 0.2, 3].map((x) => capsule([x + 0.6, -1], [x - 0.4, 5.6], 2.7, 4));
  const thumb = capsule([-7.6, -3.4], [-1.6, -6.6], 3, 5);
  const parts: KnockoutCut[] = [-4, -1.2, 1.6].map((x) => ({ path: [[x + 0.3, 1.2], [x - 0.3, 6.6]] }));
  const cuffs = [1, -1].map((m) => ribbon([[m * 10.4, 2.6], [m * 6.6, 5.8]], 2));
  return glyph(
    {
      silhouette: [left, right, back, ...fingers, thumb],
      cuts: [...parts, ...gapOver(back, [left, right]), ...gapOver(thumb, [back, left]), ...fingers.flatMap((f) => gapOver(f, [left]))],
    },
    cuffs,
  );
})();

/** Take a Contract: a scroll between its two rolls, written, sealed in wax with a ribbon below. */
const TAKE_A_CONTRACT: PageGlyph = (() => {
  const sheet = roundedBox(-8.6, -7.6, 8.6, 6.4, 0.6);
  const top = roundedBox(-11.6, -11.6, 11.6, -7, 2.2);
  const foot = roundedBox(-11.6, 4.6, 11.6, 9.2, 2.2);
  const seal = circle(4.4, 9, 4.1, 28);
  const tails = [ribbon([[3, 11.6], [1.6, 14.4]], toPoint(2.2, 0.4)), ribbon([[6, 11.4], [7.6, 13.4]], toPoint(2.2, 0.4))];
  const writ = [
    [-6.2, -4, 6],
    [-6.2, -1, 4.2],
    [-6.2, 2, 0.8],
  ].map(([x0, y, x1]) => ribbon([[x0, y], [x1, y]], brush(1.5, 0.5)));
  const rolls = [top, foot].map((roll) => ribbon([[-9.4, (roll[0][1] + roll[roll.length - 1][1]) / 2 - 0.8], [9.4, (roll[0][1] + roll[roll.length - 1][1]) / 2 - 0.8]], brush(1.1, 0.4)));
  return glyph(
    { silhouette: [sheet, top, foot, seal, ...tails], cuts: [...gapOver(top, [sheet]), ...gapOver(foot, [sheet]), ...gapOver(seal, [foot]), { ring: { x: 4.4, y: 9, r: 1.9 } }] },
    [...writ, ...rolls],
  );
})();

// ── Scars (warrior) ───────────────────────────────────────────────────────────────────────────────

/** Heave: a stone block, cracked, pressed by a figure leaning his shoulder into it. */
const HEAVE: PageGlyph = (() => {
  const block = roundedBox(0, -7.4, 12.2, 6.8, 0.8);
  const head = circle(-6.4, -7.4, 2.9, 20);
  const body: Shape = [
    [-4.6, -4.2],
    [0.8, -4.6],
    [0.8, -0.6],
    [-3.4, 1.6],
    [-4.6, 5.4],
    [-2.6, 12.8],
    [-5.8, 12.8],
    [-7.6, 7.2],
    [-10, 11.8],
    [-12, 9.2],
    [-9.6, 4],
    [-9.2, -1.4],
  ];
  const crack: KnockoutCut = { path: [[7.6, -7.6], [6.4, -3.6], [8.4, -0.8], [6.8, 3.4], [7.4, 7]] };
  const bevel = ribbon([[1.4, -5.8], [10.8, -5.8]], brush(1.5, 0.5));
  const edge = ribbon([[10.6, -4.2], [10.6, 5.2]], brush(1.3, 0.4));
  return glyph({ silhouette: [block, head, body], cuts: [crack, ...gapOver(body, [block])] }, [bevel, edge]);
})();

/** Hardened: a heater shield, a border round its face, cracked from its top and holding. */
const HARDENED: PageGlyph = (() => {
  const heater = (half: number, top: number, shoulder: number, point: number): Shape => [
    [-half, top],
    [half, top],
    [half, shoulder],
    ...bend([half, shoulder], [half, point - 3], [0, point], 8),
    ...bend([0, point], [-half, point - 3], [-half, shoulder], 8).slice(0, -1),
  ];
  const shield = heater(10.4, -11.2, -1.6, 14);
  const border: KnockoutCut = { path: heater(7.6, -8.4, -1.4, 10.2), closed: true };
  const crack: KnockoutCut = { path: [[1.2, -11.8], [-1.4, -7], [1.6, -3.4], [-0.6, 0.8], [1, 4]] };
  const shine = ribbon([[-5.6, -7], [-5.6, 0.4], [-3.4, 5.4]], brush(1.8));
  const rivets = [circle(-9, -9.9, 1.05, 10), circle(9, -9.9, 1.05, 10)];
  return glyph({ silhouette: [shield], cuts: [border, crack] }, [shine, ...rivets]);
})();

/** Long Night: a crescent moon over two blades crossed beneath it. */
const LONG_NIGHT: PageGlyph = (() => {
  const moon = crescent([0, -7.4], 6.6, [3, -9.4], 5.4);
  const blade = (m: 1 | -1): Shape[] => {
    const [pommel, tip]: [Pt, Pt] = [
      [m * 8.4, 10],
      [m * -9, -2],
    ];
    const at = (t: number): Pt => [pommel[0] + (tip[0] - pommel[0]) * t, pommel[1] + (tip[1] - pommel[1]) * t];
    const len = Math.hypot(tip[0] - pommel[0], tip[1] - pommel[1]);
    const [dx, dy] = [(tip[0] - pommel[0]) / len, (tip[1] - pommel[1]) / len];
    const guard = at(0.24);
    return [
      ribbon([at(0.24), at(0.62), tip], (t) => 2.9 * Math.max(0.12, 1 - t ** 3)),
      capsule(at(0.05), at(0.24), 2.2),
      capsule([guard[0] - dy * 3.6, guard[1] + dx * 3.6], [guard[0] + dy * 3.6, guard[1] - dx * 3.6], 2.2),
      circle(...pommel, 1.9, 12),
    ];
  };
  const [back, front] = [blade(-1), blade(1)];
  const fullers = [1, -1].map((m) => ribbon([[m * 3.6, 7.4], [m * -4.6, 1.4]], brush(1.0, 0.4)));
  const moonShine = ribbon(oval(0, -7.4, 5.2, 5.2, Math.PI * 0.62, Math.PI * 1.08, 10), brush(1.3));
  return glyph({ silhouette: [moon, ...back, ...front], cuts: front.flatMap((s) => gapOver(s, back)) }, [...fullers.slice(0, 1), moonShine]);
})();

/** Every page's icon, by its id, each in its pigment (R45's table). */
export const PAGE_ICONS: Readonly<Record<PageId, PageIcon>> = {
  witchlight: { pigment: "ochre", glyph: WITCHLIGHT },
  far_hand: { pigment: "lapis", glyph: FAR_HAND },
  levitate: { pigment: "lapis", glyph: LEVITATE },
  binding_glyph: { pigment: "madder", glyph: BINDING_GLYPH },
  recall: { pigment: "lapis", glyph: RECALL },
  trackers_eye: { pigment: "ochre", glyph: TRACKERS_EYE },
  brew: { pigment: "verdigris", glyph: BREW },
  call_the_hound: { pigment: "verdigris", glyph: CALL_THE_HOUND },
  pick_the_lock: { pigment: "ochre", glyph: PICK_THE_LOCK },
  strike_a_deal: { pigment: "ochre", glyph: STRIKE_A_DEAL },
  take_a_contract: { pigment: "madder", glyph: TAKE_A_CONTRACT },
  heave: { pigment: "madder", glyph: HEAVE },
  hardened: { pigment: "verdigris", glyph: HARDENED },
  long_night: { pigment: "madder", glyph: LONG_NIGHT },
};
