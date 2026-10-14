'use client';
import { broadcastDuration } from '../lib/presentation-requests.mjs';
import { useRequestAdvance } from './use-request-advance.mjs';

export default function FlowTransition({ request, send, locked }) {
  const duration = broadcastDuration(request);
  useRequestAdvance(request.uid, send, duration, locked);
  return (
    <div className="flow-event-lock">
      <EventBroadcast request={request} duration={duration} locked={locked} />
    </div>
  );
}

export function EventBroadcast({ request, duration, locked = false }) {
  return (
    <output
      className="flow-event-broadcast"
      aria-live="polite"
      aria-atomic="true"
    >
      <strong>{request.title}</strong>
      {request.text && <p>{request.text}</p>}
      {locked && <span className="flow-event-wait">等待当前玩家…</span>}
      {!locked && (
        <div
          className="flow-transition-progress"
          style={{ '--flow-duration': `${duration}ms` }}
          aria-hidden="true"
        />
      )}
    </output>
  );
}

export function InternalContinuation({ requestId, send, locked }) {
  useRequestAdvance(requestId, send, 0, locked);
  return null;
}
