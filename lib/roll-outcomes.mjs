import { resolveCard } from './card-rules.mjs';
import { ROOM_DECK, OMENS } from './game-data.mjs';

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
