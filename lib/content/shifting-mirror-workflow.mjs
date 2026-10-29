import { createWorkflow } from '../engine/workflow.mjs';

export const SHIFTING_MIRROR_WORKFLOWS = {
  'item.shiftingMirror': {
    id: 'item.shiftingMirror',
    version: 1,
    steps: [
      { op: 'requestChoice', key: 'confirm', requestKey: 'choiceRequest' },
      { op: 'effect', handler: 'shiftingMirror.swap' },
      { op: 'branchValue', path: 'swapped', truthy: 3, falsy: 11 },
      { op: 'effect', handler: 'shiftingMirror.firstEntry' },
      { op: 'effect', handler: 'room.enter.before' },
      { op: 'effect', handler: 'room.enter.resolve' },
      { op: 'effect', handler: 'room.enter.after' },
      { op: 'effect', handler: 'shiftingMirror.secondEntry' },
      { op: 'effect', handler: 'room.enter.before' },
      { op: 'effect', handler: 'room.enter.resolve' },
      { op: 'effect', handler: 'room.enter.after' },
      { op: 'complete' },
    ],
  },
};

export function createShiftingMirrorWorkflow(flowId, hero, target, instanceId) {
  return createWorkflow({
    flowId,
    definitionId: 'item.shiftingMirror',
    locals: {
      heroId: hero.id,
      targetId: target.id,
      instanceId,
      fromRoomId: hero.pos,
      targetRoomId: target.pos,
      choiceRequest: {
        kind: 'choiceRequest',
        heroId: hero.id,
        title: '使用移形镜交换位置？',
        text: `与${target.name}交换位置。双方抵达后分别结算房间进入效果。`,
        visibility: { heroIds: [hero.id] },
        timeoutMs: 30000,
        timeoutChoice: 'cancel',
        options: [
          { value: 'confirm', label: '确认交换' },
          { value: 'cancel', label: '取消' },
        ],
      },
    },
  });
}
