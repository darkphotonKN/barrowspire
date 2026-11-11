/**
 * The arrival card's words (FS-PQ2TW §C R19, R23; ADR-0073 Decision 5): one table, total over the
 * places a player can arrive in. A place gets no card code of its own, only its entry here, and a
 * field id with no entry does not compile. Pure, so the copy is tested without a canvas.
 *
 * A run's floor 1 has its own row (R21); every floor above it is worked out from the floor by
 * `floorCard`, the climb's words (R22).
 */

import type { FieldId } from "@/assets/types/client";
import { floorCard } from "./floor";

/** What an arrival card says: the place's name, and one line under it in the lore voice. */
export interface CardWords {
  title: string;
  line: string;
}

/** A place a player arrives in: the town, a field, or a floor of a run. */
export type Place =
  | { world: "hub" }
  | { world: "field"; field: FieldId }
  | { world: "run"; floor: number; top: boolean };

/**
 * The town's, each field's and a run's first floor's words. The titles are the names the screen
 * already uses; floor 1's line is the owner's.
 */
export const PLACE_CARDS: { hub: CardWords; field: Record<FieldId, CardWords>; firstFloor: CardWords } = {
  hub: { title: "The Town", line: "The Spire's shadow lies on every roof." },
  field: {
    gentle_meadows: { title: "Gentle Meadows", line: "The grass is soft, and the Spire is far." },
    forlorn_forest: { title: "The Forlorn Forest", line: "The dead have not left these trees." },
    dev_test_room: { title: "Dev Test Room", line: "Nothing here is kept." },
  },
  firstFloor: { title: "The First Floor", line: "The barrow takes you in." },
};

/** The words of the card an arrival in `place` plays. */
export function placeCard(place: Place): CardWords {
  switch (place.world) {
    case "hub":
      return PLACE_CARDS.hub;
    case "field":
      return PLACE_CARDS.field[place.field];
    case "run":
      // floor 1 is only ever arrived on, never climbed to, whatever the run's height (R21)
      return place.floor === 1 ? PLACE_CARDS.firstFloor : floorCard(place);
  }
}
