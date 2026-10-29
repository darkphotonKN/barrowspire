import type * as Phaser from "phaser";
import { PLACEHOLDER_TEXTURE } from "@/render/art/library";
import type { MonsterStage } from "./monsters";

/**
 * A Phaser scene as the monster roster's stage: every world with monsters draws them through the
 * same roster on its own scene (FS-77AB6 req 34–39, FS-X2F2H §Requirements 56).
 */
export function phaserMonsterStage(scene: Phaser.Scene): MonsterStage {
  return {
    sprite: () => scene.add.sprite(0, 0, PLACEHOLDER_TEXTURE),
    text: (content, style) => scene.add.text(0, 0, content, style),
    graphics: () => scene.add.graphics(),
  };
}
