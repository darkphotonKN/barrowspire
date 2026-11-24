/**
 * The effect cards (FS-1819Q R10): one per effect module in `src/render/effects/`, each a name
 * and a demo that plays it on the gallery's figure, called as the game calls it (R13). An effect
 * that can't be played outside a run gets `demo: null` and a one-line reason, and still shows.
 *
 * Adding an effect module? Add its card here, in the same change (R2). `effects.test.ts` fails
 * until you do.
 */

import type Phaser from "phaser";
import { itemView } from "@/items/itemView";
import type { ArtLibrary } from "@/render/art/library";
import { artSprite } from "@/render/art/phaser";
import type { CharacterLook } from "@/render/art/character";
import { monsterLook } from "@/render/creatures/monsters";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { AimCircle } from "@/render/effects/aimCircle";
import { AimLine } from "@/render/effects/aimLine";
import { ARROW_RAIN, ArrowRain } from "@/render/effects/arrowRain";
import { playBlinkIn, playBlinkOut } from "@/render/effects/blink";
import { playEarthbreaker } from "@/render/effects/earthbreaker";
import { playSettleTheDebt } from "@/render/effects/settleTheDebt";
import { Staged } from "@/render/effects/staged";
import { Auras } from "@/render/effects/aura";
import { playArrowRelease } from "@/render/effects/arrow";
import { CHARGE_MS, playCharge } from "@/render/effects/charge";
import { CutFx } from "@/render/effects/cut";
import { playDemonClaw } from "@/render/effects/demonClaw";
import { playDeathDust } from "@/render/effects/death";
import { EntranceMarker } from "@/render/effects/entrance";
import { playEscape } from "@/render/effects/escape";
import { playFireballCast } from "@/render/effects/fireball";
import { HitFeedback } from "@/render/effects/hit";
import { LoreDust } from "@/render/effects/loreDust";
import { addMist, prefersReducedMotion } from "@/render/effects/mist";
import { AbilityTelegraphs, IMPACT_MS } from "@/render/effects/monsterAbility";
import { PageReticle } from "@/render/effects/pageReticle";
import { ParryFx } from "@/render/effects/parry";
import { RiposteFx } from "@/render/effects/riposte";
import type {
  EffectLights,
  EffectsRuntime,
  OwnerKey,
} from "@/render/effects/runtime";
import { playHeavyShotRelease } from "@/render/effects/heavyShot";
import { playShadowShotRelease } from "@/render/effects/shadowShot";
import { HEAL_LOOK, ShimmerFx } from "@/render/effects/shimmer";
import { playSlash } from "@/render/effects/slash";
import { ChimneySmoke } from "@/render/effects/smoke";
import { StunTells } from "@/render/effects/stun";
import { FOREST_LOOK } from "@/render/world/fieldLook";
import type { ItemState, MonsterAbilityKind } from "@/types/gameState";
import { ArrivalCard, cardLeaves, type CardLeave } from "@/ui/arrivalCard";
import { CONTAINER_VIEW_DEPTH, satchelIcon } from "@/ui/ContainerView";
import { itemShine } from "@/ui/itemShine";
import { LoreLines, type LoreLine } from "@/ui/loreLine";
import { placeCard } from "@/ui/placeCard";

/** What a demo plays on: the gallery's one figure, on its floor, under the run's light. */
export interface Stage {
  scene: Phaser.Scene;
  fx: EffectsRuntime;
  /** This play's own owner key, so a demo ending late never releases a newer one. */
  owner: OwnerKey;
  /** The figure's feet, in world px. */
  at: Point;
  /** Where the figure aims, in world px: a little way ahead of it. */
  aim: Point;
  figure: Phaser.GameObjects.Sprite;
  /** The figure's head height (its sheet's `crown`), for an effect drawn over its body. */
  crown: number | undefined;
  /** The art and the light-map the runtime plays over, for an effect that draws its own. */
  art: ArtLibrary;
  lights: EffectLights;
  /** The scene clock, as the game's `now`. */
  now(): number;
  /** Runs `fn` after `ms`, for a demo that has to end what it started. */
  later(ms: number, fn: () => void): void;
  /**
   * Flies a projectile of a server `projectile_type` from the figure to `aim`, landing there; the
   * figure stands as `shooter` for it, for a shot drawn by who loosed it (FS-1J1CB §F R41).
   */
  fly(projectileType: string, shooter?: Shooter): void;
  /**
   * Re-dresses the figure in a class's base sheet, or a creature's look, for a card shown on another
   * body than the mage's (an aura on the archer, FS-1J1CB R38; the stun tell on a monster, FS-04EEA
   * R49). Returns its sheet's `crown`.
   */
  wear(who: string | CharacterLook): number | undefined;
  /** Moves the figure to stand at world point `at`, for a card whose body is placed elsewhere (a Blink). */
  standAt(at: Point): void;
}

/** Who the figure stands as when it looses a projectile: a class and its specialization. */
export interface Shooter {
  class: string;
  specialization?: string;
}

export type EffectCard = { module: string; name: string } & (
  | { demo: (s: Stage) => void }
  | { demo: null; reason: string }
);

/** How long a held or looping effect stays up before its demo ends it. */
const HOLD_MS = 2400;

/** Screen px from the figure's feet to where its smoke rises: over its head, as from a chimney pot. */
const CHIMNEY_LIFT = 80;

/** The Fabled item the glitter card draws, at a bag icon's side, up and to the figure's right. */
const FABLED_SAMPLE: ItemState = {
  item_id: "gallery-fabled",
  entity_id: "gallery-fabled",
  quantity: 1,
  name: "Lichbane, the Last Oath",
  rarity: "fabled",
  item_type: "weapon",
  weapon_type: "sword",
};
const FABLED_ICON_SIDE = 64;
const FABLED_ICON_OFFSET = { x: 90, y: -60 };

/** Screen px over the feet the stun tell stands at on a figure whose sheet records no crown. */
const STUN_LIFT_FALLBACK = 80;

/** A frame's step, in ms, for a demo that drives its own frames. */
const FRAME_MS = 33;

/**
 * The creature the stun tell is shown over, as a run draws it over a stunned monster (FS-04EEA R49): the
 * ghoul's own look, named by the roster's table.
 */
const STUNNED_LOOK: CharacterLook = { sheet: monsterLook("ghoul").sheet };

/** Between the Blink's out and its in, as a jump lands a tick or two after the send. */
const BLINK_LANDS_MS = 120;

/** How long the Arrow Rain card holds its circle: past the last volley's landing. */
const RAIN_HOLD_MS = ARROW_RAIN.volleys * ARROW_RAIN.intervalMs + 400;

/**
 * The flurry for `charges` parry charges spent, on the mercenary as a world plays it on his send (FS-04EEA
 * R46, R49); the mage again once it is done.
 */
function playFlurry(s: Stage, charges: number): void {
  s.wear("mercenary");
  playSettleTheDebt(s.fx, new Staged(s.scene.time), s.owner, s.at, charges);
  s.later(HOLD_MS / 2, () => s.wear("mage"));
}

/**
 * An ability's telegraph as a run draws it (FS-C8VM7 §F R36): its area at the figure's feet, the
 * server's numbers for `windUpS`, filling as it winds; then the field goes and it lands in its
 * impact. The demo drives the frames the roster would.
 */
function playTelegraph(
  s: Stage,
  ability: { kind: MonsterAbilityKind; radius: number; arc?: number; windUpS: number },
): void {
  const telegraphs = new AbilityTelegraphs(() => s.scene.add.graphics());
  const facing = { x: s.aim.x - s.at.x, y: s.aim.y - s.at.y };
  const { kind, radius, arc = 0, windUpS } = ability;
  const listed = (remaining?: number) => [
    {
      entity_id: s.owner,
      facing,
      ...(remaining === undefined
        ? {}
        : { ability: { kind, x: s.at.x, y: s.at.y, radius, arc, remaining } }),
    },
  ];
  telegraphs.sync(listed(windUpS));
  const windMs = windUpS * 1000;
  for (let t = FRAME_MS; t <= windMs + IMPACT_MS + FRAME_MS; t += FRAME_MS)
    s.later(t, () => telegraphs.update(FRAME_MS));
  s.later(windMs, () => telegraphs.sync(listed()));
  s.later(windMs + IMPACT_MS + 2 * FRAME_MS, () => telegraphs.clear());
}

/** How long an aura card holds: an aura has no end of its own, so the demo ends it (FS-1J1CB R31). */
const AURA_HOLD_MS = 4800;

/**
 * An aura as a world draws it (FS-1J1CB §E, R38): on the figure dressed as `who`'s class, seen
 * with `who`'s specialization, followed each frame at its feet on the scene clock, under the
 * player's own reduced-motion setting; then gone, and the mage back. `also` plays over it.
 */
function playAura(s: Stage, who: Shooter, also?: (s: Stage) => void): void {
  const crown = s.wear(who.class);
  const auras = new Auras(s.scene, s.art, { reducedMotion: prefersReducedMotion() });
  auras.see(s.owner, who);
  for (let t = 0; t <= AURA_HOLD_MS; t += FRAME_MS)
    s.later(t, () => auras.follow(s.owner, s.at, crown, s.now()));
  if (also) s.later(AURA_HOLD_MS / 4, () => also(s));
  s.later(AURA_HOLD_MS + FRAME_MS, () => {
    auras.clear();
    s.wear("mage");
  });
}

/**
 * The gallery's one arrival card, so a replay replaces the card still up as the game's next
 * arrival would (FS-PQ2TW R9), whichever leave either plays (§Change: Smoke R52). Drawn over the
 * gallery's own canvas, not the game's view.
 */
const arrivalCards = new WeakMap<Phaser.Scene, ArrivalCard>();

function arrivalCardOn(s: Stage): ArrivalCard {
  let card = arrivalCards.get(s.scene);
  if (!card) {
    const { width, height } = s.scene.scale;
    const view = { width, height, centerX: width / 2, centerY: height / 2 };
    card = new ArrivalCard(s.scene, cardLeaves(s.scene, () => s.art), view);
    arrivalCards.set(s.scene, card);
  }
  return card;
}

/**
 * The climb's whole card, as the game plays it: the dark, the card, its hold, then `leave` off its
 * letters (FS-PQ2TW §D, R40; §Change: Smoke R52; §Change: Ash R62). Under reduced motion it
 * fades, as in the game.
 */
function playArrivalCard(s: Stage, leave: CardLeave): void {
  arrivalCardOn(s).play(placeCard({ world: "run", floor: 2, top: false }), { built: true }, leave);
}

/**
 * The gallery's one lore line piece, so a replay queues behind the line still up as the game's
 * next line would (FS-XWHZP §C, R26). Drawn over the gallery's own canvas, not the game's view.
 */
const loreLines = new WeakMap<Phaser.Scene, LoreLines>();

function sayLore(s: Stage, line: LoreLine): void {
  let lines = loreLines.get(s.scene);
  if (!lines) {
    const { width, height } = s.scene.scale;
    const view = { width, height, centerX: width / 2, centerY: height / 2 };
    lines = new LoreLines(s.scene, new LoreDust(s.scene, () => s.art), { view });
    loreLines.set(s.scene, lines);
  }
  lines.say(line);
}

export const EFFECT_CARDS: EffectCard[] = [
  {
    module: "aimCircle",
    name: "Arrow Rain aim circle",
    demo: (s) => {
      // held at the point the figure aims, as key 3's hold draws it (FS-04EEA R38)
      const circle = new AimCircle(() => s.scene.add.graphics());
      circle.draw(s.aim);
      s.later(HOLD_MS / 2, () => circle.clear());
    },
  },
  {
    module: "pageReticle",
    name: "Armed page reticle: Witchlight's ring, then faint, then the hound's paw",
    demo: (s) => {
      // at the point the figure aims, as an armed page draws it each frame (FS-X2CMM R41): plain on a valid
      // target, faint where a click would do nothing, and Call the Hound's paw mark
      const reticle = new PageReticle(() => s.scene.add.graphics());
      const ring = { page: "witchlight", kind: "ground", at: s.aim, radius: 3 * 80, valid: true } as const;
      reticle.draw(ring);
      s.later(HOLD_MS / 3, () => reticle.draw({ ...ring, valid: false }));
      s.later((HOLD_MS * 2) / 3, () => reticle.draw({ ...ring, page: "call_the_hound", radius: 40 }));
      s.later(HOLD_MS, () => reticle.clear());
    },
  },
  {
    module: "arrowRain",
    name: "Arrow Rain volleys, mid-rain in the circle",
    // on the archer's release at the circle the aim drew, held here as the rain falls into it (FS-04EEA R45, R49)
    demo: (s) => {
      s.wear("archer");
      const circle = new AimCircle(() => s.scene.add.graphics());
      circle.draw(s.aim);
      new ArrowRain(s.scene, s.art, s.fx).start(s.at, s.aim);
      s.later(RAIN_HOLD_MS, () => {
        circle.clear();
        s.wear("mage");
      });
    },
  },
  {
    module: "blink",
    name: "Blink out and in",
    // out where the mage stands at the send, in where the jump places the body (FS-04EEA R44)
    demo: (s) => {
      playBlinkOut(s.fx, s.owner, s.at);
      s.later(BLINK_LANDS_MS, () => {
        s.standAt(s.aim);
        playBlinkIn(s.fx, s.owner, s.aim);
      });
      s.later(HOLD_MS, () => s.standAt(s.at));
    },
  },
  {
    module: "earthbreaker",
    name: "Earthbreaker slam",
    // round the warrior's feet on the send (FS-04EEA R43)
    demo: (s) => {
      s.wear("warrior");
      playEarthbreaker(s.fx, new Staged(s.scene.time), s.owner, s.at);
      s.later(HOLD_MS / 2, () => s.wear("mage"));
    },
  },
  // FS-04EEA R46, R49: the flurry at 1, 3 and 5 parry charges, each to read distinctly
  {
    module: "settleTheDebt",
    name: "Settle the Debt (1 charge)",
    demo: (s) => playFlurry(s, 1),
  },
  {
    module: "settleTheDebt",
    name: "Settle the Debt (3 charges)",
    demo: (s) => playFlurry(s, 3),
  },
  {
    module: "settleTheDebt",
    name: "Settle the Debt (5 charges)",
    demo: (s) => playFlurry(s, 5),
  },
  {
    module: "aimLine",
    name: "Shadow Shot aim line",
    demo: (s) => {
      const line = new AimLine(() => s.scene.add.graphics());
      line.draw(s.at, s.aim, true, true);
      s.later(HOLD_MS / 2, () => line.clear());
    },
  },
  {
    module: "aimLine",
    name: "Heavy Shot aim line",
    demo: (s) => {
      // every archer's but a Shadow Ranger's (FS-1J1CB §F R42)
      const line = new AimLine(() => s.scene.add.graphics());
      line.draw(s.at, s.aim, true, false);
      s.later(HOLD_MS / 2, () => line.clear());
    },
  },
  {
    module: "arrow",
    name: "Arrow",
    demo: (s) => {
      playArrowRelease(s.fx, s.owner, s.at, s.aim);
      s.fly("arrow");
    },
  },
  {
    module: "aura",
    name: "Ward (Spellwarden aura, on the mage)",
    demo: (s) => playAura(s, { class: "mage", specialization: "spellwarden" }),
  },
  {
    module: "aura",
    name: "Gloom (Shadow Ranger aura, on the archer)",
    demo: (s) => playAura(s, { class: "archer", specialization: "shadow_ranger" }),
  },
  {
    module: "aura",
    name: "Ward under a heal shimmer",
    demo: (s) =>
      // a potion drunk by a Spellwarden: the heal plays in full over the ward (FS-1J1CB R37)
      playAura(s, { class: "mage", specialization: "spellwarden" }, (st) => {
        const shimmers = new ShimmerFx(st.scene, st.art, st.lights);
        shimmers.follow(st.at);
        shimmers.playGranted(HEAL_LOOK, st.crown);
      }),
  },
  {
    module: "boneArrow",
    name: "Bone arrow (hostile)",
    // a Bone Archer's shot as a run flies it: the flight only, it has no release (FS-B4SG9 §D R22)
    demo: (s) => s.fly("bone_arrow"),
  },
  {
    module: "cardAsh",
    name: "Arrival card ash",
    // the game's leave, beside its alternates the dust and the smoke (§Change: Ash R62)
    demo: (s) => playArrivalCard(s, "ash"),
  },
  {
    module: "cardDust",
    name: "Arrival card dust",
    demo: (s) => playArrivalCard(s, "dust"),
  },
  {
    module: "cardSmoke",
    name: "Arrival card smoke",
    // an alternate, beside the ash and the dust (§Change: Smoke R52)
    demo: (s) => playArrivalCard(s, "smoke"),
  },
  {
    module: "charge",
    name: "Warrior charge dust",
    demo: (s) => {
      const charge = playCharge(s.fx, s.owner, s.at, s.aim);
      s.later(CHARGE_MS, () => charge.end());
    },
  },
  {
    module: "cut",
    name: "Mercenary cut",
    demo: (s) => new CutFx(s.scene).play(s.at, s.aim),
  },
  {
    module: "demonClaw",
    name: "Demon fire claw",
    // as the monster roster plays it: from the feet, swiping along the facing (FS-VHGE7 §D R32)
    demo: (s) =>
      playDemonClaw(s.fx, s.owner, s.at, {
        x: s.aim.x - s.at.x,
        y: s.aim.y - s.at.y,
      }),
  },
  {
    module: "death",
    name: "Death dust",
    demo: (s) => playDeathDust(s.fx, s.owner, s.at),
  },
  {
    module: "entrance",
    name: "Entrance glow",
    demo: (s) => {
      const marker = new EntranceMarker(s.fx, s.owner, s.at);
      s.later(HOLD_MS, () => marker.setVisible(false));
    },
  },
  {
    module: "escape",
    name: "Escape column",
    demo: (s) => playEscape(s.fx, s.owner, s.at),
  },
  {
    module: "fireball",
    name: "Fireball",
    demo: (s) => {
      playFireballCast(s.fx, s.owner, s.at, s.aim);
      s.fly("fireball");
    },
  },
  {
    module: "glitter",
    name: "Fabled item glitter",
    // the game's own treatment on a real icon; destroying the icon ends it (FS-QE2QW R24, R33)
    demo: (s) => {
      const feet = worldToScreen(s.at.x, s.at.y);
      const x = feet.x + FABLED_ICON_OFFSET.x;
      const y = feet.y + FABLED_ICON_OFFSET.y;
      const side = FABLED_ICON_SIDE;
      const shine = itemShine(s.scene, s.art, itemView(FABLED_SAMPLE), {
        x,
        y,
        side,
      });
      shine?.glow.setDepth(CONTAINER_VIEW_DEPTH);
      const icon = artSprite(s.scene, s.art, x, y, satchelIcon(FABLED_SAMPLE))
        .setOrigin(0.5)
        .setDepth(CONTAINER_VIEW_DEPTH);
      icon.setScale(side / Math.max(icon.frame.width, icon.frame.height));
      shine?.bind(icon)?.setDepth(CONTAINER_VIEW_DEPTH);
      s.later(HOLD_MS, () => icon.destroy());
    },
  },
  {
    module: "hit",
    name: "Hit tint",
    demo: (s) => new HitFeedback(s.scene).play(s.figure),
  },
  // FS-XWHZP R26: a lore line in each tone, through the game's own piece
  {
    module: "loreDust",
    name: "Lore line (lore)",
    demo: (s) => sayLore(s, { text: "The stair waits for the whole party.", tone: "lore" }),
  },
  {
    module: "loreDust",
    name: "Lore line (dread)",
    demo: (s) => sayLore(s, { text: "You hear a sound from hell", tone: "dread" }),
  },
  {
    module: "loreDust",
    name: "Lore line (hope)",
    demo: (s) => sayLore(s, { text: "The seal breaks. Somewhere, a door gives.", tone: "hope" }),
  },
  {
    module: "mist",
    name: "Forest mist",
    demo: (s) => {
      const layer = addMist(s.scene, FOREST_LOOK.mist, 1);
      s.later(HOLD_MS, () => layer.destroy());
    },
  },
  // FS-C8VM7 §F R36, R39: each ability's telegraph and its impact, at the server's starting numbers
  {
    module: "monsterAbility",
    name: "Pounce telegraph and impact (hostile)",
    demo: (s) => playTelegraph(s, { kind: "pounce", radius: 60, windUpS: 0.8 }),
  },
  {
    module: "monsterAbility",
    name: "Ground slam telegraph and impact (hostile)",
    demo: (s) => playTelegraph(s, { kind: "ground_slam", radius: 130, windUpS: 0.9 }),
  },
  {
    module: "monsterAbility",
    name: "Death burst telegraph and impact (hostile)",
    demo: (s) => playTelegraph(s, { kind: "burst", radius: 110, windUpS: 0.8 }),
  },
  {
    module: "monsterAbility",
    name: "Wail telegraph and impact (hostile)",
    demo: (s) => playTelegraph(s, { kind: "wail", radius: 180, windUpS: 0.7 }),
  },
  {
    module: "monsterAbility",
    name: "Cleave cone and impact (hostile)",
    demo: (s) => playTelegraph(s, { kind: "cleave", radius: 110, arc: 120, windUpS: 0.8 }),
  },
  {
    module: "ogreRock",
    name: "Ogre rock (hostile)",
    // the flight only: the throw is the ogre's attack clip (FS-C8VM7 §F R38)
    demo: (s) => s.fly("ogre_rock"),
  },
  {
    module: "parry",
    name: "Parry stance and flash",
    demo: (s) => {
      const parry = new ParryFx(s.scene);
      parry.follow(s.at, s.now());
      parry.sync({ parry_open: true, parries: 0 }, s.now());
      parry.sync({ parry_open: true, parries: 1 }, s.now());
      s.later(HOLD_MS / 2, () => parry.forget());
    },
  },
  {
    module: "riposte",
    name: "Riposte slice",
    demo: (s) => new RiposteFx(s.scene).play(s.at, s.aim),
  },
  {
    module: "shadowShot",
    name: "Shadow Shot",
    demo: (s) => {
      // a Shadow Ranger's alone (FS-1J1CB §F R39)
      playShadowShotRelease(s.fx, s.owner, s.at, s.aim);
      s.fly("shadow_shot", { class: "archer", specialization: "shadow_ranger" });
    },
  },
  {
    module: "heavyShot",
    name: "Heavy Shot",
    demo: (s) => {
      // every archer's right-click but a Shadow Ranger's, a Hunter's here: beside the Shadow
      // Shot's card, so the two are judged side by side (FS-1J1CB §F R40, R44)
      playHeavyShotRelease(s.fx, s.owner, s.at, s.aim);
      s.fly("shadow_shot", { class: "archer", specialization: "hunter" });
    },
  },
  {
    module: "shimmer",
    name: "Heal shimmer (granted base)",
    demo: (s) => {
      // as a drink plays it: one per figure, following its feet; it ends itself (FS-KZC92 §B)
      const shimmers = new ShimmerFx(s.scene, s.art, s.lights);
      shimmers.follow(s.at);
      shimmers.playGranted(HEAL_LOOK, s.crown);
    },
  },
  {
    module: "shimmer",
    name: "Invoked shimmer base (heal look as a stand-in)",
    demo: (s) => {
      // nothing in the game plays it yet and it has no look of its own, so the heal look stands
      // in (FS-KZC92 R19, R39); it ends itself
      const shimmers = new ShimmerFx(s.scene, s.art, s.lights);
      shimmers.follow(s.at);
      shimmers.playInvoked(HEAL_LOOK, s.crown);
    },
  },
  {
    module: "slash",
    name: "Warrior slash",
    demo: (s) => playSlash(s.fx, s.owner, s.at, s.aim),
  },
  {
    module: "smoke",
    name: "Chimney smoke",
    demo: (s) => {
      const smoke = new ChimneySmoke(s.fx, s.owner, s.at, CHIMNEY_LIFT);
      s.later(HOLD_MS, () => smoke.setVisible(false));
    },
  },
  {
    module: "stun",
    name: "Stun tell (on a ghoul)",
    // over a stunned monster's head, on a monster's body standing at its idle, as a world draws it (FS-04EEA
    // §H R47, R49)
    demo: (s) => {
      const crown = s.wear(STUNNED_LOOK);
      const tells = new StunTells(s.fx);
      tells.show([{ id: s.owner, at: s.at, lift: crown ?? STUN_LIFT_FALLBACK }]);
      s.later(HOLD_MS, () => {
        tells.clear();
        s.wear("mage");
      });
    },
  },
  {
    module: "thrownDagger",
    name: "Thrown dagger (hostile)",
    // the flight only: the throw is the goblin's attack clip (FS-C8VM7 §F R38)
    demo: (s) => s.fly("thrown_dagger"),
  },
];
