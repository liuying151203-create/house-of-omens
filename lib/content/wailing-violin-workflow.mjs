import { createWorkflow } from '../engine/workflow.mjs';

export const WAILING_VIOLIN_WORKFLOWS = {
  'combat.wailingViolin': {
    id: 'combat.wailingViolin',
    version: 1,
    steps: [
      { op: 'effect', handler: 'wailingViolin.prepare' },
      { op: 'branchValue', path: 'done', truthy: 4, falsy: 2 },
      { op: 'effect', handler: 'wailingViolin.hit' },
      { op: 'effect', handler: 'wailingViolin.next' },
      { op: 'complete' },
    ],
  },
};

export function createWailingViolinWorkflow(flowId, heroId, roomId, targets) {
  return createWorkflow({
    flowId,
    definitionId: 'combat.wailingViolin',
    locals: { heroId, roomId, targets, index: 0, done: false },
  });
}
