// 独立地图块复用现有房间画面；不改变旧实验室、锅炉房的定义或抽取顺序。
export const BLOODMOON_ROOMS = [
  [
    'bloodmoon-laboratory',
    '实验室',
    [-1, 1],
    [0, 2],
    'bloodmoon-laboratory',
    '知识5+制备药剂；知识4+熔铸银弹。',
  ],
  [
    'bloodmoon-boiler',
    '锅炉房',
    [-1],
    [0, 1, 2],
    'bloodmoon-boiler',
    '开启蒸汽阀；知识4+熔铸银弹。',
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
