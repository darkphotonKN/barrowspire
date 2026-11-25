/**
 * The run's interactables as an armed interactable page sees them (FS-X2CMM §H R41): each one an
 * interactable page may name, with what it is, where it stands (world px) and the entity id its cast
 * sends. Which of them a page takes is the page's own, in data (`PAGE_COPY[page].targets`): Far Hand's
 * levers, chests, doors and traps (§J R50), Heave's stone blocks (R52). A later page adds its own kind
 * here once, and names it in its targets; the run scene never asks which page is armed.
 *
 * Pure and Phaser-free, as the aim it feeds (`pageAim.ts`). What a kind leaves out mirrors the server's
 * own rule (`systems/book_far_hand.go`): a lever already down, an open coffer, a trap waiting to re-arm.
 * The server judges the cast it is sent regardless (ADR-0030).
 */

import type { AimTargetKind } from "@/data/classBooks";
import type { ClientGameState } from "@/types/gameState";
import type { AimBody } from "./pageAim";

/** The parts of a state the interactables are named from. */
export type AimInteractableState = Pick<ClientGameState, "containers" | "doors" | "seal_pieces" | "traps">;

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
  for (const c of state.containers ?? []) {
    if (!c.is_open && (c.kind === "chest" || c.kind === "sack")) {
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
  return named;
}
