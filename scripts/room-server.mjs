import { rollOwner } from '../lib/roll-ownership.mjs';
import { createHauntPlaytest, playtestPresets } from '../lib/playtest.mjs';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { projectGameForPlayer } from '../lib/engine/projection.mjs';
import {
  act,
  createGame,
  pending,
  living,
  supportsCommand,
  commandHeroId,
} from '../lib/game-engine.mjs';
const token = () => randomBytes(24).toString('hex');
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
export function createRoomService({
  gameFactory = createGame,
  now = Date.now,
} = {}) {
  const rooms = new Map();
  function cleanup() {
    for (const [code, r] of rooms)
      if (now() - r.updated > 24 * 60 * 60 * 1000) rooms.delete(code);
  }
  function find(code, key) {
    cleanup();
    const r = rooms.get(String(code).toUpperCase());
    if (!r) fail(404, '房间不存在或已过期。');
    const player = r.players.find((p) => p.key === key);
    if (!player) fail(403, '房间身份已失效，请重新加入。');
    return { r, player };
  }
  function snapshot(r, p) {
    const game = projectGameForPlayer(r.game, r, p.id),
      request = game && pending(game),
      deadlineAt = request && r.requestDeadlines.get(request.uid);
    if (request && deadlineAt !== undefined) {
      request.deadlineAt = deadlineAt;
      if (p.id === r.hostId) request.canResolveTimeout = true;
    }
    return {
      code: r.code,
      revision: r.revision,
      hostId: r.hostId,
      you: p.id,
      players: r.players.map(({ id, name }) => ({ id, name })),
      seats: r.seats,
      count: r.count,
      scenario: r.scenario,
      game,
    };
  }
  function syncRequestDeadline(r) {
    const request = r.game && pending(r.game),
      timed =
        request?.kind === 'choiceRequest' &&
        Number.isFinite(request.timeoutMs) &&
        request.timeoutChoice !== undefined;
    for (const requestId of r.requestDeadlines.keys())
      if (!timed || requestId !== request.uid)
        r.requestDeadlines.delete(requestId);
    if (timed && !r.requestDeadlines.has(request.uid))
      r.requestDeadlines.set(request.uid, now() + request.timeoutMs);
  }
  function settleExpiredChoice(r) {
    const request = r.game && pending(r.game),
      deadline = request && r.requestDeadlines.get(request.uid);
    if (
      request?.kind !== 'choiceRequest' ||
      request.timeoutChoice === undefined ||
      deadline === undefined ||
      now() < deadline
    )
      return false;
    r.game = act(r.game, {
      type: 'resolveChoice',
      requestId: request.uid,
      choice: request.timeoutChoice,
    });
    syncRequestDeadline(r);
    bump(r);
    return true;
  }
  function bump(r) {
    r.revision++;
    r.updated = now();
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
      const p = {
          id: token().slice(0, 12),
          key: token(),
          name: String(data.name || '房主').slice(0, 24),
        },
        r = {
          code,
          hostId: p.id,
          count,
          scenario: data.scenario,
          players: [p],
          seats: Array(count).fill(null),
          game: null,
          commands: new Map(),
          requestDeadlines: new Map(),
          revision: 1,
          updated: now(),
        };
      r.seats[0] = p.id;
      rooms.set(code, r);
      return { ...snapshot(r, p), key: p.key };
    },
    join(data) {
      cleanup();
      const r = rooms.get(String(data.code).toUpperCase());
      if (!r) fail(404, '没有找到这个房间。请确认访问的是同一台主机。');
      if (r.game) fail(409, '对局已开始；已有玩家可用本浏览器重连。');
      if (r.players.length >= r.count) fail(409, '房间人数已满。');
      const p = {
        id: token().slice(0, 12),
        key: token(),
        name: String(data.name || '探险者').slice(0, 24),
      };
      r.players.push(p);
      const seat = r.seats.indexOf(null);
      if (seat >= 0) r.seats[seat] = p.id;
      bump(r);
      return { ...snapshot(r, p), key: p.key };
    },
    read(code, key) {
      const { r, player } = find(code, key);
      settleExpiredChoice(r);
      return snapshot(r, player);
    },
    update(code, key, data) {
      const { r, player } = find(code, key);
      if (
        data.commandId !== undefined &&
        (typeof data.commandId !== 'string' ||
          data.commandId.length < 8 ||
          data.commandId.length > 96)
      )
        fail(400, '操作编号无效。');
      const commandKey = data.commandId
          ? `${player.id}:${data.commandId}`
          : null,
        fingerprint = commandKey
          ? JSON.stringify({
              ...data,
              revision: undefined,
              commandId: undefined,
            })
          : null,
        previous = commandKey ? r.commands.get(commandKey) : null;
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail(409, '同一操作编号不能用于不同动作。');
        return structuredClone(previous.response);
      }
      if (data.action?.type !== 'timeoutChoice') settleExpiredChoice(r);
      if (data.revision !== r.revision)
        fail(409, '另一位玩家刚刚操作过，已刷新对局，请重试。');
      if (data.type === 'seat') {
        if (r.game) fail(409, '开局后无法更换座位。');
        if (
          !Number.isInteger(data.seat) ||
          data.seat < 0 ||
          data.seat >= r.count
        )
          fail(400, '座位无效。');
        const currentSeat = r.seats.indexOf(player.id),
          targetOwner = r.seats[data.seat];
        if (targetOwner === player.id) {
          // Re-selecting your current explorer is harmless.
        } else if (targetOwner) {
          if (currentSeat < 0) fail(409, '请先选择一个空闲角色。');
          r.seats[currentSeat] = targetOwner;
          r.seats[data.seat] = player.id;
        } else {
          if (currentSeat >= 0) r.seats[currentSeat] = null;
          r.seats[data.seat] = player.id;
        }
      } else if (data.type === 'start') {
        if (player.id !== r.hostId) fail(403, '由房主开始游戏。');
        if (r.game) fail(409, '已经开局。');
        if (r.players.length < 2) fail(409, '至少邀请另一位玩家加入。');
        if (data.hauntPlaytest === true && r.scenario === 'mystery')
          fail(400, '快速测试需要先指定剧本，请重新创建定向试玩房间。');
        if (
          data.hauntPlaytest === true &&
          !playtestPresets(r.scenario).some(
            (p) => p.id === (data.playtestFocus ?? 'basic'),
          )
        )
          fail(400, '此剧本不支持所选测试场景。');
        r.game =
          data.hauntPlaytest === true
            ? createHauntPlaytest(
                r.scenario,
                now(),
                r.count,
                data.playtestFocus ?? 'basic',
              )
            : gameFactory(r.scenario, now(), r.count);
      } else if (data.type === 'action') {
        if (!r.game) fail(409, '对局尚未开始。');
        let a = data.action;
        if (!supportsCommand(r.game, a)) fail(400, '不支持的操作。');
        let timedOut = false;
        if (a.type === 'timeoutChoice') {
          const request = pending(r.game),
            deadline = request && r.requestDeadlines.get(request.uid);
          if (player.id !== r.hostId) fail(403, '等待房主处理超时选择。');
          if (
            request?.kind !== 'choiceRequest' ||
            request.uid !== a.requestId ||
            request.timeoutChoice === undefined ||
            deadline === undefined
          )
            fail(409, '当前没有可超时跳过的选择。');
          if (now() < deadline) fail(409, '选择仍在等待时间内。');
          a = {
            type: 'resolveChoice',
            requestId: request.uid,
            choice: request.timeoutChoice,
          };
          timedOut = true;
        }
        const activeOwner = r.seats[r.game.active] || r.hostId;
        if (a.type === 'select' && activeOwner !== player.id)
          fail(403, '请等当前玩家结束行动后再切换角色。');
        const p = pending(r.game),
          heroId = commandHeroId(r.game, a),
          owner = r.seats[heroId] || r.hostId;
        const global =
          p &&
          p.heroId === undefined &&
          p.kind !== 'placement' &&
          p.kind !== 'damage';
        if (
          p?.kind === 'diceRequest' &&
          ['rollDice', 'rollAll'].includes(a.type)
        ) {
          const ids = a.type === 'rollDice' ? [a.sideId] : a.sideIds;
          if (
            !Array.isArray(ids) ||
            !ids.length ||
            ids.some((id) => {
              const side = p.rolls.find((r) => r.id === id);
              return !side || rollOwner(r, side) !== player.id;
            })
          )
            fail(403, '只能投掷由你负责的骰子。');
        } else if (a.type === 'endRound' || global) {
          if (player.id !== r.hostId) fail(403, '等待房主确认。');
        } else if (!timedOut && owner !== player.id)
          fail(403, '请等待当前角色的玩家操作。');
        if (
          a.type === 'select' &&
          !living(r.game).some((h) => h.id === a.id && !h.ended)
        )
          fail(400, '这个角色本回合不能行动。');
        const next = act(r.game, a);
        if (JSON.stringify(next) === JSON.stringify(r.game))
          fail(400, '当前不能执行这个动作。');
        r.game = next;
      } else fail(400, '未知操作。');
      syncRequestDeadline(r);
      bump(r);
      const response = snapshot(r, player);
      if (commandKey) {
        r.commands.set(commandKey, {
          fingerprint,
          response: structuredClone(response),
        });
        while (r.commands.size > 256)
          r.commands.delete(r.commands.keys().next().value);
      }
      return response;
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
