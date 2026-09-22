import { modifierValue } from './modifiers.mjs';
export { exposedWindows, moonlit, windowsOf } from './room-environment.mjs';

// Original rules: static definitions stay separate from per-game room/status state.
export const WOLF_RULES = Object.freeze({
  infectionRounds: 3,
  immunityRounds: 2,
  cureThreshold: 3,
  ritualThreshold: 4,
  sealsRequired: 2,
  limit: 12,
});
export const STATUS_DEFINITIONS = {
  infection: {
    name: '狼毒感染',
    description: '倒计时结束加入狼群；同室人物可尝试治疗。',
  },
  immunity: { name: '净血保护', description: '暂时不会再次感染。' },
};
export function wolfStats(count, alpha = true) {
  return alpha
    ? { hp: 10 + 4 * (count - 3), might: count >= 5 ? 6 : 5, speed: 2 }
    : { hp: 3, might: 3, speed: 1 };
}
export function wolfMight(s, e, context = {}) {
  return modifierValue(
    s,
    'enemy.might',
    { enemyId: e.id, ...context },
    e.might,
  );
}
export const statusOf = (h, id) => (h.statuses || []).find((x) => x.id === id);
export function infect(s, h) {
  if (
    h.dead ||
    h.traitor ||
    statusOf(h, 'infection') ||
    statusOf(h, 'immunity')?.until > s.elapsed
  )
    return false;
  h.statuses ||= [];
  h.statuses.push({
    id: 'infection',
    turns: WOLF_RULES.infectionRounds,
    acquired: s.elapsed,
    attempts: 0,
  });
  return true;
}
export function cure(s, h) {
  h.statuses = (h.statuses || []).filter(
    (x) => !['infection', 'immunity'].includes(x.id),
  );
  // +1 because the next enemy phase occurs after the current action round.
  h.statuses.push({
    id: 'immunity',
    until: s.elapsed + WOLF_RULES.immunityRounds + 1,
  });
}
// 保留既有导入路径；组合触发由剧本注册表统一解析。
export { chooseHaunt } from './content/scenarios/index.mjs';
