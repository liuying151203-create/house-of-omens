import {
  SCENARIOS,
  TRAIT_KEYS,
  HEROES,
  ROOM_DECK,
  EVENTS,
  ITEMS,
  OMENS,
} from './game-data.mjs';
export const TOKENS = [
  {
    id: 'alpha',
    name: '狼王',
    mark: '狼',
    color: '#9db6df',
    quantity: 1,
    description: '初始狼群成员；力量5–6，月光额外+1，生命随人数调整。',
  },
  {
    id: 'wolf',
    name: '新生狼人',
    mark: '狼',
    color: '#bd876b',
    quantity: 5,
    description: '感染倒计时结束转化；生命3，力量3，移动1；转化本轮不攻击。',
  },
  {
    id: 'infection',
    name: '狼毒感染',
    mark: '毒',
    color: '#bf7756',
    quantity: 6,
    description: '3个完整行动轮后转化；治疗成功清除，重复咬伤不刷新。',
  },
  {
    id: 'immunity',
    name: '净血保护',
    mark: '净',
    color: '#8ebcad',
    quantity: 6,
    description: '治疗成功后两轮内免疫新的狼毒感染。',
  },
  {
    id: 'boarded',
    name: '封窗',
    mark: '窗',
    color: '#c0a77b',
    quantity: 36,
    description: '绑定房间，阻止月光加成；同室人物使用一次互动完成。',
  },
  {
    id: 'moonSeal',
    name: '月印',
    mark: '月',
    color: '#b0cae7',
    quantity: 2,
    description:
      '知识4+，尝试累积+1；每处需要2–3次成功；两处完成后可在入口解咒。',
  },
  {
    id: 'drowned',
    name: '溺亡者',
    mark: '溺',
    color: '#7ba895',
    quantity: 1,
    description: '深水之下中沿房间追击的敌人。',
  },
  {
    id: 'reflection',
    name: '游荡倒影',
    mark: '映',
    color: '#9aaecb',
    quantity: 1,
    description: '镜中来客的初始游荡敌人。',
  },
  ...HEROES.map((h, i) => ({
    id: 'hero-' + i,
    name: h.name,
    mark: h.mark,
    color: h.color,
    quantity: 1,
    description: h.role + '的探险者棋子',
  })),
  {
    id: 'keeper',
    name: '守钟人',
    mark: '守',
    color: '#b75e64',
    quantity: 1,
    description: '第十三声钟响中的叛变者，由电脑控制。',
  },
  {
    id: 'shadow',
    name: '钟声幽影',
    mark: '影',
    color: '#b75e64',
    quantity: 3,
    description: '沿连通房间追击探险者。',
  },
  {
    id: 'wraith',
    name: '镜魇真身',
    mark: '镜',
    color: '#9aaecb',
    quantity: 1,
    description: '调查真镜后出现的敌人。',
  },
  {
    id: 'seal',
    name: '祭坛',
    mark: '封',
    color: '#cead70',
    quantity: 3,
    description: '通过知识检定完成封印。',
  },
  {
    id: 'mirror',
    name: '古镜',
    mark: '镜',
    color: '#9aaecb',
    quantity: 3,
    description: '调查后揭示空镜或真身。',
  },
  {
    id: 'fuse',
    name: '保险丝',
    mark: '电',
    color: '#83bca7',
    quantity: 2,
    description: '修复发电机的全队任务物品。',
  },
  {
    id: 'generator',
    name: '发电机',
    mark: '机',
    color: '#83bca7',
    quantity: 1,
    description: '消耗两枚保险丝恢复电力。',
  },
  {
    id: 'done',
    name: '已完成',
    mark: '✓',
    color: '#83bca7',
    quantity: 3,
    description: '覆盖在已完成的目标上。',
  },
  {
    id: 'die',
    name: '属性骰',
    mark: '●',
    color: '#e4d4af',
    quantity: 12,
    description: '每枚有 0、1、2 点三种等概率结果。',
  },
];
export const CATEGORIES = {
  rooms: '房间板块',
  event: '事件卡',
  item: '物品卡',
  omen: '预兆卡',
  tokens: '标记与棋子',
  heroes: '人物',
  scenarios: '剧本',
};
const starters = [
  ['entrance', '入口大厅', 0, [0, 1, 3]],
  ['foyer', '门厅', 0, [0, 1, 2, 3]],
  ['stairs', '大楼梯', 0, [0, 1, 2, 3]],
  ['upper', '二楼平台', 1, [0, 1, 2, 3]],
  ['basement', '地下室平台', -1, [0, 1, 2, 3]],
].map(([id, name, floor, doors]) => ({
  id,
  name,
  floors: [floor],
  doors,
  art: floor === -1 ? 6 : 0,
  starter: true,
  icon: null,
}));
export const CATALOG = {
  rooms: [...starters, ...ROOM_DECK],
  event: EVENTS,
  item: ITEMS,
  omen: OMENS,
  tokens: TOKENS,
  heroes: HEROES.map((h, i) => ({ ...h, id: 'hero-' + i })),
  scenarios: SCENARIOS,
};
export const catalogName = (entry) => entry.title || entry.name;
export function validateDraft(d) {
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.entries) ||
    d.entries.length > 300
  )
    throw new Error('素材包格式不正确，最多允许 300 个草稿。');
  const ids = new Set();
  for (const row of d.entries) {
    if (
      !Object.hasOwn(CATEGORIES, row.category) ||
      !row.data ||
      typeof row.id !== 'string' ||
      row.id.length > 100 ||
      ids.has(row.id)
    )
      throw new Error('素材分类或编号不正确。');
    ids.add(row.id);
    const x = row.data;
    if (
      typeof catalogName(x) !== 'string' ||
      !catalogName(x).trim() ||
      catalogName(x).length > 100
    )
      throw new Error('名称不能为空或超过 100 字。');
    for (const k of [
      'story',
      'description',
      'haunt',
      'objective',
      'intro',
      'ending',
      'mark',
      'color',
      'special',
    ])
      if (x[k] != null && (typeof x[k] !== 'string' || x[k].length > 6000))
        throw new Error('说明文字过长或格式不正确。');
    if (x.effect !== undefined) {
      if (typeof x.effect === 'string') {
        if (x.effect.length > 6000) throw new Error('效果说明过长。');
      } else if (
        !x.effect ||
        typeof x.effect.text !== 'string' ||
        x.effect.text.length > 6000
      )
        throw new Error('效果说明格式不正确。');
    }
    if (x.success !== undefined || x.failure !== undefined) {
      if (
        !x.success ||
        !x.failure ||
        typeof x.success.text !== 'string' ||
        typeof x.failure.text !== 'string' ||
        !TRAIT_KEYS.includes(x.trait) ||
        !Number.isInteger(x.threshold) ||
        x.threshold < 0 ||
        x.threshold > 30
      )
        throw new Error('事件检定格式不正确。');
    }
    if (x.tracks !== undefined) {
      if (
        !x.start ||
        TRAIT_KEYS.some(
          (k) =>
            !Array.isArray(x.tracks[k]) ||
            x.tracks[k].length !== 9 ||
            x.tracks[k][0] !== 0 ||
            x.tracks[k].some((n) => !Number.isInteger(n) || n < 0 || n > 20) ||
            !Number.isInteger(x.start[k]) ||
            x.start[k] < 1 ||
            x.start[k] > 8,
        ) ||
        Object.keys(x.tracks).some((k) => !TRAIT_KEYS.includes(k))
      )
        throw new Error('人物属性轨格式不正确。');
    }
    if (
      x.quantity !== undefined &&
      (!Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 100)
    )
      throw new Error('组件数量应为 1–100。');
    if (
      x.icon !== undefined &&
      ![null, 'event', 'item', 'omen'].includes(x.icon)
    )
      throw new Error('抽牌图标不正确。');
    if (
      x.limit !== undefined &&
      (!Number.isInteger(x.limit) || x.limit < 1 || x.limit > 100)
    )
      throw new Error('回合数不正确。');
    if (
      row.category === 'rooms' &&
      (!Array.isArray(x.doors) ||
        !x.doors.length ||
        x.doors.some((n) => ![0, 1, 2, 3].includes(n)) ||
        new Set(x.doors).size !== x.doors.length ||
        !Array.isArray(x.floors) ||
        !x.floors.length ||
        x.floors.some((n) => ![-1, 0, 1].includes(n)) ||
        !Number.isInteger(x.art) ||
        x.art < 0 ||
        x.art > 8)
    )
      throw new Error('房间必须有合法楼层、门和插画。');
  }
  return structuredClone(d.entries);
}
