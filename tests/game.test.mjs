import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_DECK,
  TRAIT_KEYS,
  createSimulationGame,
  createGame,
  act,
  actions,
  pending,
  roomAt,
  frontiers,
  doorsOf,
  placementOptions,
  connections,
  pathTo,
  traitValue,
  living,
  triggerHaunt,
  drawCard,
  validSave,
} from '../lib/game-engine.mjs';
import { automaticRequestCommand } from '../lib/automatic-driver.mjs';
const start = (id = 'bells', seed = 1, count = 3, interactive = false) =>
  act(
    interactive
      ? createGame(id, seed, count)
      : createSimulationGame(id, seed, count),
    { type: 'advance' },
  );
function resolve(s) {
  for (let i = 0; pending(s) && i < 100; i++) {
    if (s.executionMode === 'workflow') {
      s = act(s, automaticRequestCommand(s, pending(s)));
      continue;
    }
    const p = pending(s);
    if (p.kind === 'diceRequest') {
      s = p.rolls.some((r) => !r.dice)
        ? act(s, { type: 'rollAll' })
        : act(s, { type: 'advance' });
      continue;
    }
    if (p.kind === 'placement') s = act(s, { type: 'place' });
    else if (p.kind === 'damage') s = act(s, automaticRequestCommand(s, p));
    else s = act(s, { type: 'advance' });
  }
  return s;
}
function stepToward(s, id) {
  const h = s.heroes[s.active],
    p = pathTo(s, h.pos, id);
  return p.length > 1 ? act(s, { type: 'move', pos: p[1] }) : s;
}
export function autoPlay(
  id,
  seed,
  count = 3,
  untilHaunt = false,
  interactive = true,
) {
  let s = start(id, seed, count, interactive),
    steps = 0;
  while (s.phase !== 'over' && steps++ < 2500) {
    if (pending(s)) {
      s = resolve(s);
      continue;
    }
    if (untilHaunt && s.phase === 'haunt') return s;
    const h = s.heroes[s.active];
    if (h.dead || h.traitor || h.ended) {
      const next = living(s).find((n) => !n.ended);
      s = next
        ? act(s, { type: 'select', id: next.id })
        : act(s, { type: 'endRound' });
      continue;
    }
    const legal = actions(s),
      r = roomAt(s, h.pos);
    if (legal.attack.length) {
      s = act(s, { type: 'attack', id: legal.attack[0] });
      continue;
    }
    if (s.phase === 'haunt') {
      if (
        legal.interact &&
        !(r.target === 'generator' && s.fuses < 2) &&
        !(
          h.pos === 'entrance' &&
          s.powered &&
          !living(s).every((n) => n.pos === 'entrance')
        )
      ) {
        s = act(s, { type: 'interact' });
        continue;
      }
      let targets =
        s.scenario === 'flood'
          ? s.powered
            ? ['entrance']
            : s.targetRooms.filter((id) => {
                const r = roomAt(s, id);
                return (
                  !r.done && r.target === (s.fuses < 2 ? 'fuse' : 'generator')
                );
              })
          : s.scenario === 'mirror' && s.mirrorFound
            ? s.enemies.filter((e) => e.kind === 'wraith').map((e) => e.pos)
            : s.targetRooms.filter((id) => !roomAt(s, id).done);
      targets = targets.sort(
        (a, b) => pathTo(s, h.pos, a).length - pathTo(s, h.pos, b).length,
      );
      const target = targets[0];
      if (target && target !== h.pos && h.moves > 0 && !h.stopped) {
        const next = stepToward(s, target);
        if (JSON.stringify(s) !== JSON.stringify(next)) {
          s = next;
          continue;
        }
      }
      if (legal.rest) {
        const k = TRAIT_KEYS.filter((k) => h.stats[k] < h.start[k]).sort(
          (a, b) => h.stats[a] - h.stats[b],
        )[0];
        s = act(s, { type: 'rest', trait: k });
        continue;
      }
      s = act(s, { type: 'endHero' });
      continue;
    }
    if (h.moves > 0 && !h.stopped) {
      const preferred =
        h.id % 3 === 0 ? 0 : h.id % 3 === 1 ? 1 : s.basementUnlocked ? -1 : 0;
      let options = [
        ...frontiers(s, preferred),
        ...frontiers(s, 0),
        ...frontiers(s, 1),
        ...(s.basementUnlocked ? frontiers(s, -1) : []),
      ];
      options = options.filter(
        (f) =>
          s.decks.rooms.some(
            (id) =>
              placementOptions(
                s,
                f.from,
                f.dir,
                ROOM_DECK.find((r) => r.id === id),
              ).length,
          ) && pathTo(s, h.pos, f.from).length,
      );
      const preferredOptions = options.filter((f) => f.floor === preferred);
      if (preferredOptions.length) options = preferredOptions;
      options.sort(
        (a, b) =>
          pathTo(s, h.pos, a.from).length - pathTo(s, h.pos, b.from).length,
      );
      const f = options[0];
      if (f) {
        s =
          f.from === h.pos
            ? act(s, { type: 'explore', dir: f.dir })
            : stepToward(s, f.from);
        continue;
      }
    }
    s = act(s, { type: 'endHero' });
  }
  return s;
}
test('3–6 distinct heroes have four real tracks and speed-based movement', () => {
  for (const n of [3, 4, 5, 6]) {
    const s = start('bells', 10, n);
    assert.equal(s.heroes.length, n);
    for (const h of s.heroes) {
      assert.equal(h.moves, traitValue(h, 'speed'));
      assert.equal(TRAIT_KEYS.length, 4);
    }
    assert(validSave(s));
  }
  assert.deepEqual(
    createSimulationGame('bells', 5),
    createSimulationGame('bells', 5),
  );
  assert.notDeepEqual(
    createSimulationGame('bells', 5).decks.rooms,
    createSimulationGame('bells', 6).decks.rooms,
  );
});
test('exploration draws a tile, offers entry-matching rotations, then places only once', () => {
  let s = start();
  const original = structuredClone(s),
    f = actions(s).explore[0];
  s = act(s, { type: 'explore', dir: f.dir });
  const p = pending(s),
    tile = ROOM_DECK.find((t) => t.id === p.tileId);
  assert.equal(p.kind, 'placement');
  assert.equal(s.rooms.length, 5);
  assert.equal(
    s.decks.rooms.length,
    ROOM_DECK.filter((room) => !room.supply).length - 1,
  );
  for (const option of p.options)
    assert(doorsOf(tile, option.rotation).includes((f.dir + 2) % 4));
  assert.deepEqual(act(s, { type: 'move', pos: 'foyer' }), s);
  s = act(s, { type: 'rotate' });
  assert(p.options.some((o) => o.rotation === pending(s).rotation));
  s = act(s, { type: 'place' });
  assert.equal(s.rooms.length, 6);
  const room = roomAt(s, s.heroes[0].pos);
  assert.equal(room.floor, 0);
  assert(room.floors.includes(0));
  assert(connections(s, 'entrance').includes(room.id));
  assert.equal(new Set(s.rooms.map((r) => r.id)).size, s.rooms.length);
  assert.equal(
    original.decks.rooms.length,
    ROOM_DECK.filter((room) => !room.supply).length,
  );
});
test('walls and floor tabs never teleport explorers; stairs require physical presence', () => {
  let s = start();
  s.rooms.push({
    id: 'wall',
    name: '墙后',
    floor: 0,
    x: 1,
    y: 1,
    doors: [0, 2],
    rotation: 0,
    roomBonus: [],
  });
  assert(!connections(s, 'entrance').includes('wall'));
  assert.deepEqual(act(s, { type: 'move', pos: 'wall' }), s);
  const t = act(s, { type: 'viewFloor', floor: 1 });
  assert.equal(t.heroes[0].pos, 'entrance');
  assert.deepEqual(act(s, { type: 'move', pos: 'upper' }), s);
  s = act(s, { type: 'move', pos: 'foyer' });
  s = act(s, { type: 'move', pos: 'stairs' });
  assert(actions(s).stairs.includes('upper'));
  s = act(s, { type: 'move', pos: 'upper' });
  assert.equal(s.viewFloor, 1);
  assert.equal(s.heroes[0].pos, 'upper');
  assert(!pathTo(s, 'entrance', 'basement').length);
});
test('room entry notices belong to the explorer who triggered them', () => {
  let s = start();
  const downstairs = ROOM_DECK.find((tile) => tile.id === 'stairs-down');
  s.rooms.push({
    ...structuredClone(downstairs),
    floor: 0,
    x: 1,
    y: 0,
    rotation: 1,
    starter: false,
    target: null,
    done: false,
    attempts: 0,
    roomBonus: [],
  });

  s = act(s, { type: 'move', pos: 'foyer' });
  s = act(s, { type: 'move', pos: 'stairs-down' });
  const request = pending(s);
  assert.equal(request.kind, 'floor');
  assert.equal(request.heroId, 0);
  assert.equal(s.basementUnlocked, true);
});
test('room art rotation and actual door graph stay consistent across random exploration', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const s = autoPlay('mirror', seed, 3, true);
    assert.equal(s.phase, 'haunt');
    assert(s.rooms.some((r) => r.floor === 1 && !r.starter));
    for (const r of s.rooms.filter((r) => !r.starter)) {
      assert(r.floors.includes(r.floor));
      assert(connections(s, r.id).length > 0);
      assert(pathTo(s, 'entrance', r.id).length > 0);
    }
    assert.equal(
      new Set(s.rooms.map((r) => `${r.floor}/${r.x}/${r.y}`)).size,
      s.rooms.length,
    );
    if (s.basementUnlocked) {
      assert(pathTo(s, 'entrance', 'basement').length > 0);
      assert(s.links.some((link) => link.includes('basement')));
    }
  }
});
test('placement favors full matching over blocked doors', () => {
  const s = start();
  const tile = { floors: [0], doors: [0, 1] };
  const options = placementOptions(s, 'entrance', 1, tile);
  assert(options.length);
  assert(options.every((o) => doorsOf(tile, o.rotation).includes(3)));
  assert(
    options.every(
      (o) => o.blocked === Math.min(...options.map((o) => o.blocked)),
    ),
  );
});
test('event cards show their face before effects and preserve remaining movement', () => {
  let s = start('mirror', 42);
  s.decks.event = ['cipher'];
  const before = structuredClone(s.heroes[0].stats),
    moves = s.heroes[0].moves;
  drawCard(s, 'event', s.heroes[0]);
  assert.equal(pending(s).kind, 'card');
  assert.deepEqual(s.heroes[0].stats, before);
  assert.equal(s.heroes[0].stopped, false);
  assert.equal(s.heroes[0].moves, moves);
  s = act(s, { type: 'advance' });
  assert.equal(pending(s).kind, 'cardResult');
  assert.equal(
    pending(s).dice.length,
    traitValue({ ...s.heroes[0], stats: before }, 'knowledge'),
  );
  assert.equal(pending(s).threshold, 4);
  s = act(s, { type: 'advance' });
  assert.equal(pending(s), null);
  assert.equal(s.heroes[0].stopped, false);
  assert.equal(s.heroes[0].moves, moves);
  assert(actions(s).move.length);
});
test('items apply distinct passive and consumable effects, including zero movement use', () => {
  let s = start();
  s.decks.item = ['boots'];
  const moves = s.heroes[0].moves;
  drawCard(s, 'item', s.heroes[0]);
  s = resolve(s);
  assert(s.heroes[0].items.includes('boots'));
  assert.equal(s.heroes[0].stopped, false);
  assert.equal(s.heroes[0].moves, moves);
  s = resolve(act(s, { type: 'endRound' }));
  assert.equal(s.heroes[0].moves, traitValue(s.heroes[0], 'speed') + 1);
  s.heroes[0].items.push('medkit');
  s.heroes[0].stats.might = 1;
  s.heroes[0].moves = 0;
  s = resolve(act(s, { type: 'useItem', id: 'medkit', trait: 'might' }));
  assert.equal(s.heroes[0].stats.might, 3);
  assert(!s.heroes[0].items.includes('medkit'));
});
test('omen effect, roll, result and haunt reveal are separate persistent confirmations', () => {
  let s = start('bells', 7);
  s.omens = 8;
  s.decks.omen = ['book'];
  const before = s.heroes[0].stats.knowledge;
  drawCard(s, 'omen', s.heroes[0]);
  assert.equal(pending(s).kind, 'card');
  assert.equal(s.heroes[0].stopped, true);
  assert.equal(s.heroes[0].moves, 0);
  s = act(s, { type: 'advance' });
  assert.equal(s.heroes[0].stats.knowledge, before + 1);
  assert.equal(s.omens, 9);
  assert.equal(pending(s).kind, 'cardResult');
  s = act(s, { type: 'advance' });
  assert.equal(pending(s).kind, 'hauntRoll');
  s = act(s, { type: 'advance' });
  assert.equal(pending(s).kind, 'hauntResult');
  assert.equal(pending(s).dice.length, 9);
  assert(pending(s).triggers);
  assert.equal(s.phase, 'explore');
  s = act(s, { type: 'advance' });
  assert.equal(s.phase, 'haunt');
  assert.equal(pending(s).kind, 'haunt');
  assert.equal(pending(s).targets.length, 3);
  assert.deepEqual(act(s, { type: 'endRound' }), s);
  const restored = JSON.parse(JSON.stringify(s));
  assert(validSave(restored));
  assert.equal(pending(restored).kind, 'haunt');
  assert(s.heroes[2].traitor);
});
test('first omen cannot start a haunt and omens after the haunt do not retrigger', () => {
  let s = start('mirror', 33);
  s.decks.omen = ['bell'];
  drawCard(s, 'omen', s.heroes[0]);
  s = resolve(s);
  assert.equal(s.phase, 'explore');
  triggerHaunt(s);
  s = resolve(s);
  s.decks.omen = ['book'];
  drawCard(s, 'omen', s.heroes[0]);
  s = resolve(s);
  assert.equal(s.phase, 'haunt');
  assert.equal(s.elapsed, 0);
  assert(!s.queue.some((p) => p.kind === 'haunt'));
});
test('damage is allocated by track positions; exploration prevents death and haunt permits it', () => {
  let s = start();
  s.heroes[0].stats.might = 1;
  s.queue = [
    {
      kind: 'damage',
      heroId: 0,
      damageType: 'physical',
      remaining: 2,
      total: 2,
      allocation: [],
    },
  ];
  s = act(s, { type: 'allocate', trait: 'might' });
  assert.equal(s.heroes[0].stats.might, 1);
  assert(!s.heroes[0].dead);
  s = act(s, { type: 'allocate', trait: 'speed' });
  assert.equal(s.heroes[0].stats.speed, 3);
  assert.equal(traitValue(s.heroes[0], 'speed'), 3);
  s.phase = 'haunt';
  s.queue = [
    {
      kind: 'damage',
      heroId: 0,
      damageType: 'physical',
      remaining: 1,
      total: 1,
      allocation: [],
    },
  ];
  s.queue.push({ ...structuredClone(s.queue[0]), remaining: 2, total: 2 });
  s = act(s, { type: 'allocate', trait: 'might' });
  assert(s.heroes[0].dead);
  assert.notEqual(s.active, 0);
  assert(
    !s.queue.some((entry) => entry.kind === 'damage' && entry.heroId === 0),
  );
  assert(s.queue.some((entry) => entry.kind === 'death'));
});
test('unconnected enemies cannot cross walls, and floor links are part of their path', () => {
  let s = start('mirror');
  triggerHaunt(s);
  s = resolve(s);
  s.enemies = [
    {
      id: 'trap',
      name: '被困幽影',
      pos: 'basement',
      hp: 3,
      maxHp: 3,
      might: 2,
      speed: 1,
    },
  ];
  s = act(s, { type: 'endRound' });
  assert.equal(s.enemies[0].pos, 'basement');
  assert(!s.queue.some((p) => p.kind === 'damage'));
  assert.deepEqual(pathTo(s, 'upper', 'entrance'), [
    'upper',
    'stairs',
    'foyer',
    'entrance',
  ]);
});
test('all three scenarios have reachable objectives, terminal defeat, and stable saves', () => {
  for (const id of ['bells', 'mirror', 'flood']) {
    let s = autoPlay(id, 8, 3, true);
    assert.equal(s.targetRooms.length, 3);
    for (const r of s.targetRooms) assert(pathTo(s, 'entrance', r).length);
    const restored = JSON.parse(JSON.stringify(s));
    assert(validSave(restored));
    assert.deepEqual(
      act(s, { type: 'endRound' }),
      act(restored, { type: 'endRound' }),
    );
    s.elapsed = s.limit - 1;
    s.enemies = [];
    s = act(s, { type: 'endRound' });
    assert.equal(s.result.won, false);
    assert.deepEqual(act(s, { type: 'move', pos: 'foyer' }), s);
  }
});
test('random complete games reach terminal states using only legal UI actions', () => {
  for (const count of [3, 6])
    for (const id of ['bells', 'mirror', 'flood']) {
      const results = Array.from({ length: 12 }, (_, i) =>
        autoPlay(id, i + 1, count),
      );
      const wins = results.filter((s) => s.result?.won).length;
      console.log(
        `${id}, ${count} heroes: ${wins}/12 wins, ${results.filter((s) => s.phase === 'over').length}/12 completed`,
      );
      assert(
        results.every((s) => s.phase === 'over'),
        `${id}/${count}: stalled`,
      );
      assert(
        wins >= 6,
        `${id}/${count}: too few winning playthroughs (${wins})`,
      );
    }
});

test('interactive rolls complete full games across three scenarios without changing outcomes', () => {
  for (const id of ['bells', 'mirror', 'flood'])
    for (const count of [3, 6])
      for (let seed = 1; seed <= 6; seed++) {
        const expected = autoPlay(id, seed, count, false, false),
          actual = autoPlay(id, seed, count, false, true);
        assert.equal(actual.phase, 'over', id + ' ' + seed);
        assert.equal(actual.result.won, expected.result.won);
        assert.equal(actual.seed, expected.seed);
      }
});
