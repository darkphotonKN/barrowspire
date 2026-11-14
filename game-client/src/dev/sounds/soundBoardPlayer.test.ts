import { describe, expect, it, vi } from "vitest";
import { renderGameplaySfx } from "@/audio/gameplaySfx";
import { SFX_MAX_GAIN } from "@/audio/sfxSetting";
import { createSoundBoardPlayer } from "./soundBoardPlayer";
import { standInContext } from "./standInAudio";

// FS-AND39 R15: the board renders each effect from the generators at its own context's rate,
// makes that context on the first press, plays at SFX_MAX_GAIN, and restarts an effect pressed again.

describe("the sound board's player", () => {
  it("should make no audio context until the first press", () => {
    const make = vi.fn(() => standInContext().context);
    createSoundBoardPlayer(make);
    expect(make).not.toHaveBeenCalled();
  });

  it("should render the pressed effect from the generators at the context's own rate and start it", () => {
    const stage = standInContext(22050);
    const player = createSoundBoardPlayer(() => stage.context);

    player.play("chest_open");

    expect(stage.sources).toHaveLength(1);
    const [source] = stage.sources;
    expect(source.started).toBe(1);
    expect(source.buffer?.sampleRate).toBe(22050);
    expect(source.buffer?.samples).toEqual(renderGameplaySfx("chest_open", 22050));
  });

  it("should play through a gain at SFX_MAX_GAIN, into the destination", () => {
    const stage = standInContext();
    const player = createSoundBoardPlayer(() => stage.context);

    player.play("hit_monster");

    const [gain] = stage.gains;
    expect(gain.gain.value).toBe(SFX_MAX_GAIN);
    expect(gain.connectedTo).toBe(stage.destination);
    expect(stage.sources[0].connectedTo).toBe(gain);
  });

  it("should make the context once, however many presses follow", () => {
    const stage = standInContext();
    const make = vi.fn(() => stage.context);
    const player = createSoundBoardPlayer(make);

    player.play("dash");
    player.play("parry");
    player.play("dash");

    expect(make).toHaveBeenCalledTimes(1);
  });

  it("should stop the effect's first source when it is pressed again, and start a fresh one", () => {
    const stage = standInContext();
    const player = createSoundBoardPlayer(() => stage.context);

    player.play("item_swap");
    player.play("item_swap");

    expect(stage.sources).toHaveLength(2);
    expect(stage.sources[0].stopped).toBe(1);
    expect(stage.sources[1].started).toBe(1);
    expect(stage.sources[1].stopped).toBe(0);
  });

  it("should let different effects overlap", () => {
    const stage = standInContext();
    const player = createSoundBoardPlayer(() => stage.context);

    player.play("item_pickup");
    player.play("hit_player");

    expect(stage.sources[0].stopped).toBe(0);
  });

  it("should not stop a source that already ended when its effect is pressed again", () => {
    const stage = standInContext();
    const player = createSoundBoardPlayer(() => stage.context);

    player.play("loot_open");
    stage.sources[0].onended?.();
    player.play("loot_open");

    expect(stage.sources[0].stopped).toBe(0);
  });

  it("should resume a context the browser made suspended", () => {
    const stage = standInContext(44100, "suspended");
    const player = createSoundBoardPlayer(() => stage.context);

    player.play("triple_fireball");

    expect(stage.raw.resume).toHaveBeenCalled();
    expect(stage.sources[0].started).toBe(1);
  });

  it("should play nothing, and not throw, in a browser with no Web Audio", () => {
    const player = createSoundBoardPlayer(() => undefined);
    expect(() => player.play("shadow_shot")).not.toThrow();
  });

  it("should close its context, and make a fresh one on the next press", () => {
    const first = standInContext();
    const second = standInContext();
    const make = vi.fn().mockReturnValueOnce(first.context).mockReturnValueOnce(second.context);
    const player = createSoundBoardPlayer(make);

    player.play("stash_open");
    player.close();
    player.play("stash_open");

    expect(first.raw.close).toHaveBeenCalled();
    expect(make).toHaveBeenCalledTimes(2);
    expect(second.sources[0].started).toBe(1);
  });

  it("should close nothing before the first press", () => {
    const make = vi.fn(() => standInContext().context);
    const player = createSoundBoardPlayer(make);
    expect(() => player.close()).not.toThrow();
    expect(make).not.toHaveBeenCalled();
  });
});
