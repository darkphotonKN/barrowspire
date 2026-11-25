/**
 * The town's music by where the player stands (FS-28DDG § Change: The chapel's and the Inn's
 * music): the village track on the street and in every other house, the chapel's in the chapel,
 * the Inn's in the Inn. One {@link WorldMusic} per track, each with its own fades; stepping through
 * a door fades the one out and the other in over each other (M2). Phaser-free: HubScene says which
 * place, and the stages are its own.
 */

import type { SceneEnd } from "@/scenes/sceneEnd";
import { MUSIC_MAX_GAIN, type MusicSettingStore } from "./musicSetting";
import { VILLAGE_TRACK, WorldMusic, type MusicStage, type MusicTrack } from "./worldMusic";

/** Where in the town the player stands, as the music hears it (M1). */
export type TownPlace = "street" | "chapel" | "inn";

const PLACES: readonly TownPlace[] = ["street", "chapel", "inn"];

/**
 * The chapel's: an organ, a chant of low men's voices with organum above it, and a tolling bell,
 * composed in code (`tools/music/compose.mjs`). m4a alone: this machine encodes no Ogg (M5). Mastered
 * to about -15 dBFS RMS against the village's -13, so the village's cap holds for it (M4).
 */
export const CHAPEL_TRACK: MusicTrack = {
  key: "music:chapel",
  urls: ["/audio/music/chapel.m4a"],
  maxGain: MUSIC_MAX_GAIN,
};

/**
 * The Inn's: a grave dance in 6/8 on hurdy-gurdy drone, lute, bodhran, fiddle and recorder, composed
 * in code (`tools/music/compose.mjs`). m4a alone (M5). About -14 dBFS RMS, under the village's cap (M4).
 */
export const INN_TRACK: MusicTrack = {
  key: "music:inn",
  urls: ["/audio/music/inn.m4a"],
  maxGain: MUSIC_MAX_GAIN,
};

/** Which track each place plays (M1). */
export const TOWN_TRACKS: Readonly<Record<TownPlace, MusicTrack>> = {
  street: VILLAGE_TRACK,
  chapel: CHAPEL_TRACK,
  inn: INN_TRACK,
};

/**
 * The town's three tracks, entered and left with the hub, the playing one changed as the player
 * walks between places. The Options panel's level reaches the playing one; the others read it again
 * as they are next entered (§ Change: Music volume in an Options panel, C15).
 */
export class TownMusic {
  private place: TownPlace = "street";

  constructor(private readonly tracks: Readonly<Record<TownPlace, WorldMusic>>) {}

  /** The level, as the Options panel's Music row reads it. */
  level(): number {
    return this.tracks[this.place].level();
  }

  /** The hub was entered with the player at `place`: its track rises, the others wait silent (M3). */
  enter(place: TownPlace): void {
    this.place = place;
    for (const p of PLACES) {
      if (p === place) this.tracks[p].enter();
      else this.tracks[p].wait();
    }
  }

  /** The player stands at `place` this frame: a new place fades the old track out and its own in (M2). */
  moveTo(place: TownPlace): void {
    if (place === this.place) return;
    this.tracks[this.place].quiet();
    this.place = place;
    this.tracks[place].enter();
  }

  /** The Options panel's Music row, on the playing track (M6). */
  setLevel(level: number): void {
    this.tracks[this.place].setLevel(level);
  }

  /** The hub was left: every track falls away and is freed, or is let go with a destroyed game (R3, R13, R21). */
  leave(end: SceneEnd): void {
    for (const p of PLACES) this.tracks[p].leave(end);
  }
}

/** The town's music on `stageOf`'s stages, one per track, sharing the level's store. */
export function townMusic(stageOf: (track: MusicTrack) => MusicStage, store: MusicSettingStore): TownMusic {
  const music = (place: TownPlace) => new WorldMusic(stageOf(TOWN_TRACKS[place]), store);
  return new TownMusic({ street: music("street"), chapel: music("chapel"), inn: music("inn") });
}
