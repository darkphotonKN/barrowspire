/**
 * The invite prompt (FS-R82NV R32, R33): each `party_invite` waiting on this player's answer is
 * a small carved prompt at the top centre, under the queue panel's line: "<leader> invites you to
 * their party (<n>/<size>)", the shared countdown from 60 s (FS-B3NDZ: the whole seconds above a
 * bar along the prompt's foot, draining every frame), **Decline** and **Accept**. Several stack
 * downward, oldest at the top. A prompt closes on its own button, when its countdown ends, or
 * when a `party_update` makes the player a member (the store empties every invite then).
 *
 * The invites live in the party store, so they outlive the scene. Every scene mounts the prompt,
 * since an invite reaches a player wherever they stand (FS-NCC9J R11, R24): the town, a field and
 * a run. In a run its Accept is greyed with "Not while delving." (the server would refuse it
 * `locked`); Decline still answers. An overlay that owns the screen hides it, as the chat input
 * hides; the countdown runs on underneath.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import type { WorldType } from "@/assets/types/client";
import { useGameStore } from "@/stores/gameStore";
import {
  usePartyStore,
  type PartyState,
  type PendingInvite,
} from "@/stores/partyStore";
import { socketManager } from "@/utils/class/SocketManager";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import {
  COUNTDOWN_SECONDS_PX,
  countdownSecondsText,
  drawCountdownBar,
} from "./countdownBar";
import { partyCommands, type PartyCommands } from "./partyCommands";
import {
  INVITE_LABEL,
  inviteAcceptState,
  invitePromptFrames,
  invitePromptText,
  type InvitePromptFrame,
} from "./partyInvitePromptLayout";
import type { Rect } from "./partyPanelLayout";
import { viewport } from "@/render/viewport";

export interface PartyInvitePromptDeps {
  store: StoreApi<PartyState>;
  commands: Pick<PartyCommands, "accept" | "decline">;
  /** Whether an overlay owns the screen now: the prompts hide under it (R33). */
  hidden: () => boolean;
  /** The world this player stands in now: Accept is greyed in a run (FS-NCC9J R24). */
  world: () => WorldType | null;
  /** The screen y the stack stays above (the chat window's top edge), when the scene has one. */
  floor: () => number | undefined;
}

/**
 * The prompt as a scene hangs it: the app's party store, the real socket, the world from the game
 * store, and the scene's own rule for when an overlay covers it and where its chat window starts.
 */
export function mountPartyInvitePrompt(
  scene: Phaser.Scene,
  hidden: () => boolean,
  floor: () => number | undefined = () => undefined,
): PartyInvitePrompt {
  return new PartyInvitePrompt(scene, {
    store: usePartyStore,
    commands: partyCommands(socketManager),
    hidden,
    world: () => useGameStore.getState().worldType,
    floor,
  });
}

/** The HUD's depth, as the party panel and the chat window: under the gear overlay (1100). */
const PROMPT_DEPTH = 1000;
const FONT_PX = 14;
const SMALL_PX = 12;
/** A greyed button's words, as the party panel greys one. */
const GREYED_ALPHA = 0.45;

const style = (colour: number, px = FONT_PX) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${px}px`,
  color: toCss(colour),
});

const within = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export class PartyInvitePrompt {
  private graphics?: Phaser.GameObjects.Graphics;
  /** The countdown bars' own layer, redrawn every frame (FS-B3NDZ R4): one per shown prompt. */
  private barLayer?: Phaser.GameObjects.Graphics;
  private bars: { invite: PendingInvite; rect: Rect }[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private frames: InvitePromptFrame[] = [];
  /** What the last draw showed: hidden or not, and each shown prompt's id and seconds. */
  private drawn = "";
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PartyInvitePromptDeps,
  ) {
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (state.invites !== prev.invites || state.panelOpen !== prev.panelOpen)
        this.render(true);
    });
    scene.events.on("postupdate", this.tick, this);
    this.render(true);
  }

  /** The logical view changed: what is shown is drawn again, centred across its top (FS-ZAJMH R13). */
  relayout(): void {
    this.render(true);
  }

  /** How many prompts are on screen now. */
  shown(): number {
    return this.frames.length;
  }

  /** Whether a screen point lies on a shown prompt: a press there is the prompt's. */
  covers(x: number, y: number): boolean {
    return this.frames.some((f) => within(f.panel, x, y));
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.events?.off("postupdate", this.tick, this);
    this.clear();
    this.frames = [];
  }

  /**
   * Once a frame: run-out invites go, the bars drain, and the prompts redraw when a second ticks or
   * an overlay comes or goes.
   */
  private tick(): void {
    this.deps.store.getState().expireInvites();
    this.render(false);
  }

  private render(force: boolean): void {
    this.draw(force);
    this.drainBars();
  }

  /** Each shown prompt's bar at what is left of its own invite's window, now (FS-B3NDZ R3, R6). */
  private drainBars(): void {
    if (!this.barLayer) return;
    const { inviteFraction } = this.deps.store.getState();
    this.barLayer.clear();
    for (const { invite, rect } of this.bars)
      drawCountdownBar(this.barLayer, rect, inviteFraction(invite));
  }

  private answer(invite: PendingInvite, accept: boolean): void {
    if (accept) this.deps.commands.accept(invite.invite_id);
    else this.deps.commands.decline(invite.invite_id);
    this.deps.store.getState().dismissInvite(invite.invite_id);
  }

  private clear(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
    this.graphics?.destroy();
    this.graphics = undefined;
    this.barLayer?.destroy();
    this.barLayer = undefined;
    this.bars = [];
  }

  private text(
    x: number,
    y: number,
    content: string,
    colour: number,
    px = FONT_PX,
    wrap?: number,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, content, {
        ...style(colour, px),
        ...(wrap ? { wordWrap: { width: wrap } } : {}),
      })
      .setScrollFactor(0)
      .setDepth(PROMPT_DEPTH);
    this.texts.push(t);
    return t;
  }

  /**
   * A brass-outlined button, its words in the colour of what it does; faint and inert when the
   * player may not press it (no amber on a thing they cannot act on, Gameplay accent).
   */
  private button(
    g: Phaser.GameObjects.Graphics,
    r: Rect,
    label: string,
    colour: number,
    press: () => void,
    live = true,
  ): void {
    g.lineStyle(1, palette.frame, live ? 0.8 : 0.3);
    g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, 3);
    const t = this.text(
      r.x + r.width / 2,
      r.y + r.height / 2,
      label,
      live ? colour : palette.hudFaint,
      SMALL_PX,
    ).setOrigin(0.5, 0.5);
    if (!live) {
      t.setAlpha(GREYED_ALPHA);
      return;
    }
    // on the release, not the press (asked 2026-11-02): answering on the press closed the prompt
    // before a fighting scene's attack handler asked whether that press was the prompt's (R24)
    t.setInteractive({ useHandCursor: true }).on("pointerup", press);
  }

  /**
   * Draws the waiting invites. `force` redraws whatever changed; otherwise only when what the
   * player would see differs from the last draw (a second ticked, an overlay came or went).
   */
  private draw(force: boolean): void {
    const { invites, panelOpen, secondsLeft } = this.deps.store.getState();
    const hidden = this.deps.hidden();
    const accept = inviteAcceptState(this.deps.world());
    const frames = hidden
      ? []
      : invitePromptFrames(invites.length, {
          canvasWidth: viewport.width,
          panelOpen,
          note: accept.note !== undefined,
          floor: this.deps.floor(),
        });
    const seen = frames.map((_, i) => ({
      invite: invites[i],
      seconds: secondsLeft(invites[i]),
    }));
    const key =
      `${accept.live}|` +
      seen.map((s) => `${s.invite.invite_id}:${s.seconds}`).join(",");
    if (!force && key === this.drawn) return;
    this.drawn = key;

    this.clear();
    this.frames = frames;
    if (frames.length === 0) return;

    const g = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(PROMPT_DEPTH);
    this.graphics = g;
    // over the panels, which the graphics above draws all of first
    this.barLayer = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(PROMPT_DEPTH);
    this.bars = frames.map((f, i) => ({ invite: seen[i].invite, rect: f.bar }));
    frames.forEach((f, i) => {
      const { invite, seconds } = seen[i];
      carvedPanel(g, f.panel.x, f.panel.y, f.panel.width, f.panel.height);
      this.text(
        f.text.x,
        f.text.y,
        invitePromptText(invite),
        palette.hudText,
        FONT_PX,
        f.text.width,
      );
      // the shared countdown's seconds, beside the buttons, above the bar (FS-B3NDZ R8, R9)
      this.text(
        f.countdown.x,
        f.countdown.y + f.countdown.height / 2,
        countdownSecondsText(seconds),
        palette.hudText,
        COUNTDOWN_SECONDS_PX,
      ).setOrigin(0, 0.5);
      // arcane for the way out, amber for the thing to do (design guideline, Gameplay accent)
      this.button(g, f.decline, INVITE_LABEL.decline, palette.safe, () =>
        this.answer(invite, false),
      );
      this.button(
        g,
        f.accept,
        INVITE_LABEL.accept,
        palette.interactable,
        () => this.answer(invite, true),
        accept.live,
      );
      if (f.note && accept.note)
        this.text(
          f.note.x,
          f.note.y + 1,
          accept.note,
          palette.hudLabel,
          SMALL_PX,
        );
    });
  }
}
