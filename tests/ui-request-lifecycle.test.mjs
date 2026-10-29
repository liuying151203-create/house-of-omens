import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, pending } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { broadcastDuration } from '../lib/presentation-requests.mjs';
import { automaticRequestCommand } from '../lib/automatic-driver.mjs';
import { initialMapPresentation } from '../lib/map-presentation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = new URL(
  `../outputs/ui-request-${process.pid}.mjs`,
  import.meta.url,
);
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
after(() => unlink(bundle));
const built = await build({
  stdin: {
    contents: `export {default as Dice} from './app/dice-request.jsx';
    export {default as Broadcast, InternalContinuation} from './app/flow-transition.jsx';
    export {default as MapPresentation} from './app/map-presentation.jsx';
    export {default as DamagePlanner} from './app/damage-planner.jsx';
    export {clearEffects, mountEffects} from 'test-effects';`,
    resolveDir: root,
  },
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  alias: { '@': root },
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
  plugins: [
    {
      name: 'request-lifecycle-fixture',
      setup(builder) {
        builder.onResolve({ filter: /^(react|test-effects)$/ }, (args) => {
          if (
            args.path === 'test-effects' ||
            (args.path === 'react' && args.namespace !== 'test-effects')
          )
            return { path: 'test-effects', namespace: 'test-effects' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'test-effects' }, () => ({
          contents: `export * from 'react';
          import {useEffect as nativeEffect} from 'react';
          let effects = [];
          export function clearEffects() { effects = []; }
          export function useEffect(callback, dependencies) {
            nativeEffect(callback, dependencies);
            effects.push(callback);
          }
          export function mountEffects() {
            const cleanups = effects.splice(0).map(callback => callback()).filter(value => typeof value === 'function');
            return () => cleanups.reverse().forEach(cleanup => cleanup());
          }`,
          loader: 'js',
          resolveDir: root,
        }));
        builder.onResolve({ filter: /components\/ui\/dialog$/ }, () => ({
          path: 'dialog',
          namespace: 'test-dialog',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'test-dialog' }, () => ({
          contents: `import {createElement as h} from 'react';
          export const Dialog = ({children}) => children;
          export const DialogContent = ({children,className}) => h('section',{className},children);
          export const DialogTitle = ({children}) => h('h2',null,children);
          export const DialogDescription = ({children}) => h('p',null,children);`,
          loader: 'js',
          resolveDir: root,
        }));
      },
    },
  ],
});
await writeFile(bundle, built.outputFiles[0].contents);
const {
  Dice,
  Broadcast,
  InternalContinuation,
  MapPresentation,
  DamagePlanner,
  clearEffects,
  mountEffects,
} = await import(bundle.href);
const render = (component, props) => {
  clearEffects();
  return renderToStaticMarkup(createElement(component, props));
};

test('map trigger reuses the read-only broadcast and damage explains its card without preallocating tracks', () => {
  let game = createHauntPlaytest('bloodmoon', 31, 3, 'bloodmoon-pursuit-trap');
  while (pending(game)) game = act(game, automaticRequestCommand(game));
  game = act(game, { type: 'move', pos: 'shoot-room-1' });
  const step = initialMapPresentation(game, 0).steps[0];
  const broadcast = render(MapPresentation, {
    presentation: { busy: true, step },
  });
  assert.match(broadcast, /flow-event-lock/);
  assert.match(broadcast, /<output[^>]*aria-live="polite"/);
  assert.match(broadcast, /捕兽夹合拢/);
  assert.doesNotMatch(broadcast, /陷阱触发|事件播报/);
  assert.doesNotMatch(broadcast, /<button|<dialog|role="dialog"/);
  const commands = [];
  const damage = render(DamagePlanner, {
    game,
    p: pending(game),
    send: (command) => commands.push(command),
  });
  assert.match(damage, /伤害原因与规则/);
  assert.match(damage, /踩中敌方捕兽夹/);
  assert.match(damage, /本回合停止移动/);
  assert.doesNotMatch(damage, /首名移动进入|分配0点，下降0格/);
  assert.equal((damage.match(/class="before after "/g) || []).length, 2);
  assert.match(damage, /还需分配 <strong>2<\/strong>/);
  assert.match(damage, /<button[^>]*class="gold-button"[^>]*disabled/);
  assert.deepEqual(commands, []);
});
const diceProps = (send, dice = [0, 1, 2], extra = {}) => ({
  game: {
    queue: [
      {
        uid: 15,
        heroId: 0,
        title: '检定',
        rolls: [{ id: 'side-0', heroId: 0, count: 3, dice }],
      },
    ],
  },
  send,
  net: {},
  motion: false,
  autoRoll: true,
  toggleAuto() {},
  toggleMotion() {},
  ...extra,
});

test('rolled dice never auto-resolve even with auto-roll enabled and a long wait', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commands = [];
  const html = render(
    Dice,
    diceProps((command) => commands.push(command)),
  );
  const cleanup = mountEffects();
  try {
    t.mock.timers.tick(30_000);
    assert.deepEqual(commands, []);
    assert.match(html, /确认骰子结果/);
    assert.doesNotMatch(
      html.match(/<button[^>]*class="gold-button"[^>]*>/)?.[0] || '',
      /disabled/,
    );
  } finally {
    cleanup();
  }
});

test('automatic throws bind the request and cancel when the dice window unmounts', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commands = [];
  render(
    Dice,
    diceProps((command) => commands.push(command), null),
  );
  let cleanup = mountEffects();
  t.mock.timers.tick(750);
  assert.deepEqual(commands, [
    { type: 'rollAll', requestId: 15, sideIds: ['side-0'] },
  ]);
  cleanup();
  commands.length = 0;
  render(
    Dice,
    diceProps((command) => commands.push(command), null),
  );
  cleanup = mountEffects();
  cleanup();
  t.mock.timers.tick(30_000);
  assert.deepEqual(commands, []);
});

test('another player can inspect rolled dice but cannot confirm the result', () => {
  const html = render(
    Dice,
    diceProps(() => {}, [0, 1, 2], {
      net: {
        room: { you: 'guest', hostId: 'host', seats: ['host'], players: [] },
      },
    }),
  );
  assert.match(html, /等待对方确认/);
  assert.match(
    html.match(/<button[^>]*class="gold-button"[^>]*>/)?.[0] || '',
    /disabled/,
  );
});

test('read-only broadcasts advance exactly their own request and cancel on unmount', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commands = [];
  const request = { uid: 31, kind: 'turnStart', title: '角色交接' };
  const html = render(Broadcast, {
    request,
    send: (command) => commands.push(command),
    locked: false,
  });
  let cleanup = mountEffects();
  t.mock.timers.tick(broadcastDuration(request) - 1);
  assert.deepEqual(commands, []);
  t.mock.timers.tick(1);
  t.mock.timers.tick(30_000);
  assert.deepEqual(commands, [{ type: 'advance', requestId: 31 }]);
  assert.match(html, /<output[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.doesNotMatch(html, /<button|dialog-content/);
  cleanup();
  commands.length = 0;
  render(Broadcast, {
    request,
    send: (command) => commands.push(command),
    locked: false,
  });
  cleanup = mountEffects();
  cleanup();
  t.mock.timers.tick(30_000);
  assert.deepEqual(commands, []);
});

test('internal continuations remain silent and a waiting player never advances them', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commands = [];
  assert.equal(
    render(InternalContinuation, {
      requestId: 40,
      send: (command) => commands.push(command),
      locked: true,
    }),
    '',
  );
  let cleanup = mountEffects();
  t.mock.timers.tick(30_000);
  assert.deepEqual(commands, []);
  cleanup();
  render(InternalContinuation, {
    requestId: 40,
    send: (command) => commands.push(command),
    locked: false,
  });
  cleanup = mountEffects();
  t.mock.timers.tick(0);
  assert.deepEqual(commands, [{ type: 'advance', requestId: 40 }]);
  cleanup();
});

test('completed broadcasts have no interaction shield or waiting message and keep a scoped expiry', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const request = {
    uid: 42,
    kind: 'itemUse',
    title: '使用咖啡',
    text: '移动力已增加。',
  };
  const commands = [];
  const html = render(Broadcast, {
    request,
    blocksActions: false,
    locked: false,
    send: (command) => commands.push(command),
  });
  const cleanup = mountEffects();
  assert.match(html, /flow-event-passive/);
  assert.doesNotMatch(html, /flow-event-lock|等待当前玩家/);
  t.mock.timers.tick(broadcastDuration(request));
  assert.deepEqual(commands, [{ type: 'advance', requestId: request.uid }]);
  cleanup();
  const other = render(Broadcast, {
    request,
    blocksActions: false,
    locked: true,
    send() {},
  });
  assert.doesNotMatch(other, /等待当前玩家/);
});

test('the engine rejects delayed throw and advance commands after a request changes', () => {
  let game = createHauntPlaytest('bloodmoon', 31, 3, 'bloodmoon-control');
  while (pending(game))
    game = act(game, { type: 'advance', requestId: pending(game).uid });
  game = act(game, { type: 'actorAttack', targetId: 1 });
  const oldId = pending(game).uid;
  const replaced = structuredClone(game);
  replaced.queue[0].uid++;
  for (const command of [
    { type: 'rollAll', sideIds: ['side-0'] },
    { type: 'rollDice', sideId: 'side-0' },
    { type: 'advance' },
  ])
    assert.equal(act(replaced, { ...command, requestId: oldId }), replaced);
  assert(
    act(replaced, { type: 'rollAll' }).queue[0].rolls.every(
      (group) => group.dice,
    ),
  );
});
