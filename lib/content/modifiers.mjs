import { cardModifierContributions } from '../card-rules.mjs';
import { moonlit } from '../room-environment.mjs';

export function contentModifierContributions(game, query, context = {}) {
  const entries = cardModifierContributions(game, query, context);
  if (query === 'enemy.might' || query === 'combat.damage.cap') {
    const enemy = game.enemies.find((entry) => entry.id === context.enemyId),
      room = game.rooms.find(
        (entry) => entry.id === (context.roomId || enemy?.pos),
      );
    if (
      enemy &&
      ['alpha', 'wolf'].includes(enemy.kind) &&
      moonlit(game, room)
    ) {
      if (query === 'enemy.might')
        entries.push({
          id: 'environment.moonlight.might',
          sourceId: `room:${room.id}:moonlight`,
          sourceLabel: '月光',
          stackGroup: 'environment.moonlight.might',
          strategy: 'unique',
          value: 1,
        });
      else if (enemy.kind === 'alpha')
        entries.push({
          id: 'environment.moonlight.alpha-cap',
          sourceId: `room:${room.id}:moonlight`,
          sourceLabel: '月光下的狼王厚皮',
          stackGroup: 'combat.damage.cap',
          strategy: 'cap',
          value: 2,
        });
    }
  }
  return entries;
}
