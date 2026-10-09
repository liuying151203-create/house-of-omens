import { createWorkflow } from '../engine/workflow.mjs';

export const FIREARM_WORKFLOWS = {
  'combat.firearm': {
    id: 'combat.firearm',
    version: 1,
    steps: [
      { op: 'branchValue', path: 'silver', truthy: 2, falsy: 1 },
      { op: 'requestRoll', key: 'dodge', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'firearm.resolve' },
      { op: 'effect', handler: 'firearm.finish' },
      { op: 'complete' },
    ],
  },
};

export function createFirearmWorkflow(flowId, locals) {
  return createWorkflow({ flowId, definitionId: 'combat.firearm', locals });
}
