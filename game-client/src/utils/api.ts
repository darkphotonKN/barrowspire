import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import { useAuthStore } from "@/stores/authStore";
import { ApiError, fromProblem } from "@/utils/apiError";
import {
  scheduleRenewals,
  singleFlight,
  withCooldown,
  type RenewOutcome,
} from "@/utils/sessionRenewal";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7114";

// Clears auth state and redirects to login. Guarded against duplicate
// redirects (multiple parallel requests all getting 401 at the same time
// would otherwise each trigger a navigation).
let isRedirectingToLogin = false;
function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  if (isRedirectingToLogin) return;
  if (window.location.pathname === "/login") return;

  isRedirectingToLogin = true;
  try {
    useAuthStore.getState().logout();
  } catch {
    // logout is best-effort; proceed with redirect regardless
  }
  window.location.href = "/login";
}

/** The session as the auth store persisted it: read from storage, so every tab sees the latest. */
function storedSession(): { accessToken?: string | null; refreshToken?: string | null } {
  if (typeof window === "undefined") return {};
  const authStorage = localStorage.getItem("auth-storage");
  if (!authStorage) return {};
  try {
    return JSON.parse(authStorage).state ?? {};
  } catch {
    return {};
  }
}

function getAuthToken(): string | null {
  return storedSession().accessToken || null;
}

/** The access token to open a connection with now: the game socket reads it at every open (FS-ZPX58 R20). */
export const currentAccessToken = getAuthToken;

/**
 * One renewal attempt (FS-ZPX58 R16, R17), through the unauthenticated client so it carries no
 * bearer and cannot recurse into the 401 handling. It stores what it gets and answers the
 * outcome; it never signs the player out itself.
 */
async function renewOnce(): Promise<RenewOutcome> {
  const sent = storedSession().refreshToken;
  if (!sent) return "refused";

  const { data, response } = await publicClient.POST("/api/member/refresh", {
    body: { refresh_token: sent },
  });

  // The session changed while the renewal was out (FS-ZPX58 M1): a sign-out stays signed out,
  // and a newer sign-in keeps its own tokens. The answer belongs to a session that is gone.
  const now = storedSession();
  if (now.refreshToken !== sent) return now.accessToken ? "renewed" : "refused";

  // 404: the route is not there (a client deployed before its gateway); waiting cannot help (M2).
  if (response.status === 401 || response.status === 404 || response.status === 422) return "refused";
  if (!response.ok || !data) return "unavailable";
  return useAuthStore.getState().applyRefreshResult(data) ? "renewed" : "refused";
}

/**
 * Renews the stored session, single-flight (FS-ZPX58 R14): every caller shares one call. After an
 * unavailable renewal it cools down before asking again (M2).
 */
export const renewSession = singleFlight(withCooldown(renewOnce));

/**
 * Starts the proactive renewal timer for this page (FS-ZPX58 R18) and returns its stop. The
 * timer follows the auth store, so signing in, renewing and signing out all reschedule it.
 */
export function startSessionRenewal(): () => void {
  return scheduleRenewals({
    current: getAuthToken,
    subscribe: (listener) => useAuthStore.subscribe(listener),
    renew: renewSession,
  });
}

/**
 * The typed client. Paths, params, request bodies and responses all come from
 * `@/api/generated/schema`, which is generated from the gateway's openapi.yaml —
 * so a contract change that invalidates a call here fails the BUILD rather than
 * a user's session (ADR-0001 §4).
 *
 * Hand-written fetch against a serialized path is banned by lint; see
 * eslint.config.mjs. WebSocket traffic is plane 2 and is not covered here.
 */
const client = createClient<paths>({ baseUrl: API_BASE_URL });

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = getAuthToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

client.use(authMiddleware);

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Turns openapi-fetch's `{ data, error }` result into the throwing shape the app
 * already expects, and preserves the FS-22WKC contract: errors arrive as
 * ApiError carrying `code`.
 *
 * `error` here is the parsed problem+json body, so it goes through the same
 * fromProblem the hand-rolled client used — one parser, not two.
 */
function settle<T>(result: Result<T>): T {
  if (result.error !== undefined || !result.response.ok) {
    throw fromProblem(result.response.status, result.error);
  }
  return result.data as T;
}

/**
 * Sends an authenticated call, and on a 401 renews the session once and sends it again
 * (FS-ZPX58 §C). `send` builds the request afresh each time, so a retry carries the new token and
 * its own body. Only a refused renewal, or a retry refused again, signs the player out; a renewal
 * that could not be asked throws the 401 and keeps the session. A 401 is answered at the gateway's
 * edge before any downstream call, so a retried write has not run the first time.
 */
async function authed<T>(send: () => Promise<Result<T>>): Promise<T> {
  const sentWith = getAuthToken();
  const first = await send();
  if (first.response.status !== 401) return settle(first);

  // Replaced while this call was out (another call's renewal landed): just send it again (R15).
  const current = getAuthToken();
  const outcome = current && current !== sentWith ? "renewed" : await renewSession();

  if (outcome === "unavailable") throw fromProblem(first.response.status, first.error);
  if (outcome === "refused") return signOut(first);

  const retry = await send();
  if (retry.response.status === 401) return signOut(retry);
  return settle(retry);
}

/** Today's 401 handling: sign the player out, send them to /login, and throw the refusal. */
function signOut(result: Result<unknown>): never {
  const apiError = fromProblem(result.response.status, result.error);
  handleUnauthorized();
  throw apiError;
}

class ApiClient {
  // Get current member profile
  async getMemberProfile() {
    return authed(() => client.GET("/api/member", {}));
  }

  // Verifies the signed-in member's email with the mailed 6-digit code (FS-V6SFK R17). Answers a
  // bare LoginResult: a fresh pair whose access token carries the email_verified claim, which the
  // caller swaps into the auth store. Already verified is a success no-op with a fresh pair too.
  async verifyEmail(code: string) {
    return authed(() =>
      client.POST("/api/member/email/verify", {
        body: { code },
      }),
    );
  }

  // Mails a new verification code (FS-V6SFK R18); the old one stops working. 204 with no body.
  async resendVerification(): Promise<void> {
    await authed(() => client.POST("/api/member/email/resend", {}));
  }

  // Changes an unverified email and mails a code to the new address (FS-V6SFK R19). Answers the
  // bare updated Member; 409 ALREADY_EXISTS when the address belongs to someone else.
  async changeEmail(email: string) {
    return authed(() =>
      client.PUT("/api/member/email", {
        body: { email },
      }),
    );
  }

  // Request avatar upload presigned URL
  async requestAvatarUpload(filename: string) {
    return authed(() =>
      client.POST("/api/member/avatar/upload-request", {
        body: { filename },
      }),
    );
  }

  // Confirm avatar upload
  async confirmAvatarUpload(uploadId: string) {
    return authed(() =>
      client.POST("/api/member/avatar/confirm", {
        body: { upload_id: uploadId },
      }),
    );
  }

  // Upload file directly to S3.
  //
  // NOT a gateway call: the presigned URL points at S3, which has no OpenAPI
  // document and is not part of this contract. Left as a raw fetch on purpose,
  // and exempted from the lint rule for the same reason.
  async uploadToS3(presignedUrl: string, file: File) {
    const response = await fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    if (!response.ok) {
      throw new ApiError({
        code: "UPLOAD_FAILED",
        status: response.status,
        detail: `S3 upload failed with status ${response.status}`,
        errors: [],
      });
    }

    return response;
  }

  // Leaderboard is off for now (the stats service still records finished games).
  // // Get leaderboard
  // async getLeaderboard(limit: number = 50, offset: number = 0) {
  //   return authed(() =>
  //     client.GET("/api/stats/leaderboard", {
  //       params: { query: { limit, offset } },
  //     }),
  //   );
  // }

  // Get notifications for current user
  async getNotifications() {
    return authed(() => client.GET("/api/notification/", {}));
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId: string) {
    return authed(() =>
      client.PATCH("/api/notification/{id}/read", {
        params: { path: { id: notificationId } },
      }),
    );
  }

  // Mark all notifications as read
  async markAllNotificationsAsRead() {
    return authed(() => client.PATCH("/api/notification/read-all", {}));
  }

  // The signed-in member's live characters, oldest first (FS-BDA7X req 39). Never null.
  async listCharacters() {
    return (await authed(() => client.GET("/api/characters", {}))).characters;
  }

  // A new character at level 1 (FS-BDA7X req 39). 409 ALREADY_EXISTS when the name is taken in
  // any case; 400 VALIDATION_FAILED for a bad name or class.
  async createCharacter(name: string, className: string) {
    return authed(() =>
      client.POST("/api/characters", {
        body: { name, class: className },
      }),
    );
  }

  // Deletes one of the member's characters (FS-BDA7X req 39). 204 with no body. The id must be a
  // server id: a client-minted `char_…` id answers 422.
  async deleteCharacter(characterId: string): Promise<void> {
    await authed(() =>
      client.DELETE("/api/characters/{characterId}", {
        params: { path: { characterId } },
      }),
    );
  }

  // The signed-in member's mailbox counts and the newest letter's time (FS-1GZGD R9, R34): what
  // the envelope's wax seal shows and when it pulses.
  async getMailboxSummary() {
    return authed(() => client.GET("/api/mail/summary", {}));
  }

  // The signed-in member's letters, newest first, at most 50 (FS-1GZGD R7). Each item enclosure
  // carries the item as it was when the letter was sent (A2).
  async listLetters() {
    return (await authed(() => client.GET("/api/mail/letters", {}))).letters;
  }

  // Marks one letter read (FS-1GZGD R8). 204 with no body; an expired letter is LETTER_EXPIRED.
  async markLetterRead(letterId: string): Promise<void> {
    await authed(() =>
      client.POST("/api/mail/letters/{letterId}/read", {
        params: { path: { letterId } },
      }),
    );
  }

  // Takes every enclosure of one letter at once: its items into the stash, its gold into the
  // wallet, and marks it read (FS-1GZGD R13, R39). No body. Refusals carry a problem `code`:
  // STASH_FULL, LETTER_EXPIRED, LETTER_ALREADY_CLAIMED, LETTER_CLAIM_IN_PROGRESS, NOTHING_TO_CLAIM.
  async claimLetter(letterId: string) {
    return authed(() =>
      client.POST("/api/mail/letters/{letterId}/claim", {
        params: { path: { letterId } },
      }),
    );
  }

  // Get player loadout
  async getLoadout() {
    return authed(() => client.GET("/api/items/loadout", {}));
  }

  // Get player item instances (warehouse/stash)
  async getItemInstances() {
    return authed(() => client.GET("/api/items/instances", {}));
  }

  // The rarity tiers by id, so an item instance's rarity_id can be named (FS-4R9M9 R59)
  async getItemRarities() {
    return authed(() => client.GET("/api/items/rarities", {}));
  }

  // Update loadout slot
  async updateLoadout(slot: string, itemInstanceId: string | null) {
    return authed(() =>
      client.PUT("/api/items/loadout", {
        body: { slot, item_instance_id: itemInstanceId || "" },
      }),
    );
  }

  // Move an owned, unworn item between the bag and the stash (FS-VPD8Y R22); refusals carry
  // BAG_FULL, STASH_FULL, ITEM_NOT_AVAILABLE, ITEM_WORN or NOT_FOUND as their code
  async moveItemInstance(id: string, location: "bag" | "stash") {
    return authed(() =>
      client.PUT("/api/items/instances/{id}/location", {
        params: { path: { id } },
        body: { location },
      }),
    );
  }

  // The signed-in player's gold (FS-8EGFA req 26). 404 until the account exists, just after
  // signup (ADR-0014).
  async getWalletAccount() {
    return authed(() => client.GET("/api/wallet/account", {}));
  }

  // A bid as the signed-in player (FS-8EGFA req 26). The 201 has an empty body, which the
  // default JSON parsing reads as nothing; nothing is returned.
  async placeBid(listingId: string, amount: number, idempotencyKey: string): Promise<void> {
    await authed(() =>
      client.POST("/api/marketplace/listings/{listing_id}/bids", {
        params: {
          path: { listing_id: listingId },
          header: { "Idempotency-Key": idempotencyKey },
        },
        body: { amount },
      }),
    );
  }

  // Buys a listing outright at its buyout price (FS-49Z37 req 8–10). 202 with an empty body: the
  // sale settles asynchronously. The key is one per buyout intent, reused on every resend of it
  // (ADR-0026), so a resend after a landed buyout is recognised, not charged twice.
  async buyout(listingId: string, amount: number, idempotencyKey: string): Promise<void> {
    await authed(() =>
      client.POST("/api/marketplace/listings/{listing_id}/buyout", {
        params: {
          path: { listing_id: listingId },
          header: { "Idempotency-Key": idempotencyKey },
        },
        body: { amount },
      }),
    );
  }

  // Puts a relic up for auction (FS-8EGFA req 25). 202 with an empty body: the listing appears
  // once marketplace has reserved the item, so the caller polls `listMyListings` for it.
  // A buyout price is sent only when set; none is a plain auction (FS-49Z37 req 1).
  async createListing(
    itemId: string,
    startPrice: number,
    endsAt: string,
    buyoutPrice?: number,
  ): Promise<void> {
    await authed(() =>
      client.POST("/api/marketplace/listings", {
        body: { itemId, startPrice, endsAt, ...(buyoutPrice === undefined ? {} : { buyoutPrice }) },
      }),
    );
  }

  // One page of the signed-in player's listings in every status, newest first, items joined
  // (FS-8EGFA req 23).
  async listMyListings(cursor?: string) {
    return authed(() =>
      client.GET("/api/marketplace/listings/mine", {
        params: { query: { cursor } },
      }),
    );
  }

  // One page of the signed-in player's own bids, newest first, each with its listing summary and
  // item joined (FS-EYQ8K req 1–7).
  async listMyBids(cursor?: string) {
    return authed(() =>
      client.GET("/api/marketplace/bids/mine", {
        params: { query: { cursor } },
      }),
    );
  }

  // Ends the signed-in seller's auction early at its leading bid (FS-49Z37 req 15). No key; the
  // body is the accept floor, the leading bid the seller was shown, so nothing sells below it
  // (FS-F692V req 1). 202 with an empty body once settlement has started.
  async acceptBid(listingId: string, minAmount: number): Promise<void> {
    await authed(() =>
      client.POST("/api/marketplace/listings/{listing_id}/accept", {
        params: { path: { listing_id: listingId } },
        body: { minAmount },
      }),
    );
  }

  // Withdraws the signed-in seller's own listing (FS-V7A5S req 13): it reads CANCELLED at once,
  // the item and every bidder's gold go back on their own. No key, no body; 204 with an empty body.
  async withdrawListing(listingId: string): Promise<void> {
    await authed(() =>
      client.DELETE("/api/marketplace/listings/{listing_id}", {
        params: { path: { listing_id: listingId } },
      }),
    );
  }

  // Withdraws one of the signed-in player's leading or outbid bids, releasing its hold (FS-EYQ8K
  // req 12; ADR-0029). No key, no body; 204 with an empty body.
  async withdrawBid(listingId: string, bidId: string): Promise<void> {
    await authed(() =>
      client.DELETE("/api/marketplace/listings/{listing_id}/bids/{bid_id}", {
        params: { path: { listing_id: listingId, bid_id: bidId } },
      }),
    );
  }
}

export const apiClient = new ApiClient();

/**
 * Unauthenticated typed client, for the pre-auth pages.
 *
 * Sign-in and sign-up run before a token exists, so they must not go through the
 * auth middleware. They still go through the GENERATED client: "no hand-written
 * fetch against a serialized path" (ADR-0001 §4) has no pre-auth exemption.
 *
 * There is no third pre-auth call: FS-83TJK made signup synchronous, which removed
 * the check-email poll and then the endpoint itself.
 */
export const publicClient = createClient<paths>({ baseUrl: API_BASE_URL });

/**
 * The client for public reads: the stored bearer when there is one, and nothing else. It is its
 * own instance so that no sign-out or refresh handling added to the authenticated client reaches
 * a public read.
 */
const publicReadClient = createClient<paths>({ baseUrl: API_BASE_URL });
publicReadClient.use(authMiddleware);

/**
 * Public reads: routes the gateway answers with or without a token. Signed in they carry the
 * bearer, so the server can tell the seller their own listing (`own`, FS-GKHYD Req 12); signed
 * out they carry none. A token that expired mid-session is read as anonymous by the server
 * (ADR-0053), and an error here never signs the player out, so a stale token never breaks the
 * page (FS-8EGFA req 21).
 */
class PublicApi {
  // One page of the Bazaar's active listings, soonest-ending first, each with its item joined.
  async browseListings(cursor?: string) {
    return settle(
      await publicReadClient.GET("/api/marketplace/listings", {
        params: { query: { cursor } },
      }),
    );
  }

  // One listing in any status, with its item joined (FS-8EGFA req 24): the detail dialog reads
  // the same signed in or out.
  async getListing(listingId: string) {
    return settle(
      await publicReadClient.GET("/api/marketplace/listings/{listing_id}", {
        params: { path: { listing_id: listingId } },
      }),
    );
  }
}

export const publicApi = new PublicApi();

/**
 * The baked sprite manifest (`public/art/manifest.json`), for DOM pages that crop item icons
 * out of the atlas (FS-8EGFA req 32). The canvas loads it through Phaser's loader instead.
 *
 * NOT a gateway call: a same-origin static asset with no OpenAPI document, so a raw fetch,
 * kept here because this file is the only place one is allowed. Unvalidated JSON out; the
 * caller validates it with `validateManifest`, as the canvas does.
 */
export async function fetchArtManifest(): Promise<unknown> {
  const response = await fetch("/art/manifest.json");
  if (!response.ok) {
    throw new ApiError({
      code: "ART_MANIFEST_UNAVAILABLE",
      status: response.status,
      detail: `art manifest failed with status ${response.status}`,
      errors: [],
    });
  }
  return response.json();
}
