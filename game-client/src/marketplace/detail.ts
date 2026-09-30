/**
 * The listing detail dialog's decisions (FS-8EGFA req 24, 27, 28): which stats it lists, which
 * panel stands where the bid box goes, and which of two reads of a listing is the newer.
 */

export interface StatLine {
  label: string;
  value: string;
}

interface Stats {
  weaponType?: string;
  armorSlot?: string;
  attackPower?: number;
  criticalRate?: number;
  defenseRating?: number;
  magicResistance?: number;
  healingAmount?: number;
  manaAmount?: number;
  buffDuration?: number;
}

/** The critical rate travels as a fraction (0.05 is 5%); every view shows it as a percentage. */
export const formatCriticalRate = (rate: number): string => `${Math.round(rate * 100)}%`;

const capitalised = (word: string) => word[0].toUpperCase() + word.slice(1);

/** The item's full stats, in a fixed order, leaving out the ones it does not have. */
export function itemStats(item: Stats | undefined): StatLine[] {
  if (!item) return [];
  const words: [string | undefined, string][] = [
    [item.weaponType, "Kind"],
    [item.armorSlot, "Slot"],
  ];
  const numbers: [number | undefined, string, (v: number) => string][] = [
    [item.attackPower, "Attack", String],
    [item.criticalRate, "Critical rate", formatCriticalRate],
    [item.defenseRating, "Defense", String],
    [item.magicResistance, "Magic resistance", String],
    [item.healingAmount, "Healing", String],
    [item.manaAmount, "Mana", String],
    [item.buffDuration, "Duration", (v) => `${v}s`],
  ];
  return [
    ...words.flatMap(([v, label]) =>
      v?.trim() ? [{ label, value: capitalised(v.trim()) }] : [],
    ),
    ...numbers.flatMap(([v, label, format]) => (v ? [{ label, value: format(v) }] : [])),
  ];
}

/** What stands where the bid box goes: a sign-in prompt, "Your listing", or the box itself. */
export function bidPanel(
  listing: { sellerId: string },
  memberId: string | undefined,
): "signIn" | "own" | "bid" {
  if (!memberId) return "signIn";
  if (memberId === listing.sellerId) return "own";
  return "bid";
}

/** The newer of two reads of one listing; a tie goes to the later read. */
export function fresher<L extends { updatedAt: string }>(row: L, read: L | undefined): L {
  if (!read) return row;
  return Date.parse(read.updatedAt) >= Date.parse(row.updatedAt) ? read : row;
}

/**
 * The dialog's re-read of its listing. Reads can land out of order (the open-time read races a
 * post-bid one), so a read is kept only when it is at least as new as what is shown, and the
 * caller's answer is always the newest copy known, never a stale late read. A failed read
 * answers undefined and leaves what is shown alone.
 */
export function listingReader<L extends { updatedAt: string }>(deps: {
  fetch: () => Promise<L>;
  current: () => L;
  apply: (listing: L) => void;
}): () => Promise<L | undefined> {
  return async () => {
    let read: L;
    try {
      read = await deps.fetch();
    } catch {
      return undefined;
    }
    const shown = deps.current();
    const next = fresher(shown, read);
    if (next !== shown) deps.apply(next);
    return next;
  };
}
