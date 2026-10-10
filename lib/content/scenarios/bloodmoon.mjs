import { setupBloodmoonActors } from '../bloodmoon-actors.mjs';

export const bloodmoon = {
  id: 'bloodmoon',
  automaticEnemies: false,
  hauntRules: [{ priority: 50, matches: (omenId) => omenId === 'bite-mark' }],
  canStartHaunt: (game) =>
    game.heroes.some((hero) => !hero.dead && hero.omens.includes('bite-mark')),
  hauntRequirement:
    '血月之夜等待咬痕揭示：继续探索，咬痕持有者确定后才进行作祟检定。',
  timeoutReason: '血月之夜没有轮数上限。',
  setup(game, card, { announce, log, traitValue }) {
    const alpha = game.heroes.find(
      (hero) => !hero.dead && hero.omens.includes('bite-mark'),
    );
    if (!alpha) throw new Error('血月之夜作祟需要一名存活的咬痕持有者。');
    setupBloodmoonActors(game, alpha.id);
    for (const hero of game.heroes)
      if (hero.faction === 'heroes')
        hero.hauntBodyValues = {
          might: traitValue(hero, 'might', game),
          speed: traitValue(hero, 'speed', game),
        };
    announce(game, '血月之夜', card.haunt, 'haunt', {
      objective: card.objective,
    });
    log(game, `${alpha.name}成为初始狼人，保留玩家座位与角色回合。`);
  },
  victory: (game) =>
    game.heroes[game.bloodmoonCombat.alphaId].dead &&
    '初始狼人已被击杀，英雄获胜。',
  defeat: (game) =>
    !game.heroes.some((hero) => !hero.dead && hero.faction === 'heroes') &&
    '英雄全部死亡或转化，狼人获胜。',
  winnerFaction: (won) => (won ? 'heroes' : 'wolves'),
};
