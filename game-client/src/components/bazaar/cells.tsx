"use client";

import { useRef } from "react";
import ItemIcon from "@/components/ItemIcon";
import RarityBadge from "@/components/RarityBadge";
import type { Listing } from "@/marketplace/listing";
import { rarityOf } from "@/marketplace/rarity";

/**
 * The row anatomy the Bazaar's two tables share (design guideline Part II "Listing table"): the
 * rarity-edged item cell, the price cell, the skeleton row, and a row that opens its listing.
 */

export const CELL = "px-4 py-3 align-middle";
export const NUMERIC = `${CELL} text-right tabular-nums`;
/** A lesser column drops below 640px; never price, time left, action or status. */
export const LESSER = "hidden sm:table-cell";

/**
 * A listing's row. It opens the listing detail (req 24) on a click or on Enter; a click on the
 * row's own link or button is theirs. `children` gets the same opener, for a Bid button.
 */
export function OpenableRow({
  listing,
  onOpen,
  children,
}: {
  listing: Listing;
  onOpen: (id: string, row: HTMLElement) => void;
  children: (open: () => void) => React.ReactNode;
}) {
  const row = useRef<HTMLTableRowElement>(null);
  const open = () => row.current && onOpen(listing.id, row.current);
  return (
    <tr
      ref={row}
      tabIndex={0}
      aria-haspopup="dialog"
      onClick={(e) => !(e.target as HTMLElement).closest("a, button") && open()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          open();
        }
      }}
      className="bazaar-row cursor-pointer border-b border-[color:var(--color-border)] last:border-b-0"
      style={{ "--row-rarity": `var(--rarity-${rarityOf(listing.item?.rarity).token})` } as React.CSSProperties}
    >
      {children(open)}
    </tr>
  );
}

/** Icon, name and rarity badge, on the rarity accent edge. */
export function ItemCell({ item }: { item: Listing["item"] }) {
  return (
    <td className={`${CELL} bazaar-row-edge`}>
      <div className="flex items-center gap-3">
        <ItemIcon item={item ?? {}} size={40} />
        <span className="font-semibold text-vellum">{item?.name ?? "Unknown relic"}</span>
        {item && <RarityBadge tier={item.rarity} />}
      </div>
    </td>
  );
}

/** The price in gold, marked opening while nobody has bid. Vellum, never amber (req 30). */
export function PriceCell({ price }: { price: { gold: string; opening: boolean } }) {
  return (
    <td className={NUMERIC}>
      <span className="text-vellum-muted" aria-hidden>
        ⟡
      </span>{" "}
      <span className="text-vellum">{price.gold}</span>
      <span className="sr-only"> gold</span>
      {price.opening && (
        <span className="ml-2 text-[11px] uppercase tracking-[0.1em] text-vellum-muted">
          opening
        </span>
      )}
    </td>
  );
}

/** One placeholder cell after the item: the cell's classes and the bar's size. */
export interface SkeletonCell {
  cell: string;
  bar: string;
}

/** A loading row: the item cell's icon and name bars, then one bar per `rest` cell. */
export function SkeletonRow({ rest }: { rest: readonly SkeletonCell[] }) {
  return (
    <tr aria-hidden className="border-b border-[color:var(--color-border)] last:border-b-0">
      <td className={CELL}>
        <div className="flex items-center gap-3">
          <span className="bazaar-skeleton h-10 w-10" />
          <span className="bazaar-skeleton h-4 w-40" />
        </div>
      </td>
      {rest.map((c, i) => (
        <td key={i} className={c.cell}>
          <span className={`bazaar-skeleton ${c.bar}`} />
        </td>
      ))}
    </tr>
  );
}
