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
