/**
 * What one Esc press does, in every world (FS-R82NV § Change C2, extending FS-HRH2J R5, FS-1GZGD
 * R40 and FS-G4VMQ R1–R3): the one thing on top closes, the letter panel first, then an open
 * menu, then the party panel (drawn over the gear overlay, § Change C8), then the gear overlay;
 * with nothing open the world's menu opens. A dialogue keeps its own Esc, so a scene asks this only without
 * one. The corner row's Menu icon is one such press (FS-3EBCA R6).
 */

export interface EscapeOpen {
  /** The town's letter panel; absent elsewhere. */
  letter?: boolean;
  menu: boolean;
  gear: boolean;
  party: boolean;
}

export type EscapeStep = "letter" | "close-menu" | "gear" | "party" | "open-menu";

export function escapeStep(open: EscapeOpen): EscapeStep {
  if (open.letter) return "letter";
  if (open.menu) return "close-menu";
  if (open.party) return "party";
  if (open.gear) return "gear";
  return "open-menu";
}
