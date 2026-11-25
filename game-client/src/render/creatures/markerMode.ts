/**
 * How monsters are marked, per world and floor (FS-48CTQ §A.1–2; ADR-0061 Decision 12): with
 * plates and bars over every head (`overhead`, FS-77AB6 §37–39), or with none and the one target
 * frame at the top centre (`frame`). A floor opts in by an entry here and nothing else; a world or
 * floor the table does not name keeps `overhead`. No floor opts in today (§ Change: Floor 1 carries
 * overhead markers; no floor uses the target frame, 24–26).
 */

/** `overhead`: plates and bars over every monster. `frame`: none, and the top-centre target frame. */
export type MarkerMode = "overhead" | "frame";

/** The worlds a state comes from (`ClientGameState.world_type`). */
export type MarkerWorld = "hub" | "run" | "field";

/** Each world's floors that differ from `overhead`. */
export type MarkerModes = Readonly<
  Partial<Record<MarkerWorld, Readonly<Record<number, MarkerMode>>>>
>;

/**
 * The table: no floor uses the frame (owner, 2026-11-25: floor 1 as floor 2, reversing 2026-11-06's
 * "floor 1 only"). A later floor opts in as `{ run: { 4: "frame" } }` would.
 */
export const MARKER_MODES: MarkerModes = {};

/** The marker mode of `world`'s `floor` (a world without floors passes none). */
export function markerMode(
  world: MarkerWorld,
  floor: number | undefined,
  table: MarkerModes = MARKER_MODES,
): MarkerMode {
  if (floor === undefined) return "overhead";
  return table[world]?.[floor] ?? "overhead";
}
