import { resolveCard } from './card-rules.mjs';
import { ROOM_DECK, OMENS } from './game-data.mjs';
import { WOLF_RULES, moonlit } from './werewolf.mjs';

const thresholdRows = (n, success, failure) => [
  { range: `${n}+ 点`, effect: success },
  { range: `低于 ${n} 点`, effect: failure },
];

// Captured with the dice request, so saves and other players see the same rules.
export function rollOutcomes(s, action = {}, current) {
  if (current?.kind === 'card') {
    const card = resolveCard(
      s,
      current.cardType,
      current.cardId,
      current.heroId,
    );
    return card?.trait
      ? thresholdRows(card.threshold, card.success.text, card.failure.text)
      : [];
  }
  if (current?.kind === 'roomFall')
    return [0, 1, 2].map((n) => ({
      range: `${n} 点`,
      effect: n ? `该人物承受 ${n} 点肉体伤害。` : '该人物不受伤。',
    }));
  if (current?.kind === 'hauntRoll')
    return s.omens >= OMENS.length
      ? [{ range: '任意点数', effect: '最后一张预兆已揭示，作祟必然开始。' }]
      : thresholdRows(5, '作祟开始，揭示剧本。', '继续探索，作祟尚未开始。');
  if (action.type === 'useElevator')
    return [
      { range: '0 点', effect: '地下室；每名乘员另投 1 枚骰决定肉体伤害。' },
      { range: '1 点', effect: '地下室。' },
      { range: '2 点', effect: '一楼。' },
      { range: '3 点', effect: '二楼。' },
      {
        range: '4 点',
        effect: '任意楼层的合法位置，包括当前楼层；也可留在原位。',
      },
      {
        range: '停靠规则',
        effect:
          '0–3 点若指向当前楼层则原位停靠；无合法落点也留在原位。每次启动消耗 1 移动。',
      },
    ];
  if (action.type === 'cure')
    return thresholdRows(
      WOLF_RULES.cureThreshold,
      '清除目标狼毒，获得两轮净血保护。',
      '狼毒保留，下次治疗累计加值 +1。',
    );
  if (action.type === 'attack') {
    const enemy = s.enemies.find((e) => e.id === action.id);
    const cap =
      enemy?.kind === 'alpha'
        ? moonlit(
            s,
            s.rooms.find((r) => r.id === enemy.pos),
          )
          ? 2
          : 3
        : null;
    return [
      {
        range: '你的点数 > 对方',
        effect: `敌人损失点数差对应的生命${cap ? `，狼王厚皮使伤害最多 ${cap} 点` : ''}。`,
      },
      { range: '双方相等', effect: '双方均不受伤。' },
      {
        range: '你的点数 < 对方',
        effect: '你承受点数差对应的肉体伤害，最多 3 点。',
      },
    ];
  }
  if (['endHero', 'endRound'].includes(action.type))
    return [
      {
        range: '攻击点数 > 防御',
        effect:
          '被攻击人物承受点数差对应的肉体伤害，最多 3 点；狼人造成伤害时，未受净血保护的人物感染狼毒。',
      },
      {
        range: '攻击点数 ≤ 防御',
        effect: '挡住攻击，不受伤，也不触发狼毒感染。',
      },
    ];
  if (action.type === 'interact') {
    const room = s.rooms.find((r) => r.id === s.heroes[s.active].pos);
    if (room?.target === 'moonSeal')
      return thresholdRows(
        WOLF_RULES.ritualThreshold,
        `本处月印净化进度 +1（当前 ${room.charges || 0}/${room.requiredCharges}）。`,
        '进度不变，下次尝试累计加值 +1。',
      );
    if (room?.target === 'seal')
      return thresholdRows(
        3 + Math.floor((s.count - 3) / 2),
        '封印本处祭坛。',
        '本次未封印，下次尝试累计加值 +1。',
      );
  }
  const destination =
    action.type === 'move'
      ? s.rooms.find((r) => r.id === action.pos)
      : current?.kind === 'placement'
        ? ROOM_DECK.find((r) => r.id === current.tileId)
        : null;
  if (destination?.special === 'collapse')
    return thresholdRows(
      5,
      '站稳，留在坍塌房间。',
      '坠入地下室，选择首次落点后另投 1 枚骰决定肉体伤害。',
    );
  return [];
}
