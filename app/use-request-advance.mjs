import { useEffect, useRef } from 'react';

// 自动续接只推进它所属的请求，网络延迟或切换场景后不能作用于下一步。
export function useRequestAdvance(requestId, send, delay, locked) {
  const sent = useRef(null);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    if (locked || requestId == null || sent.current === requestId) return;
    const timer = setTimeout(() => {
      sent.current = requestId;
      sendRef.current({ type: 'advance', requestId });
    }, delay);
    return () => clearTimeout(timer);
  }, [requestId, delay, locked]);
}
