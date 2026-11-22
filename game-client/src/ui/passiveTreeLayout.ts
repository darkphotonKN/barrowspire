/**
 * The passive tree overlay's geometry (FS-8RZ51 R34; §Change: Tree v2 V23, V24): one carved panel at
 * the screen's centre, above the corner row; under its title band the header (class and unspent
 * points), then the tree as a graph, the footer at the foot. Phaser-free, so it is tested without a
 * canvas; `PassiveTreeOverlay` draws into these rects.
 *
 * The placement comes from the node data alone, never from per-class coordinates (V11, V23):
 * - **column** is the node's depth, the root at the left;
 * - **lane** is its side of a group, or the trunk for a node on no side. The trunk is row 0. A group's
 *   sides alternate outward, its first above, its second below, its third above again, and so on;
 * - a lane takes the free rows on its side nearest the trunk across every depth it spans, as many as
 *   it has nodes at one depth. Lanes are placed deepest first, so the end of the tree sits nearest the
 *   trunk; ties go by group order in the definition, then side order.
 */

import type { PassiveExclusive, PassiveNodeKind } from "@/data/passiveTree";
import { CORNER_ROW_CLEARANCE } from "./hudCornerLayout";
import { PANEL_TITLE_BAND } from "./panelFrame";
import type { Rect } from "./partyPanelLayout";

export interface TreeLayoutView {
  width: number;
  height: number;
}

/** What the layout reads of a node (V23): the model's `NodeView` is one. */
export interface TreeLayoutNode {
  id: string;
  kind: PassiveNodeKind;
  depth: number;
  lane?: PassiveExclusive;
}

/** What the layout reads of a link (V24): the model's `LinkView` is one. */
export interface TreeLayoutLink {
  from: string;
  to: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface PlateLayout {
  id: string;
  /** The plate's box, square; a round plate is the circle inside it. */
  rect: Rect;
  round: boolean;
  /** Its depth, left to right. */
  column: number;
  /** Its row: 0 the trunk, negative above, positive below. */
  row: number;
  /** Where a locked node's lock mark stands, over the plate's top right corner (V25). */
  lock: Rect;
}

/** One link, a straight line from plate edge to plate edge (V24). */
export interface LinkSegment {
  from: string;
  to: string;
  a: Point;
  b: Point;
}

export interface TreeLayout {
  panel: Rect;
  /** The header's middle: the class and the unspent points (R35). */
  header: Point;
  /** Every node's plate, in the order handed. */
  plates: PlateLayout[];
  /** Every link whose both ends have a plate, in the order handed. */
  links: LinkSegment[];
  /** The footer's middle (R38). */
  footer: Point;
  /**
   * The ask in the footer band (R38, V27): its words' room at the left (their left edge, the band's
   * middle, the width they wrap to), and its Yes and No at the right.
   */
  answers: { words: { x: number; y: number; width: number }; yes: Rect; no: Rect };
}

/** Between two columns' centres, and two rows' (V23's starting sizes, tuned at the browser check). */
export const TREE_COLUMN_W = 64;
export const TREE_ROW_H = 72;
/** The least the columns and rows draw together where the view is short of room. */
const COLUMN_MIN_W = 48;
const ROW_MIN_H = 56;
/** A plate's side by its node's kind (V23): traversal small and round, a kicker larger, the ability and a specialization largest. */
export const PLATE_SIZE: Readonly<Record<PassiveNodeKind, number>> = {
  traversal: 24,
  kicker: 32,
  ability: 40,
  specialization: 40,
};
const PLATE_MAX = Math.max(...Object.values(PLATE_SIZE));
/** The `r / max` under a plate, this far below it, and its height. */
export const TREE_RANK_GAP = 2;
const RANK_H = 12;
/** The lock mark's box, and how far it stands out past the plate's top right corner. */
const LOCK = 10;
const LOCK_OUT = 3;

/** The panel's least width: the header, and the ask's words beside its Yes and No (R38). */
const PANEL_MIN_W = 380;
/** The panel's inner margin, and its least distance from the screen's edges. */
const PAD = 16;
const MARGIN = 16;
const HEADER_H = 26;
/** Tall enough for the ask's words on two lines beside its Yes and No (R38). */
const FOOTER_H = 36;
/** The ask's Yes and No: each box, and the gap between them and before them. */
const ANSWER_W = 40;
const ANSWER_H = 20;
const ANSWER_GAP = 6;
/** The height a tree of no nodes keeps for its one empty band (R42). */
const EMPTY_H = 58;

/**
 * The overlay's layout in `view` for `nodes` linked by `links` (V23, V24): centred across the view,
 * between the top margin and the corner row's clearance; its columns and rows draw together where
 * the view is short of room.
 */
export function treeLayout(view: TreeLayoutView, nodes: readonly TreeLayoutNode[], links: readonly TreeLayoutLink[]): TreeLayout {
  const rows = placeRows(nodes);
  const columns = nodes.length ? Math.max(...nodes.map((n) => n.depth)) + 1 : 0;
  const rowValues = [...rows.values()];
  const minRow = rowValues.length ? Math.min(...rowValues) : 0;
  const rowCount = rowValues.length ? Math.max(...rowValues) - minRow + 1 : 0;

  const fixedH = PANEL_TITLE_BAND + HEADER_H + FOOTER_H + PAD / 2;
  const room = view.height - CORNER_ROW_CLEARANCE - MARGIN;
  const cellH = PLATE_MAX + TREE_RANK_GAP + RANK_H;
  const rowH = fit(TREE_ROW_H, ROW_MIN_H, room - fixedH - cellH, rowCount - 1);
  const colW = fit(TREE_COLUMN_W, COLUMN_MIN_W, view.width - 2 * MARGIN - 2 * PAD - PLATE_MAX, columns - 1);
  const gridW = columns ? (columns - 1) * colW + PLATE_MAX : 0;
  const gridH = rowCount ? (rowCount - 1) * rowH + cellH : EMPTY_H;

  const width = Math.max(PANEL_MIN_W, gridW + 2 * PAD);
  const height = fixedH + gridH;
  const x = Math.round((view.width - width) / 2);
  const y = Math.max(MARGIN, Math.round(MARGIN + (room - height) / 2));
  const panel = { x, y, width, height };

  const gridLeft = x + Math.round((width - gridW) / 2);
  const gridTop = y + PANEL_TITLE_BAND + HEADER_H;
  const plates = nodes.map((node): PlateLayout => {
    const row = rows.get(node.id)!;
    const size = PLATE_SIZE[node.kind] ?? PLATE_SIZE.kicker;
    const cx = gridLeft + PLATE_MAX / 2 + node.depth * colW;
    const cy = gridTop + PLATE_MAX / 2 + (row - minRow) * rowH;
    const rect = { x: cx - size / 2, y: cy - size / 2, width: size, height: size };
    const lock = { x: rect.x + size - LOCK + LOCK_OUT, y: rect.y - LOCK_OUT, width: LOCK, height: LOCK };
    return { id: node.id, rect, round: node.kind === "traversal", column: node.depth, row, lock };
  });
  const byId = new Map(plates.map((p) => [p.id, p]));
  const segments = links.flatMap((link): LinkSegment[] => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    return from && to ? [{ from: link.from, to: link.to, a: edgeToward(from, to), b: edgeToward(to, from) }] : [];
  });

  const footer = { x: x + width / 2, y: y + height - PAD / 2 - FOOTER_H / 2 };
  const answerY = Math.round(footer.y - ANSWER_H / 2);
  const no = { x: x + width - PAD - ANSWER_W, y: answerY, width: ANSWER_W, height: ANSWER_H };
  const yes = { ...no, x: no.x - ANSWER_GAP - ANSWER_W };
  return {
    panel,
    header: { x: x + width / 2, y: y + PANEL_TITLE_BAND + HEADER_H / 2 },
    plates,
    links: segments,
    footer,
    answers: { words: { x: x + PAD, y: footer.y, width: yes.x - ANSWER_GAP - (x + PAD) }, yes, no },
  };
}

/** The node whose plate lies under a screen point: inside a round plate's rim, or a square plate's box; none off every plate. */
export function nodeAt(layout: TreeLayout, x: number, y: number): string | undefined {
  return layout.plates.find((p) => {
    const { rect } = p;
    if (!p.round) return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    const r = rect.width / 2;
    return Math.hypot(x - (rect.x + r), y - (rect.y + r)) <= r;
  })?.id;
}

/** A spacing at `best`, drawn together toward `least` where `gaps` of it would not fit in `room`; a whole px. */
function fit(best: number, least: number, room: number, gaps: number): number {
  return gaps > 0 ? Math.max(least, Math.min(best, Math.floor(room / gaps))) : best;
}

/** Where the line from `from`'s centre toward `to`'s leaves `from`'s plate: on its rim, or on its box's side. */
function edgeToward(from: PlateLayout, to: PlateLayout): Point {
  const half = from.rect.width / 2;
  const a = { x: from.rect.x + half, y: from.rect.y + half };
  const dx = to.rect.x + to.rect.width / 2 - a.x;
  const dy = to.rect.y + to.rect.height / 2 - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return a;
  const [ux, uy] = [dx / length, dy / length];
  const reach = from.round ? half : half / Math.max(Math.abs(ux), Math.abs(uy));
  return { x: a.x + ux * reach, y: a.y + uy * reach };
}

/** One lane's nodes (V23): a side of a group, or the trunk. */
interface Lane {
  side?: PassiveExclusive;
  /** Its nodes, in the definition's order. */
  nodes: TreeLayoutNode[];
  first: number;
  last: number;
  /** The most of its nodes at one depth: the rows it takes. */
  span: number;
  /** -1 above the trunk, 1 below. */
  direction: number;
  groupOrder: number;
  sideOrder: number;
}

/** Each node's row (V23): the trunk on row 0, each side's lane on the free rows nearest it. */
function placeRows(nodes: readonly TreeLayoutNode[]): Map<string, number> {
  const groups: string[] = [];
  const sides = new Map<string, string[]>();
  const lanes = new Map<string, Lane>();
  for (const node of nodes) {
    const side = node.lane;
    if (side && !groups.includes(side.group)) groups.push(side.group);
    const ofGroup = side ? (sides.get(side.group) ?? []) : [];
    if (side && !ofGroup.includes(side.side)) sides.set(side.group, [...ofGroup, side.side]);
    const key = side ? `${side.group}\u0000${side.side}` : "";
    const lane = lanes.get(key);
    if (lane) {
      lane.nodes.push(node);
      lane.first = Math.min(lane.first, node.depth);
      lane.last = Math.max(lane.last, node.depth);
      continue;
    }
    const sideOrder = side ? sides.get(side.group)!.indexOf(side.side) : 0;
    lanes.set(key, {
      side,
      nodes: [node],
      first: node.depth,
      last: node.depth,
      span: 1,
      direction: sideOrder % 2 === 0 ? -1 : 1,
      groupOrder: side ? groups.indexOf(side.group) : -1,
      sideOrder,
    });
  }
  for (const lane of lanes.values()) {
    const perDepth = new Map<number, number>();
    for (const n of lane.nodes) perDepth.set(n.depth, (perDepth.get(n.depth) ?? 0) + 1);
    lane.span = Math.max(...perDepth.values());
  }

  /** Each row's depths taken. */
  const taken = new Map<number, Set<number>>();
  const free = (row: number, lane: Lane) => {
    const at = taken.get(row);
    for (let d = lane.first; d <= lane.last; d++) if (at?.has(d)) return false;
    return true;
  };
  const take = (row: number, lane: Lane) => {
    const at = taken.get(row) ?? new Set<number>();
    for (let d = lane.first; d <= lane.last; d++) at.add(d);
    taken.set(row, at);
  };
  const placed = new Map<string, number>();
  const lay = (lane: Lane, base: number) => {
    const next = new Map<number, number>();
    for (const n of lane.nodes) {
      const k = next.get(n.depth) ?? 0;
      next.set(n.depth, k + 1);
      placed.set(n.id, base + k * lane.direction);
    }
  };

  // the trunk first, on row 0 and outward below it where it has more than one node at a depth
  const trunk = lanes.get("");
  if (trunk) {
    trunk.direction = 1;
    for (let k = 0; k < trunk.span; k++) take(k, trunk);
    lay(trunk, 0);
  }
  const order = [...lanes.values()]
    .filter((l) => l.side)
    .sort((a, b) => b.first - a.first || a.groupOrder - b.groupOrder || a.sideOrder - b.sideOrder);
  for (const lane of order) {
    let base = lane.direction;
    const fits = () => Array.from({ length: lane.span }, (_, k) => base + k * lane.direction).every((r) => r !== 0 && free(r, lane));
    while (!fits()) base += lane.direction;
    for (let k = 0; k < lane.span; k++) take(base + k * lane.direction, lane);
    lay(lane, base);
  }
  return placed;
}
