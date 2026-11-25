/**
 * The wandering merchant's wares panel, as data (FS-9JV5K §F R22, R23): its rows, its words and the
 * run's side of a purchase. Phaser-free, shared by the run, which owns the panel's open state and the
 * purchase in flight and hands the UI scene what to draw ({@link ShownWares}), and the UI scene's
 * panel, which draws it and asks back through the UI bridge (ADR-0084–0086).
 *
 * Money clarity overrides lore (game-client CLAUDE.md): a refusal says plainly what happened, and
 * whether anything was taken.
 */

import type { BuyPayload } from "@/assets/types/client";
import { iconSheet, itemIcon } from "@/render/art/itemIcons";
import { TOME } from "@/render/world/altar";
import { formatGold } from "@/marketplace/gold";
import type { MerchantState, MerchantWareState } from "@/types/gameState";
import type { NoticeTone } from "./floor";

/** One row of the panel: its icon's sheet, the ware's name, price, count left and its Buy. */
export interface WareRow {
  readonly ware: string;
  readonly icon: string;
  readonly name: string;
  /** "60 gold". */
  readonly price: string;
  /** "3 left", or "Sold out". */
  readonly left: string;
  /** "Buy", or "Paying…" on the ware being paid for. */
  readonly action: string;
  /** Whether Buy can be pressed now: some left and no purchase in flight. */
  readonly enabled: boolean;
}

/** World → UI: the panel, whole, as plain data; sent again on any change. */
export interface ShownWares {
  readonly merchantId: string;
  readonly rows: readonly WareRow[];
  /** The last refusal, in plain words; none since a new buy or a fresh open. */
  readonly line?: string;
}

/**
 * World → UI: the panel shown (or shown again changed), a purchase answered (the purse line reads the
 * wallet again), or the panel taken down.
 */
export type WaresMessage =
  | { readonly kind: "show"; readonly wares: ShownWares }
  | { readonly kind: "answered" }
  | { readonly kind: "close" };

/** The server's `buy` reply (game-service `purchase.go`): `ware` on a success, `reason` on a refusal. */
export interface BuyReply {
  success: boolean;
  ware?: string;
  reason?: string;
  message?: string;
}

/** The known wares' names, where the wire sends no item (the tome) or the item's name is unknown. */
const WARE_NAMES: Readonly<Record<string, string>> = {
  health_potion: "Health Potion",
  antidote: "Antidote",
  tome_of_filth: "Tome of Filth",
};

/** Words of a wire name, each capitalised: `rope_coil` reads "Rope Coil". */
const titled = (name: string) =>
  name
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/** A ware's name on screen: its item's, else the client's for the kind, else the kind's own words. */
export function wareName(ware: Pick<MerchantWareState, "ware" | "item">): string {
  return ware.item?.name ?? WARE_NAMES[ware.ware] ?? titled(ware.ware);
}

/** The sheet a ware's icon is drawn from: its item's by the icon resolver (R25), the tome's own prop for the tome. */
function wareIcon(ware: MerchantWareState): string {
  if (ware.item) return iconSheet(itemIcon(ware.item));
  return ware.ware === "tome_of_filth" ? TOME.sheet : iconSheet("generic");
}

/** The panel's rows (R22), `paying` the ware whose purchase is in flight: Buy is off everywhere meanwhile. */
export function waresRows(wares: readonly MerchantWareState[], paying?: string): WareRow[] {
  return wares.map((ware) => ({
    ware: ware.ware,
    icon: wareIcon(ware),
    name: wareName(ware),
    price: `${formatGold(ware.price)} gold`,
    left: ware.left > 0 ? `${ware.left} left` : "Sold out",
    action: paying === ware.ware ? "Paying…" : "Buy",
    enabled: paying === undefined && ware.left > 0,
  }));
}

/** Both purse refusals: nothing was taken, which is the point of saying it (R23). */
const PURSE_UNREACHED = "Your purse can't be reached. Nothing was taken.";

/** A `buy` refusal's line (R23), by its reason. */
const BUY_REFUSALS: Readonly<Record<string, string | null>> = {
  not_enough_gold: "Not enough gold.",
  sold_out: "Sold out.",
  bag_full: "Your bag is full.",
  out_of_reach: "Too far away.",
  wallet_unavailable: PURSE_UNREACHED,
  no_wallet: PURSE_UNREACHED,
  tome_held: "You already carry a tome.",
  not_in_play: "You can't trade now.",
  // a purchase is already in flight: its own answer is still to come, so nothing new is said
  purchase_pending: null,
};

/** A refusal's line, or none for one that says nothing new; one this client does not know still says nothing was bought. */
export function buyRefusalLine(reason: string | undefined): string | null {
  if (reason !== undefined && Object.hasOwn(BUY_REFUSALS, reason)) return BUY_REFUSALS[reason];
  return "Nothing was bought.";
}

/** What a `buy` answer says beside the panel: a HUD notice, if any. */
export interface TradeAnswer {
  notice?: { text: string; tone: NoticeTone };
}

/**
 * The run's side of the wares panel: whose panel is open, the one purchase in flight (the server
 * allows one at a time, §B R6) and the last refusal's line. The purchase outlives the panel: closing
 * it changes nothing on the server (R22), so a reopened panel still shows Paying… until the reply,
 * and a refusal that lands with the panel shut is said as a notice instead.
 */
export class WaresTrade {
  private merchantId?: string;
  private inFlight?: string;
  private line?: string;
  /** The name each ware was last shown by: a bought ware is named after its floor is gone. */
  private readonly names = new Map<string, string>();
  /** The wares as last shown: what Buy is judged against. */
  private shown: readonly MerchantWareState[] = [];

  /** The merchant whose panel is open; none while it is shut. */
  get openFor(): string | undefined {
    return this.merchantId;
  }

  /** The ware whose purchase is in flight; none. */
  get paying(): string | undefined {
    return this.inFlight;
  }

  /** The panel opens for `merchant`, with no line yet. */
  open(merchant: MerchantState): ShownWares {
    this.merchantId = merchant.entity_id;
    this.line = undefined;
    return this.view(merchant);
  }

  close(): void {
    this.merchantId = undefined;
    this.line = undefined;
    this.shown = [];
  }

  /** The panel's data for `merchant` now. */
  view(merchant: MerchantState): ShownWares {
    this.shown = merchant.wares;
    for (const ware of merchant.wares) this.names.set(ware.ware, wareName(ware));
    return {
      merchantId: merchant.entity_id,
      rows: waresRows(merchant.wares, this.inFlight),
      ...(this.line ? { line: this.line } : {}),
    };
  }

  /**
   * Buy pressed on `ware` of the open panel's merchant as last shown: the `buy` to send, now paid
   * for; none with the panel shut, a purchase in flight, or the ware sold out or not listed.
   */
  buy(ware: string): BuyPayload | null {
    const merchantId = this.merchantId;
    if (!merchantId || this.inFlight !== undefined) return null;
    const listed = this.shown.find((w) => w.ware === ware);
    if (!listed || listed.left <= 0) return null;
    this.inFlight = ware;
    this.line = undefined;
    return { merchant_id: merchantId, ware };
  }

  /** The `buy` reply (R23): Paying… ends, except on purchase_pending; a success's notice, a refusal's line or notice. */
  answer(reply: BuyReply): TradeAnswer {
    if (reply.success) {
      const ware = reply.ware ?? this.inFlight;
      this.inFlight = undefined;
      const name = ware === undefined ? "your ware" : (this.names.get(ware) ?? wareName({ ware }));
      return { notice: { text: `Bought: ${name}.`, tone: "done" } };
    }
    const line = buyRefusalLine(reply.reason);
    if (line === null) return {};
    this.inFlight = undefined;
    if (this.merchantId) {
      this.line = line;
      return {};
    }
    return { notice: { text: line, tone: "refused" } };
  }

  /** A new run: nothing open, nothing in flight. */
  reset(): void {
    this.merchantId = undefined;
    this.inFlight = undefined;
    this.line = undefined;
    this.shown = [];
    this.names.clear();
  }
}
