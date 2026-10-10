import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  canCreateRemoteRoom,
  remoteRolloutStage,
  remoteRoomVisible,
} from '../lib/network/remote-rollout.mjs';
import { resolveGameSet, builtinGameSets } from '../lib/game-sets.mjs';

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
    } from './app/network.jsx';
    export {default as LobbyScreen} from './app/lobby-screen.jsx';
    export {default as GameSetManager} from './app/game-sets.jsx';`,
    resolveDir: root,
  },
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  alias: { '@': root },
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'lucide-react',
    '@base-ui/react/*',
  ],
});
await writeFile(bundle, built.outputFiles[0].contents);
after(() => unlink(bundle));
const {
  NetworkLobby,
  buildRemoteInviteUrl,
  networkStatusLabel,
  LobbyScreen,
  GameSetManager,
} = await import(bundle.href);

const gameSets = (id) => ({
  ready: true,
  sets: builtinGameSets(),
  selectedId: id,
  selected: resolveGameSet(id),
  gameSets: [],
  error: '',
  select() {},
});

test('single-player and network entries expose bloodmoon and block an incompatible game set', () => {
  const base = {
    count: 3,
    choice: 'bloodmoon',
    setChoice() {},
    setCount() {},
    playtestFocus: 'basic',
    setPlaytestFocus() {},
    onStart() {},
  };
  const html = renderToStaticMarkup(
    createElement(LobbyScreen, { ...base, gameSets: gameSets('bloodmoon') }),
  );
  assert.match(html, /aria-label="本局剧本"/);
  assert.match(html, /value="bloodmoon" selected=""/);
  assert.match(html, /血月之夜游戏集/);
  assert.doesNotMatch(html, /entry-start" disabled/);
  const invalid = renderToStaticMarkup(
    createElement(LobbyScreen, { ...base, gameSets: gameSets('classic') }),
  );
  assert.match(invalid, /role="alert"/);
  assert.match(invalid, /血月之夜游戏集缺少必要卡牌/);
  assert.match(invalid, /entry-start" disabled/);
  const networkHtml = renderToStaticMarkup(
    createElement(NetworkLobby, {
      net: network(),
      scenario: 'mystery',
      count: 3,
      gameSets: gameSets('bloodmoon'),
      setScenario() {},
      onClose() {},
    }),
  );
  assert.match(networkHtml, /血月之夜/);
  assert.match(networkHtml, /aria-label="本局剧本"/);
});

test('bloodmoon preset stays read-only and the LAN host sees the formal bite test', () => {
  const html = renderToStaticMarkup(
    createElement(GameSetManager, {
      controller: gameSets('bloodmoon'),
      onClose() {},
    }),
  );
  assert.match(html, /内置预设只读/);
  assert.match(html, /游戏集默认剧本" disabled/);
  const currentRoom = {
    ...room(),
    scenario: 'bloodmoon',
    gameSet: resolveGameSet('bloodmoon'),
  };
  const lobby = renderToStaticMarkup(
    createElement(NetworkLobby, {
      net: network({
        room: currentRoom,
        connected: true,
        connectionState: 'connected',
      }),
      scenario: 'bloodmoon',
      count: 3,
      onClose() {},
    }),
  );
  assert.match(lobby, /咬痕 → 血月正式触发/);
  assert.match(lobby, /全员入座，开始探索/);
});

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

test('network lobby defaults to LAN while remote entry is in preview', () => {
  const html = renderToStaticMarkup(
    createElement(NetworkLobby, {
      net: network(),
      scenario: 'mystery',
      count: 3,
      onClose() {},
    }),
  );
  assert.match(html, /局域网房间/);
  assert.match(html, /创建局域网房间/);
  assert.doesNotMatch(html, /创建远程房间/);
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

test('remote rollout keeps existing rooms accessible after creation closes', () => {
  assert.equal(remoteRolloutStage({}), 'preview');
  assert.equal(remoteRolloutStage({ REMOTE_MULTIPLAYER_STAGE: 'on' }), 'on');
  assert.equal(
    remoteRolloutStage({ REMOTE_MULTIPLAYER_STAGE: 'invalid' }),
    'preview',
  );
  assert.equal(remoteRoomVisible('preview'), false);
  assert.equal(remoteRoomVisible('preview', true), true);
  assert.equal(remoteRoomVisible('off', true), true);
  assert.equal(remoteRoomVisible('on'), true);
  assert.equal(canCreateRemoteRoom({ REMOTE_MULTIPLAYER_STAGE: 'off' }), false);
});
