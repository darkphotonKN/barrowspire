/**
 * A floor's encounter NPCs on the canvas (FS-4EC7Z §G R29): each pilgrim, captive and cutthroat the
 * broadcast lists, drawn at its server position from its look on the on-demand `encounter` group
 * (`ENCOUNTER_ART`, ADR-0071 Decision 6), and until the group lands as the group's stand-in. The
 * group is asked for the first time a state carries one, whether or not it is in sight; once it is in
 * each body is re-dressed on its own sprite. Each plays the clip its `action` names (a caged captive
 * its `bound` pose) in the facing sent, eased toward its position as a monster is, and carries a plate:
 * its kind's name in the neutral ink, or, hired, the **ally plate**: the name in the ally ink over its
 * health bar (FS-CH21F's bar, shown for allies). None over a corpse.
 *
 * The broadcast is the whole truth: an NPC no longer listed goes (its corpse removed, out of interest,
 * or replaced by a hostile `cutthroat` monster). A living one in reach is E's talk target. Pure, so it
 * is tested without a canvas, as `MerchantSet` is; the scene's stage makes each body with its plate.
 */

import { ENCOUNTER_ART, encounterLook } from "@/render/art/sceneArt";
import { facingFrom, type Facing8 } from "@/render/iso/facing";
import type { Point } from "@/render/iso/projection";
import type { EncounterNPCState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import { INTERACT_RANGE } from "./stairs";

/** What a body draws: a sheet, the variant whose clips it plays, under a multiply tint while it is the stand-in. */
export interface EncounterLook {
  sheet: string;
  variant?: string;
  tint?: number;
}

/** The clips an encounter NPC plays: a character's four, the pilgrim's `cower` and the caged captive's `bound`. */
export type EncounterClip = "idle" | "walk" | "attack" | "death" | "cower" | "bound";

/** What an NPC's plate reads: its name, the ink it is lettered in, and an ally's health (0–1), none for any other. */
export interface EncounterPlate {
  name: string;
  ink: number;
  bar: number | null;
}

/** What E reaches here (R29): an encounter NPC, to talk to. */
export type EncounterTarget = { kind: "encounter_npc"; entityId: string };

/** The scene's side: each body, with its plate, drawn, re-dressed, stood, played and plated. */
export interface EncounterStage<S extends { destroy(): void }> {
  /** A body in `look` at `at`, its plate made with it; destroying it takes the plate too. */
  add(look: EncounterLook, at: Point): S;
  /** The body, on its own sprite, in another look: the group landed. */
  wear(body: S, look: EncounterLook): void;
  /** The body (and its plate) where it is drawn now, sorted as bodies are. */
  stand(body: S, at: Point): void;
  /** The clip it plays, in the 8-way facing; the stage plays it under the look's variant. */
  play(body: S, clip: EncounterClip, facing: Facing8): void;
  /** Its plate, or none (a corpse). */
  plate(body: S, plate: EncounterPlate | null): void;
}

/** The art it is drawn from: whether a sheet (and a clip of it) is in, and the encounters' group fetch. */
export interface EncounterArt {
  has(sheet: string): boolean;
  /** Whether `sheet` carries clip `clip` (its variant's name, `cower_b`); every clip when absent. */
  carries?(sheet: string, clip: string): boolean;
  /** Asks for the encounters' group, once a scene; the scene calls {@link EncounterSet.landed} when it is in. */
  fetch(): void;
}

/** Eased toward the server position each frame, as monsters are. */
const LERP = 0.3;

/** Each kind's name on its plate (CONTEXT.md "Encounter NPC"). */
const NAMES: Readonly<Record<string, string>> = { pilgrim: "Pilgrim", captive: "Captive", cutthroat: "Cutthroat" };

/** A kind's name on its plate; one this client does not know, by its own words. */
export function encounterName(kind: string): string {
  if (Object.hasOwn(NAMES, kind)) return NAMES[kind];
  return kind
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

const isDead = (npc: Pick<EncounterNPCState, "action">) => npc.action === "dead";
const isAlly = (npc: Pick<EncounterNPCState, "stance">) => npc.stance === "ally";

/** What an NPC's plate reads (R29), or none over a corpse. */
export function encounterPlate(npc: EncounterNPCState): EncounterPlate | null {
  if (isDead(npc)) return null;
  const name = encounterName(npc.kind);
  if (!isAlly(npc)) return { name, ink: palette.markerEncounter, bar: null };
  return { name, ink: palette.markerAlly, bar: Math.max(0, Math.min(1, npc.health / Math.max(1, npc.max_health))) };
}

const ACTION_CLIPS: Readonly<Record<string, EncounterClip>> = {
  idle: "idle",
  move: "walk",
  attack: "attack",
  cower: "cower",
  dead: "death",
};

/**
 * The clip an NPC plays: its action's (an action this client does not know plays idle), a caged one's
 * `bound` while it lives; a clip its sheet does not carry (`has`) plays idle.
 */
export function encounterClip(npc: Pick<EncounterNPCState, "action" | "stance">, has: (clip: EncounterClip) => boolean): EncounterClip {
  const named: EncounterClip =
    npc.stance === "caged" && !isDead(npc) ? "bound" : Object.hasOwn(ACTION_CLIPS, npc.action) ? ACTION_CLIPS[npc.action] : "idle";
  return named === "idle" || has(named) ? named : "idle";
}

interface Drawn<S> {
  body: S;
  /** Where it is drawn, eased toward `state.position`. */
  pos: Point;
  look: EncounterLook;
  state: EncounterNPCState;
  facing: Facing8;
  /** What was last handed to the stage, as keys: each is handed again only on a change. */
  played?: string;
  plated?: string;
}

export class EncounterSet<S extends { destroy(): void }> {
  private readonly drawnBy = new Map<string, Drawn<S>>();

  constructor(
    private readonly stage: EncounterStage<S>,
    /** Read at each use: the scene's art and fetch stand only once it has created. */
    private readonly art: () => EncounterArt | undefined,
  ) {}

  /** Make the canvas match the broadcast. */
  sync(state: { encounter_npcs?: EncounterNPCState[] }): void {
    const listed = state.encounter_npcs ?? [];
    const present = new Set(listed.map((n) => n.entity_id));
    for (const [id, d] of this.drawnBy)
      if (!present.has(id)) {
        d.body.destroy();
        this.drawnBy.delete(id);
      }
    this.fetchOwn(listed.filter((n) => !this.drawnBy.has(n.entity_id)));

    for (const wire of listed) {
      const held = this.drawnBy.get(wire.entity_id);
      if (held) {
        held.state = wire;
        continue;
      }
      const look = this.look(wire.look);
      const pos = { x: wire.position.x, y: wire.position.y };
      const body = this.stage.add(look, pos);
      this.drawnBy.set(wire.entity_id, { body, pos, look, state: wire, facing: facingFrom(wire.facing.x, wire.facing.y, "se") });
    }
  }

  /** One frame: each NPC eased toward the server, its clip and plate handed on a change. */
  step(): void {
    for (const d of this.drawnBy.values()) {
      const { pos, state } = d;
      pos.x += (state.position.x - pos.x) * LERP;
      pos.y += (state.position.y - pos.y) * LERP;
      this.stage.stand(d.body, pos);

      d.facing = facingFrom(state.facing.x, state.facing.y, d.facing);
      const clip = encounterClip(state, (c) => this.carries(d.look, c));
      const played = `${clip}|${d.facing}`;
      if (played !== d.played) {
        d.played = played;
        this.stage.play(d.body, clip, d.facing);
      }
      const plate = encounterPlate(state);
      const plated = plate ? `${plate.name}|${plate.ink}|${plate.bar}` : "";
      if (plated !== d.plated) {
        d.plated = plated;
        this.stage.plate(d.body, plate);
      }
    }
  }

  /** The encounters' group is in: every body drawn as the stand-in wears its own look. */
  landed(): void {
    for (const d of this.drawnBy.values()) {
      const look = this.look(d.state.look);
      if (look.sheet === d.look.sheet && look.variant === d.look.variant) continue;
      d.look = look;
      d.played = undefined;
      this.stage.wear(d.body, look);
    }
  }

  /** The nearest living NPC E reaches from `me`, with how far it stands: what E weighs against the other targets in reach. */
  reach(me: Point): { target: EncounterTarget; distance: number } | null {
    let best: { target: EncounterTarget; distance: number } | null = null;
    for (const [entityId, d] of this.drawnBy) {
      if (isDead(d.state)) continue;
      const distance = Math.hypot(me.x - d.pos.x, me.y - d.pos.y);
      if (distance < INTERACT_RANGE && (!best || distance < best.distance)) best = { target: { kind: "encounter_npc", entityId }, distance };
    }
    return best;
  }

  /** Each body, with where it is drawn: what the hide rule and the blackout read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    return [...this.drawnBy.values()].map((d) => ({ sprite: d.body, pos: d.pos }));
  }

  /** One NPC's body and where it is drawn, by its entity id: where its over-head line stands. */
  drawn(entityId: string): { body: S; pos: Point } | undefined {
    const d = this.drawnBy.get(entityId);
    return d && { body: d.body, pos: d.pos };
  }

  /** Destroy every body and forget them. */
  clear(): void {
    for (const d of this.drawnBy.values()) d.body.destroy();
    this.drawnBy.clear();
  }

  /** Forget every NPC without touching its body: the scene has already destroyed its objects. */
  forget(): void {
    this.drawnBy.clear();
  }

  /** A look's own sheet and variant once the group is in, else the stand-in (ADR-0071 Decision 3). */
  private look(wire: string): EncounterLook {
    const own = encounterLook(wire);
    if (own && this.art()?.has(own.sheet)) return { sheet: own.sheet, ...(own.suffix ? { variant: own.suffix.slice(1) } : {}) };
    const { sheet, tint } = ENCOUNTER_ART.standIn;
    return { sheet, ...(tint === undefined ? {} : { tint }) };
  }

  /** Whether a look's sheet carries `clip` under its variant. */
  private carries(look: EncounterLook, clip: EncounterClip): boolean {
    const name = look.variant ? `${clip}_${look.variant}` : clip;
    return this.art()?.carries?.(look.sheet, name) ?? true;
  }

  /** Asks for the group when a newly listed NPC's sheet is not in; the fetch itself is once a scene. */
  private fetchOwn(listed: readonly EncounterNPCState[]): void {
    const art = this.art();
    if (!art) return;
    const missing = listed.some((n) => {
      const own = encounterLook(n.look);
      return own !== undefined && !art.has(own.sheet);
    });
    if (missing) art.fetch();
  }
}
