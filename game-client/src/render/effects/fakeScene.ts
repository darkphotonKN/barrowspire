/**
 * Test double for the effect modules' tests: the slice of a Phaser scene the effects runtime and
 * the hit tint draw with, recording what was made, tweened and timed, and a light-map that
 * records its short-lived sources. Imported only by `*.test.ts` beside it.
 */

import type { TransientLight, TransientSpec } from "@/render/lighting/LightMap";
import type { EffectLights, EffectsScene, FxArt } from "./runtime";
import type { HitScene } from "./hit";

export interface FakeObject {
  kind: "image" | "container" | "particles";
  args: unknown[];
  destroyed: boolean;
  /** The last arguments of each method called on it. */
  calls: Record<string, unknown[]>;
}

export interface FakeTween {
  config: Record<string, unknown>;
  stopped: boolean;
  /** Counter tweens: runs the tween to `progress` (0..1, eased linearly here) and calls back. */
  advance(progress: number): void;
  /** Counter tweens: runs it to the end and fires `onComplete`. */
  complete(): void;
}

export interface FakeTimer {
  delay: number;
  removed: boolean;
  fire(): void;
}

const CHAINED = [
  "setOrigin",
  "setTint",
  "setAlpha",
  "setScale",
  "setRotation",
  "setDepth",
  "setPosition",
  "add",
  "emitParticle",
  "startFollow",
];

export function fakeScene() {
  const made: FakeObject[] = [];
  const tweens: FakeTween[] = [];
  const timers: FakeTimer[] = [];

  const obj = (kind: FakeObject["kind"], args: unknown[]) => {
    const record: FakeObject = { kind, args, destroyed: false, calls: {} };
    made.push(record);
    const o: Record<string, unknown> = {
      destroy: () => {
        record.destroyed = true;
      },
    };
    for (const m of CHAINED)
      o[m] = (...a: unknown[]) => {
        record.calls[m] = a;
        return o;
      };
    return o;
  };

  const tween = (config: Record<string, unknown>) => {
    let value = (config.from as number | undefined) ?? 0;
    const handle = {
      stop: () => {
        t.stopped = true;
      },
      getValue: () => value,
    };
    const t: FakeTween = {
      config,
      stopped: false,
      advance: (progress) => {
        const from = config.from as number;
        const to = config.to as number;
        value = from + (to - from) * progress;
        (config.onUpdate as ((tw: unknown) => void) | undefined)?.(handle);
      },
      complete: () => {
        t.advance(1);
        (config.onComplete as ((tw: unknown) => void) | undefined)?.(handle);
      },
    };
    tweens.push(t);
    return handle;
  };

  const scene = {
    add: {
      image: (...a: unknown[]) => obj("image", a),
      container: (...a: unknown[]) => obj("container", a),
      particles: (...a: unknown[]) => obj("particles", a),
    },
    tweens: { add: tween, addCounter: tween },
    time: {
      delayedCall: (delay: number, fire: () => void) => {
        const t = { delay, fire, removed: false };
        timers.push(t);
        return {
          remove: () => {
            t.removed = true;
          },
        };
      },
    },
  };

  return {
    scene: scene as unknown as EffectsScene & HitScene,
    made,
    tweens,
    timers,
    live: () => made.filter((m) => !m.destroyed),
  };
}

/** Art with every fx sheet present, at a plain frame and centred anchor. */
export const fakeArt: FxArt = {
  has: () => true,
  resolve: (name) => ({
    placeholder: false,
    texture: "art:fx-0",
    frame: `${name}/idle/0/0`,
    anchor: { x: 0.5, y: 0.5 },
  }),
};

export function fakeLights() {
  const added: {
    spec: TransientSpec;
    light: TransientLight;
    removed: boolean;
  }[] = [];
  const lights: EffectLights = {
    addTransient: (spec) => {
      const rec = { spec, removed: false } as (typeof added)[number];
      rec.light = Object.assign(
        { ...spec, flicker: 0, seed: 0, alive: true },
        {
          remove: () => {
            rec.removed = true;
          },
        },
      );
      added.push(rec);
      return rec.light;
    },
  };
  return { lights, added, alive: () => added.filter((l) => !l.removed) };
}
