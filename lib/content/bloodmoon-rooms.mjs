// 独立地图块复用现有房间画面；不改变旧实验室、锅炉房的定义或抽取顺序。
export const BOILER_STEAM_CHECK = Object.freeze({
  title: '锅炉房 · 避开蒸汽',
  trait: 'speed',
  threshold: 4,
  description:
    '锅炉房开启的蒸汽喷入相邻房间。每片蒸汽持续期间，每名角色在每个受影响房间首次进入或开始回合时进行速度 4+ 检定。',
  success: '避开蒸汽，不受伤，可以继续移动。',
  failure: '受到 1 点肉体伤害，停止本回合移动。',
  enemyFailure: '受到 1 点环境伤害，停止本回合移动。',
});
export const BLOODMOON_ROOMS = [
  [
    'bloodmoon-laboratory',
    '实验室',
    [-1, 1],
    [0, 2],
    'bloodmoon-laboratory',
    '知识 5+ 制备药剂：成功后从力量、速度、神智药剂中选一瓶，使用后对应属性立即右移2格且不会自动回退；失败本轮仍消耗制药机会。制药与熔铸都消耗本轮互动。',
  ],
  [
    'bloodmoon-boiler',
    '锅炉房',
    [-1],
    [0, 1, 2],
    'bloodmoon-boiler',
    `可开启蒸汽阀；知识 4+ 可熔铸银弹。${BOILER_STEAM_CHECK.description}成功：${BOILER_STEAM_CHECK.success}失败：${BOILER_STEAM_CHECK.failure}`,
  ],
  [
    'sterilization',
    '消毒杀菌室',
    [-1, 0],
    [0, 2],
    'sterilization',
    '结束回合时可净化一个负面状态，每人整局一次。',
  ],
].map(([id, name, floors, doors, special, description]) => ({
  id,
  name,
  floors,
  doors,
  special,
  description,
  art: 7,
  icon: null,
  windows: [],
  tags: ['bloodmoon'],
  supply: 'bloodmoon',
}));
