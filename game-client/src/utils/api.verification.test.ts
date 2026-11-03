import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The email-verification calls (FS-V6SFK §API surface): verify answers a bare
 * LoginResult, resend a 204 with no body, change-email a bare Member.
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

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const problem = (status: number, code: string) => () =>
  new Response(
    JSON.stringify({ status, detail: "server prose", code, errors: [] }),
    {
      status,
      headers: { "Content-Type": "application/problem+json" },
    },
  );

describe("apiClient.verifyEmail", () => {
  it("should POST the code and return the bare LoginResult", async () => {
    const result = {
      access_token: "a",
      refresh_token: "r",
      member_info: { email_verified: true },
    };
    answer = json(200, result);
    const { apiClient } = await loadApi();

    await expect(apiClient.verifyEmail("123456")).resolves.toEqual(result);
    expect(requests[0].method).toBe("POST");
    expect(new URL(requests[0].url).pathname).toBe("/api/member/email/verify");
    expect(await requests[0].json()).toEqual({ code: "123456" });
  });

  it("should throw the refusal's code", async () => {
    answer = problem(400, "VERIFICATION_CODE_INVALID");
    const { apiClient } = await loadApi();
    const err = await apiClient.verifyEmail("000000").catch((e: unknown) => e);
    expect((err as { code: string }).code).toBe("VERIFICATION_CODE_INVALID");
  });
});

describe("apiClient.resendVerification", () => {
  it("should POST with no body and resolve on a 204", async () => {
    answer = () => new Response(null, { status: 204 });
    const { apiClient } = await loadApi();

    await expect(apiClient.resendVerification()).resolves.toBeUndefined();
    expect(requests[0].method).toBe("POST");
    expect(new URL(requests[0].url).pathname).toBe("/api/member/email/resend");
  });

  it("should throw VERIFICATION_RESEND_TOO_SOON", async () => {
    answer = problem(400, "VERIFICATION_RESEND_TOO_SOON");
    const { apiClient } = await loadApi();
    const err = await apiClient.resendVerification().catch((e: unknown) => e);
    expect((err as { code: string }).code).toBe("VERIFICATION_RESEND_TOO_SOON");
  });
});

describe("apiClient.changeEmail", () => {
  it("should PUT the email and return the bare Member", async () => {
    const member = { email: "new@example.com", email_verified: false };
    answer = json(200, member);
    const { apiClient } = await loadApi();

    await expect(apiClient.changeEmail("new@example.com")).resolves.toEqual(
      member,
    );
    expect(requests[0].method).toBe("PUT");
    expect(new URL(requests[0].url).pathname).toBe("/api/member/email");
    expect(await requests[0].json()).toEqual({ email: "new@example.com" });
  });

  it("should throw ALREADY_EXISTS on a 409", async () => {
    answer = problem(409, "ALREADY_EXISTS");
    const { apiClient } = await loadApi();
    const err = await apiClient
      .changeEmail("taken@example.com")
      .catch((e: unknown) => e);
    expect((err as { code: string; status: number }).code).toBe(
      "ALREADY_EXISTS",
    );
    expect((err as { status: number }).status).toBe(409);
  });
});
