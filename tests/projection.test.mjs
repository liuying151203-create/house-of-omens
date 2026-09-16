import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationGame, recordEvent } from '../lib/game-engine.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { projectGameForPlayer } from '../lib/engine/projection.mjs';

test('network projection hides deck order and opposing inventories by faction', () => {
  const game = createSimulationGame('mirror', 501, 3),
    room = {
      hostId: 'host',
      seats: ['good-a', 'wolf-a', 'good-b'],
    };
  game.phase = 'haunt';
  game.trueMirror = 'foyer';
  game.heroes[1].traitor = true;
  game.heroes[1].faction = 'wolves';
  game.heroes.forEach((hero, index) =>
    addItemInstance(hero, 'tools', 'projected-item-' + index),
  );
  game.enemies = [
    { id: 'public', pos: 'foyer', hp: 2, maxHp: 2 },
    { id: 'secret', pos: 'basement', hp: 2, maxHp: 2, hidden: true },
  ];
  recordEvent(game, 'PrivateGoodEvent', {}, { faction: 'heroes' });
  recordEvent(game, 'PrivateWolfEvent', {}, { faction: 'wolves' });
  recordEvent(game, 'InternalEvent', {}, 'internal');
  game.logs.unshift(
    {
      id: 901,
      round: game.round,
      text: '好人秘密手记',
      visibility: { faction: 'heroes' },
    },
    {
      id: 902,
      round: game.round,
      text: '狼群秘密手记',
      visibility: { faction: 'wolves' },
    },
  );
  game.feedback = '狼群秘密反馈';
  game.feedbackVisibility = { faction: 'wolves' };
  game.ruleModifiers = [
    { id: 'public-rule', visibility: 'public' },
    { id: 'wolf-rule', visibility: { faction: 'wolves' } },
  ];
  game.ruleTriggers = [
    {
      id: 'hidden-trigger',
      sourceId: 'wolf-secret',
      when: 'AfterDamage',
      visibility: { faction: 'wolves' },
      effects: [{ op: 'status.add', params: { hidden: true } }],
    },
  ];
  game.queue = [
    {
      uid: 90,
      kind: 'choiceRequest',
      heroId: 0,
      title: '秘密反应',
      text: '只有响应者可见。',
      options: [{ value: 'yes', label: '响应' }],
      workflow: {
        flowId: 'secret-flow',
        definitionId: 'reaction.chooseEffect',
        definitionVersion: 1,
        step: 0,
        locals: { hiddenEffects: ['secret'] },
      },
    },
    {
      uid: 91,
      kind: 'card',
      heroId: 0,
      cardType: 'item',
      cardId: 'tools',
      title: '工具箱',
      text: '秘密物品牌',
      visibility: { faction: 'heroes' },
    },
  ];
  const good = projectGameForPlayer(game, room, 'good-a'),
    wolf = projectGameForPlayer(game, room, 'wolf-a');
  assert.equal(good.seed, null);
  assert(good.decks.rooms.every((card) => card === null));
  assert.equal(good.decks.rooms.length, game.decks.rooms.length);
  assert.equal(good.trueMirror, null);
  assert.deepEqual(
    good.enemies.map((enemy) => enemy.id),
    ['public'],
  );
  assert.equal(good.heroes[0].items.length, 1);
  assert.equal(good.heroes[2].items.length, 1);
  assert.equal(good.heroes[1].items.length, 0);
  assert.equal(good.heroes[1].inventoryHidden, true);
  assert.equal(good.heroes[1].stats, null);
  assert.equal(good.heroes[1].tracks, null);
  assert.deepEqual(good.heroes[1].statuses, []);
  assert.equal(wolf.heroes[1].items.length, 1);
  assert.equal(wolf.heroes[0].items.length, 0);
  assert.equal(wolf.heroes[0].stats, null);
  assert.equal(wolf.heroes[0].privateStats, true);
  assert.deepEqual(
    good.events.map((event) => event.type),
    ['PrivateGoodEvent'],
  );
  assert.deepEqual(
    wolf.events.map((event) => event.type),
    ['PrivateWolfEvent'],
  );
  assert(good.logs.some((entry) => entry.text === '好人秘密手记'));
  assert(!good.logs.some((entry) => entry.text === '狼群秘密手记'));
  assert(wolf.logs.some((entry) => entry.text === '狼群秘密手记'));
  assert(!wolf.logs.some((entry) => entry.text === '好人秘密手记'));
  assert.equal(good.feedback, '');
  assert.equal(wolf.feedback, '狼群秘密反馈');
  assert.deepEqual(
    good.ruleModifiers.map((rule) => rule.id),
    ['public-rule'],
  );
  assert.deepEqual(
    wolf.ruleModifiers.map((rule) => rule.id),
    ['public-rule', 'wolf-rule'],
  );
  assert.deepEqual(good.ruleTriggers, []);
  assert.equal(wolf.ruleTriggers[0].id, 'hidden-trigger');
  assert.equal(good.queue[0].options.length, 1);
  assert.equal(good.queue[0].workflow.locals, undefined);
  assert.equal(wolf.queue[0].choiceHidden, true);
  assert.deepEqual(wolf.queue[0].options, []);
  assert.equal(good.queue[1].cardId, 'tools');
  assert.equal(wolf.queue[1].kind, 'privateRequest');
  assert.equal(wolf.queue[1].cardId, undefined);
  assert.equal(game.heroes[0].items.length, 1);
  assert.notEqual(good, game);
});
