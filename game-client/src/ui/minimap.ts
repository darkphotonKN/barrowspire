/**
 * The minimap (FS-SRA9J §E, ADR-0063; CONTEXT.md "Minimap"): the top-right HUD map of a dungeon
 * floor. The floor in the world's own iso projection, fitted to 216 × 108 logical px on the HUD's
 * panel (design-guideline "UI Chrome": a `hudPanel` backing, a 1px brass rim, as the target frame
 * wears it), showing the explored and visible regions, a dot per living party member, and the
 * switch, escape door and stairs once their region is explored. Nothing else: no unexplored region,
 * no monster, no container or drop pile, no room role (roles are not on the wire). Colours are
 * tokens only (ADR-0013).
 *
 * **Two layers, each redrawn only when it changes** (§E.23). The map (backing, regions, marks) is
 * keyed by every region's state and the marks found; the party's dots, which move all the time,
 * are a layer of their own keyed by their whole-px places. Both are drawn about the panel's own
 * top-left and stood where it is placed, so a re-layout moves them without a redraw.
 *
 * **Pixel rounding** is the viewport's (ADR-0057: every object renders `fullAuto`); the panel stands
 * on whole logical px and the dots are seated on them, so the rim and the dots stay crisp at render
 * scales 1, 1.5 and 2. Everything is fitted inside the panel, so no mask is needed.
 *
 * Draws through {@link MinimapStage}, the narrow slice of Phaser it needs. Pure otherwise.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { projectedBounds, worldToScreen, type Point, type Rect } from "@/render/iso/projection";
import type { RegionGrid } from "@/render/world/dungeon";
import { regionAt, type ExplorationState } from "@/render/world/exploration";
import type { FloorRegion } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";

export const MINIMAP = {
  /** The panel, in logical px (§E.21). */
  width: 216,
  height: 108,
  /** From the floor indicator's bottom to the panel's top (§E.20). */
  gap: 6,
  /** From the rim to the floor's fit, each side. */
  inset: 4,
  /** The HUD band, the floor indicator's: over the arrival card (960), under the overlays. */
  depth: 1000,
} as const;

/** The panel's backing and rim: the target frame's (FS-48CTQ), the HUD's look. */
const PANEL = { alpha: 0.85, rim: 1, rimAlpha: 0.6 } as const;
/** Dot radii, logical px: the local player's larger, so it reads apart from the allies' (§E.22). */
const DOT = { self: 3, ally: 2, outline: 1 } as const;
/** A found fixture's mark: its half-size, logical px. */
const MARK = 2;

/** Where the minimap stands (§E.20): its right edge on the column's, its top `gap` under the floor indicator. */
export function minimapRect(right: number, floorBottom: number): Rect {
  return {
    x: Math.round(right) - MINIMAP.width,
    y: Math.round(floorBottom) + MINIMAP.gap,
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

/** Where the party's living, in-play members stand (§E.22): this client's player apart. */
export interface MinimapParty {
  self?: Point;
  allies: readonly Point[];
}

/** What of a Phaser Graphics the minimap draws with. */
export interface MinimapGraphics {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setScrollFactor(factor: number): unknown;
  setVisible(visible: boolean): unknown;
  destroy(): void;
}

/** What the minimap asks of the scene: `this.add.graphics`, in effect. */
export interface MinimapStage {
  graphics(): MinimapGraphics;
}

const contentKey = (c: MinimapContent) =>
  [
    c.regions.map((r) => `${r.id}${r.state[0]}`).join(","),
    c.fixtures.map((f) => `${f.kind}@${f.at.x},${f.at.y}`).join(","),
  ].join("|");

export class Minimap {
  /** Times the map layer was drawn (§E.23). */
  redraws = 0;
  /** Times the dot layer was drawn. */
  dotRedraws = 0;
  private readonly map: MinimapGraphics;
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
    this.map = stage.graphics();
    this.dots = stage.graphics();
    this.project = minimapProjection(grid);
    for (const layer of this.layers()) {
      layer.setScrollFactor(0);
      layer.setDepth(MINIMAP.depth);
    }
  }

  /** What the map layer shows now. */
  get content(): MinimapContent {
    return this.shownContent;
  }

  /** Whether it is up (M, §E.19). */
  get shown(): boolean {
    return this.on;
  }

  /** Stands both layers at the panel's top-left (§E.20); nothing is redrawn. */
  place(rect: Pick<Rect, "x" | "y">): void {
    for (const layer of this.layers()) layer.setPosition(rect.x, rect.y);
  }

  /** The party's exploration and the floor's fixtures now; the map is redrawn only if what it shows changed. */
  show(state: (region: number) => ExplorationState, fixtures: readonly MinimapFixture[]): void {
    const content = minimapContent(this.grid, state, fixtures);
    const key = contentKey(content);
    if (key === this.drawn) return;
    this.drawn = key;
    this.shownContent = content;
    this.drawMap(content);
  }

  /** The party's places now; the dots are redrawn only if one moved a whole px. */
  party(party: MinimapParty): void {
    const seat = (p: Point) => {
      const m = this.project(p);
      return { x: Math.round(m.x), y: Math.round(m.y) };
    };
    const allies = party.allies.map(seat);
    const self = party.self ? seat(party.self) : undefined;
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

  private layers(): MinimapGraphics[] {
    return [this.map, this.dots];
  }

  private drawMap(content: MinimapContent): void {
    this.redraws++;
    const g = this.map;
    g.clear();
    g.fillStyle(palette.hudPanel, PANEL.alpha);
    g.fillRect(0, 0, MINIMAP.width, MINIMAP.height);
    g.lineStyle(PANEL.rim, palette.frame, PANEL.rimAlpha);
    g.strokeRect(0, 0, MINIMAP.width, MINIMAP.height);

    const c = this.grid.cell;
    for (const [state, colour] of [
      ["explored", palette.minimapExplored],
      ["visible", palette.minimapVisible],
    ] as const) {
      const regions = content.regions.filter((r) => r.state === state);
      if (regions.length === 0) continue;
      g.fillStyle(colour, 1);
      // each cell rect's footprint, projected: a parallelogram, as the floor lies on screen
      for (const r of regions)
        for (const { x, y, w, h } of r.cells)
          g.fillPoints(
            [
              this.project({ x: x * c, y: y * c }),
              this.project({ x: (x + w) * c, y: y * c }),
              this.project({ x: (x + w) * c, y: (y + h) * c }),
              this.project({ x: x * c, y: (y + h) * c }),
            ],
            true,
          );
    }

    for (const f of content.fixtures) {
      const m = this.project(f.at);
      const p = { x: Math.round(m.x), y: Math.round(m.y) };
      g.fillStyle(palette.markerStroke, 1);
      g.fillRect(p.x - MARK - 1, p.y - MARK - 1, MARK * 2 + 2, MARK * 2 + 2);
      g.fillStyle(palette.interactable, 1);
      g.fillRect(p.x - MARK, p.y - MARK, MARK * 2, MARK * 2);
    }
  }

  private dot(p: Point, radius: number, colour: number): void {
    this.dots.fillStyle(palette.markerStroke, 1);
    this.dots.fillCircle(p.x, p.y, radius + DOT.outline);
    this.dots.fillStyle(colour, 1);
    this.dots.fillCircle(p.x, p.y, radius);
  }
}
