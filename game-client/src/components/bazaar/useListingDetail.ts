"use client";

import { useCallback, useRef, useState } from "react";
import { fresher } from "@/marketplace/detail";
import type { PublicListing } from "@/marketplace/listing";

/**
 * How a table's rows meet the detail dialog, which always reads the public shape (FS-GKHYD
 * Req 1–2): `detail` turns a row into what the dialog opens on, and `merge` folds the dialog's
 * newer read back into a row. Module-level for each table, so the hook gets the same pair every
 * render.
 */
export interface DetailRows<L> {
  detail: (row: L) => PublicListing;
  merge: (row: L, read: PublicListing) => L;
}

/** The Bazaar's rows are already the public shape: a read replaces its row outright. */
export const PUBLIC_ROWS: DetailRows<PublicListing> = {
  detail: (row) => row,
  merge: (_row, read) => read,
};

/**
 * Which listing a table has open in the detail dialog (req 24), shared by the Bazaar and Mine.
 * `shown` is the rows with any newer read the dialog made since they loaded, so a landed bid
 * shows in its row too. `opener` is the row that opened the dialog; focus returns to it.
 */
export function useListingDetail<L extends { id: string; updatedAt: string }>(
  rows: readonly L[],
  { detail, merge }: DetailRows<L>,
) {
  const [openId, setOpenId] = useState<string>();
  const [reads, setReads] = useState<Record<string, PublicListing>>({});
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((id: string, row: HTMLElement) => {
    opener.current = row;
    setOpenId(id);
  }, []);
  const close = useCallback(() => setOpenId(undefined), []);
  const onListing = useCallback(
    (read: PublicListing) =>
      setReads((all) => ({ ...all, [read.id]: fresher(read, all[read.id]) })),
    [],
  );

  const shown = rows.map((row) => {
    const read = reads[row.id];
    return read ? fresher(row, merge(row, read)) : row;
  });
  const openRow = shown.find((row) => row.id === openId);
  const openListing = openRow && detail(openRow);

  return { shown, openListing, open, close, onListing, opener };
}
