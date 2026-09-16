import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automaticRequestCommand,
  drivePendingRequests,
} from '../lib/automatic-driver.mjs';
import { act, createGame, drawCard, pending } from '../lib/game-engine.mjs';

test('automatic request commands use the same explicit workflow actions as the UI', () => {
  let game = createGame('mirror', 1201, 3);
  game.queue = [];
  game.decks.event = ['cipher'];
  drawCard(game, 'event', game.heroes[game.active]);
  let command = automaticRequestCommand(game);
  assert.deepEqual(command, {
    type: 'continueCard',
    requestId: pending(game).uid,
  });
  game = act(game, command);
  assert.equal(pending(game).kind, 'diceRequest');
  command = automaticRequestCommand(game);
  assert.equal(command.type, 'resolveDice');
  assert.equal(command.requestId, pending(game).uid);
});

test('the automatic driver settles a serialized workflow without direct state edits', () => {
  let game = createGame('mirror', 1202, 3);
  game.queue = [];
  game.decks.item = ['bandage'];
  drawCard(game, 'item', game.heroes[game.active]);
  game = drivePendingRequests(
    JSON.parse(JSON.stringify(game)),
    (state, command) => act(state, command),
  );
  assert.equal(pending(game), null);
  assert.equal(game.heroes[game.active].itemInstances.length, 1);
});
