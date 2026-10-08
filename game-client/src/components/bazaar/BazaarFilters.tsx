"use client";

import { RARITY_TIERS, rarityOf } from "@/marketplace/rarity";
import { toggleChip } from "@/marketplace/browse";

/**
 * The Bazaar's filter chips (FS-8EGFA req 22): the five rarity tiers and the item types. Every
 * active chip, rarity or type, is brass-bright. A rarity chip names its tier by label only:
 * rarity colour belongs to the badge, the row's accent edge and the hover glow (req 30). Never
 * amber: the view's torch is already spent.
 */
export default function BazaarFilters({
  rarities,
  types,
  typeOptions,
  onRarities,
  onTypes,
}: {
  rarities: string[];
  types: string[];
  typeOptions: string[];
  onRarities: (next: string[]) => void;
  onTypes: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Filters">
      <ChipRow label="Rarity">
        {RARITY_TIERS.map((tier) => {
          const { label } = rarityOf(tier);
          return (
            <Chip
              key={tier}
              label={label}
              active={rarities.includes(tier)}
              onToggle={() => onRarities(toggleChip(rarities, tier))}
            />
          );
        })}
      </ChipRow>
      <ChipRow label="Type">
        {typeOptions.map((type) => (
          <Chip
            key={type}
            label={type[0].toUpperCase() + type.slice(1)}
            active={types.includes(type)}
            onToggle={() => onTypes(toggleChip(types, type))}
          />
        ))}
      </ChipRow>
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="w-16 text-[11px] font-semibold uppercase tracking-[0.15em] text-vellum-dim">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className="min-h-[40px] rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.1em] transition-colors"
      style={
        active
          ? {
              color: "var(--color-brass-bright)",
              borderColor: "var(--color-brass-bright)",
              background: "color-mix(in srgb, var(--color-brass-bright) 8%, transparent)",
            }
          : {
              color: "var(--color-text-dim)",
              borderColor: "var(--color-border-strong)",
            }
      }
    >
      {label}
    </button>
  );
}
