/**
 * The invite prompt (FS-R82NV R32, R33): each `party_invite` waiting on this player's answer is
 * a small carved prompt at the top centre, under the queue panel's line: "<leader> invites you to
 * their party (<n>/<size>)", a countdown from 60 s, **Decline** and **Accept**. Several stack
 * downward, oldest at the top. A prompt closes on its own button, when its countdown ends, or
 * when a `party_update` makes the player a member (the store empties every invite then).
 *
 * The invites live in the party store, so they outlive the scene; only the hub mounts the prompt,
 * since the server never delivers an invite into a run or a field (R7, R33). An overlay that owns
 * the screen hides it, as the chat input hides; the countdown runs on underneath.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import {
  usePartyStore,
  type PartyState,
  type PendingInvite,
} from "@/stores/partyStore";
import { socketManager } from "@/utils/class/SocketManager";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import { partyCommands, type PartyCommands } from "./partyCommands";
import {
  INVITE_LABEL,
  inviteCountdownText,
  invitePromptFrames,
  invitePromptText,
  type InvitePromptFrame,
} from "./partyInvitePromptLayout";
import type { Rect } from "./partyPanelLayout";

export interface PartyInvitePromptDeps {
  store: StoreApi<PartyState>;
  commands: Pick<PartyCommands, "accept" | "decline">;
  /** Whether an overlay owns the screen now: the prompts hide under it (R33). */
  hidden: () => boolean;
}

/** The prompt as the hub hangs it: the app's party store and the real socket. */
export function mountPartyInvitePrompt(
  scene: Phaser.Scene,
  hidden: () => boolean,
): PartyInvitePrompt {
  return new PartyInvitePrompt(scene, {
    store: usePartyStore,
    commands: partyCommands(socketManager),
    hidden,
  });
}

/** The HUD's depth, as the party panel and the chat window: under the gear overlay (1100). */
const PROMPT_DEPTH = 1000;
const FONT_PX = 14;
const SMALL_PX = 12;

const style = (colour: number, px = FONT_PX) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${px}px`,
  color: toCss(colour),
});

const within = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export class PartyInvitePrompt {
  private graphics?: Phaser.GameObjects.Graphics;
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
        this.draw(true);
    });
    scene.events.on("postupdate", this.tick, this);
    this.draw(true);
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

  /** Once a frame: run-out invites go, and the prompts redraw when a second ticks or an overlay comes or goes. */
  private tick(): void {
    this.deps.store.getState().expireInvites();
    this.draw(false);
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

  /** A brass-outlined button, its words in the colour of what it does. */
  private button(
    g: Phaser.GameObjects.Graphics,
    r: Rect,
    label: string,
    colour: number,
    press: () => void,
  ): void {
    g.lineStyle(1, palette.frame, 0.8);
    g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, 3);
    this.text(r.x + r.width / 2, r.y + r.height / 2, label, colour, SMALL_PX)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", press);
  }

  /**
   * Draws the waiting invites. `force` redraws whatever changed; otherwise only when what the
   * player would see differs from the last draw (a second ticked, an overlay came or went).
   */
  private draw(force: boolean): void {
    const { invites, panelOpen, secondsLeft } = this.deps.store.getState();
    const hidden = this.deps.hidden();
    const frames = hidden
      ? []
      : invitePromptFrames(invites.length, {
          canvasWidth: this.scene.cameras.main.width,
          panelOpen,
        });
    const seen = frames.map((_, i) => ({
      invite: invites[i],
      seconds: secondsLeft(invites[i]),
    }));
    const key = seen.map((s) => `${s.invite.invite_id}:${s.seconds}`).join(",");
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
      this.text(
        f.countdown.x,
        f.countdown.y + 3,
        inviteCountdownText(seconds),
        palette.hudLabel,
        SMALL_PX,
      );
      // arcane for the way out, amber for the thing to do (design guideline, Gameplay accent)
      this.button(g, f.decline, INVITE_LABEL.decline, palette.safe, () =>
        this.answer(invite, false),
      );
      this.button(g, f.accept, INVITE_LABEL.accept, palette.interactable, () =>
        this.answer(invite, true),
      );
    });
  }
}
