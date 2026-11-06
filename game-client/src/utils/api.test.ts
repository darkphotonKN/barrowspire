import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The marketplace calls whose success has no body (FS-8EGFA req 25, 26): 201 on a bid, 202 on a
 * listing. They go through openapi-fetch's default JSON parsing, which must read an empty body
 * as nothing rather than throw, with or without a Content-Length.
 */

type Api = typeof import("./api");

const requests: Request[] = [];
let answer: () => Response;

async function loadApi(): Promise<Api> {
  vi.resetModules();
  return import("./api");
}

beforeEach(() => {
  requests.length = 0;
  // openapi-fetch takes the global fetch when the client is made, so stub before loading.
  vi.stubGlobal("fetch", async (input: Request) => {
    requests.push(input);
    return answer();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const empty = (status: number, headers: Record<string, string> = {}) => () =>
  new Response(null, { status, headers });

describe("apiClient.placeBid", () => {
  it.each([
    ["no Content-Length", {}],
    ["Content-Length 0", { "Content-Length": "0" }],
  ])("should resolve on a 201 with an empty body and %s", async (_label, headers) => {
    answer = empty(201, headers);
    const { apiClient } = await loadApi();
    await expect(apiClient.placeBid("l1", 60, "key-1")).resolves.toBeUndefined();
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Idempotency-Key")).toBe("key-1");
    expect(await requests[0].json()).toEqual({ amount: 60 });
  });

  it("should throw the problem's code on a refusal", async () => {
    answer = () =>
      new Response(
        JSON.stringify({ status: 400, detail: "too low", code: "VALIDATION_FAILED", errors: [] }),
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    const { apiClient } = await loadApi();
    // The same module instance the freshly loaded client throws from.
    const { ApiError } = await import("./apiError");
    const err = await apiClient.placeBid("l1", 60, "key-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).code).toBe("VALIDATION_FAILED");
  });
});

describe("apiClient.createListing", () => {
  it.each([
    ["no Content-Length", {}],
    ["Content-Length 0", { "Content-Length": "0" }],
  ])("should resolve on a 202 with an empty body and %s", async (_label, headers) => {
    answer = empty(202, headers);
    const { apiClient } = await loadApi();
    await expect(
      apiClient.createListing("item-1", 50, "2026-10-02T12:00:00.000Z"),
    ).resolves.toBeUndefined();
    expect(await requests[0].json()).toEqual({
      itemId: "item-1",
      startPrice: 50,
      endsAt: "2026-10-02T12:00:00.000Z",
    });
  });

  it("should send a buyout price only when one is given (FS-49Z37 req 1)", async () => {
    answer = empty(202);
    const { apiClient } = await loadApi();
    await apiClient.createListing("item-1", 50, "2026-10-02T12:00:00.000Z", 80);
    expect(await requests[0].json()).toEqual({
      itemId: "item-1",
      startPrice: 50,
      endsAt: "2026-10-02T12:00:00.000Z",
      buyoutPrice: 80,
    });
  });
});

describe("apiClient.acceptBid", () => {
  it("should send the leading bid the seller was shown as the floor (FS-F692V req 1, 9)", async () => {
    answer = empty(202);
    const { apiClient } = await loadApi();
    await expect(apiClient.acceptBid("l1", 300)).resolves.toBeUndefined();
    expect(requests[0].method).toBe("POST");
    expect(new URL(requests[0].url).pathname).toBe("/api/marketplace/listings/l1/accept");
    expect(await requests[0].json()).toEqual({ minAmount: 300 });
  });
});

describe("publicApi reads (FS-GKHYD Req 12)", () => {
  const listing = () =>
    new Response(JSON.stringify({ id: "l1", own: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const page = () =>
    new Response(JSON.stringify({ listings: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  /** A browser with this access token stored, as the auth store persists it. */
  function signIn(accessToken: string): { location: { pathname: string; href: string } } {
    const win = { location: { pathname: "/marketplace", href: "/marketplace" } };
    vi.stubGlobal("window", win);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "auth-storage" ? JSON.stringify({ state: { accessToken } }) : null,
      setItem: () => {},
      removeItem: () => {},
    });
    return win;
  }

  it.each([
    ["getListing", listing, (api: Api) => api.publicApi.getListing("l1"), "/api/marketplace/listings/l1"],
    ["browseListings", page, (api: Api) => api.publicApi.browseListings(), "/api/marketplace/listings"],
  ] as const)("%s should read without a token when signed out", async (_name, body, call, path) => {
    answer = body;
    const api = await loadApi();
    await call(api);
    expect(new URL(requests[0].url).pathname).toBe(path);
    expect(requests[0].headers.get("Authorization")).toBeNull();
  });

  // Without the token `own` is always false and a seller loses Accept and Withdraw.
  it.each([
    ["getListing", listing, (api: Api) => api.publicApi.getListing("l1")],
    ["browseListings", page, (api: Api) => api.publicApi.browseListings()],
  ] as const)("%s should carry the bearer when signed in", async (_name, body, call) => {
    signIn("tok-1");
    answer = body;
    const api = await loadApi();
    await call(api);
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-1");
  });

  it("should answer the listing's own as the server read it", async () => {
    signIn("tok-1");
    answer = listing;
    const { publicApi } = await loadApi();
    await expect(publicApi.getListing("l1")).resolves.toEqual({ id: "l1", own: true });
  });

  // An expired token reads as anonymous server-side (ADR-0053); even a 401 must never sign the
  // player out or send them to the login page from a public read (FS-8EGFA Req 21's property).
  it.each([
    ["getListing", (api: Api) => api.publicApi.getListing("l1")],
    ["browseListings", (api: Api) => api.publicApi.browseListings()],
  ] as const)("%s should never sign out or redirect on a 401", async (_name, call) => {
    const win = signIn("expired");
    answer = () =>
      new Response(
        JSON.stringify({ status: 401, detail: "expired", code: "UNAUTHENTICATED", errors: [] }),
        { status: 401, headers: { "Content-Type": "application/problem+json" } },
      );
    const api = await loadApi();
    // the store instance api.ts holds: loadApi reset the registry, so this import shares it
    const { useAuthStore } = await import("@/stores/authStore");
    const logout = vi.fn();
    useAuthStore.setState({ logout });
    const { ApiError } = await import("./apiError");

    const err = await call(api).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(logout).not.toHaveBeenCalled();
    expect(win.location.href).toBe("/marketplace");
  });
});

describe("apiClient characters (FS-BDA7X req 39)", () => {
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  it("should list the member's characters", async () => {
    answer = json(200, { characters: [{ id: "c1", name: "Kaelen" }] });
    const { apiClient } = await loadApi();
    await expect(apiClient.listCharacters()).resolves.toEqual([{ id: "c1", name: "Kaelen" }]);
    expect(requests[0].method).toBe("GET");
    expect(new URL(requests[0].url).pathname).toBe("/api/characters");
  });

  it("should create with exactly name and class", async () => {
    answer = json(201, { id: "c1", name: "Kaelen", class: "mage" });
    const { apiClient } = await loadApi();
    await expect(apiClient.createCharacter("Kaelen", "mage")).resolves.toMatchObject({ id: "c1" });
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toEqual({ name: "Kaelen", class: "mage" });
  });

  it("should resolve a delete on a 204 with an empty body", async () => {
    answer = empty(204);
    const { apiClient } = await loadApi();
    await expect(apiClient.deleteCharacter("c1")).resolves.toBeUndefined();
    expect(requests[0].method).toBe("DELETE");
    expect(new URL(requests[0].url).pathname).toBe("/api/characters/c1");
  });
});

describe("apiClient.withdrawBid (FS-EYQ8K req 12)", () => {
  it("should DELETE the bid on its listing and resolve on a 204 with an empty body", async () => {
    answer = empty(204);
    const { apiClient } = await loadApi();
    await expect(apiClient.withdrawBid("l1", "b1")).resolves.toBeUndefined();
    expect(requests[0].method).toBe("DELETE");
    expect(new URL(requests[0].url).pathname).toBe("/api/marketplace/listings/l1/bids/b1");
  });

  it("should throw the problem's code on a refusal", async () => {
    answer = () =>
      new Response(
        JSON.stringify({ status: 400, detail: "ended", code: "FAILED_PRECONDITION", errors: [] }),
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    const { apiClient } = await loadApi();
    const { ApiError } = await import("./apiError");
    const err = await apiClient.withdrawBid("l1", "b1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).code).toBe("FAILED_PRECONDITION");
  });
});

describe("apiClient.withdrawListing (FS-V7A5S req 13)", () => {
  it("should DELETE the listing and resolve on a 204 with an empty body", async () => {
    answer = empty(204);
    const { apiClient } = await loadApi();
    await expect(apiClient.withdrawListing("l1")).resolves.toBeUndefined();
    expect(requests[0].method).toBe("DELETE");
    expect(new URL(requests[0].url).pathname).toBe("/api/marketplace/listings/l1");
  });

  it("should throw the problem's code on a refusal", async () => {
    answer = () =>
      new Response(
        JSON.stringify({ status: 400, detail: "too late", code: "LISTING_WITHDRAW_LOCKED", errors: [] }),
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    const { apiClient } = await loadApi();
    const { ApiError } = await import("./apiError");
    const err = await apiClient.withdrawListing("l1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).code).toBe("LISTING_WITHDRAW_LOCKED");
  });
});

describe("apiClient.moveItemInstance (FS-VPD8Y R22, R42)", () => {
  it("should PUT the location to the instance's location route and return the echo", async () => {
    answer = () =>
      new Response(
        JSON.stringify({
          statusCode: 200,
          message: "ok",
          result: { id: "i1", location: "stash" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const { apiClient } = await loadApi();
    const res = await apiClient.moveItemInstance("i1", "stash");
    expect(requests[0].method).toBe("PUT");
    expect(new URL(requests[0].url).pathname).toBe(
      "/api/items/instances/i1/location",
    );
    expect(await requests[0].json()).toEqual({ location: "stash" });
    expect(res.result).toEqual({ id: "i1", location: "stash" });
  });

  it("should throw the refusal's code", async () => {
    answer = () =>
      new Response(
        JSON.stringify({ status: 400, detail: "full", code: "STASH_FULL", errors: [] }),
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    const { apiClient } = await loadApi();
    const { ApiError } = await import("./apiError");
    const err = await apiClient.moveItemInstance("i1", "stash").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).code).toBe("STASH_FULL");
  });
});

describe("apiClient (FS-TVCZQ req 6)", () => {
  it("should offer no photo upload call", async () => {
    const { apiClient } = await loadApi();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(apiClient));
    expect(methods.filter((name) => /upload/i.test(name))).toEqual([]);
  });
});
