import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInteractiveGame,
  createGame,
  triggerHaunt,
  drawCard,
  act,
  pending,
  validSave,
  OMENS,
} from '../lib/game-engine.mjs';
import {
  attributeChanges,
  hauntCardRule,
  rosterGroups,
  publicEnemies,
  gameModeLabel,
  canInspectHero,
} from '../lib/game-view.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

function lastOmen(scenario) {
  const game = createInteractiveGame(scenario, 72, 3);
  game.queue = [];
  // Make this the actual last omen: the scenario test must not depend on room-shuffle RNG.
  game.omens = OMENS.length - 1;
  game.decks.omen = ['mirror-shard'];
  drawCard(game, 'omen', game.heroes[0]);
  return game;
}
function reveal(s) {
  for (let i = 0; s.phase === 'explore' && i < 30; i++) {
    assert(pending(s));
    s = act(s, {
      type:
        pending(s).kind === 'diceRequest' &&
        pending(s).rolls.some((r) => !r.dice)
          ? 'rollAll'
          : 'advance',
    });
    assert(validSave(s));
    s = JSON.parse(JSON.stringify(s));
  }
  assert.equal(s.phase, 'haunt');
  return s;
}

test('directed werewolf stays werewolf with a mirror omen after interactive saves; mystery selects mirror', () => {
  const fixed = reveal(lastOmen('werewolf'));
  assert.equal(fixed.scenario, 'werewolf');
  assert.equal(fixed.automaticHaunt, false);
  assert.equal(fixed.enemies[0].kind, 'alpha');
  assert.equal(reveal(lastOmen('mystery')).scenario, 'mirror');
  assert.match(gameModeLabel(fixed), /狼人.*定向试玩/);
  assert.match(gameModeLabel(lastOmen('mystery')), /组合触发/);
});

test('LAN directed werewolf survives the full card reveal and reconnect even when omen matches mirror', () => {
  const api = createRoomService({
    gameFactory: (scenario) => lastOmen(scenario),
  });
  const host = api.create({ count: 3, scenario: 'werewolf' });
  const guest = api.join({ code: host.code });
  let r = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  for (let i = 0; r.game.phase === 'explore' && i < 30; i++) {
    const p = pending(r.game);
    r = api.update(host.code, host.key, {
      type: 'action',
      revision: r.revision,
      action:
        p.kind === 'diceRequest' && p.rolls.some((x) => !x.dice)
          ? {
              type: 'rollAll',
              sideIds: p.rolls.filter((x) => !x.dice).map((x) => x.id),
            }
          : { type: 'advance' },
    });
    assert.equal(api.read(host.code, guest.key).game.scenario, 'werewolf');
  }
  assert.equal(r.game.phase, 'haunt');
  assert.equal(r.game.enemies[0].kind, 'alpha');
});

test('locket exposes only its ordinary effect until the matching haunt is revealed', () => {
  const card = OMENS.find((c) => c.id === 'locket');
  assert(!card.effect.includes('治疗'));
  assert.equal(hauntCardRule(card, null), null);
  assert.equal(hauntCardRule(card, createGame('werewolf', 1)), null);
  assert.equal(
    hauntCardRule(card, { scenario: 'mirror', phase: 'haunt' }),
    null,
  );
  assert.match(
    hauntCardRule(card, { scenario: 'werewolf', phase: 'haunt' }),
    /双方都持有时仍只加2/,
  );
  assert.equal(
    hauntCardRule(
      { hauntEffects: { werewolf: {} } },
      { scenario: 'werewolf', phase: 'haunt' },
    ),
    null,
  );
});

test('trait feedback detects track steps even with equal values and excludes converted attributes', () => {
  const before = createGame('werewolf', 1);
  before.heroes[0].tracks.sanity[4] = before.heroes[0].tracks.sanity[3];
  before.heroes[0].stats.sanity = 3;
  const after = structuredClone(before);
  after.heroes[0].stats.sanity = 4;
  const changes = attributeChanges(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].steps, 1);
  assert.equal(changes[0].from, changes[0].to);
  assert.deepEqual(attributeChanges(null, after), []);
  after.heroes[0].traitor = true;
  assert.deepEqual(attributeChanges(before, after), []);
});

test('faction roster replaces a converted explorer with one wolf at the live monster location', () => {
  const s = createGame('werewolf', 23, 4);
  s.queue = [];
  triggerHaunt(s);
  const alpha = s.enemies[0];
  alpha.pos = 'upper';
  const groups = rosterGroups(s);
  assert.equal(groups.find((g) => g.id === 'heroes').heroes.length, 3);
  const wolves = groups.find((g) => g.id === 'wolves');
  assert.equal(wolves.heroes.length, 0);
  assert.equal(wolves.enemies.length, 1);
  assert.equal(wolves.enemies[0].pos, 'upper');
  assert.equal(wolves.enemies[0].explorerName, s.heroes[alpha.heroId].name);
  s.heroes[alpha.heroId].dead = true;
  s.enemies = [];
  assert.equal(rosterGroups(s).find((g) => g.id === 'dead').heroes.length, 1);
  assert(!rosterGroups(s).some((g) => g.id === 'wolves'));
});

test('unrevealed mirror has no roster position or stats; keeper is represented once', () => {
  const s = createGame('mirror', 23);
  s.queue = [];
  triggerHaunt(s);
  s.enemies.push({
    id: 'hidden-wraith',
    name: '秘密',
    hidden: true,
    pos: s.trueMirror,
    hp: 99,
  });
  const monsters = rosterGroups(s).find((g) => g.id === 'monsters');
  assert.equal(monsters.unknown, true);
  assert(!JSON.stringify(monsters).includes('hidden-wraith'));
  assert(!publicEnemies(s).some((e) => e.hidden));
  s.mirrorFound = true;
  assert(!rosterGroups(s).find((g) => g.id === 'monsters').unknown);
  const bells = createGame('bells', 1);
  triggerHaunt(bells);
  const traitors = rosterGroups(bells).find((g) => g.id === 'traitors');
  assert.equal(traitors.heroes.length, 0);
  assert.equal(traitors.enemies.length, 1);
});

test('opposing faction cannot inspect hero tracks or inventory; host can inspect delegated heroes', () => {
  const game = createGame('werewolf', 23);
  triggerHaunt(game);
  const wolf = game.heroes.find((h) => h.traitor);
  const seats = game.heroes.map((h) => (h.traitor ? 'guest' : 'host'));
  assert.equal(
    canInspectHero(game, game.heroes[0], {
      seats,
      hostId: 'host',
      you: 'guest',
    }),
    false,
  );
  assert.equal(
    canInspectHero(game, game.heroes[0], {
      seats,
      hostId: 'host',
      you: 'host',
    }),
    true,
  );
  assert.equal(canInspectHero(game, wolf, null), false);
});

test('coffee never consumes itself or resumes movement when stopped; grants two usable moves next round', () => {
  let s = createGame('werewolf', 1);
  s.queue = [];
  s.heroes[0].items = ['coffee'];
  s.heroes[0].stopped = true;
  s.heroes[0].moves = 0;
  s = act(s, { type: 'useItem', id: 'coffee' });
  assert(s.heroes[0].items.includes('coffee'));
  assert.equal(s.heroes[0].moves, 0);
  assert(s.heroes[0].stopped);
  s.queue = [];
  s = act(s, { type: 'endRound' });
  while (pending(s)) s = act(s, { type: 'advance' });
  const moves = s.heroes[0].moves;
  s = act(s, { type: 'useItem', id: 'coffee' });
  assert.equal(s.heroes[0].moves, moves + 2);
  assert(!s.heroes[0].items.includes('coffee'));
  assert(!s.heroes[0].stopped);
});

test('keeper movement and death update the converted explorer for both new and older saves', () => {
  for (const legacy of [false, true]) {
    let s = createGame('bells', 1);
    triggerHaunt(s);
    s.queue = [];
    if (legacy) delete s.enemies[0].heroId;
    s.enemies[0].pos = 'upper';
    s = act(s, { type: 'endRound' });
    assert.equal(s.enemies[0].pos, 'stairs');
    assert.equal(s.heroes.find((h) => h.traitor).pos, 'stairs');
    while (pending(s)) s = act(s, { type: 'advance' });
    assert.equal(s.round, 2);
    s.heroes[s.active].pos = 'stairs';
    s.enemies[0].hp = 1;
    s._rollReplay = [[2, 2, 2, 2], [0]];
    s = act(s, { type: 'attack', id: 'keeper' });
    assert(s.heroes.find((h) => h.traitor).dead);
    assert(!rosterGroups(s).some((g) => g.id === 'traitors'));
    assert.equal(rosterGroups(s).find((g) => g.id === 'dead').heroes.length, 1);
  }
});
