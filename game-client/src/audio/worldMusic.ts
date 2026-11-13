/**
 * The worlds' music (FS-28DDG): each world's track looping under it, fading in on entering it and
 * out on leaving it, one sound per track per game, freed once its world is left. The town plays the
 * village track, the run the tower's on every floor, and a field none (§ Change: The tower's music
 * on every floor of a run, W1).
 *
 * The decisions are {@link WorldMusic}'s and Phaser-free; {@link sceneMusicStage} is the game they
 * act on. Each world scene holds its own for its track (W2). The fades step on the game's own step,
 * never on a scene's tweens or clock: the world switch stops one world before the next starts, and
 * a scene's clock stops with it (R3).
 */

import type { WorldType } from "@/assets/types/client";
import type { SceneEnd } from "@/scenes/sceneEnd";
import {
  clampMusicLevel,
  musicGain,
  readMusicLevel,
  rememberMusicLevel,
  type MusicSettingStore,
} from "./musicSetting";

/** A world's track (W1). */
export interface MusicTrack {
  /** Its key in the audio cache. */
  key: string;
  /** Its URLs, in the order Phaser tries them: the first the device can play is loaded. */
  urls: string[];
  /** Its own factor on the shared level's gain, so one constant balances a file's loudness (W5). */
  trim: number;
}

/** The town's: the owner's mp3 alone (R6). */
export const VILLAGE_TRACK: MusicTrack = {
  key: "music:village",
  urls: ["/audio/music/village.mp3"],
  trim: 1,
};

/**
 * The tower's, on every floor of a run: m4a first, then the owner's ogg, as the effects load
 * (W8; FS-WDM0X S21). Trim 1.0 until the owner's listening check sets it: the file is about 14 dB
 * quieter than the village's (§ Change Facts).
 */
export const TOWER_TRACK: MusicTrack = {
  key: "music:tower",
  urls: ["/audio/music/tower.m4a", "/audio/music/tower.ogg"],
  trim: 1,
};

/** Which track each world plays; a field plays none (W1). */
const WORLD_TRACKS = {
  hub: VILLAGE_TRACK,
  run: TOWER_TRACK,
} satisfies Partial<Record<WorldType, MusicTrack>>;

/** The worlds that play music. */
export type MusicWorld = keyof typeof WORLD_TRACKS;

/** The track `world` plays: each world scene picks its own here (W1, W2). */
export function worldTrack(world: MusicWorld): MusicTrack {
  return WORLD_TRACKS[world];
}

/** A Phaser scene's loader, as far as the music reaches it. */
export interface MusicLoader {
  load: { audio(key: string, urls: string[]): unknown };
}

/** Queues `track` in the scene's preload, so its torch bar counts it; skipped while still cached (R12, W9). */
export function preloadMusic(scene: MusicLoader, track: MusicTrack): void {
  scene.load.audio(track.key, track.urls);
}

/** Silence to the level's gain on entering the world, or on a change from level 0 (R2; § Change C12). */
export const MUSIC_FADE_IN_MS = 2000;
/** Down to silence on leaving it, or on a change to level 0 (R3; § Change C12). */
export const MUSIC_FADE_OUT_MS = 1000;
/** From one audible level's gain to another's (§ Change: Music volume in an Options panel, C10). */
export const MUSIC_LEVEL_RAMP_MS = 200;

/** The music's sound, as far as the module plays it. */
export interface MusicSound {
  volume: number;
  play(): boolean;
  stop(): boolean;
  destroy(): void;
}

/** What the module asks of the game. */
export interface MusicStage {
  /** The track is decoded and in the audio cache: none is added otherwise (R14). */
  cached(): boolean;
  /** The sound, added looping at silence (R7). */
  add(): MusicSound;
  /** The decoded track out of the audio cache (R13). */
  uncache(): void;
  /** The music can be heard: the audio context runs (R10). */
  audible(): boolean;
  /** The track's world runs or is loading again, so the music is kept for it (R13, W2). */
  worldBusy(): boolean;
  /** `tick` on each step of the game, which outlives the world's stop, until the returned stop. */
  onStep(tick: (delta: number) => void): () => void;
}

interface Ramp {
  /** A fade-in from silence or level 0, a fade-out to silence, or a ramp between audible levels. */
  kind: "in" | "out" | "level";
  from: number;
  to: number;
  ms: number;
  elapsed: number;
  /** A fade-in waits for the context to run: before that the music cannot be heard (R2, R10). */
  heard: boolean;
}

/**
 * One track's music in one game: its world's scene says the world was entered or left, the Options
 * panel's Music row sets its level, and the rest is this (R20; § Change C13; W1, W6).
 */
export class WorldMusic {
  private sound?: MusicSound;
  /** The level, 0 to 5, as this browser keeps it: read on each entry, set from the Options panel (C15). */
  private current = 0;
  /** Whether the sound plays: a fade-out's end stops it, a stopped one may still be kept (R13). */
  private playing = false;
  /** The volume last given the sound, the module's own: a fade starts from it (R3, R4). */
  private volume = 0;
  private ramp?: Ramp;
  private stopStepping?: () => void;

  /** `trim` is the track's own (W5); the level and its store are shared by every world. */
  constructor(
    private readonly stage: MusicStage,
    private readonly store: MusicSettingStore,
    private readonly trim: number = 1,
  ) {}

  /** The level, as the Options panel's Music row reads it (C5). */
  level(): number {
    return this.current;
  }

  /**
   * The world was entered (its create). The level is read again, so a change made in another world
   * or another tab holds from the next entry; at 0 the music is not started, only added so leaving
   * frees it (R13; § Change C12).
   */
  enter(): void {
    this.current = readMusicLevel(this.store);
    if (this.current > 0) this.rise();
    else this.hold();
  }

  /**
   * The Options panel's Music row (C10–C12), the level kept (C15). To 0 the music fades out and is
   * left stopped; from 0 it starts and fades in, a fade-out in flight turned round where it stands;
   * between audible levels it ramps briefly, or a fade-in heads for the new gain in the time it has
   * left, never less than the level ramp.
   */
  setLevel(level: number): void {
    const next = clampMusicLevel(level);
    if (next === this.current) return;
    const was = this.current;
    this.current = next;
    rememberMusicLevel(this.store, next);
    if (next === 0) this.fall();
    else if (was === 0) this.rise();
    else this.retune();
  }

  /** The world was left (its scene end). */
  leave(end: SceneEnd): void {
    if (end === "destroy") return this.letGo();
    this.fall();
  }

  /**
   * Up to the level's gain over the fade-in, once it can be heard (R2, R10): the same sound taken
   * back up if it is fading out (R4), or started from the top if it has stopped (R5).
   */
  private rise(): void {
    this.hold();
    if (!this.sound) return;
    if (!this.playing) {
      // Phaser's stop resets the seek, and the sound was added at silence
      this.sound.play();
      this.playing = true;
      this.volume = 0;
    }
    this.rampTo("in", MUSIC_FADE_IN_MS, false);
  }

  /**
   * From one audible level to another (C10, C11): a fade-in keeps its course and the time it has
   * left, though never less than the level ramp, heading for the new gain from where it stands;
   * otherwise a short ramp from where it stands. A world-leaving fade-out is left to fall, and a
   * stopped sound to wait for the next entry: the level is only kept.
   */
  private retune(): void {
    const ramp = this.ramp;
    if (!this.sound || !this.playing || ramp?.kind === "out") return;
    if (ramp?.kind === "in") {
      const ms = Math.max(ramp.ms - ramp.elapsed, MUSIC_LEVEL_RAMP_MS);
      this.ramp = { ...ramp, from: this.volume, to: this.target(), ms, elapsed: 0 };
      return;
    }
    this.rampTo("level", MUSIC_LEVEL_RAMP_MS, true);
  }

  /** The sound, added once per load; a track that failed to load, decode or play here costs only the music (R14). */
  private hold(): void {
    if (!this.sound && this.stage.cached()) this.sound = this.stage.add();
  }

  /** Down to silence over the fade-out, then stopped and, the world gone, freed (R3, R13). */
  private fall(): void {
    // nothing to fade, or the fade-out already runs (Edge States: Two leaves in a row)
    if (!this.sound || this.ramp?.kind === "out") return;
    this.rampTo("out", MUSIC_FADE_OUT_MS, true);
  }

  /** The gain of the level as it stands, at the track's trim (C9, W5). */
  private target(): number {
    return musicGain(this.current) * this.trim;
  }

  /** From the volume it has now, so a fade cut short is turned around where it stands (R4). */
  private rampTo(kind: Ramp["kind"], ms: number, heard: boolean): void {
    const to = kind === "out" ? 0 : this.target();
    this.ramp = { kind, from: this.volume, to, ms, elapsed: 0, heard };
    this.stopStepping ??= this.stage.onStep((delta) => this.step(delta));
  }

  private step(delta: number): void {
    const ramp = this.ramp;
    if (!ramp || !this.sound) return;
    if (!ramp.heard) ramp.heard = this.stage.audible();
    if (!ramp.heard) return;
    ramp.elapsed += delta;
    const t = ramp.ms > 0 ? Math.min(1, ramp.elapsed / ramp.ms) : 1;
    this.volume = t < 1 ? ramp.from + (ramp.to - ramp.from) * t : ramp.to;
    this.sound.volume = this.volume;
    if (t < 1) return;
    const fell = ramp.kind === "out";
    this.still();
    if (fell) this.fallen();
  }

  /** No fade runs: the game's step is let go of. */
  private still(): void {
    this.ramp = undefined;
    this.stopStepping?.();
    this.stopStepping = undefined;
  }

  /**
   * The game is destroyed (R21): its sound manager destroys every sound, and a fade in flight goes
   * with it. Nothing of the game's sound is asked anything; the step's listener is let go of, as
   * the game's emitter still is one.
   */
  private letGo(): void {
    this.still();
    this.sound = undefined;
    this.playing = false;
  }

  /** A fade-out has ended: the music stops, and is freed unless its world is back (R3, R13). */
  private fallen(): void {
    // a sound held silent, never started or already stopped, has nothing to stop
    if (this.playing) this.sound?.stop();
    this.playing = false;
    if (this.stage.worldBusy()) return;
    this.sound?.destroy();
    this.sound = undefined;
    this.stage.uncache();
  }
}

/** Phaser 4.2.1's scene statuses (`scene/const.js`), kept here so this module stays Phaser-free. */
const SCENE_INIT = 1;
const SCENE_SLEEPING = 7;

/** A Phaser scene, as far as the music's stage reaches into its game. A `Phaser.Scene` is one. */
export interface MusicScene {
  cache: {
    audio: { exists(key: string): boolean; remove(key: string): unknown };
  };
  sound: {
    add(key: string, config: { loop: boolean; volume: number }): MusicSound;
    /** Phaser's own unlock: false once a gesture inside this game resumed its context. */
    locked: boolean;
    /** Web Audio's; Phaser's HTML5 audio fallback has none. */
    context?: { state: string };
  };
  game: {
    events: {
      on(event: "step", fn: (time: number, delta: number) => void): unknown;
      off(event: "step", fn: (time: number, delta: number) => void): unknown;
    };
  };
  sys: { settings: { status: number } };
}

/**
 * `track`'s stage on its world's scene: what it reaches is the game's, which outlives the scene,
 * and the scene's own status, which says whether its world is back (W2).
 */
export function sceneMusicStage(scene: MusicScene, track: MusicTrack): MusicStage {
  return {
    cached: () => scene.cache.audio.exists(track.key),
    add: () => scene.sound.add(track.key, { loop: true, volume: 0 }),
    uncache: () => void scene.cache.audio.remove(track.key),
    audible: () => {
      const context = scene.sound.context;
      return context ? context.state === "running" : !scene.sound.locked;
    },
    worldBusy: () => {
      const status = scene.sys.settings.status;
      return status >= SCENE_INIT && status <= SCENE_SLEEPING;
    },
    onStep: (tick) => {
      const step = (_time: number, delta: number) => tick(delta);
      scene.game.events.on("step", step);
      return () => void scene.game.events.off("step", step);
    },
  };
}
