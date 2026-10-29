import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  createGame,
  drawCard,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { modifierValue } from '../lib/modifiers.mjs';

const settle = (game) => drivePendingRequests(game, act);
const knowledgeDice = (game, heroId, trait = 'knowledge') =>
  modifierValue(game, 'check.dice', { heroId, checkKind: 'event', trait }, 4);

test('生存指南获得、交付、放下、拾取和存档恢复正确变更知识', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'survival-guide'));
  const owner = game.heroes[0],
    recipient = game.heroes[1];
  const instanceId = owner.itemInstances.find(
    (item) => item.definitionId === 'survival-guide',
  ).instanceId;
  assert.equal(owner.stats.knowledge, owner.start.knowledge + 1);
  assert.equal(knowledgeDice(game, owner.id), 5);
  assert.equal(knowledgeDice(game, owner.id, 'sanity'), 4);
  const recipientBefore = recipient.stats.knowledge;
  game = settle(
    act(game, { type: 'transferItem', instanceId, targetHeroId: recipient.id }),
  );
  assert.equal(game.heroes[owner.id].stats.knowledge, owner.start.knowledge);
  assert.equal(game.heroes[recipient.id].stats.knowledge, recipientBefore + 1);
  assert.equal(knowledgeDice(game, owner.id), 4);
  assert.equal(knowledgeDice(game, recipient.id), 5);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = act(game, { type: 'select', id: recipient.id });
  game = settle(act(game, { type: 'dropItem', instanceId }));
  assert.equal(game.heroes[recipient.id].stats.knowledge, recipientBefore);
  assert.equal(knowledgeDice(game, recipient.id), 4);
  game = settle(act(game, { type: 'pickupItem', instanceId }));
  assert.equal(game.heroes[recipient.id].stats.knowledge, recipientBefore + 1);
  assert.equal(knowledgeDice(game, recipient.id), 5);
  assert(
    actions(game).itemAbilities.some(
      (action) => action.instanceId === instanceId,
    ),
  );
});

test('生存指南真实抽取获得加成，失去时不使知识进入骷髅', () => {
  let game = createGame('mirror', 19, 3);
  game.queue = [];
  game.decks.item = ['survival-guide'];
  const before = game.heroes[0].stats.knowledge;
  drawCard(game, 'item', game.heroes[0]);
  game = settle(game);
  assert.equal(game.heroes[0].stats.knowledge, before + 1);
  const instanceId = game.heroes[0].itemInstances.find(
    (item) => item.definitionId === 'survival-guide',
  ).instanceId;
  game.heroes[0].stats.knowledge = 1;
  game = settle(act(game, { type: 'dropItem', instanceId }));
  assert.equal(game.heroes[0].stats.knowledge, 1);
  assert.equal(game.heroes[0].dead, false);
});

test('生存指南确实为事件知识检定多投一枚骰', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'survival-guide'));
  const hero = game.heroes[game.active];
  game.decks.event = ['cipher'];
  drawCard(game, 'event', hero);
  game = act(game, { type: 'advance' });
  assert.equal(game.queue[0].kind, 'diceRequest');
  assert.equal(
    game.queue[0].rolls[0].count,
    hero.tracks.knowledge[hero.stats.knowledge] + 1,
  );
});
