const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BODY_SIZE = 16_000;
const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

export class RemoteRouteError extends Error {
  constructor(
    status,
    message,
    code = errorCodeForStatus(status),
    headers = {},
  ) {
    super(message);
    this.name = 'RemoteRouteError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function errorCodeForStatus(status) {
  if (status === 400) return 'invalid_request';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'room_not_found';
  if (status === 405) return 'method_not_allowed';
  if (status === 409) return 'revision_conflict';
  if (status === 413) return 'payload_too_large';
  if (status === 415) return 'unsupported_media_type';
  if (status === 426) return 'upgrade_required';
  if (status === 429) return 'rate_limited';
  return 'service_unavailable';
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
  });
}

export function routeErrorResponse(error) {
  if (error instanceof RemoteRouteError)
    return jsonResponse(
      { error: error.message, code: error.code },
      error.status,
      error.headers,
    );
  console.error('Remote room route failed', {
    name: error?.name || 'Error',
    status: Number(error?.status) || 503,
  });
  return jsonResponse(
    { error: '远程房间暂时不可用，请稍后重试。', code: 'service_unavailable' },
    503,
  );
}

export function ensureSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  try {
    if (new URL(origin).origin === new URL(request.url).origin) return;
  } catch {}
  throw new RemoteRouteError(403, '请从当前游戏页面发起操作。');
}

export async function readJsonBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().startsWith('application/json'))
    throw new RemoteRouteError(415, '请求必须使用 JSON 格式。');
  const declaredSize = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_SIZE)
    throw new RemoteRouteError(413, '请求过大。');

  const reader = request.body?.getReader(),
    decoder = new TextDecoder();
  let body = '',
    received = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_SIZE) {
        await reader.cancel();
        throw new RemoteRouteError(413, '请求过大。');
      }
      body += decoder.decode(value, { stream: true });
    }
  body += decoder.decode();
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new RemoteRouteError(400, '请求格式不正确。');
  }
}

export function normalizeRoomCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code))
    throw new RemoteRouteError(400, '请输入六位房间码。');
  return code;
}

function randomRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length],
  ).join('');
}

function roomStub(namespace, code) {
  return namespace.get(namespace.idFromName(code));
}

function mutableResponse(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requestIdentity(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown-client';
}

async function enforceRateLimit(namespace, request, action, scope = '') {
  if (!namespace) return;
  const identity = `${action}:${requestIdentity(request)}:${scope}`,
    response = await namespace.get(namespace.idFromName(identity)).fetch(
      new Request('https://rate-limiter.internal/internal/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }),
    );
  if (response.ok) return;
  let data = null;
  try {
    data = await response.json();
  } catch {}
  throw new RemoteRouteError(
    response.status,
    data?.error || '请求过于频繁，请稍后重试。',
    data?.code || 'rate_limited',
    response.headers.get('Retry-After')
      ? { 'Retry-After': response.headers.get('Retry-After') }
      : {},
  );
}

function internalRequest(path, { code, data, authorization, method = 'POST' }) {
  const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Room-Code': code,
    }),
    options = { method, headers };
  if (authorization) headers.set('Authorization', authorization);
  if (method !== 'GET') options.body = JSON.stringify(data || {});
  return new Request(`https://game-room.internal${path}`, options);
}

export async function createRemoteRoom(namespace, request, rateLimiters) {
  ensureSameOrigin(request);
  await enforceRateLimit(rateLimiters, request, 'create');
  const data = await readJsonBody(request);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomRoomCode(),
      response = await roomStub(namespace, code).fetch(
        internalRequest('/internal/create', { code, data }),
      );
    if (response.status !== 409) return mutableResponse(response);
  }
  throw new RemoteRouteError(503, '暂时无法分配房间码，请重试。');
}

export async function joinRemoteRoom(namespace, request, rateLimiters) {
  ensureSameOrigin(request);
  const data = await readJsonBody(request),
    code = normalizeRoomCode(data.code);
  await enforceRateLimit(rateLimiters, request, 'join', code);
  return mutableResponse(
    await roomStub(namespace, code).fetch(
      internalRequest('/internal/join', { code, data }),
    ),
  );
}

export async function accessRemoteRoom(namespace, request, roomCode) {
  ensureSameOrigin(request);
  const code = normalizeRoomCode(roomCode),
    authorization = request.headers.get('Authorization');
  if (request.method === 'GET')
    return mutableResponse(
      await roomStub(namespace, code).fetch(
        internalRequest('/internal/room', {
          code,
          authorization,
          method: 'GET',
        }),
      ),
    );
  if (request.method === 'POST') {
    const data = await readJsonBody(request);
    return mutableResponse(
      await roomStub(namespace, code).fetch(
        internalRequest('/internal/command', {
          code,
          data,
          authorization,
        }),
      ),
    );
  }
  throw new RemoteRouteError(405, '不支持此请求。');
}

export async function connectRemoteRoom(namespace, request, roomCode) {
  ensureSameOrigin(request);
  if (request.method !== 'GET')
    throw new RemoteRouteError(405, '不支持此请求。');
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
    throw new RemoteRouteError(426, '请使用 WebSocket 连接远程房间。');
  const code = normalizeRoomCode(roomCode);
  return roomStub(namespace, code).fetch(request);
}
