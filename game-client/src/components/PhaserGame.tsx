"use client";

import { useEffect, useRef, useCallback } from "react";
import Phaser from "phaser";
import { BARROW } from "@/utils/theme";
import { MainMenuScene } from "@/scenes/MainMenuScene";
import { CharacterCreationScene } from "@/scenes/CharacterCreationScene";
import { BarrowspireScene } from "@/scenes/BarrowspireScene";
import { PreloadScene } from "@/scenes/PreloadScene";
import { BootScene } from "@/scenes/BootScene";
import { LoadoutScene } from "@/scenes/LoadoutScene";

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initGame = useCallback(() => {
    if (gameRef.current || !containerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1080,
      height: 720,
      parent: containerRef.current,
      backgroundColor: BARROW.umber,
      // Crisp pixel art per docs/design-guideline.md: nearest-neighbour filtering,
      // no smoothing, integer-aligned positions. Presentation only.
      pixelArt: true,
      render: {
        roundPixels: true,
        antialias: false,
        pixelArt: true,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: [BootScene, PreloadScene, MainMenuScene, CharacterCreationScene, LoadoutScene, BarrowspireScene],
    };

    gameRef.current = new Phaser.Game(config);
  }, []);

  useEffect(() => {
    // Defer one frame so the browser has painted the container element
    const raf = requestAnimationFrame(() => initGame());

    return () => {
      cancelAnimationFrame(raf);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [initGame]);

  return (
    <div className="treasure-hunt-wrapper">
      <div ref={containerRef} className="treasure-hunt-game-container" />
    </div>
  );
}
