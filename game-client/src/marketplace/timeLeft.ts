/**
 * How long an auction has left, as the table and the detail dialog show it (FS-8EGFA req 22).
 *
 * Whole minutes while a minute or more remains (with days and hours in front when there are
 * any), seconds in the last minute, and "Ended" from the end moment on. Always computed from the
 * server's `endsAt` against a `now` the caller passes in, so it is testable without a clock.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const ENDED = "Ended";

const msLeft = (endsAt: string, now: number) => Date.parse(endsAt) - now;

export function formatTimeLeft(endsAt: string, now: number): string {
  const left = msLeft(endsAt, now);
  if (left <= 0) return ENDED;
  if (left < MINUTE) return `${Math.floor(left / SECOND)}s`;

  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * How long until {@link formatTimeLeft} reads differently: up to a minute while it shows whole
 * minutes, up to a second in the last minute. Null once the auction has ended, since the text
 * never changes again. A timer set for this re-renders exactly when the text moves.
 */
export function msUntilTimeLeftChanges(
  endsAt: string,
  now: number,
): number | null {
  const left = msLeft(endsAt, now);
  if (left <= 0) return null;
  const unit = left < MINUTE ? SECOND : MINUTE;
  return (left % unit) + 1;
}
