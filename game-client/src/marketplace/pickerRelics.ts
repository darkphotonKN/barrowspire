/**
 * What the List-a-relic picker reads (FS-8EGFA req 25, FS-HBXZN R14, FS-3R77D R10): the member's
 * relics with their status and location, and which of them are worn, from the loadout read beside
 * them. The instances API
 * carries no worn flag; the loadout is where "worn" lives. Pure, so the hook only wires it to state.
 */

import type { components } from "@/api/generated/schema";
import type { PickerInstance } from "./listRelic";

type Loadout = components["schemas"]["GetLoadoutResponse"];

/** The loadout's ten slots: five armour and weapon, two rings, three consumables. */
const SLOTS = [
  "weaponId",
  "headId",
  "chestId",
  "glovesId",
  "legsId",
  "ring1Id",
  "ring2Id",
  "consumable1Id",
  "consumable2Id",
  "consumable3Id",
] as const satisfies readonly (keyof Loadout)[];

/** Every instance id in a slot of the loadout. The loadout omits an empty slot; none is none worn. */
export function wornIds(loadout: Loadout | undefined): Set<string> {
  return new Set(SLOTS.flatMap((slot) => (loadout?.[slot] ? [loadout[slot]] : [])));
}

/** The REST calls the picker reads, as `apiClient` makes them. */
export interface PickerRelicsApi {
  getItemInstances(): Promise<{ result?: { items?: PickerInstance[] | null } }>;
  getLoadout(): Promise<{ result?: Loadout }>;
}

export interface PickerRelics {
  items: PickerInstance[];
  worn: ReadonlySet<string>;
}

/**
 * Both reads, side by side. A failed relics read fails the load, as before. A failed loadout read
 * marks nothing worn and the picker stays usable (FS-HBXZN R16, FS-3R77D R13): the server refuses
 * a worn relic.
 */
export async function loadPickerRelics(api: PickerRelicsApi): Promise<PickerRelics> {
  const [instances, loadout] = await Promise.all([
    api.getItemInstances(),
    api.getLoadout().catch(() => undefined),
  ]);
  return { items: instances.result?.items ?? [], worn: wornIds(loadout?.result) };
}
