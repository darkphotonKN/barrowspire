import { rarityOf } from "@/marketplace/rarity";

// Rarity is DATA, not emphasis, which is why it is exempt from one-torch-per-view, and why the
// exemption is scoped to the badge, the accent edge, and a faint hover glow (design guideline,
// Part II "Rarity ramp"). The colour always travels with its text label (Accessibility).

/**
 * An item's rarity: the server tier's `--rarity-*` token and its label (FS-8EGFA req 31). An
 * unknown tier renders as common with the raw name as its label.
 */
export default function RarityBadge({ tier }: { tier: string | undefined }) {
  const { token, label } = rarityOf(tier);
  const color = `var(--rarity-${token})`;
  return (
    <span
      className="text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2 rounded"
      style={{
        color,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        background: `color-mix(in srgb, ${color} 6%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
