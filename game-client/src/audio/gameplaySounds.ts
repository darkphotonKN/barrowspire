/**
 * The gameplay sound effects (FS-AND39): the 11 effects the world answers the player's hand with,
 * their keys, the boot install that puts them in the game's audio cache, and their player.
 *
 * The effects are built in code (`gameplaySfx.ts`), never loaded as files: `PreloadScene` renders
 * each at the audio context's sample rate and adds it to the cache as Phaser's loader adds a
 * decoded file (R12). The player plays them by the interface effects' rules ({@link playSfx}:
 * FS-WDM0X S11, S12, S22) on the same stage, `sceneUiSoundStage` (R13, R16). Each world scene
 * makes one in `create` and hands it to the modules that play.
 */

import type { ContainerKind } from "@/types/gameState";
import { renderGameplaySfx } from "./gameplaySfx";
import type { SfxSettingStore } from "./sfxSetting";
import { playSfx, type UiSoundStage } from "./uiSounds";

/** The 11 effects (R1). */
export const GAMEPLAY_EFFECTS = [
  "hit_monster",
  "hit_player",
  "chest_open",
  "loot_open",
  "stash_open",
  "item_pickup",
  "item_swap",
  "dash",
  "triple_fireball",
  "shadow_shot",
  "parry",
] as const;

export type GameplayEffect = (typeof GAMEPLAY_EFFECTS)[number];

/** An effect's key in the game's audio cache, as the interface effects' are keyed. */
export function gameplaySoundKey(effect: GameplayEffect): string {
  return `sfx:${effect}`;
}

/**
 * What the coffer view's open plays for a container's kind (R5): a chest's lid creaks, a sack or a
 * drop pile rustles. A kind this client does not know is a chest (FS-1D6BX D2).
 */
export function containerOpenEffect(kind: ContainerKind): GameplayEffect {
  return kind === "sack" || kind === "drop_pile" ? "loot_open" : "chest_open";
}

/** The game's Web Audio context, as far as the install reaches it. An `AudioContext` is one. */
export interface GameplaySoundContext {
  sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
}

/** The game's audio cache, as far as the install reaches it. Phaser's `cache.audio` is one. */
export interface GameplaySoundCache {
  add(key: string, data: unknown): unknown;
}

/**
 * Renders each effect at the context's sample rate into a mono buffer made on it, and adds it to
 * the game's audio cache under its key, where Phaser's Web Audio sounds read a decoded file (R12).
 * Called once, from `PreloadScene`; no world frees one. With no context (Phaser's HTML5 manager,
 * which keeps audio tags in that cache, or no audio) nothing is added, and every effect stays
 * silent. An effect whose render or buffer throws is left out, and the rest install. Returns those
 * installed.
 */
export function installGameplaySounds(
  context: GameplaySoundContext | undefined,
  cache: GameplaySoundCache,
  render: (effect: GameplayEffect, sampleRate: number) => Float32Array = renderGameplaySfx,
): GameplayEffect[] {
  if (!context) return [];
  const installed: GameplayEffect[] = [];
  for (const effect of GAMEPLAY_EFFECTS) {
    try {
      const samples = render(effect, context.sampleRate);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      cache.add(gameplaySoundKey(effect), buffer);
      installed.push(effect);
    } catch (error) {
      console.warn(`sound effect ${effect} left out`, error);
    }
  }
  return installed;
}

/** What a module that plays a gameplay effect is handed: the player, or a stand-in. */
export interface GameplaySoundPlayer {
  play(effect: GameplayEffect): void;
}

/** One scene's gameplay effects player (R13, R16): flat and fixed, no pitch, rate or pan (R14). */
export class GameplaySounds implements GameplaySoundPlayer {
  constructor(
    private readonly stage: UiSoundStage,
    private readonly store: SfxSettingStore,
  ) {}

  /** Plays `effect` once, now, or not at all, by the interface effects' rules ({@link playSfx}). Safe to hand on unbound. */
  play = (effect: GameplayEffect): void => {
    playSfx(this.stage, this.store, gameplaySoundKey(effect));
  };
}
