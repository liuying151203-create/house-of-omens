import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NETWORK_PROTOCOL_VERSION,
  NetworkProtocolError,
  encodeServerMessage,
  parseClientMessage,
} from '../lib/network/network-protocol.mjs';

test('network protocol validates hello and command envelopes', () => {
  const hello = parseClientMessage(
    JSON.stringify({
      type: 'hello',
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      token: 'ab'.repeat(32),
      revision: 7,
      capabilities: ['full-snapshot-v1', 42],
    }),
  );
  assert.deepEqual(hello.capabilities, ['full-snapshot-v1']);

  const command = parseClientMessage(
    JSON.stringify({
      type: 'command',
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      commandId: 'command-0001',
      expectedRevision: 7,
      payload: { type: 'seat', seat: 2 },
    }),
  );
  assert.equal(command.payload.seat, 2);
  assert.deepEqual(JSON.parse(encodeServerMessage('ack', { revision: 8 })), {
    type: 'ack',
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    revision: 8,
  });
});

test('network protocol fails closed for incompatible and malformed messages', () => {
  assert.throws(
    () =>
      parseClientMessage(
        JSON.stringify({
          type: 'hello',
          protocolVersion: NETWORK_PROTOCOL_VERSION + 1,
          token: 'ab'.repeat(32),
          revision: 0,
        }),
      ),
    (error) =>
      error instanceof NetworkProtocolError &&
      error.code === 'upgrade_required' &&
      error.status === 426,
  );
  assert.throws(
    () => parseClientMessage(new Uint8Array()),
    (error) => error.code === 'binary_not_supported',
  );
  assert.throws(
    () =>
      parseClientMessage(
        JSON.stringify({
          type: 'command',
          protocolVersion: NETWORK_PROTOCOL_VERSION,
          commandId: 'short',
          expectedRevision: 1,
          payload: {},
        }),
      ),
    (error) => error.code === 'invalid_command_id',
  );
});
