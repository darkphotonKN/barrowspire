/**
 * Test-only: the world scene suites' stand-in stage, the slice of Phaser a scene draws with. Every
 * object `add` makes is recorded by kind and answers any call; destroying a container destroys what
 * it holds, and what was hung on an object's `destroy` goes with it, as in Phaser.
 */

/** A scene object as the stand-in stage made it: what kind, with what, and whether it is gone. */
export interface Made {
  kind: string;
  args: unknown[];
  destroyed: boolean;
  active: boolean;
  visible: boolean;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: Made[];
  /** The pointer handlers it was given, by event, as Phaser would call them. */
  handlers: Record<string, (pointer?: { x: number; y: number }) => void>;
  /** Every other method called on it, by name, in order. */
  calls: string[];
  /** The arguments of the latest call to each method, by name. */
  last: Record<string, unknown[]>;
  /** The texture last set on it, if any was. */
  texture?: string;
  /** What it was last `setVisible` to; undefined while it never was. */
  shown?: boolean;
  /** What it was last `setDepth` to. */
  depth?: number;
  /** The colour a text was last set to. */
  color?: string;
  /** The tint a sprite was last given. */
  tint?: number;
  /** What a text was last rasterised again at (`setResolution`); undefined while never. */
  resolution?: number;
}

/**
 * The stage. `textWidth` measures a text's words as the game's font would (its `width`); without
 * it every object is 160 by 32.
 */
export function recordingStage({
  textWidth,
  placed = true,
  records = false,
}: {
  textWidth?: (words: string) => number;
  /** Each object carries where it stands and its size (160 by 32), as a re-layout reads them back. */
  placed?: boolean;
  /** `made` holds each object's plain record, where an unset field reads undefined; `held` maps it to what the scene holds. */
  records?: boolean;
} = {}) {
  const made: Made[] = [];
  const heldAs = new WeakMap<object, unknown>();
  const held = (m: Made): unknown => heldAs.get(m) ?? m;
  const make = (kind: string, args: unknown[] = []): unknown => {
    const self = {
      kind,
      args,
      destroyed: false,
      active: true,
      visible: true,
      ...(placed && {
        x: typeof args[0] === "number" ? args[0] : 0,
        y: typeof args[1] === "number" ? args[1] : 0,
        width: 160,
        height: 32,
      }),
      children: [] as Made[],
      handlers: {},
      calls: [] as string[],
      last: {} as Record<string, unknown[]>,
    } as Made & { [k: string]: unknown };
    if (kind === "container" && Array.isArray(args[2])) self.children.push(...(args[2] as Made[]));
    const kill = (m: Made) => {
      if (m.destroyed) return;
      m.destroyed = true;
      m.active = false;
      m.children.forEach(kill);
      (m.handlers as Record<string, (() => void) | undefined>).destroy?.();
    };
    /** A setter that records its call and keeps what it set where a test reads it back. */
    const setter =
      (name: string, keep: (args: unknown[]) => void = () => undefined) =>
      (...args: unknown[]) => {
        self.calls.push(name);
        self.last[name] = args;
        keep(args);
        return proxy;
      };
    const proxy: unknown = new Proxy(self, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        // a text measures as Phaser measures it, in the game's font where the suite gives one
        if (prop === "width" && textWidth && target.kind === "text") return textWidth(String(target.args[2]));
        if (prop === "then") return undefined;
        switch (prop) {
          case "destroy":
            return () => kill(target);
          case "add":
            return (child: Made | Made[]) => {
              target.children.push(...[child].flat());
              return proxy;
            };
          case "getBounds":
            return () => ({ x: 0, y: 0, width: 10, height: 10 });
          case "getByName":
            return (name: string) => target.children.find((c) => c.name === name) ?? null;
          case "on":
          case "once":
            return (event: string, fn: () => void) => {
              target.handlers[event] = fn;
              return proxy;
            };
          // no arcade body: a placeholder rig's collision circle is skipped
          case "body":
            return undefined;
          // a text's content is what it shows now, not only what it was made with
          case "setText":
            return setter("setText", ([content]) => (target.args[2] = content));
          case "setName":
            return setter("setName", ([name]) => (target.name = name as string));
          case "setVisible":
            return setter("setVisible", ([v]) => (target.visible = target.shown = v as boolean));
          case "setDepth":
            return setter("setDepth", ([depth]) => (target.depth = depth as number));
          case "setColor":
            return setter("setColor", ([color]) => (target.color = color as string));
          case "setTint":
            return setter("setTint", ([tint]) => (target.tint = tint as number));
          case "setResolution":
            return setter("setResolution", ([r]) => (target.resolution = r as number));
          case "setScrollFactor":
            return setter("setScrollFactor", ([f]) => (target.scrollFactor = f));
          // what it was made pressable with: a blocker hands its own hit test
          case "setInteractive":
            return setter("setInteractive", (a) => (target.interactiveArgs = a));
          // moved, as Phaser moves it: a re-layout reads back where it went
          case "setPosition":
            return setter("setPosition", ([x, y]) => {
              if (!placed) return;
              target.x = x as number;
              if (y !== undefined) target.y = y as number;
            });
          case "setX":
            return setter("setX", ([x]) => placed && (target.x = x as number));
          // a sprite's frame is the texture it was last set to, and the atlas frame with it
          case "setTexture":
            return (key: string, frame?: unknown) => {
              target.calls.push("setTexture");
              target.texture = key;
              target.last.setTexture = frame === undefined ? [key] : [key, frame];
              return proxy;
            };
          // Phaser 4's mask filter (`maskInView`): an `addMask` call, and what the object is masked by
          case "filters":
            return {
              external: {
                addMask: (...args: unknown[]) => {
                  target.calls.push("addMask");
                  target.last.addMask = args;
                  target.maskedBy = args[0];
                  return { setGameObject: (next: unknown) => void (target.maskedBy = next), invert: false };
                },
              },
            };
        }
        return setter(String(prop));
      },
    });
    // by default the proxy, so what a test finds here is what the scene holds
    heldAs.set(self, proxy);
    made.push(records ? self : (proxy as Made));
    return proxy;
  };
  const add = new Proxy({}, { get: (_, kind) => (...args: unknown[]) => make(String(kind), args) });
  return { made, make, add, held };
}
