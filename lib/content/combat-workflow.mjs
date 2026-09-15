import { createWorkflow } from '../engine/workflow.mjs';

export const HERO_ATTACK_WORKFLOW = 'combat.heroAttack';
export const HERO_ATTACK_DEFINITION = {
  id: HERO_ATTACK_WORKFLOW,
  version: 1,
  steps: [
    { op: 'requestRoll', key: 'contest', requestKey: 'diceRequest' },
    { op: 'effect', handler: 'combat.resolveHeroAttack' },
    { op: 'complete' },
  ],
};

export const COMBAT_WORKFLOW_DEFINITIONS = {
  [HERO_ATTACK_WORKFLOW]: HERO_ATTACK_DEFINITION,
};

export function createHeroAttackWorkflow({
  flowId,
  hero,
  enemy,
  attackCount,
  defenseCount,
  attackBonus,
  damageCap,
  enemyRollMeta,
  outcomes,
}) {
  return createWorkflow({
    flowId,
    definitionId: HERO_ATTACK_WORKFLOW,
    definitionVersion: 1,
    locals: {
      combat: {
        heroId: hero.id,
        enemyId: enemy.id,
        attackBonus,
        damageCap,
      },
      diceRequest: {
        kind: 'diceRequest',
        heroId: hero.id,
        title: '力量交锋',
        text: '',
        outcomes,
        rolls: [
          {
            count: attackCount,
            heroId: hero.id,
            label: hero.name + ' · 力量',
            bonus: attackBonus,
          },
          { count: defenseCount, ...enemyRollMeta },
        ],
      },
    },
  });
}
