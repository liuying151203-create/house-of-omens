import {
  NETWORK_PROTOCOL_VERSION,
  encodeServerMessage,
} from './network-protocol.mjs';

const DEFAULT_RECONNECT_BASE_MS = 500;
const DEFAULT_RECONNECT_MAX_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_COMMAND_TIMEOUT_MS = 4_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;

export class RemoteTransportError extends Error {
  constructor(message, { status = 0, code = 'transport_error' } = {}) {
    super(message);
    this.name = 'RemoteTransportError';
    this.status = status;
    this.code = code;
  }
}

function roomPath(code) {
  return `/api/remote/rooms/${encodeURIComponent(code)}`;
}

function sameSession(left, right) {
  return left?.code === right?.code && left?.key === right?.key;
}

function defaultWebSocketFactory(url) {
  return new WebSocket(url);
}

export function createRemoteTransport({
  baseUrl = globalThis.location?.href,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  webSocketFactory = defaultWebSocketFactory,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  setIntervalImpl = globalThis.setInterval?.bind(globalThis),
  clearIntervalImpl = globalThis.clearInterval?.bind(globalThis),
  random = Math.random,
  reconnectBaseMs = DEFAULT_RECONNECT_BASE_MS,
  reconnectMaxMs = DEFAULT_RECONNECT_MAX_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
} = {}) {
  if (!baseUrl) throw new Error('远程联机需要可用的页面地址。');
  if (!fetchImpl) throw new Error('当前环境不支持 HTTP 请求。');

  let subscription = null,
    socket = null,
    socketReady = false,
    reconnectTimer = null,
    pollTimer = null,
    heartbeatTimer = null,
    reconnectAttempt = 0,
    lastRevision = -1,
    hasSnapshot = false,
    syncing = null,
    closed = false,
    fatal = false;
  const pending = new Map();

  function notifyStatus(status) {
    subscription?.observer.onStatus?.(status);
  }

  function notifyError(error) {
    subscription?.observer.onError?.(error);
  }

  function emitSnapshot(room, force = false) {
    if (!room || !Number.isInteger(room.revision)) return;
    if (room.revision < lastRevision) return;
    if (!force && hasSnapshot && room.revision === lastRevision) return;
    lastRevision = room.revision;
    hasSnapshot = true;
    subscription?.observer.onSnapshot?.(room);
  }

  async function request(pathname, { method = 'GET', session, body } = {}) {
    const url = new URL(pathname, baseUrl),
      response = await fetchImpl(url, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(session?.key ? { Authorization: `Bearer ${session.key}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new RemoteTransportError('远程房间返回了无法识别的响应。', {
        status: response.status,
      });
    }
    if (!response.ok)
      throw new RemoteTransportError(data.error || '操作未完成。', {
        status: response.status,
        code:
          data.code ||
          (response.status === 409 ? 'revision_conflict' : 'http_error'),
      });
    return data;
  }

  async function read(session) {
    return request(roomPath(session.code), { session });
  }

  async function syncHttp() {
    if (!subscription || closed) return null;
    if (!syncing) {
      syncing = read(subscription.session)
        .then((room) => {
          emitSnapshot(room);
          return room;
        })
        .catch((error) => {
          notifyError(error);
          return null;
        })
        .finally(() => {
          syncing = null;
        });
    }
    return syncing;
  }

  function stopPolling() {
    if (pollTimer !== null) clearIntervalImpl(pollTimer);
    pollTimer = null;
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) clearIntervalImpl(heartbeatTimer);
    heartbeatTimer = null;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setIntervalImpl(() => {
      if (socketReady && socket)
        try {
          socket.send('ping');
        } catch {}
    }, heartbeatIntervalMs);
  }

  function startPolling() {
    if (pollTimer !== null || !subscription || closed) return;
    void syncHttp();
    pollTimer = setIntervalImpl(() => void syncHttp(), pollIntervalMs);
  }

  async function fallbackCommand(entry) {
    if (entry.settled || entry.fallingBack) return;
    entry.fallingBack = true;
    clearTimeoutImpl(entry.timer);
    try {
      const room = await request(roomPath(entry.session.code), {
        method: 'POST',
        session: entry.session,
        body: entry.command,
      });
      entry.settled = true;
      pending.delete(entry.command.commandId);
      emitSnapshot(room);
      entry.resolve(room);
    } catch (error) {
      entry.settled = true;
      pending.delete(entry.command.commandId);
      entry.reject(error);
      notifyError(error);
      if (error.code === 'revision_conflict') void syncHttp();
    }
  }

  function fallbackPendingCommands() {
    for (const entry of pending.values()) void fallbackCommand(entry);
  }

  function stopSocket() {
    const activeSocket = socket;
    socket = null;
    socketReady = false;
    stopHeartbeat();
    if (activeSocket)
      try {
        activeSocket.close(1000, '客户端关闭');
      } catch {}
  }

  function scheduleReconnect() {
    if (closed || fatal || reconnectTimer !== null || !subscription) return;
    const baseDelay = Math.min(
        reconnectMaxMs,
        reconnectBaseMs * 2 ** reconnectAttempt,
      ),
      jitter = Math.floor(random() * Math.min(250, baseDelay / 4));
    reconnectAttempt++;
    reconnectTimer = setTimeoutImpl(() => {
      reconnectTimer = null;
      connectSocket();
    }, baseDelay + jitter);
  }

  function webSocketUrl(code) {
    const url = new URL(`${roomPath(code)}/socket`, baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.href;
  }

  function handleServerMessage(activeSocket, event) {
    if (activeSocket !== socket) return;
    if (event.data === 'pong') return;
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      notifyError(new RemoteTransportError('收到了无法识别的联机消息。'));
      return;
    }
    if (message.protocolVersion !== NETWORK_PROTOCOL_VERSION) {
      fatal = true;
      notifyError(
        new RemoteTransportError('当前游戏版本无法加入该房间，请刷新页面。', {
          status: 426,
          code: 'upgrade_required',
        }),
      );
      stopSocket();
      return;
    }
    if (message.type === 'ready') {
      socketReady = true;
      reconnectAttempt = 0;
      stopPolling();
      startHeartbeat();
      notifyStatus('connected');
      return;
    }
    if (message.type === 'snapshot' || message.type === 'updated') {
      emitSnapshot(message.room);
      return;
    }
    if (message.type === 'ack') {
      const entry = pending.get(message.commandId);
      if (!entry || entry.settled) return;
      entry.settled = true;
      clearTimeoutImpl(entry.timer);
      pending.delete(message.commandId);
      entry.resolve({
        acknowledged: true,
        commandId: message.commandId,
        revision: message.revision,
      });
      return;
    }
    if (message.type === 'error' || message.type === 'upgrade_required') {
      const error = new RemoteTransportError(
          message.message || '远程房间暂时不可用。',
          {
            status: message.status,
            code: message.code,
          },
        ),
        entry = message.commandId && pending.get(message.commandId);
      if (entry && !entry.settled) {
        entry.settled = true;
        clearTimeoutImpl(entry.timer);
        pending.delete(message.commandId);
        entry.reject(error);
      }
      notifyError(error);
      if (message.code === 'revision_conflict') void syncHttp();
      if (message.type === 'upgrade_required') {
        fatal = true;
        stopSocket();
      }
    }
  }

  function connectSocket() {
    if (!subscription || closed || fatal || socket) return;
    notifyStatus(reconnectAttempt ? 'reconnecting' : 'connecting');
    let candidate;
    try {
      candidate = webSocketFactory(webSocketUrl(subscription.session.code));
      socket = candidate;
    } catch (error) {
      notifyError(error);
      startPolling();
      scheduleReconnect();
      return;
    }
    candidate.addEventListener('open', () => {
      if (candidate !== socket || !subscription) return;
      candidate.send(
        encodeServerMessage('hello', {
          token: subscription.session.key,
          revision: lastRevision,
          capabilities: ['full-snapshot-v1', 'http-fallback-v1'],
        }),
      );
    });
    candidate.addEventListener('message', (event) =>
      handleServerMessage(candidate, event),
    );
    candidate.addEventListener('close', () => {
      if (candidate !== socket) return;
      socket = null;
      socketReady = false;
      stopHeartbeat();
      if (closed || fatal) return;
      notifyStatus('reconnecting');
      fallbackPendingCommands();
      startPolling();
      scheduleReconnect();
    });
    candidate.addEventListener('error', () => {
      if (candidate === socket) notifyStatus('reconnecting');
    });
  }

  async function command(session, data) {
    if (
      !socketReady ||
      !socket ||
      !subscription ||
      !sameSession(session, subscription.session)
    ) {
      const room = await request(roomPath(session.code), {
        method: 'POST',
        session,
        body: data,
      });
      emitSnapshot(room);
      return room;
    }
    return new Promise((resolve, reject) => {
      const entry = {
        session,
        command: data,
        resolve,
        reject,
        settled: false,
        fallingBack: false,
        timer: null,
      };
      entry.timer = setTimeoutImpl(
        () => void fallbackCommand(entry),
        commandTimeoutMs,
      );
      pending.set(data.commandId, entry);
      try {
        socket.send(
          encodeServerMessage('command', {
            commandId: data.commandId,
            expectedRevision: data.revision,
            payload: Object.fromEntries(
              Object.entries(data).filter(
                ([key]) => key !== 'revision' && key !== 'commandId',
              ),
            ),
          }),
        );
      } catch {
        void fallbackCommand(entry);
      }
    });
  }

  function subscribe(session, observer = {}) {
    close();
    closed = false;
    fatal = false;
    subscription = { session: { ...session }, observer };
    lastRevision = Number.isInteger(observer.revision) ? observer.revision : -1;
    hasSnapshot = false;
    reconnectAttempt = 0;
    connectSocket();
    return close;
  }

  function close() {
    closed = true;
    if (reconnectTimer !== null) clearTimeoutImpl(reconnectTimer);
    reconnectTimer = null;
    stopPolling();
    stopHeartbeat();
    stopSocket();
    subscription = null;
    syncing = null;
    for (const entry of pending.values()) {
      clearTimeoutImpl(entry.timer);
      entry.reject(new RemoteTransportError('远程联机已关闭。'));
    }
    pending.clear();
  }

  return {
    create: (data) =>
      request('/api/remote/rooms', { method: 'POST', body: data }),
    join: (data) => request('/api/remote/join', { method: 'POST', body: data }),
    read,
    command,
    subscribe,
    close,
    getState: () => ({
      connected: socketReady,
      revision: lastRevision,
      pendingCommands: pending.size,
    }),
  };
}
