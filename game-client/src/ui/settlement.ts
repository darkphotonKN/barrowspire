/**
 * What the settlement record says (FS-GV8WN §G R19–R21): the `settlement` the server sends a
 * player the moment they resolve, turned into the record's copy. Pure; the record draws it.
 *
 * Copy follows the lore voice. The status line reads settling while pending and settled once
 * confirmed, and never says the items may be lost: once pending, delivery is guaranteed (R21).
 */

import type {
  SettlementCarriedItem,
  SettlementLostItem,
  SettlementPayload,
} from "@/assets/types/client";

/** How a piece of the record is coloured; the record maps each to a game-palette token. */
export type RecordTone =
  | "found"
  | "unsafe"
  | "consumed"
  | "pending"
  | "settled";

/** One item line: its name (and count), and the mark beside it, if any. */
export interface RecordRow {
  name: string;
  mark?: { text: string; tone: RecordTone };
}

export interface RecordView {
  title: string;
  status: { text: string; tone: RecordTone };
  /** What came home: the first {@link RECORD_ROWS_SHOWN}, and how many more there are. */
  carried: RecordRow[];
  carriedMore: number;
  /** What was lost, finds left in the barrow before items used up, likewise capped. */
  lost: RecordRow[];
  lostMore: number;
  /** Experience and level: "Experience +120 · Risen to level 4". */
  earned: string;
  /** Kills and time: "Slain 7 · 12:05 in the delve". */
  delve: string;
}

/** Rows each list shows before it counts the rest: two columns of four. */
export const RECORD_ROWS_SHOWN = 8;

const TITLE: Record<SettlementPayload["outcome"], string> = {
  escaped: "Escaped the barrow",
  died: "Fallen in the barrow",
};

const STATUS: Record<SettlementPayload["status"], RecordView["status"]> = {
  pending: { text: "Settling…", tone: "pending" },
  confirmed: { text: "Settled", tone: "settled" },
};

/** A heading for an outcome this client does not know: claims neither escape nor death. */
const UNKNOWN_TITLE = "Out of the delve";

const LOST_MARK: Record<
  SettlementLostItem["reason"],
  NonNullable<RecordRow["mark"]>
> = {
  unsafe: { text: "Kept by the barrow", tone: "unsafe" },
  consumed: { text: "Used up", tone: "consumed" },
};

/** The mark of a loss for a reason this client does not know: says only that it is gone. */
const UNKNOWN_LOST_MARK: NonNullable<RecordRow["mark"]> = {
  text: "Lost",
  tone: "consumed",
};

/** The record of one settlement. */
export function settlementRecord(settlement: SettlementPayload): RecordView {
  const carried = (settlement.carried ?? []).map(carriedRow);
  const lost = [...(settlement.lost ?? [])]
    // stable: the unsafe keep their order ahead of the consumed
    .sort(
      (a, b) => Number(a.reason !== "unsafe") - Number(b.reason !== "unsafe"),
    )
    .map(lostRow);
  return {
    title: TITLE[settlement.outcome] ?? UNKNOWN_TITLE,
    status: STATUS[settlement.status] ?? STATUS.pending,
    carried: carried.slice(0, RECORD_ROWS_SHOWN),
    carriedMore: Math.max(0, carried.length - RECORD_ROWS_SHOWN),
    lost: lost.slice(0, RECORD_ROWS_SHOWN),
    lostMore: Math.max(0, lost.length - RECORD_ROWS_SHOWN),
    earned: `Experience +${settlement.experience_gained} · ${levelLine(settlement)}`,
    delve: `Slain ${settlement.kills} · ${clock(settlement.seconds_in_run)} in the delve`,
  };
}

function carriedRow(item: SettlementCarriedItem): RecordRow {
  const row: RecordRow = { name: itemName(item) };
  if (item.found) row.mark = { text: "Found", tone: "found" };
  return row;
}

function lostRow(item: SettlementLostItem): RecordRow {
  return {
    name: itemName(item),
    mark: LOST_MARK[item.reason] ?? UNKNOWN_LOST_MARK,
  };
}

function itemName(item: { name: string; quantity?: number }): string {
  return (item.quantity ?? 1) > 1
    ? `${item.name} ×${item.quantity}`
    : item.name;
}

function levelLine(
  s: Pick<SettlementPayload, "level_before" | "level_after">,
): string {
  return s.level_after > s.level_before
    ? `Risen to level ${s.level_after}`
    : `Level ${s.level_after}`;
}

/** Seconds as m:ss, or h:mm:ss past the hour. */
function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
