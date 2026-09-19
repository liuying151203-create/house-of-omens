import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url)),
  bundle = new URL(
    `../outputs/network-lobby-${process.pid}.mjs`,
    import.meta.url,
  );
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
const built = await build({
  stdin: {
    contents: `export {
      NetworkLobby,
      buildRemoteInviteUrl,
      networkStatusLabel
    } from './app/network.jsx';`,
    resolveDir: root,
  },
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
});
await writeFile(bundle, built.outputFiles[0].contents);
after(() => unlink(bundle));
const { NetworkLobby, buildRemoteInviteUrl, networkStatusLabel } = await import(
  bundle.href
);

function network(overrides = {}) {
  return {
    session: null,
    room: null,
    error: '',
    busy: false,
    connected: false,
    connectionState: 'idle',
    preferredKind: null,
    connect() {},
    update() {},
    retry() {},
    leave() {},
    ...overrides,
  };
}

function room() {
  return {
    code: 'ABC123',
    scenario: 'mystery',
    count: 3,
    revision: 2,
    hostId: 'host',
    you: 'host',
    players: [
      { id: 'host', name: '房主' },
      { id: 'guest', name: '访客' },
    ],
    seats: ['host', 'guest', null],
  };
}

test('network lobby separates remote and LAN entry paths', () => {
  const html = renderToStaticMarkup(
    createElement(NetworkLobby, {
      net: network(),
      scenario: 'mystery',
      count: 3,
      onClose() {},
    }),
  );
  assert.match(html, /远程房间/);
  assert.match(html, /局域网房间/);
  assert.match(html, /创建远程房间/);
  assert.match(html, /加入远程房间/);
});

test('remote room lobby exposes durable status and invitation action', () => {
  const currentRoom = room(),
    html = renderToStaticMarkup(
      createElement(NetworkLobby, {
        net: network({
          session: { code: currentRoom.code, key: 'secret', kind: 'remote' },
          room: currentRoom,
          connected: true,
          connectionState: 'connected',
        }),
        scenario: 'mystery',
        count: 3,
        onClose() {},
      }),
    );
  assert.match(html, /ABC123/);
  assert.match(html, /云端已同步/);
  assert.match(html, /复制邀请链接/);
  assert.match(html, /24 小时/);
});

test('remote invitation contains only public room coordinates', () => {
  const invite = buildRemoteInviteUrl(
    { href: 'https://omens.test/play?theme=dark#game' },
    'ABC123',
  );
  assert.equal(
    invite,
    'https://omens.test/play?theme=dark&network=remote&join=ABC123',
  );
  assert(!invite.includes('secret'));
  assert.equal(networkStatusLabel('remote', 'expired'), '房间已过期');
});
