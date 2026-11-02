/**
 * Whether the run scene draws its debug position readout (the tile x/y line at the top-left
 * of the canvas). It is a developer aid, not player HUD: `next dev` shows it and `next build`
 * leaves it out, because Next.js inlines `process.env.NODE_ENV` at build time.
 *
 * `NEXT_PUBLIC_SHOW_POSITION_READOUT` overrides that either way ("true"/"1" shows it on a
 * production build, "false"/"0" hides it in dev). Like every `NEXT_PUBLIC_*` value it is
 * baked in at build time, so changing it means rebuilding.
 */
export function showsPositionReadout(): boolean {
  const override = process.env.NEXT_PUBLIC_SHOW_POSITION_READOUT?.trim().toLowerCase();
  if (override === "true" || override === "1") return true;
  if (override === "false" || override === "0") return false;
  return process.env.NODE_ENV !== "production";
}
