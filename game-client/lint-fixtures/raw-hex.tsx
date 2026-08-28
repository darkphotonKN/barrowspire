// FIXTURE — must be REJECTED by the token fence (ADR-0013).
// Not compiled, not imported. lint-fence.sh runs the rule against this file
// and asserts it fails; a fence nobody has watched reject enforces nothing.
export const bad = {
  inlineStyle: { color: '#e8a14d' },
  templated: `1px solid #9c7b3f`,
  thirdPartyTheme: { colorBackground: '#1c1613' },
};
