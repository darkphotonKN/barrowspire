/**
 * The ability bar's icons (FS-Q18Q3 §C R16–R17): one picture per ability, each a bronze knockout
 * for the one shared renderer (`Knockout`, ADR-0080), with the same picture in lines where a scene
 * cannot make the texture. The class abilities (the warrior's Dash, the mage's Triple Fireball,
 * the archer's Shadow Shot, the mercenary's Parry), the four tree abilities (FS-04EEA: Earthbreaker,
 * Blink, Arrow Rain, Settle the Debt), the health potion's flask and the locked square's padlock.
 * The passive tree's tier-3 node (FS-8RZ51) draws the tree abilities' pictures from here too.
 *
 * Each is a solid silhouette with its inner lines cut through to the ground, in local px about its
 * slot's centre, x to the right and y down, inside a 30 px slot (R13: about 30 px in a 44 px well).
 * Built to survive render scale 1 (ADR-0080): no feature under about 3 px, no cut under the
 * renderer's 1.6 px, and no two cuts close enough together to read as a face. Data only: the
 * renderer draws them, the bar picks the ink. Tweak rounds from the owner's contact sheet (§K R39)
 * land here.
 */

import type Phaser from "phaser";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import { bend, oval, type KnockoutCut, type KnockoutPicture, type Pt } from "./knockout";

export const ABILITY_ICON_KEYS = [
  "dash",
  "triple_fireball",
  "shadow_shot",
  "parry",
  "earthbreaker",
  "blink",
  "arrow_rain",
  "settle_the_debt",
  "potion",
  "locked",
] as const;

/** An ability's icon: its skill id, or the potion square's flask, or the locked 3 square's padlock. */
export type AbilityIconKey = (typeof ABILITY_ICON_KEYS)[number];

/** The box every picture and its lines stand in, in logical px (R13). */
export const ABILITY_ICON_SLOT = 30;

/**
 * An icon: its knockout, and its line glyph (ADR-0080 "Fallback": the same picture as lines,
 * `GLYPH_LINE_W` wide, nothing filled, so a square is never empty).
 */
export interface AbilityIcon {
  picture: KnockoutPicture;
  lines: readonly KnockoutCut[];
}

// ── Geometry, in local px ─────────────────────────────────────────────────────────────────────────
// The exported helpers draw the passive tree's pictures too (`passiveIcons.ts`, FS-8RZ51 R40).

/** A closed shape: its outline, its last point joined back to its first. */
export type Shape = Pt[];

/** The points `ps` turned by `a`, scaled by `s`, then moved by (x, y). */
export function place(ps: readonly Pt[], { x = 0, y = 0, a = 0, s = 1 }: { x?: number; y?: number; a?: number; s?: number }): Pt[] {
  const [c, n] = [Math.cos(a), Math.sin(a)];
  return ps.map(([px, py]) => [x + s * (px * c - py * n), y + s * (px * n + py * c)] as Pt);
}

/** A circle's outline, in `steps` points. */
export function circle(cx: number, cy: number, r: number, steps = 32): Shape {
  return oval(cx, cy, r, r, 0, 2 * Math.PI, steps).slice(0, -1);
}

/** Whether (x, y) lies inside the shape `ps` closes round. */
function inside(ps: readonly Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** The closed outline `ps` in points no more than `step` apart, its first point last again. */
function densify(ps: readonly Pt[], step = 0.25): Pt[] {
  const out: Pt[] = [];
  ps.forEach((p, i) => {
    const q = ps[(i + 1) % ps.length];
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  });
  return out;
}

/**
 * The gap that parts a shape in front from those behind it (the Party icon's way, FS-7TQN4 R6):
 * the runs of the front shape's outline that lie over a shape behind, each one point longer at
 * either end so the cut reaches that shape's edge. Read from a point over none, so a run across
 * the outline's first point stays one path.
 */
export function gapOver(front: readonly Pt[], behind: readonly (readonly Pt[])[]): KnockoutCut[] {
  const ps = densify(front);
  const over = ps.map(([x, y]) => behind.some((b) => inside(b, x, y)));
  const from = over.indexOf(false);
  if (from < 0) return [{ path: ps, closed: true }];
  const cuts: KnockoutCut[] = [];
  let run: number[] = [];
  for (let k = 0; k <= ps.length; k++) {
    const i = (from + k) % ps.length;
    if (over[i] && k < ps.length) run.push(i);
    else if (run.length) {
      const before = (run[0] + ps.length - 1) % ps.length;
      cuts.push({ path: [before, ...run, i].map((j) => ps[j]) });
      run = [];
    }
  }
  return cuts;
}

/** The line glyph of a picture's parts: each shape's outline, closed, and the cuts given. */
export function linesOf(shapes: readonly Shape[], cuts: readonly KnockoutCut[] = []): KnockoutCut[] {
  return [...shapes.map((path) => ({ path, closed: true })), ...cuts];
}

/** The two points where circles (a, ra) and (b, rb) cross, left then right of a→b. */
function crossings(a: Pt, ra: number, b: Pt, rb: number): [Pt, Pt] {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = (d * d + ra * ra - rb * rb) / (2 * d);
  const h = Math.sqrt(ra * ra - along * along);
  const [ux, uy] = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  const [mx, my] = [a[0] + ux * along, a[1] + uy * along];
  return [
    [mx + uy * h, my - ux * h],
    [mx - uy * h, my + ux * h],
  ];
}

/** The angle of p about o. */
const angle = (o: Pt, p: Pt) => Math.atan2(p[1] - o[1], p[0] - o[0]);

/**
 * A crescent: the disc (o, r) less the disc (bite, rb) that overlaps it, from one horn round the
 * back of the disc to the other and in along the bite's edge.
 */
function crescent(o: Pt, r: number, bite: Pt, rb: number, steps = 28): Shape {
  const [p, q] = crossings(o, r, bite, rb);
  // the disc's edge away from the bite, p to q; the bite's edge inside the disc, q back to p
  let [a0, a1] = [angle(o, p), angle(o, q)];
  if (a1 > a0) a1 -= 2 * Math.PI;
  let [b0, b1] = [angle(bite, q), angle(bite, p)];
  if (b1 < b0) b1 += 2 * Math.PI;
  return [...oval(o[0], o[1], r, r, a0, a1, steps), ...oval(bite[0], bite[1], rb, rb, b0, b1, steps).slice(1, -1)];
}

/** A box's outline from its top-left clockwise, its corners rounded by `r`. */
export function roundedBox(left: number, top: number, right: number, bottom: number, r: number): Shape {
  return [
    ...oval(left + r, top + r, r, r, Math.PI, 1.5 * Math.PI, 4),
    ...oval(right - r, top + r, r, r, -0.5 * Math.PI, 0, 4),
    ...oval(right - r, bottom - r, r, r, 0, 0.5 * Math.PI, 4),
    ...oval(left + r, bottom - r, r, r, 0.5 * Math.PI, Math.PI, 4),
  ];
}

/**
 * An arrow along +x, its tip at `tip`: a broad head `head` long and `barb` to each side, a shaft
 * `shaft` to each side, and its fletching flared `fletch` long to `out` each side at the tail, a
 * notch cut into its end: one outline.
 */
export function arrow({ tip, head, barb, shaft, tail, fletch, out }: { tip: number; head: number; barb: number; shaft: number; tail: number; fletch: number; out: number }): Shape {
  const base = tip - head;
  const side = (m: 1 | -1): Pt[] => [
    [base, m * barb],
    [base, m * shaft],
    [tail + fletch, m * shaft],
    [tail, m * out],
  ];
  return [[tip, 0], ...side(1), [tail + fletch * 0.4, 0], ...side(-1).reverse()];
}

/** A four-pointed flash or glint, `r` from its middle to each point, its sides drawn in to `waist`. */
export function twinkle(cx: number, cy: number, r: number, waist: number): Shape {
  const out: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    const tip: Pt = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const next: Pt = [cx + Math.cos(a + Math.PI / 2) * r, cy + Math.sin(a + Math.PI / 2) * r];
    const pull: Pt = [cx + Math.cos(a + Math.PI / 4) * waist, cy + Math.sin(a + Math.PI / 4) * waist];
    out.push(tip, ...bend(tip, pull, next, 6).slice(0, -1));
  }
  return out;
}

// ── The class abilities ───────────────────────────────────────────────────────────────────────────

/**
 * Dash, the warrior's charge: a heater shield leant into the charge, a border cut round its face,
 * and three tapered streaks of its rush trailing behind it.
 */
const DASH: AbilityIcon = (() => {
  const heater = (half: number, top: number, shoulder: number, point: number): Shape => [
    [-half, top],
    [half, top],
    [half, shoulder],
    ...bend([half, shoulder], [half, point - 3], [0, point], 8),
    ...bend([0, point], [-half, point - 3], [-half, shoulder], 8).slice(0, -1),
  ];
  const at = { x: 4, y: 0.5, a: 0.18 };
  const shield = place(heater(8.6, -12, 0, 13), at);
  const border = place(heater(5.6, -9, 0, 8.6), at);
  // each streak pointed at its tail and blunt by the shield, a gap clear of it
  const streak = (y: number, from: number, to: number, w: number): Shape => [
    [from, y],
    [to, y - w / 2],
    [to, y + w / 2],
  ];
  const streaks = [streak(-6.5, -13.5, -7, 3.2), streak(0, -15, -6.4, 3.6), streak(6.5, -13.5, -7.6, 3.2)];
  return {
    picture: { silhouette: [shield, ...streaks], cuts: [{ path: border, closed: true }] },
    lines: linesOf([shield, ...streaks]),
  };
})();

/**
 * Triple Fireball: three fireballs hurled in a spread from one hand at the lower left, fanning up
 * and to the right, the middle one larger, each a round head of flame trailing a forked tail.
 */
const TRIPLE_FIREBALL: AbilityIcon = (() => {
  // a fireball heading along +x: its head of radius r at the origin, its tail `tail` behind
  const fireball = (r: number, tail: number): Shape => {
    const upper: Pt = [-tail, -0.25 * r];
    const fork: Pt = [-0.42 * tail, 0.18 * r];
    const lower: Pt = [-0.86 * tail, 0.62 * r];
    // over the head's front from its top, then back along its foot and out round each tongue
    return [
      ...oval(0, 0, r, r, -Math.PI / 2, Math.PI / 2, 14),
      ...bend([0, r], [-0.35 * tail, 0.95 * r], lower, 6),
      ...bend(lower, [-0.6 * tail, 0.42 * r], fork, 4),
      ...bend(fork, [-0.7 * tail, -0.05 * r], upper, 4),
      ...bend(upper, [-0.4 * tail, -r], [0, -r], 8).slice(0, -1),
    ];
  };
  const HAND: Pt = [-12.6, 12.6];
  const fly = (deg: number, out: number, r: number, tail: number) => {
    const a = (deg * Math.PI) / 180;
    return place(fireball(r, tail), { x: HAND[0] + Math.cos(a) * out, y: HAND[1] + Math.sin(a) * out, a });
  };
  const balls = [fly(-45, 21, 5, 13), fly(-13, 19.4, 3.9, 10), fly(-77, 19.4, 3.9, 10)];
  return {
    picture: { silhouette: balls, cuts: [] },
    lines: linesOf(balls),
  };
})();

/**
 * Shadow Shot, the archer's held shot: one heavy broad-headed bolt loosed up and to the right across
 * the hollow of a crescent moon that cradles it from below; a gap cut where the bolt lies over a
 * horn so each reads as its own shape.
 */
const SHADOW_SHOT: AbilityIcon = (() => {
  const moon = crescent([3, 3], 11, [-1.6, -1.6], 9.2);
  const bolt = place(arrow({ tip: 16.2, head: 6.8, barb: 4.6, shaft: 1.9, tail: -17.6, fletch: 5.4, out: 3.6 }), {
    a: -Math.PI / 4,
  });
  return {
    picture: { silhouette: [moon, bolt], cuts: gapOver(bolt, [moon]) },
    lines: linesOf([moon, bolt]),
  };
})();

/** A sword along +x, its tip at the right: blade, crossguard and grip, and its pommel apart. */
function sword(): { blade: Shape; pommel: Shape } {
  const blade: Shape = [
    [15.5, 0],
    [12, 2.3],
    [-3, 2.3],
    [-3, 5.6],
    [-5.6, 5.6],
    [-5.6, 1.5],
    [-10, 1.5],
    [-10, -1.5],
    [-5.6, -1.5],
    [-5.6, -5.6],
    [-3, -5.6],
    [-3, -2.3],
    [12, -2.3],
  ];
  return { blade, pommel: circle(-12, 0, 2.4, 20) };
}

/**
 * Parry, the mercenary's stance: two swords crossed at mid-blade, points up, hilts at the foot's
 * corners; the one in front whole, a gap cut along it where it lies over the one behind.
 */
const PARRY: AbilityIcon = (() => {
  const s = sword();
  const lay = (a: number) => {
    // the blade's middle on the slot's middle, a little high
    const at = { x: Math.cos(a) * -4.6 * 1.04, y: Math.sin(a) * -4.6 * 1.04 - 1.2, a, s: 1.04 };
    return { blade: place(s.blade, at), pommel: place(s.pommel, at) };
  };
  const behind = lay((-3 * Math.PI) / 4);
  const front = lay(-Math.PI / 4);
  const back = [behind.blade, behind.pommel];
  return {
    picture: {
      silhouette: [...back, front.blade, front.pommel],
      cuts: [...gapOver(front.blade, back), ...gapOver(front.pommel, back)],
    },
    lines: linesOf([front.blade, front.pommel, behind.blade, behind.pommel]),
  };
})();

// ── The tree abilities (FS-04EEA) ─────────────────────────────────────────────────────────────────

/**
 * Earthbreaker, the warrior's slam: a war maul driven head-down onto a slab of ground, the slab
 * cracked under it in two cut lines, and a chip of stone thrown up on either side.
 */
const EARTHBREAKER: AbilityIcon = (() => {
  const haft = roundedBox(-1.8, -15, 1.8, -3, 0.8);
  const head = roundedBox(-8, -5, 8, 3.6, 1.2);
  const slab: Shape = [
    [-12.5, 5.4],
    [12.5, 5.4],
    [14.8, 12],
    [-14.8, 12],
  ];
  const chip = (x: number, y: number, a: number) =>
    place(
      [
        [-2.2, -1.6],
        [2.2, -2],
        [1.8, 1.8],
        [-2, 1.6],
      ],
      { x, y, a },
    );
  const chips = [chip(-11.5, -0.5, -0.5), chip(11.5, -0.5, 0.5)];
  const cracks: KnockoutCut[] = [
    { path: [[-1.8, 4.6], [-3.4, 8.6], [-6.4, 12.8]] },
    { path: [[2, 4.6], [4.6, 8.2], [5.8, 12.8]] },
  ];
  return {
    picture: { silhouette: [haft, head, slab, ...chips], cuts: cracks },
    lines: linesOf([haft, head, slab, ...chips], cracks),
  };
})();

/**
 * Blink, the mage's step through the air: a four-pointed flash where the mage stands now, up and to
 * the right, and two smaller ones trailing back to where the mage stood.
 */
const BLINK: AbilityIcon = (() => {
  const flashes = [twinkle(4, -4, 10.8, 1.6), twinkle(-7.6, 6.2, 6, 1.4), twinkle(-11.2, 11.6, 3.4, 1.1)];
  return {
    picture: { silhouette: flashes, cuts: [] },
    lines: linesOf(flashes),
  };
})();

/**
 * Arrow Rain, the archer's volleys: three arrows slanting down onto the marked ground, a ring cut
 * in it, a gap cut along each where its head stands in the ground.
 */
const ARROW_RAIN: AbilityIcon = (() => {
  const ground = oval(0, 10.6, 13.6, 4.2, 0, 2 * Math.PI, 36).slice(0, -1);
  const mark = oval(0, 10.6, 7.6, 1.6, 0, 2 * Math.PI, 28).slice(0, -1);
  const one = arrow({ tip: 8, head: 5, barb: 3.2, shaft: 1.35, tail: -11.4, fletch: 4, out: 2.9 });
  const fall = Math.PI / 2 + 0.22;
  const arrows = [
    place(one, { x: -9.4, y: 1, a: fall }),
    place(one, { x: 0.4, y: -0.6, a: fall, s: 1.08 }),
    place(one, { x: 9.4, y: 0.2, a: fall }),
  ];
  return {
    picture: {
      silhouette: [ground, ...arrows],
      cuts: [{ path: mark, closed: true }, ...arrows.flatMap((a) => gapOver(a, [ground]))],
    },
    lines: linesOf([ground, ...arrows], [{ path: mark, closed: true }]),
  };
})();

/**
 * Settle the Debt, the mercenary's flurry: an upright sword in the middle of its whirling stroke,
 * two sweeping cuts round it, each swept from a thin tail to a thick leading edge.
 */
const SETTLE_THE_DEBT: AbilityIcon = (() => {
  const SPAN = 2.2;
  // a cut swept clockwise from `from`, `r` out from the middle
  const sweep = (from: number, r: number): Shape => {
    const steps = 20;
    const edge = (side: 1 | -1) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const u = i / steps;
        const w = 4 * Math.sin(Math.PI * u) ** 0.7 * (0.35 + 0.65 * u);
        const a = from + SPAN * u;
        return [Math.cos(a) * (r + (side * w) / 2), Math.sin(a) * (r + (side * w) / 2)] as Pt;
      });
    return [...edge(1), ...edge(-1).reverse().slice(1, -1)];
  };
  const strokes = [sweep(-0.62, 12), sweep(-0.62 + Math.PI, 12)];
  const s = sword();
  const at = { y: -0.6, a: -Math.PI / 2, s: 0.92 };
  const blade = place(s.blade, at);
  const pommel = place(s.pommel, at);
  return {
    picture: {
      silhouette: [...strokes, blade, pommel],
      // the sword stands in front of its stroke
      cuts: [...gapOver(blade, strokes), ...gapOver(pommel, strokes)],
    },
    lines: linesOf([...strokes, blade, pommel]),
  };
})();

// ── The potion square and the locked square ───────────────────────────────────────────────────────

/**
 * The health potion: a round-bellied flask, its neck and lip, a cork set in it parted by a cut, and
 * the draught's line cut across its belly (FS-Q18Q3 R16: a knockout flask, not the baked item icon).
 */
const POTION: AbilityIcon = (() => {
  const belly = circle(0, 4.6, 9.6, 40);
  const neck = roundedBox(-3.2, -9.5, 3.2, -3.5, 0.4);
  const lip = roundedBox(-4.8, -11.4, 4.8, -8.6, 1);
  const cork = roundedBox(-2.9, -15, 2.9, -11, 0.8);
  // the draught's surface, a little low in the middle, run past the belly's sides so it parts it
  const draught: KnockoutCut = { path: [[-10, 2.6], ...bend([-10, 2.6], [0, 4.2], [10, 2.6], 10)] };
  const corkSeat: KnockoutCut = { path: [[-5.2, -11.2], [5.2, -11.2]] };
  return {
    picture: { silhouette: [belly, neck, lip, cork], cuts: [corkSeat, draught] },
    lines: [
      { path: [...oval(0, 4.6, 9.6, 9.6, -Math.PI / 2 + 0.34, 1.5 * Math.PI - 0.34, 36)] },
      { path: [[-3.2, -4], [-3.2, -8.6]] },
      { path: [[3.2, -4], [3.2, -8.6]] },
      { path: lip, closed: true },
      { path: cork, closed: true },
      draught,
    ],
  };
})();

/** The locked 3 square: a padlock, its shackle arched over a solid body with a keyhole through it. */
const LOCKED: AbilityIcon = (() => {
  const body = roundedBox(-9.6, -2.4, 9.6, 13.6, 2.4);
  const ARCH = { y: -6.4, out: 7.6, in: 4.2, foot: -1 };
  const shackle: Shape = [
    [-ARCH.out, ARCH.foot],
    ...oval(0, ARCH.y, ARCH.out, ARCH.out, Math.PI, 2 * Math.PI, 16),
    [ARCH.out, ARCH.foot],
    [ARCH.in, ARCH.foot],
    ...oval(0, ARCH.y, ARCH.in, ARCH.in, 2 * Math.PI, Math.PI, 12),
    [-ARCH.in, ARCH.foot],
  ];
  const keyhole = { x: 0, y: 3.8, r: 2.3 };
  const slot: KnockoutCut = { path: [[0, 4.4], [0, 9.6]] };
  // in lines, the shackle's outer and inner arch, each standing on the body's top: shut
  const arch = (r: number): KnockoutCut => ({
    path: [[-r, -2.4], ...oval(0, ARCH.y, r, r, Math.PI, 2 * Math.PI, 14), [r, -2.4]],
  });
  return {
    picture: { silhouette: [shackle, body], cuts: [slot], holes: [keyhole] },
    lines: [...linesOf([body]), arch(ARCH.out), arch(ARCH.in), { ring: keyhole }, slot],
  };
})();

/** Every ability's icon, by its key (R16). */
export const ABILITY_ICONS: Readonly<Record<AbilityIconKey, AbilityIcon>> = {
  dash: DASH,
  triple_fireball: TRIPLE_FIREBALL,
  shadow_shot: SHADOW_SHOT,
  parry: PARRY,
  earthbreaker: EARTHBREAKER,
  blink: BLINK,
  arrow_rain: ARROW_RAIN,
  settle_the_debt: SETTLE_THE_DEBT,
  potion: POTION,
  locked: LOCKED,
};

/** What a line glyph draws with: lines only, never a fill (FS-J1672 R3). */
export type AbilityIconPen = Pick<
  Phaser.GameObjects.Graphics,
  "lineStyle" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "strokePath" | "strokeCircle"
>;

/**
 * The fallback (ADR-0080): the icon `key` in lines, `GLYPH_LINE_W` wide, centred on (cx, cy), in
 * `ink` at `alpha`, with nothing filled; each line one path, so the renderer joins its corners.
 */
export function drawAbilityIconLines(g: AbilityIconPen, key: AbilityIconKey, cx: number, cy: number, ink: number, alpha: number): void {
  drawIconLines(g, ABILITY_ICONS[key], cx, cy, ink, alpha);
}

/** Any icon's fallback, as {@link drawAbilityIconLines}: the passive tree's pictures draw theirs here too. */
export function drawIconLines(g: AbilityIconPen, icon: AbilityIcon, cx: number, cy: number, ink: number, alpha: number): void {
  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  for (const line of icon.lines) {
    if ("ring" in line) {
      g.strokeCircle(cx + line.ring.x, cy + line.ring.y, line.ring.r);
      continue;
    }
    const [first, ...rest] = line.path;
    g.beginPath();
    g.moveTo(cx + first[0], cy + first[1]);
    for (const [x, y] of rest) g.lineTo(cx + x, cy + y);
    if (line.closed) g.closePath();
    g.strokePath();
  }
}
