import { describe, it, expect } from "vitest";
import {
  PASSWORD_HINT,
  PASSWORD_MIN_CHARS,
  PASSWORD_REFUSAL_MESSAGES,
  SIGNUP_REFUSAL_MESSAGES,
  meetsPasswordMinimum,
} from "./credentialRules";
import { fromProblem, userMessage } from "./apiError";

// FS-V6SFK §Requirements 33: the client mirrors only the length floor,
// counted in code points like auth-service, and leaves the blocklist to auth.
describe("meetsPasswordMinimum", () => {
  it("refuses 9 characters and accepts 10", () => {
    expect(meetsPasswordMinimum("abcdefghi")).toBe(false);
    expect(meetsPasswordMinimum("abcdefghij")).toBe(true);
  });

  it("counts code points, not UTF-16 units", () => {
    // 5 astral characters are 10 UTF-16 units but only 5 characters
    expect("𐍈".repeat(5).length).toBe(10);
    expect(meetsPasswordMinimum("𐍈".repeat(5))).toBe(false);
    expect(meetsPasswordMinimum("𐍈".repeat(10))).toBe(true);
    expect(meetsPasswordMinimum("𐍈".repeat(9))).toBe(false);
  });

  it("does not apply the blocklist client-side", () => {
    expect(meetsPasswordMinimum("password123")).toBe(true);
  });
});

describe("PASSWORD_HINT", () => {
  it("states the minimum so the rule is known up front", () => {
    expect(PASSWORD_HINT).toContain(String(PASSWORD_MIN_CHARS));
  });
});

// FS-V6SFK §Requirements 33-34: each refusal code maps to its own plain message.
describe("refusal messages", () => {
  const passwordCodes = [
    "PASSWORD_TOO_SHORT",
    "PASSWORD_TOO_LONG",
    "PASSWORD_TOO_COMMON",
  ];

  it.each(passwordCodes)("password change maps %s", (code) => {
    const msg = userMessage(
      fromProblem(400, { code, detail: "Bad Request" }),
      PASSWORD_REFUSAL_MESSAGES,
    );
    expect(msg).not.toBe("Bad Request");
  });

  it.each([...passwordCodes, "EMAIL_INVALID"])("signup maps %s", (code) => {
    const msg = userMessage(
      fromProblem(400, { code, detail: "Bad Request" }),
      SIGNUP_REFUSAL_MESSAGES,
    );
    expect(msg).not.toBe("Bad Request");
  });

  it("gives every code a distinct message", () => {
    const messages = Object.values(SIGNUP_REFUSAL_MESSAGES);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("names the minimum in the too-short message", () => {
    expect(PASSWORD_REFUSAL_MESSAGES.PASSWORD_TOO_SHORT).toContain(
      String(PASSWORD_MIN_CHARS),
    );
  });
});
