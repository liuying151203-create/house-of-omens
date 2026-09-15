import { createWorkflow } from '../../engine/workflow.mjs';

export const EVENT_CHECK_WORKFLOW = 'event.check';
export const EVENT_CHECK_DEFINITION = {
  id: EVENT_CHECK_WORKFLOW,
  version: 1,
  steps: [
    { op: 'requestRoll', key: 'check', requestKey: 'diceRequest' },
    {
      op: 'branchRoll',
      key: 'check',
      thresholdKey: 'event.threshold',
      success: 2,
      failure: 4,
    },
    { op: 'effect', handler: 'event.resolve', params: { outcome: 'success' } },
    { op: 'complete' },
    { op: 'effect', handler: 'event.resolve', params: { outcome: 'failure' } },
    { op: 'complete' },
  ],
};

export const CARD_WORKFLOW_DEFINITIONS = {
  [EVENT_CHECK_WORKFLOW]: EVENT_CHECK_DEFINITION,
};

export function createEventCheckWorkflow({
  flowId,
  heroId,
  card,
  diceCount,
  rollLabel,
  outcomes,
}) {
  const snapshot = {
    cardId: card.id,
    title: card.title,
    heroId,
    threshold: card.threshold,
    success: structuredClone(card.success),
    failure: structuredClone(card.failure),
  };
  return createWorkflow({
    flowId,
    definitionId: EVENT_CHECK_WORKFLOW,
    definitionVersion: 1,
    locals: {
      event: snapshot,
      diceRequest: {
        kind: 'diceRequest',
        heroId,
        title: card.title,
        text: `${card.traitLabel} · 目标 ${card.threshold}+`,
        outcomes,
        rolls: [{ count: diceCount, heroId, label: rollLabel }],
      },
    },
  });
}
