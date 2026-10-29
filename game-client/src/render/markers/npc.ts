/**
 * Function NPC markers (FS-MRZH7): how the hub tells the people a player deals with for real
 * (who give, take, or start a system) apart from the folk who only live there.
 */

import type { NPCState } from "@/types/gameState";

/**
 * A function NPC is one with a function, any function: the client derives it from the broadcast,
 * so a function it has no offer for yet is still marked (FS-MRZH7 req 1).
 */
export function isFunctionNPC(npc: Pick<NPCState, "function">): boolean {
  return npc.function !== "";
}

/** Nameplate sizes in px: a function NPC's name carries a step more weight (req 7). */
export const NPC_NAME_PX = { function: 13, ambient: 12 } as const;

const SIGIL_W = 8;
const SIGIL_H = 11;

/**
 * The sigil's lozenge (req 4), top, right, foot, left, standing with its foot on (`x`, `y`): the
 * caller puts the foot just above the nameplate.
 */
export function sigilPoints(x: number, y: number): { x: number; y: number }[] {
  return [
    { x, y: y - SIGIL_H },
    { x: x + SIGIL_W / 2, y: y - SIGIL_H / 2 },
    { x, y },
    { x: x - SIGIL_W / 2, y: y - SIGIL_H / 2 },
  ];
}
