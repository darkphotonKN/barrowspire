"use client";

import { useEffect, useRef, useCallback } from "react";
import * as Phaser from "phaser";
import { BARROW } from "@/utils/theme";
import { MainMenuScene } from "@/scenes/MainMenuScene";
import { CharacterCreationScene } from "@/scenes/CharacterCreationScene";
import { BarrowspireScene } from "@/scenes/BarrowspireScene";
import { PreloadScene } from "@/scenes/PreloadScene";
import { BootScene } from "@/scenes/BootScene";
import { HubScene } from "@/scenes/HubScene";
import { FieldScene } from "@/scenes/FieldScene";
import { WORLD_SCENES, sceneFor } from "./worldRouting";
import { WorldEnteredPayload } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
import { bootInProgress } from "./bootGate";
import { installCrispText } from "@/render/crispText";

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
      // a DOM layer over the canvas, for the chat input's real text field: the only way the
      // player's input method (Chinese and the rest) reaches the game (FS-WJGFJ R26)
      dom: { createContainer: true },
      // Soot, not umber: Boot and Preload are the gate into the menus, which wear the site's
      // Bone & Soot. The hub and the run set their own ground.
      backgroundColor: BARROW.menuSoot,
      // Baked art is drawn smoothed (docs/design-guideline.md "Linear filtering",
      // FS-2325V §C): linear filtering, at 1x from a 2x render. Positions stay
      // integer-aligned so a still frame is crisp and a moving one does not shimmer.
      pixelArt: false,
      render: {
        roundPixels: true,
        antialias: true,
        pixelArt: false,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: [
        BootScene,
        PreloadScene,
        MainMenuScene,
        CharacterCreationScene,
        HubScene,
        BarrowspireScene,
        FieldScene,
      ],
    };

    // every label rasterised at the device's pixel ratio, not scaled up from 1x
    installCrispText();
    const game = new Phaser.Game(config);
    gameRef.current = game;

    // THE transition. The server says which world the player is in — on entering
    // the hub, on a match, on returning, and on reconnecting after a refresh —
    // and the scene follows. One handler at the Phaser bridge rather than one
    // per scene, so no scene has to know what comes after it.
    // FS-29KSH §Requirements 15, 36.
    // Everything a world transition replaces: WORLD_SCENES (worldRouting.ts).
    const enterWorld = (payload: WorldEnteredPayload) => {
      const target = sceneFor(payload.world_type);

      // scene.start() from the manager does not stop what is already running,
      // unlike the same call from inside a scene, so the previous world would
      // stay live underneath.
      for (const key of WORLD_SCENES) {
        if (key !== target && game.scene.isActive(key)) game.scene.stop(key);
      }

      game.scene.start(target, {
        sessionID: payload.session_id,
        field: payload.field,
      });
    };

    socketManager.on("world_entered", (payload: WorldEnteredPayload) => {
      if (!payload?.world_type) return;

      // On a refresh the server announces the world as soon as the socket opens,
      // which can beat the boot chain to it. Switching then would tear down
      // PreloadScene mid-flight, so hold the message until the menu stands up.
      if (bootInProgress(game.scene)) {
        const menu = game.scene.getScene("MainMenuScene");
        menu?.events.once(Phaser.Scenes.Events.CREATE, () =>
          enterWorld(payload),
        );
        return;
      }

      // The run's end sends end_game and the hub in the same moment. While the
      // result card is up, the hub waits behind it until *Return to the hub*;
      // a run is never held. FS-QPDKN §Requirements 15–17.
      const run = game.scene.getScene(
        "BarrowspireScene",
      ) as BarrowspireScene | null;
      if (run?.resultHold.hold(payload, enterWorld)) return;

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
