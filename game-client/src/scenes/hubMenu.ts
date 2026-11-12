/**
 * The town's ESC menu choices (FS-G4VMQ R3), which a field world's ESC menu offers too (FS-G4VMQ
 * § Change: The ESC menu in a field world, C2). Phaser-free.
 */

/** One line of the hub's ESC menu (FS-G4VMQ §Requirements 3). */
export interface HubMenuChoice {
  id: "change" | "leave" | "back";
  label: string;
  /** Amber for a thing the player can do, the cancel register for going back. */
  register: "actionable" | "cancel";
}

/**
 * What the ESC menu offers, from the scene's state at the moment it opens: the way to the main
 * menu and the way back into the hub always; leaving the queue only while there is a queue to
 * leave. The menu never names the hub ("hub" has no lore name), so it names what changes, the
 * character, not where the player goes.
 */
export function hubMenuChoices(state: { queued: boolean }): HubMenuChoice[] {
  const choices: HubMenuChoice[] = [
    { id: "change", label: "Change character", register: "actionable" },
  ];
  if (state.queued) choices.push({ id: "leave", label: "Leave the queue", register: "actionable" });
  choices.push({ id: "back", label: "Back  [Esc]", register: "cancel" });
  return choices;
}
