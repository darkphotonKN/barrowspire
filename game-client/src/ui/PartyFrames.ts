/**
 * The party frames (FS-R82NV R34, R35; FS-NCC9J R25–R27; FS-CH21F R8–R12): on the left edge under
 * the level/XP bar and as wide as it, one frame per member while the player is in a party, the
 * player's own first, then the others in join order, then one skeleton row per open invite. Each
 * member frame is a medallion bust cut from the member's class sheet, their name (the leader's
 * crown first), and a bar slot: health and resource in the HUD's own bar style at half height,
 * always for the player (from their own state) and, in every world the hub included, for a
 * teammate when this world's state carries their health. "Lv N" follows the player's own name
 * (from their own state) and such a teammate's; any other teammate shows name and bust alone, no
 * word, no level. An away teammate's frame is greyed. A skeleton row is the invitee's name with a
 * grey pulse where the bust and bars go, no countdown. A resource the state does not carry yet is
 * an empty bar.
 *
 * It redraws from the party store on every `party_update` and from each state tick the scene
 * hands it (`show`); it asks the server for nothing. Once a frame it lets the store say the
 * leader's "No answer from <name>." line for a lapsed invite (R27). The leader's frame carries the
 * Travel button for a member on another pod (R28): amber and live in the player's own town,
 * faint and inert in a field, a run, or while the leader is away. Neutral HUD on the game
 * palette, at the HUD's depth. The frames themselves rebuild only when the party's shape changes;
 * a tick that moves a bar redraws the bars alone.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import type { WorldType } from "@/assets/types/client";
import type { ArtLibrary } from "@/render/art/library";
import { prefersReducedMotion } from "@/render/effects/mist";
import { HUD_DEPTH } from "@/render/markers/markers";
import { useAuthStore } from "@/stores/authStore";
import { useGameStore } from "@/stores/gameStore";
import { usePartyStore, type PartyState } from "@/stores/partyStore";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { maskedBust, type MaskedBust, type Portrait } from "./bustPortrait";
import { socketManager } from "@/utils/class/SocketManager";
import { partyCommands } from "./partyCommands";
import { drawHudButton, drawLeaderMark, hudButtonSounds } from "./PartyPanel";
import type { UiEffect } from "@/audio/uiSounds";
import {
  PARTY_FRAMES_PLACEMENT,
  PARTY_LEADER_MARK_W,
  PARTY_LEVEL_GAP,
  partyBustFrame,
  partyFrameRows,
  partyFramesFrame,
  partyNameRoom,
  partyTravelButtonRect,
  travelButton,
  type PartyFrameRect,
  type PartyFrameRow,
  type SeenState,
  type TravelButton,
} from "./partyFramesLayout";
import { HUD_BAR_FILL, drawHudBar, drawHudPips } from "./ResourceHud";

export interface PartyFramesDeps {
  store: StoreApi<PartyState>;
  selfId: () => string | undefined;
  /** The world this player stands in: where the frames stand, and whether Travel is live. */
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
  /** Sends `party_travel` (R28): pressed on the leader's frame. */
  travel: () => void;
  /**
   * Plays an interface sound (FS-WDM0X § Change pass 2 (party), P5–P7): Travel's hover, press and
   * greyed press. None, and Travel plays nothing; greyed, it takes no press.
   */
  play?: (effect: UiEffect) => void;
}

/**
 * The frames as the UI scene hangs them (FS-TQZ5J § Change: Phase 2: the party, R36, R37): the app's
 * party, this player, the art the class sheets resolve on.
 */
export function mountPartyFrames(
  scene: Phaser.Scene,
  art: Pick<ArtLibrary, "resolve">,
  play?: (effect: UiEffect) => void,
): PartyFrames {
  return new PartyFrames(scene, {
    store: usePartyStore,
    selfId: () => useAuthStore.getState().memberInfo?.id,
    world: () => useGameStore.getState().worldType,
    art,
    travel: partyCommands(socketManager).travel,
    play,
  });
}

const NAME_PX = 13;
/** A member's "Lv N", a step under the name so the leader's row keeps room for the name. */
const LEVEL_PX = 11;
/** An away member's frame: its bust and ring dimmed to this. */
const AWAY_ALPHA = 0.4;
/** The skeleton's pulse: between these alphas, once each way per period; still under reduced motion. */
const PULSE_LOW = 0.25;
const PULSE_HIGH = 0.6;
const PULSE_MS = 900;
const TRAVEL_LABEL = "Travel";

/**
 * Shortens a name drawn wider than room with an ellipsis, one character at a time, as measured on
 * the canvas: character names run to 32 characters, a frame holds about a dozen.
 */
function fitted(
  t: Phaser.GameObjects.Text,
  room: number,
): Phaser.GameObjects.Text {
  const full = t.text ?? "";
  let kept = full.length;
  while (t.width > room && kept > 1) {
    kept -= 1;
    t.setText(`${full.slice(0, kept)}…`);
  }
  return t;
}

export class PartyFrames {
  private rows: PartyFrameRow[] = [];
  private travel: TravelButton = "hidden";
  private seen: SeenState = {};
  /** What the frames and the bars were last drawn from. */
  private drawnShape?: string;
  private drawnSlots?: string;
  private rects: PartyFrameRect[] = [];
  private chrome?: Phaser.GameObjects.Graphics;
  private rings?: Phaser.GameObjects.Graphics;
  private pulse?: Phaser.GameObjects.Graphics;
  private bars?: Phaser.GameObjects.Graphics;
  private names: Phaser.GameObjects.Text[] = [];
  private busts: MaskedBust[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PartyFramesDeps,
  ) {
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (state.party !== prev.party) this.refresh();
    });
    this.scene.events?.on("postupdate", this.tick, this);
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
    return this.rows.findIndex((r) => r.kind === "member" && r.leader);
  }

  /**
   * Let go as its scene ends (the scenes' release, alone): the scene's tween manager has let the
   * pulse's tween go already, and on a game destroy has destroyed itself (scenes/sceneEnd.ts).
   */
  destroy(): void {
    this.unsubscribe();
    this.scene.events?.off("postupdate", this.tick, this);
    this.dropDrawn();
  }

  /** Once a frame: a lapsed invite's line, on the leader's client (FS-NCC9J R27). */
  private tick(): void {
    this.deps.store.getState().expireReserved();
  }

  private refresh(): void {
    const world = this.deps.world();
    const { party } = this.deps.store.getState();
    this.rows = partyFrameRows(party, this.deps.selfId(), this.seen);
    this.travel = travelButton(party, this.deps.selfId(), world);

    const { x, top } = PARTY_FRAMES_PLACEMENT[world ?? "hub"];
    const shape = JSON.stringify([
      x,
      top,
      this.rows.map((r) =>
        r.kind === "member"
          ? [r.kind, r.player_id, r.name, r.class, r.leader, r.away, r.level]
          : [r.kind, r.name],
      ),
      this.travel,
    ]);
    if (shape !== this.drawnShape) {
      this.drawnShape = shape;
      this.drawnSlots = undefined;
      this.takeDown();
      this.rects = partyFramesFrame(this.rows.length, x, top);
      this.drawFrames();
    }

    const slots = JSON.stringify(
      this.rows.map((r) => (r.kind === "member" ? r.slot : null)),
    );
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
  ): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, content, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${px}px`,
        color: toCss(colour),
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  private hud(): Phaser.GameObjects.Graphics {
    return this.scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
  }

  /**
   * The panels, the medallions with their busts, the names and the leader's crown; for a
   * skeleton row, its name and the pulse.
   */
  private drawFrames(): void {
    if (this.rows.length === 0) return;
    const chrome = (this.chrome = this.hud());
    const drawBust = this.deps.drawBust ?? maskedBust;

    this.rows.forEach((row, i) => {
      const { row: r, bust } = this.rects[i];
      chrome.fillStyle(palette.hudPanel, 0.85);
      chrome.fillRect(r.x, r.y, r.width, r.height);
      chrome.lineStyle(1, palette.frame, 0.35);
      chrome.strokeRect(r.x, r.y, r.width, r.height);
      chrome.fillStyle(palette.hudPanelDeep, 1);
      chrome.fillCircle(bust.x, bust.y, bust.r);
      if (row.kind !== "member") return;

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
      cut.image
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setAlpha(row.away ? AWAY_ALPHA : 1);
      this.busts.push(cut);
    });

    // over the busts: the medallion rings, the leader's crown and the names
    const rings = (this.rings = this.hud());
    this.rows.forEach((row, i) => {
      const { bust, name } = this.rects[i];
      if (row.kind !== "member") {
        const room = partyNameRoom(this.rects[i], false, false);
        this.names.push(
          fitted(
            this.text(name.x, name.y, row.name, palette.hudLabel, NAME_PX),
            room,
          ),
        );
        return;
      }
      rings.lineStyle(2, palette.frame, row.away ? AWAY_ALPHA : 0.9);
      rings.strokeCircle(bust.x, bust.y, bust.r);
      if (row.leader) drawLeaderMark(rings, name.x, name.y + 4);
      const nameX = name.x + (row.leader ? PARTY_LEADER_MARK_W : 0);
      const colour = row.away ? palette.hudFaint : palette.hudText;
      const room = partyNameRoom(
        this.rects[i],
        row.leader,
        row.leader && this.travel !== "hidden",
      );
      const label = this.text(nameX, name.y, row.name, colour, NAME_PX);
      this.names.push(label);
      if (row.level === undefined) {
        fitted(label, room);
        return;
      }
      // "Lv N" right after the name (FS-CH21F R10); the name gives up the room it takes
      const level = this.text(
        nameX,
        name.y + NAME_PX - LEVEL_PX,
        `Lv ${row.level}`,
        row.away ? palette.hudFaint : palette.hudLabel,
        LEVEL_PX,
      );
      this.names.push(level);
      fitted(label, room - level.width - PARTY_LEVEL_GAP);
      level.setX(nameX + label.width + PARTY_LEVEL_GAP);
    });

    this.drawTravel(rings);
    this.drawPulse();
  }

  /**
   * The Travel button on the leader's frame (R28): brass-outlined, its word amber and pressable in
   * the player's own town, faint and inert where travel is refused. Hidden, nothing is drawn.
   */
  private drawTravel(g: Phaser.GameObjects.Graphics): void {
    const at = this.leaderRow();
    if (this.travel === "hidden" || at < 0) return;
    this.names.push(
      drawHudButton(this.scene, g, {
        rect: partyTravelButtonRect(this.rects[at]),
        label: TRAVEL_LABEL,
        enabled: this.travel === "live",
        press: () => this.deps.travel(),
        depth: HUD_DEPTH,
        feedback: this.deps.play ? hudButtonSounds(this.deps.play) : {},
      }),
    );
  }

  /** The skeleton rows' grey pulse, over the medallion and where the bars would be (R26). */
  private drawPulse(): void {
    const skeletons = this.rows.flatMap((row, i) =>
      row.kind === "skeleton" ? [this.rects[i]] : [],
    );
    if (skeletons.length === 0) return;
    const g = (this.pulse = this.hud());
    g.fillStyle(palette.hudFaint, 1);
    for (const { bust, health, resource } of skeletons) {
      g.fillCircle(bust.x, bust.y, bust.r - 2);
      g.fillRect(health.x, health.y, health.width, health.height);
      g.fillRect(resource.x, resource.y, resource.width, resource.height);
    }
    if (prefersReducedMotion()) {
      g.setAlpha(PULSE_HIGH);
      return;
    }
    this.scene.tweens.add({
      targets: g,
      alpha: { from: PULSE_LOW, to: PULSE_HIGH },
      duration: PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** The health and resource bars in each member frame whose slot holds them; a missing resource is empty. */
  private drawBars(): void {
    if (this.rows.length === 0) {
      this.bars?.destroy();
      this.bars = undefined;
      return;
    }
    const g = (this.bars ??= this.hud());
    g.clear();

    this.rows.forEach((row, i) => {
      if (row.kind !== "member" || row.slot.kind !== "bars") return;
      const { slot } = row;
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
    if (this.pulse) this.scene.tweens.killTweensOf(this.pulse);
    this.dropDrawn();
  }

  /** Every frame drawn destroyed and forgotten, the pulse's tween already gone. */
  private dropDrawn(): void {
    for (const g of [this.chrome, this.rings, this.pulse, this.bars])
      g?.destroy();
    this.chrome = this.rings = this.pulse = this.bars = undefined;
    this.busts.forEach(({ image, mask }) => {
      image.destroy();
      mask?.destroy();
    });
    this.busts = [];
    this.names.forEach((t) => t.destroy());
    this.names = [];
  }
}
