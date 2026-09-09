import test from 'node:test';
import assert from 'node:assert/strict';
import { mapScrollTarget } from '../lib/map-camera.mjs';
import { personalHero, canInspectHero } from '../lib/game-view.mjs';
import { createInteractiveGame } from '../lib/game-engine.mjs';

test('map camera centers the requested room with a full viewport of drag space at both edges', () => {
  for (const [width, height] of [
    [360, 780],
    [1280, 720],
    [1920, 1080],
  ]) {
    for (const zoom of [30, 110, 155]) {
      const minX = -3,
        minY = -4,
        maxX = 6,
        maxY = 5,
        gap = zoom / 11;
      for (const point of [
        { x: 0, y: 1 },
        { x: minX, y: minY },
        { x: maxX, y: maxY },
      ]) {
        const scroll = mapScrollTarget({
          point,
          minX,
          minY,
          zoom,
          width,
          height,
        });
        const x = width + (point.x - minX) * (zoom + gap) + zoom / 2;
        const y = height + (point.y - minY) * (zoom + gap) + zoom / 2;
        assert(Math.abs(x - scroll.left - width / 2) < 1e-9);
        assert(Math.abs(y - scroll.top - height / 2) < 1e-9);
        const maxScrollX =
          width + (maxX - minX + 1) * zoom + (maxX - minX) * gap;
        const maxScrollY =
          height + (maxY - minY + 1) * zoom + (maxY - minY) * gap;
        assert(
          scroll.left >= width / 2 && maxScrollX - scroll.left >= width / 2,
        );
        assert(
          scroll.top >= height / 2 && maxScrollY - scroll.top >= height / 2,
        );
      }
    }
  }
});

test('personal HUD follows the chosen solo explorer but stays with the local player during LAN turns', () => {
  const game = createInteractiveGame('werewolf', 88, 4);
  assert.equal(personalHero(game, null).id, 0);
  game.active = 2;
  assert.equal(personalHero(game, null).id, 2);
  const room = {
    hostId: 'host',
    you: 'guest',
    seats: ['host', 'guest', null, null],
  };
  assert.equal(personalHero(game, room).id, 1);
  game.active = 1;
  assert.equal(personalHero(game, room).id, 1);
  assert.equal(personalHero(game, { ...room, you: 'host' }).id, 0);
  game.active = 3;
  assert.equal(personalHero(game, { ...room, you: 'host' }).id, 3);
  assert.equal(personalHero(game, { ...room, you: 'spectator' }), null);
});

test('converted and fallen local explorers remain identifiable without revealing another faction inventory', () => {
  const game = createInteractiveGame('werewolf', 88, 4);
  const room = {
    hostId: 'host',
    you: 'guest',
    seats: ['host', 'guest', null, null],
  };
  game.phase = 'haunt';
  game.heroes[1].traitor = true;
  assert.equal(personalHero(game, room).id, 1);
  assert.equal(canInspectHero(game, game.heroes[0], room), false);
  game.heroes[1].dead = true;
  assert.equal(personalHero(game, room).id, 1);
});
