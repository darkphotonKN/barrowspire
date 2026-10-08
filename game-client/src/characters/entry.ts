/**
 * Entering the HUB as a server character, and what the delver is told when one cannot be made
 * (FS-BDA7X req 39, 41).
 */

import type { EnterHubPayload } from "@/assets/types/client";
import { ApiError } from "@/utils/apiError";
import type { Character } from "./roster";

/**
 * The `enter_hub` request for the chosen character. `characterId` is what the server seats by;
 * class and name ride along for a server that does not read the id yet.
 */
export function enterHubPayload(character: Character): EnterHubPayload {
  const className = character.className.toLowerCase();
  return {
    characterId: character.id,
    class: className,
    className,
    characterName: character.name,
    username: character.name,
  };
}

export const NAME_TAKEN =
  "That name is taken. Another delver already bears it.";
export const LEDGER_UNREACHABLE =
  "The barrow's ledger is out of reach. Try again shortly.";

/** Why a character could not be made, in words for the delver. */
export function creationRefusal(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return NAME_TAKEN;
    if (err.status === 400) return `The ledger will not take it: ${err.detail}`;
  }
  return LEDGER_UNREACHABLE;
}
