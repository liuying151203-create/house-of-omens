import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoomService,
  createDemoServer,
} from '../scripts/room-server.mjs';
import {
  createSimulationGame,
  act,
  drawCard,
  pending,
  ROOM_DECK,
  EVENTS,
  ITEMS,
  OMENS,
} from '../lib/game-engine.mjs';
import { CATALOG, validateDraft } from '../lib/catalog.mjs';
const start = () =>
  act(createSimulationGame('mirror', 27, 3), { type: 'advance' });
test('impossible haunt rolls are skipped visibly without consuming RNG; viable rolls remain', () => {
  for (const n of [0, 1, 2]) {
    let s = start();
    s.omens = n;
    s.decks.omen = ['book'];
    drawCard(s, 'omen', s.heroes[0]);
    const seed = s.seed;
    s = act(s, { type: 'advance' });
    assert.equal(pending(s).kind, 'cardResult');
    if (n < 2) {
      assert.match(pending(s).skipHint, /自动跳过/);
      assert(!s.queue.some((p) => p.kind === 'hauntRoll'));
      s = act(s, { type: 'advance' });
      assert(!pending(s));
      assert.equal(s.seed, seed);
    } else {
      assert(s.queue.some((p) => p.kind === 'hauntRoll'));
    }
  }
});
test('damage preview commits atomically and rejects partial, negative and wrong-trait allocations', () => {
  let s = start();
  s.queue = [
    {
      uid: 70,
      kind: 'damage',
      heroId: 0,
      damageType: 'physical',
      remaining: 3,
      total: 3,
      allocation: [],
    },
  ];
  const before = structuredClone(s);
  for (const allocation of [
    { might: 1, speed: 1 },
    { might: -1, speed: 4 },
    { might: 2, sanity: 1 },
    { might: 1.5, speed: 1.5 },
  ])
    assert.deepEqual(act(s, { type: 'allocateDamage', allocation }), before);
  s = act(s, { type: 'allocateDamage', allocation: { might: 1, speed: 2 } });
  assert.equal(s.heroes[0].stats.might, before.heroes[0].stats.might - 1);
  assert.equal(s.heroes[0].stats.speed, before.heroes[0].stats.speed - 2);
  assert.equal(pending(s).kind, 'damageResult');
  assert.equal(pending(s).changes.length, 2);
  assert.deepEqual(before.queue[0].allocation, []);
});
test('new rounds explicitly announce recovery and reset active explorer', () => {
  let s = start();
  s = act(s, { type: 'select', id: 1 });
  s = act(s, { type: 'endRound' });
  assert.equal(s.round, 2);
  assert.equal(s.active, 0);
  assert.equal(pending(s).kind, 'roundStart');
  assert(!s.heroes.some((h) => h.ended));
});
test('catalog includes all current cards and rooms, and all built-in types round-trip as drafts', () => {
  assert.equal(CATALOG.rooms.length, ROOM_DECK.length + 5);
  assert.equal(CATALOG.event.length, EVENTS.length);
  assert.equal(CATALOG.item.length, ITEMS.length);
  assert.equal(CATALOG.omen.length, OMENS.length);
  assert(CATALOG.tokens.some((t) => t.name === '溺亡者'));
  const entries = Object.entries(CATALOG).flatMap(([category, rows]) =>
    rows.map((data, i) => ({ id: category + i, category, data })),
  );
  assert.deepEqual(
    validateDraft(JSON.parse(JSON.stringify({ version: 1, entries }))),
    entries,
  );
  const room = {
    id: 'test',
    category: 'rooms',
    data: { ...CATALOG.rooms[0], doors: [7] },
  };
  assert.throws(() => validateDraft({ version: 1, entries: [room] }));
  assert.throws(() =>
    validateDraft({
      version: 1,
      entries: [
        {
          id: 'x',
          category: 'heroes',
          data: { name: '错误', tracks: { might: 1 } },
        },
      ],
    }),
  );
});
function setup() {
  const api = createRoomService(),
    host = api.create({ name: '房主', count: 3, scenario: 'mirror' }),
    guest = api.join({ name: '朋友', code: host.code });
  return { api, host, guest };
}
test('room identities, occupied seats and authoritative start are enforced', () => {
  const { api, host, guest } = setup();
  assert(!JSON.stringify(guest.players).includes(host.key));
  assert.throws(() => api.read(host.code, 'bad'), /身份/);
  assert.throws(
    () =>
      api.update(host.code, guest.key, {
        type: 'seat',
        seat: 0,
        revision: guest.revision,
      }),
    /已有人/,
  );
  assert.throws(
    () =>
      api.update(host.code, guest.key, {
        type: 'start',
        revision: guest.revision,
      }),
    /房主/,
  );
  const started = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  assert(started.game);
  assert.deepEqual(api.read(host.code, guest.key).game, started.game);
  assert.throws(() => api.join({ name: '晚到', code: host.code }), /已开始/);
});
test('two clients serialize actions, reject stale writes, and recover exactly the same game', () => {
  const { api, host, guest } = setup();
  let r = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const execute = (key, action) => {
    r = api.update(host.code, key, {
      type: 'action',
      action,
      revision: r.revision,
    });
    return r;
  };
  execute(host.key, { type: 'advance' });
  assert.throws(
    () => execute(guest.key, { type: 'move', pos: 'foyer' }),
    /等待/,
  );
  assert.throws(
    () => execute(guest.key, { type: 'select', id: 1 }),
    /当前玩家/,
  );
  const oldRevision = r.revision;
  execute(host.key, { type: 'move', pos: 'foyer' });
  assert.throws(
    () =>
      api.update(host.code, host.key, {
        type: 'action',
        action: { type: 'move', pos: 'stairs' },
        revision: oldRevision,
      }),
    /刚刚操作/,
  );
  execute(host.key, { type: 'endHero' });
  assert.equal(r.game.active, 1);
  execute(guest.key, { type: 'move', pos: 'foyer' });
  assert.equal(r.game.heroes[1].pos, 'foyer');
  assert.deepEqual(
    api.read(host.code, host.key).game,
    api.read(host.code, guest.key).game,
  );
  execute(guest.key, { type: 'endHero' });
  assert.equal(r.game.active, 2);
  execute(host.key, { type: 'endHero' });
  assert.equal(pending(r.game).kind, 'roundStart');
});
test('command ids make a retried network action apply exactly once', () => {
  const { api, host, guest } = setup();
  let room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  room = api.update(host.code, host.key, {
    type: 'action',
    action: { type: 'advance' },
    revision: room.revision,
  });
  const revision = room.revision,
    movesBefore = room.game.heroes[0].moves,
    command = {
      type: 'action',
      action: { type: 'move', pos: 'foyer' },
      revision,
      commandId: 'test-command-0001',
    },
    first = api.update(host.code, host.key, command),
    retried = api.update(host.code, host.key, command);
  assert.deepEqual(retried, first);
  assert.equal(api.read(host.code, host.key).revision, first.revision);
  assert.equal(first.game.heroes[0].moves, movesBefore - 1);
  assert.throws(
    () =>
      api.update(host.code, host.key, {
        ...command,
        action: { type: 'endHero' },
      }),
    /不能用于不同动作/,
  );
});
test('HTTP room API supports separate clients and denies cross-origin mutation', async () => {
  const server = createDemoServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const create = await fetch(base + '/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '甲', count: 3, scenario: 'bells' }),
    });
    assert.equal(create.status, 200);
    const host = await create.json();
    const join = await fetch(base + '/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '乙', code: host.code }),
    });
    assert.equal(join.status, 200);
    const guest = await join.json();
    const res = await fetch(base + '/api/rooms/' + host.code, {
      headers: { Authorization: 'Bearer ' + guest.key },
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).players.length, 2);
    const denied = await fetch(base + '/api/rooms', {
      method: 'POST',
      headers: { Origin: 'http://unrelated.invalid' },
      body: '{}',
    });
    assert.equal(denied.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('movement, explorer changes and a new round follow the acting explorer floor', () => {
  let s = start();
  for (const pos of ['foyer', 'stairs', 'upper'])
    s = act(s, { type: 'move', pos });
  assert.equal(s.viewFloor, 1);
  s = act(s, { type: 'viewFloor', floor: -1 });
  s = act(s, { type: 'select', id: 0 });
  assert.equal(s.viewFloor, 1);
  s = act(s, { type: 'endHero' });
  assert.equal(s.active, 1);
  assert.equal(s.viewFloor, 0);
  s = act(s, { type: 'endHero' });
  s = act(s, { type: 'endHero' });
  assert.equal(s.round, 2);
  assert.equal(s.active, 0);
  assert.equal(s.viewFloor, 1);
});
