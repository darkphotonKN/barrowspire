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
});

describe("publicApi.getListing", () => {
  it("should read one listing without a token", async () => {
    answer = () =>
      new Response(JSON.stringify({ id: "l1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const { publicApi } = await loadApi();
    await expect(publicApi.getListing("l1")).resolves.toEqual({ id: "l1" });
    expect(new URL(requests[0].url).pathname).toBe("/api/marketplace/listings/l1");
    expect(requests[0].headers.get("Authorization")).toBeNull();
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
