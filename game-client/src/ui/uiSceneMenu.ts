/**
 * The UI scene's one menu slot (FS-TQZ5J §D R16–R21): the ESC menu, the OPTIONS panel opened from it
 * in its place, and the run's Fall confirm, built from the world's report (its world, its facts) and
 * drawn with the shared chrome (`showMenuPanel`, `openOptionsPanel`) as each world drew them. What a
 * row needs of the world is a request the world answers (R11); what the slot is, the menu's
 * open state, the UI's reported state (R10), which every world guard reads.
 *
 * Esc is the UI scene's (R17): one press is one step, the town's dialogue on top, then
 * `escapeStep`'s order over the world's windows and this slot. While the slot is filled Enter, 1–3
 * and ←/→ are its (R18). The keys are handed in once a frame, read by the UI scene from its own key
 * objects in its update, never on a key event, so who acts on a key never rests on the order the
 * scenes' keyboards hear it (R21; § Spike findings (b)).
 *
 * Phaser-free: the UI scene hands it the drawing (`MenuDraw`), so the wiring is tested on its own.
 */

import { hubMenuChoices } from "@/scenes/hubMenu";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { escapeStep } from "./escapeOrder";
import type { HitSize, MenuChoice, MenuPanelSpec, MenuTones } from "./menuPanel";
import type { FullscreenControl, MenuSlotKeys, MusicLevelControl, OptionsFeedback, OptionsPanelSpec } from "./optionsPanel";
import type { UiEffect } from "@/audio/uiSounds";
import { BURN_CONFIRM, FALL_CONFIRM, runMenuChoices } from "./party";
import type { UiBridge, UiRequest, World, WorldFacts, WorldReport } from "./uiBridge";

/** A panel standing in the slot, as `showMenuPanel` and `openOptionsPanel` return it. */
export interface SlotPanel {
  container: { destroy(): void };
  keys: MenuSlotKeys;
  moveTo(origin: { x: number; y: number }): void;
}

/** How the UI scene draws the slot's panels: the shared chrome on itself. */
export interface MenuDraw {
  menu(spec: MenuPanelSpec<MenuChoice>): SlotPanel;
  options(spec: OptionsPanelSpec): SlotPanel;
}

/** What of the bridge the slot reads, asks, reports and plays through. */
export type MenuBridge = Pick<UiBridge, "world" | "ui" | "act" | "play" | "request" | "reportUi">;

export interface MenuSlotDeps {
  bridge: MenuBridge;
  draw: MenuDraw;
  /** The Menu icon's plate, which the open menu's blocker leaves to the icon (FS-3EBCA R18). */
  through: (x: number, y: number) => boolean;
  /** Where the panels stand: the view's centre now (FS-ZAJMH R13). */
  centre: () => { x: number; y: number };
  /** The stored music level, read as OPTIONS opens (R19; FS-28DDG § Change C13, C15). */
  musicLevel: () => MusicLevelControl;
  /** The game frame's fullscreen its page lent (FS-T3DWX R12), or none. */
  fullscreen: () => FullscreenControl | null;
  /**
   * The UI scene's party panel (§ Change: Phase 2: the party, R39): Esc's party step, the menu opening
   * over it and the Menu icon after the run's end shut it. None, and there is none to shut.
   */
  party?: { isOpen(): boolean; close(): void };
  /**
   * The UI scene's gear overlay (§ Change: Phase 3, R55): Esc's gear step, the menu opening over it and
   * the Menu icon after the run's end shut it. None, and there is none to shut.
   */
  gear?: { isOpen(): boolean; close(): void };
  /**
   * The UI scene's controls panel (FS-84N1G R17): Esc's first step, closed as the player's close (its
   * `dialog_cancel`). None, and there is none to close.
   */
  controls?: { isOpen(): boolean; dismiss(): void };
}

/** A menu's look in a world: its tokens and its rows' pressable area (ADR-0013). */
export interface MenuLook {
  tones: MenuTones;
  hit: HitSize;
}

/** The town's look, which a field's menu wears too (FS-G4VMQ § Change C2): Bone & Soot. */
const TOWN_LOOK: MenuLook = {
  tones: {
    panel: BARROW_HEX.charcoal,
    frame: BARROW_HEX.brass,
    text: BARROW_HEX.vellum,
    dim: BARROW_HEX.vellumDark,
    actionable: BARROW_HEX.amber,
    cancel: BARROW_HEX.arcane,
  },
  hit: { width: 160, height: 34 },
};

/** Each world's menu look, as each world drew its own (FS-G4VMQ, FS-9K8EZ req 1). */
export const MENU_LOOKS: Readonly<Record<World, MenuLook>> = {
  hub: TOWN_LOOK,
  field: TOWN_LOOK,
  // the run's: amber to press, safe to go back, the HUD's label tone while dimmed
  run: {
    tones: {
      panel: palette.ink,
      frame: palette.frame,
      text: palette.hudText,
      dim: palette.hudLabel,
      actionable: palette.interactable,
      cancel: palette.safe,
    },
    hit: { width: 220, height: 34 },
  },
};

/** The keys the UI scene read this frame: each pressed since the last, a number by its index. */
export interface MenuKeysPressed {
  esc: boolean;
  enter: boolean;
  /** 1–3 as 0–2; -1 for none. */
  numbered: number;
  /** ← (-1) or → (+1), or none. */
  nudge?: -1 | 1;
}

/** The slot filled: what stands in it, the world it was built for, and what its rows were toned for. */
interface Filled {
  panel: SlotPanel;
  world: World;
  /** The player's state the rows were built for: a state that differs takes them down (R20). */
  resolved: boolean;
  /** The town's queue the rows offered a way out of: gone, they come down with it (R20). */
  queued: boolean;
  /** The facts the rows' dimming was last drawn for. */
  toned: string;
}

/** What a filled slot's dimming reads, as one key: a change redraws the rows' tones. */
const toneKey = (facts: WorldFacts) => `${facts.leaving}|${facts.leavePending}|${facts.fallPending}`;

export class UiMenuSlot {
  private filled: Filled | null = null;
  /**
   * What the chrome tells of the player's hand, played on the UI scene's player (FS-WDM0X § Change:
   * Menu, dialog and notice sounds, M5, M8–M10): a hover, a refused press, a level moved, the
   * Fullscreen row's way.
   */
  private readonly feedback: OptionsFeedback;

  constructor(private readonly deps: MenuSlotDeps) {
    const play = (effect: UiEffect) => () => deps.bridge.play(effect);
    this.feedback = {
      hovered: play("menu_hover"),
      refused: play("menu_error"),
      stepped: play("menu_slider_tick"),
      toggled: (on) => deps.bridge.play(on ? "menu_toggle_on" : "menu_toggle_off"),
    };
  }

  /** Whether the slot is filled: the menu, OPTIONS or the Fall confirm (R10). */
  isOpen(): boolean {
    return this.filled !== null;
  }

  /**
   * The keys pressed this frame (R17, R18, R21): Esc's step through the UI scene's act; with the slot
   * filled, Enter its first row, a number that row, ←/→ the OPTIONS slider. Nothing once the run has
   * ended: its end turns the run's keyboard off, and the menu's keys were the run's.
   */
  keys(pressed: MenuKeysPressed): void {
    const report = this.deps.bridge.world;
    if (!report || report.facts().ended) return;
    if (pressed.esc) {
      this.deps.bridge.act(() => this.escape());
      return;
    }
    const keys = this.filled?.panel.keys;
    if (!keys) return;
    if (pressed.enter) keys.confirm();
    else if (pressed.numbered >= 0) keys.pick(pressed.numbered);
    else if (pressed.nudge) keys.nudge?.(pressed.nudge);
  }

  /**
   * One Esc press (R17; FS-R82NV § Change C2, FS-HRH2J R5, FS-1GZGD R40): an open dialogue is
   * dismissed first, then `escapeStep`'s order: the run's controls panel (FS-84N1G R17), the letter panel, this slot (its Back; OPTIONS's
   * reopens the menu), the party panel, the gear overlay (the UI scene's own, § Change: Phase 3, R55);
   * with nothing open the menu opens.
   */
  escape(): void {
    const report = this.deps.bridge.world;
    if (!report) return;
    if (report.blockers().dialogue) {
      // the dialogue cancelled: its sound, inside Esc's act (FS-WDM0X § Change M13)
      this.deps.bridge.play("dialog_cancel");
      return this.ask({ kind: "close", window: "dialogue" });
    }
    const open = report.windows();
    const step = escapeStep({
      controls: this.deps.controls?.isOpen() ?? false,
      letter: open.letter,
      menu: this.isOpen(),
      gear: this.deps.gear?.isOpen() ?? false,
      party: this.deps.party?.isOpen() ?? false,
    });
    if (step === "controls") this.deps.controls?.dismiss();
    else if (step === "letter") this.ask({ kind: "close", window: "letter" });
    else if (step === "close-menu") this.filled?.panel.keys.dismiss();
    else if (step === "party") this.closeParty();
    else if (step === "gear") this.closeGear();
    else if (!report.facts().ended) this.openMenu();
  }

  /**
   * The corner row's Menu icon (FS-3EBCA R6, R17, R18): with the slot filled it empties it, from
   * OPTIONS and the Fall confirm too, nothing reopened or sent (owner 2026-11-12: "menu無法再按一次icon關閉");
   * otherwise the menu at once, every window closing as it opens. Nothing while the town's dialogue
   * is open; after the run's end there is no menu, and the icon only closes the windows.
   */
  pressMenu(): void {
    if (this.filled) return this.close();
    const report = this.deps.bridge.world;
    if (!report || report.blockers().dialogue) return;
    if (report.facts().ended) {
      this.closeParty();
      this.closeGear();
      return;
    }
    this.openMenu();
  }

  /**
   * The run's E at the altar with the tome carried (FS-3103M R25): "Burn tome?" on the Fall confirm's
   * panel, over no window, as the player's own action through the UI scene's act. It opens as the Fall
   * confirm does, with `dialog_open`; Burn asks the world for the one interact and empties the slot with
   * `dialog_confirm_heavy`; Not yet, Esc and the × send nothing and empty it with the rule's
   * `settings_close` (FS-WDM0X § Change M13, as the Fall confirm). Nothing with the slot already filled,
   * the run ended or another world reported.
   */
  confirmBurn(altar: string): void {
    const report = this.deps.bridge.world;
    if (!report || report.world !== "run" || this.filled || report.facts().ended) return;
    this.deps.bridge.act(() => {
      this.deps.bridge.play("dialog_open");
      this.show(report, {
        line: BURN_CONFIRM.line,
        choices: BURN_CONFIRM.choices,
        actions: {
          burn: this.played(() => {
            this.ask({ kind: "burn", altar });
            this.close();
          }, "dialog_confirm_heavy"),
        },
        enabled: {},
      });
    });
  }

  /**
   * The world's report heard again, or none as it leaves (R9, R20): the slot yields, with no sound,
   * when its world leaves or changes, a dialogue opens, the run ends, or the player's rows would now
   * be wrong (FS-9K8EZ req 6; FS-28DDG § Change C17), or the town's queue they offered a way out of is
   * gone (FS-G4VMQ R13); otherwise its rows retone where what dims them changed.
   */
  sync(): void {
    const filled = this.filled;
    if (!filled) return;
    const report = this.deps.bridge.world;
    if (!report || report.world !== filled.world) return this.close();
    const facts = report.facts();
    if (report.blockers().dialogue || facts.ended || facts.resolved !== filled.resolved) return this.close();
    if (filled.queued && !facts.queued) return this.close();
    const toned = toneKey(facts);
    if (toned === filled.toned) return;
    filled.toned = toned;
    filled.panel.keys.retone();
  }

  /** The logical view changed: what stands in the slot back to the centre (FS-ZAJMH R13). */
  relayout(): void {
    this.filled?.panel.moveTo(this.deps.centre());
  }

  /** Empties the slot, as Back, the ×, the Menu icon and a yield do; the UI's state reported (R10). */
  close(): void {
    const filled = this.filled;
    if (!filled) return;
    this.filled = null;
    filled.panel.container.destroy();
    this.deps.bridge.reportUi({ menuOpen: false });
  }

  /**
   * The world's ESC menu, from its report as it opens (R16): the town's and a field's rows by
   * `hubMenuChoices` (a field is never queued), the run's by `runMenuChoices`; Change character dimmed
   * while `leaving`, Leave the barrow while `leavePending`. Every row and the × the player's, through
   * the UI scene's act (FS-WDM0X S9): an ordinary row plays `menu_click`, Fall where you stand
   * `dialog_open`; Back and Leave the barrow close the whole menu, and keep the rule's
   * `settings_close` (§ Change M6, M7, M11).
   */
  private openMenu(): void {
    const report = this.deps.bridge.world;
    if (!report) return;
    const facts = report.facts();
    const live = () => this.deps.bridge.world?.facts() ?? facts;
    if (report.world === "run") {
      this.show(report, {
        choices: runMenuChoices(facts),
        actions: {
          // Fall and Options keep the slot filled; Leave the barrow closes it (S5)
          fall: this.played(() => this.openFallConfirm(), "dialog_open"),
          leave: this.played(() => {
            this.ask({ kind: "leaveRun" });
            this.close();
          }),
          options: this.played(() => this.openOptions(), "menu_click"),
        },
        enabled: { leave: () => !live().leavePending },
      });
      return;
    }
    this.show(report, {
      choices: hubMenuChoices({ queued: facts.queued }),
      actions: {
        change: this.played(() => this.ask({ kind: "changeCharacter" }), "menu_click"),
        leave: this.played(() => this.ask({ kind: "leaveQueue" }), "menu_click"),
        options: this.played(() => this.openOptions(), "menu_click"),
        back: this.played(() => this.close()),
      },
      // dimmed while the server is asked, so a second press has nothing to land on
      enabled: { change: () => !live().leaving },
    });
  }

  /**
   * The OPTIONS panel in the slot (R19; FS-28DDG § Change C3–C8, C13, C17): Music the stored level,
   * each change also asked of the world, which applies it to the music it plays; Sound effects as the
   * panel keeps them; Fullscreen the frame's. Back, Esc and its × reopen the world's menu, rebuilt as
   * it is then; the slot stays filled, and they play `menu_back` (FS-WDM0X S5; § Change M7).
   */
  private openOptions(): void {
    const report = this.deps.bridge.world;
    if (!report) return;
    const look = MENU_LOOKS[report.world];
    const stored = this.deps.musicLevel();
    const music: MusicLevelControl = {
      level: () => stored.level(),
      setLevel: (level) => {
        stored.setLevel(level);
        this.deps.bridge.request({ kind: "musicLevel", level: stored.level() });
      },
    };
    this.fill(
      report,
      this.deps.draw.options({
        origin: this.deps.centre(),
        hit: look.hit,
        tones: look.tones,
        back: this.played(() => this.openMenu(), "menu_back"),
        music,
        fullscreen: this.deps.fullscreen(),
        through: this.deps.through,
        feedback: this.feedback,
      }),
    );
  }

  /**
   * Fall where you stand asks once (FS-9K8EZ req 3): the slot's rows become the confirm, nothing sent
   * yet. Fall plays `dialog_confirm_heavy` (FS-WDM0X § Change M13); Not yet, and its × and Esc through
   * it, close the whole menu with the rule's `settings_close` (S5; owner listening check 2026-11-14).
   */
  private openFallConfirm(): void {
    const report = this.deps.bridge.world;
    if (!report) return;
    const facts = report.facts();
    this.show(report, {
      line: FALL_CONFIRM.line,
      choices: FALL_CONFIRM.choices,
      actions: { "fall-now": this.played(() => this.ask({ kind: "fall" }), "dialog_confirm_heavy") },
      enabled: { "fall-now": () => !(this.deps.bridge.world?.facts() ?? facts).fallPending },
    });
  }

  /**
   * A menu panel in the slot with the world's look; Back, Not yet, Esc and the × empty it with the
   * rule's `settings_close` (S5, S9).
   */
  private show(report: WorldReport, spec: Pick<MenuPanelSpec<MenuChoice>, "line" | "choices" | "actions" | "enabled">): void {
    const look = MENU_LOOKS[report.world];
    this.fill(
      report,
      this.deps.draw.menu({
        ...spec,
        close: this.played(() => this.close()),
        origin: this.deps.centre(),
        hit: look.hit,
        tones: look.tones,
        through: this.deps.through,
        feedback: this.feedback,
      }),
    );
  }

  /**
   * `panel` stands in the slot. Into an empty slot, the party panel shuts and the UI's state is
   * reported, so the world closes
   * its windows and ends an aim in the same call, before the next frame draws (R10); a swap (menu ↔
   * OPTIONS ↔ the Fall confirm) takes the old panel down and reports nothing: the slot stays filled.
   */
  private fill(report: WorldReport, panel: SlotPanel): void {
    const facts = report.facts();
    const was = this.filled;
    this.filled = { panel, world: report.world, resolved: facts.resolved, queued: facts.queued, toned: toneKey(facts) };
    if (was) {
      was.panel.container.destroy();
      return;
    }
    // the menu opens over no window (FS-3EBCA R17): the UI scene's party panel and gear overlay shut
    // here, the world's windows as the world hears the UI's state
    this.deps.party?.close();
    this.deps.gear?.close();
    this.deps.bridge.reportUi({ menuOpen: true });
  }

  /** The UI scene's party panel shut (§ Change: Phase 2: the party, R39); the rows read the world again. */
  private closeParty(): void {
    this.deps.party?.close();
    this.sync();
  }

  /** The UI scene's gear overlay shut (§ Change: Phase 3, R55); the rows read the world again. */
  private closeGear(): void {
    this.deps.gear?.close();
    this.sync();
  }

  /** A request of the world, which has answered when it returns (R11); the rows read its facts again. */
  private ask(request: UiRequest): void {
    this.deps.bridge.request(request);
    this.sync();
  }

  /**
   * A player's press, run through the UI scene's act: its one sound (R22), `effect` where it names
   * one, else the window rule's (FS-WDM0X § Change M2).
   */
  private played(run: () => void, effect?: UiEffect): () => void {
    return () =>
      this.deps.bridge.act(() => {
        if (effect) this.deps.bridge.play(effect);
        run();
      });
  }
}
