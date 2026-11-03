/**
 * The verification panel's three actions (FS-V6SFK §Requirements 35–37), kept
 * free of React so their effect on the stores is testable on its own.
 *
 * Each answers an outcome the panel renders as-is: a notice on success, a
 * message on refusal. Refusal codes map through VERIFICATION_REFUSAL_MESSAGES;
 * a code it does not know falls through to the server's detail.
 */
import type { components } from "@/api/generated/schema";
import { ApiError, userMessage } from "@/utils/apiError";
import {
  isVerificationCode,
  VERIFICATION_REFUSAL_MESSAGES,
} from "@/utils/emailVerification";

type LoginResult = components["schemas"]["LoginResult"];
type Member = components["schemas"]["Member"];

/** The calls the panel makes, as `apiClient` offers them. */
export interface VerificationApi {
  verifyEmail(code: string): Promise<LoginResult>;
  resendVerification(): Promise<void>;
  changeEmail(email: string): Promise<Member>;
}

export interface VerificationDeps {
  api: VerificationApi;
  auth: {
    applyLoginResult(result: LoginResult): boolean;
    updateMemberInfo(updates: Partial<Member>): void;
  };
  session: { markCodeSent(at: number): void };
  now: () => number;
}

/**
 * `signIn` marks the one refusal a fresh session fixes: already verified while
 * this session's access token still lacks the claim (R23). The panel offers a
 * sign-in for it.
 */
export type VerificationOutcome =
  | { ok: true; notice: string }
  | { ok: false; message: string; signIn?: true };

const NO_ANSWER = "The Spire did not answer. Try again.";

function refusalCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.code : undefined;
}

function refused(err: unknown): VerificationOutcome {
  if (!(err instanceof ApiError)) return { ok: false, message: NO_ANSWER };
  const message = userMessage(err, VERIFICATION_REFUSAL_MESSAGES);
  // The stored member is left unverified: flipping it would hide the banner
  // while the token still fails the marketplace gate.
  return err.code === "EMAIL_ALREADY_VERIFIED"
    ? { ok: false, message, signIn: true }
    : { ok: false, message };
}

/**
 * A refusal resend and change-email share: the cooldown is live, so the
 * countdown starts from now.
 */
function absorbIssueRefusal(err: unknown, deps: VerificationDeps): void {
  if (refusalCode(err) === "VERIFICATION_RESEND_TOO_SOON") {
    deps.session.markCodeSent(deps.now());
  }
}

/** Verify with a typed code, swapping in the fresh session on success (R37). */
export async function verifyCode(
  typed: string,
  deps: VerificationDeps,
): Promise<VerificationOutcome> {
  const trimmed = typed.trim();
  if (!isVerificationCode(trimmed)) {
    return { ok: false, message: "Enter the 6-digit code from the email." };
  }
  try {
    const result = await deps.api.verifyEmail(trimmed);
    if (!deps.auth.applyLoginResult(result))
      return { ok: false, message: NO_ANSWER };
    return { ok: true, notice: "Your email is verified." };
  } catch (err) {
    return refused(err);
  }
}

/** Ask for a new code, starting the shared countdown. */
export async function resendCode(
  deps: VerificationDeps,
): Promise<VerificationOutcome> {
  try {
    await deps.api.resendVerification();
    deps.session.markCodeSent(deps.now());
    return { ok: true, notice: "A new code is on its way." };
  } catch (err) {
    absorbIssueRefusal(err, deps);
    return refused(err);
  }
}

/** Change the unverified email; a code goes to the new address. */
export async function changeEmail(
  typed: string,
  deps: VerificationDeps,
): Promise<VerificationOutcome> {
  const email = typed.trim();
  if (email === "") {
    return { ok: false, message: VERIFICATION_REFUSAL_MESSAGES.EMAIL_INVALID };
  }
  try {
    const member = await deps.api.changeEmail(email);
    deps.auth.updateMemberInfo(member);
    deps.session.markCodeSent(deps.now());
    return {
      ok: true,
      notice: `A code is on its way to ${member.email ?? email}.`,
    };
  } catch (err) {
    absorbIssueRefusal(err, deps);
    return refused(err);
  }
}
