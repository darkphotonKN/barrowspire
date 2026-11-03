import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  needsEmailVerification,
  VERIFICATION_REFUSAL_MESSAGES,
} from "@/utils/emailVerification";
import { useAuthStore } from "@/stores/authStore";
import { createVerificationStore } from "@/stores/verificationStore";
import {
  changeEmail,
  resendCode,
  verifyCode,
  type VerificationApi,
  type VerificationDeps,
} from "./verificationFlow";

// FS-V6SFK §Requirements 35–37: what the panel's three actions do to the stores.

const NOW = 5_000_000;

const unverified = {
  id: "m-1",
  name: "Aldric",
  email: "aldric@example.com",
  email_verified: false,
};

const refusal = (code: string, status = 400) =>
  new ApiError({ code, status, detail: "server prose", errors: [] });

let api: { [K in keyof VerificationApi]: ReturnType<typeof vi.fn> };
let session: ReturnType<typeof createVerificationStore>;
let deps: VerificationDeps;

beforeEach(() => {
  useAuthStore.getState().setAuth({
    accessToken: "old-access",
    refreshToken: "old-refresh",
    memberInfo: unverified,
  });
  session = createVerificationStore();
  api = {
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    changeEmail: vi.fn(),
  };
  deps = {
    api: api as unknown as VerificationApi,
    auth: useAuthStore.getState(),
    session: session.getState(),
    now: () => NOW,
  };
});

describe("verifyCode", () => {
  it("swaps in the fresh pair, so the member no longer needs verifying (the banner unmounts)", async () => {
    api.verifyEmail.mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      member_info: { ...unverified, email_verified: true },
    });

    const outcome = await verifyCode("123456", deps);

    expect(outcome.ok).toBe(true);
    expect(api.verifyEmail).toHaveBeenCalledWith("123456");
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("new-access");
    expect(state.refreshToken).toBe("new-refresh");
    expect(needsEmailVerification(state.memberInfo)).toBe(false);
  });

  it("trims the typed code before checking and sending it", async () => {
    api.verifyEmail.mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      member_info: { ...unverified, email_verified: true },
    });
    await verifyCode(" 123456 ", deps);
    expect(api.verifyEmail).toHaveBeenCalledWith("123456");
  });

  it("refuses a code that is not 6 digits without calling the server", async () => {
    const outcome = await verifyCode("12345", deps);
    expect(outcome).toEqual({
      ok: false,
      message: expect.stringMatching(/6-digit/),
    });
    expect(api.verifyEmail).not.toHaveBeenCalled();
  });

  it.each(["VERIFICATION_CODE_INVALID", "VERIFICATION_CODE_EXPIRED"])(
    "maps %s and keeps the old session",
    async (code) => {
      api.verifyEmail.mockRejectedValue(refusal(code));
      const outcome = await verifyCode("123456", deps);
      expect(outcome).toEqual({
        ok: false,
        message: VERIFICATION_REFUSAL_MESSAGES[code],
      });
      expect(useAuthStore.getState().accessToken).toBe("old-access");
    },
  );

  it("reports an incomplete result rather than claiming success", async () => {
    api.verifyEmail.mockResolvedValue({ access_token: "a" });
    const outcome = await verifyCode("123456", deps);
    expect(outcome.ok).toBe(false);
    expect(useAuthStore.getState().accessToken).toBe("old-access");
  });

  it("degrades a failure that never reached the gateway to readable text", async () => {
    api.verifyEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    const outcome = await verifyCode("123456", deps);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).not.toBe("");
  });
});

describe("resendCode", () => {
  it("starts the cooldown when a new code is sent", async () => {
    api.resendVerification.mockResolvedValue(undefined);
    const outcome = await resendCode(deps);
    expect(outcome.ok).toBe(true);
    expect(session.getState().codeSentAt).toBe(NOW);
  });

  it("handles VERIFICATION_RESEND_TOO_SOON by starting the countdown too", async () => {
    api.resendVerification.mockRejectedValue(
      refusal("VERIFICATION_RESEND_TOO_SOON"),
    );
    const outcome = await resendCode(deps);
    expect(outcome).toEqual({
      ok: false,
      message: VERIFICATION_REFUSAL_MESSAGES.VERIFICATION_RESEND_TOO_SOON,
    });
    expect(session.getState().codeSentAt).toBe(NOW);
  });

  // The stored member stays unverified on purpose: its access token has no claim, so only a
  // fresh sign-in (or verify's fresh pair) makes marketplace writes work (R23).
  it("on EMAIL_ALREADY_VERIFIED, keeps the member as is and asks for a fresh sign-in", async () => {
    api.resendVerification.mockRejectedValue(refusal("EMAIL_ALREADY_VERIFIED"));
    const outcome = await resendCode(deps);
    expect(outcome).toEqual({
      ok: false,
      message: VERIFICATION_REFUSAL_MESSAGES.EMAIL_ALREADY_VERIFIED,
      signIn: true,
    });
    expect(useAuthStore.getState().memberInfo?.email_verified).toBe(false);
    expect(useAuthStore.getState().accessToken).toBe("old-access");
  });

  it("asks for a sign-in on no other refusal", async () => {
    api.resendVerification.mockRejectedValue(
      refusal("VERIFICATION_CODE_EXPIRED"),
    );
    const outcome = await resendCode(deps);
    expect(outcome).not.toHaveProperty("signIn");
  });
});

describe("changeEmail", () => {
  it("stores the updated address and starts the cooldown for the new code", async () => {
    api.changeEmail.mockResolvedValue({
      ...unverified,
      email: "fixed@example.com",
    });

    const outcome = await changeEmail("fixed@example.com", deps);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.notice).toContain("fixed@example.com");
    expect(useAuthStore.getState().memberInfo?.email).toBe("fixed@example.com");
    expect(session.getState().codeSentAt).toBe(NOW);
  });

  it("trims the address and refuses an empty one without calling the server", async () => {
    const outcome = await changeEmail("   ", deps);
    expect(outcome.ok).toBe(false);
    expect(api.changeEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["ALREADY_EXISTS", 409],
    ["EMAIL_INVALID", 400],
  ])("maps %s and leaves the stored email alone", async (code, status) => {
    api.changeEmail.mockRejectedValue(refusal(code, status));
    const outcome = await changeEmail("other@example.com", deps);
    expect(outcome).toEqual({
      ok: false,
      message: VERIFICATION_REFUSAL_MESSAGES[code],
    });
    expect(useAuthStore.getState().memberInfo?.email).toBe(
      "aldric@example.com",
    );
  });

  it("on EMAIL_ALREADY_VERIFIED, keeps the stored member and asks for a fresh sign-in", async () => {
    api.changeEmail.mockRejectedValue(refusal("EMAIL_ALREADY_VERIFIED"));
    const outcome = await changeEmail("other@example.com", deps);
    expect(outcome).toEqual({
      ok: false,
      message: VERIFICATION_REFUSAL_MESSAGES.EMAIL_ALREADY_VERIFIED,
      signIn: true,
    });
    expect(useAuthStore.getState().memberInfo).toEqual(unverified);
  });

  it("handles VERIFICATION_RESEND_TOO_SOON by starting the countdown", async () => {
    api.changeEmail.mockRejectedValue(refusal("VERIFICATION_RESEND_TOO_SOON"));
    await changeEmail("other@example.com", deps);
    expect(session.getState().codeSentAt).toBe(NOW);
  });
});
