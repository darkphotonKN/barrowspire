/**
 * A field's map (FS-P0HSP §B, §C.16, §D; CONTEXT.md "Charted ground"): only its charted ground
 * shows, in the one fill; its edge the walls' line where charted, open at the road home's gap; its
 * keep-outs (tree stands, rocks) solid in the walls' ink where they lie on charted ground; each
 * gate's teleport mark once the cell it stands in is charted. Uncharted ground draws nothing, and
 * where charted meets uncharted there is no line. Pure: the minimap draws what this returns.
 */

import type { Point } from "@/render/iso/projection";
import type { GateState, WallState } from "@/types/gameState";
import { FIELD_CHART, type FieldChart } from "./fieldChart";
import type { MinimapMark, MinimapPicture } from "./minimap";
import { edgeRuns, roadGaps, type SideSpans, type WorldRect, type WorldSize } from "./worldMap";

/** What of a field's state its map is built from. */
export interface FieldState {
  walls: readonly WallState[];
  gates: readonly Pick<GateState, "position" | "range">[];
}

const corners = (r: WorldRect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

/** Where two world rects overlap, if they do. */
function overlap(a: WorldRect, b: WorldRect): WorldRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** The charted stretches of each side of the field: its edge cells that are charted (§B.7, §D.22). */
function chartedEdge(chart: FieldChart, size: WorldSize): SideSpans {
  const { cell } = FIELD_CHART;
  const spans = (count: number, length: number, charted: (i: number) => boolean) => {
    const out: [number, number][] = [];
    for (let i = 0; i < count; i++) if (charted(i)) out.push([i * cell, Math.min((i + 1) * cell, length)]);
    return out;
  };
  return {
    north: spans(chart.cols, size.width, (cx) => chart.charted(cx, 0)),
    south: spans(chart.cols, size.width, (cx) => chart.charted(cx, chart.rows - 1)),
    west: spans(chart.rows, size.height, (cy) => chart.charted(0, cy)),
    east: spans(chart.rows, size.height, (cy) => chart.charted(chart.cols - 1, cy)),
  };
}

/** A field's map from its chart and its state's walls and gates, at its size. */
export function fieldMap(chart: FieldChart, field: FieldState, size: WorldSize): MinimapPicture {
  const { cell } = FIELD_CHART;
  const runs = chart.runs();
  const marks: MinimapMark[] = field.gates
    .filter((g) => chart.charted(Math.floor(g.position.x / cell), Math.floor(g.position.y / cell)))
    .map((g) => ({ kind: "teleport", at: { x: g.position.x, y: g.position.y } }));
  const keepOuts = field.walls.map((w): WorldRect => ({ x: w.position.x, y: w.position.y, width: w.width, height: w.height }));
  return {
    key: [chart.version, field.walls.map((w) => w.entity_id).join(","), marks.map((m) => `${m.at.x},${m.at.y}`).join(",")].join("|"),
    ground: runs.map(corners),
    // each keep-out cut to the charted runs it lies on (§B.10)
    solids: () =>
      keepOuts.flatMap((k) =>
        runs.flatMap((r) => {
          const part = overlap(k, r);
          return part ? [corners(part)] : [];
        }),
      ),
    lines: edgeRuns(size, roadGaps(size, field.gates), chartedEdge(chart, size)),
    marks,
  };
}
