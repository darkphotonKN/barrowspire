/**
 * The dev sound board's player (FS-AND39 R15): each press renders that effect from the same
 * generators the game installs at boot (`renderGameplaySfx`), at the board's own context's sample
 * rate, and plays it once at `SFX_MAX_GAIN`, the loudest the game plays. No Phaser.
 *
 * The context is made on the first press, a gesture, so the browser's autoplay policy blocks
 * nothing. A repeat press stops that effect and starts it from the top, as the game's player does
 * (R13); different effects overlap.
 */

import { renderGameplaySfx } from "@/audio/gameplaySfx";
import type { GameplayEffect } from "@/audio/gameplaySounds";
import { SFX_MAX_GAIN } from "@/audio/sfxSetting";

/** One played effect, as far as the board reaches it. An `AudioBufferSourceNode` is one. */
interface BoardSource {
  buffer: unknown;
  onended: (() => void) | null;
  connect(node: unknown): void;
  start(): void;
  stop(): void;
}

/** The board's Web Audio context, as far as it reaches it. An `AudioContext` is one. */
export interface BoardAudioContext {
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
  createBufferSource(): BoardSource;
  createGain(): { gain: { value: number }; connect(node: unknown): void };
}

export interface SoundBoardPlayer {
  /** Renders `effect` and plays it now, restarting it if it still rings. */
  play(effect: GameplayEffect): void;
  /** Closes the context, if one was made; the next press makes a fresh one. */
  close(): void;
}

/** The browser's own context, or none where there is no Web Audio. */
function browserContext(): BoardAudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  return new AudioContext() as unknown as BoardAudioContext;
}

export function createSoundBoardPlayer(
  makeContext: () => BoardAudioContext | undefined = browserContext,
): SoundBoardPlayer {
  let context: BoardAudioContext | undefined;
  let output: unknown;
  const ringing = new Map<GameplayEffect, BoardSource>();

  function ready(): BoardAudioContext | undefined {
    if (!context) {
      context = makeContext();
      if (!context) return undefined;
      const gain = context.createGain();
      gain.gain.value = SFX_MAX_GAIN;
      gain.connect(context.destination);
      output = gain;
    }
    if (context.state === "suspended") void context.resume();
    return context;
  }

  return {
    play(effect) {
      const audio = ready();
      if (!audio) return;
      const samples = renderGameplaySfx(effect, audio.sampleRate);
      const buffer = audio.createBuffer(1, samples.length, audio.sampleRate);
      buffer.getChannelData(0).set(samples);

      ringing.get(effect)?.stop();
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.onended = () => {
        if (ringing.get(effect) === source) ringing.delete(effect);
      };
      ringing.set(effect, source);
      source.start();
    },
    close() {
      if (!context) return;
      void context.close();
      context = undefined;
      output = undefined;
      ringing.clear();
    },
  };
}
