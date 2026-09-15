import test from 'node:test';
import assert from 'node:assert/strict';
import { act, pending, validSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

test('declarative damage hooks can prevent damage and retaliate without item branches', () => {
  let game = act(createHauntPlaytest('werewolf', 91, 4), {
    type: 'advance',
  });
  const hero = game.heroes[game.active],
    enemy = game.enemies[0];
  enemy.pos = hero.pos;
  game.ruleTriggers = [
    {
      id: 'test-guard-prevention',
      sourceId: 'item:test-guard:1',
      sourceLabel: '测试护符',
      when: 'BeforeDamage',
      oncePerRoot: true,
      condition: {
        heroId: hero.id,
        damageType: 'physical',
        causeTag: 'attack',
      },
      effects: [{ op: 'damage.adjust', params: { delta: -1 } }],
    },
    {
      id: 'test-thorns-retaliation',
      sourceId: 'item:test-thorns:1',
      sourceLabel: '测试荆棘',
      when: 'AfterDamage',
      oncePerRoot: true,
      condition: {
        heroId: hero.id,
        sourceEnemyId: enemy.id,
        causeTag: 'attack',
        actualDamageAtLeast: 1,
        targetAlive: true,
      },
      effects: [
        {
          op: 'enemy.changeHp',
          params: { enemyId: '$event.sourceEnemyId', delta: -1 },
        },
      ],
    },
  ];

  game = act(game, { type: 'attack', id: enemy.id });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? 0 : 2);
  });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  while (pending(game) && pending(game).kind !== 'damage')
    game = act(game, { type: 'advance' });

  const request = pending(game),
    hpBefore = game.enemies.find((entry) => entry.id === enemy.id).hp;
  assert.equal(request.rawAmount, 3);
  assert.equal(request.prevented, 1);
  assert.equal(request.remaining, 2);
  assert.equal(request.sourceEnemyId, enemy.id);
  assert(request.rootActionId.startsWith('flow-'));
  assert.deepEqual(
    request.beforeTriggers.map((trigger) => trigger.sourceLabel),
    ['测试护符'],
  );

  game = JSON.parse(JSON.stringify(game));
  assert(validSave(game));
  game = act(game, {
    type: 'allocateDamage',
    requestId: request.uid,
    allocation: { might: 1, speed: 1 },
  });
  assert.equal(
    game.enemies.find((entry) => entry.id === enemy.id).hp,
    hpBefore - 1,
  );
  assert.deepEqual(
    pending(game).triggers.map((trigger) => trigger.sourceLabel),
    ['测试护符', '测试荆棘'],
  );
  assert(game.logs.some((entry) => /测试荆棘令.*生命/.test(entry.text)));
});
