/**
 * The Captives' cage and its key on the canvas (FS-4EC7Z §G R31, §H R36): the cage drawn shut or open
 * from the resident `sealed` group's `cage` sheet, in two layers on one anchor, its back (with its
 * shadow) sorted by its far corner under the captives standing in it and its front by its near corner
 * over them; the cage key drawn where it lies (`cage_key`). The broadcast is the whole truth: a key no
 * longer listed (taken) goes. The key, and the cage while shut, are E targets in reach. Pure, so it is
 * tested without a canvas, as `SealSet` is; the scene's stage draws each frame.
 */

import type { Point } from "@/render/iso/projection";
import type { CageState, EncounterKeyState } from "@/types/gameState";
import { INTERACT_RANGE } from "./stairs";

/** A frame of a baked prop: its sheet and the state animation it shows. */
export interface CageLook {
  sheet: string;
  frame: string;
}

/** Half the cage's side, world px: game-service `CageHalfSize`, where its corners stand. */
export const CAGE_HALF = 40;

/** The cage's two layers, shut or open. */
export function cageLooks(open: boolean): { back: CageLook; front: CageLook } {
  const state = open ? "open" : "shut";
  return { back: { sheet: "cage", frame: `${state}_back` }, front: { sheet: "cage", frame: `${state}_front` } };
}

/** The cage key as it lies. */
export const KEY_LOOK: CageLook = { sheet: "cage_key", frame: "default" };

/** What E reaches here (R31): the cage key to take, or the shut cage to open with it. */
export type CageTarget = { kind: "cage" | "cage_key"; entityId: string };

/** The scene's side: a frame drawn at `at`, sorted by `depthAt`, and turned to another frame. */
export interface CageStage<S extends { destroy(): void }> {
  add(look: CageLook, at: Point, depthAt: Point): S;
  show(sprite: S, look: CageLook): void;
}

interface DrawnCage<S> {
  back: S;
  front: S;
  pos: Point;
  open: boolean;
}

interface DrawnKey<S> {
  sprite: S;
  pos: Point;
}

export class CageSet<S extends { destroy(): void }> {
  private readonly cages = new Map<string, DrawnCage<S>>();
  private readonly keys = new Map<string, DrawnKey<S>>();

  constructor(private readonly stage: CageStage<S>) {}

  /** Make the canvas match the broadcast. */
  sync(state: { cages?: CageState[]; encounter_keys?: EncounterKeyState[] }): void {
    const cages = state.cages ?? [];
    const cageIds = new Set(cages.map((c) => c.entity_id));
    for (const [id, c] of this.cages)
      if (!cageIds.has(id)) {
        c.back.destroy();
        c.front.destroy();
        this.cages.delete(id);
      }
    for (const wire of cages) {
      const pos = { x: wire.position.x, y: wire.position.y };
      const held = this.cages.get(wire.entity_id);
      const looks = cageLooks(wire.open);
      if (!held) {
        const back = this.stage.add(looks.back, pos, { x: pos.x - CAGE_HALF, y: pos.y - CAGE_HALF });
        const front = this.stage.add(looks.front, pos, { x: pos.x + CAGE_HALF, y: pos.y + CAGE_HALF });
        this.cages.set(wire.entity_id, { back, front, pos, open: wire.open });
        continue;
      }
      if (held.open === wire.open) continue;
      held.open = wire.open;
      this.stage.show(held.back, looks.back);
      this.stage.show(held.front, looks.front);
    }

    const keys = state.encounter_keys ?? [];
    const keyIds = new Set(keys.map((k) => k.entity_id));
    for (const [id, k] of this.keys)
      if (!keyIds.has(id)) {
        k.sprite.destroy();
        this.keys.delete(id);
      }
    for (const wire of keys) {
      if (this.keys.has(wire.entity_id)) continue;
      const pos = { x: wire.position.x, y: wire.position.y };
      this.keys.set(wire.entity_id, { sprite: this.stage.add(KEY_LOOK, pos, pos), pos });
    }
  }

  /** The nearest of the keys and the shut cages E reaches from `me`, with how far it stands. */
  reach(me: Point): { target: CageTarget; distance: number } | null {
    const near: { target: CageTarget; distance: number }[] = [];
    for (const [entityId, k] of this.keys) near.push({ target: { kind: "cage_key", entityId }, distance: Math.hypot(me.x - k.pos.x, me.y - k.pos.y) });
    for (const [entityId, c] of this.cages)
      if (!c.open) near.push({ target: { kind: "cage", entityId }, distance: Math.hypot(me.x - c.pos.x, me.y - c.pos.y) });
    let best: (typeof near)[number] | null = null;
    for (const n of near) if (n.distance < INTERACT_RANGE && (!best || n.distance < best.distance)) best = n;
    return best;
  }

  /** Each sprite drawn, with where it stands: what the hide rule and the blackout read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    const out: { sprite: S; pos: Point }[] = [];
    for (const c of this.cages.values()) out.push({ sprite: c.back, pos: c.pos }, { sprite: c.front, pos: c.pos });
    for (const k of this.keys.values()) out.push({ sprite: k.sprite, pos: k.pos });
    return out;
  }

  /** Destroy every sprite and forget them. */
  clear(): void {
    for (const { sprite } of this.placed()) sprite.destroy();
    this.forget();
  }

  /** Forget everything without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.cages.clear();
    this.keys.clear();
  }
}
