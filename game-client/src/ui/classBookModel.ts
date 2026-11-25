/**
 * The class book as its panel draws it (FS-X2CMM §G R37, R38; the open tome, §Change: Illuminated pages
 * and the open tome C4, C5): the owner's book from their own state, titled by class, the pages the server
 * sent in the client's book order whatever order they arrive in (a page it has not sent is not drawn, §K),
 * each in its state from the wire, with its row's mark and its right page's words. Pure: the panel
 * (`ClassBookPanel.ts`) draws it, the slot (`uiSceneBook.ts`) feeds it.
 *
 * The wire decides everything that is not presentation (R32): the unlock level, the cost, the cooldown,
 * its length or limit, and the spent use. The client's own data (`src/data/classBooks.ts`) adds only the
 * names, the lines, the target kinds and the book order.
 */

import { PAGE_COPY, classBookOf, isPageId, type PageCopy, type TargetKind } from "@/data/classBooks";
import type { BookPageState, BookState, CooldownState, ResourceKind, ResourceState } from "@/types/gameState";
import { PAGE_IDS, type PageId } from "./pageIcons";
import type { PageState } from "./pageRoundel";

/** What the book reads of the owner's state: their class, level, class resource and book. */
export interface BookSource {
  class: string;
  level?: number;
  resource?: ResourceState;
  book?: BookState;
}

/**
 * The right page's words for one page (§Change: Illuminated pages and the open tome, C5): its name, a
 * Scar's scar and where it was earned, its one line, "cost · cast time · cooldown" from the wire, and the hint: how
 * to cast it, or why it waits.
 */
export interface PageLeaf {
  readonly name: string;
  readonly scar?: string;
  readonly line: string;
  readonly earned?: string;
  readonly terms: string;
  readonly hint: string;
}

/** One page as the panel draws it. */
export interface PageView {
  readonly id: PageId;
  readonly copy: PageCopy;
  /** Its roundel's state (ADR-0094); a spent page is drawn `dim`, with its mark (R38). */
  readonly state: PageState;
  /** A once-per-floor or once-per-delve use is spent (R32). */
  readonly spent: boolean;
  /** Its row's right-aligned word (C4): its cost, "Lv N" while locked, "spent" while spent. */
  readonly mark: string;
  /** Locked: its row stands faint (C4). */
  readonly faint: boolean;
  /** The running cooldown, for the sweep, while recovering. */
  readonly cooldown?: CooldownState;
  /** The right page, as it reads while this page is shown (C5). */
  readonly leaf: PageLeaf;
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

/** A ready page's hint by what it is aimed at (C5): an aimed page arms, the rest cast at once. */
const AIM_WORDS: Readonly<Record<TargetKind, string>> = {
  ground: "the ground",
  ally: "an ally",
  interactable: "what it works on",
  self: "",
  none: "",
};

/** The owner's book from their state, in book order; an absent book (an older server) is an empty one. */
export function bookView(source: BookSource | undefined): BookView {
  const book = classBookOf(source?.class);
  const pages = (source?.book?.pages ?? [])
    .flatMap((wire) => (isPageId(wire.id) ? [pageView(wire.id, wire, source)] : []))
    .sort((a, b) => PAGE_IDS.indexOf(a.id) - PAGE_IDS.indexOf(b.id));
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
  const cost = wire.cost > 0 ? `${wire.cost} ${word}`.trim() : "no cost";
  const hint = locked
    ? `Learned at level ${wire.unlock_level}.`
    : wire.spent
      ? spentWords(wire)
      : running
        ? "Recovering."
        : short
          ? `Not enough ${word || "to pay"}.`
          : readyHint(copy);
  return {
    id,
    copy,
    state,
    spent: !locked && wire.spent,
    mark: locked ? `Lv ${wire.unlock_level}` : wire.spent ? "spent" : cost,
    faint: locked,
    cooldown: state === "recovering" ? wire.cooldown : undefined,
    leaf: {
      name: copy.name,
      scar: copy.scar,
      line: copy.line,
      earned: copy.earned,
      terms: `${capitalised(cost)} · ${castWords(wire)} · ${cooldownWords(wire)}`,
      hint,
    },
  };
}

/** How a ready page is cast (C5): armed and aimed by its target kind, or cast at once. */
function readyHint(copy: PageCopy): string {
  const aim = AIM_WORDS[copy.target];
  if (!aim) return "Click to cast.";
  return `Click to arm, then pick ${copy.allowsSelf ? `${aim} or yourself` : aim}.`;
}

/** A page's cast time in the right page's words, from the wire: its seconds, or "instant" (C5). */
function castWords(wire: BookPageState): string {
  return wire.cast_time > 0 ? `${wire.cast_time} s cast` : "instant";
}

/** A page's cooldown in the right page's words, from the wire: its seconds, or its limit ("once a floor"). */
function cooldownWords(wire: BookPageState): string {
  if (wire.limit === "floor") return "once a floor";
  if (wire.limit === "delve") return "once a delve";
  return wire.cooldown_length > 0 ? `${wire.cooldown_length} s cooldown` : "no cooldown";
}

/** A spent page's why: until the floor turns, or for the rest of the delve. */
function spentWords(wire: BookPageState): string {
  return wire.limit === "floor" ? "Spent until the next floor." : "Spent for this delve.";
}

const capitalised = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * The page the right page shows (C5): the one under the pointer; with none, the first ready page; with
 * every page locked, the first (Edge States: it says the level it is learned at); else none (-1), a
 * blank page.
 */
export function shownPage(view: BookView, hovered: number): number {
  if (hovered >= 0 && hovered < view.pages.length) return hovered;
  const ready = view.pages.findIndex((p) => p.state === "ready");
  if (ready >= 0) return ready;
  return view.pages.length > 0 && view.pages.every((p) => p.state === "locked") ? 0 : -1;
}

/**
 * What the panel builds, as a key (C7): its title, its empty line and its pages' ids. Only a change of
 * these builds the panel and its roundels again; any other change is drawn in place.
 */
export function bookShape(view: BookView): string {
  return JSON.stringify([view.title, view.empty ?? "", view.pages.map((p) => p.id)]);
}

/**
 * What the panel draws, as a key (C7): a tick that changes no page's state, mark or words draws
 * nothing again. A running cooldown's seconds are left out: the sweep runs every frame on its own (R38).
 */
export function bookKey(view: BookView): string {
  return JSON.stringify([bookShape(view), view.pages.map((p) => [p.state, p.mark, p.leaf])]);
}
