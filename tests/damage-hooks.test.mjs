import test from 'node:test';
import assert from 'node:assert/strict';
import { act, pending, validSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

function advanceUntil(game, kind) {
  for (let i = 0; pending(game)?.kind !== kind && i < 20; i++)
    game = act(game, { type: 'advance' });
  return game;
}

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

test('a BeforeDamage reaction cancels its serialized parent damage workflow', () => {
  let game = act(createHauntPlaytest('werewolf', 92, 4), {
    type: 'advance',
  });
  const hero = game.heroes[game.active],
    enemy = game.enemies[0];
  enemy.pos = hero.pos;
  game.ruleTriggers = [
    {
      id: 'test-before-damage-reaction',
      sourceId: 'item:test-before-damage-reaction',
      when: 'BeforeDamage',
      priority: 10,
      condition: { heroId: hero.id, causeTag: 'attack' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '是否取消伤害',
            options: [
              {
                id: 'cancel',
                label: '取消',
                effects: [{ op: 'event.cancel' }],
              },
              { id: 'accept', label: '承受', effects: [] },
            ],
          },
        },
      ],
    },
    {
      id: 'test-after-cancelled-damage',
      sourceId: 'scenario:test-after-cancelled-damage',
      when: 'AfterDamage',
      condition: { heroId: hero.id, actualDamageAtLeast: 0 },
      effects: [
        {
          op: 'status.add',
          params: {
            heroId: '$event.heroId',
            status: { id: 'cancelled-damage-observed' },
          },
        },
      ],
    },
  ];
  game = act(game, { type: 'attack', id: enemy.id });
  pending(game).rolls.forEach((group, index) => {
    group.dice = Array(group.count).fill(index === 0 ? 0 : 2);
  });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = advanceUntil(game, 'choiceRequest');
  const reaction = pending(game);
  assert.equal(
    reaction.workflow.locals.reaction.resume.flow.definitionId,
    'damage.create',
  );
  assert(
    !game.queue.some((entry) => entry.kind === 'damage'),
    JSON.stringify(
      game.queue.map((entry) => ({
        kind: entry.kind,
        remaining: entry.remaining,
        rawAmount: entry.rawAmount,
        workflow: entry.workflow,
      })),
    ),
  );

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'cancel',
  });
  assert(
    !game.queue.some((entry) => entry.kind === 'damage'),
    JSON.stringify(
      game.queue.map((entry) => ({
        kind: entry.kind,
        remaining: entry.remaining,
        rawAmount: entry.rawAmount,
        workflow: entry.workflow,
      })),
    ),
  );
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'cancelled-damage-observed',
    ),
  );
  const applied = game.events.findLast(
    (event) => event.type === 'DamageApplied' && event.heroId === hero.id,
  );
  assert.equal(applied.rawAmount, 3);
  assert.equal(applied.actualAmount, 0);
});

test('a BeforeDeath reaction resumes damage allocation without killing twice', () => {
  let game = act(createHauntPlaytest('werewolf', 93, 3), {
    type: 'advance',
  });
  const hero = game.heroes[game.active];
  game.queue = [];
  hero.stats.might = 1;
  game.ruleTriggers = [
    {
      id: 'test-before-death-reaction',
      sourceId: 'item:test-before-death-reaction',
      when: 'BeforeDeath',
      condition: { heroId: hero.id, trait: 'might' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '濒死保护',
            options: [
              {
                id: 'survive',
                label: '保命',
                effects: [
                  { op: 'event.cancel' },
                  {
                    op: 'hero.changeTrait',
                    params: { heroId: hero.id, trait: 'might', delta: 1 },
                  },
                ],
              },
              { id: 'die', label: '放弃', effects: [] },
            ],
          },
        },
      ],
    },
  ];
  game.queue = [
    {
      uid: 900,
      kind: 'damage',
      heroId: hero.id,
      damageType: 'physical',
      traits: ['might', 'speed'],
      remaining: 1,
      total: 1,
      allocation: [],
      rawAmount: 1,
      prevented: 0,
      actualApplied: 0,
      rootActionId: 'test-fatal-damage',
      triggerUsage: [],
      beforeTriggers: [],
    },
  ];
  game = act(game, {
    type: 'allocateDamage',
    requestId: 900,
    allocation: { might: 1, speed: 0 },
  });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(hero.dead, false);

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'survive',
  });
  assert.equal(game.heroes[hero.id].dead, false);
  assert.equal(game.heroes[hero.id].stats.might, 1);
  assert.equal(
    game.logs.filter((entry) => entry.text.includes('结算1点肉体伤害')).length,
    1,
  );
  assert.equal(
    game.queue.filter((entry) => entry.kind === 'damageResult').length,
    1,
  );
});

test('an AfterDamage reaction resumes without applying allocation twice', () => {
  let game = act(createHauntPlaytest('werewolf', 94, 3), {
    type: 'advance',
  });
  const hero = game.heroes[game.active],
    before = hero.stats.might;
  game.queue = [
    {
      uid: 901,
      kind: 'damage',
      heroId: hero.id,
      damageType: 'physical',
      traits: ['might', 'speed'],
      remaining: 1,
      total: 1,
      allocation: [],
      rawAmount: 1,
      prevented: 0,
      actualApplied: 0,
      rootActionId: 'test-after-damage',
      triggerUsage: [],
      beforeTriggers: [],
    },
  ];
  game.ruleTriggers = [
    {
      id: 'test-after-damage-reaction',
      sourceId: 'item:test-after-damage-reaction',
      sourceLabel: '受伤后反应测试',
      when: 'AfterDamage',
      condition: { heroId: hero.id, actualDamageAtLeast: 1 },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '受伤后反应',
            options: [
              {
                id: 'mark',
                label: '记录',
                effects: [
                  {
                    op: 'status.add',
                    params: {
                      heroId: hero.id,
                      status: { id: 'after-damage-reacted' },
                    },
                  },
                ],
              },
              { id: 'skip', label: '跳过', effects: [] },
            ],
          },
        },
      ],
    },
  ];
  game = act(game, {
    type: 'allocateDamage',
    requestId: 901,
    allocation: { might: 1, speed: 0 },
  });
  assert.equal(game.heroes[hero.id].stats.might, before - 1);
  const result = game.queue.find((entry) => entry.kind === 'damageResult');
  assert.equal(result.triggers[0].sourceLabel, '受伤后反应测试');
  game = advanceUntil(game, 'choiceRequest');
  const reaction = pending(game);

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert.equal(game.heroes[hero.id].stats.might, before - 1);
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'after-damage-reacted',
    ),
  );
});
