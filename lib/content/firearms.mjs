import {
  itemInstances,
  materializeItemInstances,
  addItemInstance,
  removeItemInstance,
} from '../item-instances.mjs';
import { isAlpha, isBloodmoon, hostile } from './bloodmoon-actors.mjs';

export const PISTOL = {
  id: 'pistol',
  title: '旧式手枪',
  supply: 'bloodmoon',
  story: '枪声能惊醒宅邸深处的东西。',
  effect:
    '普通射击：同室或同层直线1～2房间，目标速度4+闪避，失败承受2点身体伤害。射线须经双方相通的门，不能拐弯、穿墙或穿过其他角色。射击占本回合唯一主动攻击。携带手枪与银弹即可直接射击；也可每回合装填一次，不占攻击，并可卸回背包。已装银弹随枪交易或丢弃。银弹对初始狼人获得无限直线射程，自动命中并消耗一发，造成7点身体伤害；存活后身体属性上限永久降至第4格。',
  check: {
    trait: 'speed',
    threshold: 4,
    description: '目标以当前速度值投骰，合计4+点闪避。',
    success: '目标闪避枪击，不受伤。',
    failure: '目标承受2点身体伤害，自行在力量与速度轨道分配。',
  },
};

const doors = (room) =>
  room.doors.map((direction) => (direction + (room.rotation || 0)) % 4);

// 射线只经过实际房间与相通的门；楼梯、暗道等地图链接不作为弹道。
export function shotRay(game, fromId, toId, maximum = 2) {
  const from = game.rooms.find((room) => room.id === fromId),
    to = game.rooms.find((room) => room.id === toId);
  if (!from || !to || from.floor !== to.floor) return null;
  if (from.id === to.id) return [from.id];
  const dx = to.x - from.x,
    dy = to.y - from.y;
  if (dx && dy) return null;
  const distance = Math.abs(dx || dy);
  if (!Number.isInteger(distance) || distance < 1 || distance > maximum)
    return null;
  const direction = dx > 0 ? 1 : dx < 0 ? 3 : dy > 0 ? 2 : 0,
    path = [from.id];
  let previous = from;
  for (let step = 1; step <= distance; step++) {
    const room = game.rooms.find(
      (entry) =>
        entry.floor === from.floor &&
        entry.x === from.x + Math.sign(dx) * step &&
        entry.y === from.y + Math.sign(dy) * step,
    );
    if (
      !room ||
      !doors(previous).includes(direction) ||
      !doors(room).includes((direction + 2) % 4)
    )
      return null;
    if (
      step < distance &&
      (game.heroes.some((hero) => !hero.dead && hero.pos === room.id) ||
        game.enemies.some((enemy) => enemy.pos === room.id))
    )
      return null;
    path.push(room.id);
    previous = room;
  }
  return path;
}

export function firearmActions(game, hero) {
  const inventory = itemInstances(hero),
    guns = inventory.filter((item) => item.definitionId === 'pistol'),
    bullets = inventory.filter((item) => item.definitionId === 'silver-bullet'),
    result = [];
  for (const gun of guns) {
    const loaded = !!gun.state.loadedBullet;
    if (!loaded && gun.state.reloadRound !== game.round)
      for (const bullet of bullets)
        result.push({
          id: `loadSilver:${gun.instanceId}:${bullet.instanceId}`,
          command: {
            type: 'loadSilver',
            gunId: gun.instanceId,
            bulletId: bullet.instanceId,
          },
          label: '装填银弹',
          detail: '手枪每回合装填一次 · 不占主动攻击 · 可卸回背包',
          handler: 'firearm.load',
          gunId: gun.instanceId,
          bulletId: bullet.instanceId,
        });
    if (loaded)
      result.push({
        id: `unloadSilver:${gun.instanceId}`,
        command: { type: 'unloadSilver', gunId: gun.instanceId },
        label: '卸下银弹',
        detail: '将已装填银弹放回背包 · 不刷新本回合装填机会',
        handler: 'firearm.unload',
        gunId: gun.instanceId,
      });
    if (
      game.phase !== 'haunt' ||
      hero.attacked ||
      hero.attackBlockedRound === game.round
    )
      continue;
    const targets = isBloodmoon(game)
      ? game.heroes
          .filter((target) => !target.dead && hostile(hero, target))
          .map((target) => ({ ...target, targetType: 'hero' }))
      : game.enemies
          .filter((enemy) => !enemy.hidden)
          .map((enemy) => ({ ...enemy, targetType: 'enemy' }));
    if (!loaded && bullets.length) {
      for (const target of targets.filter((entry) => isAlpha(game, entry))) {
        const path = shotRay(game, hero.pos, target.pos, Infinity);
        if (!path) continue;
        const bullet = bullets[0];
        result.push({
          id: `shootSilver:${gun.instanceId}:${bullet.instanceId}:${target.id}`,
          command: {
            type: 'shoot',
            gunId: gun.instanceId,
            targetType: target.targetType,
            targetId: target.id,
            bulletId: bullet.instanceId,
          },
          label: `银弹射击${target.name}`,
          detail: '消耗1发银弹 · 自动命中 · 7点身体伤害 · 占主动攻击',
          handler: 'firearm.shoot',
          gunId: gun.instanceId,
          bulletId: bullet.instanceId,
          targetType: target.targetType,
          targetId: target.id,
          silver: true,
          path,
          outcomes: [
            { range: '合法射线', effect: '消耗1发银弹，造成7点身体伤害。' },
          ],
        });
      }
    }
    for (const target of targets) {
      // 设计只定义了银弹对初始狼人的效果，其余目标暂不开放银弹射击。
      if (loaded && !isAlpha(game, target)) continue;
      const path = shotRay(game, hero.pos, target.pos, loaded ? Infinity : 2);
      if (!path) continue;
      result.push({
        id: `shoot:${gun.instanceId}:${target.targetType}:${target.id}`,
        command: {
          type: 'shoot',
          gunId: gun.instanceId,
          targetType: target.targetType,
          targetId: target.id,
        },
        label: `${loaded ? '银弹射击' : '射击'}${target.name}`,
        detail: loaded
          ? '消耗1发银弹 · 自动命中 · 7点身体伤害 · 占主动攻击'
          : '目标速度4+闪避 · 失败2点身体伤害 · 占主动攻击',
        handler: 'firearm.shoot',
        gunId: gun.instanceId,
        targetType: target.targetType,
        targetId: target.id,
        silver: loaded,
        path,
        outcomes: loaded
          ? [
              {
                range: '合法射线',
                effect:
                  '消耗1发，无法闪避；初始狼人自行分配7点身体伤害，任一身体属性到骷髅即死亡。',
              },
              {
                range: '命中后存活',
                effect:
                  '力量和速度的最高可用位置永久降至第4格，恢复与月相均不能突破。',
              },
            ]
          : [
              { range: '4+ 点', effect: PISTOL.check.success },
              { range: '低于4点', effect: PISTOL.check.failure },
            ],
      });
    }
  }
  return result;
}

export function loadSilver(hero, gunId, bulletId, round) {
  const inventory = materializeItemInstances(hero),
    gun = inventory.find(
      (item) => item.instanceId === gunId && item.definitionId === 'pistol',
    ),
    bullet = inventory.find(
      (item) =>
        item.instanceId === bulletId && item.definitionId === 'silver-bullet',
    );
  if (
    !gun ||
    !bullet ||
    gun.state.loadedBullet ||
    gun.state.reloadRound === round
  )
    return false;
  const carried = structuredClone(bullet);
  removeItemInstance(hero, bulletId);
  const current = hero.itemInstances.find((item) => item.instanceId === gunId);
  current.state.loadedBullet = carried;
  current.state.reloadRound = round;
  return true;
}

export function unloadSilver(hero, gunId) {
  const gun = materializeItemInstances(hero).find(
      (item) => item.instanceId === gunId,
    ),
    bullet = gun?.state.loadedBullet;
  if (!bullet) return false;
  delete gun.state.loadedBullet;
  const restored = addItemInstance(
    hero,
    bullet.definitionId,
    bullet.instanceId,
  );
  restored.state = structuredClone(bullet.state);
  return true;
}
