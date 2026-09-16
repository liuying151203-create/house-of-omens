import { createWorkflow } from '../engine/workflow.mjs';

export const REACTION_WORKFLOW = 'reaction.chooseEffect';

export const REACTION_WORKFLOW_DEFINITIONS = {
  [REACTION_WORKFLOW]: {
    id: REACTION_WORKFLOW,
    version: 1,
    steps: [
      {
        op: 'requestChoice',
        key: 'reaction',
        requestKey: 'choiceRequest',
      },
      { op: 'effect', handler: 'reaction.resolve' },
      { op: 'complete' },
    ],
  },
};

export function createReactionWorkflow({
  flowId,
  responders,
  title,
  text,
  options,
  source,
  event,
  continuation,
  timeoutMs,
  timeoutChoice,
}) {
  const heroId = responders[0];
  return createWorkflow({
    flowId,
    definitionId: REACTION_WORKFLOW,
    locals: {
      reaction: {
        responders: [...responders],
        responderIndex: 0,
        options: structuredClone(options),
        source: structuredClone(source || {}),
        event: structuredClone(event || {}),
        continuation: structuredClone(continuation || []),
      },
      choiceRequest: {
        kind: 'choiceRequest',
        heroId,
        title,
        text,
        visibility: source?.visibility || 'public',
        timeoutMs,
        timeoutChoice,
        options: options.map((option) => ({
          value: option.id,
          label: option.label,
          ...(option.detail ? { detail: option.detail } : {}),
        })),
      },
    },
  });
}
