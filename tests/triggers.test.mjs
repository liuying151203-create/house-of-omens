import test from 'node:test';
import assert from 'node:assert/strict';
import { runTriggers } from '../lib/engine/triggers.mjs';

test('triggers execute by priority and source id with once-per-root protection', () => {
  const state = { seen: [] },
    event = { when: 'AfterDamage', rootActionId: 'attack-1' },
    triggers = [
      {
        id: 'later',
        sourceId: 'item-b',
        when: 'AfterDamage',
        priority: 0,
        handler: 'record',
      },
      {
        id: 'first',
        sourceId: 'item-a',
        when: 'AfterDamage',
        priority: 10,
        oncePerRoot: true,
        handler: 'record',
      },
    ],
    handlers = {
      record: (target, _event, params) =>
        target.seen.push(params.value || 'applied'),
    };
  const result = runTriggers(state, event, triggers, handlers);
  assert.deepEqual(
    result.executed.map((entry) => entry.id),
    ['first', 'later'],
  );
  const repeated = runTriggers(state, event, triggers, handlers, {
    usage: result.usage,
  });
  assert.deepEqual(
    repeated.executed.map((entry) => entry.id),
    ['later'],
  );
});

test('player-ordered trigger groups pause before committing either effect', () => {
  const state = { seen: [] },
    event = { when: 'RoundStatusTick', heroId: 1, rootActionId: 'round-2' },
    triggers = ['a', 'b'].map((id) => ({
      id,
      sourceId: `status-${id}`,
      sourceLabel: `效果${id}`,
      when: event.when,
      priority: 5,
      playerOrder: true,
      handler: 'record',
    })),
    paused = runTriggers(
      state,
      event,
      triggers,
      { record: (target, _event, params) => target.seen.push(params.id) },
      {
        requestOrder: (_target, _event, choices) => ({
          pause: true,
          requestId: 'order-1',
          choices: choices.map((trigger) => trigger.id),
        }),
      },
    );
  assert.deepEqual(state.seen, []);
  assert.deepEqual(paused.paused.choices, ['a', 'b']);
  assert.equal(paused.remainingTriggers.length, 2);
  assert.equal(paused.remainingTriggers[0]._playerOrderKey, '5:1:default');
});
