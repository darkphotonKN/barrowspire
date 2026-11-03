"use client";

import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { BARROW } from "@/utils/theme";
import { EFFECT_CARDS } from "./effects";
import { GalleryScene } from "./GalleryScene";

const WIDTH = 720;
const HEIGHT = 360;

const button =
  "rounded-[6px] border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-card-2";

/**
 * The effects section (FS-1819Q R10, R11): one canvas with the mage on it, a card per effect,
 * and "play all in turn". A card that can't be played shows its name and why. Loaded with SSR
 * off, so Phaser stays out of the gallery's own chunk.
 */
export default function EffectsPanel() {
  const host = useRef<HTMLDivElement | null>(null);
  const scene = useRef<GalleryScene | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const gallery = new GalleryScene();
    scene.current = gallery;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: WIDTH,
      height: HEIGHT,
      parent: host.current,
      backgroundColor: BARROW.pitch,
      render: { roundPixels: true, antialias: true, pixelArt: false },
      scene: [gallery],
    });
    return () => {
      scene.current = null;
      game.destroy(true);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div ref={host} className="w-fit border border-border" />
      <div>
        <button
          type="button"
          className={button}
          onClick={() => scene.current?.playAll(EFFECT_CARDS)}
        >
          Play all in turn
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {EFFECT_CARDS.map((card) => (
          <li key={`${card.module}:${card.name}`}>
            {card.demo ? (
              <button
                type="button"
                className={button}
                onClick={() => scene.current?.play(card)}
              >
                {card.name}
              </button>
            ) : (
              <div className="rounded-[6px] border border-border px-3 py-1.5 text-sm text-text-muted">
                {card.name}: {card.reason}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
