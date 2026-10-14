'use client';
import { useEffect, useState } from 'react';
import {
  initialMapPresentation,
  collectMapPresentation,
  completeMapStep,
  mapPresentationGame,
} from '../lib/map-presentation.mjs';
import { EventBroadcast } from './flow-transition';

export function useMapPresentation(game, epoch, suspended = false) {
  const [state, setState] = useState(() => initialMapPresentation(game, epoch));
  const current = collectMapPresentation(state, game, epoch);
  // 同次渲染先锁住后续窗口，避免 useEffect 入队前闪出伤害弹窗。
  if (current !== state) setState(current);
  const step = current.steps[0];
  useEffect(() => {
    if (!step || suspended) return;
    const timer = setTimeout(() => {
      setState((previous) =>
        previous.epoch === epoch
          ? completeMapStep(previous, step.key)
          : previous,
      );
    }, step.duration);
    return () => clearTimeout(timer);
  }, [step, epoch, suspended]);
  return {
    busy: !!step,
    step: suspended ? null : step,
    game: suspended ? game : mapPresentationGame(game, current.steps),
  };
}

export default function MapPresentation({ presentation }) {
  if (!presentation.busy || !presentation.step) return null;
  const step = presentation.step;
  return (
    <div className="flow-event-lock">
      {step.kind === 'trigger' && (
        <EventBroadcast
          key={step.key}
          request={step}
          label="陷阱触发"
          duration={step.duration}
        />
      )}
    </div>
  );
}
