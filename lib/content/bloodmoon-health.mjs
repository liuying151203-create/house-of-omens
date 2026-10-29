import { isAlpha, moonPhase } from './bloodmoon-actors.mjs';

export const BODY_TRAITS = ['might', 'speed'];

// 只有耗尽全部可扣身体格数后，才允许把不可避免的余伤分配到下限。
// amount=1 用于逐点分配，防止旧命令提前丢弃伤害。
export function ordinaryDamageLimits(
  game,
  hero,
  request,
  amount = request.remaining,
) {
  if (
    (!request.nonlethal && !isAlpha(game, hero)) ||
    request.damageType !== 'physical' ||
    (!request.nonlethal && request.causeTag === 'silverShot')
  )
    return null;
  const keys = request.traits || BODY_TRAITS;
  const capacity = Object.fromEntries(
    keys.map((key) => [key, Math.max(0, hero.stats[key] - 1)]),
  );
  const excess = Math.max(
    0,
    amount - Object.values(capacity).reduce((sum, value) => sum + value, 0),
  );
  return Object.fromEntries(keys.map((key) => [key, capacity[key] + excess]));
}

// 所有属性移动与伤害预览共用此边界，恢复按钮不能绕过银弹上限。
export function traitPositionBounds(
  game,
  hero,
  trait,
  cause = {},
  maximum = hero.tracks[trait].length - 1,
) {
  if (!isAlpha(game, hero))
    return {
      minimum: cause.nonlethal || game.phase === 'explore' ? 1 : 0,
      maximum,
    };
  const body = BODY_TRAITS.includes(trait);
  return {
    minimum: cause.nonlethal
      ? 1
      : !body || cause.causeTag === 'silverShot'
        ? 0
        : 1,
    maximum:
      body &&
      (hero.silverWeakened ||
        (cause.causeTag === 'bloodlust' && moonPhase(game.elapsed) === 'full'))
        ? Math.min(4, maximum)
        : maximum,
  };
}

export function ordinaryKnockdown(game, hero, trait, delta, cause) {
  return (
    isAlpha(game, hero) &&
    BODY_TRAITS.includes(trait) &&
    cause.damageType === 'physical' &&
    cause.causeTag !== 'silverShot' &&
    delta < 0 &&
    hero.stats[trait] + delta <= 0
  );
}
