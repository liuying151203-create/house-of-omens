import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  pending,
  restoreGameSave,
  executeRuleEffects,
  traitValue,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { traitPositionBounds } from '../lib/content/bloodmoon-health.mjs';
import { traitRuleView } from '../lib/rule-views.mjs';
import { eventJournalText } from '../lib/event-journal.mjs';
import { heroStatuses } from '../lib/hero-status.mjs';
import {
  addItemInstance,
  transferItemInstance,
} from '../lib/item-instances.mjs';
const clear = (game) => {
  for (let i = 0; pending(game) && game.phase !== 'over' && i < 30; i++) {
    if (['diceRequest', 'damage', 'choiceRequest'].includes(pending(game).kind))
      break;
    game = act(game, { type: 'advance', requestId: pending(game).uid });
  }
  return game;
};
const fixture = (focus = 'bloodmoon-control') =>
  clear(createHauntPlaytest('werewolf', 31, 3, focus));
const restore = (game) => restoreGameSave(JSON.parse(JSON.stringify(game)));
const weakness = (game) =>
  heroStatuses(game, game.heroes[0]).find(
    (status) => status.id === 'bloodmoon-knockdown',
  );
const allocate = (game, allocation) =>
  clear(
    act(game, {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation,
    }),
  );
function injure(
  game,
  heroId,
  amount,
  damageType = 'physical',
  causeTag = 'test-injury',
) {
  executeRuleEffects(game, [
    { op: 'damage.deal', params: { heroId, amount, damageType, causeTag } },
  ]);
  return game;
}
const ability = (game, handler) =>
  actions(game).abilities.find((action) => action.handler === handler);
function silverShot(focus = 'bloodmoon-silver-first') {
  let game = fixture(focus);
  game = act(game, ability(game, 'firearm.load').command);
  return act(game, ability(game, 'firearm.shoot').command);
}

test('ordinary lethal damage floors alpha body traits at one, discards excess and does not kill', () => {
  let game = fixture();
  game = injure(game, 0, 12);
  assert.match(pending(game).text, /下次自己的回合不能主动攻击/);
  game = allocate(restore(game), { might: 6, speed: 6 });
  assert.equal(game.heroes[0].stats.might, 1);
  assert.equal(game.heroes[0].stats.speed, 1);
  assert(!game.heroes[0].dead);
  assert(game.heroes[0].skipNextAttack);
  assert.equal(
    game.events.filter((event) => event.type === 'AlphaKnockedDown').length,
    1,
  );
  const damage = game.events.findLast(
    (event) => event.type === 'DamageApplied',
  );
  assert.equal(damage.actualAmount, 6);
  assert.equal(damage.discardedAmount, 6);
  assert.match(eventJournalText(game, damage), /6点失效/);
  assert(
    ability(game, 'combat.actor.attack'),
    'already started current turn remains available',
  );
});
test('knockdown blocks exactly the next owned turn, not movement or later turns, and survives saves', () => {
  let game = allocate(injure(fixture('bloodmoon-immortal'), 0, 2), {
    might: 2,
    speed: 0,
  });
  assert.equal(
    game.events.findLast((event) => event.type === 'DamageApplied')
      .actualAmount,
    0,
  );
  game = clear(act(restore(game), { type: 'endRound' }));
  assert.equal(game.heroes[0].attackBlockedRound, game.round);
  assert(!game.heroes[0].skipNextAttack);
  assert.equal(ability(game, 'combat.actor.attack'), undefined);
  assert(actions(game).move.length);
  const round = game.round;
  game = clear(act(restore(game), { type: 'select', id: 1 }));
  game = clear(act(game, { type: 'select', id: 0 }));
  assert.equal(game.heroes[0].attackBlockedRound, round);
  assert.equal(
    game.events.filter((event) => event.type === 'AlphaAttackBlocked').length,
    1,
  );
  game = clear(act(game, { type: 'endRound' }));
  assert(ability(game, 'combat.actor.attack'));
});

test('weakness badges follow the pending turn, active restriction and owned turn end through saves', () => {
  let game = allocate(injure(fixture('bloodmoon-immortal'), 0, 2), {
    might: 2,
    speed: 0,
  });
  assert.equal(weakness(game).label, '虚弱');
  assert.equal(weakness(game).tone, 'negative');
  assert.match(weakness(game).description, /下次自己的回合不能主动攻击/);
  assert.match(weakness(game).description, /解药不能清除/);
  assert(
    !game.heroes[0].statuses.some(
      (status) => status.id === 'bloodmoon-knockdown',
    ),
  );
  const notice = game.events.findLast(
    (event) => event.type === 'AlphaKnockedDown',
  );
  assert.match(notice.text, /陷入虚弱/);
  assert.doesNotMatch(notice.text, /击倒/);
  game = clear(act(restore(game), { type: 'endRound' }));
  assert.match(weakness(game).description, /本回合不能主动攻击/);
  assert.equal(ability(game, 'combat.actor.attack'), undefined);
  game = clear(
    act(restore(game), { type: 'endHero', actorId: 0, round: game.round }),
  );
  assert(game.heroes[0].ended);
  assert.equal(weakness(game), undefined);
  game = clear(act(restore(game), { type: 'endRound' }));
  assert.equal(weakness(game), undefined);
  assert(ability(game, 'combat.actor.attack'));
});

test('a repeated injury keeps next-turn weakness after the current blocked turn ends', () => {
  let game = allocate(injure(fixture('bloodmoon-immortal'), 0, 2), {
    might: 2,
    speed: 0,
  });
  game = clear(act(game, { type: 'endRound' }));
  game = allocate(injure(game, 0, 1), { might: 1, speed: 0 });
  assert.match(
    weakness(game).description,
    /本回合再次陷入虚弱.*下次自己的回合也不能主动攻击/,
  );
  game = clear(act(game, { type: 'endHero', actorId: 0, round: game.round }));
  assert.match(weakness(game).description, /下次自己的回合不能主动攻击/);
  assert.doesNotMatch(weakness(game).description, /本回合再次/);
});
test('a knockdown before alpha own turn blocks that next turn within the same global round', () => {
  let game = fixture('bloodmoon-pistol');
  game.heroes[1].stats.might = 1;
  delete game.heroes[1].turnStartedRound;
  game = allocate(injure(game, 1, 1), { might: 1, speed: 0 });
  assert.notEqual(game.heroes[1].attackBlockedRound, game.round);
  game = clear(act(restore(game), { type: 'select', id: 1 }));
  assert.equal(game.heroes[1].attackBlockedRound, game.round);
});
test('ordinary pistol knockdown cannot kill alpha and records zero actual damage separately', () => {
  let game = fixture('bloodmoon-pistol');
  game.heroes[1].stats.might = game.heroes[1].stats.speed = 1;
  game = act(game, ability(game, 'firearm.shoot').command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = allocate(game, { might: 1, speed: 1 });
  assert(!game.heroes[1].dead);
  assert(game.heroes[1].skipNextAttack);
  assert.match(
    eventJournalText(
      game,
      game.events.findLast((event) => event.type === 'DamageApplied'),
    ),
    /2点.*伤害因不死规则失效/,
  );
});
test('secondary wolves and heroes keep ordinary lethal tracks', () => {
  for (const id of [1, 2]) {
    let game = fixture('bloodmoon-secondary');
    game.heroes[id].stats.might = 1;
    game = allocate(injure(game, id, 1), { might: 1, speed: 0 });
    assert(game.heroes[id].dead);
    assert.equal(game.heroes[id].skipNextAttack, undefined);
  }
});
test('trial mental floor keeps alpha alive without setting the physical knockdown penalty', () => {
  const game = allocate(injure(fixture(), 0, 12, 'mental'), {
    sanity: 6,
    knowledge: 6,
  });
  assert.equal(game.heroes[0].stats.sanity, 1);
  assert.equal(game.heroes[0].stats.knowledge, 1);
  assert(!game.heroes[0].dead);
  assert.equal(game.heroes[0].skipNextAttack, undefined);
});
test('hero trap recognizes controlled alpha entry, consumes once and feeds ordinary immortality', () => {
  let game = act(fixture('bloodmoon-immortal'), {
    type: 'move',
    pos: 'entrance',
  });
  game = clear(game);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).causeTag, 'trapHit');
  assert(game.heroes[0].stopped);
  game = allocate(restore(game), { might: 2, speed: 0 });
  assert.equal(game.heroes[0].stats.might, 1);
  assert(game.heroes[0].skipNextAttack);
  assert.equal(
    game.rooms.find((room) => room.id === 'entrance').traps.length,
    0,
  );
  assert.equal(
    game.events.filter((event) => event.type === 'TrapTriggered').length,
    1,
  );
});
test('first surviving silver shot clamps both body caps only after the manual damage flow', () => {
  let game = silverShot();
  assert.equal(game.heroes[1].silverWeakened, undefined);
  assert.deepEqual(
    traitPositionBounds(game, game.heroes[1], 'might', pending(game)),
    { minimum: 0, maximum: 7 },
  );
  game = allocate(restore(game), { might: 1, speed: 6 });
  assert(!game.heroes[1].dead);
  assert(game.heroes[1].silverWeakened);
  assert.equal(game.heroes[1].stats.might, 4);
  assert.equal(game.heroes[1].stats.speed, 1);
  assert.equal(game.heroes[1].skipNextAttack, undefined);
  assert.equal(
    game.events.filter((event) => event.type === 'AlphaWeakened').length,
    1,
  );
  assert.deepEqual(restore(game), game);
});
test('silver finish waits for after-damage reactions and then caps their restoration exactly once', () => {
  let game = fixture('bloodmoon-silver-first');
  game.ruleTriggers = [
    {
      id: 'test-after-silver',
      sourceId: 'scenario:test-after-silver',
      when: 'AfterDamage',
      condition: { sourceCardId: 'silver-bullet' },
      effects: [
        {
          op: 'reaction.request',
          params: {
            heroId: 1,
            title: '命中后恢复测试',
            options: [
              {
                id: 'heal',
                label: '恢复',
                effects: [
                  {
                    op: 'hero.changeTrait',
                    params: { heroId: 1, trait: 'might', delta: 20 },
                  },
                  {
                    op: 'hero.changeTrait',
                    params: { heroId: 1, trait: 'speed', delta: 20 },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ];
  game = act(game, ability(game, 'firearm.load').command);
  game = act(game, ability(game, 'firearm.shoot').command);
  game = allocate(game, { might: 3, speed: 4 });
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.equal(game.heroes[1].silverWeakened, undefined);
  game = clear(
    act(restore(game), {
      type: 'resolveChoice',
      requestId: pending(game).uid,
      choice: 'heal',
    }),
  );
  assert.equal(game.heroes[1].stats.might, 4);
  assert.equal(game.heroes[1].stats.speed, 4);
  assert(game.heroes[1].silverWeakened);
  assert.equal(
    game.events.filter((event) => event.type === 'ShotResolved').length,
    1,
  );
  assert.equal(
    game.events.filter((event) => event.type === 'AlphaWeakened').length,
    1,
  );
});
test('second silver is fatal for every possible seven-point split and ends with hero victory', () => {
  for (let might = 0; might <= 7; might++) {
    const game = allocate(restore(silverShot('bloodmoon-silver-second')), {
      might,
      speed: 7 - might,
    });
    assert(game.heroes[1].dead, `split ${might}/${7 - might}`);
    assert.equal(game.phase, 'over');
    assert.equal(game.result.won, true);
    assert.equal(game.result.winnerFaction, 'heroes');
    assert.equal(
      game.events.filter((event) => event.type === 'ShotResolved').length,
      1,
    );
  }
});
test('first silver can also kill directly; death never awards a surviving-hit weakening', () => {
  const game = allocate(silverShot(), { might: 7, speed: 0 });
  assert(game.heroes[1].dead);
  assert.equal(game.phase, 'over');
  assert.equal(
    game.events.filter((event) => event.type === 'AlphaWeakened').length,
    0,
  );
});
test('permanent caps constrain generic healing, rest, potions, expiry and changed moon values', () => {
  let game = fixture('bloodmoon-recovery-cap');
  const alpha = game.heroes[0];
  alpha.stats.might = alpha.stats.speed = 3;
  executeRuleEffects(game, [
    {
      op: 'hero.changeTrait',
      params: { heroId: 0, trait: 'might', delta: 20 },
    },
  ]);
  assert.equal(alpha.stats.might, 4);
  game = clear(
    act(
      game,
      actions(game).itemAbilities.find(
        (action) =>
          action.instanceId === 'test-cap-speed' &&
          action.command.type === 'useItem',
      ).command,
    ),
  );
  assert.equal(game.heroes[0].stats.speed, 4);
  game = clear(act(restore(game), { type: 'endRound' }));
  assert.equal(game.heroes[0].stats.speed, 3);
  game = act(game, { type: 'rest', trait: 'speed' });
  assert.equal(game.heroes[0].stats.speed, 4);
  game = clear(act(game, { type: 'endRound' }));
  assert.equal(traitValue(game.heroes[0], 'might', game), 6);
  assert.equal(game.heroes[0].stats.might, 4);
  assert.equal(traitRuleView(game, game.heroes[0], 'might').maxPosition, 4);
  assert.equal(traitRuleView(game, game.heroes[0], 'might').track.length, 8);
  executeRuleEffects(game, [
    {
      op: 'hero.changeTrait',
      params: { heroId: 0, trait: 'speed', delta: 20 },
    },
  ]);
  assert.equal(game.heroes[0].stats.speed, 4);
});
test('blocked alpha cannot fire a legal ordinary shot but may load, unload or move', () => {
  let game = fixture('bloodmoon-pistol');
  game.heroes[1].pos = 'foyer';
  game.heroes[0].pos = 'shoot-room-2';
  assert(transferItemInstance(game.heroes[0], game.heroes[1], 'test-pistol'));
  addItemInstance(game.heroes[1], 'silver-bullet', 'test-alpha-bullet');
  game = clear(act(game, { type: 'select', id: 1 }));
  assert(
    ability(game, 'firearm.shoot'),
    'ray is legal before blocking the attack',
  );
  game.heroes[1].attackBlockedRound = game.round;
  assert.equal(ability(game, 'firearm.shoot'), undefined);
  assert(ability(game, 'firearm.load'));
  game = act(game, ability(game, 'firearm.load').command);
  assert(ability(game, 'firearm.unload'));
  assert(actions(game).move.length);
});
