/**
 * The class books' presentation data (FS-X2CMM §G R37, §H R41; CONTEXT "Class book"): each class's book
 * by its title, its pages in book order, and each page's name, its one line, the Scars' line of where
 * the scar was earned, its target kind, how it recovers in words, and the reticle sizes slice 11 aims
 * with. Only what is presentation: the server sends the book itself (its offered pages, levels, costs
 * and cooldowns, R32), so a retune never needs this file (FS-Q18Q3 R1's rule).
 *
 * The words are the game's (barrow-delve: terse, grim) and stand here alone, so a rewrite, or a later
 * look of the book, never touches the panel or the casting.
 */

import { PAGE_IDS, type PageId } from "@/ui/pageIcons";

/** What a page is aimed at (FS-X2CMM §C R13): the server's own kinds, word for word. */
export type TargetKind = "ground" | "ally" | "interactable" | "self" | "none";

/**
 * One page as the book presents it. `name` is how the panel and its tip name it; a Scar's `scar` names
 * the scar it is, and `earned` says where it was earned (R37). `recovers` is the tip's cooldown words,
 * the wire carrying a cooldown's length only while it runs. `rangeCells` and `reticleCells` are the
 * reticle's (R41): how far from the player it may land, and the radius of the ring it draws, in cells.
 */
export interface PageCopy {
  readonly id: PageId;
  readonly name: string;
  readonly line: string;
  readonly scar?: string;
  readonly earned?: string;
  readonly target: TargetKind;
  /** An ally page that may be cast on oneself (Levitate). */
  readonly allowsSelf?: boolean;
  readonly recovers: string;
  readonly rangeCells?: number;
  readonly reticleCells?: number;
}

/** A body's ring, for a reticle laid under a teammate or an interactable (R41). */
const BODY_RING = 0.6;
/** "Adjacent": within 1.5 cells of the caster's centre (§B). */
const ADJACENT = 1.5;

/** Every page's presentation, by id (FS-X2CMM §B R9–R12). */
export const PAGE_COPY: Readonly<Record<PageId, PageCopy>> = {
  witchlight: {
    id: "witchlight",
    name: "Witchlight",
    line: "A pale flame hung where you point. The dark gives back what it hid.",
    target: "ground",
    recovers: "45 s",
    rangeCells: 8,
    reticleCells: 3,
  },
  far_hand: {
    id: "far_hand",
    name: "Far Hand",
    line: "Work a lever, a latch or a lid from across the room.",
    target: "interactable",
    recovers: "30 s",
    rangeCells: 6,
    reticleCells: BODY_RING,
  },
  levitate: {
    id: "levitate",
    name: "Levitate",
    line: "Lift a companion, or yourself, off the cursed stone. The lifted strike no blow.",
    target: "ally",
    allowsSelf: true,
    recovers: "90 s",
    rangeCells: 6,
    reticleCells: BODY_RING,
  },
  binding_glyph: {
    id: "binding_glyph",
    name: "Binding Glyph",
    line: "A rune cut into the floor. The first three to cross it stand fixed.",
    target: "ground",
    recovers: "60 s",
    rangeCells: 6,
    reticleCells: 0.75,
  },
  recall: {
    id: "recall",
    name: "Recall",
    line: "Drag every living companion on the floor to your side.",
    target: "none",
    recovers: "Once a floor",
  },
  trackers_eye: {
    id: "trackers_eye",
    name: "Tracker's Eye",
    line: "Read the stone as a hunter reads snow.",
    target: "none",
    recovers: "60 s",
  },
  brew: {
    id: "brew",
    name: "Brew",
    line: "A draught set at your feet. Whoever drinks it mends.",
    target: "none",
    recovers: "120 s",
  },
  call_the_hound: {
    id: "call_the_hound",
    name: "Call the Hound",
    line: "A lean grey hound answers, and bites what you would.",
    target: "ground",
    recovers: "180 s",
    rangeCells: 4,
    reticleCells: 0.5,
  },
  pick_the_lock: {
    id: "pick_the_lock",
    name: "Pick the Lock",
    line: "No lock was ever paid enough to hold.",
    target: "interactable",
    recovers: "30 s",
    rangeCells: ADJACENT,
    reticleCells: BODY_RING,
  },
  strike_a_deal: {
    id: "strike_a_deal",
    name: "Strike a Deal",
    line: "Every band down here has a price. Name it.",
    target: "interactable",
    recovers: "900 s",
    rangeCells: 4,
    reticleCells: BODY_RING,
  },
  take_a_contract: {
    id: "take_a_contract",
    name: "Take a Contract",
    line: "A name marked on this floor. Bring it down and be paid in blood.",
    target: "none",
    recovers: "Once a delve",
  },
  heave: {
    id: "heave",
    name: "Heave",
    scar: "Scar of the Gate",
    earned: "Got under the portcullis at Harrow Gate, and held it while the rest crawled out.",
    line: "Shoulder a jammed gate or a fallen block aside.",
    target: "interactable",
    recovers: "20 s",
    rangeCells: ADJACENT,
    reticleCells: BODY_RING,
  },
  hardened: {
    id: "hardened",
    name: "Hardened",
    scar: "Scar of the Pit",
    earned: "Got in the stake pit under Low Cairn. The stakes broke first.",
    line: "Hide like boiled leather. The barrow's snares bite less.",
    target: "self",
    recovers: "90 s",
  },
  long_night: {
    id: "long_night",
    name: "Last Stand",
    scar: "Scar of the Long Night",
    earned: "Got alone on the stair the night the cairn fell, until a dawn no one else saw.",
    line: "Every horror near turns on you, and its blows land lighter.",
    target: "self",
    recovers: "120 s",
  },
};

/** The classes that keep a book, as the server names them. */
export type BookClass = "mage" | "archer" | "mercenary" | "warrior";

/** A class's book: its title (R37), its pages in book order, and the line an empty book reads. */
export interface ClassBook {
  readonly title: string;
  readonly pages: readonly PageId[];
  readonly empty: string;
}

/** The four books (FS-X2CMM §B; the owner's names). */
export const CLASS_BOOKS: Readonly<Record<BookClass, ClassBook>> = {
  mage: {
    title: "Spellbook",
    pages: ["witchlight", "far_hand", "levitate", "binding_glyph", "recall"],
    empty: "The Spellbook is not yet written.",
  },
  archer: {
    title: "Hunter's Journal",
    pages: ["trackers_eye", "brew", "call_the_hound"],
    empty: "The Hunter's Journal is not yet written.",
  },
  mercenary: {
    title: "The Ledger",
    pages: ["pick_the_lock", "strike_a_deal", "take_a_contract"],
    // the mercenary's book in wave 1: every page waits on the Spire (Edge States)
    empty: "The Ledger is not yet written.",
  },
  warrior: {
    title: "Scars",
    pages: ["heave", "hardened", "long_night"],
    empty: "No scar is yet written.",
  },
};

/** A book for a class the client does not know: titled plainly, with nothing in it. */
export const UNKNOWN_BOOK: ClassBook = { title: "Book", pages: [], empty: "This book is not yet written." };

/** The book of `className`, as the server names classes, any case; a class the client does not know gets `UNKNOWN_BOOK`. */
export function classBookOf(className: string | undefined): ClassBook {
  const key = (className ?? "").toLowerCase();
  return Object.hasOwn(CLASS_BOOKS, key) ? CLASS_BOOKS[key as BookClass] : UNKNOWN_BOOK;
}

/** Whether `id` is a page the client draws: the server may send one a later client knows. */
export function isPageId(id: string): id is PageId {
  return (PAGE_IDS as readonly string[]).includes(id);
}
