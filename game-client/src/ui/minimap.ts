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
 * (the one the party stands in no lighter), the seen rooms outlined along their walls, open at every doorway, never a corridor; a soft `inkDeep` vignette strongest at
 * the rim's inside edge; the switch, escape door and stairs as small amber glyphs on a dark ring;
 * the party's dots, each ringed. Nothing warm in the middle: amber in the HUD means "interactable".
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
 * Draws through {@link MinimapStage}, the narrow slice of Phaser it needs. Pure otherwise.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { projectedBounds, worldToScreen, type Point, type Rect } from "@/render/iso/projection";
import type { RegionGrid } from "@/render/world/dungeon";
import { regionAt, type ExplorationState } from "@/render/world/exploration";
import type { FloorRegion } from "@/types/gameState";
import { palette, rgba } from "@/utils/canvasPalette";

export const MINIMAP = {
  /** The panel, in logical px (§E.21). */
  width: 216,
  height: 108,
  /** From the panel's bottom to the floor indicator's top under it (FS-56CKV §B.9). */
  gap: 6,
  /** From the rim to the floor's fit, each side. */
  inset: 4,
  /** The HUD band, the floor indicator's: over the arrival card (960), under the overlays. */
  depth: 1000,
} as const;

/** The panel's backing and rim: the target frame's (FS-48CTQ), the HUD's look; unchanged (FS-56CKV §A.1). */
const PANEL = { alpha: 0.85, rim: 1, rimAlpha: 0.6 } as const;
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

/** The outline along the seen rooms' walls (FS-56CKV §A.5): its width, logical px, in `palette.minimapEdge`. */
export const MINIMAP_EDGE = { width: 1 } as const;

/**
 * A found fixture's glyph (FS-56CKV §A.6): its ink a 7 × 7 px shape in `palette.interactable`, on a
 * 1 px `palette.markerStroke` ring round the shape, the whole a `box` px square seated on the px
 * where the old 4 px mark was centred.
 */
export const MINIMAP_GLYPH = { ink: 7, ring: 1, box: 9 } as const;

/** Where the minimap stands (§E.20, FS-56CKV §B.9): its right edge on the column's, its top the column's top. */
export function minimapRect(right: number, top: number): Rect {
  return {
    x: Math.round(right) - MINIMAP.width,
    y: Math.round(top),
    width: MINIMAP.width,
    height: MINIMAP.height,
  };
}

/**
 * A world point on the panel (§E.21), about its top-left: the whole floor's iso diamond, scaled to
 * fit inside the inset, centred. Floor 1's 72 × 48 cells project 2:1 and fill the height.
 */
export function minimapProjection(grid: RegionGrid): (p: Point) => Point {
  const bounds = projectedBounds(grid.cols * grid.cell, grid.rows * grid.cell);
  const k = Math.min(
    (MINIMAP.width - MINIMAP.inset * 2) / bounds.width,
    (MINIMAP.height - MINIMAP.inset * 2) / bounds.height,
  );
  const ox = (MINIMAP.width - bounds.width * k) / 2 - bounds.x * k;
  const oy = (MINIMAP.height - bounds.height * k) / 2 - bounds.y * k;
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

/** A run of the rooms' outline (FS-56CKV §A.5), in cell units: its corner points, and whether its last point joins back to its first. */
export interface OutlineRun {
  points: Point[];
  closed: boolean;
}

/**
 * The seen rooms' walls (FS-56CKV §A.5), in cell units: every side of a seen room's cell that faces
 * a cell of no region (shell or void, or off the grid), from the whole floor's regions in `grid`. A
 * side facing a cell of another region is a doorway and gets no line, whatever that region's kind
 * and whether or not it is seen; a corridor's sides get no line, nor a cell rect's side inside a
 * region. Each side once, joined into runs that turn every corner unbroken: a closed loop where a
 * room's wall goes all the way round, an open run where it stops at a doorway.
 */
export function regionOutline(grid: RegionGrid, seen: readonly Pick<MinimapContent["regions"][number], "id" | "cells">[]): OutlineRun[] {
  // walkable: in a region of the floor, seen or not, so a doorway opens before the path beyond is seen
  const walkable = (cx: number, cy: number) => grid.region(cx, cy) !== 0;
  // each unit side, directed clockwise round the room (y down), by the corner it leaves
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
          if (grid.region(cx, cy) !== id || grid.kind(cx, cy) !== "room") continue;
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
  // a room's edge stopping at a doorway: a run starts where more sides leave a corner than reach it,
  // and ends where none is left to leave by
  for (const [k, nexts] of out) {
    let surplus = nexts.length - (into.get(k) ?? 0);
    for (; surplus > 0 && nexts.length > 0; surplus--) runs.push({ points: walk(k), closed: false });
  }
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
}

/**
 * The vignette (FS-56CKV §A.2): a band in from each side of the rim's inside edge, each a linear
 * gradient of `inkDeep` from its edge alpha to nothing at its reach; where two bands meet in a
 * corner they compound, as a candle's shadow does. Nothing is painted on or outside the rim.
 */
const paintVignette: CanvasPaint = (ctx, w, h) => {
  const { reach, edgeAlpha, ease } = MINIMAP_VIGNETTE;
  const r = PANEL.rim;
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

/** From a glyph's seat px to its box's top-left and its far side: the box sits on the seat px's middle. */
const GLYPH_BEFORE = (MINIMAP_GLYPH.box - 1) / 2;
const GLYPH_AFTER = MINIMAP_GLYPH.box - GLYPH_BEFORE;

/** A projected point seated on a whole px, kept so that `before` px left of and above it and `after` px right of and below it stay inside the rim. */
function seat(m: Point, before: number, after: number): Point {
  const clamp = (v: number, size: number) =>
    Math.min(Math.max(Math.round(v), PANEL.rim + before), size - PANEL.rim - after);
  return { x: clamp(m.x, MINIMAP.width), y: clamp(m.y, MINIMAP.height) };
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
  private readonly vignette: MinimapLayer;
  private readonly marks: MinimapGraphics;
  private readonly dots: MinimapGraphics;
  private readonly project: (p: Point) => Point;
  private shownContent: MinimapContent = { regions: [], fixtures: [] };
  private drawn?: string;
  private dotsDrawn?: string;
  private on = true;

  constructor(
    stage: MinimapStage,
    private readonly grid: RegionGrid,
  ) {
    // made bottom to top: one depth draws in the order its objects were made (FS-56CKV §A.3)
    this.map = stage.graphics();
    this.vignette = stage.canvasImage(VIGNETTE_TEXTURE, MINIMAP.width, MINIMAP.height, paintVignette);
    this.marks = stage.graphics();
    this.dots = stage.graphics();
    this.project = minimapProjection(grid);
    for (const layer of this.layers()) {
      layer.setScrollFactor(0);
      layer.setDepth(MINIMAP.depth);
    }
  }

  /** What the map layer shows now, each seen region with its state, though both are drawn alike. */
  get content(): MinimapContent {
    return this.shownContent;
  }

  /** Whether it is up (M, §E.19). */
  get shown(): boolean {
    return this.on;
  }

  /** Stands every layer at the panel's top-left (§E.20); nothing is redrawn. */
  place(rect: Pick<Rect, "x" | "y">): void {
    for (const layer of this.layers()) layer.setPosition(rect.x, rect.y);
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

  /** The party's places now; the dots are redrawn only if one moved a whole px. */
  party(party: MinimapParty): void {
    const at = (p: Point, radius: number) => {
      const reach = radius + DOT.outline;
      return seat(this.project(p), reach, reach);
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

  setShown(on: boolean): void {
    this.on = on;
    for (const layer of this.layers()) layer.setVisible(on);
  }

  destroy(): void {
    for (const layer of this.layers()) layer.destroy();
  }

  private layers(): MinimapLayer[] {
    return [this.map, this.vignette, this.marks, this.dots];
  }

  /** The panel, the seen regions' one fill, then the rooms' outline (FS-56CKV §A.1, §A.4, §A.5). */
  private drawMap(content: MinimapContent): void {
    this.redraws++;
    const g = this.map;
    g.clear();
    g.fillStyle(palette.hudPanel, PANEL.alpha);
    g.fillRect(0, 0, MINIMAP.width, MINIMAP.height);
    g.lineStyle(PANEL.rim, palette.frame, PANEL.rimAlpha);
    g.strokeRect(0, 0, MINIMAP.width, MINIMAP.height);

    const c = this.grid.cell;
    const cellPoint = (p: Point) => this.project({ x: p.x * c, y: p.y * c });
    // every seen region alike, explored or visible: the one the party stands in is not lit up
    if (content.regions.length > 0) g.fillStyle(palette.minimapExplored, 1);
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

    // one line along the seen rooms' walls (FS-56CKV §A.5): a loop closed so no corner is left
    // open, a run that stops at a doorway left open
    const runs = regionOutline(this.grid, content.regions);
    if (runs.length === 0) return;
    g.lineStyle(MINIMAP_EDGE.width, palette.minimapEdge, 1);
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

  /** Each found fixture's glyph, its ring first and its ink over it (FS-56CKV §A.6). */
  private drawMarks(fixtures: readonly MinimapFixture[]): void {
    const g = this.marks;
    g.clear();
    for (const f of fixtures) {
      const p = seat(this.project(f.at), GLYPH_BEFORE, GLYPH_AFTER);
      // the ink's 7 × 7 box, a ring's width in from the glyph's
      const ox = p.x - GLYPH_BEFORE + MINIMAP_GLYPH.ring;
      const oy = p.y - GLYPH_BEFORE + MINIMAP_GLYPH.ring;
      const { ring, ink } = GLYPHS[f.kind];
      g.fillStyle(palette.markerStroke, 1);
      for (const r of ring) g.fillRect(ox + r.x, oy + r.y, r.w, r.h);
      g.fillStyle(palette.interactable, 1);
      for (const r of ink) g.fillRect(ox + r.x, oy + r.y, r.w, r.h);
    }
  }

  private dot(p: Point, radius: number, colour: number): void {
    this.dots.fillStyle(palette.markerStroke, 1);
    this.dots.fillCircle(p.x, p.y, radius + DOT.outline);
    this.dots.fillStyle(colour, 1);
    this.dots.fillCircle(p.x, p.y, radius);
  }
}
