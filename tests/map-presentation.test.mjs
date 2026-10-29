import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialMapPresentation,
  collectMapPresentation,
  completeMapStep,
  mapPresentationGame,
  MAP_MOVE_MS,
  MAP_TRIGGER_MS,
} from '../lib/map-presentation.mjs';
import { act, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { automaticRequestCommand } from '../lib/automatic-driver.mjs';
import { eventJournalEntries } from '../lib/event-journal.mjs';
import { damageExplanation } from '../lib/damage-presentation.mjs';
import { BOILER_STEAM_CHECK } from '../lib/content/bloodmoon-rooms.mjs';

function fixture() {
  let game = createHauntPlaytest('bloodmoon', 31, 3, 'bloodmoon-pursuit-trap');
  while (pending(game)) game = act(game, automaticRequestCommand(game));
  return game;
}

test('steam damage shows its shared failure effect without repeating the full check rules', () => {
  const explanation = damageExplanation(fixture(), {
    causeTag: 'steam',
    heroId: 0,
  });
  assert.match(explanation.title, /锅炉房蒸汽/);
  assert.equal(explanation.rule, undefined);
  assert(explanation.text.includes(BOILER_STEAM_CHECK.failure));
});

test('trap entry presents movement then the recorded trigger before exposing manual damage', () => {
  const before = fixture();
  let state = initialMapPresentation(before, 0);
  const game = act(before, { type: 'move', pos: 'shoot-room-1' });
  const snapshot = JSON.stringify(game);
  state = collectMapPresentation(state, game, 0);
  assert.deepEqual(
    state.steps.map((step) => step.kind),
    ['move', 'trigger'],
  );
  assert.equal(state.steps[0].duration, MAP_MOVE_MS);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(
    game.events.filter((event) => event.type === 'DamageApplied').length,
    0,
  );
  const moving = mapPresentationGame(game, state.steps);
  assert.equal(moving.heroes[0].pos, before.heroes[0].pos);
  assert.equal(game.heroes[0].pos, 'shoot-room-1');
  state = completeMapStep(state, state.steps[0].key);
  assert.equal(state.steps[0].kind, 'trigger');
  assert.equal(state.steps[0].duration, MAP_TRIGGER_MS);
  assert.equal(
    mapPresentationGame(game, state.steps).heroes[0].pos,
    'shoot-room-1',
  );
  assert(
    eventJournalEntries(game).some(
      (entry) => entry.text === state.steps[0].text,
    ),
  );
  assert.match(state.steps[0].text, /触发捕兽夹.*已销毁.*停止移动/);
  assert.doesNotMatch(state.steps[0].text, /即将|承受.*伤害/);
  state = completeMapStep(state, state.steps[0].key);
  assert.deepEqual(state.steps, []);
  assert.equal(
    JSON.stringify(game),
    snapshot,
    'presentation cannot settle or mutate rules',
  );
  assert.strictEqual(collectMapPresentation(state, game, 0), state);
  const after = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 1, speed: 1 },
  });
  assert(after.events.some((event) => event.type === 'DamageApplied'));
  assert.deepEqual(collectMapPresentation(state, after, 0).steps, []);
});

test('restoring a trap damage request explains the current trigger without replaying historical movement', () => {
  const game = restoreGameSave(
    JSON.parse(
      JSON.stringify(act(fixture(), { type: 'move', pos: 'shoot-room-1' })),
    ),
  );
  const state = initialMapPresentation(game, 8);
  assert.deepEqual(
    state.steps.map((step) => step.kind),
    ['trigger'],
  );
  assert.equal(
    mapPresentationGame(game, state.steps).heroes[0].pos,
    game.heroes[0].pos,
  );
  const explanation = damageExplanation(game, pending(game));
  assert.match(explanation.text, /踩中敌方捕兽夹.*停止移动/);
  assert.equal(explanation.rule, undefined);
});

test('the same presentation gate orders ordinary room checks, card requests and floor travel', () => {
  const before = fixture();
  for (const kind of ['diceRequest', 'card', 'roomFall', 'placement']) {
    const game = structuredClone(before);
    const origin = game.heroes[0].pos;
    game.heroes[0].pos = 'shoot-room-1';
    game.rooms.find((room) => room.id === 'shoot-room-1').floor = -1;
    game.queue = [{ kind, uid: 123, heroId: 0 }];
    game.events.push({
      id: (game.events.at(-1)?.id || 0) + 1,
      type: 'EntityMoved',
      entityType: 'hero',
      entityId: 0,
      fromRoomId: origin,
      toRoomId: 'shoot-room-1',
      moveKind: 'stairs',
    });
    let state = collectMapPresentation(
      initialMapPresentation(before, 0),
      game,
      0,
    );
    assert.equal(state.steps[0].kind, 'move', kind);
    assert.equal(mapPresentationGame(game, state.steps).viewFloor, -1);
    assert.equal(mapPresentationGame(game, state.steps).heroes[0].pos, origin);
    state = completeMapStep(state, state.steps[0].key);
    assert.strictEqual(mapPresentationGame(game, state.steps), game);
    assert.equal(pending(game).kind, kind);
  }
});

test('multi-room movement preserves every leg and ignores stale completion callbacks', () => {
  const before = fixture();
  const game = structuredClone(before),
    origin = game.heroes[0].pos;
  game.heroes[0].pos = 'shoot-room-2';
  game.events.push({
    id: (game.events.at(-1)?.id || 0) + 1,
    type: 'EntityMoved',
    entityType: 'hero',
    entityId: 0,
    path: [origin, 'shoot-room-1', 'shoot-room-2'],
  });
  let state = collectMapPresentation(
    initialMapPresentation(before, 0),
    game,
    0,
  );
  assert.equal(state.steps.length, 2);
  const firstKey = state.steps[0].key;
  state = completeMapStep(state, firstKey);
  assert.equal(
    mapPresentationGame(game, state.steps).heroes[0].pos,
    'shoot-room-1',
  );
  assert.strictEqual(completeMapStep(state, firstKey), state);
  const reset = collectMapPresentation(state, before, 1);
  assert.deepEqual(reset.steps, []);
  assert.strictEqual(completeMapStep(reset, state.steps[0].key), reset);
});

test('first snapshots and completed moves do not replay, and enemy routes keep their existing presenter', () => {
  const game = fixture();
  const state = initialMapPresentation(game, 0);
  assert.deepEqual(state.steps, []);
  const after = structuredClone(game);
  for (const event of [
    {
      type: 'EntityMoved',
      entityType: 'enemy',
      entityId: 'wolf',
      path: ['foyer', 'entrance'],
    },
    { type: 'TrapTriggered', enemyId: 'wolf', roomId: 'entrance' },
    {
      type: 'EntityMoved',
      entityType: 'hero',
      entityId: 0,
      path: ['foyer', 'foyer'],
    },
  ])
    after.events.push({ ...event, id: (after.events.at(-1)?.id || 0) + 1 });
  assert.deepEqual(collectMapPresentation(state, after, 0).steps, []);
});
