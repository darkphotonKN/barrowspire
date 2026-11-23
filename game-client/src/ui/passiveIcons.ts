/**
 * The passive tree's node pictures (FS-8RZ51 §G R40; §Change: Tree v2 V29): the four traversal
 * pictures every class shares (Vitality, Might, Haste, Fleetness), every class's six (four kickers, two
 * specializations), and the lock mark's padlock, each a knockout for the one shared renderer (`Knockout`,
 * ADR-0080) with the same picture in lines where a scene cannot make the texture. The ability nodes draw
 * their tree ability's picture from the ability bar (`ABILITY_ICONS`), never a copy of it.
 *
 * In the ability bar's language and shape (`AbilityIcon`, `abilityIcons.ts`): a solid silhouette with
 * its inner lines cut through to the ground, in local px about the node plate's centre, x to the right
 * and y down, drawn in the same 30 px box and fitted to its plate (`fitIcon`). Built to survive render
 * scale 1: no feature under about 3 px, no cut under the renderer's 1.6 px, no two cuts close enough to
 * read as one. The traversal four stand smallest, on round plates, so they keep inside the box's round
 * and are drawn bold. Data only: the overlay picks the ink by the node's state (`TREE_INK` open, the
 * node's own hue's `treeLitInk` when held or at max, `GREYED` for a locked or closed node; FS-8RZ51
 * §Change: A lit node glows in its own colour). Tweak rounds from the owner's contact sheet land here.
 */

import { bend, oval, type KnockoutCut, type KnockoutPicture, type Pt } from "./knockout";
import {
  ABILITY_ICONS,
  ABILITY_ICON_SLOT,
  arrow,
  circle,
  drawIconLines,
  gapOver,
  linesOf,
  place,
  roundedBox,
  twinkle,
  type AbilityIcon,
  type AbilityIconKey,
  type AbilityIconPen,
  type Shape,
} from "./abilityIcons";

/** The traversal nodes' pictures, the same in every class (V13, V29). */
export const TRAVERSAL_ICON_KEYS = ["vitality", "might", "haste", "fleetness"] as const;

export const PASSIVE_ICON_KEYS = [
  ...TRAVERSAL_ICON_KEYS,
  "heavy_hand",
  "thick_skin",
  "long_wind",
  "bull_rush",
  "guardian",
  "berserker",
  "kindling",
  "deep_well",
  "wide_volley",
  "searing",
  "spellwarden",
  "pyromancer",
  "quick_draw",
  "fleet_foot",
  "eagle_eye",
  "hunters_breath",
  "hunter",
  "shadow_ranger",
  "keen_edge",
  "practiced_guard",
  "bloodied_riposte",
  "steady_hand",
  "duelist",
  "sellsword",
] as const;

/** A passive node's picture: a traversal node's by its name, a class node's by its name. */
export type PassiveIconKey = (typeof PASSIVE_ICON_KEYS)[number];

/** What a tree node draws (R40): one of the tree's own pictures, or the tier-3 node's tree ability's from the ability bar. */
export type NodeIconKey = PassiveIconKey | AbilityIconKey;

// ── Geometry, in local px ─────────────────────────────────────────────────────────────────────────

/** The shape `ps` mirrored across the vertical through the box's centre. */
const mirror = (ps: readonly Pt[]): Pt[] => ps.map(([x, y]) => [-x, y] as Pt);

/** A closed shape from its right half, top centre to foot centre: the half and its mirror back up. */
const bilateral = (right: readonly Pt[]): Shape => [...right, ...mirror(right).reverse().slice(1, -1)];

/**
 * A band along the line `spine`, `half(u)` to each side at the share `u` of the way along it: a
 * horn, a gust. One outline, out along one side and back along the other.
 */
function band(spine: readonly Pt[], half: (u: number) => number): Shape {
  const n = spine.length - 1;
  const side = (m: 1 | -1) =>
    spine.map(([x, y], i) => {
      const [a, b] = [spine[Math.max(0, i - 1)], spine[Math.min(n, i + 1)]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const w = m * half(i / n);
      return [x + nx * w, y + ny * w] as Pt;
    });
  return [...side(1), ...side(-1).reverse()];
}

/**
 * A flame standing on (cx, base), `w` to each side and `h` tall: a main tongue, one either side,
 * the left one higher. Its inner tongue, a closed cut, comes with it.
 */
function flame(cx: number, base: number, w: number, h: number): { shape: Shape; core: KnockoutCut } {
  const at = (ps: readonly Pt[]): Pt[] => ps.map(([x, y]) => [cx + x * w, base + y * h] as Pt);
  const shape = at([
    [0, 0],
    ...bend([0, 0], [0.95, 0.02], [1, -0.36]),
    ...bend([1, -0.36], [1, -0.62], [0.66, -0.8]),
    ...bend([0.66, -0.8], [0.6, -0.62], [0.36, -0.58]),
    ...bend([0.36, -0.58], [0.34, -0.86], [0, -1]),
    ...bend([0, -1], [-0.08, -0.76], [-0.34, -0.66]),
    ...bend([-0.34, -0.66], [-0.5, -0.72], [-0.68, -0.9]),
    ...bend([-0.68, -0.9], [-1.06, -0.62], [-1, -0.3]),
    ...bend([-1, -0.3], [-0.95, 0.02], [0, 0]).slice(0, -1),
  ]);
  const core: KnockoutCut = {
    path: at([
      [0, -0.14],
      ...bend([0, -0.14], [0.46, -0.16], [0.4, -0.34]),
      ...bend([0.4, -0.34], [0.3, -0.5], [0.04, -0.62]),
      ...bend([0.04, -0.62], [-0.1, -0.42], [-0.4, -0.32]),
      ...bend([-0.4, -0.32], [-0.46, -0.14], [0, -0.14]).slice(0, -1),
    ]),
    closed: true,
  };
  return { shape, core };
}

/**
 * A fireball heading along +x, in Triple Fireball's hand (`abilityIcons.ts`): a round head of radius
 * `r` at the origin trailing a forked tail `tail` behind it.
 */
function fireball(r: number, tail: number): Shape {
  const upper: Pt = [-tail, -0.25 * r];
  const fork: Pt = [-0.42 * tail, 0.18 * r];
  const lower: Pt = [-0.86 * tail, 0.62 * r];
  return [
    ...oval(0, 0, r, r, -Math.PI / 2, Math.PI / 2, 14),
    ...bend([0, r], [-0.35 * tail, 0.95 * r], lower, 6),
    ...bend(lower, [-0.6 * tail, 0.42 * r], fork, 4),
    ...bend(fork, [-0.7 * tail, -0.05 * r], upper, 4),
    ...bend(upper, [-0.4 * tail, -r], [0, -r], 8).slice(0, -1),
  ];
}

/**
 * An arrow bent round the circle (cx, cy, r), `t` thick, from the angle `from` to `to` (either way
 * round), its head `head` of arc past `to` and `barb` out to each side.
 */
function curvedArrow(cx: number, cy: number, r: number, t: number, from: number, to: number, barb: number, head: number): Shape {
  const at = (a: number, d: number): Pt => [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
  const ahead = Math.sign(to - from) * head;
  return [
    ...oval(cx, cy, r + t / 2, r + t / 2, from, to, 16),
    at(to, r + t / 2 + barb),
    at(to + ahead, r),
    at(to, r - t / 2 - barb),
    ...oval(cx, cy, r - t / 2, r - t / 2, to, from, 16),
  ];
}

/** A small four-sided spark, `r` from its middle to each point. */
const spark = (x: number, y: number, r: number): Shape => [
  [x, y - r],
  [x + r * 0.7, y],
  [x, y + r],
  [x - r * 0.7, y],
];

// ── Scaling ───────────────────────────────────────────────────────────────────────────────────────

/** `icon` scaled by `s` about the box's centre: its silhouette, cuts, holes and lines alike. */
function scaled(icon: AbilityIcon, s: number): AbilityIcon {
  const pts = (ps: readonly Pt[]): Pt[] => ps.map(([x, y]) => [x * s, y * s] as Pt);
  const disc = ({ x, y, r }: { x: number; y: number; r: number }) => ({ x: x * s, y: y * s, r: r * s });
  const cut = (c: KnockoutCut): KnockoutCut => ("ring" in c ? { ring: disc(c.ring) } : { ...c, path: pts(c.path) });
  const { silhouette, cuts, holes } = icon.picture;
  const picture: KnockoutPicture = { silhouette: silhouette.map(pts), cuts: cuts.map(cut), ...(holes ? { holes: holes.map(disc) } : {}) };
  return { picture, lines: icon.lines.map(cut) };
}

/** How far a picture reaches from the box's centre, its holes' and rings' edges included. */
function reach({ picture }: AbilityIcon): number {
  const far = (ps: readonly Pt[]) => Math.max(0, ...ps.map(([x, y]) => Math.hypot(x, y)));
  const disc = ({ x, y, r }: { x: number; y: number; r: number }) => Math.hypot(x, y) + r;
  return Math.max(
    ...picture.silhouette.map(far),
    ...picture.cuts.map((c) => ("ring" in c ? disc(c.ring) : far(c.path))),
    ...(picture.holes ?? []).map(disc),
  );
}

/** A traversal picture drawn freely, brought inside the box's round, a hair in, for a round plate (V23). */
function inRound(icon: AbilityIcon): AbilityIcon {
  const room = ABILITY_ICON_SLOT / 2 - 0.4;
  const far = reach(icon);
  return far > room ? scaled(icon, room / far) : icon;
}

/** The clear ring between a plate's edge and its picture, in logical px (V29). */
export const PICTURE_MARGIN = 3;

/**
 * `icon` fitted to a plate `size` px across (V23, V29): its 30 px box scaled to the plate less `margin`
 * each side, about the plate's centre. Its cuts keep the renderer's width, so a small plate's picture is
 * drawn bold.
 */
export function fitIcon(icon: AbilityIcon, size: number, margin = PICTURE_MARGIN): AbilityIcon {
  const s = (size - 2 * margin) / ABILITY_ICON_SLOT;
  return s === 1 ? icon : scaled(icon, s);
}

// ── The traversal four (every class, V29) ─────────────────────────────────────────────────────────

/** The heart's outline, `s` times the classic curve, its foot at the box's foot. */
const heart = (s: number, dy: number): Shape =>
  Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [x * s, -y * s + dy] as Pt;
  });

/** Vitality (+max HP): a heart with a pulse line cut across it, one beat. */
const VITALITY: AbilityIcon = inRound(
  (() => {
    const body = heart(0.84, -1.6);
    const pulse: KnockoutCut = {
      path: [
        [-15, 0.6],
        [-6, 0.6],
        [-3.6, -5.6],
        [0.4, 7.4],
        [3.6, -2],
        [5.6, 0.6],
        [15, 0.6],
      ],
    };
    return {
      picture: { silhouette: [body], cuts: [pulse] },
      lines: linesOf([body], [pulse]),
    };
  })(),
);

/**
 * Might (+the class's attribute): an arm flexed, the bicep swelling over it, the forearm raised to a
 * clenched fist, its curled fingers parted from the thumb by a cut, and the elbow's crease cut in (not
 * Steady Hand's open palm, nor Heavy Hand's mailed fist on its cuff).
 */
const MIGHT: AbilityIcon = inRound(
  (() => {
    const arm: Shape = [
      [-14.6, 7.8],
      [-14.6, 12.6],
      [9.6, 12.6],
      ...bend([9.6, 12.6], [13.8, 12.6], [13.8, 8], 6),
      [13.2, -5],
      [6.4, -5],
      [6.4, 4.2],
      ...bend([6.4, 4.2], [5.8, -3.4], [-0.4, -2.2], 10),
      ...bend([-0.4, -2.2], [-6, -1.4], [-9.4, 4.4], 8),
      ...bend([-9.4, 4.4], [-11.6, 7.6], [-14.6, 7.8], 4),
    ];
    const fist = roundedBox(-2.6, -15, 14.2, -4.4, 4);
    const thumb: KnockoutCut = { path: [[-3, -9.6], [6.6, -9.6], ...bend([6.6, -9.6], [9, -9.8], [9.4, -15.4], 4)] };
    const knuckle: KnockoutCut = { path: [[2.6, -9.6], [2.6, -4]] };
    const wrist: KnockoutCut = { path: [[6, -4.2], [14.6, -4.2]] };
    return {
      picture: { silhouette: [arm, fist], cuts: [thumb, knuckle, wrist] },
      lines: linesOf([arm, fist], [thumb, knuckle]),
    };
  })(),
);

/**
 * Haste (+attack speed): a gust, three swept wind strokes, the top one curling back up and the foot one
 * down, each thinning to its tail (not Practiced Guard's hourglass).
 */
const HASTE: AbilityIcon = inRound(
  (() => {
    const half = (u: number) => 1.3 + 1.2 * Math.sin(Math.PI * Math.min(1, u * 1.4));
    const top = band([[-13, -5.4], ...bend([-13, -5.4], [-2, -8.6], [5, -7.4], 10), ...oval(5, -11.6, 4.2, 4.2, Math.PI / 2, -Math.PI * 0.9, 12).slice(1)], half);
    const mid = band([[-15, 1.4], ...bend([-15, 1.4], [0, -1.4], [14, 0.6], 12)], half);
    const foot = band([[-10, 7.4], ...bend([-10, 7.4], [-1, 9.4], [3.6, 8.4], 8), ...oval(3.6, 12, 3.6, 3.6, -Math.PI / 2, Math.PI * 0.8, 10).slice(1)], half);
    return {
      picture: { silhouette: [top, mid, foot], cuts: [] },
      lines: linesOf([top, mid, foot]),
    };
  })(),
);

/**
 * Fleetness (+move speed): a bare foot in stride, heel lifted and pushing off its toes, its toes shown
 * along its top and its sole arched, three speed lines trailing behind it (not Fleet Foot's winged boot).
 */
const FLEETNESS: AbilityIcon = inRound(
  (() => {
    const AT = { x: 3, y: 2, a: 0.22 };
    const foot = place(
      [
        [-5, -15],
        [0, -15],
        [0.6, -6],
        ...bend([0.6, -6], [2, -2.4], [7, -1.4], 6),
        ...bend([7, -1.4], [8.3, -3.4], [9.6, -1.2], 4),
        ...bend([9.6, -1.2], [10.9, -3.2], [12.2, -0.8], 4),
        ...bend([12.2, -0.8], [15.8, -1.8], [15.2, 2.2], 6),
        ...bend([15.2, 2.2], [15, 4.6], [12, 4.6], 4),
        [7, 4.8],
        ...bend([7, 4.8], [2, 2.2], [-2.6, 4.6], 8),
        ...bend([-2.6, 4.6], [-8.2, 5.8], [-7.4, 0.4], 8),
        ...bend([-7.4, 0.4], [-6, -3], [-5.2, -6], 6),
      ],
      AT,
    );
    const line = (y: number, from: number, to: number) => band([[from, y], [to, y]], (u) => 0.9 + 0.9 * u);
    const lines = [line(-7, -15, -7.6), line(-1, -16, -9.6), line(5, -14.6, -10.4)];
    return {
      picture: { silhouette: [foot, ...lines], cuts: [] },
      lines: linesOf([foot, ...lines]),
    };
  })(),
);

// ── The lock mark (V25, V29) ──────────────────────────────────────────────────────────────────────

/** The lock mark's padlock: a squat body with a keyhole through it, its shackle looped over it. */
export const LOCK_ICON: AbilityIcon = (() => {
  const body = roundedBox(-11.4, -2.4, 11.4, 14, 3);
  const shackle = band(oval(0, -2, 7, 10, Math.PI, 2 * Math.PI, 16), () => 2.8);
  const keyhole = { x: 0, y: 4.4, r: 3 };
  const slot: KnockoutCut = { path: [[0, 5.4], [0, 10.6]] };
  return {
    picture: { silhouette: [shackle, body], cuts: [slot], holes: [keyhole] },
    lines: [...linesOf([body], [{ path: oval(0, -2, 7, 10, Math.PI, 2 * Math.PI, 16) }, slot]), { ring: keyhole }],
  };
})();

// ── The warrior's six ─────────────────────────────────────────────────────────────────────────────

/**
 * Heavy Hand: a mailed fist, knuckles to the front, its four fingers parted by cuts, the thumb laid
 * across them in front, and its cuff seated and banded.
 */
const HEAVY_HAND: AbilityIcon = (() => {
  const fingers = roundedBox(-9, -11.6, 9, -1.6, 2.6);
  const back = roundedBox(-8.4, -3, 8.4, 7.4, 2);
  const thumb = roundedBox(-10.4, -4.4, 3.4, 1.6, 2.6);
  const cuff: Shape = [
    [-7.4, 7],
    [7.4, 7],
    [9, 14.4],
    [-9, 14.4],
  ];
  const knuckles: KnockoutCut[] = [-4.5, 0, 4.5].map((x) => ({ path: [[x, -12], [x, -4.4]] as Pt[] }));
  const wrist: KnockoutCut = { path: [[-9.6, 7.4], [9.6, 7.4]] };
  const cuffBand: KnockoutCut = { path: [[-10, 10.8], [10, 10.8]] };
  return {
    picture: {
      silhouette: [fingers, back, cuff, thumb],
      cuts: [...knuckles, ...gapOver(thumb, [fingers, back]), wrist, cuffBand],
    },
    lines: linesOf([fingers, thumb, cuff], knuckles),
  };
})();

/** Thick Skin: a breastplate, its ridge cut down the middle, a cut under each breast and a lame across its waist. */
const THICK_SKIN: AbilityIcon = (() => {
  const plate = bilateral([
    [0, -6.4],
    ...bend([0, -6.4], [5.2, -6.6], [7, -12.2]),
    [11.4, -11],
    ...bend([11.4, -11], [6.4, -4.6], [9.8, 2.4]),
    [8.6, 8.6],
    [11, 13],
    ...bend([11, 13], [0, 15.6], [0, 14.2]).slice(0, -1),
    [0, 14.2],
  ]);
  const ridge: KnockoutCut = { path: [[0, -7], [0, 14.6]] };
  const breast = (m: 1 | -1): KnockoutCut => ({ path: [[m * 9, -2.2], ...bend([m * 9, -2.2], [m * 4, 3.2], [0, 1])] });
  const lame: KnockoutCut = { path: [[-10, 8.6], [10, 8.6]] };
  return {
    picture: { silhouette: [plate], cuts: [ridge, breast(1), breast(-1), lame] },
    lines: linesOf([plate], [ridge, lame]),
  };
})();

/**
 * Long Wind: a war horn swung round from its mouthpiece, its bell blown upward, two bands cut round
 * it, and two gusts rising from the bell.
 */
const LONG_WIND: AbilityIcon = (() => {
  // the horn's spine, an arc about (-1.6, -2.4) from the mouthpiece at the left round to the bell
  const HUB: Pt = [-1.6, -2.4];
  const R = 11;
  const spine = oval(HUB[0], HUB[1], R, R, (170 * Math.PI) / 180, 0, 24);
  const half = (u: number) => 1.6 + 3 * u * u;
  const horn = band(spine, half);
  // the mouthpiece, a little cup at the horn's narrow end
  const mouth = place(roundedBox(-1.6, -2.6, 1.6, 2.6, 0.8), { x: spine[0][0], y: spine[0][1], a: (170 * Math.PI) / 180 });
  // a band across the horn at the share u of the way along, run past both sides
  const across = (u: number): KnockoutCut => {
    const a = (170 * Math.PI) / 180 * (1 - u);
    const [c, n] = [Math.cos(a), Math.sin(a)];
    const w = half(u) + 0.8;
    return { path: [[HUB[0] + c * (R - w), HUB[1] + n * (R - w)], [HUB[0] + c * (R + w), HUB[1] + n * (R + w)]] };
  };
  const BELL: Pt = [HUB[0] + R, HUB[1]];
  const gust = (r: number, span: number): Shape => band(oval(BELL[0], BELL[1], r, r, -Math.PI / 2 - span, -Math.PI / 2 + span, 12), () => 1.3);
  const gusts = [gust(5.2, 0.8), gust(8.6, 0.56)];
  const bands = [across(0.4), across(0.72)];
  return {
    picture: { silhouette: [mouth, horn, ...gusts], cuts: bands },
    lines: linesOf([mouth, horn, ...gusts], bands),
  };
})();

/** Bull Rush: a bull's head, horns swept out and up behind it, eyes through it, its muzzle parted by a cut and its nostrils through. */
const BULL_RUSH: AbilityIcon = (() => {
  const head = bilateral([
    [0, -8.4],
    ...bend([0, -8.4], [7.4, -8.6], [7.4, -3]),
    ...bend([7.4, -3], [6.4, 4], [4.8, 9.4]),
    ...bend([4.8, 9.4], [4.6, 13.6], [0, 13.6]),
  ]);
  const hornSpine = (m: 1 | -1): Pt[] => [[m * 4, -6], ...bend([m * 4, -6], [m * 15.4, -6.4], [m * 11.6, -14.6], 16)];
  const horns = [band(hornSpine(1), (u) => 2.7 * (1 - u) + 0.4), band(hornSpine(-1), (u) => 2.7 * (1 - u) + 0.4)];
  const muzzle: KnockoutCut = { path: [[-6.2, 5.6], ...bend([-6.2, 5.6], [0, 8.4], [6.2, 5.6])] };
  const holes = [
    { x: -3.6, y: -1.4, r: 1.6 },
    { x: 3.6, y: -1.4, r: 1.6 },
    { x: -2.4, y: 10.6, r: 1.3 },
    { x: 2.4, y: 10.6, r: 1.3 },
  ];
  return {
    picture: { silhouette: [...horns, head], cuts: [...gapOver(head, horns), muzzle], holes },
    lines: [...linesOf([head, ...horns], [muzzle]), ...holes.slice(0, 2).map((ring) => ({ ring }))],
  };
})();

/** Guardian: a tower shield, a border cut round its face, banded across and down to a boss ringed at its middle. */
const GUARDIAN: AbilityIcon = (() => {
  const towerShield = (half: number, top: number, crown: number, side: number, foot: number): Shape => [
    ...bend([-half, top], [0, crown], [half, top], 12),
    [half, side],
    ...bend([half, side], [0, foot], [-half, side], 12).slice(0, -1),
    [-half, top],
  ];
  const shield = towerShield(10.4, -10.6, -15.4, 8.6, 16);
  const border = towerShield(7.6, -8.8, -12.6, 7.6, 13.2);
  const BOSS = 3.6;
  const straps: KnockoutCut[] = [
    { path: [[0, -10.6], [0, -BOSS]] },
    { path: [[0, BOSS], [0, 10.2]] },
    { path: [[-7.6, 0], [-BOSS, 0]] },
    { path: [[BOSS, 0], [7.6, 0]] },
  ];
  return {
    picture: { silhouette: [shield], cuts: [{ path: border, closed: true }, { ring: { x: 0, y: 0, r: BOSS } }, ...straps] },
    lines: [...linesOf([shield, border]), { ring: { x: 0, y: 0, r: BOSS } }],
  };
})();

/** Berserker: a double-bitted war axe, each bit's edge bevelled by a cut, a spike atop its haft and its grip bound. */
const BERSERKER: AbilityIcon = (() => {
  const haft = roundedBox(-1.7, -10, 1.7, 14.4, 0.8);
  const spike: Shape = [
    [-2.4, -9],
    [0, -14.8],
    [2.4, -9],
  ];
  const bit = (m: 1 | -1): Shape =>
    [
      [1, -4.2],
      ...bend([1, -4.2], [6, -4.4], [11.4, -11.6]),
      ...bend([11.4, -11.6], [16.8, -1], [11.4, 9.6]),
      ...bend([11.4, 9.6], [6, 2.6], [1, 2.4]),
    ].map(([x, y]) => [m * x, y] as Pt);
  const bits = [bit(1), bit(-1)];
  const bevel = (m: 1 | -1): KnockoutCut => ({
    path: [[9.2, -8.2] as Pt, ...bend([9.2, -8.2], [13.4, -1], [9.2, 6.4])].map(([x, y]) => [m * x, y] as Pt),
  });
  const binding: KnockoutCut[] = [8.4, 11.6].map((y) => ({ path: [[-2.6, y], [2.6, y]] as Pt[] }));
  return {
    picture: { silhouette: [spike, haft, ...bits], cuts: [bevel(1), bevel(-1), ...binding] },
    lines: linesOf([spike, haft, ...bits], [bevel(1), bevel(-1)]),
  };
})();

// ── The mage's six ────────────────────────────────────────────────────────────────────────────────

/** Kindling: a small flame on two crossed logs, the front log parted from the back and the fire, two sparks flying. */
const KINDLING: AbilityIcon = (() => {
  const log = roundedBox(-11, -2, 11, 2, 1.8);
  const back = place(log, { y: 9.4, a: -0.36 });
  const front = place(log, { y: 9.4, a: 0.36 });
  const fire = flame(0, 8, 6.4, 16.4);
  const sparks = [spark(7.4, -6.4, 2), spark(-7, -9.6, 1.8)];
  return {
    picture: {
      silhouette: [fire.shape, back, front, ...sparks],
      cuts: [fire.core, ...gapOver(front, [back, fire.shape]), ...gapOver(back, [fire.shape])],
    },
    lines: linesOf([fire.shape, front, back, ...sparks]),
  };
})();

/** Deep Well: a stone well under a gabled roof on two posts, a windlass between them, its wall coursed in cut stone. */
const DEEP_WELL: AbilityIcon = (() => {
  const roof: Shape = [
    [-13.6, -7.6],
    [0, -14.6],
    [13.6, -7.6],
  ];
  const posts = [roundedBox(-9.2, -8.4, -6.4, 1, 0.5), roundedBox(6.4, -8.4, 9.2, 1, 0.5)];
  const windlass = roundedBox(-6.6, -5.4, 6.6, -2.8, 0.6);
  const rim = roundedBox(-11.6, 0, 11.6, 3.4, 1.2);
  const wall = roundedBox(-10, 2, 10, 13.6, 1);
  const courses: KnockoutCut[] = [
    { path: [[-12, 3.6], [12, 3.6]] },
    { path: [[-10.6, 7], [10.6, 7]] },
    { path: [[-10.6, 10.4], [10.6, 10.4]] },
    ...[-4, 3.6].map((x) => ({ path: [[x, 3.6], [x, 7]] as Pt[] })),
    ...[-7.6, -0.2, 7.2].map((x) => ({ path: [[x, 7], [x, 10.4]] as Pt[] })),
    ...[-4, 3.6].map((x) => ({ path: [[x, 10.4], [x, 14]] as Pt[] })),
  ];
  return {
    picture: { silhouette: [roof, ...posts, windlass, rim, wall], cuts: [...gapOver(roof, posts), ...courses] },
    lines: linesOf([roof, ...posts, windlass, rim, wall]),
  };
})();

/**
 * Wide Volley: five fireballs hurled from one hand at the lower left, as Triple Fireball throws its
 * three but fanned wider, every other one farther so no two heads touch.
 */
const WIDE_VOLLEY: AbilityIcon = (() => {
  const FROM: Pt = [-13, 13];
  const fly = (deg: number, out: number) => {
    const a = (deg * Math.PI) / 180;
    return place(fireball(3, 7.4), { x: FROM[0] + Math.cos(a) * out, y: FROM[1] + Math.sin(a) * out, a });
  };
  const balls = [fly(-8, 17.6), fly(-26, 23), fly(-45, 19.4), fly(-64, 23), fly(-82, 17.6)];
  return {
    picture: { silhouette: balls, cuts: [] },
    lines: linesOf(balls),
  };
})();

/**
 * Searing: a fireball burst through a plank, its head out on the right and its forked tail still
 * trailing on the left, the plank in front of the flame and parted from it, two splinters thrown.
 */
const SEARING: AbilityIcon = (() => {
  const AT = { x: 6.4, y: -3, a: -0.3 };
  const ball = place(fireball(5.2, 21), AT);
  const plank = place(roundedBox(-1.9, -11.6, 1.9, 11.6, 0.8), { x: -2.6, y: 1.6, a: 0.14 });
  const splinters = [place(spark(0, 0, 2.4), { x: 5.4, y: -11.6, a: 0.7 }), place(spark(0, 0, 2.4), { x: 4, y: 7.4, a: -0.6 })];
  const shine: KnockoutCut = { path: place(oval(0, 0, 2.8, 2.8, -Math.PI * 0.45, Math.PI * 0.05, 6), AT) };
  return {
    picture: { silhouette: [ball, plank, ...splinters], cuts: [...gapOver(plank, [ball]), shine] },
    lines: linesOf([ball, plank, ...splinters]),
  };
})();

/** Spellwarden: a warding disc, a ring cut inside its rim and four notches across it, the warding rune Algiz cut at its heart. */
const SPELLWARDEN: AbilityIcon = (() => {
  const RIM = 13.4;
  const RING = 10.6;
  const disc = circle(0, 0, RIM, 48);
  const rune: KnockoutCut[] = [
    { path: [[0, -7.2], [0, 7.6]] },
    { path: [[-5, -6.2], [0, -0.6], [5, -6.2]] },
  ];
  const notches: KnockoutCut[] = [1, 3, 5, 7].map((k) => {
    const a = (k * Math.PI) / 4;
    return { path: [[Math.cos(a) * RING, Math.sin(a) * RING], [Math.cos(a) * (RIM + 0.6), Math.sin(a) * (RIM + 0.6)]] as Pt[] };
  });
  return {
    picture: { silhouette: [disc], cuts: [{ ring: { x: 0, y: 0, r: RING } }, ...notches, ...rune] },
    lines: [...linesOf([disc], rune), { ring: { x: 0, y: 0, r: RING } }],
  };
})();

/** Pyromancer: a great flame roaring out of a brazier, its rim in front of the fire, a band cut round its bowl, on a stem and foot. */
const PYROMANCER: AbilityIcon = (() => {
  const fire = flame(0, 1.6, 9.4, 16.4);
  const bowl = oval(0, 2, 11, 6.6, 0, Math.PI, 20);
  const rim = roundedBox(-12.6, 0, 12.6, 3.2, 1.2);
  const stem = roundedBox(-1.8, 8, 1.8, 12, 0.4);
  const foot: Shape = [
    [-6.4, 14.6],
    [-3, 11.4],
    [3, 11.4],
    [6.4, 14.6],
  ];
  const bandCut: KnockoutCut = { path: [[-10.6, 4.8], ...bend([-10.6, 4.8], [0, 7.6], [10.6, 4.8])] };
  return {
    picture: {
      silhouette: [fire.shape, bowl, stem, foot, rim],
      cuts: [fire.core, ...gapOver(rim, [fire.shape, bowl]), bandCut],
    },
    lines: linesOf([fire.shape, rim, bowl, stem, foot]),
  };
})();

// ── The archer's six ──────────────────────────────────────────────────────────────────────────────

/**
 * Quick Draw: a bow at full draw, its string pulled back to the nock in a V, the arrow laid across
 * it, its head past the grip.
 */
const QUICK_DRAW: AbilityIcon = (() => {
  const TOP: Pt = [0.4, -14];
  const FOOT: Pt = [0.4, 14];
  const NOCK: Pt = [-10.6, 0];
  const limbs = bend(TOP, [16.4, 0], FOOT, 20);
  const bow = band(limbs, (u) => 1.1 + 1.6 * Math.sin(Math.PI * u));
  const strings = [band([TOP, NOCK], () => 0.85), band([NOCK, FOOT], () => 0.85)];
  const shaft = arrow({ tip: 14.8, head: 5.4, barb: 3.4, shaft: 1.3, tail: -14, fletch: 4.4, out: 3 });
  return {
    picture: { silhouette: [bow, ...strings, shaft], cuts: gapOver(shaft, [bow, ...strings]) },
    lines: [{ path: limbs }, { path: [TOP, NOCK, FOOT] }, ...linesOf([shaft])],
  };
})();

/** Fleet Foot: a winged boot, toe forward, three feathers swept back from its ankle, its cuff and sole parted by cuts. */
const FLEET_FOOT: AbilityIcon = (() => {
  const boot: Shape = [
    [-5, -12.6],
    [3, -12.6],
    [3.4, -1.4],
    ...bend([3.4, -1.4], [6, 2.4], [10.6, 4]),
    ...bend([10.6, 4], [14.6, 5.2], [14.4, 9.4]),
    [14, 12.4],
    [-6.4, 12.4],
    ...bend([-7.4, 10], [-6.4, 2], [-5.6, -1]),
  ];
  const feather = (end: Pt, pull: Pt) => band(bend([-2.4, -2], pull, end, 12), (u) => 2.4 * Math.sqrt(1 - u) + 0.3);
  const feathers = [feather([-14.4, -12.6], [-9, -5]), feather([-14.8, -6], [-9.6, -2]), feather([-13.6, 0.6], [-9, 1.6])];
  const cuff: KnockoutCut = { path: [[-6, -9.4], [4, -9.4]] };
  const sole: KnockoutCut = { path: [[-8, 9.6], [15, 9.6]] };
  return {
    picture: {
      silhouette: [boot, ...feathers],
      cuts: [cuff, sole, ...gapOver(feathers[0], [feathers[1], boot]), ...gapOver(feathers[1], [feathers[2], boot]), ...gapOver(feathers[2], [boot])],
    },
    lines: linesOf([boot, ...feathers], [sole]),
  };
})();

/** Eagle Eye: an eagle's head in profile, its hooked beak to the right, a fierce brow cut over its eye, its neck feathered. */
const EAGLE_EYE: AbilityIcon = (() => {
  const head: Shape = [
    [-11, 14.6],
    [-12, 6],
    ...bend([-12, 6], [-13, -6], [-6, -10.6]),
    ...bend([-6, -10.6], [0, -13], [5, -10]),
    ...bend([5, -10], [12.6, -10.4], [14.6, -3]),
    ...bend([14.6, -3], [14.8, 1.4], [12, 3.4]),
    ...bend([12, 3.4], [12.6, 0.6], [10.4, -0.4]),
    [6.4, 0.4],
    [4.2, -0.4],
    ...bend([4.2, -0.4], [6, 4], [4.4, 7]),
    [5.6, 9.4],
    [3.2, 10],
    [4.4, 12.6],
    [1.6, 12.8],
    [2.2, 14.6],
  ];
  const cere: KnockoutCut = { path: bend([5.6, -10.6], [3.8, -6], [5.4, -0.8]) };
  const brow: KnockoutCut = { path: [[-5, -7.4], [3.6, -6.4]] };
  const ruff: KnockoutCut[] = [6, 10.6].map((y) => ({ path: [[-12.4, y], [-9, y + 2.4], [-5.6, y], [-2.2, y + 2.4], [1.2, y]] as Pt[] }));
  const eye = { x: 0.2, y: -3.8, r: 1.8 };
  return {
    picture: { silhouette: [head], cuts: [cere, brow, ...ruff], holes: [eye] },
    lines: [...linesOf([head], [cere, brow]), { ring: eye }],
  };
})();

/** Hunter's Breath: a full quiver leant to the right, three arrows' fletchings fanned out of its mouth, its rim seated by a cut. */
const HUNTERS_BREATH: AbilityIcon = (() => {
  const LEAN = { x: 0.8, y: 0.8, a: 0.3 };
  const one = arrow({ tip: 6, head: 4, barb: 2.8, shaft: 1.2, tail: -14.6, fletch: 5.4, out: 3.4 });
  const arrows = [
    place(one, { x: -4, a: Math.PI / 2 + 0.24 }),
    place(one, { x: 0, y: -0.6, a: Math.PI / 2 }),
    place(one, { x: 4, a: Math.PI / 2 - 0.24 }),
  ].map((a) => place(a, LEAN));
  const rim = place(roundedBox(-7, -5.4, 7, -2.4, 1.2), LEAN);
  const body = place(roundedBox(-6, -3, 6, 13, 2.6), LEAN);
  const seat: KnockoutCut = { path: place([[-7.4, -2.4], [7.4, -2.4]], LEAN) };
  return {
    picture: {
      silhouette: [...arrows, body, rim],
      cuts: [...gapOver(rim, arrows), ...gapOver(arrows[1], [arrows[0], arrows[2]]), seat],
    },
    lines: linesOf([rim, body, ...arrows]),
  };
})();

/** Hunter: a wolf's head in profile, its muzzle to the left, ears pricked, its mane ragged down its neck. */
const HUNTER: AbilityIcon = (() => {
  const head: Shape = [
    [-14.6, 0.6],
    ...bend([-14.6, 0.6], [-14.6, -1.8], [-12, -2]),
    ...bend([-12, -2], [-7, -2.6], [-4, -6]),
    [-3, -8],
    [-0.6, -14.8],
    [3, -8.4],
    [4.6, -9.6],
    [8.2, -14.4],
    [9.6, -7],
    ...bend([9.6, -7], [13, -4], [12.6, 0]),
    [14.6, 3.6],
    [12.4, 4.6],
    [14.6, 8.4],
    [11.8, 9],
    [13.4, 13.6],
    [9, 12],
    [7, 14.6],
    [4.6, 11.4],
    [1.6, 13.6],
    [0, 9.6],
    ...bend([0, 9.6], [-4, 6.6], [-8.6, 5.4]),
    [-11.6, 4.4],
    [-14.2, 2],
  ];
  const mouth: KnockoutCut = { path: [[-14.8, 2.2], [-8.4, 2.6], [-6.2, 1.2]] };
  const ear: KnockoutCut = { path: [[-0.6, -11.4], [0.8, -8.2]] };
  const cheek: KnockoutCut = { path: bend([3.4, -3], [1.6, 3], [3.2, 8.4]) };
  const eye = { x: -2.4, y: -3.8, r: 1.4 };
  return {
    picture: { silhouette: [head], cuts: [mouth, ear, cheek], holes: [eye] },
    lines: [...linesOf([head], [mouth, cheek]), { ring: eye }],
  };
})();

/**
 * Shadow Ranger: a deep pointed cowl falling into its mantle, the face under it a hollow of gloom with
 * two eyes glinting in it, the mantle folded down its front.
 */
const SHADOW_RANGER: AbilityIcon = (() => {
  const brim = [...bend([-6.6, 5], [-8, -5.4], [0, -10], 12), ...bend([0, -10], [8, -5.4], [6.6, 5], 12).slice(1)];
  const cowl = band(brim, (u) => 1.7 + 2 * Math.sin(Math.PI * u) ** 2);
  const peak: Shape = [
    [-3.2, -12],
    [1, -14.8],
    [3.8, -11.2],
  ];
  const mantle = bilateral([[0, 3.6], [8, 3], ...bend([8, 3], [13, 5.4], [14.4, 14.4]), [0, 14.4]]);
  const glint = (x: number): Shape => [
    [x - 1.7, -1],
    [x, -2.2],
    [x + 1.7, -1],
    [x, 0.2],
  ];
  const eyes = [glint(-2.4), glint(2.4)];
  const folds: KnockoutCut[] = [
    { path: [[0, 6.4], [0, 14.8]] },
    { path: [[-5.6, 7.4], [-9, 14.8]] },
    { path: [[5.6, 7.4], [9, 14.8]] },
  ];
  return {
    picture: { silhouette: [mantle, cowl, peak, ...eyes], cuts: folds },
    lines: linesOf([cowl, peak, mantle, ...eyes]),
  };
})();

// ── The mercenary's six ───────────────────────────────────────────────────────────────────────────

/** Keen Edge: a falchion, point up and to the right, its edge bevelled by a cut and a glint on it. */
const KEEN_EDGE: AbilityIcon = (() => {
  const AT = { x: -1, y: 1, a: -Math.PI / 4 };
  const blade = place([[-3, -2.2], [10, -2.2], [15.6, -4.2], ...bend([15.6, -4.2], [10, 5.6], [-3, 2.6])], AT);
  const guard = place(roundedBox(-5, -5.6, -3, 5.6, 0.8), AT);
  const grip = place(roundedBox(-11, -1.5, -5, 1.5, 0.6), AT);
  const pommel = place(circle(-12.6, 0, 2.2, 16), AT);
  const bevel: KnockoutCut = { path: place(bend([-1.4, 0.6], [9, 2.6], [13.4, -2.4]), AT) };
  const glint = twinkle(8.4, 7.4, 5.4, 1.2);
  return {
    picture: { silhouette: [blade, guard, grip, pommel, glint], cuts: [bevel, ...gapOver(glint, [blade])] },
    lines: linesOf([blade, guard, grip, pommel, glint]),
  };
})();

/** Practiced Guard: an hourglass between its two plates and posts, the sand run half through it. */
const PRACTICED_GUARD: AbilityIcon = (() => {
  const plates = [roundedBox(-10.4, -14.6, 10.4, -11.6, 1.2), roundedBox(-10.4, 11.6, 10.4, 14.6, 1.2)];
  const posts = [roundedBox(-10, -11.8, -7.8, 11.8, 0.4), roundedBox(7.8, -11.8, 10, 11.8, 0.4)];
  const wallSpine = (m: 1 | -1): Pt[] =>
    [...bend([5.8, -11.8], [6.6, -2.6], [2, 0], 12), ...bend([2, 0], [6.6, 2.6], [5.8, 11.8], 12).slice(1)].map(([x, y]) => [m * x, y] as Pt);
  const walls = [band(wallSpine(1), () => 0.9), band(wallSpine(-1), () => 0.9)];
  const topSand = bilateral([[0, -4.6], [3.8, -4.6], ...bend([3.8, -4.6], [3.4, -2], [0.6, -0.6]), [0, -0.6]]);
  const stream = roundedBox(-0.7, -1, 0.7, 6, 0.3);
  const mound = bilateral([[0, 5.4], ...bend([0, 5.4], [2.6, 7.6], [4.4, 10]), [0, 10]]);
  const postLines: KnockoutCut[] = [-8.9, 8.9].map((x) => ({ path: [[x, -11.6], [x, 11.6]] as Pt[] }));
  return {
    picture: { silhouette: [...plates, ...posts, ...walls, topSand, stream, mound], cuts: [] },
    lines: linesOf(plates, [{ path: wallSpine(1) }, { path: wallSpine(-1) }, ...postLines]),
  };
})();

/**
 * Bloodied Riposte: a drop of blood, a shine cut in it, and the riposte's stroke swept up round it
 * and turned back over it, its head pointing back.
 */
const BLOODIED_RIPOSTE: AbilityIcon = (() => {
  const [CX, CY, R] = [-3.4, 5, 6.6];
  const APEX: Pt = [CX, -7.8];
  const t = Math.asin(R / (CY - APEX[1]));
  const drop: Shape = [APEX, ...oval(CX, CY, R, R, -t, Math.PI + t, 24)];
  const shine: KnockoutCut = { path: oval(CX, CY, 3.8, 3.8, Math.PI * 0.72, Math.PI * 1.05, 6) };
  const stroke = curvedArrow(-1, 1, 11.6, 2.8, (75 * Math.PI) / 180, (-95 * Math.PI) / 180, 2.2, (28 * Math.PI) / 180);
  return {
    picture: { silhouette: [drop, stroke], cuts: [shine, ...gapOver(stroke, [drop])] },
    lines: linesOf([drop, stroke]),
  };
})();

/** Steady Hand: an open hand raised, palm out, its fingers together and parted by cuts, the thumb out, a bracer at the wrist. */
const STEADY_HAND: AbilityIcon = (() => {
  const tops = [-10.6, -13.4, -12.4, -9.4];
  const fingers = tops.map((top, i) => roundedBox(-8.4 + i * 4.2, top, -4.2 + i * 4.2, -1, 2));
  const palm = roundedBox(-8.4, -4, 8.4, 7.6, 2.6);
  const thumb = band(bend([-6, 4.6], [-11.6, 2.6], [-12.8, -4.4], 10), (u) => 2.2 - 0.5 * u);
  const bracer = roundedBox(-7.2, 8, 7.2, 14.6, 1);
  const parts: KnockoutCut[] = [-4.2, 0, 4.2].map((x, i) => ({ path: [[x, Math.max(tops[i], tops[i + 1]) - 0.4], [x, -3]] as Pt[] }));
  const wrist: KnockoutCut = { path: [[-8.6, 8.2], [8.6, 8.2]] };
  const bracerBand: KnockoutCut = { path: [[-8, 11.4], [8, 11.4]] };
  const crease: KnockoutCut = { path: bend([-4.4, 5], [-2.4, 0], [3.6, -1.2]) };
  return {
    picture: { silhouette: [...fingers, palm, thumb, bracer], cuts: [...parts, ...gapOver(thumb, [palm]), wrist, bracerBand, crease] },
    lines: linesOf([...fingers, palm, thumb, bracer]),
  };
})();

/** Duelist: a rapier, point up and to the right, its cup hilt in the lower left: a domed bell guard, long quillons behind it. */
const DUELIST: AbilityIcon = (() => {
  const AT = { x: 0.6, y: -0.6, a: -Math.PI / 4, s: 1.1 };
  const blade = place([[-2, -2.1], [15.4, 0], [-2, 2.1]], AT);
  const cup = place(oval(-3.4, 0, 4.4, 7, -Math.PI / 2, Math.PI / 2, 16), AT);
  const quillons = place(roundedBox(-5, -5.4, -3.4, 5.4, 0.8), AT);
  const grip = place(roundedBox(-10.4, -1.6, -5, 1.6, 0.5), AT);
  const pommel = place(circle(-12, 0, 2.4, 16), AT);
  const seat: KnockoutCut = { path: place([[-3.4, -7.4], [-3.4, 7.4]], AT) };
  return {
    picture: { silhouette: [quillons, grip, pommel, cup, blade], cuts: [seat] },
    lines: linesOf([blade, cup, quillons, grip, pommel]),
  };
})();

/** Sellsword: a fat coin purse, its neck tied and its top gathered, a stack of three coins in front of it. */
const SELLSWORD: AbilityIcon = (() => {
  const AT = { x: -3.2 };
  const frill = place(
    bilateral([[0, -10.2], ...bend([0, -10.2], [1.6, -14], [3.8, -11.4]), ...bend([3.8, -11.4], [6.8, -13], [6.2, -9]), [3, -6.8], [0, -6.8]]),
    AT,
  );
  const tie = place(roundedBox(-4.4, -7.8, 4.4, -5, 1.2), AT);
  const body = place(bilateral([[0, -5.4], [3, -5.4], ...bend([3, -5.4], [11, -2], [9.6, 6.6]), ...bend([9.6, 6.6], [8.6, 13.6], [0, 13.6])]), AT);
  const stack = roundedBox(5.2, 3.6, 14.6, 14.4, 1.6);
  const coins: KnockoutCut[] = [7.2, 10.8].map((y) => ({ path: [[4.6, y], [15, y]] as Pt[] }));
  const fold: KnockoutCut = { path: place(bend([-1.4, -3.2], [-5.4, 3.4], [-3.2, 11.6]), AT) };
  return {
    picture: { silhouette: [frill, body, tie, stack], cuts: [...gapOver(tie, [frill, body]), ...gapOver(stack, [body]), ...coins, fold] },
    lines: linesOf([frill, tie, body, stack], coins),
  };
})();

/** Every passive picture, by its key (R40). */
export const PASSIVE_ICONS: Readonly<Record<PassiveIconKey, AbilityIcon>> = {
  vitality: VITALITY,
  might: MIGHT,
  haste: HASTE,
  fleetness: FLEETNESS,
  heavy_hand: HEAVY_HAND,
  thick_skin: THICK_SKIN,
  long_wind: LONG_WIND,
  bull_rush: BULL_RUSH,
  guardian: GUARDIAN,
  berserker: BERSERKER,
  kindling: KINDLING,
  deep_well: DEEP_WELL,
  wide_volley: WIDE_VOLLEY,
  searing: SEARING,
  spellwarden: SPELLWARDEN,
  pyromancer: PYROMANCER,
  quick_draw: QUICK_DRAW,
  fleet_foot: FLEET_FOOT,
  eagle_eye: EAGLE_EYE,
  hunters_breath: HUNTERS_BREATH,
  hunter: HUNTER,
  shadow_ranger: SHADOW_RANGER,
  keen_edge: KEEN_EDGE,
  practiced_guard: PRACTICED_GUARD,
  bloodied_riposte: BLOODIED_RIPOSTE,
  steady_hand: STEADY_HAND,
  duelist: DUELIST,
  sellsword: SELLSWORD,
};

/** The fallback (ADR-0080): the picture `key` in lines, as the ability bar's (`drawAbilityIconLines`). */
export function drawPassiveIconLines(g: AbilityIconPen, key: PassiveIconKey, cx: number, cy: number, ink: number, alpha: number): void {
  drawIconLines(g, PASSIVE_ICONS[key], cx, cy, ink, alpha);
}

/** A node's picture by its key (R40): the tree's own, or the ability bar's own picture, never a copy of it. */
export function nodeIcon(key: NodeIconKey): AbilityIcon {
  return Object.hasOwn(PASSIVE_ICONS, key) ? PASSIVE_ICONS[key as PassiveIconKey] : ABILITY_ICONS[key as AbilityIconKey];
}
