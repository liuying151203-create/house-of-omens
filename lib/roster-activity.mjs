// 只根据当前展示步骤和待处理请求显示状态，避免用已完成的通知推测动作。
export function rosterActivity(game, hero, request, mapStep) {
  if (!hero || hero.dead || hero.traitor) return null;
  if (mapStep?.kind === 'move' && mapStep.heroId === hero.id)
    return { kind: 'move', label: '正在移动' };
  if (request?.kind === 'damage' && request.heroId === hero.id)
    return { kind: 'damage', label: '正在分配伤害' };
  if (request?.kind === 'diceRequest') {
    const roll = request.rolls?.find((entry) => entry.heroId === hero.id);
    if (roll) {
      if (/防御|闪避/.test(roll.label || ''))
        return { kind: 'defend', label: '正在防御' };
      if (/攻击/.test(roll.label || ''))
        return { kind: 'attack', label: '正在攻击' };
      if (
        request.sourceCardId &&
        request.heroId === hero.id &&
        [...(hero.items || []), ...(hero.omens || [])].includes(
          request.sourceCardId,
        )
      )
        return { kind: 'item', label: '正在使用物品' };
      return { kind: 'check', label: '正在检定' };
    }
  }
  if (hero.id === game.active && !hero.ended)
    return { kind: 'turn', label: '当前行动人物' };
  return null;
}
