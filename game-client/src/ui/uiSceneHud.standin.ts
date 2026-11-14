import type Phaser from "phaser";
import { ArtLibrary } from "@/render/art/library";
import { hudPieces } from "./hudPieces";
import type { World } from "./uiBridge";
import { UiHudSlot, hearHud, type HudBuild, type HudKind } from "./uiSceneHud";
import { uiSceneOn } from "./uiSceneMenu.standin";

/** The HUD slot built over each world under test, and what it built: one per world scene, as one UI scene per game. */
const slots = new WeakMap<object, { slot: UiHudSlot; built: Partial<Record<HudKind, unknown>> }>();

/** `build`, each piece it makes kept by its kind while it stands, for a test to read. */
function recording(build: HudBuild, built: Partial<Record<HudKind, unknown>>): HudBuild {
  const keep =
    <A, P extends { destroy(): void }>(kind: HudKind, make: (at: A) => P) =>
    (at: A) => {
      const piece = make(at);
      built[kind] = piece;
      const destroy = piece.destroy.bind(piece);
      piece.destroy = () => {
        if (built[kind] === piece) delete built[kind];
        destroy();
      };
      return piece;
    };
  return {
    ability: keep("ability", build.ability),
    potion: keep("potion", build.potion),
    bars: keep("bars", build.bars),
    progress: keep("progress", build.progress),
  };
}

/**
 * Test-only: the UI scene's HUD over `scene`'s world (FS-TQZ5J § Change: Batch 5, R67–R69), heard through
 * the UI scene's own wiring (`hearHud`, § Change: Batch 6, R138): the real pieces, built on `scene`'s own
 * stage so a test finds their words where it found the world's own, fed what the world hands through the
 * bridge, taken down as the world leaves. The potion icon is cut from the world's own art library, where
 * it has one. One slot per world scene: a later call hands back the one built. It is not taken down with
 * the world scene's stop, as the UI scene's outlives each world.
 */
export function hudOver(scene: object, world: World): UiHudSlot {
  const held = slots.get(scene);
  if (held) return held.slot;
  const { bridge } = uiSceneOn(scene, world, { row: false });
  const art = () => (scene as { art?: ArtLibrary }).art ?? ArtLibrary.empty({ warn: () => {} });
  const built: Partial<Record<HudKind, unknown>> = {};
  const slot = new UiHudSlot(bridge, recording(hudPieces(scene as Phaser.Scene, art), built));
  hearHud(slot, bridge);
  slots.set(scene, { slot, built });
  return slot;
}

/** What the piece of `kind` standing over `scene` drew, read as a record, or none: none standing. */
function pieceOver(scene: object, kind: HudKind): Record<string, unknown> | undefined {
  return slots.get(scene)?.built[kind] as Record<string, unknown> | undefined;
}

/** The ability card the UI scene draws over `scene`'s world now, or none (down, or never shown). */
export function abilityShownOver(scene: object): { name: string; line: string; greyed: boolean } | null {
  return (pieceOver(scene, "ability")?.shown as { name: string; line: string; greyed: boolean } | null | undefined) ?? null;
}

/** Where the UI scene stands the ability card over `scene`'s world (its bottom-right corner), once built. */
export function abilityPlaceOver(scene: object): unknown {
  return pieceOver(scene, "ability")?.place;
}
