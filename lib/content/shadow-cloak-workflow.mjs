import { createWorkflow } from '../engine/workflow.mjs';

export const SHADOW_CLOAK_WORKFLOWS = {
  'item.shadowCloak': {
    id: 'item.shadowCloak', version: 1,
    steps: [
      { op: 'requestChoice', key: 'use', requestKey: 'choiceRequest' },
      { op: 'branchChoice', key: 'use', cases: { dodge: 2, skip: 4 }, default: 4 },
      { op: 'requestRoll', key: 'speed', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'shadowCloak.resolve' },
      { op: 'effect', handler: 'shadowCloak.finish' },
      { op: 'complete' },
    ],
  },
};

export function createShadowCloakWorkflow(flowId, hero, diceCount, event, continuation) {
  return createWorkflow({ flowId, definitionId: 'item.shadowCloak', locals: {
    heroId: hero.id,
    reaction: { event: structuredClone(event), continuation: structuredClone(continuation || []) },
    choiceRequest: { kind: 'choiceRequest', heroId: hero.id, title: '幽影斗篷 · 闪避', text: '可进行速度4+检定，成功闪避本次攻击。', visibility: { heroIds: [hero.id] }, timeoutMs: 30000, timeoutChoice: 'skip', options: [{ value: 'dodge', label: '进行速度检定' }, { value: 'skip', label: '不使用斗篷' }] },
    diceRequest: { kind: 'diceRequest', heroId: hero.id, title: '幽影斗篷 · 速度检定', text: '速度4+：成功闪避本次攻击。', threshold: 4, visibility: { heroIds: [hero.id] }, rolls: [{ count: diceCount, heroId: hero.id, label: `${hero.name} · 速度` }] },
  } });
}
