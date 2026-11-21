/**
 * Earthbreaker (FS-04EEA §H R43): the warrior's ground slam, played on their own send (R42), never
 * broadcast. Every piece is a table entry laid flat on world points round the feet, so the whole slam is
 * drawn in the iso projection as the ground is:
 *
 * - at once, the crater at the feet (`earthbreakerSlam`) and the blow's tight ring with its dust
 *   (`earthbreakerRing`), and the cracks starting out from the crater (`earthbreakerCrack`);
 * - the shock ring opening out to 90 world px: three rings struck one after another, each of four
 *   quarter-bands (`earthbreakerBandNear`, `Mid`, `Far`), the warrior's steel smear being an arc round its
 *   pivot; then dust kicked outward where it dies out at 90 (`earthbreakerShock`).
 *
 * Timed on a {@link Staged} the caller owns, so a floor change or a teardown cancels what is still to come.
 * Existing fx textures only (R48): the scorch, the ring, the smear, the dust and the glint's rays.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";
import type { Staged } from "./staged";
import type { EffectName } from "./table";

/** The shock's rings, nearest first, world px: the band entry drawn at each, its scale fixed to that reach. */
const BANDS = [
  { radius: 40, entry: "earthbreakerBandNear" },
  { radius: 65, entry: "earthbreakerBandMid" },
  { radius: 90, entry: "earthbreakerBandFar" },
] as const satisfies readonly { radius: number; entry: EffectName }[];

/** The slam's shape, world px and ms. *Starting values,* through the contact sheet. */
export const EARTHBREAKER = {
  /** The shock's rings, nearest first; the last is the reach the server strikes to (§B). */
  rings: BANDS.map((b) => b.radius),
  /** Quarter-bands to a ring: the smear's arc is a little over a quarter turn, so four close it. */
  bandsPerRing: 4,
  /** Between one ring and the next. */
  ringGapMs: 60,
  /** Dust puffs round the last ring. */
  dustPoints: 14,
  /** Cracks running out from the crater. */
  cracks: 6,
  /**
   * Each crack's two splits, by how far out from the feet they lie (world px) and their turn off the crack's
   * line: the second bends, so a crack runs jagged; its rays end short of 90.
   */
  crackLengths: [
    { at: 30, bend: 0 },
    { at: 62, bend: 0.3 },
  ],
  /** Between a crack's first length and its second, as it runs out. */
  crackGapMs: 70,
} as const;

/** A crack's turn off the even spread, per crack, so the six never read as a drawn star. */
const CRACK_SKEW = [0.18, -0.22, 0.09, -0.12, 0.25, -0.05];

/** Every table entry the slam plays, for the palette check. */
export const EARTHBREAKER_EFFECTS = [
  "earthbreakerSlam",
  "earthbreakerRing",
  ...BANDS.map((b) => b.entry),
  "earthbreakerShock",
  "earthbreakerCrack",
] as const satisfies readonly EffectName[];

/** Plays the slam round a warrior standing at world point `at`. */
export function playEarthbreaker(
  fx: Pick<EffectsRuntime, "play">,
  steps: Pick<Staged, "at">,
  owner: OwnerKey,
  at: Point,
): void {
  const feet = { x: at.x, y: at.y };
  fx.play(owner, "earthbreakerSlam", feet);
  fx.play(owner, "earthbreakerRing", feet);

  BANDS.forEach(({ entry }, ring) => {
    // each ring turned an eighth from the last, so the quarter-bands' seams never line up
    const turn = ((ring % 2) * Math.PI) / 4;
    steps.at(ring * EARTHBREAKER.ringGapMs, () => {
      for (let q = 0; q < EARTHBREAKER.bandsPerRing; q++)
        fx.play(owner, entry, feet, { rotation: turn + (q / EARTHBREAKER.bandsPerRing) * Math.PI * 2 });
    });
  });

  const reach = EARTHBREAKER.rings[EARTHBREAKER.rings.length - 1];
  steps.at(BANDS.length * EARTHBREAKER.ringGapMs, () => {
    const n = EARTHBREAKER.dustPoints;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      // heading in to the feet: the dust streams out behind it, away from the slam
      fx.play(owner, "earthbreakerShock", { x: feet.x + dir.x * reach, y: feet.y + dir.y * reach }, {
        direction: { x: -dir.x, y: -dir.y },
      });
    }
  });

  for (let c = 0; c < EARTHBREAKER.cracks; c++) {
    const line = ((c + CRACK_SKEW[c % CRACK_SKEW.length]) / EARTHBREAKER.cracks) * Math.PI * 2;
    const side = c % 2 === 0 ? 1 : -1;
    EARTHBREAKER.crackLengths.forEach(({ at: r, bend }, k) => {
      const p = { x: feet.x + Math.cos(line) * r, y: feet.y + Math.sin(line) * r };
      steps.at(k * EARTHBREAKER.crackGapMs, () =>
        fx.play(owner, "earthbreakerCrack", p, { rotation: line + side * bend }),
      );
    });
  }
}
