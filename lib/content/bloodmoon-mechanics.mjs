import { createWorkflow } from '../engine/workflow.mjs';
import {
  itemInstances,
  materializeItemInstances,
  addItemInstance,
  removeItemInstance,
} from '../item-instances.mjs';
import { canCleanseStatus, cleanseableStatuses } from '../status-rules.mjs';

export const BLOODMOON_WORKFLOW = 'bloodmoon.effect';
export const BLOODMOON_WORKFLOWS = {
  'status.gain': {
    id: 'status.gain',
    version: 1,
    steps: [
      { op: 'effect', handler: 'status.gain.before' },
      { op: 'effect', handler: 'status.gain.commit' },
      { op: 'effect', handler: 'bloodmoon.finish' },
      { op: 'complete' },
    ],
  },
  [BLOODMOON_WORKFLOW]: {
    id: BLOODMOON_WORKFLOW,
    version: 1,
    steps: [
      { op: 'effect', handler: 'bloodmoon.prepare' },
      { op: 'branchValue', path: 'needsChoice', truthy: 2, falsy: 4 },
      { op: 'requestChoice', key: 'choice', requestKey: 'choiceRequest' },
      { op: 'effect', handler: 'bloodmoon.choose' },
      { op: 'branchValue', path: 'needsRoll', truthy: 5, falsy: 7 },
      { op: 'requestRoll', key: 'check', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'bloodmoon.roll' },
      { op: 'effect', handler: 'bloodmoon.finish' },
      { op: 'complete' },
    ],
  },
};

export const factionOf = (entity) =>
  entity?.faction || (entity?.traitor ? 'wolves' : 'heroes');
export const POTIONS = ['might-potion', 'speed-potion', 'sanity-potion'];
export const MATERIALS = ['family-ring', 'saint-badge'];
const potionNames = ['力量药剂', '速度药剂', '神智药剂'];
const availableItem = (game, hero, id, field) =>
  itemInstances(hero).find(
    (item) => item.definitionId === id && item.state?.[field] !== game.round,
  );
const itemById = (hero, id) =>
  materializeItemInstances(hero).find((item) => item.instanceId === id);
const usedAction = (game, hero, key) =>
  hero.bloodmoonActions?.[key] === game.round;
function spendAction(game, hero, key) {
  hero.bloodmoonActions ||= {};
  hero.bloodmoonActions[key] = game.round;
}

export function bloodmoonActions(game, hero, room) {
  const result = [],
    add = (kind, label, detail, instance) =>
      result.push({
        id: `bloodmoon:${kind}:${instance?.instanceId || room.id}`,
        command: {
          type: 'bloodmoonAction',
          kind,
          ...(instance ? { instanceId: instance.instanceId } : {}),
        },
        handler: 'bloodmoon.action',
        kind,
        instanceId: instance?.instanceId,
        label,
        detail,
        icon: 'item',
      });
  if (
    room.special === 'bloodmoon-laboratory' &&
    !usedAction(game, hero, 'craft') &&
    POTIONS.some((id) => !game.bloodmoon?.crafted?.includes(id))
  )
    add('craft', '制备药剂', '知识5+ · 每人每轮一次 · 与其他行动独立计次');
  if (['bloodmoon-laboratory', 'bloodmoon-boiler'].includes(room.special))
    for (const item of itemInstances(hero))
      if (
        MATERIALS.includes(item.definitionId) &&
        item.state?.smeltRound !== game.round &&
        !game.bloodmoon?.smelted?.includes(item.definitionId)
      )
        add(
          'smelt',
          item.definitionId === 'family-ring' ? '熔铸家族戒指' : '熔铸圣者徽章',
          '知识4+ · 本物品每轮一次 · 成功销毁并获得银弹',
          item,
        );
  if (room.special === 'bloodmoon-boiler' && !usedAction(game, hero, 'steam'))
    add(
      'valve',
      '开启蒸汽阀',
      '每人每轮一次 · 自己回合结束后生效，下次回合开始时消散',
    );
  if (!usedAction(game, hero, 'trap'))
    for (const item of itemInstances(hero).filter(
      (entry) => entry.definitionId === 'bear-trap',
    ))
      add(
        'trap',
        '布置捕兽夹',
        '每人每轮一次 · 敌方首次进入时受伤并停止移动',
        item,
      );
  return result;
}

export function bloodmoonTriggers(game, event) {
  const triggers = [],
    add = (kind, heroId, data = {}, priority = 0) =>
      triggers.push({
        id: `bloodmoon.${kind}`,
        sourceId: `bloodmoon:${kind}:${heroId}:${data.instanceId || data.steamId || ''}`,
        sourceLabel: {
          ring: '家族戒指',
          badge: '圣者徽章',
          purify: '消毒杀菌室',
          steam: '蒸汽',
          trapHit: '捕兽夹',
          steamStart: '蒸汽阀',
          steamExpire: '蒸汽消散',
        }[kind],
        when: event.when,
        priority,
        effects: [{ op: 'bloodmoon.flow', params: { kind, heroId, ...data } }],
      });
  if (event.when === 'AfterRoll') {
    for (const hero of game.heroes.filter(
      (entry) => !entry.dead && !entry.traitor,
    )) {
      const item = availableItem(game, hero, 'family-ring', 'ringRound');
      if (
        item &&
        event.groups?.some(
          (group) =>
            group.heroId === hero.id &&
            group.dice.some((face) => face === 0 || face === 2),
        )
      )
        add('ring', hero.id, { instanceId: item.instanceId });
    }
  }
  if (
    event.when === 'BeforeStatusGain' &&
    !event.cancelled &&
    canCleanseStatus(event.status)
  ) {
    const target = game.heroes[event.heroId];
    for (const hero of game.heroes.filter(
      (entry) =>
        !entry.dead &&
        !entry.traitor &&
        entry.pos === target?.pos &&
        factionOf(entry) === factionOf(target),
    )) {
      const item = availableItem(game, hero, 'saint-badge', 'badgeRound');
      if (item)
        add('badge', hero.id, {
          instanceId: item.instanceId,
          targetHeroId: target.id,
        });
    }
  }
  const hero = game.heroes[event.heroId],
    room = game.rooms.find((entry) => entry.id === hero?.pos);
  if (event.when === 'RoundStarting')
    for (const owner of game.heroes.filter(
      (entry) => entry.dead || entry.traitor,
    ))
      if (
        game.bloodmoon?.steam?.some(
          (steam) =>
            steam.ownerId === owner.id && steam.expiresRound <= game.round,
        )
      )
        add('steamExpire', owner.id, {}, 100);
  if (event.when === 'TurnEnding' && hero && !hero.dead) {
    if (
      room?.special === 'sterilization' &&
      !hero.sterilizationUsed &&
      cleanseableStatuses(hero).length
    )
      add('purify', hero.id, {}, 20);
    if (
      game.bloodmoon?.steam?.some(
        (entry) => entry.ownerId === hero.id && !entry.active,
      )
    )
      add('steamStart', hero.id, {}, 10);
  }
  if (event.when === 'TurnStarting' && hero) {
    if (
      game.bloodmoon?.steam?.some(
        (entry) =>
          entry.ownerId === hero.id && entry.expiresRound <= game.round,
      )
    )
      add('steamExpire', hero.id, {}, 100);
  }
  if (
    ['BeforeRoomEnter', 'TurnStarting'].includes(event.when) &&
    hero &&
    !hero.dead
  ) {
    if (
      event.when === 'BeforeRoomEnter' &&
      event.fromRoomId !== room?.id &&
      hostileTrap(room, factionOf(hero))
    )
      add('trapHit', hero.id, { roomId: room.id }, 60);
    for (const steam of game.bloodmoon?.steam || [])
      if (
        steam.active &&
        steam.roomIds.includes(room?.id) &&
        !(
          steam.ownerId === hero.id &&
          event.when === 'TurnStarting' &&
          steam.expiresRound <= game.round
        ) &&
        !steam.checked.includes(`${hero.id}:${room.id}`)
      )
        add('steam', hero.id, { steamId: steam.id, roomId: room.id }, 30);
  }
  return triggers;
}

export function hostileTrap(room, faction) {
  return room?.traps?.find((trap) => trap.faction !== faction);
}

export function createBloodmoonFlow(game, params, context = {}) {
  return createWorkflow({
    flowId: `bloodmoon:${params.kind}:${++game.serial}`,
    definitionId: BLOODMOON_WORKFLOW,
    locals: {
      ...structuredClone(params),
      phase: 'start',
      reaction: {
        event: structuredClone(context.event || {}),
        continuation: structuredClone(context.remainingEffects || []),
      },
    },
  });
}

export function createStatusGainFlow(game, params, context = {}) {
  const flow = createBloodmoonFlow(
    game,
    { kind: 'statusGain', heroId: params.heroId },
    context,
  );
  flow.definitionId = 'status.gain';
  flow.locals.draft = {
    ...structuredClone(context.event || {}),
    when: 'BeforeStatusGain',
    heroId: params.heroId,
    status: structuredClone(params.status),
    cancelled: false,
    rootActionId: context.event?.rootActionId || flow.flowId,
    causeId: flow.flowId,
  };
  return flow;
}

function choice(flow, title, text, options, timeoutChoice = 'skip') {
  flow.locals.needsChoice = true;
  flow.locals.choiceRequest = {
    kind: 'choiceRequest',
    heroId: flow.locals.heroId,
    title,
    text,
    options,
    timeoutChoice,
    timeoutMs: 30000,
    visibility: { heroIds: [flow.locals.heroId] },
  };
}
function dice(game, flow, context, trait, threshold, title) {
  const hero = game.heroes[flow.locals.heroId];
  flow.locals.needsRoll = true;
  flow.locals.threshold = threshold;
  flow.locals.diceRequest = {
    kind: 'diceRequest',
    heroId: hero.id,
    title,
    text: `${trait === 'knowledge' ? '知识' : trait === 'sanity' ? '理智' : '速度'} ${threshold}+`,
    outcomes: [
      { range: `${threshold}+`, effect: '检定成功。' },
      { range: `低于${threshold}`, effect: '检定失败。' },
    ],
    rolls: [
      { count: context.traitDice(hero, trait), heroId: hero.id, label: title },
    ],
  };
}
const skip = { value: 'skip', label: '放弃，本次不使用' };

export function prepareBloodmoon(game, flow, context) {
  const l = flow.locals,
    hero = game.heroes[l.heroId],
    room = game.rooms.find((entry) => entry.id === hero?.pos);
  l.needsChoice = false;
  l.needsRoll = false;
  if (!hero || (hero.dead && !['enemySteam', 'steamExpire'].includes(l.kind)))
    return;
  const item = l.instanceId && itemById(hero, l.instanceId);
  if (l.kind === 'ring') {
    if (!item || item.state.ringRound === game.round) return;
    const event = l.reaction.event;
    l.candidates = (event.groups || []).flatMap((group, rollIndex) =>
      group.heroId !== hero.id
        ? []
        : group.dice.flatMap((face, index) =>
            face === 0 || face === 2
              ? [
                  {
                    rollIndex,
                    index,
                    value: `${rollIndex}:${index}`,
                    label: `${group.label} · 第${index + 1}枚（${face}点）`,
                  },
                ]
              : [],
          ),
    );
    if (l.candidates.length)
      choice(
        flow,
        '家族戒指 · 命运回环',
        '选择一枚0或2点骰重掷，必须接受新结果；每轮一次。',
        [...l.candidates, skip],
      );
  } else if (l.kind === 'badge') {
    const event = l.reaction.event,
      target = game.heroes[l.targetHeroId];
    if (
      event.cancelled ||
      !item ||
      item.state.badgeRound === game.round ||
      hero.pos !== target?.pos ||
      factionOf(hero) !== factionOf(target)
    )
      return;
    choice(
      flow,
      '圣者徽章 · 庇护',
      `为${target.name}阻止「${event.status.label || event.status.id}」？尝试即消耗本轮庇护。`,
      [{ value: 'protect', label: '进行理智4+检定' }, skip],
    );
  } else if (l.kind === 'purify') {
    if (hero.sterilizationUsed || room?.special !== 'sterilization') return;
    l.candidates = cleanseableStatuses(hero);
    if (l.candidates.length)
      choice(
        flow,
        '消毒杀菌室 · 净化',
        '选择一个负面状态降一级；无等级状态直接清除。每人整局一次。',
        [
          ...l.candidates.map((entry) => ({
            value: entry.key,
            label: entry.label,
          })),
          skip,
        ],
      );
  } else if (l.kind === 'craft' && l.phase === 'select') {
    const remaining = POTIONS.filter(
      (id) => !game.bloodmoon?.crafted?.includes(id),
    );
    if (remaining.length)
      choice(
        flow,
        '选择制备药剂',
        '每种药剂整局仅能成功制备一瓶，消耗后也不能重制。',
        remaining.map((id) => ({
          value: id,
          label: potionNames[POTIONS.indexOf(id)],
        })),
        remaining[0],
      );
  } else if (l.kind === 'craft' || l.kind === 'smelt') {
    const action = bloodmoonActions(game, hero, room).find(
      (entry) => entry.kind === l.kind && entry.instanceId === l.instanceId,
    );
    if (!action) return;
    if (l.kind === 'craft') spendAction(game, hero, 'craft');
    else item.state.smeltRound = game.round;
    dice(
      game,
      flow,
      context,
      'knowledge',
      l.kind === 'craft' ? 5 : 4,
      action.label,
    );
  } else if (l.kind === 'steam') {
    const steam = game.bloodmoon?.steam?.find(
      (entry) => entry.id === l.steamId,
    );
    const key = `${hero.id}:${l.roomId}`;
    if (
      !steam?.active ||
      !steam.roomIds.includes(hero.pos) ||
      steam.checked.includes(key)
    )
      return;
    steam.checked.push(key);
    dice(game, flow, context, 'speed', 4, '避开蒸汽');
  } else if (l.kind === 'enemySteam') {
    const enemy = game.enemies.find((entry) => entry.id === l.enemyId);
    if (!enemy) return;
    dice(game, flow, context, 'speed', 4, `${enemy.name} · 避开蒸汽`);
    l.diceRequest.rolls[0].count = Math.max(1, Math.min(16, enemy.speed));
    l.diceRequest.rolls[0].heroId = enemy.heroId;
    l.diceRequest.rolls[0].enemyId = enemy.id;
  } else if (l.kind === 'steamStart') {
    for (const steam of game.bloodmoon?.steam || []) {
      if (steam.ownerId !== hero.id || steam.active) continue;
      steam.active = true;
      steam.roomIds = context.doorNeighbors(steam.roomId);
      context.log(
        `${hero.name}开启的蒸汽开始喷出，影响${steam.roomIds.length}个直接连门房间。`,
      );
    }
  } else if (l.kind === 'steamExpire') {
    game.bloodmoon.steam = game.bloodmoon.steam.filter(
      (steam) => steam.ownerId !== hero.id || steam.expiresRound > game.round,
    );
  } else if (l.kind === 'trapHit') {
    const trap = hostileTrap(room, factionOf(hero));
    if (!trap) return;
    room.traps = room.traps.filter((entry) => entry.id !== trap.id);
    hero.moves = 0;
    hero.stopped = true;
    context.log(`${hero.name}触发捕兽夹，承受2点身体伤害并停止移动。`);
    l.damage = 2;
  }
}

export function chooseBloodmoon(game, flow, context) {
  const l = flow.locals,
    hero = game.heroes[l.heroId],
    selected = l.choices.choice;
  if (selected === 'skip' || !hero || hero.dead) return;
  const item = l.instanceId && itemById(hero, l.instanceId);
  if (l.kind === 'ring') {
    const candidate = l.candidates.find((entry) => entry.value === selected);
    if (!candidate || !item || item.state.ringRound === game.round) return;
    const applied = context.reroll(l, candidate);
    if (applied) {
      item.state.ringRound = game.round;
      context.log(`${hero.name}使用家族戒指重掷一枚骰子。`);
    }
  } else if (l.kind === 'badge') {
    if (
      !item ||
      item.state.badgeRound === game.round ||
      l.reaction.event.cancelled
    )
      return;
    item.state.badgeRound = game.round;
    dice(game, flow, context, 'sanity', 4, '圣者徽章 · 庇护');
  } else if (l.kind === 'purify') {
    const chosen = l.candidates.find((entry) => entry.key === selected),
      status = hero.statuses[chosen?.index];
    if (
      !status ||
      status.id !== chosen.id ||
      status.instanceId !== chosen.instanceId ||
      hero.sterilizationUsed
    )
      return;
    hero.sterilizationUsed = true;
    if (Number.isInteger(status.level) && status.level > 1) {
      status.level--;
      if (status.id === 'bloodmoon-infection')
        status.label = status.level === 1 ? '感染Ⅰ' : `感染${status.level}`;
      context.log(`${hero.name}净化${chosen.label}，等级降低1级。`);
    } else {
      hero.statuses.splice(chosen.index, 1);
      context.log(`${hero.name}净化并清除了${chosen.label}。`);
    }
  } else if (l.kind === 'craft') {
    game.bloodmoon ||= {};
    game.bloodmoon.crafted ||= [];
    if (
      !POTIONS.includes(selected) ||
      game.bloodmoon.crafted.includes(selected)
    )
      return;
    game.bloodmoon.crafted.push(selected);
    addItemInstance(hero, selected, `crafted:${++game.serial}`);
    context.log(
      `${hero.name}制备了${potionNames[POTIONS.indexOf(selected)]}。`,
    );
  }
}

export function rollBloodmoon(game, flow, context) {
  const l = flow.locals,
    hero = game.heroes[l.heroId];
  const total = l.rolls.check[0].reduce((sum, face) => sum + face, 0),
    success = total >= l.threshold;
  context.log(
    `${l.diceRequest.title}：${total}/${l.threshold}，${success ? '成功' : '失败'}。`,
  );
  if (l.kind === 'craft' && success) {
    l.phase = 'select';
    delete l.choices?.choice;
    return { nextStep: 0 };
  }
  if (l.kind === 'smelt' && success) {
    const item = itemById(hero, l.instanceId);
    game.bloodmoon ||= {};
    game.bloodmoon.smelted ||= [];
    if (!item || game.bloodmoon.smelted.includes(item.definitionId)) return;
    game.bloodmoon.smelted.push(item.definitionId);
    removeItemInstance(hero, item.instanceId);
    addItemInstance(hero, 'silver-bullet', `silver:${++game.serial}`);
    context.log(`${hero.name}熔铸成功，获得一发银色子弹。`);
  }
  if (l.kind === 'badge' && success) {
    l.reaction.event.cancelled = true;
    if (l.reaction.resume?.event) l.reaction.resume.event.cancelled = true;
  }
  if (l.kind === 'steam' && !success) {
    hero.moves = 0;
    hero.stopped = true;
    l.damage = 1;
  }
  if (l.kind === 'enemySteam' && !success) context.hurtEnemy(l.enemyId, 1);
}

export function performBloodmoonAction(game, action, hero, room, context) {
  if (action.kind === 'trap') {
    if (!removeItemInstance(hero, action.instanceId)) return;
    spendAction(game, hero, 'trap');
    room.traps ||= [];
    room.traps.push({
      id: `trap:${++game.serial}`,
      faction: factionOf(hero),
      ownerId: hero.id,
    });
    context.log(`${hero.name}布置了捕兽夹。`, { faction: factionOf(hero) });
    return;
  }
  if (action.kind === 'valve') {
    spendAction(game, hero, 'steam');
    game.bloodmoon ||= {};
    game.bloodmoon.steam ||= [];
    game.bloodmoon.steam.push({
      id: `steam:${++game.serial}`,
      roomId: room.id,
      ownerId: hero.id,
      expiresRound: game.round + 1,
      active: false,
      roomIds: [],
      checked: [],
    });
    context.log(`${hero.name}开启蒸汽阀，将在其回合结束时生效。`);
    return;
  }
  context.start({
    kind: action.kind,
    heroId: hero.id,
    instanceId: action.instanceId,
  });
}
