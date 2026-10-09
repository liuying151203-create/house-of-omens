import { EVENTS, FLOORS, ITEMS, OMENS, TRAITS } from './game-data.mjs';

const cards = [...EVENTS, ...ITEMS, ...OMENS];
const eventCategories = {
  DiceRolled: '投骰',
  CheckResolved: '检定结果',
  TraitChanged: '属性',
  DamageApplied: '伤害',
  EntityMoved: '移动',
  TrapTriggered: '陷阱',
  ItemUsed: '物品',
  ItemTransferred: '物品',
  ItemDropped: '物品',
  ItemPickedUp: '物品',
  CardGained: '卡牌',
  StatusAdded: '状态',
  StatusChanged: '状态',
  StatusRemoved: '状态',
  Broadcast: '播报',
};
const statusLabels = {
  infection: '狼毒',
  immunity: '净血保护',
};

const heroName = (game, id) =>
  game.heroes.find((hero) => hero.id === id)?.name || `人物 ${id}`;
const roomName = (game, id) =>
  game.rooms.find((room) => room.id === id)?.name || id;
const entityName = (game, event) =>
  event.entityType === 'hero'
    ? heroName(game, event.entityId)
    : event.name ||
      game.enemies.find((enemy) => enemy.id === event.entityId)?.name ||
      event.entityId;
const cardName = (id) => cards.find((card) => card.id === id)?.title || id;

function allocationText(allocation = {}) {
  return Object.entries(allocation)
    .filter(([, amount]) => amount > 0)
    .map(([trait, amount]) => `${TRAITS[trait] || trait}左移${amount}格`)
    .join('、');
}
function damageSource(game, event) {
  if (event.sourceCardId) return `「${cardName(event.sourceCardId)}」`;
  if (event.sourceEnemyId)
    return (
      game.enemies.find((enemy) => enemy.id === event.sourceEnemyId)?.name ||
      '敌人攻击'
    );
  if (event.causeTag === 'steam') return '锅炉房蒸汽';
  if (event.causeTag === 'trapHit') return '捕兽夹';
  if (event.sourceRoomId) return `「${roomName(game, event.sourceRoomId)}」`;
  return '';
}

export function eventJournalText(game, event) {
  switch (event.type) {
    case 'DiceRolled':
      if (event.rerollOf)
        return `${heroName(game, event.heroId)}使用「${cardName(event.sourceItemId || 'family-ring')}」重掷第${(event.rerollDieIndices?.[0] ?? 0) + 1}枚骰子：${event.rerollBefore?.[0] ?? '？'} → ${event.rerollAfter?.[0] ?? event.dice[0]} 点${event.rerollTotal === undefined ? '' : `，本组现为${event.rerollTotal}点`}。`;
      return `${event.label || '检定'}投出 ${event.dice.join('、')} 点，合计 ${event.dice.reduce((sum, face) => sum + face, 0)} 点。`;
    case 'CheckResolved':
      return `${event.title}：${event.total} / ${event.threshold}，${event.success ? '成功' : '失败'}。${event.outcome || ''}`;
    case 'Broadcast':
      return `${event.title}${event.text ? `：${event.text.replace(/\s+/g, ' ')}` : ''}`;
    case 'TraitChanged':
      return `${heroName(game, event.heroId)}的${event.label || TRAITS[event.trait] || event.trait}向${event.steps > 0 ? '右' : '左'}移动${Math.abs(event.steps)}格（数值 ${event.before} → ${event.after}）。`;
    case 'HeroRested':
      return event.text;
    case 'DamageApplied': {
      const kind = event.damageType === 'physical' ? '肉体' : '精神',
        allocation = allocationText(event.allocation),
        source = damageSource(game, event),
        prefix = source
          ? `${heroName(game, event.heroId)}因${source}`
          : heroName(game, event.heroId);
      if (!event.actualAmount)
        return `${prefix}受到的${event.rawAmount}点${kind}伤害已全部抵消，属性未下降。`;
      return `${prefix}承受${event.actualAmount}点${kind}伤害${event.preventedAmount ? `，另抵消${event.preventedAmount}点` : ''}${allocation ? `：${allocation}` : ''}。`;
    }
    case 'EntityMoved':
      return `${entityName(game, event)}从「${roomName(game, event.fromRoomId)}」移动到「${roomName(game, event.toRoomId)}」。`;
    case 'TrapTriggered':
      return `${event.enemyName || '敌人'}进入「${roomName(game, event.roomId)}」时触发捕兽夹，受到2点环境伤害并停止移动。`;
    case 'RoomRelocated': {
      const floor = FLOORS.find((entry) => entry.id === event.after?.floor);
      return `「${roomName(game, event.roomId)}」移动到${floor?.name || '其他楼层'}（${event.after?.x}, ${event.after?.y}）。`;
    }
    case 'CardGained':
      return `${heroName(game, event.heroId)}获得「${cardName(event.cardId)}」。`;
    case 'ItemTransferred':
      return `${heroName(game, event.fromHeroId)}把「${cardName(event.cardId)}」交给${heroName(game, event.toHeroId)}。`;
    case 'ItemDropped':
      return `${heroName(game, event.heroId)}把「${cardName(event.cardId)}」留在「${roomName(game, event.roomId)}」。`;
    case 'ItemPickedUp':
      return `${heroName(game, event.heroId)}在「${roomName(game, event.roomId)}」拾取「${cardName(event.cardId)}」。`;
    case 'ItemUsed':
      return `${heroName(game, event.heroId)}使用「${cardName(event.itemId)}」${event.consumed ? '（已消耗）' : ''}${event.resultText ? `：${event.resultText}` : ''}。`;
    case 'StatusAdded':
      return `${heroName(game, event.heroId)}获得${event.statusLabel || statusLabels[event.statusId] || event.statusId}状态。`;
    case 'StatusRemoved':
      return `${heroName(game, event.heroId)}的${event.statusLabel || statusLabels[event.statusId] || event.statusId}状态结束。`;
    case 'StatusChanged':
      return `${heroName(game, event.heroId)}的${event.statusLabel || statusLabels[event.statusId] || event.statusId}${event.field === 'turns' ? `剩余 ${event.after} 轮` : `发生变化（${event.before} → ${event.after}）`}。`;
    case 'FactionChanged':
      return `${heroName(game, event.heroId)}加入${event.toFaction === 'wolves' ? '狼群' : '幸存者'}阵营。`;
    default:
      return null;
  }
}

export function eventJournalEntries(game, limit = 20) {
  const settledDamage = new Set(
    (game.events || [])
      .filter((event) => event.type === 'DamageApplied' && event.causeId)
      .map((event) => `${event.heroId}:${event.causeId}`),
  );
  return [...(game.events || [])]
    .reverse()
    .filter(
      (event) =>
        event.visibility !== 'internal' &&
        !(
          event.type === 'TraitChanged' &&
          event.causeId &&
          settledDamage.has(`${event.heroId}:${event.causeId}`)
        ),
    )
    .map((event) => ({
      id: `event-${event.id}`,
      round: event.round,
      text: eventJournalText(game, event),
      type: event.type,
      category: eventCategories[event.type] || '事件',
    }))
    .filter((entry) => entry.text)
    .slice(0, limit);
}
