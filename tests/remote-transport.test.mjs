import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteTransport } from '../lib/network/remote-transport.mjs';

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.dispatch('close');
  }
}

function fakeTimers() {
  let serial = 0;
  const timeouts = new Map(),
    intervals = new Map();
  return {
    timeouts,
    intervals,
    setTimeoutImpl(callback, delay) {
      const id = ++serial;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeoutImpl(id) {
      timeouts.delete(id);
    },
    setIntervalImpl(callback, delay) {
      const id = ++serial;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearIntervalImpl(id) {
      intervals.delete(id);
    },
  };
}

test('remote transport speaks WebSocket protocol and ignores stale snapshots', async () => {
  const sockets = [],
    timers = fakeTimers(),
    snapshots = [],
    statuses = [],
    fetches = [],
    session = { code: 'ABC123', key: 'ab'.repeat(32) },
    transport = createRemoteTransport({
      baseUrl: 'https://omens.test/',
      fetchImpl: async (url, options) => {
        fetches.push({ url: url.href, options });
        return Response.json({ code: 'ABC123', revision: 3 });
      },
      webSocketFactory: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      random: () => 0,
      ...timers,
    });

  transport.subscribe(session, {
    revision: 1,
    onSnapshot: (room) => snapshots.push(room.revision),
    onStatus: (status) => statuses.push(status),
  });
  assert.equal(
    sockets[0].url,
    'wss://omens.test/api/remote/rooms/ABC123/socket',
  );
  sockets[0].dispatch('open');
  const hello = JSON.parse(sockets[0].sent[0]);
  assert.equal(hello.type, 'hello');
  assert.equal(hello.revision, 1);
  assert.equal(hello.token, session.key);

  sockets[0].dispatch('message', {
    data: JSON.stringify({ type: 'ready', protocolVersion: 1, revision: 2 }),
  });
  sockets[0].dispatch('message', {
    data: JSON.stringify({
      type: 'snapshot',
      protocolVersion: 1,
      revision: 2,
      room: { code: 'ABC123', revision: 2 },
    }),
  });
  const resultPromise = transport.command(session, {
    type: 'seat',
    seat: 2,
    revision: 2,
    commandId: 'seat-command-01',
  });
  const command = JSON.parse(sockets[0].sent.at(-1));
  assert.deepEqual(command.payload, { type: 'seat', seat: 2 });
  assert.equal(command.expectedRevision, 2);

  sockets[0].dispatch('message', {
    data: JSON.stringify({
      type: 'ack',
      protocolVersion: 1,
      commandId: 'seat-command-01',
      revision: 3,
    }),
  });
  sockets[0].dispatch('message', {
    data: JSON.stringify({
      type: 'updated',
      protocolVersion: 1,
      revision: 3,
      room: { code: 'ABC123', revision: 3 },
    }),
  });
  sockets[0].dispatch('message', {
    data: JSON.stringify({
      type: 'updated',
      protocolVersion: 1,
      revision: 2,
      room: { code: 'ABC123', revision: 2 },
    }),
  });
  assert.equal((await resultPromise).acknowledged, true);
  assert.deepEqual(snapshots, [2, 3]);
  assert.equal(transport.getState().revision, 3);

  sockets[0].dispatch('close');
  await Promise.resolve();
  assert(statuses.includes('reconnecting'));
  assert.equal(
    [...timers.timeouts.values()].some((timer) => timer.delay === 500),
    true,
  );
  assert.equal(fetches.at(-1).options.method, 'GET');
  transport.close();
});

test('remote transport falls back to idempotent HTTP commands before socket ready', async () => {
  const timers = fakeTimers(),
    snapshots = [],
    requests = [],
    session = { code: 'XYZ789', key: 'cd'.repeat(32) },
    transport = createRemoteTransport({
      baseUrl: 'https://omens.test/',
      fetchImpl: async (url, options) => {
        requests.push({ url: url.href, options });
        return Response.json({ code: 'XYZ789', revision: 5 });
      },
      webSocketFactory: () => new FakeSocket('unused'),
      ...timers,
    });
  transport.subscribe(session, {
    revision: 4,
    onSnapshot: (room) => snapshots.push(room.revision),
  });
  const result = await transport.command(session, {
    type: 'seat',
    seat: 1,
    revision: 4,
    commandId: 'fallback-command-01',
  });
  assert.equal(result.revision, 5);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(
    JSON.parse(requests[0].options.body).commandId,
    'fallback-command-01',
  );
  assert.deepEqual(snapshots, [5]);
  transport.close();
});
