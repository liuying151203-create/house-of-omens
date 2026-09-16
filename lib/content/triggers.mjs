import { moonlit } from '../room-environment.mjs';

export function contentTriggers(game, event) {
  if (event.when === 'RoundStatusTick')
    return game.heroes
      .filter((hero) => !hero.dead && !hero.traitor)
      .flatMap((hero) =>
        (hero.statuses || []).flatMap((status, index) => {
          const sourceId = `hero:${hero.id}:status:${index}:${status.id}`;
          if (status.id === 'immunity' && status.until <= game.elapsed)
            return [
              {
                id: 'status.immunity.expire',
                sourceId,
                sourceLabel: '净血保护',
                when: event.when,
                priority: 20,
                handler: 'status.remove',
                params: {
                  heroId: hero.id,
                  statusId: status.id,
                  expired: true,
                },
              },
            ];
          if (status.id !== 'infection' || status.acquired >= game.elapsed)
            return [];
          return [
            status.turns <= 1
              ? {
                  id: 'status.infection.convert',
                  sourceId,
                  sourceLabel: '狼毒感染',
                  when: event.when,
                  priority: 10,
                  handler: 'werewolf.convert',
                  params: { heroId: hero.id },
                }
              : {
                  id: 'status.infection.tick',
                  sourceId,
                  sourceLabel: '狼毒感染',
                  when: event.when,
                  priority: 10,
                  handler: 'status.adjust',
                  params: {
                    heroId: hero.id,
                    statusId: status.id,
                    field: 'turns',
                    delta: -1,
                  },
                },
          ];
        }),
      );
  if (event.when === 'EnemyTurnStarting') {
    const enemy = game.enemies.find((entry) => entry.id === event.enemyId),
      room = game.rooms.find((entry) => entry.id === enemy?.pos);
    if (enemy?.kind === 'alpha' && moonlit(game, room))
      return [
        {
          id: 'werewolf.moonlight.regeneration',
          sourceId: `room:${room.id}:moonlight`,
          sourceLabel: '月光再生',
          when: event.when,
          priority: 0,
          handler: 'enemy.heal',
          params: { enemyId: enemy.id, amount: 2 },
        },
      ];
  }
  return [];
}
