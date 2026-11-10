/**
 * What the List-a-relic picker reads (FS-8EGFA req 25, FS-3R77D R10, FS-50MTX R38): the account's
 * stash, asked for with no character, so the Bazaar needs none. A worn relic is in a bag and so
 * never comes back. Pure, so the hook only wires it to state.
 */

import type { PickerInstance } from "./listRelic";

/** The REST call the picker reads, as `apiClient` makes it. */
export interface PickerRelicsApi {
  getItemInstances(): Promise<{ result?: { items?: PickerInstance[] | null } }>;
}

export async function loadPickerRelics(api: PickerRelicsApi): Promise<PickerInstance[]> {
  const instances = await api.getItemInstances();
  return instances.result?.items ?? [];
}
