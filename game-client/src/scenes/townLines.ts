/**
 * What the town folk say (FS-B0H2D R27; FS-R4MYX R34): the Inn's keeper and patrons, the smith,
 * the chapel's Confessor and worshippers and the graveyard's mourners, each a short
 * telling the Elder's way (*Go on* turns the page, *Farewell* ends it, the last offers only
 * *Farewell*; every telling starts at the first). Keyed by the exact name the server gives the
 * fixed resident (hub_map.go hubFixedResidents). This is the one place their words live, so the
 * owner can change them here and nowhere else.
 */
export interface TownLines {
  /** Who they are, under their name on the card. Patrons have none. */
  role?: string;
  /** The passages, in the order they are told. */
  passages: readonly string[];
}

export const TOWN_LINES: Readonly<Record<string, TownLines>> = {
  Alewife: {
    role: "Keeper of the Inn",
    passages: [
      "Come in off the road. The fire's the one thing\nin this town that keeps its word.",
      "Since the Spire rose I pour for two kinds:\nthose bound for its door, and the few who came back.",
      "West, the Forest has turned. What lay buried there\nwalks the trail now, and some nights something paler.",
      "East, the Meadows are kinder. Rest here first.\nThe barrow is patient. It will keep.",
    ],
  },
  Smith: {
    role: "Keeper of the forge",
    passages: [
      "Steel I can work. What comes down out of the Spire\nwon't take my hammer, so don't ask.",
      "The forge stays lit. Someone always comes back\nwith a notched blade and a story.",
      "Mind the Forest damp. Iron rusts there overnight.",
    ],
  },
  Gravedigger: {
    passages: [
      "Forty years I dug on the barrow field.\nNot one of them stayed down once the tower came.",
      "The dead in the Forest are mine.\nI buried them proper. Tell them that.",
      "I drink here now. Nobody needs a grave dug twice.",
    ],
  },
  Drover: {
    passages: [
      "Brought the herd up from the Meadows.\nLost two to the boars, none to anything worse.",
      "That counts as a good season, now.",
    ],
  },
  Pilgrim: {
    passages: [
      "Walked three weeks to see it. Thought it'd be taller.",
      "They say the Lich Lord waits at the top.\nNo one who has seen him has said so.",
    ],
  },
  // the chapel (FS-R4MYX R34): the Confessor ties the Alewife's four, never passes it
  Confessor: {
    role: "Keeper of the chapel",
    passages: [
      "Shut the door behind you. The dead hear better\nthan the living, and they talk more.",
      "The bell hasn't rung since the tower rose.\nThe Bellringer climbs up each morning to look at it.",
      "Half the town comes in here to ask after someone\nwho went up the Spire. I tell them what I know. Nothing.",
      "Kneel if you like. I can't promise you'll be heard.\nI can promise you won't be the first.",
    ],
  },
  Penitent: {
    passages: ["Forty days on my knees. The Spire's still standing.", "So. Forty more."],
  },
  Chandler: {
    passages: [
      "I make the candles. He burns two.\nThe rest go out to the graves.",
      "Wax doesn't last a night out there. Something eats it.",
    ],
  },
  Goodwife: {
    passages: ["My son was among the first to climb it.\nI pray for him every morning.", "I don't say which way."],
  },
  Ploughman: {
    passages: ["Field's gone to thistle. Nobody turns earth\nwith the barrow open under it."],
  },
  // the graveyard's mourners
  Keener: {
    passages: [
      "Fresh earth, and no stone yet.\nThe Gravedigger swore he was done with digging.",
      "Some nights the ground here is turned over,\nand nobody holds a spade.",
    ],
  },
  Widower: {
    passages: [
      "Fresh flowers every morning. I don't bring them.",
      "She was buried a week before the Spire rose.\nI come to make sure she's still here.",
    ],
  },
  Veteran: {
    passages: ["My sergeant. These went brown a month back.\nHe won't mind. He's seen worse."],
  },
};

/** A town resident's lines by their exact name; undefined for anyone else, who keeps a resident's line. */
export function townLines(name: string): TownLines | undefined {
  return Object.hasOwn(TOWN_LINES, name) ? TOWN_LINES[name] : undefined;
}
