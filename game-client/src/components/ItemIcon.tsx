"use client";

import { useEffect, useState } from "react";
import { iconCrop, itemIcon, type IconSubject } from "@/render/art/itemIcons";
import { validateManifest, type ArtManifest } from "@/render/art/manifest";
import { retryableOnce } from "@/render/art/retryableOnce";
import { fetchArtManifest } from "@/utils/api";

// One manifest read per page load, shared by every icon on it. A failed read resolves to null
// (an empty well where the icon would be) rather than breaking the row it sits in, and is not
// cached: the next icon to mount tries again.
const loadManifest = retryableOnce(async (): Promise<ArtManifest> => {
  const result = validateManifest(await fetchArtManifest());
  if (!result.ok) throw new Error("art manifest failed validation");
  return result.manifest;
});

/**
 * An item's baked icon in the DOM (FS-8EGFA req 32): the same icon the canvas draws, cropped
 * out of the icon atlas at the frame the sprite manifest gives. Decorative by default, since
 * the item's name always sits beside it; pass `label` where it stands alone.
 */
export default function ItemIcon({
  item,
  size = 40,
  label,
}: {
  item: IconSubject;
  size?: number;
  label?: string;
}) {
  const [art, setArt] = useState<ArtManifest | null>(null);
  useEffect(() => {
    let live = true;
    loadManifest().then((m) => live && setArt(m));
    return () => {
      live = false;
    };
  }, []);

  const crop = iconCrop(art, itemIcon(item), size);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-block shrink-0 rounded-[6px] bg-bg-darker"
      style={{
        width: size,
        height: size,
        ...(crop && {
          backgroundImage: `url(${crop.image})`,
          backgroundPosition: crop.position,
          backgroundSize: crop.sheetSize,
          backgroundRepeat: "no-repeat",
        }),
      }}
    />
  );
}
