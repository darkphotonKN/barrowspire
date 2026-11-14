import type Phaser from "phaser";
import { ArtLibrary } from "@/render/art/library";
import { hudPieces } from "./hudPieces";
import type { World } from "./uiBridge";
import { UiHudSlot, type HudKind } from "./uiSceneHud";
import { uiSceneOn } from "./uiSceneMenu.standin";

/** The HUD slot built over each world under test: one per world scene, as one UI scene per game. */
const slots = new WeakMap<object, UiHudSlot>();

/**
 * Test-only: the UI scene's HUD over `scene`'s world (FS-TQZ5J § Change: Batch 5, R67–R69), as the UI
 * scene builds it (`mountHud`): the real pieces, built on `scene`'s own stage so a test finds their
 * words where it found the world's own, fed what the world hands through the bridge, taken down as the
 * world leaves. The potion icon is cut from the world's own art library, where it has one. One slot per
 * world scene: a later call hands back the one built.
 */
export function hudOver(scene: object, world: World): UiHudSlot {
  const built = slots.get(scene);
  if (built) return built;
  const { bridge } = uiSceneOn(scene, world, { row: false });
  const art = () => (scene as { art?: ArtLibrary }).art ?? ArtLibrary.empty({ warn: () => {} });
  const slot = new UiHudSlot(bridge, hudPieces(scene as Phaser.Scene, art));
  slot.world(bridge.world);
  bridge.onWorld((report) => slot.world(report));
  bridge.onScreen({ hud: (message) => slot.hear(message) });
  slots.set(scene, slot);
  return slot;
}

/** What a piece of the HUD over `scene` last drew, read as a record, or none: none built yet. */
function pieceOver(scene: object, kind: HudKind): Record<string, unknown> | undefined {
  return slots.get(scene)?.piece(kind) as Record<string, unknown> | undefined;
}

/** The ability card the UI scene draws over `scene`'s world now, or none (down, or never shown). */
export function abilityShownOver(scene: object): { name: string; line: string; greyed: boolean } | null {
  return (pieceOver(scene, "ability")?.shown as { name: string; line: string; greyed: boolean } | null | undefined) ?? null;
}

/** Where the UI scene stands the ability card over `scene`'s world (its bottom-right corner), once built. */
export function abilityPlaceOver(scene: object): unknown {
  return pieceOver(scene, "ability")?.place;
}
