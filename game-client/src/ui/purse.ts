/**
 * The purse line (FS-7TGZ3): the player's gold as the gear and bag panel shows it under the bag,
 * the account's total with "Available X · Held in bids Y" on hover. Read from the wallet
 * (`GET /api/wallet/account`) on every open of the overlay and after a Take that carries gold;
 * "—" when it could not be read, a 404 (the wallet is made after signup, ADR-0014) included, with
 * no notice (§D). Phaser-free: the overlay is the shelf it hands the view to.
 */

import type { components } from "@/api/generated/schema";
import { formatGold } from "@/marketplace/gold";
import { ApiError } from "@/utils/apiError";

type WalletAccount = components["schemas"]["WalletAccount"];

/** What the line shows for a purse it could not read (R12), as the marketplace page does. */
export const PURSE_UNKNOWN = "—";

/** The line's words: the total, and its tip; no tip while the total is unknown (R7). */
export interface PurseView {
  amount: string;
  tip?: string;
}

/** The wallet read, as `apiClient` makes it. */
export interface PurseApi {
  getWalletAccount(): Promise<WalletAccount>;
}

/** Where the view is drawn: the gear overlay. */
export interface PurseShelf {
  setPurse(view: PurseView): void;
}

/** The total, grouped, and the split in its tip (R3, R5); without an account, the dash. */
export function purseView(account: WalletAccount | undefined): PurseView {
  if (typeof account?.gold !== "number") return { amount: PURSE_UNKNOWN };
  return {
    amount: formatGold(account.gold),
    tip: `Available ${formatGold(account.availableGold ?? 0)} · Held in bids ${formatGold(account.heldGold ?? 0)}`,
  };
}

/**
 * Reads the wallet and hands the shelf what it says. Until an answer lands the shelf keeps what
 * it shows (R10); an answer a later read overtook is dropped (R11); a failure shows the dash
 * (R12–13), and only one that is not the expected 404 is logged.
 */
export class PurseReader {
  private reads = 0;

  constructor(
    private readonly api: PurseApi,
    private readonly shelf: PurseShelf,
  ) {}

  async refresh(): Promise<void> {
    const read = ++this.reads;
    let view: PurseView;
    try {
      view = purseView(await this.api.getWalletAccount());
    } catch (err) {
      if (read !== this.reads) return;
      if (!(err instanceof ApiError && err.status === 404))
        console.warn("purse: the wallet could not be read", err);
      view = purseView(undefined);
    }
    if (read !== this.reads) return;
    this.shelf.setPurse(view);
  }
}
