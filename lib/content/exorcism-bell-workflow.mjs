import { createWorkflow } from '../engine/workflow.mjs';

export const EXORCISM_BELL_WORKFLOWS = {
  'item.exorcismBell': {
    id: 'item.exorcismBell',
    version: 1,
    steps: [
      { op: 'requestChoice', key: 'target', requestKey: 'targetRequest' },
      { op: 'effect', handler: 'exorcismBell.target' },
      { op: 'effect', handler: 'exorcismBell.prepareStep' },
      { op: 'requestChoice', key: 'destination', requestKey: 'stepRequest' },
      { op: 'effect', handler: 'exorcismBell.commitStep' },
      { op: 'effect', handler: 'room.enter.before' },
      { op: 'effect', handler: 'room.enter.resolve' },
      { op: 'effect', handler: 'room.enter.after' },
      { op: 'effect', handler: 'exorcismBell.afterHero' },
      { op: 'effect', handler: 'exorcismBell.enemyStep' },
      { op: 'effect', handler: 'exorcismBell.afterEnemy' },
      { op: 'complete' },
    ],
  },
};

export function createExorcismBellWorkflow(
  flowId,
  heroId,
  instanceId,
  options,
) {
  return createWorkflow({
    flowId,
    definitionId: 'item.exorcismBell',
    locals: {
      heroId,
      instanceId,
      steps: 0,
      spent: false,
      targetRequest: {
        kind: 'choiceRequest',
        heroId,
        title: '驱邪手铃 · 选择目标',
        text: '选择同室或相邻房间的人物或怪物，最多沿通路移动3格。',
        visibility: { heroIds: [heroId] },
        timeoutMs: 30000,
        timeoutChoice: 'cancel',
        options: [...options, { value: 'cancel', label: '取消' }],
      },
    },
  });
}
