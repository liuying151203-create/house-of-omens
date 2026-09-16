import { EVENTS, FLOORS, ITEMS, OMENS, TRAITS } from './game-data.mjs';

const cards = [...EVENTS, ...ITEMS, ...OMENS];
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
    : game.enemies.find((enemy) => enemy.id === event.entityId)?.name ||
      event.entityId;
const cardName = (id) => cards.find((card) => card.id === id)?.title || id;

function allocationText(allocation = {}) {
  return Object.entries(allocation)
    .filter(([, amount]) => amount > 0)
    .map(([trait, amount]) => `${TRAITS[trait] || trait} ${amount}格`)
    .join('、');
}

export function eventJournalText(game, event) {
  switch (event.type) {
    case 'DiceRolled':
      return `${event.label || '检定'}：${event.dice.join(' + ')} = ${event.dice.reduce((sum, face) => sum + face, 0)}。`;
    case 'TraitChanged':
      return `${heroName(game, event.heroId)}的${event.label || TRAITS[event.trait] || event.trait} ${event.before} → ${event.after}。`;
    case 'DamageApplied': {
      const kind = event.damageType === 'physical' ? '肉体' : '精神',
        allocation = allocationText(event.allocation);
      if (!event.actualAmount)
        return `${heroName(game, event.heroId)}的${event.rawAmount}点${kind}伤害已全部抵消。`;
      return `${heroName(game, event.heroId)}承受${event.actualAmount}点${kind}伤害${event.preventedAmount ? `，另抵消${event.preventedAmount}点` : ''}${allocation ? `（${allocation}）` : ''}。`;
    }
    case 'EntityMoved':
      return `${entityName(game, event)}从「${roomName(game, event.fromRoomId)}」移动到「${roomName(game, event.toRoomId)}」。`;
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
      return `${heroName(game, event.heroId)}使用「${cardName(event.itemId)}」${event.consumed ? '并消耗了它' : ''}。`;
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
  return [...(game.events || [])]
    .reverse()
    .filter((event) => event.visibility !== 'internal')
    .map((event) => ({
      id: `event-${event.id}`,
      round: event.round,
      text: eventJournalText(game, event),
      type: event.type,
    }))
    .filter((entry) => entry.text)
    .slice(0, limit);
}
