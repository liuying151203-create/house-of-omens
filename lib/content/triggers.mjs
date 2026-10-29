import { moonlit } from '../room-environment.mjs';
import { traitRuleView } from '../rule-views.mjs';

export function contentTriggers(game, event) {
  if (event.when === 'TurnEnding') {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    if (!hero || hero.dead) return [];
    return (hero.statuses || []).filter((status) => status.id === 'sports-drink' && status.remainingTurns > 0 && status.lastRecoveryRound !== game.round).map((status) => {
      const choices = ['might', 'speed'].filter((trait) => {
        const view = traitRuleView(game, hero, trait);
        return view.changeable && view.current < Math.min(view.start, view.maxPosition);
      });
      const effect = (trait) => ({ op: 'status.sportsDrinkTick', params: { heroId: hero.id, instanceId: status.instanceId, trait } });
      return {
        id: 'status.sportsDrink.tick', sourceId: `hero:${hero.id}:status:${status.instanceId}`, sourceLabel: '运动饮料', when: event.when, priority: 20,
        effects: choices.length < 2 ? [effect(choices[0] || null)] : [{ op: 'reaction.request', params: {
          heroId: hero.id, required: true, visibility: { heroIds: [hero.id] }, title: '运动饮料 · 恢复', text: '选择恢复1格力量或速度，最多到起始位置。',
          options: choices.map((trait) => ({ id: trait, label: trait === 'might' ? '恢复1格力量' : '恢复1格速度', effects: [effect(trait)] })),
        } }],
      };
    });
  }
  if (event.when === 'TurnStarting') {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    if (!hero || hero.dead) return [];
    return (hero.statuses || [])
      .filter(
        (status) =>
          status.id === 'trait-boost' && status.expiresRound <= game.round,
      )
      .map((status) => ({
        id: 'status.trait-boost.expire',
        sourceId: `hero:${hero.id}:status:${status.instanceId}`,
        sourceLabel: status.label,
        when: event.when,
        priority: 20,
        handler: 'status.expireTraitBoost',
        params: { heroId: hero.id, instanceId: status.instanceId },
      }));
  }
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
