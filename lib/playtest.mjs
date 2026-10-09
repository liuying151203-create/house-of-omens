import {
  createGame,
  act,
  drawCard,
  triggerHaunt,
  movement,
  ROOM_DECK,
  SCENARIOS,
  restoreGameSave,
  validSave,
  applyWerewolfInfection,
  executeRuleEffects,
} from './game-engine.mjs';
import { BLOODMOON_ITEMS } from './content/bloodmoon-items.mjs';
import { BLOODMOON_ROOMS } from './content/bloodmoon-rooms.mjs';
import { addItemInstance } from './item-instances.mjs';
import { statusOf } from './werewolf.mjs';

export const NORMAL_SAVE_KEY = 'hillhouse-demo-v2';
export const PLAYTEST_SAVE_KEY = 'hillhouse-haunt-playtest-v1';
export const CHECKPOINT_SAVE_KEY = 'hillhouse-haunt-checkpoint-v1';
const presets = [
  {
    id: 'basic',
    label: '作祟开局',
    description: '地图与物品就绪，从作祟第一轮开始。',
  },
  {
    id: 'bloodmoon-bite',
    label: '咬痕攻防与作祟（独立测试）',
    description:
      '从作祟前抽取咬痕开始，已获得两张预兆，首位人物携带家族戒指。先查看攻防结果、重骰和伤害分配，再进行作祟检定；完整血月剧本尚未接入，触发后仍进入所选的旧狼人剧本。',
  },
  {
    id: 'bloodmoon-mechanics',
    label: '血月房间与机关（独立测试）',
    description:
      '三张新地图牌已连通，角色携带戒指、徽章和捕兽夹。可测试独立行动、蒸汽、净化和旧狼人环境伤害；不是完整的新狼人剧本。',
  },
  {
    id: 'treatment',
    label: '狼毒治疗',
    description:
      '两名好人同室感染，首位人物携带吊坠并有一格肉体损伤，可立即测试治疗与绷带。',
  },
  {
    id: 'conversion',
    label: '即将转化',
    description: '一名同室队友的感染只剩一轮；结束整轮即可观察其加入狼群。',
  },
  {
    id: 'ritual',
    label: '月印解咒',
    description:
      '两处月印已净化，首位人物位于入口；互动即可验证解咒和胜利结算。',
  },
  {
    id: 'bloodmoon-cards',
    label: '血月卡牌效果（独立测试）',
    description:
      '首位人物携带三种药剂和解药，同室队友有三个测试负面状态。仅验证新卡牌；此场景沿用旧狼人战斗，不代表《血月之夜》剧本已完成。',
  },
];
const roomPresets = [
  {
    id: 'bloodmoon-pistol',
    label: '手枪射程与闪避',
    description:
      '首位英雄持枪，初始狼人在直线两房间外；射击后由目标投速度4+闪避骰，失败自行分配2点身体伤害。',
  },
  {
    id: 'bloodmoon-shot-blocked',
    label: '射线遮挡与墙壁',
    description:
      '队友挡在枪手与狼人之间，不能射击；切换队友并离开中间房间后可射击。旋转房间或其他楼层不作为弹道。',
  },
  {
    id: 'bloodmoon-silver-first',
    label: '第一发银弹与永久削弱',
    description:
      '首位英雄持枪和两发银弹，狼人双身体标记第7格、在三房间外。先装填再射击，手动分配7点；存活后上限永久降至第4格。',
  },
  {
    id: 'bloodmoon-silver-second',
    label: '第二发银弹与英雄胜利',
    description:
      '狼人已受第一发削弱，双身体标记第4格。英雄装填银弹后射击，任意完整分配7点都会使一项到骷髅并结束游戏。',
  },
  {
    id: 'bloodmoon-control',
    label: '可控狼人与轨道（独立测试）',
    description: '首位人物是初始狼人，可按四条轨道移动、攻击和分配伤害。',
  },
  {
    id: 'bloodmoon-fullmoon',
    label: '月相切换：满月前夕',
    description: '处于第2个完整轮次，结束整轮后进入满月，标记位置不变。',
  },
  {
    id: 'bloodmoon-bloodmoon',
    label: '月相切换：血月前夕',
    description: '处于第4个完整轮次，结束整轮后进入血月。',
  },
  {
    id: 'bloodmoon-secondary',
    label: '次级狼人轨道（独立测试）',
    description: '第二位人物为次级狼人，保留原角色轨道，不随月相改变。',
  },
  {
    id: 'elevator',
    label: '神秘电梯',
    description:
      '从门厅进入神秘电梯后，点击「启动电梯」，观察乘员随房间移动；可保存测试点重试投骰。',
  },
  {
    id: 'collapse',
    label: '坍塌房间',
    description:
      '首位人物在坍塌房间门外；进入即进行首次速度检定，失败后选择地下室落点。',
  },
];
export const playtestPresets = (scenario) => [
  ...(scenario === 'werewolf' ? presets : presets.slice(0, 1)),
  ...roomPresets.filter(
    (preset) =>
      scenario === 'werewolf' ||
      scenario === 'bloodmoon' ||
      !preset.id.startsWith('bloodmoon-'),
  ),
];
export const playtestPreset = (game) =>
  playtestPresets(game.scenario).find(
    (p) => p.id === (game.playtest?.focus || 'basic'),
  );

const identity = (game) =>
  JSON.stringify([
    game.scenario,
    game.count,
    game.playtest?.seed,
    game.playtest?.preset,
    game.playtest?.focus || 'basic',
  ]);
export function makeCheckpoint(game) {
  if (!validSave(game) || game.playtest?.mode !== 'haunt')
    throw new Error('只能保存快速测试局的测试点。');
  return JSON.stringify({ version: 1, game });
}
export function readCheckpoint(raw, current) {
  try {
    const saved = JSON.parse(raw);
    const game = restoreGameSave(saved.game);
    if (
      saved.version !== 1 ||
      !game ||
      game.playtest?.mode !== 'haunt' ||
      current?.playtest?.mode !== 'haunt' ||
      identity(game) !== identity(current)
    )
      return null;
    return game;
  } catch {
    return null;
  }
}
export const saveKeyFor = (game) =>
  game?.playtest?.mode === 'haunt' ? PLAYTEST_SAVE_KEY : NORMAL_SAVE_KEY;

// A small reproducible fixture built from real room definitions, without changing
// the normal exploration rules or granting free objective progress.
const layout = [
  ['greenhouse', 0, 1, 1, 2],
  ['stairs-down', 0, -1, 0, 0],
  ['library', 1, 0, -1, 0],
  ['bedroom', 1, 1, 0, 2],
  ['ritual', -1, 0, -1, 0],
  ['boiler', -1, 1, 0, 2],
];

export function createHauntPlaytest(
  scenario,
  seed = Date.now(),
  count = 3,
  focus = 'basic',
) {
  if (scenario === 'mystery' || !SCENARIOS.some((s) => s.id === scenario))
    throw new Error('直接进入作祟前，请先指定一个剧本。');
  const selected = playtestPresets(scenario).find((p) => p.id === focus);
  if (!selected) throw new Error('此剧本不支持所选测试场景。');
  let game = createGame(scenario, seed, count);
  game.playtest = { mode: 'haunt', seed: seed >>> 0, preset: 1, focus };
  game.queue = [];
  if (focus === 'bloodmoon-bite') return createBitePlaytest(game, selected);
  if (
    [
      'bloodmoon-control',
      'bloodmoon-fullmoon',
      'bloodmoon-bloodmoon',
      'bloodmoon-secondary',
      'bloodmoon-pistol',
      'bloodmoon-shot-blocked',
      'bloodmoon-silver-first',
      'bloodmoon-silver-second',
    ].includes(focus)
  )
    return createActorPlaytest(game, selected);
  for (const [id, floor, x, y, rotation] of layout) {
    const tile = ROOM_DECK.find((r) => r.id === id);
    game.rooms.push({
      ...structuredClone(tile),
      floor,
      x,
      y,
      rotation,
      starter: false,
      target: null,
      done: false,
      attempts: 0,
      roomBonus: [],
      states: {},
    });
    game.decks.rooms = game.decks.rooms.filter((roomId) => roomId !== id);
  }
  game.links.push(['stairs-down', 'basement']);
  game.basementUnlocked = true;
  // Deal via the existing card effect path, including the locket's sanity gain.
  for (const [type, id] of [
    ['item', 'coffee'],
    ['item', 'bandage'],
    ['omen', 'locket'],
  ]) {
    game.decks[type] = [
      id,
      ...game.decks[type].filter((cardId) => cardId !== id),
    ];
    drawCard(game, type, game.heroes[0]);
    game = act(game, { type: 'advance' });
    game.queue = [];
  }
  for (const hero of game.heroes) {
    hero.moves = movement(hero);
    hero.stopped = false;
    if (scenario === 'werewolf') hero.pos = 'greenhouse';
  }
  triggerHaunt(game);
  const allies = game.heroes.filter((h) => !h.dead && !h.traitor);
  if (focus === 'bloodmoon-mechanics') {
    const positions = {
      'bloodmoon-laboratory': [-1, -1, 0, 1],
      'bloodmoon-boiler': [-1, -2, 0, 0],
      sterilization: [-1, -2, 1, 0],
    };
    for (const tile of BLOODMOON_ROOMS) {
      const [floor, x, y, rotation] = positions[tile.id];
      game.rooms.push({
        ...structuredClone(tile),
        floor,
        x,
        y,
        rotation,
        starter: false,
        target: null,
        done: false,
        attempts: 0,
        roomBonus: [],
        states: {},
      });
    }
    allies[0].pos = 'bloodmoon-laboratory';
    allies[1].pos = 'sterilization';
    for (const id of ['family-ring', 'saint-badge', 'bear-trap'])
      addItemInstance(allies[0], id, `bloodmoon-mechanics:${id}`);
    executeRuleEffects(game, [
      {
        op: 'status.add',
        params: {
          heroId: allies[1].id,
          status: {
            id: 'bloodmoon-infection',
            label: '感染Ⅱ（测试）',
            level: 2,
            negative: true,
            removable: true,
          },
        },
      },
    ]);
    game.active = allies[0].id;
    game.viewFloor = -1;
  }
  if (focus === 'bloodmoon-cards') {
    const owner = allies[0],
      target = allies[1];
    for (const card of BLOODMOON_ITEMS.filter((entry) =>
      ['boostTrait', 'cleanse'].includes(entry.use),
    ))
      addItemInstance(owner, card.id, `bloodmoon-test:${card.id}`);
    target.pos = owner.pos;
    executeRuleEffects(game, [
      {
        op: 'hero.changeTrait',
        params: { heroId: target.id, trait: 'might', delta: 2 },
      },
      {
        op: 'hero.changeTrait',
        params: { heroId: target.id, trait: 'speed', delta: 2 },
      },
      {
        op: 'hero.changeTrait',
        params: { heroId: target.id, trait: 'sanity', delta: -1 },
      },
      ...[
        { id: 'bloodmoon-infection', label: '感染Ⅱ（测试）', level: 2 },
        { id: 'poison', label: '中毒（测试）' },
        { id: 'fear', label: '恐惧（测试）' },
      ].map((status) => ({
        op: 'status.add',
        params: {
          heroId: target.id,
          status: {
            ...status,
            removable: true,
            negative: true,
            description:
              '用于验证解药选择与清除；该测试标记不自动造成伤害或转化。',
          },
        },
      })),
    ]);
  }
  if (focus === 'treatment') {
    allies.slice(0, 2).forEach((h) => applyWerewolfInfection(game, h));
    allies[0].stats.might = Math.max(1, allies[0].stats.might - 1);
  } else if (focus === 'conversion') {
    applyWerewolfInfection(game, allies[1]);
    statusOf(allies[1], 'infection').turns = 1;
  } else if (focus === 'ritual') {
    for (const room of game.rooms.filter((r) => r.target === 'moonSeal')) {
      room.charges = room.requiredCharges;
      room.done = true;
    }
    game.progress = 2;
    allies[0].pos = 'entrance';
    applyWerewolfInfection(game, allies[1]);
  }
  if (focus === 'elevator' || focus === 'collapse') {
    const tile = ROOM_DECK.find(
      (r) =>
        r.id === (focus === 'elevator' ? 'mystic-elevator' : 'collapsed-room'),
    );
    const room = {
      ...structuredClone(tile),
      floor: 0,
      x: 1,
      y: 0,
      rotation: focus === 'elevator' ? 1 : 2,
      starter: false,
      target: null,
      done: false,
      attempts: 0,
      roomBonus: [],
    };
    game.rooms.push(room);
    game.decks.rooms = game.decks.rooms.filter((id) => id !== tile.id);
    allies[0].pos = 'foyer';
    if (focus === 'elevator' && allies[1]) allies[1].pos = room.id;
    // Keep a clean first interaction; the existing haunt and enemies still run normally later.
    game.active = allies[0].id;
    game.viewFloor = 0;
  }
  return describePlaytest(game, selected);
}

function createBitePlaytest(game, selected) {
  for (const hero of game.heroes) hero.pos = 'foyer';
  for (const [index, id] of ['bell', 'book'].entries()) {
    game.decks.omen = [
      id,
      ...game.decks.omen.filter((cardId) => cardId !== id),
    ];
    drawCard(game, 'omen', game.heroes[index + 1]);
    game = act(game, { type: 'advance' });
    game.queue = [];
  }
  game.itemSerial++;
  addItemInstance(game.heroes[0], 'family-ring', `item-${game.itemSerial}`);
  game.decks.omen.unshift('bite-mark');
  drawCard(game, 'omen', game.heroes[0]);
  return describePlaytest(game, selected);
}

function createActorPlaytest(game, selected) {
  game.scenario = 'bloodmoon';
  game.automaticHaunt = false;
  const gunTest = [
      'bloodmoon-pistol',
      'bloodmoon-shot-blocked',
      'bloodmoon-silver-first',
      'bloodmoon-silver-second',
    ].includes(selected.id),
    alphaId = gunTest ? 1 : 0;
  game.heroes[alphaId].omens.push('bite-mark');
  game.omens = 1;
  for (const hero of game.heroes) hero.pos = 'foyer';
  triggerHaunt(game);
  game.elapsed =
    selected.id === 'bloodmoon-fullmoon'
      ? 1
      : selected.id === 'bloodmoon-bloodmoon'
        ? 3
        : 0;
  game.round = game.elapsed + 1;
  if (selected.id === 'bloodmoon-secondary') {
    game.heroes[1].combatRole = 'wolf';
    game.heroes[1].faction = 'wolves';
    game.heroes[1].role = '次级狼人';
  }
  if (gunTest) {
    for (let index = 1; index <= 3; index++) {
      game.rooms.push({
        ...structuredClone(game.rooms.find((room) => room.id === 'foyer')),
        id: `shoot-room-${index}`,
        name: ['长廊', '尽头房间', '远端房间'][index - 1],
        x: index,
        doors: [1, 3],
        starter: false,
      });
    }
    addItemInstance(game.heroes[0], 'pistol', 'test-pistol');
    game.heroes[1].pos = selected.id.startsWith('bloodmoon-silver-')
      ? 'shoot-room-3'
      : 'shoot-room-2';
    if (selected.id === 'bloodmoon-shot-blocked')
      game.heroes[2].pos = 'shoot-room-1';
    if (selected.id.startsWith('bloodmoon-silver-')) {
      for (let index = 1; index <= 2; index++)
        addItemInstance(
          game.heroes[0],
          'silver-bullet',
          `test-silver-${index}`,
        );
      game.heroes[1].stats.might = game.heroes[1].stats.speed = 7;
    }
    if (selected.id === 'bloodmoon-silver-second') {
      game.heroes[1].silverWeakened = true;
      game.heroes[1].stats.might = game.heroes[1].stats.speed = 4;
    }
  }
  for (const hero of game.heroes) {
    hero.moves = movement(hero, game);
    hero.turnStartedRound = game.round;
  }
  game.active = 0;
  return describePlaytest(game, selected);
}

function describePlaytest(game, selected) {
  game.queue[0].text += `\n\n预置测试场景：${selected.label}。${selected.description}`;
  game.feedback = `快速测试 · ${selected.label}：${selected.description}`;
  game.feedbackId = ++game.serial;
  game.logs.unshift({
    id: game.serial,
    round: game.round,
    text: game.feedback,
  });
  return game;
}
