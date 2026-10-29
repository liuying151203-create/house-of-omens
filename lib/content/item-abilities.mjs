import { cleanseableStatuses } from '../status-rules.mjs';
import { traitRuleView } from '../rule-views.mjs';
import { connectedDoor, doorLock } from './door-locks.mjs';

const ITEM_USE_DEFINITIONS = {
  sportsDrink: {
    targets: () => [null],
    available: ({ game, hero }) => ['might', 'speed'].some((trait) => traitRuleView(game, hero, trait).changeable),
    unavailableReason: '当前力量和速度均不可改变',
    label: () => '饮用 · 持续恢复',
    effects: ({ hero, instance }) => [
      { op: 'status.add', params: { heroId: hero.id, status: { id: 'sports-drink', label: '运动饮料', description: '本回合及下回合结束时各恢复1格力量或速度，最多到起始位置。', negative: false, removable: false, remainingTurns: 2, sourceInstanceId: instance.instanceId } } },
    ],
    result: () => '本回合及下回合结束时各恢复1格力量或速度，最多到起始位置。',
  },
  exorcismBell: {
    handler: 'item.exorcismBell',
    targets: () => [null],
    available: () => true,
    unavailableReason: '次数已经耗尽',
    label: () => '摇铃移动目标',
    effects: () => [],
    result: () => '使用驱邪手铃移动目标。',
  },
  wailingViolin: {
    handler: 'item.wailingViolin',
    targets: ({ game }) =>
      game.rooms.map((room) => ({ targetRoomId: room.id })),
    available: ({ game, hero }) =>
      game.phase === 'haunt' &&
      !hero.attacked &&
      hero.attackBlockedRound !== game.round,
    unavailableReason: '本回合不能主动攻击',
    label: ({ targetRoom }) => `演奏 · ${targetRoom.name}`,
    effects: () => [],
    result: () => '哀鸣小提琴影响选定房间内的所有人物和怪物。',
  },
  shiftingMirror: {
    handler: 'item.shiftingMirror',
    targets: ({ game, hero }) => {
      const origin = game.rooms.find((room) => room.id === hero.pos);
      return game.heroes
        .filter(
          (target) =>
            target.id !== hero.id &&
            !target.dead &&
            !target.traitor &&
            target.pos !== hero.pos &&
            game.rooms.find((room) => room.id === target.pos)?.floor ===
              origin?.floor,
        )
        .map((target) => ({ targetHeroId: target.id }));
    },
    available: () => true,
    unavailableReason: '没有可交换的同楼层人物',
    label: ({ targetHero }) => `与${targetHero.name}交换位置`,
    effects: () => [],
    result: () => '使用移形镜交换位置。',
  },
  wornLock: {
    handler: 'item.installLock',
    targets: ({ game, hero, instance }) =>
      instance.state?.lockInstalled
        ? []
        : game.rooms
            .filter(
              (room) =>
                connectedDoor(game, hero.pos, room.id) &&
                !doorLock(game, hero.pos, room.id),
            )
            .map((room) => ({ targetRoomId: room.id })),
    available: () => true,
    unavailableReason: '没有可以上锁的门',
    label: ({ targetRoom }) => `锁住通往${targetRoom.name}的门`,
    effects: () => [],
    result: () => '安装破旧的锁。',
  },
  echoSpool: {
    handler: 'item.echoSpool',
    targets: () => [null],
    available: ({ hero, instance }) =>
      !instance.state?.echoRoomId ||
      (!hero.stopped && hero.pos !== instance.state.echoRoomId),
    unavailableReason: '已停止移动或已在线头所在房间',
    label: ({ instance }) =>
      instance.state?.echoRoomId ? '瞬移回返' : '留下线头',
    detail: ({ game, instance }) => {
      const roomId = instance.state?.echoRoomId;
      if (!roomId) return '尚未系线。可在当前房间留下线头。';
      const room = game.rooms.find((entry) => entry.id === roomId);
      return room
        ? `线头：${room.name}。可从可通行距离4步内瞬移返回。`
        : '线头所在房间已不存在，无法重新设置。';
    },
    effects: () => [],
    result: () => '使用回声线轴。',
  },
  musicBox: {
    handler: 'item.musicBox',
    targets: () => [null],
    available: () => true,
    unavailableReason: '本轮已经演奏',
    label: () => '演奏 · 知识4+',
    effects: () => [],
    result: () => '演奏旧八音盒。',
  },
  knowledgeBread: {
    targets: () => [null],
    available: () => true,
    unavailableReason: '当前无法食用',
    label: () => '食用 · 力量+1格，知识+2格',
    effects: ({ hero }) => [
      {
        op: 'hero.changeTrait',
        params: { heroId: hero.id, trait: 'might', delta: 1 },
      },
      {
        op: 'hero.changeTrait',
        params: { heroId: hero.id, trait: 'knowledge', delta: 2 },
      },
    ],
    result: () => '力量提升1格，知识提升2格，最多到各自属性轨上限。',
  },
  placeTrap: {
    handler: 'item.placeTrap',
    targets: () => [null],
    available: ({ game, hero }) => hero.bloodmoonActions?.trap !== game.round,
    unavailableReason: '本回合已经布置过捕兽夹',
    label: () => '布置捕兽夹',
    effects: () => [],
    result: () => '在当前房间布置捕兽夹。',
  },
  boostTrait: {
    targets: ({ card }) => [card.useTrait],
    available: ({ traitView }) => !!traitView?.changeable,
    unavailableReason: '当前属性不可改变',
    label: ({ traitLabel, card }) =>
      `饮用 · ${traitLabel}向右移动${card.useAmount}格`,
    effects: ({ game, card, hero, trait, traitLabel, instance }) => [
      {
        op: 'hero.changeTrait',
        params: { heroId: hero.id, trait, delta: card.useAmount },
      },
      {
        op: 'status.add',
        params: {
          heroId: hero.id,
          status: {
            id: 'trait-boost',
            label: `${card.title}增益`,
            description: `持续1回合，使用者下次回合开始时到期，${traitLabel}回退1格，最低保留在骷髅前一格，不致死。`,
            negative: false,
            removable: false,
            trait,
            expiresRound: game.round + 1,
            sourceCardId: card.id,
            sourceInstanceId: instance.instanceId,
          },
        },
      },
    ],
    result: ({ traitLabel, card }) =>
      `${traitLabel}向右移动${card.useAmount}格，最多到轨道最右格；药剂增益持续到自己下次回合开始，届时回退1格且不致死。`,
  },
  cleanse: {
    handler: 'item.cleanse',
    targets: ({ game, hero }) =>
      game.heroes
        .filter(
          (target) =>
            !target.dead && !target.traitor && target.pos === hero.pos,
        )
        .map((target) => ({ targetHeroId: target.id })),
    available: ({ targetHero }) => cleanseableStatuses(targetHero).length > 0,
    unavailableReason: '目标没有可清除的负面状态',
    label: ({ targetHero }) => `万用解药 · ${targetHero.name}`,
    effects: () => [],
    result: () => '清除所选负面状态。',
  },
  movement: {
    targets: () => [null],
    available: ({ hero }) => !hero.stopped,
    unavailableReason: '本回合已停止移动',
    label: ({ card }) => `饮用 · 移动 +${card.useAmount}`,
    effects: ({ card, hero }) => [
      {
        op: 'hero.changeMoves',
        params: { heroId: hero.id, delta: card.useAmount },
      },
    ],
    result: ({ card }) => `本回合移动力 +${card.useAmount}。`,
  },
  healPhysicalSplit: {
    targets: ({ game, hero, card }) => {
      const capacity = Object.fromEntries(
        ['might', 'speed'].map((trait) => {
          const view = traitRuleView(game, hero, trait);
          return [
            trait,
            view.changeable
              ? Math.max(
                  0,
                  Math.min(view.start, view.maxPosition) - view.current,
                )
              : 0,
          ];
        }),
      );
      const total = Math.min(card.useAmount, capacity.might + capacity.speed);
      if (!total) return [];
      return Array.from({ length: total + 1 }, (_, might) => ({
        allocation: { might, speed: total - might },
      })).filter(
        ({ allocation }) =>
          allocation.might <= capacity.might &&
          allocation.speed <= capacity.speed,
      );
    },
    available: () => true,
    unavailableReason: '身体属性已达到恢复上限',
    label: ({ allocation }) =>
      `恢复 · 力量${allocation.might}格，速度${allocation.speed}格`,
    effects: ({ hero, allocation }) =>
      ['might', 'speed']
        .filter((trait) => allocation[trait] > 0)
        .map((trait) => ({
          op: 'hero.restoreTrait',
          params: { heroId: hero.id, trait, amount: allocation[trait] },
        })),
    result: ({ allocation }) =>
      `力量恢复${allocation.might}格，速度恢复${allocation.speed}格。`,
  },
  healPhysical: {
    targets: () => ['might', 'speed'],
    available: ({ traitView }) =>
      traitView.changeable && traitView.current < Math.min(traitView.start, traitView.maxPosition),
    unavailableReason: '该属性已达到恢复上限',
    label: ({ traitLabel }) => `恢复${traitLabel}`,
    effects: ({ card, hero, trait }) => [
      {
        op: 'hero.restoreTrait',
        params: { heroId: hero.id, trait, amount: card.useAmount },
      },
    ],
    result: ({ traitLabel }) => `恢复${traitLabel}。`,
  },
  healMental: {
    targets: ({ card }) => card.useTrait ? [card.useTrait] : ['sanity', 'knowledge'],
    available: ({ traitView }) =>
      traitView.changeable && traitView.current < Math.min(traitView.start, traitView.maxPosition),
    unavailableReason: '该属性已达到恢复上限',
    label: ({ traitLabel }) => `恢复${traitLabel}`,
    effects: ({ card, hero, trait }) => [
      {
        op: 'hero.restoreTrait',
        params: { heroId: hero.id, trait, amount: card.useAmount },
      },
    ],
    result: ({ traitLabel }) => `恢复${traitLabel}。`,
  },
};

// 展示和运行时规则校验共用同一份能力定义，避免新增能力时漏改白名单。
export function itemUseDefinition(id) {
  return Object.hasOwn(ITEM_USE_DEFINITIONS, id)
    ? ITEM_USE_DEFINITIONS[id]
    : undefined;
}
