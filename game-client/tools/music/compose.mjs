#!/usr/bin/env node
// The town's indoor music, composed and rendered in code: the chapel's and the Inn's tracks.
// Both sit with the village track: D minor, its A at the centre, about 70 to the minute, about
// -14 dBFS RMS, each a seamless loop.
//
//   node tools/music/compose.mjs [chapel|inn ...]
//
// Writes public/audio/music/<name>.m4a (AAC, 192 kb/s) through macOS's afconvert, the WAV master
// kept only in a temp dir: the render is seeded, so running this again gives the same file.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bell,
  bowed,
  bus,
  cents,
  drum,
  fipple,
  hall,
  hz,
  master,
  mixIn,
  organStops,
  pluck,
  seeded,
  soften,
  sung,
  voice,
  wav,
  wheel,
} from "./lib/synth.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/audio/music");

/** Chord tones by name, low to high, for the organ and the lute. */
const CHORDS = {
  Dm: ["D", "F", "A"],
  F: ["F", "A", "C"],
  C: ["C", "E", "G"],
  Bb: ["Bb", "D", "F"],
  Gm: ["G", "Bb", "D"],
  A: ["A", "C#", "E"],
};

// ---------------------------------------------------------------------------------------------
// The chapel: a slow, grave office. Organ chords under a chant sung by low men's voices, the
// chant doubled a fifth above in organum on its second half, a bell tolling every eight bars.

function chapel() {
  const rnd = seeded(0xc4a9e1);
  const beat = 60 / 54;
  const bar = beat * 4;
  const bars = ["Dm", "Dm", "Bb", "F", "Gm", "Dm", "A", "Dm", "Dm", "C", "Bb", "F", "Gm", "Bb", "A", "A", "Dm", "F", "C", "Gm", "Bb", "Gm", "A", "Dm"];
  const loop = bars.length * bar;
  const tail = 9;
  const b = bus(loop + tail);

  // the organ: each chord held a bar, its root low in the pedal, the bar's change a touch legato
  bars.forEach((name, i) => {
    const [r, t, f] = CHORDS[name];
    const soft = i < 4 ? 0.7 : 1;
    const notes = [`${r}2`, `${f}2`, `${r}3`, `${t}3`, `${f}3`];
    for (const [k, n] of notes.entries()) {
      for (const detune of [-3, 3]) {
        const v = voice(hz(n) * cents(detune), bar + 0.05, { amp: organStops, attack: 0.35, release: 1.1, drift: 1.5, rnd, top: 5000 });
        mixIn(b, v, i * bar, detune < 0 ? -0.25 : 0.25, (k < 2 ? 0.085 : 0.06) * soft);
      }
    }
  });

  // the chant, in beats: low men's voices on "ah", from the fifth bar
  const chant = [
    [4, [["G3", 2], ["A3", 1], ["Bb3", 1]]],
    [5, [["A3", 3], ["F3", 1]]],
    [6, [["E3", 2], ["A3", 2]]],
    [7, [["D3", 4]]],
    [8, [["A3", 2], ["A3", 1], ["A3", 1]]],
    [9, [["G3", 2], ["E3", 1], ["G3", 1]]],
    [10, [["F3", 2], ["D3", 1], ["F3", 1]]],
    [11, [["A3", 2], ["C4", 2]]],
    [12, [["D4", 2], ["Bb3", 1], ["A3", 1]]],
    [13, [["Bb3", 2], ["A3", 1], ["G3", 1]]],
    [14, [["A3", 2], ["E3", 2]]],
    [15, [["A3", 4]]],
    [16, [["D4", 2], ["C4", 1], ["A3", 1]]],
    [17, [["C4", 2], ["A3", 1], ["F3", 1]]],
    [18, [["G3", 2], ["E3", 1], ["G3", 1]]],
    [19, [["Bb3", 2], ["A3", 1], ["G3", 1]]],
    [20, [["F3", 2], ["D3", 1], ["F3", 1]]],
    [21, [["G3", 2], ["A3", 1], ["Bb3", 1]]],
    [22, [["A3", 2], ["G3", 1], ["E3", 1]]],
    [23, [["D3", 4]]],
  ];
  const sing = (note, at, len, vowel, gain, voices, pan) => {
    for (let k = 0; k < voices; k++) {
      const v = voice(hz(note) * cents((rnd() - 0.5) * 14), len + 0.12, {
        amp: sung(vowel),
        attack: 0.18 + rnd() * 0.08,
        release: 0.45,
        vibRate: 4.6 + rnd() * 0.9,
        vibDepth: 9 + rnd() * 8,
        vibDelay: 0.2,
        drift: 4,
        rnd,
        top: 4200,
      });
      mixIn(b, v, at + (rnd() - 0.5) * 0.05, pan + (k / (voices - 1) - 0.5) * 0.7, gain / voices);
    }
  };
  // a fifth above, sung softer on "oh", from the thirteenth bar: organum, as the office was sung
  const fifthAbove = { D3: "A3", E3: "B3", F3: "C4", G3: "D4", A3: "E4", Bb3: "F4", C4: "G4", D4: "A4" };
  for (const [i, line] of chant) {
    let at = i * bar;
    for (const [note, beats] of line) {
      sing(note, at, beats * beat, "a", 0.5, 5, -0.1);
      if (i >= 12 && i < 23) sing(fifthAbove[note], at, beats * beat, "o", 0.22, 4, 0.15);
      at += beats * beat;
    }
  }

  // the bell, tolling the hour from the tower: bars 1, 9 and 17
  for (const i of [0, 8, 16]) mixIn(b, bell(hz("D3"), { ring: 9, rnd }), i * bar, 0.1, 0.22);

  soften(b, 7000);
  const wet = hall(b, { room: 0.93, damp: 0.45, size: 1.45 });
  return { loop, mix: master(b, wet, { loop, wetGain: 0.75, rmsDb: -14.5 }) };
}

// ---------------------------------------------------------------------------------------------
// The Inn: a grave dance in 6/8, D minor, the A major chord turning it home. A hurdy-gurdy
// drones under a lute, a bodhran keeps the step, the fiddle takes the tune, then the recorder
// with the fiddle under it.

function inn() {
  const rnd = seeded(0x7a7e12);
  const eighth = 60 / 72 / 3;
  const bar = eighth * 6;
  const intro = ["Dm", "Dm", "Bb", "A"];
  const tune = [
    // A: bars 1 to 16
    ["Dm", [["D5", 3], ["E5", 1], ["F5", 2]]],
    ["Dm", [["A5", 2], ["G5", 1], ["F5", 2], ["E5", 1]]],
    ["C", [["G5", 3], ["E5", 1], ["C5", 2]]],
    ["C", [["E5", 2], ["D5", 1], ["C5", 2], ["E5", 1]]],
    ["Bb", [["F5", 3], ["D5", 1], ["Bb4", 2]]],
    ["Bb", [["D5", 2], ["C5", 1], ["Bb4", 2], ["D5", 1]]],
    ["A", [["C#5", 3], ["E5", 1], ["A4", 2]]],
    ["A", [["A4", 6]]],
    ["Dm", [["D5", 3], ["E5", 1], ["F5", 2]]],
    ["Dm", [["A5", 2], ["G5", 1], ["F5", 2], ["E5", 1]]],
    ["C", [["G5", 3], ["E5", 1], ["C5", 2]]],
    ["C", [["E5", 2], ["D5", 1], ["C5", 2], ["E5", 1]]],
    ["Bb", [["F5", 2], ["G5", 1], ["A5", 2], ["F5", 1]]],
    ["C", [["G5", 2], ["E5", 1], ["C5", 2], ["E5", 1]]],
    ["Dm", [["F5", 2], ["E5", 1], ["D5", 3]]],
    ["Dm", [["D5", 6]]],
    // B: bars 17 to 32
    ["F", [["A5", 3], ["C6", 1], ["A5", 2]]],
    ["F", [["G5", 2], ["F5", 1], ["G5", 2], ["A5", 1]]],
    ["C", [["G5", 3], ["E5", 1], ["G5", 2]]],
    ["C", [["F5", 2], ["E5", 1], ["D5", 2], ["E5", 1]]],
    ["Dm", [["F5", 3], ["A5", 1], ["F5", 2]]],
    ["Dm", [["E5", 2], ["D5", 1], ["E5", 2], ["F5", 1]]],
    ["A", [["E5", 3], ["C#5", 1], ["E5", 2]]],
    ["A", [["A5", 6]]],
    ["F", [["A5", 2], ["G5", 1], ["F5", 2], ["A5", 1]]],
    ["C", [["G5", 2], ["F5", 1], ["E5", 2], ["G5", 1]]],
    ["Bb", [["F5", 2], ["E5", 1], ["D5", 2], ["F5", 1]]],
    ["A", [["E5", 3], ["D5", 1], ["C#5", 2]]],
    ["Dm", [["D5", 3], ["A4", 1], ["D5", 2]]],
    ["Dm", [["F5", 2], ["E5", 1], ["D5", 3]]],
    ["A", [["C#5", 3], ["E5", 1], ["A4", 2]]],
    ["Dm", [["D5", 6]]],
  ];
  const score = [...intro.map((c) => [c, null, 0]), ...tune.map(([c, m]) => [c, m, 1]), ...tune.map(([c, m]) => [c, m, 2])];
  const loop = score.length * bar;
  const tail = 4;
  const b = bus(loop + tail);
  const swing = () => (rnd() - 0.5) * 0.012;

  // the hurdy-gurdy's drones, D and A, the whole loop long, the wheel's speed wavering a little;
  // a second's rise at the start and fall past the end, which the fold lays over each other, so
  // the drone crosses the loop's seam unbroken
  for (const [n, g, pan] of [["D3", 0.05, -0.35], ["A3", 0.03, -0.3]]) {
    const v = voice(hz(n), loop, { amp: wheel, attack: 1, release: 1, drift: 3, rnd, top: 5000 });
    const sway = v.map((s, i) => s * (0.85 + 0.15 * Math.sin((2 * Math.PI * 0.55 * i) / 44100)));
    mixIn(b, sway, 0, pan, g);
  }

  score.forEach(([name, melody, pass], i) => {
    const t0 = i * bar;
    const [r, th, f] = CHORDS[name];
    // the lute: the root low on the step, then the chord broken in eighths
    const low = name === "Bb" || name === "A" ? 2 : 3;
    const pattern = [`${r}${low}`, `${f}3`, `${r}4`, `${th}4`, `${f}3`, `${r}4`];
    pattern.forEach((n, k) => {
      const accent = k === 0 ? 1 : k === 3 ? 0.8 : 0.55;
      const p = pluck(hz(n), { ring: k === 0 ? 2.6 : 1.5, bright: 0.45, rnd });
      mixIn(b, p, t0 + k * eighth + swing(), 0.25, 0.16 * accent * (0.9 + rnd() * 0.2));
    });

    // the bodhran: the two steps of the bar, a light tap before each
    const steps = pass === 0 ? [[0, 1], [3, 0.7]] : [[0, 1], [2, 0.3], [3, 0.75], [5, 0.35]];
    for (const [k, v] of steps) {
      const hit = v > 0.5 ? drum(68, { decay: 0.3, slap: 0.3, rnd }) : drum(105, { decay: 0.12, slap: 0.5, rnd });
      mixIn(b, hit, t0 + k * eighth + swing(), 0.05, 0.3 * v);
    }

    if (!melody) return;
    // the tune: the fiddle on the first pass, the recorder on the second
    let at = t0;
    for (const [n, len] of melody) {
      const dur = len * eighth;
      if (pass === 1) {
        const v = voice(hz(n), dur * 0.95, { amp: bowed, attack: 0.05, release: 0.12, vibRate: 5.6, vibDepth: 14, vibDelay: 0.22, drift: 2, rnd, top: 7000 });
        mixIn(b, v, at + swing(), -0.05, 0.14);
      } else {
        const v = voice(hz(n), dur * 0.9, { amp: fipple, attack: 0.03, release: 0.08, vibRate: 5, vibDepth: 6, vibDelay: 0.25, drift: 1, rnd, top: 6000 });
        mixIn(b, v, at + swing(), 0.1, 0.13);
      }
      at += dur;
    }
    // the second pass: the fiddle low under the recorder, the chord's tones a dotted quarter each
    if (pass === 2) {
      const under = [`${r}4`, `${name === "A" ? "E" : th}4`];
      under.forEach((n, k) => {
        const v = voice(hz(n), bar / 2 - 0.02, { amp: bowed, attack: 0.09, release: 0.15, vibRate: 5.2, vibDepth: 10, vibDelay: 0.25, drift: 2, rnd, top: 6000 });
        mixIn(b, v, t0 + (k * bar) / 2 + swing(), -0.3, 0.075);
      });
    }
  });

  soften(b, 9000);
  const wet = hall(b, { room: 0.7, damp: 0.5, size: 0.9 });
  return { loop, mix: master(b, wet, { loop, wetGain: 0.35, rmsDb: -14 }) };
}

const TRACKS = { chapel, inn };
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TRACKS);
const tmp = mkdtempSync(join(tmpdir(), "barrowspire-music-"));
try {
  for (const name of names) {
    const make = TRACKS[name];
    if (!make) throw new Error(`no track ${name}: ${Object.keys(TRACKS).join(", ")}`);
    const started = Date.now();
    const { loop, mix } = make();
    const master = join(tmp, `${name}.wav`);
    writeFileSync(master, wav(mix));
    if (process.env.KEEP_WAV) writeFileSync(join(process.env.KEEP_WAV, `${name}.wav`), wav(mix));
    execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "192000", master, join(OUT, `${name}.m4a`)]);
    console.log(`${name}: ${loop.toFixed(1)} s loop, rendered in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
