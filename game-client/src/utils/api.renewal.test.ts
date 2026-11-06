import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtWith } from "./jwt.fixture";

/**
 * FS-ZPX58 §C: an authenticated call refused with 401 renews the session once and is sent again;
 * only a refused renewal signs the player out.
 */

type Api = typeof import("./api");

const OLD = jwtWith({ sub: "m-1", exp: 1_800_000_000 });
const NEW = jwtWith({ sub: "m-1", exp: 1_800_003_600 });
const REFRESH = "refresh-token-1";

const requests: Request[] = [];
let route: (req: Request) => Response | Promise<Response>;
let stored: Map<string, string>;
let win: { location: { pathname: string; href: string } };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ status, detail: code, code, errors: [] }), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
const renewed = (access = NEW) =>
  json(200, {
    access_token: access,
    access_expires_in: 3600,
    member_info: { id: "m-1", name: "Ash", email_verified: true },
  });

/** The browser's stored session, exactly as the persisted auth store writes it. */
function storeSession(state: Record<string, unknown>) {
  stored.set("auth-storage", JSON.stringify({ state, version: 0 }));
}
function storedState(): Record<string, any> {
  return JSON.parse(stored.get("auth-storage") ?? "{}").state ?? {};
}

const isRefresh = (req: Request) => new URL(req.url).pathname === "/api/member/refresh";
const isWallet = (req: Request) => new URL(req.url).pathname === "/api/wallet/account";
const bearer = (req: Request) => req.headers.get("Authorization");

async function loadApi(): Promise<Api> {
  vi.resetModules();
  return import("./api");
}

beforeEach(() => {
  requests.length = 0;
  stored = new Map();
  win = { location: { pathname: "/game", href: "/game" } };
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  });
  vi.stubGlobal("fetch", async (req: Request) => {
    requests.push(req.clone());
    return route(req);
  });
  storeSession({
    accessToken: OLD,
    refreshToken: REFRESH,
    memberInfo: { id: "m-1", name: "Ash", email_verified: false },
    isAuthenticated: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiClient renews on a 401 (FS-ZPX58 R13, R16, R17)", () => {
  it("should renew once, store the new access token and send the call again with it", async () => {
    route = (req) => {
      if (isRefresh(req)) return renewed();
      return bearer(req) === `Bearer ${NEW}` ? json(200, { id: "acc-1", balance: 40 }) : problem(401, "UNAUTHENTICATED");
    };
    const { apiClient } = await loadApi();

    await expect(apiClient.getWalletAccount()).resolves.toMatchObject({ balance: 40 });

    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      "/api/wallet/account",
      "/api/member/refresh",
      "/api/wallet/account",
    ]);
    expect(bearer(requests[0])).toBe(`Bearer ${OLD}`);
    expect(bearer(requests[2])).toBe(`Bearer ${NEW}`);
    expect(storedState().accessToken).toBe(NEW);
    expect(storedState().refreshToken).toBe(REFRESH);
    expect(storedState().memberInfo.email_verified).toBe(true);
    expect(win.location.href).toBe("/game");
  });

  it("should send the refresh token through the unauthenticated client, in the body", async () => {
    route = (req) => (isRefresh(req) ? renewed() : bearer(req) === `Bearer ${NEW}` ? json(200, {}) : problem(401, "UNAUTHENTICATED"));
    const { apiClient } = await loadApi();

    await apiClient.getWalletAccount();

    const refresh = requests.find(isRefresh)!;
    expect(refresh.method).toBe("POST");
    expect(bearer(refresh)).toBeNull();
    expect(await refresh.json()).toEqual({ refresh_token: REFRESH });
  });

  it("should resend a write's body on the retry", async () => {
    route = (req) =>
      isRefresh(req) ? renewed() : bearer(req) === `Bearer ${NEW}` ? new Response(null, { status: 201 }) : problem(401, "UNAUTHENTICATED");
    const { apiClient } = await loadApi();

    await apiClient.placeBid("l1", 60, "key-1");

    const bids = requests.filter((r) => !isRefresh(r));
    expect(bids).toHaveLength(2);
    expect(await bids[1].json()).toEqual({ amount: 60 });
    expect(bids[1].headers.get("Idempotency-Key")).toBe("key-1");
  });

  it("should share one renewal between parallel 401s (R14)", async () => {
    route = (req) => (isRefresh(req) ? renewed() : bearer(req) === `Bearer ${NEW}` ? json(200, {}) : problem(401, "UNAUTHENTICATED"));
    const { apiClient } = await loadApi();

    await Promise.all([apiClient.getWalletAccount(), apiClient.getLoadout(), apiClient.getItemInstances()]);

    expect(requests.filter(isRefresh)).toHaveLength(1);
  });

  it("should retry without renewing when the token was replaced while the call was out (R15)", async () => {
    route = (req) => {
      if (isRefresh(req)) return renewed();
      if (bearer(req) === `Bearer ${NEW}`) return json(200, {});
      // another call's renewal lands while this one is on the wire
      storeSession({ ...storedState(), accessToken: NEW });
      return problem(401, "UNAUTHENTICATED");
    };
    const { apiClient } = await loadApi();

    await apiClient.getWalletAccount();

    expect(requests.filter(isRefresh)).toHaveLength(0);
    expect(bearer(requests[1])).toBe(`Bearer ${NEW}`);
  });

  it.each([
    ["the refresh route refuses it", () => problem(401, "UNAUTHENTICATED")],
    ["the refresh body is refused as shape", () => problem(422, "VALIDATION_FAILED")],
    ["the answer carries no access token", () => json(200, { access_expires_in: 3600 })],
  ])("should sign out and go to /login when %s", async (_label, refreshAnswer) => {
    route = (req) => (isRefresh(req) ? refreshAnswer() : problem(401, "UNAUTHENTICATED"));
    const { apiClient } = await loadApi();
    const { ApiError } = await import("./apiError");

    const err = await apiClient.getWalletAccount().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).status).toBe(401);
    expect(storedState().accessToken).toBeNull();
    expect(win.location.href).toBe("/login");
    expect(requests.filter(isWallet)).toHaveLength(1);
  });

  it("should sign out without calling the route when no refresh token is stored", async () => {
    storeSession({ ...storedState(), refreshToken: null });
    route = () => problem(401, "UNAUTHENTICATED");
    const { apiClient } = await loadApi();

    await apiClient.getWalletAccount().catch(() => undefined);

    expect(requests.filter(isRefresh)).toHaveLength(0);
    expect(win.location.href).toBe("/login");
  });

  it("should sign out when the retry is refused again", async () => {
    route = (req) => (isRefresh(req) ? renewed() : problem(401, "UNAUTHENTICATED"));
    const { apiClient } = await loadApi();

    await apiClient.getWalletAccount().catch(() => undefined);

    expect(requests.filter(isWallet)).toHaveLength(2);
    expect(requests.filter(isRefresh)).toHaveLength(1);
    expect(win.location.href).toBe("/login");
  });

  it.each([
    ["auth is down", () => problem(503, "SERVICE_UNAVAILABLE")],
    ["the network fails", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("should keep the session and throw the 401 when %s (R17 Unavailable)", async (_label, refreshAnswer) => {
    route = (req) => (isRefresh(req) ? refreshAnswer() : problem(401, "UNAUTHENTICATED"));
    const { apiClient } = await loadApi();
    const { ApiError } = await import("./apiError");

    const err = await apiClient.getWalletAccount().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).status).toBe(401);
    expect(storedState().accessToken).toBe(OLD);
    expect(win.location.href).toBe("/game");
  });

  it("should not renew on a refusal that is not a 401", async () => {
    route = () => problem(404, "NOT_FOUND");
    const { apiClient } = await loadApi();

    await apiClient.getWalletAccount().catch(() => undefined);

    expect(requests).toHaveLength(1);
  });
});

describe("renewSession (FS-ZPX58 R18)", () => {
  it("should renew the stored session on its own, for the proactive timer", async () => {
    route = (req) => (isRefresh(req) ? renewed() : problem(500, "INTERNAL_ERROR"));
    const { renewSession } = await loadApi();

    await expect(renewSession()).resolves.toBe("renewed");
    expect(storedState().accessToken).toBe(NEW);
  });

  it("should never sign out by itself, even refused: the next 401 does", async () => {
    route = () => problem(401, "UNAUTHENTICATED");
    const { renewSession } = await loadApi();

    await expect(renewSession()).resolves.toBe("refused");
    expect(storedState().accessToken).toBe(OLD);
    expect(win.location.href).toBe("/game");
  });
});
