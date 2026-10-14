import { useEffect, useRef, useState } from 'react';
import {
  attributeChangesFromEvents,
  ruleNoticesFromEvents,
} from '../lib/game-view.mjs';

export function useAttributeChanges(game, suspended = false) {
  const lastEventId = useRef(null);
  const [feedback, setFeedback] = useState({
    id: 0,
    changes: [],
    notices: [],
  });
  useEffect(() => {
    if (!game) {
      lastEventId.current = null;
      const timer = setTimeout(
        () => setFeedback((v) => ({ ...v, changes: [], notices: [] })),
        0,
      );
      return () => clearTimeout(timer);
    }
    if (suspended) return;
    const latestEventId = game.events?.at(-1)?.id || 0;
    if (lastEventId.current === null) {
      lastEventId.current = latestEventId;
      return;
    }
    const changes = attributeChangesFromEvents(game, lastEventId.current),
      notices = ruleNoticesFromEvents(game, lastEventId.current).filter(
        (notice) =>
          // 捕兽夹在地图流程中独立播报，不在伤害窗口打开时再播一次。
          !game.events.some(
            (event) =>
              event.id === notice.eventId &&
              event.type === 'TrapTriggered' &&
              event.heroId !== undefined,
          ),
      );
    lastEventId.current = latestEventId;
    if (!changes.length && !notices.length) return;
    const timer = setTimeout(
      () => setFeedback((v) => ({ id: v.id + 1, changes, notices })),
      0,
    );
    return () => clearTimeout(timer);
  }, [game, suspended]);
  useEffect(() => {
    if (!feedback.changes.length && !feedback.notices.length) return;
    const timer = setTimeout(
      () => setFeedback((v) => ({ ...v, changes: [], notices: [] })),
      6500,
    );
    return () => clearTimeout(timer);
  }, [feedback.id, feedback.changes.length, feedback.notices.length]);
  return feedback;
}

export default function AttributeFeedback({ feedback }) {
  if (!feedback.changes.length && !feedback.notices.length) return null;
  return (
    <output className="attribute-feedback" key={feedback.id} aria-live="polite">
      <strong>事件播报</strong>
      {feedback.changes.map((c) => (
        <span
          key={c.eventId || `${c.heroId}-${c.trait}`}
          className={c.steps > 0 ? 'attribute-gain' : 'attribute-loss'}
        >
          {c.name} · {c.label}
          {c.steps > 0 ? '右移' : '左移'}
          {Math.abs(c.steps)}格
          <small>
            数值 {c.from} → {c.dead ? '☠' : c.to}
          </small>
        </span>
      ))}
      {feedback.notices.map((notice) => (
        <span
          key={notice.eventId}
          className={`rule-event rule-event-${notice.tone}`}
        >
          {notice.text}
        </span>
      ))}
    </output>
  );
}
