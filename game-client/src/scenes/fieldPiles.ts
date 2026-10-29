import type { ActionType, InteractPayload } from "@/assets/types/client";
import type { ContainerState, ItemState } from "@/types/gameState";
import type { Point } from "@/render/iso";
import { pileAlpha, reservedForOther } from "@/render/world/dropPile";
import { lootMessage } from "@/ui/ContainerView";
import { lootRefusalCopy } from "./fieldRefusals";

/**
 * A field's drop piles (FS-X2F2H §Requirements 56, 59): drawn as a run's, taken from through the
 * run's satchel ({@link PileSatchel}, the run's ContainerView), never a copy of either. A pile held
 * for someone else's kill (`reserved_for` not me) is drawn faint and its pickup is not offered:
 * reaching for it gets the `loot_reserved` words instead (R33, R60). Phaser-free: the scene hands
 * it a stage to draw on, the satchel, and a port for words and sends.
 */

/** How near, in world px, the player stands to reach a pile: the run's coffer reach. */
export const PILE_REACH = 60;

/** A pile as drawn. */
export interface PileSprite {
  setAlpha(alpha: number): unknown;
  destroy(): void;
}

/** Where piles are drawn: one heap at a world point. */
export interface PileStage {
  place(at: Point): PileSprite;
}

/** What the piles ask of the run's satchel. */
export interface PileSatchel {
  readonly entityId: string | undefined;
  open(entityId: string): void;
  close(): void;
  setItems(items: readonly ItemState[]): void;
}

/** Words on screen, and messages to the server. */
export interface PilesPort {
  notice(text: string): void;
  send(action: typeof ActionType.Interact, payload: InteractPayload): void;
}

interface Drawn {
  sprite: PileSprite;
  pile: ContainerState;
}

export class FieldPiles {
  private readonly drawn = new Map<string, Drawn>();
  private me: string | undefined;

  constructor(
    private readonly stage: PileStage,
    private readonly satchel: PileSatchel,
    private readonly port: PilesPort,
  ) {}

  /**
   * One state's containers: its drop piles holding anything are the whole truth (an emptied pile
   * has nothing to draw or take, as in a run), each as faint as its reservation says. `me` is
   * this client's member id, what `reserved_for` names.
   */
  sync(containers: readonly ContainerState[], me: string | undefined): void {
    this.me = me;
    const piles = containers.filter((c) => c.kind === "drop_pile" && c.items.length > 0);
    const present = new Set(piles.map((p) => p.entity_id));

    for (const [id, drawn] of this.drawn) {
      if (present.has(id)) continue;
      drawn.sprite.destroy();
      this.drawn.delete(id);
    }
    for (const pile of piles) {
      const drawn = this.drawn.get(pile.entity_id);
      const sprite = drawn?.sprite ?? this.stage.place({ x: pile.position.x, y: pile.position.y });
      sprite.setAlpha(pileAlpha(pile, me));
      this.drawn.set(pile.entity_id, { sprite, pile });
    }

    const open = this.satchel.entityId;
    if (open === undefined) return;
    const shown = this.drawn.get(open)?.pile;
    if (!shown || reservedForOther(shown, me)) this.satchel.close();
    else this.satchel.setItems(shown.items);
  }

  /**
   * The player reaches for the nearest pile within reach: its satchel opens (or closes, if it is
   * the one open), unless the pile is someone else's, which gets the reserved words. Whether a
   * pile was in reach.
   */
  interact(at: Point): boolean {
    const near = this.nearest(at);
    if (!near) return false;
    if (reservedForOther(near, this.me)) {
      this.say("loot_reserved");
      return true;
    }
    if (this.satchel.entityId === near.entity_id) {
      this.satchel.close();
      return true;
    }
    this.satchel.open(near.entity_id);
    this.satchel.setItems(near.items);
    return true;
  }

  /** A loot from the open satchel, sent as the run sends it; held back from someone else's pile. */
  loot(item: ItemState): void {
    const open = this.satchel.entityId;
    const pile = open === undefined ? undefined : this.drawn.get(open)?.pile;
    if (pile && reservedForOther(pile, this.me)) {
      this.say("loot_reserved");
      return;
    }
    const { action, payload } = lootMessage(item);
    this.port.send(action, payload);
  }

  /** The server refused a pickup: its words, if it was a reserved pile's. */
  refused(reason: string | undefined): void {
    this.say(reason);
  }

  /** The player has moved: the satchel closes once its pile is out of reach. */
  follow(at: Point): void {
    const open = this.satchel.entityId;
    if (open === undefined) return;
    const pile = this.drawn.get(open)?.pile;
    if (!pile || distance(at, pile.position) > PILE_REACH) this.satchel.close();
  }

  /** Everything one visit drew is let go. */
  release(): void {
    for (const drawn of this.drawn.values()) drawn.sprite.destroy();
    this.drawn.clear();
    this.me = undefined;
    if (this.satchel.entityId !== undefined) this.satchel.close();
  }

  private nearest(at: Point): ContainerState | undefined {
    let best: ContainerState | undefined;
    let bestDistance = PILE_REACH;
    for (const { pile } of this.drawn.values()) {
      const d = distance(at, pile.position);
      if (d <= bestDistance) {
        best = pile;
        bestDistance = d;
      }
    }
    return best;
  }

  private say(reason: string | undefined): void {
    const words = lootRefusalCopy(reason);
    if (words) this.port.notice(words);
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
