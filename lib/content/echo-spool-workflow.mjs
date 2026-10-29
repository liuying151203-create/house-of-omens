import { createWorkflow } from '../engine/workflow.mjs';

export const ECHO_SPOOL_WORKFLOWS = {
  'item.echoSpool': {
    id: 'item.echoSpool',
    version: 1,
    steps: [
      { op: 'requestChoice', key: 'confirm', requestKey: 'choiceRequest' },
      { op: 'effect', handler: 'echoSpool.commit' },
      { op: 'complete' },
    ],
  },
};

export function createEchoSpoolWorkflow(flowId, hero, action, room, returning) {
  return createWorkflow({
    flowId,
    definitionId: 'item.echoSpool',
    locals: {
      heroId: hero.id,
      instanceId: action.instanceId,
      roomId: room.id,
      returning,
      choiceRequest: {
        kind: 'choiceRequest',
        heroId: hero.id,
        title: returning ? '返回线头所在房间？' : '在这里留下线头？',
        text: returning
          ? `消耗回声线轴，瞬移至${room.name}，不消耗移动力；抵达后结算房间进入效果。`
          : `将线头留在${room.name}，设置后不能更换。`,
        visibility: { heroIds: [hero.id] },
        timeoutMs: 30000,
        timeoutChoice: 'cancel',
        options: [
          {
            value: 'confirm',
            label: returning ? '消耗线轴并回返' : '留下线头',
          },
          { value: 'cancel', label: '取消' },
        ],
      },
    },
  });
}
