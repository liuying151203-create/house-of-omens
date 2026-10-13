import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame, SCENARIOS, act, pending } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { automaticRequestCommand } from '../lib/automatic-driver.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const page = fileURLToPath(new URL('../app/page.jsx', import.meta.url));
const bundle = new URL(
  `../outputs/home-runtime-${process.pid}.mjs`,
  import.meta.url,
);
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
after(() => unlink(bundle));

// 只向 Home 的首个空状态注入真实对局；其他组件与 React hooks 保持原实现。
// 这样能覆盖点击开局后的完整页面，不给生产组件增加测试专用参数。
const result = await build({
  stdin: {
    contents:
      "export { default as Home } from './app/page.jsx'; export { setInitialGame } from 'home-fixture'; export { SCENARIOS as renderedScenarios } from './lib/game-data.mjs';",
    resolveDir: root,
  },
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  alias: { '@': root },
  packages: 'external',
  plugins: [
    {
      name: 'home-state-fixture',
      setup(builder) {
        builder.onResolve({ filter: /^(react|home-fixture)$/ }, (args) => {
          if (
            args.path === 'home-fixture' ||
            (args.path === 'react' && args.importer === page)
          )
            return { path: 'home-fixture', namespace: 'home-fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'home-fixture' }, () => ({
          contents: `export * from 'react';
          import { useState as useReactState } from 'react';
          let initialGame;
          export function setInitialGame(game) { initialGame = game; }
          export function useState(value) {
            if (value === null && initialGame) {
              const game = initialGame;
              initialGame = undefined;
              return useReactState(game);
            }
            return useReactState(value);
          }`,
          loader: 'js',
          resolveDir: root,
        }));
      },
    },
  ],
});
await writeFile(bundle, result.outputFiles[0].contents);
const { Home, setInitialGame, renderedScenarios } = await import(bundle.href);
const render = (game) => {
  setInitialGame(game);
  return renderToStaticMarkup(createElement(Home));
};

test('Home renders the lobby and every formal scenario after starting a normal game', () => {
  assert.match(render(null), /本局剧本/);
  for (const scenario of SCENARIOS.filter((entry) => !entry.playtestOnly)) {
    const html = render(createGame(scenario.id, 31, 3));
    assert.match(html, /english-title/);
    assert(html.includes(scenario.title), scenario.id);
    if (scenario.id === 'bloodmoon') assert.match(html, /lucide-moon/);
  }
});

test('Home renders bloodmoon bite, controlled-wolf and silver playtests without an undefined component', () => {
  for (const focus of [
    'bloodmoon-entry',
    'bloodmoon-control',
    'bloodmoon-silver-first',
  ]) {
    let game = createHauntPlaytest('bloodmoon', 31, 3, focus);
    for (let step = 0; step < 40; step++) {
      const html = render(game);
      assert.match(html, /血月之夜/);
      assert.match(html, /top-test-toggle/);
      if (!pending(game)) break;
      game = act(game, automaticRequestCommand(game));
    }
    assert.equal(pending(game), null);
    assert.equal(game.phase, 'haunt');
  }
});

test('Home keeps legacy haunt prompts working and uses a default icon for future scenarios', () => {
  for (const id of ['werewolf', 'bells', 'mirror', 'flood'])
    assert.match(render(createHauntPlaytest(id, 31, 3)), /作祟章节/);
  const future = {
    ...renderedScenarios.find((entry) => entry.id === 'mystery'),
    id: 'future-story',
    title: '新增剧本',
  };
  renderedScenarios.push(future);
  try {
    const game = { ...createGame('mystery', 31, 3), scenario: future.id };
    const html = render(game);
    assert.match(html, /新增剧本/);
    assert.match(html, /lucide-compass/);
  } finally {
    renderedScenarios.pop();
  }
});
