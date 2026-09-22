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
  ...roomPresets,
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
  if (focus === 'bloodmoon-cards') {
    const owner = allies[0],
      target = allies[1];
    for (const card of BLOODMOON_ITEMS)
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
