import { DurableObject } from 'cloudflare:workers';
import {
  ROOM_TTL_MS,
  RoomDomainError,
  createRoomState,
  joinRoomState,
  projectRoomStateForPlayer,
  readRoomState,
  updateRoomState,
} from './room-domain.mjs';
import {
  NETWORK_PROTOCOL_VERSION,
  NetworkProtocolError,
  encodeServerMessage,
  errorCodeForStatus,
  parseClientMessage,
} from './network-protocol.mjs';
import {
  REMOTE_ROOM_SCHEMA_VERSION,
  composeRoomState,
  decomposeRoomState,
} from './room-persistence.mjs';
import { randomHex, sha256Hex } from './remote-crypto.mjs';

const ROOM_NOT_FOUND = '房间不存在或已过期。';

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function readBearer(request) {
  const authorization = request.headers.get('Authorization') || '';
  return authorization.replace(/^Bearer\s+/i, '');
}

async function readJson(request) {
  const body = await request.text();
  if (body.length > 16_000) throw new RoomDomainError(413, '请求过大。');
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new RoomDomainError(400, '请求格式不正确。');
  }
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.operationTail = Promise.resolve();
    this.restoreWebSockets();
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  restoreWebSockets() {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (
        !attachment ||
        typeof attachment.connectionId !== 'string' ||
        (attachment.playerId !== null &&
          typeof attachment.playerId !== 'string')
      )
        socket.close(1008, '连接信息无效');
    }
  }

  serialize(operation) {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  migrate() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      version INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS room_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      room_state_version INTEGER NOT NULL,
      game_version INTEGER,
      revision INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      state_json TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
      player_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      joined_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS command_receipts (
      player_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      revision INTEGER NOT NULL,
      PRIMARY KEY (player_id, command_id)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS request_deadlines (
      request_id TEXT PRIMARY KEY,
      deadline_at INTEGER NOT NULL
    )`);
    this.sql.exec(
      'INSERT OR IGNORE INTO schema_meta (singleton, version) VALUES (1, ?)',
      REMOTE_ROOM_SCHEMA_VERSION,
    );
    const schema = this.sql
      .exec('SELECT version FROM schema_meta WHERE singleton = 1')
      .one();
    if (schema.version !== REMOTE_ROOM_SCHEMA_VERSION)
      throw new Error(`Unsupported remote room schema ${schema.version}`);
    this.sql.exec('PRAGMA optimize');
  }

  clearRoom() {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM request_deadlines');
      this.sql.exec('DELETE FROM command_receipts');
      this.sql.exec('DELETE FROM players');
      this.sql.exec('DELETE FROM room_state');
    });
  }

  loadRoom({ allowExpired = false } = {}) {
    const rows = this.sql
      .exec(`SELECT room_state_version, game_version, revision,
        updated_at, expires_at, state_json
        FROM room_state WHERE singleton = 1`)
      .toArray();
    if (!rows.length) return null;
    const row = rows[0];
    if (!allowExpired && Date.now() >= row.expires_at) {
      this.clearRoom();
      return null;
    }
    const players = this.sql
        .exec(
          'SELECT player_id, name, token_hash FROM players ORDER BY joined_at, player_id',
        )
        .toArray()
        .map((player) => ({
          playerId: player.player_id,
          name: player.name,
          tokenHash: player.token_hash,
        })),
      receipts = this.sql
        .exec(`SELECT player_id, command_id, fingerprint, revision
          FROM command_receipts ORDER BY revision, player_id, command_id`)
        .toArray()
        .map((receipt) => ({
          playerId: receipt.player_id,
          commandId: receipt.command_id,
          fingerprint: receipt.fingerprint,
          revision: receipt.revision,
        })),
      deadlines = this.sql
        .exec(
          'SELECT request_id, deadline_at FROM request_deadlines ORDER BY request_id',
        )
        .toArray()
        .map((deadline) => ({
          requestId: deadline.request_id,
          deadlineAt: deadline.deadline_at,
        })),
      room = composeRoomState({
        stateJson: row.state_json,
        players,
        receipts,
        deadlines,
      });
    if (!room) throw new Error('Stored room state is invalid');
    return {
      room,
      migrated: (room.game?.version ?? null) !== row.game_version,
    };
  }

  async saveRoom(room) {
    const stored = decomposeRoomState(room);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO room_state (
          singleton, room_state_version, game_version, revision,
          updated_at, expires_at, state_json
        ) VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (singleton) DO UPDATE SET
          room_state_version = excluded.room_state_version,
          game_version = excluded.game_version,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          state_json = excluded.state_json`,
        stored.roomStateVersion,
        stored.gameVersion,
        stored.revision,
        stored.updatedAt,
        stored.expiresAt,
        stored.stateJson,
      );
      for (const player of stored.players)
        this.sql.exec(
          `INSERT INTO players (player_id, name, token_hash, joined_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (player_id) DO UPDATE SET
            name = excluded.name,
            token_hash = excluded.token_hash`,
          player.playerId,
          player.name,
          player.tokenHash,
          stored.updatedAt,
        );
      this.sql.exec('DELETE FROM command_receipts');
      for (const receipt of stored.receipts)
        this.sql.exec(
          `INSERT INTO command_receipts (
            player_id, command_id, fingerprint, revision
          ) VALUES (?, ?, ?, ?)`,
          receipt.playerId,
          receipt.commandId,
          receipt.fingerprint,
          receipt.revision,
        );
      this.sql.exec('DELETE FROM request_deadlines');
      for (const deadline of stored.deadlines)
        this.sql.exec(
          'INSERT INTO request_deadlines (request_id, deadline_at) VALUES (?, ?)',
          deadline.requestId,
          deadline.deadlineAt,
        );
    });
    const deadlines = stored.deadlines.map((entry) => entry.deadlineAt),
      nextAlarm = Math.min(stored.expiresAt, ...deadlines);
    await this.ctx.storage.setAlarm(nextAlarm);
  }

  async scheduleRoomAlarm(room) {
    const deadlines = Object.values(room.requestDeadlines).filter(
        Number.isFinite,
      ),
      expiresAt = room.updated + ROOM_TTL_MS;
    await this.ctx.storage.setAlarm(Math.min(expiresAt, ...deadlines));
  }

  send(socket, type, data = {}) {
    socket.send(encodeServerMessage(type, data));
  }

  attachment(socket) {
    const attachment = socket.deserializeAttachment();
    if (
      !attachment ||
      typeof attachment.connectionId !== 'string' ||
      typeof attachment.playerId !== 'string' ||
      attachment.protocolVersion !== NETWORK_PROTOCOL_VERSION
    )
      throw new NetworkProtocolError(
        403,
        'hello_required',
        '请先完成房间身份验证。',
      );
    return attachment;
  }

  broadcastRoom(room, type = 'updated', excludedSocket = null) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludedSocket) continue;
      try {
        const attachment = this.attachment(socket),
          projected = projectRoomStateForPlayer(room, attachment.playerId);
        this.send(socket, type, {
          revision: projected.revision,
          room: projected,
        });
      } catch (error) {
        if (!(error instanceof NetworkProtocolError))
          console.error('GameRoom broadcast failed', error);
      }
    }
  }

  closeWebSockets(code, reason) {
    for (const socket of this.ctx.getWebSockets())
      try {
        socket.close(code, reason);
      } catch {}
  }

  async authenticatedRoom(request) {
    const token = readBearer(request);
    if (!token) throw new RoomDomainError(403, '房间身份已失效，请重新加入。');
    const loaded = this.loadRoom();
    if (!loaded) throw new RoomDomainError(404, ROOM_NOT_FOUND);
    return { ...loaded, tokenHash: await sha256Hex(token) };
  }

  fetch(request) {
    return this.serialize(() => this.handleRequest(request));
  }

  async handleRequest(request) {
    try {
      const path = new URL(request.url).pathname,
        code = request.headers.get('X-Room-Code') || '';
      if (path.endsWith('/socket') && request.method === 'GET') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
          return json({ error: '请使用 WebSocket 连接。' }, 426);
        if (!this.loadRoom()) throw new RoomDomainError(404, ROOM_NOT_FOUND);
        const pair = new WebSocketPair(),
          [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({
          connectionId: randomHex(8),
          playerId: null,
          protocolVersion: null,
          lastAckRevision: -1,
        });
        return new Response(null, { status: 101, webSocket: client });
      }
      if (path === '/internal/create' && request.method === 'POST') {
        if (this.loadRoom()) throw new RoomDomainError(409, '房间码已被占用。');
        const data = await readJson(request),
          rawKey = randomHex(),
          { room, response } = createRoomState(data, {
            code,
            identity: { id: randomHex(12), key: rawKey },
          });
        room.players[0].key = await sha256Hex(rawKey);
        await this.saveRoom(room);
        return json(response);
      }
      if (path === '/internal/join' && request.method === 'POST') {
        const loaded = this.loadRoom();
        if (!loaded) throw new RoomDomainError(404, ROOM_NOT_FOUND);
        const data = await readJson(request),
          rawKey = randomHex(),
          response = joinRoomState(loaded.room, data, {
            identity: { id: randomHex(12), key: rawKey },
          });
        loaded.room.players.at(-1).key = await sha256Hex(rawKey);
        await this.saveRoom(loaded.room);
        this.broadcastRoom(loaded.room);
        return json(response);
      }
      if (path === '/internal/room' && request.method === 'GET') {
        const { room, tokenHash, migrated } =
            await this.authenticatedRoom(request),
          revision = room.revision,
          response = readRoomState(room, tokenHash);
        if (migrated || room.revision !== revision) {
          await this.saveRoom(room);
          this.broadcastRoom(room);
        }
        return json(response);
      }
      if (path === '/internal/command' && request.method === 'POST') {
        const { room, tokenHash } = await this.authenticatedRoom(request),
          data = await readJson(request),
          revision = room.revision,
          response = updateRoomState(room, tokenHash, data);
        if (room.revision !== revision) {
          await this.saveRoom(room);
          this.broadcastRoom(room);
        }
        return json(response);
      }
      return json({ error: '接口不存在。' }, 404);
    } catch (error) {
      if (error instanceof RoomDomainError)
        return json({ error: error.message }, error.status);
      console.error('GameRoom request failed', error);
      return json({ error: '远程房间暂时不可用，请稍后重试。' }, 500);
    }
  }

  webSocketMessage(socket, rawMessage) {
    return this.serialize(() =>
      this.handleWebSocketMessage(socket, rawMessage),
    );
  }

  async handleWebSocketMessage(socket, rawMessage) {
    let message;
    try {
      message = parseClientMessage(rawMessage);
      if (message.type === 'hello') {
        await this.handleWebSocketHello(socket, message);
        return;
      }

      const attachment = this.attachment(socket),
        loaded = this.loadRoom();
      if (!loaded) throw new RoomDomainError(404, ROOM_NOT_FOUND);

      if (message.type === 'snapshot') {
        const projected = projectRoomStateForPlayer(
          loaded.room,
          attachment.playerId,
        );
        this.send(socket, 'snapshot', {
          revision: projected.revision,
          room: projected,
        });
        return;
      }

      const player = loaded.room.players.find(
        (candidate) => candidate.id === attachment.playerId,
      );
      if (!player)
        throw new RoomDomainError(403, '房间身份已失效，请重新加入。');
      const commandKey = `${player.id}:${message.commandId}`,
        previous = loaded.room.commandReceipts.find(
          (receipt) => receipt.key === commandKey,
        ),
        revision = loaded.room.revision,
        response = updateRoomState(loaded.room, player.key, {
          ...message.payload,
          revision: message.expectedRevision,
          commandId: message.commandId,
        }),
        executedRevision = previous?.revision ?? response.revision;
      if (loaded.room.revision !== revision) await this.saveRoom(loaded.room);
      socket.serializeAttachment({
        ...attachment,
        lastAckRevision: executedRevision,
      });
      this.send(socket, 'ack', {
        commandId: message.commandId,
        revision: executedRevision,
      });
      if (loaded.room.revision !== revision)
        this.broadcastRoom(loaded.room, 'updated');
    } catch (error) {
      this.sendWebSocketError(socket, error, message?.commandId);
    }
  }

  async handleWebSocketHello(socket, message) {
    const loaded = this.loadRoom();
    if (!loaded) throw new RoomDomainError(404, ROOM_NOT_FOUND);
    const revision = loaded.room.revision,
      tokenHash = await sha256Hex(message.token),
      projected = readRoomState(loaded.room, tokenHash),
      previousAttachment = socket.deserializeAttachment(),
      connectionId = previousAttachment?.connectionId || randomHex(8);
    if (loaded.migrated || loaded.room.revision !== revision)
      await this.saveRoom(loaded.room);
    socket.serializeAttachment({
      connectionId,
      playerId: projected.you,
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      lastAckRevision: Math.min(message.revision, projected.revision),
    });
    this.send(socket, 'ready', {
      connectionId,
      revision: projected.revision,
      resumed: message.revision === projected.revision,
    });
    this.send(socket, 'snapshot', {
      revision: projected.revision,
      room: projected,
    });
    if (loaded.room.revision !== revision)
      this.broadcastRoom(loaded.room, 'updated', socket);
  }

  sendWebSocketError(socket, error, commandId) {
    let currentRevision = null;
    try {
      currentRevision = this.loadRoom()?.room.revision ?? null;
    } catch {}
    const status =
        error instanceof RoomDomainError ||
        error instanceof NetworkProtocolError
          ? error.status
          : 500,
      code =
        error instanceof NetworkProtocolError
          ? error.code
          : errorCodeForStatus(status),
      message =
        status === 500 ? '远程房间暂时不可用，请稍后重试。' : error.message;
    if (status === 500) console.error('GameRoom WebSocket failed', error);
    try {
      this.send(
        socket,
        code === 'upgrade_required' ? 'upgrade_required' : 'error',
        {
          code,
          status,
          message,
          commandId,
          revision: currentRevision,
        },
      );
      if ([403, 404, 413, 426].includes(status)) socket.close(1008, message);
    } catch {}
  }

  webSocketClose(socket, code, reason) {
    try {
      socket.close(code, reason);
    } catch {}
  }

  webSocketError(socket) {
    try {
      socket.close(1011, '连接异常');
    } catch {}
  }

  alarm() {
    return this.serialize(() => this.handleAlarm());
  }

  async handleAlarm() {
    const loaded = this.loadRoom({ allowExpired: true });
    if (!loaded) return;
    const expiresAt = loaded.room.updated + ROOM_TTL_MS;
    if (Date.now() >= expiresAt) {
      this.clearRoom();
      this.closeWebSockets(1001, '房间已过期');
      return;
    }
    const revision = loaded.room.revision,
      host = loaded.room.players.find(
        (player) => player.id === loaded.room.hostId,
      );
    if (host) readRoomState(loaded.room, host.key);
    if (loaded.room.revision !== revision) {
      await this.saveRoom(loaded.room);
      this.broadcastRoom(loaded.room);
    } else await this.scheduleRoomAlarm(loaded.room);
  }
}
