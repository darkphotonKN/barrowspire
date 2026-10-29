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
 * closed and opens again; it is never reserved. A chest's satchel opens on the state that has it
 * open after the player reached for it, never on the key press, so an open the server refuses
 * leaves nothing open and empty. Phaser-free: the scene hands it a stage to draw on, the satchel,
 * a port for words and sends, and a clock.
 */

/** How near, in world px, the player stands to reach a pile or chest: the run's coffer reach. */
export const PILE_REACH = 60;

/**
 * How long, in ms, after reaching for a chest its open is waited for: a chest open by then opens
 * its satchel; one still shut by then was refused (out of the server's reach, or the server's
 * 100 ms interact cooldown), and nothing opens. Within it a shut state never closes the satchel:
 * it may be a restock landing ahead of the player's own open.
 */
export const CHEST_OPEN_WINDOW_MS = 1000;

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
  /** A chest reached for, and until when its open is waited for ({@link CHEST_OPEN_WINDOW_MS}). */
  private reach: { id: string; until: number } | undefined;

  constructor(
    private readonly stage: PileStage,
    private readonly satchel: PileSatchel,
    private readonly port: PilesPort,
    private readonly now: () => number = Date.now,
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
   * The player reaches for the nearest pile or chest within reach: a pile's satchel opens (or
   * closes, if it is the one open), unless the pile is someone else's, which gets the reserved
   * words. A chest is opened as a run opens its coffer, by the run's interact with the chest's id;
   * its satchel opens and fills once a state has it open, and a second press before then tries
   * again. Whether anything was in reach.
   */
  interact(at: Point): boolean {
    const near = this.nearest(at);
    if (!near) return false;
    if (this.heldForOther(near)) {
      this.say("loot_reserved");
      return true;
    }
    if (this.satchel.entityId === near.entity_id) {
      this.shut();
      return true;
    }
    if (near.kind === "chest") {
      this.port.send(ActionType.Interact, { entity_id: near.entity_id });
      this.shut();
      this.reach = { id: near.entity_id, until: this.now() + CHEST_OPEN_WINDOW_MS };
      return true;
    }
    this.reach = undefined;
    this.satchel.open(near.entity_id);
    this.satchel.setItems(near.items);
    return true;
  }

  /**
   * A loot from the open satchel, sent as the run sends it; held back from someone else's pile.
   * Whether it was sent.
   */
  loot(item: ItemState): boolean {
    const open = this.satchel.entityId;
    const pile = open === undefined ? undefined : this.drawn.get(open)?.pile;
    if (pile && this.heldForOther(pile)) {
      this.say("loot_reserved");
      return false;
    }
    const { action, payload } = lootMessage(item);
    this.port.send(action, payload);
    return true;
  }

  /** The server refused a pickup: its words, if it was a reserved pile's. */
  refused(reason: string | undefined): void {
    this.say(reason);
  }

  /**
   * The player has moved: the satchel closes once its pile or chest is out of reach, and a chest
   * reached for and walked away from is no longer waited for.
   */
  follow(at: Point): void {
    const target = this.satchel.entityId ?? this.reach?.id;
    if (target === undefined) return;
    const pile = this.drawn.get(target)?.pile;
    if (!pile || distance(at, pile.position) > PILE_REACH) this.shut();
  }

  /** Everything one visit drew is let go. */
  release(): void {
    for (const drawn of this.drawn.values()) drawn.sprite.destroy();
    this.drawn.clear();
    this.me = undefined;
    this.shut();
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
   * The open satchel in step with the state: a chest reached for opens its satchel on the first
   * state that has it open, or is given up once its window passes; the satchel closes once its
   * pile or chest is gone, its pile is someone else's, or its chest has restocked (seen open since
   * the reach, now shut, and the window passed); otherwise it shows what is in it.
   */
  private followSatchel(): void {
    this.followReach();
    const open = this.satchel.entityId;
    if (open === undefined) return;
    const shown = this.drawn.get(open)?.pile;
    if (!shown || this.heldForOther(shown)) {
      this.shut();
      return;
    }
    if (shown.kind !== "chest") {
      this.satchel.setItems(shown.items);
      return;
    }
    if (shown.is_open) {
      this.chestSeenOpen = true;
      this.satchel.setItems(shown.items);
    } else if (this.chestSeenOpen && this.reach?.id !== open) {
      this.shut();
    }
  }

  /** The chest reached for: its satchel opened once a state has it open; let go once its window passes. */
  private followReach(): void {
    const reach = this.reach;
    if (!reach) return;
    const chest = this.drawn.get(reach.id)?.pile;
    if (!chest || this.now() > reach.until) {
      this.reach = undefined;
      return;
    }
    if (chest.is_open && this.satchel.entityId !== reach.id) {
      this.satchel.open(reach.id);
      this.chestSeenOpen = false;
    }
  }

  /** The satchel closed, and nothing reached for or remembered. */
  private shut(): void {
    this.reach = undefined;
    this.chestSeenOpen = false;
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
