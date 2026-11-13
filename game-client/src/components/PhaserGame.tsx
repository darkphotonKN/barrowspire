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
import { DisconnectNoticeScene } from "@/scenes/DisconnectNoticeScene";
import { watchConnectionLoss } from "./disconnectNotice";
import { switchWorld } from "./worldRouting";
import { arrivals } from "./arrival";
import { WorldEnteredPayload } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
import { bootInProgress } from "./bootGate";
import { releaseGame } from "./releaseGame";
import { gameAudio } from "./gameAudio";
import { keepTab, takeFocusOnPress } from "./gameFocus";
import { frameFullscreen } from "./frameFullscreen";
import { keyboardLockOf } from "./fullscreen";
import { lendFullscreen } from "@/ui/gameFullscreen";
import GameFrame from "./GameFrame";
import { installCrispText } from "@/render/crispText";
import {
  backingSize,
  fitView,
  mountViewport,
  roundEveryObject,
  viewport,
} from "@/render/viewport";
import { VIEWPORT_FIT_PLUGIN } from "@/render/viewport/ViewportFit";

// Every game object rounded to the backing px (ADR-0057), installed once as the game's module
// loads, before any game or scene exists.
roundEveryObject(Phaser.GameObjects);

/** The game frame's CSS size: what the canvas is fitted into. */
const frameSize = (frame: HTMLElement) => ({
  width: frame.clientWidth,
  height: frame.clientHeight,
});

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unbindRef = useRef<(() => void) | null>(null);
  const releaseFocusRef = useRef<(() => void) | null>(null);
  const unwatchLossRef = useRef<(() => void) | null>(null);

  const initGame = useCallback(() => {
    if (gameRef.current || !containerRef.current || !frameRef.current) return;
    const frame = frameRef.current;

    // Fitted to the game frame and drawn at the screen's density (FS-ZAJMH R2, R3, R7–R9): the
    // logical view takes the frame's shape, the canvas is shown as big as fits it, and the
    // backing store is the logical view at the render scale; every camera is zoomed by the
    // render scale (ViewportFit, src/render/viewport/camera.ts).
    viewport.set(fitView(frameSize(frame), window.devicePixelRatio));
    const backing = backingSize(viewport.current());

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      scale: {
        mode: Phaser.Scale.NONE,
        width: backing.width,
        height: backing.height,
        zoom: viewport.cssScale / viewport.renderScale,
      },
      plugins: { scene: [VIEWPORT_FIT_PLUGIN] },
      // a DOM layer over the canvas, for the chat input's real text field: the only way the
      // player's input method (Chinese and the rest) reaches the game (FS-WJGFJ R26)
      dom: { createContainer: true },
      // the page's one audio context, which a destroyed game suspends rather than closes, so
      // leaving /game rejects no pending resume (gameAudio.ts)
      audio: gameAudio(),
      // Soot, not umber: Boot and Preload are the gate into the menus, which wear the site's
      // Bone & Soot. The hub and the run set their own ground.
      backgroundColor: BARROW.menuSoot,
      // Baked art is drawn smoothed (docs/design-guideline.md "Linear filtering",
      // FS-2325V §C): linear filtering, at 1x from a 2x render. Quads land on
      // backing px, at a fractional render scale too: `roundPixels` here is every camera's
      // wish, kept on and the scroll kept on the backing-px grid by keepOnPixelGrid, and
      // every object rounds whenever its camera does (src/render/viewport/rounding.ts,
      // ADR-0057), so a still frame is crisp and a moving one does not shimmer.
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
        // last, so drawn over every world: the disconnect notice (FS-R6EYZ R11)
        DisconnectNoticeScene,
      ],
    };

    // every label rasterised at the render scale, not scaled up from 1x
    installCrispText();
    const game = new Phaser.Game(config);
    gameRef.current = game;

    // the frame's fullscreen, lent to this game for the OPTIONS panel's Fullscreen row; none where
    // the browser has none to offer (FS-T3DWX R7, R12)
    lendFullscreen(game.registry, frameFullscreen(frame, document, keyboardLockOf(navigator)));

    // the DOM layer pinned to the canvas, and a re-fit on a resize of the frame (the window, the
    // banner, fullscreen) or a density change (another monitor), no reload (R10, R11, R16)
    unbindRef.current = mountViewport(game, frame);

    // Tab stays in the game while nothing on the page holds focus, and a press on the game takes
    // focus back from a page control (gameFocus.ts); both let go as the page unmounts
    const releaseTab = keepTab(game, window, document);
    const releasePress = takeFocusOnPress(containerRef.current, document);
    releaseFocusRef.current = () => {
      releaseTab();
      releasePress();
    };

    // THE transition. The server says which world the player is in — on entering
    // the hub, on a match, on returning, and on reconnecting after a refresh —
    // and the scene follows. One handler at the Phaser bridge rather than one
    // per scene, so no scene has to know what comes after it.
    // FS-29KSH §Requirements 15, 36.
    // Everything a world transition replaces: WORLD_SCENES (worldRouting.ts). Whether it is an
    // arrival is asked as the switch is made, so a held hub is judged when it is let in
    // (FS-PQ2TW R8).
    const enterWorld = (payload: WorldEnteredPayload) =>
      switchWorld(game.scene, payload, arrivals);

    // A lost connection while the player is in a world raises the disconnect notice; the watch is
    // this game's, let go with it, so a close after leaving /game raises nothing (FS-R6EYZ R6).
    unwatchLossRef.current = watchConnectionLoss(socketManager, game.scene);

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
      // settlement record is open, the hub waits behind it until the record is
      // closed or Leave is pressed; a run is never held. FS-GV8WN R23.
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
      unbindRef.current?.();
      unbindRef.current = null;
      releaseFocusRef.current?.();
      releaseFocusRef.current = null;
      unwatchLossRef.current?.();
      unwatchLossRef.current = null;
      if (gameRef.current) {
        // the keyboard goes back to the page now, not on the destroy's next frame (releaseGame.ts)
        releaseGame(gameRef.current, socketManager);
        gameRef.current = null;
      }
    };
  }, [initGame]);

  // the game frame (FS-ZAJMH "Terms"): the canvas and its DOM layer, what goes fullscreen
  return <GameFrame frame={frameRef} canvas={containerRef} />;
}
