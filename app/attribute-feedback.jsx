import { useEffect, useRef, useState } from 'react';
import { attributeChanges } from '../lib/game-view.mjs';
import { TRAITS } from '../lib/game-data.mjs';

export function useAttributeChanges(game) {
  const previous = useRef(null);
  const [feedback, setFeedback] = useState({ id: 0, changes: [] });
  useEffect(() => {
    const changes = attributeChanges(previous.current, game);
    previous.current = game;
    if (!game) {
      const timer = setTimeout(
        () => setFeedback((v) => ({ ...v, changes: [] })),
        0,
      );
      return () => clearTimeout(timer);
    }
    if (!changes.length) return;
    const timer = setTimeout(
      () => setFeedback((v) => ({ id: v.id + 1, changes })),
      0,
    );
    return () => clearTimeout(timer);
  }, [game]);
  useEffect(() => {
    if (!feedback.changes.length) return;
    const timer = setTimeout(
      () => setFeedback((v) => ({ ...v, changes: [] })),
      6500,
    );
    return () => clearTimeout(timer);
  }, [feedback.id, feedback.changes.length]);
  return feedback;
}

export default function AttributeFeedback({ feedback }) {
  if (!feedback.changes.length) return null;
  return (
    <output className="attribute-feedback" key={feedback.id} aria-live="polite">
      <strong>属性变化</strong>
      {feedback.changes.map((c) => (
        <span
          key={`${c.heroId}-${c.trait}`}
          className={c.steps > 0 ? 'attribute-gain' : 'attribute-loss'}
        >
          {c.name} · {TRAITS[c.trait]}{' '}
          <b>
            {c.from} → {c.dead ? '☠' : c.to}
          </b>
          <small>
            {c.steps > 0 ? '+' : ''}
            {c.steps}格
          </small>
        </span>
      ))}
    </output>
  );
}
