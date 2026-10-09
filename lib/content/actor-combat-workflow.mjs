import { createWorkflow } from '../engine/workflow.mjs';
export const ACTOR_ATTACK_WORKFLOW = 'combat.actorAttack';
export const ACTOR_COMBAT_WORKFLOWS = {
  [ACTOR_ATTACK_WORKFLOW]: {
    id: ACTOR_ATTACK_WORKFLOW,
    version: 1,
    steps: [
      { op: 'requestRoll', key: 'contest', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'combat.actor.resolve' },
      { op: 'complete' },
    ],
  },
};
export function createActorAttackWorkflow(
  flowId,
  actorId,
  targetId,
  diceRequest,
) {
  return createWorkflow({
    flowId,
    definitionId: ACTOR_ATTACK_WORKFLOW,
    locals: { actorId, targetId, diceRequest },
  });
}
