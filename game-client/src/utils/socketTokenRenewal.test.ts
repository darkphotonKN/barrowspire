import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtWith } from "./jwt.fixture";

/**
 * FS-ZPX58 R27: every successful renewal hands the new access token to the open game socket, so
 * the pod's held token (the one it reads the player's gear with) is renewed too.
 */

const OLD = jwtWith({ sub: "m-1", exp: 1_800_000_000 });
const NEW = jwtWith({ sub: "m-1", exp: 1_800_003_600 });

let stored: Map<string, string>;
let route: (req: Request) => Response;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function load() {
  vi.resetModules();
  const api = await import("./api");
  const { forwardRenewedTokens } = await import("./socketTokenRenewal");
  const { useAuthStore } = await import("@/stores/authStore");
  const socket = { renewToken: vi.fn() };
  const stop = forwardRenewedTokens(useAuthStore.subscribe, socket);
  return { api, socket, stop, useAuthStore };
}

beforeEach(() => {
  stored = new Map([
    ["auth-storage", JSON.stringify({ state: { accessToken: OLD, refreshToken: "r-1", memberInfo: { id: "m-1" }, isAuthenticated: true }, version: 0 })],
  ]);
  vi.stubGlobal("window", { location: { pathname: "/game", href: "/game" } });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  });
  vi.stubGlobal("fetch", async (req: Request) => route(req));
  route = (req) => {
    if (new URL(req.url).pathname === "/api/member/refresh") {
      return json(200, { access_token: NEW, access_expires_in: 3600, member_info: { id: "m-1" } });
    }
    return req.headers.get("Authorization") === `Bearer ${NEW}`
      ? json(200, {})
      : json(401, { status: 401, code: "UNAUTHENTICATED", detail: "expired", errors: [] });
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forwardRenewedTokens", () => {
  it("should hand the socket the token a 401's renewal stored", async () => {
    const { api, socket } = await load();

    await api.apiClient.getWalletAccount();

    expect(socket.renewToken).toHaveBeenCalledTimes(1);
    expect(socket.renewToken).toHaveBeenCalledWith(NEW);
  });

  it("should hand the socket the token the proactive renewal stored", async () => {
    const { api, socket } = await load();

    await api.renewSession();

    expect(socket.renewToken).toHaveBeenCalledWith(NEW);
  });

  it("should hand nothing when the store changes but the access token does not, or on sign-out", async () => {
    const { socket, useAuthStore } = await load();

    useAuthStore.getState().updateMemberInfo({ name: "Ash" });
    useAuthStore.getState().logout();

    expect(socket.renewToken).not.toHaveBeenCalled();
  });

  it("should stop handing tokens once stopped", async () => {
    const { api, socket, stop } = await load();

    stop();
    await api.renewSession();

    expect(socket.renewToken).not.toHaveBeenCalled();
  });
});
