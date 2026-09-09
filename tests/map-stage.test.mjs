import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  createInteractiveGame,
  drawCard,
  pending,
  OMENS,
  ITEMS,
  actions,
  connections,
  living,
  movement,
  traitValue,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import {
  resolveCard,
  updateCardRule,
  removeCardRule,
  cardCureBonus,
} from '../lib/card-rules.mjs';
import { hauntCardRule } from '../lib/game-view.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const start = () =>
  act(createInteractiveGame('werewolf', 83, 3), { type: 'advance' });
const haunt = () => {
  const game = act(createHauntPlaytest('werewolf', 23, 4), { type: 'advance' });
  living(game).forEach((h) => {
    h.pos = 'entrance';
  });
  return game;
};
const settle = (game) => {
  game = act(game, { type: 'rollAll' });
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
};

test('automatic settlement requires all dice and a matching request, then shows the result once', () => {
  let game = haunt();
  game.enemies[0].pos = 'entrance';
  game = act(game, { type: 'attack', id: game.enemies[0].id });
  const requestId = pending(game).uid;
  const finish = { type: 'resolveDice', requestId };
  assert.deepEqual(act(game, finish), game);
  game = act(game, { type: 'rollDice', sideId: 'side-0' });
  assert.deepEqual(act(game, finish), game);
  game = act(game, { type: 'rollDice', sideId: 'side-1' });
  assert.deepEqual(act(game, { ...finish, requestId: requestId + 1 }), game);
  const rolled = JSON.parse(JSON.stringify(game));
  game = act(rolled, finish);
  assert.equal(pending(game).kind, 'combat');
  assert.equal(pending(game).rollReceipt.rolls.length, 2);
  assert(game.heroes[0].attacked);
  assert.deepEqual(act(game, finish), game);
  assert.deepEqual(act(rolled, finish), game);
});

test('all omen cards remove exploration-only instructions and rolls after the haunt starts', () => {
  for (const omen of OMENS) {
    let game = haunt();
    const card = resolveCard(game, 'omen', omen.id, 0);
    assert.doesNotMatch(card.effect, /作祟检定/);
    assert.equal(card.explorationText, null);
    assert.equal(card.hauntRoll, false);
    game.decks.omen = [omen.id];
    drawCard(game, 'omen', game.heroes[0]);
    game = act(game, { type: 'advance' });
    assert(
      game.queue.every(
        (p) => !['diceRequest', 'hauntRoll', 'hauntResult'].includes(p.kind),
      ),
    );
    assert.doesNotMatch(pending(game).text, /作祟检定/);
    const before = start();
    assert.match(
      resolveCard(before, 'omen', omen.id, 0).explorationText,
      /作祟检定/,
    );
  }
  let game = start();
  game.omens = 2;
  game.decks.omen = ['bell'];
  drawCard(game, 'omen', game.heroes[0]);
  game = act(game, { type: 'advance' });
  assert(game.queue.some((p) => p.kind === 'hauntRoll'));
});

test('scoped card overrides change descriptions, use amounts and passive rules without editing the catalog', () => {
  let game = start();
  game.heroes[0].items = ['coffee', 'boots'];
  game.heroes[1].items = ['coffee'];
  game = updateCardRule(game, {
    id: 'strong-coffee',
    cardType: 'item',
    cardId: 'coffee',
    heroId: 0,
    when: { phase: 'explore', scenario: 'werewolf' },
    patch: {
      title: '双份咖啡',
      effect: '本回合剩余移动力 +4。',
      useAmount: 4,
      consumable: false,
    },
  });
  const before = game.heroes[0].moves;
  const restored = JSON.parse(JSON.stringify(game));
  assert.equal(resolveCard(restored, 'item', 'coffee', 0).title, '双份咖啡');
  assert.equal(resolveCard(restored, 'item', 'coffee', 1).title, '浓缩咖啡');
  game = act(restored, { type: 'useItem', id: 'coffee' });
  assert.equal(game.heroes[0].moves, before + 4);
  assert(game.heroes[0].items.includes('coffee'));
  assert.equal(ITEMS.find((c) => c.id === 'coffee').title, '浓缩咖啡');
  const cleared = removeCardRule(game, 'strong-coffee');
  assert.equal(resolveCard(cleared, 'item', 'coffee', 0).useAmount, 2);
  game.phase = 'haunt';
  assert.equal(resolveCard(game, 'item', 'coffee', 0).useAmount, 2);
  game = updateCardRule(game, {
    id: 'damaged-boots',
    cardType: 'item',
    cardId: 'boots',
    patch: { bonus: null, effect: '鞋底破损，移动加值暂时失效。' },
  });
  assert.equal(
    movement(game.heroes[0], game),
    traitValue(game.heroes[0], 'speed'),
  );
  game.phase = 'explore';
  game.queue = [];
  game = act(game, { type: 'endRound' });
  assert.equal(game.heroes[0].moves, traitValue(game.heroes[0], 'speed'));
});

test('event overrides drive displayed thresholds, rolled traits, outcomes and movement rules', () => {
  let game = updateCardRule(start(), {
    id: 'changed-cipher',
    cardType: 'event',
    cardId: 'cipher',
    patch: {
      trait: 'speed',
      threshold: 0,
      stopsMovement: false,
      success: {
        text: '奔跑使你振奋，力量提升两格。',
        trait: 'might',
        delta: 2,
      },
    },
  });
  const before = game.heroes[0].stats.might,
    moves = game.heroes[0].moves;
  game.decks.event = ['cipher'];
  drawCard(game, 'event', game.heroes[0]);
  assert.equal(game.heroes[0].moves, moves);
  assert.equal(game.heroes[0].stopped, false);
  game = act(game, { type: 'advance' });
  assert.equal(
    pending(game).rolls[0].count,
    traitValue(game.heroes[0], 'speed'),
  );
  assert.match(pending(game).text, /速度.*0\+/);
  assert.throws(() => removeCardRule(game, 'changed-cipher'), /检定结算/);
  game = settle(game);
  assert.equal(pending(game).threshold, 0);
  assert.equal(game.heroes[0].stats.might, before + 2);
  assert.match(pending(game).text, /奔跑/);
});

test('locket treatment reads current rules on either participant and never stacks', () => {
  let game = haunt();
  const allies = living(game),
    healer = allies[0],
    target = allies[1];
  healer.omens = [];
  target.omens = ['locket'];
  assert.equal(cardCureBonus(game, healer, target), 2);
  healer.omens = ['locket'];
  assert.equal(cardCureBonus(game, healer, target), 2);
  assert.match(
    hauntCardRule(resolveCard(game, 'omen', 'locket', 0), game),
    /治疗/,
  );
  game = updateCardRule(game, {
    id: 'weaker-locket',
    cardType: 'omen',
    cardId: 'locket',
    patch: { cureBonus: 1, hauntText: '吊坠的治疗加值暂时变为 +1。' },
  });
  assert.equal(
    cardCureBonus(game, game.heroes[healer.id], game.heroes[target.id]),
    1,
  );
  const card = resolveCard(game, 'omen', 'locket', healer.id);
  assert.match(hauntCardRule(card, game), /\+1/);
  game.scenario = 'mirror';
  game.cardRules = [];
  assert.equal(cardCureBonus(game, healer, target), 0);
  assert.equal(
    hauntCardRule(resolveCard(game, 'omen', 'locket', 0), game),
    null,
  );
});

test('invalid runtime card functions and numbers are rejected', () => {
  for (const patch of [
    { use: 'unknown' },
    { useAmount: -4 },
    { cureBonus: '2' },
    { effect: () => {} },
    { id: 'rewrite' },
  ])
    assert.throws(
      () =>
        updateCardRule(start(), {
          id: 'invalid',
          cardType: 'item',
          cardId: 'coffee',
          patch,
        }),
      /无效/,
    );
});

test('exploration and placement never advance the enemy phase', () => {
  let game = haunt();
  const enemies = structuredClone(game.enemies),
    elapsed = game.elapsed;
  const choice = actions(game).explore[0];
  assert(choice);
  game = act(game, { type: 'explore', dir: choice.dir });
  assert.equal(pending(game).kind, 'placement');
  game = act(game, { type: 'place' });
  assert.deepEqual(game.enemies, enemies);
  assert.equal(game.elapsed, elapsed);
  assert(game.queue.every((p) => !p.enemyMovements && p.kind !== 'enemyTurn'));
});

test('enemy presentation follows connected doors, preserves the origin until resolution and attacks only in-room', () => {
  let game = haunt();
  const before = structuredClone(game.enemies);
  game = act(game, { type: 'endRound' });
  const p = pending(game);
  assert.equal(p.kind, 'diceRequest');
  assert.deepEqual(game.enemies, before);
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
  const movement = p.enemyMovements[0];
  assert.equal(movement.path[0], before[0].pos);
  assert(movement.path.length > 1);
  assert(movement.path.length <= before[0].speed + 1);
  for (let i = 1; i < movement.path.length; i++)
    assert(connections(game, movement.path[i - 1]).includes(movement.path[i]));
  assert.equal(movement.path.at(-1), game.heroes[movement.targetId].pos);
  assert(movement.attacks);
  for (const roll of p.rolls.filter((r) => r.targetId !== undefined))
    assert.equal(roll.roomId, game.heroes[roll.targetId].pos);
  game = settle(game);
  assert.equal(game.enemies[0].pos, movement.path.at(-1));
  assert(game.queue.every((p) => !p.enemyMovements));
});

test('wolves cannot attack across disconnected doors or beyond their movement budget', () => {
  for (const disconnected of [false, true]) {
    let game = haunt();
    game.enemies[0].pos = 'upper';
    game.enemies[0].speed = 1;
    living(game).forEach((h) => {
      h.pos = 'entrance';
    });
    if (disconnected) game.links = [];
    const stats = game.heroes.map((h) => h.stats);
    game = act(game, { type: 'endRound' });
    assert.notEqual(pending(game).kind, 'diceRequest');
    assert(game.queue.every((p) => p.kind !== 'damage'));
    assert(pending(game).enemyMovements.every((move) => !move.attacks));
    assert.deepEqual(
      game.heroes.map((h) => h.stats),
      stats,
    );
    if (disconnected) assert.equal(game.enemies[0].pos, 'upper');
    else assert.equal(game.enemies[0].pos, 'stairs');
  }
});

test('LAN automatic settlement respects actor ownership and retains the receipt for both players', () => {
  const api = createRoomService({
    gameFactory: () => {
      const game = start();
      game.decks.event = ['cipher'];
      drawCard(game, 'event', game.heroes[0]);
      return game;
    },
  });
  const host = api.create({ scenario: 'werewolf', count: 3 });
  const guest = api.join({ code: host.code });
  let room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const send = (key, action) => {
    room = api.update(host.code, key, {
      type: 'action',
      action,
      revision: room.revision,
    });
  };
  send(host.key, { type: 'advance' });
  const finish = { type: 'resolveDice', requestId: pending(room.game).uid };
  send(host.key, { type: 'rollAll', sideIds: ['side-0'] });
  assert.throws(() => send(guest.key, finish), /等待/);
  send(host.key, finish);
  assert.equal(pending(room.game).kind, 'cardResult');
  assert(pending(room.game).rollReceipt);
  assert.deepEqual(api.read(host.code, guest.key).game, room.game);
  assert.throws(() => send(host.key, finish), /当前不能/);
});
