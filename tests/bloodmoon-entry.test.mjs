import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createSimulationGame,
  act,
  drawCard,
  pending,
  triggerHaunt,
  restoreGameSave,
  traitValue,
  actions,
  frontiers,
  pathTo,
  placementOptions,
  ROOM_DECK,
} from '../lib/game-engine.mjs';
import { resolveGameSet } from '../lib/game-sets.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import {
  createHauntPlaytest,
  makeCheckpoint,
  readCheckpoint,
} from '../lib/playtest.mjs';

const settle = (game) => drivePendingRequests(game, act);
function draw(game, id, heroId) {
  assert(game.decks.omen.includes(id));
  game.decks.omen = [id, ...game.decks.omen.filter((entry) => entry !== id)];
  drawCard(game, 'omen', game.heroes[heroId]);
  return act(game, { type: 'continueCard', requestId: pending(game).uid });
}
function roll(game, faces = [0]) {
  const request = pending(game);
  assert.equal(request.kind, 'diceRequest');
  request.rolls.forEach((group, index) => {
    group.dice = Array(group.count).fill(faces[index] ?? faces[0]);
  });
  return act(game, { type: 'resolveDice', requestId: request.uid });
}
function safeBite(game) {
  game = roll(game, [0, 2]);
  assert.equal(pending(game).kind, 'cardResult');
  assert.equal(game.phase, 'explore');
  return act(game, { type: 'advance', requestId: pending(game).uid });
}

test('bloodmoon formal creation freezes its preset and still starts in exploration with no granted supplies', () => {
  for (const count of [3, 4, 5, 6]) {
    const game = createGame('bloodmoon', 31, count);
    assert.equal(game.scenario, 'bloodmoon');
    assert.equal(game.gameSet.id, 'bloodmoon');
    assert.equal(game.phase, 'explore');
    assert.equal(game.automaticHaunt, false);
    assert.equal(game.heroes.length, count);
    assert(
      game.heroes.every(
        (hero) =>
          hero.items.length === 0 &&
          hero.omens.length === 0 &&
          hero.faction === 'heroes',
      ),
    );
    assert.equal(game.bloodmoonCombat, undefined);
    assert(!game.decks.item.includes('silver-bullet'));
    assert(!game.decks.item.some((id) => id.endsWith('-potion')));
    assert.deepEqual(restoreGameSave(JSON.parse(JSON.stringify(game))), game);
  }
  assert.equal(
    createGame('mystery', 31, 3, { gameSet: 'bloodmoon' }).scenario,
    'bloodmoon',
  );
  assert.throws(
    () => createGame('bloodmoon', 31, 3, { gameSet: 'classic' }),
    /必要卡牌/,
  );
});

test('ordinary three-to-six-player games reach bloodmoon by legal room exploration and card actions', () => {
  for (const count of [3, 4, 5, 6]) {
    let game = createGame('bloodmoon', 31, count);
    for (let step = 0; step < 800 && game.phase === 'explore'; step++) {
      if (pending(game)) {
        game = settle(game);
        continue;
      }
      const hero = game.heroes[game.active];
      const view = actions(game);
      const destinations = [0, 1, ...(game.basementUnlocked ? [-1] : [])]
        .flatMap((floor) => frontiers(game, floor))
        .map((frontier) => ({
          ...frontier,
          path: pathTo(game, hero.pos, frontier.from),
        }))
        .filter(
          (frontier) =>
            frontier.path.length &&
            game.decks.rooms.some(
              (id) =>
                placementOptions(
                  game,
                  frontier.from,
                  frontier.dir,
                  ROOM_DECK.find((room) => room.id === id),
                ).length,
            ),
        )
        .sort((a, b) => a.path.length - b.path.length);
      const target = destinations[0];
      if (!hero.stopped && hero.moves > 0 && target) {
        const command =
          target.path.length === 1
            ? view.explore.find((entry) => entry.dir === target.dir) && {
                type: 'explore',
                dir: target.dir,
              }
            : [...view.move, ...view.stairs].includes(target.path[1]) && {
                type: 'move',
                pos: target.path[1],
              };
        if (command) {
          game = act(game, command);
          continue;
        }
      }
      game = act(game, { type: 'endHero' });
    }
    game = settle(game);
    assert.equal(game.phase, 'haunt', `${count}人正式探索必须进入作祟`);
    assert.equal(game.omens, 3);
    assert.equal(game.rooms.filter((room) => room.icon === 'omen').length, 3);
    assert(
      game.heroes[game.bloodmoonCombat.alphaId].omens.includes('bite-mark'),
    );
    assert.equal(game.playtest, undefined);
  }
});

test('directed bloodmoon cannot begin before a living bite holder is determined, even after three other omens', () => {
  const set = resolveGameSet('bloodmoon');
  set.decks.omen = ['bell', 'book', 'key', 'bite-mark'];
  let game = settle(createGame('bloodmoon', 32, 3, { gameSet: set }));
  for (const id of ['bell', 'book', 'key']) {
    game = settle(draw(game, id, 0));
    assert.equal(game.phase, 'explore');
    assert(!game.queue.some((entry) => entry.kind === 'hauntRoll'));
  }
  assert(game.logs.some((entry) => /等待咬痕/.test(entry.text)));
  const before = structuredClone(game);
  triggerHaunt(game);
  assert.deepEqual(game, before);
  game = draw(game, 'bite-mark', 1);
  game = safeBite(game);
  assert.equal(pending(game).kind, 'hauntRoll');
  game = settle(game);
  assert.equal(game.phase, 'haunt');
  assert.equal(game.bloodmoonCombat.alphaId, 1);
});

test('actual bite acquisition, result confirmation and final omen lead to player-controlled bloodmoon for three to six seats', () => {
  for (const factory of [createGame, createSimulationGame])
    for (const count of [3, 4, 5, 6]) {
      let game = settle(factory('bloodmoon', 33, count));
      game = settle(draw(game, 'bell', 1));
      game = settle(draw(game, 'book', 2));
      const body = {
        might: traitValue(game.heroes[1], 'might', game),
        speed: traitValue(game.heroes[1], 'speed', game),
      };
      game = draw(game, 'bite-mark', 0);
      assert.equal(game.phase, 'explore');
      assert.equal(game.bloodmoonCombat, undefined);
      assert.equal(pending(game).rolls[0].count, 4);
      assert(!game.queue.some((entry) => entry.kind === 'hauntRoll'));
      game = restoreGameSave(JSON.parse(JSON.stringify(game)));
      game = safeBite(game);
      assert.equal(pending(game).kind, 'hauntRoll');
      game = act(game, { type: 'advance' });
      if (pending(game).kind === 'diceRequest') game = roll(game);
      // 模拟适配器直接掷骰，正式流程保留玩家确认；最后一张均触发。
      assert.equal(pending(game).triggers, true);
      game = settle(game);
      assert.equal(game.scenario, 'bloodmoon');
      assert.equal(game.phase, 'haunt');
      assert.equal(game.bloodmoonCombat.alphaId, 0);
      assert.equal(game.heroes[0].faction, 'wolves');
      assert.equal(game.heroes[0].combatRole, 'alpha');
      assert.deepEqual(game.heroes[1].hauntBodyValues, body);
      assert.equal(game.heroes.length, count);
      assert.deepEqual(game.enemies, []);
      assert.equal(game.limit, null);
      assert.deepEqual(restoreGameSave(JSON.parse(JSON.stringify(game))), game);
    }
});

test('early bite holder stays the alpha when a different hero obtains the final omen', () => {
  let game = settle(createGame('bloodmoon', 34, 4));
  game = safeBite(draw(game, 'bite-mark', 1));
  assert.equal(pending(game), null);
  game = settle(draw(game, 'bell', 0));
  game = settle(draw(game, 'book', 3));
  assert.equal(game.bloodmoonCombat.alphaId, 1);
});

test('automatic custom games register bite priority without changing other omen combinations', () => {
  const set = resolveGameSet('bloodmoon');
  delete set.scenario;
  let game = settle(createGame('mystery', 35, 3, { gameSet: set }));
  assert.equal(game.automaticHaunt, true);
  game = settle(draw(game, 'bell', 0));
  game = settle(draw(game, 'book', 1));
  game = settle(safeBite(draw(game, 'bite-mark', 2)));
  assert.equal(game.scenario, 'bloodmoon');
  assert.equal(game.bloodmoonCombat.alphaId, 2);
});

test('formal-entry playtest is distinct from the legacy bite test and restores intermediate requests', () => {
  let game = createHauntPlaytest('bloodmoon', 36, 3, 'bloodmoon-entry');
  assert.equal(game.phase, 'explore');
  assert.equal(game.decks.omen.length, 0);
  assert(!game.decks.item.includes('family-ring'));
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  const checkpoint = makeCheckpoint(game);
  assert.deepEqual(readCheckpoint(checkpoint, game), game);
  game = settle(game);
  assert.equal(game.scenario, 'bloodmoon');
  assert.equal(game.bloodmoonCombat.alphaId, 0);
  assert.equal(
    createHauntPlaytest('werewolf', 36, 3, 'bloodmoon-bite').scenario,
    'werewolf',
  );
});
