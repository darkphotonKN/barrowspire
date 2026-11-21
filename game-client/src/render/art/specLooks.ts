/**
 * A world's player bodies in their spec looks (FS-1J1CB §C R16-R24, ADR-0088): the one piece the
 * town, the fields and the runs share for which sheet a player body draws, and for bringing a
 * look's art in while the scene runs.
 *
 *   const looks = new SpecLooks(art, onDemandArt(scene, art), bodies, groups);
 *   const anim = new CharacterAnimator(art, looks.look(player));   // a new body: its look, or its base
 *   looks.see(player.entity_id, player);                            // every player, every snapshot
 *   looks.forget(player.entity_id);                                 // a body gone
 *
 * A look's group is on demand (R18): the first snapshot carrying a player who wears it fetches it
 * (R19), and until every page is in the body draws its class's base sheet, untinted (R21). Then
 * each body wearing it is re-dressed on its own sprite, between one frame and the next
 * (`CharacterAnimator.wearing`). The player's own look comes with the world's preload instead
 * ({@link withOwnLook}, R20). Spec looks are the world scenes' only: nothing in the UI scene uses
 * this (ADR-0088 Decision 6).
 */

import { characterSheet } from "./animationSelect";
import type { AnimatedSprite, CharacterAnimator, CharacterLook } from "./character";
import type { ArtLibrary } from "./library";
import { specLookFor, type SceneGroups } from "./sceneArt";

/** What a look's group is fetched through: the scene's `onDemandArt`. */
export interface SpecLookFetch {
  fetch(group: string, landed: () => void): void;
}

/** A player body as its scene draws it: what {@link SpecLooks} re-dresses. */
export interface LookBodies {
  /** The body's animator and the sprite it plays on, if it is drawn. */
  body(id: string): { anim: CharacterAnimator; sprite: AnimatedSprite } | undefined;
  /**
   * The body has been re-dressed in `anim`, already on its sprite: the scene plays it from now
   * on, in place of the one it held, and sizes what follows the sheet.
   */
  wear(id: string, anim: CharacterAnimator): void;
}

/** A player view whose body is the sprite named `body` in its container (the town's, the fields'). */
export interface ContainedBody {
  sprite: { getByName(name: string): unknown };
  anim: CharacterAnimator;
}

/** The {@link LookBodies} of a scene's views by entity id, each body named `body` in its container. */
export function containedBodies(views: ReadonlyMap<string, ContainedBody>): LookBodies {
  return {
    body(id) {
      const view = views.get(id);
      const sprite = view?.sprite.getByName("body") as AnimatedSprite | null | undefined;
      return view && sprite ? { anim: view.anim, sprite } : undefined;
    },
    wear(id, anim) {
      const view = views.get(id);
      if (view) view.anim = anim;
    },
  };
}

/** What a body wears: its state entry's class and specialization (`current_player`, `other_players[]`). */
export interface Wearer {
  class: string;
  specialization?: string;
}

export class SpecLooks {
  private readonly wearers = new Map<string, Wearer>();
  private readonly preloaded: ReadonlySet<string>;

  /**
   * `preloaded`: the scene's own set, as given to `preloadArt`. A look's group in it came with the
   * scene's preload (R20), and is never fetched again here, landed or failed.
   */
  constructor(
    private readonly art: ArtLibrary,
    private readonly fetcher: SpecLookFetch,
    private readonly bodies: LookBodies,
    preloaded: SceneGroups = [],
  ) {
    this.preloaded = new Set(preloaded);
  }

  /** What a body of `who` draws now: its spec look's sheet once it is in, else its class's base (R16, R21). */
  look(who: Wearer): CharacterLook {
    return { sheet: characterSheet(who.class, who.specialization, (sheet) => this.art.has(sheet)) };
  }

  /**
   * Body `id`'s entry in this snapshot. Its look's group is fetched if the manifest has the look
   * and it is not in (R19; the fetch itself is once a scene), and the body is re-dressed if what it
   * draws has changed: a pick applied mid-scene whose look is already in (R22).
   */
  see(id: string, who: Wearer): void {
    this.wearers.set(id, { class: who.class, specialization: who.specialization });
    const row = specLookFor(who.class, who.specialization);
    if (row && !this.preloaded.has(row.group) && this.art.lists(row.sheet) && !this.art.has(row.sheet))
      this.fetcher.fetch(row.group, () => this.landed(row.group));
    this.redress(id);
  }

  /** Body `id` is gone from the world: a look landing later leaves it be. */
  forget(id: string): void {
    this.wearers.delete(id);
  }

  /** A look's group is in: every body wearing it changes, whichever body asked (R21). */
  private landed(group: string): void {
    for (const [id, who] of this.wearers)
      if (specLookFor(who.class, who.specialization)?.group === group) this.redress(id);
  }

  /**
   * On its own sprite, between one frame and the next: a new animator for the sheet the body
   * should draw, carrying the old one's facing and clip. A body still on its placeholder texture
   * (its base sheet missing) is left to the scene's placeholder drawing.
   */
  private redress(id: string): void {
    const who = this.wearers.get(id);
    const body = this.bodies.body(id);
    if (!who || !body?.anim.baked) return;
    const look = this.look(who);
    if (body.anim.sheet === look.sheet) return;
    const anim = body.anim.wearing(look);
    if (!anim.baked) return;
    anim.redress(body.sprite);
    this.bodies.wear(id, anim);
  }
}

/** The selected character, as far as its own look goes: `gameStore`'s active character (FS-E1ZDG §B.6). */
export interface OwnCharacter {
  className: string;
  specialization?: string;
}

/**
 * A world scene's preload set with its own player's look (R20, ADR-0088 Decision 3): the look's
 * group of the selected character's specialization, when its read carries one, queued with the
 * scene's groups so the player's own body is never a stand-in after the boot bar. Decided per
 * character, at preload; a look the manifest lacks has no pages and queues nothing.
 */
export function withOwnLook(groups: SceneGroups, own: OwnCharacter | null | undefined): SceneGroups {
  const row = own && specLookFor(own.className, own.specialization);
  return row ? [...groups, row.group] : groups;
}
