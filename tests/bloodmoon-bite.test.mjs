import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createSimulationGame,
  act,
  drawCard,
  pending,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import {
  createHauntPlaytest,
  makeCheckpoint,
  readCheckpoint,
} from '../lib/playtest.mjs';
import { resolveGameSet, GAME_SET_CATALOG } from '../lib/game-sets.mjs';
import { eventJournalText } from '../lib/event-journal.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

function start(heroId = 0, factory = createGame) {
  let game = act(factory('werewolf', 31, 3), { type: 'advance' });
  for (const id of ['bell', 'book']) {
    game.decks.omen = [
      id,
      ...game.decks.omen.filter((cardId) => cardId !== id),
    ];
    drawCard(game, 'omen', game.heroes[2]);
    game = act(game, { type: 'advance' });
    game.queue = [];
  }
  game.active = heroId;
  game.decks.omen.unshift('bite-mark');
  drawCard(game, 'omen', game.heroes[heroId]);
  return game;
}
const restore = (game) => restoreGameSave(JSON.parse(JSON.stringify(game)));
const accept = (game) =>
  act(game, { type: 'continueCard', requestId: pending(game).uid });
function contest(game, attackFace, defenseFace) {
  const request = pending(game);
  assert.equal(request.kind, 'diceRequest');
  request.rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? attackFace : defenseFace);
  });
  return act(game, { type: 'resolveDice', requestId: request.uid });
}
const choose = (game, choice) =>
  act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice,
  });
const damageCount = (game) =>
  game.events.filter((event) => event.type === 'DamageApplied').length;

test('bite is selectable in dedicated sets without changing existing game sets', () => {
  for (const id of ['classic', 'expanded'])
    assert(!resolveGameSet(id).decks.omen.includes('bite-mark'));
  assert(GAME_SET_CATALOG.omen.some((card) => card.id === 'bite-mark'));
  assert(resolveGameSet('bloodmoon').decks.omen.includes('bite-mark'));
  assert(!createGame('werewolf', 31).decks.omen.includes('bite-mark'));
});

test('bite uses a virtual four-die attacker and the receiver current might without spending an attack', () => {
  for (const factory of [createGame, createSimulationGame]) {
    let game = start(0, factory);
    const hero = game.heroes[0];
    hero.stats.might++;
    const expected = hero.tracks.might[hero.stats.might];
    game = accept(game);
    const request = pending(game);
    assert.equal(request.workflow.definitionId, 'card.gainAttack');
    assert.equal(request.rolls[0].count, 4);
    assert.equal(request.rolls[0].computer, true);
    assert.equal(request.rolls[0].heroId, undefined);
    assert.equal(request.rolls[1].count, expected);
    assert.equal(request.rolls[1].heroId, 0);
    assert.equal(game.heroes[0].attacked, false);
    assert.deepEqual(game.enemies, []);
    assert.equal(game.omens, 3);
    assert.equal(
      game.heroes[0].omens.filter((id) => id === 'bite-mark').length,
      1,
    );
    assert.match(request.text, /力量4攻击/);
    assert.match(request.outcomes[0].effect, /力量、速度轨道自行分配/);
  }
});

test('bite full damage waits for manual allocation and save restore before the haunt check', () => {
  let game = start();
  game.heroes[0].stats.might = 6;
  game.heroes[0].stats.speed = 6;
  game = accept(game);
  const before = structuredClone(game.heroes[0].stats);
  game = contest(game, 2, 0);
  const request = pending(game);
  assert.equal(request.kind, 'damage');
  assert.equal(request.remaining, 8);
  assert.equal(request.sourceCardId, 'bite-mark');
  assert.deepEqual(game.heroes[0].stats, before);
  assert(!game.queue.some((entry) => entry.kind === 'hauntRoll'));
  assert.equal(damageCount(game), 0);
  game = act(restore(game), {
    type: 'allocateDamage',
    requestId: request.uid,
    allocation: { might: 4, speed: 4 },
  });
  assert.equal(game.heroes[0].stats.might, 2);
  assert.equal(game.heroes[0].stats.speed, 2);
  assert.equal(damageCount(game), 1);
  assert.equal(pending(game).kind, 'hauntRoll');
  assert.equal(
    game.queue.filter((entry) => entry.kind === 'hauntRoll').length,
    1,
  );
  const settled = structuredClone(game);
  game = act(game, {
    type: 'allocateDamage',
    requestId: request.uid,
    allocation: { might: 8 },
  });
  assert.deepEqual(game, settled);
  const event = game.events.find((entry) => entry.type === 'DamageApplied');
  assert.match(eventJournalText(game, event), /「咬痕」.*8点肉体伤害/);
});

test('ties and a winning defense cause no damage and no counterattack', () => {
  for (const defenseFace of [0, 2]) {
    let game = accept(start());
    const before = structuredClone(game.heroes[0].stats);
    game = contest(game, 0, defenseFace);
    assert.equal(pending(game).kind, 'cardResult');
    assert.match(pending(game).text, /未受伤.*没有反击伤害/);
    assert.equal(damageCount(game), 0);
    assert.deepEqual(game.heroes[0].stats, before);
    assert.deepEqual(game.enemies, []);
    assert.equal(
      game.events.filter((event) => event.type === 'CardAttackResolved').length,
      1,
    );
    game = act(restore(game), { type: 'advance' });
    assert.equal(pending(game).kind, 'hauntRoll');
  }
});

test('the family ring offers only defense dice and its result precedes damage and haunt', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'family-ring', 'bite-ring');
  game = contest(accept(game), 2, 0);
  assert.equal(pending(game).kind, 'choiceRequest');
  assert(
    pending(game)
      .options.filter((option) => option.value !== 'skip')
      .every((option) => option.value.startsWith('1:')),
  );
  assert(
    !game.queue.some((entry) => ['damage', 'hauntRoll'].includes(entry.kind)),
  );
  game = choose(restore(game), '1:0');
  const result = pending(game);
  assert.equal(result.kind, 'ringResult');
  assert.equal(result.dieIndex, 0);
  assert.equal(result.before, 0);
  const contestEvent = game.events.find(
    (event) => event.type === 'CardAttackResolved',
  );
  assert.equal(contestEvent.damage, 8 - result.after);
  assert(!game.queue.some((entry) => entry.kind === 'hauntRoll'));
  assert.equal(damageCount(game), 0);
  game = act(restore(game), { type: 'advance', requestId: result.uid });
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, contestEvent.damage);
});

test('a serialized card-gain reaction can cancel bite without starting its attack or haunt', () => {
  let game = start();
  game.ruleTriggers = [
    {
      id: 'cancel-bite',
      sourceId: 'scenario:test-cancel-bite',
      when: 'BeforeCardGain',
      condition: { cardType: 'omen', cardId: 'bite-mark' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: 0,
            title: '是否收下咬痕',
            options: [
              {
                id: 'cancel',
                label: '取消',
                effects: [{ op: 'event.cancel' }],
              },
            ],
          },
        },
      ],
    },
  ];
  game = accept(game);
  assert.equal(pending(game).kind, 'choiceRequest');
  game = choose(restore(game), 'cancel');
  assert.equal(pending(game).kind, 'cardResult');
  assert.equal(game.omens, 2);
  assert(!game.heroes[0].omens.includes('bite-mark'));
  assert(
    !game.queue.some((entry) =>
      ['diceRequest', 'hauntRoll'].includes(entry.kind),
    ),
  );
  assert(game.discards.omen.includes('bite-mark'));
});

test('an after-gain reaction resumes bite once before its attack', () => {
  let game = start();
  game.ruleTriggers = [
    {
      id: 'after-bite',
      sourceId: 'scenario:test-after-bite',
      when: 'AfterCardGain',
      condition: { cardType: 'omen', cardId: 'bite-mark' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: 0,
            title: '获得咬痕后',
            options: [
              {
                id: 'mark',
                label: '记录',
                effects: [
                  {
                    op: 'status.add',
                    params: { heroId: 0, status: { id: 'bite-gain-reacted' } },
                  },
                ],
              },
              { id: 'skip', label: '继续', effects: [] },
            ],
          },
        },
      ],
    },
  ];
  game = accept(game);
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.equal(game.omens, 3);
  game = choose(restore(game), 'mark');
  assert.equal(pending(game).kind, 'diceRequest');
  assert.equal(game.omens, 3);
  assert.equal(
    game.heroes[0].omens.filter((id) => id === 'bite-mark').length,
    1,
  );
  assert(
    game.heroes[0].statuses.some((status) => status.id === 'bite-gain-reacted'),
  );
});

test('a damage-prevention reaction settles before the haunt and cannot apply bite twice', () => {
  let game = start();
  game.ruleTriggers = [
    {
      id: 'prevent-bite',
      sourceId: 'scenario:test-prevent-bite',
      when: 'BeforeDamage',
      condition: { sourceCardId: 'bite-mark' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: 0,
            title: '阻挡咬痕伤害',
            options: [
              {
                id: 'cancel',
                label: '阻挡',
                effects: [{ op: 'event.cancel' }],
              },
            ],
          },
        },
      ],
    },
  ];
  game = contest(accept(game), 2, 0);
  assert.equal(pending(game).kind, 'choiceRequest');
  assert(!game.queue.some((entry) => entry.kind === 'hauntRoll'));
  game = choose(restore(game), 'cancel');
  assert.equal(pending(game).kind, 'hauntRoll');
  assert.equal(damageCount(game), 1);
  assert.equal(
    game.events.find((event) => event.type === 'DamageApplied').actualAmount,
    0,
  );
  assert.equal(
    game.events.filter((event) => event.type === 'CardAttackResolved').length,
    1,
  );
});

test('the bite playtest starts before haunt and checkpoints retain the pending contest', () => {
  let game = createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-bite');
  assert.equal(game.phase, 'explore');
  assert.equal(game.omens, 2);
  assert.equal(pending(game).cardId, 'bite-mark');
  assert(game.heroes[0].items.includes('family-ring'));
  assert.deepEqual(game.enemies, []);
  game = accept(game);
  assert.deepEqual(readCheckpoint(makeCheckpoint(game), game), game);
});

test('a settled-damage reaction finishes before the haunt continuation', () => {
  let game = start();
  game.heroes[0].stats.might = 6;
  game.heroes[0].stats.speed = 6;
  game.ruleTriggers = [
    {
      id: 'after-bite-damage',
      sourceId: 'scenario:test-after-bite-damage',
      when: 'AfterDamage',
      condition: { sourceCardId: 'bite-mark' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: 0,
            title: '咬痕伤害后',
            options: [
              {
                id: 'mark',
                label: '记录',
                effects: [
                  {
                    op: 'status.add',
                    params: {
                      heroId: 0,
                      status: { id: 'bite-damage-reacted' },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ];
  game = contest(accept(game), 2, 0);
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 4, speed: 4 },
  });
  assert.equal(pending(game).kind, 'choiceRequest');
  assert(!game.queue.some((entry) => entry.kind === 'hauntRoll'));
  assert.equal(damageCount(game), 1);
  game = choose(restore(game), 'mark');
  assert.equal(pending(game).kind, 'hauntRoll');
  assert.equal(damageCount(game), 1);
  assert(
    game.heroes[0].statuses.some(
      (status) => status.id === 'bite-damage-reacted',
    ),
  );
});

test('a first-omen bite keeps exploration nonlethal and skips only the impossible haunt roll after damage', () => {
  let game = act(createGame('werewolf', 31), { type: 'advance' });
  game.decks.omen = ['bite-mark'];
  drawCard(game, 'omen', game.heroes[0]);
  game = contest(accept(game), 2, 0);
  assert.equal(pending(game).remaining, 8);
  assert(!game.logs.some((entry) => entry.text.includes('已自动跳过作祟检定')));
  game = act(restore(game), {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 4, speed: 4 },
  });
  assert.equal(game.heroes[0].stats.might, 1);
  assert.equal(game.heroes[0].stats.speed, 1);
  assert.equal(game.heroes[0].dead, false);
  assert.equal(pending(game), null);
  assert(game.logs.some((entry) => entry.text.includes('已自动跳过作祟检定')));
});

test('duplicate ring-result confirmation cannot advance the following request', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'family-ring', 'bite-ring');
  game = choose(contest(accept(game), 0, 0), '1:0');
  const command = { type: 'advance', requestId: pending(game).uid };
  game = act(game, command);
  assert.equal(pending(game).kind, 'cardResult');
  assert.strictEqual(act(game, command), game);
});

test('LAN splits the virtual attacker and receiver dice permissions and rejects foreign settlement', () => {
  const api = createRoomService({ gameFactory: () => start(1) }),
    host = api.create({ scenario: 'werewolf', count: 3 }),
    guest = api.join({ code: host.code });
  let room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const update = (key, action) =>
    api.update(host.code, key, {
      type: 'action',
      revision: room.revision,
      action,
    });
  room = update(guest.key, { type: 'advance' });
  const request = pending(room.game),
    attack = request.rolls[0],
    defense = request.rolls[1];
  assert.throws(
    () => update(guest.key, { type: 'rollDice', sideId: attack.id }),
    /负责的骰子/,
  );
  assert.throws(
    () => update(host.key, { type: 'rollDice', sideId: defense.id }),
    /负责的骰子/,
  );
  room = update(host.key, { type: 'rollDice', sideId: attack.id });
  room = update(guest.key, { type: 'rollDice', sideId: defense.id });
  assert.throws(
    () => update(host.key, { type: 'resolveDice', requestId: request.uid }),
    /当前角色/,
  );
  room = update(guest.key, { type: 'resolveDice', requestId: request.uid });
  assert.notEqual(pending(room.game)?.kind, 'diceRequest');
});
