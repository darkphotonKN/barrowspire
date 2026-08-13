import type { components } from "@/api/generated/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Derived from the generated contract rather than hand-declared. The previous
// hand-written version claimed created_at was a string; the gateway sends a
// protobuf {seconds, nanos} object, and every field is optional. Caught by the
// generated types during the FS-0002 client cutover.
type MemberInfo = components["schemas"]["Member"];

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