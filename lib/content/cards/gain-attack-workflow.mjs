import { createWorkflow } from '../../engine/workflow.mjs';

export const CARD_GAIN_ATTACK_WORKFLOW = 'card.gainAttack';
export const CARD_GAIN_ATTACK_DEFINITION = {
  id: CARD_GAIN_ATTACK_WORKFLOW,
  version: 1,
  steps: [
    { op: 'effect', handler: 'card.gain.before' },
    { op: 'effect', handler: 'card.gain.commit' },
    { op: 'effect', handler: 'card.gain.after' },
    { op: 'effect', handler: 'card.attack.prepare' },
    { op: 'branchValue', path: 'attackSkipped', truthy: 8, falsy: 5 },
    { op: 'requestRoll', key: 'contest', requestKey: 'diceRequest' },
    { op: 'effect', handler: 'card.attack.resolve' },
    { op: 'effect', handler: 'card.attack.finish' },
    { op: 'complete' },
  ],
};

export function createCardGainAttackWorkflow({ flowId, cardRequest, attack }) {
  return createWorkflow({
    flowId,
    definitionId: CARD_GAIN_ATTACK_WORKFLOW,
    locals: { cardRequest, attack },
  });
}

export function prepareCardAttack(
  flow,
  { hero, card, defenseCount, traitLabel },
) {
  flow.locals.attackSkipped = !!flow.locals.gainCancelled || !hero || hero.dead;
  if (flow.locals.attackSkipped) return;
  const attack = flow.locals.attack;
  flow.locals.diceRequest = {
    kind: 'diceRequest',
    heroId: hero.id,
    title: `${card.title} · 攻击与防御`,
    text: `${attack.description} ${hero.name}当前${traitLabel}值为${defenseCount}，投${defenseCount}枚防御骰。`,
    outcomes: attack.outcomes.map((outcome) => ({
      ...outcome,
      effect: `${outcome.effect}${card.explorationText || ''}`,
    })),
    visibility: flow.locals.cardRequest.visibility,
    sourceCardId: card.id,
    rolls: [
      {
        count: attack.count,
        computer: true,
        label: `${attack.label} · ${attack.count}枚攻击骰`,
      },
      {
        count: defenseCount,
        heroId: hero.id,
        label: `${hero.name} · ${traitLabel}防御`,
      },
    ],
  };
}

export function cardAttackResult(flow) {
  const totals = flow.locals.rolls.contest.map(
    (dice, index) =>
      dice.reduce((sum, face) => sum + face, 0) +
      (flow.locals.diceRequest.rolls[index].bonus || 0),
  );
  return {
    attackTotal: totals[0],
    defenseTotal: totals[1],
    damage: Math.max(0, totals[0] - totals[1]),
  };
}
