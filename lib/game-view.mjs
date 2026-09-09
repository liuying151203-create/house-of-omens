import { FLOORS, SCENARIOS, TRAIT_KEYS } from './game-data.mjs';
import { wolfMight } from './werewolf.mjs';

export function hauntCardRule(card, game) {
  if (!game || game.phase === 'explore') return null;
  const rule =
    card.hauntText !== undefined
      ? card.hauntText
      : card.hauntEffects?.[game.scenario];
  return typeof rule === 'string' ? rule : null;
}

export function gameModeLabel(game) {
  const title =
    (game.scenario === 'werewolf' ? '狼人 · ' : '') +
    (SCENARIOS.find((s) => s.id === game.scenario)?.title || '未知故事');
  if (game.playtest?.mode === 'haunt') return `${title} · 作祟快速测试`;
  return game.automaticHaunt
    ? game.phase === 'explore'
      ? '未知的夜晚 · 组合触发'
      : `${title} · 组合揭晓`
    : `${title} · 定向试玩`;
}

export function attributeChanges(before, after) {
  if (!before || !after) return [];
  return after.heroes.flatMap((h) => {
    const old = before.heroes.find((x) => x.id === h.id);
    if (!old || h.traitor || old.traitor) return [];
    return TRAIT_KEYS.filter((k) => h.stats[k] !== old.stats[k]).map(
      (trait) => ({
        heroId: h.id,
        name: h.name,
        trait,
        from: old.tracks[trait][old.stats[trait]],
        to: h.tracks[trait][h.stats[trait]],
        steps: h.stats[trait] - old.stats[trait],
        dead: h.stats[trait] === 0,
      }),
    );
  });
}

export function canInspectHero(game, hero, room) {
  if (!hero) return false;
  if (hero.traitor) return false;
  if (!room || game.phase === 'explore') return true;
  return game.heroes.some(
    (h) => !h.traitor && (room.seats[h.id] || room.hostId) === room.you,
  );
}

export function publicEnemies(game) {
  if (game.phase === 'explore') return [];
  return game.enemies.filter((e) => !e.hidden && e.revealed !== false);
}

export function enemyHero(game, enemy) {
  return enemy.heroId !== undefined
    ? game.heroes.find((h) => h.id === enemy.heroId)
    : enemy.kind === 'keeper'
      ? game.heroes.find((h) => h.traitor)
      : null;
}

export function locationLabel(game, pos) {
  const room = game.rooms.find((r) => r.id === pos);
  if (!room) return '位置未公开';
  return `${FLOORS.find((f) => f.id === room.floor)?.name || '未知楼层'} · ${room.name}`;
}

export function personalHero(game, room) {
  if (!room) return game.heroes[game.active];
  const owned = game.heroes.filter(
    (h) => (room.seats[h.id] || room.hostId) === room.you,
  );
  return (
    owned.find((h) => h.id === game.active) ||
    owned.find((h) => !h.dead) ||
    owned[0] ||
    null
  );
}

export function enemyMark(enemy) {
  return ['alpha', 'wolf'].includes(enemy.kind)
    ? '🐺'
    : enemy.kind === 'keeper'
      ? '守'
      : enemy.kind === 'wraith'
        ? '镜'
        : '👻';
}

export function rosterGroups(game) {
  const groups = [
    {
      id: 'heroes',
      name: game.phase === 'explore' ? '探险队' : '好人',
      heroes: game.heroes.filter((h) => !h.dead && !h.traitor),
      enemies: [],
    },
    { id: 'wolves', name: '狼群', heroes: [], enemies: [] },
    { id: 'traitors', name: '叛变者', heroes: [], enemies: [] },
    { id: 'monsters', name: '怪物', heroes: [], enemies: [] },
    {
      id: 'dead',
      name: '已死亡',
      heroes: game.heroes.filter((h) => h.dead),
      enemies: [],
    },
  ];
  for (const enemy of publicEnemies(game)) {
    const id = ['alpha', 'wolf'].includes(enemy.kind)
      ? 'wolves'
      : enemyHero(game, enemy)
        ? 'traitors'
        : 'monsters';
    groups
      .find((g) => g.id === id)
      .enemies.push({
        ...enemy,
        might: wolfMight(game, enemy),
        explorerName: enemyHero(game, enemy)?.name,
      });
  }
  const represented = new Set(
    publicEnemies(game).map((e) => enemyHero(game, e)?.id),
  );
  for (const h of game.heroes.filter(
    (h) => !h.dead && h.traitor && !represented.has(h.id),
  )) {
    groups
      .find((g) => g.id === (h.faction === 'wolves' ? 'wolves' : 'traitors'))
      .heroes.push(h);
  }
  if (
    game.phase !== 'explore' &&
    game.scenario === 'mirror' &&
    !game.mirrorFound
  ) {
    groups.find((g) => g.id === 'monsters').unknown = true;
  }
  return groups.filter((g) => g.heroes.length || g.enemies.length || g.unknown);
}
