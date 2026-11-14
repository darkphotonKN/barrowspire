import { describe, expect, it } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";
import { letterPanelState } from "./letterPanelState";
import type { MailboxState } from "./mailboxStore";

// FS-TQZ5J § Change: Batch 4, R103, moved beside the store by § Change: Batch 6, R140: the town reads the
// letter panel's open state, and closes it, through the mailbox store's `panelOpen`

describe("letterPanelState (FS-TQZ5J § Change: Batch 6, R140)", () => {
  it("should read the store's panelOpen, and close the panel in the store", () => {
    const store = createStore(() => ({ panelOpen: true, closePanel: () => store.setState({ panelOpen: false }) }));
    const letter = letterPanelState(store as unknown as StoreApi<MailboxState>);
    expect(letter.isOpen()).toBe(true);
    letter.close();
    expect(letter.isOpen()).toBe(false);
    expect(store.getState().panelOpen).toBe(false);
  });
});
