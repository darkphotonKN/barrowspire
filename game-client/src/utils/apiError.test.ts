import { describe, it, expect } from "vitest";
import { ApiError, fromProblem, readApiError, userMessage } from "./apiError";

// A problem+json body exactly as the gateway seam emits it (FS-0001 §API surface).
function problem(overrides: Record<string, unknown> = {}) {
  return {
    type: "about:blank",
    title: "Unauthorized",
    status: 401,
    detail: "Your session has expired.",
    code: "UNAUTHENTICATED",
    errors: [],
    ...overrides,
  };
}

describe("fromProblem", () => {
  it("carries the domain code and surfaces detail as the error message", () => {
    const err = fromProblem(401, problem());

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("UNAUTHENTICATED");
    expect(err.message).toBe("Your session has expired.");
  });

  // A 502 from a proxy, an HTML error page, or a gateway that never answered
  // never passes through the seam, so it carries no problem body. The parser must
  // still yield a usable error rather than one with undefined members.
  it("falls back to a usable error when the body is not a problem document", () => {
    const err = fromProblem(502, null);

    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.status).toBe(502);
    expect(err.message).not.toBe("");
    expect(err.errors).toEqual([]);
  });
});

describe("userMessage", () => {
  // Adding a code is explicitly non-breaking (ADR-0001 §6), so the client will
  // meet codes it has never heard of. It must degrade, not fail.
  it("falls back to the server's detail on a code it does not recognise", () => {
    const err = fromProblem(
      409,
      problem({ code: "SEAT_ALREADY_TAKEN", detail: "That seat is taken." }),
    );

    const text = userMessage(err, { UNAUTHENTICATED: "Please sign in again." });

    expect(text).toBe("That seat is taken.");
  });

  it("prefers the caller's wording for a code it does recognise", () => {
    const err = fromProblem(401, problem());

    const text = userMessage(err, { UNAUTHENTICATED: "Wrong email or password." });

    expect(text).toBe("Wrong email or password.");
  });
});

describe("errors[]", () => {
  it("preserves field-level detail when the server sends it", () => {
    const err = fromProblem(
      400,
      problem({
        status: 400,
        code: "VALIDATION_FAILED",
        errors: [{ field: "email", message: "must be a valid address" }],
      }),
    );

    expect(err.errors).toHaveLength(1);
    expect(err.errors[0].field).toBe("email");
  });

  // FS-0001 §API surface: errors[] is always present. Callers iterate it without a
  // null check, so it must be an array for every input this parser can meet.
  it.each([null, undefined, {}, { errors: null }, { errors: "nope" }])(
    "is always an array (body: %s)",
    (body) => {
      expect(Array.isArray(fromProblem(500, body).errors)).toBe(true);
    },
  );
});

describe("readApiError", () => {
  // An nginx 502 page is HTML, so response.json() rejects. Throwing a SyntaxError
  // on top of the real failure loses the status and shows the user a parser error.
  it("survives a body that is not JSON", async () => {
    const response = {
      status: 502,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    } as unknown as Response;

    const err = await readApiError(response);

    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.status).toBe(502);
    expect(err.errors).toEqual([]);
  });
});
