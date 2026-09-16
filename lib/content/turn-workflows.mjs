import { createWorkflow } from '../engine/workflow.mjs';

export const HAUNT_ROLL_WORKFLOW = 'turn.hauntRoll';
export const ROOM_FALL_WORKFLOW = 'room.fallDamage';
export const ELEVATOR_WORKFLOW = 'room.elevator';
export const ACTION_CHECK_WORKFLOW = 'action.check';
export const COLLAPSE_ENTRY_WORKFLOW = 'room.collapseEntry';
export const HERO_MOVE_WORKFLOW = 'hero.move';

export const TURN_WORKFLOW_DEFINITIONS = {
  [HAUNT_ROLL_WORKFLOW]: {
    id: HAUNT_ROLL_WORKFLOW,
    version: 1,
    steps: [
      { op: 'requestRoll', key: 'haunt', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'haunt.resolveRoll' },
      { op: 'complete' },
    ],
  },
  [ROOM_FALL_WORKFLOW]: {
    id: ROOM_FALL_WORKFLOW,
    version: 1,
    steps: [
      { op: 'requestRoll', key: 'fall', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'room.resolveFallDamage' },
      { op: 'complete' },
    ],
  },
  [ELEVATOR_WORKFLOW]: {
    id: ELEVATOR_WORKFLOW,
    version: 1,
    steps: [
      { op: 'requestRoll', key: 'elevator', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'room.resolveElevator' },
      { op: 'complete' },
    ],
  },
  [ACTION_CHECK_WORKFLOW]: {
    id: ACTION_CHECK_WORKFLOW,
    version: 1,
    steps: [
      { op: 'requestRoll', key: 'check', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'action.resolveCheck' },
      { op: 'complete' },
    ],
  },
  [COLLAPSE_ENTRY_WORKFLOW]: {
    id: COLLAPSE_ENTRY_WORKFLOW,
    version: 1,
    steps: [
      { op: 'requestRoll', key: 'check', requestKey: 'diceRequest' },
      { op: 'effect', handler: 'room.resolveCollapseEntry' },
      { op: 'complete' },
    ],
  },
  [HERO_MOVE_WORKFLOW]: {
    id: HERO_MOVE_WORKFLOW,
    version: 1,
    steps: [
      { op: 'effect', handler: 'hero.move.commit' },
      { op: 'effect', handler: 'room.enter.before' },
      { op: 'effect', handler: 'room.enter.resolve' },
      { op: 'effect', handler: 'room.enter.after' },
      { op: 'complete' },
    ],
  },
};

export function createHeroMoveWorkflow({
  flowId,
  heroId,
  fromRoomId,
  toRoomId,
  moveCost,
  enterKind,
}) {
  return createWorkflow({
    flowId,
    definitionId: HERO_MOVE_WORKFLOW,
    locals: {
      move: {
        heroId,
        fromRoomId,
        toRoomId,
        moveCost,
        enterKind,
      },
    },
  });
}

export function createHauntRollWorkflow({
  flowId,
  heroId,
  diceCount,
  outcomes,
}) {
  return createWorkflow({
    flowId,
    definitionId: HAUNT_ROLL_WORKFLOW,
    locals: {
      haunt: { heroId, diceCount },
      diceRequest: {
        kind: 'diceRequest',
        heroId,
        title: '作祟检定',
        text: '总点数达到 5，作祟降临。',
        outcomes,
        rolls: [{ count: diceCount, heroId, label: '作祟检定' }],
      },
    },
  });
}

export function createElevatorWorkflow({
  flowId,
  heroId,
  roomId,
  heroName,
  outcomes,
}) {
  return createWorkflow({
    flowId,
    definitionId: ELEVATOR_WORKFLOW,
    locals: {
      elevator: { heroId, roomId },
      diceRequest: {
        kind: 'diceRequest',
        heroId,
        title: '神秘电梯',
        text: '不同点数对应的楼层与特殊结果如下。',
        outcomes,
        rolls: [{ count: 2, heroId, label: heroName + ' · 神秘电梯' }],
      },
    },
  });
}

export function createActionCheckWorkflow({
  flowId,
  heroId,
  action,
  command,
  diceCount,
  rollLabel,
  bonus = 0,
  outcomes,
}) {
  return createWorkflow({
    flowId,
    definitionId: ACTION_CHECK_WORKFLOW,
    locals: {
      action: structuredClone(action),
      command: structuredClone(command),
      diceRequest: {
        kind: 'diceRequest',
        heroId,
        title: action.label,
        text: action.detail || '',
        outcomes,
        rolls: [{ count: diceCount, heroId, label: rollLabel, bonus }],
      },
    },
  });
}

export function createCollapseEntryWorkflow({
  flowId,
  heroId,
  heroName,
  command,
  diceCount,
  outcomes,
}) {
  return createWorkflow({
    flowId,
    definitionId: COLLAPSE_ENTRY_WORKFLOW,
    locals: {
      command: structuredClone(command),
      diceRequest: {
        kind: 'diceRequest',
        heroId,
        title: '避开坍塌',
        text: '速度检定 · 目标 5+',
        outcomes,
        rolls: [{ count: diceCount, heroId, label: heroName + ' · 避开坍塌' }],
      },
    },
  });
}

export function createRoomFallWorkflow({
  flowId,
  roomFall,
  participants,
  outcomes,
}) {
  return createWorkflow({
    flowId,
    definitionId: ROOM_FALL_WORKFLOW,
    locals: {
      roomFall: structuredClone(roomFall),
      participants: participants.map((hero) => ({
        heroId: hero.id,
        name: hero.name,
      })),
      diceRequest: {
        kind: 'diceRequest',
        heroId: roomFall.heroId,
        title: roomFall.title,
        text: roomFall.text,
        outcomes,
        rolls: participants.map((hero) => ({
          count: 1,
          heroId: hero.id,
          label: hero.name + ' · ' + roomFall.title,
        })),
      },
    },
  });
}
