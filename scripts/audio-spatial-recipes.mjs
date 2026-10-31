import { SPATIAL_LOOPS, STORY_CUES } from '../lib/audio-spatial.mjs';
const tau = Math.PI * 2;
function bell(t, hz, length) {
  if (t < 0 || t >= length) return 0;
  return (
    Math.min(1, t / 0.02) *
    Math.exp((-5 * t) / length) *
    Math.min(1, (length - t) / 0.1) *
    (Math.sin(tau * hz * t) + 0.2 * Math.sin(tau * hz * 2.73 * t))
  );
}
export function spatialSamples(id, rate) {
  if (STORY_CUES.includes(id)) {
    const index = STORY_CUES.indexOf(id),
      duration = 1.8;
    let seed = 4301 + index,
      low = 0;
    return Float32Array.from({ length: duration * rate }, (_, i) => {
      const t = i / rate,
        u = t / duration;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2 ** 31 - 1;
      low = 0.88 * low + 0.12 * noise;
      const envelope = Math.sin(Math.PI * u) ** 2;
      if (id === 'storyWhisper')
        return low * envelope * (0.3 + 0.7 * Math.sin(t * 13) ** 2);
      if (id === 'storyWind') return low * envelope;
      if (id === 'storyPaper' || id === 'storyAsh' || id === 'storyFlame')
        return (
          noise *
          envelope *
          (0.1 +
            0.8 *
              Math.max(0, Math.sin(t * (id === 'storyFlame' ? 63 : 19))) ** 8)
        );
      if (id === 'storySteps')
        return (
          [0, 0.55, 1.1].reduce((s, on) => s + bell(t - on, 85, 0.35), 0) +
          low * envelope * 0.3
        );
      if (id === 'storyDoor' || id === 'storyCreak')
        return envelope * (Math.sin(tau * (70 * t + 30 * t * t)) * 0.4 + low);
      if (id === 'storyBite') return envelope * (low + bell(t - 0.25, 75, 0.5));
      return (
        envelope * (Math.sin(tau * 117 * t) + Math.sin(tau * 123 * t)) * 0.3
      );
    });
  }
  if (!SPATIAL_LOOPS.includes(id)) return null;
  const duration = 12,
    index = SPATIAL_LOOPS.indexOf(id);
  const wind = id === 'floorUpper',
    basement = id === 'floorBasement';
  const base =
    id === 'roomSteam' ? 570 : wind ? 180 : basement ? 37 : 45 + index * 9;
  const partials = Array.from({ length: 22 }, (_, n) => ({
    hz: Math.round((base + n * (wind ? 23 : 11.7)) * duration) / duration,
    phase: (n * 2.399 + index) % tau,
    amp: 1 / (n + 3),
  }));
  return Float32Array.from({ length: duration * rate }, (_, i) => {
    const t = i / rate;
    let v =
      partials.reduce(
        (s, p, n) =>
          s +
          Math.sin(tau * p.hz * t + p.phase) *
            p.amp *
            (0.7 +
              0.3 * Math.sin((tau * ((n % 3) + 1) * t) / duration + p.phase)),
        0,
      ) * 0.12;
    const note = (offset, hz, len) =>
      bell((t - offset + duration) % duration, hz, len);
    if (basement)
      v += note(2.1, 1400, 0.35) * 0.17 + note(8.7, 1100, 0.4) * 0.12;
    if (id === 'roomLab')
      v += note(3.2, 1900, 0.5) * 0.2 + note(9.1, 2300, 0.4) * 0.1;
    if (id === 'roomClock')
      for (let k = 0; k < 12; k++)
        v += note(k, k % 2 ? 1500 : 1800, 0.06) * 0.16;
    if (id === 'roomChapel')
      v += note(1, 196, 5) * 0.15 + note(7, 294, 4) * 0.1;
    if (id === 'roomMusic')
      v +=
        note(1, 261, 3) * 0.25 + note(6, 310, 3) * 0.2 + note(9, 367, 2) * 0.1;
    if (id === 'themeBells') v += note(0, 110, 5) * 0.5 + note(6, 165, 4) * 0.3;
    if (id === 'themeMirror')
      v += note(2, 1568, 4) * 0.22 + note(8, 1480, 3) * 0.22;
    if (id === 'themeFlood')
      v += Math.sin(tau * 31 * t) * (0.3 + 0.2 * Math.sin((tau * t) / 12));
    if (id === 'themeWolves' || id === 'themeBloodmoon')
      v +=
        Math.sin(tau * 55 * t) *
        (0.15 +
          0.25 *
            Math.max(
              0,
              Math.cos((tau * t) / (id === 'themeBloodmoon' ? 1 : 2)),
            ) **
              6);
    return v;
  });
}
export const VARIANT_SOURCES = {
  stepWood2: ['step', 0.9],
  stepWood3: ['step', 1.12],
  stepStone1: ['stairs', 0.84],
  stepStone2: ['stairs', 1.14],
  stepWet1: ['step', 0.82],
  stepWet2: ['step', 0.94],
  stepWolf1: ['enemyStep', 0.8],
  stepWolf2: ['enemyStep', 0.92],
  stepSpectre1: ['enemyStep', 1.1],
  stepSpectre2: ['enemyStep', 1.24],
  diceRoll2: ['diceRoll', 0.93],
  diceRoll3: ['diceRoll', 1.08],
};
export function variantSamples(id, base) {
  const [, speed] = VARIANT_SOURCES[id];
  let low = 0;
  return Float32Array.from({ length: base.length }, (_, i) => {
    const sample = base[Math.floor(i * speed)] || 0;
    low = 0.8 * low + 0.2 * sample;
    const wet = id.startsWith('stepWet'),
      spectre = id.startsWith('stepSpectre');
    const fade = Math.min(1, i / 100, (base.length - 1 - i) / 300);
    return (
      fade *
      ((spectre ? low : sample) * (wet ? 0.8 : 1) +
        (wet ? (sample - low) * Math.sin(i * 0.33) * 0.3 : 0))
    );
  });
}
