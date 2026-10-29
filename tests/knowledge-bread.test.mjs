import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest, playtestPresets } from '../lib/playtest.mjs';
import { resolveGameSet } from '../lib/game-sets.mjs';

test('知识面包提升两条属性并消耗，定向测试可恢复', () => {
  assert(
    playtestPresets('werewolf').some((entry) => entry.id === 'knowledge-bread'),
  );
  let game = createHauntPlaytest('werewolf', 23, 3, 'knowledge-bread');
  game = act(game, { type: 'advance' });
  const hero = game.heroes[game.active];
  const before = { ...hero.stats };
  const action = actions(game).itemAbilities.find(
    (entry) => entry.cardId === 'knowledge-bread',
  );
  assert(action);
  game = act(restoreGameSave(JSON.parse(JSON.stringify(game))), action.command);
  const after = game.heroes[game.active];
  assert.equal(after.stats.might, before.might + 1);
  assert.equal(after.stats.knowledge, before.knowledge + 2);
  assert.equal(after.stats.speed, before.speed);
  assert.equal(after.stats.sanity, before.sanity);
  assert(!after.items.includes('knowledge-bread'));
  assert(!resolveGameSet('classic').decks.item.includes('knowledge-bread'));
  assert(resolveGameSet('expanded').decks.item.includes('knowledge-bread'));
});

test('知识面包不会超过属性轨上限', () => {
  let game = createHauntPlaytest('werewolf', 23, 3, 'knowledge-bread');
  game = act(game, { type: 'advance' });
  const hero = game.heroes[game.active];
  hero.stats.might = hero.tracks.might.length - 1;
  hero.stats.knowledge = hero.tracks.knowledge.length - 2;
  const action = actions(game).itemAbilities.find(
    (entry) => entry.cardId === 'knowledge-bread',
  );
  game = act(game, action.command);
  assert.equal(
    game.heroes[game.active].stats.might,
    hero.tracks.might.length - 1,
  );
  assert.equal(
    game.heroes[game.active].stats.knowledge,
    hero.tracks.knowledge.length - 1,
  );
  assert(!game.heroes[game.active].items.includes('knowledge-bread'));
});
