import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { AudioEvents, audioScene, endingSound } from '../lib/audio-events.mjs';
import { AudioPlayer } from '../lib/audio-player.mjs';
import {
  AUDIO_ASSETS,
  AUDIO_CUES,
  AUDIO_LOOPS,
  audioSettings,
} from '../lib/audio-assets.mjs';
import {
  act,
  actions,
  createGame,
  drawCard,
  pending,
  recordEvent,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { automaticRequestCommand } from '../lib/automatic-driver.mjs';
import { projectGameForPlayer } from '../lib/engine/projection.mjs';
import { explorationJournal } from '../lib/event-journal.mjs';
import { SPATIAL_LOOPS } from '../lib/audio-spatial.mjs';
const start = () => act(createGame('mirror', 83, 3), { type: 'advance' });
const ids = (cues) => cues.map((c) => c.id);
const clone = structuredClone;

test('all 86 cues and 18 loops are actual audible WAVs with bounded size and peaks', async () => {
  assert.equal(AUDIO_CUES.length, 86);
  assert.equal(AUDIO_LOOPS.length, 18);
  let size = 0;
  for (const [id, url] of Object.entries(AUDIO_ASSETS)) {
    const b = await fs.readFile(new URL('../public' + url, import.meta.url));
    size += b.length;
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.toString('ascii', 8, 12), 'WAVE');
    let peak = 0,
      power = 0;
    for (let i = 44; i < b.length; i += 2) {
      const v = b.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(v));
      power += v * v;
    }
    assert(peak > 0.1 && peak < 0.4, id);
    assert(power / ((b.length - 44) / 2) > 0.00001, id);
    if (AUDIO_LOOPS.includes(id)) {
      assert.equal(
        (b.length - 44) / 48000,
        SPATIAL_LOOPS.includes(id) ? 12 : 24,
      );
      assert(
        Math.abs(b.readInt16LE(44) - b.readInt16LE(b.length - 2)) < 500,
        `${id} loop seam`,
      );
    }
  }
  assert(size < 18 * 1024 * 1024);
});

test('real exploration separates board placement, movement frames and card reveal without replay', () => {
  let g = start();
  const audio = new AudioEvents();
  audio.collect(g);
  g = act(g, { type: 'move', pos: 'foyer' });
  const e = g.events.findLast((v) => v.type === 'EntityMoved');
  const step = {
    kind: 'move',
    key: `move:${e.id}:0`,
    from: e.fromRoomId,
    pos: e.toRoomId,
  };
  assert.deepEqual(ids(audio.collect(g, { step, suspended: true })), ['step']);
  assert.deepEqual(audio.collect(g, { step, suspended: true }), []);
  audio.collect(g);
  g.decks.rooms = ['dining'];
  g = act(g, { type: 'explore', ...actions(g).explore[0] });
  assert(ids(audio.collect(g)).includes('explore'));
  g = act(g, { type: 'place' });
  assert(ids(audio.collect(g, { suspended: true })).includes('tilePlace'));
  const reveal = ids(audio.collect(g));
  assert(reveal.includes('cardItem'));
  assert.deepEqual(audio.collect(clone(g)), []);
  assert.deepEqual(new AudioEvents().collect(g), []);
  assert.deepEqual(audio.collect(g, { epoch: 1 }), []);
});

test('all card types and rolled groups sound only when newly presented', () => {
  for (const [type, card, sound] of [
    ['item', 'medkit', 'cardItem'],
    ['event', 'whisper', 'cardEvent'],
    ['omen', 'bell', 'cardOmen'],
  ]) {
    const audio = new AudioEvents();
    let g = start();
    audio.collect(g);
    g = clone(g);
    g.decks[type] = [card];
    drawCard(g, type, g.heroes[0]);
    assert(ids(audio.collect(g)).includes(sound));
  }
  const audio = new AudioEvents();
  let g = start();
  audio.collect(g);
  g = clone(g);
  g.decks.event = ['whisper'];
  drawCard(g, 'event', g.heroes[0]);
  audio.collect(g);
  g = act(g, { type: 'continueCard', requestId: pending(g).uid });
  const cues = audio.collect(g);
  assert(ids(cues).includes('diceRoll'));
  assert.equal(cues.find((c) => c.id === 'diceStop').delay, 750);
  assert.deepEqual(audio.collect(clone(g)), []);
  const resumed = new AudioEvents();
  assert.deepEqual(resumed.collect(g), []);
  assert.deepEqual(resumed.collect(clone(g)), []);
});

test('event check failures have a final result even when they open damage allocation', () => {
  for (const faces of [
    [0, 0, 0, 0],
    [2, 2, 2, 2],
  ]) {
    let g = start();
    g.decks.event = ['whisper'];
    drawCard(g, 'event', g.heroes[0]);
    const audio = new AudioEvents();
    audio.collect(g);
    g = act(g, { type: 'continueCard', requestId: pending(g).uid });
    audio.collect(g);
    g.queue[0].rolls[0].dice = faces;
    g = act(g, { type: 'resolveDice', requestId: pending(g).uid });
    const sounds = ids(audio.collect(g));
    const expected = faces[0] ? 'checkSuccess' : 'checkFailure';
    assert.equal(sounds.filter((s) => s === expected).length, 1);
    const result = g.events.findLast((e) => e.type === 'CheckResolved');
    assert.equal(result.sourceCardId, 'whisper');
    const journal = explorationJournal(g);
    assert.equal(
      journal.entries.filter((e) => e.type === 'CheckResolved').length,
      1,
    );
    assert(!journal.extraLogs.some((e) => e.text === result.text));
    if (faces[0]) {
      const duplicate = g.events.findLast(
        (e) => e.type === 'Broadcast' && e.kind === 'cardResult',
      );
      assert(duplicate);
      assert(!journal.entries.some((e) => e.id === `event-${duplicate.id}`));
    }
    assert(
      !sounds.includes('hit') && !sounds.includes('mentalHit'),
      'allocation is not damage',
    );
  }
});

test('damage and attribute records coalesce; internal/private history stays silent', () => {
  const audio = new AudioEvents();
  const g = start();
  audio.collect(g);
  const next = clone(g);
  recordEvent(next, 'TraitChanged', { heroId: 0, steps: -1, causeId: 'hurt' });
  recordEvent(next, 'TraitChanged', { heroId: 0, steps: -2, causeId: 'hurt' });
  recordEvent(next, 'DamageApplied', {
    heroId: 0,
    actualAmount: 3,
    damageType: 'physical',
    causeId: 'hurt',
  });
  recordEvent(next, 'TraitChanged', { heroId: 1, steps: 1 }, 'internal');
  assert.deepEqual(ids(audio.collect(next)), ['hit']);
  const recovered = clone(next);
  recordEvent(recovered, 'TraitChanged', { heroId: 0, steps: 1 });
  recordEvent(recovered, 'HeroRested', { heroId: 0 });
  assert.deepEqual(ids(audio.collect(recovered)), ['heal']);
  const room = {
    hostId: 'host',
    seats: { 0: 'host', 1: 'guest', 2: 'host' },
    players: [{ id: 'host' }, { id: 'guest' }],
    you: 'guest',
  };
  const observer = new AudioEvents();
  observer.collect(projectGameForPlayer(g, room, 'guest'));
  const secret = clone(g);
  recordEvent(
    secret,
    'TraitChanged',
    { heroId: 0, steps: -1 },
    { heroIds: [0] },
  );
  assert.deepEqual(
    observer.collect(projectGameForPlayer(secret, room, 'guest')),
    [],
  );
});

test('haunt music changes with phase; major ending wins over injury and uses local faction', () => {
  assert.equal(audioScene(null), 'lobby');
  assert.equal(audioScene(start()), 'exploreMusic');
  const g = start(),
    audio = new AudioEvents();
  audio.collect(g);
  const haunt = clone(g);
  haunt.phase = 'haunt';
  haunt.queue = [{ kind: 'haunt', uid: 999 }];
  assert.deepEqual(ids(audio.collect(haunt)), ['haunt', 'glass']);
  assert.equal(audioScene(haunt), 'hauntMusic');
  const end = clone(haunt);
  end.phase = 'over';
  end.result = { won: false, winnerFaction: 'wolves' };
  end.heroes[0].faction = 'wolves';
  recordEvent(end, 'DamageApplied', {
    heroId: 0,
    actualAmount: 2,
    damageType: 'physical',
  });
  const room = { hostId: 'other', you: 'wolf', seats: { 0: 'wolf' } };
  assert.deepEqual(ids(audio.collect(end, { room })), ['victory']);
  assert.equal(endingSound(end), 'defeat');
  assert.equal(audioScene(end), 'over');
  assert.deepEqual(audio.collect(clone(end), { room }), []);
});

test('goal progress, completion, death and enemy HP changes are detected independently', () => {
  let g = start();
  g.enemies = [{ id: 'ghost', hp: 5 }];
  const audio = new AudioEvents();
  audio.collect(g);
  g = clone(g);
  g.progress++;
  assert.deepEqual(ids(audio.collect(g)), ['objective']);
  g = clone(g);
  g.powered = true;
  assert.deepEqual(ids(audio.collect(g)), ['generator']);
  g = clone(g);
  g.enemies[0].hp--;
  assert.deepEqual(ids(audio.collect(g)), ['hit']);
  g = clone(g);
  g.enemies = [];
  assert.deepEqual(ids(audio.collect(g)), ['enemyDeath']);
  g = clone(g);
  g.heroes[1].dead = true;
  assert.deepEqual(ids(audio.collect(g)), ['death']);
});

test('all five scenario test starts can be observed through every queued presentation', () => {
  for (const scenario of [
    'bells',
    'mirror',
    'flood',
    'werewolf',
    'bloodmoon',
  ]) {
    let g = createHauntPlaytest(scenario, 31, 3);
    const observer = new AudioEvents();
    observer.collect(g);
    for (let i = 0; pending(g) && i < 50; i++) {
      g = act(g, automaticRequestCommand(g));
      for (const cue of observer.collect(g)) assert(AUDIO_ASSETS[cue.id]);
    }
    assert.equal(g.phase, 'haunt');
  }
});

function fakeContext() {
  const param = () => ({
    value: 0,
    calls: [],
    setTargetAtTime(...a) {
      this.calls.push(a);
    },
    cancelScheduledValues() {},
  });
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    sources: [],
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createBufferSource() {
      const s = {
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      this.sources.push(s);
      return s;
    },
    async resume() {
      this.state = 'running';
    },
    async close() {
      this.state = 'closed';
    },
    async decodeAudioData() {
      return { duration: 0.7 };
    },
  };
  return ctx;
}
test('player unlock, loop crossfades, mute, delayed-cue cancellation and offline decoding', async () => {
  const ctx = fakeContext();
  let fetches = 0;
  const player = new AudioPlayer({
    contextFactory: () => ctx,
    fetcher: async () => {
      fetches++;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    },
  });
  player.configure({ enabled: true });
  player.play('hit');
  assert.equal(ctx.sources.length, 0);
  await player.unlock();
  assert.equal(fetches, 104);
  assert(player.loops.has('lobby'));
  player.setScene('exploreMusic');
  assert(player.loops.has('exploreMusic'));
  assert(!player.loops.has('lobby'));
  player.play('diceStop', { delay: 750, tag: 'dice' });
  player.cancel('dice');
  assert.equal(player.timers.size, 0);
  player.play('hit');
  assert.equal(player.voices.size, 1);
  player.configure({ enabled: false });
  assert.equal(player.voices.size, 0);
  assert.equal(player.loops.size, 0);
  player.configure({ enabled: true });
  player.setHidden(true);
  assert.equal(player.loops.size, 0);
  player.setHidden(false);
  assert(player.loops.has('manor'));
  player.close();
  globalThis.__HOUSE_AUDIO_ASSETS__ = { hit: 'data:audio/wav;base64,AAAA' };
  try {
    const offline = new AudioPlayer({
      contextFactory: fakeContext,
      assets: { hit: '/never-fetch.wav' },
      fetcher: () => {
        throw Error('offline fetch');
      },
    });
    await offline.unlock();
    assert(offline.buffers.has('hit'));
    offline.close();
  } finally {
    delete globalThis.__HOUSE_AUDIO_ASSETS__;
  }
  assert.deepEqual(
    audioSettings({ master: 9, effects: NaN, music: -1, enabled: 'yes' }),
    { enabled: false, master: 1, music: 0, ambience: 0.25, effects: 0.75 },
  );
});
