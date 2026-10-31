import {
  AUDIO_ASSETS,
  AUDIO_LOOPS,
  AUDIO_DEFAULTS,
  audioSettings,
} from './audio-assets.mjs';
import { variantPool } from './audio-spatial.mjs';

export class AudioPlayer {
  constructor({
    contextFactory,
    fetcher = globalThis.fetch,
    assets = AUDIO_ASSETS,
  } = {}) {
    this.contextFactory =
      contextFactory ||
      (() => new (window.AudioContext || window.webkitAudioContext)());
    this.fetcher = fetcher;
    this.assets = assets;
    this.settings = { ...AUDIO_DEFAULTS };
    this.buffers = new Map();
    this.loading = new Map();
    this.voices = new Set();
    this.loops = new Map();
    this.timers = new Map();
    this.scene = 'lobby';
    this.layers = [{ id: 'manor', bus: 'ambience', gain: 1 }];
    this.variantCounts = new Map();
    this.variantSeed = 0x9e3779b9;
    this.hidden = false;
    this.generation = 0;
  }
  async unlock() {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.buses = Object.fromEntries(
        ['music', 'ambience', 'effects'].map((key) => {
          const node = this.ctx.createGain();
          node.connect(this.master);
          return [key, node];
        }),
      );
    }
    const context = this.ctx;
    await context.resume();
    if (context !== this.ctx) return;
    this.applyVolumes();
    await Promise.allSettled(
      Object.keys(this.assets).map((id) => this.load(id)),
    );
    if (context !== this.ctx) return;
    if (this.buffers.size !== Object.keys(this.assets).length)
      throw Error('部分音频素材加载失败，请重试');
    this.syncLoops();
  }
  load(id) {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const generation = this.generation,
      context = this.ctx;
    const job = (async () => {
      const url = globalThis.__HOUSE_AUDIO_ASSETS__?.[id] || this.assets[id];
      let data;
      if (url.startsWith('data:')) {
        const binary = atob(url.slice(url.indexOf(',') + 1));
        data = Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
      } else {
        const response = await this.fetcher(url);
        if (!response.ok) throw Error(`Audio ${id}: ${response.status}`);
        data = await response.arrayBuffer();
      }
      const buffer = await context.decodeAudioData(data);
      if (this.generation === generation) this.buffers.set(id, buffer);
      return buffer;
    })().finally(() => this.loading.delete(id));
    this.loading.set(id, job);
    return job;
  }
  configure(value) {
    this.settings = audioSettings(value);
    this.applyVolumes();
    if (!this.settings.enabled) this.stopEffects();
    this.syncLoops();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(
      this.settings.enabled && !this.hidden ? this.settings.master : 0,
      now,
      0.04,
    );
    for (const key of ['music', 'ambience', 'effects']) {
      this.buses[key].gain.cancelScheduledValues(now);
      this.buses[key].gain.setTargetAtTime(this.settings[key], now, 0.04);
    }
  }
  setScene(scene, layers = this.layers) {
    this.scene = scene;
    this.layers = layers;
    this.syncLoops();
  }
  syncLoops() {
    if (!this.ctx) return;
    const mix =
      this.scene === 'over'
        ? []
        : [{ id: this.scene, bus: 'music', gain: 1 }, ...this.layers];
    const desired =
      this.settings.enabled && !this.hidden
        ? mix.map((layer) => layer.id).filter((id) => AUDIO_LOOPS.includes(id))
        : [];
    for (const [id, voice] of this.loops)
      if (!desired.includes(id)) {
        voice.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
        voice.source.stop(this.ctx.currentTime + 1.5);
        this.loops.delete(id);
      }
    for (const id of desired) {
      const layer = mix.find((l) => l.id === id);
      const existing = this.loops.get(id);
      if (existing) {
        if (existing.level !== layer.gain) {
          existing.gain.gain.setTargetAtTime(
            layer.gain,
            this.ctx.currentTime,
            0.5,
          );
          existing.level = layer.gain;
        }
        continue;
      }
      if (!this.buffers.has(id)) continue;
      const source = this.ctx.createBufferSource(),
        gain = this.ctx.createGain();
      source.buffer = this.buffers.get(id);
      source.loop = true;
      source.connect(gain);
      gain.connect(this.buses[layer.bus]);
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(layer.gain, this.ctx.currentTime, 0.5);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start();
      this.loops.set(id, { source, gain, level: layer.gain });
    }
  }
  play(id, { delay = 0, tag = 'effect', variation } = {}) {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.settings.enabled ||
      this.hidden
    )
      return;
    if (delay) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.play(id, { tag, variation });
      }, delay);
      this.timers.set(timer, tag);
      return;
    }
    const pool = variantPool(id, variation),
      key = `${id}:${variation || ''}`;
    // Private audio PRNG: variety never consumes or changes the game's RNG.
    this.variantSeed ^= this.variantSeed << 13;
    this.variantSeed ^= this.variantSeed >>> 17;
    this.variantSeed ^= this.variantSeed << 5;
    let choice = (this.variantSeed >>> 0) % pool.length;
    if (pool.length > 1 && choice === this.variantCounts.get(key))
      choice = (choice + 1) % pool.length;
    const buffer = this.buffers.get(pool[choice]) || this.buffers.get(id);
    if (!buffer) return; // Never play a stale action when a slow download finishes.
    this.variantCounts.set(key, choice);
    if (this.voices.size >= 6)
      this.stopVoice(this.voices.values().next().value);
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.buses.effects);
    gain.gain.value = id.startsWith('story')
      ? 0.45
      : id === 'uiTick'
        ? 0.25
        : id === 'inventory'
          ? 0.55
          : 1;
    const voice = { source, gain, tag };
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    this.voices.add(voice);
    source.start();
    if (['haunt', 'victory', 'defeat', 'death'].includes(id)) {
      const now = this.ctx.currentTime;
      for (const bus of ['music', 'ambience']) {
        const value = this.settings[bus];
        this.buses[bus].gain.cancelScheduledValues(now);
        this.buses[bus].gain.setTargetAtTime(
          value * (bus === 'music' ? 0.3 : 0.5),
          now,
          0.05,
        );
        this.buses[bus].gain.setTargetAtTime(value, now + buffer.duration, 0.5);
      }
    }
  }
  stopVoice(voice) {
    try {
      voice.source.stop();
    } catch {
      /* already ended */
    }
    this.voices.delete(voice);
  }
  cancel(tag) {
    for (const [timer, group] of this.timers)
      if (!tag || group === tag) {
        clearTimeout(timer);
        this.timers.delete(timer);
      }
    for (const voice of this.voices)
      if (!tag || voice.tag === tag) this.stopVoice(voice);
  }
  stopEffects() {
    this.cancel();
  }
  setHidden(hidden) {
    this.hidden = hidden;
    if (hidden) this.stopEffects();
    this.applyVolumes();
    this.syncLoops();
  }
  close() {
    this.generation++;
    this.stopEffects();
    for (const voice of this.loops.values()) this.stopVoice(voice);
    this.loops.clear();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
