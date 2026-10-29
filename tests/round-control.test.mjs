import test from 'node:test';
import assert from 'node:assert/strict';
import { canOfferRoundEnd } from '../lib/round-control.mjs';

test('结束整轮只提供给单机多角色或控制多个怪物的房主', () => {
  const game = { heroes: [{}, {}], enemies: [{ heroId: 0 }, { heroId: 1 }] };
  assert.equal(canOfferRoundEnd(game, {}), true);
  assert.equal(canOfferRoundEnd({ ...game, heroes: [{}] }, {}), false);
  const room = { you: 'host', hostId: 'host', seats: ['host', 'host'] };
  assert.equal(canOfferRoundEnd(game, { session: {}, room }), true);
  assert.equal(
    canOfferRoundEnd(game, { session: {}, room: { ...room, you: 'guest' } }),
    false,
  );
  assert.equal(
    canOfferRoundEnd(game, {
      session: {},
      room: { ...room, seats: ['host', 'guest'] },
    }),
    false,
  );
});
