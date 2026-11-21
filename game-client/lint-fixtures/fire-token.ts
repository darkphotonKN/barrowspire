// FIXTURE — must be REJECTED by the fire fence (ADR-0025): fire's own ramp named outside the theme and
// the fire effects. Not compiled, not imported. lint-fence.sh asserts the rule rejects it.
declare const BARROW_HEX: Record<string, number>;
export const bad = [BARROW_HEX.fireHot, "fireCore"];
