import { FLOORS, ITEMS, SCENARIOS, TRAIT_KEYS } from './game-data.mjs';
import { wolfMight } from './werewolf.mjs';
import { roomRuleView, traitRuleView } from './rule-views.mjs';

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
    if (!old || h.traitor || old.traitor || h.privateStats || old.privateStats)
      return [];
    return TRAIT_KEYS.filter((k) => h.stats[k] !== old.stats[k]).map(
      (trait) => ({
        heroId: h.id,
        name: h.name,
        trait,
        label: traitRuleView(after, h, trait).label,
        from: traitRuleView(before, old, trait).value,
        to: traitRuleView(after, h, trait).value,
        steps: h.stats[trait] - old.stats[trait],
        dead: h.stats[trait] === 0,
      }),
    );
  });
}

export function attributeChangesFromEvents(game, afterEventId = 0) {
  if (!game) return [];
  return (game.events || [])
    .filter((event) => event.id > afterEventId && event.type === 'TraitChanged')
    .map((event) => ({
      eventId: event.id,
      heroId: event.heroId,
      name: game.heroes[event.heroId]?.name || '未知人物',
      trait: event.trait,
      label: event.label,
      from: event.before,
      to: event.after,
      steps: event.steps,
      dead: !!event.dead,
    }));
}

export function ruleNoticesFromEvents(game, afterEventId = 0) {
  if (!game) return [];
  const heroName = (id) => game.heroes[id]?.name || '未知人物',
    itemName = (id) => ITEMS.find((item) => item.id === id)?.title || id;
  return (game.events || [])
    .filter((event) => event.id > afterEventId)
    .flatMap((event) => {
      if (event.type === 'StatusAdded')
        return [
          {
            eventId: event.id,
            heroId: event.heroId,
            tone: 'gain',
            text: `${heroName(event.heroId)} · 获得${event.statusLabel || event.statusId}`,
          },
        ];
      if (event.type === 'StatusRemoved')
        return [
          {
            eventId: event.id,
            heroId: event.heroId,
            tone: 'neutral',
            text: `${heroName(event.heroId)} · ${event.statusLabel || event.statusId}结束`,
          },
        ];
      if (event.type === 'StatusChanged')
        return [
          {
            eventId: event.id,
            heroId: event.heroId,
            tone: 'neutral',
            text:
              event.field === 'turns'
                ? `${heroName(event.heroId)} · ${event.statusLabel || event.statusId}剩余${event.after}轮`
                : `${heroName(event.heroId)} · ${event.statusLabel || event.statusId}发生变化`,
          },
        ];
      if (event.type === 'ItemUsed')
        return [
          {
            eventId: event.id,
            heroId: event.heroId,
            tone: 'item',
            text: `${heroName(event.heroId)} · 使用「${itemName(event.itemId)}」`,
          },
        ];
      if (event.type === 'ItemTransferred')
        return [
          {
            eventId: event.id,
            heroId: event.fromHeroId,
            tone: 'item',
            text: `${heroName(event.fromHeroId)} · 将「${itemName(event.cardId)}」交给${heroName(event.toHeroId)}`,
          },
        ];
      if (event.type === 'ItemDropped')
        return [
          {
            eventId: event.id,
            heroId: event.heroId,
            tone: 'item',
            text: `${heroName(event.heroId)} · 放下「${itemName(event.cardId)}」`,
          },
        ];
      if (event.type === 'ItemPickedUp')
        return [
          {
            eventId: event.id,
            heroId: event.heroId,
            tone: 'item',
            text: `${heroName(event.heroId)} · 拾取「${itemName(event.cardId)}」`,
          },
        ];
      if (event.type === 'DamageApplied')
        return [
          {
            eventId: event.id,
            heroId: event.heroId,
            tone: event.actualAmount ? 'loss' : 'gain',
            text: event.actualAmount
              ? `${heroName(event.heroId)} · 承受${event.actualAmount}点${event.damageType === 'physical' ? '肉体' : '精神'}伤害`
              : `${heroName(event.heroId)} · 伤害已抵消`,
          },
        ];
      return [];
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

export function locationLabel(game, pos, heroId = game.active) {
  const room = game.rooms.find((r) => r.id === pos);
  if (!room) return '位置未公开';
  const view = roomRuleView(game, room, heroId);
  return `${FLOORS.find((f) => f.id === room.floor)?.name || '未知楼层'} · ${view.name}`;
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

export function heroController(room, heroId) {
  if (!room) return null;
  const playerId = room.seats?.[heroId] || room.hostId;
  return (
    room.players?.find((player) => player.id === playerId) ||
    (playerId
      ? {
          id: playerId,
          name: playerId === room.hostId ? '房主' : '玩家',
        }
      : null)
  );
}

export function isHeroMine(room, heroId) {
  return !!room && heroController(room, heroId)?.id === room.you;
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
