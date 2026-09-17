import { DurableObject } from 'cloudflare:workers';
import {
  RoomDomainError,
  createRoomState,
  joinRoomState,
  readRoomState,
  updateRoomState,
} from './room-domain.mjs';
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
    ctx.blockConcurrencyWhile(async () => this.migrate());
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
    await this.ctx.storage.setAlarm(stored.expiresAt);
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
        return json(response);
      }
      if (path === '/internal/room' && request.method === 'GET') {
        const { room, tokenHash, migrated } =
            await this.authenticatedRoom(request),
          revision = room.revision,
          response = readRoomState(room, tokenHash);
        if (migrated || room.revision !== revision) await this.saveRoom(room);
        return json(response);
      }
      if (path === '/internal/command' && request.method === 'POST') {
        const { room, tokenHash } = await this.authenticatedRoom(request),
          data = await readJson(request),
          response = updateRoomState(room, tokenHash, data);
        await this.saveRoom(room);
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

  alarm() {
    return this.serialize(() => this.handleAlarm());
  }

  async handleAlarm() {
    const loaded = this.loadRoom({ allowExpired: true });
    if (!loaded) return;
    const expiresAt = loaded.room.updated + 24 * 60 * 60 * 1000;
    if (Date.now() >= expiresAt) this.clearRoom();
    else await this.ctx.storage.setAlarm(expiresAt);
  }
}
