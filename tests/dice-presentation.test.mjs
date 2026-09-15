import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';

// Render the dice body without the browser-only dialog portal. Real React state
// initialization remains in use, including snapshots received before mounting.
const bundle = new URL(
  `../outputs/dice-presentation-${process.pid}.mjs`,
  import.meta.url,
);
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
const built = await build({
  entryPoints: [
    fileURLToPath(new URL('../app/dice-request.jsx', import.meta.url)),
  ],
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
  alias: { '@': fileURLToPath(new URL('../', import.meta.url)) },
  plugins: [
    {
      name: 'dialog-without-portal',
      setup(builder) {
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
          resolveDir: fileURLToPath(new URL('../', import.meta.url)),
        }));
      },
    },
  ],
});
await writeFile(bundle, built.outputFiles[0].contents);
after(() => unlink(bundle));
const { default: DiceRequest } = await import(bundle.href);
const render = (dice, motion = true) =>
  renderToStaticMarkup(
    createElement(DiceRequest, {
      game: {
        queue: [
          {
            uid: 15,
            heroId: 0,
            title: '敌人来袭',
            rolls: [
              {
                id: 'attack',
                label: '狼人攻击',
                count: 3,
                computer: true,
                dice,
              },
              { id: 'defense', label: '人物防御', count: 3, heroId: 0, dice },
            ],
          },
        ],
      },
      send() {},
      net: {},
      motion,
      toggleMotion() {},
      autoRoll: true,
      toggleAuto() {},
    }),
  );

test('an already-rolled enemy snapshot still starts both dice animations before showing totals', () => {
  const html = render([0, 1, 2]);
  assert.equal((html.match(/emoji-dice-row is-rolling/g) || []).length, 2);
  assert.equal((html.match(/rolling-faces/g) || []).length, 6);
  assert.match(html, /等待骰子停稳/);
  assert.doesNotMatch(html, /class="side-total"/);
  assert.doesNotMatch(html, /点数已揭晓/);
});

test('disabling animation reveals totals with an explicit pause before automatic settlement', () => {
  const html = render([0, 1, 2], false);
  assert.doesNotMatch(html, /is-rolling/);
  assert.equal((html.match(/class="side-total"/g) || []).length, 2);
  assert.doesNotMatch(
    html,
    /点数已揭晓，稍后自动结算|检定已自动结算|骰子已停稳/,
  );
});

test('unrolled groups show waiting dice and do not announce settlement', () => {
  const html = render(null);
  assert.equal((html.match(/waiting-die/g) || []).length, 6);
  assert.doesNotMatch(html, /class="side-total"/);
  assert.doesNotMatch(html, /dice-auto-status/);
});
