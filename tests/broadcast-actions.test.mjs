import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  commandHeroId,
  createGame,
  pending,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import {
  blockingRequest,
  canActDuringBroadcast,
} from '../lib/presentation-requests.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { projectGameForPlayer } from '../lib/engine/projection.mjs';
import { explorationJournal } from '../lib/event-journal.mjs';

const start = () => act(createGame('mirror', 81, 3), { type: 'advance' });
function notice(game, kind = 'notice', extra = {}) {
  return {
    uid: ++game.serial,
    kind,
    title: '已完成的结果',
    text: '已结算。',
    ...extra,
  };
}

test('using an item permits movement while its completed result is still visible', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'coffee', 'passive-coffee');
  const item = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.use',
  );
  game = act(game, item.command);
  assert.equal(pending(game).kind, 'itemUse');
  assert.equal(blockingRequest(game), null);
  const resultId = pending(game).uid;
  const pos = actions(game).move[0];
  assert(pos);
  const before = game.heroes[0].moves;
  const moved = act(game, { type: 'move', pos });
  assert.equal(moved.heroes[0].pos, pos);
  assert(moved.heroes[0].moves < before);
  assert(!moved.queue.some((request) => request.uid === resultId));
  assert(
    moved.events.some(
      (event) => event.type === 'ItemUsed' && event.itemId === 'coffee',
    ),
  );
  // 被新行动取代的旧通知倒计时不得继续处理新房间的请求。
  assert.equal(act(moved, { type: 'advance', requestId: resultId }), moved);
});

test('restored completed notices permit an action and retain every journal entry', () => {
  let game = start();
  game.queue = [
    notice(game, 'check'),
    notice(game, 'notice', { title: '第二条结果' }),
  ];
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  assert(game);
  const uids = game.queue.map((request) => request.uid);
  const next = act(game, {
    type: 'endHero',
    actorId: game.active,
    round: game.round,
  });
  assert(next.heroes[0].ended);
  assert.equal(pending(next).kind, 'turnStart');
  assert(
    uids.every((uid) => next.events.some((event) => event.requestUid === uid)),
  );
  assert(
    explorationJournal(next).entries.some((entry) =>
      entry.text.includes('第二条结果'),
    ),
  );
  const pos = next.heroes[next.active].pos;
  assert.deepEqual(actions(next).move, []);
  assert.equal(
    act(next, { type: 'move', pos: 'foyer' }).heroes[next.active].pos,
    pos,
  );
});

test('transitions and completed notices with follow-up work still block actions', () => {
  for (const kind of [
    'turnStart',
    'roundStart',
    'trapResult',
    'privateRequest',
    'diceRequest',
    'ringResult',
    'choiceRequest',
    'damage',
  ]) {
    const game = start();
    game.queue = [notice(game, kind)];
    assert.equal(canActDuringBroadcast(game), false, kind);
    assert.equal(blockingRequest(game), pending(game));
    assert.deepEqual(actions(game).move, []);
    assert(!act(game, { type: 'endHero' }).heroes[0].ended);
  }
  for (const extra of [
    { roundEnding: true },
    { followUp: true },
    { workflow: true },
  ]) {
    const game = start();
    game.queue = [
      notice(
        game,
        'check',
        extra.workflow ? { workflow: { flowId: 'unfinished' } } : {},
      ),
    ];
    if (extra.followUp) game.queue.push(notice(game, 'damage'));
    if (extra.roundEnding) game.roundEnding = true;
    assert.equal(canActDuringBroadcast(game), false);
    assert.deepEqual(actions(game).move, []);
  }
});

test('passive notices use the active actor and hide private facts without a blocking placeholder', () => {
  const game = start();
  game.queue = [
    notice(game, 'itemUse', {
      heroId: 1,
      visibility: { heroIds: [1] },
      text: '秘密物品效果',
    }),
  ];
  assert.equal(commandHeroId(game, { type: 'move' }), game.active);
  const room = { hostId: 'host', seats: ['host', 'guest', 'host'] };
  const projected = projectGameForPlayer(game, room, 'host');
  assert.deepEqual(projected.queue, []);
  assert.doesNotMatch(JSON.stringify(projected), /秘密物品效果/);
  game.queue.push(notice(game, 'choiceRequest', { heroId: 1 }));
  const waiting = projectGameForPlayer(game, room, 'host');
  assert.equal(waiting.queue[0].kind, 'privateRequest');
  assert.equal(blockingRequest(waiting).kind, 'privateRequest');
});
