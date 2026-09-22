import { setupClassic, spawnWanderer } from './setup.mjs';

export const flood = {
  id: 'flood',
  hauntRules: [
    {
      priority: 20,
      matches: (omenId, room) =>
        ['compass', 'key'].includes(omenId) ||
        (room?.tags || []).includes('water'),
    },
  ],
  setup: (game, metadata, context) =>
    setupClassic(game, metadata, context, {
      target: (index) => (index < 2 ? 'fuse' : 'generator'),
      spawn: (state) => spawnWanderer(state, '溺亡者'),
    }),
  timeoutReason: '黑水漫过最后一级台阶，逃生时间用尽了。',
};
