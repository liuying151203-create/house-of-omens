import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  pending,
  restoreGameSave,
  traitValue,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';

const settle = (game) => drivePendingRequests(game, act);
const start = () =>
  settle(createHauntPlaytest('werewolf', 23, 3, 'evil-knife'));
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });
function roll(game, attack, defense) {
  pending(game).rolls.forEach((group, index) => {
    group.dice = Array(group.count).fill(index === 0 ? attack : defense);
  });
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
}

test('加骰后平局需要承受精神伤害，存档恢复后只结算一次', () => {
  let game = start();
  const beforeDice = traitValue(game.heroes[0], 'might', game);
  const beforeMental =
    game.heroes[0].stats.sanity + game.heroes[0].stats.knowledge;
  game = act(game, { type: 'attack', id: 'fixed-monster-test' });
  assert.match(pending(game).title, /邪恶小刀/);
  game = choose(restoreGameSave(JSON.parse(JSON.stringify(game))), 'use');
  assert.equal(pending(game).rolls[0].count, beforeDice + 2);
  game = settle(roll(game, 0, 0));
  assert.equal(
    game.heroes[0].stats.sanity + game.heroes[0].stats.knowledge,
    beforeMental - 1,
  );
  assert(game.heroes[0].items.includes('evil-knife'));
  assert.equal(
    game.events.filter(
      (event) =>
        event.type === 'DamageApplied' && event.causeTag === 'evilKnife',
    ).length,
    1,
  );
});

test('获胜不受精神伤害，不使用时既不加骰也无惩罚', () => {
  let game = start();
  const before = game.heroes[0].stats.sanity + game.heroes[0].stats.knowledge;
  game = choose(act(game, { type: 'attack', id: 'fixed-monster-test' }), 'use');
  game = settle(roll(game, 2, 0));
  assert.equal(
    game.heroes[0].stats.sanity + game.heroes[0].stats.knowledge,
    before,
  );
  assert(game.enemies[0].stunned);
  game = start();
  const count = traitValue(game.heroes[0], 'might', game);
  game = choose(
    act(game, { type: 'attack', id: 'fixed-monster-test' }),
    'skip',
  );
  assert.equal(pending(game).rolls[0].count, count);
  game = settle(roll(game, 0, 0));
  assert(
    !game.events.some(
      (event) =>
        event.type === 'DamageApplied' && event.causeTag === 'evilKnife',
    ),
  );
});

test('战败时先结算身体反击，再结算小刀精神伤害', () => {
  let game = start();
  const hero = game.heroes[0],
    body = hero.stats.might + hero.stats.speed,
    mental = hero.stats.sanity + hero.stats.knowledge;
  game = choose(act(game, { type: 'attack', id: 'fixed-monster-test' }), 'use');
  game = settle(roll(game, 0, 2));
  assert(game.heroes[0].stats.might + game.heroes[0].stats.speed < body);
  assert.equal(
    game.heroes[0].stats.sanity + game.heroes[0].stats.knowledge,
    mental - 1,
  );
  const damages = game.events.filter(
    (event) => event.type === 'DamageApplied' && event.heroId === 0,
  );
  assert(
    damages.findIndex((event) => event.damageType === 'physical') <
      damages.findIndex((event) => event.causeTag === 'evilKnife'),
  );
});

test('人物对抗也能在攻击前选择加骰', () => {
  let game = settle(
    createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-control'),
  );
  addItemInstance(game.heroes[0], 'evil-knife', 'test:knife');
  const count = traitValue(game.heroes[0], 'might', game);
  game = act(game, { type: 'actorAttack', targetId: 1 });
  assert.match(pending(game).title, /邪恶小刀/);
  game = choose(game, 'use');
  assert.equal(pending(game).rolls[0].count, count + 2);
  game = settle(roll(game, 0, 0));
  assert(
    game.events.some(
      (event) =>
        event.type === 'DamageApplied' && event.causeTag === 'evilKnife',
    ),
  );
});

test('小刀加骰获胜后仍可选择冰霜刃效果', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'frost-blade', 'test:frost');
  game = choose(act(game, { type: 'attack', id: 'fixed-monster-test' }), 'use');
  game = roll(game, 2, 0);
  assert.match(pending(game).title, /冰霜刃/);
  game = settle(choose(game, 'freeze'));
  assert.equal(game.enemies[0].frostSlow, 2);
  assert(
    !game.events.some(
      (event) =>
        event.type === 'DamageApplied' && event.causeTag === 'evilKnife',
    ),
  );
});

test('平局后的精神伤害可由心灵护符减少', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'mind-amulet', 'test:amulet');
  const before = game.heroes[0].stats.sanity + game.heroes[0].stats.knowledge;
  game = choose(act(game, { type: 'attack', id: 'fixed-monster-test' }), 'use');
  game = roll(game, 0, 0);
  for (
    let index = 0;
    index < 10 && pending(game)?.kind !== 'choiceRequest';
    index++
  )
    game = act(game, { type: 'advance' });
  assert.match(pending(game).title, /精神防护/);
  game = settle(choose(game, 'reduce'));
  assert.equal(
    game.heroes[0].stats.sanity + game.heroes[0].stats.knowledge,
    before,
  );
});

test('已有16枚骰子的检定仍能完整增加两枚并自动掷出18枚', () => {
  let game = start();
  game.ruleModifiers = [
    {
      id: 'test:attack-dice',
      query: 'check.dice',
      heroId: 0,
      strategy: 'replace',
      value: 16,
    },
  ];
  game = choose(act(game, { type: 'attack', id: 'fixed-monster-test' }), 'use');
  assert.equal(pending(game).rolls[0].count, 18);
  game = act(game, { type: 'rollAll', requestId: pending(game).uid });
  assert.equal(pending(game).rolls[0].dice.length, 18);
});
