/**
 * The pieces a world's minimap plan is built from (FS-P0HSP §B; CONTEXT.md "Minimap"), for the
 * town and the field worlds: the world's edge as a line with a **road gap** at every way out, and a
 * building as a solid footprint with its doors cut. Pure: world px in, world px out; the minimap
 * projects them (`ui/minimap.ts`).
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import type { MinimapParty, OutlineRun } from "./minimap";

/**
 * A door's notch on the map (FS-P0HSP §B.9): how far in from the footprint's edge it reaches, at
 * least, in panel px, in every mode; the wall's own thickness where that reads deeper. Tunable.
 */
export const MINIMAP_WORLD = { doorNotch: 2 } as const;

/** The world's size in world px. */
export interface WorldSize {
  width: number;
  height: number;
}

/** A side of the world or of a footprint. */
export type Side = "north" | "east" | "south" | "west";

/** Spans along each side, world px from the side's low end (north and south by x, east and west by y). */
export type SideSpans = Record<Side, [number, number][]>;

/** What of a gate opens the edge: where it stands and how far it reaches. */
export interface EdgeGate {
  position: Point;
  range: number;
}

const clampSpan = (from: number, to: number, length: number): [number, number] => [
  Math.max(0, from),
  Math.min(length, to),
];

/**
 * The road gaps (FS-P0HSP §B.7): each gate standing within its `range` of an edge opens that edge
 * for its range either side of its own coordinate along it; a gate reaching two edges opens both,
 * one reaching none opens nothing.
 */
export function roadGaps(size: WorldSize, gates: readonly EdgeGate[]): SideSpans {
  const gaps: SideSpans = { north: [], east: [], south: [], west: [] };
  for (const { position: p, range } of gates) {
    if (p.y <= range) gaps.north.push(clampSpan(p.x - range, p.x + range, size.width));
    if (size.width - p.x <= range) gaps.east.push(clampSpan(p.y - range, p.y + range, size.height));
    if (size.height - p.y <= range) gaps.south.push(clampSpan(p.x - range, p.x + range, size.width));
    if (p.x <= range) gaps.west.push(clampSpan(p.y - range, p.y + range, size.height));
  }
  return gaps;
}

/** `spans` merged and less `cuts`, in order, empty pieces dropped. */
function minus(spans: readonly [number, number][], cuts: readonly [number, number][]): [number, number][] {
  let out = merged(spans);
  for (const [a, b] of cuts) {
    out = out.flatMap(([s, e]): [number, number][] => {
      if (b <= s || a >= e) return [[s, e]];
      return [
        [s, Math.min(a, e)],
        [Math.max(b, s), e],
      ].filter(([x, y]) => y > x) as [number, number][];
    });
  }
  return out;
}

/** Spans sorted, those touching or overlapping joined. */
function merged(spans: readonly [number, number][]): [number, number][] {
  const sorted = [...spans].filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * The world's edge as the walls' line (FS-P0HSP §B.7): clockwise from the north-west corner,
 * drawn along what `shown` holds of each side (the whole of it by default), less the `gaps`. Every
 * corner both of whose sides are drawn up to it is turned in one run, never left open; the whole
 * edge drawn is one closed loop.
 */
export function edgeRuns(size: WorldSize, gaps: SideSpans, shown?: SideSpans): OutlineRun[] {
  const { width: w, height: h } = size;
  const whole: SideSpans = { north: [[0, w]], east: [[0, h]], south: [[0, w]], west: [[0, h]] };
  const on = (side: Side) => minus((shown ?? whole)[side], gaps[side]);
  // each side as a stretch of the perimeter, clockwise, and a point at a distance along it
  const sides: { side: Side; start: number; length: number; at: (t: number) => Point }[] = [
    { side: "north", start: 0, length: w, at: (t) => ({ x: t, y: 0 }) },
    { side: "east", start: w, length: h, at: (t) => ({ x: w, y: t }) },
    { side: "south", start: w + h, length: w, at: (t) => ({ x: w - t, y: h }) },
    { side: "west", start: w * 2 + h, length: h, at: (t) => ({ x: 0, y: h - t }) },
  ];
  const perimeter = (w + h) * 2;
  // the drawn spans as perimeter distances; south and west run backwards along their own axis
  const spans = merged(
    sides.flatMap(({ side, start, length }) =>
      on(side).map(([a, b]): [number, number] =>
        side === "south" || side === "west" ? [start + length - b, start + length - a] : [start + a, start + b],
      ),
    ),
  );
  if (spans.length === 0) return [];
  const point = (t: number): Point => {
    const s = [...sides].reverse().find((x) => t >= x.start) ?? sides[0];
    return s.at(Math.min(t - s.start, s.length));
  };
  const corners = sides.map((s) => s.start);
  if (spans.length === 1 && spans[0][0] <= 0 && spans[0][1] >= perimeter)
    return [{ closed: true, points: corners.map(point) }];
  // a span running through the north-west corner is one with the span it meets there
  const runs = spans.map(([a, b]) => [a, b] as [number, number]);
  if (runs.length > 1 && runs[0][0] <= 0 && runs[runs.length - 1][1] >= perimeter) {
    const last = runs.pop()!;
    runs[0] = [last[0] - perimeter, runs[0][1]];
  }
  // a wrapped span starts before 0, so the corners are looked for a lap back too
  const laps = corners.flatMap((c) => [c - perimeter, c]).sort((p, q) => p - q);
  const wrap = (t: number) => point(((t % perimeter) + perimeter) % perimeter);
  return runs.map(([a, b]) => ({
    closed: false,
    points: [wrap(a), ...laps.filter((c) => c > a && c < b).map(wrap), wrap(b)],
  }));
}

/** A door cut into a footprint: the side it is on and its span along it, world px. */
export interface FootprintDoor {
  side: Side;
  from: number;
  to: number;
}

/** A rect in world px. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A building's footprint as a polygon, clockwise (FS-P0HSP §B.8, §B.9): its rect, each door a
 * notch its span wide reaching `depth` world px in from its side.
 */
export function footprint(r: WorldRect, doors: readonly FootprintDoor[], depth: number): Point[] {
  const [x0, y0, x1, y1] = [r.x, r.y, r.x + r.width, r.y + r.height];
  const on = (side: Side) => doors.filter((d) => d.side === side);
  const pts: Point[] = [{ x: x0, y: y0 }];
  for (const d of on("north").sort((a, b) => a.from - b.from))
    pts.push({ x: d.from, y: y0 }, { x: d.from, y: y0 + depth }, { x: d.to, y: y0 + depth }, { x: d.to, y: y0 });
  pts.push({ x: x1, y: y0 });
  for (const d of on("east").sort((a, b) => a.from - b.from))
    pts.push({ x: x1, y: d.from }, { x: x1 - depth, y: d.from }, { x: x1 - depth, y: d.to }, { x: x1, y: d.to });
  pts.push({ x: x1, y: y1 });
  for (const d of on("south").sort((a, b) => b.from - a.from))
    pts.push({ x: d.to, y: y1 }, { x: d.to, y: y1 - depth }, { x: d.from, y: y1 - depth }, { x: d.from, y: y1 });
  pts.push({ x: x0, y: y1 });
  for (const d of on("west").sort((a, b) => b.from - a.from))
    pts.push({ x: x0, y: d.to }, { x: x0 + depth, y: d.to }, { x: x0 + depth, y: d.from }, { x: x0, y: d.from });
  return pts;
}

/**
 * How far across its edge a world step of one px into a footprint lies on screen, in the iso
 * projection: the same for every side, the projection being symmetric.
 */
const ACROSS = (() => {
  const along = worldToScreen(1, 0);
  const into = worldToScreen(0, 1);
  return Math.abs(along.x * into.y - along.y * into.x) / Math.hypot(along.x, along.y);
})();

/**
 * A door notch's depth in world px at projection scale `k` (FS-P0HSP §B.9): the wall's
 * `thickness`, or as deep as reads {@link MINIMAP_WORLD}.doorNotch panel px in, whichever is deeper.
 */
export function notchDepth(thickness: number, k: number): number {
  return Math.max(thickness, MINIMAP_WORLD.doorNotch / (ACROSS * k));
}

/** What of a world's state the party's dots are read from. */
export interface PartyOnMapState {
  current_player?: { position: Point } | null;
  other_players?: readonly { id: string; position: Point }[] | null;
}

/**
 * The party's dots in the town or a field (FS-P0HSP §E.29, §E.30): the player's own, and each
 * other player in this state who is a member of their party (`members`, the party store's
 * `player_id`s, matched against `other_players[].id`); every other player is left off.
 */
export function partyOnMap(state: PartyOnMapState, members: readonly string[]): MinimapParty {
  const party = new Set(members);
  const me = state.current_player?.position;
  return {
    self: me && { x: me.x, y: me.y },
    allies: (state.other_players ?? []).filter((p) => party.has(p.id)).map((p) => ({ x: p.position.x, y: p.position.y })),
  };
}
