'use client';
import { useEffect, useMemo, useState } from 'react';
import { pendingEnemyMovements } from '../lib/enemy-presentation.mjs';

export function useEnemyMotion(game, epoch) {
  const pending = game?.queue[0];
  const [completed, setCompleted] = useState({ epoch, through: 0 });
  const playedThrough = completed.epoch === epoch ? completed.through : 0;
  const movementEvents = pendingEnemyMovements(game, playedThrough).map(
    (event) => ({
      id: event.id,
      enemyId: event.enemyId || event.entityId,
      name: event.name,
      kind: event.kind,
      heroId: event.heroId,
      path: event.path,
      targetId: event.targetId,
      targetName: event.targetName,
      attacks: event.attacks,
    }),
  );
  const lastEventId = movementEvents.at(-1)?.id || 0;
  const signature = JSON.stringify(
    movementEvents.length
      ? movementEvents
      : playedThrough
        ? []
        : pending?.enemyMovements || [],
  );
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
  const key = `${epoch}:${game?.scenario}:${pending?.workflow?.flowId}:${signature}`;
  const [playback, setPlayback] = useState({ key: null, index: 0 });
  const index = playback.key === key ? playback.index : 0;
  useEffect(() => {
    if (!frames.length) return;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setPlayback({ key, index: step });
      if (step >= frames.length) {
        clearInterval(timer);
        if (lastEventId)
          setCompleted((current) => ({
            epoch,
            through: Math.max(
              current.epoch === epoch ? current.through : 0,
              lastEventId,
            ),
          }));
      }
    }, 850);
    return () => clearInterval(timer);
  }, [key, frames.length, lastEventId, epoch]);
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
    skip: () => {
      setPlayback({ key, index: frames.length });
      if (lastEventId)
        setCompleted((current) => ({
          epoch,
          through: Math.max(
            current.epoch === epoch ? current.through : 0,
            lastEventId,
          ),
        }));
    },
  };
}

export default function EnemyMotion({ playback }) {
  if (!playback.frame) return null;
  return (
    <button
      type="button"
      className="enemy-motion-skip text-button"
      onClick={playback.skip}
      aria-label="跳过敌人移动动画"
    >
      跳过移动动画
    </button>
  );
}
