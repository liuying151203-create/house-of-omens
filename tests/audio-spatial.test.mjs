import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialLayers, footMaterial } from '../lib/audio-spatial.mjs';
import { AudioEvents } from '../lib/audio-events.mjs';
import { AudioPlayer } from '../lib/audio-player.mjs';
import { act, createGame, drawCard } from '../lib/game-engine.mjs';
const start = () => act(createGame('mirror', 83, 3), { type: 'advance' });
const ids = (cues) => cues.map((c) => c.id);
test('spatial beds follow actual actor position and move frames, never map tab or hidden positions', () => {
  const g = start();
  assert(ids(spatialLayers(g)).includes('floorGround'));
  g.viewFloor = -1;
  assert(ids(spatialLayers(g)).includes('floorGround'));
  g.heroes[0].pos = 'basement';
  assert(ids(spatialLayers(g)).includes('floorBasement'));
  assert(
    ids(spatialLayers(g, { heroId: 0, pos: 'upper' })).includes('floorUpper'),
  );
  delete g.heroes[0].pos;
  assert.deepEqual(ids(spatialLayers(g)), ['manor']);
  assert.equal(footMaterial({ id: 'well', floor: -1 }), 'wet');
  assert.equal(footMaterial({ id: 'crypt', floor: -1 }), 'stone');
});
test('special room and active steam are local; bloodmoon gains progress without replacing its stem', () => {
  const g = start();
  g.rooms.push({
    id: 'bloodmoon-boiler',
    floor: -1,
    special: 'bloodmoon-boiler',
  });
  g.heroes[0].pos = 'bloodmoon-boiler';
  g.bloodmoon = { steam: [{ active: false, roomIds: ['bloodmoon-boiler'] }] };
  assert.deepEqual(ids(spatialLayers(g)), ['floorBasement', 'roomBoiler']);
  g.bloodmoon.steam[0].active = true;
  assert(ids(spatialLayers(g)).includes('roomSteam'));
  g.heroes[0].pos = 'entrance';
  assert(!ids(spatialLayers(g)).includes('roomSteam'));
  g.phase = 'haunt';
  g.scenario = 'bloodmoon';
  g.bloodmoonCombat = { moon: 'awakening' };
  const first = spatialLayers(g).at(-1);
  g.bloodmoonCombat.moon = 'blood';
  const last = spatialLayers(g).at(-1);
  assert.equal(first.id, last.id);
  assert(first.gain < last.gain);
  assert(!ids(spatialLayers(g, null, true)).includes(first.id));
  g.phase = 'over';
  assert.deepEqual(spatialLayers(g), []);
});
test('story foley plays once on real card reveal and is absent on restore', () => {
  let g = start();
  const a = new AudioEvents();
  a.collect(g);
  g = structuredClone(g);
  g.decks.event = ['whisper'];
  drawCard(g, 'event', g.heroes[0]);
  const cues = a.collect(g);
  assert(ids(cues).includes('cardEvent'));
  const story = cues.find((c) => c.id === 'storyWhisper');
  assert.equal(story.tag, 'story');
  assert.equal(story.delay, 240);
  assert.deepEqual(a.collect(structuredClone(g)), []);
  assert.deepEqual(new AudioEvents().collect(g), []);
});
function context() {
  const gain = () => ({
    value: 0,
    calls: [],
    setTargetAtTime(...v) {
      this.calls.push(v);
    },
    cancelScheduledValues() {},
  });
  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    sources: [],
    createGain() {
      return { gain: gain(), connect() {}, disconnect() {} };
    },
    createBufferSource() {
      const s = {
        connect() {},
        disconnect() {},
        start() {},
        stop() {
          this.stopped = true;
        },
      };
      this.sources.push(s);
      return s;
    },
    async resume() {},
    async close() {},
    async decodeAudioData() {
      return { duration: 1 };
    },
  };
}
test('mix changes preserve existing loop phase, route ambience correctly and cancel stories on mute', async () => {
  const ctx = context(),
    p = new AudioPlayer({
      contextFactory: () => ctx,
      fetcher: async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      }),
    });
  p.configure({ enabled: true });
  await p.unlock();
  const layers = [
    { id: 'floorGround', bus: 'ambience', gain: 0.65 },
    { id: 'themeBloodmoon', bus: 'music', gain: 0.22 },
  ];
  p.setScene('hauntMusic', layers);
  const stem = p.loops.get('themeBloodmoon').source,
    floor = p.loops.get('floorGround').source;
  p.setScene('hauntMusic', [layers[0], { ...layers[1], gain: 0.55 }]);
  assert.equal(p.loops.get('themeBloodmoon').source, stem);
  assert.equal(p.loops.get('themeBloodmoon').level, 0.55);
  p.setScene('hauntMusic', [
    { id: 'floorBasement', bus: 'ambience', gain: 0.65 },
    layers[1],
  ]);
  assert(floor.stopped);
  assert.equal(p.loops.get('themeBloodmoon').source, stem);
  p.play('step', { variation: 'stone' });
  const one = ctx.sources.at(-1).buffer;
  p.play('step', { variation: 'stone' });
  assert.notEqual(ctx.sources.at(-1).buffer, one);
  p.play('storyWhisper', { delay: 240, tag: 'story' });
  p.cancel('story');
  assert.equal(p.timers.size, 0);
  p.play('death');
  assert(ctx.sources.length > 0);
  assert(
    p.buses.ambience.gain.calls.some((c) => c[0] === p.settings.ambience * 0.5),
  );
  p.setHidden(true);
  assert.equal(p.loops.size, 0);
  p.setHidden(false);
  assert(p.loops.has('floorBasement'));
  p.setScene('over', []);
  assert.equal(p.loops.size, 0);
  p.close();
});
