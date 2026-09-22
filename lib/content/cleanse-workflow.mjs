import { createWorkflow } from '../engine/workflow.mjs';
import { cleanseableStatuses } from '../status-rules.mjs';

export const CLEANSE_WORKFLOW = 'item.cleanse';
export const CLEANSE_WORKFLOW_DEFINITIONS = {
  [CLEANSE_WORKFLOW]: {
    id: CLEANSE_WORKFLOW,
    version: 1,
    steps: [
      { op: 'effect', handler: 'item.cleanse.prepare' },
      { op: 'requestChoice', key: 'status', requestKey: 'choiceRequest' },
      { op: 'effect', handler: 'item.cleanse.select' },
      { op: 'effect', handler: 'item.cleanse.commit' },
      { op: 'complete' },
    ],
  },
};

export function createCleanseWorkflow(flowId, hero, target, action) {
  return createWorkflow({
    flowId,
    definitionId: CLEANSE_WORKFLOW,
    locals: {
      heroId: hero.id,
      targetHeroId: target.id,
      targetName: target.name,
      action: structuredClone(action),
      candidates: cleanseableStatuses(target),
      selected: [],
    },
  });
}

export function prepareCleanseChoice(flow) {
  const { heroId, targetName, candidates, selected } = flow.locals;
  const labels = candidates
    .filter((entry) => selected.includes(entry.key))
    .map((entry) => entry.label);
  flow.locals.choiceRequest = {
    kind: 'choiceRequest',
    heroId,
    title: '解药 · 选择清除状态',
    text: `${targetName}：${labels.length ? '已选 ' + labels.join('、') : '选择最多两个可清除负面状态'}。确认后才清除状态并消耗解药。`,
    visibility: { heroIds: [heroId] },
    timeoutMs: 30000,
    timeoutChoice: 'cancel',
    options: [
      ...(selected.length < 2
        ? candidates
            .filter((entry) => !selected.includes(entry.key))
            .map((entry) => ({ value: entry.key, label: entry.label }))
        : []),
      ...(selected.length
        ? [{ value: 'confirm', label: `确认清除 ${selected.length} 个状态` }]
        : []),
      { value: 'cancel', label: '取消，保留解药' },
    ],
  };
}

export function selectCleanseStatus(flow) {
  const choice = flow.locals.choices.status;
  if (choice === 'cancel') return { nextStep: 4 };
  if (choice === 'confirm' && flow.locals.selected.length) return;
  if (
    flow.locals.selected.length >= 2 ||
    flow.locals.selected.includes(choice) ||
    !flow.locals.candidates.some((entry) => entry.key === choice)
  )
    throw new Error('Invalid cleanse status selection');
  flow.locals.selected.push(choice);
  delete flow.locals.choices.status;
  return { nextStep: 0 };
}

export function selectedCleanseStatuses(flow) {
  return flow.locals.candidates.filter((entry) =>
    flow.locals.selected.includes(entry.key),
  );
}
