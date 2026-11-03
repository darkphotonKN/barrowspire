"use client";

import { useVerificationStore } from "@/stores/verificationStore";

/**
 * The text of a note under a Bazaar action. A note flagged `verifyEmail` is the email-verified
 * gate's refusal (FS-V6SFK §Requirements 38): it says why the action failed and opens the
 * verification panel in place, in the banner, so the player never leaves the action. The flag
 * comes from the refusal's code, never from the copy. The note's own line sets the tone.
 */
export default function NoteText({ note }: { note: { text: string; verifyEmail?: boolean } }) {
  if (!note.verifyEmail) return <>{note.text}</>;
  return (
    <>
      {note.text}{" "}
      <button
        type="button"
        onClick={() => useVerificationStore.getState().openPanel()}
        className="text-brass-bright underline underline-offset-4 hover:text-vellum"
      >
        Verify your email
      </button>
    </>
  );
}
