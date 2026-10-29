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
  connections,
} from './game-engine.mjs';
import { BLOODMOON_ITEMS } from './content/bloodmoon-items.mjs';
import { BLOODMOON_ROOMS } from './content/bloodmoon-rooms.mjs';
import { addItemInstance, transferItemInstance } from './item-instances.mjs';
import { installDoorLock } from './content/door-locks.mjs';
import { statusOf } from './werewolf.mjs';
import { moonPhase } from './content/bloodmoon-actors.mjs';

export const NORMAL_SAVE_KEY = 'hillhouse-demo-v2';
export const PLAYTEST_SAVE_KEY = 'hillhouse-haunt-playtest-v1';
export const CHECKPOINT_SAVE_KEY = 'hillhouse-haunt-checkpoint-v1';
const presets = [
  {
    id: 'shadow-cloak',
    label: '新物品 · 幽影斗篷（范围攻击测试）',
    description: '队友携带斗篷，首位人物持有哀鸣小提琴；选择队友所在门厅，观察速度闪避。其他攻击类型尚未接入。',
  },
  {
    id: 'shadow-cloak-pistol',
    label: '新物品 · 幽影斗篷（手枪测试）',
    description: '首位人物持枪，狼人持有斗篷；普通射击的目标闪避失败后可再次使用斗篷。',
  },
  {
    id: 'shadow-cloak-melee',
    label: '新物品 · 幽影斗篷（近战测试）',
    description: '首位狼人持冰霜刃，同室人物持幽影斗篷；攻击获胜后可选择寒霜，再由目标尝试闪避。',
  },
  {
    id: 'shadow-cloak-monster',
    label: '新物品 · 幽影斗篷（怪物攻击测试）',
    description: '人物携带幽影斗篷，测试狼人位于同室；结束本轮后观察怪物攻击、闪避及感染。',
  },
  {
    id: 'shadow-cloak-card',
    label: '新物品 · 幽影斗篷（卡牌攻击测试）',
    description: '人物持有斗篷并获得咬痕；攻击命中时可闪避，随后继续作祟检定。',
  },
  {
    id: 'shadow-cloak-counter',
    label: '新物品 · 幽影斗篷（怪物反击测试）',
    description: '人物携带斗篷，与同室怪物近战；怪物防御胜出时可尝试闪避反击。',
  },
  {
    id: 'classic-monster',
    label: '怪物机制 · 旧剧本怪物',
    description:
      '首位人物与旧剧本怪物同室；可攻击使其击晕，再通过互动永久封印。',
  },
  {
    id: 'mirror-wraith',
    label: '怪物机制 · 镜魇真身',
    description: '首位人物位于真镜房间；调查后击晕镜魇，再以互动封印并完成剧本。',
  },
  {
    id: 'classic-wolf',
    label: '怪物机制 · 旧剧本狼人',
    description: '首位人物与狼王同室；普通攻击使其击晕，可通过互动封印，旧剧本仍保留月印解咒路线。',
  },
  {
    id: 'substitute-doll-wolf',
    label: '新物品 · 替身木偶（狼人目标）',
    description: '持有者即将受到身体伤害，可转移给不是伤害来源的狼人；狼人无法拒绝，转移伤害不致死。',
  },
  {
    id: 'substitute-doll-shot',
    label: '新物品 · 替身木偶（枪击来源）',
    description: '首位人物持枪，狼人持有替身木偶；枪击命中后可转移伤害，但不能选射击者。',
  },
  {
    id: 'evil-knife',
    label: '新物品 · 邪恶小刀',
    description:
      '首位人物携带邪恶小刀，与测试怪物同室；近战前选择加骰，平局或失败后承受1点精神伤害。',
  },
  {
    id: 'exorcism-bell',
    label: '新物品 · 驱邪手铃',
    description:
      '首位人物携带手铃，队友同室，测试怪物在相邻门厅；选择目标并逐格移动，最多3格。',
  },
  {
    id: 'exorcism-bell-steam',
    label: '新物品 · 驱邪手铃（蒸汽）',
    description: '首位人物可将同室队友移动至有蒸汽的门厅；检定失败后本次强制移动停止。',
  },
  {
    id: 'frost-blade',
    label: '新物品 · 冰霜刃',
    description:
      '首位人物携带冰霜刃，与固定属性测试怪物同室；近战获胜后可用1点伤害换取减速。',
  },
  {
    id: 'wailing-violin',
    label: '新物品 · 哀鸣小提琴',
    description:
      '首位人物携带小提琴，队友与三种测试怪物在门厅；选择门厅，观察群体理智伤害和精神免疫。',
  },
  {
    id: 'luck-cup',
    label: '新物品 · 改运骰盅',
    description:
      '首位人物携带骰盅并面临事件检定；掷骰失败后可选择重掷全部骰子。',
  },
  {
    id: 'substitute-doll',
    label: '新物品 · 替身木偶',
    description:
      '首位人物即将受到4点身体伤害；可转移给队友，队友的力量和速度各只能安全承受1格。',
  },
  {
    id: 'mind-amulet',
    label: '新物品 · 心灵护符',
    description:
      '首位人物即将受到2点精神伤害，理智处于死亡点前一格；可选择减伤，再将伤害分配给理智测试保命。',
  },
  {
    id: 'riot-shield',
    label: '新物品 · 防暴盾',
    description:
      '首位人物携带防暴盾，敌人与队伍同室；结束本轮后可在遭受身体伤害时选择使用盾牌。',
  },
  {
    id: 'shifting-mirror',
    label: '新物品 · 移形镜',
    description:
      '首位人物携带移形镜，同楼层队友位于另一房间；确认后交换位置。',
  },
  {
    id: 'shifting-mirror-hostile',
    label: '新物品 · 移形镜（敌对人物）',
    description: '人物持有移形镜，初始狼人在同楼层另一房间；可由持有者确认并交换位置。',
  },
  {
    id: 'worn-lock',
    label: '新物品 · 破旧的锁',
    description:
      '首位人物携带锁并与队友同室；锁住房间门后可交出钥匙尝试破锁，结束本轮可观察门外怪物破锁。',
  },
  {
    id: 'worn-lock-monster-key',
    label: '新物品 · 破旧的锁（怪物钥匙）',
    description: '门已上锁，门外怪物对应的转化人物持有钥匙；结束本轮观察其通过后锁仍有效。',
  },
  {
    id: 'echo-spool',
    label: '新物品 · 回声线轴',
    description: '首位人物携带回声线轴；留下线头后走到相邻房间，再瞬移回返。',
  },
  {
    id: 'echo-spool-hazard',
    label: '新物品 · 回声线轴（跳过陷阱）',
    description: '线头已留在温室，人物在门厅，途中门口有敌方陷阱；回返只结算目的地，不经过陷阱。',
  },
  {
    id: 'basic',
    label: '作祟开局',
    description: '地图与物品就绪，从作祟第一轮开始。',
  },
  {
    id: 'knowledge-bread',
    label: '新物品 · 知识面包',
    description:
      '首位人物携带知识面包，可测试力量提升1格、知识提升2格及使用后消耗。',
  },
  {
    id: 'survival-guide',
    label: '新物品 · 生存指南',
    description:
      '首位人物携带生存指南，同室队友可交付、放下和拾取；观察知识属性及检定加骰变化。',
  },
  {
    id: 'heavy-armor',
    label: '新物品 · 沉重铠甲',
    description:
      '首位人物携带沉重铠甲，敌人同室；可测试身体伤害减1及初始移动力减少1。',
  },
  {
    id: 'thorn-armor',
    label: '新物品 · 荆棘铠甲',
    description:
      '首位人物携带荆棘铠甲，敌人同室；近战受伤并分配后，可选择反伤。',
  },
  {
    id: 'old-music-box',
    label: '新物品 · 旧八音盒',
    description:
      '首位人物携带旧八音盒，两名人物理智受损；进行知识检定并选择恢复对象。',
  },
  {
    id: 'medkit-allocation',
    label: '新物品 · 急救箱自由分配',
    description:
      '首位人物的力量和速度均已受伤，携带急救箱；选择总计最多4格的分配方案并使用。',
  },
  {
    id: 'mental-recovery-items',
    label: '恢复物品 · 清醒盐与褪色茶包',
    description: '首位人物知识与理智受损，携带两件恢复物品；分别恢复知识和理智。',
  },
  {
    id: 'sports-drink',
    label: '恢复物品 · 运动饮料',
    description: '首位人物力量和速度受损并持有运动饮料；饮用后本回合及下回合结束时各选择恢复1格。',
  },
  {
    id: 'fixed-monster',
    label: '怪物机制 · 固定属性与击晕',
    description:
      '首位人物与固定四项属性的测试怪物同室；命中后可消耗互动永久封印，或结束整轮观察击晕后跳过回合。',
  },
  {
    id: 'fixed-monster-trap',
    label: '怪物机制 · 陷阱击晕',
    description: '人物同室，固定属性怪物在相邻房间，人物所在房间有捕兽夹；结束本轮观察怪物被击晕后停止攻击。',
  },
  {
    id: 'fixed-monster-trap-steam',
    label: '怪物机制 · 陷阱与蒸汽',
    description: '人物所在房间同时有捕兽夹与蒸汽；怪物进入后先被击晕，再结算蒸汽，随后停止攻击并保留击晕。',
  },
  {
    id: 'tracked-monster',
    label: '怪物机制 · 属性轨怪物',
    description:
      '首位人物与属性轨怪物同室；攻击后检查身体属性下降，任一属性降到骷髅时按测试规则消灭。',
  },
  {
    id: 'tracked-alpha',
    label: '怪物机制 · 属性轨狼王',
    description: '首位人物与属性轨狼王同室，近战胜出后按完整伤害扣减属性，不使用旧生命值厚皮上限。',
  },
  {
    id: 'tracked-mental-immune',
    label: '怪物机制 · 属性轨精神免疫',
    description: '首位人物持有哀鸣小提琴，与精神免疫的属性轨怪物同室；演奏不影响怪物，身体攻击仍会扣减身体属性。',
  },
  {
    id: 'thorn-armor-tracked',
    label: '新物品 · 荆棘铠甲（属性轨反伤）',
    description: '人物穿戴荆棘铠甲，与濒临死亡点的属性轨怪物同室；结束本轮后受攻击时可选择反伤并验证胜利结算。',
  },
  {
    id: 'bloodmoon-bite',
    label: '咬痕攻防与作祟（独立测试）',
    description:
      '从作祟前抽取咬痕开始，已获得两张预兆，首位人物携带命运戒指。先查看攻防结果、重骰和伤害分配，再进行作祟检定；完整血月剧本尚未接入，触发后仍进入所选的旧狼人剧本。',
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
    id: 'bloodmoon-entry',
    label: '咬痕 → 血月正式触发',
    description:
      '已获得铃铛与书，首位人物携带命运戒指，正在获得最后一张预兆咬痕。完成攻防、重骰与伤害后进行作祟检定，咬痕持有者成为初始狼人。',
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
    id: 'bloodmoon-recovery-capped-bandage',
    label: '恢复物品 · 属性上限',
    description: '狼人力量起始位置设为第7格，银弹上限为第4格且当前已到上限；止血绷带不能无效消耗。',
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
  ...(scenario === 'werewolf'
    ? presets.filter((preset) => !['classic-monster', 'mirror-wraith'].includes(preset.id))
    : presets
        .filter(
          (preset) =>
            preset.id === 'basic' ||
            (preset.id === 'mirror-wraith' && scenario === 'mirror') ||
            (preset.id === 'classic-monster' &&
              ['bells', 'mirror', 'flood'].includes(scenario)),
        )
        .sort((a, b) => Number(b.id === 'basic') - Number(a.id === 'basic'))),
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
  if (focus === 'bloodmoon-bite' || focus === 'bloodmoon-entry' || focus === 'shadow-cloak-card')
    return createBitePlaytest(game, selected);
  if (
    [
      'bloodmoon-control',
      'shifting-mirror-hostile',
      'substitute-doll-wolf',
      'shadow-cloak-melee',
      'bloodmoon-fullmoon',
      'bloodmoon-bloodmoon',
      'bloodmoon-secondary',
      'bloodmoon-pistol',
      'substitute-doll-shot',
      'shadow-cloak-pistol',
      'bloodmoon-shot-blocked',
      'bloodmoon-silver-first',
      'bloodmoon-silver-second',
      'bloodmoon-immortal',
      'bloodmoon-immortal-allocation',
      'bloodmoon-recovery-cap',
      'bloodmoon-recovery-capped-bandage',
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
    ...(focus === 'survival-guide' ? [['item', 'survival-guide']] : []),
    ...(focus === 'heavy-armor' ? [['item', 'heavy-armor']] : []),
    ...(focus === 'thorn-armor' ? [['item', 'thorn-armor']] : []),
    ...(focus === 'old-music-box' ? [['item', 'old-music-box']] : []),
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
  if (focus === 'classic-wolf' && scenario === 'werewolf') {
    const alpha = game.enemies.find((enemy) => enemy.kind === 'alpha');
    alpha.pos = allies[0].pos;
    game.heroes[alpha.heroId].pos = alpha.pos;
    game.active = allies[0].id;
  }
  if (focus === 'mirror-wraith' && scenario === 'mirror') {
    allies[0].pos = game.trueMirror;
    game.active = allies[0].id;
    game.viewFloor = game.rooms.find((room) => room.id === game.trueMirror).floor;
  }
  if (focus === 'shadow-cloak-monster') {
    const target = allies[0];
    addItemInstance(target, 'shadow-cloak', 'playtest:shadow-cloak');
    game.enemies = [{ id: 'cloak-test-wolf', name: '测试狼人', kind: 'wolf', pos: target.pos, huntTarget: target.id, traitModel: 'fixed', traits: { might: 4, speed: 2, sanity: 2, knowledge: 2 }, stunned: false }];
    game.active = target.id;
  }
  if (focus === 'classic-monster' && ['bells', 'mirror', 'flood'].includes(scenario)) {
    const monster = game.enemies.find((entry) => entry.id === (scenario === 'bells' ? 'keeper' : 'wanderer'));
    if (monster) monster.pos = allies[0].pos;
    game.active = allies[0].id;
  }
  if (focus === 'exorcism-bell' || focus === 'exorcism-bell-steam') {
    addItemInstance(allies[0], 'exorcism-bell', 'playtest:exorcism-bell');
    game.enemies = [
      {
        id: 'bell-monster-test',
        name: '手铃测试怪物',
        kind: 'shadow',
        pos: 'entrance',
        traitModel: 'fixed',
        traits: { might: 2, speed: 1, sanity: 2, knowledge: 2 },
        stunned: false,
        elimination: 'sealWhileStunned',
      },
    ];
    game.active = allies[0].id;
    if (focus === 'exorcism-bell-steam')
      game.bloodmoon = { steam: [{ id: 'playtest:bell-steam', active: true, ownerId: allies[0].id, roomIds: ['entrance'], checked: [], expiresRound: game.round + 1 }] };
  }
  if (focus === 'wailing-violin' || focus === 'shadow-cloak') {
    const owner = allies[0],
      target = allies[1];
    addItemInstance(owner, 'wailing-violin', 'playtest:wailing-violin');
    if (focus === 'shadow-cloak') addItemInstance(target, 'shadow-cloak', 'playtest:shadow-cloak');
    target.pos = 'entrance';
    const traits = { might: 2, speed: 1, sanity: 2, knowledge: 2 };
    const track = [0, 1, 2, 3, 4];
    game.enemies = [
      {
        id: 'violin-fixed',
        name: '测试怪物',
        kind: 'shadow',
        pos: 'entrance',
        traitModel: 'fixed',
        traits: { ...traits },
        stunned: false,
        elimination: 'sealWhileStunned',
      },
      {
        id: 'violin-immune',
        name: '无声怪物',
        kind: 'shadow',
        pos: 'entrance',
        traitModel: 'fixed',
        traits: { ...traits },
        mentalImmune: true,
        stunned: false,
        elimination: 'sealWhileStunned',
      },
      {
        id: 'violin-tracked',
        name: '属性轨怪物',
        kind: 'shadow',
        pos: 'entrance',
        traitModel: 'tracks',
        tracks: Object.fromEntries(
          ['might', 'speed', 'sanity', 'knowledge'].map((key) => [
            key,
            [...track],
          ]),
        ),
        positions: { might: 2, speed: 2, sanity: 2, knowledge: 2 },
      },
    ];
    game.active = owner.id;
  }
  if (focus === 'luck-cup') {
    const hero = allies[0];
    addItemInstance(hero, 'luck-cup', 'playtest:luck-cup');
    game.active = hero.id;
    game.queue = [];
    game.decks.event = [
      'cipher',
      ...game.decks.event.filter((id) => id !== 'cipher'),
    ];
    drawCard(game, 'event', hero);
  }
  if (focus === 'substitute-doll') {
    const owner = allies[0],
      target = allies[1];
    addItemInstance(owner, 'substitute-doll', 'playtest:substitute-doll');
    target.stats.might = 2;
    target.stats.speed = 2;
    game.active = owner.id;
    executeRuleEffects(game, [
      {
        op: 'damage.deal',
        params: {
          heroId: owner.id,
          damageType: 'physical',
          amount: 4,
          sourceKind: 'test',
        },
      },
    ]);
  }
  if (focus === 'mind-amulet') {
    const hero = allies[0];
    addItemInstance(hero, 'mind-amulet', 'playtest:mind-amulet');
    hero.omens = hero.omens.filter((id) => id !== 'locket');
    hero.stats.sanity = 1;
    game.active = hero.id;
    executeRuleEffects(game, [
      {
        op: 'damage.deal',
        params: {
          heroId: hero.id,
          damageType: 'mental',
          amount: 2,
          sourceKind: 'test',
        },
      },
    ]);
  }
  if (focus === 'riot-shield') {
    addItemInstance(allies[0], 'riot-shield', 'playtest:riot-shield');
    game.active = allies[0].id;
    if (game.enemies[0]) {
      game.enemies[0].pos = allies[0].pos;
      game.enemies[0].might = 8;
    }
  }
  if (focus === 'shifting-mirror') {
    addItemInstance(allies[0], 'shifting-mirror', 'playtest:shifting-mirror');
    allies[1].pos = 'entrance';
    game.active = allies[0].id;
  }
  if (focus === 'worn-lock' || focus === 'worn-lock-monster-key') {
    addItemInstance(allies[0], 'worn-lock', 'playtest:worn-lock');
    game.enemies = [
      {
        id: 'lock-monster-test',
        name: '门外的怪物',
        kind: 'shadow',
        pos: 'entrance',
        traitModel: 'fixed',
        traits: { might: 3, speed: 1, sanity: 2, knowledge: 2 },
        stunned: false,
        elimination: 'sealWhileStunned',
      },
    ];
    if (focus === 'worn-lock-monster-key') {
      const owner = allies[0];
      const transformed = game.heroes.find((hero) => hero.traitor);
      const lock = installDoorLock(game, owner, 'playtest:worn-lock', 'entrance');
      transferItemInstance(owner, transformed, 'playtest:worn-lock');
      game.enemies[0].heroId = transformed.id;
      transformed.pos = game.enemies[0].pos;
      for (const roomId of lock.rooms) {
        const room = game.rooms.find((entry) => entry.id === roomId);
        room.tokens ||= [];
        room.tokens.push({ id: lock.id, icon: '⌑', label: '破旧的锁', description: '该门已上锁；持有钥匙的人可通行。' });
      }
    }
    game.active = allies[0].id;
  }
  if (focus === 'echo-spool' || focus === 'echo-spool-hazard') {
    const spool = addItemInstance(allies[0], 'echo-spool', 'playtest:echo-spool');
    if (focus === 'echo-spool-hazard') {
      const markerRoom = game.rooms.find((room) => room.id === allies[0].pos);
      spool.state.echoRoomId = markerRoom.id;
      spool.state.echoSetterId = allies[0].id;
      markerRoom.tokens ||= [];
      markerRoom.tokens.push({ id: 'echo-spool:playtest:echo-spool', icon: '⌁', label: '回声线头', description: '持有线轴的人可从可通行距离4步内回返。' });
      allies[0].pos = 'foyer';
      game.rooms.find((room) => room.id === 'entrance').traps = [{ id: 'playtest:echo-trap', faction: 'wolves', ownerId: game.heroes.find((hero) => hero.traitor)?.id }];
    }
    game.active = allies[0].id;
  }
  if (focus === 'old-music-box') {
    for (const hero of allies.slice(0, 2))
      hero.stats.sanity = Math.max(1, hero.start.sanity - 1);
    game.active = allies[0].id;
  }
  if (focus === 'heavy-armor' || focus === 'thorn-armor') {
    game.active = allies[0].id;
    if (game.enemies[0]) game.enemies[0].pos = allies[0].pos;
  }
  if (focus === 'knowledge-bread') {
    addItemInstance(allies[0], 'knowledge-bread', 'playtest:knowledge-bread');
    game.active = allies[0].id;
  }
  if (focus === 'medkit-allocation') {
    const owner = allies[0];
    owner.stats.might = 1;
    owner.stats.speed = 1;
    addItemInstance(owner, 'medkit', 'playtest:medkit');
    game.decks.item = game.decks.item.filter((id) => id !== 'medkit');
    game.active = owner.id;
  }
  if (focus === 'mental-recovery-items') {
    const owner = allies[0];
    owner.stats.knowledge = Math.max(1, owner.start.knowledge - 2);
    owner.stats.sanity = Math.max(1, owner.start.sanity - 2);
    addItemInstance(owner, 'tonic', 'playtest:clarity-salts');
    addItemInstance(owner, 'tea', 'playtest:faded-tea');
    game.active = owner.id;
  }
  if (focus === 'sports-drink') {
    const owner = allies[0];
    owner.stats.might = Math.max(1, owner.start.might - 2);
    owner.stats.speed = Math.max(1, owner.start.speed - 2);
    addItemInstance(owner, 'sports-drink', 'playtest:sports-drink');
    game.active = owner.id;
  }
  if (
    focus === 'fixed-monster' ||
    focus === 'fixed-monster-trap' ||
    focus === 'fixed-monster-trap-steam' ||
    focus === 'shadow-cloak-counter' ||
    focus === 'frost-blade' ||
    focus === 'evil-knife'
  ) {
    const owner = allies[0];
    if (focus === 'shadow-cloak-counter')
      addItemInstance(owner, 'shadow-cloak', 'playtest:shadow-cloak');
    if (focus === 'frost-blade')
      addItemInstance(owner, 'frost-blade', 'playtest:frost-blade');
    if (focus === 'evil-knife') {
      addItemInstance(owner, 'evil-knife', 'playtest:evil-knife');
      owner.omens = owner.omens.filter((id) => id !== 'locket');
    }
    game.enemies = [
      {
        id: 'fixed-monster-test',
        name: '测试怪物',
        kind: 'shadow',
        pos: owner.pos,
        traitModel: 'fixed',
        traits: { might: 1, speed: 1, sanity: 3, knowledge: 2 },
        might: 1,
        speed: 1,
        stunned: false,
        elimination: 'sealWhileStunned',
      },
    ];
    if (['fixed-monster-trap', 'fixed-monster-trap-steam'].includes(focus)) {
      for (const hero of allies) hero.pos = owner.pos;
      game.enemies[0].pos = connections(game, owner.pos)[0];
      game.rooms.find((room) => room.id === owner.pos).traps = [{ id: 'playtest:stun-trap', faction: 'heroes', ownerId: owner.id }];
      if (focus === 'fixed-monster-trap-steam')
        game.bloodmoon = { steam: [{ id: 'playtest:steam', active: true, ownerId: owner.id, expiresRound: game.round + 1, roomIds: [owner.pos], checked: [] }] };
    }
    game.active = owner.id;
  }
  if (['tracked-monster', 'tracked-alpha', 'tracked-mental-immune', 'thorn-armor-tracked'].includes(focus)) {
    const owner = allies[0];
    if (focus === 'tracked-mental-immune')
      addItemInstance(owner, 'wailing-violin', 'playtest:wailing-violin');
    if (focus === 'thorn-armor-tracked')
      addItemInstance(owner, 'thorn-armor', 'playtest:thorn-armor');
    const track = focus === 'tracked-alpha' ? Array.from({ length: 10 }, (_, index) => index) : [0, 1, 2, 3, 4, 5];
    game.enemies = [
      {
        id: 'tracked-monster-test',
        name: '属性轨测试怪物',
        kind: focus === 'tracked-alpha' ? 'alpha' : 'shadow',
        pos: owner.pos,
        traitModel: 'tracks',
        mentalImmune: focus === 'tracked-mental-immune',
        tracks: Object.fromEntries(
          ['might', 'speed', 'sanity', 'knowledge'].map((key) => [
            key,
            [...track],
          ]),
        ),
        positions: { might: focus === 'tracked-alpha' ? 9 : 3, speed: focus === 'tracked-alpha' ? 9 : 3, sanity: 3, knowledge: 3 },
        start: { might: focus === 'tracked-alpha' ? 9 : 3, speed: focus === 'tracked-alpha' ? 9 : 3, sanity: 3, knowledge: 3 },
        elimination: 'traitZero',
      },
    ];
    if (focus === 'thorn-armor-tracked')
      game.enemies[0].positions.might = game.enemies[0].positions.speed = 1;
    game.active = owner.id;
  }
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
  addItemInstance(game.heroes[0], selected.id === 'shadow-cloak-card' ? 'shadow-cloak' : 'family-ring', `item-${game.itemSerial}`);
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
      'substitute-doll-shot',
      'shadow-cloak-pistol',
      'bloodmoon-shot-blocked',
      'bloodmoon-silver-first',
      'bloodmoon-silver-second',
    ].includes(selected.id),
    alphaId = gunTest ? 1 : 0,
    pursuitTest = selected.id.startsWith('bloodmoon-pursuit'),
    isolationTest = selected.id === 'bloodmoon-isolation';
  game.heroes[alphaId].omens.push('bite-mark');
  if (selected.id === 'shadow-cloak-melee') {
    addItemInstance(game.heroes[0], 'frost-blade', 'playtest:frost-blade');
    addItemInstance(game.heroes[1], 'shadow-cloak', 'playtest:shadow-cloak');
  }
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
    if (selected.id === 'substitute-doll-shot')
      addItemInstance(game.heroes[1], 'substitute-doll', 'playtest:substitute-doll');
    if (selected.id === 'shadow-cloak-pistol')
      addItemInstance(game.heroes[1], 'shadow-cloak', 'playtest:shadow-cloak');
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
  if (selected.id === 'bloodmoon-recovery-capped-bandage') {
    game.heroes[0].silverWeakened = true;
    game.heroes[0].start.might = 7;
    addItemInstance(game.heroes[0], 'bandage', 'playtest:capped-bandage');
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
  game.active = ['bloodmoon-pursuit-secondary', 'shifting-mirror-hostile'].includes(selected.id) ? 1 : 0;
  if (selected.id === 'shifting-mirror-hostile') {
    addItemInstance(game.heroes[1], 'shifting-mirror', 'playtest:shifting-mirror');
    game.heroes[0].pos = 'entrance';
  }
  if (pursuitTest) game.heroes[game.active].moves = 0;
  game = describePlaytest(game, selected);
  if (selected.id === 'substitute-doll-wolf') {
    game.active = 1;
    addItemInstance(game.heroes[1], 'substitute-doll', 'playtest:substitute-doll');
    game.heroes[0].stats.might = game.heroes[0].stats.speed = 1;
    executeRuleEffects(game, [{ op: 'damage.deal', params: { heroId: 1, damageType: 'physical', amount: 3, sourceHeroId: 2 } }]);
  }
  return game;
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
