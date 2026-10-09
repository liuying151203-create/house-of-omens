export const MOON_PHASES = ['awakening', 'full', 'blood'];
export const MOON_LABELS = { awakening: '初醒', full: '满月', blood: '血月' };
export const ALPHA_TRACKS = {
  awakening: {
    might: [0, 4, 4, 4, 5, 5, 6, 6],
    speed: [0, 4, 4, 5, 5, 5, 6, 7],
  },
  full: { might: [0, 4, 4, 5, 6, 6, 7, 7], speed: [0, 4, 5, 5, 6, 6, 7, 8] },
  blood: { might: [0, 4, 5, 5, 6, 7, 7, 8], speed: [0, 4, 5, 6, 6, 7, 8, 8] },
};
export const moonPhase = (completedRounds) =>
  completedRounds < 2 ? 'awakening' : completedRounds < 4 ? 'full' : 'blood';
export const isBloodmoon = (game) => game?.scenario === 'bloodmoon';
export const isAlpha = (game, hero) =>
  isBloodmoon(game) && hero?.combatRole === 'alpha';
export const hostile = (a, b) => a.faction !== b.faction;

export function setupBloodmoonActors(game, alphaId) {
  const alpha = game.heroes[alphaId];
  if (!alpha || alpha.dead) throw new Error('初始狼人必须是存活角色');
  game.bloodmoonCombat = { alphaId, moon: moonPhase(game.elapsed) };
  game.limit = null;
  game.enemies = [];
  game.targetRooms = [];
  for (const hero of game.heroes) {
    hero.combatRole = hero.id === alphaId ? 'alpha' : 'hero';
    hero.faction = hero.id === alphaId ? 'wolves' : 'heroes';
    // traitor 表示退出角色回合的旧敌人模型；新狼人保留座位与角色回合。
    hero.traitor = false;
  }
  alpha.tracks = {
    ...structuredClone(ALPHA_TRACKS.awakening),
    sanity: [0, 2, 3, 3, 4, 4, 5, 6],
    knowledge: [0, 2, 2, 3, 3, 4, 4, 5],
  };
  alpha.stats = { might: 4, speed: 4, sanity: 4, knowledge: 4 };
  alpha.start = { ...alpha.stats };
  alpha.role = '初始狼人';
}

export function bloodmoonTraitTrack(game, hero, trait) {
  return isAlpha(game, hero) && ['might', 'speed'].includes(trait)
    ? ALPHA_TRACKS[moonPhase(game.elapsed)][trait]
    : null;
}

export function bloodmoonActorActions(game, hero) {
  if (
    !isBloodmoon(game) ||
    hero.attacked ||
    hero.attackBlockedRound === game.round
  )
    return [];
  return game.heroes
    .filter(
      (target) =>
        !target.dead && hostile(hero, target) && target.pos === hero.pos,
    )
    .map((target) => ({
      id: `actorAttack:${target.id}`,
      command: { type: 'actorAttack', targetId: target.id },
      label: `${hero.faction === 'wolves' ? '撕咬' : '攻击'}${target.name}`,
      detail: '力量对抗 · 每回合一次主动攻击 · 伤害按完整差值分配',
      handler: 'combat.actor.attack',
      targetId: target.id,
    }));
}

export function actorContestRequest(
  game,
  actor,
  target,
  count,
  attackBonus = 0,
) {
  const alphaRules = isAlpha(game, actor)
    ? `主动撕咬实际造成至少3点身体伤害时，目标感染升1级，每次最多一级。${moonPhase(game.elapsed) === 'awakening' ? '当前初醒，无嗜血。' : `伤害结算后可自由分配同等格数的力量／速度嗜血恢复，最高第${actor.silverWeakened || moonPhase(game.elapsed) === 'full' ? 4 : 7}格。`}`
    : '';
  return {
    kind: 'diceRequest',
    heroId: actor.id,
    title: '力量交锋',
    attackBonus,
    text: `${actor.name}攻击${target.name}；双方以当前力量值投骰。${attackBonus ? '目标落单：初始狼人的最终攻击结果加1，不增加骰子数量或移动力量标记。' : ''}${alphaRules}`,
    outcomes: [
      {
        range: '攻击方最终点数 > 防御方',
        effect: '防御方分配差值对应的身体伤害。',
      },
      { range: '双方相等', effect: '双方不受伤。' },
      {
        range: '攻击方最终点数 < 防御方',
        effect: '攻击方分配差值对应的反击身体伤害。',
      },
    ],
    rolls: [actor, target].map((hero) => ({
      count: count(hero),
      heroId: hero.id,
      label: `${hero.name} · 力量${hero.id === actor.id ? '攻击' : '防御'}`,
    })),
  };
}
