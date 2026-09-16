import { createWorkflow } from '../engine/workflow.mjs';

export const DAMAGE_CREATE_WORKFLOW = 'damage.create';
export const DAMAGE_SETTLE_WORKFLOW = 'damage.settle';
export const DEATH_WORKFLOW = 'hero.death';

export const DAMAGE_WORKFLOW_DEFINITIONS = {
  [DAMAGE_CREATE_WORKFLOW]: {
    id: DAMAGE_CREATE_WORKFLOW,
    version: 1,
    steps: [
      { op: 'effect', handler: 'damage.before' },
      { op: 'effect', handler: 'damage.commit' },
      { op: 'effect', handler: 'damage.after' },
      { op: 'complete' },
    ],
  },
  [DAMAGE_SETTLE_WORKFLOW]: {
    id: DAMAGE_SETTLE_WORKFLOW,
    version: 1,
    steps: [
      { op: 'effect', handler: 'damage.applyTrait' },
      {
        op: 'branchValue',
        path: 'settlement.deathPending',
        truthy: 2,
        falsy: 5,
      },
      { op: 'effect', handler: 'death.before' },
      { op: 'effect', handler: 'death.commit' },
      { op: 'effect', handler: 'death.after' },
      { op: 'effect', handler: 'damage.advanceAllocation' },
      {
        op: 'branchValue',
        path: 'settlement.done',
        truthy: 7,
        falsy: 0,
      },
      { op: 'effect', handler: 'damage.complete' },
      { op: 'effect', handler: 'damage.after' },
      { op: 'complete' },
    ],
  },
  [DEATH_WORKFLOW]: {
    id: DEATH_WORKFLOW,
    version: 1,
    steps: [
      { op: 'effect', handler: 'death.before' },
      { op: 'effect', handler: 'death.commit' },
      { op: 'effect', handler: 'death.after' },
      { op: 'complete' },
    ],
  },
};

export function createDamageWorkflow({ flowId, draft }) {
  return createWorkflow({
    flowId,
    definitionId: DAMAGE_CREATE_WORKFLOW,
    locals: {
      draft: structuredClone(draft),
      triggerReceipts: [],
      receiptsByTiming: {},
    },
  });
}

export function createDamageSettlementWorkflow({
  flowId,
  pendingDamage,
  allocation,
  keys,
  incremental = false,
}) {
  return createWorkflow({
    flowId,
    definitionId: DAMAGE_SETTLE_WORKFLOW,
    locals: {
      settlement: {
        pendingDamage: structuredClone(pendingDamage),
        allocation: structuredClone(allocation),
        keys: [...keys],
        keyIndex: 0,
        changes: [],
        incremental,
        deathPending: false,
        done: false,
      },
      triggerUsage: structuredClone(pendingDamage.triggerUsage || []),
      triggerReceipts: structuredClone(pendingDamage.beforeTriggers || []),
      receiptsByTiming: {
        BeforeDamage: structuredClone(pendingDamage.beforeTriggers || []),
      },
    },
  });
}

export function createDeathWorkflow({ flowId, deathEvent, report, usage }) {
  return createWorkflow({
    flowId,
    definitionId: DEATH_WORKFLOW,
    locals: {
      deathEvent: structuredClone(deathEvent),
      report: structuredClone(report),
      triggerUsage: structuredClone(usage || []),
      triggerReceipts: [],
      receiptsByTiming: {},
    },
  });
}
