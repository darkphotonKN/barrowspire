/**
 * The static vignette's shape (FS-W6BP1, kept by FS-2325V §C.10): a radial darkening from the
 * canvas centre, drawn by `src/utils/atmosphere.ts`. Its numbers live here so the readability
 * floor can measure what the vignette does at the canvas edge without drawing it.
 */

/**
 * Depths of the atmosphere (`src/utils/atmosphere.ts`): above the world and its light-map, below
 * the hostile markers (`src/render/markers/`) and the HUD at 1000.
 */
export const DUST_DEPTH = 902;
export const VIGNETTE_DEPTH = 905;

/** Where the darkening starts and ends, as fractions of the canvas's shorter and longer side. */
export const VIGNETTE_INNER = 0.3;
export const VIGNETTE_OUTER = 0.72;

/** Gradient stops: [position 0..1 from inner to outer radius, alpha of the dark]. */
export const VIGNETTE_STOPS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.7, 0.5],
  [1, 0.86],
];

/** The vignette's alpha at a distance from the canvas centre, in px. */
export function vignetteAlphaAt(
  distance: number,
  width: number,
  height: number,
): number {
  const inner = VIGNETTE_INNER * Math.min(width, height);
  const outer = VIGNETTE_OUTER * Math.max(width, height);
  const t = Math.min(1, Math.max(0, (distance - inner) / (outer - inner)));
  for (let i = 1; i < VIGNETTE_STOPS.length; i++) {
    const [p0, a0] = VIGNETTE_STOPS[i - 1];
    const [p1, a1] = VIGNETTE_STOPS[i];
    if (t <= p1) return a0 + ((t - p0) / (p1 - p0)) * (a1 - a0);
  }
  return VIGNETTE_STOPS[VIGNETTE_STOPS.length - 1][1];
}

/**
 * The vignette's alpha at the darkest point of the canvas edge a hostile walks in from: the
 * middle of the edge furthest from the centre. (Corners are darker still, but nothing enters
 * through a single pixel.)
 */
export function edgeVignetteAlpha(width: number, height: number): number {
  return vignetteAlphaAt(Math.max(width, height) / 2, width, height);
}
