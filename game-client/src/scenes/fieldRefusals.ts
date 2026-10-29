/**
 * What the player is told when a field will not take them or let them go (FS-X2F2H §Requirements
 * 10, 14, 60). The server sends a stable reason; the words are the client's, in the guideline's
 * voice (grim, terse), and a reason code never reaches the screen.
 */

import { ActionType } from "@/assets/types/client";

const ENTER: Record<string, string> = {
  not_in_hub: "You are not standing in the hub.",
  no_character: "Choose who walks out first.",
  unknown_field: "That road is not open yet.",
  not_at_gate: "Walk to the gate first.",
  queued: "The delve is gathering. Leave the queue first.",
  loadout_unavailable: "Your gear cannot be fetched. Try again shortly.",
};

const LEAVE: Record<string, string> = {
  not_in_field: "You are not out in the fields.",
  not_at_gate: "Walk to the road home first.",
  fallen: "You have fallen. You will rise at the road home.",
};

const FALLBACK: Record<string, string> = {
  [ActionType.EnterField]: "The road is shut for now. Try again.",
  [ActionType.LeaveField]: "The road home is shut for now. Try again.",
};

/** A pile still held for the one who made the kill (FS-X2F2H §Requirements 33, 59). */
const LOOT: Record<string, string> = {
  loot_reserved: "Not yours yet. The one who slew it has first claim.",
};

/** The words for a refused pickup from a field pile, by its reason; none for any other refusal. */
export function lootRefusalCopy(reason: string | undefined): string | undefined {
  return reason ? LOOT[reason] : undefined;
}

/** The words for a refused enter_field or leave_field, by its reason. */
export function fieldRefusalCopy(action: string, reason: string | undefined): string {
  const words = action === ActionType.LeaveField ? LEAVE : ENTER;
  return (reason && words[reason]) || FALLBACK[action] || FALLBACK[ActionType.EnterField];
}
