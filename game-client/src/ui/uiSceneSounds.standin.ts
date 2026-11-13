import { UI_EFFECTS, uiSoundKey, type UiSoundStage } from "@/audio/uiSounds";
import { GameUiBridge, lendUiBridge, reportWorld, uiBridgeOf, type UiBridge, type World, type WorldSide, type WorldUi } from "./uiBridge";
import { mountInterfaceSounds } from "./uiSceneSounds";

/**
 * Test-only: the game's UI bridge with the UI scene's interface sounds lent to it, as the UI scene's
 * create lends them (FS-TQZ5J R22), playing on a recording stand-in for the game's sound: every
 * effect cached, the context running, the level the default (no store, so nothing kept is read), and
 * a clock that moves a second at each read, so no two hovers fall in the cooldown (§ Change M4).
 * `heard` returns the effects played since the last read, by name (FS-WDM0X S10). On `onto`, a bridge
 * already lent, where given.
 */
export function heardInterfaceSounds(onto?: UiBridge) {
  let played: string[] = [];
  const stage: UiSoundStage = {
    cached: (key) => UI_EFFECTS.some((effect) => key === uiSoundKey(effect)),
    get: () => null,
    add: (key) => ({ play: () => (played.push(key.replace(/^sfx:/, "")), true) }),
    audible: () => true,
  };
  const bridge = onto ?? new GameUiBridge();
  let clock = 0;
  const sounds = mountInterfaceSounds(bridge, stage, () => null, () => (clock += 1000));
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
 * from each world's source in its own test). Where the game was lent a bridge already (the UI scene's
 * side built over the world, `uiSceneOn`), the sounds go on that one, as the UI scene's create lends
 * them to its game's. Returns the effects heard since the last read.
 */
export function hearWorld(scene: object, world: World): () => string[] {
  const s = scene as WorldUnderTest;
  const held = new Map<string, unknown>();
  s.registry ??= { get: (key) => held.get(key), set: (key, value) => void held.set(key, value) };
  const lent = uiBridgeOf(s.registry);
  const { bridge, heard } = heardInterfaceSounds(lent ?? undefined);
  if (!lent) lendUiBridge(s.registry, bridge);
  if (s.ui !== bridge || bridge.world?.world !== world) s.ui = reportWorld(s, world, s.worldSide());
  return heard;
}
