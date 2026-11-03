"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useVerificationStore } from "@/stores/verificationStore";
import { apiClient } from "@/utils/api";
import { resendSecondsLeft } from "@/utils/emailVerification";
import {
  changeEmail,
  resendCode,
  verifyCode,
  type VerificationDeps,
  type VerificationOutcome,
} from "./verificationFlow";

type Busy = "verify" | "resend" | "email" | null;

function deps(): VerificationDeps {
  return {
    api: apiClient,
    auth: useAuthStore.getState(),
    session: useVerificationStore.getState(),
    now: Date.now,
  };
}

/**
 * Enter the mailed code, resend it, or fix the address (FS-V6SFK R35). Hosted by
 * the unverified banner and the profile page; on verify success the auth store
 * holds the fresh pair (R37) and whichever host is showing this unmounts it.
 */
export default function VerificationPanel({
  autoFocus = false,
}: {
  /** Focus the code field on mount: set when the panel opens on request. */
  autoFocus?: boolean;
}) {
  const email = useAuthStore((s) => s.memberInfo?.email);
  const codeSentAt = useVerificationStore((s) => s.codeSentAt);
  const ids = useId();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second while the shared resend cooldown runs, then stop.
  useEffect(() => {
    if (codeSentAt === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (resendSecondsLeft(codeSentAt, t) === 0) window.clearInterval(id);
    }, 1000);
    setNow(Date.now());
    return () => window.clearInterval(id);
  }, [codeSentAt]);

  const secondsLeft = resendSecondsLeft(codeSentAt, now);

  // Already verified, but this session's token predates it (R23): a fresh
  // sign-in mints a token with the claim.
  const signInAgain = () => {
    useAuthStore.getState().logout();
    router.push("/login");
  };

  const run = async (
    which: Exclude<Busy, null>,
    action: () => Promise<VerificationOutcome>,
  ) => {
    setBusy(which);
    setOutcome(null);
    const result = await action();
    setOutcome(result);
    setBusy(null);
    return result;
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await run("verify", () => verifyCode(code, deps()));
  };

  const onResend = async () => {
    await run("resend", () => resendCode(deps()));
  };

  const onChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await run("email", () => changeEmail(newEmail, deps()));
    if (result.ok) {
      setEditingEmail(false);
      setNewEmail("");
      setCode("");
    }
  };

  return (
    <div className="verify-panel">
      <p className="verify-panel-lead">
        A 6-digit code was sent to{" "}
        <span className="verify-panel-email">{email}</span>. It lasts 15
        minutes.
      </p>

      <form className="verify-panel-row" onSubmit={onVerify}>
        <label
          className="login-label verify-panel-label"
          htmlFor={`${ids}-code`}
        >
          Code
        </label>
        <input
          autoFocus={autoFocus}
          id={`${ids}-code`}
          className="login-input verify-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          disabled={busy !== null}
        />
        <button
          type="submit"
          className="btn-secondary"
          disabled={busy !== null}
        >
          {busy === "verify" ? "Verifying…" : "Verify"}
        </button>
      </form>

      <div className="verify-panel-row">
        <button
          type="button"
          className="btn-secondary"
          onClick={onResend}
          disabled={busy !== null || secondsLeft > 0}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Send a new code"}
        </button>
        <button
          type="button"
          className="verify-link"
          aria-expanded={editingEmail}
          onClick={() => setEditingEmail((open) => !open)}
        >
          {editingEmail ? "Keep this email" : "Change email"}
        </button>
      </div>

      {editingEmail && (
        <form className="verify-panel-row" onSubmit={onChangeEmail}>
          <label
            className="login-label verify-panel-label"
            htmlFor={`${ids}-email`}
          >
            New email
          </label>
          <input
            id={`${ids}-email`}
            type="email"
            className="login-input"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={busy !== null}
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={busy !== null || secondsLeft > 0}
          >
            {busy === "email" ? "Sending…" : "Send code here"}
          </button>
        </form>
      )}

      {outcome && (
        <p
          role={outcome.ok ? "status" : "alert"}
          className={outcome.ok ? "verify-notice" : "verify-error"}
        >
          {outcome.ok ? outcome.notice : outcome.message}
          {!outcome.ok && outcome.signIn && (
            <>
              {" "}
              <button
                type="button"
                className="verify-link"
                onClick={signInAgain}
              >
                Sign in again
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
