import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RemoteRouteError,
  accessRemoteRoom,
  connectRemoteRoom,
  createRemoteRoom,
  joinRemoteRoom,
} from '../lib/network/remote-router.mjs';

function fakeNamespace() {
  const requests = [];
  return {
    requests,
    idFromName: (code) => code,
    get: (code) => ({
      async fetch(request) {
        requests.push({ code, request });
        return Response.json({ code });
      },
    }),
  };
}

function post(path, data, headers = {}) {
  return new Request(`https://omens.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

test('remote routes map create, join, read and commands to one object per code', async () => {
  const namespace = fakeNamespace();
  const created = await createRemoteRoom(
    namespace,
    post('/api/remote/rooms', { scenario: 'mirror', count: 3 }),
  );
  const createdBody = await created.json();
  assert.match(createdBody.code, /^[A-Z0-9]{6}$/);
  assert.equal(namespace.requests[0].code, createdBody.code);

  await joinRemoteRoom(
    namespace,
    post('/api/remote/join', { code: 'abc123', name: '访客' }),
  );
  assert.equal(namespace.requests[1].code, 'ABC123');
  assert.equal(
    namespace.requests[1].request.headers.get('X-Room-Code'),
    'ABC123',
  );

  await accessRemoteRoom(
    namespace,
    new Request('https://omens.test/api/remote/rooms/ABC123', {
      headers: { Authorization: 'Bearer secret' },
    }),
    'ABC123',
  );
  assert.equal(namespace.requests[2].request.method, 'GET');
  assert.equal(
    namespace.requests[2].request.headers.get('Authorization'),
    'Bearer secret',
  );

  await connectRemoteRoom(
    namespace,
    new Request('https://omens.test/api/remote/rooms/abc123/socket', {
      headers: { Upgrade: 'websocket' },
    }),
    'abc123',
  );
  assert.equal(namespace.requests[3].code, 'ABC123');
  assert.equal(
    new URL(namespace.requests[3].request.url).pathname,
    '/api/remote/rooms/abc123/socket',
  );
});

test('remote routes reject cross-origin mutation and malformed room codes', async () => {
  const namespace = fakeNamespace();
  await assert.rejects(
    () =>
      createRemoteRoom(
        namespace,
        post(
          '/api/remote/rooms',
          { scenario: 'mirror', count: 3 },
          { Origin: 'https://other.test' },
        ),
      ),
    (error) => error instanceof RemoteRouteError && error.status === 403,
  );
  await assert.rejects(
    () =>
      joinRemoteRoom(namespace, post('/api/remote/join', { code: '../bad' })),
    (error) => error instanceof RemoteRouteError && error.status === 400,
  );
  await assert.rejects(
    () =>
      connectRemoteRoom(
        namespace,
        new Request('https://omens.test/api/remote/rooms/ABC123/socket'),
        'ABC123',
      ),
    (error) => error instanceof RemoteRouteError && error.status === 426,
  );
  assert.equal(namespace.requests.length, 0);
});
