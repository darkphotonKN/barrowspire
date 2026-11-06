/**
 * Session renewal, the parts that know nothing about HTTP (FS-ZPX58 §C, ADR-0066).
 *
 * The access token lives 60 minutes; the refresh token renews it. This module reads a token's
 * expiry, makes renewal single-flight, and keeps a timer that renews shortly before expiry. The
 * renewal call itself and what its outcome means for the player live in `api.ts`.
 */

/** How long before the access token's `exp` the client renews it (FS-ZPX58 R18). */
export const RENEW_AHEAD_MS = 2 * 60 * 1000;

/**
 * - `renewed`: a new access token is stored.
 * - `refused`: the session cannot be renewed (the refresh token is bad, expired, or missing).
 * - `unavailable`: renewal could not be asked (network, or the server failed); try again later.
 */
export type RenewOutcome = "renewed" | "refused" | "unavailable";

/**
 * The access token's `exp` as epoch milliseconds, read from its payload. Never verified: the
 * server is the only judge of a token, the client only needs to know when to renew. Null when the
 * token is absent or its `exp` cannot be read.
 */
export function accessTokenExpiry(token: string | null | undefined): number | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const exp = JSON.parse(atob(padded))?.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Wraps a renewal so every caller while one is in flight shares it (FS-ZPX58 R14): parallel 401s
 * and the timer cause one call. A renewal that throws reads as `unavailable`.
 */
export function singleFlight(renew: () => Promise<RenewOutcome>): () => Promise<RenewOutcome> {
  let inFlight: Promise<RenewOutcome> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = renew()
        .catch((): RenewOutcome => "unavailable")
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };
}

/**
 * Keeps one renewal timer in step with the stored access token (FS-ZPX58 R18): it fires
 * RENEW_AHEAD_MS before the token's `exp`, at once for a token already inside that window, and
 * not at all for a token whose `exp` cannot be read (the 401 path covers it). A new token
 * reschedules; no token clears the timer. Returns the function that stops it.
 *
 * Whatever the renewal answers, nothing more happens here: a renewed token reschedules through
 * the store, and a refused or unavailable one is left to the next call's 401.
 */
export function scheduleRenewals(deps: {
  current: () => string | null;
  subscribe: (listener: () => void) => () => void;
  renew: () => Promise<RenewOutcome>;
}): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // undefined, not null: the first plan must run even when there is no token
  let plannedFor: string | null | undefined;

  const plan = () => {
    const token = deps.current();
    if (token === plannedFor) return;
    plannedFor = token;

    clearTimeout(timer);
    timer = undefined;

    const exp = accessTokenExpiry(token);
    if (exp === null) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        void deps.renew();
      },
      Math.max(0, exp - RENEW_AHEAD_MS - Date.now()),
    );
  };

  const unsubscribe = deps.subscribe(plan);
  plan();

  return () => {
    unsubscribe();
    clearTimeout(timer);
    timer = undefined;
  };
}
