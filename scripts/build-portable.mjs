import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const out = path.resolve(root, 'outputs/山屋惊魂-demo.html');
await fs.mkdir(path.dirname(out), { recursive: true });
const cssDir = path.resolve('dist/server/_next/static/css');
const styles = await fs.readdir(cssDir);
let css = (
  await Promise.all(
    styles
      .filter((x) => x.endsWith('.css'))
      .map((x) => fs.readFile(path.join(cssDir, x), 'utf8')),
  )
).join('\n');
const mansion =
  'data:image/png;base64,' +
  (await fs.readFile('public/manor.png')).toString('base64');
const rooms =
  'data:image/png;base64,' +
  (await fs.readFile('public/rooms.png')).toString('base64');
css = css.replaceAll('/manor.png', mansion);
const result = await build({
  entryPoints: ['portable-entry.jsx'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  minify: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { '@': root },
  logLevel: 'warning',
});
const js = result.outputFiles[0].text
  .replaceAll('./rooms.png', rooms)
  .replaceAll('</script', '<\\/script');
await fs.writeFile(
  out + '.tmp',
  `<!doctype html><html lang="zh-CN" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>预兆之屋 · 四个午夜故事</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`,
);
await fs.rename(out + '.tmp', out);
console.log('Portable single-file demo created:', out);
console.log('Size:', (await fs.stat(out)).size);
