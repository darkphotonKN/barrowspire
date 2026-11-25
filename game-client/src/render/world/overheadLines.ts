/**
 * Over-head lines (FS-4EC7Z §G R30): a short line over an encounter NPC's head for 4 s, in the world
 * scene, since it follows a world object (ADR-0086). Shown once per `line_at`, the NPC's own clock
 * rising with each line, and never on a first broadcast: an NPC first seen (a connect, a reconnect,
 * one coming into interest) is its own baseline, and a line it said before it was seen is not said.
 * A line whose NPC leaves the state before its 4 s are up (the cutthroats' turn: the server replaces
 * them with `cutthroat` monsters on the next tick) stays where the NPC last stood for the rest of its
 * 4 s. The words are the client's (`encounterLineText`); a key without words says nothing.
 *
 * Pure: the scene's stage makes and places each line, so the rule is tested without a canvas.
 */

import type { Point } from "@/render/iso/projection";
import type { EncounterNPCState } from "@/types/gameState";

/** How long a line stands over its NPC, ms. */
export const LINE_MS = 4000;

/** The scene's side: a line's text made, and placed over its NPC's head (screen px), shown or hidden with it. */
export interface LineStage<T extends { destroy(): void }> {
  say(text: string): T;
  place(line: T, at: Point, shown: boolean): void;
}

/** Where an NPC's head is drawn now, screen px, and whether its body is shown; none once it has left. */
export type HeadOf = (entityId: string) => { at: Point; shown: boolean } | undefined;

interface Live<T> {
  line: T;
  until: number;
  at?: Point;
  shown: boolean;
}

export class OverheadLines<T extends { destroy(): void }> {
  /** Each NPC in the last broadcast, by entity id, with the `line_at` it carried. */
  private seen = new Map<string, number | undefined>();
  /** The lines standing, by their NPC's entity id: one each, the newest. */
  private readonly live = new Map<string, Live<T>>();

  constructor(
    private readonly stage: LineStage<T>,
    private readonly words: (key: string) => string | null,
  ) {}

  /** This broadcast's NPCs at `now` (ms): a line said since the last one they were seen in is shown. */
  sync(npcs: readonly EncounterNPCState[], now: number): void {
    const seen = new Map<string, number | undefined>();
    for (const npc of npcs) {
      seen.set(npc.entity_id, npc.line_at);
      if (!this.seen.has(npc.entity_id) || npc.line_at === undefined || npc.line_at === this.seen.get(npc.entity_id)) continue;
      const text = npc.line ? this.words(npc.line) : null;
      if (text !== null) this.say(npc.entity_id, text, now);
    }
    this.seen = seen;
  }

  /** One frame at `now` (ms): each line over its NPC's head, or where it last stood; a line past its 4 s goes. */
  step(now: number, headOf: HeadOf): void {
    for (const [id, l] of this.live) {
      if (now >= l.until) {
        l.line.destroy();
        this.live.delete(id);
        continue;
      }
      const head = headOf(id);
      if (head) {
        l.at = head.at;
        l.shown = head.shown;
      }
      if (l.at) this.stage.place(l.line, l.at, l.shown);
    }
  }

  /** Every line taken down: the floor went. The NPCs seen are kept: a new floor's are new entities. */
  clear(): void {
    for (const l of this.live.values()) l.line.destroy();
    this.live.clear();
  }

  /** Forget every line and NPC without touching the lines: the scene has destroyed its objects; the next broadcast is a first. */
  forget(): void {
    this.live.clear();
    this.seen.clear();
  }

  private say(entityId: string, text: string, now: number): void {
    this.live.get(entityId)?.line.destroy();
    this.live.set(entityId, { line: this.stage.say(text), until: now + LINE_MS, shown: true });
  }
}
