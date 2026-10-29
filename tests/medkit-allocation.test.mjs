import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest, playtestPresets } from '../lib/playtest.mjs';

test('急救箱可将四格自由分配，确认后原子使用并支持存档恢复', () => {
  assert(
    playtestPresets('werewolf').some(
      (entry) => entry.id === 'medkit-allocation',
    ),
  );
  let game = createHauntPlaytest('werewolf', 23, 3, 'medkit-allocation');
  game = act(game, { type: 'advance' });
  const hero = game.heroes[game.active];
  const available = actions(game).itemAbilities.filter(
    (entry) => entry.cardId === 'medkit' && entry.handler === 'item.use',
  );
  assert.deepEqual(
    available.map((action) => [
      action.command.allocationMight,
      action.command.allocationSpeed,
    ]),
    [
      [1, 3],
      [2, 2],
    ],
  );
  const action = available.find((entry) => entry.command.allocationMight === 2);
  const restored = restoreGameSave(JSON.parse(JSON.stringify(game)));
  const result = act(restored, JSON.parse(JSON.stringify(action.command)));
  assert.equal(result.heroes[game.active].stats.might, hero.stats.might + 2);
  assert.equal(result.heroes[game.active].stats.speed, hero.stats.speed + 2);
  assert(!result.heroes[game.active].items.includes('medkit'));
  assert.deepEqual(act(result, action.command), result);
});

test('急救箱只恢复到起始位置，无法治疗时不消耗', () => {
  let game = createHauntPlaytest('werewolf', 23, 3, 'medkit-allocation');
  game = act(game, { type: 'advance' });
  const hero = game.heroes[game.active];
  hero.stats.might = hero.start.might;
  hero.stats.speed = hero.start.speed - 1;
  const available = actions(game).itemAbilities.filter(
    (entry) => entry.cardId === 'medkit' && entry.handler === 'item.use',
  );
  assert.equal(available.length, 1);
  assert.equal(available[0].command.allocationSpeed, 1);
  const full = structuredClone(game);
  full.heroes[full.active].stats.speed = full.heroes[full.active].start.speed;
  assert(
    !actions(full).itemAbilities.some(
      (entry) => entry.cardId === 'medkit' && entry.handler === 'item.use',
    ),
  );
  assert(full.heroes[full.active].items.includes('medkit'));
  game = act(game, available[0].command);
  assert.equal(game.heroes[game.active].stats.speed, hero.start.speed);
});
