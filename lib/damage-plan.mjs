import { traitRuleView } from './rule-views.mjs';
import { ordinaryDamageLimits } from './content/bloodmoon-health.mjs';

export const damageKeys = (kind) =>
  kind === 'physical' ? ['might', 'speed'] : ['sanity', 'knowledge'];
export function suggestDamage(
  hero,
  kind,
  amount,
  phase,
  game,
  allowedKeys,
  cause = {},
) {
  const keys = allowedKeys || damageKeys(kind),
    minimum = phase === 'explore' ? 1 : 0;
  if (keys.length === 1) return { [keys[0]]: amount };
  const views = Object.fromEntries(
    keys.map((key) => [
      key,
      game
        ? traitRuleView(game, hero, key)
        : {
            track: hero.tracks[key],
            current: hero.stats[key],
          },
    ]),
  );
  const limits =
    game &&
    ordinaryDamageLimits(game, hero, {
      ...cause,
      damageType: kind,
      traits: keys,
      remaining: amount,
    });
  let best = null;
  for (let first = 0; first <= amount; first++) {
    const allocation = { [keys[0]]: first, [keys[1]]: amount - first };
    if (limits && keys.some((key) => allocation[key] > limits[key])) continue;
    const after = keys.map((k) =>
      Math.max(limits ? 1 : minimum, views[k].current - allocation[k]),
    );
    const losses = keys.map(
      (k, i) => views[k].track[views[k].current] - views[k].track[after[i]],
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
