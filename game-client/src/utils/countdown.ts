/** Remaining over total, 0..1; a total of 0 or less reads as run out (FS-B3NDZ R6, R7). */
export function countdownFraction(
  remainingMs: number,
  totalMs: number,
): number {
  return totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
}
