'use client';
import { useEffect, useState, useRef } from 'react';
import { Dices, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { rollOwner } from '@/lib/roll-ownership.mjs';
const ROLL_ANIMATION_MS = 1500,
  RESULT_HOLD_MS = 1400;
function EmojiDice({ dice, count, rollEventId, motion, onSettled }) {
  const signature = dice
      ? `${rollEventId || 'legacy'}:${dice.join(',')}`
      : null,
    [shown, setShown] = useState(null);
  const callback = useRef(onSettled);
  useEffect(() => {
    callback.current = onSettled;
  }, [onSettled]);
  useEffect(() => {
    if (signature === null) return;
    const timer = setTimeout(
      () => {
        setShown(signature);
        callback.current();
      },
      motion && shown !== signature ? ROLL_ANIMATION_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [signature, motion, shown]);
  const rolling = !!dice && motion && shown !== signature;
  return (
    <div
      className={'emoji-dice-row ' + (rolling ? 'is-rolling' : '')}
      aria-label={
        !dice
          ? '等待投掷'
          : rolling
            ? '正在掷骰'
            : '骰子结果 ' + dice.join('、')
      }
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          className={'emoji-die ' + (!dice ? 'waiting-die' : '')}
          key={i}
          style={{ '--die-delay': (i % 5) * 0.035 + 's' }}
          aria-hidden="true"
        >
          {!dice ? (
            <Dices size={27} />
          ) : rolling ? (
            <span className="rolling-faces">
              <i>●</i>
              <i>● ●</i>
              <i>—</i>
              <i>●</i>
            </span>
          ) : (
            <span className="die-value">
              {dice[i] === 0 ? '—' : dice[i] === 1 ? '●' : '● ●'}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
export default function DiceRequest({
  game,
  send,
  net,
  motion,
  toggleMotion,
  autoRoll,
  toggleAuto,
  testTools,
}) {
  const p = game.queue[0],
    room = net?.room,
    [settled, setSettled] = useState([]);
  const outcomes = p.outcomes || [];
  const mine = (r) => !room || rollOwner(room, r) === room.you;
  const available = p.rolls.filter((r) => !r.dice && mine(r)),
    automatic = available.filter((r) => autoRoll || r.computer);
  const autoIds = automatic.map((r) => r.id).join(','),
    sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    if (!autoIds || net?.busy) return;
    const timer = setTimeout(
      () => sendRef.current({ type: 'rollAll', sideIds: autoIds.split(',') }),
      750,
    );
    return () => clearTimeout(timer);
  }, [autoIds, net?.busy]);
  const finished = p.rolls.every((r) => r.dice),
    ready =
      finished && (!motion || p.rolls.every((r) => settled.includes(r.id)));
  const confirmer = !room || (room.seats[p.heroId] || room.hostId) === room.you;
  useEffect(() => {
    if (!ready || !confirmer || net?.busy) return;
    const timer = setTimeout(
      () => sendRef.current({ type: 'resolveDice', requestId: p.uid }),
      RESULT_HOLD_MS,
    );
    return () => clearTimeout(timer);
  }, [ready, confirmer, net?.busy, p.uid]);
  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="story-dialog dice-request-dialog"
        showCloseButton={false}
      >
        <div className="dice-options">
          <button
            className="text-button"
            aria-pressed={motion}
            onClick={toggleMotion}
          >
            动画 {motion ? '开' : '关'}
          </button>
          <button
            className="text-button"
            aria-pressed={autoRoll}
            onClick={toggleAuto}
          >
            自动投掷 {autoRoll ? '开' : '关'}
          </button>
        </div>
        <span className="eyebrow">
          {p.rolls.length > 1 ? '双方检定' : '属性检定'}
        </span>
        <DialogTitle>{p.title}</DialogTitle>
        <DialogDescription className={p.text ? '' : 'sr-only'}>
          {p.text || p.title}
        </DialogDescription>
        {outcomes.length > 0 && (
          <dl className="roll-outcomes" aria-label="点数与效果">
            {outcomes.map((row) => (
              <div key={row.range}>
                <dt>{row.range}</dt>
                <dd>{row.effect}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="roll-sides">
          {p.rolls.map((r, i) => {
            const own = mine(r),
              rollEvent = game.events?.find(
                (event) => event.id === r.rollEventId,
              ),
              displayedDice = rollEvent?.dice || r.dice,
              done = displayedDice && (!motion || settled.includes(r.id));
            const owner = room?.players.find(
              (player) => player.id === rollOwner(room, r),
            );
            return (
              <section
                className={'roll-side ' + (own ? 'my-roll' : '')}
                key={r.id}
              >
                <div className="roll-side-heading">
                  <strong>{r.label || '属性骰'}</strong>
                  <span>
                    {r.count} 枚{r.bonus ? ` · 加值 +${r.bonus}` : ''}
                  </span>
                </div>
                <small>
                  {r.computer
                    ? '电脑控制'
                    : owner
                      ? owner.name + (own ? ' · 你' : '')
                      : '由你投掷'}
                  {done ? ' · 已投掷' : ''}
                </small>
                <div className="dice-with-action">
                  <EmojiDice
                    dice={displayedDice}
                    count={r.count}
                    rollEventId={r.rollEventId}
                    motion={motion}
                    onSettled={() =>
                      setSettled((v) => (v.includes(r.id) ? v : [...v, r.id]))
                    }
                  />
                  {!displayedDice && (
                    <button
                      className="roll-small-button"
                      disabled={!own || r.computer || net?.busy}
                      aria-label={
                        own
                          ? '投掷' + (r.label || '这一组骰子')
                          : '等待对方投掷'
                      }
                      title={
                        r.computer
                          ? '电脑自动投掷'
                          : own
                            ? '投掷这一组'
                            : '等待对方投掷'
                      }
                      onClick={() => send({ type: 'rollDice', sideId: r.id })}
                    >
                      <Dices size={18} />
                      <span>{r.computer ? '自动' : own ? '投掷' : '等待'}</span>
                    </button>
                  )}
                </div>
                {done ? (
                  <div className="side-total">
                    点数{' '}
                    <strong>
                      {displayedDice.reduce((a, b) => a + b, 0) +
                        (r.bonus || 0)}
                    </strong>
                    {r.bonus > 0 && <small>含加值 +{r.bonus}</small>}
                    <Check size={17} />
                  </div>
                ) : displayedDice ? (
                  <span className="roll-wait">骰子翻滚中…</span>
                ) : null}
                {i < p.rolls.length - 1 && (
                  <span className="roll-versus">VS</span>
                )}
              </section>
            );
          })}
        </div>
        {finished && !ready && (
          <output className="dice-auto-status" aria-live="polite">
            等待骰子停稳
          </output>
        )}
        {testTools}
      </DialogContent>
    </Dialog>
  );
}
