/**
 * Rarity: the server's tier name in, the colour token and text label the page shows out
 * (FS-8EGFA req 31).
 *
 * The server names five tiers (items-service CONTEXT.md "Rarity tier"); the design guideline's
 * `--rarity-*` ramp names five tokens. They are matched by name here and nowhere else, so a
 * tier never reaches a component as a colour.
 */

/** The server's rarity tiers, ascending. */
export const RARITY_TIERS = [
  "normal",
  "uncommon",
  "rare",
  "runed",
  "fabled",
] as const;
export type RarityTier = (typeof RARITY_TIERS)[number];

/** The `--rarity-<token>` CSS variables in `globals.css`. */
export type RarityToken = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface Rarity {
  /** The normalised tier name, or the raw name when the tier is unknown. */
  tier: string;
  token: RarityToken;
  /** The text label that always travels with the colour. */
  label: string;
  /** 1 (normal) to 5 (fabled); 0 for an unknown tier, so it sorts below every known one. */
  rank: number;
}

const TOKENS: Record<RarityTier, RarityToken> = {
  normal: "common",
  uncommon: "uncommon",
  rare: "rare",
  runed: "epic",
  fabled: "legendary",
};

const isTier = (name: string): name is RarityTier =>
  (RARITY_TIERS as readonly string[]).includes(name);

/**
 * The rarity a tier name shows as. An unknown name renders as common with the raw name as its
 * label; a missing or blank one is labelled "Unknown".
 */
export function rarityOf(name: string | undefined): Rarity {
  const tier = (name ?? "").trim().toLowerCase();
  if (isTier(tier))
    return {
      tier,
      token: TOKENS[tier],
      label: tier[0].toUpperCase() + tier.slice(1),
      rank: RARITY_TIERS.indexOf(tier) + 1,
    };
  const raw = name ?? "";
  return {
    tier: raw,
    token: "common",
    label: raw.trim() || "Unknown",
    rank: 0,
  };
}
