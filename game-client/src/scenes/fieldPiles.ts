import { ActionType, type InteractPayload } from "@/assets/types/client";
import type { ContainerState, ItemState } from "@/types/gameState";
import type { Point } from "@/render/iso";
import { pileAlpha, reservedForOther } from "@/render/world/dropPile";
import { lootMessage } from "@/ui/ContainerView";
import { lootRefusalCopy } from "./fieldRefusals";

/**
 * A field's drop piles (FS-X2F2H §Requirements 56, 59): drawn as a run's, taken from through the
 * run's satchel ({@link PileSatchel}, the run's ContainerView), never a copy of either. A pile held
 * for someone else's kill (`reserved_for` not me) is drawn faint and its pickup is not offered:
 * reaching for it gets the `loot_reserved` words instead (R33, R60). A Forest clearing chest
 * (FS-3QHQZ §Requirements 19) is drawn and opened as a run's coffer, through the same satchel: its
 * frame follows `is_open` on every state, never a remembered open, so a chest that restocks draws
 * closed and opens again; it is never reserved. Phaser-free: the scene hands it a stage to draw
 * on, the satchel, and a port for words and sends.
 */

/** How near, in world px, the player stands to reach a pile or chest: the run's coffer reach. */
export const PILE_REACH = 60;

/** A pile as drawn. */
export interface PileSprite {
  setAlpha(alpha: number): unknown;
  destroy(): void;
}

/** A chest as drawn: the scene shows its closed or open frame. */
export interface ChestSprite {
  show(isOpen: boolean): unknown;
  destroy(): void;
}

/** Where piles and chests are drawn: one heap, or one chest, at a world point. */
export interface PileStage {
  place(at: Point): PileSprite;
  placeChest(at: Point): ChestSprite;
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

type Drawn =
  | { kind: "drop_pile"; sprite: PileSprite; pile: ContainerState }
  | { kind: "chest"; sprite: ChestSprite; pile: ContainerState };

export class FieldPiles {
  private readonly drawn = new Map<string, Drawn>();
  private me: string | undefined;
  /** The open satchel's chest was seen open since the satchel opened: shut again, it restocked. */
  private chestSeenOpen = false;

  constructor(
    private readonly stage: PileStage,
    private readonly satchel: PileSatchel,
    private readonly port: PilesPort,
  ) {}

  /**
   * One state's containers are the whole truth: its drop piles holding anything (an emptied pile
   * has nothing to draw or take, as in a run), each as faint as its reservation says, and its
   * chests, each in the frame its `is_open` says. `me` is this client's member id, what
   * `reserved_for` names.
   */
  sync(containers: readonly ContainerState[], me: string | undefined): void {
    this.me = me;
    const shown = containers.filter(
      (c) => c.kind === "chest" || (c.kind === "drop_pile" && c.items.length > 0),
    );
    const present = new Set(shown.map((c) => c.entity_id));

    for (const [id, drawn] of this.drawn) {
      if (present.has(id)) continue;
      drawn.sprite.destroy();
      this.drawn.delete(id);
    }
    for (const container of shown) this.draw(container, me);

    this.followSatchel();
  }

  /**
   * The player reaches for the nearest pile or chest within reach: its satchel opens (or closes,
   * if it is the one open), unless the pile is someone else's, which gets the reserved words. A
   * chest is opened as a run opens its coffer, by the run's interact with the chest's id, and its
   * satchel fills once the state has it open. Whether anything was in reach.
   */
  interact(at: Point): boolean {
    const near = this.nearest(at);
    if (!near) return false;
    if (this.heldForOther(near)) {
      this.say("loot_reserved");
      return true;
    }
    if (this.satchel.entityId === near.entity_id) {
      this.satchel.close();
      return true;
    }
    if (near.kind === "chest") this.port.send(ActionType.Interact, { entity_id: near.entity_id });
    this.satchel.open(near.entity_id);
    this.chestSeenOpen = near.is_open;
    if (near.kind !== "chest" || near.is_open) this.satchel.setItems(near.items);
    return true;
  }

  /** A loot from the open satchel, sent as the run sends it; held back from someone else's pile. */
  loot(item: ItemState): void {
    const open = this.satchel.entityId;
    const pile = open === undefined ? undefined : this.drawn.get(open)?.pile;
    if (pile && this.heldForOther(pile)) {
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

  /** The player has moved: the satchel closes once its pile or chest is out of reach. */
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
    this.chestSeenOpen = false;
    if (this.satchel.entityId !== undefined) this.satchel.close();
  }

  /** One container as this state has it: a pile at its reservation's alpha, a chest in its frame. */
  private draw(container: ContainerState, me: string | undefined): void {
    const at = { x: container.position.x, y: container.position.y };
    const drawn = this.drawn.get(container.entity_id);
    if (container.kind === "chest") {
      const sprite = drawn?.kind === "chest" ? drawn.sprite : this.stage.placeChest(at);
      sprite.show(container.is_open);
      this.drawn.set(container.entity_id, { kind: "chest", sprite, pile: container });
      return;
    }
    const sprite = drawn?.kind === "drop_pile" ? drawn.sprite : this.stage.place(at);
    sprite.setAlpha(pileAlpha(container, me));
    this.drawn.set(container.entity_id, { kind: "drop_pile", sprite, pile: container });
  }

  /**
   * The open satchel in step with the state: closed once its pile or chest is gone, its pile is
   * someone else's, or its chest has restocked (seen open, now shut); otherwise showing what is
   * in it, a chest's once the server has it open.
   */
  private followSatchel(): void {
    const open = this.satchel.entityId;
    if (open === undefined) return;
    const shown = this.drawn.get(open)?.pile;
    if (!shown || this.heldForOther(shown)) {
      this.satchel.close();
      return;
    }
    if (shown.kind !== "chest") {
      this.satchel.setItems(shown.items);
      return;
    }
    if (shown.is_open) {
      this.chestSeenOpen = true;
      this.satchel.setItems(shown.items);
    } else if (this.chestSeenOpen) {
      this.satchel.close();
    }
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

  /** A pile held for someone else's kill; a chest never is. */
  private heldForOther(container: ContainerState): boolean {
    return container.kind === "drop_pile" && reservedForOther(container, this.me);
  }

  private say(reason: string | undefined): void {
    const words = lootRefusalCopy(reason);
    if (words) this.port.notice(words);
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
