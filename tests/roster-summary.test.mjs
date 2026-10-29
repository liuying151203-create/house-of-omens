import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../lib/game-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = new URL(
  `../outputs/roster-summary-${process.pid}.mjs`,
  import.meta.url,
);
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
const built = await build({
  entryPoints: ['app/roster-summary.jsx'],
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
const { default: RosterSummary } = await import(bundle.href);

test('人物简略信息显示有效属性、物品和状态的图标说明', () => {
  const game = createGame('werewolf', 83, 3);
  const hero = game.heroes[0];
  hero.items = ['coffee'];
  hero.statuses = [
    { id: 'test-status', label: '测试状态', description: '状态说明' },
  ];
  const html = renderToStaticMarkup(
    createElement(RosterSummary, { game, hero, visible: true }),
  );
  assert.match(html, /aria-label="力量 \d+"/);
  assert.match(html, /lucide-hand-fist/);
  assert.match(html, /浓缩咖啡/);
  assert.match(html, /测试状态：状态说明/);
  assert.doesNotMatch(html, /trait-track/);
});

test('资料不可见时不会显示隐藏属性和物品', () => {
  const game = createGame('werewolf', 83, 3);
  const hero = game.heroes[0];
  hero.items = ['coffee'];
  const html = renderToStaticMarkup(
    createElement(RosterSummary, { game, hero, visible: false }),
  );
  assert.doesNotMatch(html, /浓缩咖啡|力量 \d+|roster-item/);
});
