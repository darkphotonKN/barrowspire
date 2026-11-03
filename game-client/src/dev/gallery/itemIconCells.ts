import {
  ITEM_ICONS,
  iconCrop,
  type IconCrop,
  type ItemIconName,
} from "@/render/art/itemIcons";
import type { ArtManifest } from "@/render/art/manifest";

export interface ItemIconCell {
  name: ItemIconName;
  /** Null when there is no manifest to crop from: the cell draws an empty well. */
  crop: IconCrop | null;
}

/** One gallery cell per baked icon, read straight from ITEM_ICONS (FS-1819Q R9). */
export function itemIconCells(
  manifest: ArtManifest | null,
  size: number,
): ItemIconCell[] {
  return ITEM_ICONS.map((name) => ({
    name,
    crop: iconCrop(manifest, name, size),
  }));
}
