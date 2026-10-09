import { DIRS } from '../map-directions.mjs';
import { traitRuleView } from '../rule-views.mjs';
import { isAlpha, isBloodmoon, moonPhase } from './bloodmoon-actors.mjs';

export function bloodmoonDoorNeighbors(game, roomId) {
  const room = game.rooms.find((entry) => entry.id === roomId);
  if (!room) return [];
  const doors = room.doors.map((dir) => (dir + (room.rotation || 0)) % 4);
  return doors.flatMap((dir) => {
    const adjacent = game.rooms.find(
      (entry) =>
        entry.floor === room.floor &&
        entry.x === room.x + DIRS[dir].dx &&
        entry.y === room.y + DIRS[dir].dy,
    );
    return adjacent?.doors.some(
      (door) => (door + (adjacent.rotation || 0)) % 4 === (dir + 2) % 4,
    )
      ? [adjacent.id]
      : [];
  });
}

export function isWounded(game, hero) {
  if (!isBloodmoon(game) || hero?.dead || hero?.faction !== 'heroes')
    return false;
  // 联机对手的具体属性不公开，只公开服务端算出的残血标记。
  if (hero.privateStats) return hero.wounded === true;
  if (!hero.hauntBodyValues) return false;
  return ['might', 'speed'].some(
    (trait) =>
      traitRuleView(game, hero, trait).value < hero.hauntBodyValues[trait],
  );
}

export function isIsolated(game, hero) {
  if (!isBloodmoon(game) || hero?.dead || hero?.faction !== 'heroes')
    return false;
  const rooms = new Set([hero.pos, ...bloodmoonDoorNeighbors(game, hero.pos)]);
  return !game.heroes.some(
    (other) =>
      other.id !== hero.id &&
      !other.dead &&
      other.faction === 'heroes' &&
      rooms.has(other.pos),
  );
}

export function pursuitAvailable(game, hero) {
  return (
    isBloodmoon(game) &&
    !hero?.dead &&
    !hero?.stopped &&
    !hero?.ended &&
    hero.pursuitSpentRound !== game.round &&
    (hero.combatRole === 'wolf' ||
      (isAlpha(game, hero) && moonPhase(game.elapsed) !== 'awakening'))
  );
}

export function pursuitTarget(game, hero, destinationId, distance) {
  if (!pursuitAvailable(game, hero)) return null;
  return (
    game.heroes.find(
      (target) =>
        isWounded(game, target) &&
        distance(game, destinationId, target.pos) <
          distance(game, hero.pos, target.pos),
    ) || null
  );
}

export function pursuitMoveAllowed(game, hero, destinationId, cost, distance) {
  return (
    !hero.stopped &&
    (hero.moves >= cost ||
      (hero.moves + 1 >= cost &&
        !!pursuitTarget(game, hero, destinationId, distance)))
  );
}

export function spendPursuitMovement(
  game,
  hero,
  destinationId,
  cost,
  distance,
  context,
) {
  if (!pursuitMoveAllowed(game, hero, destinationId, cost, distance))
    return false;
  const bonus = Math.max(0, cost - hero.moves);
  if (bonus) {
    const target = pursuitTarget(game, hero, destinationId, distance);
    hero.pursuitSpentRound = game.round;
    const text = `${hero.name}向残血英雄${target.name}靠近，使用本回合追猎的1点额外移动；速度移动值加1，不移动速度属性标记。`;
    context.record('PursuitUsed', {
      heroId: hero.id,
      targetId: target.id,
      fromRoomId: hero.pos,
      toRoomId: destinationId,
      text,
    });
    context.log(text);
  }
  hero.moves = Math.max(0, hero.moves - cost);
  return true;
}
