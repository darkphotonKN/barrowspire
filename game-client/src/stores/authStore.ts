import type { components } from "@/api/generated/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Derived from the generated contract rather than hand-declared. The previous
// hand-written version claimed created_at was a string; the gateway sends a
// protobuf {seconds, nanos} object, and every field is optional. Caught by the
// generated types during the FS-NTPW2 client cutover.
type MemberInfo = components["schemas"]["Member"];
type LoginResult = components["schemas"]["LoginResult"];

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  memberInfo: MemberInfo | null;
  isAuthenticated: boolean;
  setAuth: (data: {
    accessToken: string;
    refreshToken: string;
    memberInfo: MemberInfo;
  }) => void;
  /**
   * Swaps in the session a LoginResult carries (FS-V6SFK R37: verify hands back a
   * fresh pair whose access token holds the email_verified claim). Every field of
   * the generated type is optional, so an incomplete result leaves the current
   * session untouched and answers false.
   */
  applyLoginResult: (result: LoginResult) => boolean;
  updateMemberInfo: (memberInfo: Partial<MemberInfo>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      memberInfo: null,
      isAuthenticated: false,
      setAuth: (data) =>
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          memberInfo: data.memberInfo,
          isAuthenticated: true,
        }),
      applyLoginResult: (result) => {
        const { access_token, refresh_token, member_info } = result;
        if (!access_token || !refresh_token || !member_info) return false;
        set({
          accessToken: access_token,
          refreshToken: refresh_token,
          memberInfo: member_info,
          isAuthenticated: true,
        });
        return true;
      },
      updateMemberInfo: (updates) =>
        set((state) => ({
          memberInfo: state.memberInfo
            ? { ...state.memberInfo, ...updates }
            : null,
        })),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          memberInfo: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "auth-storage",
    },
  ),
);