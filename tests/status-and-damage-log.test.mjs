import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, drawCard, pending } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { updateCardRule } from '../lib/card-rules.mjs';
import { heroStatuses } from '../lib/hero-status.mjs';
import { cure, infect } from '../lib/werewolf.mjs';
import { eventJournalEntries } from '../lib/event-journal.mjs';

const start = () => act(createGame('werewolf', 83, 3), { type: 'advance' });
const hit = (uid, amount = 2) => ({
  uid,
  kind: 'damage',
  heroId: 0,
  damageType: 'physical',
  remaining: amount,
  total: amount,
  allocation: [],
});

test('confirmed damage records a complete result once and stale clicks cannot allocate the next hit', () => {
  let game = start();
  game.queue = [hit(500), hit(501)];
  const action = {
    type: 'allocateDamage',
    requestId: 500,
    allocation: { might: 1, speed: 1 },
  };
  const before = structuredClone(game);
  assert.deepEqual(
    act(game, { ...action, allocation: { might: 0, speed: 1 } }),
    before,
  );
  game = act(game, action);
  const summary = game.logs.filter((l) => /结算2点肉体伤害/.test(l.text));
  assert.equal(summary.length, 1);
  assert.match(summary[0].text, /力量向左移动1格.*速度向左移动1格/);
  assert.equal(pending(game).uid, 501);
  assert.deepEqual(act(game, action), game);
  assert.equal(
    JSON.parse(JSON.stringify(game)).logs[0].text,
    game.logs[0].text,
  );
});

test('incremental damage keeps the full allocation in the final journal entry', () => {
  let game = start();
  game.queue = [hit(520)];
  game = act(game, { type: 'allocate', trait: 'might' });
  assert.equal(pending(game).remaining, 1);
  game = act(game, { type: 'allocate', trait: 'speed' });
  const result = game.events.findLast(
    (event) => event.type === 'DamageApplied',
  );
  assert.deepEqual(result.allocation, { might: 1, speed: 1 });
  assert.match(eventJournalEntries(game)[0].text, /力量左移1格、速度左移1格/);
});

test('fatal damage retains its journal result even when the game ends', () => {
  let game = start();
  game.phase = 'haunt';
  game.heroes[1].dead = game.heroes[2].dead = true;
  game.heroes[0].stats.might = 1;
  game.queue = [hit(700, 1)];
  game = act(game, {
    type: 'allocateDamage',
    requestId: 700,
    allocation: { might: 1, speed: 0 },
  });
  assert.equal(game.phase, 'over');
  assert(game.logs.some((l) => /结算1点肉体伤害.*人物已死亡/.test(l.text)));
});

test('fully prevented mental damage appears in the journal without a damage allocation prompt', () => {
  let game = updateCardRule(start(), {
    id: 'test-injury',
    cardType: 'event',
    cardId: 'whisper',
    patch: {
      trait: null,
      effect: { damage: 'mental', amount: 1, text: '受到1点精神伤害。' },
    },
  });
  game.heroes[0].omens = ['locket'];
  game.decks.event = ['whisper'];
  drawCard(game, 'event', game.heroes[0]);
  game = act(game, { type: 'advance' });
  assert(game.logs.some((l) => /1点精神伤害已被抵消/.test(l.text)));
  assert(!game.queue.some((p) => p.kind === 'damage'));
  assert.equal(pending(game), null);
  assert.match(eventJournalEntries(game)[0].text, /已全部抵消/);
});

test('settled attacks record actual enemy damage and HP before and after, including armor', () => {
  let game = act(createHauntPlaytest('werewolf', 23, 4), { type: 'advance' });
  const enemy = game.enemies[0];
  // 旧生命值存档仍须记录原有伤害日志。
  delete enemy.traitModel;
  Object.assign(enemy, { hp: 10, maxHp: 10, might: 5, speed: 2 });
  enemy.pos = game.heroes[game.active].pos;
  const hp = enemy.hp;
  game = act(game, { type: 'attack', id: enemy.id });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((r, i) => {
    r.dice = Array(r.count).fill(i === 0 ? 2 : 0);
  });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  const after = game.enemies.find((e) => e.id === enemy.id).hp;
  assert(
    game.logs.some((l) =>
      l.text.includes(`受到${hp - after}点伤害，生命 ${hp} → ${after}`),
    ),
  );
});

test('buff descriptions follow infection progress and exact immunity expiry without claiming damage immunity', () => {
  const game = start(),
    hero = game.heroes[0];
  infect(game, hero);
  assert.equal(heroStatuses(game, hero)[0].count, 3);
  hero.statuses[0].attempts = 2;
  assert.match(heroStatuses(game, hero)[0].description, /加值 \+2/);
  cure(game, hero);
  const badges = heroStatuses(game, hero);
  assert.equal(badges.length, 1);
  assert.equal(badges[0].id, 'immunity');
  assert.match(badges[0].description, /仍会受到攻击伤害.*保护 2 次/);
  game.elapsed += 2;
  assert.match(heroStatuses(game, hero)[0].description, /保护 0 次/);
  game.elapsed++;
  assert.deepEqual(heroStatuses(game, hero), []);
});

test('bloodmoon infection test marker explains cleansing and its current limits', () => {
  const game = start();
  const hero = game.heroes[0];
  hero.statuses.push({
    id: 'bloodmoon-infection',
    label: '感染Ⅱ（测试）',
    level: 2,
    negative: true,
    removable: true,
  });
  const badge = heroStatuses(game, hero).find(
    (entry) => entry.label === '感染Ⅱ（测试）',
  );
  assert.match(badge.description, /消毒杀菌室.*不会撤销.*不会自动升级或转化/);
});
