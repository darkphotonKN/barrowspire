import { UI_EFFECTS, uiSoundKey, type UiSoundStage } from "@/audio/uiSounds";
import { GameUiBridge, lendUiBridge, reportWorld, type World, type WorldSide, type WorldUi } from "./uiBridge";
import { mountInterfaceSounds } from "./uiSceneSounds";

/**
 * Test-only: the game's UI bridge with the UI scene's interface sounds lent to it, as the UI scene's
 * create lends them (FS-TQZ5J R22), playing on a recording stand-in for the game's sound: every
 * effect cached, the context running, the level the default (no store, so nothing kept is read).
 * `heard` returns the effects played since the last read, by name (FS-WDM0X S10).
 */
export function heardInterfaceSounds() {
  let played: string[] = [];
  const stage: UiSoundStage = {
    cached: (key) => UI_EFFECTS.some((effect) => key === uiSoundKey(effect)),
    get: () => null,
    add: (key) => ({ play: () => (played.push(key.replace(/^sfx:/, "")), true) }),
    audible: () => true,
  };
  const bridge = new GameUiBridge();
  const sounds = mountInterfaceSounds(bridge, stage, () => null);
  const heard = () => {
    const out = played;
    played = [];
    return out;
  };
  return { bridge, sounds, heard };
}

/** A world scene as the interface sounds' tests reach it: its game's registry, its UI, what it reports. */
interface WorldUnderTest {
  registry?: { get(key: string): unknown; set(key: string, value: unknown): void };
  events: { once(event: string, fn: () => void): unknown; off(event: string, fn: () => void): unknown };
  ui: WorldUi;
  worldSide(): WorldSide;
}

/**
 * Test-only: lends `scene`'s game a UI bridge with the interface sounds on it, and reports `world`
 * as the world's create does (`this.ui = reportWorld(this, world, this.worldSide())`, pinned
 * from each world's source in its own test). Returns the effects heard since the last read.
 */
export function hearWorld(scene: object, world: World): () => string[] {
  const { bridge, heard } = heardInterfaceSounds();
  const s = scene as WorldUnderTest;
  const held = new Map<string, unknown>();
  s.registry ??= { get: (key) => held.get(key), set: (key, value) => void held.set(key, value) };
  lendUiBridge(s.registry, bridge);
  s.ui = reportWorld(s, world, s.worldSide());
  return heard;
}
