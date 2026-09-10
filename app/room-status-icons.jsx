import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { roomBadges } from '../lib/room-badges.mjs';

export default function RoomStatusIcons({ game, room }) {
  const [tooltip, setTooltip] = useState(null);
  const id = useId();
  const hideTimer = useRef(null);
  useEffect(() => {
    const close = () => setTooltip(null);
    const escape = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', escape);
    return () => {
      clearTimeout(hideTimer.current);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  const badges = roomBadges(game, room);
  if (!badges.length) return null;
  const hideSoon = () => {
    hideTimer.current = setTimeout(() => setTooltip(null), 150);
  };
  const show = (event, badge) => {
    clearTimeout(hideTimer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      ...badge,
      left: Math.max(8, Math.min(window.innerWidth - 272, rect.left)),
      top: Math.max(8, Math.min(window.innerHeight - 150, rect.bottom + 8)),
    });
  };
  return (
    <div
      className="room-status-icons"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {badges.map((badge) => (
        <button
          key={badge.id}
          type="button"
          aria-label={badge.label}
          aria-describedby={tooltip?.id === badge.id ? id : undefined}
          onPointerEnter={(e) => show(e, badge)}
          onPointerLeave={hideSoon}
          onFocus={(e) => show(e, badge)}
          onBlur={() => setTooltip(null)}
          onClick={(e) => {
            e.stopPropagation();
            show(e, badge);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setTooltip(null);
            }
          }}
        >
          {badge.icon}
        </button>
      ))}
      {tooltip &&
        badges.some((badge) => badge.id === tooltip.id) &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="room-status-tooltip"
            style={{ left: tooltip.left, top: tooltip.top }}
            onPointerEnter={() => clearTimeout(hideTimer.current)}
            onPointerLeave={hideSoon}
          >
            <strong>
              {tooltip.icon} {tooltip.label}
            </strong>
            <small>{room.name}</small>
            <p>{tooltip.description}</p>
          </div>,
          document.body,
        )}
    </div>
  );
}
