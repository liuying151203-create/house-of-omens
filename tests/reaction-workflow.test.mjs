import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  createInteractiveGame,
  executeRuleEffects,
  pending,
  validSave,
} from '../lib/game-engine.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

function gameWithReaction() {
  const game = createInteractiveGame('werewolf', 1001, 3),
    hero = game.heroes[0];
  game.queue = [];
  hero.stats.might--;
  hero.moves = 1;
  executeRuleEffects(game, [
    {
      op: 'reaction.request',
      params: {
        heroId: hero.id,
        title: '测试反应',
        text: '选择是否恢复力量。',
        options: [
          {
            id: 'recover',
            label: '恢复力量',
            resultText: '选择恢复力量。',
            effects: [
              {
                op: 'hero.changeTrait',
                params: { heroId: hero.id, trait: 'might', delta: 1 },
              },
            ],
          },
          { id: 'pass', label: '跳过', effects: [] },
        ],
      },
    },
    {
      op: 'hero.changeMoves',
      params: { heroId: hero.id, delta: 2 },
    },
  ]);
  return game;
}

test('declarative reactions pause, restore and apply only the selected effects', () => {
  let game = gameWithReaction();
  const request = pending(game),
    before = game.heroes[0].stats.might;
  assert.equal(request.kind, 'choiceRequest');
  assert.equal(request.workflow.definitionId, 'reaction.chooseEffect');
  assert.equal(game.heroes[0].moves, 1);
  assert(validSave(game));
  const saved = JSON.parse(JSON.stringify(game));
  assert.deepEqual(
    act(saved, {
      type: 'resolveChoice',
      requestId: request.uid,
      choice: 'missing',
    }),
    saved,
  );
  game = act(saved, {
    type: 'resolveChoice',
    requestId: request.uid,
    choice: 'recover',
  });
  assert.equal(game.heroes[0].stats.might, before + 1);
  assert.equal(game.heroes[0].moves, 3);
  assert.equal(pending(game), null);
  assert.equal(game.events.at(-1).type, 'ChoiceResolved');
  const settled = structuredClone(game);
  assert.deepEqual(
    act(game, {
      type: 'resolveChoice',
      requestId: request.uid,
      choice: 'recover',
    }),
    settled,
  );
});

test('multi-player reactions follow seat order and resume after every responder acts or skips', () => {
  let game = createInteractiveGame('mirror', 1002, 3);
  game.queue = [];
  game.heroes[0].moves = 1;
  executeRuleEffects(game, [
    {
      op: 'reaction.request',
      params: {
        responders: [1, 0],
        title: '多人反应',
        options: [
          {
            id: 'mark',
            label: '响应',
            effects: [
              {
                op: 'status.add',
                params: {
                  heroId: '$event.heroId',
                  status: { id: 'responded' },
                },
              },
            ],
          },
          { id: 'pass', label: '跳过', effects: [] },
        ],
      },
    },
    {
      op: 'hero.changeMoves',
      params: { heroId: 0, delta: 2 },
    },
  ]);
  let request = pending(game);
  assert.equal(request.heroId, 0);
  assert.equal(request.timeoutChoice, 'pass');
  game = act(game, {
    type: 'resolveChoice',
    requestId: request.uid,
    choice: 'mark',
  });
  request = pending(game);
  assert.equal(request.heroId, 1);
  assert.equal(game.heroes[0].moves, 1);
  assert(game.heroes[0].statuses.some((status) => status.id === 'responded'));

  game = act(JSON.parse(JSON.stringify(game)), {
    type: 'resolveChoice',
    requestId: request.uid,
    choice: 'pass',
  });
  assert.equal(pending(game), null);
  assert.equal(game.heroes[0].moves, 3);
  assert(!game.heroes[1].statuses.some((status) => status.id === 'responded'));
  assert.deepEqual(
    game.events
      .filter((event) => event.type === 'ChoiceResolved')
      .map((event) => event.heroId),
    [0, 1],
  );
});

test('network projections hide reaction internals and only the owning seat may answer', () => {
  const service = createRoomService({ gameFactory: gameWithReaction }),
    host = service.create({
      count: 3,
      scenario: 'werewolf',
      name: '房主',
    }),
    guest = service.join({ code: host.code, name: '访客' }),
    started = service.update(host.code, host.key, {
      type: 'start',
      revision: guest.revision,
    }),
    hostRequest = pending(started.game),
    guestView = service.read(host.code, guest.key),
    guestRequest = pending(guestView.game);
  assert.equal(hostRequest.workflow.locals, undefined);
  assert.equal(hostRequest.options.length, 2);
  assert.equal(guestRequest.choiceHidden, true);
  assert.deepEqual(guestRequest.options, []);
  assert.throws(
    () =>
      service.update(host.code, guest.key, {
        type: 'action',
        revision: started.revision,
        action: {
          type: 'resolveChoice',
          requestId: hostRequest.uid,
          choice: 'recover',
        },
      }),
    /当前角色/,
  );
  const resolved = service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: {
      type: 'resolveChoice',
      requestId: hostRequest.uid,
      choice: 'recover',
    },
  });
  assert.equal(pending(resolved.game), null);
});

test('the responsible LAN seat owns a required trigger-order choice', () => {
  const gameFactory = () => {
      let game = createHauntPlaytest('werewolf', 1003, 3);
      game.queue = [];
      game.enemies.forEach((enemy) => {
        enemy.bornAt = game.elapsed + 1;
      });
      game.ruleTriggers = ['左侧效果', '右侧效果'].map((label, index) => ({
        id: `network-order-${index}`,
        sourceId: `network-source-${index}`,
        sourceLabel: label,
        when: 'RoundStatusTick',
        priority: 3,
        playerOrder: true,
        orderHeroId: 1,
        effects: [
          {
            op: 'status.add',
            params: { heroId: 1, status: { id: `network-order-${index}` } },
          },
        ],
      }));
      game = act(game, { type: 'endRound', round: game.round });
      return game;
    },
    service = createRoomService({ gameFactory }),
    host = service.create({ count: 3, scenario: 'werewolf' }),
    guest = service.join({ code: host.code }),
    started = service.update(host.code, host.key, {
      type: 'start',
      revision: guest.revision,
    }),
    hostRequest = pending(started.game),
    guestView = service.read(host.code, guest.key),
    guestRequest = pending(guestView.game);
  assert.equal(hostRequest.kind, 'privateRequest');
  assert.equal(hostRequest.private, true);
  assert.equal(guestRequest.heroId, 1);
  assert.equal(guestRequest.options.length, 2);
  assert.throws(
    () =>
      service.update(host.code, host.key, {
        type: 'action',
        revision: started.revision,
        action: {
          type: 'resolveChoice',
          requestId: guestRequest.uid,
          choice: guestRequest.options[1].value,
        },
      }),
    /当前角色/,
  );
  const resolved = service.update(host.code, guest.key, {
    type: 'action',
    revision: started.revision,
    action: {
      type: 'resolveChoice',
      requestId: guestRequest.uid,
      choice: guestRequest.options[1].value,
    },
  });
  assert.equal(resolved.game.heroes[1].statuses[0].id, 'network-order-1');
});

test('the LAN host can apply the declared skip only after the authoritative deadline', () => {
  let clock = 5000;
  const service = createRoomService({
      gameFactory: gameWithReaction,
      now: () => clock,
    }),
    host = service.create({ count: 3, scenario: 'werewolf' }),
    guest = service.join({ code: host.code }),
    started = service.update(host.code, host.key, {
      type: 'start',
      revision: guest.revision,
    }),
    request = pending(started.game);
  assert.equal(request.deadlineAt, clock + request.timeoutMs);
  assert.equal(request.canResolveTimeout, true);
  assert.throws(
    () =>
      service.update(host.code, guest.key, {
        type: 'action',
        revision: started.revision,
        action: { type: 'timeoutChoice', requestId: request.uid },
      }),
    /房主/,
  );
  assert.throws(
    () =>
      service.update(host.code, host.key, {
        type: 'action',
        revision: started.revision,
        action: { type: 'timeoutChoice', requestId: request.uid },
      }),
    /等待时间/,
  );
  clock = request.deadlineAt;
  const resolved = service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: { type: 'timeoutChoice', requestId: request.uid },
  });
  assert.equal(pending(resolved.game), null);
  assert.equal(resolved.game.heroes[0].moves, 3);

  let pollClock = 9000;
  const pollingService = createRoomService({
      gameFactory: gameWithReaction,
      now: () => pollClock,
    }),
    pollingHost = pollingService.create({ count: 3, scenario: 'werewolf' }),
    pollingGuest = pollingService.join({ code: pollingHost.code }),
    pollingStarted = pollingService.update(pollingHost.code, pollingHost.key, {
      type: 'start',
      revision: pollingGuest.revision,
    }),
    pollingRequest = pending(pollingStarted.game);
  pollClock = pollingRequest.deadlineAt;
  const automaticallySettled = pollingService.read(
    pollingHost.code,
    pollingGuest.key,
  );
  assert.equal(pending(automaticallySettled.game), null);
  assert.equal(automaticallySettled.revision, pollingStarted.revision + 1);
});
