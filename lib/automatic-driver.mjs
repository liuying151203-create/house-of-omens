import { suggestDamage } from './damage-plan.mjs';

export function automaticRequestCommand(game, request = game?.queue?.[0]) {
  if (!request) return null;
  if (request.kind === 'diceRequest')
    return request.rolls.some((roll) => !roll.dice)
      ? {
          type: 'rollAll',
          requestId: request.uid,
          sideIds: request.rolls
            .filter((roll) => !roll.dice)
            .map((roll) => roll.id),
        }
      : { type: 'resolveDice', requestId: request.uid };
  if (request.kind === 'choiceRequest')
    return {
      type: 'resolveChoice',
      requestId: request.uid,
      choice: request.timeoutChoice ?? request.options?.[0]?.value,
    };
  if (request.kind === 'placement') return { type: 'place' };
  if (request.kind === 'damage')
    return {
      type: 'allocateDamage',
      requestId: request.uid,
      allocation: suggestDamage(
        game.heroes[request.heroId],
        request.damageType,
        request.remaining,
        game.phase,
      ),
    };
  if (request.kind === 'card')
    return { type: 'continueCard', requestId: request.uid };
  if (request.kind === 'roomFall')
    return { type: 'continueRoom', requestId: request.uid };
  return { type: 'advance' };
}

export function drivePendingRequests(game, dispatch, { limit = 200 } = {}) {
  let current = game;
  for (let step = 0; current?.queue?.[0] && step < limit; step++) {
    const command = automaticRequestCommand(current);
    if (!command) break;
    const next = dispatch(current, command);
    if (next === current || JSON.stringify(next) === JSON.stringify(current))
      throw new Error(
        `Automatic driver stalled on ${current.queue[0].kind} with ${command.type}`,
      );
    current = next;
  }
  if (current?.queue?.[0])
    throw new Error('Automatic driver exceeded its request limit');
  return current;
}
