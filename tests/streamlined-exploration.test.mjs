import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  createInteractiveGame,
  drawCard,
  pending,
  EVENTS,
} from '../lib/game-engine.mjs';
import { updateCardRule } from '../lib/card-rules.mjs';
import { selectExploration } from '../lib/exploration-preview.mjs';
import { preserveMapScroll } from '../lib/map-camera.mjs';
import { roomBadges } from '../lib/room-badges.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const start = () =>
  act(createInteractiveGame('werewolf', 83, 3), { type: 'advance' });
function cardGame(type, id) {
  const game = start();
  game.decks[type] = [id];
  drawCard(game, type, game.heroes[0]);
  return game;
}
const continueCard = (game) =>
  act(game, { type: 'continueCard', requestId: pending(game).uid });

test('first frontier click only previews; second draws exactly one room without moving the hero', () => {
  let game = start();
  // Starting entrance has no free doorway; walk into the foyer before exploring.
  game = act(game, { type: 'move', pos: actions(game).move[0] });
  const frontier = actions(game).explore[0];
  assert(frontier);
  const before = structuredClone(game);
  const first = selectExploration(game, null, frontier);
  assert.equal(first.action, null);
  assert.deepEqual(game, before);
  const second = selectExploration(game, first.preview, frontier);
  assert.equal(second.preview, null);
  game = act(game, second.action);
  assert.equal(pending(game).kind, 'placement');
  assert.equal(game.decks.rooms.length, before.decks.rooms.length - 1);
  assert.equal(game.heroes[0].pos, before.heroes[0].pos);
  assert.deepEqual(act(game, second.action), game);
});

test('changing floor, actor, or game progress invalidates a previous exploration confirmation', () => {
  const game = start();
  const frontier = actions(game).explore[0];
  assert(frontier);
  const first = selectExploration(game, null, frontier).preview;
  for (const change of [
    (s) => s.serial++,
    (s) => s.active++,
    (s) => s.viewFloor++,
    (s) => (s.heroes[0].pos = 'stairs'),
  ]) {
    const next = structuredClone(game);
    change(next);
    assert.equal(selectExploration(next, first, frontier).action, null);
  }
  assert.equal(
    selectExploration(game, first, { x: -1, y: 1, dir: 3 }).action,
    null,
  );
});

test('viewing another floor cannot preview or confirm a same-coordinate exploration', () => {
  let game = start();
  game.heroes[0].pos = 'basement';
  game.viewFloor = -1;
  const door = actions(game).explore.find((f) => f.dir === 1);
  const preview = selectExploration(game, null, door).preview;
  assert(preview);
  game = act(game, { type: 'viewFloor', floor: 0 });
  const before = structuredClone(game);
  for (const target of [
    door,
    { ...door, floor: 0, from: 'foyer' },
    undefined,
  ]) {
    assert.deepEqual(selectExploration(game, preview, target), {
      preview: null,
      action: null,
    });
  }
  assert.deepEqual(game, before);
  game = act(game, { type: 'viewFloor', floor: -1 });
  const first = selectExploration(game, null, door);
  const second = selectExploration(game, first.preview, door);
  assert.equal(second.action.floor, -1);
  assert.equal(second.action.from, 'basement');
  const result = act(game, second.action);
  assert.equal(pending(result).floor, -1);
  assert.equal(result.decks.rooms.length, game.decks.rooms.length - 1);
});

test('engine and LAN reject exploration with a wrong floor, room or coordinate without drawing', () => {
  const game = start();
  game.heroes[0].pos = 'basement';
  game.viewFloor = -1;
  const door = actions(game).explore.find((f) => f.dir === 1);
  const action = { type: 'explore', ...door };
  const api = createRoomService({ gameFactory: () => structuredClone(game) });
  const host = api.create({ count: 3, scenario: 'werewolf' });
  const guest = api.join({ code: host.code });
  const room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  for (const patch of [
    { floor: 0 },
    { from: 'foyer' },
    { x: door.x + 1 },
    { y: door.y + 1 },
  ]) {
    const invalid = { ...action, ...patch };
    assert.deepEqual(act(game, invalid), game);
    assert.throws(
      () =>
        api.update(host.code, host.key, {
          type: 'action',
          revision: room.revision,
          action: invalid,
        }),
      /当前不能/,
    );
    assert.deepEqual(
      api.read(host.code, host.key).game.decks.rooms,
      game.decks.rooms,
    );
  }
  const result = api.update(host.code, host.key, {
    type: 'action',
    revision: room.revision,
    action,
  });
  assert.equal(pending(result.game).floor, -1);
});

test('grid expansion preserves room screen positions and clicks without expansion preserve manual panning', () => {
  const previous = { minX: -2, minY: -3 };
  for (const zoom of [30, 110, 155]) {
    const left = 913,
      top = 624;
    const same = preserveMapScroll({ left, top, previous, ...previous, zoom });
    assert.deepEqual(same, { left, top });
    const next = preserveMapScroll({
      left,
      top,
      previous,
      minX: -4,
      minY: -5,
      zoom,
    });
    const pitch = zoom + zoom / 11;
    assert(
      Math.abs(
        (2 - previous.minX) * pitch - left - ((2 + 4) * pitch - next.left),
      ) < 1e-8,
    );
    assert(
      Math.abs(
        (1 - previous.minY) * pitch - top - ((1 + 5) * pitch - next.top),
      ) < 1e-8,
    );
  }
});

test('one event click starts dice but effects wait for animation settlement, preserving deterministic results', () => {
  for (const card of EVENTS.filter((c) => c.trait)) {
    const game = cardGame('event', card.id);
    const action = { type: 'continueCard', requestId: pending(game).uid };
    const next = act(game, action);
    assert.equal(pending(next).kind, 'diceRequest');
    assert(pending(next).rolls.every((r) => r.dice));
    assert.deepEqual(next.heroes, game.heroes);
    assert.deepEqual(
      next,
      act(act(game, { type: 'advance' }), { type: 'rollAll' }),
    );
    assert.deepEqual(act(next, action), next);
    const settled = act(next, {
      type: 'resolveDice',
      requestId: pending(next).uid,
    });
    assert.equal(pending(settled).kind, 'cardResult');
    assert(pending(settled).rollReceipt);
    assert.deepEqual(act(settled, action), settled);
  }
});

test('receiving items skips duplicate confirmation while preventing repeated grants', () => {
  const game = cardGame('item', 'coffee');
  const action = { type: 'continueCard', requestId: pending(game).uid };
  const next = act(game, action);
  assert(!pending(next));
  assert.equal(next.heroes[0].items.filter((id) => id === 'coffee').length, 1);
  assert.match(next.cardNotice.text, /随身物品/);
  assert.deepEqual(act(next, action), next);
  assert.deepEqual(act(game, { ...action, requestId: -1 }), game);
});

test('direct event effects still require damage allocation, and omen reception retains viable haunt checks', () => {
  let game = updateCardRule(cardGame('event', 'cipher'), {
    id: 'direct-injury',
    cardType: 'event',
    cardId: 'cipher',
    patch: {
      trait: null,
      effect: { damage: 'physical', amount: 2, text: '承受2点肉体伤害。' },
    },
  });
  const stats = structuredClone(game.heroes[0].stats);
  game = continueCard(game);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 2);
  assert.deepEqual(game.heroes[0].stats, stats);
  assert.match(game.cardNotice.text, /2点/);
  game = cardGame('omen', 'bell');
  game.omens = 2;
  game = continueCard(game);
  assert.equal(pending(game).kind, 'hauntRoll');
  assert.equal(game.heroes[0].omens.filter((id) => id === 'bell').length, 1);
});

test('room status icons distinguish moonlight, sealed windows, collected tokens and hidden tokens', () => {
  const game = start();
  const room = {
    id: 'test',
    floor: 0,
    x: 99,
    y: 99,
    windows: [0],
    tokens: [
      { id: 'visible', label: '钥匙', description: '可拾取' },
      { id: 'secret', label: '秘密', hidden: true },
      { id: 'unrevealed', label: '未发现', revealed: false },
    ],
  };
  assert.deepEqual(
    roomBadges(game, room).map((b) => b.id),
    ['token-visible'],
  );
  game.phase = 'haunt';
  assert.equal(roomBadges(game, room)[0].id, 'moonlight');
  room.states = { boarded: true };
  assert.equal(roomBadges(game, room)[0].id, 'boarded');
  room.target = 'moonSeal';
  assert.equal(roomBadges(game, room).find((b) => b.id === 'goal').icon, '⚑');
  room.target = 'fuse';
  room.done = true;
  assert.equal(
    roomBadges(game, room).find((b) => b.id === 'fuse').label,
    '保险丝已取走',
  );
});

test('LAN one-click event checks remain restricted to the card owner and share the same dice', () => {
  const api = createRoomService({
    gameFactory: () => cardGame('event', 'cipher'),
  });
  const host = api.create({ scenario: 'werewolf', count: 3 });
  const guest = api.join({ code: host.code });
  let room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const action = { type: 'continueCard', requestId: pending(room.game).uid };
  assert.throws(
    () =>
      api.update(host.code, guest.key, {
        type: 'action',
        action,
        revision: room.revision,
      }),
    /等待/,
  );
  room = api.update(host.code, host.key, {
    type: 'action',
    action,
    revision: room.revision,
  });
  assert.equal(pending(room.game).kind, 'diceRequest');
  assert(pending(room.game).rolls.every((r) => r.dice));
  assert.deepEqual(api.read(host.code, guest.key).game, room.game);
});
