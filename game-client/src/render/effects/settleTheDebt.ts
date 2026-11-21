/**
 * Settle the Debt (FS-04EEA §H R46): the mercenary's flurry, played on his own send (R42), never broadcast.
 * A run of slashes all round him, each the table's `flurrySlash` laid on the ground at his feet and turned
 * out along its own line to 90 world px, struck one after another across {@link FLURRY}`.spanMs` whatever their
 * number, so a heavier flurry is denser, not longer, and its cuts stand round him at once. They share the circle evenly,
 * struck in a scattered order ({@link cutOrder}) so they jump all round rather than sweep in a circle.
 *
 * Heavier the more parry charges were spent, *n* read from the latest state at the send ({@link flurryWeight}):
 * more cuts, and from 3 the ground kicked up in dust (`flurryDust`), and at 5 a brass flash as the last cut
 * lands (`flurryFlare`), so 1, 3 and 5 each read distinctly. Timed on a {@link Staged} the caller owns, so a
 * floor change or a teardown cancels the cuts still to come. Existing fx textures only (R48).
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";
import { swingLayer } from "./slash";
import type { Staged } from "./staged";
import type { EffectName } from "./table";

/** The flurry's numbers, world px and ms. *Starting values,* through the contact sheet. */
export const FLURRY = {
  /** How far round him the cuts reach: the server's 90 px (§F). */
  reach: 90,
  /** From the first cut to the last, whatever their number: shorter than a cut's own 200 ms life. */
  spanMs: 180,
  /** Screen px above the feet the 5-charge flash stands: his chest. */
  flareLift: 32,
  /** The parry charges a flurry is drawn for, at most: a Sellsword's full count (FS-E1ZDG). */
  maxCharges: 5,
} as const;

/**
 * The order `k` cuts evenly round the circle are struck in: each a little over half the circle on from the
 * last, so the flurry jumps from side to side and still lands every cut once.
 */
export function cutOrder(k: number): number[] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let step = Math.floor(k / 2) + 1;
  while (step < k && gcd(step, k) !== 1) step++;
  return Array.from({ length: k }, (_, i) => (i * step) % k);
}

/** How heavy a flurry of a given count is drawn. */
export interface FlurryWeight {
  slashes: number;
  dust: boolean;
  flare: boolean;
}

/**
 * The flurry for `charges` parry charges spent: two cuts a charge and two more, dust from 3 and the flash at
 * 5. A count the client could not have sent on (0) draws as 1; past 5 as 5.
 */
export function flurryWeight(charges: number): FlurryWeight {
  const n = Math.min(FLURRY.maxCharges, Math.max(1, Math.round(charges)));
  return { slashes: 2 + 2 * n, dust: n >= 3, flare: n >= 5 };
}

/** Every table entry the flurry plays, for the palette check. */
export const SETTLE_THE_DEBT_EFFECTS = [
  "flurrySlash",
  "flurryDust",
  "flurryFlare",
] as const satisfies readonly EffectName[];

/** Plays the flurry round a mercenary standing at world point `at`, for `charges` parry charges spent. */
export function playSettleTheDebt(
  fx: Pick<EffectsRuntime, "play">,
  steps: Pick<Staged, "at">,
  owner: OwnerKey,
  at: Point,
  charges: number,
): void {
  const feet = { x: at.x, y: at.y };
  const weight = flurryWeight(charges);
  if (weight.dust) fx.play(owner, "flurryDust", feet);
  const k = weight.slashes;
  const gapMs = k > 1 ? FLURRY.spanMs / (k - 1) : 0;
  cutOrder(k).forEach((slot, i) => {
    // half a slot off the axes, so no cut lies along the iso grid
    const rotation = ((slot + 0.5) / k) * Math.PI * 2;
    const toward = { x: feet.x + Math.cos(rotation) * FLURRY.reach, y: feet.y + Math.sin(rotation) * FLURRY.reach };
    // over him and over whatever stands on its line, as every swing laid at the feet sorts
    const layer = swingLayer(feet, toward);
    steps.at(i * gapMs, () => fx.play(owner, "flurrySlash", feet, { rotation, layer }));
  });
  if (weight.flare) steps.at(FLURRY.spanMs, () => fx.play(owner, "flurryFlare", feet, { lift: FLURRY.flareLift }));
}
