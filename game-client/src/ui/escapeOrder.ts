/**
 * What one Esc press does, in every world (FS-R82NV § Change C2, extending FS-HRH2J R5, FS-1GZGD
 * R40 and FS-G4VMQ R1–R3): the one thing on top closes, the letter panel first, then an open
 * menu, then the party panel (drawn over the gear overlay, § Change C8), then the gear overlay;
 * with nothing open the menu opens. The UI scene asks it (FS-TQZ5J R17), after an open dialogue,
 * which its Esc dismisses first. The menu opens only with no window open, so it opens over none (FS-3EBCA R17); the corner
 * row's Menu icon does not step through this order but opens the menu at once, closing them (R6).
 * The run's controls panel comes before the whole order (FS-84N1G R17): any other window opening
 * closes it (R16), so nothing it covers opened after it.
 */

export interface EscapeOpen {
  /** The town's letter panel; absent elsewhere. */
  letter?: boolean;
  menu: boolean;
  gear: boolean;
  party: boolean;
  /** The run's controls panel; absent elsewhere. */
  controls?: boolean;
}

export type EscapeStep = "controls" | "letter" | "close-menu" | "gear" | "party" | "open-menu";

export function escapeStep(open: EscapeOpen): EscapeStep {
  if (open.controls) return "controls";
  if (open.letter) return "letter";
  if (open.menu) return "close-menu";
  if (open.party) return "party";
  if (open.gear) return "gear";
  return "open-menu";
}
