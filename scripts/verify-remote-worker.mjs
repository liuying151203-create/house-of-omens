import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
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
  persistPath = path.join(
    root,
    '.wrangler',
    `remote-test-${process.pid}-${Date.now()}`,
  );

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
  const output = [];
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
      persistPath,
      '--local',
      '--show-interactive-dev-session=false',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output.push(String(chunk));
      if (output.join('').length > 30_000) output.shift();
    });
  child.output = output;
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
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

async function verifyStorage(hostToken, guestToken) {
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

  let tables;
  for (const file of files) {
    try {
      const database = new DatabaseSync(file, { readOnly: true });
      const names = database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
        .all()
        .map((row) => row.name);
      database.close();
      if (names.includes('room_state')) {
        tables = names;
        break;
      }
    } catch {}
  }
  assert(tables, 'Could not find the Durable Object SQLite database');
  for (const table of [
    'schema_meta',
    'room_state',
    'players',
    'command_receipts',
    'request_deadlines',
  ])
    assert(tables.includes(table), `Missing SQLite table ${table}`);
}

async function main() {
  await mkdir(persistPath, { recursive: true });
  const port = await freePort(),
    base = `http://127.0.0.1:${port}`;
  let worker;
  try {
    worker = launch(port);
    await waitUntilReady(worker, base);

    const blocked = await fetch(base + '/api/remote/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://other.example',
      },
      body: JSON.stringify({ scenario: 'mirror', count: 3 }),
    });
    assert.equal(blocked.status, 403);

    const created = await request(base, '/api/remote/rooms', {
      method: 'POST',
      body: { name: '房主', scenario: 'mirror', count: 3 },
    });
    assert.equal(created.response.status, 200);
    assert.match(created.data.code, /^[A-Z0-9]{6}$/);
    assert.equal(created.data.key.length, 64);

    const joined = await request(base, '/api/remote/join', {
      method: 'POST',
      body: { name: '访客', code: created.data.code },
    });
    assert.equal(joined.response.status, 200);
    assert.equal(joined.data.players.length, 2);

    const roomPath = `/api/remote/rooms/${created.data.code}`,
      revision = joined.data.revision,
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

    await stop(worker);
    worker = launch(port);
    await waitUntilReady(worker, base);
    const restored = await request(base, roomPath, {
      token: created.data.key,
    });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.data.revision, started.data.revision);
    assert.deepEqual(restored.data.game, started.data.game);

    const advanced = await request(base, roomPath, {
      method: 'POST',
      token: created.data.key,
      body: {
        type: 'action',
        action: { type: 'advance' },
        revision: restored.data.revision,
        commandId: 'remote-advance-command',
      },
    });
    assert.equal(advanced.response.status, 200);
    assert.equal(advanced.data.revision, restored.data.revision + 1);

    await stop(worker);
    worker = null;
    await verifyStorage(created.data.key, joined.data.key);
    console.log(
      `Remote Worker verified: room ${created.data.code}, revision ${advanced.data.revision}, restart recovery and SQLite schema passed.`,
    );
  } catch (error) {
    if (worker?.output?.length)
      error.message += `\nWrangler output:\n${worker.output.join('')}`;
    throw error;
  } finally {
    await stop(worker);
    await rm(persistPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
}

await main();
