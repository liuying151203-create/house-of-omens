export const NETWORK_PROTOCOL_VERSION = 1;
export const MAX_NETWORK_MESSAGE_SIZE = 16_000;

export class NetworkProtocolError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'NetworkProtocolError';
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new NetworkProtocolError(status, code, message);
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseClientMessage(raw) {
  if (typeof raw !== 'string')
    fail(400, 'binary_not_supported', '联机协议仅支持文本消息。');
  if (raw.length > MAX_NETWORK_MESSAGE_SIZE)
    fail(413, 'message_too_large', '联机消息过大。');

  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    fail(400, 'invalid_message', '联机消息格式不正确。');
  }
  if (!isObject(message)) fail(400, 'invalid_message', '联机消息格式不正确。');
  if (message.protocolVersion !== NETWORK_PROTOCOL_VERSION)
    fail(426, 'upgrade_required', '当前游戏版本无法加入该房间，请刷新页面。');

  if (message.type === 'hello') {
    if (!/^[a-f0-9]{64}$/i.test(message.token || ''))
      fail(403, 'invalid_identity', '房间身份已失效，请重新加入。');
    if (
      !Number.isInteger(message.revision) ||
      message.revision < -1 ||
      message.revision > Number.MAX_SAFE_INTEGER
    )
      fail(400, 'invalid_revision', '联机版本号无效。');
    return {
      type: 'hello',
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      token: message.token,
      revision: message.revision,
      capabilities: Array.isArray(message.capabilities)
        ? message.capabilities
            .filter((value) => typeof value === 'string')
            .slice(0, 16)
        : [],
    };
  }

  if (message.type === 'command') {
    if (
      typeof message.commandId !== 'string' ||
      message.commandId.length < 8 ||
      message.commandId.length > 96
    )
      fail(400, 'invalid_command_id', '操作编号无效。');
    if (
      !Number.isInteger(message.expectedRevision) ||
      message.expectedRevision < 0
    )
      fail(400, 'invalid_revision', '联机版本号无效。');
    if (!isObject(message.payload))
      fail(400, 'invalid_command', '操作内容无效。');
    return {
      type: 'command',
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      commandId: message.commandId,
      expectedRevision: message.expectedRevision,
      payload: message.payload,
    };
  }

  if (message.type === 'snapshot')
    return {
      type: 'snapshot',
      protocolVersion: NETWORK_PROTOCOL_VERSION,
    };

  fail(400, 'unknown_message', '不支持的联机消息。');
}

export function encodeServerMessage(type, data = {}) {
  return JSON.stringify({
    type,
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    ...data,
  });
}

export function errorCodeForStatus(status) {
  if (status === 400) return 'invalid_command';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'room_not_found';
  if (status === 409) return 'revision_conflict';
  if (status === 413) return 'message_too_large';
  if (status === 415) return 'unsupported_media_type';
  if (status === 426) return 'upgrade_required';
  if (status === 429) return 'rate_limited';
  return 'server_error';
}
