"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/utils/api";
import { purseFailure, type BidNote, type Purse } from "./bid";
import type { MyBidEntry } from "./myBids";
import { submitWithdraw } from "./withdrawBidFlow";

/**
 * Withdraw under My bids (FS-EYQ8K req 12–14, story 13): the delver's purse, read while the view
 * is shown, and the answer to the last withdraw. The note outlives the list re-read a withdraw
 * starts, which unmounts every row. `reloadList` re-reads My bids from its first page.
 */
export function useWithdrawBid(
  reloadList: () => void,
  enabled: boolean,
): {
  purse: Purse;
  note: BidNote | undefined;
  withdraw: (bid: MyBidEntry) => Promise<void>;
} {
  const [purse, setPurse] = useState<Purse>({ state: "loading" });
  const [note, setNote] = useState<BidNote>();

  const loadPurse = useCallback(async () => {
    try {
      const account = await apiClient.getWalletAccount();
      setPurse({ state: "ready", availableGold: account.availableGold });
    } catch (err) {
      setPurse(purseFailure(err));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setNote(undefined);
    void loadPurse();
  }, [enabled, loadPurse]);

  const withdraw = useCallback(
    async (bid: MyBidEntry) => {
      setNote(undefined);
      const result = await submitWithdraw({
        withdraw: () => apiClient.withdrawBid(bid.listingId, bid.bidId),
        refresh: async () => reloadList(),
        reloadPurse: loadPurse,
      });
      setNote(result.note);
    },
    [reloadList, loadPurse],
  );

  return { purse, note, withdraw };
}
