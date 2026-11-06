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
 * The least time between two proactive renewals (FS-ZPX58 L2). A client clock running fast makes
 * every fresh token look expired; without a floor each renewal would schedule the next at once.
 */
export const RENEW_FLOOR_MS = 60 * 1000;

/**
 * A token that arrives this soon after a proactive renewal fired is the one it minted, so it lives
 * its whole lifetime (`exp − iat`) from its arrival, whatever the client clock says (FS-ZPX58 L-c).
 */
export const FRESH_WINDOW_MS = 30 * 1000;

/** The cooldown after an unavailable renewal, doubling while it stays unavailable (FS-ZPX58 M2). */
export const COOLDOWN_BASE_MS = 5 * 1000;
export const COOLDOWN_MAX_MS = 60 * 1000;

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
  return timeClaim(token, "exp");
}

/** A NumericDate claim of the token's payload as epoch milliseconds, unverified; null if unreadable. */
function timeClaim(token: string | null | undefined, claim: "exp" | "iat"): number | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const value = JSON.parse(atob(padded))?.[claim];
    return typeof value === "number" && Number.isFinite(value) ? value * 1000 : null;
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
 * Wraps a renewal with a cooldown (FS-ZPX58 M2): after an unavailable renewal, calls within the
 * cooldown answer `unavailable` without asking, so an outage costs one renewal call per cooldown
 * rather than one per refused call. The cooldown starts at COOLDOWN_BASE_MS and doubles while
 * renewal stays unavailable, up to COOLDOWN_MAX_MS; a renewed or refused answer clears it. A
 * renewal that throws reads as `unavailable`.
 */
export function withCooldown(renew: () => Promise<RenewOutcome>): () => Promise<RenewOutcome> {
  let failures = 0;
  let until = 0;
  return async () => {
    if (Date.now() < until) return "unavailable";

    let outcome: RenewOutcome;
    try {
      outcome = await renew();
    } catch {
      outcome = "unavailable";
    }

    if (outcome === "unavailable") {
      until = Date.now() + Math.min(COOLDOWN_BASE_MS * 2 ** failures, COOLDOWN_MAX_MS);
      failures++;
    } else {
      failures = 0;
      until = 0;
    }
    return outcome;
  };
}

/**
 * Keeps one renewal timer in step with the stored access token (FS-ZPX58 R18): it fires
 * RENEW_AHEAD_MS before the token's `exp`, at once for a token already inside that window, and
 * not at all for a token whose `exp` cannot be read (the 401 path covers it). A new token
 * reschedules; no token clears the timer. Returns the function that stops it.
 *
 * The client clock may be off (FS-ZPX58 L2). The wait is never longer than the token's own
 * lifetime (`exp - iat`, both server times), so a slow clock cannot schedule past the token's
 * real expiry, and never shorter than RENEW_FLOOR_MS after the previous proactive renewal, so a
 * fast clock cannot make each renewal schedule the next at once. A token that arrives within
 * FRESH_WINDOW_MS of a proactive renewal is anchored on its arrival: it renews a lifetime later,
 * so a fast clock costs one renewal, not one a minute.
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
  let lastFiredAt: number | null = null;

  const plan = () => {
    const token = deps.current();
    if (token === plannedFor) return;
    plannedFor = token;

    clearTimeout(timer);
    timer = undefined;

    const exp = accessTokenExpiry(token);
    if (exp === null) return;

    const now = Date.now();
    const iat = timeClaim(token, "iat");
    const lifetime = iat !== null && exp > iat ? exp - iat : null;
    const fresh = lifetime !== null && lastFiredAt !== null && now - lastFiredAt < FRESH_WINDOW_MS;
    let delay = fresh ? lifetime - RENEW_AHEAD_MS : exp - RENEW_AHEAD_MS - now;
    if (lifetime !== null) delay = Math.min(delay, lifetime - RENEW_AHEAD_MS);
    if (lastFiredAt !== null) delay = Math.max(delay, lastFiredAt + RENEW_FLOOR_MS - now);

    timer = setTimeout(
      () => {
        timer = undefined;
        lastFiredAt = Date.now();
        // a renewal within the same second hands back an identical token: plan it again anyway
        plannedFor = undefined;
        void deps.renew();
      },
      Math.max(0, delay),
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
