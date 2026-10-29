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
import { moonPhase } from './content/bloodmoon-actors.mjs';

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
    id: 'sports-drink',
    label: '恢复物品 · 运动饮料',
    description: '首位人物力量和速度受损并持有运动饮料；饮用后本回合及下回合结束时各选择恢复1格。',
  },
  {
    id: 'knowledge-bread',
    label: '新物品 · 知识面包',
    description:
      '首位人物携带知识面包，可测试力量提升1格、知识提升2格及使用后消耗。',
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
    id: 'bloodmoon-entry',
    label: '咬痕 → 血月正式触发',
    description:
      '已获得铃铛与书，首位人物携带家族戒指，正在获得最后一张预兆咬痕。完成攻防、重骰与伤害后进行作祟检定，咬痕持有者成为初始狼人。',
  },
  {
    id: 'bloodmoon-pursuit',
    label: '追猎方向与残血恢复',
    description:
      '满月初始狼人已耗尽普通移动，远端英雄残血；仅靠近该英雄的房间可用1点追猎移动。恢复目标身体数值至作祟基准后，追猎入口消失。',
  },
  {
    id: 'bloodmoon-pursuit-secondary',
    label: '次级狼人追猎',
    description:
      '处于初醒，第二位人物是已耗尽普通移动的次级狼人；仍可向远端残血英雄额外移动1点。初醒初始狼人没有追猎。',
  },
  {
    id: 'bloodmoon-pursuit-trap',
    label: '追猎途中捕兽夹',
    description:
      '满月初始狼人使用追猎进入长廊会触发英雄捕兽夹；分配2点普通身体伤害后，当前回合停止移动，不能继续使用追猎。',
  },
  {
    id: 'bloodmoon-isolation',
    label: '落单攻击结果加1',
    description:
      '初始狼人与第二位英雄同室，另一位英雄在三房间外；攻击骰总数不变，最终攻击点数加1。让另一位英雄走到相邻长廊后，加值消失。',
  },
  {
    id: 'bloodmoon-bloodlust-full',
    label: '满月嗜血与自由分配',
    description:
      '初始狼人处于满月，力量／速度第2格；主动撕咬后按实际伤害自由分配恢复，最高第4格。',
  },
  {
    id: 'bloodmoon-bloodlust-blood',
    label: '血月嗜血与第7格上限',
    description:
      '初始狼人处于血月，力量／速度第5格；主动撕咬后可恢复至第7格，选择过程支持测试点恢复。',
  },
  {
    id: 'bloodmoon-bloodlust-silver',
    label: '嗜血与银弹永久上限',
    description:
      '初始狼人处于血月、已被银弹削弱，力量／速度第3格；嗜血仍不能超过第4格，剩余恢复量会失效并记录。',
  },
  {
    id: 'bloodmoon-infection',
    label: '感染传播与徽章庇护',
    description:
      '初始狼人与两名英雄同室，第二位英雄已有感染Ⅰ并持徽章；主动撕咬实际造成至少3点身体伤害后尝试升级，可测试徽章阻止、首次属性移动及解药清除。',
  },
  {
    id: 'bloodmoon-conversion',
    label: '感染Ⅱ检定与净化',
    description:
      '第二位英雄处于感染Ⅱ并位于消毒杀菌室。切换并结束其回合，可先选择净化；放弃净化则进行理智3+，失败成为可控次级狼人。',
  },
  {
    id: 'bloodmoon-immortal',
    label: '普通伤害与不死',
    description:
      '首位人物是双身体标记第1格的初始狼人。进入入口大厅会触发英雄布置的捕兽夹，分配普通伤害后仍在第1格；结束整轮，下次狼人回合不能主动攻击，可继续移动。',
  },
  {
    id: 'bloodmoon-immortal-allocation',
    label: '不死与伤害分配限制',
    description:
      '初始狼人力量第2格、速度第4格。进入入口大厅踩中捕兽夹后，2点伤害不能全部塞给力量；至少1点必须扣速度。两项都有可扣格数时不能借不死减伤。',
  },
  {
    id: 'bloodmoon-recovery-cap',
    label: '削弱上限与药剂恢复',
    description:
      '首位人物是已永久削弱的狼人，持力量与速度药剂；使用与休整均不能超过第4格，换月相不突破上限。',
  },
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
      (preset.id !== 'bloodmoon-entry' || scenario === 'bloodmoon') &&
      (scenario === 'werewolf' ||
        scenario === 'bloodmoon' ||
        !preset.id.startsWith('bloodmoon-')),
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
  if (focus === 'bloodmoon-bite' || focus === 'bloodmoon-entry')
    return createBitePlaytest(game, selected);
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
      'bloodmoon-immortal',
      'bloodmoon-immortal-allocation',
      'bloodmoon-recovery-cap',
      'bloodmoon-infection',
      'bloodmoon-conversion',
      'bloodmoon-bloodlust-full',
      'bloodmoon-bloodlust-blood',
      'bloodmoon-bloodlust-silver',
      'bloodmoon-pursuit',
      'bloodmoon-pursuit-secondary',
      'bloodmoon-pursuit-trap',
      'bloodmoon-isolation',
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
  if (scenario === 'bloodmoon') {
    const alpha = game.heroes.at(-1);
    alpha.omens.push('bite-mark');
    game.omens++;
    game.decks.omen = game.decks.omen.filter((id) => id !== 'bite-mark');
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
  if (focus === 'sports-drink') {
    const owner = allies[0];
    owner.stats.might = Math.max(1, owner.start.might - 2);
    owner.stats.speed = Math.max(1, owner.start.speed - 2);
    addItemInstance(owner, 'sports-drink', 'playtest:sports-drink');
    game.active = owner.id;
  }
  if (focus === 'knowledge-bread') {
    addItemInstance(allies[0], 'knowledge-bread', 'playtest:knowledge-bread');
    game.active = allies[0].id;
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
  if (game.scenario === 'bloodmoon')
    game.decks.item = game.decks.item.filter((id) => id !== 'family-ring');
  game.decks.omen = [
    'bite-mark',
    ...game.decks.omen.filter((id) => id !== 'bite-mark'),
  ];
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
    alphaId = gunTest ? 1 : 0,
    pursuitTest = selected.id.startsWith('bloodmoon-pursuit'),
    isolationTest = selected.id === 'bloodmoon-isolation';
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
  if (selected.id.startsWith('bloodmoon-bloodlust-')) {
    game.elapsed = selected.id === 'bloodmoon-bloodlust-full' ? 2 : 4;
    game.round = game.elapsed + 1;
    game.heroes[0].stats.might = game.heroes[0].stats.speed =
      selected.id === 'bloodmoon-bloodlust-full'
        ? 2
        : selected.id === 'bloodmoon-bloodlust-silver'
          ? 3
          : 5;
    game.heroes[0].silverWeakened =
      selected.id === 'bloodmoon-bloodlust-silver';
    // 保留充足身体轨道空间，让三点伤害后仍能观察感染与嗜血。
    game.heroes[1].stats.might = game.heroes[1].stats.speed = 7;
  }
  game.bloodmoonCombat.moon = moonPhase(game.elapsed);
  if (selected.id === 'bloodmoon-secondary') {
    game.heroes[1].combatRole = 'wolf';
    game.heroes[1].faction = 'wolves';
    game.heroes[1].role = '次级狼人';
  }
  if (gunTest || pursuitTest || isolationTest) {
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
  }
  if (gunTest) {
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
  if (
    selected.id === 'bloodmoon-immortal' ||
    selected.id === 'bloodmoon-immortal-allocation'
  ) {
    game.heroes[0].stats.might = selected.id === 'bloodmoon-immortal' ? 1 : 2;
    game.heroes[0].stats.speed = selected.id === 'bloodmoon-immortal' ? 1 : 4;
    game.rooms.find((room) => room.id === 'entrance').traps = [
      {
        id: 'test-hero-trap',
        faction: 'heroes',
        ownerId: 1,
      },
    ];
  }
  if (selected.id === 'bloodmoon-recovery-cap') {
    game.heroes[0].silverWeakened = true;
    addItemInstance(game.heroes[0], 'might-potion', 'test-cap-might');
    addItemInstance(game.heroes[0], 'speed-potion', 'test-cap-speed');
  }
  if (selected.id === 'bloodmoon-infection') {
    game.heroes[1].statuses.push({
      id: 'bloodmoon-infection',
      label: '感染Ⅰ',
      level: 1,
      negative: true,
      removable: true,
    });
    addItemInstance(game.heroes[1], 'saint-badge', 'test-infection-badge');
    addItemInstance(game.heroes[2], 'antidote', 'test-infection-antidote');
  }
  if (selected.id === 'bloodmoon-conversion') {
    const tile = BLOODMOON_ROOMS.find(
      (room) => room.special === 'sterilization',
    );
    game.rooms.push({
      ...structuredClone(tile),
      floor: 0,
      x: 0,
      y: 1,
      rotation: 0,
      states: {},
      roomBonus: [],
      starter: false,
    });
    const hero = game.heroes[1];
    hero.pos = tile.id;
    executeRuleEffects(game, [
      {
        op: 'status.gain',
        params: {
          heroId: hero.id,
          status: {
            id: 'bloodmoon-infection',
            label: '感染Ⅱ',
            level: 2,
            negative: true,
            removable: true,
          },
        },
      },
    ]);
  }
  if (pursuitTest) {
    game.elapsed = selected.id === 'bloodmoon-pursuit-secondary' ? 0 : 2;
    game.round = game.elapsed + 1;
    game.bloodmoonCombat.moon = moonPhase(game.elapsed);
    const target =
      game.heroes[selected.id === 'bloodmoon-pursuit-secondary' ? 2 : 1];
    target.pos = 'shoot-room-3';
    target.stats.might = 1;
    if (selected.id === 'bloodmoon-pursuit-secondary') {
      game.heroes[1].combatRole = 'wolf';
      game.heroes[1].faction = 'wolves';
      game.heroes[1].role = '次级狼人';
    }
    if (selected.id === 'bloodmoon-pursuit-trap')
      game.rooms.find((room) => room.id === 'shoot-room-1').traps = [
        { id: 'test-pursuit-trap', ownerId: target.id, faction: 'heroes' },
      ];
  }
  if (isolationTest) game.heroes[2].pos = 'shoot-room-3';
  for (const hero of game.heroes) {
    hero.moves = movement(hero, game);
    hero.turnStartedRound = game.round;
  }
  game.active = selected.id === 'bloodmoon-pursuit-secondary' ? 1 : 0;
  if (pursuitTest) game.heroes[game.active].moves = 0;
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
