import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  createSimulationGame,
  createGame,
  drawCard,
  pending,
  traitValue,
  triggerHaunt,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

test('card gain hooks expose the acquired definition and instance to effects', () => {
  const game = createSimulationGame('mirror', 401, 3),
    hero = game.heroes[game.active];
  game.queue = [];
  game.decks.item = ['bandage'];
  game.ruleTriggers = [
    {
      id: 'test-card-gain-status',
      sourceId: 'scenario:test-card-gain',
      sourceLabel: '获得物品测试',
      when: 'AfterCardGain',
      condition: { cardType: 'item', cardId: 'bandage', heroId: hero.id },
      effects: [
        {
          op: 'status.add',
          params: {
            heroId: '$event.heroId',
            status: { id: 'equipped-test' },
          },
        },
      ],
    },
  ];
  drawCard(game, 'item', hero);
  const next = act(game, { type: 'advance' }),
    notice = pending(next);
  assert.equal(next.heroes[hero.id].itemInstances[0].definitionId, 'bandage');
  assert.equal(next.heroes[hero.id].statuses[0].id, 'equipped-test');
  assert.equal(notice.triggers[0].sourceLabel, '获得物品测试');
});

test('a BeforeCardGain reaction can cancel a card after serialized resume', () => {
  let game = createGame('mirror', 414, 3);
  game.queue = [];
  game.decks.item = ['bandage'];
  const hero = game.heroes[game.active];
  game.ruleTriggers = [
    {
      id: 'test-before-card-gain-reaction',
      sourceId: 'scenario:test-before-card-gain-reaction',
      sourceLabel: '拒绝物品测试',
      priority: 10,
      when: 'BeforeCardGain',
      condition: { heroId: hero.id, cardType: 'item', cardId: 'bandage' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '是否拒绝物品',
            options: [
              {
                id: 'cancel',
                label: '拒绝',
                effects: [{ op: 'event.cancel' }],
              },
              { id: 'accept', label: '接受', effects: [] },
            ],
          },
        },
      ],
    },
    {
      id: 'test-before-card-gain-followup',
      sourceId: 'scenario:test-before-card-gain-followup',
      sourceLabel: '获得前后续测试',
      when: 'BeforeCardGain',
      condition: { heroId: hero.id, cardType: 'item', cardId: 'bandage' },
      effects: [
        {
          op: 'status.add',
          params: { heroId: '$event.heroId', status: { id: 'gain-followup' } },
        },
      ],
    },
  ];
  drawCard(game, 'item', hero);
  game = act(game, { type: 'advance' });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(
    reaction.workflow.locals.reaction.resume.flow.definitionId,
    'card.gain',
  );
  assert.equal(game.heroes[hero.id].itemInstances.length, 0);

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'cancel',
  });
  const notice = pending(game);
  assert.equal(notice.kind, 'cardResult');
  assert.equal(game.heroes[hero.id].itemInstances.length, 0);
  assert.deepEqual(game.discards.item, ['bandage']);
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'gain-followup',
    ),
  );
  assert.deepEqual(
    notice.triggers.map((trigger) => trigger.sourceLabel),
    ['拒绝物品测试', '获得前后续测试'],
  );
});

test('an AfterCardGain reaction resumes without granting the item twice', () => {
  let game = createGame('mirror', 415, 3);
  game.queue = [];
  game.decks.item = ['bandage'];
  const hero = game.heroes[game.active];
  game.ruleTriggers = [
    {
      id: 'test-after-card-gain-reaction',
      sourceId: 'scenario:test-after-card-gain-reaction',
      sourceLabel: '获得物品后测试',
      when: 'AfterCardGain',
      condition: { heroId: hero.id, cardType: 'item', cardId: 'bandage' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '获得物品后反应',
            options: [
              {
                id: 'mark',
                label: '记录',
                effects: [
                  {
                    op: 'status.add',
                    params: {
                      heroId: hero.id,
                      status: { id: 'after-gain-reacted' },
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
  drawCard(game, 'item', hero);
  game = act(game, { type: 'advance' });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(game.heroes[hero.id].itemInstances.length, 1);
  const instanceId = game.heroes[hero.id].itemInstances[0].instanceId;

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  const notice = pending(game);
  assert.equal(notice.kind, 'cardResult');
  assert.equal(game.heroes[hero.id].itemInstances.length, 1);
  assert.equal(game.heroes[hero.id].itemInstances[0].instanceId, instanceId);
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'after-gain-reacted',
    ),
  );
  assert.equal(notice.triggers[0].sourceLabel, '获得物品后测试');
});

test('check lifecycle hooks can change dice before rolling and observe the committed result', () => {
  let game = createGame('mirror', 407, 3);
  game.queue = [];
  game.decks.event = ['cipher'];
  const hero = game.heroes[game.active],
    baseDice = traitValue(hero, 'knowledge', game);
  game.ruleTriggers = [
    {
      id: 'test-check-dice-bonus',
      sourceId: 'item:test-check-dice-bonus',
      when: 'BeforeCheck',
      condition: { heroId: hero.id, checkKind: 'event.check' },
      effects: [{ op: 'check.adjustDice', params: { delta: 1 } }],
    },
    ...['AfterRoll', 'AfterCheck'].map((when) => ({
      id: 'test-' + when,
      sourceId: 'scenario:test-check-lifecycle:' + when,
      when,
      condition: { heroId: hero.id, checkKind: 'event.check' },
      effects: [
        {
          op: 'status.add',
          params: {
            heroId: '$event.heroId',
            status: { id: when },
          },
        },
      ],
    })),
  ];
  drawCard(game, 'event', hero);
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  const request = pending(game);
  assert.equal(request.kind, 'diceRequest');
  assert.equal(request.rolls[0].count, baseDice + 1);
  assert.equal(request.rolls[0].dice.length, baseDice + 1);
  assert.deepEqual(
    game.events.find((event) => event.id === request.rolls[0].rollEventId).dice,
    request.rolls[0].dice,
  );

  game = act(game, { type: 'resolveDice', requestId: request.uid });
  assert.equal(pending(game).kind, 'cardResult');
  assert.deepEqual(
    game.heroes[hero.id].statuses.map((status) => status.id),
    ['AfterRoll', 'AfterCheck'],
  );
  assert.equal(pending(game).workflow.flowId, request.workflow.flowId);
});

test('an AfterRoll reaction suspends and resumes the original check workflow', () => {
  let game = createGame('mirror', 408, 3);
  game.queue = [];
  game.decks.event = ['cipher'];
  const hero = game.heroes[game.active];
  game.ruleTriggers = [
    {
      id: 'test-after-roll-reaction',
      sourceId: 'item:test-after-roll-reaction',
      priority: 10,
      when: 'AfterRoll',
      condition: { heroId: hero.id, checkKind: 'event.check' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '检定反应',
            options: [
              {
                id: 'mark',
                label: '记录反应',
                effects: [
                  {
                    op: 'check.reroll',
                    params: { rollIndex: 0, diceIndices: [0] },
                  },
                  {
                    op: 'status.add',
                    params: {
                      heroId: hero.id,
                      status: { id: 'after-roll-reacted' },
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
    {
      id: 'test-after-roll-followup',
      sourceId: 'scenario:test-after-roll-followup',
      when: 'AfterRoll',
      condition: { heroId: hero.id, checkKind: 'event.check' },
      effects: [
        {
          op: 'status.add',
          params: {
            heroId: '$event.heroId',
            status: { id: 'after-roll-followup' },
          },
        },
      ],
    },
  ];
  drawCard(game, 'event', hero);
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  const diceRequest = pending(game);
  game = act(game, { type: 'resolveDice', requestId: diceRequest.uid });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(reaction.rollReceipt.rolls[0].dice.length > 0, true);
  const originalDice = [...reaction.rollReceipt.rolls[0].dice];

  game = JSON.parse(JSON.stringify(game));
  game = act(game, {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert.equal(pending(game).kind, 'cardResult');
  assert.equal(pending(game).workflow.flowId, diceRequest.workflow.flowId);
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'after-roll-reacted',
    ),
  );
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'after-roll-followup',
    ),
  );
  const rerollEvent = game.events.findLast((event) => event.rerollOf);
  assert.equal(
    rerollEvent.rerollOf.includes(diceRequest.workflow.flowId),
    true,
  );
  assert.equal(pending(game).dice[0], rerollEvent.dice[0]);
  assert.deepEqual(pending(game).dice.slice(1), originalDice.slice(1));
});

test('a BeforeCheck reaction resumes with its adjusted serialized dice request', () => {
  let game = createGame('mirror', 409, 3);
  game.queue = [];
  game.decks.event = ['cipher'];
  const hero = game.heroes[game.active],
    baseDice = traitValue(hero, 'knowledge', game);
  game.ruleTriggers = [
    {
      id: 'test-before-check-reaction',
      sourceId: 'omen:test-before-check-reaction',
      when: 'BeforeCheck',
      condition: { heroId: hero.id, checkKind: 'event.check' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '检定前反应',
            options: [
              {
                id: 'boost',
                label: '增加骰子',
                effects: [{ op: 'check.adjustDice', params: { delta: 2 } }],
              },
              { id: 'skip', label: '跳过', effects: [] },
            ],
          },
        },
      ],
    },
  ];
  drawCard(game, 'event', hero);
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'boost',
  });
  const diceRequest = pending(game);
  assert.equal(diceRequest.kind, 'diceRequest');
  assert.equal(diceRequest.rolls[0].count, baseDice + 2);
  assert.equal(diceRequest.rolls[0].dice, null);
});

test('room entry hooks distinguish before and after timing and travel context', () => {
  const game = createSimulationGame('mirror', 402, 3),
    hero = game.heroes[game.active],
    beforeMoves = hero.moves;
  game.queue = [];
  game.ruleTriggers = [
    ...['BeforeRoomEnter', 'AfterRoomEnter'].map((when) => ({
      id: 'test-' + when,
      sourceId: 'scenario:test-room-entry:' + when,
      when,
      condition: { heroId: hero.id, roomId: 'foyer', enterKind: 'walk' },
      effects: [
        {
          op: 'status.add',
          params: {
            heroId: '$event.heroId',
            status: { id: when },
          },
        },
      ],
    })),
    {
      id: 'test-after-entry-movement',
      sourceId: 'scenario:test-room-entry:moves',
      when: 'AfterRoomEnter',
      condition: { roomId: 'foyer', fromRoomId: 'entrance' },
      effects: [
        {
          op: 'hero.changeMoves',
          params: { heroId: '$event.heroId', delta: 1 },
        },
      ],
    },
  ];
  const next = act(game, { type: 'move', pos: 'foyer' });
  assert.equal(next.heroes[hero.id].moves, beforeMoves);
  assert.deepEqual(
    next.heroes[hero.id].statuses.map((status) => status.id),
    ['BeforeRoomEnter', 'AfterRoomEnter'],
  );
});

test('room entry reactions suspend and resume their parent movement workflow', () => {
  let game = createGame('mirror', 412, 3);
  const hero = game.heroes[game.active],
    startingMoves = hero.moves;
  game.queue = [];
  game.ruleTriggers = [
    {
      id: 'test-room-reaction-boundary',
      sourceId: 'room:foyer:test-reaction-boundary',
      when: 'BeforeRoomEnter',
      condition: { heroId: hero.id, roomId: 'foyer' },
      effects: [
        {
          op: 'hero.changeMoves',
          params: { heroId: hero.id, delta: 2 },
        },
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '入房反应',
            options: [
              {
                id: 'accept',
                label: '接受',
                effects: [
                  {
                    op: 'status.add',
                    params: {
                      heroId: hero.id,
                      status: { id: 'room-reaction-accepted' },
                    },
                  },
                ],
              },
              { id: 'decline', label: '拒绝', effects: [] },
            ],
          },
        },
      ],
    },
  ];
  game = act(game, { type: 'move', pos: 'foyer' });
  const request = pending(game);
  assert.equal(request.kind, 'choiceRequest');
  assert.equal(game.heroes[hero.id].pos, 'foyer');
  assert.equal(game.heroes[hero.id].moves, startingMoves + 1);
  assert.equal(
    request.workflow.locals.reaction.resume.flow.definitionId,
    'hero.move',
  );

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: request.uid,
    choice: 'accept',
  });
  assert.equal(pending(game), null);
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'room-reaction-accepted',
    ),
  );
});

test('after-room reactions also survive a serialized movement continuation', () => {
  let game = createGame('mirror', 413, 3);
  const hero = game.heroes[game.active];
  game.queue = [];
  game.ruleTriggers = [
    {
      id: 'test-after-room-reaction',
      sourceId: 'room:foyer:test-after-reaction',
      when: 'AfterRoomEnter',
      condition: { heroId: hero.id, roomId: 'foyer' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '入房后反应',
            options: [
              {
                id: 'mark',
                label: '记录',
                effects: [
                  {
                    op: 'status.add',
                    params: {
                      heroId: hero.id,
                      status: { id: 'after-room-reacted' },
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

  game = act(game, { type: 'move', pos: 'foyer' });
  const request = pending(game);
  assert.equal(request.kind, 'choiceRequest');
  assert.equal(
    request.workflow.locals.reaction.resume.event.when,
    'AfterRoomEnter',
  );
  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: request.uid,
    choice: 'mark',
  });
  assert.equal(pending(game), null);
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'after-room-reacted',
    ),
  );
});

test('death hooks can react to or explicitly replace a fatal trait change', () => {
  const createFatalEntry = (cancelDeath) => {
    const game = createSimulationGame('mirror', cancelDeath ? 404 : 403, 3),
      hero = game.heroes[game.active];
    game.queue = [];
    game.phase = 'haunt';
    hero.stats.might = 1;
    game.enemies = [
      {
        id: 'hook-target',
        name: 'Hook target',
        pos: 'basement',
        hp: 2,
        maxHp: 2,
        might: 1,
        speed: 1,
      },
    ];
    game.ruleTriggers = [
      {
        id: 'test-room-lethal',
        sourceId: 'room:foyer:test-lethal',
        when: 'AfterRoomEnter',
        condition: { heroId: hero.id, roomId: 'foyer' },
        effects: [
          {
            op: 'hero.changeTrait',
            params: { heroId: '$event.heroId', trait: 'might', delta: -1 },
          },
        ],
      },
      ...(cancelDeath
        ? [
            {
              id: 'test-cancel-death',
              sourceId: 'item:test-death-ward',
              when: 'BeforeDeath',
              condition: { heroId: hero.id, trait: 'might' },
              effects: [
                { op: 'event.cancel' },
                {
                  op: 'hero.changeTrait',
                  params: {
                    heroId: '$event.heroId',
                    trait: 'might',
                    delta: 1,
                  },
                },
              ],
            },
          ]
        : []),
      {
        id: 'test-after-death',
        sourceId: 'scenario:test-after-death',
        when: 'AfterDeath',
        condition: { heroId: hero.id, trait: 'might' },
        effects: [
          {
            op: 'enemy.changeHp',
            params: { enemyId: 'hook-target', delta: -1 },
          },
        ],
      },
    ];
    return { game, heroId: hero.id };
  };

  const fatal = createFatalEntry(false),
    dead = act(fatal.game, { type: 'move', pos: 'foyer' });
  assert.equal(dead.heroes[fatal.heroId].dead, true);
  assert.equal(dead.enemies[0].hp, 1);

  const protectedEntry = createFatalEntry(true),
    protectedGame = act(protectedEntry.game, { type: 'move', pos: 'foyer' });
  assert.equal(protectedGame.heroes[protectedEntry.heroId].dead, false);
  assert.equal(protectedGame.heroes[protectedEntry.heroId].stats.might, 1);
  assert.equal(protectedGame.enemies[0].hp, 2);
});

test('a non-damage death reaction restores from its standalone workflow', () => {
  let game = createGame('mirror', 416, 3);
  const hero = game.heroes[game.active];
  game.queue = [];
  game.phase = 'haunt';
  hero.stats.might = 1;
  game.ruleTriggers = [
    {
      id: 'test-room-fatal-change',
      sourceId: 'room:foyer:test-fatal-change',
      when: 'AfterRoomEnter',
      condition: { heroId: hero.id, roomId: 'foyer' },
      effects: [
        {
          op: 'hero.changeTrait',
          params: { heroId: hero.id, trait: 'might', delta: -1 },
        },
      ],
    },
    {
      id: 'test-standalone-death-reaction',
      sourceId: 'item:test-standalone-death-reaction',
      when: 'BeforeDeath',
      condition: { heroId: hero.id, trait: 'might' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '房间致死保护',
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
  game = act(game, { type: 'move', pos: 'foyer' });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(
    reaction.workflow.locals.reaction.resume.flow.definitionId,
    'hero.death',
  );

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'survive',
  });
  assert.equal(game.heroes[hero.id].dead, false);
  assert.equal(game.heroes[hero.id].stats.might, 1);
  assert(!game.queue.some((entry) => entry.kind === 'death'));
});

test('turn, round, haunt and status lifecycle timings execute declarative effects', () => {
  const timingStatus = (when, id, condition = {}) => ({
    id: 'test-' + id,
    sourceId: 'scenario:lifecycle:' + id,
    when,
    condition,
    effects: [
      {
        op: 'status.add',
        params: { heroId: '$event.heroId', status: { id } },
      },
    ],
  });
  let game = createSimulationGame('mirror', 405, 3);
  game.queue = [];
  game.ruleTriggers = [
    timingStatus('TurnEnding', 'turn-ended', { heroId: 0 }),
    timingStatus('RoundEnding', 'round-ended'),
    timingStatus('RoundStarting', 'round-started'),
    timingStatus('TurnStarting', 'turn-started', { heroId: 0 }),
  ];
  game = act(game, { type: 'endRound' });
  assert.equal(game.round, 2);
  assert.deepEqual(
    game.heroes[0].statuses.map((status) => status.id),
    ['turn-ended', 'round-ended', 'round-started', 'turn-started'],
  );

  game.queue = [];
  game.ruleTriggers = [timingStatus('HauntStarted', 'haunt-started')];
  triggerHaunt(game);
  assert(
    game.heroes[game.active].statuses.some(
      (status) => status.id === 'haunt-started',
    ),
  );

  let werewolf = createHauntPlaytest('werewolf', 406, 3);
  werewolf.queue = [];
  const hero = werewolf.heroes[werewolf.active];
  hero.statuses.push({
    id: 'immunity',
    instanceId: 'test-expiring-immunity',
    until: werewolf.elapsed + 1,
  });
  werewolf.ruleTriggers = [
    timingStatus('StatusExpired', 'expiration-observed', {
      heroId: hero.id,
    }),
  ];
  werewolf = act(werewolf, { type: 'endRound' });
  assert(!werewolf.heroes[hero.id].statuses.some((s) => s.id === 'immunity'));
  assert(
    werewolf.heroes[hero.id].statuses.some(
      (status) => status.id === 'expiration-observed',
    ),
  );
});

test('TurnEnding reactions resume before committing the hero transition', () => {
  let game = createGame('mirror', 417, 3);
  game.queue = [];
  const hero = game.heroes[game.active];
  game.ruleTriggers = [
    {
      id: 'test-turn-ending-reaction',
      sourceId: 'scenario:test-turn-ending-reaction',
      when: 'TurnEnding',
      condition: { heroId: hero.id },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: hero.id,
            title: '行动结束反应',
            options: [
              {
                id: 'mark',
                label: '记录',
                effects: [
                  {
                    op: 'status.add',
                    params: {
                      heroId: hero.id,
                      status: { id: 'turn-ending-reacted' },
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
    type: 'endHero',
    actorId: hero.id,
    round: game.round,
  });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(game.heroes[hero.id].ended, false);
  assert.equal(
    reaction.workflow.locals.reaction.resume.flow.definitionId,
    'turn.transition',
  );

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert.equal(game.heroes[hero.id].ended, true);
  assert.notEqual(game.active, hero.id);
  assert(
    game.heroes[hero.id].statuses.some(
      (status) => status.id === 'turn-ending-reacted',
    ),
  );
});

test('round end, round start and first turn reactions resume in order', () => {
  const reactionTrigger = (when, id) => ({
    id: `test-${id}`,
    sourceId: `scenario:test-${id}`,
    when,
    effects: [
      {
        op: 'reaction.request',
        params: {
          heroId: 0,
          title: id,
          options: [
            {
              id: 'mark',
              label: '记录',
              effects: [
                {
                  op: 'status.add',
                  params: { heroId: 0, status: { id } },
                },
              ],
            },
            { id: 'skip', label: '跳过', effects: [] },
          ],
        },
      },
    ],
  });
  let game = createGame('mirror', 418, 3);
  game.queue = [];
  game.ruleTriggers = [
    reactionTrigger('RoundEnding', 'round-ending-reacted'),
    reactionTrigger('RoundStarting', 'round-starting-reacted'),
    reactionTrigger('TurnStarting', 'turn-starting-reacted'),
  ];
  game = act(game, { type: 'endRound', round: game.round });
  let reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(game.round, 1);

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert.equal(game.round, 2);
  while (pending(game) && pending(game).kind !== 'choiceRequest')
    game = act(game, { type: 'advance' });
  reaction = pending(game);
  assert.equal(
    reaction.workflow.locals.reaction.resume.event.when,
    'RoundStarting',
  );

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(
    reaction.workflow.locals.reaction.resume.event.when,
    'TurnStarting',
  );
  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });

  assert.equal(game.round, 2);
  assert.deepEqual(
    game.heroes[0].statuses.map((status) => status.id),
    ['round-ending-reacted', 'round-starting-reacted', 'turn-starting-reacted'],
  );
});

function lifecycleReaction(when, heroId, statusId) {
  return {
    id: `test-${statusId}`,
    sourceId: `scenario:test-${statusId}`,
    when,
    effects: [
      {
        op: 'reaction.request',
        params: {
          heroId,
          title: statusId,
          options: [
            {
              id: 'mark',
              label: '记录',
              effects: [
                {
                  op: 'status.add',
                  params: { heroId, status: { id: statusId } },
                },
              ],
            },
            { id: 'skip', label: '跳过', effects: [] },
          ],
        },
      },
    ],
  };
}

test('HauntStarted reactions resume from a standalone timing workflow', () => {
  const game = createGame('werewolf', 419, 3),
    heroId = game.active;
  game.queue = [];
  game.ruleTriggers = [
    lifecycleReaction('HauntStarted', heroId, 'haunt-started-reacted'),
  ];
  triggerHaunt(game);
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(
    reaction.workflow.locals.reaction.resume.flow.definitionId,
    'trigger.timing',
  );
  assert(game.queue.some((entry) => entry.kind === 'haunt'));

  const restored = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert(
    restored.heroes[heroId].statuses.some(
      (status) => status.id === 'haunt-started-reacted',
    ),
  );
  assert.equal(
    restored.queue.find((entry) => entry.kind === 'haunt').triggers.length,
    1,
  );
});

test('RoundStatusTick reactions finish before the enemy phase and do not tick twice', () => {
  let game = createHauntPlaytest('werewolf', 420, 3);
  game.queue = [];
  const heroId = game.active,
    elapsed = game.elapsed;
  game.ruleTriggers = [
    lifecycleReaction('RoundStatusTick', heroId, 'round-status-reacted'),
  ];
  game = act(game, { type: 'endRound', round: game.round });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(game.elapsed, elapsed + 1);
  assert(!game.events.some((event) => event.type === 'MovementQueued'));

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert.equal(game.elapsed, elapsed + 1);
  assert(
    game.heroes[heroId].statuses.some(
      (status) => status.id === 'round-status-reacted',
    ),
  );
});

test('expired status reactions resume before the enemy phase', () => {
  let game = createHauntPlaytest('werewolf', 421, 3);
  game.queue = [];
  const heroId = game.active;
  game.heroes[heroId].statuses.push({
    id: 'immunity',
    instanceId: 'expiring-reaction-immunity',
    until: game.elapsed + 1,
  });
  game.ruleTriggers = [
    lifecycleReaction('StatusExpired', heroId, 'expiration-reacted'),
  ];
  game = act(game, { type: 'endRound', round: game.round });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(
    reaction.workflow.locals.reaction.resume.event.when,
    'StatusExpired',
  );
  assert(
    !game.heroes[heroId].statuses.some((status) => status.id === 'immunity'),
  );
  assert(!game.events.some((event) => event.type === 'MovementQueued'));

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert(
    game.heroes[heroId].statuses.some(
      (status) => status.id === 'expiration-reacted',
    ),
  );
});

test('status expiration remains deferred when an earlier round reaction pauses', () => {
  let game = createHauntPlaytest('werewolf', 423, 3);
  game.queue = [];
  const heroId = game.active;
  game.heroes[heroId].statuses.push({
    id: 'immunity',
    instanceId: 'deferred-expiration-immunity',
    until: game.elapsed + 1,
  });
  game.ruleTriggers = [
    {
      ...lifecycleReaction(
        'RoundStatusTick',
        heroId,
        'early-round-status-reacted',
      ),
      priority: 30,
    },
    lifecycleReaction('StatusExpired', heroId, 'deferred-expiration-reacted'),
  ];
  game = act(game, { type: 'endRound', round: game.round });
  let reaction = pending(game);
  assert.equal(
    reaction.workflow.locals.reaction.resume.event.when,
    'RoundStatusTick',
  );

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(
    reaction.workflow.locals.reaction.resume.event.when,
    'StatusExpired',
  );
  assert(
    !game.heroes[heroId].statuses.some((status) => status.id === 'immunity'),
  );

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert.deepEqual(
    game.heroes[heroId].statuses
      .filter((status) => status.id.endsWith('reacted'))
      .map((status) => status.id),
    ['early-round-status-reacted', 'deferred-expiration-reacted'],
  );
});

test('EnemyTurnStarting reactions restore before movement planning', () => {
  let game = createHauntPlaytest('werewolf', 422, 3);
  game.queue = [];
  const heroId = game.active,
    enemy = game.enemies.find((entry) => entry.bornAt !== game.elapsed + 1),
    enemyId = enemy?.id || game.enemies[0].id,
    origin = game.enemies.find((entry) => entry.id === enemyId).pos;
  game.enemies.forEach((entry) => {
    if (entry.id === enemyId) entry.bornAt = -1;
    else entry.bornAt = game.elapsed + 1;
  });
  game.ruleTriggers = [
    {
      ...lifecycleReaction('EnemyTurnStarting', heroId, 'enemy-start-reacted'),
      condition: { enemyId },
    },
  ];
  game = act(game, { type: 'endRound', round: game.round });
  const reaction = pending(game);
  assert.equal(reaction.kind, 'choiceRequest');
  assert.equal(game.enemies.find((entry) => entry.id === enemyId).pos, origin);
  assert(!game.events.some((event) => event.type === 'MovementQueued'));

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: reaction.uid,
    choice: 'mark',
  });
  assert(
    game.heroes[heroId].statuses.some(
      (status) => status.id === 'enemy-start-reacted',
    ),
  );
  assert(
    game.events.some(
      (event) => event.type === 'MovementQueued' && event.entityId === enemyId,
    ),
  );
});

test('same-priority player effects use a saved choice to determine their full order', () => {
  let game = createHauntPlaytest('werewolf', 424, 3);
  game.queue = [];
  const heroId = game.active;
  game.enemies.forEach((enemy) => {
    enemy.bornAt = game.elapsed + 1;
  });
  game.ruleTriggers = [
    ['first-source', 'first-effect'],
    ['second-source', 'second-effect'],
    ['third-source', 'third-effect'],
  ].map(([sourceId, statusId]) => ({
    id: statusId,
    sourceId,
    sourceLabel: statusId,
    when: 'RoundStatusTick',
    priority: 7,
    playerOrder: true,
    orderHeroId: heroId,
    effects: [
      {
        op: 'status.add',
        params: { heroId, status: { id: statusId } },
      },
    ],
  }));
  game = act(game, { type: 'endRound', round: game.round });
  let request = pending(game);
  assert.equal(request.kind, 'choiceRequest');
  assert.equal(request.title, '决定效果顺序');
  assert.equal(
    request.options.some((option) => option.value === 'skip'),
    false,
  );
  const choose = (label) => {
    request = pending(game);
    const option = request.options.find((entry) => entry.label === label);
    game = act(JSON.parse(JSON.stringify(game)), {
      type: 'resolveChoice',
      requestId: request.uid,
      choice: option.value,
    });
  };
  choose('third-effect');
  assert.deepEqual(
    game.heroes[heroId].statuses.map((status) => status.id),
    ['third-effect'],
  );
  choose('second-effect');
  assert.deepEqual(
    game.heroes[heroId].statuses.map((status) => status.id),
    ['third-effect', 'second-effect', 'first-effect'],
  );
  assert.equal(game.elapsed, 1);
});
