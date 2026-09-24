'use client';
import { useEffect, useRef, useState } from 'react';
import { broadcastDuration } from '../lib/presentation-requests.mjs';

export default function FlowTransition({ request, send, locked }) {
  const duration = broadcastDuration(request);
  const [remaining, setRemaining] = useState(duration);
  const sent = useRef(false);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    if (locked) return;
    const started = Date.now();
    const interval = setInterval(
      () => setRemaining(Math.max(0, duration - (Date.now() - started))),
      80,
    );
    const timeout = setTimeout(() => {
      if (!sent.current) {
        sent.current = true;
        sendRef.current({ type: 'advance' });
      }
    }, duration);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [duration, request.uid, locked]);
  const label =
    {
      roundStart: '回合切换',
      turnStart: '角色交接',
      trapResult: '陷阱触发',
    }[request.kind] || '事件播报';
  return (
    <div className="flow-event-lock">
      <output className="flow-event-broadcast" aria-live="polite">
        <small>{label}</small>
        <strong>{request.title}</strong>
        {request.text && <p>{request.text}</p>}
        {locked && <span className="flow-event-wait">等待当前玩家…</span>}
        <div
          className="flow-transition-progress"
          style={{ '--flow-progress': `${(100 * remaining) / duration}%` }}
          aria-hidden="true"
        />
      </output>
    </div>
  );
}

export function InternalContinuation({ send, locked }) {
  const sent = useRef(false);
  useEffect(() => {
    if (!locked && !sent.current) {
      sent.current = true;
      send({ type: 'advance' });
    }
  }, [locked, send]);
  return null;
}
