import { createWorkflow } from '../engine/workflow.mjs';

export const MUSIC_BOX_WORKFLOW = 'item.musicBox';
export const MUSIC_BOX_WORKFLOWS = {
  [MUSIC_BOX_WORKFLOW]: {
    id: MUSIC_BOX_WORKFLOW,
    version: 1,
    steps: [
      { op: 'requestRoll', key: 'check', requestKey: 'diceRequest' },
      { op: 'branchRoll', key: 'check', threshold: 4, success: 2, failure: 6 },
      { op: 'effect', handler: 'musicBox.prepare' },
      { op: 'requestChoice', key: 'target', requestKey: 'choiceRequest' },
      { op: 'effect', handler: 'musicBox.select' },
      { op: 'effect', handler: 'musicBox.commit' },
      { op: 'effect', handler: 'musicBox.failure' },
      { op: 'complete' },
    ],
  },
};

export function createMusicBoxWorkflow({
  flowId,
  heroId,
  diceCount,
  visibility,
}) {
  return createWorkflow({
    flowId,
    definitionId: MUSIC_BOX_WORKFLOW,
    locals: {
      heroId,
      selected: [],
      diceRequest: {
        kind: 'diceRequest',
        heroId,
        title: '旧八音盒 · 知识检定',
        text: '知识 4+；成功后选择最多两名人物恢复理智。',
        visibility,
        outcomes: [
          {
            range: '4+ 点',
            effect: '选择最多两名人物，各恢复1格理智至起始位置。',
          },
          { range: '低于4点', effect: '没有恢复，本轮演奏机会已消耗。' },
        ],
        rolls: [{ count: diceCount, heroId, label: '知识' }],
      },
    },
  });
}

export function prepareMusicBoxChoice(game, flow) {
  const { heroId, selected } = flow.locals;
  const candidates = game.heroes.filter(
    (hero) => !hero.dead && !hero.traitor && !selected.includes(hero.id),
  );
  flow.locals.choiceRequest = {
    kind: 'choiceRequest',
    heroId,
    title: '旧八音盒 · 选择人物',
    text: `已选择${selected.length}人；最多选择两名人物，每人理智恢复1格至起始位置。`,
    visibility: { heroIds: [heroId] },
    timeoutMs: 30000,
    timeoutChoice: 'confirm',
    options: [
      ...(selected.length < 2
        ? candidates.map((hero) => ({
            value: `hero:${hero.id}`,
            label: hero.name,
          }))
        : []),
      {
        value: 'confirm',
        label: selected.length
          ? `确认恢复（${selected.length}人）`
          : '放弃恢复',
      },
    ],
  };
}

export function selectMusicBoxChoice(game, flow) {
  const choice = flow.locals.choices.target;
  if (choice === 'confirm') return;
  const hero = game.heroes.find(
    (entry) => `hero:${entry.id}` === choice && !entry.dead && !entry.traitor,
  );
  if (
    !hero ||
    flow.locals.selected.includes(hero.id) ||
    flow.locals.selected.length >= 2
  )
    throw new Error('无效的八音盒目标');
  flow.locals.selected.push(hero.id);
  delete flow.locals.choices.target;
  return { nextStep: 2 };
}
