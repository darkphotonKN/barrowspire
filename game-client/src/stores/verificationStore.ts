import { create } from "zustand";

/**
 * Email-verification state for one page session (FS-V6SFK §Requirements 35–38).
 *
 * Deliberately not persisted: a collapsed banner comes back on reload (R36), and
 * the resend countdown is only a courtesy over auth-service's own cooldown (R15).
 * Shared so the banner's panel and the profile's panel count down together, and
 * so the marketplace's verify prompt can open the banner's panel in place (R38).
 */
interface VerificationState {
  /** The banner is hidden until the next page load. */
  bannerCollapsed: boolean;
  /** The banner shows its verification panel. */
  panelOpen: boolean;
  /** Epoch ms when this session last saw a code issued; null when none was. */
  codeSentAt: number | null;
  collapseBanner: () => void;
  /** Opens the banner's panel, bringing a collapsed banner back to show it. */
  openPanel: () => void;
  closePanel: () => void;
  markCodeSent: (at: number) => void;
}

export function createVerificationStore() {
  return create<VerificationState>()((set) => ({
    bannerCollapsed: false,
    panelOpen: false,
    codeSentAt: null,
    collapseBanner: () => set({ bannerCollapsed: true, panelOpen: false }),
    openPanel: () => set({ panelOpen: true, bannerCollapsed: false }),
    closePanel: () => set({ panelOpen: false }),
    markCodeSent: (at) => set({ codeSentAt: at }),
  }));
}

export const useVerificationStore = createVerificationStore();
