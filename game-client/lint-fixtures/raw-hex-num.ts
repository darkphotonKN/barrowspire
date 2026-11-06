// FIXTURE — must be REJECTED by the token fence (ADR-0013): a numeric 0xRRGGBB in the canvas
// render layer. Not compiled, not imported. lint-fence.sh runs the rule against this file and
// asserts it fails; a fence nobody has watched reject enforces nothing.
export const bad = { tint: 0xffffff, fill: 0x1c1613 };
