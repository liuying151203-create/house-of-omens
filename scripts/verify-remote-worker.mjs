import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdir,
  readFile,
  readdir,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  wranglerCli = path.join(
    root,
    'node_modules',
    'wrangler',
    'wrangler-dist',
    'cli.js',
  ),
  config = path.join(root, 'dist', 'server', 'wrangler.json'),
  websocketProbe = path.join(root, 'scripts', 'remote-websocket-probe.mjs'),
  persistPath = path.join(
    root,
    '.wrangler',
    `remote-test-${process.pid}-${Date.now()}`,
  ),
  persistArgument = path.relative(root, persistPath);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address(),
        port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function launch(port) {
  const child = spawn(
    process.execPath,
    [
      '--no-warnings',
      '--experimental-vm-modules',
      wranglerCli,
      'dev',
      '--config',
      config,
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      persistArgument,
      '--local',
      '--show-interactive-dev-session=false',
    ],
    {
      cwd: root,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  child.output = [];
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
}

async function waitUntilReady(child, base) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Wrangler exited early:\n${child.output.join('')}`);
    try {
      const response = await fetch(base + '/api/remote/rooms/TEST00', {
          headers: { Authorization: 'Bearer readiness-probe' },
        }),
        body = await response.text();
      if (
        [403, 404].includes(response.status) &&
        response.headers.get('Content-Type')?.includes('application/json') &&
        JSON.parse(body).error
      ) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Wrangler did not become ready:\n${child.output.join('')}`);
}

async function request(
  base,
  pathname,
  { method = 'GET', token, body, retries = 2 } = {},
) {
  const options = {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(base + pathname, options),
    responseBody = await response.text();
  if (
    retries > 0 &&
    response.status === 503 &&
    responseBody.includes('worker restarted mid-request')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return request(base, pathname, {
      method,
      token,
      body,
      retries: retries - 1,
    });
  }
  let data;
  try {
    data = JSON.parse(responseBody);
  } catch {
    throw new Error(
      `${method} ${pathname} returned ${response.status}: ${responseBody}`,
    );
  }
  return { response, data };
}

async function fetchAfterStartup(url, options, retries = 4) {
  const response = await fetch(url, options);
  if (response.status !== 503 || retries <= 0) return response;
  await new Promise((resolve) => setTimeout(resolve, 250));
  return fetchAfterStartup(url, options, retries - 1);
}

async function runSocketProbeAttempt(input) {
  const child = spawn(process.execPath, [websocketProbe], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
    output = [],
    errors = [];
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => errors.push(String(chunk)));
  child.stdin.end(JSON.stringify(input));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000),
    [code] = await once(child, 'exit');
  clearTimeout(timeout);
  if (code !== 0)
    throw new Error(`WebSocket probe failed:\n${errors.join('')}`);
  return JSON.parse(output.join(''));
}

async function runSocketProbe(input, retries = 2) {
  try {
    return await runSocketProbeAttempt(input);
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return runSocketProbe(input, retries - 1);
  }
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true }),
    files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function removeDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await removeDirectory(target);
    else await unlink(target);
  }
  await rmdir(directory);
}

async function cleanupPersistedState() {
  if (path.dirname(persistPath) !== path.join(root, '.wrangler'))
    throw new Error(`Unsafe persistence cleanup path: ${persistPath}`);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await removeDirectory(persistPath);
      return;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Could not clean Wrangler state at ${persistPath}`);
}

async function verifyStorage(roomCode, hostToken, guestToken) {
  const files = await filesBelow(persistPath);
  assert(files.length, 'Wrangler did not create persistent storage files');
  for (const file of files) {
    const info = await stat(file);
    if (!info.size) continue;
    const bytes = await readFile(file);
    assert(
      !bytes.includes(Buffer.from(hostToken)),
      'host token was stored raw',
    );
    assert(
      !bytes.includes(Buffer.from(guestToken)),
      'guest token was stored raw',
    );
  }

  let tables, metrics;
  for (const file of files) {
    try {
      const database = new DatabaseSync(file, { readOnly: true });
      const names = database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
        .all()
        .map((row) => row.name);
      if (
        names.includes('room_state') &&
        database
          .prepare('SELECT state_json FROM room_state WHERE singleton = 1')
          .get()
          ?.state_json.includes(`"code":"${roomCode}"`)
      ) {
        tables = names;
        metrics = database
          .prepare(
            `SELECT schema_version, connection_high_water, connections_total,
              commands_total, command_conflicts, restore_failures
            FROM room_metrics WHERE singleton = 1`,
          )
          .get();
        database.close();
        break;
      }
      database.close();
    } catch {}
  }
  assert(tables, 'Could not find the Durable Object SQLite database');
  for (const table of [
    'schema_meta',
    'room_state',
    'players',
    'command_receipts',
    'request_deadlines',
    'room_metrics',
  ])
    assert(tables.includes(table), `Missing SQLite table ${table}`);
  assert.equal(metrics.schema_version, 2);
  assert(metrics.connection_high_water >= 2, 'connection metric was not kept');
  assert(metrics.connections_total >= 2, 'connection total was not kept');
  assert(metrics.commands_total >= 5, 'command metric was not kept');
  assert(metrics.command_conflicts >= 1, 'command conflict was not kept');
  assert.equal(metrics.restore_failures, 0);
}

async function main() {
  await mkdir(persistPath, { recursive: true });
  const port = await freePort(),
    base = `http://127.0.0.1:${port}`;
  let worker;
  try {
    worker = launch(port);
    await waitUntilReady(worker, base);

    const blocked = await fetchAfterStartup(base + '/api/remote/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://other.example',
      },
      body: JSON.stringify({ scenario: 'mirror', count: 3 }),
    });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'forbidden');

    const wrongType = await fetchAfterStartup(base + '/api/remote/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).code, 'unsupported_media_type');

    const oversized = await fetchAfterStartup(base + '/api/remote/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(17_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).code, 'payload_too_large');

    const created = await request(base, '/api/remote/rooms', {
      method: 'POST',
      body: { name: '房主', scenario: 'werewolf', count: 3 },
    });
    assert.equal(created.response.status, 200);
    assert.equal(
      created.response.headers.get('X-Content-Type-Options'),
      'nosniff',
    );
    assert.match(created.data.code, /^[A-Z0-9]{6}$/);
    assert.equal(created.data.key.length, 64);

    const createBurst = [];
    for (let index = 0; index < 6; index++)
      createBurst.push(
        await request(base, '/api/remote/rooms', {
          method: 'POST',
          body: {
            name: `压力房主${index + 1}`,
            scenario: 'mirror',
            count: 6,
          },
        }),
      );
    assert.deepEqual(
      createBurst.map((result) => result.response.status),
      [200, 200, 200, 200, 200, 429],
    );
    assert.equal(createBurst.at(-1).data.code, 'rate_limited');

    const stressRoom = createBurst[0].data,
      stressGuests = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          request(base, '/api/remote/join', {
            method: 'POST',
            body: {
              name: `并发访客${index + 1}`,
              code: stressRoom.code,
            },
          }),
        ),
      );
    assert(stressGuests.every((result) => result.response.status === 200));
    const stressLatest = await request(
        base,
        `/api/remote/rooms/${stressRoom.code}`,
        { token: stressRoom.key },
      ),
      stressSessions = [
        stressRoom,
        ...stressGuests.map((result) => result.data),
      ],
      stressCommands = await Promise.all(
        stressSessions.map((player, index) =>
          request(base, `/api/remote/rooms/${stressRoom.code}`, {
            method: 'POST',
            token: player.key,
            body: {
              type: 'seat',
              seat: index,
              revision: stressLatest.data.revision,
              commandId: `stress-seat-command-${index}`,
            },
          }),
        ),
      );
    assert.deepEqual(
      stressCommands
        .map((result) => result.response.status)
        .sort((left, right) => left - right),
      [200, 409, 409, 409, 409, 409],
    );

    const joined = await request(base, '/api/remote/join', {
      method: 'POST',
      body: { name: '访客', code: created.data.code },
    });
    assert.equal(joined.response.status, 200);
    assert.equal(joined.data.players.length, 2);

    const socketSeatCommand = {
        type: 'command',
        commandId: 'websocket-seat-command-01',
        expectedRevision: joined.data.revision,
        payload: { type: 'seat', seat: 2 },
      },
      seatProbe = await runSocketProbe({
        base,
        code: created.data.code,
        hostToken: created.data.key,
        guestToken: joined.data.key,
        revision: joined.data.revision,
        command: socketSeatCommand,
        repeatCommand: true,
      });
    assert.equal(seatProbe.hostYou, created.data.you);
    assert.equal(seatProbe.guestYou, joined.data.you);
    assert.equal(seatProbe.revision, joined.data.revision + 1);
    assert.equal(seatProbe.ackRevision, seatProbe.revision);
    assert.equal(seatProbe.duplicateAckRevision, seatProbe.revision);
    assert.equal(seatProbe.seats[2], created.data.you);

    const roomPath = `/api/remote/rooms/${created.data.code}`,
      afterSocketCommand = await request(base, roomPath, {
        token: created.data.key,
      }),
      revision = afterSocketCommand.data.revision,
      concurrent = await Promise.all([
        request(base, roomPath, {
          method: 'POST',
          token: created.data.key,
          body: {
            type: 'seat',
            seat: 2,
            revision,
            commandId: 'host-seat-command-01',
          },
        }),
        request(base, roomPath, {
          method: 'POST',
          token: joined.data.key,
          body: {
            type: 'seat',
            seat: 0,
            revision,
            commandId: 'guest-seat-command-1',
          },
        }),
      ]);
    assert.deepEqual(
      concurrent
        .map((result) => result.response.status)
        .sort((left, right) => left - right),
      [200, 409],
    );

    const latest = await request(base, roomPath, {
        token: created.data.key,
      }),
      startCommand = {
        type: 'start',
        revision: latest.data.revision,
        commandId: 'remote-start-command-01',
        hauntPlaytest: true,
        playtestFocus: 'basic',
      },
      started = await request(base, roomPath, {
        method: 'POST',
        token: created.data.key,
        body: startCommand,
      }),
      retried = await request(base, roomPath, {
        method: 'POST',
        token: created.data.key,
        body: startCommand,
      });
    assert.equal(started.response.status, 200);
    assert.equal(retried.response.status, 200);
    assert.equal(retried.data.revision, started.data.revision);
    assert(started.data.game);

    const privateProbe = await runSocketProbe({
      base,
      code: created.data.code,
      hostToken: created.data.key,
      guestToken: joined.data.key,
      revision: started.data.revision,
    });
    assert.equal(privateProbe.hostRevision, started.data.revision);
    assert.equal(privateProbe.guestRevision, started.data.revision);
    assert(
      privateProbe.guestHiddenHeroes > 0,
      'guest WebSocket projection exposed the opposing faction',
    );

    await stop(worker);
    worker = launch(port);
    await waitUntilReady(worker, base);
    const restored = await request(base, roomPath, {
      token: created.data.key,
    });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.data.revision, started.data.revision);
    assert.deepEqual(restored.data.game, started.data.game);

    const advanceCommand = {
        type: 'command',
        commandId: 'remote-advance-command',
        expectedRevision: restored.data.revision,
        payload: { type: 'action', action: { type: 'advance' } },
      },
      advanced = await runSocketProbe({
        base,
        code: created.data.code,
        hostToken: created.data.key,
        guestToken: joined.data.key,
        revision: restored.data.revision,
        command: advanceCommand,
      });
    assert.equal(advanced.ackRevision, restored.data.revision + 1);
    assert.equal(advanced.revision, restored.data.revision + 1);

    await stop(worker);
    worker = null;
    await verifyStorage(created.data.code, created.data.key, joined.data.key);
    console.log(
      `Remote Worker verified: room ${created.data.code}, revision ${advanced.revision}, WebSocket sync, restart recovery and SQLite schema passed.`,
    );
  } catch (error) {
    if (worker?.output?.length)
      error.message += `\nWrangler output:\n${worker.output.join('')}`;
    throw error;
  } finally {
    await stop(worker);
    await cleanupPersistedState();
  }
}

await main();
