export const damageKeys = (kind) =>
  kind === 'physical' ? ['might', 'speed'] : ['sanity', 'knowledge'];
export function suggestDamage(hero, kind, amount, phase) {
  const keys = damageKeys(kind),
    minimum = phase === 'explore' ? 1 : 0;
  let best = null;
  for (let first = 0; first <= amount; first++) {
    const allocation = { [keys[0]]: first, [keys[1]]: amount - first };
    const after = keys.map((k) =>
      Math.max(minimum, hero.stats[k] - allocation[k]),
    );
    const losses = keys.map(
      (k, i) => hero.tracks[k][hero.stats[k]] - hero.tracks[k][after[i]],
    );
    const score =
      (after.some((n) => n === 0) ? 100000 : 0) +
      losses.reduce((a, b) => a + b, 0) * 100 +
      Math.abs(after[0] - after[1]) * 2 +
      (kind === 'physical' ? losses[1] : 0);
    if (!best || score < best.score) best = { allocation, score };
  }
  return best.allocation;
}
