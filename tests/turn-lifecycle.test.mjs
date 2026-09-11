import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  createInteractiveGame,
  triggerHaunt,
  pending,
  living,
  movement,
  traitValue,
  validSave,
} from '../lib/game-engine.mjs';

function start(haunt = false, count = 3) {
  const game = createInteractiveGame('werewolf', 23, count);
  game.queue = [];
  if (haunt) {
    triggerHaunt(game);
    game.queue = [];
    game.enemies[0].pos = 'entrance';
  }
  return game;
}

function attack(game) {
  const request = pending(game);
  assert.equal(request.kind, 'diceRequest');
  for (const roll of request.rolls)
    roll.dice = Array(roll.count).fill(roll.targetId !== undefined ? 2 : 0);
  return act(game, { type: 'resolveDice', requestId: request.uid });
}

function dismiss(game) {
  for (let i = 0; pending(game) && i < 30; i++) {
    assert.notEqual(pending(game).kind, 'damage');
    game = act(game, { type: 'advance' });
  }
  assert.equal(pending(game), null);
  return game;
}

test('enemy damage settles in the old round; all survivors refresh using their final speed', () => {
  let game = attack(act(start(true, 5), { type: 'endRound' }));
  const oldRound = 1;
  const requests = game.queue.filter((p) => p.kind === 'damage');
  assert.equal(requests.length, 2);
  assert.equal(game.round, oldRound);
  for (const request of requests) {
    assert.equal(pending(game).uid, request.uid);
    game = act(game, {
      type: 'allocateDamage',
      requestId: request.uid,
      allocation: { might: 2, speed: 1 },
    });
    assert.equal(game.round, oldRound);
    assert(game.heroes[request.heroId].ended);
  }
  assert(
    game.logs
      .filter((l) => l.text.includes('结算3点肉体伤害'))
      .every((l) => l.round === oldRound),
  );
  game = dismiss(game);
  assert.equal(game.round, oldRound + 1);
  for (const hero of living(game)) {
    assert.equal(hero.moves, movement(hero, game));
    assert(!hero.ended);
  }
  assert.equal(
    game.logs.filter((l) => l.text.includes('回合开始，移动力')).length,
    1,
  );
});

test('restoring during enemy damage keeps the deferred round and uses the reduced speed', () => {
  let game = attack(act(start(true), { type: 'endRound' }));
  const request = pending(game),
    id = request.heroId;
  const before = traitValue(game.heroes[id], 'speed');
  game = JSON.parse(JSON.stringify(game));
  assert(validSave(game));
  game = act(game, {
    type: 'allocateDamage',
    requestId: request.uid,
    allocation: { might: 1, speed: 2 },
  });
  assert(traitValue(game.heroes[id], 'speed') < before);
  const allocated = structuredClone(game);
  assert.deepEqual(
    act(game, {
      type: 'allocateDamage',
      requestId: request.uid,
      allocation: { might: 1, speed: 2 },
    }),
    allocated,
  );
  game = dismiss(game);
  assert.equal(game.round, 2);
  assert.equal(game.heroes[id].moves, movement(game.heroes[id], game));
});

test('a hero killed by the enemy phase is never refreshed for the next round', () => {
  let game = attack(act(start(true), { type: 'endRound' }));
  const request = pending(game),
    victim = request.heroId;
  game = act(game, {
    type: 'allocateDamage',
    requestId: request.uid,
    allocation: { might: 3, speed: 0 },
  });
  assert(game.heroes[victim].dead);
  game = dismiss(game);
  assert.equal(game.round, 2);
  assert.notEqual(game.active, victim);
  assert.equal(game.heroes[victim].moves, 0);
  assert(game.heroes[victim].ended);
});

test('an enemy phase without an attack starts the next round after its report', () => {
  let game = start(true);
  game.enemies[0].pos = 'basement';
  game.links = [];
  game = act(game, { type: 'endRound' });
  assert.equal(pending(game).kind, 'enemyTurn');
  assert.equal(game.round, 1);
  game = dismiss(game);
  assert.equal(game.round, 2);
  assert.equal(game.elapsed, 1);
});

test('replayed finish commands cannot end another hero or a later round', () => {
  let game = start();
  const command = { type: 'endHero', actorId: game.active, round: game.round };
  game = act(game, command);
  const next = structuredClone(game);
  assert.deepEqual(act(game, command), next);
  const end = { type: 'endRound', round: game.round };
  game = dismiss(act(game, end));
  assert.equal(game.round, 2);
  assert.deepEqual(act(game, end), game);
  assert.deepEqual(act(game, command), game);
});
