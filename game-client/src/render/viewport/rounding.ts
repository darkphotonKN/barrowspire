/**
 * Every game object rounded to the backing px (ADR-0057 "Pixel rounding", FS-ZAJMH R4).
 *
 * Phaser 4 decides per object: each WebGL transformer (image, sprite, text, tile, stamp,
 * vertex) and the filter pass round a quad only when `gameObject.willRoundVertices(camera,
 * onlyTranslate)` says so. Phaser's default mode, `safeAuto`, also needs the quad "only
 * translated", and `onlyTranslate` is read from a matrix that already holds the camera's zoom,
 * so at every render scale but 1 nothing is rounded. `fullAuto` rounds whenever the camera's
 * `roundPixels` is on, which is the camera's choice to make (the main camera's,
 * `keepOnPixelGrid`; a render texture's, `roundAtAnyZoom`).
 *
 * Set once, so no scene asks. `vertexRoundMode` is assigned in `GameObject`'s constructor, so a
 * prototype default would be shadowed; a scene listener (`ADDED_TO_SCENE`) would miss a
 * container's child (`Container.addHandler` calls `addedToScene()` and emits no scene event) and
 * anything made with `make.*(…, false)` (mask sources, render-texture stamps). So the hook is
 * the one method all of those are asked through, `willRoundVertices`, which Phaser's changelog
 * names as the method to override for custom rounding (v4.0.0, `GameObject#vertexRoundMode`).
 * How an object came to be, and whether it was made before the hook, does not matter.
 *
 * Phaser has the method on more than one prototype: most classes inherit `GameObject`'s, but
 * Phaser's class factory builds some by copying `GameObject`'s methods onto their own prototype
 * (in 4.2.1 a `Layer`: `Mixins: [..., GameObject, ...]` in `gameobjects/layer/Layer.js`, copied
 * by `extend` in `utils/Class.js`). So the hook is laid on every prototype in
 * `Phaser.GameObjects` that owns the method, found from the classes themselves rather than
 * from a list, and a class a later Phaser builds the same way there is reached too. In 4.2.1
 * every prototype in all of Phaser that owns the method is in `Phaser.GameObjects` (`GameObject`
 * and `Layer`); `rounding.phaser.test.ts` walks the whole module to hold that, so a later Phaser
 * that puts one elsewhere fails it rather than going unrounded.
 *
 * Installed once, at module level, where a game is configured (`components/PhaserGame.tsx`,
 * `dev/gallery/EffectsPanel.tsx`), before any game exists.
 */

/** The mode every game object renders with: rounded whenever its camera rounds. */
export const ROUND_MODE = "fullAuto";

/** Phaser's constructor default, taken here as {@link ROUND_MODE}. Any other mode is a choice. */
const PHASER_DEFAULT = "safeAuto";

/** What of a Phaser game object's prototype the hook replaces. */
interface RoundingDecision {
  vertexRoundMode: string;
  willRoundVertices(camera: unknown, onlyTranslated: boolean): boolean;
}

/**
 * Marks a wrapped method, so a second install (the game and the dev gallery each install; a hot
 * reload evaluates this module again) leaves it as it is. A registered symbol, so a second copy
 * of this module knows the first one's wrap.
 */
const WRAPPED = Symbol.for("barrowspire.roundEveryObject");

type Decide = RoundingDecision["willRoundVertices"] & { [WRAPPED]?: true };

/**
 * Makes every object of every class in `gameObjects` (`Phaser.GameObjects`, its nested
 * namespaces included) render with {@link ROUND_MODE}: an object still on Phaser's default is
 * moved to it the first time it is asked whether to round; one set to any other mode (an
 * opt-out such as `off` for a visibly spinning object, made in `src/render/viewport` with a
 * reason) keeps it. Installs once, however often it is called.
 */
export function roundEveryObject(gameObjects: object): void {
  for (const prototype of decidingPrototypes(gameObjects)) wrap(prototype);
}

/** Each prototype in the namespace that has its own `willRoundVertices`, not an inherited one. */
function decidingPrototypes(namespace: object): Set<RoundingDecision> {
  const found = new Set<RoundingDecision>();
  const seen = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (value === null || seen.has(value)) return;
    if (typeof value === "function") {
      seen.add(value);
      const prototype: unknown = value.prototype;
      if (
        typeof prototype === "object" &&
        prototype !== null &&
        Object.prototype.hasOwnProperty.call(prototype, "willRoundVertices") &&
        typeof (prototype as RoundingDecision).willRoundVertices === "function"
      )
        found.add(prototype as RoundingDecision);
    } else if (typeof value === "object") {
      // a nested namespace (Phaser.GameObjects.Particles, …)
      seen.add(value);
      for (const member of Object.values(value)) visit(member);
    }
  };
  visit(namespace);
  return found;
}

function wrap(prototype: RoundingDecision): void {
  const decide: Decide = prototype.willRoundVertices;
  if (decide[WRAPPED]) return;
  const rounded: Decide = function (
    this: RoundingDecision,
    camera: unknown,
    onlyTranslated: boolean,
  ): boolean {
    if (this.vertexRoundMode === PHASER_DEFAULT) this.vertexRoundMode = ROUND_MODE;
    return decide.call(this, camera, onlyTranslated);
  };
  rounded[WRAPPED] = true;
  prototype.willRoundVertices = rounded;
}
