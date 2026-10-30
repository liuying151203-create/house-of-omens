'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AudioPlayer } from '../lib/audio-player.mjs';
import { AudioEvents, audioScene } from '../lib/audio-events.mjs';
import { AUDIO_DEFAULTS, audioSettings } from '../lib/audio-assets.mjs';

const STORAGE_KEY = 'house-audio-v1';
export function useGameAudio(game, { epoch, map, enemy, motion, net }) {
  const [settings, setSettings] = useState({ ...AUDIO_DEFAULTS });
  const [status, setStatus] = useState('');
  const [player] = useState(() => new AudioPlayer());
  const observer = useRef(new AudioEvents());
  const current = useRef({ game, epoch: '', settings });
  const mounted = useRef(false),
    unlocking = useRef(null);
  const playback = useRef({ request: null, motion, moving: false });
  const timeline = `${epoch}:${net.session?.code || 'solo'}:${net.connectionState || 'idle'}`;

  const unlock = useCallback(() => {
    if (unlocking.current) return unlocking.current;
    setStatus('正在加载声音…');
    unlocking.current = player
      .unlock()
      .then(() => {
        if (mounted.current) setStatus('');
      })
      .catch(() => {
        if (mounted.current) setStatus('声音未能加载，请关闭后重新开启');
      })
      .finally(() => {
        unlocking.current = null;
      });
    return unlocking.current;
  }, [player]);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => {
      try {
        setSettings(
          audioSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}),
        );
      } catch {
        /* defaults */
      }
    }, 0);
    const gesture = () => {
      if (current.current.settings.enabled && player.ctx?.state !== 'running')
        void unlock();
    };
    const visibility = () => {
      player.setHidden(document.hidden);
      observer.current.reset(current.current.game, current.current.epoch);
    };
    player.setHidden(document.hidden);
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      document.removeEventListener('visibilitychange', visibility);
      player.close();
    };
  }, [player, unlock]);
  useEffect(() => {
    current.current = { game, epoch: timeline, settings };
    if (JSON.stringify(player.settings) !== JSON.stringify(settings))
      player.configure(settings);
    const request = game?.queue?.[0];
    const moving = !!(map.busy || enemy.moving);
    const before = playback.current;
    if (before.request !== request?.uid || before.motion !== motion)
      player.cancel('dice');
    if (before.moving && !moving) player.cancel('move');
    if (
      observer.current.epoch !== timeline ||
      !game ||
      !observer.current.previous ||
      (game.eventSerial || 0) < observer.current.cursor
    )
      player.stopEffects();
    const disconnected = !!net.session && net.connectionState !== 'connected';
    if (disconnected) observer.current.reset(game, timeline);
    const cues = observer.current.collect(game, {
      epoch: timeline,
      suspended: moving,
      step: map.step,
      enemy: enemy.frame,
      enemyKey: enemy.stepKey,
      motion,
      room: net.room,
    });
    if (
      before.motion &&
      !motion &&
      before.request === request?.uid &&
      player.ctx &&
      request?.rolls?.some((r) => r.dice)
    )
      player.play('diceStop');
    playback.current = { request: request?.uid, motion, moving };
    // Keep exploration music until the haunt notice is actually presented.
    const hauntWaiting =
      game?.phase === 'haunt' &&
      game.queue?.some((p) => p.kind === 'haunt') &&
      (moving || request?.kind !== 'haunt');
    player.setScene(hauntWaiting ? 'exploreMusic' : audioScene(game));
    const major = cues.find((c) =>
      ['victory', 'defeat', 'haunt'].includes(c.id),
    );
    if (major) {
      player.stopEffects();
      player.play(major.id);
    } else {
      let offset = 0;
      for (const cue of cues) {
        const timed = cue.tag === 'dice' || cue.tag === 'move';
        player.play(cue.id, { ...cue, delay: timed ? cue.delay : offset });
        if (!timed) offset += 120;
      }
    }
  }, [
    game,
    timeline,
    settings,
    player,
    map,
    enemy,
    motion,
    net.room,
    net.session,
    net.connectionState,
  ]);
  function update(patch) {
    setSettings((previous) => {
      const next = audioSettings({ ...previous, ...patch });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  function toggle() {
    const enabled = !settings.enabled;
    update({ enabled });
    if (enabled) void unlock();
  }
  return {
    settings,
    status,
    update,
    toggle,
    preview: () => player.play('checkSuccess'),
  };
}

export default function AudioControls({ controller }) {
  const { settings, update, toggle, status, preview } = controller;
  return (
    <div className="audio-controls">
      <button
        className="icon-button"
        onClick={toggle}
        aria-pressed={settings.enabled}
        aria-label={settings.enabled ? '关闭声音' : '开启声音'}
        title={settings.enabled ? '声音：开' : '声音：关'}
      >
        {settings.enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
      </button>
      <details className="audio-settings">
        <summary>音量</summary>
        <div className="audio-settings-panel">
          <strong>声音设置</strong>
          {Object.entries({
            master: '总音量',
            music: '背景音乐',
            ambience: '宅邸环境',
            effects: '行动音效',
          }).map(([key, label]) => (
            <label key={key}>
              <span>
                {label}
                <output>{Math.round(settings[key] * 100)}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label={label}
                value={Math.round(settings[key] * 100)}
                onChange={(e) =>
                  update({ [key]: Number(e.target.value) / 100 })
                }
              />
            </label>
          ))}
          <button
            className="secondary-button"
            disabled={!settings.enabled}
            onClick={preview}
          >
            试听提示音
          </button>
          <output className="audio-status">
            {status ||
              (settings.enabled
                ? '声音会随探索与局势变化'
                : '点击喇叭开启声音')}
          </output>
        </div>
      </details>
    </div>
  );
}
