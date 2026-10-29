import { DIRS } from '../map-directions.mjs';
import { itemInstances, materializeItemInstances } from '../item-instances.mjs';

// 上锁只允许实体房间的双向门，已有楼梯等抽象连接不算门。
export function connectedDoor(game, fromId, toId) {
  const from = game.rooms.find((room) => room.id === fromId);
  const to = game.rooms.find((room) => room.id === toId);
  if (!from || !to || from.floor !== to.floor) return false;
  const direction = DIRS.findIndex(
    (dir) => from.x + dir.dx === to.x && from.y + dir.dy === to.y,
  );
  if (direction < 0) return false;
  const doors = (room) =>
    room.doors.map((door) => (door + (room.rotation || 0)) % 4);
  return (
    doors(from).includes(direction) && doors(to).includes((direction + 2) % 4)
  );
}

export function doorLock(game, fromId, toId) {
  return (
    (game.doorLocks || []).find(
      (lock) =>
        lock.active &&
        ((lock.rooms[0] === fromId && lock.rooms[1] === toId) ||
          (lock.rooms[0] === toId && lock.rooms[1] === fromId)),
    ) || null
  );
}

export function hasDoorKey(hero, lock) {
  return (
    !!hero &&
    itemInstances(hero).some(
      (item) =>
        item.instanceId === lock.keyInstanceId &&
        item.definitionId === 'worn-lock',
    )
  );
}

export function mayPassDoor(game, hero, fromId, toId) {
  const lock = doorLock(game, fromId, toId);
  return !lock || hasDoorKey(hero, lock);
}

export function installDoorLock(game, hero, instanceId, toId) {
  if (
    !hero ||
    hero.dead ||
    !connectedDoor(game, hero.pos, toId) ||
    doorLock(game, hero.pos, toId)
  )
    return false;
  const instance = materializeItemInstances(hero).find(
    (item) =>
      item.instanceId === instanceId && item.definitionId === 'worn-lock',
  );
  if (!instance || instance.state?.lockInstalled) return false;
  const lock = {
    id: `door-lock:${instanceId}`,
    keyInstanceId: instanceId,
    rooms: [hero.pos, toId],
    active: true,
    failedAttempts: {},
  };
  game.doorLocks ||= [];
  game.doorLocks.push(lock);
  instance.state ||= {};
  instance.state.lockInstalled = true;
  instance.state.lockId = lock.id;
  return lock;
}

export function lockAttemptAllowed(lock, actorKey, turnKey) {
  return !!lock?.active && lock.failedAttempts?.[actorKey] !== turnKey;
}

export function resolveLockAttempt(lock, actorKey, turnKey, total) {
  if (
    !lockAttemptAllowed(lock, actorKey, turnKey) ||
    !Number.isInteger(total) ||
    total < 0
  )
    return false;
  if (total >= 4) {
    lock.active = false;
    return { broken: true, damage: 0 };
  }
  lock.failedAttempts ||= {};
  lock.failedAttempts[actorKey] = turnKey;
  return { broken: false, damage: 1 };
}
