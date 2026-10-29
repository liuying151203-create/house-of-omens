import { moonlit } from '../room-environment.mjs';
import { itemInstances, itemInstanceCharges } from '../item-instances.mjs';
import { modifierValue } from '../modifiers.mjs';
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
  if (['BeforeActorAttack', 'BeforeEnemyAttack', 'BeforeCardAttack'].includes(event.when) && !event.cancelled) {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    const cloak = hero && !hero.dead && itemInstances(hero).find((item) => item.definitionId === 'shadow-cloak');
    if (cloak) return [{ id: 'item.shadowCloak', sourceId: `item:${cloak.instanceId}`, sourceLabel: '幽影斗篷', when: event.when, priority: 100, effects: [{ op: 'item.shadowCloak.start', params: { heroId: hero.id, instanceId: cloak.instanceId } }] }];
  }
  if (
    event.when === 'BeforeCheck' &&
    ['combat.heroAttack', 'combat.actorAttack'].includes(event.checkKind)
  ) {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    const item =
      hero &&
      itemInstances(hero).find((entry) => entry.definitionId === 'evil-knife');
    const roll = event.rolls?.[0];
    if (
      hero &&
      !hero.dead &&
      item &&
      roll?.heroId === hero.id &&
      roll.count <= 16
    )
      return [
        {
          id: 'item.evilKnife',
          sourceId: `item:${item.instanceId}`,
          sourceLabel: '邪恶小刀',
          when: event.when,
          priority: 0,
          effects: [
            {
              op: 'reaction.request',
              params: {
                heroId: hero.id,
                visibility: { heroIds: [hero.id] },
                title: '邪恶小刀 · 加注',
                text: '本次主动近战多投2枚骰；若未获胜，承受1点精神伤害。',
                options: [
                  {
                    id: 'use',
                    label: '多投2枚骰',
                    effects: [
                      {
                        op: 'item.evilKnife.activate',
                        params: {
                          heroId: hero.id,
                          instanceId: item.instanceId,
                        },
                      },
                    ],
                  },
                  { id: 'skip', label: '不使用小刀', effects: [] },
                ],
              },
            },
          ],
        },
      ];
  }
  if (
    event.when === 'AfterRoll' &&
    ['combat.heroAttack', 'combat.actorAttack'].includes(event.checkKind)
  ) {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    const item =
      hero &&
      itemInstances(hero).find((entry) => entry.definitionId === 'frost-blade');
    if (hero && !hero.dead && item && event.groups?.length === 2)
      return [
        {
          id: 'item.frostBlade',
          sourceId: `item:${item.instanceId}`,
          sourceLabel: '冰霜刃',
          when: event.when,
          priority: -200,
          effects: [
            {
              op: 'reaction.request',
              params: {
                heroId: hero.id,
                visibility: { heroIds: [hero.id] },
                title: '冰霜刃 · 寒霜',
                text: '可少造成1点伤害，使目标下一次回合移动力减少2点。',
                options: [
                  {
                    id: 'freeze',
                    label: '少造成1点伤害并减速',
                    effects: [
                      {
                        op: 'item.frostBlade.activate',
                        params: {
                          heroId: hero.id,
                          instanceId: item.instanceId,
                        },
                      },
                    ],
                  },
                  { id: 'skip', label: '正常造成伤害', effects: [] },
                ],
              },
            },
          ],
        },
      ];
  }
  if (event.when === 'AfterRoll' && event.checkKind === 'event.check') {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    const item =
      hero &&
      itemInstances(hero).find((entry) => entry.definitionId === 'luck-cup');
    const group = event.groups?.find((entry) => entry.heroId === hero?.id);
    if (hero && !hero.dead && item && group)
      return [
        {
          id: 'item.luckCup',
          sourceId: `item:${item.instanceId}`,
          sourceLabel: '改运骰盅',
          when: event.when,
          priority: -100,
          effects: [
            {
              op: 'reaction.request',
              params: {
                heroId: hero.id,
                visibility: { heroIds: [hero.id] },
                title: '改运骰盅 · 重掷',
                text: '本次事件检定失败，可消耗骰盅重掷全部骰子，必须接受新结果。',
                options: [
                  {
                    id: 'reroll',
                    label: '消耗骰盅并重掷全部骰子',
                    effects: [
                      {
                        op: 'item.luckCup.reroll',
                        params: {
                          heroId: hero.id,
                          instanceId: item.instanceId,
                        },
                      },
                    ],
                  },
                  { id: 'skip', label: '不使用骰盅', effects: [] },
                ],
              },
            },
          ],
        },
      ];
  }
  if (
    event.when === 'BeforeDamage' &&
    event.damageType === 'mental' &&
    !event.cancelled
  ) {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    const cloak = event.causeTag === 'wailingViolin' && hero && itemInstances(hero).find((entry) => entry.definitionId === 'shadow-cloak');
    const cloakTriggers = cloak && !hero.dead ? [{ id: 'item.shadowCloak', sourceId: `item:${cloak.instanceId}`, sourceLabel: '幽影斗篷', when: event.when, priority: 100, effects: [{ op: 'item.shadowCloak.start', params: { heroId: hero.id, instanceId: cloak.instanceId } }] }] : [];
    const item =
      hero &&
      itemInstances(hero).find(
        (entry) =>
          entry.definitionId === 'mind-amulet' &&
          entry.state?.mentalRound !== game.round,
      );
    const remaining =
      hero &&
      event.amount -
        modifierValue(game, 'damage.mental.prevent', { heroId: hero.id });
    if (hero && !hero.dead && item && remaining > 0)
      return [
        ...cloakTriggers,
        {
          id: 'item.mindAmulet.mental',
          sourceId: `item:${item.instanceId}`,
          sourceLabel: '心灵护符',
          when: event.when,
          priority: -100,
          effects: [
            {
              op: 'reaction.request',
              params: {
                heroId: hero.id,
                required: true,
                title: '心灵护符 · 精神防护',
                text: '本轮首次受到精神伤害，可减少1点。',
                options: [
                  {
                    id: 'skip',
                    label: '不减伤',
                    effects: [
                      {
                        op: 'item.mindAmulet.mental',
                        params: {
                          heroId: hero.id,
                          instanceId: item.instanceId,
                          reduce: false,
                        },
                      },
                    ],
                  },
                  {
                    id: 'reduce',
                    label: '减少1点',
                    effects: [
                      {
                        op: 'item.mindAmulet.mental',
                        params: {
                          heroId: hero.id,
                          instanceId: item.instanceId,
                          reduce: true,
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ];
    return cloakTriggers;
  }
  if (
    event.when === 'BeforeDeath' &&
    ['physical', 'mental'].includes(event.damageType)
  ) {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    const item =
      hero &&
      itemInstances(hero).find((entry) => entry.definitionId === 'mind-amulet');
    if (hero && !hero.dead && item)
      return [
        {
          id: 'item.mindAmulet.fatal',
          sourceId: `item:${item.instanceId}`,
          sourceLabel: '心灵护符',
          when: event.when,
          priority: -100,
          effects: [
            {
              op: 'reaction.request',
              params: {
                heroId: hero.id,
                title: '心灵护符 · 抵挡致命伤',
                text: '消耗护符，将本次伤害导致的属性下降限制在死亡点前一格。',
                options: [
                  {
                    id: 'protect',
                    label: '使用护符保命',
                    effects: [
                      {
                        op: 'item.mindAmulet.fatal',
                        params: {
                          heroId: hero.id,
                          instanceId: item.instanceId,
                        },
                      },
                    ],
                  },
                  { id: 'skip', label: '不使用护符', effects: [] },
                ],
              },
            },
          ],
        },
      ];
  }
  if (
    event.when === 'BeforeDamage' &&
    event.damageType === 'physical' &&
    !event.cancelled
  ) {
    const victim = game.heroes.find((hero) => hero.id === event.heroId);
    if (victim && !victim.dead) {
      const cloak = event.causeTag === 'pistolShot' && itemInstances(victim).find((item) => item.definitionId === 'shadow-cloak');
      const cloakTriggers = cloak ? [{ id: 'item.shadowCloak', sourceId: `item:${cloak.instanceId}`, sourceLabel: '幽影斗篷', when: event.when, priority: 100, effects: [{ op: 'item.shadowCloak.start', params: { heroId: victim.id, instanceId: cloak.instanceId } }] }] : [];
      const doll =
        event.causeTag !== 'substituteDoll' &&
        itemInstances(victim).find(
          (item) => item.definitionId === 'substitute-doll',
        );
      const sourceHero = game.enemies.find(
        (enemy) => enemy.id === event.sourceEnemyId,
      )?.heroId;
      const candidates = game.heroes.filter(
        (hero) =>
          !hero.dead &&
          !hero.traitor &&
          hero.id !== victim.id &&
          hero.id !== event.sourceHeroId &&
          hero.id !== sourceHero,
      );
      const transferable =
        event.amount -
        modifierValue(game, 'damage.physical.prevent', { heroId: victim.id });
      const dolls =
        doll && candidates.length && transferable > 0
          ? [
              {
                id: 'item.substituteDoll',
                sourceId: `item:${doll.instanceId}`,
                sourceLabel: '替身木偶',
                when: event.when,
                priority: -90,
                effects: [
                  {
                    op: 'reaction.request',
                    params: {
                      heroId: victim.id,
                      visibility: { heroIds: [victim.id] },
                      title: '替身木偶 · 转移伤害',
                      text: '可将本次身体伤害转移给另一名人物，对方不能拒绝，转移的伤害不致死。',
                      options: [
                        ...candidates.map((target) => ({
                          id: `hero:${target.id}`,
                          label: `转移给${target.name}`,
                          effects: [
                            {
                              op: 'item.substituteDoll.transfer',
                              params: {
                                heroId: victim.id,
                                targetId: target.id,
                                instanceId: doll.instanceId,
                              },
                            },
                          ],
                        })),
                        { id: 'skip', label: '不使用木偶', effects: [] },
                      ],
                    },
                  },
                ],
              },
            ]
          : [];
      const remaining = Math.max(
        0,
        event.amount -
          modifierValue(game, 'damage.physical.prevent', {
            heroId: victim.id,
          }) -
          1,
      );
      const shields = game.heroes
        .filter((hero) => !hero.dead && hero.pos === victim.pos)
        .flatMap((hero) =>
          itemInstances(hero)
            .filter((item) => item.definitionId === 'riot-shield')
            .map((item) => ({ hero, item })),
        );
      return [
        ...cloakTriggers,
        ...dolls,
        ...shields.flatMap(({ hero, item }) => {
          const maximum = Math.min(
            remaining,
            itemInstanceCharges(item, { charges: 4 }),
          );
          if (maximum <= 0) return [];
          return [
            {
              id: 'item.riotShield',
              sourceId: `item:${item.instanceId}`,
              sourceLabel: '防暴盾',
              when: event.when,
              priority: -100,
              effects: [
                {
                  op: 'reaction.request',
                  params: {
                    heroId: hero.id,
                    visibility: { heroIds: [hero.id] },
                    title: '防暴盾 · 承受伤害',
                    text: `${victim.name}受到身体伤害，可让盾牌承受超过1点的部分。`,
                    options: [
                      ...Array.from({ length: maximum }, (_, index) => ({
                        id: `absorb:${index + 1}`,
                        label: `盾牌承受${index + 1}点`,
                        effects: [
                          {
                            op: 'item.riotShield.absorb',
                            params: {
                              holderId: hero.id,
                              victimId: victim.id,
                              instanceId: item.instanceId,
                              amount: index + 1,
                            },
                          },
                        ],
                      })),
                      { id: 'skip', label: '不使用防暴盾', effects: [] },
                    ],
                  },
                },
              ],
            },
          ];
        }),
      ];
    }
  }
  if (
    event.when === 'AfterDamage' &&
    event.damageType === 'physical' &&
    event.actualAmount > 0 &&
    ['attack', 'actorAttack', 'actorCounter'].includes(event.causeTag)
  ) {
    const wearer = game.heroes.find((hero) => hero.id === event.heroId);
    const armor =
      wearer &&
      itemInstances(wearer).find((item) => item.definitionId === 'thorn-armor');
    const enemy = game.enemies.find(
      (entry) => entry.id === event.sourceEnemyId,
    );
    const attacker = game.heroes.find((hero) => hero.id === event.sourceHeroId);
    const hostileHero =
      attacker &&
      !attacker.dead &&
      attacker.faction !== wearer?.faction &&
      attacker.pos === wearer?.pos;
    if (
      armor &&
      !wearer.dead &&
      ((enemy && enemy.pos === wearer.pos) || hostileHero)
    ) {
      const effect = enemy
        ? {
            op: 'enemy.receivePhysicalDamage',
            params: {
              enemyId: enemy.id,
              amount: 1,
              sourceCardId: 'thorn-armor',
            },
          }
        : {
            op: 'damage.deal',
            params: {
              heroId: attacker.id,
              damageType: 'physical',
              amount: 1,
              causeTag: 'thornArmor',
              sourceKind: 'card',
              sourceCardId: 'thorn-armor',
            },
          };
      return [
        {
          id: 'item.thornArmor',
          sourceId: `item:${armor.instanceId}`,
          sourceLabel: '荆棘铠甲',
          when: event.when,
          effects: [
            {
              op: 'reaction.request',
              params: {
                heroId: wearer.id,
                title: '荆棘铠甲 · 反伤',
                text: `是否让${enemy?.name || attacker.name}承受1点身体伤害？`,
                options: [
                  { id: 'retaliate', label: '反伤1点', effects: [effect] },
                  { id: 'skip', label: '放弃', effects: [] },
                ],
              },
            },
          ],
        },
      ];
    }
  }
  if (event.when === 'TurnStarting') {
    const hero = game.heroes.find((entry) => entry.id === event.heroId);
    if (!hero || hero.dead) return [];
    return (hero.statuses || [])
      .filter(
        (status) =>
          (status.id === 'trait-boost' || (status.id === 'sports-drink' && status.remainingTurns === undefined)) && status.expiresRound <= game.round,
      )
      .map((status) => ({
        id: `status.${status.id}.expire`,
        sourceId: `hero:${hero.id}:status:${status.instanceId}`,
        sourceLabel: status.label,
        when: event.when,
        priority: 20,
        handler: status.id === 'sports-drink' ? 'status.sportsDrinkRecovery' : 'status.expireTraitBoost',
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
    if (enemy?.kind === 'alpha' && !enemy.traitModel && moonlit(game, room))
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
