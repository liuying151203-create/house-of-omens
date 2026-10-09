import { setupBloodmoonActors } from '../bloodmoon-actors.mjs';

export const bloodmoon = {
  id: 'bloodmoon',
  automaticEnemies: false,
  timeoutReason: '血月试作没有轮数上限。',
  setup(game, card, { announce, log, traitValue }) {
    const alpha =
      game.heroes.find(
        (hero) => !hero.dead && hero.omens.includes('bite-mark'),
      ) || game.heroes.filter((hero) => !hero.dead).at(-1);
    setupBloodmoonActors(game, alpha.id);
    for (const hero of game.heroes)
      if (hero.faction === 'heroes')
        hero.hauntBodyValues = {
          might: traitValue(hero, 'might', game),
          speed: traitValue(hero, 'speed', game),
        };
    announce(game, '血月之夜 · 战斗模块试作', card.haunt, 'haunt', {
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
