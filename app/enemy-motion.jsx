'use client';
import EnemyGlyph from './enemy-glyph';
import { useEffect, useMemo, useState } from 'react';
import { locationLabel } from '../lib/game-view.mjs';

export function useEnemyMotion(game, epoch) {
  const pending = game?.queue[0];
  const signature = JSON.stringify(pending?.enemyMovements || []);
  const routes = useMemo(() => JSON.parse(signature), [signature]);
  const frames = useMemo(
    () =>
      routes.flatMap((route) =>
        route.path.map((pos, index) => ({
          ...route,
          pos,
          from: route.path[Math.max(0, index - 1)],
          arriving: index === route.path.length - 1,
        })),
      ),
    [routes],
  );
  const key = `${epoch}:${game?.scenario}:${pending?.uid}:${signature}`;
  const [playback, setPlayback] = useState({ key: null, index: 0 });
  const index = playback.key === key ? playback.index : 0;
  useEffect(() => {
    if (!frames.length) return;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setPlayback({ key, index: step });
      if (step >= frames.length) clearInterval(timer);
    }, 850);
    return () => clearInterval(timer);
  }, [key, frames.length]);
  const moving = index < frames.length;
  const frame = frames[Math.min(index, frames.length - 1)];
  let shown = game;
  if (frame && game) {
    const positions = new Map(routes.map((r) => [r.enemyId, r.path[0]]));
    for (const step of frames.slice(0, index + 1))
      positions.set(step.enemyId, step.pos);
    shown = {
      ...game,
      viewFloor: moving
        ? game.rooms.find((r) => r.id === frame.pos).floor
        : game.viewFloor,
      enemies: game.enemies.map((e) => ({
        ...e,
        pos: positions.get(e.id) ?? e.pos,
      })),
      heroes: game.heroes.map((h) => {
        const route = routes.find((r) => r.heroId === h.id);
        return route ? { ...h, pos: positions.get(route.enemyId) } : h;
      }),
    };
  }
  return {
    game: shown,
    moving,
    frame: moving ? frame : null,
    stepKey: `${key}:${index}`,
    skip: () => setPlayback({ key, index: frames.length }),
  };
}

export default function EnemyMotion({ game, playback }) {
  const step = playback.frame;
  if (!step) return null;
  return (
    <section
      className="enemy-motion-banner"
      aria-live="polite"
      aria-label="敌人移动过程"
    >
      <span className="enemy-motion-symbol">{<EnemyGlyph enemy={step} />}</span>
      <div>
        <small>全队行动结束 · 敌人回合</small>
        <strong>
          {step.name} · {locationLabel(game, step.pos)}
        </strong>
        <span>
          {step.arriving
            ? step.attacks
              ? `已与${step.targetName}同室，即将进行攻击检定`
              : '本轮追猎到此，尚未与目标同室'
            : '沿相通的门追猎，抵达同室后才能攻击'}
        </span>
      </div>
      <button className="text-button" onClick={playback.skip}>
        跳过移动动画
      </button>
    </section>
  );
}
