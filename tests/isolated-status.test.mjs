import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../lib/game-engine.mjs';
import { heroStatuses } from '../lib/hero-status.mjs';

test('落单状态仅在作祟阶段显示', () => {
  const game = createGame('bloodmoon', 17, 3);
  const hero = game.heroes[0];
  game.heroes = [hero];
  game.phase = 'explore';
  assert.equal(
    heroStatuses(game, hero).some((s) => s.id === 'bloodmoon-isolated'),
    false,
  );
  game.phase = 'haunt';
  assert.equal(
    heroStatuses(game, hero).some((s) => s.id === 'bloodmoon-isolated'),
    true,
  );
});
