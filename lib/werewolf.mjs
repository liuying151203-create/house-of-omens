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
export function windowsOf(r) {
  return (r.windows || []).map((d) => (d + (r.rotation || 0)) % 4);
}
export function exposedWindows(s, r) {
  if (r.floor < 0) return [];
  const offsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  return windowsOf(r).filter(
    (d) =>
      !s.rooms.some(
        (n) =>
          n.floor === r.floor &&
          n.x === r.x + offsets[d][0] &&
          n.y === r.y + offsets[d][1],
      ),
  );
}
export function moonlit(s, r) {
  return (
    !!r &&
    s.scenario === 'werewolf' &&
    s.phase !== 'explore' &&
    !r.states?.boarded &&
    exposedWindows(s, r).length > 0
  );
}
export function wolfMight(s, e) {
  return (
    e.might +
    (['alpha', 'wolf'].includes(e.kind) &&
    moonlit(
      s,
      s.rooms.find((r) => r.id === e.pos),
    )
      ? 1
      : 0)
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
export function chooseHaunt(omenId, room) {
  const wild = ['locket', 'bone', 'thorn', 'mask'];
  const haunted = ['mirror-shard', 'doll', 'eye'];
  const tags = room?.tags || [];
  if (wild.includes(omenId) && tags.includes('moon')) return 'werewolf';
  if (
    haunted.includes(omenId) ||
    (omenId === 'locket' && tags.includes('memory'))
  )
    return 'mirror';
  if (['compass', 'key'].includes(omenId) || tags.includes('water'))
    return 'flood';
  if (wild.includes(omenId)) return 'werewolf';
  return 'bells';
}
