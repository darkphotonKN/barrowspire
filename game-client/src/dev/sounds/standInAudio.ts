/**
 * A stand-in Web Audio context for the sound board's tests: it records each source made, what it
 * was handed and whether it was started or stopped, and each gain node. Test-only.
 */

import { vi } from "vitest";
import type { BoardAudioContext } from "./soundBoardPlayer";

export interface StandInSource {
  buffer: { samples: Float32Array; sampleRate: number } | null;
  connectedTo: unknown;
  started: number;
  stopped: number;
  onended: (() => void) | null;
  connect(node: unknown): void;
  start(): void;
  stop(): void;
}

export function standInContext(sampleRate = 22050, state = "running") {
  const sources: StandInSource[] = [];
  const gains: { gain: { value: number }; connectedTo: unknown }[] = [];
  const destination = { name: "destination" };
  const context = {
    sampleRate,
    state,
    destination,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createBuffer(_channels: number, length: number, rate: number) {
      const samples = new Float32Array(length);
      return { samples, sampleRate: rate, getChannelData: () => samples };
    },
    createBufferSource() {
      const source: StandInSource = {
        buffer: null,
        connectedTo: null,
        started: 0,
        stopped: 0,
        onended: null,
        connect(node) {
          this.connectedTo = node;
        },
        start() {
          this.started += 1;
        },
        stop() {
          this.stopped += 1;
        },
      };
      sources.push(source);
      return source;
    },
    createGain() {
      const node = {
        gain: { value: 1 },
        connectedTo: null as unknown,
        connect(target: unknown) {
          this.connectedTo = target;
        },
      };
      gains.push(node);
      return node;
    },
  };
  return { context: context as unknown as BoardAudioContext, sources, gains, destination, raw: context };
}
