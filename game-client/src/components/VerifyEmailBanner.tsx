"use client";

import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useVerificationStore } from "@/stores/verificationStore";
import { showsVerifyBanner } from "@/utils/emailVerification";
import VerificationPanel from "./VerificationPanel";

/**
 * The unverified banner (FS-V6SFK R36): across the signed-in app while the
 * stored member is unverified. Hide collapses it until the next page load. It
 * unmounts the moment verify swaps in a verified member (R37).
 *
 * Its panel's open state lives in the verification store, so the marketplace's
 * verify prompt opens it in place (R38). While open it is raised over the
 * Bazaar's dialog and drawer, which is where that prompt is pressed.
 */
export default function VerifyEmailBanner() {
  const pathname = usePathname();
  const member = useAuthStore((s) => s.memberInfo);
  const collapsed = useVerificationStore((s) => s.bannerCollapsed);
  const open = useVerificationStore((s) => s.panelOpen);
  const { collapseBanner, openPanel, closePanel } =
    useVerificationStore.getState();

  if (!showsVerifyBanner({ pathname, member, collapsed })) return null;

  return (
    <section
      className={`verify-banner${open ? " verify-banner--raised" : ""}`}
      aria-label="Email verification"
    >
      <div className="verify-banner-bar">
        <p className="verify-banner-text">
          Your email is unverified. Verify it to trade in the Bazaar.
        </p>
        <div className="verify-banner-actions">
          <button
            type="button"
            className="btn-secondary"
            aria-expanded={open}
            onClick={open ? closePanel : openPanel}
          >
            {open ? "Close" : "Verify email"}
          </button>
          <button
            type="button"
            className="verify-link"
            onClick={collapseBanner}
          >
            Hide
          </button>
        </div>
      </div>
      {open && <VerificationPanel autoFocus />}
    </section>
  );
}
