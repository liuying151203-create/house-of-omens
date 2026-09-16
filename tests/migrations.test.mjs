import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createSimulationGame,
  restoreGameSave,
  validSave,
} from '../lib/game-engine.mjs';
import { itemInstances } from '../lib/item-instances.mjs';
import { CURRENT_GAME_VERSION } from '../lib/engine/migrations.mjs';
import { makeCheckpoint, readCheckpoint } from '../lib/playtest.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

test('version two saves migrate item identity, statuses and engine collections', () => {
  const legacy = createGame('werewolf', 801, 3),
    hero = legacy.heroes[0];
  legacy.version = 2;
  delete legacy.events;
  delete legacy.eventSerial;
  delete legacy.roomRules;
  delete legacy.traitRules;
  hero.items = ['coffee', 'coffee'];
  hero.used = ['coffee'];
  delete hero.itemInstances;
  delete hero.usedItemInstances;
  hero.statuses = [{ id: 'infection', acquired: 1 }];
  delete legacy.rooms[0].states;
  delete legacy.rooms[0].tokens;
  delete legacy.rooms[0].droppedItems;

  const restored = restoreGameSave(legacy);
  assert(restored);
  assert.equal(restored.version, CURRENT_GAME_VERSION);
  assert(validSave(restored));
  assert.deepEqual(restored.events, []);
  assert.deepEqual(restored.roomRules, []);
  assert.deepEqual(restored.traitRules, []);
  assert.equal(itemInstances(restored.heroes[0]).length, 2);
  assert.equal(
    new Set(itemInstances(restored.heroes[0]).map((item) => item.instanceId))
      .size,
    2,
  );
  assert.equal(restored.heroes[0].usedItemInstances.length, 2);
  assert.match(restored.heroes[0].statuses[0].instanceId, /^legacy-status:/);
  assert.deepEqual(restored.rooms[0].droppedItems, []);
  assert.equal(legacy.version, 2);
  assert.equal(legacy.events, undefined);
});

test('restore rejects unknown versions and invalid migrated states', () => {
  assert.equal(restoreGameSave({ version: 99 }), null);
  const legacy = createGame('mirror', 802, 3);
  legacy.version = 2;
  legacy.heroes[0].pos = 'missing-room';
  assert.equal(restoreGameSave(legacy), null);
});

test('playtest checkpoints accept migrated version two games', () => {
  const current = createHauntPlaytest('werewolf', 803, 3),
    legacy = structuredClone(current);
  legacy.version = 2;
  delete legacy.events;
  delete legacy.eventSerial;
  const raw = JSON.stringify({ version: 1, game: legacy }),
    restored = readCheckpoint(raw, current);
  assert(restored);
  assert.equal(restored.version, CURRENT_GAME_VERSION);
  assert.equal(
    JSON.parse(makeCheckpoint(restored)).game.version,
    CURRENT_GAME_VERSION,
  );
});

test('execution mode is explicit and version three browser saves migrate to Workflow mode', () => {
  const game = createGame('mirror', 806, 3),
    simulation = createSimulationGame('mirror', 806, 3),
    interactive = createGame('mirror', 806, 3),
    legacy = structuredClone(interactive);

  assert.equal(game.executionMode, 'workflow');
  assert.equal(simulation.executionMode, 'simulation');
  assert.equal(interactive.executionMode, 'workflow');
  assert.deepEqual(interactive, game);
  assert(validSave(game));
  assert(validSave(simulation));
  assert(validSave(interactive));

  legacy.version = 3;
  delete legacy.executionMode;
  legacy.rollMode = 'interactive';
  const restored = restoreGameSave(legacy);
  assert(restored);
  assert.equal(restored.executionMode, 'workflow');
  assert.equal('rollMode' in restored, false);

  const invalidCurrent = createGame('mirror', 807, 3);
  delete invalidCurrent.executionMode;
  assert.equal(validSave(invalidCurrent), false);
});

test('legacy pending dice roll back visibly to their uncommitted action boundary', () => {
  const legacy = createGame('mirror', 804, 3),
    resumeQueue = structuredClone(legacy.queue);
  legacy.version = 2;
  legacy.queue = [
    {
      uid: 99,
      kind: 'diceRequest',
      heroId: 0,
      title: '旧版检定',
      rolls: [{ id: 'side-0', count: 2, dice: [2, 1] }],
      resumeAction: { type: 'advance' },
      resumeQueue,
    },
  ];
  const restored = restoreGameSave(legacy);
  assert(restored);
  assert.deepEqual(restored.queue, resumeQueue);
  assert.equal(restored.compatibilityNotices[0].requestId, 99);
  assert.match(restored.feedback, /回退到动作开始前/);
  assert.match(restored.logs[0].text, /请重新执行该动作/);
  assert.equal(validSave(restored), true);
});

test('legacy dice without a safe action boundary are rejected', () => {
  const legacy = createGame('mirror', 805, 3);
  legacy.version = 2;
  legacy.queue = [
    {
      uid: 100,
      kind: 'diceRequest',
      heroId: 0,
      rolls: [{ id: 'side-0', count: 1, dice: null }],
    },
  ];
  assert.equal(restoreGameSave(legacy), null);
});
