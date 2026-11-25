"use client";

import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import { roundEveryObject } from "@/render/viewport";
import { BARROW } from "@/utils/theme";
import { BARS_SHEET, ResourceBarsScene } from "./resourceBarsSheet";

// Rounded as the game is (ADR-0057), whichever page loaded Phaser first.
roundEveryObject(Phaser.GameObjects);

const ZOOMS = [1, 2] as const;
type Zoom = (typeof ZOOMS)[number];

const button = "rounded-[6px] border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-card-2";
const chosen = "rounded-[6px] border border-brass px-3 py-1.5 text-sm text-text bg-bg-card-2";

/**
 * The Resource bars section: the player's own Health and resource bars (the reliquary bars) for every
 * class resource, live and looping through hits, heals, spends and refills, at 1x or zoomed 2x to
 * read the pixels.
 */
export default function ResourceBarsPanel() {
  const host = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<Zoom>(1);

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: BARS_SHEET.width,
      height: BARS_SHEET.height,
      zoom,
      parent: host.current,
      backgroundColor: BARROW.charcoal,
      render: { roundPixels: true, antialias: true, pixelArt: false },
      scene: [new ResourceBarsScene()],
    });
    return () => game.destroy(true);
  }, [zoom]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-dim">
        The reliquary bars: Health, Mana, Stamina and Parry, each in its socket. The looping cards take hits and
        heals every 1.6 s.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
        <span>Zoom</span>
        {ZOOMS.map((z) => (
          <button key={z} type="button" className={z === zoom ? chosen : button} onClick={() => setZoom(z)}>
            {z}x
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div ref={host} className="w-fit border border-border" />
      </div>
    </div>
  );
}
