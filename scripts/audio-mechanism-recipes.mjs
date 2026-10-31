// Original procedural foley. Each recipe has an independent deterministic seed.
export function mechanismSamples(id, rate) {
  const recipes = {
    inventory: [0.25, 180, 4, 0.55],
    drink: [0.65, 420, 3, 0.28],
    bandage: [0.55, 900, 5, 0.8],
    craft: [1.1, 760, 5, 0.22],
    metal: [0.4, 1250, 2, 0.15],
    steam: [1.4, 1600, 1, 1],
    trapSnap: [0.35, 1800, 2, 0.8],
    shot: [0.65, 70, 1, 0.95],
    silverShot: [0.85, 2200, 1, 0.8],
    ring: [0.8, 1800, 2, 0.02],
    ward: [0.7, 640, 2, 0.06],
    infection: [0.8, 60, 3, 0.1],
    infectionDeep: [1.1, 43, 4, 0.2],
    cleanse: [1, 880, 3, 0.06],
    transform: [1.4, 110, 2, 0.35],
    moon: [1.3, 48, 3, 0.15],
    bloodlust: [0.75, 100, 2, 0.2],
    pursuit: [0.5, 150, 3, 0.7],
    weakness: [1, 58, 2, 0.3],
    silverBurn: [0.9, 2300, 2, 0.6],
    elevator: [1.4, 90, 4, 0.4],
    collapse: [0.9, 130, 6, 0.9],
    fall: [0.8, 110, 1, 0.8],
    passage: [0.9, 160, 2, 0.5],
    bell: [1.5, 220, 1, 0.01],
    glass: [0.9, 2100, 4, 0.2],
    generator: [1.5, 55, 6, 0.3],
    board: [0.6, 260, 3, 0.7],
    threat: [1.3, 48, 3, 0.2],
    relief: [0.8, 520, 2, 0.05],
    networkJoin: [0.3, 660, 2, 0],
    networkLeave: [0.3, 330, 2, 0],
    networkLost: [0.5, 160, 3, 0],
    networkBack: [0.4, 880, 2, 0],
    error: [0.25, 140, 2, 0.05],
    uiTick: [0.06, 900, 1, 0.1],
  };
  const recipe = recipes[id];
  if (!recipe) return null;
  const [duration, frequency, pulses, noise] = recipe;
  let seed =
      [...id].reduce((s, c) => Math.imul(s, 31) + c.charCodeAt(0), 17) >>> 0,
    filtered = 0;
  return Float32Array.from({ length: Math.ceil(rate * duration) }, (_, i) => {
    const t = i / rate,
      phase = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    filtered = 0.65 * filtered + 0.35 * (seed / 2 ** 31 - 1);
    const envelope = Math.min(1, t / 0.006) * Math.pow(1 - phase, 2);
    const pulse =
      0.25 +
      0.75 * Math.pow(Math.max(0, Math.cos(phase * pulses * Math.PI * 2)), 4);
    const sweep = ['fall', 'transform', 'bloodlust'].includes(id)
      ? 1.6 - 0.7 * phase
      : 1;
    const f = 2 * Math.PI * frequency * t * sweep;
    const metallic =
      Math.sin(f) + 0.32 * Math.sin(f * 2.76) + 0.18 * Math.sin(f * 4.07);
    return (
      envelope * pulse * (noise * filtered * 3 + (1 - noise) * metallic * 0.45)
    );
  });
}
