/**
 * The party on the UI scene (FS-TQZ5J § Change: Phase 2: the party, R36–R43): the party panel, the
 * invite prompt and (in the town) the ready check, built for each world reported and taken down as it
 * leaves, as each world's create mounted them and its release destroyed them. Its open state lives in the party store, so it carries across a switch.
 * Phaser-free: the UI scene hands it the builder (`mountPartyPanel` on itself), so the wiring is tested
 * on its own.
 *
 * What they read of the world is the world's report (R38): the world's part of the panel's refusal,
 * `blockers().party`, beside the UI scene's own menu slot; the popups' hiding, `blockers().popups`; the
 * invite stack's floor, `layout().chatTop`. Its opening closes the town's letter panel
 * by a request (R39); its own inputs run through the UI scene's act (R22).
 */

import type { UiActWrapper } from "@/audio/uiSounds";
import type { UiBridge, World, WorldReport } from "./uiBridge";

/** The party panel as the UI scene keeps it. `PartyPanel` is one. */
export interface PartyPanelPiece {
  isOpen(): boolean;
  /** Shuts it: whether there was one to shut. */
  close(): boolean;
  /** The Party icon's toggle, under the panel's own refusal. */
  toggle(): void;
  relayout(): void;
  /** Whether a press at a screen point keeps the invite field's focus: on the panel, with it focused (R42). */
  keepsField(x: number, y: number): boolean;
  destroy(): void;
}

/** Any other party piece as the UI scene keeps it: the invite prompt, the ready check. */
export interface PartyPiece {
  /** The logical view changed: back to its anchor. */
  relayout?(): void;
  destroy(): void;
}

/** The party pieces built for one world: the panel, and the rest (R36). */
export interface PartyPieces {
  panel: PartyPanelPiece;
  rest?: readonly PartyPiece[];
}

/** What the party panel is built with in a world (R38, R39): its refusal, its opening, its wrapper. */
export interface PartyPanelWiring {
  /** Refused while the menu slot is filled, the world turns it away, or no world is reported. */
  blocked: () => boolean;
  /** The town's letter panel gives way as it opens (FS-R82NV § Change C9); none elsewhere. */
  opening?: () => void;
  /** The UI scene's act, its own inputs' sounds (FS-WDM0X S9). */
  wrapper: UiActWrapper;
}

/** What the invite prompt and the ready check are built with in a world (R38): when they hide, where they stop. */
export interface PartyPromptWiring {
  /** Hidden while the world says so (`blockers().popups`), or no world is reported. */
  hidden: () => boolean;
  /** The screen y the invite stack stays above (`layout().chatTop`), where the world has one. */
  floor: () => number | undefined;
}

/** The invite prompt's and the ready check's wiring (R38). */
export function partyPromptWiring(bridge: Pick<UiBridge, "world">): PartyPromptWiring {
  return {
    hidden: () => {
      const report = bridge.world;
      return !report || !!report.blockers().popups;
    },
    floor: () => bridge.world?.layout?.().chatTop,
  };
}

/** What of the bridge the panel's wiring reads, asks and plays through. */
export type PartyBridge = Pick<UiBridge, "world" | "ui" | "request" | "act">;

/** The party panel's wiring in `world` (R38, R39). */
export function partyPanelWiring(bridge: PartyBridge, world: World): PartyPanelWiring {
  return {
    blocked: () => {
      const report = bridge.world;
      return !report || bridge.ui.menuOpen || !!report.blockers().party;
    },
    opening: world === "hub" ? () => bridge.request({ kind: "close", window: "letter" }) : undefined,
    wrapper: { act: (run) => bridge.act(run) },
  };
}

export class UiPartySlot {
  private pieces: PartyPieces | null = null;
  /** The world the standing pieces were built for. */
  private builtFor: World | null = null;

  constructor(private readonly build: (world: World) => PartyPieces) {}

  /**
   * Heard each world report, and none as the world leaves (R36): pieces for the world reported, built
   * anew after a leave or for another world; a report of the world they stand for keeps them.
   */
  show(report: WorldReport | null): void {
    if (report && this.pieces && this.builtFor === report.world) return;
    this.takeDown();
    if (!report) return;
    this.pieces = this.build(report.world);
    this.builtFor = report.world;
  }

  /** Whether the party panel is open (R39); none built, it is not. */
  isOpen(): boolean {
    return this.pieces?.panel.isOpen() ?? false;
  }

  /** Shuts the party panel: Esc's step, the menu opening, the Menu icon after the run's end (R39). */
  close(): void {
    this.pieces?.panel.close();
  }

  /** The corner row's Party icon (R39; FS-3EBCA R8). */
  toggle(): void {
    this.pieces?.panel.toggle();
  }

  /** Whether a UI press at a screen point keeps the invite field's focus (R42). */
  keepsField(x: number, y: number): boolean {
    return this.pieces?.panel.keepsField(x, y) ?? false;
  }

  /** The logical view changed: the pieces back to their anchors (FS-ZAJMH R13). */
  relayout(): void {
    this.pieces?.panel.relayout();
    this.pieces?.rest?.forEach((piece) => piece.relayout?.());
  }

  destroy(): void {
    this.takeDown();
  }

  private takeDown(): void {
    this.pieces?.panel.destroy();
    this.pieces?.rest?.forEach((piece) => piece.destroy());
    this.pieces = null;
    this.builtFor = null;
  }
}
