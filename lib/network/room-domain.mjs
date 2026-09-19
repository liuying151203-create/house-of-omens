import { projectGameForPlayer } from '../engine/projection.mjs';
import {
  act,
  commandHeroId,
  createGame,
  living,
  pending,
  restoreGameSave,
  supportsCommand,
} from '../game-engine.mjs';
import { createHauntPlaytest, playtestPresets } from '../playtest.mjs';
import { rollOwner } from '../roll-ownership.mjs';
import { NETWORK_PROTOCOL_VERSION } from './network-protocol.mjs';

export { NETWORK_PROTOCOL_VERSION } from './network-protocol.mjs';
export const ROOM_STATE_VERSION = 1;
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

const ROOM_SCENARIOS = new Set([
  'mystery',
  'werewolf',
  'bells',
  'mirror',
  'flood',
]);
const MAX_COMMAND_RECEIPTS = 256;

export class RoomDomainError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RoomDomainError';
    this.status = status;
  }
}

function fail(status, message) {
  throw new RoomDomainError(status, message);
}

function playerFromIdentity(data, identity, fallbackName) {
  if (!identity?.id || !identity?.key) fail(500, '无法创建房间身份。');
  return {
    id: identity.id,
    key: identity.key,
    name: String(data.name || fallbackName).slice(0, 24),
  };
}

function findPlayer(room, key) {
  const player = room.players.find((candidate) => candidate.key === key);
  if (!player) fail(403, '房间身份已失效，请重新加入。');
  return player;
}

function requestDeadline(room, requestId) {
  return room.requestDeadlines[String(requestId)];
}

function snapshot(room, player) {
  const game = projectGameForPlayer(room.game, room, player.id),
    request = game && pending(game),
    deadlineAt = request && requestDeadline(room, request.uid);
  if (request && deadlineAt !== undefined) {
    request.deadlineAt = deadlineAt;
    if (player.id === room.hostId) request.canResolveTimeout = true;
  }
  return {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    code: room.code,
    revision: room.revision,
    hostId: room.hostId,
    you: player.id,
    players: room.players.map(({ id, name }) => ({ id, name })),
    seats: room.seats,
    count: room.count,
    scenario: room.scenario,
    game,
  };
}

export function projectRoomStateForPlayer(room, playerId) {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) fail(403, '房间身份已失效，请重新加入。');
  return snapshot(room, player);
}

function bump(room, now) {
  room.revision++;
  room.updated = now();
}

function syncRequestDeadline(room, now) {
  const request = room.game && pending(room.game),
    timed =
      request?.kind === 'choiceRequest' &&
      Number.isFinite(request.timeoutMs) &&
      request.timeoutChoice !== undefined;
  for (const requestId of Object.keys(room.requestDeadlines))
    if (!timed || requestId !== String(request.uid))
      delete room.requestDeadlines[requestId];
  if (timed && requestDeadline(room, request.uid) === undefined)
    room.requestDeadlines[String(request.uid)] = now() + request.timeoutMs;
}

function settleExpiredChoice(room, now) {
  const request = room.game && pending(room.game),
    deadline = request && requestDeadline(room, request.uid);
  if (
    request?.kind !== 'choiceRequest' ||
    request.timeoutChoice === undefined ||
    deadline === undefined ||
    now() < deadline
  )
    return false;
  room.game = act(room.game, {
    type: 'resolveChoice',
    requestId: request.uid,
    choice: request.timeoutChoice,
  });
  syncRequestDeadline(room, now);
  bump(room, now);
  return true;
}

function commandFingerprint(data) {
  return JSON.stringify({
    ...data,
    revision: undefined,
    commandId: undefined,
  });
}

function rememberCommand(room, key, fingerprint) {
  room.commandReceipts.push({ key, fingerprint, revision: room.revision });
  if (room.commandReceipts.length > MAX_COMMAND_RECEIPTS)
    room.commandReceipts.splice(
      0,
      room.commandReceipts.length - MAX_COMMAND_RECEIPTS,
    );
}

export function createRoomState(data, { code, identity, now = Date.now } = {}) {
  const count = Number(data.count);
  if (![3, 4, 5, 6].includes(count) || !ROOM_SCENARIOS.has(data.scenario))
    fail(400, '剧本或人数不正确。');
  if (!/^[A-Z0-9]{6}$/.test(code || '')) fail(500, '房间码无效。');
  const player = playerFromIdentity(data, identity, '房主'),
    room = {
      roomStateVersion: ROOM_STATE_VERSION,
      code,
      hostId: player.id,
      count,
      scenario: data.scenario,
      players: [player],
      seats: Array(count).fill(null),
      game: null,
      commandReceipts: [],
      requestDeadlines: {},
      revision: 1,
      updated: now(),
    };
  room.seats[0] = player.id;
  return { room, response: { ...snapshot(room, player), key: player.key } };
}

export function joinRoomState(room, data, { identity, now = Date.now } = {}) {
  if (room.game) fail(409, '对局已开始；已有玩家可用本浏览器重连。');
  if (room.players.length >= room.count) fail(409, '房间人数已满。');
  const player = playerFromIdentity(data, identity, '探险者');
  room.players.push(player);
  const seat = room.seats.indexOf(null);
  if (seat >= 0) room.seats[seat] = player.id;
  bump(room, now);
  return { ...snapshot(room, player), key: player.key };
}

export function readRoomState(room, key, { now = Date.now } = {}) {
  const player = findPlayer(room, key);
  settleExpiredChoice(room, now);
  return snapshot(room, player);
}

export function updateRoomState(
  room,
  key,
  data,
  { gameFactory = createGame, now = Date.now } = {},
) {
  const player = findPlayer(room, key);
  if (
    data.commandId !== undefined &&
    (typeof data.commandId !== 'string' ||
      data.commandId.length < 8 ||
      data.commandId.length > 96)
  )
    fail(400, '操作编号无效。');
  const commandKey = data.commandId ? `${player.id}:${data.commandId}` : null,
    fingerprint = commandKey ? commandFingerprint(data) : null,
    previous = commandKey
      ? room.commandReceipts.find((receipt) => receipt.key === commandKey)
      : null;
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      fail(409, '同一操作编号不能用于不同动作。');
    return snapshot(room, player);
  }
  if (data.action?.type !== 'timeoutChoice') settleExpiredChoice(room, now);
  if (data.revision !== room.revision)
    fail(409, '另一位玩家刚刚操作过，已刷新对局，请重试。');
  if (data.type === 'seat') {
    if (room.game) fail(409, '开局后无法更换座位。');
    if (
      !Number.isInteger(data.seat) ||
      data.seat < 0 ||
      data.seat >= room.count
    )
      fail(400, '座位无效。');
    const currentSeat = room.seats.indexOf(player.id),
      targetOwner = room.seats[data.seat];
    if (targetOwner === player.id) {
      // Re-selecting your current explorer is harmless.
    } else if (targetOwner) {
      if (currentSeat < 0) fail(409, '请先选择一个空闲角色。');
      room.seats[currentSeat] = targetOwner;
      room.seats[data.seat] = player.id;
    } else {
      if (currentSeat >= 0) room.seats[currentSeat] = null;
      room.seats[data.seat] = player.id;
    }
  } else if (data.type === 'start') {
    if (player.id !== room.hostId) fail(403, '由房主开始游戏。');
    if (room.game) fail(409, '已经开局。');
    if (room.players.length < 2) fail(409, '至少邀请另一位玩家加入。');
    if (data.hauntPlaytest === true && room.scenario === 'mystery')
      fail(400, '快速测试需要先指定剧本，请重新创建定向试玩房间。');
    if (
      data.hauntPlaytest === true &&
      !playtestPresets(room.scenario).some(
        (preset) => preset.id === (data.playtestFocus ?? 'basic'),
      )
    )
      fail(400, '此剧本不支持所选测试场景。');
    room.game =
      data.hauntPlaytest === true
        ? createHauntPlaytest(
            room.scenario,
            now(),
            room.count,
            data.playtestFocus ?? 'basic',
          )
        : gameFactory(room.scenario, now(), room.count);
  } else if (data.type === 'action') {
    if (!room.game) fail(409, '对局尚未开始。');
    let action = data.action;
    if (!supportsCommand(room.game, action)) fail(400, '不支持的操作。');
    let timedOut = false;
    if (action.type === 'timeoutChoice') {
      const request = pending(room.game),
        deadline = request && requestDeadline(room, request.uid);
      if (player.id !== room.hostId) fail(403, '等待房主处理超时选择。');
      if (
        request?.kind !== 'choiceRequest' ||
        request.uid !== action.requestId ||
        request.timeoutChoice === undefined ||
        deadline === undefined
      )
        fail(409, '当前没有可超时跳过的选择。');
      if (now() < deadline) fail(409, '选择仍在等待时间内。');
      action = {
        type: 'resolveChoice',
        requestId: request.uid,
        choice: request.timeoutChoice,
      };
      timedOut = true;
    }
    const activeOwner = room.seats[room.game.active] || room.hostId;
    if (action.type === 'select' && activeOwner !== player.id)
      fail(403, '请等当前玩家结束行动后再切换角色。');
    const request = pending(room.game),
      heroId = commandHeroId(room.game, action),
      owner = room.seats[heroId] || room.hostId,
      globalRequest =
        request &&
        request.heroId === undefined &&
        request.kind !== 'placement' &&
        request.kind !== 'damage';
    if (
      request?.kind === 'diceRequest' &&
      ['rollDice', 'rollAll'].includes(action.type)
    ) {
      const ids = action.type === 'rollDice' ? [action.sideId] : action.sideIds;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.some((id) => {
          const side = request.rolls.find((roll) => roll.id === id);
          return !side || rollOwner(room, side) !== player.id;
        })
      )
        fail(403, '只能投掷由你负责的骰子。');
    } else if (action.type === 'endRound' || globalRequest) {
      if (player.id !== room.hostId) fail(403, '等待房主确认。');
    } else if (!timedOut && owner !== player.id)
      fail(403, '请等待当前角色的玩家操作。');
    if (
      action.type === 'select' &&
      !living(room.game).some((hero) => hero.id === action.id && !hero.ended)
    )
      fail(400, '这个角色本回合不能行动。');
    const next = act(room.game, action);
    if (JSON.stringify(next) === JSON.stringify(room.game))
      fail(400, '当前不能执行这个动作。');
    room.game = next;
  } else fail(400, '未知操作。');
  syncRequestDeadline(room, now);
  bump(room, now);
  if (commandKey) rememberCommand(room, commandKey, fingerprint);
  return snapshot(room, player);
}

export function isRoomExpired(room, now = Date.now) {
  return now() - room.updated > ROOM_TTL_MS;
}

export function restoreRoomState(value) {
  if (!value || typeof value !== 'object') return null;
  const room = structuredClone(value);
  if (
    room.roomStateVersion !== ROOM_STATE_VERSION ||
    !/^[A-Z0-9]{6}$/.test(room.code || '') ||
    !ROOM_SCENARIOS.has(room.scenario) ||
    ![3, 4, 5, 6].includes(room.count) ||
    !Array.isArray(room.players) ||
    !room.players.length ||
    !room.players.every(
      (player) =>
        typeof player?.id === 'string' &&
        typeof player?.key === 'string' &&
        typeof player?.name === 'string',
    ) ||
    !room.players.some((player) => player.id === room.hostId) ||
    !Array.isArray(room.seats) ||
    room.seats.length !== room.count ||
    !Number.isInteger(room.revision) ||
    !Number.isFinite(room.updated)
  )
    return null;
  if (room.game) {
    room.game = restoreGameSave(room.game);
    if (!room.game) return null;
  }
  room.commandReceipts = Array.isArray(room.commandReceipts)
    ? room.commandReceipts.slice(-MAX_COMMAND_RECEIPTS)
    : [];
  room.requestDeadlines =
    room.requestDeadlines && typeof room.requestDeadlines === 'object'
      ? room.requestDeadlines
      : {};
  return room;
}
