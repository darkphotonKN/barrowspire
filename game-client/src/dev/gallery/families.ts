/**
 * The tracked families: the kinds of visual piece the dev gallery must show in full
 * (FS-1819Q R3). This is the one place they are named; a later family is added here.
 */
export const FAMILIES = ["effects", "item-icons", "tree-colours", "page-roundels"] as const;
export type Family = (typeof FAMILIES)[number];
