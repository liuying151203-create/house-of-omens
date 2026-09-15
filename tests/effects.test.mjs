import test from 'node:test';
import assert from 'node:assert/strict';
import { executeEffects } from '../lib/engine/effects.mjs';

test('effect sequences resolve event references and return serializable receipts', () => {
  const state = { values: { wolf: 4 } },
    result = executeEffects(
      state,
      [
        {
          id: 'reflect',
          op: 'adjust',
          params: { target: '$event.sourceId', delta: -1 },
        },
      ],
      {
        adjust: (target, params) => {
          const before = target.values[params.target];
          target.values[params.target] += params.delta;
          return { before, after: target.values[params.target] };
        },
      },
      { event: { sourceId: 'wolf' } },
    );
  assert.equal(state.values.wolf, 3);
  assert.deepEqual(result, {
    executed: [
      {
        id: 'reflect',
        op: 'adjust',
        result: { before: 4, after: 3 },
      },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('effect execution rejects unknown operations and excessive sequences', () => {
  assert.throws(
    () => executeEffects({}, [{ op: 'missing' }], {}),
    /Unknown effect operation/,
  );
  assert.throws(
    () =>
      executeEffects(
        {},
        Array.from({ length: 101 }, () => ({ op: 'noop' })),
        { noop: () => true },
      ),
    /Effect limit exceeded/,
  );
});
