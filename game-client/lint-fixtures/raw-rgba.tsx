// FIXTURE: must be REJECTED by the token fence (ADR-0013, FS-8TCN2 slice 2).
// Not compiled, not imported. lint-fence.sh runs the rule against this file
// and asserts it fails. A palette triple typed as rgba() slipped past the
// hex-only fence for a whole palette; this is the case that must now fail.
export const bad = {
  inlineStyle: { borderColor: 'rgba(156, 123, 63, 0.15)' },
  templated: `0 0 12px rgba(111,143,74,0.2)`,
};
