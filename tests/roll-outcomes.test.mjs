import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  createInteractiveGame,
  drawCard,
  EVENTS,
} from '../lib/game-engine.mjs';
import { updateCardRule } from '../lib/card-rules.mjs';
import { CONTENT_ACTION_DEFINITIONS } from '../lib/content/actions.mjs';

test('event dice previews use current card overrides and survive saving the request', () => {
  let s = createInteractiveGame('werewolf', 23, 3);
  s.queue = [];
  const card = EVENTS.find((c) => c.trait);
  s = updateCardRule(s, {
    id: 'preview-test',
    cardType: 'event',
    cardId: card.id,
    patch: {
      threshold: 7,
      success: { ...card.success, text: '新的成功效果' },
      failure: { ...card.failure, text: '新的失败效果' },
    },
  });
  s.decks.event = [card.id];
  drawCard(s, 'event', s.heroes[0]);
  s = act(s, { type: 'advance' });
  assert.deepEqual(JSON.parse(JSON.stringify(s)).queue[0].outcomes, [
    { range: '7+ 点', effect: '新的成功效果' },
    { range: '低于 7 点', effect: '新的失败效果' },
  ]);
});

test('elevator preview covers every total and preserves the four-point exception', () => {
  const rows = CONTENT_ACTION_DEFINITIONS.find(
    (action) => action.id === 'useElevator',
  ).outcomes;
  assert.deepEqual(
    rows.slice(0, 5).map((r) => r.range),
    ['0 点', '1 点', '2 点', '3 点', '4 点'],
  );
  assert.match(rows[4].effect, /包括当前楼层/);
  assert.match(rows[0].effect, /肉体伤害/);
});

test('combat previews distinguish attack wins, ties and counterattacks', () => {
  const s = createInteractiveGame('werewolf');
  s.queue = [];
  s.phase = 'haunt';
  s.enemies = [
    {
      id: 'alpha',
      name: '狼王',
      kind: 'alpha',
      pos: 'entrance',
      hp: 5,
      maxHp: 5,
    },
  ];
  const rows = actions(s).abilities.find(
    (action) => action.command?.type === 'attack',
  ).outcomes;
  assert.equal(rows.length, 3);
  assert.match(rows[0].effect, /最多 3 点/);
  assert.match(rows[1].effect, /不受伤/);
  assert.match(rows[2].effect, /肉体伤害/);
});
