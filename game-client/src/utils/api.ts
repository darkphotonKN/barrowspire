import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import { useAuthStore } from "@/stores/authStore";
import { ApiError, fromProblem } from "@/utils/apiError";

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

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const authStorage = localStorage.getItem("auth-storage");
  if (!authStorage) return null;
  try {
    return JSON.parse(authStorage).state?.accessToken || null;
  } catch {
    return null;
  }
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

/**
 * Turns openapi-fetch's `{ data, error }` result into the throwing shape the app
 * already expects, and preserves the FS-22WKC contract: errors arrive as
 * ApiError carrying `code`.
 *
 * `error` here is the parsed problem+json body, so it goes through the same
 * fromProblem the hand-rolled client used — one parser, not two.
 */
function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.error !== undefined || !result.response.ok) {
    const apiError = fromProblem(result.response.status, result.error);
    if (result.response.status === 401) {
      handleUnauthorized();
    }
    throw apiError;
  }
  return result.data as T;
}

class ApiClient {
  // Get current member profile
  async getMemberProfile() {
    return unwrap(await client.GET("/api/member", {}));
  }

  // Request avatar upload presigned URL
  async requestAvatarUpload(filename: string) {
    return unwrap(
      await client.POST("/api/member/avatar/upload-request", {
        body: { filename },
      }),
    );
  }

  // Confirm avatar upload
  async confirmAvatarUpload(uploadId: string) {
    return unwrap(
      await client.POST("/api/member/avatar/confirm", {
        body: { upload_id: uploadId },
      }),
    );
  }

  // Subscribe to a product (backend auto-creates Stripe customer)
  async subscribe(productId: string, email: string) {
    return unwrap(
      await client.POST("/api/payment/subscribe", {
        body: { product_id: productId, email },
      }),
    );
  }

  // Check subscription permission (polling endpoint)
  async checkSubscriptionPermission() {
    return unwrap(await client.GET("/api/payment/subscription/permission", {}));
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

  // Get leaderboard
  async getLeaderboard(limit: number = 50, offset: number = 0) {
    return unwrap(
      await client.GET("/api/stats/leaderboard", {
        params: { query: { limit, offset } },
      }),
    );
  }

  // Get notifications for current user
  async getNotifications() {
    return unwrap(await client.GET("/api/notification/", {}));
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId: string) {
    return unwrap(
      await client.PATCH("/api/notification/{id}/read", {
        params: { path: { id: notificationId } },
      }),
    );
  }

  // Mark all notifications as read
  async markAllNotificationsAsRead() {
    return unwrap(await client.PATCH("/api/notification/read-all", {}));
  }

  // Get player loadout
  async getLoadout() {
    return unwrap(await client.GET("/api/items/loadout", {}));
  }

  // Get player item instances (warehouse/stash)
  async getItemInstances() {
    return unwrap(await client.GET("/api/items/instances", {}));
  }

  // Update loadout slot
  async updateLoadout(slot: string, itemInstanceId: string | null) {
    return unwrap(
      await client.PUT("/api/items/loadout", {
        body: { slot, item_instance_id: itemInstanceId || "" },
      }),
    );
  }

  // The signed-in delver's gold (FS-8EGFA req 26). 404 until the account exists, just after
  // signup (ADR-0014).
  async getWalletAccount() {
    return unwrap(await client.GET("/api/wallet/account", {}));
  }

  // A bid as the signed-in delver (FS-8EGFA req 26). The 201 has an empty body, which the
  // default JSON parsing reads as nothing; nothing is returned.
  async placeBid(listingId: string, amount: number, idempotencyKey: string): Promise<void> {
    unwrap(
      await client.POST("/api/marketplace/listings/{listing_id}/bids", {
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
  async createListing(itemId: string, startPrice: number, endsAt: string): Promise<void> {
    unwrap(
      await client.POST("/api/marketplace/listings", {
        body: { itemId, startPrice, endsAt },
      }),
    );
  }

  // One page of the signed-in delver's listings in every status, newest first, items joined
  // (FS-8EGFA req 23).
  async listMyListings(cursor?: string) {
    return unwrap(
      await client.GET("/api/marketplace/listings/mine", {
        params: { query: { cursor } },
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
 * Public reads: routes the gateway answers without a token, called the same way signed in or
 * out, so a token that expires mid-session never breaks them (FS-8EGFA req 21).
 */
class PublicApi {
  // One page of the Bazaar's active listings, soonest-ending first, each with its item joined.
  async browseListings(cursor?: string) {
    return unwrap(
      await publicClient.GET("/api/marketplace/listings", {
        params: { query: { cursor } },
      }),
    );
  }

  // One listing in any status, with its item joined (FS-8EGFA req 24): the detail dialog reads
  // the same signed in or out.
  async getListing(listingId: string) {
    return unwrap(
      await publicClient.GET("/api/marketplace/listings/{listing_id}", {
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
