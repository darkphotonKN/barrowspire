import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phaser's own sound manager (4.2.1), not a stand-in: what is under test is how it treats the
// context the game hands it. Phaser's exports map admits only its bundle, so its source is
// reached by path.
const WebAudioSoundManager: new (game: object) => {
  onBlur(): void;
  update(time: number, delta: number): void;
  destroy(): void;
} = createRequire(import.meta.url)(
  "../../node_modules/phaser/src/sound/webaudio/WebAudioSoundManager.js",
);

// Chrome's AudioContext as far as this matters: a resume() waits until the context may run, and
// close() rejects every resume still waiting with InvalidStateError "AudioContext closed before a
// pending resume() could complete" — the error leaving /game showed, unhandled. Here close()
// counts those resumes instead of rejecting them, so the count is the error without the noise.
const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  waiting = 0;
  /** Resumes a close() found still waiting: each one is that InvalidStateError in Chrome. */
  rejectedByClose = 0;
  constructor() {
    contexts.push(this);
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, value: 1 },
      connect() {},
      disconnect() {},
    };
  }
  resume() {
    this.waiting += 1;
    return new Promise<void>(() => {});
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    this.rejectedByClose += this.waiting;
    this.waiting = 0;
    return Promise.resolve();
  }
}

function gameWith(audio: object) {
  const listeners = { on() {}, once() {}, off() {} };
  return {
    isBooted: true,
    events: listeners,
    cache: { json: {}, audio: {} },
    config: { audio },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("document", {
    body: { addEventListener() {}, removeEventListener() {} },
  });
});

afterEach(() => {
  contexts.length = 0;
  vi.unstubAllGlobals();
});

describe("the game's audio (one context the page keeps; a game only suspends it)", () => {
  it("should leave no resume rejected when a game is destroyed while one is pending", async () => {
    const { gameAudio } = await import("./gameAudio");
    const sound = new WebAudioSoundManager(gameWith(gameAudio()));

    // the window lost focus and won it back: Phaser resumes the context on the next frame
    sound.onBlur();
    sound.update(0, 16);
    // and the player leaves /game before that resume completes
    sound.destroy();

    expect(contexts.map((c) => c.rejectedByClose)).toEqual([0]);
  });

  it("should hand every game the same context, so leaving and coming back builds no other", async () => {
    const { gameAudio } = await import("./gameAudio");
    const first = new WebAudioSoundManager(gameWith(gameAudio()));
    first.destroy();
    new WebAudioSoundManager(gameWith(gameAudio()));

    expect(contexts).toHaveLength(1);
  });

  it("should leave a browser without Web Audio to Phaser's own fallback", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { gameAudio } = await import("./gameAudio");

    expect(gameAudio()).toEqual({});
  });

  it("should still reject a pending resume under Phaser's default, so this test can see it", async () => {
    const sound = new WebAudioSoundManager(gameWith({}));
    sound.onBlur();
    sound.update(0, 16);
    sound.destroy();

    expect(contexts.map((c) => c.rejectedByClose)).toEqual([1]);
  });
});
