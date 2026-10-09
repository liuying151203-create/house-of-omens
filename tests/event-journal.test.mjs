import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  createGame,
  createSimulationGame,
  recordEvent,
} from '../lib/game-engine.mjs';
import {
  eventJournalEntries,
  eventJournalText,
} from '../lib/event-journal.mjs';
import { ruleNoticesFromEvents } from '../lib/game-view.mjs';
import { isBroadcastRequest } from '../lib/presentation-requests.mjs';

test('structured damage and movement events produce readable journal entries', () => {
  const game = createSimulationGame('werewolf', 901, 3),
    hero = game.heroes[0];
  const damage = recordEvent(game, 'DamageApplied', {
    heroId: hero.id,
    damageType: 'physical',
    rawAmount: 3,
    preventedAmount: 1,
    actualAmount: 2,
    allocation: { might: 1, speed: 1 },
  });
  const movement = recordEvent(game, 'EntityMoved', {
    entityType: 'hero',
    entityId: hero.id,
    fromRoomId: 'entrance',
    toRoomId: 'foyer',
    moveKind: 'walk',
  });
  assert.match(eventJournalText(game, damage), /承受2点肉体伤害/);
  assert.match(eventJournalText(game, damage), /抵消1点/);
  assert.match(eventJournalText(game, damage), /力量左移1格、速度左移1格/);
  assert.match(eventJournalText(game, movement), /入口大厅.*门厅/);
  assert.deepEqual(
    eventJournalEntries(game, 2).map((entry) => entry.type),
    ['EntityMoved', 'DamageApplied'],
  );
});

test('unknown events stay out of the player journal', () => {
  const game = createSimulationGame('mirror', 902, 3);
  recordEvent(game, 'InternalProbe', { value: 1 });
  assert.equal(eventJournalEntries(game).length, 0);
});

test('item and status events share journal text and transient presentation data', () => {
  const game = createSimulationGame('werewolf', 903, 3),
    hero = game.heroes[0];
  const status = recordEvent(game, 'StatusAdded', {
      heroId: hero.id,
      statusId: 'custom-ward',
      statusLabel: '月影护符',
    }),
    item = recordEvent(game, 'ItemUsed', {
      heroId: hero.id,
      itemId: 'bandage',
      itemInstanceId: 'test-bandage',
      consumed: true,
    }),
    damage = recordEvent(game, 'DamageApplied', {
      heroId: hero.id,
      damageType: 'physical',
      rawAmount: 2,
      preventedAmount: 0,
      actualAmount: 2,
      allocation: { might: 2 },
    });

  assert.match(eventJournalText(game, status), /月影护符/);
  assert.match(eventJournalText(game, item), /绷带.*消耗/);
  assert.match(eventJournalText(game, damage), /2点肉体伤害/);
  assert.deepEqual(
    ruleNoticesFromEvents(game).map((notice) => notice.tone),
    ['gain', 'item', 'loss'],
  );
  assert.match(ruleNoticesFromEvents(game)[1].text, /使用「止血绷带」/);
});

test('rerolls and card damage explain their source and final effect', () => {
  const game = createSimulationGame('werewolf', 904, 3);
  const reroll = recordEvent(game, 'DiceRolled', {
    heroId: 0,
    label: '力量检定',
    dice: [2],
    rerollOf: 'check:1',
    sourceItemId: 'family-ring',
    rerollBefore: [0],
    rerollAfter: [2],
    rerollDieIndices: [1],
    rerollTotal: 5,
  });
  const damage = recordEvent(game, 'DamageApplied', {
    heroId: 0,
    sourceCardId: 'whisper',
    damageType: 'mental',
    rawAmount: 1,
    preventedAmount: 0,
    actualAmount: 1,
    allocation: { sanity: 1 },
  });
  assert.match(
    eventJournalText(game, reroll),
    /家族戒指.*第2枚.*0 → 2 点.*5点/,
  );
  assert.match(
    eventJournalText(game, damage),
    /因「.*」承受1点精神伤害：理智左移1格/,
  );
});

test('completed damage replaces its duplicate trait-step entries in the journal', () => {
  const game = createSimulationGame('werewolf', 905, 3);
  recordEvent(game, 'TraitChanged', {
    heroId: 0,
    trait: 'might',
    before: 4,
    after: 3,
    steps: -1,
    causeId: 'damage:1',
  });
  assert.equal(eventJournalEntries(game).length, 1);
  recordEvent(game, 'DamageApplied', {
    heroId: 0,
    damageType: 'physical',
    rawAmount: 1,
    actualAmount: 1,
    allocation: { might: 1 },
    causeId: 'damage:1',
  });
  assert.deepEqual(
    eventJournalEntries(game).map((entry) => entry.type),
    ['DamageApplied'],
  );
});

test('read-only turn broadcasts are recorded in the exploration journal', () => {
  let game = act(createGame('werewolf', 906, 3), { type: 'advance' });
  game = act(game, { type: 'endHero' });
  assert.equal(game.queue[0].kind, 'turnStart');
  assert.equal(isBroadcastRequest(game.queue[0]), true);
  assert.match(eventJournalEntries(game)[0].text, /轮到.*回合开始/);
  assert.equal(eventJournalEntries(game)[0].type, 'Broadcast');
});
