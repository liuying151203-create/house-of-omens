import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  drawCard,
  movement,
  pending,
  traitValue,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';

test('沉重铠甲减少初始移动和每次身体伤害，存档恢复后仍有效', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 91, 4, 'heavy-armor'),
    act,
  );
  const hero = game.heroes[game.active],
    enemy = game.enemies[0];
  assert(hero.items.includes('heavy-armor'));
  assert.equal(movement(hero, game), traitValue(hero, 'speed', game) - 1);
  assert.equal(hero.moves, movement(hero, game));
  game = act(game, { type: 'attack', id: enemy.id });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? 0 : 2);
  });
  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveDice',
    requestId: pending(game).uid,
  });
  for (let i = 0; pending(game)?.kind !== 'damage' && i < 20; i++)
    game = act(game, { type: 'advance' });
  assert.equal(pending(game).rawAmount, 3);
  assert.equal(pending(game).prevented, 1);
  assert.equal(pending(game).remaining, 2);
});

test('沉重铠甲不减精神伤害，交付后移动规则跟随新持有者', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 4, 'heavy-armor'),
    act,
  );
  const owner = game.heroes[game.active],
    target = game.heroes.find(
      (hero) => hero.id !== owner.id && !hero.traitor && hero.pos === owner.pos,
    );
  const instanceId = owner.itemInstances.find(
    (item) => item.definitionId === 'heavy-armor',
  ).instanceId;
  owner.omens = [];
  game.decks.event = ['whisper'];
  drawCard(game, 'event', owner);
  game = act(game, { type: 'advance' });
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  for (let i = 0; pending(game)?.kind !== 'damage' && i < 20; i++)
    game = act(game, { type: 'advance' });
  assert.equal(pending(game).damageType, 'mental');
  assert.equal(pending(game).remaining, 2);
  game = drivePendingRequests(game, act);
  game = drivePendingRequests(
    act(game, { type: 'transferItem', instanceId, targetHeroId: target.id }),
    act,
  );
  assert.equal(
    movement(game.heroes[owner.id], game),
    traitValue(game.heroes[owner.id], 'speed', game),
  );
  assert.equal(
    movement(game.heroes[target.id], game),
    Math.max(0, traitValue(game.heroes[target.id], 'speed', game) - 1),
  );
});
