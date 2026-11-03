import { describe, expect, it } from "vitest";
import { fromProblem, userMessage } from "./apiError";
import {
  RESEND_COOLDOWN_MS,
  VERIFICATION_REFUSAL_MESSAGES,
  isVerificationCode,
  needsEmailVerification,
  resendSecondsLeft,
  showsVerifyBanner,
} from "./emailVerification";

// FS-V6SFK §Requirements 35–36.

describe("needsEmailVerification", () => {
  it("is true only for an unverified member", () => {
    expect(needsEmailVerification({ email_verified: false })).toBe(true);
    expect(needsEmailVerification({ email_verified: true })).toBe(false);
  });

  it("is false when nobody is signed in", () => {
    expect(needsEmailVerification(null)).toBe(false);
  });

  it("reads a member stored before the field existed as unverified", () => {
    // Fails closed like the claim (R22): every member predating FS-V6SFK is unverified.
    expect(needsEmailVerification({ name: "Aldric" })).toBe(true);
  });
});

describe("isVerificationCode", () => {
  it.each([
    ["123456", true],
    ["000000", true],
    ["12345", false],
    ["1234567", false],
    ["12a456", false],
    [" 123456", false],
    ["", false],
  ])("%j → %s", (code, ok) => {
    expect(isVerificationCode(code)).toBe(ok);
  });
});

describe("resendSecondsLeft", () => {
  const sentAt = 1_000_000;

  it("uses a 60-second cooldown, matching auth-service", () => {
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
  });

  it("is 0 when no code was sent in this session", () => {
    expect(resendSecondsLeft(null, sentAt)).toBe(0);
  });

  it("counts down whole seconds, rounding up", () => {
    expect(resendSecondsLeft(sentAt, sentAt)).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt + 1)).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt + 59_001)).toBe(1);
  });

  it("is 0 once the cooldown has run", () => {
    expect(resendSecondsLeft(sentAt, sentAt + 60_000)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt + 120_000)).toBe(0);
  });
});

describe("VERIFICATION_REFUSAL_MESSAGES", () => {
  const codes = [
    "VERIFICATION_CODE_INVALID",
    "VERIFICATION_CODE_EXPIRED",
    "VERIFICATION_RESEND_TOO_SOON",
    "EMAIL_ALREADY_VERIFIED",
    "EMAIL_INVALID",
    "ALREADY_EXISTS",
  ];

  it.each(codes)(
    "maps %s to its own message over the server detail",
    (code) => {
      const err = fromProblem(400, {
        code,
        detail: "server prose",
        errors: [],
      });
      const message = userMessage(err, VERIFICATION_REFUSAL_MESSAGES);
      expect(message).not.toBe("server prose");
      expect(message).not.toBe("");
    },
  );

  it("gives every code a distinct message", () => {
    const messages = codes.map((c) => VERIFICATION_REFUSAL_MESSAGES[c]);
    expect(new Set(messages).size).toBe(codes.length);
  });

  it("tells an already-verified member to sign in again for a fresh session", () => {
    expect(VERIFICATION_REFUSAL_MESSAGES.EMAIL_ALREADY_VERIFIED).toBe(
      "Your email is already verified. Sign in again to refresh your session.",
    );
  });

  it("tells an expired code to ask for a new one", () => {
    expect(VERIFICATION_REFUSAL_MESSAGES.VERIFICATION_CODE_EXPIRED).toMatch(
      /new code/i,
    );
  });
});

describe("showsVerifyBanner", () => {
  const unverified = { email_verified: false };
  const base = { pathname: "/game", member: unverified, collapsed: false };

  it("shows for an unverified member across the signed-in app", () => {
    expect(showsVerifyBanner(base)).toBe(true);
    expect(showsVerifyBanner({ ...base, pathname: "/marketplace" })).toBe(true);
    expect(showsVerifyBanner({ ...base, pathname: "/" })).toBe(true);
  });

  it("hides for a verified member and when signed out", () => {
    expect(
      showsVerifyBanner({ ...base, member: { email_verified: true } }),
    ).toBe(false);
    expect(showsVerifyBanner({ ...base, member: null })).toBe(false);
  });

  it("hides once collapsed for the session", () => {
    expect(showsVerifyBanner({ ...base, collapsed: true })).toBe(false);
  });

  it.each(["/login", "/register", "/portal", "/profile"])(
    "hides on %s (no header there, or the page hosts the panel itself)",
    (pathname) => {
      expect(showsVerifyBanner({ ...base, pathname })).toBe(false);
    },
  );
});
