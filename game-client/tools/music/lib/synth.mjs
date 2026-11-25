// The music's instruments, built in code (the art rule, ADR-0021, held for sound too): wavetable
// voices, plucked strings, bells, a frame drum and a hall. Every voice adds into a stereo bus.
// Deterministic: one seeded random, so a re-render gives the same file.

export const SR = 44100;

/** Mulberry32: the composer's only randomness, seeded per track. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "D4", "C#5", "Bb3" to Hz, A4 = 440. */
export function hz(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const semis = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

export const cents = (c) => 2 ** (c / 1200);

/** A stereo bus long enough for the loop and its tail. */
export function bus(seconds) {
  const n = Math.ceil(seconds * SR);
  return { L: new Float32Array(n), R: new Float32Array(n) };
}

/** Equal-power pan, -1 left to 1 right. */
function panGains(pan) {
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

/** Adds a mono signal into the bus at `start` seconds, panned. */
export function mixIn(b, mono, start, pan = 0, gain = 1) {
  const [gl, gr] = panGains(pan);
  const o = Math.round(start * SR);
  const n = Math.min(mono.length, b.L.length - o);
  for (let i = 0; i < n; i++) {
    if (o + i < 0) continue;
    b.L[o + i] += mono[i] * gl * gain;
    b.R[o + i] += mono[i] * gr * gain;
  }
}

/** One cycle holding the harmonics `amp(h)` gives, h from 1 while h·f0 stays under `top` Hz. */
function table(f0, amp, top = 9000) {
  const size = 4096;
  const t = new Float32Array(size + 1);
  for (let h = 1; h * f0 < Math.min(top, SR / 2 - 500); h++) {
    const a = amp(h, h * f0);
    if (!a) continue;
    for (let i = 0; i < size; i++) t[i] += a * Math.sin((2 * Math.PI * h * i) / size);
  }
  let peak = 0;
  for (let i = 0; i < size; i++) peak = Math.max(peak, Math.abs(t[i]));
  for (let i = 0; i < size; i++) t[i] /= peak || 1;
  t[size] = t[0];
  return t;
}

/** Attack, sustain and release, linear in, exponential-ish out, over `n` samples. */
function envelope(n, attack, release, total) {
  const a = Math.max(1, Math.round(attack * SR));
  const r = Math.max(1, Math.round(release * SR));
  const held = Math.round(total * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = i < a ? i / a : 1;
    if (i > held) e *= Math.max(0, 1 - (i - held) / r) ** 2;
    out[i] = e;
  }
  return out;
}

/**
 * A held wavetable voice: `dur` seconds plus its release, its pitch moved by vibrato that waits
 * `vibDelay` before rising, and drifting `drift` cents slowly so stacked voices beat.
 */
export function voice(f0, dur, { amp, attack = 0.05, release = 0.3, vibRate = 5, vibDepth = 0, vibDelay = 0, drift = 0, rnd, top }) {
  const t = table(f0, amp, top);
  const n = Math.round((dur + release) * SR) + 1;
  const env = envelope(n, attack, release, dur);
  const out = new Float32Array(n);
  const size = t.length - 1;
  let phase = rnd() * size;
  const vibPhase = rnd() * 2 * Math.PI;
  const driftRate = 0.1 + rnd() * 0.2;
  const driftPhase = rnd() * 2 * Math.PI;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const vib = vibDepth * Math.min(1, Math.max(0, (s - vibDelay) / 0.4)) * Math.sin(2 * Math.PI * vibRate * s + vibPhase);
    const dr = drift * Math.sin(2 * Math.PI * driftRate * s + driftPhase);
    phase += (f0 * cents(vib + dr) * size) / SR;
    phase %= size;
    const k = phase | 0;
    const frac = phase - k;
    out[i] = (t[k] + (t[k + 1] - t[k]) * frac) * env[i];
  }
  return out;
}

/** A Lorentzian bump: how loud a harmonic at `f` stands under a formant at `centre`. */
const bump = (f, centre, width) => 1 / (1 + ((f - centre) / (width / 2)) ** 2);

/** Male vowel formants (Peterson & Barney): centre Hz, width Hz, level. */
export const VOWELS = {
  a: [[730, 90, 1], [1090, 110, 0.45], [2440, 170, 0.2], [3400, 250, 0.06]],
  o: [[570, 80, 1], [840, 90, 0.5], [2410, 170, 0.1], [3300, 250, 0.03]],
  u: [[300, 60, 1], [870, 90, 0.25], [2240, 160, 0.06]],
};

/** The glottal source's tilt, shaped by a vowel's formants: a sung harmonic's level. */
export const sung = (vowel) => (h, f) => (1 / h) * VOWELS[vowel].reduce((s, [c, w, l]) => s + l * bump(f, c, w), 0.04);

/** A pipe organ's principal stops: unison, octave, twelfth, fifteenth, a touch of mixture. */
export const organStops = (h) => ({ 1: 1, 2: 0.55, 3: 0.3, 4: 0.28, 5: 0.06, 6: 0.14, 8: 0.1, 10: 0.03, 12: 0.04 })[h] ?? 0;

/** A bowed string: a sawtooth's 1/h series through a fiddle body's resonances. */
export const bowed = (h, f) =>
  (1 / h) * (0.25 + bump(f, 290, 120) * 0.8 + bump(f, 520, 200) + bump(f, 1100, 400) * 0.7 + bump(f, 2800, 900) * 0.5) * (f > 4500 ? 0.3 : 1);

/** A recorder: nearly a sine, a little second and third. */
export const fipple = (h) => ({ 1: 1, 2: 0.12, 3: 0.09, 4: 0.025, 5: 0.015 })[h] ?? 0;

/** A hurdy-gurdy's drone strings: bright, nasal, the wheel's rasp in the upper harmonics. */
export const wheel = (h, f) => (1 / h) * (0.4 + bump(f, 450, 300) + bump(f, 1500, 700) * 0.8 + bump(f, 3000, 1200) * 0.35);

/**
 * A plucked gut string (Karplus-Strong, fractionally tuned): a lute or a cittern, `bright` 0 to 1,
 * ringing about `ring` seconds.
 */
export function pluck(f0, { ring = 2.2, bright = 0.5, rnd }) {
  const n = Math.round((ring + 0.3) * SR);
  const out = new Float32Array(n);
  const period = SR / f0 - 0.5;
  const len = Math.ceil(period) + 2;
  const buf = new Float32Array(len);
  // the excitation: noise, softened for a gut string, and a pick position comb (a quarter in)
  let last = 0;
  for (let i = 0; i < len; i++) {
    const noise = rnd() * 2 - 1;
    last = last + (noise - last) * (0.25 + 0.6 * bright);
    buf[i] = last;
  }
  const pickAt = Math.max(1, Math.round(len * 0.22));
  const shaped = buf.map((v, i) => v - 0.6 * buf[(i + len - pickAt) % len]);
  buf.set(shaped);
  // the loss per period that rings the string down 60 dB in `ring` seconds
  const loss = 10 ** (-3 / (ring * f0));
  const frac = period - Math.floor(period);
  let w = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const r0 = (w - Math.floor(period) + len * 4) % len;
    const r1 = (r0 - 1 + len) % len;
    const delayed = buf[r0] * (1 - frac) + buf[r1] * frac;
    const y = loss * (0.5 * delayed + 0.5 * prev);
    prev = delayed;
    buf[w] = y;
    w = (w + 1) % len;
    out[i] = y;
  }
  // a soft attack so the pick does not click, and a fade at the end of the render
  const a = Math.round(0.002 * SR);
  for (let i = 0; i < a; i++) out[i] *= i / a;
  const f = Math.round(0.3 * SR);
  for (let i = 0; i < f; i++) out[n - 1 - i] *= i / f;
  return out;
}

/**
 * A tower bell: a minor-third bell's partials (hum, prime, tierce, quint, nominal and above),
 * each ringing down at its own rate, the strike's clang at the top.
 */
export function bell(f0, { ring = 9, rnd }) {
  const partials = [
    [0.5, 0.55, 1.0],
    [1.0, 0.7, 0.75],
    [1.183, 0.5, 0.6],
    [1.506, 0.3, 0.5],
    [2.0, 0.55, 0.4],
    [2.514, 0.2, 0.28],
    [2.662, 0.12, 0.25],
    [3.011, 0.15, 0.2],
    [4.166, 0.08, 0.12],
  ];
  const n = Math.round(ring * SR);
  const out = new Float32Array(n);
  for (const [ratio, level, life] of partials) {
    const f = f0 * ratio * cents((rnd() - 0.5) * 4);
    const decay = 1 / (life * ring * 0.45);
    const beat = 0.3 + rnd() * 0.6;
    for (let i = 0; i < n; i++) {
      const s = i / SR;
      out[i] += level * Math.exp(-decay * s) * (1 + 0.15 * Math.sin(2 * Math.PI * beat * s)) * Math.sin(2 * Math.PI * f * s);
    }
  }
  const a = Math.round(0.004 * SR);
  for (let i = 0; i < a; i++) out[i] *= i / a;
  return out;
}

/** A frame drum (a bodhran): a falling skin tone and a brush of noise. `tone` in Hz. */
export function drum(tone, { decay = 0.32, slap = 0.25, rnd }) {
  const n = Math.round((decay * 3) * SR);
  const out = new Float32Array(n);
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const f = tone * (0.72 + 0.28 * Math.exp(-s / 0.03));
    phase += (2 * Math.PI * f) / SR;
    const body = Math.sin(phase) * Math.exp(-s / decay);
    lp += ((rnd() * 2 - 1) - lp) * 0.18;
    const skin = lp * Math.exp(-s / 0.025) * slap;
    out[i] = body + skin;
  }
  const a = Math.round(0.0015 * SR);
  for (let i = 0; i < a; i++) out[i] *= i / a;
  return out;
}

/**
 * Freeverb (Jezar's tunings), its combs stretched by `size` for a bigger room: the bus in, the
 * hall's wet bus out.
 */
export function hall(b, { room = 0.84, damp = 0.35, size = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const passes = [556, 441, 341, 225];
  const spread = 23;
  const feedback = room * 0.28 + 0.7;
  const d1 = damp * 0.4;
  const d2 = 1 - d1;
  const side = (input, offset) => {
    const cs = combs.map((c) => ({ buf: new Float32Array(Math.round((c + offset) * size)), i: 0, store: 0 }));
    const ps = passes.map((p) => ({ buf: new Float32Array(Math.round((p + offset) * size)), i: 0 }));
    const out = new Float32Array(input.length);
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of cs) {
        const o = c.buf[c.i];
        c.store = o * d2 + c.store * d1;
        c.buf[c.i] = x + c.store * feedback;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const p of ps) {
        const o = p.buf[p.i];
        p.buf[p.i] = y + o * 0.5;
        p.i = (p.i + 1) % p.buf.length;
        y = o - y;
      }
      out[n] = y;
    }
    return out;
  };
  const mono = b.L.map((l, i) => (l + b.R[i]) / 2);
  return { L: side(mono, 0), R: side(mono, spread) };
}

/** A one-pole low-pass over a bus, in place: the hall's air. */
export function soften(b, hzCut) {
  const k = 1 - Math.exp((-2 * Math.PI * hzCut) / SR);
  for (const ch of [b.L, b.R]) {
    let y = 0;
    for (let i = 0; i < ch.length; i++) ch[i] = y += (ch[i] - y) * k;
  }
}

/**
 * The finished loop: dry and wet summed, the tail past `loop` seconds folded back onto its start
 * so it plays seamlessly, brought to `rmsDb` with a soft ceiling under `peak`.
 */
export function master(dry, wet, { loop, wetGain, rmsDb = -14, peak = 0.89 }) {
  const n = Math.round(loop * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < dry.L.length; i++) {
    const j = i % n;
    L[j] += dry.L[i] + wet.L[i] * wetGain;
    R[j] += dry.R[i] + wet.R[i] * wetGain;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (L[i] * L[i] + R[i] * R[i]) / 2;
  const gain = 10 ** (rmsDb / 20) / Math.sqrt(sum / n);
  // a soft knee above 70% of the ceiling, so a peak is rounded, never clipped
  const knee = peak * 0.7;
  const shape = (v) => {
    const a = Math.abs(v);
    if (a <= knee) return v;
    return Math.sign(v) * (knee + (peak - knee) * Math.tanh((a - knee) / (peak - knee)));
  };
  for (let i = 0; i < n; i++) {
    L[i] = shape(L[i] * gain);
    R[i] = shape(R[i] * gain);
  }
  return { L, R };
}

/** 16-bit stereo PCM WAV bytes. */
export function wav({ L, R }) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  return buf;
}
