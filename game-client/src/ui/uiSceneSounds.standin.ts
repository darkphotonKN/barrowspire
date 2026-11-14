import { GAMEPLAY_EFFECTS } from "@/audio/gameplaySounds";
import { UI_EFFECTS, uiSoundKey, type UiSoundStage } from "@/audio/uiSounds";
import { GameUiBridge, lendUiBridge, reportWorld, uiBridgeOf, type UiBridge, type World, type WorldSide, type WorldUi } from "./uiBridge";
import { mountInterfaceSounds, type UiWindows } from "./uiSceneSounds";
import { uiSceneFor } from "./uiSceneMenu.standin";

/**
 * Test-only: the game's UI bridge with the UI scene's interface sounds lent to it, as the UI scene's
 * create lends them (FS-TQZ5J R22), playing on a recording stand-in for the game's sound: every
 * effect cached, the context running, the level the default (no store, so nothing kept is read), and
 * a clock that moves a second at each read, so no two hovers fall in the cooldown (§ Change M4).
 * `heard` returns the effects played since the last read, by name (FS-WDM0X S10). On `onto`, a bridge
 * already lent, where given; `own`, the UI scene's own windows' open state, where given (FS-TQZ5J
 * § Change: Phase 2: the party, R39; § Change: Phase 3, R55).
 */
export function heardInterfaceSounds(onto?: UiBridge, own: Partial<UiWindows> = {}) {
  let played: string[] = [];
  const stage: UiSoundStage = {
    // the game's cache holds the gameplay effects too (FS-AND39 R12): one an action asks for plays here
    cached: (key) => UI_EFFECTS.some((effect) => key === uiSoundKey(effect)) || GAMEPLAY_EFFECTS.some((effect) => key === `sfx:${effect}`),
    get: () => null,
    add: (key) => ({ play: () => (played.push(key.replace(/^sfx:/, "")), true) }),
    audible: () => true,
  };
  const bridge = onto ?? new GameUiBridge();
  let clock = 0;
  const sounds = mountInterfaceSounds(bridge, stage, () => null, () => (clock += 1000), {
    party: own.party ?? (() => false),
    inventory: own.inventory ?? (() => false),
    character: own.character ?? (() => false),
  });
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
  // the UI scene's party panel and gear overlay, wherever its side over the world stands now or later
  // (`partyPanelOver`, `gearOver`)
  const { bridge, heard } = heardInterfaceSounds(lent ?? undefined, {
    party: () => uiSceneFor(scene)?.party.isOpen() ?? false,
    inventory: () => uiSceneFor(scene)?.gear.isInventoryOpen() ?? false,
    character: () => uiSceneFor(scene)?.gear.isCharacterOpen() ?? false,
  });
  if (!lent) lendUiBridge(s.registry, bridge);
  if (s.ui !== bridge || bridge.world?.world !== world) s.ui = reportWorld(s, world, s.worldSide());
  return heard;
}
