import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationGame, recordEvent } from '../lib/game-engine.mjs';
import {
  eventJournalEntries,
  eventJournalText,
} from '../lib/event-journal.mjs';
import { ruleNoticesFromEvents } from '../lib/game-view.mjs';

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
  assert.match(eventJournalText(game, damage), /力量 1格、速度 1格/);
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
