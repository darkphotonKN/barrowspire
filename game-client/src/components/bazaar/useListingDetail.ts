"use client";

import { useCallback, useRef, useState } from "react";
import { fresher } from "@/marketplace/detail";
import type { Listing } from "@/marketplace/listing";

/**
 * Which listing a table has open in the detail dialog (req 24), shared by the Bazaar and Mine.
 * `shown` is the rows with any newer read the dialog made since they loaded, so a landed bid
 * shows in its row too. `opener` is the row that opened the dialog; focus returns to it.
 */
export function useListingDetail(rows: readonly Listing[]) {
  const [openId, setOpenId] = useState<string>();
  const [reads, setReads] = useState<Record<string, Listing>>({});
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((id: string, row: HTMLElement) => {
    opener.current = row;
    setOpenId(id);
  }, []);
  const close = useCallback(() => setOpenId(undefined), []);
  const onListing = useCallback(
    (read: Listing) => setReads((all) => ({ ...all, [read.id]: fresher(read, all[read.id]) })),
    [],
  );

  const shown = rows.map((row) => fresher(row, reads[row.id]));
  const openListing = shown.find((row) => row.id === openId);

  return { shown, openListing, open, close, onListing, opener };
}
