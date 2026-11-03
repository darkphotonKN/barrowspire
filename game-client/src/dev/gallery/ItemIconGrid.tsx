"use client";

import { useEffect, useState } from "react";
import { loadManifest } from "@/components/ItemIcon";
import type { ArtManifest } from "@/render/art/manifest";
import { itemIconCells } from "./itemIconCells";

const SIZE = 64;

/** Every baked item icon with its name under it (FS-1819Q R9). */
export default function ItemIconGrid() {
  const [art, setArt] = useState<ArtManifest | null>(null);
  useEffect(() => {
    let live = true;
    loadManifest().then((m) => live && setArt(m));
    return () => {
      live = false;
    };
  }, []);

  return (
    <ul className="flex flex-wrap gap-4">
      {itemIconCells(art, SIZE).map(({ name, crop }) => (
        <li
          key={name}
          className="flex w-20 flex-col items-center gap-1 text-xs text-text-dim"
        >
          <span
            aria-hidden
            className="block rounded-[6px] bg-bg-darker"
            style={{
              width: SIZE,
              height: SIZE,
              ...(crop && {
                backgroundImage: `url(${crop.image})`,
                backgroundPosition: crop.position,
                backgroundSize: crop.sheetSize,
                backgroundRepeat: "no-repeat",
              }),
            }}
          />
          {name}
        </li>
      ))}
    </ul>
  );
}
