import { moonlit } from './werewolf.mjs';

export function roomBadges(game, room) {
  const badges = [];
  if (moonlit(game, room))
    badges.push({
      id: 'moonlight',
      icon: '☾',
      label: '月光',
      description: '本室狼人力量 +1。人物可在此封窗，解除月光加成。',
    });
  if (room.states?.boarded)
    badges.push({
      id: 'boarded',
      icon: '▥',
      label: '已封窗',
      description: '窗户已经封住，本室的月光加成失效。',
    });
  if (room.target === 'fuse')
    badges.push({
      id: 'fuse',
      icon: room.done ? '✓' : 'ϟ',
      label: room.done ? '保险丝已取走' : '保险丝',
      description: room.done
        ? '此处的保险丝已经收集。'
        : '进入此房间后，可通过房间行动收集保险丝。',
    });
  const goals = {
    seal: '祭坛封印',
    mirror: '古镜调查',
    generator: '修复发电机',
    moonSeal: '月印净化',
    moonRitual: '入口解咒',
  };
  if (room.target && room.target !== 'fuse')
    badges.push({
      id: 'goal',
      icon: room.done ? '✓' : '⚑',
      label: goals[room.target] || '剧本目标',
      description: room.done
        ? '此处目标已经完成。'
        : '这是本章的目标地点。进入此房间后，在人物行动中查看目标操作。',
    });
  for (const token of room.tokens || []) {
    if (token.hidden || token.revealed === false) continue;
    badges.push({
      id: 'token-' + token.id,
      icon: token.icon || '◆',
      label: token.label || '房间标记',
      description: token.description || '',
    });
  }
  return badges;
}
