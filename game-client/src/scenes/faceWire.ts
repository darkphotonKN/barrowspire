/**
 * A player's facing on the game WebSocket (FS-JS7C8 §E): the own facing goes up as `face`, and
 * another player's comes down on their state entry. Presentation only: no rule reads it (R25, R35).
 *
 *   private readonly faceSender = new FaceSender((facing) => socketManager.sendMessage("face", { facing }));
 *   ...
 *   this.faceSender.update(me.entity_id, look ?? anim.facing, holding || dead, time);   // each frame
 *   ...
 *   otherAnim.face(wireFacing(entry));                                                 // each frame, before step
 */

import type { Facing8 } from "@/render/iso";

/** The least time between two `face` sends (R28): at most ten a second, the last always sent. */
export const FACE_GAP_MS = 100;

const FACINGS: ReadonlySet<string> = new Set<Facing8>(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

/**
 * Another player's facing as their state entry carries it (R32, R34): one of the 8 names, or none
 * until they have sent one in this world (or from a server that sends none).
 */
export function wireFacing(entry: { facing?: unknown }): Facing8 | undefined {
  const { facing } = entry;
  return typeof facing === "string" && FACINGS.has(facing) ? (facing as Facing8) : undefined;
}

/**
 * The own facing, sent up (R28, R29): a body's first facing at once, then only a change, at most
 * once per {@link FACE_GAP_MS}, a change inside the gap sent at its end as whatever the facing
 * is by then. Frame-driven: the gap's end is the first update after it.
 */
export class FaceSender {
  private body?: string;
  private sent?: Facing8;
  private sentAt = -Infinity;

  constructor(private readonly send: (facing: Facing8) => void) {}

  /**
   * Each frame the own body stands. `body` is its entity id: a new one (a world switch, a
   * reconnect, a handoff) has no facing on the server, so its first is sent whatever went before.
   * `facing` is the one it is drawn turned to. `quiet` sends nothing while it is up: a Shadow Shot
   * hold (ADR-0030: the server never learns where the archer turned while aiming) or a dead body;
   * the first change after it is sent as usual.
   */
  update(body: string, facing: Facing8, quiet: boolean, now: number): void {
    if (body !== this.body) {
      this.body = body;
      this.sent = undefined;
      this.sentAt = -Infinity;
    }
    if (quiet || facing === this.sent || now - this.sentAt < FACE_GAP_MS) return;
    this.sent = facing;
    this.sentAt = now;
    this.send(facing);
  }
}
