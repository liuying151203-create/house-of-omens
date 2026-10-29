import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, createSimulationGame, drawCard, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
import { resolveGameSet } from '../lib/game-sets.mjs';

const settle = (game) => drivePendingRequests(game, act);
test('幽影斗篷进入扩展物品牌堆，经典牌堆不变', () => {
  assert(resolveGameSet('expanded').decks.item.includes('shadow-cloak'));
  assert(!resolveGameSet('classic').decks.item.includes('shadow-cloak'));
});
const start = () => settle(createHauntPlaytest('werewolf', 23, 3, 'shadow-cloak'));
const choose = (game, choice) => act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });
function attack(game) {
  const action = actions(game).itemAbilities.find((entry) => entry.handler === 'item.wailingViolin' && entry.targetRoomId === 'entrance');
  return act(game, action.command);
}
function dodge(game, face) {
  game = choose(game, 'dodge');
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(face);
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
}

test('成功闪避小提琴攻击，其他怪物仍正常结算', () => {
  let game = start();
  const sanity = game.heroes[1].stats.sanity;
  game = attack(game);
  assert.match(pending(game).title, /幽影斗篷/);
  assert.equal(pending(game).heroId, 1);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = settle(dodge(game, 2));
  assert.equal(game.heroes[1].stats.sanity, sanity);
  assert(game.enemies.find((entry) => entry.id === 'violin-fixed').stunned);
  assert(game.heroes[1].items.includes('shadow-cloak'));
});

test('失败或放弃闪避时仍承受小提琴伤害', () => {
  for (const option of ['fail', 'skip']) {
    let game = start();
    const sanity = game.heroes[1].stats.sanity;
    game = attack(game);
    game = option === 'fail' ? dodge(game, 0) : choose(game, 'skip');
    game = settle(game);
    assert.equal(game.heroes[1].stats.sanity, sanity - 1);
  }
});

test('模拟模式范围攻击中斗篷闪避后仍继续结算其他目标', () => {
  let game = start();
  game.executionMode = 'simulation';
  const sanity = game.heroes[1].stats.sanity;
  game = settle(dodge(attack(game), 2));
  assert.equal(game.heroes[1].stats.sanity, sanity);
  assert(game.enemies.find((enemy) => enemy.id === 'violin-fixed').stunned);
});

test('闪避成功不消耗心灵护符的首次精神伤害机会', () => {
  let game = start();
  addItemInstance(game.heroes[1], 'mind-amulet', 'test:amulet');
  game = settle(dodge(attack(game), 2));
  const amulet = game.heroes[1].itemInstances.find((item) => item.definitionId === 'mind-amulet');
  assert.equal(amulet.state.mentalRound, undefined);
});

test('斗篷速度检定可使用命运戒指重骰并在存档后继续', () => {
  let game = start();
  addItemInstance(game.heroes[1], 'family-ring', 'test:cloak-ring');
  const sanity = game.heroes[1].stats.sanity;
  game = dodge(attack(game), 0);
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.match(pending(game).title, /命运戒指/);
  assert.equal(pending(game).heroId, 1);
  game = choose(restoreGameSave(JSON.parse(JSON.stringify(game))), '0:0');
  assert.equal(pending(game).kind, 'ringResult');
  game = settle(restoreGameSave(JSON.parse(JSON.stringify(game))));
  assert.equal(game.events.filter((event) => event.type === 'DiceRolled' && event.rerollOf).length, 1);
  assert.equal(game.heroes[1].stats.sanity, sanity - 1);
});

test('联机时只有斗篷持有者可以选择并投掷闪避骰', () => {
  const api = createRoomService({ gameFactory: start });
  const host = api.create({ scenario: 'werewolf', count: 3 });
  const guest = api.join({ code: host.code });
  let room = api.update(host.code, host.key, { type: 'start', revision: guest.revision });
  const update = (key, action) => api.update(host.code, key, { type: 'action', revision: room.revision, action });
  const violin = actions(room.game).itemAbilities.find((entry) => entry.handler === 'item.wailingViolin' && entry.targetRoomId === 'entrance');
  room = update(host.key, violin.command);
  assert.equal(pending(room.game).kind, 'privateRequest');
  let request = pending(api.read(host.code, guest.key).game);
  assert.equal(request.heroId, 1);
  assert.throws(() => update(host.key, { type: 'resolveChoice', requestId: request.uid, choice: 'dodge' }));
  room = update(guest.key, { type: 'resolveChoice', requestId: request.uid, choice: 'dodge' });
  request = pending(api.read(host.code, guest.key).game);
  assert.equal(request.kind, 'diceRequest');
  assert.throws(() => update(host.key, { type: 'rollDice', sideId: request.rolls[0].id }), /负责的骰子/);
  room = update(guest.key, { type: 'rollDice', sideId: request.rolls[0].id });
  room = update(guest.key, { type: 'resolveDice', requestId: request.uid });
  assert.notEqual(pending(api.read(host.code, guest.key).game)?.title, '幽影斗篷 · 速度检定');
});

test('普通枪击未闪避后可使用斗篷，成功时不触发防暴盾', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-pistol'));
  addItemInstance(game.heroes[1], 'riot-shield', 'test:shield');
  const before = structuredClone(game.heroes[1].stats);
  const shot = actions(game).abilities.find((entry) => entry.handler === 'firearm.shoot');
  game = act(game, shot.command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.match(pending(game).title, /幽影斗篷/);
  game = settle(dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2));
  assert.deepEqual(game.heroes[1].stats, before);
  assert.equal(game.heroes[1].itemInstances.find((item) => item.definitionId === 'riot-shield').state.charges, undefined);
  assert.equal(game.events.filter((event) => event.type === 'ShotResolved').length, 1);
});

test('斗篷检定失败后普通枪击仍造成伤害', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-pistol'));
  addItemInstance(game.heroes[1], 'shadow-cloak', 'test:cloak');
  const shot = actions(game).abilities.find((entry) => entry.handler === 'firearm.shoot');
  game = act(game, shot.command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = dodge(game, 0);
  if (pending(game).kind === 'check') game = act(game, { type: 'advance', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 2);
});

test('模拟模式手枪命中后仍可进行斗篷闪避', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-pistol'));
  game.executionMode = 'simulation';
  const before = structuredClone(game.heroes[1].stats);
  const shot = actions(game).abilities.find((entry) => entry.handler === 'firearm.shoot');
  game = act(game, shot.command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.match(pending(game).title, /幽影斗篷/);
  game = settle(dodge(game, 2));
  assert.deepEqual(game.heroes[1].stats, before);
});

test('银弹的无法闪避规则优先于斗篷', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-silver-first'));
  addItemInstance(game.heroes[1], 'shadow-cloak', 'test:cloak');
  const shot = actions(game).abilities.find((entry) => entry.handler === 'firearm.shoot' && entry.silver);
  game = act(game, shot.command);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 7);
});

function actorContest(game, attackFace, defenseFace) {
  game = act(game, { type: 'actorAttack', targetId: 1 });
  pending(game).rolls.forEach((roll, index) => { roll.dice = Array(roll.count).fill(index ? defenseFace : attackFace); });
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
}

test('斗篷闪避人物近战时同时避开冰霜刃减速', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-melee'));
  const before = structuredClone(game.heroes[1].stats);
  game = actorContest(game, 2, 0);
  assert.match(pending(game).title, /冰霜刃/);
  game = choose(game, 'freeze');
  assert.match(pending(game).title, /幽影斗篷/);
  game = settle(dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2));
  assert.deepEqual(game.heroes[1].stats, before);
  assert.equal(game.heroes[1].frostSlow, undefined);
  assert(!game.heroes[1].statuses.some((status) => status.id === 'bloodmoon-infection'));
  assert(game.heroes[0].attacked);
  assert.equal(game.events.filter((entry) => entry.type === 'ActorAttackResolved').length, 1);
});

test('模拟模式人物近战可以闪避冰霜减速', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-melee'));
  game.executionMode = 'simulation';
  game = actorContest(game, 2, 0);
  assert.match(pending(game).title, /冰霜刃/);
  game = choose(game, 'freeze');
  assert.match(pending(game).title, /幽影斗篷/);
  game = settle(dodge(game, 2));
  assert.equal(game.heroes[1].frostSlow, undefined);
});

test('人物近战斗篷失败后仍结算伤害及冰霜减速', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-control'));
  addItemInstance(game.heroes[0], 'frost-blade', 'test:frost');
  addItemInstance(game.heroes[1], 'shadow-cloak', 'test:cloak');
  game = choose(actorContest(game, 2, 0), 'freeze');
  game = dodge(game, 0);
  assert.equal(game.heroes[1].frostSlow, 2);
  assert(game.queue.some((entry) => entry.kind === 'damage'));
});

test('防御方反击胜出时攻击者可用斗篷闪避', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-control'));
  addItemInstance(game.heroes[0], 'shadow-cloak', 'test:cloak');
  const before = structuredClone(game.heroes[0].stats);
  game = actorContest(game, 0, 2);
  assert.equal(pending(game).heroId, 0);
  game = settle(dodge(game, 2));
  assert.deepEqual(game.heroes[0].stats, before);
});

function enemyAttack(mode = 'workflow') {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-monster'));
  game.executionMode = mode;
  const targetId = game.active;
  game = act(game, { type: 'endRound' });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((roll, index) => { roll.dice = Array(roll.count).fill(index % 2 ? 0 : 2); });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  return { game, targetId };
}

test('模拟模式怪物攻击可以闪避并避免感染', () => {
  const result = enemyAttack('simulation');
  const before = structuredClone(result.game.heroes[result.targetId].stats);
  const game = settle(dodge(restoreGameSave(JSON.parse(JSON.stringify(result.game))), 2));
  assert.deepEqual(game.heroes[result.targetId].stats, before);
  assert(!game.heroes[result.targetId].statuses.some((status) => status.id === 'infection'));
});

test('斗篷闪避狼人攻击并避免感染，存档恢复后只结算一次', () => {
  const result = enemyAttack();
  let { game } = result;
  const { targetId } = result;
  assert.match(pending(game).title, /幽影斗篷/);
  assert.equal(pending(game).heroId, targetId);
  const before = structuredClone(game.heroes[targetId].stats);
  game = settle(dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2));
  assert.deepEqual(game.heroes[targetId].stats, before);
  assert(!game.heroes[targetId].statuses.some((status) => status.id === 'infection'));
});

test('斗篷闪避失败后仍受到狼人攻击与感染', () => {
  const result = enemyAttack();
  let { game } = result;
  const { targetId } = result;
  game = settle(dodge(game, 0));
  assert(game.heroes[targetId].statuses.some((status) => status.id === 'infection'));
});

test('怪物攻击两名人物时分别闪避，存档恢复不跳过第二个目标', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 5, 'shadow-cloak-monster'));
  const first = game.active;
  const second = game.heroes.find((hero) => hero.id !== first && !hero.traitor && !hero.dead).id;
  game.enemies[0].kind = 'alpha';
  game.heroes[second].pos = game.heroes[first].pos;
  addItemInstance(game.heroes[second], 'shadow-cloak', 'test:second-cloak');
  game = act(game, { type: 'endRound' });
  assert.equal(pending(game).rolls.length, 4);
  pending(game).rolls.forEach((roll, index) => { roll.dice = Array(roll.count).fill(index % 2 ? 0 : 2); });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game).heroId, first);
  game = dodge(game, 2);
  if (pending(game).kind === 'check') game = act(game, { type: 'advance', requestId: pending(game).uid });
  assert.equal(pending(game).heroId, second);
  assert.match(pending(game).title, /幽影斗篷/);
  game = settle(dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2));
  for (const id of [first, second]) assert(!game.heroes[id].statuses.some((status) => status.id === 'infection'));
});

function cardAttack() {
  let game = createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-card');
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((roll, index) => { roll.dice = Array(roll.count).fill(index === 0 ? 2 : 0); });
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
}

test('咬痕攻击可被斗篷闪避且之后继续作祟检定', () => {
  let game = cardAttack();
  assert.match(pending(game).title, /幽影斗篷/);
  const before = structuredClone(game.heroes[0].stats);
  game = dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2);
  assert.deepEqual(game.heroes[0].stats, before);
  const attack = game.events.filter((event) => event.type === 'CardAttackResolved');
  assert.equal(attack.length, 1);
  assert(attack[0].dodged);
  game = settle(game);
  assert(game.events.some((event) => event.type === 'HauntRollResolved' || event.type === 'HauntStarted') || game.phase === 'haunt');
});

test('斗篷未能闪避咬痕攻击时保留原有伤害分配', () => {
  let game = dodge(cardAttack(), 0);
  if (pending(game).kind === 'check') game = act(game, { type: 'advance', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 8);
});

test('旧模拟模式中的咬痕斗篷检定能完成并恢复卡牌流程', () => {
  let game = act(createSimulationGame('werewolf', 31, 3), { type: 'advance' });
  addItemInstance(game.heroes[0], 'shadow-cloak', 'test:cloak');
  game.decks.omen.unshift('bite-mark');
  drawCard(game, 'omen', game.heroes[0]);
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  pending(game).rolls.forEach((roll, index) => { roll.dice = Array(roll.count).fill(index === 0 ? 2 : 0); });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.match(pending(game).title, /幽影斗篷/);
  game = dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2);
  assert.equal(game.events.filter((event) => event.type === 'CardAttackResolved').length, 1);
  assert(game.events.find((event) => event.type === 'CardAttackResolved').dodged);
  game = settle(game);
  assert(!game.queue.some((entry) => entry.kind === 'damage'));
});

function monsterCounter(mode = 'workflow') {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-counter'));
  game.executionMode = mode;
  game = act(game, { type: 'attack', id: 'fixed-monster-test' });
  pending(game).rolls.forEach((roll, index) => { roll.dice = Array(roll.count).fill(index === 0 ? 0 : 2); });
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
}

test('模拟模式人物近战可闪避怪物反击', () => {
  let game = monsterCounter('simulation');
  const before = structuredClone(game.heroes[game.active].stats);
  game = settle(dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2));
  assert.deepEqual(game.heroes[game.active].stats, before);
  assert(game.heroes[game.active].attacked);
});

test('斗篷可闪避怪物反击并保留本回合已攻击状态', () => {
  let game = monsterCounter();
  assert.match(pending(game).title, /幽影斗篷/);
  const before = structuredClone(game.heroes[game.active].stats);
  game = settle(dodge(restoreGameSave(JSON.parse(JSON.stringify(game))), 2));
  assert.deepEqual(game.heroes[game.active].stats, before);
  assert(game.heroes[game.active].attacked);
  assert(!game.events.some((event) => event.type === 'DamageApplied'));
});

test('斗篷闪避怪物反击失败仍须分配伤害', () => {
  let game = dodge(monsterCounter(), 0);
  while (pending(game) && ['check', 'combat'].includes(pending(game).kind)) game = act(game, { type: 'advance', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'damage');
});

test('闪避怪物反击不会免除邪恶小刀攻击失败的代价', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shadow-cloak-counter'));
  addItemInstance(game.heroes[game.active], 'evil-knife', 'test:knife');
  game.heroes[game.active].omens = game.heroes[game.active].omens.filter((id) => id !== 'locket');
  const mental = game.heroes[game.active].stats.sanity + game.heroes[game.active].stats.knowledge;
  game = choose(act(game, { type: 'attack', id: 'fixed-monster-test' }), 'use');
  pending(game).rolls.forEach((roll, index) => { roll.dice = Array(roll.count).fill(index === 0 ? 0 : 2); });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = settle(dodge(game, 2));
  assert.equal(game.heroes[game.active].stats.sanity + game.heroes[game.active].stats.knowledge, mental - 1);
});
