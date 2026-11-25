/**
 * A Phaser scene as the encounter NPCs' stage (FS-4EC7Z §G R29, R30): each body a sprite dressed in
 * its look through `CharacterAnimator`, sorted as bodies are, playing its clip (a pilgrim's `cower`
 * and a caged captive's `bound` included, which no class sheet carries) under its look's variant;
 * its plate over its head at the marker depths: the name in its ink, and an ally's health bar under
 * it, FS-CH21F's teammate bar. Its over-head lines stand over the plate ({@link EncounterBodies.head}).
 * The plate goes with its body.
 */

import type * as Phaser from "phaser";
import { CharacterAnimator } from "@/render/art/character";
import type { ArtLibrary } from "@/render/art/library";
import { PLACEHOLDER_TEXTURE } from "@/render/art/library";
import { directionIndex } from "@/render/art/manifest";
import type { Facing8 } from "@/render/iso/facing";
import { standAt } from "@/render/iso/draw";
import type { Point } from "@/render/iso/projection";
import { MARKER_BAR, MARKER_DEPTH, markerBase } from "@/render/markers";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { EncounterClip, EncounterLook, EncounterPlate, EncounterStage } from "./encounters";
import type { LineStage } from "./overheadLines";

type Sprite = Phaser.GameObjects.Sprite;
type Text = Phaser.GameObjects.Text;

/** An ally's overhead bar: FS-CH21F's teammate bar, `gap` px over the marker base. */
export const ALLY_BAR = { width: 38, height: 4, gap: 2 } as const;
/** Screen px from the marker base (or the bar's top) to the name's foot. */
const NAME_GAP = 5;
/** Screen px from the name's top to an over-head line's foot. */
const LINE_GAP = 3;

interface Parts {
  anim: CharacterAnimator;
  look: EncounterLook;
  name: Text;
  bar: Phaser.GameObjects.Graphics;
  plate: EncounterPlate | null;
  clip?: { clip: EncounterClip; facing: Facing8 };
}

const plateStyle = (ink: number) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: "11px",
  color: toCss(ink),
  stroke: toCss(palette.markerStroke),
  strokeThickness: 3,
  align: "center",
});

export class EncounterBodies implements EncounterStage<Sprite>, LineStage<Text> {
  private readonly parts = new Map<Sprite, Parts>();

  constructor(
    private readonly scene: Phaser.Scene,
    /** Read at each use: the scene's art stands only once it has created. */
    private readonly art: () => ArtLibrary,
  ) {}

  add(look: EncounterLook, at: Point): Sprite {
    const body = this.scene.add.sprite(0, 0, PLACEHOLDER_TEXTURE);
    const name = this.scene.add.text(0, 0, "", plateStyle(palette.markerEncounter)).setOrigin(0.5, 1).setDepth(MARKER_DEPTH.name).setVisible(false);
    const bar = this.scene.add.graphics().setDepth(MARKER_DEPTH.bar);
    this.parts.set(body, { anim: new CharacterAnimator(this.art(), look), look, name, bar, plate: null });
    this.wear(body, look);
    this.stand(body, at);
    body.once("destroy", () => {
      name.destroy();
      bar.destroy();
      this.parts.delete(body);
    });
    return body;
  }

  wear(body: Sprite, look: EncounterLook): void {
    const parts = this.parts.get(body);
    if (!parts) return;
    parts.look = look;
    parts.anim = new CharacterAnimator(this.art(), { sheet: look.sheet, variant: look.variant });
    parts.anim.dress(body);
    if (look.tint === undefined) body.clearTint();
    else body.setTint(look.tint);
    const clip = parts.clip;
    parts.clip = undefined;
    if (clip) this.play(body, clip.clip, clip.facing);
  }

  stand(body: Sprite, at: Point): void {
    standAt(body, at, 1);
    this.mark(body);
  }

  play(body: Sprite, clip: EncounterClip, facing: Facing8): void {
    const parts = this.parts.get(body);
    if (!parts) return;
    parts.clip = { clip, facing };
    const name = parts.look.variant ? `${clip}_${parts.look.variant}` : clip;
    const key = this.art().animationKey(parts.look.sheet, name, directionIndex(facing));
    if (key && body.anims?.currentAnim?.key !== key) body.play(key);
  }

  plate(body: Sprite, plate: EncounterPlate | null): void {
    const parts = this.parts.get(body);
    if (!parts) return;
    parts.plate = plate;
    if (plate) parts.name.setText(plate.name).setColor(toCss(plate.ink));
    // the bar drawn once at its own origin, moved with the body (as a monster's is)
    const { bar } = parts;
    bar.clear();
    if (plate?.bar !== null && plate?.bar !== undefined) {
      const { width, height } = ALLY_BAR;
      bar.fillStyle(MARKER_BAR.backing, 0.9);
      bar.fillRect(-1, -1, width + 2, height + 2);
      bar.lineStyle(1, MARKER_BAR.rim, 0.9);
      bar.strokeRect(-1, -1, width + 2, height + 2);
      bar.fillStyle(MARKER_BAR.hp, 1);
      bar.fillRect(0, 0, Math.round(width * plate.bar), height);
    }
    this.mark(body);
  }

  /** Where an NPC's over-head line stands, its foot: over its plate, or its head with none. */
  head(body: Sprite): Point {
    const parts = this.parts.get(body);
    const base = this.base(body, parts);
    if (!parts?.plate) return { x: body.x, y: base - LINE_GAP };
    return { x: body.x, y: nameFoot(base, parts.plate) - (parts.name.height || 12) - LINE_GAP };
  }

  /** The plate shown with its body, hidden with it (the hide rule and the fog, never left to the blackout). */
  show(body: Sprite): void {
    const parts = this.parts.get(body);
    if (!parts) return;
    const shown = body.visible && parts.plate !== null;
    parts.name.setVisible(shown);
    parts.bar.setVisible(shown && parts.plate?.bar !== null);
  }

  say(text: string): Text {
    return this.scene.add
      .text(0, 0, text, { ...plateStyle(palette.markerEncounter), fontSize: "12px", fontStyle: "italic" })
      .setOrigin(0.5, 1)
      .setDepth(MARKER_DEPTH.name)
      .setVisible(false);
  }

  place(line: Text, at: Point, shown: boolean): void {
    line.setPosition(at.x, at.y).setVisible(shown);
  }

  /** Forget every body without touching it: the scene has destroyed its objects. */
  forget(): void {
    this.parts.clear();
  }

  /** The marker base over a body's head, a corpse's included, so a line said as it falls stays over it. */
  private base(body: Sprite, parts: Parts | undefined): number {
    return markerBase(body, parts?.anim.crown, false, parts?.anim.artScale ?? 1) ?? body.y;
  }

  /** Its name, and an ally's bar under it, over its head where it now stands. */
  private mark(body: Sprite): void {
    const parts = this.parts.get(body);
    if (!parts) return;
    const { name, bar, plate } = parts;
    if (plate) {
      const base = this.base(body, parts);
      name.setPosition(body.x, nameFoot(base, plate));
      bar.setPosition(Math.round(body.x - ALLY_BAR.width / 2), barTop(base));
    }
    this.show(body);
  }
}

/** An ally bar's top over marker base `base`. */
const barTop = (base: number) => Math.round(base - ALLY_BAR.gap - ALLY_BAR.height);

/** The plate's name's foot over marker base `base`: over an ally's bar, or at the head. */
const nameFoot = (base: number, plate: EncounterPlate) => (plate.bar !== null ? barTop(base) - 3 : base - NAME_GAP);
