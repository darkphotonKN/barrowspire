/**
 * The credential rules the register and profile pages mirror (FS-V6SFK §H).
 *
 * auth-service owns the password policy (ADR-0041). The client mirrors only
 * the length floor so a too-short password is caught before submit; the
 * 72-byte ceiling and the common-password list stay server-side, and their
 * refusals arrive as codes mapped below.
 */

/** The floor, counted in Unicode code points to match auth-service. */
export const PASSWORD_MIN_CHARS = 10;

/** Shown under the password field so the rule is known before submitting. */
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_CHARS} characters. Length matters more than symbols.`;

/**
 * Whether a password meets the length floor. Spread iterates code points, so
 * an astral character counts once, as it does in auth's utf8.RuneCount.
 */
export function meetsPasswordMinimum(password: string): boolean {
  return [...password].length >= PASSWORD_MIN_CHARS;
}

/** The three password refusals, wherever a password is set. */
export const PASSWORD_REFUSAL_MESSAGES: Record<string, string> = {
  PASSWORD_TOO_SHORT: `Password must be at least ${PASSWORD_MIN_CHARS} characters.`,
  PASSWORD_TOO_LONG: "Password is too long. Use a shorter one.",
  PASSWORD_TOO_COMMON:
    "That password is too common. Choose something less guessable.",
};

/** Signup's refusals: the password ones plus a malformed email. */
export const SIGNUP_REFUSAL_MESSAGES: Record<string, string> = {
  ...PASSWORD_REFUSAL_MESSAGES,
  EMAIL_INVALID: "Please enter a valid email address.",
};
