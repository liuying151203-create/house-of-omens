import { collectActions } from '../engine/actions.mjs';

export const CONTENT_ACTION_DEFINITIONS = [
  {
    id: 'useElevator',
    label: '启动电梯',
    icon: 'vertical',
    detail: '消耗 1 点移动力 · 掷 2 枚骰决定楼层 · 本回合可重复启动',
    handler: 'room.elevator.use',
    available: ({ room, canMove }) => room.special === 'elevator' && canMove,
  },
  {
    id: 'jumpDown',
    label: '跳入地下室',
    icon: 'vertical',
    detail: '不消耗移动力，承受 1 枚骰的肉体伤害；无法沿原路爬回',
    handler: 'room.collapse.jump',
    available: ({ room, hero }) =>
      room.special === 'collapse' && room.collapseChecked && !hero.stopped,
  },
  {
    id: 'findReturnStairs',
    label: '寻找回程暗梯',
    icon: 'vertical',
    handler: 'room.basement.findReturn',
    describe: ({ moveCost }) => ({ detail: moveCost + ' 移动 · 永久连通门厅' }),
    available: ({ game, room, canMove, moveCost, hero }) =>
      room.id === 'basement' &&
      !game.basementUnlocked &&
      canMove &&
      hero.moves >= moveCost,
  },
];

export function contentActions(game, context) {
  return collectActions(CONTENT_ACTION_DEFINITIONS, { game, ...context });
}
