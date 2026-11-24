/**
 * The armed page (FS-X2CMM §H R40–R41; CONTEXT "Armed page"): a ready page clicked in the class book
 * waits for its target here, in the run. A page of kind `ground`, `ally` or `interactable` arms; one of
 * kind `none` or `self` is never armed, its press is its cast. While armed, the reticle stands at the
 * pointer (`ground`: the page's effect size, faint beyond its range or off the walkable floor) or under the
 * body nearest the pointer within a body's reach (`ally`, `interactable`: faint with none, or one beyond
 * range). A click on a valid target hands that target back and disarms; on none it does nothing and
 * the page stays armed.
 *
 * Pure and Phaser-free, beside the Arrow Rain aim (`arrowRainAim.ts`), so the rules are tested without a
 * canvas: the combat owns the send, the scene the pointer and the drawing. All of it is presentation
 * (R44, ADR-0030): the server never learns a page was armed, and judges the cast it is sent on its own.
 */

import type { Point } from "@/render/iso";
import { PAGE_COPY } from "@/data/classBooks";
import type { PageId } from "@/ui/pageIcons";

/** A body's reach of the pointer, in cells: how near it a teammate (or interactable) is picked (R41). */
export const ALLY_REACH_CELLS = 1;

/** The kinds of page that arm (R40). */
export type ArmedKind = "ground" | "ally" | "interactable";

/** A body a reticle may stand under: its id as the cast names it, and where it is drawn, world px. */
export interface AimBody {
  readonly id: string;
  readonly at: Point;
  /** The player themself: picked only by a page that allows self (Levitate). */
  readonly self?: boolean;
}

/** What the run tells the aim each frame and on a click, all in world px. */
export interface AimScene {
  /** Where the player stands: the range is judged from here (§C R14). */
  readonly from: Point;
  /** The world point under the pointer. */
  readonly cursor: Point;
  /** The floor's cell edge: a page's range and ring are in cells. */
  readonly cell: number;
  /** The living, un-escaped delvers of the run, the player among them (`self`). */
  readonly allies: readonly AimBody[];
  /** The interactables an interactable page may name; none, none can be (wave 2, §K). */
  readonly interactables?: readonly AimBody[];
  /** Whether a world point is on the walkable floor; none, every point is. */
  readonly walkable?: (p: Point) => boolean;
}

/** The reticle as it stands: what the run draws, and on a valid click the target it sends. */
export interface Reticle {
  readonly page: PageId;
  readonly kind: ArmedKind;
  /** The ring's centre, world px: the pointer, or the body it snapped under. */
  readonly at: Point;
  /** The ring's radius, world px. */
  readonly radius: number;
  /** A click here casts (drawn plain); otherwise it is faint and a click does nothing. */
  readonly valid: boolean;
  /** The body it stands under, for an ally or interactable page. */
  readonly targetId?: string;
}

/** What a press on a page did: armed it, or asked for its cast at once. */
export type PagePress = "armed" | "cast";

const armedKind = (page: PageId): ArmedKind | null => {
  const kind = PAGE_COPY[page].target;
  return kind === "none" || kind === "self" ? null : kind;
};

/** Whether a press on `page` arms it (ground, ally, interactable) rather than casting it at once (R40). */
export const pageArms = (page: PageId): boolean => armedKind(page) !== null;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The reticle of the page `page` in `scene` (R41). `page` must be one that arms. */
export function pageReticle(page: PageId, scene: AimScene): Reticle {
  const copy = PAGE_COPY[page];
  const kind = armedKind(page) ?? "ground";
  const range = (copy.rangeCells ?? 0) * scene.cell;
  const radius = (copy.reticleCells ?? 0) * scene.cell;
  if (kind === "ground") {
    const at = { x: scene.cursor.x, y: scene.cursor.y };
    const valid = distance(scene.from, at) <= range && (scene.walkable?.(at) ?? true);
    return { page, kind, at, radius, valid };
  }
  const bodies = kind === "ally" ? scene.allies.filter((b) => !b.self || copy.allowsSelf) : (scene.interactables ?? []);
  const reach = ALLY_REACH_CELLS * scene.cell;
  let nearest: AimBody | undefined;
  for (const body of bodies) {
    const d = distance(body.at, scene.cursor);
    if (d <= reach && (!nearest || d < distance(nearest.at, scene.cursor))) nearest = body;
  }
  if (!nearest) return { page, kind, at: { x: scene.cursor.x, y: scene.cursor.y }, radius, valid: false };
  const at = { x: nearest.at.x, y: nearest.at.y };
  return { page, kind, at, radius, valid: !!nearest.self || distance(scene.from, at) <= range, targetId: nearest.id };
}

export class PageAim {
  private page: PageId | null = null;

  /** The page armed now; none, none is. */
  get armed(): PageId | null {
    return this.page;
  }

  /** A ready page pressed (R40): one that arms replaces any armed; a none or self page disarms and casts. */
  press(page: PageId): PagePress {
    if (armedKind(page) === null) {
      this.page = null;
      return "cast";
    }
    this.page = page;
    return "armed";
  }

  /** The armed page's reticle in `scene`; none while nothing is armed. */
  reticle(scene: AimScene): Reticle | null {
    return this.page === null ? null : pageReticle(this.page, scene);
  }

  /** A left-click (R41): the target when valid, disarming; none, with the page kept armed, otherwise. */
  click(scene: AimScene): Reticle | null {
    const reticle = this.reticle(scene);
    if (!reticle?.valid) return null;
    this.page = null;
    return reticle;
  }

  /** Right-click, Esc, a window, death, a floor change (R41): whether a page was armed. */
  disarm(): boolean {
    const was = this.page !== null;
    this.page = null;
    return was;
  }
}
