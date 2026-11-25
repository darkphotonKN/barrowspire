"use client";

import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import { roundEveryObject, viewport } from "@/render/viewport";
import { PAGE_SHEET, mountPageRoundels } from "./pageRoundelsSheet";

// Rounded as the game is (ADR-0057), whichever page loaded Phaser first.
roundEveryObject(Phaser.GameObjects);

/** The render scales the art gate checks the roundels at (R46, ADR-0094, ADR-0095). */
const SCALES = [1, 1.5, 2] as const;
type Scale = (typeof SCALES)[number];

const button = "rounded-[6px] border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-card-2";
const chosen = "rounded-[6px] border border-brass px-3 py-1.5 text-sm text-text bg-bg-card-2";

/**
 * The Page roundels section (FS-X2CMM §I R46, the art gate; §Change: Illuminated pages C1, C2): the 14
 * class book pages as illuminated initials (ADR-0095: a bone picture on a ground of its pigment) in
 * ready, locked, recovering, hovered and dim, at the book's 44 px and the cast bar's 28 px, on their own
 * canvas at render scale 1, 1.5 or 2. `npm run contact:pages` renders the same sheet to
 * docs/art/class-book-pages-contact-sheet.png.
 */
export default function PageRoundelsPanel() {
  const host = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<Scale>(1);

  useEffect(() => {
    if (!host.current) return;
    const { unmount } = mountPageRoundels(host.current);
    return unmount;
  }, []);

  // the backing store, the camera and every roundel follow the render scale (ADR-0080, FS-ZAJMH)
  useEffect(() => {
    viewport.set({ ...PAGE_SHEET, renderScale: scale, cssScale: 1 });
  }, [scale]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-dim">
        Illuminated (ADR-0095): a bone picture on a ground of its page&apos;s pigment, in ready, locked, recovering
        (under a 40 % sweep), hovered and dim.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
        <span>Render scale</span>
        {SCALES.map((s) => (
          <button key={s} type="button" className={s === scale ? chosen : button} onClick={() => setScale(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div ref={host} className="w-fit border border-border" />
      </div>
    </div>
  );
}
