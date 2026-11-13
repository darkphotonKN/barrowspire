/**
 * The town's music (FS-28DDG): the village track looping under the hub, fading in on entering it
 * and out on leaving it, one sound per game, freed once the hub is left.
 *
 * The decisions are {@link HubMusic}'s and Phaser-free; {@link sceneMusicStage} is the game they
 * act on. The fades step on the game's own step, never on HubScene's tweens or clock: the world
 * switch stops the hub before the next world starts, and a scene's clock stops with it (R3).
 */

import type { SceneEnd } from "@/scenes/sceneEnd";
import {
  clampMusicLevel,
  musicGain,
  readMusicLevel,
  rememberMusicLevel,
  type MusicSettingStore,
} from "./musicSetting";

/** The track's key in the audio cache. */
export const MUSIC_KEY = "music:village";
/** The owner's track, mp3 alone (R6). */
export const MUSIC_URL = "/audio/music/village.mp3";
/** Silence to the level's gain on entering the hub, or on a change from level 0 (R2; § Change C12). */
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
  /** The hub runs or is loading again, so the music is kept for it (R13). */
  hubBusy(): boolean;
  /** `tick` on each step of the game, which outlives the hub's stop, until the returned stop. */
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
 * One game's music: HubScene says the hub was entered or left, the Options panel's Music row sets
 * its level, and the rest is this (R20; § Change C13).
 */
export class HubMusic {
  private sound?: MusicSound;
  /** The level, 0 to 5, as this browser keeps it: read on each entry, set from the Options panel (C15). */
  private current = 0;
  /** Whether the sound plays: a fade-out's end stops it, a stopped one may still be kept (R13). */
  private playing = false;
  /** The volume last given the sound, the module's own: a fade starts from it (R3, R4). */
  private volume = 0;
  private ramp?: Ramp;
  private stopStepping?: () => void;

  constructor(
    private readonly stage: MusicStage,
    private readonly store: MusicSettingStore,
  ) {}

  /** The level, as the Options panel's Music row reads it (C5). */
  level(): number {
    return this.current;
  }

  /**
   * The hub was entered (its create). The level is read again, so a change made in a field, a run
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

  /** The hub was left (its scene end). */
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
   * otherwise a short ramp from where it stands. A hub-leaving fade-out is left to fall, and a stopped sound to wait for the next
   * entry: the level is only kept.
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

  /** Down to silence over the fade-out, then stopped and, the hub gone, freed (R3, R13). */
  private fall(): void {
    // nothing to fade, or the fade-out already runs (Edge States: Two leaves in a row)
    if (!this.sound || this.ramp?.kind === "out") return;
    this.rampTo("out", MUSIC_FADE_OUT_MS, true);
  }

  /** The gain of the level as it stands (C9). */
  private target(): number {
    return musicGain(this.current);
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

  /** A fade-out has ended: the music stops, and is freed unless the hub is back (R3, R13). */
  private fallen(): void {
    // a sound held silent, never started or already stopped, has nothing to stop
    if (this.playing) this.sound?.stop();
    this.playing = false;
    if (this.stage.hubBusy()) return;
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

/** The music's stage on a hub scene: what it reaches is the game's, which outlives the scene. */
export function sceneMusicStage(scene: MusicScene): MusicStage {
  return {
    cached: () => scene.cache.audio.exists(MUSIC_KEY),
    add: () => scene.sound.add(MUSIC_KEY, { loop: true, volume: 0 }),
    uncache: () => void scene.cache.audio.remove(MUSIC_KEY),
    audible: () => {
      const context = scene.sound.context;
      return context ? context.state === "running" : !scene.sound.locked;
    },
    hubBusy: () => {
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
