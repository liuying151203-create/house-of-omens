import { createWorkflow } from '../engine/workflow.mjs';

export const ENEMY_TURN_WORKFLOW = 'turn.enemyPhase';
export const ENEMY_TURN_DEFINITION = {
  id: ENEMY_TURN_WORKFLOW,
  version: 1,
  steps: [
    { op: 'effect', handler: 'enemy.prepare' },
    {
      op: 'branchValue',
      path: 'enemyTurn.done',
      truthy: 6,
      falsy: 2,
    },
    {
      op: 'branchValue',
      path: 'enemyTurn.hasAttack',
      truthy: 3,
      falsy: 5,
    },
    { op: 'requestRoll', key: 'contest', requestKey: 'diceRequest' },
    { op: 'effect', handler: 'enemy.resolveAttack' },
    { op: 'effect', handler: 'enemy.advance' },
    { op: 'effect', handler: 'enemy.finish' },
    { op: 'complete' },
  ],
};

export const ENEMY_TURN_WORKFLOW_DEFINITIONS = {
  [ENEMY_TURN_WORKFLOW]: ENEMY_TURN_DEFINITION,
};

export function createEnemyTurnWorkflow({
  flowId,
  round,
  enemyIds,
  report,
  outcomes,
}) {
  return createWorkflow({
    flowId,
    definitionId: ENEMY_TURN_WORKFLOW,
    definitionVersion: 1,
    locals: {
      enemyTurn: {
        round,
        enemyIds,
        enemyIndex: 0,
        report,
        done: false,
        hasAttack: false,
        current: null,
      },
      outcomes,
    },
  });
}
