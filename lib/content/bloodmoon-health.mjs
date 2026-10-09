import { isAlpha, moonPhase } from './bloodmoon-actors.mjs';

export const BODY_TRAITS = ['might', 'speed'];

// 所有属性移动与伤害预览共用此边界，恢复按钮不能绕过银弹上限。
export function traitPositionBounds(
  game,
  hero,
  trait,
  cause = {},
  maximum = hero.tracks[trait].length - 1,
) {
  if (!isAlpha(game, hero))
    return { minimum: game.phase === 'explore' ? 1 : 0, maximum };
  const body = BODY_TRAITS.includes(trait);
  return {
    // 精神骷髅规则尚未定义；试作先保持初始狼人只有银弹可击杀。
    minimum: body && cause.causeTag === 'silverShot' ? 0 : 1,
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
