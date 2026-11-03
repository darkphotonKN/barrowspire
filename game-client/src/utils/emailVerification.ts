/**
 * The rules the verification panel and banner share (FS-V6SFK §H).
 *
 * auth-service owns verification (ADR-0043): the code, its lifetime and the
 * resend cooldown are enforced there. The client mirrors the code's shape and the
 * cooldown only so a bad submit or a hammered button is caught before a round
 * trip; the server's refusals arrive as codes mapped below.
 */
import type { components } from "@/api/generated/schema";

type Member = components["schemas"]["Member"];

/** auth-service's resend cooldown (R15), mirrored for the countdown. */
export const RESEND_COOLDOWN_MS = 60_000;

const CODE_PATTERN = /^\d{6}$/;

/** Whether a string is shaped like a verification code: exactly 6 digits. */
export function isVerificationCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/**
 * Whether the signed-in member still has to verify. A member stored before
 * `email_verified` existed reads as unverified: absent means false, as the claim
 * does (R22), and every member predating FS-V6SFK is unverified.
 */
export function needsEmailVerification(
  member: Partial<Member> | null,
): boolean {
  return member !== null && member.email_verified !== true;
}

/**
 * Routes the banner stays off: the pre-auth and portal pages carry no header,
 * and the profile page hosts the verification panel itself (R36).
 */
const BANNER_HIDDEN_ON = new Set([
  "/login",
  "/register",
  "/portal",
  "/profile",
]);

/** Whether the unverified banner shows on this route for this member (R36). */
export function showsVerifyBanner(args: {
  pathname: string;
  member: Partial<Member> | null;
  collapsed: boolean;
}): boolean {
  return (
    !args.collapsed &&
    !BANNER_HIDDEN_ON.has(args.pathname) &&
    needsEmailVerification(args.member)
  );
}

/**
 * Whole seconds until resend is allowed again, rounding up so the button never
 * reads 0 while still disabled. `sentAt` is when this session last saw a code
 * issued; null means none was, so nothing is known to block a resend.
 */
export function resendSecondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  const remaining = sentAt + RESEND_COOLDOWN_MS - now;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** The verify, resend and change-email refusals (R35). */
export const VERIFICATION_REFUSAL_MESSAGES: Record<string, string> = {
  VERIFICATION_CODE_INVALID:
    "That code is wrong. Check the email and try again.",
  VERIFICATION_CODE_EXPIRED:
    "That code has expired or was used up. Send a new code.",
  VERIFICATION_RESEND_TOO_SOON:
    "A code was sent moments ago. Wait a minute before asking again.",
  EMAIL_ALREADY_VERIFIED:
    "Your email is already verified. Sign in again to refresh your session.",
  EMAIL_INVALID: "Please enter a valid email address.",
  ALREADY_EXISTS: "That email is already sworn to another player.",
};
