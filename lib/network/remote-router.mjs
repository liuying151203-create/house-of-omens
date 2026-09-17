const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BODY_SIZE = 16_000;

export class RemoteRouteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RemoteRouteError';
    this.status = status;
  }
}

export function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function routeErrorResponse(error) {
  if (error instanceof RemoteRouteError)
    return jsonResponse({ error: error.message }, error.status);
  console.error('Remote room route failed', error);
  return jsonResponse({ error: '远程房间暂时不可用，请稍后重试。' }, 503);
}

export function ensureSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host)
    throw new RemoteRouteError(403, '请从当前游戏页面发起操作。');
}

export async function readJsonBody(request) {
  const body = await request.text();
  if (body.length > MAX_BODY_SIZE)
    throw new RemoteRouteError(413, '请求过大。');
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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
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

export async function createRemoteRoom(namespace, request) {
  ensureSameOrigin(request);
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

export async function joinRemoteRoom(namespace, request) {
  ensureSameOrigin(request);
  const data = await readJsonBody(request),
    code = normalizeRoomCode(data.code);
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
