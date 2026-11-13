/**
 * The game's audio config: one Web Audio context the page keeps, handed to every game.
 *
 * Phaser closes a context it built itself when its game is destroyed, but only suspends one it
 * was given (WebAudioSoundManager#destroy, 4.2.1). The close is what failed: Phaser resumes its
 * context on every frame after the window wins focus back (`onFocus`) and on becoming visible
 * (`onGameVisible`), and neither resume handles a rejection, so leaving /game while one was
 * pending (switching to the marketplace) rejected it with InvalidStateError "AudioContext closed
 * before a pending resume() could complete", unhandled, and the page showed it. A context that
 * is never closed rejects no resume, and coming back to /game reuses it rather than building
 * another. Sound itself is untouched: the game plays none yet, and whatever plays later plays
 * through this context.
 */

let context: AudioContext | undefined;

/**
 * Built on first call, in the browser, as the first game is configured; the same one after. A
 * browser without Web Audio gets Phaser's default, which falls back to HTML5 audio or none.
 */
export function gameAudio(): { context?: AudioContext } {
  if (typeof AudioContext === "undefined") return {};
  context ??= new AudioContext();
  return { context };
}
