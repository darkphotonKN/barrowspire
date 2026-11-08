"use client";

import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { BARROW } from "@/utils/theme";
import { RaritySheetScene, SHEET_HEIGHT, SHEET_WIDTH } from "./raritySheet";

/**
 * The rarity contact sheet's canvas in a horizontal scroller (FS-QE2QW R35). Mounted by the effects
 * panel, so it shares that panel's Phaser chunk and its rounding (FS-1819Q R5, ADR-0057).
 */
export default function RaritySheetPanel() {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      parent: host.current,
      backgroundColor: BARROW.pitch,
      render: { roundPixels: true, antialias: true, pixelArt: false },
      scene: [new RaritySheetScene()],
    });
    return () => game.destroy(true);
  }, []);

  return (
    <div className="overflow-x-auto">
      <div ref={host} className="w-fit border border-border" />
    </div>
  );
}
