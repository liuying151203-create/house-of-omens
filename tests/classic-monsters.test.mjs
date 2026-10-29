import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  createGame,
  pending,
  triggerHaunt,
} from '../lib/game-engine.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { scenarioRules } from '../lib/content/scenarios/index.mjs';
import { createHauntPlaytest, playtestPresets } from '../lib/playtest.mjs';

const settle = (game) => drivePendingRequests(game, act);
function haunt(scenario) {
  let game = createGame(scenario, 33, 3);
  game.queue = [];
  triggerHaunt(game);
  game = settle(game);
  return game;
}

function stunAndSeal(game, id) {
  const enemy = game.enemies.find((entry) => entry.id === id);
  const hero = game.heroes[game.active];
  enemy.pos = hero.pos;
  assert.equal(enemy.traitModel, 'fixed');
  assert.deepEqual(Object.keys(enemy.traits).sort(), [
    'knowledge',
    'might',
    'sanity',
    'speed',
  ]);
  assert(!Object.hasOwn(enemy, 'hp'));
  const traits = structuredClone(enemy.traits);
  game = act(game, { type: 'attack', id });
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? 2 : 0);
  });
  game = settle(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
  );
  assert(game.enemies.find((entry) => entry.id === id).stunned);
  assert.deepEqual(
    game.enemies.find((entry) => entry.id === id).traits,
    traits,
  );
  const seal = actions(game).abilities.find(
    (entry) => entry.handler === 'monster.seal' && entry.targetId === id,
  );
  assert(seal);
  game = settle(act(game, seal.command));
  assert(!game.enemies.some((entry) => entry.id === id));
  return game;
}

test('旧镜子与洪水测试剧本的游荡怪物采用固定属性和特殊封印', () => {
  for (const scenario of ['mirror', 'flood']) {
    const game = stunAndSeal(haunt(scenario), 'wanderer');
    assert.equal(game.phase, 'haunt');
  }
});

test('旧钟声测试剧本的增援幽影采用固定属性和特殊封印', () => {
  const game = haunt('bells');
  game.elapsed = 3;
  scenarioRules('bells').afterEnemies(game, []);
  stunAndSeal(game, 'shade3');
});

test('旧钟声测试剧本的守钟人采用固定属性和特殊封印', () => {
  const game = stunAndSeal(haunt('bells'), 'keeper');
  assert(game.heroes.find((hero) => hero.traitor).dead);
});

test('镜魇现身后普通攻击使其击晕，特殊封印完成剧本', () => {
  let game = settle(createHauntPlaytest('mirror', 33, 3, 'mirror-wraith'));
  game.heroes[1].pos = game.trueMirror;
  const inspect = actions(game).abilities.find((entry) => entry.handler === 'scenario.mirror.inspect');
  assert(inspect);
  game = settle(act(game, inspect.command));
  assert(game.mirrorFound);
  assert.equal(game.enemies.find((enemy) => enemy.id === 'wraith').traitModel, 'fixed');
  game = settle(act(game, { type: 'select', id: 1 }));
  game = stunAndSeal(game, 'wraith');
  assert.equal(game.phase, 'over');
  assert(game.result.won);
});

test('旧狼人测试点以击晕和封印代替生命值，封印狼群后获胜', () => {
  let game = settle(createHauntPlaytest('werewolf', 33, 3, 'classic-wolf'));
  const alphaId = game.enemies.find((enemy) => enemy.kind === 'alpha').id;
  game = stunAndSeal(game, alphaId);
  assert(game.result.won);
});

test('镜子和洪水旧剧本提供普通怪物定向测试点', () => {
  for (const scenario of ['bells', 'mirror', 'flood']) {
    assert(
      playtestPresets(scenario).some((entry) => entry.id === 'classic-monster'),
    );
    const game = settle(
      createHauntPlaytest(scenario, 33, 3, 'classic-monster'),
    );
    assert.equal(
      game.enemies.find((entry) => entry.id === (scenario === 'bells' ? 'keeper' : 'wanderer')).pos,
      game.heroes[game.active].pos,
    );
    assert(actions(game).attack.includes(scenario === 'bells' ? 'keeper' : 'wanderer'));
  }
});
