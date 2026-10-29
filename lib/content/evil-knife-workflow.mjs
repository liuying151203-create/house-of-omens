import { createWorkflow } from '../engine/workflow.mjs';

export const EVIL_KNIFE_WORKFLOWS = {
  'item.evilKnife.penalty': {
    id: 'item.evilKnife.penalty',
    version: 1,
    steps: [{ op: 'effect', handler: 'evilKnife.penalty' }, { op: 'complete' }],
  },
};

export function createEvilKnifePenalty(flowId, heroId) {
  return createWorkflow({
    flowId,
    definitionId: 'item.evilKnife.penalty',
    locals: { heroId },
  });
}
