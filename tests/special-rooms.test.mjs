import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulationGame,
  act,
  actions,
  roomAt,
  connections,
  roomDestinations,
  ROOM_DECK,
  validSave,
} from '../lib/game-engine.mjs';
import {
  createHauntPlaytest,
  makeCheckpoint,
  readCheckpoint,
} from '../lib/playtest.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

function fixture(id, interactive = false) {
  const s = createSimulationGame('werewolf', 18, 3);
  s.queue = [];
  s.heroes[0].pos = 'foyer';
  const tile = structuredClone(ROOM_DECK.find((r) => r.id === id));
  s.rooms.push({
    ...tile,
    floor: 0,
    x: 1,
    y: 0,
    rotation: id === 'mystic-elevator' ? 1 : 2,
    roomBonus: [],
  });
  s.decks.rooms = s.decks.rooms.filter((r) => r !== id);
  if (interactive) s.executionMode = 'workflow';
  return s;
}
function enterAndUse(s, id) {
  s = act(s, { type: 'move', pos: id });
  return id === 'mystic-elevator' ? act(s, { type: 'useElevator' }) : s;
}

test('entering or passing through the elevator never rolls until the explorer chooses the action', () => {
  let s = fixture('mystic-elevator', true);
  const seed = s.seed;
  s = act(s, { type: 'move', pos: 'mystic-elevator' });
  assert.equal(s.queue.length, 0);
  assert.equal(s.seed, seed);
  assert.equal(
    s.heroes[0].moves,
    fixture('mystic-elevator').heroes[0].moves - 1,
  );
  assert(actions(s).elevator);
  s = act(s, { type: 'move', pos: 'foyer' });
  assert.equal(s.queue.length, 0);
  assert.deepEqual(act(s, { type: 'useElevator' }), s);
  s = act(s, { type: 'move', pos: 'mystic-elevator' });
  s = act(s, { type: 'useElevator' });
  assert.equal(s.queue[0].kind, 'diceRequest');
  assert.equal(s.queue[0].workflow.definitionId, 'room.elevator');
  assert.equal(s.queue[0].resumeAction, undefined);
});

test('rotating a shared landing cell switches between both legal door anchors and survives restore', () => {
  let s = fixture('mystic-elevator', true);
  s.rooms.push({
    id: 'junction',
    name: '连廊',
    floor: 0,
    x: -1,
    y: 0,
    rotation: 0,
    doors: [0, 1, 2, 3],
  });
  s = act(s, { type: 'move', pos: 'mystic-elevator' });
  roomAt(s, 'mystic-elevator').floor = -1;
  s = resolvedRoll(act(s, { type: 'useElevator' }), [[1, 1]]);
  const d = s.queue[0].destinations.find((d) => d.x === -1 && d.y === -1);
  s = act(s, { type: 'roomDestination', from: d.from, dir: d.dir });
  const first = s.queue[0];
  assert.equal(first.options.length, 2);
  const snapshots = [
    structuredClone(s),
    act(JSON.parse(JSON.stringify(s)), { type: 'rotate' }),
  ];
  assert.notEqual(snapshots[1].queue[0].from, first.from);
  assert.notEqual(snapshots[1].queue[0].rotation, first.rotation);
  for (const snapshot of snapshots) {
    const anchor = snapshot.queue[0].from;
    const placed = act(snapshot, { type: 'place' });
    assert.equal(placed.queue.length, 0);
    assert(connections(placed, 'mystic-elevator').includes(anchor));
    assert.equal(roomAt(placed, 'mystic-elevator').x, -1);
    assert.equal(roomAt(placed, 'mystic-elevator').y, -1);
  }
});
function resolvedRoll(s, dice) {
  assert.equal(s.queue[0].kind, 'diceRequest');
  assert.equal(s.queue[0].rolls.length, dice.length);
  s.queue[0].rolls.forEach((r, i) => {
    assert.equal(r.count, dice[i].length);
    r.dice = dice[i];
  });
  return act(s, { type: 'resolveDice', requestId: s.queue[0].uid });
}

test('same-floor elevator rolls preserve position, orientation and passengers while spending one move', () => {
  for (const [floor, dice] of [
    [0, [1, 1]],
    [1, [1, 2]],
    [-1, [0, 1]],
    [-1, [0, 0]],
  ]) {
    let s = fixture('mystic-elevator', true);
    s.heroes[0].pos = s.heroes[1].pos = 'mystic-elevator';
    roomAt(s, 'mystic-elevator').floor = floor;
    const before = structuredClone(s);
    s = resolvedRoll(act(s, { type: 'useElevator' }), [dice]);
    assert.equal(s.queue[0].kind, 'check');
    assert.match(s.queue[0].text, /当前楼层/);
    assert(!s.queue.some((p) => p.kind === 'placement'));
    assert.deepEqual(s.rooms, before.rooms);
    assert.deepEqual(s.heroes[1], before.heroes[1]);
    assert.equal(s.heroes[0].moves, before.heroes[0].moves - 1);
    assert.equal(s.roomMotion, before.roomMotion);
    assert.equal(
      s.queue.some((p) => p.kind === 'roomFall'),
      dice[0] + dice[1] === 0,
    );
  }
});

test('four allows a new legal position on the current floor after restoring the pending choice', () => {
  let s = fixture('mystic-elevator', true);
  s.heroes[1].pos = 'mystic-elevator';
  s = resolvedRoll(enterAndUse(s, 'mystic-elevator'), [[2, 2]]);
  const before = structuredClone(roomAt(s, 'mystic-elevator'));
  const target = s.queue[0].destinations.find(
    (d) => d.floor === before.floor && (d.x !== before.x || d.y !== before.y),
  );
  assert(target);
  s = act(JSON.parse(JSON.stringify(s)), {
    type: 'roomDestination',
    from: target.from,
    dir: target.dir,
  });
  const moves = s.heroes[0].moves;
  s = act(s, { type: 'place' });
  const room = roomAt(s, 'mystic-elevator');
  assert.equal(room.floor, before.floor);
  assert.equal(room.x, target.x);
  assert.equal(room.y, target.y);
  assert(connections(s, room.id).includes(target.from));
  assert.equal(s.heroes[0].moves, moves);
  assert.equal(s.heroes[1].pos, room.id);
  assert.equal(s.queue.length, 0);
});

test('four offers every floor or an explicit unchanged original landing, including restored saves', () => {
  let s = fixture('mystic-elevator', true);
  s = resolvedRoll(enterAndUse(s, 'mystic-elevator'), [[2, 2]]);
  assert.deepEqual(
    [...new Set(s.queue[0].destinations.map((d) => d.floor))].sort(
      (a, b) => a - b,
    ),
    [-1, 0, 1],
  );
  const rooms = structuredClone(s.rooms),
    moves = s.heroes[0].moves;
  s = act(JSON.parse(JSON.stringify(s)), { type: 'stayElevator' });
  assert.equal(s.queue.length, 0);
  assert.deepEqual(s.rooms, rooms);
  assert.equal(s.viewFloor, 0);
  assert.equal(s.heroes[0].moves, moves);
  assert(actions(s).elevator);
  assert.deepEqual(act(s, { type: 'stayElevator' }), s);
});

test('repeated elevator starts spend only the operator movement and stop at zero, including old saves', () => {
  let s = fixture('mystic-elevator', true);
  s.heroes[0].pos = 'mystic-elevator';
  s.heroes[0].moves = 2;
  s.heroes[0].elevatorUsed = true; // Legacy save data must no longer lock the action.
  s.heroes[1].pos = 'mystic-elevator';
  const passengerMoves = s.heroes[1].moves;
  const round = s.round;
  for (const remaining of [1, 0]) {
    assert(actions(s).elevator);
    s = act(s, { type: 'useElevator' });
    assert.deepEqual(act(s, { type: 'useElevator' }), s);
    const requestId = s.queue[0].uid;
    s = resolvedRoll(s, [[1, 2]]);
    assert.equal(s.heroes[0].moves, remaining);
    s = act(s, { type: s.queue[0].kind === 'placement' ? 'place' : 'advance' });
    assert.deepEqual(act(s, { type: 'resolveDice', requestId }), s);
    assert.equal(s.heroes[1].moves, passengerMoves);
    s = JSON.parse(JSON.stringify(s));
  }
  assert.equal(s.round, round);
  assert(!actions(s).elevator);
  assert.deepEqual(act(s, { type: 'useElevator' }), s);
  s.heroes[0].moves = 3;
  s.heroes[0].stopped = true;
  assert(!actions(s).elevator);
  assert.deepEqual(act(s, { type: 'useElevator' }), s);
  assert.equal(
    s.logs.filter((l) => l.text.includes('花费1点移动力启动神秘电梯')).length,
    2,
  );
});
function finish(s) {
  for (let i = 0; s.queue.length && i < 100; i++) {
    const p = s.queue[0];
    s = act(
      s,
      p.kind === 'placement'
        ? { type: 'place' }
        : p.kind === 'damage'
          ? { type: 'allocate', trait: 'might' }
          : p.kind === 'diceRequest' && p.rolls.some((r) => !r.dice)
            ? { type: 'rollAll' }
            : { type: 'advance' },
    );
  }
  assert.equal(s.queue.length, 0);
  return s;
}

test('elevator outcomes offer only their rolled floors, including a free floor choice on four', () => {
  for (const [dice, floors] of [
    [[0, 0], [-1]],
    [[0, 1], [-1]],
    [[1, 2], [1]],
    [
      [2, 2],
      [-1, 0, 1],
    ],
  ]) {
    let s = fixture('mystic-elevator', true);
    s = enterAndUse(s, 'mystic-elevator');
    s = resolvedRoll(s, [dice]);
    const p = s.queue[0];
    assert.equal(p.mode, 'elevator');
    assert.deepEqual(
      [...new Set(p.destinations.map((d) => d.floor))].sort((a, b) => a - b),
      floors,
    );
    assert.equal(
      s.heroes[0].moves,
      fixture('mystic-elevator').heroes[0].moves - 2,
    );
    assert(validSave(s));
  }
});

test('elevator relocation preserves passengers, enemies, tokens and objectives while replacing door connections', () => {
  let s = fixture('mystic-elevator', true);
  s.heroes[1].pos = 'mystic-elevator';
  s.enemies.push({ id: 'passenger', pos: 'mystic-elevator', hp: 4 });
  Object.assign(roomAt(s, 'mystic-elevator'), {
    tokens: [{ id: 'key' }],
    target: 'seal',
    charges: 2,
  });
  s = resolvedRoll(enterAndUse(s, 'mystic-elevator'), [[1, 2]]);
  const beforeMoves = s.heroes[0].moves;
  const destination = s.queue[0].from;
  s = act(s, { type: 'place' });
  assert.equal(roomAt(s, 'mystic-elevator').floor, 1);
  assert(!connections(s, 'foyer').includes('mystic-elevator'));
  assert(connections(s, destination).includes('mystic-elevator'));
  assert.equal(s.heroes[1].pos, 'mystic-elevator');
  assert.equal(s.enemies[0].pos, 'mystic-elevator');
  assert.equal(roomAt(s, 'mystic-elevator').tokens[0].id, 'key');
  assert.equal(roomAt(s, 'mystic-elevator').charges, 2);
  assert.equal(s.heroes[0].moves, beforeMoves);
  assert(actions(s).elevator);
  assert.equal(
    new Set(s.rooms.map((r) => `${r.floor},${r.x},${r.y}`)).size,
    s.rooms.length,
  );
  assert.equal(s.roomMotion.kind, 'elevator');
});

test('no legal elevator destination leaves its tile in place and still spends one movement point', () => {
  let s = fixture('mystic-elevator', true);
  roomAt(s, 'upper').doors = [];
  s = resolvedRoll(enterAndUse(s, 'mystic-elevator'), [[1, 2]]);
  assert.equal(s.queue[0].kind, 'check');
  assert.equal(roomAt(s, 'mystic-elevator').floor, 0);
  assert.match(s.queue[0].text, /留在原处/);
  assert.equal(
    s.heroes[0].moves,
    fixture('mystic-elevator').heroes[0].moves - 2,
  );
});

test('zero elevator result damages every explorer passenger only after the crash dice settle', () => {
  let s = fixture('mystic-elevator', true);
  s.heroes[1].pos = 'mystic-elevator';
  s = resolvedRoll(enterAndUse(s, 'mystic-elevator'), [[0, 0]]);
  s = act(s, { type: 'place' });
  const stats = structuredClone(s.heroes.map((h) => h.stats));
  s = act(s, { type: 'continueRoom', requestId: s.queue[0].uid });
  assert.equal(s.queue[0].rolls.length, 2);
  assert.deepEqual(
    s.heroes.map((h) => h.stats),
    stats,
  );
  s = resolvedRoll(s, [[2], [1]]);
  assert.deepEqual(
    s.queue.filter((p) => p.kind === 'damage').map((p) => [p.heroId, p.total]),
    [
      [0, 2],
      [1, 1],
    ],
  );
  s = finish(s);
  assert.equal(s.heroes[0].stats.might, stats[0].might - 2);
  assert.equal(s.heroes[1].stats.might, stats[1].might - 1);
  assert(s.logs.some((l) => /电梯冲击.*2 点/.test(l.text)));
});

test('collapse success is checked once for the room and later visitors can choose to jump', () => {
  let s = fixture('collapsed-room', true);
  const rolled = act(s, { type: 'move', pos: 'collapsed-room' });
  s = resolvedRoll(rolled, [Array(rolled.queue[0].rolls[0].count).fill(2)]);
  assert.equal(s.queue[0].success, true);
  s = finish(s);
  s = act(s, { type: 'select', id: 1 });
  s.heroes[1].pos = 'foyer';
  s = act(s, { type: 'move', pos: 'collapsed-room' });
  assert.equal(s.queue.length, 0);
  assert(actions(s).fall);
  s = act(s, { type: 'jumpDown' });
  assert.equal(s.queue[0].mode, 'collapse');
});

test('failed collapse creates one marked basement tile and reuses the landing without free upward travel', () => {
  let s = fixture('collapsed-room', true);
  const originalCount = s.rooms.length;
  const rolled = act(s, { type: 'move', pos: 'collapsed-room' });
  s = resolvedRoll(rolled, [Array(rolled.queue[0].rolls[0].count).fill(0)]);
  assert.equal(s.queue[0].mode, 'collapse');
  const moves = s.heroes[0].moves;
  s = act(s, { type: 'place' });
  const landing = s.heroes[0].pos;
  assert.equal(roomAt(s, landing).floor, -1);
  assert.equal(s.heroes[0].moves, moves);
  assert.equal(s.rooms.length, originalCount + 1);
  assert(
    roomAt(s, landing).tokens.some((t) => t.id === 'below-collapsed-room'),
  );
  assert(!connections(s, landing).includes('collapsed-room'));
  s = finish(s);
  s = act(s, { type: 'select', id: 1 });
  s.heroes[1].pos = 'collapsed-room';
  s = act(s, { type: 'jumpDown' });
  assert.equal(s.heroes[1].pos, landing);
  assert.equal(s.rooms.length, originalCount + 1);
  assert.equal(s.queue[0].kind, 'roomFall');
  assert.equal(s.queue.filter((p) => p.kind === 'card').length, 0);
});

test('depleted basement deck falls back safely; return stairs supply a permanent escape', () => {
  let s = fixture('collapsed-room');
  s.decks.rooms = [];
  roomAt(s, 'collapsed-room').collapseChecked = true;
  s.heroes[0].pos = 'collapsed-room';
  s = finish(act(s, { type: 'jumpDown' }));
  assert.equal(s.heroes[0].pos, 'basement');
  assert(actions(s).returnStairs);
  const moves = s.heroes[0].moves;
  s = act(s, { type: 'findReturnStairs' });
  assert.equal(s.heroes[0].moves, moves - 1);
  assert(connections(s, 'basement').includes('foyer'));
  assert(connections(s, 'foyer').includes('basement'));
  assert.deepEqual(act(s, { type: 'findReturnStairs' }), s);
});

test('special travel is reproducible in direct and interactive games and survives pending saves', () => {
  for (const id of ['mystic-elevator', 'collapsed-room'])
    for (let seed = 1; seed <= 12; seed++) {
      const direct = fixture(id);
      direct.seed = seed;
      const interactive = {
        ...structuredClone(direct),
        executionMode: 'workflow',
      };
      const a = finish(enterAndUse(direct, id));
      const pending = enterAndUse(interactive, id);
      const b = finish(JSON.parse(JSON.stringify(pending)));
      assert.deepEqual(b.heroes, a.heroes);
      assert.deepEqual(b.rooms, a.rooms);
      assert.equal(b.seed, a.seed);
      assert(validSave(b));
    }
});

test('room playtests start beside the requested tile and can restore a pending destination', () => {
  for (const scenario of ['werewolf', 'mirror', 'bells', 'flood'])
    for (const focus of ['elevator', 'collapse']) {
      let s = createHauntPlaytest(scenario, 27, 4, focus);
      const id = focus === 'elevator' ? 'mystic-elevator' : 'collapsed-room';
      s = act(s, { type: 'advance' });
      assert(actions(s).move.includes(id));
      s = enterAndUse(s, id);
      const raw = makeCheckpoint(s);
      assert.deepEqual(readCheckpoint(raw, s), s);
      assert(validSave(s));
    }
});

test('destination selection validates options and LAN rejects other players moving the room', () => {
  let game = fixture('mystic-elevator', true);
  game = resolvedRoll(enterAndUse(game, 'mystic-elevator'), [[2, 2]]);
  assert.deepEqual(
    act(game, { type: 'roomDestination', from: 'nonexistent', dir: 0 }),
    game,
  );
  const api = createRoomService({ gameFactory: () => game });
  const host = api.create({ count: 3, scenario: 'werewolf' });
  const guest = api.join({ code: host.code });
  const r = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const target = roomDestinations(
    game,
    roomAt(game, 'mystic-elevator'),
    [-1],
    'mystic-elevator',
  )[0];
  const command = {
    type: 'action',
    revision: r.revision,
    action: { type: 'roomDestination', from: target.from, dir: target.dir },
  };
  assert.throws(() => api.update(host.code, guest.key, command), /等待/);
  const next = api.update(host.code, host.key, command);
  assert.equal(next.game.queue[0].floor, -1);
  assert.equal(api.read(host.code, guest.key).game.queue[0].floor, -1);
});

test('both special rooms are discoverable from the normal shuffled deck and resolve through placement', () => {
  for (const id of ['mystic-elevator', 'collapsed-room']) {
    let s = createSimulationGame('werewolf', 8, 3);
    s.queue = [];
    s.executionMode = 'workflow';
    s.heroes[0].pos = 'foyer';
    s.decks.rooms = [id, ...s.decks.rooms.filter((r) => r !== id)];
    s = act(s, { type: 'explore', dir: 1 });
    assert.equal(s.queue[0].tileId, id);
    s = act(s, { type: 'place' });
    if (id === 'mystic-elevator') {
      assert.equal(s.queue.length, 0);
      assert(actions(s).elevator);
      s = act(s, { type: 'useElevator' });
    }
    assert.equal(s.queue[0].kind, 'diceRequest');
    s = finish(s);
    assert.equal(s.rooms.filter((r) => r.id === id).length, 1);
    assert(validSave(s));
  }
});

test('monsters traverse an established collapse shaft using a recorded route, never as an immediate discovery attack', () => {
  let s = fixture('collapsed-room');
  s.phase = 'haunt';
  s.remaining = 20;
  roomAt(s, 'collapsed-room').collapseLanding = 'basement';
  s.heroes.forEach((h) => {
    h.pos = 'basement';
  });
  s.enemies = [
    {
      id: 'wolf',
      name: '狼人',
      kind: 'wolf',
      pos: 'collapsed-room',
      hp: 4,
      maxHp: 4,
      might: 3,
      speed: 1,
    },
  ];
  assert(!connections(s, 'basement').includes('collapsed-room'));
  assert(
    connections(s, 'basement', { monster: true }).includes('collapsed-room'),
  );
  s.executionMode = 'workflow';
  s = act(s, { type: 'endRound' });
  assert.equal(s.queue[0].kind, 'diceRequest');
  assert.deepEqual(
    s.events.findLast((event) => event.type === 'MovementQueued').path,
    ['collapsed-room', 'basement'],
  );
  assert.equal(s.enemies[0].pos, 'collapsed-room');
});

test('landing card waits for fall damage; a fatally injured explorer cannot collect it', () => {
  let s = fixture('collapsed-room', true);
  s.phase = 'haunt';
  s.enemies = [
    {
      id: 'wolf',
      kind: 'wolf',
      pos: 'entrance',
      hp: 4,
      maxHp: 4,
      might: 3,
      speed: 1,
    },
  ];
  s.decks.rooms = ['boiler'];
  s.heroes[0].pos = 'collapsed-room';
  s.heroes[0].stats.might = 1;
  roomAt(s, 'collapsed-room').collapseChecked = true;
  s = act(s, { type: 'jumpDown' });
  s = act(s, { type: 'place' });
  const deck = [...s.decks.item];
  s = act(s, { type: 'continueRoom', requestId: s.queue[0].uid });
  s = resolvedRoll(s, [[2]]);
  assert.equal(s.queue.filter((p) => p.kind === 'card').length, 0);
  s = act(s, { type: 'advance' });
  assert.equal(s.queue[0].kind, 'damage');
  s = act(s, { type: 'allocate', trait: 'might' });
  assert(s.heroes[0].dead);
  assert.equal(s.queue.filter((p) => p.kind === 'card').length, 0);
  assert.deepEqual(s.decks.item, deck);
});
