/**
 * The party frames (FS-R82NV R34, R35): on the left edge under the level/XP bar and as wide as it,
 * one frame per member while the player is in a party, the player's own first, then the others in
 * join order. Each frame is a medallion bust cut from the member's class sheet, their name (the
 * leader's crown first), and a bar slot: health and resource in the HUD's own bar style at half
 * height, always for the player (from their own state) and for a teammate when this world's state
 * carries their health, a short state word ("village", "afield", "delving", "away") when it does
 * not. A resource the state does not carry yet is an empty bar.
 *
 * It redraws from the party store on every `party_update` and from each state tick the scene
 * hands it (`show`); it asks the server for nothing. Neutral HUD on the game palette, at the HUD's
 * depth. The frames themselves rebuild only when the party's shape changes; a tick that moves a
 * bar redraws the bars alone.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import type { WorldType } from "@/assets/types/client";
import type { ArtLibrary } from "@/render/art/library";
import { HUD_DEPTH } from "@/render/markers/markers";
import { useAuthStore } from "@/stores/authStore";
import { useGameStore } from "@/stores/gameStore";
import { usePartyStore, type PartyState } from "@/stores/partyStore";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { maskedBust, type MaskedBust, type Portrait } from "./bustPortrait";
import { drawLeaderMark } from "./PartyPanel";
import {
  PARTY_FRAMES_PLACEMENT,
  PARTY_LEADER_MARK_W,
  partyBustFrame,
  partyFrameRows,
  partyFramesFrame,
  type PartyFrameRect,
  type PartyFrameRow,
  type SeenState,
} from "./partyFramesLayout";
import { HUD_BAR_FILL, drawHudBar, drawHudPips } from "./ResourceHud";

export interface PartyFramesDeps {
  store: StoreApi<PartyState>;
  selfId: () => string | undefined;
  /** The world this player stands in: where the frames stand, and whether bars may show. */
  world: () => WorldType | null;
  /** Where each class's standing frame is found. */
  art: Pick<ArtLibrary, "resolve">;
  /** Cuts and masks the medallion bust; the NPC card's crop unless a test stands in. */
  drawBust?: (
    scene: Phaser.Scene,
    portrait: Portrait,
    mx: number,
    my: number,
    r: number,
  ) => MaskedBust | undefined;
}

/** The frames as a scene hangs them: the app's party, this player, the scene's art. */
export function mountPartyFrames(
  scene: Phaser.Scene,
  art: ArtLibrary,
): PartyFrames {
  return new PartyFrames(scene, {
    store: usePartyStore,
    selfId: () => useAuthStore.getState().memberInfo?.id,
    world: () => useGameStore.getState().worldType,
    art,
  });
}

const NAME_PX = 13;
const WORD_PX = 12;

export class PartyFrames {
  private rows: PartyFrameRow[] = [];
  private seen: SeenState = {};
  /** What the frames, the state words and the bars were last drawn from. */
  private drawnShape?: string;
  private drawnWords?: string;
  private drawnSlots?: string;
  private rects: PartyFrameRect[] = [];
  private chrome?: Phaser.GameObjects.Graphics;
  private rings?: Phaser.GameObjects.Graphics;
  private bars?: Phaser.GameObjects.Graphics;
  private names: Phaser.GameObjects.Text[] = [];
  private words: Phaser.GameObjects.Text[] = [];
  private busts: MaskedBust[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PartyFramesDeps,
  ) {
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (state.party !== prev.party) this.refresh();
    });
    this.refresh();
  }

  /**
   * This state's players (R35): the player's own row fills from `current_player`, a teammate's
   * from `other_players` where it carries their health.
   */
  show(state: SeenState): void {
    this.seen = state;
    this.refresh();
  }

  rowCount(): number {
    return this.rows.length;
  }

  /** Which frame holds the leader (0 when the player leads), or -1 with no party: for tests. */
  leaderRow(): number {
    return this.rows.findIndex((r) => r.leader);
  }

  destroy(): void {
    this.unsubscribe();
    this.takeDown();
  }

  private refresh(): void {
    const world = this.deps.world();
    const { party } = this.deps.store.getState();
    this.rows = partyFrameRows(party, this.deps.selfId(), world, this.seen);

    const { x, top } = PARTY_FRAMES_PLACEMENT[world ?? "hub"];
    const shape = JSON.stringify([
      x,
      top,
      this.rows.map((r) => [r.player_id, r.name, r.class, r.leader]),
    ]);
    if (shape !== this.drawnShape) {
      this.drawnShape = shape;
      this.drawnWords = undefined;
      this.drawnSlots = undefined;
      this.takeDown();
      this.rects = partyFramesFrame(this.rows.length, x, top);
      this.drawFrames();
    }

    // a word is a text, a canvas texture apiece: made again only when the words change,
    // never because a bar moved on this tick
    const words = JSON.stringify(
      this.rows.map((r) => (r.slot.kind === "word" ? r.slot.word : null)),
    );
    if (words !== this.drawnWords) {
      this.drawnWords = words;
      this.drawWords();
    }
    const slots = JSON.stringify(this.rows.map((r) => r.slot));
    if (slots !== this.drawnSlots) {
      this.drawnSlots = slots;
      this.drawBars();
    }
  }

  private text(
    x: number,
    y: number,
    content: string,
    colour: number,
    px: number,
    italic = false,
  ): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, content, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${px}px`,
        fontStyle: italic ? "italic" : "normal",
        color: toCss(colour),
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  /** The panels, the medallions with their busts, the names and the leader's crown. */
  private drawFrames(): void {
    if (this.rows.length === 0) return;
    const hud = () =>
      this.scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    const chrome = (this.chrome = hud());
    const drawBust = this.deps.drawBust ?? maskedBust;

    this.rows.forEach((row, i) => {
      const { row: r, bust } = this.rects[i];
      chrome.fillStyle(palette.hudPanel, 0.85);
      chrome.fillRect(r.x, r.y, r.width, r.height);
      chrome.lineStyle(1, palette.frame, 0.35);
      chrome.strokeRect(r.x, r.y, r.width, r.height);
      chrome.fillStyle(palette.hudPanelDeep, 1);
      chrome.fillCircle(bust.x, bust.y, bust.r);

      const at = partyBustFrame(row.class);
      const frame = this.deps.art.resolve(at.sheet, at);
      if (frame.placeholder) return;
      const cut = drawBust(
        this.scene,
        { texture: frame.texture, frame: frame.frame },
        bust.x,
        bust.y,
        bust.r,
      );
      if (!cut) return;
      cut.image.setScrollFactor(0).setDepth(HUD_DEPTH);
      this.busts.push(cut);
    });

    // over the busts: the medallion rings and the leader's crown
    const rings = (this.rings = hud());
    this.rows.forEach((row, i) => {
      const { bust, name } = this.rects[i];
      rings.lineStyle(2, palette.frame, 0.9);
      rings.strokeCircle(bust.x, bust.y, bust.r);
      if (row.leader) drawLeaderMark(rings, name.x, name.y + 4);
      const nameX = name.x + (row.leader ? PARTY_LEADER_MARK_W : 0);
      this.names.push(
        this.text(nameX, name.y, row.name, palette.hudText, NAME_PX),
      );
    });
  }

  /** The state word in each frame whose slot holds one. */
  private drawWords(): void {
    this.words.forEach((w) => w.destroy());
    this.words = [];
    this.rows.forEach(({ slot }, i) => {
      if (slot.kind !== "word") return;
      const { word } = this.rects[i];
      this.words.push(
        this.text(word.x, word.y, slot.word, palette.hudLabel, WORD_PX, true),
      );
    });
  }

  /** The health and resource bars in each frame whose slot holds them; a missing resource is empty. */
  private drawBars(): void {
    if (this.rows.length === 0) {
      this.bars?.destroy();
      this.bars = undefined;
      return;
    }
    const g = (this.bars ??= this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH));
    g.clear();

    this.rows.forEach(({ slot }, i) => {
      if (slot.kind === "word") return;
      const { health, resource } = this.rects[i];
      drawHudBar(
        g,
        health.x,
        health.y,
        health.width,
        health.height,
        slot.health,
        palette.hudHealth,
      );
      const res = slot.resource;
      if (res?.pips)
        drawHudPips(
          g,
          resource.x,
          resource.y,
          resource.width,
          resource.height,
          res.pips,
        );
      else
        drawHudBar(
          g,
          resource.x,
          resource.y,
          resource.width,
          resource.height,
          res?.fill ?? 0,
          HUD_BAR_FILL[res?.channel ?? "unknown"],
        );
    });
  }

  private takeDown(): void {
    this.chrome?.destroy();
    this.chrome = undefined;
    this.rings?.destroy();
    this.rings = undefined;
    this.bars?.destroy();
    this.bars = undefined;
    this.busts.forEach(({ image, mask }) => {
      image.destroy();
      mask?.destroy();
    });
    this.busts = [];
    [...this.names, ...this.words].forEach((t) => t.destroy());
    this.names = [];
    this.words = [];
  }
}
