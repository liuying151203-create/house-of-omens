import { setupClassic } from './setup.mjs';

export const bells = {
  id: 'bells',
  hauntRules: [{ priority: 0, matches: () => true }],
  setup: (game, metadata, context) =>
    setupClassic(game, metadata, context, {
      target: () => 'seal',
      spawn: spawnKeeper,
    }),
  victory: (game) => game.progress === 3 && '三处祭坛已全部封印。',
  timeoutReason: '第十三声钟响响起。你们的名字被写进旧名册。',
  afterEnemies(game, report) {
    if (game.elapsed % 3 !== 0 || game.enemies.length >= 3) return;
    game.enemies.push({
      id: 'shade' + game.elapsed,
      name: '钟声幽影',
      pos: game.targetRooms[0],
      hp: 3,
      maxHp: 3,
      kind: 'shadow',
      might: 2,
      speed: 1,
    });
    report.push('祭坛旁凝聚了一只钟声幽影。');
  },
};

function spawnKeeper(s, sc, { living }) {
  const h = living(s).find((h) => h.id === 2) || living(s).at(-1);
  h.traitor = true;
  h.ended = true;
  h.moves = 0;
  const hp = 5 + s.count;
  s.enemies.push({
    id: 'keeper',
    heroId: h.id,
    name: '守钟人',
    pos: h.pos,
    hp,
    maxHp: hp,
    kind: 'keeper',
    might: 3,
    speed: 1,
  });
  return sc.haunt.replaceAll('沈墨', h.name);
}
