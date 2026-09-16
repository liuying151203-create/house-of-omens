import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actions,
  createSimulationGame,
  movement,
  removeRuleSource,
  roomAt,
  roomRuleView,
  traitRuleView,
  traitValue,
  updateRoomRule,
  updateTraitRule,
  validSave,
} from '../lib/game-engine.mjs';

test('room rules apply by scope and stable priority without changing topology', () => {
  const original = createSimulationGame('bells', 4101, 3);
  original.queue = [];
  let game = updateRoomRule(original, {
    id: 'chapter-entrance',
    sourceId: 'chapter',
    sourceLabel: '章节规则',
    roomId: 'entrance',
    when: { phase: 'explore', scenario: 'bells' },
    priority: 10,
    patch: { name: '回声门厅', icon: 'omen', moveCostDelta: 2 },
  });
  game = updateRoomRule(game, {
    id: 'card-entrance',
    sourceId: 'card',
    sourceLabel: '卡牌效果',
    roomId: 'entrance',
    priority: 20,
    patch: { name: '封锁的回声门厅', target: 'seal' },
  });

  const view = roomRuleView(game, roomAt(game, 'entrance'), 0);
  assert.equal(view.name, '封锁的回声门厅');
  assert.equal(view.icon, 'omen');
  assert.equal(view.target, 'seal');
  assert.equal(actions(game).moveCost, 3);
  assert.deepEqual(
    view.ruleSources.map((source) => source.id),
    ['chapter-entrance', 'card-entrance'],
  );
  assert.equal(roomAt(original, 'entrance').name, '入口大厅');
  assert.equal(roomAt(game, 'entrance').doors.length, 3);

  game.phase = 'haunt';
  const hauntView = roomRuleView(game, roomAt(game, 'entrance'), 0);
  assert.equal(hauntView.icon, null);
  assert.equal(hauntView.moveCostDelta, 0);
  assert.equal(hauntView.name, '封锁的回声门厅');
  assert.equal(actions(game).interact, true);
  assert.throws(
    () =>
      updateRoomRule(game, {
        id: 'invalid-topology',
        roomId: 'entrance',
        patch: { doors: [] },
      }),
    /Invalid room rule/,
  );
});

test('trait rules drive values, movement and presentation metadata', () => {
  const original = createSimulationGame('mirror', 4102, 3),
    hero = original.heroes[0],
    track = hero.tracks.speed.map((value, index) =>
      index === 0 ? 0 : value + 2,
    );
  let game = updateTraitRule(original, {
    id: 'boots-speed-track',
    sourceId: 'boots',
    sourceLabel: '疾行靴',
    heroId: hero.id,
    trait: 'speed',
    when: { phase: 'explore' },
    priority: 10,
    patch: { label: '疾行', track },
  });
  const changedHero = game.heroes[0],
    view = traitRuleView(game, changedHero, 'speed');
  assert.equal(view.label, '疾行');
  assert.equal(view.value, track[changedHero.stats.speed]);
  assert.equal(traitValue(changedHero, 'speed', game), view.value);
  assert.equal(movement(changedHero, game), view.value);
  assert.notEqual(
    movement(changedHero, game),
    movement(original.heroes[0], original),
  );
  assert.equal(view.ruleSources[0].sourceLabel, '疾行靴');

  game = updateTraitRule(game, {
    id: 'frozen-speed',
    sourceId: 'curse',
    sourceLabel: '凝滞诅咒',
    heroId: hero.id,
    trait: 'speed',
    priority: 20,
    patch: { fixedValue: 2, hidden: true },
  });
  const fixed = traitRuleView(game, game.heroes[0], 'speed');
  assert.equal(fixed.value, 2);
  assert.equal(fixed.changeable, false);
  assert.equal(fixed.hidden, true);
  assert.equal(movement(game.heroes[0], game), 2);
  const withoutBoots = removeRuleSource(game, 'boots');
  assert.equal(
    traitRuleView(withoutBoots, withoutBoots.heroes[0], 'speed').label,
    '速度',
  );
  assert.equal(
    traitRuleView(withoutBoots, withoutBoots.heroes[0], 'speed').value,
    2,
  );
  assert.throws(
    () =>
      updateTraitRule(game, {
        id: 'invalid-track',
        heroId: hero.id,
        trait: 'speed',
        patch: { track: [0, 9] },
      }),
    /Invalid trait rule/,
  );
});

test('dynamic room and trait rules survive a normal save round trip', () => {
  let game = createSimulationGame('flood', 4103, 3);
  game = updateRoomRule(game, {
    id: 'flooded-foyer',
    sourceId: 'scenario',
    roomId: 'foyer',
    patch: { name: '积水门厅', moveCostDelta: 1 },
  });
  game = updateTraitRule(game, {
    id: 'cold-knowledge',
    sourceId: 'event',
    heroId: 0,
    trait: 'knowledge',
    patch: { label: '清醒' },
  });

  const restored = JSON.parse(JSON.stringify(game));
  assert.equal(validSave(restored), true);
  assert.equal(
    roomRuleView(restored, roomAt(restored, 'foyer'), 0).name,
    '积水门厅',
  );
  assert.equal(
    traitRuleView(restored, restored.heroes[0], 'knowledge').label,
    '清醒',
  );
  restored.roomRules[0].patch.doors = [];
  assert.equal(validSave(restored), false);
});
