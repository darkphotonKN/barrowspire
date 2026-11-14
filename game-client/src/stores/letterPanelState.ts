/**
 * The letter panel's open state as the town reads it (FS-TQZ5J § Change: Batch 4, R103): the mailbox
 * store's `panelOpen`, which the UI scene's letter panel shows. Beside the store it reads (§ Change: Batch 6,
 * R140), apart from the mailbox's pieces.
 */

import type { StoreApi } from "zustand";
import { useMailboxStore, type MailboxState } from "./mailboxStore";

/** The letter panel as the town reads it: open or not, and its close. */
export interface LetterPanelState {
  /** While the panel is open it owns the keys: WASD does not walk, and Esc closes it (FS-1GZGD R40). */
  isOpen(): boolean;
  close(): void;
}

/** The letter panel's open state in the mailbox store, `panelOpen`, which the UI scene's panel shows. */
export function letterPanelState(store: StoreApi<MailboxState> = useMailboxStore): LetterPanelState {
  return {
    isOpen: () => store.getState().panelOpen,
    close: () => store.getState().closePanel(),
  };
}
