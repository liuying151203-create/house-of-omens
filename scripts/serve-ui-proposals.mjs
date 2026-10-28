import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.UI_PROPOSAL_PORT || 4175);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    );
  } catch {
    response.writeHead(400).end('无效地址');
    return;
  }
  if (pathname === '/') pathname = '/docs/ui-proposals/index.html';
  const filename = path.resolve(root, `.${pathname}`);
  const allowed =
    pathname === '/public/rooms.png' ||
    ['docs/ui-proposals', 'public/art', 'outputs/ui-proposals'].some(
      (directory) => {
        const base = path.resolve(root, directory);
        return filename.startsWith(`${base}${path.sep}`);
      },
    );
  if (!allowed || !types[path.extname(filename)]) {
    response.writeHead(404).end('未找到预览文件');
    return;
  }
  try {
    const content = await readFile(filename);
    response
      .writeHead(200, {
        'Content-Type': types[path.extname(filename)],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .end(content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR')
      response.writeHead(404).end('未找到预览文件');
    else {
      console.error('设计预览读取失败', { filename, error });
      response.writeHead(500).end('读取失败');
    }
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`界面方向预览：http://127.0.0.1:${port}/`),
);
