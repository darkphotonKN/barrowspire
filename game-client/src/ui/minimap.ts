/**
 * The minimap (FS-SRA9J §E, ADR-0063; CONTEXT.md "Minimap"): the top-right HUD map of a dungeon
 * floor. The floor in the world's own iso projection, fitted to 216 × 108 logical px on the HUD's
 * panel (design-guideline "UI Chrome": a `hudPanel` backing, a 1px brass rim, as the target frame
 * wears it), showing the explored and visible regions, a dot per living party member, and the
 * switch, escape door and stairs once their region is explored. Nothing else: no unexplored region,
 * no monster, no container or drop pile, no room role (roles are not on the wire). Colours are
 * tokens only (ADR-0013).
 *
 * **The look** (FS-56CKV §A; design-guideline "UI Chrome → Minimap"): candle-lit stone in the frame
 * as it was. Inside the rim, bottom to top: every seen region, explored or visible, in one dark stone
 * (the one the party stands in no lighter), its walls outlined, rooms' and corridors' alike, every
 * opening a gap; a soft `inkDeep` vignette strongest at the rim's inside edge; the switch, escape
 * door and stairs as small amber glyphs on a dark ring; the party's dots, each ringed. Nothing warm in the middle: amber in the HUD means "interactable".
 *
 * **Layers, each redrawn only when it changes** (§E.23). The map (backing, region fills and edges)
 * and the marks (the glyphs) are keyed by which regions are seen and the marks found, not by which
 * seen region is visible, since nothing they draw tells the two apart; the vignette,
 * which shows nothing that changes, is one canvas texture's image made once per minimap, between
 * them; the party's dots, which move all the time, are a layer of their own keyed by their
 * whole-px places. All are drawn about the panel's own top-left and stood where it is placed, so a
 * re-layout moves them without a redraw. Made in that order at one depth, they draw in it.
 *
 * **Pixel rounding** is the viewport's (ADR-0057: every object renders `fullAuto`); the panel stands
 * on whole logical px and the glyphs and dots are seated on them, so the rim, the glyphs and the
 * dots stay crisp at render scales 1, 1.5 and 2. Everything is kept inside the rim, so no mask is
 * needed. The vignette is a canvas gradient, never Phaser's WebGL-only `fillGradientStyle`, so it
 * looks the same under both renderers.
 *
 * **Modes** (FS-1SEF0): normal; enlarged, the same panel half as large again, drawn at its size so
 * nothing blurs, its glyphs and dots at the normal size; and the map overlay, the same layers moved into the world under the HUD, the floor
 * at 1/8 of the world's projection about the followed figure, see-through, with no panel, rim or
 * vignette. Following the figure moves the layers; it never redraws them.
 *
 * Draws through {@link MinimapStage}, the narrow slice of Phaser it needs. Pure otherwise.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { projectedBounds, worldToScreen, type Point, type Rect } from "@/render/iso/projection";
import type { RegionGrid } from "@/render/world/dungeon";
import { regionAt, type ExplorationState } from "@/render/world/exploration";
import type { FloorRegion } from "@/types/gameState";
import { palette, rgba } from "@/utils/canvasPalette";
import type { MinimapMode } from "./minimapMode";

export const MINIMAP = {
  /** The panel, in logical px (§E.21). */
  width: 216,
  height: 108,
  /** From the panel's bottom to the floor indicator's top under it (FS-56CKV §B.9). */
  gap: 6,
  /** From the rim to the floor's fit, each side. */
  inset: 4,
  /** The HUD band, the floor indicator's: over the floor veil (950), under the overlays. */
  depth: 1000,
} as const;

/** The panel's backing and rim: the target frame's (FS-48CTQ), the HUD's look; unchanged (FS-56CKV §A.1). */
const PANEL = { alpha: 0.85, rim: 1, rimAlpha: 0.6 } as const;

/**
 * The enlarged minimap (FS-1SEF0 §B.9): its map, panel, rim and vignette half as large again
 * (`scale`); its glyphs and dots at `marks`, a value of its own, the normal minimap's and the
 * overlay's size (the owner's "1.5被地圖的標記也改小一點ep 2倍一樣大", 2026-11-12; was the map's 1.5).
 */
export const MINIMAP_ENLARGED = { scale: 1.5, marks: 1 } as const;

/**
 * The map overlay (FS-1SEF0 §C), each a starting value to tune by eye: the world's own iso
 * projection scaled by `scale` (floor 1's diamond 960 × 480); the regions' fill and the walls'
 * line at `alpha`, the line `edge` logical px wide; the glyphs and dots at `marks`, two thirds of
 * the enlarged map's 1.5 (§C.16; the owner's "最大的圖的標記小一點", 2026-11-12); at `depth`, over
 * the world, the fog, the dust and the vignette (905), under the aim line (940), the floor veil
 * (950) and the HUD (1000). The
 * map and marks are held on screen while the figure's stand is within `hold` backing px of where
 * they are shown (§C.19; the owner's two, 2026-11-12: one left back-steps under broadcast jitter).
 */
export const MINIMAP_OVERLAY = { scale: 0.125, alpha: 0.4, edge: 2, marks: 1, depth: 920, hold: 2 } as const;
/** Dot radii, logical px: the local player's larger, so it reads apart from the allies' (§E.22, FS-56CKV §A.7). */
const DOT = { self: 3, ally: 2, outline: 1 } as const;

/**
 * The candle-lit vignette round the rim's inside edge (FS-56CKV §A.2), in `palette.inkDeep`, the
 * game vignette's ink. Tunable: how far in it reaches, its alpha at the edge, and its ease in, as
 * [fraction of the reach, fraction of the edge alpha] stops. No stop pair may fall faster than
 * 0.08 alpha a logical px.
 */
export const MINIMAP_VIGNETTE = {
  /** From the rim's inside edge toward the middle, logical px. */
  reach: 18,
  /** At the rim's inside edge. */
  edgeAlpha: 0.6,
  ease: [
    [0, 1],
    [0.4, 0.4],
    [1, 0],
  ],
} as const;

/** The one texture every minimap's vignette is an image of. */
const VIGNETTE_TEXTURE = "minimapVignette";

/** The outline along the seen regions' walls (FS-56CKV §A.5): its width, logical px, in `palette.minimapEdge`. */
export const MINIMAP_EDGE = { width: 1 } as const;

/**
 * A found fixture's glyph (FS-56CKV §A.6): its ink a 7 × 7 px shape in `palette.interactable`, on a
 * 1 px `palette.markerStroke` ring round the shape, the whole a `box` px square seated on the px
 * where the old 4 px mark was centred.
 */
export const MINIMAP_GLYPH = { ink: 7, ring: 1, box: 9 } as const;

/**
 * The panel's look at one size, in logical px: its size, inset and rim; the walls' line; the scale
 * its map is drawn at; and the scale its glyphs and dots are drawn at.
 */
export interface MinimapPanel {
  width: number;
  height: number;
  inset: number;
  rim: number;
  edge: number;
  scale: number;
  marks: number;
}

/**
 * The panel normal or enlarged (FS-1SEF0 §B.9): lengths on the pixel grid (the panel, its inset,
 * its rim) scaled and rounded to whole logical px, so the enlarged panel is drawn at its size and
 * never blurs; the walls' line scaled exactly, being anti-aliased at any size; the marks at the
 * mode's own size, apart from the map's scale.
 */
export function minimapPanel(mode: "normal" | "enlarged"): MinimapPanel {
  const k = mode === "enlarged" ? MINIMAP_ENLARGED.scale : 1;
  const grid = (v: number) => Math.round(v * k);
  return {
    width: grid(MINIMAP.width),
    height: grid(MINIMAP.height),
    inset: grid(MINIMAP.inset),
    rim: grid(PANEL.rim),
    edge: MINIMAP_EDGE.width * k,
    scale: k,
    marks: mode === "enlarged" ? MINIMAP_ENLARGED.marks : 1,
  };
}

/** Where the minimap stands (§E.20, FS-56CKV §B.9): its right edge on the column's, its top the column's top. */
export function minimapRect(right: number, top: number, size: Pick<MinimapPanel, "width" | "height"> = MINIMAP): Rect {
  return {
    x: Math.round(right) - size.width,
    y: Math.round(top),
    width: size.width,
    height: size.height,
  };
}

/**
 * A world point on the panel (§E.21), about its top-left: the whole floor's iso diamond, scaled to
 * fit inside the inset, centred. Floor 1's 72 × 48 cells project 2:1 and fill the height.
 */
export function minimapProjection(
  grid: RegionGrid,
  panel: Pick<MinimapPanel, "width" | "height" | "inset"> = MINIMAP,
): (p: Point) => Point {
  const bounds = projectedBounds(grid.cols * grid.cell, grid.rows * grid.cell);
  const k = Math.min(
    (panel.width - panel.inset * 2) / bounds.width,
    (panel.height - panel.inset * 2) / bounds.height,
  );
  const ox = (panel.width - bounds.width * k) / 2 - bounds.x * k;
  const oy = (panel.height - bounds.height * k) / 2 - bounds.y * k;
  return (p) => {
    const s = worldToScreen(p.x, p.y);
    return { x: ox + s.x * k, y: oy + s.y * k };
  };
}

/** A fixture the minimap marks once found (§E.22): where it stands. */
export interface MinimapFixture {
  kind: "switch" | "escape-door" | "stairs";
  at: Point;
}

/** What the map layer shows. */
export interface MinimapContent {
  /** Every explored or visible region, by id, with its cells (cell units). */
  regions: { id: number; state: Exclude<ExplorationState, "unexplored">; cells: FloorRegion["cells"] }[];
  /** The fixtures standing in an explored or visible region. */
  fixtures: MinimapFixture[];
}

/**
 * The map's content from the party's exploration (§E.22): the regions it has seen, and the
 * fixtures in them. Unexplored regions, and fixtures in them or in no region, are left out.
 */
export function minimapContent(
  grid: RegionGrid,
  state: (region: number) => ExplorationState,
  fixtures: readonly MinimapFixture[],
): MinimapContent {
  const regions: MinimapContent["regions"] = [];
  for (const r of grid.regions) {
    const s = state(r.id);
    if (s !== "unexplored") regions.push({ id: r.id, state: s, cells: r.cells });
  }
  const found = fixtures.filter((f) => {
    const id = regionAt(grid, f.at);
    return id !== 0 && state(id) !== "unexplored";
  });
  return { regions, fixtures: found };
}

/** A run of the walls' outline (FS-56CKV §A.5), in cell units: its corner points, and whether its last point joins back to its first. */
export interface OutlineRun {
  points: Point[];
  closed: boolean;
}

/**
 * The shown regions' walls (FS-56CKV §A.5: walls are lines, openings are gaps), in cell units:
 * every side of a seen region's cell, room or corridor alike, that faces a cell that is not
 * walkable (shell or void, or off the grid), from the whole floor's regions in `grid`. A side
 * between two walkable cells gets no line, whatever their regions, kinds or states: a doorway, a
 * corridor meeting a room or another, a seen region meeting an unexplored one, nor a cell rect's
 * side inside a region. Each side once, joined into runs that turn every corner unbroken: a closed
 * loop where a wall goes all the way round, an open run where it stops at a gap.
 */
export function regionOutline(grid: RegionGrid, seen: readonly Pick<MinimapContent["regions"][number], "id" | "cells">[]): OutlineRun[] {
  // walkable: in a region of the floor, seen or not, so an opening shows before the path beyond is seen
  const walkable = (cx: number, cy: number) => grid.walkable(cx, cy);
  // each unit side, directed clockwise round its region (y down), by the corner it leaves
  const key = (p: Point) => `${p.x},${p.y}`;
  const out = new Map<string, Point[]>();
  const into = new Map<string, number>();
  const side = (from: Point, to: Point) => {
    const k = key(from);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(to);
    into.set(key(to), (into.get(key(to)) ?? 0) + 1);
  };
  for (const { id, cells } of seen)
    for (const { x, y, w, h } of cells)
      for (let cx = x; cx < x + w; cx++)
        for (let cy = y; cy < y + h; cy++) {
          if (grid.region(cx, cy) !== id) continue;
          if (!walkable(cx, cy - 1)) side({ x: cx, y: cy }, { x: cx + 1, y: cy });
          if (!walkable(cx + 1, cy)) side({ x: cx + 1, y: cy }, { x: cx + 1, y: cy + 1 });
          if (!walkable(cx, cy + 1)) side({ x: cx + 1, y: cy + 1 }, { x: cx, y: cy + 1 });
          if (!walkable(cx - 1, cy)) side({ x: cx, y: cy + 1 }, { x: cx, y: cy });
        }
  const point = (k: string): Point => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  };
  /** From `from`, along unused sides until none leaves the corner reached. */
  const walk = (from: string): Point[] => {
    const points = [point(from)];
    let at = from;
    while ((out.get(at)?.length ?? 0) > 0) {
      at = key(out.get(at)!.pop()!);
      points.push(point(at));
    }
    return points;
  };
  const runs: OutlineRun[] = [];
  // a wall stopping at a gap: a run starts where more sides leave a corner than reach it, and ends
  // where none is left to leave by; counted before any walk, since a walk passing through a corner
  // takes one side in and one out and leaves that count as it was
  const surplus = [...out].map(([k, nexts]) => [k, nexts.length - (into.get(k) ?? 0)] as const);
  for (const [k, n] of surplus)
    for (let i = 0; i < n && out.get(k)!.length > 0; i++) runs.push({ points: walk(k), closed: false });
  // every side left has as many in as out at each corner, so a walk from a corner closes on it
  for (const [k, nexts] of out)
    while (nexts.length > 0) runs.push({ points: walk(k).slice(0, -1), closed: true });
  // keep only the corners, and an open run's ends: a point where the line runs straight on is dropped
  return runs.map(({ points, closed }) => ({
    closed,
    points: points.filter((p, i) => {
      if (!closed && (i === 0 || i === points.length - 1)) return true;
      const a = points[(i + points.length - 1) % points.length];
      const b = points[(i + 1) % points.length];
      return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
    }),
  }));
}

/** Where the party's living, in-play members stand (§E.22): this client's player apart. */
export interface MinimapParty {
  self?: Point;
  allies: readonly Point[];
}

/** What of a Phaser game object the minimap stands, shows and hides: a Graphics, or the vignette's image. */
export interface MinimapLayer {
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setScrollFactor(factor: number): unknown;
  setVisible(visible: boolean): unknown;
  destroy(): void;
}

/** What of a Phaser Graphics the minimap draws with. */
export interface MinimapGraphics extends MinimapLayer {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  strokePath(): unknown;
}

/** Paints a canvas texture `width` × `height` px. */
export type CanvasPaint = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** What the minimap asks of the scene: `this.add.graphics`, and an image of a canvas texture. */
export interface MinimapStage {
  graphics(): MinimapGraphics;
  /** An image of the canvas texture `key`, `width` × `height` logical px, its origin its top-left; `paint` paints the texture if it is not yet. */
  canvasImage(key: string, width: number, height: number, paint: CanvasPaint): MinimapLayer;
  /**
   * Hears each frame once the camera is set up for it and before anything is drawn, with the
   * scroll the world is drawn at (world px, on the backing-px grid); the returned function stops
   * it. The overlay holds its map against the screen from it (FS-1SEF0 §C.19); a stage without it
   * leaves the overlay where {@link Minimap.follow} stands it.
   */
  frames?(listener: (scroll: Point) => void): () => void;
}

/** From the panel's edge to the rim's inside edge: a rim is stroked centred on the panel's edge. */
const rimInside = (panel: MinimapPanel) => Math.ceil(panel.rim / 2);

/**
 * The vignette (FS-56CKV §A.2): a band in from each side of the rim's inside edge, each a linear
 * gradient of `inkDeep` from its edge alpha to nothing at its reach; where two bands meet in a
 * corner they compound, as a candle's shadow does. Nothing is painted on or outside the rim. Its
 * reach scales with the panel (FS-1SEF0 §B.9).
 */
const vignettePainter = (panel: MinimapPanel): CanvasPaint => (ctx, w, h) => {
  const { edgeAlpha, ease } = MINIMAP_VIGNETTE;
  const reach = MINIMAP_VIGNETTE.reach * panel.scale;
  const r = rimInside(panel);
  const bands: [from: Point, to: Point, rect: [number, number, number, number]][] = [
    [{ x: r, y: r }, { x: r, y: r + reach }, [r, r, w - r * 2, reach]],
    [{ x: r, y: h - r }, { x: r, y: h - r - reach }, [r, h - r - reach, w - r * 2, reach]],
    [{ x: r, y: r }, { x: r + reach, y: r }, [r, r, reach, h - r * 2]],
    [{ x: w - r, y: r }, { x: w - r - reach, y: r }, [w - r - reach, r, reach, h - r * 2]],
  ];
  for (const [from, to, rect] of bands) {
    const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    for (const [at, k] of ease) gradient.addColorStop(at, rgba(palette.inkDeep, edgeAlpha * k));
    ctx.fillStyle = gradient;
    ctx.fillRect(...rect);
  }
};

interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each glyph, a row per string (FS-56CKV §A.6): `#` inked, `o` the shape's own dark, in the ring's ink. */
const GLYPH_ART: Record<MinimapFixture["kind"], readonly string[]> = {
  // a lever: a base, a pivot, a slanted handle with a knob at its end
  switch: [".....##", ".....##", "....#..", "...#...", "..###..", "#######", "#######"],
  // an arch over a dark doorway
  "escape-door": ["..###..", ".#####.", "##ooo##", "##ooo##", "##ooo##", "##ooo##", "##ooo##"],
  // a flight of three steps rising to the right
  stairs: [".....##", ".....##", "...####", "...####", ".######", ".######", "#######"],
};

/**
 * A glyph's ink as a rect per run of inked px, along each row and down each column, and its ring as
 * each grown by the ring's width, with the shape's dark. Every two touching px of one ink lie inside
 * one rect, so no seam opens between rects where an edge falls between device px (render scale 1.5
 * under the canvas renderer).
 */
function glyphRects(art: readonly string[]): { ink: PxRect[]; ring: PxRect[] } {
  const runs = (of: RegExp) => {
    const columns = Array.from(art[0], (_, x) => art.map((row) => row[x]).join(""));
    return [
      ...art.flatMap((row, y) => [...row.matchAll(of)].map((run) => ({ x: run.index, y, w: run[0].length, h: 1 }))),
      ...columns.flatMap((col, x) => [...col.matchAll(of)].map((run) => ({ x, y: run.index, w: 1, h: run[0].length }))),
    ];
  };
  const ink = runs(/#+/g);
  const g = MINIMAP_GLYPH.ring;
  return { ink, ring: [...ink.map((r) => ({ x: r.x - g, y: r.y - g, w: r.w + g * 2, h: r.h + g * 2 })), ...runs(/o+/g)] };
}

const GLYPHS = Object.fromEntries(
  Object.entries(GLYPH_ART).map(([kind, art]) => [kind, glyphRects(art)]),
) as Record<MinimapFixture["kind"], ReturnType<typeof glyphRects>>;

/**
 * A glyph's box at a scale, and from its seat px to the box's top-left and far side: the box's
 * middle on the seat px's middle where the box is odd, on its corner where it is even (FS-1SEF0 §B.9).
 */
function glyphBox(scale: number): { box: number; before: number; after: number } {
  const box = Math.round(MINIMAP_GLYPH.box * scale);
  const before = Math.floor(box / 2);
  return { box, before, after: box - before };
}

/**
 * How the layers draw in a mode: the panel they stand in (none for the overlay, which has no
 * backing, rim or bounds), the walls' line, the marks' scale, the fill's and line's alpha, and
 * where a world point falls about the layers' own origin.
 */
interface Drawing {
  panel: MinimapPanel | null;
  edge: number;
  marks: number;
  alpha: number;
  project: (p: Point) => Point;
}

function drawingFor(mode: MinimapMode, grid: RegionGrid): Drawing {
  if (mode !== "overlay") {
    const panel = minimapPanel(mode);
    return { panel, edge: panel.edge, marks: panel.marks, alpha: 1, project: minimapProjection(grid, panel) };
  }
  // the world's own projection, scaled about the world's origin; glyphs and dots at its own marks (§C.16)
  const k = MINIMAP_OVERLAY.scale;
  return {
    panel: null,
    edge: MINIMAP_OVERLAY.edge,
    marks: MINIMAP_OVERLAY.marks,
    alpha: MINIMAP_OVERLAY.alpha,
    project: (p) => {
      const s = worldToScreen(p.x, p.y);
      return { x: s.x * k, y: s.y * k };
    },
  };
}

/**
 * A projected point seated on a whole px, kept so that `before` px left of and above it and `after`
 * px right of and below it stay inside the rim; with no panel (the overlay), only seated, on the
 * grid of `perPx` px to a logical px (the render scale, for the overlay's dots).
 */
function seat(m: Point, before: number, after: number, panel: MinimapPanel | null, perPx = 1): Point {
  if (!panel) return { x: Math.round(m.x * perPx) / perPx, y: Math.round(m.y * perPx) / perPx };
  const inside = rimInside(panel);
  // whole px at both bounds too, since a scaled dot's reach is not always whole
  const clamp = (v: number, size: number) =>
    Math.min(Math.max(Math.round(v), Math.ceil(inside + before)), Math.floor(size - inside - after));
  return { x: clamp(m.x, panel.width), y: clamp(m.y, panel.height) };
}

/** What the map layer draws: the seen regions, either state alike (FS-56CKV §A.4), and the fixtures found. */
const contentKey = (c: MinimapContent) =>
  [
    c.regions.map((r) => r.id).join(","),
    c.fixtures.map((f) => `${f.kind}@${f.at.x},${f.at.y}`).join(","),
  ].join("|");

export class Minimap {
  /** Times the map layer was drawn (§E.23); the marks are drawn with it. */
  redraws = 0;
  /** Times the dot layer was drawn. */
  dotRedraws = 0;
  private readonly map: MinimapGraphics;
  /** The vignette, one image per panel size, each painted once (FS-1SEF0 §B.9). */
  private readonly vignettes: Record<"normal" | "enlarged", MinimapLayer>;
  private readonly marks: MinimapGraphics;
  private readonly dots: MinimapGraphics;
  private drawing: Drawing;
  private shownContent: MinimapContent = { regions: [], fixtures: [] };
  /** The party's places from the last broadcast: the panel modes' dots. */
  private shownParty?: MinimapParty;
  /** Where the party's figures were last drawn, given with the focus: the overlay's dots. */
  private drawnParty?: MinimapParty;
  /** The figure the overlay was last stood about, in world px. */
  private focus?: Point;
  /** Where {@link follow} last stood the overlay's layers, in world px: the figure's point on the backing grid. */
  private stood?: Point;
  /** Where the overlay's map and marks were last shown on screen, in backing px, and at what render scale. */
  private held?: Point & { scale: number };
  private readonly unhear: () => void;
  private drawn?: string;
  private dotsDrawn?: string;
  /** The backing px per logical px the marks were last drawn on: the overlay's grid (§C.16). */
  private marksPerPx = 1;
  private shownMode: MinimapMode = "normal";

  /**
   * `renderScale` reads the backing px per logical px now (`viewport.renderScale`), the grid the
   * overlay stands on, as every figure is drawn on it (ADR-0057).
   */
  constructor(
    stage: MinimapStage,
    private readonly grid: RegionGrid,
    private readonly renderScale: () => number = () => 1,
  ) {
    // made bottom to top: one depth draws in the order its objects were made (FS-56CKV §A.3)
    this.map = stage.graphics();
    const vignette = (mode: "normal" | "enlarged") => {
      const panel = minimapPanel(mode);
      const key = mode === "normal" ? VIGNETTE_TEXTURE : `${VIGNETTE_TEXTURE}@${panel.width}x${panel.height}`;
      return stage.canvasImage(key, panel.width, panel.height, vignettePainter(panel));
    };
    this.vignettes = { normal: vignette("normal"), enlarged: vignette("enlarged") };
    this.vignettes.enlarged.setVisible(false);
    this.marks = stage.graphics();
    this.dots = stage.graphics();
    this.drawing = drawingFor("normal", grid);
    for (const layer of this.layers()) {
      layer.setScrollFactor(0);
      layer.setDepth(MINIMAP.depth);
    }
    this.unhear = stage.frames?.((scroll) => this.hold(scroll)) ?? (() => {});
  }

  /** What the map layer shows now, each seen region with its state, though both are drawn alike. */
  get content(): MinimapContent {
    return this.shownContent;
  }

  /** How it is shown (FS-1SEF0 §A): M steps it through normal, enlarged and the overlay. */
  get mode(): MinimapMode {
    return this.shownMode;
  }

  /** The panel it holds in the top-right corner, or none while it is the overlay (FS-1SEF0 §C.20). */
  get panel(): { width: number; height: number } | null {
    const { panel } = this.drawing;
    return panel && { width: panel.width, height: panel.height };
  }

  /** Stands every layer at the panel's top-left (§E.20); nothing is redrawn. The overlay is stood by {@link follow}. */
  place(rect: Pick<Rect, "x" | "y">): void {
    if (!this.drawing.panel) return;
    for (const layer of this.layers()) layer.setPosition(rect.x, rect.y);
  }

  /**
   * The figure the camera follows is at world point `focus` now, and the party's figures are drawn
   * at `drawn` (FS-1SEF0 §C.14, §C.19). While it is the overlay, its layers stand in the world so
   * the figure's own point on the overlay lies on the figure: a world point p draws at about
   * (1 − scale)·iso(focus) + scale·iso(p). The layers stand at the figure's whole backing px less
   * its point's whole backing px on the overlay, each rounded once on the grid the figure is drawn
   * on (the render scale's, ADR-0057), so the map slides one way under a walking figure in steps of
   * a backing px, never back; and the overlay's dots are placed from these same drawn positions,
   * never a broadcast's, seated on that grid too, so a figure's dot lies on it frame after frame.
   * A move, never a redraw of the map; the dots redrawn only when one moves a whole backing px.
   * The map and marks are then held against the screen as each frame is set up ({@link hold}).
   */
  follow(focus: Point, drawn?: MinimapParty): void {
    this.focus = focus;
    if (drawn) this.drawnParty = drawn;
    if (this.drawing.panel) return;
    const s = worldToScreen(focus.x, focus.y);
    const k = MINIMAP_OVERLAY.scale;
    const r = this.perPx();
    const stand = (v: number) => (Math.round(v * r) - Math.round(v * k * r)) / r;
    this.stood = { x: stand(s.x), y: stand(s.y) };
    // a re-fit to another render scale: the glyphs onto the new backing grid, once
    if (r !== this.marksPerPx) this.drawMarks(this.shownContent.fixtures);
    for (const layer of this.drawnLayers()) layer.setPosition(this.stood.x, this.stood.y);
    if (drawn) this.drawDots(drawn);
  }

  /**
   * The overlay's map and marks held against the screen this frame, drawn at `scroll` (FS-1SEF0
   * §C.19). On screen the stand is the figure's backing px less its point's, and the figure, eased
   * toward 30 Hz broadcasts against the camera's lerp and floored scroll, steps a backing px or two
   * back and forth there as it walks; the map, sliding at 1/8 of the walk, would step back with
   * it. So on each axis they stay where they were shown while the stand is within the hold (two
   * backing px) of that, and otherwise go to within the hold of it: never back against a walk, even
   * under broadcast jitter, still on an axis it does not move, at most the hold off the figure's
   * point, on whole backing px. The dots stay on the stand, on their figures.
   */
  private hold(scroll: Point): void {
    if (this.drawing.panel || !this.stood) return;
    const r = this.perPx();
    const stand = { x: Math.round((this.stood.x - scroll.x) * r), y: Math.round((this.stood.y - scroll.y) * r) };
    const { hold } = MINIMAP_OVERLAY;
    const near = (shown: number, to: number) => Math.min(Math.max(shown, to - hold), to + hold);
    const held = this.held?.scale === r ? this.held : undefined;
    this.held = held ? { x: near(held.x, stand.x), y: near(held.y, stand.y), scale: r } : { ...stand, scale: r };
    for (const layer of [this.map, this.marks]) layer.setPosition(scroll.x + this.held.x / r, scroll.y + this.held.y / r);
  }

  /** Backing px per logical px now: the overlay's grid. */
  private perPx(): number {
    return this.renderScale() || 1;
  }

  /** The party's exploration and the floor's fixtures now; the map is redrawn only if what it shows changed. */
  show(state: (region: number) => ExplorationState, fixtures: readonly MinimapFixture[]): void {
    const content = minimapContent(this.grid, state, fixtures);
    this.shownContent = content;
    const key = contentKey(content);
    if (key === this.drawn) return;
    this.drawn = key;
    this.drawMap(content);
    this.drawMarks(content.fixtures);
  }

  /**
   * The party's places from this broadcast; the dots are redrawn only if one moved a whole px. The
   * overlay, once followed, places its dots where the figures are drawn instead ({@link follow}).
   */
  party(party: MinimapParty): void {
    this.shownParty = party;
    const shown = this.partyShown;
    if (shown) this.drawDots(shown);
  }

  /** Whose places the dots show: the broadcast's in a panel, the drawn figures' in the overlay once followed. */
  private get partyShown(): MinimapParty | undefined {
    return this.drawing.panel ? this.shownParty : (this.drawnParty ?? this.shownParty);
  }

  /**
   * The dots at `party`'s places, at the look in force, unless none has moved a whole px: a panel's
   * logical px, or the overlay's backing px, where the figures stand.
   */
  private drawDots(party: MinimapParty): void {
    const { marks: k, project, panel } = this.drawing;
    const perPx = panel ? 1 : this.perPx();
    const at = (p: Point, radius: number) => {
      const reach = (radius + DOT.outline) * k;
      return seat(project(p), reach, reach, panel, perPx);
    };
    const allies = party.allies.map((p) => at(p, DOT.ally));
    const self = party.self ? at(party.self, DOT.self) : undefined;
    const key = [...allies, ...(self ? [self] : [])].map((p) => `${p.x},${p.y}`).join(";") + (self ? "s" : "");
    if (key === this.dotsDrawn) return;
    this.dotsDrawn = key;
    this.dotRedraws++;
    const g = this.dots;
    g.clear();
    for (const p of allies) this.dot(p, DOT.ally, palette.markerAlly);
    // the local player's over the rest
    if (self) this.dot(self, DOT.self, palette.markerSelf);
  }

  /**
   * Shown as `mode` from now (FS-1SEF0 §A), each drawn layer redrawn once for it: normal or
   * enlarged, HUD at that panel's size, its vignette shown in place of the other's (§B.9, §B.10);
   * the overlay, in the world under the HUD, no vignette, stood about the figure last followed (§C).
   */
  setMode(mode: MinimapMode): void {
    if (mode === this.shownMode) return;
    this.shownMode = mode;
    this.drawing = drawingFor(mode, this.grid);
    this.vignettes.normal.setVisible(mode === "normal");
    this.vignettes.enlarged.setVisible(mode === "enlarged");
    const overlay = mode === "overlay";
    for (const layer of this.drawnLayers()) {
      layer.setScrollFactor(overlay ? 1 : 0);
      layer.setDepth(overlay ? MINIMAP_OVERLAY.depth : MINIMAP.depth);
    }
    this.redraw();
    // nothing held from an overlay shown before: it starts on the stand
    this.held = undefined;
    this.stood = undefined;
    if (overlay && this.focus) this.follow(this.focus);
  }

  destroy(): void {
    this.unhear();
    for (const layer of this.layers()) layer.destroy();
  }

  private layers(): MinimapLayer[] {
    return [this.map, this.vignettes.normal, this.vignettes.enlarged, this.marks, this.dots];
  }

  /** The layers drawn in every mode, the overlay's: the map, the marks and the dots, bottom to top. */
  private drawnLayers(): MinimapGraphics[] {
    return [this.map, this.marks, this.dots];
  }

  /** Every drawn layer again, as it shows now, at the look in force. */
  private redraw(): void {
    this.drawn = contentKey(this.shownContent);
    this.drawMap(this.shownContent);
    this.drawMarks(this.shownContent.fixtures);
    this.dotsDrawn = undefined;
    const party = this.partyShown;
    if (party) this.drawDots(party);
  }

  /**
   * The panel, the seen regions' one fill, then the walls' outline (FS-56CKV §A.1, §A.4, §A.5); the
   * overlay has no panel, and its fill and line are see-through (FS-1SEF0 §C.13, §C.16).
   */
  private drawMap(content: MinimapContent): void {
    this.redraws++;
    const g = this.map;
    const { panel, edge, alpha, project } = this.drawing;
    g.clear();
    if (panel) {
      g.fillStyle(palette.hudPanel, PANEL.alpha);
      g.fillRect(0, 0, panel.width, panel.height);
      g.lineStyle(panel.rim, palette.frame, PANEL.rimAlpha);
      g.strokeRect(0, 0, panel.width, panel.height);
    }

    const c = this.grid.cell;
    const cellPoint = (p: Point) => project({ x: p.x * c, y: p.y * c });
    // every seen region alike, explored or visible: the one the party stands in is not lit up
    if (content.regions.length > 0) g.fillStyle(palette.minimapExplored, alpha);
    // each cell rect's footprint, projected: a parallelogram, as the floor lies on screen
    for (const r of content.regions)
      for (const { x, y, w, h } of r.cells)
        g.fillPoints(
          [
            cellPoint({ x, y }),
            cellPoint({ x: x + w, y }),
            cellPoint({ x: x + w, y: y + h }),
            cellPoint({ x, y: y + h }),
          ],
          true,
        );

    // one line along the seen regions' walls (FS-56CKV §A.5): a loop closed so no corner is left
    // open, a run that stops at a gap left open
    const runs = regionOutline(this.grid, content.regions);
    if (runs.length === 0) return;
    g.lineStyle(edge, palette.minimapEdge, alpha);
    g.beginPath();
    for (const { points, closed } of runs) {
      const [first, ...rest] = points;
      const a = cellPoint(first);
      g.moveTo(a.x, a.y);
      for (const q of rest) {
        const b = cellPoint(q);
        g.lineTo(b.x, b.y);
      }
      if (closed) g.closePath();
    }
    g.strokePath();
  }

  /**
   * Each found fixture's glyph, its ring first and its ink over it (FS-56CKV §A.6). At a larger
   * scale each of the glyph's px is the whole-px span its edges round to (FS-1SEF0 §B.9): nearest
   * neighbour, every edge on a whole logical px; on the overlay, on a whole backing px at the
   * render scale of now, the grid it stands on (§C.16).
   */
  private drawMarks(fixtures: readonly MinimapFixture[]): void {
    const g = this.marks;
    const { marks: k, project, panel } = this.drawing;
    const r = panel ? 1 : this.perPx();
    this.marksPerPx = r;
    // the glyph in grid px: logical in a panel, backing on the overlay
    const q = k * r;
    const { before, after } = glyphBox(q);
    g.clear();
    for (const f of fixtures) {
      const p = seat(project(f.at), before / r, after / r, panel, r);
      const ox = p.x - before / r;
      const oy = p.y - before / r;
      // a rect in the glyph's own px, the ink a ring's width in from the box's corner
      const fill = (px: PxRect) => {
        const [x0, y0] = [px.x + MINIMAP_GLYPH.ring, px.y + MINIMAP_GLYPH.ring];
        const [x1, y1] = [x0 + px.w, y0 + px.h];
        const [sx, sy] = [Math.round(x0 * q), Math.round(y0 * q)];
        g.fillRect(ox + sx / r, oy + sy / r, (Math.round(x1 * q) - sx) / r, (Math.round(y1 * q) - sy) / r);
      };
      const { ring, ink } = GLYPHS[f.kind];
      g.fillStyle(palette.markerStroke, 1);
      ring.forEach(fill);
      g.fillStyle(palette.interactable, 1);
      ink.forEach(fill);
    }
  }

  private dot(p: Point, radius: number, colour: number): void {
    const k = this.drawing.marks;
    this.dots.fillStyle(palette.markerStroke, 1);
    this.dots.fillCircle(p.x, p.y, (radius + DOT.outline) * k);
    this.dots.fillStyle(colour, 1);
    this.dots.fillCircle(p.x, p.y, radius * k);
  }
}
