'use client';
import { useEffect, useRef, useState } from 'react';

export default function RingReroll({ request, send, motion, locked = false }) {
  const [selected, setSelected] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const choose = (value) => {
    if (selected !== null || locked) return;
    if (value === 'skip' || !motion) {
      setSelected(value);
      send({ type: 'resolveChoice', requestId: request.uid, choice: value });
      return;
    }
    setSelected(value);
    timer.current = setTimeout(() => {
      send({ type: 'resolveChoice', requestId: request.uid, choice: value });
    }, 850);
  };
  return (
    <div className="ring-reroll" aria-label="命运戒指可重掷的骰子">
      {(request.ringRolls || []).map((group, rollIndex) => (
        <div className="ring-roll-group" key={rollIndex}>
          <strong>{group.label || '本次检定'}</strong>
          <div className="ring-dice-row">
            {group.dice.map((face, index) => {
              const value = `${rollIndex}:${index}`;
              const eligible = request.options.some(
                (option) => option.value === value,
              );
              return (
                <button
                  type="button"
                  className={
                    'emoji-die ring-die ' +
                    (selected === value ? 'ring-die-rolling' : '')
                  }
                  key={value}
                  disabled={!eligible || selected !== null || locked}
                  aria-label={`第${index + 1}枚，${face}点${eligible ? '，点击重掷' : '，不可重掷'}`}
                  title={eligible ? '点击重掷这枚骰子' : '只可重掷0或2点骰子'}
                  onClick={() => choose(value)}
                >
                  {selected === value ? (
                    <span className="rolling-faces">
                      <i>●</i>
                      <i>● ●</i>
                      <i>—</i>
                      <i>●</i>
                    </span>
                  ) : (
                    <span className="die-value">
                      {face === 0 ? '—' : face === 1 ? '●' : '● ●'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={selected !== null || locked}
        onClick={() => choose('skip')}
      >
        不重掷
      </button>
      {selected !== null && selected !== 'skip' && (
        <output aria-live="polite">重掷中…</output>
      )}
    </div>
  );
}
