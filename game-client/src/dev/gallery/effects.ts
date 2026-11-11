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
import { worldToScreen, type Point } from "@/render/iso/projection";
import { AimLine } from "@/render/effects/aimLine";
import { CardDust } from "@/render/effects/cardDust";
import { playArrowRelease } from "@/render/effects/arrow";
import { CHARGE_MS, playCharge } from "@/render/effects/charge";
import { CutFx } from "@/render/effects/cut";
import { playDemonClaw } from "@/render/effects/demonClaw";
import { playDeathDust } from "@/render/effects/death";
import { EntranceMarker } from "@/render/effects/entrance";
import { playEscape } from "@/render/effects/escape";
import { playFireballCast } from "@/render/effects/fireball";
import { HitFeedback } from "@/render/effects/hit";
import { addMist } from "@/render/effects/mist";
import { ParryFx } from "@/render/effects/parry";
import { RiposteFx } from "@/render/effects/riposte";
import type {
  EffectLights,
  EffectsRuntime,
  OwnerKey,
} from "@/render/effects/runtime";
import { playShadowShotRelease } from "@/render/effects/shadowShot";
import { HEAL_LOOK, ShimmerFx } from "@/render/effects/shimmer";
import { playSlash } from "@/render/effects/slash";
import { ChimneySmoke } from "@/render/effects/smoke";
import { FOREST_LOOK } from "@/render/world/fieldLook";
import type { ItemState } from "@/types/gameState";
import { ArrivalCard } from "@/ui/arrivalCard";
import { CONTAINER_VIEW_DEPTH, satchelIcon } from "@/ui/ContainerView";
import { itemShine } from "@/ui/itemShine";
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
  /** Flies a projectile of a server `projectile_type` from the figure to `aim`, landing there. */
  fly(projectileType: string): void;
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

/**
 * The gallery's one arrival card, so a replay replaces the card still up as the game's next
 * arrival would (FS-PQ2TW R9). Drawn over the gallery's own canvas, not the game's view.
 */
const arrivalCards = new WeakMap<Phaser.Scene, ArrivalCard>();

function arrivalCardOn(s: Stage): ArrivalCard {
  let card = arrivalCards.get(s.scene);
  if (!card) {
    const { width, height } = s.scene.scale;
    const view = { width, height, centerX: width / 2, centerY: height / 2 };
    card = new ArrivalCard(s.scene, new CardDust(s.scene, () => s.art), view);
    arrivalCards.set(s.scene, card);
  }
  return card;
}

export const EFFECT_CARDS: EffectCard[] = [
  {
    module: "aimLine",
    name: "Shadow Shot aim line",
    demo: (s) => {
      const line = new AimLine(() => s.scene.add.graphics());
      line.draw(s.at, s.aim, true);
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
    module: "boneArrow",
    name: "Bone arrow (hostile)",
    // a Bone Archer's shot as a run flies it: the flight only, it has no release (FS-B4SG9 §D R22)
    demo: (s) => s.fly("bone_arrow"),
  },
  {
    module: "cardDust",
    name: "Arrival card dust",
    // the climb's whole card, as the game plays it: the dark, the card, its hold, then the dust
    // off its letters (FS-PQ2TW §D, R40). Under reduced motion it fades, as in the game.
    demo: (s) =>
      arrivalCardOn(s).play(placeCard({ world: "run", floor: 2, top: false }), {
        built: true,
      }),
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
  {
    module: "mist",
    name: "Forest mist",
    demo: (s) => {
      const layer = addMist(s.scene, FOREST_LOOK.mist, 1);
      s.later(HOLD_MS, () => layer.destroy());
    },
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
      playShadowShotRelease(s.fx, s.owner, s.at, s.aim);
      s.fly("shadow_shot");
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
];
