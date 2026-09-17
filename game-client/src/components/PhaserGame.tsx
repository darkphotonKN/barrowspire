"use client";

import { useEffect, useRef, useCallback } from "react";
import Phaser from "phaser";
import { BARROW } from "@/utils/theme";
import { MainMenuScene } from "@/scenes/MainMenuScene";
import { CharacterCreationScene } from "@/scenes/CharacterCreationScene";
import { BarrowspireScene } from "@/scenes/BarrowspireScene";
import { PreloadScene } from "@/scenes/PreloadScene";
import { BootScene } from "@/scenes/BootScene";
import { HubScene } from "@/scenes/HubScene";
import { WorldEnteredPayload } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
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
      scene: [BootScene, PreloadScene, MainMenuScene, CharacterCreationScene, LoadoutScene, HubScene, BarrowspireScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // THE transition. The server says which world the player is in — on entering
    // the hub, on a match, on returning, and on reconnecting after a refresh —
    // and the scene follows. One handler at the Phaser bridge rather than one
    // per scene, so no scene has to know what comes after it.
    // FS-29KSH §Requirements 15, 36.
    // Everything a world transition replaces. LoadoutScene is here because it is a
    // screen the delver opens while standing in the hub: a match found with it open
    // would otherwise leave it sitting on top of the run.
    const WORLD_SCENES = [
      "MainMenuScene",
      "HubScene",
      "LoadoutScene",
      "BarrowspireScene",
    ];

    const enterWorld = (payload: WorldEnteredPayload) => {
      const target =
        payload.world_type === "hub" ? "HubScene" : "BarrowspireScene";

      // scene.start() from the manager does not stop what is already running,
      // unlike the same call from inside a scene, so the previous world would
      // stay live underneath.
      for (const key of WORLD_SCENES) {
        if (key !== target && game.scene.isActive(key)) game.scene.stop(key);
      }

      game.scene.start(target, { sessionID: payload.session_id });
    };

    socketManager.on("world_entered", (payload: WorldEnteredPayload) => {
      if (!payload?.world_type) return;

      // On a refresh the server announces the world as soon as the socket opens,
      // which can beat the boot chain to it. Switching then would tear down
      // PreloadScene mid-flight, so hold the message until the menu stands up.
      if (game.scene.isActive("PreloadScene") || game.scene.isActive("BootScene")) {
        const menu = game.scene.getScene("MainMenuScene");
        menu?.events.once(Phaser.Scenes.Events.CREATE, () => enterWorld(payload));
        return;
      }

      enterWorld(payload);
    });
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
