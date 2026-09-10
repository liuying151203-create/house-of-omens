import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { heroStatuses } from '../lib/hero-status.mjs';

export default function HeroStatusBadges({ game, hero, inline = false }) {
  const [tip, setTip] = useState(null);
  const timer = useRef(null),
    id = useId();
  useEffect(() => {
    const close = () => setTip(null);
    const escape = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
    };
  }, []);
  const badges = heroStatuses(game, hero);
  const selected = badges.find((b) => tip?.key === `${hero.id}:${b.id}`);
  if (!badges.length) return null;
  const hide = () => {
    timer.current = setTimeout(() => setTip(null), 150);
  };
  const show = (event, badge) => {
    clearTimeout(timer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const above = rect.top > window.innerHeight / 2;
    setTip({
      key: `${hero.id}:${badge.id}`,
      position: {
        left: Math.max(8, Math.min(window.innerWidth - 296, rect.left)),
        ...(above
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 }),
      },
    });
  };
  return (
    <span className="hero-status-badges">
      {badges.map((badge) => {
        const Icon = badge.id === 'infection' ? ShieldAlert : ShieldCheck;
        const children = (
          <>
            <Icon size={13} />
            <span>{badge.label}</span>
            {badge.count !== undefined && <b>{badge.count}</b>}
          </>
        );
        const shared = {
          className: 'status-chip status-' + badge.id,
          'aria-label':
            badge.label +
            (badge.count !== undefined ? '，剩余' + badge.count + '轮' : ''),
          'aria-describedby': selected?.id === badge.id ? id : undefined,
          onPointerEnter: (e) => show(e, badge),
          onPointerLeave: hide,
        };
        return inline ? (
          <span key={badge.id} {...shared}>
            {children}
          </span>
        ) : (
          <button
            key={badge.id}
            type="button"
            {...shared}
            onFocus={(e) => show(e, badge)}
            onBlur={hide}
            onClick={(e) => show(e, badge)}
          >
            {children}
          </button>
        );
      })}
      {selected &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="hero-status-tooltip"
            style={tip.position}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={hide}
          >
            <strong>
              {hero.name} · {selected.label}
            </strong>
            <p>{selected.description}</p>
          </div>,
          document.body,
        )}
    </span>
  );
}
