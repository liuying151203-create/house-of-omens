import { useEffect, useRef, useState } from 'react';
import {
  attributeChangesFromEvents,
  ruleNoticesFromEvents,
} from '../lib/game-view.mjs';

export function useAttributeChanges(game) {
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
    const latestEventId = game.events?.at(-1)?.id || 0;
    if (lastEventId.current === null) {
      lastEventId.current = latestEventId;
      return;
    }
    const changes = attributeChangesFromEvents(game, lastEventId.current),
      notices = ruleNoticesFromEvents(game, lastEventId.current);
    lastEventId.current = latestEventId;
    if (!changes.length && !notices.length) return;
    const timer = setTimeout(
      () => setFeedback((v) => ({ id: v.id + 1, changes, notices })),
      0,
    );
    return () => clearTimeout(timer);
  }, [game]);
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
      <strong>即时结算</strong>
      {feedback.changes.map((c) => (
        <span
          key={c.eventId || `${c.heroId}-${c.trait}`}
          className={c.steps > 0 ? 'attribute-gain' : 'attribute-loss'}
        >
          {c.name} · {c.label}{' '}
          <b>
            {c.from} → {c.dead ? '☠' : c.to}
          </b>
          <small>
            {c.steps > 0 ? '+' : ''}
            {c.steps}格
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
