// Reproducible sound bank: Kenney CC0 foley + original additive synthesis.
// Requires ffmpeg only when rebuilding the checked-in WAV files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AUDIO_CUES, AUDIO_LOOPS } from '../lib/audio-assets.mjs';
import { mechanismSamples } from './audio-mechanism-recipes.mjs';
import {
  spatialSamples,
  VARIANT_SOURCES,
  variantSamples,
} from './audio-spatial-recipes.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'public/audio');
await fs.mkdir(out, { recursive: true });
const rate = 24000,
  tau = Math.PI * 2;
let seed = 7419;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const notes = (midi) => 440 * 2 ** ((midi - 69) / 12);
function tone(t, hz, duration = 1.2) {
  if (t < 0 || t >= duration) return 0;
  const env =
    Math.min(1, t / 0.012) *
    Math.exp((-4 * t) / duration) *
    Math.min(1, (duration - t) / 0.08);
  return (
    env *
    (Math.sin(tau * hz * t) +
      0.24 * Math.sin(tau * hz * 2.002 * t) +
      0.09 * Math.sin(tau * hz * 3.01 * t))
  );
}
const sources = {
  explore: 'doorOpen_1.ogg',
  tilePlace: 'bookPlace1.ogg',
  step: 'footstep00.ogg',
  enemyStep: 'footstep04.ogg',
  stairs: 'footstep02.ogg',
  cardEvent: 'card-slide-1.ogg',
  cardItem: 'card-place-2.ogg',
  cardOmen: 'card-shove-1.ogg',
  diceRoll: 'dice-shake-1.ogg',
  diceStop: 'die-throw-1.ogg',
  attack: 'knifeSlice.ogg',
  hit: 'chop.ogg',
};
const melodies = {
  checkSuccess: [62, 69],
  checkFailure: [57, 53],
  hauntRoll: [38, 39],
  haunt: [38, 45, 39, 38],
  mentalHit: [81, 80, 57],
  traitUp: [62, 65, 69],
  traitDown: [62, 58, 55],
  heal: [57, 64, 69],
  turn: [69, 74],
  round: [50, 62],
  objective: [62, 69, 74],
  objectiveDone: [62, 65, 69, 74],
  death: [50, 46, 38],
  enemyDeath: [57, 50, 38],
  victory: [62, 65, 69, 74, 81],
  defeat: [50, 46, 41, 38],
};
function writeWav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = 0.32 / Math.max(0.001, peak);
  samples.forEach((v, i) =>
    b.writeInt16LE(Math.round(v * gain * 32767), 44 + i * 2),
  );
  return b;
}
for (const id of AUDIO_CUES) {
  if (VARIANT_SOURCES[id]) continue;
  let a = spatialSamples(id, rate) || mechanismSamples(id, rate);
  if (a) {
    // New mechanism cues do not alter the first bank or its loop RNG.
  } else if (sources[id]) {
    const raw = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      path.join(root, 'scripts/audio-source', sources[id]),
      '-f',
      'f32le',
      '-ac',
      '1',
      '-ar',
      String(rate),
      'pipe:1',
    ]);
    const samples = new Float32Array(
      raw.buffer,
      raw.byteOffset,
      raw.length / 4,
    );
    const start = samples.findIndex((v) => Math.abs(v) > 0.002);
    const length =
      id === 'diceRoll'
        ? 0.7
        : id === 'diceStop'
          ? 0.18
          : id.startsWith('card')
            ? 0.65
            : id === 'explore'
              ? 1.1
              : 0.5;
    a = new Float32Array(Math.ceil(length * rate));
    for (let i = 0; i < a.length; i++) {
      const speed = id === 'enemyStep' ? 0.76 : 1;
      a[i] =
        (samples[start + Math.floor(i * speed)] || 0) *
        Math.min(1, i / 100, (a.length - i) / 400);
      if (id === 'cardItem')
        a[i] += 0.025 * tone(i / rate - 0.12, notes(74), 0.5);
      if (id === 'cardOmen') a[i] += 0.05 * tone(i / rate, notes(38), 0.65);
    }
  } else {
    const sequence = melodies[id];
    if (!sequence) throw Error(`Missing recipe: ${id}`);
    const long = ['haunt', 'victory', 'defeat'].includes(id);
    const spacing = long ? 0.38 : 0.11;
    const duration = long ? 2.8 : 1.1;
    a = Float32Array.from({ length: duration * rate }, (_, i) => {
      const t = i / rate;
      return (
        sequence.reduce(
          (sum, midi, j) =>
            sum + tone(t - spacing * j, notes(midi), long ? 1.4 : 0.65),
          0,
        ) / sequence.length
      );
    });
  }
  await fs.writeFile(path.join(out, `${id}.wav`), writeWav(a));
}
// Exact-period oscillators and wrapped note tails make the loops seamless.
for (const [id, [source]] of Object.entries(VARIANT_SOURCES)) {
  const buffer = await fs.readFile(path.join(out, `${source}.wav`));
  const samples = Float32Array.from(
    { length: (buffer.length - 44) / 2 },
    (_, i) => buffer.readInt16LE(44 + i * 2) / 32768,
  );
  await fs.writeFile(
    path.join(out, `${id}.wav`),
    writeWav(variantSamples(id, samples)),
  );
}
for (const id of AUDIO_LOOPS) {
  const spatial = spatialSamples(id, rate);
  if (spatial) {
    await fs.writeFile(path.join(out, `${id}.wav`), writeWav(spatial));
    continue;
  }
  const duration = 24;
  const progression =
    id === 'lobby'
      ? [50, 53, 57, 60, 57, 53]
      : id === 'exploreMusic'
        ? [38, 45, 50, 53, 45, 48]
        : [38, 39, 45, 41, 39, 38];
  const partials = Array.from({ length: 45 }, (_, n) => ({
    frequency: Math.round((30 + n * 13 + random() * 10) * duration) / duration,
    phase: random() * tau,
    amp: 0.012 / (1 + n * 0.3),
  }));
  const a = Float32Array.from({ length: duration * rate }, (_, i) => {
    const t = i / rate;
    if (id === 'manor')
      return partials.reduce(
        (sum, p, n) =>
          sum +
          Math.sin(tau * p.frequency * t + p.phase) *
            p.amp *
            (0.6 +
              0.4 * Math.sin((tau * ((n % 3) + 1) * t) / duration + p.phase)),
        0,
      );
    const base = Math.round(notes(progression[0] - 12) * duration) / duration;
    let v =
      0.12 * Math.sin(tau * base * t) +
      0.035 * Math.sin(tau * (base * 1.5) * t);
    v *= 0.7 + 0.3 * Math.cos((tau * t) / 12);
    progression.forEach((midi, n) => {
      v +=
        0.11 * tone((t - n * 4 + duration) % duration, notes(midi + 12), 3.8);
      v +=
        0.04 *
        tone((t - n * 4 - 1.5 + duration) % duration, notes(midi + 19), 2.3);
    });
    if (id === 'hauntMusic') v += 0.035 * tone(t % 2, 55, 0.6);
    return v;
  });
  await fs.writeFile(path.join(out, `${id}.wav`), writeWav(a));
}
console.log(`Built ${AUDIO_CUES.length} cues and ${AUDIO_LOOPS.length} loops.`);
