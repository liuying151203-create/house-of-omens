import assert from 'node:assert/strict';
import WebSocket from 'ws';

function createClient(base, code) {
  const url = new URL(
      `/api/remote/rooms/${encodeURIComponent(code)}/socket`,
      base,
    ),
    messages = [],
    waiters = [];
  url.protocol = 'ws:';
  const socket = new WebSocket(url),
    opened = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out opening ${url.href}`)),
        8_000,
      );
      socket.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  socket.on('message', (data) => {
    const raw = String(data);
    if (raw === 'pong') return;
    const message = JSON.parse(raw),
      waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else messages.push(message);
  });
  return {
    socket,
    async open(token, revision) {
      await opened;
      socket.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: 1,
          token,
          revision,
          capabilities: ['integration-test'],
        }),
      );
      const ready = await this.waitFor((message) => message.type === 'ready'),
        snapshot = await this.waitFor((message) => message.type === 'snapshot');
      return { ready, snapshot };
    },
    send(message) {
      socket.send(JSON.stringify({ protocolVersion: 1, ...message }));
    },
    waitFor(predicate, timeoutMs = 8_000) {
      const messageIndex = messages.findIndex(predicate);
      if (messageIndex >= 0)
        return Promise.resolve(messages.splice(messageIndex, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for a WebSocket message'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
}

async function main() {
  const input = await readInput(),
    host = createClient(input.base, input.code),
    guest = createClient(input.base, input.code);
  try {
    const [hostHandshake, guestHandshake] = await Promise.all([
      host.open(input.hostToken, input.revision),
      guest.open(input.guestToken, input.revision),
    ]);
    assert.equal(hostHandshake.ready.protocolVersion, 1);
    assert.equal(hostHandshake.snapshot.room.code, input.code);
    assert.equal(guestHandshake.snapshot.room.code, input.code);
    assert.notEqual(
      hostHandshake.snapshot.room.you,
      guestHandshake.snapshot.room.you,
    );
    assert(!JSON.stringify(hostHandshake).includes(input.hostToken));
    assert(!JSON.stringify(guestHandshake).includes(input.guestToken));

    const result = {
      hostRevision: hostHandshake.snapshot.room.revision,
      guestRevision: guestHandshake.snapshot.room.revision,
      hostYou: hostHandshake.snapshot.room.you,
      guestYou: guestHandshake.snapshot.room.you,
      guestHiddenHeroes:
        guestHandshake.snapshot.room.game?.heroes.filter(
          (hero) => hero.inventoryHidden && hero.stats === null,
        ).length || 0,
    };

    if (input.command) {
      const hostUpdated = host.waitFor(
          (message) =>
            message.type === 'updated' &&
            message.revision > input.command.expectedRevision,
        ),
        guestUpdated = guest.waitFor(
          (message) =>
            message.type === 'updated' &&
            message.revision > input.command.expectedRevision,
        ),
        acknowledged = host.waitFor(
          (message) =>
            message.type === 'ack' &&
            message.commandId === input.command.commandId,
        );
      host.send(input.command);
      const [hostView, guestView, ack] = await Promise.all([
        hostUpdated,
        guestUpdated,
        acknowledged,
      ]);
      assert.equal(hostView.revision, guestView.revision);
      assert.equal(ack.revision, hostView.revision);
      result.revision = hostView.revision;
      result.ackRevision = ack.revision;
      result.seats = hostView.room.seats;

      if (input.repeatCommand) {
        const duplicateAck = host.waitFor(
          (message) =>
            message.type === 'ack' &&
            message.commandId === input.command.commandId,
        );
        host.send(input.command);
        result.duplicateAckRevision = (await duplicateAck).revision;
      }
    }

    process.stdout.write(JSON.stringify(result));
  } finally {
    host.close();
    guest.close();
  }
}

await main();
