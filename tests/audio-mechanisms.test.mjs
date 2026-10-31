import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEvents } from '../lib/audio-events.mjs';
import { NetworkAudioEvents } from '../lib/audio-mechanisms.mjs';
import {
  act,
  actions,
  createGame,
  recordEvent,
  pending,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { projectGameForPlayer } from '../lib/engine/projection.mjs';
const start = () => act(createGame('mirror', 83, 3), { type: 'advance' });
const ids = (cues) => cues.map((c) => c.id);
test('real silver loading and shooting sound only after legal commands, restore is silent', () => {
  let g = createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-silver-first');
  for (let i = 0; pending(g) && i < 30; i++)
    g = act(g, { type: 'advance', requestId: pending(g).uid });
  const observer = new AudioEvents();
  observer.collect(g);
  g = act(
    g,
    actions(g).abilities.find((a) => a.handler === 'firearm.load').command,
  );
  assert(ids(observer.collect(g)).includes('metal'));
  const command = actions(g).abilities.find(
    (a) => a.handler === 'firearm.shoot',
  ).command;
  assert(!ids(observer.collect(g)).includes('silverShot'));
  g = act(g, command);
  assert(ids(observer.collect(g)).includes('silverShot'));
  assert.deepEqual(observer.collect(act(g, command)), []);
  assert.deepEqual(new AudioEvents().collect(g), []);
});
test('hidden trap placement is silent for opponents; trap snap follows the presentation frame', () => {
  const room = {
    hostId: 'host',
    you: 'guest',
    seats: { 0: 'host', 1: 'guest', 2: 'host' },
    players: [{ id: 'host' }, { id: 'guest' }],
  };
  const g = start();
  g.heroes[0].faction = 'wolves';
  g.heroes[1].faction = 'heroes';
  const guest = new AudioEvents(),
    host = new AudioEvents();
  guest.collect(projectGameForPlayer(g, room, 'guest'));
  host.collect(g);
  const next = structuredClone(g);
  next.rooms[0].traps = [{ id: 'secret', faction: 'wolves', ownerId: 0 }];
  assert.deepEqual(
    guest.collect(projectGameForPlayer(next, room, 'guest')),
    [],
  );
  assert(ids(host.collect(next)).includes('metal'));
  const event = recordEvent(next, 'TrapTriggered', {
    heroId: 1,
    roomId: next.rooms[0].id,
  });
  const options = {
    suspended: true,
    step: { kind: 'trigger', key: `trigger:${event.id}` },
  };
  assert.deepEqual(ids(host.collect(next, options)), ['trapSnap']);
  assert.deepEqual(host.collect(next, options), []);
  assert(!ids(host.collect(next)).includes('trapSnap'));
});
test('crafting waits for the product; steam waits for activation', () => {
  let g = start();
  const a = new AudioEvents();
  a.collect(g);
  g = structuredClone(g);
  recordEvent(g, 'CheckResolved', { success: true });
  assert(!ids(a.collect(g)).includes('craft'));
  g = structuredClone(g);
  g.bloodmoon = {
    crafted: ['might-potion'],
    steam: [{ id: 's1', active: false }],
  };
  assert.deepEqual(ids(a.collect(g)), ['craft', 'metal']);
  g = structuredClone(g);
  g.bloodmoon.steam[0].active = true;
  assert.deepEqual(ids(a.collect(g)), ['steam']);
  assert.deepEqual(a.collect(structuredClone(g)), []);
  g = structuredClone(g);
  g.bloodmoon.steam = [];
  assert.deepEqual(ids(a.collect(g)), ['relief']);
});
test('bloodlust waits for final restoration; infection countdown and expired protection stay silent', () => {
  let g = start();
  const a = new AudioEvents();
  a.collect(g);
  g = structuredClone(g);
  recordEvent(g, 'TraitChanged', {
    heroId: 0,
    steps: 1,
    causeTag: 'bloodlust',
  });
  assert.deepEqual(a.collect(g), []);
  g = structuredClone(g);
  recordEvent(g, 'BloodlustRestored', {
    heroId: 0,
    allocation: { might: 1, speed: 1 },
  });
  assert.deepEqual(ids(a.collect(g)), ['bloodlust']);
  g = structuredClone(g);
  recordEvent(g, 'StatusChanged', {
    heroId: 0,
    statusId: 'infection',
    field: 'turns',
    before: 3,
    after: 2,
  });
  recordEvent(g, 'StatusRemoved', {
    heroId: 1,
    statusId: 'immunity',
    reason: 'expired',
  });
  assert.deepEqual(a.collect(g), []);
  g = structuredClone(g);
  recordEvent(g, 'InfectionGained', { heroId: 0, level: 2 });
  recordEvent(g, 'TraitChanged', { heroId: 0, steps: 2 });
  assert.deepEqual(ids(a.collect(g)), ['infectionDeep']);
  g = structuredClone(g);
  recordEvent(g, 'HeroConverted', { heroId: 0 });
  recordEvent(g, 'StatusRemoved', {
    heroId: 0,
    statusId: 'infection',
    reason: 'factionChange',
  });
  assert.deepEqual(ids(a.collect(g)), ['transform']);
});
test('collapse precedes fall, successful checks never crack, bloodmoon never gets a round deadline cue', () => {
  let g = start();
  const a = new AudioEvents();
  a.collect(g);
  g = structuredClone(g);
  const crack = recordEvent(g, 'CollapseStarted', { roomId: 'entrance' });
  assert.deepEqual(ids(a.collect(g, { suspended: true })), ['collapse']);
  assert.deepEqual(a.collect(g, { suspended: true }), []);
  const move = recordEvent(g, 'EntityMoved', { moveKind: 'fall' });
  assert.deepEqual(
    ids(
      a.collect(g, {
        suspended: true,
        step: {
          kind: 'move',
          key: `move:${move.id}:0`,
          from: 'entrance',
          pos: 'basement',
        },
      }),
    ),
    ['fall'],
  );
  assert(!ids(a.collect(g)).includes('collapse'));
  assert(crack.id < move.id);
  g = structuredClone(g);
  g.phase = 'haunt';
  g.scenario = 'bloodmoon';
  g.limit = 10;
  g.elapsed = 6;
  a.collect(g);
  g = structuredClone(g);
  g.elapsed = 7;
  assert(!ids(a.collect(g)).includes('threat'));
});
test('network snapshots dedupe joins, disconnection retries, reconnect and errors', () => {
  const a = new NetworkAudioEvents();
  let n = {
    session: { code: 'abc' },
    connectionState: 'connected',
    room: { players: [{ id: 'a' }] },
  };
  assert.deepEqual(a.collect(n), []);
  n = structuredClone(n);
  n.room.players.push({ id: 'b' });
  assert.deepEqual(a.collect(n), ['networkJoin']);
  assert.deepEqual(a.collect(n), []);
  n = { ...n, connectionState: 'reconnecting' };
  assert.deepEqual(a.collect(n), ['networkLost']);
  assert.deepEqual(a.collect({ ...n }), []);
  n = { ...n, connectionState: 'connected' };
  assert.deepEqual(a.collect(n), ['networkBack']);
  n = { ...n, error: 'denied' };
  assert.deepEqual(a.collect(n), ['error']);
  assert.deepEqual(a.collect(n), []);
});
