import { collectActions } from '../engine/actions.mjs';
import { cureBonus, modifierValue } from '../modifiers.mjs';
import { moonlit, statusOf, WOLF_RULES } from '../werewolf.mjs';
import { resolveCard } from '../card-rules.mjs';
import { TRAIT_KEYS } from '../game-data.mjs';
import { traitRuleView } from '../rule-views.mjs';

const thresholdRows = (threshold, success, failure) => [
  { range: `${threshold}+ 点`, effect: success },
  { range: `低于 ${threshold} 点`, effect: failure },
];

const ELEVATOR_OUTCOMES = [
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

export const CONTENT_ACTION_DEFINITIONS = [
  {
    id: 'useElevator',
    label: '启动电梯',
    icon: 'vertical',
    detail: '消耗 1 点移动力 · 掷 2 枚骰决定楼层 · 本回合可重复启动',
    handler: 'room.elevator.use',
    workflow: 'room.elevator',
    outcomes: ELEVATOR_OUTCOMES,
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

const ROOM_TARGET_ACTIONS = {
  moonSeal: {
    scenario: 'werewolf',
    label: '净化月印',
    handler: 'scenario.werewolf.moonSeal',
    check: {
      trait: 'knowledge',
      checkKind: 'ritual',
      includeAll: false,
    },
    outcomes: ({ room }) =>
      thresholdRows(
        WOLF_RULES.ritualThreshold,
        `本处月印净化进度 +1（当前 ${room.charges || 0}/${room.requiredCharges}）。`,
        '进度不变，下次尝试累计加值 +1。',
      ),
    available: () => true,
  },
  moonRitual: {
    scenario: 'werewolf',
    label: '入口解咒',
    handler: 'scenario.werewolf.moonRitual',
    available: ({ game }) => game.progress >= 2,
  },
  seal: {
    scenario: 'bells',
    label: '封印祭坛',
    handler: 'scenario.bells.seal',
    check: { trait: 'knowledge', checkKind: 'ritual', includeAll: true },
    outcomes: ({ game }) =>
      thresholdRows(
        3 + Math.floor((game.count - 3) / 2),
        '封印本处祭坛。',
        '本次未封印，下次尝试累计加值 +1。',
      ),
    available: () => true,
  },
  mirror: {
    scenario: 'mirror',
    label: '调查古镜',
    handler: 'scenario.mirror.inspect',
    available: () => true,
  },
  fuse: {
    scenario: 'flood',
    label: '拾取保险丝',
    handler: 'scenario.flood.collectFuse',
    available: () => true,
  },
  generator: {
    scenario: 'flood',
    label: '修复发电机',
    handler: 'scenario.flood.repairGenerator',
    available: () => true,
  },
};

export function contentActions(game, context) {
  const actions = collectActions(CONTENT_ACTION_DEFINITIONS, {
    game,
    ...context,
  });
  if (!context.hero.rested)
    for (const trait of TRAIT_KEYS) {
      const view = traitRuleView(game, context.hero, trait);
      if (!view.changeable || view.current >= view.start) continue;
      actions.push({
        id: 'rest:' + trait,
        command: { type: 'rest', trait },
        label: view.label + ' +1',
        icon: 'rest',
        detail: '恢复1格，随后停止移动',
        handler: 'hero.rest',
        trait,
      });
    }
  for (const instance of context.room.droppedItems || []) {
    const card = resolveCard(
      game,
      'item',
      instance.definitionId,
      context.hero.id,
    );
    actions.push({
      id: 'pickupItem:' + instance.instanceId,
      command: { type: 'pickupItem', instanceId: instance.instanceId },
      label: '拾取' + card.title,
      icon: 'item',
      detail: '房间中的物品',
      handler: 'item.pickup',
      instanceId: instance.instanceId,
      cardId: card.id,
    });
  }
  if (game.phase === 'haunt' && !context.hero.attacked)
    for (const enemy of game.enemies.filter(
      (entry) => entry.pos === context.hero.pos,
    ))
      actions.push({
        id: 'attack:' + enemy.id,
        command: { type: 'attack', id: enemy.id },
        label: '攻击' + enemy.name,
        icon: 'attack',
        detail: `${enemy.hp}/${enemy.maxHp} 生命`,
        handler: 'combat.hero.attack',
        workflow: 'combat.heroAttack',
        outcomes: [
          {
            range: '你的点数 > 对方',
            effect: `敌人损失点数差对应的生命${enemy.kind === 'alpha' ? `，狼王厚皮使伤害最多 ${modifierValue(game, 'combat.damage.cap', { enemyId: enemy.id }, 3)} 点` : ''}。`,
          },
          { range: '双方相等', effect: '双方均不受伤。' },
          {
            range: '你的点数 < 对方',
            effect: '你承受点数差对应的肉体伤害，最多 3 点。',
          },
        ],
        targetId: enemy.id,
      });
  if (game.phase === 'haunt' && !context.hero.interacted) {
    const target = ROOM_TARGET_ACTIONS[context.room.target];
    if (target && !context.room.done && target.available({ game, ...context }))
      actions.push({
        id: 'interact:' + context.room.target,
        command: { type: 'interact' },
        label: target.label,
        icon: 'goal',
        detail: '消耗本轮互动',
        handler: target.handler,
        ...(target.outcomes
          ? { outcomes: target.outcomes({ game, room: context.room }) }
          : {}),
        ...(target.check
          ? {
              check: {
                ...target.check,
                bonus: context.room.attempts || 0,
              },
            }
          : {}),
      });
    if (
      game.scenario === 'flood' &&
      game.powered &&
      context.room.id === 'entrance'
    )
      actions.push({
        id: 'interact:escape',
        command: { type: 'interact' },
        label: '一起逃生',
        icon: 'goal',
        detail: '所有幸存者必须抵达入口大厅',
        handler: 'scenario.flood.escape',
      });
  }
  if (
    game.scenario !== 'werewolf' ||
    game.phase !== 'haunt' ||
    context.hero.interacted
  )
    return actions;
  if (moonlit(game, context.room))
    actions.push({
      id: 'boardWindow',
      command: { type: 'boardWindow' },
      label: '封住窗户',
      icon: 'board',
      detail: '消耗本轮互动',
      handler: 'scenario.werewolf.boardWindow',
    });
  for (const target of game.heroes.filter(
    (hero) =>
      !hero.dead &&
      !hero.traitor &&
      hero.pos === context.hero.pos &&
      statusOf(hero, 'infection'),
  )) {
    const bonus =
      (statusOf(target, 'infection')?.attempts || 0) +
      cureBonus(game, context.hero, target);
    actions.push({
      id: 'cure:' + target.id,
      command: { type: 'cure', heroId: target.id },
      label: '治疗' + target.name,
      icon: 'heal',
      detail: `知识 3+${bonus ? ' · 加值 +' + bonus : ''} · 消耗互动`,
      handler: 'scenario.werewolf.cure',
      targetId: target.id,
      bonus,
      check: {
        trait: 'knowledge',
        checkKind: 'cure',
        applyModifiers: false,
        bonus,
      },
      outcomes: thresholdRows(
        WOLF_RULES.cureThreshold,
        '清除目标狼毒，获得两轮净血保护。',
        '狼毒保留，下次治疗累计加值 +1。',
      ),
    });
  }
  return actions;
}

export function contentFactionActions(game, { heroId }) {
  if (
    game.phase !== 'haunt' ||
    game.scenario !== 'werewolf' ||
    game.queue.length
  )
    return [];
  const enemy = game.enemies.find((entry) => entry.heroId === heroId);
  if (!enemy) return [];
  return game.heroes
    .filter((hero) => !hero.dead && !hero.traitor)
    .map((target) => ({
      id: `wolfOrder:${heroId}:${target.id}`,
      command: { type: 'wolfOrder', heroId, targetId: target.id },
      label: '追猎' + target.name,
      detail: '敌人阶段优先追踪这个目标',
      handler: 'scenario.werewolf.order',
      sourceHeroId: heroId,
      targetId: target.id,
      targetLabel: target.name,
    }));
}
