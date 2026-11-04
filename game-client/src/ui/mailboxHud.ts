/**
 * The mailbox as the town hangs it (FS-1GZGD R33, R34, R40, R44; D11): the envelope at the
 * bottom-right and the letter panel over the town. Mounting it is entering the town, which
 * fetches the summary; taking it down is leaving the town, which closes the panel and drops any
 * `mail_arrived` until the next entry. Only the hub mounts it: a delve or a field never shows the
 * mailbox, and a letter sent meanwhile is found at the next town entry.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import type { ArtLibrary } from "@/render/art/library";
import { useMailboxStore, type MailboxState } from "@/stores/mailboxStore";
import { LetterPanel } from "./LetterPanel";
import { MailboxEnvelope } from "./MailboxEnvelope";

export interface MailboxHudDeps {
  store: StoreApi<MailboxState>;
  art: ArtLibrary;
  /** Whether a dialogue, a menu or an overlay owns the screen now: the envelope opens nothing. */
  blocked: () => boolean;
}

/** The mailbox as the hub hangs it: the app's mailbox store, the scene's baked art. */
export function mountMailbox(
  scene: Phaser.Scene,
  art: ArtLibrary,
  blocked: () => boolean,
): MailboxHud {
  return new MailboxHud(scene, { store: useMailboxStore, art, blocked });
}

export class MailboxHud {
  private readonly envelope: MailboxEnvelope;
  private readonly panel: LetterPanel;

  constructor(
    scene: Phaser.Scene,
    private readonly deps: MailboxHudDeps,
  ) {
    this.envelope = new MailboxEnvelope(scene, {
      store: deps.store,
      blocked: deps.blocked,
    });
    this.panel = new LetterPanel(scene, { store: deps.store, art: deps.art });
    void deps.store.getState().enterTown();
  }

  /** While the panel is open it owns the keys: WASD does not walk, and Esc closes it (R40). */
  isOpen(): boolean {
    return this.deps.store.getState().panelOpen;
  }

  close(): void {
    this.deps.store.getState().closePanel();
  }

  /** Leaving the town: the panel closes with it, and `mail_arrived` fetches nothing until the next entry. */
  destroy(): void {
    this.deps.store.getState().leaveTown();
    this.panel.destroy();
    this.envelope.destroy();
  }
}
