import { ROOM_DECK, EVENTS, ITEMS, OMENS, SCENARIOS } from './game-data.mjs';

export const GAME_SET_CATEGORIES = {
  rooms: '房间牌',
  event: '事件牌',
  item: '物品牌',
  omen: '预兆牌',
};
export const GAME_SET_CATALOG = {
  rooms: ROOM_DECK,
  event: EVENTS,
  item: ITEMS.filter((card) => card.deckEligible !== false),
  omen: OMENS.filter((card) => card.deckEligible !== false),
};
const decks = (expanded) =>
  Object.fromEntries(
    Object.entries(GAME_SET_CATALOG).map(([kind, cards]) => [
      kind,
      cards
        .filter((card) => !card.scenarioOnly && (expanded || !card.supply))
        .map((card) => card.id),
    ]),
  );
const builtins = [
  { version: 1, id: 'classic', name: '经典游戏集', decks: decks(false) },
  { version: 1, id: 'expanded', name: '通用扩展游戏集', decks: decks(true) },
  {
    version: 1,
    id: 'bloodmoon',
    name: '血月之夜游戏集',
    scenario: 'bloodmoon',
    decks: {
      ...decks(true),
      item: ['pistol', 'antidote', 'family-ring', 'saint-badge', 'bear-trap'],
      // 沿用至少三张预兆的探索节奏；咬痕负责确定初始狼人。
      omen: ['bell', 'book', 'bite-mark'],
    },
  },
];
export const builtinGameSets = () => structuredClone(builtins);

const bloodmoonRequired = {
  rooms: ['bloodmoon-laboratory', 'bloodmoon-boiler', 'sterilization'],
  item: ['pistol', 'antidote', 'family-ring', 'saint-badge', 'bear-trap'],
  omen: ['bite-mark'],
};
export function validateScenarioGameSet(scenario, gameSet) {
  if (
    scenario !== 'bloodmoon' &&
    !(scenario === 'mystery' && gameSet.decks.omen.includes('bite-mark'))
  )
    return;
  const missing = Object.entries(bloodmoonRequired).flatMap(([kind, ids]) =>
    ids
      .filter((id) => !gameSet.decks[kind].includes(id))
      .map((id) => {
        const card = GAME_SET_CATALOG[kind].find((entry) => entry.id === id);
        return card.name || card.title;
      }),
  );
  if (missing.length)
    throw new Error(
      `血月之夜游戏集缺少必要卡牌：${missing.join('、')}。请选择血月预设或补齐卡牌。`,
    );
}

// 游戏集只引用已有规则的定义，不接收脚本、效果或素材草稿。
export function validateGameSet(value) {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 60 ||
    !value.decks ||
    typeof value.decks !== 'object' ||
    Array.isArray(value.decks) ||
    Object.keys(value).some(
      (key) => !['version', 'id', 'name', 'decks', 'scenario'].includes(key),
    ) ||
    (value.scenario !== undefined &&
      !SCENARIOS.some(
        (entry) => entry.id !== 'mystery' && entry.id === value.scenario,
      )) ||
    Object.keys(value.decks).some(
      (key) => !Object.hasOwn(GAME_SET_CATEGORIES, key),
    )
  )
    throw new Error('游戏集格式不正确：需要版本、编号、名称和四类牌堆。');
  const selected = {};
  for (const [kind, label] of Object.entries(GAME_SET_CATEGORIES)) {
    const ids = value.decks[kind],
      catalog = GAME_SET_CATALOG[kind];
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > catalog.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !catalog.some((card) => card.id === id))
    )
      throw new Error(
        `${label}必须选择已实现的卡牌，每种最多一张，且不能为空。`,
      );
    selected[kind] = [...ids];
  }
  if (!selected.rooms.includes('stairs-down'))
    throw new Error('请保留下行楼梯，确保地下室可以到达。');
  if (selected.omen.length < 3)
    throw new Error('至少选择 3 张预兆牌，保留作祟检定的探索过程。');
  const rooms = ROOM_DECK.filter((room) => selected.rooms.includes(room.id));
  if (
    rooms.filter((room) => room.icon === 'omen').length < selected.omen.length
  )
    throw new Error('带预兆图标的房间数量不能少于预兆牌数量。');
  for (const kind of ['item', 'event'])
    if (!rooms.some((room) => room.icon === kind))
      throw new Error(`至少保留一间带${GAME_SET_CATEGORIES[kind]}图标的房间。`);
  const checked = {
    version: 1,
    id: value.id,
    name: value.name.trim(),
    decks: selected,
    ...(value.scenario === undefined ? {} : { scenario: value.scenario }),
  };
  if (checked.scenario) validateScenarioGameSet(checked.scenario, checked);
  return checked;
}

export function resolveGameSet(value) {
  const candidate =
    value == null || typeof value === 'string'
      ? builtins.find((set) => set.id === (value ?? 'classic'))
      : value;
  if (!candidate) throw new Error('找不到游戏集，请重新选择或导入。');
  return validateGameSet(candidate);
}

// 未定向开局采用预设的默认剧本；玩家明确选择的剧本优先。
export function resolveScenarioGameSet(scenario, value) {
  if (!SCENARIOS.some((entry) => entry.id === scenario))
    throw new Error('找不到所选剧本。');
  const gameSet = resolveGameSet(
    value ?? (scenario === 'bloodmoon' ? 'bloodmoon' : 'classic'),
  );
  const selectedScenario =
    scenario === 'mystery' ? (gameSet.scenario ?? scenario) : scenario;
  validateScenarioGameSet(selectedScenario, gameSet);
  return { scenario: selectedScenario, gameSet };
}

export const gameSetOmenCount = (game) =>
  game.gameSet?.decks.omen.length ?? builtins[0].decks.omen.length;
export const GAME_SETS_STORAGE_KEY = 'hillhouse-game-sets-v1';
export function validateGameSetPack(pack) {
  if (
    pack?.version !== 1 ||
    !Array.isArray(pack.gameSets) ||
    pack.gameSets.length > 30
  )
    throw new Error('游戏集文件格式不正确，最多保存 30 个自定义游戏集。');
  const sets = pack.gameSets.map(validateGameSet);
  if (new Set(sets.map((set) => set.id)).size !== sets.length)
    throw new Error('游戏集编号不能重复。');
  return sets;
}

export function validateGameSetLibrary(value) {
  const sets = validateGameSetPack(value);
  if (sets.some((set) => builtins.some((builtin) => builtin.id === set.id)))
    throw new Error('自定义游戏集不能覆盖内置游戏集。');
  if (![...builtins, ...sets].some((set) => set.id === value.selectedId))
    throw new Error('已选择的游戏集不存在。');
  return { version: 1, gameSets: sets, selectedId: value.selectedId };
}
