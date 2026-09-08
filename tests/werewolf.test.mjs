import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createInteractiveGame,
  act,
  triggerHaunt,
  actions,
  pathTo,
  living,
  pending,
  validSave,
  drawCard,
  ROOM_DECK,
  frontiers,
  placementOptions,
} from '../lib/game-engine.mjs';
import {
  infect,
  statusOf,
  wolfStats,
  moonlit,
  wolfMight,
  chooseHaunt,
} from '../lib/werewolf.mjs';
import { suggestDamage } from '../lib/damage-plan.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

test('alpha moon regeneration, thick hide and large-party attacks follow the declared limits', () => {
  let s = start(5);
  const room = s.rooms.find((r) => r.id === 'entrance');
  room.windows = [1];
  s.enemies[0].hp -= 4;
  s.rollMode = 'interactive';
  s = act(s, { type: 'endRound' });
  assert.equal(
    pending(s).rolls.length,
    4,
    'two different heroes each defend once',
  );
  const defenders = pending(s)
    .rolls.filter((_, i) => i % 2 === 1)
    .map((r) => r.heroId);
  assert.equal(new Set(defenders).size, 2);
  pending(s).rolls.forEach((r) => {
    r.dice = Array(r.count).fill(0);
  });
  s = act(s, { type: 'advance' });
  assert.equal(s.enemies[0].hp, s.enemies[0].maxHp - 2);
  s = settle(s);
  const before = s.enemies[0].hp;
  s.rollMode = undefined;
  s._rollReplay = [Array(8).fill(2), [0]];
  s = act(s, { type: 'attack', id: s.enemies[0].id });
  assert.equal(
    s.enemies[0].hp,
    before - 2,
    'moonlit alpha takes at most two damage',
  );
});

function settle(s) {
  for (let i = 0; pending(s) && i < 150; i++) {
    const p = pending(s);
    if (p.kind === 'damage')
      s = act(s, {
        type: 'allocateDamage',
        allocation: suggestDamage(
          s.heroes[p.heroId],
          p.damageType,
          p.remaining,
          s.phase,
        ),
      });
    else if (p.kind === 'placement') s = act(s, { type: 'place' });
    else if (p.kind === 'diceRequest' && p.rolls.some((r) => !r.dice))
      s = act(s, { type: 'rollAll' });
    else s = act(s, { type: 'advance' });
  }
  assert(!pending(s), 'queue must finish');
  return s;
}
const start = (n = 3, seed = 23) => {
  const s = createGame('werewolf', seed, n);
  s.queue = [];
  triggerHaunt(s);
  return settle(s);
};
test('combination uses both omen and discovery room; ordinary games keep the story unknown', () => {
  assert.equal(chooseHaunt('locket', { tags: ['moon'] }), 'werewolf');
  assert.equal(chooseHaunt('locket', { tags: ['memory'] }), 'mirror');
  assert.equal(chooseHaunt('key', { tags: ['ritual'] }), 'flood');
  assert.equal(chooseHaunt('bell', { tags: ['ritual'] }), 'bells');
  let s = createGame('mystery', 23);
  s.queue = [];
  s.decks.omen = ['locket'];
  s.heroes[0].pos = 'upper';
  s.rooms.find((r) => r.id === 'upper').tags = ['moon'];
  drawCard(s, 'omen', s.heroes[0]);
  s = act(s, { type: 'advance' });
  s.heroes[0].pos = 'entrance';
  s.rooms.find((r) => r.id === 'upper').tags = ['memory'];
  assert.equal(s.scenario, 'mystery');
  triggerHaunt(s);
  assert.equal(s.scenario, 'werewolf');
  assert.equal(s.hauntContext.room.id, 'upper');
  assert(validSave(s));
});
test('3–6 players: one alpha, scaled stats, two reachable seals and one exit ritual', () => {
  for (const n of [3, 4, 5, 6]) {
    const s = start(n);
    assert.equal(living(s).length, n - 1);
    assert.equal(s.enemies.length, 1);
    const e = s.enemies[0];
    assert.equal(e.hp, wolfStats(n).hp);
    assert.equal(e.might, wolfStats(n).might);
    assert.equal(s.rooms.filter((r) => r.target === 'moonSeal').length, 2);
    for (const id of s.targetRooms) assert(pathTo(s, 'entrance', id).length);
    assert.equal(s.rooms.find((r) => r.id === 'entrance').target, 'moonRitual');
    assert(!actions(s).interact);
    assert(validSave(JSON.parse(JSON.stringify(s))));
  }
});
test('moonlight respects rotation, floor, outside exposure and persistent boarding', () => {
  let s = start();
  const r = s.rooms.find((r) => r.id === 'entrance');
  r.windows = [1];
  r.rotation = 0;
  assert(moonlit(s, r));
  assert.equal(wolfMight(s, s.enemies[0]), 6);
  s = act(s, { type: 'boardWindow' });
  assert(s.rooms.find((r) => r.id === 'entrance').states.boarded);
  assert(
    !moonlit(
      s,
      s.rooms.find((r) => r.id === 'entrance'),
    ),
  );
  assert.equal(wolfMight(s, s.enemies[0]), 5);
  const t = s.rooms.find((r) => r.id === 'upper');
  t.windows = [0];
  t.rotation = 1;
  s.rooms.push({ id: 'obstruction', floor: 1, x: 1, y: 0, doors: [] });
  assert(!moonlit(s, t));
  const basement = s.rooms.find((r) => r.id === 'basement');
  basement.windows = [0];
  assert(!moonlit(s, basement));
});
test('infection grants three full action rounds, never refreshes and converts without an immediate attack', () => {
  let s = start();
  s.enemies[0].pos = 'basement';
  const h = s.heroes[0];
  assert(infect(s, h));
  assert(!infect(s, h));
  for (const turns of [2, 1]) {
    s = settle(act(s, { type: 'endRound' }));
    assert.equal(statusOf(s.heroes[0], 'infection').turns, turns);
    assert(!s.heroes[0].traitor);
  }
  const before = structuredClone(s.heroes[1].stats);
  s = settle(act(s, { type: 'endRound' }));
  assert(s.heroes[0].traitor);
  assert.equal(s.heroes[0].faction, 'wolves');
  assert.equal(s.enemies.length, 2);
  assert.deepEqual(s.heroes[1].stats, before);
  assert.equal(s.enemies.find((e) => e.heroId === 0).hp, 3);
  assert(!actions(s).attack.includes('wolf-0') || s.active !== 0);
});
test('silver locket cure is atomic across interactive dice and grants exactly two protected enemy phases', () => {
  let s = start();
  s.rollMode = 'interactive';
  infect(s, s.heroes[0]);
  s.heroes[0].omens.push('locket');
  s = act(s, { type: 'cure', heroId: 0 });
  assert.equal(pending(s).kind, 'diceRequest');
  assert(statusOf(s.heroes[0], 'infection'));
  assert.equal(pending(s).rolls[0].bonus, 2);
  const saved = JSON.parse(JSON.stringify(s));
  assert(validSave(saved));
  s = settle(saved);
  assert(!statusOf(s.heroes[0], 'infection'));
  assert(statusOf(s.heroes[0], 'immunity'));
  assert(!infect(s, s.heroes[0]));
  s.elapsed = 1;
  assert(!infect(s, s.heroes[0]));
  s.elapsed = 2;
  assert(!infect(s, s.heroes[0]));
  s.elapsed = 3;
  assert(infect(s, s.heroes[0]));
});
test('failed treatment accumulates assistance, cannot treat distant people or spend two interactions', () => {
  let s = start();
  infect(s, s.heroes[0]);
  s._rollReplay = [[0, 0, 0]];
  s = act(s, { type: 'cure', heroId: 0 });
  assert.equal(statusOf(s.heroes[0], 'infection').attempts, 1);
  delete s._rollReplay;
  s = settle(s);
  assert.deepEqual(act(s, { type: 'cure', heroId: 0 }), s);
  s.heroes[0].interacted = false;
  s.heroes[1].pos = 'upper';
  infect(s, s.heroes[1]);
  assert.deepEqual(act(s, { type: 'cure', heroId: 1 }), s);
});
test('bite infection only commits after both combat dice groups; replay survives restore', () => {
  let s = start();
  s.rollMode = 'interactive';
  s = act(s, { type: 'endRound' });
  assert.equal(pending(s).kind, 'diceRequest');
  assert(!statusOf(s.heroes[0], 'infection'));
  pending(s).rolls[0].dice = Array(pending(s).rolls[0].count).fill(2);
  pending(s).rolls[1].dice = Array(pending(s).rolls[1].count).fill(0);
  const restored = JSON.parse(JSON.stringify(s));
  const result = act(restored, { type: 'advance' });
  assert(statusOf(result.heroes[0], 'infection'));
  assert.deepEqual(result, act(s, { type: 'advance' }));
});
test('all wolves defeated wins; killing alpha alone does not; last good conversion loses', () => {
  let s = start();
  s.enemies.push({
    ...s.enemies[0],
    id: 'extra',
    kind: 'wolf',
    heroId: undefined,
    hp: 3,
  });
  s.enemies[0].hp = 1;
  s._rollReplay = [Array(8).fill(2), [0]];
  s = act(s, { type: 'attack', id: s.enemies[0].id });
  delete s._rollReplay;
  assert.equal(s.phase, 'haunt');
  assert.equal(s.enemies.length, 1);
  s = settle(s);
  s.heroes[0].attacked = false;
  s._rollReplay = [Array(8).fill(2), [0]];
  s = act(s, { type: 'attack', id: 'extra' });
  assert.equal(s.result.winnerFaction, 'heroes');
  s = start();
  s.enemies[0].pos = 'basement';
  for (const h of living(s)) {
    infect(s, h);
    statusOf(h, 'infection').turns = 1;
  }
  s = act(s, { type: 'endRound' });
  assert.equal(s.result.winnerFaction, 'wolves');
  assert.equal(s.phase, 'over');
});
test('ritual is locked until both seals; completion cures living converts but never resurrects corpses', () => {
  let s = start(4);
  assert(!actions(s).interact);
  s.progress = 2;
  s.heroes[1].dead = true;
  infect(s, s.heroes[0]);
  s = act(s, { type: 'interact' });
  assert.equal(s.result.winnerFaction, 'heroes');
  assert(s.heroes[1].dead);
  assert(
    s.heroes
      .filter((h) => !h.dead)
      .every((h) => h.faction === 'heroes' && !h.traitor),
  );
  assert(s.heroes.every((h) => !h.statuses.length));
  s = start();
  s.elapsed = s.limit - 1;
  s.enemies[0].pos = 'basement';
  s = act(s, { type: 'endRound' });
  assert.equal(s.result.winnerFaction, 'wolves');
});
test('LAN accepts new game modes, owns wolf orders and opposed dice by the converted seat', () => {
  const service = createRoomService({
    gameFactory: () => {
      const s = start();
      s.rollMode = 'interactive';
      return s;
    },
  });
  const host = service.create({ scenario: 'mystery', count: 3 });
  const guest = service.join({ code: host.code });
  let r = service.read(host.code, host.key);
  r = service.update(host.code, guest.key, {
    type: 'seat',
    seat: 2,
    revision: r.revision,
  });
  r = service.update(host.code, host.key, {
    type: 'start',
    revision: r.revision,
  });
  assert.throws(
    () =>
      service.update(host.code, host.key, {
        type: 'action',
        revision: r.revision,
        action: { type: 'wolfOrder', heroId: 2, targetId: 0 },
      }),
    /等待/,
  );
  r = service.update(host.code, guest.key, {
    type: 'action',
    revision: r.revision,
    action: { type: 'wolfOrder', heroId: 2, targetId: 0 },
  });
  assert.equal(r.game.enemies[0].huntTarget, 0);
  r = service.update(host.code, host.key, {
    type: 'action',
    revision: r.revision,
    action: { type: 'attack', id: 'wolf-2' },
  });
  assert.equal(pending(r.game).rolls[1].heroId, 2);
  assert.throws(
    () =>
      service.update(host.code, host.key, {
        type: 'action',
        revision: r.revision,
        action: { type: 'rollDice', sideId: 'side-1' },
      }),
    /只能投掷/,
  );
});

function play(seed, count, interactive = false) {
  let s = interactive
    ? createInteractiveGame('werewolf', seed, count)
    : createGame('werewolf', seed, count);
  for (let step = 0; step < 1600 && s.phase !== 'over'; step++) {
    if (pending(s)) {
      s = settle(s);
      continue;
    }
    const h = s.heroes[s.active],
      legal = actions(s);
    if (h.ended || h.dead || h.traitor) {
      const next = living(s).find((x) => !x.ended);
      s = act(s, next ? { type: 'select', id: next.id } : { type: 'endRound' });
      continue;
    }
    if (s.phase === 'haunt') {
      const patient = living(s).find(
        (x) => x.pos === h.pos && statusOf(x, 'infection'),
      );
      if (patient && !h.interacted) {
        s = act(s, { type: 'cure', heroId: patient.id });
        continue;
      }
      if (legal.interact) {
        s = act(s, { type: 'interact' });
        continue;
      }
      if (legal.attack.length) {
        s = act(s, { type: 'attack', id: legal.attack[0] });
        continue;
      }
      const goals =
        s.progress >= 2
          ? ['entrance']
          : s.targetRooms.filter((id) => {
              const r = s.rooms.find((r) => r.id === id);
              return r.target === 'moonSeal' && !r.done;
            });
      const paths = goals
        .map((id) => pathTo(s, h.pos, id))
        .filter((p) => p.length > 1)
        .sort((a, b) => a.length - b.length);
      if (paths[0] && [...legal.move, ...legal.stairs].includes(paths[0][1])) {
        s = act(s, { type: 'move', pos: paths[0][1] });
        continue;
      }
    } else {
      const options = frontiers(s, 0)
        .concat(frontiers(s, 1), frontiers(s, -1))
        .filter(
          (f) =>
            pathTo(s, h.pos, f.from).length &&
            s.decks.rooms.some(
              (id) =>
                placementOptions(
                  s,
                  f.from,
                  f.dir,
                  ROOM_DECK.find((r) => r.id === id),
                ).length,
            ),
        );
      options.sort(
        (a, b) =>
          pathTo(s, h.pos, a.from).length - pathTo(s, h.pos, b.from).length,
      );
      const f = options[0];
      if (
        f &&
        legal.explore.some((x) => x.from === f.from && x.dir === f.dir)
      ) {
        s = act(s, { type: 'explore', dir: f.dir });
        continue;
      }
      const path = f && pathTo(s, h.pos, f.from);
      if (
        path?.length > 1 &&
        [...legal.move, ...legal.stairs].includes(path[1])
      ) {
        s = act(s, { type: 'move', pos: path[1] });
        continue;
      }
    }
    if (legal.rest) {
      const trait = ['might', 'speed', 'knowledge', 'sanity'].find(
        (k) => h.stats[k] < h.start[k],
      );
      s = act(s, { type: 'rest', trait });
      continue;
    }
    s = act(s, { type: 'endHero' });
  }
  assert.equal(
    s.phase,
    'over',
    JSON.stringify({
      seed,
      count,
      active: s.active,
      hero: s.heroes[s.active],
      elapsed: s.elapsed,
      progress: s.progress,
    }),
  );
  assert(validSave(s));
  return s;
}
test('seeded full games finish for 3–6 players; interactive and direct rules have identical outcomes', () => {
  for (const n of [3, 4, 5, 6]) {
    let wins = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const a = play(seed, n);
      wins += Number(a.result.won);
      if (seed <= 4) {
        const b = play(seed, n, true);
        assert.deepEqual(b.result, a.result);
        assert.deepEqual(b.heroes, a.heroes);
        assert.deepEqual(b.enemies, a.enemies);
      }
    }
    console.log(
      'Werewolf ' +
        n +
        ' players: ' +
        wins +
        '/16 hero wins (fixed simple bot, not a human balance estimate)',
    );
  }
});
