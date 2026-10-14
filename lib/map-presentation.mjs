import { eventJournalText } from './event-journal.mjs';

export const MAP_MOVE_MS = 620;
export const MAP_TRIGGER_MS = 1800;

function eventSteps(game, events) {
  return events.flatMap((event) => {
    if (event.type === 'EntityMoved' && event.entityType === 'hero') {
      const path =
        event.path?.length > 1
          ? event.path
          : [event.fromRoomId, event.toRoomId];
      return path.slice(1).flatMap((pos, index) => {
        const from = path[index];
        if (
          from === pos ||
          !game.rooms.some((room) => room.id === from) ||
          !game.rooms.some((room) => room.id === pos)
        )
          return [];
        return [
          {
            key: `move:${event.id}:${index}`,
            kind: 'move',
            heroId: event.entityId,
            from,
            pos,
            duration: MAP_MOVE_MS,
          },
        ];
      });
    }
    // 自动敌人的陷阱已有 trapResult 播报；这里只补人物入房后的触发阶段。
    if (event.type === 'TrapTriggered' && event.heroId !== undefined)
      return [
        {
          key: `trigger:${event.id}`,
          kind: 'trigger',
          heroId: event.heroId,
          pos: event.roomId,
          duration: MAP_TRIGGER_MS,
          title: '捕兽夹合拢',
          text: eventJournalText(game, event),
        },
      ];
    return [];
  });
}

export function initialMapPresentation(game, epoch) {
  const request = game?.queue?.[0];
  // 恢复伤害分配时解释当前陷阱，但不重播存档中的历史移动。
  const trap =
    request?.kind === 'damage' && request.causeTag === 'trapHit'
      ? game.events?.findLast(
          (event) =>
            event.type === 'TrapTriggered' &&
            event.heroId === request.heroId &&
            event.roomId ===
              game.heroes.find((hero) => hero.id === request.heroId)?.pos,
        )
      : null;
  return {
    epoch,
    through: game?.events?.at(-1)?.id || 0,
    attached: !!game,
    steps: trap ? eventSteps(game, [trap]) : [],
  };
}

export function collectMapPresentation(state, game, epoch) {
  const latest = game?.events?.at(-1)?.id || 0;
  if (
    state.epoch !== epoch ||
    state.attached !== !!game ||
    latest < state.through
  )
    return initialMapPresentation(game, epoch);
  if (latest === state.through) return state;
  return {
    ...state,
    through: latest,
    steps: [
      ...state.steps,
      ...eventSteps(
        game,
        game.events.filter((event) => event.id > state.through),
      ),
    ],
  };
}

export function completeMapStep(state, key) {
  return state.steps[0]?.key === key
    ? { ...state, steps: state.steps.slice(1) }
    : state;
}

export function mapPresentationGame(game, steps) {
  if (!game || !steps.length) return game;
  const origins = new Map();
  for (const step of steps)
    if (step.kind === 'move' && !origins.has(step.heroId))
      origins.set(step.heroId, step.from);
  const room = game.rooms.find((entry) => entry.id === steps[0].pos);
  return {
    ...game,
    viewFloor: room?.floor ?? game.viewFloor,
    heroes: game.heroes.map((hero) =>
      origins.has(hero.id) ? { ...hero, pos: origins.get(hero.id) } : hero,
    ),
  };
}
