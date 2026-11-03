import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./authStore";

// FS-V6SFK §Requirements 37: verify answers a fresh LoginResult, and the client
// swaps it in so the email_verified claim is live without a new login.

const unverified = {
  id: "m-1",
  name: "Aldric",
  email: "aldric@example.com",
  email_verified: false,
};

describe("authStore.applyLoginResult", () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      memberInfo: unverified,
    });
  });

  it("replaces the tokens and the member, so email_verified becomes true", () => {
    const applied = useAuthStore.getState().applyLoginResult({
      access_token: "new-access",
      refresh_token: "new-refresh",
      member_info: { ...unverified, email_verified: true },
    });

    const state = useAuthStore.getState();
    expect(applied).toBe(true);
    expect(state.accessToken).toBe("new-access");
    expect(state.refreshToken).toBe("new-refresh");
    expect(state.memberInfo?.email_verified).toBe(true);
    expect(state.isAuthenticated).toBe(true);
  });

  it.each([
    ["no access token", { refresh_token: "r", member_info: unverified }],
    ["no refresh token", { access_token: "a", member_info: unverified }],
    ["no member", { access_token: "a", refresh_token: "r" }],
  ])("keeps the old session when the result has %s", (_, result) => {
    const applied = useAuthStore.getState().applyLoginResult(result);

    const state = useAuthStore.getState();
    expect(applied).toBe(false);
    expect(state.accessToken).toBe("old-access");
    expect(state.refreshToken).toBe("old-refresh");
    expect(state.memberInfo?.email_verified).toBe(false);
  });
});
