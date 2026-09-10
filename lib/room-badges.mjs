import { moonlit } from './werewolf.mjs';

export function roomBadges(game, room) {
  const badges = [];
  if (room.special === 'elevator')
    badges.push({
      id: 'elevator',
      icon: '↕',
      label: '神秘电梯',
      description:
        '在人物行动中主动启动，掷 2 枚骰：0–1 地下室，2 一楼，3 二楼，4 任选楼层；0 点时室内每名探险者各受 1 枚骰肉体伤害。每名人物每轮一次，房间连同乘员和标记搬移。没有合法落点则留在原处。',
    });
  if (room.special === 'collapse')
    badges.push({
      id: 'collapse',
      icon: '↧',
      label: '坍塌房间',
      description:
        '首次发现时速度 5+ 避免坠落；之后可主动跳下，承受 1 枚骰肉体伤害。' +
        (room.collapseLanding
          ? '落点：' +
            game.rooms.find((r) => r.id === room.collapseLanding)?.name +
            '。'
          : '首次坠落时放置地下室落点。') +
        '坠落不消耗移动力，不能反向攀爬。',
    });
  if (room.id === 'basement' && !game.basementUnlocked)
    badges.push({
      id: 'return-stairs',
      icon: '↟',
      label: '回程暗梯',
      description: '在平台消耗移动力寻找暗梯，即可永久连通一楼门厅。',
    });
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
