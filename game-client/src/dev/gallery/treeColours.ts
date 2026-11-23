/**
 * The Tree colours review page's content and layout (FS-8RZ51 §Change: A lit node glows in its own
 * colour, L13): every class's nodes, each on the plate the tree lays it on, in its three states side by
 * side, greyed, open and lit. Pure, no Phaser: the sheet (`treeColoursSheet.ts`) draws it through the
 * overlay's own `drawNodePlate`, so what is approved is what ships.
 *
 * A class's traversal slots share four nodes' copy (V13, V29), so each of the four is shown once, with
 * how many slots it stands for: every node of every class is on the sheet, each look once.
 */

import { PASSIVE_NODES } from "@/data/passiveTree";
import { viewport } from "@/render/viewport";
import type { TreeHue } from "@/utils/canvasPalette";
import type { FrameRect } from "@/ui/panelFrame";
import type { TreeLook } from "@/ui/PassiveTreeOverlay";
import { PLATE_SIZE, treeLayout, type PlateLayout } from "@/ui/passiveTreeLayout";
import { treeView, type NodeView } from "@/ui/passiveTreeModel";

/** The three states a node's picture is inked by (L1). */
export const SHEET_STATES = ["greyed", "open", "lit"] as const;
export type SheetState = (typeof SHEET_STATES)[number];

/** Every class the tree defines, in the golden's order (four today). */
export const SHEET_CLASSES: readonly string[] = [...new Set(PASSIVE_NODES.map((n) => n.class))];

/** One look on the sheet: a node, the plate the tree lays it on, and every node id that shares its copy. */
export interface SheetEntry {
  node: NodeView;
  plate: PlateLayout;
  ids: readonly string[];
}

/**
 * A class's entries: its traversal four first, each once (a slot shares its copy with the others of its
 * picture), then its kickers, its ability and its specializations, in the definition's order.
 */
export function sheetEntries(cls: string): SheetEntry[] {
  const view = treeView({ class: cls });
  const layout = treeLayout(viewport, view.nodes, view.links);
  const byLook = new Map<string, SheetEntry & { ids: string[] }>();
  view.nodes.forEach((node, i) => {
    const key = node.kind === "traversal" ? `${node.icon}:${node.hue}` : node.id;
    const seen = byLook.get(key);
    if (seen) seen.ids.push(node.id);
    else byLook.set(key, { node, plate: layout.plates[i], ids: [node.id] });
  });
  const entries = [...byLook.values()];
  return [...entries.filter((e) => e.node.kind === "traversal"), ...entries.filter((e) => e.node.kind !== "traversal")];
}

/**
 * `node` as the tree shows it in `state` (V25): greyed as a closed node, open as an available one with
 * a point to spend, lit as a held one, at max where it has one rank (a traversal node).
 */
export function inState(node: NodeView, state: SheetState): NodeView {
  if (state === "greyed") return { ...node, state: "closed", rank: 0, spendable: false };
  if (state === "open") return { ...node, state: "available", rank: 0, spendable: true };
  return { ...node, state: node.maxRank > 1 ? "held" : "max", rank: 1, spendable: false };
}

/** `look` with one hue previewed in `value`, every other hue and setting as it was. */
export function withHue(look: TreeLook, hue: TreeHue, value: number): TreeLook {
  return { ...look, hues: { ...look.hues, [hue]: value } };
}

/** A colour input's `#rrggbb` as a colour; none for anything else. */
export function colourOf(css: string): number | undefined {
  return /^#[0-9a-f]{6}$/i.test(css) ? Number.parseInt(css.slice(1), 16) : undefined;
}

const MARGIN = 16;
const GAP = 12;
const PAD = 12;
/** The band each block's class title stands in, as a window's title (FS-3EBCA R20). */
const TITLE_H = 30;
/** The state names' column, left of the plates. */
const LABEL_W = 60;
const COLUMN_W = 92;
const NAME_H = 26;
/** A plate, the gap and its `r / max` under it. */
const ROW_H = 58;
/** The hue's token name and its value, two lines under the plates. */
const HUE_H = 30;
const PLATE_MAX = Math.max(...Object.values(PLATE_SIZE));

/** One look's column: its plates in the three states, centred on `x`. */
export interface SheetColumn {
  entry: SheetEntry;
  x: number;
  nameY: number;
  hueY: number;
  cells: { state: SheetState; plate: PlateLayout }[];
}

/** One class's block: a panel ground, its title, the state names, a column per look. */
export interface SheetBlock {
  cls: string;
  panel: FrameRect;
  labels: { state: SheetState; x: number; y: number }[];
  columns: SheetColumn[];
}

export interface SheetLayout {
  width: number;
  height: number;
  blocks: SheetBlock[];
}

/** The sheet: a block per class, stacked, each node's three plates in a column, its real plate moved there. */
export function sheetLayout(classes: readonly string[] = SHEET_CLASSES): SheetLayout {
  const perClass = classes.map((cls) => [cls, sheetEntries(cls)] as const);
  const most = Math.max(0, ...perClass.map(([, e]) => e.length));
  const blockH = TITLE_H + NAME_H + SHEET_STATES.length * ROW_H + HUE_H + PAD;
  const width = MARGIN * 2 + PAD * 2 + LABEL_W + most * COLUMN_W;
  const blocks = perClass.map(([cls, entries], b): SheetBlock => {
    const panel = { x: MARGIN, y: MARGIN + b * (blockH + GAP), width: width - MARGIN * 2, height: blockH };
    const top = panel.y + TITLE_H + NAME_H;
    const rowY = (i: number) => top + i * ROW_H + PLATE_MAX / 2;
    const labels = SHEET_STATES.map((state, i) => ({ state, x: panel.x + PAD, y: rowY(i) }));
    const columns = entries.map((entry, c): SheetColumn => {
      const x = panel.x + PAD + LABEL_W + c * COLUMN_W + COLUMN_W / 2;
      const cells = SHEET_STATES.map((state, i) => ({ state, plate: movedTo(entry.plate, x, rowY(i)) }));
      return { entry, x, nameY: panel.y + TITLE_H + NAME_H / 2 - 4, hueY: top + SHEET_STATES.length * ROW_H - 4, cells };
    });
    return { cls, panel, labels, columns };
  });
  return { width, height: MARGIN * 2 + classes.length * blockH + Math.max(0, classes.length - 1) * GAP, blocks };
}

/** `plate` moved so its centre stands at (cx, cy), its size, shape and lock mark kept. */
function movedTo(plate: PlateLayout, cx: number, cy: number): PlateLayout {
  const { rect, lock } = plate;
  const dx = cx - (rect.x + rect.width / 2);
  const dy = cy - (rect.y + rect.height / 2);
  return {
    ...plate,
    rect: { ...rect, x: rect.x + dx, y: rect.y + dy },
    lock: { ...lock, x: lock.x + dx, y: lock.y + dy },
  };
}
