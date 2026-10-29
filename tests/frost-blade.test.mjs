import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';

const settle = (game) => drivePendingRequests(game, act);
const start = () =>
  settle(createHauntPlaytest('werewolf', 23, 3, 'frost-blade'));
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });
function contest(game, attack, defense) {
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(0);
    roll.dice[0] = index === 0 ? attack : defense;
  });
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
}

test('赢1点可放弃伤害令固定怪物减速，下一回合不移动', () => {
  let game = start();
  game = contest(act(game, { type: 'attack', id: 'fixed-monster-test' }), 1, 0);
  assert.match(pending(game).title, /冰霜刃/);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = settle(choose(game, 'freeze'));
  assert(!game.enemies[0].stunned);
  assert.equal(game.enemies[0].frostSlow, 2);
  assert(game.heroes[0].attacked);
  assert(!actions(game).attack.includes('fixed-monster-test'));
  const origin = game.enemies[0].pos;
  game.heroes
    .filter((hero) => !hero.traitor)
    .forEach((hero) => {
      hero.pos = 'entrance';
    });
  game = settle(act(game, { type: 'endRound' }));
  assert.equal(game.enemies[0].pos, origin);
  assert.equal(game.enemies[0].frostSlow, undefined);
});

test('赢2点选择减速后仍造成1点伤害，固定怪物被击晕', () => {
  let game = start();
  game = contest(act(game, { type: 'attack', id: 'fixed-monster-test' }), 2, 0);
  game = settle(choose(game, 'freeze'));
  assert(game.enemies[0].stunned);
  assert.equal(game.enemies[0].frostSlow, 2);
  game = settle(act(game, { type: 'endRound' }));
  assert(!game.enemies[0].stunned);
  assert.equal(game.enemies[0].frostSlow, undefined);
});

test('平局和失败时没有减速选择，放弃使用保留完整伤害', () => {
  let game = start();
  game = contest(act(game, { type: 'attack', id: 'fixed-monster-test' }), 0, 0);
  assert.notEqual(pending(game)?.title, '冰霜刃 · 寒霜');
  game = start();
  game = contest(act(game, { type: 'attack', id: 'fixed-monster-test' }), 2, 0);
  game = settle(choose(game, 'skip'));
  assert(game.enemies[0].stunned);
  assert.equal(game.enemies[0].frostSlow, undefined);
});

test('人物对抗胜利后可减速目标，下一次人物回合减少移动力', () => {
  let game = settle(
    createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-control'),
  );
  game.heroes[1].turnStartedRound = 0;
  addItemInstance(game.heroes[0], 'frost-blade', 'test:frost');
  const moves = game.heroes[1].moves;
  game = contest(act(game, { type: 'actorAttack', targetId: 1 }), 1, 0);
  assert.match(pending(game).title, /冰霜刃/);
  game = settle(choose(game, 'freeze'));
  assert.equal(game.heroes[1].frostSlow, 2);
  game = settle(act(game, { type: 'endHero' }));
  assert.equal(game.heroes[1].frostSlow, undefined);
  assert.equal(game.heroes[1].moves, Math.max(0, moves - 2));
});

test('属性轨怪物承受扣减后的伤害并获得减速', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'tracked-monster'));
  addItemInstance(game.heroes[0], 'frost-blade', 'test:frost');
  const before =
    game.enemies[0].positions.might + game.enemies[0].positions.speed;
  game = contest(
    act(game, { type: 'attack', id: 'tracked-monster-test' }),
    2,
    0,
  );
  game = settle(choose(game, 'freeze'));
  assert.equal(
    game.enemies[0].positions.might + game.enemies[0].positions.speed,
    before - 1,
  );
  assert.equal(game.enemies[0].frostSlow, 2);
});
