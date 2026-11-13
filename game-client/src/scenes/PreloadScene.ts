import * as Phaser from "phaser";

import { preloadUiSounds } from "@/audio/uiSounds";
import { preloadArt } from "@/render/art/phaser";
import { RESIDENT_ART } from "@/render/art/sceneArt";
import { drawTorchBar } from "@/ui/torchBar";

/**
 * The first frame a player ever sees, between the site's "Lighting the Torch" loader and the
 * main menu. It wears the menus' Bone & Soot (design-guideline "UI Chrome") so the hand-off from
 * the page to the canvas to the menu is one room, not three. It loads the resident art and the
 * interface sound effects; the torch bar is the one a world scene shows while its own art downloads (`ui/torchBar.ts`).
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    // The boot screen: the torch bar on the 1080-wide stage (FS-ZAJMH R11), shared with every
    // scene that has art to download (FS-C4JWH §D R18). Its backdrop and pool stay up until the
    // main menu draws its own.
    const bar = drawTorchBar(this);
    this.load.on("progress", (value: number) => bar.progress(value));
    this.load.on("complete", () => bar.destroyBar());

    // The resident art, behind the torch bar: the main menu shows the cast straight after this
    // (FS-2325V §F), and every later scene finds it already loaded; each world loads its own
    // creatures or townsfolk as it is entered (FS-C4JWH §B R6).
    preloadArt(this, RESIDENT_ART);
    // The interface sound effects, resident for the game's life: no world loads or frees them,
    // so the first press in any world can sound (FS-WDM0X S20).
    preloadUiSounds(this);
  }

  create(): void {
    this.scene.start("MainMenuScene");
  }
}
