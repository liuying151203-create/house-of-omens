import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  createRoomState,
  isRoomExpired,
  joinRoomState,
  readRoomState,
  updateRoomState,
} from '../lib/network/room-domain.mjs';
const token = () => randomBytes(24).toString('hex');
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
export function createRoomService({ gameFactory, now = Date.now } = {}) {
  const rooms = new Map();
  const identity = () => ({ id: token().slice(0, 12), key: token() });
  function cleanup() {
    for (const [code, r] of rooms)
      if (isRoomExpired(r, now)) rooms.delete(code);
  }
  function find(code) {
    cleanup();
    const r = rooms.get(String(code).toUpperCase());
    if (!r) fail(404, '房间不存在或已过期。');
    return r;
  }
  const api = {
    create(data) {
      cleanup();
      if (rooms.size >= 100) fail(503, '房间已满，请稍后重试。');
      const count = Number(data.count);
      if (
        ![3, 4, 5, 6].includes(count) ||
        !['mystery', 'werewolf', 'bells', 'mirror', 'flood'].includes(
          data.scenario,
        )
      )
        fail(400, '剧本或人数不正确。');
      let code;
      do {
        code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
      } while (rooms.has(code));
      const { room, response } = createRoomState(data, {
        code,
        identity: identity(),
        now,
      });
      rooms.set(code, room);
      return response;
    },
    join(data) {
      cleanup();
      const r = rooms.get(String(data.code).toUpperCase());
      if (!r) fail(404, '没有找到这个房间。请确认访问的是同一台主机。');
      return joinRoomState(r, data, { identity: identity(), now });
    },
    read(code, key) {
      return readRoomState(find(code), key, { now });
    },
    update(code, key, data) {
      return updateRoomState(find(code), key, data, { gameFactory, now });
    },
  };
  return api;
}
const serverPort = (host) => Number(String(host).split(':').at(-1)) || 4173;
export function createDemoServer({
  file = new URL('../outputs/预兆之屋-demo.html', import.meta.url),
  service = createRoomService(),
} = {}) {
  return http.createServer(async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/network-info' && req.method === 'GET') {
        const port = serverPort(req.headers.host);
        const addresses = Object.values(os.networkInterfaces())
          .flat()
          .filter(
            (e) =>
              e &&
              e.family === 'IPv4' &&
              !e.internal &&
              /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(e.address),
          )
          .map((e) => 'http://' + e.address + ':' + port + '/');
        reply(200, { addresses: [...new Set(addresses)] });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        if (req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (origin.host !== req.headers.host)
            fail(403, '请从游戏主机页面发起操作。');
        }
        const code = url.pathname.split('/')[3],
          key = req.headers.authorization?.replace(/^Bearer /, '');
        if (req.method === 'GET' && code) {
          reply(200, service.read(code, key));
          return;
        }
        if (req.method !== 'POST') fail(405, '不支持此请求。');
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16000) fail(413, '请求过大。');
        }
        const data = JSON.parse(body || '{}');
        const result =
          url.pathname === '/api/rooms'
            ? service.create(data)
            : url.pathname === '/api/join'
              ? service.join(data)
              : code
                ? service.update(code, key, data)
                : fail(404, '接口不存在。');
        reply(200, result);
        return;
      }
      if (!['/', '/index.html'].includes(url.pathname)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const body = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (e) {
      reply(e.status || 400, {
        error: e.status ? e.message : '请求格式不正确，或游戏文件暂不可用。',
      });
    }
  });
}
