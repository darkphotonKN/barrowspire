/**
 * The class book as its panel draws it (FS-X2CMM §G R37, R38): the owner's book from their own state,
 * titled by class, the pages the server sent in the order it sent them (a page it has not sent is not
 * drawn, §K), each in its state from the wire and with its hover tip. Pure: the panel
 * (`ClassBookPanel.ts`) draws it, the slot (`uiSceneBook.ts`) feeds it.
 *
 * The wire decides everything that is not presentation (R32): the unlock level, the cost, the cooldown
 * and the spent use. The client's own data (`src/data/classBooks.ts`) adds only the names, the lines and
 * the target kinds.
 */

import { PAGE_COPY, classBookOf, isPageId, type PageCopy } from "@/data/classBooks";
import type { BookPageState, BookState, CooldownState, ResourceKind, ResourceState } from "@/types/gameState";
import type { PageId } from "./pageIcons";
import type { PageState } from "./pageRoundel";

/** What the book reads of the owner's state: their class, level, class resource and book. */
export interface BookSource {
  class: string;
  level?: number;
  resource?: ResourceState;
  book?: BookState;
}

/** A tip line's part: the page's name, its scar's name, its one line, where it was earned, its cost or cooldown, why it waits. */
export type BookTipTone = "name" | "scar" | "line" | "earned" | "cost" | "why";

export interface BookTipLine {
  readonly text: string;
  readonly tone: BookTipTone;
}

/** One page as the panel draws it. */
export interface PageView {
  readonly id: PageId;
  readonly copy: PageCopy;
  /** Its roundel's state (ADR-0094); a spent page is drawn `dim`, with its caption (R38). */
  readonly state: PageState;
  /** A once-per-floor or once-per-delve use is spent (R32). */
  readonly spent: boolean;
  /** Under the roundel: "Lv N" while locked, "spent" while spent (R38). */
  readonly caption?: string;
  /** The running cooldown, for the sweep, while recovering. */
  readonly cooldown?: CooldownState;
  readonly tip: readonly BookTipLine[];
}

export interface BookView {
  readonly title: string;
  readonly pages: readonly PageView[];
  /** The line an empty book reads (Edge States: the mercenary's in wave 1); none while it holds a page. */
  readonly empty?: string;
}

/** A resource's name in a cost, by its kind. */
const RESOURCE_WORD: Readonly<Record<ResourceKind, string>> = {
  mana: "mana",
  stamina: "stamina",
  parry_charges: "parry charges",
};

/** The owner's book from their state; an absent book (an older server) is an empty one. */
export function bookView(source: BookSource | undefined): BookView {
  const book = classBookOf(source?.class);
  const pages = (source?.book?.pages ?? []).flatMap((wire) => (isPageId(wire.id) ? [pageView(wire.id, wire, source)] : []));
  return { title: book.title, pages, empty: pages.length === 0 ? book.empty : undefined };
}

function pageView(id: PageId, wire: BookPageState, source: BookSource | undefined): PageView {
  const copy = PAGE_COPY[id];
  const level = source?.level ?? 1;
  const resource = source?.resource;
  const running = wire.cooldown.remaining > 0;
  const short = !!resource && wire.cost > 0 && resource.current < wire.cost;
  const word = resource ? RESOURCE_WORD[resource.kind] ?? "" : "";
  const locked = level < wire.unlock_level;
  const state: PageState = locked ? "locked" : wire.spent ? "dim" : running ? "recovering" : short ? "dim" : "ready";
  const why = locked
    ? `Unlocks at level ${wire.unlock_level}`
    : wire.spent
      ? spentWords(copy)
      : running
        ? `Recovers in ${Math.ceil(wire.cooldown.remaining)} s`
        : short
          ? `Not enough ${word}`.trim()
          : undefined;
  const tip: BookTipLine[] = [
    { text: copy.name, tone: "name" },
    ...(copy.scar ? [{ text: copy.scar, tone: "scar" as const }] : []),
    { text: copy.line, tone: "line" },
    ...(copy.earned ? [{ text: copy.earned, tone: "earned" as const }] : []),
    { text: wire.cost > 0 ? `Cost: ${wire.cost} ${word}`.trim() : "No cost", tone: "cost" },
    { text: `Cooldown: ${copy.recovers}`, tone: "cost" },
    ...(why ? [{ text: why, tone: "why" as const }] : []),
  ];
  return {
    id,
    copy,
    state,
    spent: !locked && wire.spent,
    caption: locked ? `Lv ${wire.unlock_level}` : wire.spent ? "spent" : undefined,
    cooldown: state === "recovering" ? wire.cooldown : undefined,
    tip,
  };
}

/** A spent page's why: until the floor turns, or for the rest of the delve. */
function spentWords(copy: PageCopy): string {
  return /floor/i.test(copy.recovers) ? "Spent until the next floor" : "Spent for this delve";
}

/**
 * What the panel draws, as a key: a tick that changes no page's state, caption or tip draws nothing
 * again. A running cooldown's seconds are left out (the sweep runs every frame on its own, R38), and so
 * is the tip's count of them, which is read again as a page is hovered.
 */
export function bookKey(view: BookView): string {
  return JSON.stringify([view.title, view.empty ?? "", view.pages.map((p) => [p.id, p.state, p.caption ?? ""])]);
}
