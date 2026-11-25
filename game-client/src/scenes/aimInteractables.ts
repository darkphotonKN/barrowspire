/**
 * The run's interactables as an armed interactable page sees them (FS-X2CMM §H R41): each one an
 * interactable page may name, with what it is, where it stands (world px) and the entity id its cast
 * sends. Which of them a page takes is the page's own, in data (`PAGE_COPY[page].targets`): Far Hand's
 * levers, chests, doors and traps (§J R50), Heave's stone blocks (R52), Pick the Lock's shut cage (R55),
 * Strike a Deal's willing Cutthroats (R56). A later page adds its own kind here once, and names it in its
 * targets; the run scene never asks which page is armed.
 *
 * Pure and Phaser-free, as the aim it feeds (`pageAim.ts`). What a kind leaves out mirrors the server's
 * own rule (`systems/book_far_hand.go`): a lever already down, an open coffer, a trap waiting to re-arm.
 * The server judges the cast it is sent regardless (ADR-0030).
 */

import type { AimTargetKind } from "@/data/classBooks";
import { placedKind, type ClientGameState } from "@/types/gameState";
import type { AimBody } from "./pageAim";

/** The parts of a state the interactables are named from. */
export type AimInteractableState = Pick<
  ClientGameState,
  "containers" | "doors" | "seal_pieces" | "traps" | "cages" | "encounter_npcs"
>;

/** A seal piece's kind as an aim target: levers still up, and the stone blocks. */
const PIECE_TARGETS: Readonly<Record<string, (active: boolean) => AimTargetKind | null>> = {
  lever: (active) => (active ? null : "lever"),
  bridge_lever: (active) => (active ? null : "lever"),
  block: () => "stone_block",
};

/** Every interactable of `state` a page may name, in the order the state lists them; `cell` is the floor's cell edge. */
export function aimInteractables(state: AimInteractableState, cell: number): AimBody[] {
  const named: AimBody[] = [];
  for (const piece of state.seal_pieces ?? []) {
    const kind = PIECE_TARGETS[piece.kind]?.(piece.active) ?? null;
    if (kind) named.push({ id: piece.entity_id, at: { x: piece.position.x, y: piece.position.y }, kind });
  }
  // read through placedKind: a kind this client does not know is a chest, and aimable as one
  for (const c of state.containers ?? []) {
    const kind = placedKind(c);
    if (!c.is_open && (kind === "chest" || kind === "sack")) {
      named.push({ id: c.entity_id, at: { x: c.position.x, y: c.position.y }, kind: "chest" });
    }
  }
  // a door is stored by its top-left corner: it is aimed at, and its range judged to, its doorway's middle
  for (const d of state.doors ?? []) {
    named.push({ id: d.entity_id, at: { x: d.position.x + d.width / 2, y: d.position.y + d.height / 2 }, kind: "door" });
  }
  // every trap sent is detected; one waiting to re-arm cannot be sprung
  for (const t of state.traps ?? []) {
    if (t.armed) named.push({ id: t.entity_id, at: { x: (t.cell.x + 0.5) * cell, y: (t.cell.y + 0.5) * cell }, kind: "trap" });
  }
  // a cage is picked shut; an open one has no lock left
  for (const c of state.cages ?? []) {
    if (!c.open) named.push({ id: c.entity_id, at: { x: c.position.x, y: c.position.y }, kind: "cage" });
  }
  // a group shows no body of its own: any of its NPCs names it. Willing looks like a living Cutthroat not
  // hired (FS-4EC7Z §D R15); a turned one rides the monsters, and the server judges the rest
  for (const n of state.encounter_npcs ?? []) {
    if (n.kind === "cutthroat" && n.stance === "peaceful" && n.action !== "dead" && n.health > 0) {
      named.push({ id: n.entity_id, at: { x: n.position.x, y: n.position.y }, kind: "willing_cutthroat" });
    }
  }
  return named;
}

/**
 * The interactables of the last state asked about, named once per state: the aim asks every frame a page
 * is armed, and a state comes far less often. A state is never changed in place (each broadcast is parsed
 * anew), so the same state object and cell give the same list.
 *
 *   const candidates = new AimCandidates();
 *   candidates.of(lastGameState, cell); // every frame: rebuilt only for a new state or cell
 */
export class AimCandidates {
  private state?: AimInteractableState;
  private cell?: number;
  private named: readonly AimBody[] = [];

  /** The interactables of `state` (none without one), named afresh only when it or `cell` changed. */
  of(state: AimInteractableState | undefined, cell: number): readonly AimBody[] {
    if (!state) return [];
    if (state !== this.state || cell !== this.cell) {
      this.named = aimInteractables(state, cell);
      this.state = state;
      this.cell = cell;
    }
    return this.named;
  }
}
