import { describe, expect, it } from "vitest";
import type { CageState, ContainerState, DoorState, SealPieceState, TrapState } from "@/types/gameState";
import { aimInteractables } from "./aimInteractables";

// FS-X2CMM §H R41, §J R50, R52 (I-X2CMM-15): the run's interactables an interactable page may name, each
// with what it is, where it is drawn (world px) and the id the cast sends. Which a page takes is the
// page's own (`PAGE_COPY[page].targets`); this only names them.

const CELL = 80;

const piece = (entity_id: string, kind: string, active = false): SealPieceState => ({
  entity_id,
  kind,
  position: { x: 400, y: 240 },
  cell: { x: 5, y: 3 },
  active,
});

const container = (entity_id: string, kind: ContainerState["kind"], is_open = false): ContainerState => ({
  container_id: `c-${entity_id}`,
  entity_id,
  kind,
  position: { x: 100, y: 200 },
  is_open,
  items: [],
});

const trap = (entity_id: string, armed = true): TrapState => ({
  entity_id,
  kind: "spike_plate",
  cell: { x: 2, y: 7 },
  armed,
  revealed: false,
});

const door: DoorState = { entity_id: "door", position: { x: 300, y: 500 }, width: 80, height: 16, is_open: false };

describe("aimInteractables (FS-X2CMM R41)", () => {
  it("should name an up lever and an up bridge lever as levers, and a stone block as a stone block", () => {
    const named = aimInteractables(
      { seal_pieces: [piece("l", "lever"), piece("b", "bridge_lever"), piece("s", "block")], containers: [], doors: [] },
      CELL,
    );
    expect(named).toEqual([
      { id: "l", at: { x: 400, y: 240 }, kind: "lever" },
      { id: "b", at: { x: 400, y: 240 }, kind: "lever" },
      { id: "s", at: { x: 400, y: 240 }, kind: "stone_block" },
    ]);
  });

  it("should name no lever already down, no plate, brazier, stair key, mural or shrine", () => {
    const pieces = [
      piece("down", "lever", true),
      piece("lowered", "bridge_lever", true),
      ...["plate", "brazier", "stair_key", "mural", "shrine", "unknown"].map((k) => piece(k, k)),
    ];
    expect(aimInteractables({ seal_pieces: pieces, containers: [], doors: [] }, CELL)).toEqual([]);
  });

  it("should name a shut chest or sack, never an open one or a drop pile", () => {
    const named = aimInteractables(
      {
        containers: [container("chest", "chest"), container("sack", "sack"), container("open", "chest", true), container("pile", "drop_pile", true)],
        doors: [],
      },
      CELL,
    );
    expect(named.map((b) => [b.id, b.kind])).toEqual([
      ["chest", "chest"],
      ["sack", "chest"],
    ]);
  });

  it("should name a door at its doorway's middle, as the server measures its reach", () => {
    expect(aimInteractables({ containers: [], doors: [door] }, CELL)).toEqual([{ id: "door", at: { x: 340, y: 508 }, kind: "door" }]);
  });

  // I-X2CMM-19: Pick the Lock's cage (FS-X2CMM §J R55; FS-4EC7Z §F R23)
  it("should name a shut cage as a cage, never an open one", () => {
    const cage = (entity_id: string, open: boolean): CageState => ({ entity_id, position: { x: 640, y: 320 }, open });
    const named = aimInteractables({ containers: [], doors: [], cages: [cage("shut", false), cage("open", true)] }, CELL);
    expect(named).toEqual([{ id: "shut", at: { x: 640, y: 320 }, kind: "cage" }]);
  });

  it("should name a detected trap still armed at its cell's centre, never one waiting to re-arm", () => {
    const named = aimInteractables({ containers: [], doors: [], traps: [trap("armed"), trap("waiting", false)] }, CELL);
    expect(named).toEqual([{ id: "armed", at: { x: 2.5 * CELL, y: 7.5 * CELL }, kind: "trap" }]);
  });
});
