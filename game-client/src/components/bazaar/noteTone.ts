import type { BidNote } from "@/marketplace/bid";

/** The colour of a status line under a Bazaar action: a landed answer, a refusal, or a hint. */
export const NOTE_TONE: Record<BidNote["tone"] | "muted", string> = {
  ok: "text-brass-bright",
  error: "text-[color:var(--color-danger-text)]",
  muted: "text-vellum-dim",
};
