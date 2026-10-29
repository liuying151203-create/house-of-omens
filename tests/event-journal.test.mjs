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
  explorationJournal,
} from '../lib/event-journal.mjs';
import { ruleNoticesFromEvents } from '../lib/game-view.mjs';
import { isBroadcastRequest } from '../lib/presentation-requests.mjs';
import { FLOORS } from '../lib/game-data.mjs';

test('the journal merges matching process logs while preserving unrelated and older records', () => {
  const game = createSimulationGame('werewolf', 910, 3);
  game.logs = [];
  const trap = recordEvent(game, 'TrapTriggered', {
    heroId: 0,
    roomId: 'foyer',
    text: '踩中捕兽夹；本回合停止移动。',
  });
  const check = recordEvent(game, 'CheckResolved', {
    heroId: 0,
    title: '避开蒸汽',
    total: 2,
    threshold: 4,
    success: false,
    outcome: '受到1点肉体伤害，停止移动。',
  });
  game.logs = [
    { id: 13, round: game.round, text: '避开蒸汽：2/4，失败。' },
    { id: 12, round: game.round, text: trap.text },
    { id: 11, round: game.round, text: '发现新的楼梯。' },
    { id: 10, round: game.round - 1, text: trap.text },
  ];
  const snapshot = JSON.stringify(game);
  const journal = explorationJournal(game);
  assert.deepEqual(
    journal.extraLogs.map((entry) => entry.id),
    [11, 10],
  );
  assert.equal(
    journal.entries.filter((entry) => entry.type === 'TrapTriggered').length,
    1,
  );
  assert(
    journal.entries
      .find((entry) => entry.id === `event-${check.id}`)
      .text.includes(check.outcome),
  );
  assert.equal(JSON.stringify(game), snapshot);
});

test('repeated trips to the same room retain separate movements and the matching remaining move counts', () => {
  const game = createSimulationGame('werewolf', 911, 3);
  game.logs = [];
  const room = game.rooms.find((entry) => entry.id === 'foyer');
  const floor = FLOORS.find((entry) => entry.id === room.floor);
  const moves = [4, 2].map(() =>
    recordEvent(game, 'EntityMoved', {
      entityType: 'hero',
      entityId: 0,
      fromRoomId: 'entrance',
      toRoomId: 'foyer',
    }),
  );
  game.logs = [2, 4].map((remaining, index) => ({
    id: 20 - index,
    round: game.round,
    text: `${game.heroes[0].name}进入${floor.name} · ${room.name}，移动力剩余${remaining}。`,
  }));
  const journal = explorationJournal(game);
  assert.equal(journal.extraLogs.length, 0);
  assert.equal(journal.entries.length, 2);
  assert.match(
    journal.entries.find((entry) => entry.id === `event-${moves[1].id}`).text,
    /剩余移动力2/,
  );
  assert.match(
    journal.entries.find((entry) => entry.id === `event-${moves[0].id}`).text,
    /剩余移动力4/,
  );
});

test('a settled injury appears once without losing its allocation or fatal result', () => {
  const game = createSimulationGame('werewolf', 912, 3);
  const event = recordEvent(game, 'DamageApplied', {
    heroId: 0,
    damageType: 'physical',
    actualAmount: 2,
    rawAmount: 2,
    allocation: { might: 1, speed: 1 },
  });
  game.logs = [
    {
      id: 21,
      round: game.round,
      text: `${game.heroes[0].name}结算2点肉体伤害：力量左移1格；速度左移1格；人物已死亡。`,
    },
  ];
  const journal = explorationJournal(game);
  assert.equal(journal.extraLogs.length, 0);
  assert.equal(journal.entries[0].id, `event-${event.id}`);
  assert.match(journal.entries[0].text, /力量左移1格、速度左移1格.*人物已死亡/);
});

test('a result broadcast duplicates neither a structured result nor rest, while turn switches remain distinct', () => {
  const game = createSimulationGame('werewolf', 913, 3);
  const rest = recordEvent(game, 'HeroRested', {
    heroId: 0,
    text: '休整后停止移动。',
  });
  recordEvent(game, 'Broadcast', {
    kind: 'notice',
    heroId: 0,
    title: '休整',
    text: rest.text,
  });
  recordEvent(game, 'CheckResolved', {
    heroId: 0,
    title: '避开蒸汽',
    total: 2,
    threshold: 4,
    success: false,
  });
  recordEvent(game, 'Broadcast', {
    kind: 'check',
    heroId: 0,
    title: '避开蒸汽结果',
    text: '避开蒸汽：2/4，失败。',
  });
  const turn = recordEvent(game, 'Broadcast', {
    kind: 'turnStart',
    heroId: 0,
    title: '轮到某人',
    text: '',
  });
  const entries = eventJournalEntries(game);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].id, `event-${turn.id}`);
});

test('unknown or internal events cannot hide visible legacy records, and a legacy-only save remains readable', () => {
  const game = createSimulationGame('werewolf', 914, 3);
  recordEvent(game, 'InternalProbe', { text: '需要保留的旧记录。' });
  recordEvent(game, 'HeroRested', { text: '私密记录。' }, 'internal');
  recordEvent(game, 'Broadcast', {
    title: '公开通知',
    kind: 'notice',
    text: '需要保留的旧记录。',
  });
  game.logs = [{ id: 1, round: game.round, text: '私密记录。' }];
  const journal = explorationJournal(game);
  assert.equal(journal.entries.length, 1);
  assert.equal(journal.extraLogs.length, 1);
  game.events = [];
  assert.equal(explorationJournal(game).extraLogs.length, 1);
});

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
  assert.match(eventJournalEntries(game)[0].text, /轮到/);
  assert.doesNotMatch(eventJournalEntries(game)[0].text, /回合开始/);
  assert.equal(eventJournalEntries(game)[0].type, 'Broadcast');
});
