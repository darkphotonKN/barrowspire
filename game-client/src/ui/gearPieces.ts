/**
 * The gear overlay, its source and the container view, built on the UI scene for one world (FS-TQZ5J
 * § Change: Phase 3, R50, R51): in the town `HubGear`, fed from REST as the active character, with the
 * purse and the gold Takes it reads again on; in a field and the run `EquipmentHud`, fed the world's
 * state ticks, its equip and unequip asked of the world, and the container view, whose take the gear's
 * bag pre-checks and the world sends. Their reads (REST, the wallet, the stores) are app state, so they
 * go from the pieces (ADR-0082 D3). The icons are resident art, which the UI scene's own library
 * resolves as a world's did. `uiSceneGear.ts` holds what is built; this is the building.
 */

import type Phaser from "phaser";
import { ActionType } from "@/assets/types/client";
import type { ArtLibrary } from "@/render/art/library";
import { useGameStore } from "@/stores/gameStore";
import { useMailboxStore } from "@/stores/mailboxStore";
import { apiClient } from "@/utils/api";
import { ContainerContents, ContainerView, LOOT_PENDING_MS } from "./ContainerView";
import { EquipmentHud } from "./EquipmentHud";
import { GearOverlay } from "./GearOverlay";
import { HubGear, gearAsCharacter } from "./HubGear";
import { PurseReader } from "./purse";
import type { World } from "./uiBridge";
import { equipmentPiece, hubGearPiece, type GearPieces, type GearWiring } from "./uiSceneGear";

/** The pieces for `world` on `scene`, their icons from `library` (the UI scene's resident art, read as they are built). */
export function mountGearPieces(scene: Phaser.Scene, library: () => ArtLibrary, world: World, wiring: GearWiring): GearPieces {
  const art = library();
  const overlay = new GearOverlay(scene, art, world, wiring.wrapper);
  const purse = new PurseReader(apiClient, overlay);
  if (world === "hub") {
    const hub = new HubGear(
      overlay,
      gearAsCharacter(apiClient, () => useGameStore.getState().getActiveCharacter()?.id ?? null),
      { notice: wiring.notice },
      purse,
    );
    // a Take that carried gold reads the purse again, open or closed (FS-7TGZ3 R9)
    const stop = useMailboxStore.subscribe((state, prev) => {
      if (state.goldTaken !== prev.goldTaken) hub.refreshPurse();
    });
    return { gear: hubGearPiece(hub, stop) };
  }
  const hud = new EquipmentHud(
    overlay,
    {
      send: (action, payload) => wiring.send(action === ActionType.Equip ? "equip" : "unequip", payload.item_entity_id),
      notice: wiring.notice,
    },
    Date.now,
    purse,
  );
  // its take pre-checked by the bag, inside this scene (the charter's rule), and sent by the world
  const container = new ContainerView(
    scene,
    art,
    { onLoot: (item) => wiring.take(item), characterLevel: wiring.level, mayTake: () => hud.roomForOne() },
    new ContainerContents(LOOT_PENDING_MS),
  );
  return { gear: equipmentPiece(hud), container };
}
