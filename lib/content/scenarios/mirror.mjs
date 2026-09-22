import { setupClassic, spawnWanderer } from './setup.mjs';

export const mirror = {
  id: 'mirror',
  enemyDefeated: (_game, enemy) =>
    enemy.kind === 'wraith' && '镜魇的真身终于被打碎。',
  hauntRules: [
    {
      priority: 30,
      matches: (omenId, room) =>
        ['mirror-shard', 'doll', 'eye'].includes(omenId) ||
        (omenId === 'locket' && (room?.tags || []).includes('memory')),
    },
  ],
  setup: (game, metadata, context) =>
    setupClassic(game, metadata, context, {
      target: () => 'mirror',
      spawn: (state) => spawnWanderer(state, '游荡倒影'),
    }),
  timeoutReason: '所有镜面一起合拢，倒影替你们走出了宅邸。',
};
